import type { Element, ElementContent } from 'hast';

import {
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  FINDING_SEVERITIES,
} from '../authoring/directive-contract.js';
import type { PackageStrings } from '../localization.js';
import { requiredEnumAttribute, requiredTitleAttribute, titleAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';
import {
  prependDirectiveTitle,
  semanticTitle,
  stringProperty,
  takeStringProperty,
} from './hast.js';

function findingsDefinition(): DirectiveDefinition & { readonly name: 'findings' } {
  const attributes = [titleAttribute] as const;
  return {
    name: 'findings',
    description:
      'Review findings in authored order, with a generated count per severity above them.',
    forms: ['container'],
    attributes,
    children: 'finding-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-findings',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function findingDefinition(): DirectiveDefinition & { readonly name: 'finding' } {
  const attributes = [
    requiredEnumAttribute(
      'severity',
      'How much the finding blocks the change; shown as text, not only colour.',
      FINDING_SEVERITIES,
    ),
    requiredTitleAttribute(),
    {
      name: 'location',
      description: 'Where the finding applies, such as a path and line.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
      renderProperty: 'dataLocation',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'finding',
    description: 'One review finding with a severity, a title and Markdown detail.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: { requiredParent: 'findings' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'article',
      className: 'semantic-finding',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

const FINDING_SEVERITY_ORDER = ['blocking', 'major', 'minor', 'note'] as const;
type FindingSeverity = (typeof FINDING_SEVERITY_ORDER)[number];

function findingSeverity(node: Element): FindingSeverity | undefined {
  const value = stringProperty(node, 'dataSeverity');
  return FINDING_SEVERITY_ORDER.find((severity) => severity === value);
}

/** Над находками — сводка: сколько их каждой серьёзности, в порядке от блокирующих. */
function enhanceFindings(node: Element, context: { readonly strings: PackageStrings }): void {
  const { strings } = context;
  const counts = new Map<FindingSeverity, number>();
  for (const child of node.children) {
    if (child.type !== 'element' || child.properties.dataSemantic !== 'finding') continue;
    const severity = findingSeverity(child);
    if (severity !== undefined) counts.set(severity, (counts.get(severity) ?? 0) + 1);
  }
  const items: ElementContent[] = FINDING_SEVERITY_ORDER.flatMap((severity) => {
    const count = counts.get(severity);
    if (count === undefined) return [];
    return [
      {
        type: 'element',
        tagName: 'li',
        properties: { className: ['semantic-severity'], dataSeverity: severity },
        children: [
          { type: 'text', value: `${strings.severity[severity]} ` },
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['semantic-severity-count'] },
            children: [{ type: 'text', value: strings.formatNumber(count) }],
          },
        ],
      } satisfies Element,
    ];
  });
  node.children.unshift({
    type: 'element',
    tagName: 'ul',
    properties: { className: ['semantic-findings-summary'], ariaLabel: strings.findingsSummary },
    children: items,
  });
  if (stringProperty(node, 'dataDirectiveTitle') !== undefined) {
    // Под заголовком группы заголовки находок уходят на уровень ниже.
    for (const child of node.children) {
      if (child.type === 'element' && child.properties.dataSemantic === 'finding')
        child.properties.dataNestedFinding = '';
    }
  }
  prependDirectiveTitle(node);
}

function enhanceFinding(node: Element, context: { readonly strings: PackageStrings }): void {
  const severity = findingSeverity(node);
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const location = stringProperty(node, 'dataLocation');
  const nested = takeStringProperty(node, 'dataNestedFinding') !== undefined;
  if (severity === undefined || title === undefined) {
    throw new Error('Validated finding is missing its severity or title.');
  }
  const head: ElementContent[] = [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['semantic-severity'], dataSeverity: severity },
      children: [{ type: 'text', value: context.strings.severity[severity] }],
    },
    nested
      ? {
          type: 'element',
          tagName: 'h4',
          properties: { className: ['semantic-title'] },
          children: [{ type: 'text', value: title }],
        }
      : semanticTitle(title),
  ];
  if (location !== undefined) {
    head.push({
      type: 'element',
      tagName: 'code',
      properties: { className: ['semantic-finding-location'] },
      children: [{ type: 'text', value: location }],
    });
  }
  node.children.unshift({
    type: 'element',
    tagName: 'header',
    properties: { className: ['semantic-finding-head'] },
    children: head,
  });
}

export const findings = defineBlock({
  definition: findingsDefinition(),
  enhance: enhanceFindings,
  feature: 'findings',
  staticEquivalent: 'The findings in authored order under a count per severity.',
  examples: [
    '::::findings{title="Review"}\n:::finding{severity="major" title="Cache never expires" location="src/cache.ts:12"}\nEntries stay forever.\n:::\n::::\n',
  ],
});

export const finding = defineBlock({
  definition: findingDefinition(),
  enhance: enhanceFinding,
  feature: 'findings',
  staticEquivalent: 'One finding with its severity in words, its title, location and detail.',
  examples: [
    '::::findings\n:::finding{severity="note" title="Naming"}\nPrefer a verb.\n:::\n::::\n',
  ],
});
