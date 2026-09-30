import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { PackageStrings } from '../localization.js';
import { pathAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';

function assetDefinition(): DirectiveDefinition {
  return {
    name: 'asset',
    description: 'Download link to a confined local file.',
    forms: ['text', 'leaf'],
    attributes: [pathAttribute('src', 'Relative local resource path.', 'dataLocalAsset')],
    children: 'label-or-generated-label',
    placement: {},
    behavior: {
      renderer: 'download-asset',
      resource: 'download',
      runtime: 'none',
    },
    sanitizer: {
      tagName: 'a',
      className: 'semantic-asset',
      properties: ['dataLocalAsset', 'download'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: true },
    handoffs: ['resource-graph'],
  };
}

/** A download without an authored label is named after its file. */
function enhanceAsset(node: Element, context: { readonly strings: PackageStrings }): void {
  const reference = node.properties.dataLocalAsset;
  if (node.tagName !== 'a' || typeof reference !== 'string' || node.children.length !== 0) return;
  node.children.push({ type: 'text', value: context.strings.download(assetLabel(reference)) });
}

function assetLabel(reference: string): string {
  const basename = reference.split(/[\\/]/).at(-1) ?? reference;
  try {
    return decodeURIComponent(basename);
  } catch {
    return basename;
  }
}

export const asset = defineBlock({
  definition: assetDefinition(),
  enhance: enhanceAsset,
  feature: 'core',
  staticEquivalent: 'A link to the file; in print, its label names the file.',
  examples: ['Download :asset[the data]{src="data.json"} for the raw numbers.\n'],
});
