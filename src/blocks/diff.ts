import type { Element, ElementContent } from 'hast';
import type { Code } from 'mdast';
import { visit } from 'unist-util-visit';

import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import type { PackageStrings } from '../localization.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { parseUnifiedDiff } from '../render/unified-diff.js';
import { titleAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { hasClassName, hastRawText, stringProperty, takeStringProperty } from './hast.js';
import { type DirectiveNode, isCodeNode } from './mdast.js';

function diffDefinition(): DirectiveDefinition & { readonly name: 'diff' } {
  const attributes = [
    titleAttribute,
    {
      name: 'file',
      description: 'Path of the changed file, shown above the change.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
      renderProperty: 'dataFile',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'diff',
    description:
      'One change in unified diff form: exactly one fenced code block with @@ hunks, drawn with old and new line numbers.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'figure',
      className: 'semantic-diff',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

interface DiffSubject {
  readonly node: DirectiveNode;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/** Дифф — ровно один огороженный блок единого диффа, чьи ханки сходятся со своими заголовками. */
const diffRules = declareAuthoredRules<DiffSubject>({
  subject: 'diff',
  rules: [
    {
      id: 'one-code-block',
      check: ({ node, fail }) => {
        const children = node.children ?? [];
        if (children.length === 1 && isCodeNode(children[0])) return undefined;
        return fail(
          'diff holds exactly one fenced code block with the unified diff and nothing else.',
          'Put the change in one ```diff fenced block inside the diff directive and move any prose outside it.',
        );
      },
    },
    {
      id: 'code-language',
      dependsOn: ['one-code-block'],
      check: ({ node, fail }) => {
        const code = (node.children ?? [])[0] as Code;
        if (code.lang === null || code.lang === undefined || code.lang === 'diff') return undefined;
        return fail(
          `The diff code block is marked as ${code.lang}; a diff block is always diff.`,
          'Mark the fenced block as ```diff or leave its language empty.',
        );
      },
    },
    {
      id: 'unified-hunks',
      dependsOn: ['one-code-block'],
      check: ({ node, fail }) => {
        const parsed = parseUnifiedDiff(((node.children ?? [])[0] as Code).value);
        return parsed.kind === 'invalid' ? fail(parsed.message, parsed.remediation) : undefined;
      },
    },
  ],
});

function validateDiff(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  const outcome = runAuthoredRules(
    diffRules,
    {
      node,
      fail: (message, remediation) => context.violation(node, 'INVALID_DIFF', message, remediation),
    },
    found,
  );
  context.report(found);
  // Подсветка читает язык блока: принятый дифф всегда подсвечивается как дифф.
  if (outcome === 'accepted') ((node.children ?? [])[0] as Code).lang = 'diff';
  return outcome;
}

/**
 * Строки подсвеченного диффа получают вид и номера старой и новой строки. Номера рисует CSS из
 * атрибутов, поэтому копирование блока даёт сам дифф без номеров.
 */
function enhanceDiff(node: Element, context: { readonly strings: PackageStrings }): void {
  const file = stringProperty(node, 'dataFile');
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  // Блок кода может лежать в обёртке цели ревью, поэтому ищется среди потомков, а не детей.
  let pre: Element | undefined;
  visit(node, 'element', (candidate: Element) => {
    if (pre !== undefined) return false;
    if (candidate.tagName === 'pre') pre = candidate;
    return undefined;
  });
  if (pre === undefined) throw new Error('Validated diff is missing its code block.');
  const parsed = parseUnifiedDiff(hastRawText(pre));
  if (parsed.kind === 'invalid') throw new Error('Validated diff no longer parses.');
  const code = pre.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  const rows = (code?.children ?? []).filter(
    (child): child is Element => child.type === 'element' && hasClassName(child, 'line'),
  );
  if (rows.length !== parsed.lines.length) {
    throw new Error('Highlighted diff lines do not match the parsed diff.');
  }
  // Поле номеров — одна строка фиксированной ширины: старая и новая колонки стоят ровно и там, где
  // у строки нет одного из номеров.
  const width = Math.max(
    1,
    ...parsed.lines.flatMap((line) => [line.old ?? 0, line.new ?? 0]).map((n) => String(n).length),
  );
  const column = (value: number | undefined): string =>
    (value === undefined ? '' : String(value)).padStart(width, ' ');
  for (const [index, row] of rows.entries()) {
    const line = parsed.lines[index];
    if (line === undefined) continue;
    row.properties.dataDiff = line.kind;
    if (line.old !== undefined) row.properties.dataOld = String(line.old);
    if (line.new !== undefined) row.properties.dataNew = String(line.new);
    row.properties.dataGutter = `${column(line.old)} ${column(line.new)}`;
  }
  pre.properties.dataDiffBlock = '';
  const added = parsed.lines.filter((line) => line.kind === 'add').length;
  const removed = parsed.lines.filter((line) => line.kind === 'remove').length;
  const caption: ElementContent[] = [];
  if (title !== undefined) {
    caption.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['semantic-title'] },
      children: [{ type: 'text', value: title }],
    });
  }
  if (file !== undefined) {
    caption.push({
      type: 'element',
      tagName: 'code',
      properties: { className: ['semantic-diff-file'] },
      children: [{ type: 'text', value: file }],
    });
  }
  caption.push({
    type: 'element',
    tagName: 'span',
    properties: { className: ['semantic-diff-summary'] },
    children: [{ type: 'text', value: context.strings.diffSummary(added, removed) }],
  });
  node.children.unshift({
    type: 'element',
    tagName: 'figcaption',
    properties: { className: ['semantic-diff-caption'] },
    children: caption,
  });
}

export const diff = defineBlock({
  definition: diffDefinition(),
  validate: validateDiff,
  enhance: enhanceDiff,
  styles: 'package',
  staticEquivalent:
    'The change as a code block with old and new line numbers and a count of added and removed lines.',
  examples: [
    ':::diff{title="Guard the cache" file="src/cache.ts"}\n```diff\n@@ -1,2 +1,2 @@\n const ttl = 60;\n-export const cache = new Map();\n+export const cache = new Map<string, string>();\n```\n:::\n',
  ],
});
