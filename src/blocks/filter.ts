import type { Element } from 'hast';

import { decorativeIcon } from '../render/icons.js';
import { interactiveContainer, textAttribute, titleAttribute } from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { semanticTitle, takeStringProperty } from './hast.js';

function enhanceFilter(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const placeholder = takeStringProperty(node, 'dataPlaceholder') ?? strings.filterItems;
  const inputId = allocateId(`filter-${instance}`);
  node.properties.dataFilter = '';
  node.children = [
    ...(title === undefined ? [] : [semanticTitle(title)]),
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['semantic-filter-controls'] },
      children: [
        {
          type: 'element',
          tagName: 'label',
          properties: { htmlFor: [inputId] },
          children: [decorativeIcon('search'), { type: 'text', value: strings.filter }],
        },
        {
          type: 'element',
          tagName: 'input',
          properties: { id: inputId, type: 'search', placeholder, dataFilterInput: '' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'output',
          properties: { ariaLive: 'polite', dataFilterCount: '' },
          children: [],
        },
      ],
    },
    ...node.children,
  ];
}

export const filter = defineBlock({
  definition: interactiveContainer('filter', 'Client-side text filter for authored list items.', {
    attributes: [
      titleAttribute,
      textAttribute('placeholder', 'Search-field placeholder.', false, 'Filter items'),
    ],
    runtime: 'package-owned-filter',
  }),
  localizedDefaults: ['placeholder'],
  enhance: enhanceFilter,
  feature: 'filter',
  staticEquivalent:
    'The full list; the search field needs the browser and filters nothing in print.',
  examples: [':::filter{title="Services"}\n- API\n- Worker\n- Scheduler\n:::\n'],
});
