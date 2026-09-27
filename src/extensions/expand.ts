/**
 * Развёртка директив расширений в фазе remark — раньше встроенных проверок директив. Составной блок
 * подставляет экранированные значения атрибутов в свой шаблон, поставщик отдаёт Markdown своей
 * программы; результат разбирается тем же парсером, что страница, и встаёт на место директивы автора.
 * Дальше он проходит все встроенные проверки, очистку и отрисовку, как написанный автором.
 *
 * Узлы развёртки стоят в позиции директивы автора, а `origin.ts` помнит, из какой строки шаблона или
 * вывода поставщика они родились: диагностика внутри развёртки указывает на директиву автора и называет
 * строку. Тело контейнера (`{{content}}`) — узлы самого автора, они сохраняют свои позиции.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Root as MdastRoot, RootContent } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified, type Plugin } from 'unified';

import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import { BLOCK_STYLE_PROPERTY } from '../authoring/style-rules.js';
import { type DirectiveNode, isDirectiveNode, type SourcePosition } from '../blocks/mdast.js';
import type { SourceMapSegment } from '../contracts.js';
import type { PageData } from '../source/load-data.js';
import { AgenticReportError } from '../diagnostics.js';
import { restoreLiteralColonText } from '../render/directives.js';
import { resolveSourceLocation } from '../source/source-map.js';
import { recordExpansionOrigin } from './origin.js';
import { type ProviderCache, runProvider } from './provider.js';
import { compileTemplate, expandTemplate } from './template.js';
import type { Expansion } from './vocabulary.js';

/** Предел вложенности развёрток: шаблон, вызывающий сам себя, — ошибка, а не зависание. */
export const MAX_EXPANSION_DEPTH = 8;
/**
 * Предел узлов всех развёрток одной страницы: шаблон, который вызывает себя несколько раз, растёт
 * степенью в пределах глубины (десять вызовов на восьми уровнях — сто миллионов узлов), и сборка
 * должна отказать, а не зависнуть.
 */
export const MAX_EXPANDED_NODES = 10_000;

export interface ExtensionExpansionOptions {
  readonly expansions: ReadonlyMap<string, Expansion>;
  readonly markdown: string;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly sourceRoot: string;
  readonly language: string | undefined;
  readonly providerCache: ProviderCache;
  /** Отказы развёртки; фаза директив сообщает их вместе со своими. */
  readonly violations: AgenticReportError[];
  /** Сколько раз страница использовала каждое расширение. */
  readonly uses: Map<string, number>;
  /** Файлы данных страницы (`data` манифеста); поставщик получает их разобранными по имени. */
  readonly data?: PageData;
}

interface ParentNode {
  children: RootContent[];
}

/** Параметры одного прогона с общим на страницу счётчиком узлов развёрток. */
interface ExpansionRun extends ExtensionExpansionOptions {
  readonly budget: { nodes: number; exhausted: boolean };
}

export const remarkExtensionExpansions: Plugin<[ExtensionExpansionOptions], MdastRoot> =
  (options) => async (tree) => {
    if (options.expansions.size === 0) return;
    await expandChildren(tree, 0, { ...options, budget: { nodes: 0, exhausted: false } });
  };

async function expandChildren(
  parent: ParentNode,
  depth: number,
  options: ExpansionRun,
): Promise<void> {
  const replaced: RootContent[] = [];
  for (const child of parent.children) {
    const expansion = isDirectiveNode(child) ? options.expansions.get(child.name) : undefined;
    if (expansion === undefined || !isDirectiveNode(child)) {
      if (hasChildren(child)) await expandChildren(child, depth, options);
      replaced.push(child);
      continue;
    }
    replaced.push(...(await expandDirective(child, expansion, depth, options)));
  }
  parent.children = replaced;
}

