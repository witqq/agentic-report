import type { Element } from 'hast';

import {
  enumAttribute,
  interactiveContainer,
  textAttribute,
  titleAttribute,
} from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { actionButton, semanticTitle, takeStringProperty } from './hast.js';

function enhanceToggle(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const label = takeStringProperty(node, 'dataLabel') ?? strings.toggleContent;
  const active = takeStringProperty(node, 'dataDefault') === 'on';
  const panelId = allocateId(`toggle-${instance}`);
  const content = node.children;
  node.properties.dataToggle = '';
  node.children = [
    ...(title === undefined ? [] : [semanticTitle(title)]),
    actionButton(
      label,
      {
        role: 'switch',
        ariaChecked: active ? 'true' : 'false',
        ariaControls: [panelId],
        dataToggleControl: '',
      },
      'eye',
    ),
    {
      type: 'element',
      tagName: 'div',
      properties: { id: panelId, dataTogglePanel: '', ...(active ? {} : { hidden: '' }) },
      children: content,
    },
  ];
}

export const toggle = defineBlock({
  definition: interactiveContainer(
    'toggle',
    'Switch controlling visibility of declarative content.',
    {
      attributes: [
        titleAttribute,
        textAttribute('label', 'Visible switch label.', true),
        enumAttribute('default', 'Initial switch state.', ['off', 'on'], 'off'),
      ],
      runtime: 'package-owned-toggle',
    },
  ),
  enhance: enhanceToggle,
  feature: 'toggle',
  staticEquivalent:
    'The switch label with the content in its initial state; print shows the content.',
  examples: [
    ':::toggle{label="Show raw numbers" default="off"}\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n',
  ],
});
