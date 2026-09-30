import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { enumAttribute, optionalIdentityAttribute, titleAttribute } from './definitions.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { semanticTitle, stringProperty, takeStringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';
import { numberSlide } from './slide-steps.js';

/**
 * A slide deck inside an ordinary page: a slot of slides in the document column that the reader pages
 * through and can open on the whole screen. Each deck has its own controller; the slides are part of
 * the page, built with it, and without the runtime or in print they follow one another.
 */

/** Beyond this a deck is a presentation page (`layout: slides`), not a block of a document. */
const MAX_SLIDES = 60;

const DECK_EXAMPLE =
  ':::::deck{title="Quarter in review"}\n::::slide\n## Revenue grew 18%\nThe quarter in one line.\n::::\n\n::::slide{transition="push"}\n## Three reasons\n\n:::appear\nNew customers.\n:::\n\n:::notes\nMention churn.\n:::\n::::\n:::::\n';

function deckDefinition(): DirectiveDefinition & { readonly name: 'deck' } {
  const attributes = [
    titleAttribute,
    optionalIdentityAttribute(
      'id',
      'Optional anchor: #id opens the deck, #id/3 opens its third slide.',
    ),
  ] as const;
  return {
    name: 'deck',
    description:
      'A slide deck inside the page: slide directives shown one at a time in a 16:9 slot of the column, paged with buttons and keys, and opened on the whole screen; without the runtime and in print the slides follow one another.',
    forms: ['container'],
    attributes,
    children: 'slide-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-slides' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-deck',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function slideDefinition(): DirectiveDefinition & { readonly name: 'slide' } {
  const attributes = [
    enumAttribute(
      'transition',
      'How the slide arrives: fade, push from the side, wipe from the start edge, zoom in, or none.',
      ['fade', 'push', 'wipe', 'zoom', 'none'],
      'fade',
    ),
  ] as const;
  return {
    name: 'slide',
    description: 'One slide of a deck: Markdown with optional appear steps and speaker notes.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: { requiredParent: 'deck' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-slides' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-slide',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

/** A deck holds slides and nothing else, from one to sixty. */
function validateDeck(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const children = node.children ?? [];
  const stray = children.find((child) => !isDirectiveNode(child) || child.name !== 'slide');
  if (stray !== undefined) {
    context.report(
      context.violation(
        isDirectiveNode(stray) ? stray : node,
        'INVALID_DIRECTIVE_PLACEMENT',
        'A deck holds only slide directives; content between slides has no slide to show it.',
        'Put this content inside a :::slide of the deck, or move it before or after the deck.',
      ),
    );
    return 'refused';
  }
  if (children.length === 0 || children.length > MAX_SLIDES) {
    context.report(
      context.violation(
        node,
        'INVALID_DIRECTIVE_PLACEMENT',
        `A deck holds from 1 to ${MAX_SLIDES} slides; this one has ${children.length}.`,
        children.length === 0
          ? 'Add :::slide directives inside the deck.'
          : 'Split the deck, or make the page a presentation with layout: slides.',
      ),
    );
    return 'refused';
  }
  return 'accepted';
}

/**
 * The deck: its heading, a stage that holds the slides, and on each slide its place in the deck, the
 * steps of its `appear` blocks and its transition. The runtime adds the controls.
 */
function enhanceDeck(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const authoredId = takeStringProperty(node, 'dataId');
  node.properties.id = allocateId(authoredId ?? `deck-${instance}`);
  node.properties.dataDeck = '';
  const slides = node.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'slide',
  );
  slides.forEach((slide, index) => {
    numberSlide(slide, index);
    slide.properties.dataSlideTransition = stringProperty(slide, 'dataTransition') ?? 'fade';
    delete slide.properties.dataTransition;
    slide.properties.ariaRoledescription = strings.slide;
    slide.properties.ariaLabel = strings.slideCounter(index + 1, slides.length);
  });
  const titleId =
    title === undefined ? undefined : allocateId(`${String(node.properties.id)}-title`);
  if (titleId === undefined) node.properties.ariaLabel = strings.slides;
  else node.properties.ariaLabelledBy = [titleId];
  node.children = [
    ...(title === undefined || titleId === undefined ? [] : [semanticTitle(title, titleId)]),
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['deck-stage'], dataDeckStage: '' },
      children: slides,
    },
  ];
}

export const deck = defineBlock({
  definition: deckDefinition(),
  validate: validateDeck,
  enhance: enhanceDeck,
  feature: 'deck',
  staticEquivalent:
    'The slides one after another, each a 16:9 card with every step shown; speaker notes stay hidden.',
  examples: [DECK_EXAMPLE],
});

/** The deck enhancement numbers and labels its slides, so a slide has no enhancement of its own. */
export const slide = defineBlock({
  definition: slideDefinition(),
  feature: 'deck',
  staticEquivalent: 'One slide of the deck as a 16:9 card.',
  examples: [DECK_EXAMPLE],
});
