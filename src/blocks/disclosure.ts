import type { Element } from 'hast';

import type { PackageStrings } from '../localization.js';
import { decorativeIcon } from '../render/icons.js';
import { enumAttribute, interactiveContainer, requiredTitleAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';
import { takeStringProperty } from './hast.js';

function enhanceDisclosure(node: Element, context: { readonly strings: PackageStrings }): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? context.strings.details;
  const open = takeStringProperty(node, 'dataOpen') === 'true';
  node.tagName = 'details';
  node.properties.dataDisclosure = '';
  if (open) node.properties.open = true;
  node.children.unshift({
    type: 'element',
    tagName: 'summary',
    properties: { className: ['semantic-disclosure-summary'] },
    children: [decorativeIcon('arrow-down'), { type: 'text', value: title }],
  });
}

export const disclosure = defineBlock({
  definition: interactiveContainer('disclosure', 'Native disclosure with a visible summary.', {
    attributes: [
      requiredTitleAttribute(),
      enumAttribute('open', 'Initial disclosure state.', ['false', 'true'], 'false'),
    ],
    runtime: 'native-disclosure',
  }),
  enhance: enhanceDisclosure,
  styles: 'package',
  staticEquivalent: 'A native details element; its summary stays visible and print shows it open.',
  examples: [':::disclosure{title="Method"}\nWe sampled one week of traffic.\n:::\n'],
});