async function expandDirective(
  node: DirectiveNode,
  expansion: Expansion,
  depth: number,
  options: ExpansionRun,
): Promise<RootContent[]> {
  const { extension, block } = expansion;
  const refuse = (code: string, message: string, remediation: string, details?: object): [] => {
    options.violations.push(located(node, options, { code, message, remediation, details }));
    return [];
  };
  if (options.budget.exhausted) return [];
  /** Узлы развёртки идут в счёт страницы; первый выход за предел — отказ, дальше развёртки нет. */
  const withinBudget = (nodes: readonly RootContent[]): boolean => {
    options.budget.nodes += countNodes(nodes);
    if (options.budget.nodes <= MAX_EXPANDED_NODES) return true;
    options.budget.exhausted = true;
    refuse(
      'EXTENSION_EXPANSION_TOO_LARGE',
      `Extension expansions on this page produce more than ${MAX_EXPANDED_NODES} Markdown nodes; ${extension.name} crossed the limit.`,
      'Use the directive fewer times, make its template or provider output smaller, or remove a template that uses its own directive several times.',
    );
    return false;
  };
  if (depth >= MAX_EXPANSION_DEPTH)
    return refuse(
      'EXTENSION_EXPANSION_DEPTH',
      `Extension ${extension.name} expands more than ${MAX_EXPANSION_DEPTH} levels deep.`,
      'Remove the cycle: a template or provider output must not use the directive that produced it.',
    );
  const form =
    node.type === 'containerDirective'
      ? 'container'
      : node.type === 'leafDirective'
        ? 'leaf'
        : 'text';
  if (!(extension.forms as readonly string[]).includes(form))
    return refuse(
      'INVALID_DIRECTIVE_FORM',
      `${node.name} cannot use the ${node.type} form.`,
      `Use one of these directive forms: ${extension.forms.map((value) => `${value}Directive`).join(', ')}.`,
    );
  const interpretation = interpretDirectiveAttributes(block.definition, node.attributes ?? {});
  if (!interpretation.ok) {
    if (interpretation.reason === 'unknown')
      return refuse(
        'UNKNOWN_DIRECTIVE_ATTRIBUTE',
        `${node.name} does not support: ${interpretation.attributes.join(', ')}.`,
        `Use only these attributes: ${Object.keys(extension.attributes).join(', ') || 'none'}.`,
      );
    return interpretation.reason === 'required'
      ? refuse(
          'DIRECTIVE_ATTRIBUTE_REQUIRED',
          `${node.name} requires the ${interpretation.attribute.name} attribute.`,
          `Add the required ${interpretation.attribute.name} attribute.`,
        )
      : refuse(
          'INVALID_DIRECTIVE_ATTRIBUTE',
          `${node.name}.${interpretation.attribute.name} does not satisfy its declared constraint.`,
          `Provide a valid ${interpretation.attribute.name} value: see the attributes of extension ${extension.name}.`,
        );
  }
  options.uses.set(extension.name, (options.uses.get(extension.name) ?? 0) + 1);
  // Тело автора разворачивается на его уровне: вложенность считают только развёртки.
  await expandChildren(node as unknown as ParentNode, depth, options);
  const content = (node.children ?? []) as RootContent[];
  const values = interpretation.values;

  if (extension.kind === 'block') {
    const marker = `agentic-report-content-${randomUUID()}`;
    const compiled = compileTemplate(
      extension.templateText,
      new Set(Object.keys(extension.attributes)),
      extension.forms.includes('container'),
    ).template;
    const markdown = expandTemplate(
      compiled,
      Object.fromEntries(Object.entries(values).map(([name, value]) => [name, String(value)])),
      marker,
    );
    const nodes = parseExpansion(markdown, node, {
      extension: extension.name,
      template: relativeTo(options.sourceRoot, extension.template),
      producer: 'template',
    });
    if (!withinBudget(nodes)) return [];
    const spliced = spliceContent(nodes, marker, content, node.type === 'containerDirective');
    // Блок со своими стилями помечает верхние узлы шаблона: стили вложены в селектор этой метки.
    if (extension.styles !== undefined) for (const top of spliced) markBlock(top, extension.name);
    const holder = { children: spliced };
    await expandChildren(holder, depth + 1, options);
    return holder.children;
  }

  const location = sourceOf(node, options);
  let output: string;
  try {
    output = await runProvider(
      extension,
      {
        name: extension.name,
        attributes: values,
        content: authoredContent(node, options.markdown),
        language: options.language,
        data: providerData(options.data),
        source: {
          file: location?.file === undefined ? '' : relativeTo(options.sourceRoot, location.file),
          line: location?.line ?? 0,
        },
      },
      options.providerCache,
    );
  } catch (error) {
    if (!(error instanceof AgenticReportError)) throw error;
    options.violations.push(
      located(node, options, {
        code: error.diagnostic.code,
        message: error.diagnostic.message,
        remediation: error.diagnostic.remediation,
        details: {
          ...error.diagnostic.details,
          manifest: relativeTo(options.sourceRoot, extension.manifestPath),
        },
      }),
    );
    return [];
  }
  const holder = {
    children: parseExpansion(output, node, { extension: extension.name, producer: 'provider' }),
  };
  if (!withinBudget(holder.children)) return [];
  await expandChildren(holder, depth + 1, options);
  return holder.children;
}

/**
 * Метка элемента блока (`data-extension-block`): у обычного узла — свойство hast, у директивы — то же
 * свойство, которое фаза директив переносит в свою отрисовку (`renderDirective`).
 */
