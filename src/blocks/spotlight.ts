import type { Element, ElementContent } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { titleAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { semanticTitle, takeStringProperty } from './hast.js';
import { type DirectiveNode, isTraversableNode } from './mdast.js';

/**
 * A spotlight moves in on one detail of a screenshot: a loupe over the point `x`, `y` (per cent of the
 * picture) shows it `zoom` times larger, the rest of the picture is dimmed, and the explanation stands
 * beside it. One directive holds the picture and the explanation, so the detail and its words never
 * drift apart. Without motion, in print and without the runtime the loupe is shown in place, final.
 */

export const SPOTLIGHT_ZOOM = { minimum: 1.5, maximum: 4, default: 2 } as const;

function percentAttribute(name: 'x' | 'y', axis: string) {
  return {
    name,
    description: `${axis} position of the detail, in per cent of the picture ${name === 'x' ? 'width from the left' : 'height from the top'} (0–100).`,
    required: true,
    constraint: { kind: 'integer', minimum: 0, maximum: 100, lexicalPattern: '^\\d{1,3}$' },
    renderProperty: name === 'x' ? 'dataX' : 'dataY',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  } as const;
}

function spotlightDefinition(): DirectiveDefinition {
  const attributes = [
    titleAttribute,
    percentAttribute('x', 'Horizontal'),
    percentAttribute('y', 'Vertical'),
    {
      name: 'zoom',
      description: `How many times the loupe enlarges the detail (${SPOTLIGHT_ZOOM.minimum}–${SPOTLIGHT_ZOOM.maximum}).`,
      required: false,
      default: SPOTLIGHT_ZOOM.default,
      constraint: {
        kind: 'number',
        minimum: SPOTLIGHT_ZOOM.minimum,
        maximum: SPOTLIGHT_ZOOM.maximum,
        lexicalPattern: '^[1-4](?:\\.\\d)?$',
      },
      renderProperty: 'dataZoom',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const;
  return {
    name: 'spotlight',
    description:
      'One screenshot with a loupe over one detail: the detail enlarged in place, the rest of the picture dimmed, and the explanation beside it.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'package-owned-spotlight',
    },
    sanitizer: {
      tagName: 'figure',
      className: 'semantic-spotlight',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

interface SpotlightSubject {
  readonly images: number;
  readonly pictureFirst: boolean;
  readonly explanation: boolean;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/** Картинка первой и одна, пояснение после неё: лупа без слов — украшение, слова без детали — подпись. */
const spotlightRules = declareAuthoredRules<SpotlightSubject>({
  subject: 'spotlight',
  rules: [
    {
      id: 'one-picture-first',
      check: ({ images, pictureFirst, fail }) =>
        images === 1 && pictureFirst
          ? undefined
          : fail(
              `spotlight opens with exactly one Markdown image, alone in its paragraph; this one has ${images} image(s)${images === 1 ? ' not in the first paragraph' : ''}.`,
              'Put the screenshot first, as ![what it shows](file.png) on its own line, and the explanation after it.',
            ),
    },
    {
      id: 'explanation',
      check: ({ explanation, fail }) =>
        explanation
          ? undefined
          : fail(
              'spotlight explains the detail beside the picture, and this one has no explanation.',
              'Write what the reader should see in the detail after the image.',
            ),
    },
  ],
});

function countImages(node: unknown): number {
  if (!isTraversableNode(node)) return 0;
  return (
    (node.type === 'image' ? 1 : 0) +
    (node.children ?? []).reduce((sum, child) => sum + countImages(child), 0)
  );
}

function validateSpotlight(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const children = (node.children ?? []).filter(isTraversableNode);
  const [first, ...rest] = children;
  const firstParts = (first?.children ?? []).filter(
    (part) => part.type !== 'text' || String(part.value ?? '').trim() !== '',
  );
  const found: AgenticReportError[] = [];
  const outcome = runAuthoredRules(
    spotlightRules,
    {
      images: children.reduce((sum, child) => sum + countImages(child), 0),
      pictureFirst:
        first?.type === 'paragraph' && firstParts.length === 1 && firstParts[0]?.type === 'image',
      explanation: rest.length > 0,
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
    },
    found,
  );
  context.report(found);
  return outcome;
}

/**
 * The picture stays the one the reader's assistive technology names; the loupe shows a copy of it,
 * hidden from assistive technology. A picture used twice is embedded once in a single file.
 */
function enhanceSpotlight(node: Element): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const x = Number(takeStringProperty(node, 'dataX') ?? '50');
  const y = Number(takeStringProperty(node, 'dataY') ?? '50');
  const zoom = Number(takeStringProperty(node, 'dataZoom') ?? String(SPOTLIGHT_ZOOM.default));
  const elements = node.children.filter((child): child is Element => child.type === 'element');
  const [paragraph, ...explanation] = elements;
  const image = paragraph?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'img',
  );
  if (paragraph === undefined || image === undefined) return;
  const copy: Element = {
    type: 'element',
    tagName: 'img',
    properties: { ...image.properties, alt: '', dataSpotlightCopy: '' },
    children: [],
  };
  node.properties.style = `--spot-x: ${x}; --spot-y: ${y}; --spot-zoom: ${zoom}`;
  node.properties.dataSpotlight = '';
  const decoration = (className: string, children: ElementContent[] = []): Element => ({
    type: 'element',
    tagName: 'span',
    properties: { className: [className], ariaHidden: 'true' },
    children,
  });
  node.children = [
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['spotlight-stage'] },
      children: [image, decoration('spotlight-loupe', [copy]), decoration('spotlight-ring')],
    },
    {
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['spotlight-note'] },
      children: [...(title === undefined ? [] : [semanticTitle(title)]), ...explanation],
    },
  ];
}

export const spotlight = defineBlock({
  definition: spotlightDefinition(),
  validate: validateSpotlight,
  enhance: enhanceSpotlight,
  feature: 'spotlight',
  staticEquivalent:
    'The screenshot with the loupe over its detail and the rest dimmed, the explanation beside it; printed the same way.',
  examples: [
    ':::spotlight{title="The cache switch" x="72" y="38" zoom="2.5"}\n![Settings with the cache switch on](before.png)\n\nThe switch turns the build cache on for every branch.\n:::\n',
  ],
});
