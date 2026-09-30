import type { Element } from 'hast';

import {
  enumAttribute,
  interactiveContainer,
  textAttribute,
  titleAttribute,
} from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { semanticTitle, takeStringProperty } from './hast.js';

function enhanceTabs(node: Element, context: BlockEnhancementContext): void {
  const { strings, allocateId } = context;
  const instance = context.nextInstance();
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const titleId = title === undefined ? undefined : allocateId(`tabs-${instance}-title`);
  const panels = node.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'tab',
  );
  const buttons: Element[] = [];
  panels.forEach((panel, index) => {
    const label = takeStringProperty(panel, 'dataLabel') ?? strings.tab(index + 1);
    const tabId = allocateId(`tabs-${instance}-tab-${index + 1}`);
    const panelId = allocateId(`tabs-${instance}-panel-${index + 1}`);
    panel.properties.id = panelId;
    panel.properties.role = 'tabpanel';
    panel.properties.ariaLabelledBy = [tabId];
    panel.properties.tabIndex = 0;
    panel.properties.dataTabPanel = '';
    if (index !== 0) panel.properties.hidden = '';
    buttons.push({
      type: 'element',
      tagName: 'button',
      properties: {
        type: 'button',
        id: tabId,
        role: 'tab',
        ariaControls: [panelId],
        ariaSelected: index === 0 ? 'true' : 'false',
        tabIndex: index === 0 ? 0 : -1,
        dataTab: '',
      },
      children: [{ type: 'text', value: label }],
    });
  });
  node.properties.dataTabs = '';
  const vertical = node.properties.dataOrientation === 'vertical';
  if (!vertical) delete node.properties.dataOrientation;
  node.children = [
    ...(title === undefined || titleId === undefined ? [] : [semanticTitle(title, titleId)]),
    {
      type: 'element',
      tagName: 'div',
      properties: {
        role: 'tablist',
        ...(titleId === undefined
          ? { ariaLabel: strings.contentSections }
          : { ariaLabelledBy: [titleId] }),
        className: ['semantic-tab-list'],
        // Вертикальный список стоит сбоку только на широком экране; рантайм сверяет ориентацию с раскладкой.
        ...(vertical ? { ariaOrientation: 'vertical' } : {}),
      },
      children: buttons,
    },
    ...node.children,
  ];
}

const VERTICAL_TABS_EXAMPLE =
  '::::tabs{title="Scenarios" orientation="vertical"}\n:::tab{label="First run"}\nThe page is built from a brief.\n:::\n:::tab{label="A change"}\nOne chapter is rebuilt.\n:::\n::::\n';

const TABS_EXAMPLE =
  '::::tabs{title="Views"}\n:::tab{label="Summary"}\nShort.\n:::\n:::tab{label="Detail"}\nLong.\n:::\n::::\n';

export const tabs = defineBlock({
  definition: interactiveContainer('tabs', 'Keyboard-operable group of tab panels.', {
    attributes: [
      titleAttribute,
      enumAttribute(
        'orientation',
        'horizontal: the tab list above the panels. vertical: on a wide screen the tab list stands in a column beside the panels (arrow keys up and down move along it); on a narrow screen it returns above them.',
        ['horizontal', 'vertical'],
        'horizontal',
      ),
    ],
    children: 'markdown-and-tab-directives',
    runtime: 'package-owned-tabs',
  }),
  enhance: enhanceTabs,
  feature: 'tabs',
  staticEquivalent: 'The first panel shown under its tab list; print shows every panel in order.',
  examples: [TABS_EXAMPLE, VERTICAL_TABS_EXAMPLE],
});

/** The tabs enhancement labels and wires its panels, so a panel has no enhancement of its own. */
export const tab = defineBlock({
  definition: interactiveContainer('tab', 'One labelled panel inside tabs.', {
    attributes: [textAttribute('label', 'Visible tab label.', true)],
    requiredParent: 'tabs',
    runtime: 'package-owned-tabs',
  }),
  feature: 'tabs',
  staticEquivalent: 'One labelled panel of content.',
  examples: [TABS_EXAMPLE],
});
