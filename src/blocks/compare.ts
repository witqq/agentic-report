import type { Element } from 'hast';
import { visit } from 'unist-util-visit';

import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { interactiveContainer, textAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { stringProperty } from './hast.js';
import { type DirectiveNode, isTraversableNode } from './mdast.js';
import type { PackageStrings } from '../localization.js';

interface CompareSubject {
  readonly node: DirectiveNode;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/** Сравнение — ровно две картинки Markdown, «до» и «после», и ничего больше. */
const compareRules = declareAuthoredRules<CompareSubject>({
  subject: 'compare',
  rules: [
    {
      id: 'two-images',
      check: ({ node, fail }) => {
        let images = 0;
        let other = false;
        const pending = [...(node.children ?? [])];
        while (pending.length > 0) {
          const child = pending.pop();
          if (!isTraversableNode(child)) continue;
          if (child.type === 'image') images += 1;
          else if (child.type === 'paragraph') pending.push(...(child.children ?? []));
          else if (
            child.type !== 'text' ||
            String((child as { value?: unknown }).value).trim() !== ''
          )
            other = true;
        }
        if (images === 2 && !other) return undefined;
        return fail(
          `compare holds exactly two Markdown images and nothing else; this one has ${images} image(s)${other ? ' and other content' : ''}.`,
          'Put the before image, then the after image, inside compare, and move any caption outside it.',
        );
      },
    },
  ],
});

function validateCompare(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  const outcome = runAuthoredRules(
    compareRules,
    {
      node,
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
    },
    found,
  );
  context.report(found);
  return outcome;
}

/**
 * «До» и «после» одного вида: картинка «после» лежит поверх и открыта до границы. Границу двигает
 * обычный ползунок — клавиатурой и экранным чтецом, — а рантайм добавляет перетаскивание указателем.
 * Без рантайма граница стоит посередине.
 */
function enhanceCompare(node: Element, context: { readonly strings: PackageStrings }): void {
  const { strings } = context;
  const images: Element[] = [];
  visit(node, 'element', (candidate: Element) => {
    if (candidate.tagName === 'img') images.push(candidate);
  });
  const [before, after] = images;
  if (before === undefined || after === undefined)
    throw new Error('Validated compare lost an image.');
  const beforeLabel = stringProperty(node, 'dataBefore') ?? strings.compareBefore;
  const afterLabel = stringProperty(node, 'dataAfter') ?? strings.compareAfter;
  const label = (side: 'before' | 'after', value: string): Element => ({
    type: 'element',
    tagName: 'span',
    properties: { className: ['compare-label'], dataSide: side, ariaHidden: 'true' },
    children: [{ type: 'text', value }],
  });
  node.tagName = 'figure';
  node.properties.dataCompare = '';
  node.properties.style = '--compare-position: 50%';
  node.children = [
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['compare-stage'], dataCompareStage: '' },
      children: [
        before,
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['compare-after'] },
          children: [after],
        },
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['compare-divider'] },
          children: [],
        },
        label('before', beforeLabel),
        label('after', afterLabel),
      ],
    },
    {
      type: 'element',
      tagName: 'input',
      properties: {
        type: 'range',
        min: '0',
        max: '100',
        step: '1',
        value: '50',
        className: ['compare-range'],
        ariaLabel: strings.comparePosition(beforeLabel, afterLabel),
        dataCompareRange: '',
      },
      children: [],
    },
  ];
}

export const compare = defineBlock({
  definition: interactiveContainer(
    'compare',
    'Before and after of the same view: exactly two Markdown images, before then after, laid over each other with a divider the reader moves by pointer or keyboard.',
    {
      attributes: [
        textAttribute('before', 'Label of the first image.', false, 'Before'),
        textAttribute('after', 'Label of the second image.', false, 'After'),
      ],
      runtime: 'package-owned-compare',
    },
  ),
  validate: validateCompare,
  localizedDefaults: ['before', 'after'],
  enhance: enhanceCompare,
  styles: 'package',
  staticEquivalent:
    'The before image with the after image over it, split at the middle, labelled before and after.',
  examples: [
    ':::compare{before="Old" after="New"}\n![Old layout](before.png)\n![New layout](after.png)\n:::\n',
  ],
});
