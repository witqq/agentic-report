import type { Element } from 'hast';

import { interactiveContainer, requiredTitleAttribute, textAttribute } from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { actionButton, semanticTitle, takeStringProperty } from './hast.js';

function enhancePopover(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? strings.details;
  const trigger = takeStringProperty(node, 'dataTrigger') ?? strings.showDetails;
  const panelId = allocateId(`popover-${instance}`);
  const titleId = allocateId(`${panelId}-title`);
  const content = node.children;
  node.properties.dataPopover = '';
  node.children = [
    actionButton(
      trigger,
      {
        dataPopoverTrigger: '',
        ariaControls: [panelId],
        ariaExpanded: 'false',
        ariaHasPopup: 'dialog',
      },
      'info',
    ),
    {
      type: 'element',
      tagName: 'div',
      properties: {
        id: panelId,
        role: 'dialog',
        ariaLabelledBy: [titleId],
        hidden: '',
        dataPopoverPanel: '',
      },
      children: [semanticTitle(title, titleId), ...content],
    },
  ];
}

export const popover = defineBlock({
  definition: interactiveContainer(
    'popover',
    'Non-modal contextual panel opened by a package-owned control.',
    {
      attributes: [
        requiredTitleAttribute(),
        textAttribute('trigger', 'Visible popover trigger label.', false, 'Show details'),
      ],
      runtime: 'package-owned-popover',
    },
  ),
  localizedDefaults: ['trigger'],
  enhance: enhancePopover,
  styles: 'package',
  staticEquivalent:
    'The panel content printed in place under its title; on screen a button shows it.',
  examples: [':::popover{title="Context"}\nMeasured on the staging cluster.\n:::\n'],
});
