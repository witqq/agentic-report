/**
 * The data phase: values and repeated blocks from the page's JSON data files (`data` in the manifest),
 * applied to the parsed Markdown before any directive is read. It runs only on a page that declares
 * data; a page without the field is built exactly as before.
 *
 * - `{{name.path}}` in text, code, link targets and directive attribute values becomes the value at the
 *   path. The value is placed into the already parsed tree as the text of the node or the string of the
 *   attribute, and is never parsed as Markdown: a value cannot open a directive, close an attribute or
 *   insert HTML whatever it contains. The later phases read it like any authored text — an attribute
 *   value, for example, is still checked by its directive's grammar.
 * - `:::each{in as}` repeats its body per item of a list; a body that is one list or one table repeats
 *   its items or rows inside that list or table, so numbering and table structure stay whole.
 * - `::expect{data count min max equals}` is a control value: the build fails at its line when the
 *   data diverge.
 *
 * There is no expression language: a derived value (a streak, «k of N», a sum) is written into the JSON
 * beforehand or produced by a provider (docs/decisions.md, «Данные страницы без языка выражений»).
 * Every refusal is collected with the authored range of the node it concerns and reported together with
 * the directive phase; a repeated node keeps the position of its template line.
 */

import type { Root as MdastRoot, RootContent } from 'mdast';
import type { Plugin } from 'unified';

import { authoringRegistry } from '../authoring/registry.js';
import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import { type DirectiveNode, isDirectiveNode, type LocatedNode } from '../blocks/mdast.js';
import type { SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import type { PageData } from '../source/load-data.js';
import { resolveSourceLocation } from '../source/source-map.js';

export const EACH_DIRECTIVE = 'each';
export const EXPECT_DIRECTIVE = 'expect';

/** `{{path}}`: a name, then keys or list positions separated by dots; spaces inside the braces allowed. */
const PLACEHOLDER =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|[0-9]+))*)\s*\}\}/gu;

export interface PageDataOptions {
  readonly data: PageData | undefined;
  readonly sourceMap: readonly SourceMapSegment[];
  /** Refusals of the phase; the directive phase reports them together with its own. */
  readonly violations: AgenticReportError[];
  /** The directives the page uses; `each` and `expect` never reach the directive phase that counts. */
  readonly observedDirectives?: Set<string>;
}

type Scope = ReadonlyMap<string, unknown>;

interface ParentNode {
  children: RootContent[];
}

export const remarkPageData: Plugin<[PageDataOptions], MdastRoot> = (options) => (tree) => {
  if (options.data === undefined) return;
  const scope: Scope = new Map(options.data.files.map((file) => [file.name, file.value]));
  processChildren(tree as unknown as ParentNode, scope, options);
};

function processChildren(parent: ParentNode, scope: Scope, options: PageDataOptions): void {
  const replaced: RootContent[] = [];
  for (const child of parent.children) {
    if (isDirectiveNode(child) && child.name === EACH_DIRECTIVE) {
      options.observedDirectives?.add(EACH_DIRECTIVE);
      replaced.push(...expandEach(child, scope, options));
      continue;
    }
    if (isDirectiveNode(child) && child.name === EXPECT_DIRECTIVE) {
      options.observedDirectives?.add(EXPECT_DIRECTIVE);
      // A refused reading stays for the directive phase, which names what is wrong with it.
      if (!checkExpectation(child, scope, options)) replaced.push(child);
      continue;
    }
    substitute(child, scope, options);
    if (hasChildren(child)) processChildren(child, scope, options);
    replaced.push(child);
  }
  parent.children = replaced;
}

function expandEach(node: DirectiveNode, scope: Scope, options: PageDataOptions): RootContent[] {
  const definition = directiveDefinition(EACH_DIRECTIVE);
  const reading = interpretDirectiveAttributes(definition, node.attributes ?? {});
  // The directive phase reports a refused grammar; the node stays for it.
  if (!reading.ok || node.type !== 'containerDirective') return [node as unknown as RootContent];
  const listPath = String(reading.values.in);
  const itemName = String(reading.values.as);
  if (scope.has(itemName)) {
    options.violations.push(
      located(
        node,
        options,
        'DATA_NAME_SHADOWED',
        `each names its item ${itemName}, which is already the name of a data file or an outer item.`,
        'Pick another name in as, so every {{name}} inside means one thing.',
        { name: itemName },
      ),
    );
    return [];
  }
  const resolved = resolvePath(scope, listPath);
  if (!resolved.ok) {
    options.violations.push(pathViolation(node, resolved, listPath, options));
    return [];
  }
  if (!Array.isArray(resolved.value)) {
    options.violations.push(
      located(
        node,
        options,
        'DATA_NOT_A_LIST',
        `each needs a list at ${listPath}, and the data there is ${describe(resolved.value)}.`,
        'Point in at a JSON array, or write the value directly with {{…}}.',
        { path: listPath },
      ),
    );
    return [];
  }
  const items: readonly unknown[] = resolved.value;
  const body = ((node.children ?? []) as RootContent[]).filter((child) => !isDirectiveLabel(child));
  const inner = (item: unknown): Scope => new Map([...scope, [itemName, item]]);
  const repeat = (template: readonly RootContent[], item: unknown): RootContent[] => {
    const holder: ParentNode = { children: structuredClone([...template]) };
    processChildren(holder, inner(item), options);
    return holder.children;
  };
  const [only] = body;
  if (body.length === 1 && only?.type === 'list') {
    const list = structuredClone(only);
    list.children = items.flatMap((item) => repeat(only.children, item) as typeof only.children);
    return list.children.length === 0 ? [] : [list];
  }
  if (body.length === 1 && only?.type === 'table') {
    const table = structuredClone(only);
    const [header, ...rows] = only.children;
    if (header === undefined) return [];
    const headerHolder: ParentNode = { children: [structuredClone(header) as never] };
    processChildren(headerHolder, scope, options);
    table.children = [
      ...(headerHolder.children as typeof only.children),
      ...items.flatMap((item) => repeat(rows, item) as typeof only.children),
    ];
    return [table];
  }
  return items.flatMap((item) => repeat(body, item));
}

