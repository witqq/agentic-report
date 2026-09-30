import type { Element, ElementContent } from 'hast';
import type { Root as MdastRoot } from 'mdast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { enumAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { hastText, takeStringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode, isTraversableNode } from './mdast.js';

/**
 * Small typographic directives in running text: a word that swaps on a beat (`:swap`), a short line
 * typed in place (`:typing`), and a hand-drawn mark (`:mark`). Each keeps its whole written text in the
 * page from the start, reserves its final width so nothing around it moves, and without motion or in
 * print is the written text itself — a mark drawn complete.
 */

/** A swap cycles through at most three other words and returns to the written one. */
export const SWAP_WORDS = { minimum: 1, maximum: 3, maximumLength: 40 } as const;
/** A typed line is short: a command, a query, one phrase. */
export const TYPE_LINE_MAXIMUM = 80;
/** Hand-drawn marks lose their point when the reader sees more than two at once. */
export const MARKS_PER_SCREEN = 2;

function inlineDefinition(
  name: 'swap' | 'typing' | 'mark',
  description: string,
  attributes: DirectiveDefinition['attributes'],
): DirectiveDefinition {
  return {
    name,
    description,
    forms: ['text'],
    attributes,
    children: 'label-or-generated-label',
    placement: {},
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'package-owned-typography',
    },
    sanitizer: {
      tagName: 'span',
      className: `semantic-${name}`,
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

/** The label as written when it is plain text, or nothing when it holds markup. */
function plainLabel(node: DirectiveNode): string | undefined {
  const children = node.children ?? [];
  if (!children.every((child) => isTraversableNode(child) && child.type === 'text'))
    return undefined;
  return children.map((child) => String((child as { value?: unknown }).value ?? '')).join('');
}

export function swapWords(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

interface InlineSubject {
  readonly node: DirectiveNode;
  readonly label: string | undefined;
  readonly words: readonly string[];
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

const swapRules = declareAuthoredRules<InlineSubject>({
  subject: 'swap',
  rules: [
    {
      id: 'plain-written-word',
      check: ({ label, fail }) =>
        label !== undefined && label.trim() !== ''
          ? undefined
          : fail(
              'swap shows its written word first and returns to it, and this label is empty or holds markup.',
              'Write the word as plain text, such as :swap[fast]{words="calm, exact"}.',
            ),
    },
    {
      id: 'word-count',
      check: ({ words, fail }) =>
        words.length >= SWAP_WORDS.minimum && words.length <= SWAP_WORDS.maximum
          ? undefined
          : fail(
              `swap cycles through ${SWAP_WORDS.minimum} to ${SWAP_WORDS.maximum} other words, and words lists ${words.length}.`,
              'List one to three words separated by commas; a longer cycle is a sentence the reader waits for.',
            ),
    },
    {
      id: 'word-length',
      check: ({ label, words, fail }) => {
        const long = [label ?? '', ...words].filter(
          (word) => word.length > SWAP_WORDS.maximumLength,
        );
        return long.length === 0
          ? undefined
          : fail(
              `swap swaps words, not phrases; these are longer than ${SWAP_WORDS.maximumLength} characters: ${long.join(', ')}.`,
              'Swap one word or a short phrase; write a longer idea as prose.',
            );
      },
    },
    {
      id: 'different-words',
      check: ({ label, words, fail }) => {
        const all = [label?.trim() ?? '', ...words];
        return new Set(all).size === all.length
          ? undefined
          : fail(
              'swap repeats a word, so the reader sees nothing change.',
              'List words that differ from each other and from the written word.',
            );
      },
    },
  ],
});

function validateSwap(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    swapRules,
    {
      node,
      label: plainLabel(node),
      words: swapWords(context.attributes(node)?.words),
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
    },
    found,
  );
  context.report(found);
  return 'accepted';
}

/** The written word first, the others stacked in the same cell: the widest one sets the width. */
function enhanceSwap(node: Element): void {
  const written = hastText(node);
  const words = swapWords(takeStringProperty(node, 'dataWords'));
  node.properties.dataSwap = String(words.length + 1);
  node.children = [written, ...words].map((word, index): ElementContent => ({
    type: 'element',
    tagName: 'span',
    properties: {
      className: ['swap-word'],
      dataSwapWord: String(index),
      ...(index === 0 ? {} : { ariaHidden: 'true' }),
    },
    children: [{ type: 'text', value: word }],
  }));
}

export const swap = defineBlock({
  definition: inlineDefinition(
    'swap',
    'A word in running text that swaps on a beat to up to three other words and returns to the written one within five seconds; the widest word reserves the width, so the line never moves.',
    [
      {
        name: 'words',
        description:
          'The other words, separated by commas (one to three); the written label comes first and last.',
        required: true,
        constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 160 },
        renderProperty: 'dataWords',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
    ],
  ),
  validate: validateSwap,
  enhance: enhanceSwap,
  feature: 'typography',
  staticEquivalent: 'The written word alone; the other words are not shown.',
  examples: ['Reviews become :swap[faster]{words="calmer, exact"} with a plan.\n'],
});

const typeRules = declareAuthoredRules<InlineSubject>({
  subject: 'typing',
  rules: [
    {
      id: 'plain-line',
      check: ({ label, fail }) =>
        label !== undefined && label.trim() !== ''
          ? undefined
          : fail(
              'typing types its line in place, and this label is empty or holds markup.',
              'Write the line as plain text, such as :typing[agentic-report build page].',
            ),
    },
    {
      id: 'short-line',
      check: ({ label, fail }) =>
        label === undefined || label.length <= TYPE_LINE_MAXIMUM
          ? undefined
          : fail(
              `typing types one short line, and this one has ${label.length} characters (at most ${TYPE_LINE_MAXIMUM}).`,
              'Type a command, a query or one phrase; show longer text as a code block with transition="log" on its section.',
            ),
    },
  ],
});

function validateType(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    typeRules,
    {
      node,
      label: plainLabel(node),
      words: [],
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
    },
    found,
  );
  context.report(found);
  return 'accepted';
}

export const typing = defineBlock({
  definition: inlineDefinition(
    'typing',
    'A short line in running text typed in place, character by character, when it comes into view; the whole line is in the page from the start and holds its width, so nothing moves.',
    [],
  ),
  validate: validateType,
  feature: 'typography',
  staticEquivalent: 'The whole line, already typed.',
  examples: ['Run :typing[agentic-report build page] and open the file.\n'],
});

/**
 * A seeded generator: the same seed draws the same mark on every build, so a snapshot never changes
 * between builds while two marks on one page still look drawn by hand, each differently.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function markSeed(text: string): number {
  let hash = 2_166_136_261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

const round = (value: number): string => String(Math.round(value * 10) / 10);

/**
 * The path of a hand-drawn mark in a 100 × 100 box stretched over the marked words. The jitter comes
 * from the seed; points are joined by quadratic curves through their midpoints, so the line is smooth
 * like a pen stroke rather than a polygon.
 */
export function markPath(shape: string, seed: number): string {
  const random = seeded(seed);
  const jitter = (amount: number): number => (random() - 0.5) * 2 * amount;
  const points: Array<readonly [number, number]> = [];
  if (shape === 'circle') {
    const start = random() * Math.PI * 2;
    const sweep = Math.PI * 2 * (1.08 + random() * 0.1);
    const steps = 18;
    let drift = 0;
    for (let index = 0; index <= steps; index += 1) {
      const angle = start + (sweep * index) / steps;
      drift += jitter(1.6);
      points.push([
        50 + Math.cos(angle) * (49 + drift + jitter(1)),
        50 + Math.sin(angle) * (46 + drift * 0.6 + jitter(1.5)),
      ]);
    }
  } else {
    const base = shape === 'strike' ? 55 : 92;
    const steps = 6;
    const tilt = jitter(3);
    for (let index = 0; index <= steps; index += 1) {
      const x = -1 + (102 * index) / steps + jitter(1.5);
      points.push([x, base + (tilt * index) / steps + jitter(2.5)]);
    }
  }
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let path = `M${round(first[0])} ${round(first[1])}`;
  for (let index = 0; index < rest.length - 1; index += 1) {
    const control = rest[index];
    const next = rest[index + 1];
    if (control === undefined || next === undefined) continue;
    path += ` Q${round(control[0])} ${round(control[1])} ${round((control[0] + next[0]) / 2)} ${round((control[1] + next[1]) / 2)}`;
  }
  const last = rest.at(-1);
  if (last !== undefined) path += ` L${round(last[0])} ${round(last[1])}`;
  return path;
}

/** Marks per top-level block of the page: a section is the screen the reader sees them on. */
const markCountsByDocument = new WeakMap<MdastRoot, Set<object>>();

function excessMarks(document: MdastRoot): Set<object> {
  const cached = markCountsByDocument.get(document);
  if (cached !== undefined) return cached;
  const excess = new Set<object>();
  let outside = 0;
  for (const child of document.children) {
    const marks: object[] = [];
    const pending: unknown[] = [child];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!isTraversableNode(node)) continue;
      if (isDirectiveNode(node) && node.name === 'mark') marks.push(node);
      pending.push(...[...(node.children ?? [])].reverse());
    }
    const isSection = isDirectiveNode(child) && child.name === 'section';
    for (const mark of marks) {
      // Everything before and between sections reads as one screen; each section is its own.
      const position = isSection ? marks.indexOf(mark) : outside++;
      if (position >= MARKS_PER_SCREEN) excess.add(mark);
    }
  }
  markCountsByDocument.set(document, excess);
  return excess;
}

