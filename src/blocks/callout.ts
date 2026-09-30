import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { titleAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';
import { takeStringProperty } from './hast.js';

function calloutDefinition(): DirectiveDefinition {
  return {
    name: 'callout',
    description: 'Emphasized finding or notice containing Markdown.',
    forms: ['container'],
    attributes: [
      titleAttribute,
      {
        name: 'kind',
        description: 'Lowercase presentation token.',
        required: false,
        default: 'info',
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: 1,
          maxLength: 32,
          pattern: '^[a-z][a-z0-9-]{0,31}$',
        },
        renderProperty: 'dataKind',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
    ],
    children: 'markdown',
    placement: {},
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'none',
    },
    sanitizer: {
      tagName: 'aside',
      className: 'semantic-callout',
      properties: ['dataSemantic', 'dataDirectiveTitle', 'dataKind'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

/** A callout title is a lead-in line of the notice, not a heading of the outline. */
function enhanceCallout(node: Element): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  if (title === undefined) return;
  node.children.unshift({
    type: 'element',
    tagName: 'p',
    properties: { className: ['semantic-title'] },
    children: [{ type: 'text', value: title }],
  });
}

export const callout = defineBlock({
  definition: calloutDefinition(),
  enhance: enhanceCallout,
  feature: 'callout',
  staticEquivalent: 'A bordered notice with its title line, the same on screen and in print.',
  examples: [':::callout{title="Watch" kind="warning"}\nThe cache is cold after deploys.\n:::\n'],
});
