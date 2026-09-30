import type { Element, ElementContent, Root, Text } from 'hast';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import { hastText } from '../blocks/hast.js';

/**
 * Compile-time shaping of Markdown tables and inline code, so the stylesheet can lay them out without
 * measuring anything in the browser.
 *
 * Inline code gets a line-break opportunity (`<wbr>`) after each separator of a path or identifier —
 * `/ . _ - : ( ,`, and before the capitals of a very long camel-case word — so a long path, call or
 * identifier wraps between its parts instead of mid-word; `<wbr>` is not text, so copying the code yields
 * exactly what the author wrote.
 *
 * Every table gets a frame (`div.table-frame`, the scroll container and the container its layout
 * queries), explicit table roles (a table shown as cards keeps its semantics, because some browsers
 * drop them when `display` changes), a `data-label` on each data cell from its column header (the
 * label a card shows), and two widths the compiler estimates from its columns: the readable width
 * below which the `auto` layout turns rows into cards, and the width at which every code value fits
 * whole on one line.
 */

/** Characters after which a path, identifier or call may wrap. */
const CODE_SEPARATORS = new Set(['/', '.', '_', '-', ':', '(', ',']);

/** Readable-width steps (rem) of the `auto` layout; the stylesheet has a container rule for each. */
export const TABLE_FIT_STEPS = [20, 24, 28, 32, 36, 40, 44, 48] as const;
/** Steps (rem) at which the code values of a table fit whole; above the last they always wrap. */
export const TABLE_CODE_STEPS = [24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96] as const;

/** Average advance of one character of cell prose, in rem (a wide Cyrillic text reads close to it). */
const PROSE_CHARACTER_REM = 0.55;
/** Advance of one character of inline code (monospace at 0.88em), in rem. */
const CODE_CHARACTER_REM = 0.64;
/** The inline padding of an inline code value, in rem. */
const CODE_PADDING_REM = 0.5;
/** The inline gap between two columns (the cell's end padding), in rem. */
const COLUMN_GAP_REM = 1.25;
/** A prose column narrower than this many characters reads as a word per line. */
const PROSE_MINIMUM = 16;
/** A column whose longest cell is at most this many characters stays on one line. */
const SHORT_CELL = 20;
/**
 * Width steps (rem) of a prose column's cap. A prose column is as wide as its typical cell, not as its
 * longest: one long cell would otherwise set the column to the whole track and leave the other rows as
 * short lines in wide empty cells. The stylesheet has a rule for each step.
 */
export const TABLE_PROSE_CAP_STEPS = [12, 16, 20, 24, 28, 32, 36, 40] as const;
/** The share of a prose column's cells that fit on one line of the cap; the rest wrap. */
const PROSE_CAP_QUANTILE = 0.75;
/** A column is capped only when its longest cell is at least this many times its typical cell. */
const PROSE_CAP_OUTLIER = 1.5;

export const rehypeTables: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'table' || parent === undefined || index === undefined) return undefined;
    const framed =
      parent.type === 'element' &&
      Array.isArray(parent.properties.className) &&
      parent.properties.className.includes('table-frame');
    const frame: Element = framed
      ? parent
      : {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-frame'], dataTableLayout: 'auto' },
          children: [node],
        };
    if (!framed) parent.children[index] = frame;
    shapeTable(node, frame);
    return SKIP;
  });
  // After the tables are measured: their measures read the code as one text.
  visit(tree, 'element', (node: Element, _index, parent) => {
    if (node.tagName === 'code' && !(parent?.type === 'element' && parent.tagName === 'pre')) {
      insertCodeBreaks(node);
      return SKIP;
    }
    if (node.tagName === 'pre') return SKIP;
    insertJoinBreaks(node);
    return undefined;
  });
};

/** Separators that may stand alone between two inline code values: `a`/`b`, `a`,`b`. */
const JOIN_SEPARATOR = /^[/.,:_-]+$/u;

/**
 * Two inline code values joined by a bare separator in the prose (`` `applyShowGeometry`/`clearShowGeometry` ``)
 * form one unbreakable run, because the line-breaking rules allow no break around `/` next to letters: the
 * run is then split mid-word. A `<wbr>` after the separator lets it wrap between the two values.
 */