function markBlock(node: RootContent, name: string): void {
  const data = (node.data ?? {}) as { hProperties?: Record<string, unknown> };
  data.hProperties = { ...data.hProperties, [BLOCK_STYLE_PROPERTY]: name };
  (node as { data?: unknown }).data = data;
}

/**
 * Разбирает Markdown развёртки тем же набором расширений разбора, что страницу, и переносит все его
 * узлы в позицию директивы автора, запоминая строку, на которой каждый родился.
 */
function parseExpansion(
  markdown: string,
  directive: DirectiveNode,
  origin: {
    readonly extension: string;
    readonly template?: string;
    readonly producer: 'template' | 'provider';
  },
): RootContent[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(markdown);
  restoreLiteralColonText(tree, markdown);
  const position = directive.position;
  const move = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const located = node as { position?: SourcePosition; children?: unknown[] };
    const line = located.position?.start.line ?? 1;
    recordExpansionOrigin(node, { ...origin, line });
    if (position === undefined) delete located.position;
    else
      located.position = {
        start: { ...position.start },
        end: { ...position.end },
      };
    for (const child of located.children ?? []) move(child);
  };
  for (const child of tree.children) move(child);
  return tree.children;
}

/**
 * Ставит тело директивы автора на место метки `{{content}}`. Метка — отдельный абзац из одной строки;
 * тело листовой директивы (её метка) становится абзацем.
 */
function spliceContent(
  nodes: RootContent[],
  marker: string,
  content: RootContent[],
  container: boolean,
): RootContent[] {
  const body: RootContent[] = container
    ? content.filter((child) => !isDirectiveLabel(child))
    : content.length === 0
      ? []
      : [{ type: 'paragraph', children: content as never }];
  const walk = (list: RootContent[]): RootContent[] =>
    list.flatMap((node) => {
      if (
        node.type === 'paragraph' &&
        node.children.length === 1 &&
        node.children[0]?.type === 'text' &&
        node.children[0].value.trim() === marker
      )
        return body;
      if (hasChildren(node)) (node as ParentNode).children = walk((node as ParentNode).children);
      return [node];
    });
  return walk(nodes);
}

function isDirectiveLabel(node: RootContent): boolean {
  return (
    node.type === 'paragraph' &&
    (node.data as { directiveLabel?: boolean } | undefined)?.directiveLabel === true
  );
}

/** Тело директивы, как его написал автор: от начала первого узла тела до конца последнего. */
function authoredContent(node: DirectiveNode, markdown: string): string {
  const children = ((node.children ?? []) as RootContent[]).filter(
    (child) => !isDirectiveLabel(child),
  );
  const first = children[0]?.position?.start.offset;
  const last = children.at(-1)?.position?.end.offset;
  if (first === undefined || last === undefined) return '';
  return markdown.slice(first, last);
}

/**
 * Данные страницы для поставщика: разобранный JSON каждого объявленного файла `data` под его именем без
 * `.json` — тем же адресом, что `{{имя.путь}}` в тексте. Файлы уже прочитаны загрузчиком в пределах
 * корня источника, поэтому поставщик получает ровно то, что страница объявила, и ни одного пути.
 */
const dataByPage = new WeakMap<PageData, Readonly<Record<string, unknown>>>();
function providerData(data: PageData | undefined): Readonly<Record<string, unknown>> {
  if (data === undefined) return {};
  const cached = dataByPage.get(data);
  if (cached !== undefined) return cached;
  const byName: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const file of data.files) byName[file.name] = file.value;
  dataByPage.set(data, byName);
  return byName;
}

function countNodes(nodes: readonly unknown[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (hasChildren(node)) count += countNodes(node.children);
  }
  return count;
}

function hasChildren(node: unknown): node is ParentNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'children' in node &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

function sourceOf(node: DirectiveNode, options: ExtensionExpansionOptions) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  return resolveSourceLocation(options.sourceMap, start, end);
}

function located(
  node: DirectiveNode,
  options: ExtensionExpansionOptions,
  diagnostic: {
    readonly code: string;
    readonly message: string;
    readonly remediation: string;
    readonly details?: object | undefined;
  },
): AgenticReportError {
  const source = sourceOf(node, options);
  return new AgenticReportError({
    level: 'error',
    code: diagnostic.code,
    message: diagnostic.message,
    remediation: diagnostic.remediation,
    ...(source === undefined ? {} : { source }),
    ...(diagnostic.details === undefined
      ? {}
      : { details: diagnostic.details as Readonly<Record<string, unknown>> }),
  });
}

function relativeTo(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}
