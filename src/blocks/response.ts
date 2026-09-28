import { createHash } from 'node:crypto';

import type { Element } from 'hast';
import type { Root as MdastRoot } from 'mdast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import {
  MAX_RESPONSE_FORMS,
  MAX_RESPONSE_ITEMS,
  MAX_RESPONSE_OPTIONS,
  MAX_RESPONSE_QUESTIONS,
  parseResponseFormManifest,
  RESPONSE_CONTRACT_VERSION,
  type ResponseItemDefinition,
  type ResponseQuestionDefinition,
  type ResponseQuestionKind,
} from '../response/contract.js';
import {
  booleanAttribute,
  identityAttribute,
  linkAttribute,
  optionalIdentityAttribute,
  requiredEnumAttribute,
  requiredTitleAttribute,
  responseLeaf,
  responseNumberAttribute,
  responseTextAttribute,
} from './definitions.js';
import {
  type BlockAttributeValues,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { semanticTitle, stringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/** The response family: a form, its typed questions, and their buckets, options and items. */

const responseAttributes = [
  requiredTitleAttribute(),
  identityAttribute('id', 'Stable response form identity.'),
] as const;
const questionAttributes = [
  identityAttribute('id', 'Stable question identity within the response form.'),
  requiredEnumAttribute('kind', 'Structured answer kind.', [
    'bucket',
    'item-single',
    'item-multi',
    'single',
    'order',
    'number',
    'text',
  ]),
  requiredTitleAttribute(),
  responseTextAttribute('prompt', 'Optional reader instruction.', false, 500),
  responseNumberAttribute('min', 'Required minimum for number questions.'),
  responseNumberAttribute('max', 'Required maximum for number questions.'),
  responseNumberAttribute('step', 'Optional positive increment for number questions.'),
] as const;
const bucketAttributes = [
  identityAttribute('id', 'Stable bucket identity within the question.'),
  responseTextAttribute('label', 'Visible bucket label.', true, 200),
] as const;
const optionAttributes = [
  identityAttribute('id', 'Stable option identity within the question.'),
  responseTextAttribute('label', 'Visible option label.', true, 200),
] as const;
const itemAttributes = [
  identityAttribute('id', 'Stable item identity within the question.'),
  responseTextAttribute('label', 'Visible item title.', true, 500),
  responseTextAttribute('note', 'Required explanatory line.', true, 1_000),
  responseTextAttribute('meta', 'Required metadata line.', true, 500),
  linkAttribute(),
  optionalIdentityAttribute('bucket', 'Optional authored initial bucket.'),
  booleanAttribute('comment', 'Enables one optional comment for this item.', false),
] as const;

const responseDefinition: DirectiveDefinition = {
  name: 'response',
  description: 'Local structured reader-response workspace with deterministic export.',
  forms: ['container'],
  attributes: responseAttributes,
  children: 'response-question-directives',
  placement: {},
  behavior: {
    renderer: 'semantic-container',
    resource: 'none',
    runtime: 'package-owned-response',
  },
  sanitizer: {
    tagName: 'section',
    className: 'semantic-response',
    properties: [
      'dataSemantic',
      ...responseAttributes.map((attribute) => attribute.renderProperty),
    ],
  },
  security: { authorCode: false, rawHtml: false, localResourceOnly: false },
  handoffs: ['semantic-document', 'reader-runtime'],
};

const questionDefinition: DirectiveDefinition = {
  name: 'question',
  description: 'One typed question inside a response workspace.',
  forms: ['container'],
  attributes: questionAttributes,
  children: 'response-field-directives',
  placement: { requiredParent: 'response' },
  behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
  sanitizer: {
    tagName: 'section',
    className: 'semantic-question',
    properties: [
      'dataSemantic',
      ...questionAttributes.map((attribute) => attribute.renderProperty),
    ],
  },
  security: { authorCode: false, rawHtml: false, localResourceOnly: false },
  handoffs: ['semantic-document', 'reader-runtime'],
};

interface ResponseQuestionSubject {
  readonly node: DirectiveNode;
  readonly values: BlockAttributeValues;
  readonly kind: ResponseQuestionKind;
  readonly buckets: readonly DirectiveNode[];
  readonly choices: readonly DirectiveNode[];
  readonly items: readonly DirectiveNode[];
  readonly seenIds: Set<string>;
  readonly childAttributes: (node: DirectiveNode) => BlockAttributeValues | undefined;
  readonly fail: (node: DirectiveNode, message: string) => AgenticReportError;
}

/**
 * The rules of one response question, declared as data. Independence is the point: a question whose
 * option count is wrong is still judged on its numeric bounds, because neither answer needs the
 * other. Where an answer does need another, the need is written in `dependsOn` instead of being
 * implied by the order of statements.
 */
const responseQuestionRules = declareAuthoredRules<ResponseQuestionSubject>({
  subject: 'response/question',
  rules: [
    {
      id: 'unique-id',
      check: ({ node, values, seenIds, fail }) => {
        const id = String(values.id);
        if (seenIds.has(id)) return fail(node, `Question id is duplicated: ${id}.`);
        seenIds.add(id);
        return undefined;
      },
    },
    {
      id: 'unique-child-ids',
      check: ({ node, buckets, choices, items, childAttributes, fail }) => {
        const duplicated = (children: readonly DirectiveNode[], label: string) => {
          const ids = children.map((child) => String(childAttributes(child)?.id));
          return new Set(ids).size === ids.length
            ? undefined
            : fail(node, `${label} ids must be unique within the question.`);
        };
        return [
          duplicated(buckets, 'bucket'),
          duplicated(choices, 'option'),
          duplicated(items, 'item'),
        ].filter((violation): violation is AgenticReportError => violation !== undefined);
      },
    },
    {
      id: 'items-match-kind',
      check: ({ node, kind, items, fail }) => {
        const itemKind = ['bucket', 'item-single', 'item-multi', 'order', 'number'].includes(kind);
        if (itemKind === items.length > 0) return undefined;
        return fail(
          node,
          itemKind ? `${kind} requires response items.` : `${kind} does not accept items.`,
        );
      },
    },
    {
      id: 'buckets-match-kind',
      check: ({ node, kind, buckets, fail }) => {
        if (kind === 'bucket') {
          return buckets.length < 2 || buckets.length > 5
            ? fail(node, 'Bucket questions require 2 to 5 buckets.')
            : undefined;
        }
        return buckets.length > 0
          ? fail(node, `${kind} does not accept bucket definitions.`)
          : undefined;
      },
    },
    {
      // Items are read against accepted buckets: with the bucket set refused, an unknown reference
      // would be a fact about buckets nobody accepted.
      id: 'item-bucket-references',
      dependsOn: ['buckets-match-kind'],
      check: ({ kind, buckets, items, childAttributes, fail }) => {
        if (kind !== 'bucket') return undefined;
        const bucketIds = new Set(buckets.map((child) => String(childAttributes(child)?.id)));
        return items
          .map((item) => {
            const initial = childAttributes(item)?.bucket;
            return initial !== undefined && !bucketIds.has(String(initial))
              ? fail(item, `Response item references an unknown bucket: ${String(initial)}.`)
              : undefined;
          })
          .filter((violation): violation is AgenticReportError => violation !== undefined);
      },
    },
    {
      id: 'options-match-kind',
      check: ({ node, kind, choices, fail }) => {
        if (['item-single', 'item-multi', 'single'].includes(kind)) {
          return choices.length < 2 || choices.length > MAX_RESPONSE_OPTIONS
            ? fail(node, `${kind} requires 2 to ${MAX_RESPONSE_OPTIONS} options.`)
            : undefined;
        }
        return choices.length > 0
          ? fail(node, `${kind} does not accept option definitions.`)
          : undefined;
      },
    },
    {
      id: 'numeric-domain',
      check: ({ node, values, kind, fail }) => {
        if (kind === 'number') {
          const minimum = values.min;
          const maximum = values.max;
          const step = values.step;
          if (typeof minimum !== 'number' || typeof maximum !== 'number')
            return fail(node, 'Number questions require min and max.');
          if (minimum > maximum) return fail(node, 'Number question min must not exceed max.');
          return typeof step === 'number' && step <= 0
            ? fail(node, 'Number question step must be positive.')
            : undefined;
        }
        return values.min !== undefined || values.max !== undefined || values.step !== undefined
          ? fail(node, `Numeric bounds are supported only by number questions, not ${kind}.`)
          : undefined;
      },
    },
  ],
});

/** Form ids and the form budget are facts about the whole document, kept per run. */
const formsByDocument = new WeakMap<MdastRoot, { readonly ids: Set<string>; count: number }>();

/**
 * One response form. Question ids and the item budget are properties of one form, not of the
 * document: two forms may reuse an id, and each carries its own items. A node whose own reading was
 * refused never reached interpretation, and everything these checks would read comes from that
 * unmade interpretation, so it is skipped rather than judged on values nobody accepted.
 */
function validateResponse(candidate: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const form = context.attributes(candidate);
  if (form === undefined) return 'refused';
  let forms = formsByDocument.get(context.document);
  if (forms === undefined) {
    forms = { ids: new Set(), count: 0 };
    formsByDocument.set(context.document, forms);
  }
  const fail = (node: DirectiveNode, message: string): AgenticReportError =>
    context.violation(
      node,
      'INVALID_RESPONSE_DATA',
      message,
      'Correct the response/question child types, stable ids, defaults, or kind-specific domain.',
    );
  const formViolations: AgenticReportError[] = [];
  const questionIds = new Set<string>();
  let itemTotal = 0;
  forms.count += 1;
  if (forms.count > MAX_RESPONSE_FORMS)
    formViolations.push(
      fail(candidate, `A document supports at most ${MAX_RESPONSE_FORMS} response forms.`),
    );
  const formId = String(form.id);
  if (forms.ids.has(formId))
    formViolations.push(fail(candidate, `Response id is duplicated: ${formId}.`));
  forms.ids.add(formId);

  const questions = directChildren(candidate, ['question'], formViolations, fail);
  if (questions !== undefined) {
    if (questions.length < 1 || questions.length > MAX_RESPONSE_QUESTIONS) {
      formViolations.push(
        fail(candidate, `Response requires 1 to ${MAX_RESPONSE_QUESTIONS} questions.`),
      );
    } else {
      // Each question is its own subject: a refused one says nothing about the next, so the form
      // answers for every question it holds.
      for (const question of questions) {
        itemTotal += inspectQuestion(question, formViolations, questionIds, context, fail);
      }
      if (itemTotal > MAX_RESPONSE_ITEMS)
        formViolations.push(
          fail(candidate, `Response supports at most ${MAX_RESPONSE_ITEMS} items in total.`),
        );
    }
  }

  context.report(formViolations);
  return formViolations.length === 0 ? 'accepted' : 'refused';
}

function inspectQuestion(
  question: DirectiveNode,
  formViolations: AgenticReportError[],
  questionIds: Set<string>,
  context: BlockValidationContext,
  fail: (node: DirectiveNode, message: string) => AgenticReportError,
): number {
  const values = context.attributes(question);
  if (values === undefined) return 0;
  const children = directChildren(question, ['bucket', 'option', 'item'], formViolations, fail);
  if (children === undefined) return 0;
  const items = children.filter((child) => child.name === 'item');
  runAuthoredRules(
    responseQuestionRules,
    {
      node: question,
      values,
      kind: String(values.kind) as ResponseQuestionKind,
      buckets: children.filter((child) => child.name === 'bucket'),
      choices: children.filter((child) => child.name === 'option'),
      items,
      seenIds: questionIds,
      childAttributes: context.attributes,
      fail,
    },
    formViolations,
  );
  return items.length;
}

function directChildren(
  parent: DirectiveNode,
  allowed: readonly string[],
  collected: AgenticReportError[],
  fail: (node: DirectiveNode, message: string) => AgenticReportError,
): readonly DirectiveNode[] | undefined {
  const children = parent.children ?? [];
  const directives = children.filter(isDirectiveNode);
  if (
    directives.length !== children.length ||
    directives.some((child) => !allowed.includes(child.name))
  ) {
    collected.push(
      fail(
        parent,
        `${parent.name} accepts only ${allowed.join(', ')} directives as direct children.`,
      ),
    );
    return undefined;
  }
  return directives;
}

function enhanceResponse(
  node: Element,
  context: { readonly allocateId: (base: string) => string },
): void {
  const id = stringProperty(node, 'dataId');
  const title = stringProperty(node, 'dataDirectiveTitle');
  if (!id || !title) throw new Error('Validated response is missing its id or title.');
  const authoredChildren = node.children;
  const questions = authoredChildren.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'question',
  );
  const projection = {
    contractVersion: RESPONSE_CONTRACT_VERSION,
    id,
    title,
    questions: questions.map(responseQuestionDefinition),
  };
  const revision = `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
  const manifest = parseResponseFormManifest({ ...projection, revision });
  const titleId = context.allocateId(`response-${id}-title`);
  node.properties.id = context.allocateId(`response-${id}`);
  node.properties.ariaLabelledBy = [titleId];
  node.properties.dataResponseWorkspace = '';
  node.properties.dataResponseId = id;
  node.children = [
    semanticTitle(title, titleId),
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseSource: '', hidden: '' },
      children: authoredChildren,
    },
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseManifest: '', hidden: '' },
      children: [{ type: 'text', value: JSON.stringify(manifest) }],
    },
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseMount: '' },
      children: [],
    },
  ];
}

function responseQuestionDefinition(node: Element): ResponseQuestionDefinition {
  const id = stringProperty(node, 'dataId');
  const kind = stringProperty(node, 'dataKind') as ResponseQuestionKind | undefined;
  const title = stringProperty(node, 'dataDirectiveTitle');
  if (!id || !kind || !title) throw new Error('Validated response question is incomplete.');
  const prompt = stringProperty(node, 'dataPrompt');
  const minimum = numericProperty(node, 'dataMin');
  const maximum = numericProperty(node, 'dataMax');
  const step = numericProperty(node, 'dataStep');
  const buckets = responseDefinitions(node, 'bucket');
  const options = responseDefinitions(node, 'option');
  const items = node.children
    .filter(
      (child): child is Element =>
        child.type === 'element' && child.properties.dataSemantic === 'item',
    )
    .map(responseItemDefinition);
  return {
    id,
    kind,
    title,
    ...(prompt === undefined ? {} : { prompt }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(step === undefined ? {} : { step }),
    buckets,
    options,
    items,
  };
}

function responseDefinitions(
  node: Element,
  kind: 'bucket' | 'option',
): readonly { readonly id: string; readonly label: string }[] {
  return node.children
    .filter(
      (child): child is Element =>
        child.type === 'element' && child.properties.dataSemantic === kind,
    )
    .map((child) => {
      const id = stringProperty(child, 'dataId');
      const label = stringProperty(child, 'dataLabel');
      if (!id || !label) throw new Error(`Validated response ${kind} is incomplete.`);
      return { id, label };
    });
}

function responseItemDefinition(node: Element): ResponseItemDefinition {
  const id = stringProperty(node, 'dataId');
  const label = stringProperty(node, 'dataLabel');
  if (!id || !label) throw new Error('Validated response item is incomplete.');
  const note = stringProperty(node, 'dataNote');
  const meta = stringProperty(node, 'dataMeta');
  const href = stringProperty(node, 'dataHref');
  const bucket = stringProperty(node, 'dataBucket');
  const comment = stringProperty(node, 'dataComment') === 'true';
  if (!note || !meta || !href) throw new Error('Validated response item detail is incomplete.');
  return {
    id,
    label,
    note,
    meta,
    href,
    ...(bucket === undefined ? {} : { bucket }),
    comment,
  };
}

function numericProperty(node: Element, name: string): number | undefined {
  const value = stringProperty(node, name);
  return value === undefined ? undefined : Number(value);
}

const RESPONSE_EXAMPLE =
  ':::::response{title="Your call" id="call"}\n::::question{id="pick" kind="single" title="Which option?"}\n::option{id="a" label="A"}\n::option{id="b" label="B"}\n::::\n:::::\n';

export const response = defineBlock({
  definition: responseDefinition,
  validate: validateResponse,
  enhance: enhanceResponse,
  styles: 'package',
  staticEquivalent:
    'The questions with their options and items as text; answering and export need the browser.',
  examples: [RESPONSE_EXAMPLE],
});

export const question = defineBlock({
  definition: questionDefinition,
  styles: 'package',
  staticEquivalent: 'One titled question with its prompt and choices listed.',
  examples: [RESPONSE_EXAMPLE],
});

export const bucket = defineBlock({
  definition: responseLeaf('bucket', 'One named assignment bucket.', bucketAttributes),
  styles: 'package',
  staticEquivalent: 'A named group items can be assigned to, listed by its label.',
  examples: [
    ':::::response{title="Triage" id="triage"}\n::::question{id="scope" kind="bucket" title="Scope"}\n::bucket{id="do" label="Do"}\n::bucket{id="skip" label="Skip"}\n::item{id="task" label="Task" note="Why it matters" meta="Issue 1" href="https://example.com/1" bucket="do"}\n::::\n:::::\n',
  ],
});

export const option = defineBlock({
  definition: responseLeaf('option', 'One selectable answer option.', optionAttributes),
  styles: 'package',
  staticEquivalent: 'One answer option, listed by its label.',
  examples: [RESPONSE_EXAMPLE],
});

export const item = defineBlock({
  definition: responseLeaf('item', 'One readable response item.', itemAttributes),
  styles: 'package',
  staticEquivalent: 'One item with its note, metadata and link.',
  examples: [
    ':::::response{title="Review" id="review"}\n::::question{id="rank" kind="order" title="Order these"}\n::item{id="one" label="One" note="First" meta="A" href="https://example.com/1"}\n::item{id="two" label="Two" note="Second" meta="B" href="https://example.com/2"}\n::::\n:::::\n',
  ],
});
