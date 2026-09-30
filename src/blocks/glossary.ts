import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import {
  enumAttribute,
  glossaryFormsAttribute,
  interactiveContainer,
  keyAttribute,
  textAttribute,
} from './definitions.js';
import { defineBlock } from './define-block.js';

/**
 * The glossary pair. Their checks and enhancement belong to the directive core, because the
 * glossary is document-wide: definitions form the index that term references, annotated code
 * fences, the first-occurrence check and the appendix all read.
 */

function termDefinition(): DirectiveDefinition {
  return {
    name: 'term',
    description:
      'Inline or standalone reference that opens a registered glossary explanation. Prose must carry one for the first occurrence of a registered term in each section; later occurrences of that term in the same section stay ordinary prose.',
    forms: ['leaf', 'text'],
    attributes: [keyAttribute('Key of the glossary definition to reference.')],
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'glossary-reference' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-term',
      properties: ['dataSemantic', 'dataKey'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

export const glossary = defineBlock({
  definition: interactiveContainer(
    'glossary',
    'Reusable glossary definition containing Markdown, optionally moved from the document root or a direct section child into the appendix.',
    {
      attributes: [
        keyAttribute('Stable glossary definition key.'),
        textAttribute('term', 'Canonical glossary identity and explanation title.', true),
        glossaryFormsAttribute(),
        enumAttribute(
          'placement',
          'Definition location in the authored flow or, from the document root or a direct section child, one package-owned reference appendix.',
          ['inline', 'appendix'],
          'inline',
        ),
      ],
      runtime: 'none',
    },
  ),
  feature: 'glossary',
  staticEquivalent:
    'A titled definition in place, or in the glossary appendix at the end of the page.',
  examples: [
    'The :term[release packet]{key="release-packet"} ships weekly.\n\n:::glossary{key="release-packet" term="Release packet"}\nThe bundle of changes that ships together.\n:::\n',
  ],
});

export const term = defineBlock({
  definition: termDefinition(),
  feature: 'popover',
  staticEquivalent:
    'The term as written, linked to its definition; the explanation panel needs the browser.',
  examples: [
    ':::glossary{key="cache" term="Cache"}\nA store of recent answers.\n:::\n\nThe :term{key="cache"} is warm.\n',
  ],
});
