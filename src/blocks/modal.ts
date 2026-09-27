import type { Element } from 'hast';

import { interactiveContainer, requiredTitleAttribute, textAttribute } from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { actionButton, semanticTitle, takeStringProperty } from './hast.js';

function enhanceModal(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? strings.dialog;
  const trigger = takeStringProperty(node, 'dataTrigger') ?? strings.openDialog;
  const dialogId = allocateId(`modal-${instance}`);
  const titleId = allocateId(`${dialogId}-title`);
  const content = node.children;
  node.properties.dataModal = '';
  node.children = [
    actionButton(trigger, { dataModalOpen: dialogId, ariaHasPopup: 'dialog' }, 'window'),
    {
      type: 'element',
      tagName: 'dialog',
      properties: { id: dialogId, ariaLabelledBy: [titleId], dataModalDialog: '' },
      children: [
        semanticTitle(title, titleId),
        ...content,
        actionButton(strings.close, { dataModalClose: '' }, 'x'),
      ],
    },
  ];
}

export const modal = defineBlock({
  definition: interactiveContainer('modal', 'Modal dialog opened by a package-owned control.', {
    attributes: [
      requiredTitleAttribute(),
      textAttribute('trigger', 'Visible dialog trigger label.', false, 'Open dialog'),
    ],
    runtime: 'package-owned-modal',
  }),
  localizedDefaults: ['trigger'],
  enhance: enhanceModal,
  styles: 'package',
  staticEquivalent:
    'The dialog content printed in place under its title; on screen a button opens it.',
  examples: [':::modal{title="Checklist" trigger="Open the checklist"}\nEvery gate passed.\n:::\n'],
});