function insertJoinBreaks(parent: Element): void {
  for (let index = parent.children.length - 2; index >= 1; index -= 1) {
    const joint = parent.children[index];
    if (joint?.type !== 'text' || !JOIN_SEPARATOR.test(joint.value)) continue;
    if (!isInlineCode(parent.children[index - 1]) || !isInlineCode(parent.children[index + 1]))
      continue;
    parent.children.splice(index + 1, 0, {
      type: 'element',
      tagName: 'wbr',
      properties: {},
      children: [],
    } satisfies Element);
  }
}

function isInlineCode(node: ElementContent | undefined): boolean {
  return node?.type === 'element' && node.tagName === 'code';
}

/** Splits each text of inline code after its separators, with `<wbr>` between the parts. */
export function insertCodeBreaks(code: Element): void {
  code.children = code.children.flatMap((child): ElementContent[] => {
    if (child.type === 'element') {
      insertCodeBreaks(child);
      return [child];
    }
    if (child.type !== 'text') return [child];
    const parts = codeParts(child.value);
    if (parts.length < 2) return [child];
    return parts.flatMap((part, position): ElementContent[] => [
      ...(position === 0
        ? []
        : [{ type: 'element', tagName: 'wbr', properties: {}, children: [] } satisfies Element]),
      { type: 'text', value: part } satisfies Text,
    ]);
  });
}

/**
 * The parts of a code text between break opportunities: after a separator that closes a word and opens
 * the next one, so `--flag`, `://`, `dispose()` and a decimal like `1.5` stay together.
 */
export function codeParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let position = 1; position < value.length - 1; position += 1) {
    const character = value[position] ?? '';
    if (!CODE_SEPARATORS.has(character)) continue;
    const before = value[position - 1] ?? '';
    const after = value[position + 1] ?? '';
    if (!WORD_END.test(before) || !WORD_START.test(after)) continue;
    if (character === '.' && /\d/u.test(before) && /\d/u.test(after)) continue;
    parts.push(value.slice(start, position + 1));
    start = position + 1;
  }
  parts.push(value.slice(start));
  return parts.flatMap(splitLongWord);
}

/** A part this long may be wider than a phone line; rather than break anywhere, it breaks at its humps. */
const LONG_PART = 24;

/** `resolveBoardConnectorGeometryAnchorPoint` breaks before each capital that follows a lower-case letter. */
function splitLongWord(part: string): string[] {
  if (part.length < LONG_PART) return [part];
  return part.split(/(?<=\p{Ll})(?=\p{Lu})/u);
}

