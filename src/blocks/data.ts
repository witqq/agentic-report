import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import { attributeRenderProperty } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import type { DirectiveNode } from './mdast.js';

/**
 * The data family: `each` repeats Markdown per item of a list from the page data, `expect` states what
 * the data must be. Both are consumed at build time by the data phase (`src/render/page-data.ts`),
 * before any other directive is read; neither reaches the page. On a page without `data` the phase does
 * not run, and the block checks below refuse them, because a repetition or an expectation over no data
 * is a mistake, not an empty result.
 */

/** A path into the page data: a file or item name, then keys and list positions separated by dots. */
export const DATA_PATH_PATTERN =
  '^[A-Za-z_][A-Za-z0-9_-]*(?:\\.(?:[A-Za-z_][A-Za-z0-9_-]*|[0-9]+))*$';

function pathAttribute(name: 'in' | 'data', description: string): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 200,
      pattern: DATA_PATH_PATTERN,
    },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function eachDefinition(): DirectiveDefinition {
  const attributes = [
    pathAttribute('in', 'Path of a list in the page data, such as run.blocks.'),
    {
      name: 'as',
      description:
        'Name of the current item inside the body: {{as}} for a plain value, {{as.field}} for a field.',
      required: true,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        maxLength: 32,
        pattern: '^[a-z][a-z0-9-]{0,31}$',
      },
      renderProperty: attributeRenderProperty('as'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'each',
    description:
      'Repeats its Markdown once per item of a list from the page data when the page builds; a body that is one list or one table repeats its items or rows inside it.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-each',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function expectDefinition(): DirectiveDefinition {
  const attributes = [
    pathAttribute('data', 'Path of the value the expectation reads, such as run.blocks.'),
    {
      name: 'count',
      description: 'The list at the path has exactly this many items.',
      required: false,
      constraint: { kind: 'integer', minimum: 0, maximum: 100_000 },
      renderProperty: attributeRenderProperty('count'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'min',
      description:
        'A list has at least this many items (min="1": not empty); a number is at least this value.',
      required: false,
      constraint: { kind: 'number' },
      renderProperty: attributeRenderProperty('min'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'max',
      description: 'A list has at most this many items; a number is at most this value.',
      required: false,
      constraint: { kind: 'number' },
      renderProperty: attributeRenderProperty('max'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'equals',
      description: 'A text, number or true/false value written exactly like this.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
      renderProperty: attributeRenderProperty('equals'),
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'expect',
    description:
      'A control value over the page data: the build fails at this line when the data at the path diverges from the stated count, bounds or value. Renders nothing.',
    forms: ['leaf'],
    attributes,
    children: 'none',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-expect',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

/**
 * The data the examples below read; the block tests give every example page this file as `run.json`,
 * the way a page lists it in `data`.
 */
export const EXAMPLE_PAGE_DATA = {
  status: 'done',
  blocks: [
    { title: 'Plan', status: 'accepted' },
    { title: 'Review', status: 'returned' },
  ],
} as const;

const DATA_EXAMPLE = [
  '::expect{data="run.blocks" count="2"}',
  '',
  ':::each{in="run.blocks" as="block"}',
  '- **{{block.title}}**: {{block.status}}',
  ':::',
  '',
].join('\n');

/** Reached only on a page without `data`: the data phase consumes these directives everywhere else. */
function refuseWithoutData(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  // A refused grammar has already said what is wrong with the directive itself.
  if (context.attributes(node) === undefined) return 'refused';
  context.report(
    context.violation(
      node,
      'DATA_NOT_DECLARED',
      `${node.name} reads the page data, and this page declares no data files.`,
      'List the JSON files in the data field of the frontmatter or manifest, such as data: [data/run.json].',
    ),
  );
  return 'refused';
}

export const dataEach = defineBlock({
  definition: eachDefinition(),
  validate: refuseWithoutData,
  feature: 'core',
  staticEquivalent:
    'Nothing of its own: the Markdown it repeated is written out once per item when the page builds.',
  examples: [DATA_EXAMPLE],
});

export const dataExpectation = defineBlock({
  definition: expectDefinition(),
  validate: refuseWithoutData,
  feature: 'core',
  staticEquivalent: 'Nothing: it is checked when the page builds and never reaches the page.',
  examples: [DATA_EXAMPLE],
});
