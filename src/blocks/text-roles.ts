import type { Element, Root as HastRoot } from 'hast';
import { visit } from 'unist-util-visit';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { defineBlock } from './define-block.js';
import { hasClassName } from './hast.js';

/**
 * Typographic roles an author marks in running text; their look is the theme's. The lead of a section
 * is `lead` (section.ts) and the caption face is the theme field `typography.captions`; these three
 * complete the set:
 *
 * - `eyebrow` — a small-caps line above a title in the second accent, the colour themes keep for
 *   eyebrows and kickers;
 * - `muted` — the continuation of a paragraph in the muted text colour, so the first sentence written
 *   before it reads bright: the «bright first sentence, quiet rest» paragraph;
 * - `meta` — a short label set in the mono face: a run number, a version, a timestamp, a file name.
 *
 * None of them changes the words: copying the page gives the text as written.
 */

function textRole(
  name: 'muted' | 'meta',
  description: string,
): DirectiveDefinition & { readonly name: 'muted' | 'meta' } {
  return {
    name,
    description,
    forms: ['text'],
    attributes: [],
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: { tagName: 'span', className: `semantic-${name}`, properties: ['dataSemantic'] },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function eyebrowDefinition(): DirectiveDefinition {
  return {
    name: 'eyebrow',
    description:
      'A short small-caps line above the title that follows it, in the eyebrow colour of the theme; written first in a section, it stands above the section title.',
    forms: ['leaf'],
    attributes: [],
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: { tagName: 'div', className: 'semantic-eyebrow', properties: ['dataSemantic'] },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function enhanceEyebrow(node: Element): void {
  node.tagName = 'p';
}

/**
 * An eyebrow written first in a section follows the title the section generates; it belongs above it.
 * This pass runs before the section passes (the block is listed before `section`), so the opening
 * arrangement reads the section with its title first and the eyebrow ahead of it.
 */
function placeEyebrows(tree: HastRoot): void {
  visit(tree, 'element', (node: Element) => {
    const children = node.children;
    for (let index = 1; index < children.length; index += 1) {
      const child = children[index];
      const previous = children[index - 1];
      if (
        child?.type === 'element' &&
        child.properties.dataSemantic === 'eyebrow' &&
        previous?.type === 'element' &&
        hasClassName(previous, 'semantic-section-title')
      ) {
        children[index - 1] = child;
        children[index] = previous;
      }
    }
  });
}

export const eyebrow = defineBlock({
  definition: eyebrowDefinition(),
  enhance: enhanceEyebrow,
  finalize: placeEyebrows,
  styles: 'package',
  staticEquivalent: 'A small line of capitals above the title, the same in print.',
  examples: [':::section{title="Results"}\n::eyebrow[Stage 7 · data]\n\nThe run passed.\n:::\n'],
});

export const muted = defineBlock({
  definition: textRole(
    'muted',
    'The quiet continuation of a paragraph in the muted text colour; the sentence before it reads bright: **The run passed.** :muted[Two retries, both on the network step.]',
  ),
  styles: 'package',
  staticEquivalent: 'The same words in the muted text colour.',
  examples: ['The run passed. :muted[Two retries, both on the network step.]\n'],
});

export const meta = defineBlock({
  definition: textRole(
    'meta',
    'A short label in the mono face for identifiers and readings: :meta[run 96 · 01:17].',
  ),
  styles: 'package',
  staticEquivalent: 'The same words in the mono face.',
  examples: ['Taken from :meta[run 96 · 01:17] of the nightly flow.\n'],
});
