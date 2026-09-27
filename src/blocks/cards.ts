import type { Element } from 'hast';

import { CARD_STATUSES, type DirectiveDefinition } from '../authoring/directive-contract.js';
import type { PackageStrings } from '../localization.js';
import { decorativeIcon } from '../render/icons.js';
import { container, enumAttribute, optionalLinkAttribute, titleAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { whenAttribute } from './page-state.js';
import { prependDirectiveTitle, stringProperty } from './hast.js';
import { type DirectiveNode, isTraversableNode } from './mdast.js';

function cardDefinition(): DirectiveDefinition & { readonly name: 'card' } {
  const attributes = [
    titleAttribute,
    optionalLinkAttribute(),
    enumAttribute(
      'status',
      'State label shown on the card as text and a marker: good, watch or risk.',
      CARD_STATUSES,
      'none',
    ),
    whenAttribute(
      'Page state that lights this card, such as a station that lights when the reader reaches its chapter; until then the card is dimmed. Without motion and in print the card is lit.',
    ),
  ] as const;
  return {
    name: 'card',
    description:
      'One semantic card containing Markdown, optionally promoted to one safe whole-card link.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: { requiredParent: 'cards', preferredParent: 'cards' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'article',
      className: 'semantic-card',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

/** A card promoted to one link cannot hold another: a link inside a link is not navigable. */
function validateCard(card: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const href = context.attributes(card)?.href;
  if (typeof href !== 'string') return 'accepted';
  const pending = [...(card.children ?? [])];
  while (pending.length > 0) {
    const child = pending.pop();
    if (
      typeof child === 'object' &&
      child !== null &&
      'type' in child &&
      (child.type === 'link' || child.type === 'linkReference')
    ) {
      context.report(
        context.violation(
          card,
          'INVALID_DIRECTIVE_PLACEMENT',
          'A linked card cannot contain another link.',
          'Remove the nested Markdown link or remove the card href.',
        ),
      );
      return 'refused';
    }
    if (isTraversableNode(child)) pending.push(...(child.children ?? []));
  }
  return 'accepted';
}

function enhanceCard(node: Element, context: { readonly strings: PackageStrings }): void {
  const status = stringProperty(node, 'dataStatus');
  if (status === 'good' || status === 'watch' || status === 'risk') {
    // Состояние читается словом, а цвет метки только повторяет его.
    node.children.unshift({
      type: 'element',
      tagName: 'p',
      properties: { className: ['semantic-status'] },
      children: [{ type: 'text', value: context.strings.cardStatus[status] }],
    });
  }
  const href = stringProperty(node, 'dataHref');
  if (href === undefined) {
    prependDirectiveTitle(node);
    return;
  }
  node.tagName = 'a';
  node.properties.href = href;
  node.properties.dataLinkedCard = '';
  prependDirectiveTitle(node);
  node.children.push({
    type: 'element',
    tagName: 'span',
    properties: { className: ['semantic-card-link-signifier'], ariaHidden: 'true' },
    children: [decorativeIcon('arrow-right')],
  });
}

export const cards = defineBlock({
  definition: container('cards', 'Responsive grid, normally containing card directives.', {
    handoffs: ['semantic-document'],
  }),
  styles: 'package',
  staticEquivalent:
    'A titled grid of cards that wraps to one column on narrow screens and in print.',
  examples: ['::::cards{title="Options"}\n:::card{title="One"}\nFirst.\n:::\n::::\n'],
});

export const card = defineBlock({
  definition: cardDefinition(),
  validate: validateCard,
  enhance: enhanceCard,
  styles: 'package',
  staticEquivalent:
    'A bordered card with its status in words; a linked card is one ordinary link without hover motion.',
  examples: [
    '::::cards{title="Services"}\n:::card{title="API" href="https://example.com/api" status="good"}\nServing.\n:::\n::::\n',
  ],
});
