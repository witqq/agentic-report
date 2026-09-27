import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { decorativeIcon } from '../render/icons.js';
import { enumAttribute, linkAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { takeStringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

function actionsDefinition(): DirectiveDefinition {
  const attributes = [
    enumAttribute(
      'placement',
      'Responsive placement for one action inventory.',
      ['auto', 'edge', 'inline', 'bottom'],
      'auto',
    ),
  ] as const;
  return {
    name: 'actions',
    description: 'Responsive group containing ordinary action links.',
    forms: ['container'],
    attributes,
    children: 'action-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-actions',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function actionDefinition(): DirectiveDefinition {
  const attributes = [
    linkAttribute(),
    enumAttribute(
      'kind',
      'Package-owned action emphasis.',
      ['primary', 'secondary', 'quiet'],
      'primary',
    ),
    enumAttribute('effect', 'Rare package-owned action interaction.', ['none', 'magnetic'], 'none'),
  ] as const;
  return {
    name: 'action',
    description: 'Ordinary safe link inside an actions group.',
    forms: ['leaf'],
    attributes,
    incompatibleCombinations: [
      {
        attributes: { kind: ['secondary', 'quiet'], effect: ['magnetic'] },
        message: 'Magnetic action treatment is available only for a primary action.',
        remediation: 'Use kind="primary" or effect="none".',
      },
    ],
    children: 'label-or-generated-label',
    placement: { requiredParent: 'actions' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'a',
      className: 'semantic-action',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

interface ActionGroupSubject {
  readonly node: DirectiveNode;
  readonly placement: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
}

/** The single rule of an action group, declared as data like every other rule of this phase. */
const actionGroupRules = declareAuthoredRules<ActionGroupSubject>({
  subject: 'actions',
  rules: [
    {
      id: 'action-children-only',
      check: ({ node, placement }) => {
        const children = node.children ?? [];
        const onlyActions =
          children.length > 0 &&
          children.every((child) => isDirectiveNode(child) && child.name === 'action');
        return onlyActions
          ? undefined
          : placement(
              node,
              'actions accepts one or more action directives as direct children.',
              'Move prose outside actions and add links with ::action[Label]{href="..."}.',
            );
      },
    },
  ],
});

function validateActions(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    actionGroupRules,
    {
      node,
      placement: (target, message, remediation) =>
        context.violation(target, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
    },
    found,
  );
  context.report(found);
  return found.length === 0 ? 'accepted' : 'refused';
}

/** An action is a link a reader must be able to name, so its label is part of its grammar. */
function actionLabelViolation(node: DirectiveNode): AgenticReportError | undefined {
  const label = (node.children ?? [])
    .map((child) =>
      typeof child === 'object' && child !== null && 'value' in child
        ? String((child as { readonly value?: unknown }).value ?? '')
        : '',
    )
    .join('')
    .trim();
  if (label.length === 0) {
    return new AgenticReportError({
      level: 'error',
      code: 'DIRECTIVE_LABEL_REQUIRED',
      message: 'action requires a visible label.',
      remediation: 'Use ::action[Visible label]{href="..."}.',
    });
  }
  return undefined;
}

function enhanceAction(node: Element): void {
  const href = takeStringProperty(node, 'dataHref');
  if (href === undefined) throw new Error('Validated action is missing its href.');
  node.properties.href = href;
  node.children.unshift(decorativeIcon('arrow-right'));
}

export const actions = defineBlock({
  definition: actionsDefinition(),
  validate: validateActions,
  styles: 'package',
  staticEquivalent: 'A row of ordinary links that wraps on narrow screens.',
  examples: [
    ':::actions\n::action[Read the report]{href="https://example.com/report"}\n::action[Source]{href="https://example.com" kind="secondary"}\n:::\n',
  ],
});

export const action = defineBlock({
  definition: actionDefinition(),
  nodeRules: [
    {
      id: 'action-label',
      dependsOn: ['registered-name'],
      check: ({ node }) => actionLabelViolation(node),
    },
  ],
  enhance: enhanceAction,
  styles: 'package',
  staticEquivalent: 'An ordinary link with its label; the magnetic pull is off.',
  examples: [
    ':::actions\n::action[Start]{href="https://example.com/start" kind="primary" effect="magnetic"}\n:::\n',
  ],
});
