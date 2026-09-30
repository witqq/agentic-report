import type { Element, ElementContent } from 'hast';

import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import { resolvePackageLocale } from '../localization.js';
import { attributeRenderProperty } from './definitions.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { takeStringProperty } from './hast.js';
import type { DirectiveNode } from './mdast.js';
import { checkMoment, formatMoment, parseMoment } from './number-and-time.js';

/**
 * The source line under a block of data and the provenance caption under a picture or a video: one
 * leaf directive written right after the block it describes — a table, a chart, cards, an image, a
 * video, code. It says which data or which footage the reader sees and when it was taken
 * (DR-DATA-SLICE, DR-NUMBERS-UNITS): «Source: Moira export of run 96, 212 records · 25 September 2026,
 * 01:17 GMT+3». One directive serves every block, because a Markdown table or image has no attributes
 * of its own to carry the line.
 */

interface SourceStrings {
  readonly source: string;
}

const SOURCE_STRINGS = {
  en: { source: 'Source:' },
  ru: { source: 'Источник:' },
} as const satisfies Record<'en' | 'ru', SourceStrings>;

function sourceDefinition(): DirectiveDefinition {
  const attributes = [
    {
      name: 'date',
      description:
        'When the data or footage was taken: 2026-09-25, or 2026-09-25T01:17 together with zone.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 32 },
      renderProperty: attributeRenderProperty('date'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'zone',
      description: 'IANA time zone of a date with a time, such as Europe/Moscow.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        maxLength: 64,
        pattern: '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$',
      },
      renderProperty: attributeRenderProperty('zone'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'source-line',
    description:
      'The source line under the block before it — which data or footage, how many records, taken when: ::source-line[Moira export of run 96, 212 records]{date="2026-09-25"}.',
    forms: ['leaf'],
    attributes,
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-source-line',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function validateSource(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(node);
  if (values === undefined) return 'refused';
  let verdict: BlockVerdict = 'accepted';
  if ((node.children ?? []).length === 0) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        'source-line needs its text: which data or footage, and how many records.',
        'Write it as the label: ::source-line[Moira export of run 96, 212 records]{date="2026-09-25"}.',
      ),
    );
    verdict = 'refused';
  }
  const siblings = (context.parent as { readonly children?: readonly unknown[] } | undefined)
    ?.children;
  if (siblings !== undefined && siblings.indexOf(node) <= 0) {
    context.report(
      context.violation(
        node,
        'SOURCE_LINE_WITHOUT_BLOCK',
        'source-line describes the block written right before it, and nothing precedes it here.',
        'Move the source line directly under the table, chart, cards, image or video it describes.',
      ),
    );
    verdict = 'refused';
  }
  const date = typeof values.date === 'string' ? values.date : undefined;
  const zone = typeof values.zone === 'string' ? values.zone : undefined;
  if (date !== undefined && checkMoment(node, context, date, zone, 'date') === undefined)
    verdict = 'refused';
  return verdict;
}

function enhanceSource(node: Element, context: BlockEnhancementContext<SourceStrings>): void {
  const date = takeStringProperty(node, 'dataDate');
  const zone = takeStringProperty(node, 'dataZone');
  const moment = date === undefined ? undefined : parseMoment(date);
  node.tagName = 'p';
  const children: ElementContent[] = [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['semantic-source-line-label'] },
      children: [{ type: 'text', value: context.messages.source }],
    },
    { type: 'text', value: ' ' },
    ...node.children,
  ];
  if (moment !== undefined) {
    const { text, datetime } = formatMoment(
      moment,
      zone,
      moment.time === undefined ? 'date' : 'datetime',
      resolvePackageLocale(context.language),
    );
    children.push(
      { type: 'text', value: ' · ' },
      {
        type: 'element',
        tagName: 'time',
        properties: { dateTime: datetime },
        children: [{ type: 'text', value: text }],
      },
    );
  }
  node.children = children;
}

export const sourceLine = defineBlock<undefined, SourceStrings>({
  definition: sourceDefinition(),
  validate: validateSource,
  enhance: enhanceSource,
  strings: SOURCE_STRINGS,
  feature: 'source-line',
  staticEquivalent: 'One small line of text under the block it describes, the same in print.',
  examples: [
    '| Stage | Items |\n| --- | --- |\n| Review | 9 |\n\n::source-line[Moira export of run 96, 212 records]{date="2026-09-25T01:17" zone="Europe/Moscow"}\n',
  ],
});
