import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { enumAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';

function appearDefinition(): DirectiveDefinition & { readonly name: 'appear' } {
  const attributes = [
    enumAttribute(
      'effect',
      'How the content arrives on its step: rising, fading, wiping in from the start edge, or popping.',
      ['rise', 'fade', 'wipe', 'pop'],
      'rise',
    ),
  ] as const;
  return {
    name: 'appear',
    description:
      'Markdown that appears on the next step of its slide in a presentation (layout slides); on any other page, and under reduced motion or in print, it is simply shown.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-slides' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-appear',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

/** The section block numbers the steps of each slide, because slides are its sections. */
export const appear = defineBlock({
  definition: appearDefinition(),
  feature: 'slides',
  staticEquivalent: 'Content shown in place from the start, as if every step had been taken.',
  examples: [
    '::::section{title="Slide"}\n:::appear{effect="fade"}\nShown on the next step.\n:::\n::::\n',
  ],
});