/** Answers whether the expectation was read; a refusal is recorded, a divergence too. */
function checkExpectation(node: DirectiveNode, scope: Scope, options: PageDataOptions): boolean {
  const reading = interpretDirectiveAttributes(
    directiveDefinition(EXPECT_DIRECTIVE),
    node.attributes ?? {},
  );
  if (!reading.ok || node.type !== 'leafDirective') return false;
  const { values } = reading;
  const dataPath = String(values.data);
  const count = typeof values.count === 'number' ? values.count : undefined;
  const min = typeof values.min === 'number' ? values.min : undefined;
  const max = typeof values.max === 'number' ? values.max : undefined;
  const equals = typeof values.equals === 'string' ? values.equals : undefined;
  const fail = (message: string, remediation: string): true => {
    options.violations.push(
      located(node, options, 'DATA_EXPECTATION_FAILED', message, remediation, { path: dataPath }),
    );
    return true;
  };
  if (count === undefined && min === undefined && max === undefined && equals === undefined)
    return fail(
      `expect at ${dataPath} states nothing to check.`,
      'Add count, min, max or equals: expect is a control value, not a comment.',
    );
  const resolved = resolvePath(scope, dataPath);
  if (!resolved.ok) {
    options.violations.push(pathViolation(node, resolved, dataPath, options));
    return true;
  }
  const value = resolved.value;
  if (Array.isArray(value)) {
    if (equals !== undefined)
      return fail(
        `${dataPath} is a list of ${value.length} items; equals compares a single value.`,
        'Use count, min or max for a list.',
      );
    if (count !== undefined && value.length !== count)
      return fail(
        `${dataPath} has ${value.length} items; the page expects ${count}.`,
        'Fix the data, or change the page and its expectation together.',
      );
    if (min !== undefined && value.length < min)
      return fail(
        `${dataPath} has ${value.length} items; the page expects at least ${min}.`,
        'Fix the data, or change the page and its expectation together.',
      );
    if (max !== undefined && value.length > max)
      return fail(
        `${dataPath} has ${value.length} items; the page expects at most ${max}.`,
        'Fix the data, or change the page and its expectation together.',
      );
    return true;
  }
  if (count !== undefined)
    return fail(
      `count expects a list at ${dataPath}, and the data there is ${describe(value)}.`,
      'Use min, max or equals for a single value.',
    );
  if ((min !== undefined || max !== undefined) && typeof value !== 'number')
    return fail(
      `min and max compare a number or a list at ${dataPath}, and the data there is ${describe(value)}.`,
      'Use equals for text, or point the path at a number or a list.',
    );
  if (typeof value === 'number') {
    if (min !== undefined && value < min)
      return fail(
        `${dataPath} is ${value}; the page expects at least ${min}.`,
        'Fix the data, or change the page and its expectation together.',
      );
    if (max !== undefined && value > max)
      return fail(
        `${dataPath} is ${value}; the page expects at most ${max}.`,
        'Fix the data, or change the page and its expectation together.',
      );
  }
  if (equals !== undefined) {
    const text = scalarText(value);
    if (text !== equals)
      return fail(
        `${dataPath} is ${text === undefined ? describe(value) : JSON.stringify(text)}; the page expects ${JSON.stringify(equals)}.`,
        'Fix the data, or change the page and its expectation together.',
      );
  }
  return true;
}

