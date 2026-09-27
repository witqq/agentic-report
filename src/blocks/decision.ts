import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { MAX_REVIEW_RESPONSES } from '../review/contract.js';
import {
  booleanAttribute,
  identityAttribute,
  optionalIdentityAttribute,
  requiredTitleAttribute,
  textAttribute,
  titleAttribute,
} from './definitions.js';
import {
  type BlockAttributeValues,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { hastText, stringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/**
 * The typed review components: a decision with its options and a checklist with its items. Both
 * are validated by one check, because they answer the same questions about their children.
 */

function decisionDefinition(): DirectiveDefinition & { readonly name: 'decision' } {
  const attributes = [
    titleAttribute,
    optionalIdentityAttribute('id', 'Stable identity required when decision options are authored.'),
    booleanAttribute('required', 'Marks this decision as required in the static document.', false),
  ] as const;
  return {
    name: 'decision',
    description:
      'Static Markdown decision or typed decision containing decision-option directives.',
    forms: ['container'],
    attributes,
    children: 'decision-option-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-decision',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function decisionOptionDefinition(): DirectiveDefinition & { readonly name: 'decision-option' } {
  const attributes = [
    identityAttribute('id', 'Stable option identity.'),
    textAttribute('label', 'Visible option label.', true),
  ] as const;
  return {
    name: 'decision-option',
    description: 'One labelled option inside a typed decision.',
    forms: ['leaf'],
    attributes,
    children: 'label-or-generated-label',
    placement: { requiredParent: 'decision' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-decision-option',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function checklistDefinition(): DirectiveDefinition & { readonly name: 'checklist' } {
  const attributes = [
    requiredTitleAttribute(),
    identityAttribute('id', 'Stable checklist identity.'),
  ] as const;
  return {
    name: 'checklist',
    description: 'Static structured checklist containing stable check-item directives.',
    forms: ['container'],
    attributes,
    children: 'check-item-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-checklist',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function checkItemDefinition(): DirectiveDefinition & { readonly name: 'check-item' } {
  const attributes = [
    identityAttribute('id', 'Stable checklist item identity.'),
    textAttribute('label', 'Visible checklist item label.', true),
    booleanAttribute('required', 'Marks this item as required in the static document.', false),
  ] as const;
  return {
    name: 'check-item',
    description: 'One labelled required or optional checklist item.',
    forms: ['leaf'],
    attributes,
    children: 'label-or-generated-label',
    placement: { requiredParent: 'checklist' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-check-item',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

interface ReviewComponentSubject {
  readonly node: DirectiveNode;
  readonly childName: string;
  readonly children: readonly DirectiveNode[];
  readonly values: BlockAttributeValues;
  readonly childValues: (child: DirectiveNode) => BlockAttributeValues;
  readonly placement: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
  readonly attribute: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
}

/**
 * The rules of one typed review component. Child composition, size, identity and child uniqueness
 * are separate questions about the same component; only the ones that read an accepted child list
 * say so through `dependsOn`.
 */
const reviewComponentRules = declareAuthoredRules<ReviewComponentSubject>({
  subject: 'decision|checklist',
  rules: [
    {
      id: 'children-not-mixed',
      check: ({ node, childName, children, placement }) =>
        (node.children ?? []).length === children.length
          ? undefined
          : placement(
              node,
              `${node.name} cannot mix Markdown content with ${childName} children.`,
              node.name === 'decision'
                ? 'Use Markdown-only legacy decision content or direct decision-option children, not both.'
                : 'Use only direct check-item children inside checklist.',
            ),
    },
    {
      id: 'child-limit',
      check: ({ node, children, placement }) =>
        children.length > MAX_REVIEW_RESPONSES
          ? placement(
              node,
              `${node.name} exceeds the ${MAX_REVIEW_RESPONSES}-child review limit.`,
              `Split this ${node.name} into smaller components.`,
            )
          : undefined,
    },
    {
      id: 'stable-decision-id',
      check: ({ node, values, attribute }) =>
        node.name === 'decision' && typeof values.id !== 'string'
          ? attribute(
              node,
              'A typed decision requires a stable id.',
              'Add id="..." to the decision or remove its decision-option children.',
            )
          : undefined,
    },
    {
      id: 'child-present',
      check: ({ node, childName, children, placement }) =>
        children.length === 0
          ? placement(
              node,
              `${node.name} must contain at least one ${childName}.`,
              `Add a ${childName} text directive directly inside ${node.name}.`,
            )
          : undefined,
    },
    {
      // Child ids are read against an accepted child list: with the composition refused, the list is
      // not the author's own and duplicate ids inside it say nothing.
      id: 'unique-child-ids',
      dependsOn: ['children-not-mixed', 'child-present'],
      check: ({ node, children, childValues, attribute }) => {
        const seen = new Set<string>();
        const found: AgenticReportError[] = [];
        for (const child of children) {
          const id = String(childValues(child).id ?? '');
          if (seen.has(id)) {
            found.push(
              attribute(
                child,
                `${node.name} child id is duplicated: ${id}.`,
                `Use a unique id inside this ${node.name}.`,
              ),
            );
            continue;
          }
          seen.add(id);
        }
        return found;
      },
    },
  ],
});

function validateReviewComponent(
  node: DirectiveNode,
  context: BlockValidationContext,
): BlockVerdict {
  const childName = node.name === 'decision' ? 'decision-option' : 'check-item';
  const children = (node.children ?? []).filter(
    (child): child is DirectiveNode => isDirectiveNode(child) && child.name === childName,
  );
  // A decision without typed children is ordinary Markdown content and none of these rules apply.
  if (node.name === 'decision' && children.length === 0) return 'accepted';
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    reviewComponentRules,
    {
      node,
      childName,
      children,
      values: context.attributes(node) ?? {},
      childValues: (child) => context.attributes(child) ?? {},
      placement: (target, message, remediation) =>
        context.violation(target, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
      attribute: (target, message, remediation) =>
        context.violation(target, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
    },
    found,
  );
  context.report(found);
  return found.length === 0 ? 'accepted' : 'refused';
}

/** Вариант решения и пункт списка несут подпись атрибутом: без текста читатель видел бы пустой блок. */
function fillLabel(node: Element): undefined {
  const label = stringProperty(node, 'dataLabel');
  if (label !== undefined && hastText(node).trim() === '')
    node.children = [{ type: 'text', value: label }];
  return undefined;
}

export const decision = defineBlock({
  definition: decisionDefinition(),
  validate: validateReviewComponent,
  styles: 'package',
  staticEquivalent: 'The decision and its options as a titled list, nothing preselected.',
  examples: [
    ':::decision{title="Ship it?" id="ship" required=true}\n::decision-option{id="yes" label="Yes"}\n::decision-option{id="no" label="No"}\n:::\n',
  ],
});

export const decisionOption = defineBlock({
  definition: decisionOptionDefinition(),
  prepare: fillLabel,
  styles: 'package',
  staticEquivalent: 'One option of the decision, named by its label.',
  examples: [
    ':::decision{title="Ship it?" id="ship"}\n::decision-option{id="yes" label="Yes"}\n:::\n',
  ],
});

export const checklist = defineBlock({
  definition: checklistDefinition(),
  validate: validateReviewComponent,
  styles: 'package',
  staticEquivalent: 'A titled list of items, each marked required or optional in words.',
  examples: [
    ':::checklist{title="Before release" id="release"}\n::check-item{id="tests" label="Tests pass" required=true}\n::check-item{id="notes" label="Notes written"}\n:::\n',
  ],
});

export const checkItem = defineBlock({
  definition: checkItemDefinition(),
  prepare: fillLabel,
  styles: 'package',
  staticEquivalent: 'One item of the checklist, named by its label.',
  examples: [
    ':::checklist{title="Before release" id="release"}\n::check-item{id="tests" label="Tests pass"}\n:::\n',
  ],
});
