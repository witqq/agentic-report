import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { booleanAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import type { DirectiveNode } from './mdast.js';

function contentsDefinition(): DirectiveDefinition {
  return {
    name: 'contents',
    description:
      'Generated in-flow links to final primary sections using their exact visible headings.',
    forms: ['leaf'],
    attributes: [
      booleanAttribute(
        'sticky',
        'On a landing: the chapters numbered and held at the edge of a wide screen while the reader scrolls, the current chapter marked; in the flow on a narrow screen and in print.',
        false,
      ),
    ],
    children: 'none',
    placement: { topLevelOnly: true },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'nav',
      className: 'semantic-contents',
      properties: ['dataSemantic', 'dataSticky'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

/**
 * Липкое нумерованное оглавление — приём лендинга: у отчёта оглавление и так стоит сбоку, а у
 * презентации нет прокрутки. На другой раскладке список остаётся в потоке, и сборка предупреждает, что
 * атрибут ничего не делает. Страница без настроек (проверка источника без страницы) не проверяется.
 */
function validateContents(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const layout = context.page.layout;
  if (context.attributes(node)?.sticky !== true || layout === undefined || layout === 'landing')
    return 'accepted';
  context.warn(
    node,
    'STICKY_CONTENTS_OUTSIDE_LANDING',
    `A sticky numbered contents belongs to a landing; on layout: ${layout} it stays in the flow.`,
    'Remove sticky="true": a document already shows its contents beside the text, and a presentation does not scroll.',
  );
  return 'accepted';
}

/** Navigation fills the in-flow contents with the final section headings once the page is enhanced. */
export const contents = defineBlock({
  definition: contentsDefinition(),
  validate: validateContents,
  enhance: (node) => {
    if (node.properties.dataSticky !== 'true') delete node.properties.dataSticky;
  },
  feature: 'contents',
  staticEquivalent: 'A list of links to the sections of the page, printed as a table of contents.',
  examples: [
    '# Page\n\n::contents\n\n::::section{title="First"}\nText.\n::::\n',
    '# Page\n\n::contents{sticky="true"}\n\n::::section{title="First"}\nText.\n::::\n\n::::section{title="Second"}\nText.\n::::\n',
  ],
});
