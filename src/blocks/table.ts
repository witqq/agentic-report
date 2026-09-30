import type { Element } from 'hast';

import { enumAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { takeStringProperty } from './hast.js';
import type { DirectiveNode } from './mdast.js';

/**
 * How a Markdown table meets a track too narrow for its columns. Every table gets the `auto` reading
 * without the directive; the directive exists only to choose another one.
 *
 * - `auto`: prose columns wrap; on a track narrower than the table's readable width (the compiler
 *   measures its columns, `src/render/tables.ts`) each row becomes a card with the column headers as
 *   labels.
 * - `stack`: rows become cards on every narrow track, whatever the columns measure.
 * - `scroll`: the table never becomes cards; short columns stay on one line, the first column stays in
 *   view while the rest scrolls sideways.
 */
export const TABLE_LAYOUTS = ['auto', 'stack', 'scroll'] as const;
export type TableLayout = (typeof TABLE_LAYOUTS)[number];

/** A table directive holds exactly one Markdown table: anything beside it would lose its place. */
function validateTable(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const children = (node.children ?? []).filter((child) => {
    const data = (child as { readonly data?: { readonly directiveLabel?: boolean } }).data;
    return data?.directiveLabel !== true;
  });
  const [only] = children;
  if (children.length === 1 && (only as { readonly type?: unknown }).type === 'table') {
    return 'accepted';
  }
  context.report(
    context.violation(
      node,
      'INVALID_DIRECTIVE_CHILD',
      'table holds exactly one Markdown table and nothing else.',
      'Put one pipe table between :::table{layout="…"} and :::, and move other content outside.',
    ),
  );
  return 'accepted';
}

/** The directive element becomes the table's frame; the table pass reads the chosen layout from it. */
function enhanceTable(node: Element): void {
  const layout = takeStringProperty(node, 'dataLayout') ?? 'auto';
  node.properties.className = ['semantic-table', 'table-frame'];
  node.properties.dataTableLayout = layout;
}

export const table = defineBlock({
  definition: {
    name: 'table',
    description:
      'One Markdown table with a chosen narrow-track layout; a table without the directive uses layout auto.',
    forms: ['container'],
    attributes: [
      enumAttribute(
        'layout',
        'How the table meets a narrow track: auto wraps prose and turns rows into labelled cards only when the columns cannot fit readably; stack turns rows into cards on every narrow track; scroll keeps the grid, scrolls sideways and keeps the first column in view.',
        TABLE_LAYOUTS,
        'auto',
      ),
    ],
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-table',
      properties: ['dataSemantic', 'dataLayout'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  },
  validate: validateTable,
  enhance: enhanceTable,
  feature: 'table',
  staticEquivalent:
    'The table itself; print always shows the grid, with prose wrapped and nothing scrolled away.',
  examples: [
    ':::table{layout="scroll"}\n| Region | Q1 | Q2 | Q3 | Q4 |\n| --- | ---: | ---: | ---: | ---: |\n| North | 120 | 132 | 141 | 150 |\n| South | 98 | 101 | 117 | 123 |\n\n:::\n',
  ],
});