/** A character that may end the part before a break: a letter, a digit, a closing quote or bracket. */
const WORD_END = /[\p{L}\p{N}'"`)\]}>*$]/u;
/** A character that may start the part after a break: a letter, a digit, an opening quote or bracket. */
const WORD_START = /[\p{L}\p{N}'"`([{<$@~#*]/u;

interface ColumnMeasure {
  /** Width (rem) the column needs to read well when its prose and code may wrap. */
  readonly readable: number;
  /** Width (rem) the column needs with every code value on one line. */
  readonly whole: number;
  readonly prose: boolean;
  /** Every cell is short enough to stay on one line (`SHORT_CELL`). */
  readonly short?: boolean;
  /** Cap step (rem) of a prose column whose longest cell is an outlier, or nothing. */
  readonly cap?: number;
}

function shapeTable(table: Element, frame: Element): void {
  table.properties.role = 'table';
  const rows: Element[] = [];
  for (const group of elementChildren(table)) {
    if (group.tagName === 'tr') {
      rows.push(group);
      continue;
    }
    if (group.tagName !== 'thead' && group.tagName !== 'tbody' && group.tagName !== 'tfoot') {
      continue;
    }
    group.properties.role = 'rowgroup';
    rows.push(...elementChildren(group).filter((row) => row.tagName === 'tr'));
  }
  const headerRow = rows.find((row) => elementChildren(row).every((cell) => cell.tagName === 'th'));
  const headers = headerRow === undefined ? [] : elementChildren(headerRow).map(hastText);
  const columns: Element[][] = [];
  for (const row of rows) {
    row.properties.role = 'row';
    elementChildren(row).forEach((cell, column) => {
      if (row === headerRow) {
        cell.properties.role = 'columnheader';
      } else {
        cell.properties.role = cell.tagName === 'th' ? 'rowheader' : 'cell';
        const label = headers[column];
        if (label !== undefined && label !== '') cell.properties.dataLabel = label;
        const cells = columns[column] ?? [];
        cells.push(cell);
        columns[column] = cells;
      }
    });
  }
  const measures = columns.map((cells, column) => measureColumn(cells, headers[column] ?? ''));
  for (const [column, measure] of measures.entries()) {
    if (measure.short === true)
      for (const cell of columns[column] ?? []) cell.properties.dataColumn = 'short';
    if (!measure.prose) continue;
    const header = headerRow === undefined ? undefined : elementChildren(headerRow)[column];
    for (const cell of [...(columns[column] ?? []), ...(header === undefined ? [] : [header])]) {
      cell.properties.dataColumn = 'prose';
      if (measure.cap !== undefined) cell.properties.dataColumnCap = String(measure.cap);
    }
  }
  const gaps = Math.max(0, measures.length - 1) * COLUMN_GAP_REM;
  const readable = measures.reduce((sum, measure) => sum + measure.readable, 0);
  frame.properties.dataTableFit = String(step(TABLE_FIT_STEPS, readable + gaps) ?? 48);
  if (columns.some((cells) => cells.some((cell) => hasCode(cell)))) {
    const whole = measures.reduce((sum, measure) => sum + measure.whole, 0);
    const codeStep = step(TABLE_CODE_STEPS, whole + gaps);
    if (codeStep !== undefined) frame.properties.dataTableCode = String(codeStep);
  }
}

function measureColumn(cells: readonly Element[], header: string): ColumnMeasure {
  let longestCell = 0;
  let longestWord = longestOf(header.split(/\s+/u));
  let longestSegment = 0;
  let longestCode = 0;
  let proseLength = 0;
  let codeLength = 0;
  const lengths: number[] = [];
  for (const cell of cells) {
    const text = hastText(cell);
    longestCell = Math.max(longestCell, text.length);
    lengths.push(text.length);
    const codes = codeTexts(cell);
    const code = codes.join('');
    codeLength += code.length;
    proseLength += Math.max(0, text.length - code.length);
    for (const value of codes) {
      longestCode = Math.max(longestCode, value.length);
      longestSegment = Math.max(longestSegment, longestOf(codeParts(value)));
    }
    const prose = codes.reduce((rest, value) => rest.replace(value, ' '), text);
    longestWord = Math.max(longestWord, longestOf(prose.split(/\s+/u)));
  }
  const codeWidth = (characters: number): number =>
    characters === 0 ? 0 : characters * CODE_CHARACTER_REM + CODE_PADDING_REM;
  const segment = codeWidth(longestSegment);
  const word = longestWord * PROSE_CHARACTER_REM;
  if (longestCell <= SHORT_CELL) {
    // A short value stays on one line; its width is the longest cell read as code or as prose.
    const width = Math.max(codeWidth(longestCode), longestCell * PROSE_CHARACTER_REM);
    return { readable: width, whole: width, prose: false, short: true };
  }
  const prose = proseLength >= codeLength;
  const readable = Math.max(word, segment, prose ? PROSE_MINIMUM * PROSE_CHARACTER_REM : 0);
  const cap = prose ? proseCap(lengths, longestCell, readable) : undefined;
  return {
    readable,
    whole: Math.max(readable, codeWidth(longestCode)),
    prose,
    ...(cap === undefined ? {} : { cap }),
  };
}

/**
 * The cap of a prose column: the width that holds three quarters of its cells on one line, rounded up to
 * a step and never below what the column needs to read well. Only a column whose longest cell is an
 * outlier gets one; a column of evenly long cells wraps at the track as before.
 */
function proseCap(
  lengths: readonly number[],
  longest: number,
  readable: number,
): number | undefined {
  const sorted = [...lengths].sort((a, b) => a - b);
  const typical =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * PROSE_CAP_QUANTILE))];
  if (typical === undefined || longest < typical * PROSE_CAP_OUTLIER) return undefined;
  return step(
    TABLE_PROSE_CAP_STEPS,
    Math.max(readable, (typical + 1) * PROSE_CHARACTER_REM + COLUMN_GAP_REM),
  );
}

function codeTexts(cell: Element): string[] {
  const found: string[] = [];
  visit(cell, 'element', (node: Element) => {
    if (node.tagName !== 'code') return undefined;
    found.push(hastText(node));
    return SKIP;
  });
  return found;
}

function hasCode(cell: Element): boolean {
  return codeTexts(cell).length > 0;
}

function longestOf(values: readonly string[]): number {
  return values.reduce((longest, value) => Math.max(longest, value.length), 0);
}

function step(steps: readonly number[], width: number): number | undefined {
  return steps.find((candidate) => candidate >= width);
}

function elementChildren(node: Element): Element[] {
  return node.children.filter((child): child is Element => child.type === 'element');
}