/** Substitutes placeholders in the node's own strings; its children are visited by the caller. */
function substitute(node: RootContent, scope: Scope, options: PageDataOptions): void {
  const target = node as unknown as {
    type: string;
    value?: unknown;
    url?: unknown;
    alt?: unknown;
    title?: unknown;
    attributes?: Record<string, string | null> | null;
  };
  const verbatimUnknown = target.type === 'code' || target.type === 'inlineCode';
  const replace = (value: string): string =>
    replacePlaceholders(value, scope, node, options, verbatimUnknown);
  if (
    (target.type === 'text' || target.type === 'code' || target.type === 'inlineCode') &&
    typeof target.value === 'string'
  )
    target.value = replace(target.value);
  if (typeof target.url === 'string') target.url = replace(target.url);
  if (typeof target.alt === 'string') target.alt = replace(target.alt);
  if (typeof target.title === 'string') target.title = replace(target.title);
  if (isDirectiveNode(node) && target.attributes !== undefined && target.attributes !== null) {
    const attributes = target.attributes;
    for (const [name, value] of Object.entries(attributes))
      if (typeof value === 'string') attributes[name] = replace(value);
  }
}

function replacePlaceholders(
  value: string,
  scope: Scope,
  node: LocatedNode,
  options: PageDataOptions,
  verbatimUnknown: boolean,
): string {
  if (!value.includes('{{')) return value;
  return value.replace(PLACEHOLDER, (whole, dataPath: string) => {
    const root = dataPath.split('.')[0] ?? '';
    // Code may show template syntax of other tools; only a known name is data there.
    if (verbatimUnknown && !scope.has(root)) return whole;
    const resolved = resolvePath(scope, dataPath);
    if (!resolved.ok) {
      options.violations.push(pathViolation(node, resolved, dataPath, options));
      return whole;
    }
    const text = scalarText(resolved.value);
    if (text === undefined) {
      options.violations.push(
        located(
          node,
          options,
          'DATA_VALUE_NOT_TEXT',
          `{{${dataPath}}} is ${describe(resolved.value)}, which has no text to show.`,
          resolved.value === null
            ? 'Write in the data what the page should say for a missing value, such as "unknown".'
            : 'Point the placeholder at a text, number or true/false value, or repeat a list with each.',
          { path: dataPath },
        ),
      );
      return whole;
    }
    return text;
  });
}

type Resolution =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'unknown-name' }
  | { readonly ok: false; readonly reason: 'missing'; readonly at: string };

function resolvePath(scope: Scope, dataPath: string): Resolution {
  const [root, ...segments] = dataPath.split('.');
  if (root === undefined || !scope.has(root)) return { ok: false, reason: 'unknown-name' };
  let value = scope.get(root);
  let walked = root;
  for (const segment of segments) {
    walked = `${walked}.${segment}`;
    if (Array.isArray(value) && /^[0-9]+$/u.test(segment)) {
      const index = Number(segment);
      if (index >= value.length) return { ok: false, reason: 'missing', at: walked };
      value = value[index];
      continue;
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !Object.hasOwn(value, segment)
    )
      return { ok: false, reason: 'missing', at: walked };
    value = (value as Record<string, unknown>)[segment];
  }
  return { ok: true, value };
}

function pathViolation(
  node: LocatedNode,
  resolution: Exclude<Resolution, { ok: true }>,
  dataPath: string,
  options: PageDataOptions,
): AgenticReportError {
  const root = dataPath.split('.')[0] ?? dataPath;
  return resolution.reason === 'unknown-name'
    ? located(
        node,
        options,
        'DATA_PATH_UNKNOWN',
        `${dataPath} starts with ${root}, which is neither a declared data file nor an item of an enclosing each.`,
        'Declare the JSON file in data (it is addressed by its name without .json), or fix the name.',
        { path: dataPath },
      )
    : located(
        node,
        options,
        'DATA_PATH_MISSING',
        `The data has nothing at ${resolution.at} (reading ${dataPath}).`,
        'Fix the path, or add the field to the data; a missing value is not shown as empty text.',
        { path: dataPath, missing: resolution.at },
      );
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `a list of ${value.length} items`;
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `the text ${JSON.stringify(value)}`;
  return `${typeof value} ${String(value)}`;
}

function directiveDefinition(name: string) {
  const definition = authoringRegistry.directives.find((directive) => directive.name === name);
  if (definition === undefined) throw new Error(`The registry has no ${name} directive.`);
  return definition;
}

function isDirectiveLabel(node: RootContent): boolean {
  return (
    node.type === 'paragraph' &&
    (node.data as { directiveLabel?: boolean } | undefined)?.directiveLabel === true
  );
}

function hasChildren(node: unknown): node is ParentNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'children' in node &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

function located(
  node: LocatedNode,
  options: PageDataOptions,
  code: string,
  message: string,
  remediation: string,
  details: Readonly<Record<string, unknown>>,
): AgenticReportError {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const source =
    start === undefined || end === undefined
      ? undefined
      : resolveSourceLocation(options.sourceMap, start, end);
  return new AgenticReportError({
    level: 'error',
    code,
    message,
    remediation,
    ...(source === undefined ? {} : { source }),
    details,
  });
}