const markRules = declareAuthoredRules<InlineSubject & { readonly excess: boolean }>({
  subject: 'mark',
  rules: [
    {
      id: 'marked-words',
      check: ({ node, fail }) =>
        (node.children ?? []).length > 0
          ? undefined
          : fail(
              'mark draws around words, and this one marks nothing.',
              'Write the marked words as the label, such as :mark[three times]{shape="circle"}.',
            ),
    },
    {
      id: 'two-per-screen',
      check: ({ excess, fail }) =>
        !excess
          ? undefined
          : fail(
              `A section holds at most ${MARKS_PER_SCREEN} hand-drawn marks; a third one makes all of them decoration.`,
              'Keep the two marks that carry the argument and write the others as plain text or **strong**.',
            ),
    },
  ],
});

function validateMark(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    markRules,
    {
      node,
      label: plainLabel(node),
      words: [],
      excess: excessMarks(context.document).has(node),
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
    },
    found,
  );
  context.report(found);
  return 'accepted';
}

function enhanceMark(node: Element): void {
  const shape = takeStringProperty(node, 'dataShape') ?? 'underline';
  const authoredSeed = takeStringProperty(node, 'dataSeed');
  const seed =
    authoredSeed === undefined ? markSeed(`${shape}:${hastText(node)}`) : Number(authoredSeed);
  node.properties.dataMark = shape;
  node.children = [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['mark-text'] },
      children: node.children,
    },
    {
      type: 'element',
      tagName: 'svg',
      properties: {
        className: ['mark-drawing'],
        viewBox: '0 0 100 100',
        preserveAspectRatio: 'none',
        ariaHidden: 'true',
        focusable: 'false',
      },
      children: [
        {
          type: 'element',
          tagName: 'path',
          properties: {
            d: markPath(shape, seed),
            pathLength: '1',
            vectorEffect: 'non-scaling-stroke',
          },
          children: [],
        },
      ],
    },
  ];
}

export const mark = defineBlock({
  definition: inlineDefinition(
    'mark',
    'Words in running text marked by hand: underlined, circled or struck through in the accent colour, drawn when they come into view; the jitter comes from a seed, and a section holds at most two marks.',
    [
      enumAttribute(
        'shape',
        'How the words are marked: a hand-drawn underline, a circle around them, or a strike through them.',
        ['underline', 'circle', 'strike'],
        'underline',
      ),
      {
        name: 'seed',
        description:
          'Seed of the hand-drawn jitter (0–9999); the same seed draws the same line. By default it comes from the marked words.',
        required: false,
        constraint: { kind: 'integer', minimum: 0, maximum: 9999, lexicalPattern: '^\\d{1,4}$' },
        renderProperty: 'dataSeed',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
    ],
  ),
  validate: validateMark,
  enhance: enhanceMark,
  feature: 'typography',
  staticEquivalent: 'The words with the mark drawn complete around them.',
  examples: ['The run returned :mark[three times]{shape="circle"} before it passed.\n'],
});
