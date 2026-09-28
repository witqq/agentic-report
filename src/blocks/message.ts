import type { Element, ElementContent } from 'hast';

import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import {
  attributeRenderProperty,
  booleanAttribute,
  enumAttribute,
  titleAttribute,
} from './definitions.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { takeStringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/**
 * A mock of a message or a conversation: a notification from a system, or a dialog with an agent, as
 * the product shows it. `message` is one message — sender, time, text, an optional status; `conversation`
 * holds several in order. A mock that shows invented numbers says so: `illustrative` puts a visible
 * mark on it, because a reader otherwise takes a screenshot-like message for a record of what happened
 * (DR-DATA-SLICE). The look comes from theme tokens only; in print the messages stay as bordered
 * blocks in order.
 */

interface MessageStrings {
  readonly illustrative: string;
  readonly from: string;
  readonly conversation: string;
}

const MESSAGE_STRINGS = {
  en: { illustrative: 'Illustrative', from: 'Message from', conversation: 'Conversation' },
  ru: { illustrative: 'Иллюстрация', from: 'Сообщение от', conversation: 'Переписка' },
} as const satisfies Record<'en' | 'ru', MessageStrings>;

function shortText(name: string, description: string, required: boolean, maxLength: number) {
  return {
    name,
    description,
    required,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  } as const satisfies DirectiveAttributeDefinition;
}

const illustrativeAttribute = booleanAttribute(
  'illustrative',
  'Marks the mock as an illustration: its names, times and numbers are examples, not a record.',
  false,
);

function conversationDefinition(): DirectiveDefinition {
  const attributes = [titleAttribute, illustrativeAttribute] as const;
  return {
    name: 'conversation',
    description:
      'A mock of a dialog or a notification feed: message directives in order, with an optional title and an illustrative mark.',
    forms: ['container'],
    attributes,
    children: 'message-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'figure',
      className: 'semantic-conversation',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function messageDefinition(): DirectiveDefinition {
  const attributes = [
    shortText('from', 'Sender as the product names it: a person, an agent, a system.', true, 80),
    shortText(
      'time',
      'When it was sent, as the product shows it, such as 01:17 or yesterday.',
      false,
      40,
    ),
    enumAttribute(
      'side',
      'in — received, drawn at the start edge; out — sent by the reader, drawn at the end edge.',
      ['in', 'out'],
      'in',
    ),
    shortText(
      'status',
      'Delivery or run status shown under the text, such as delivered or done.',
      false,
      40,
    ),
    illustrativeAttribute,
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'message',
    description:
      'One message or notification: sender, time, Markdown text and an optional status; alone it is a notification, inside conversation it is one turn.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'article',
      className: 'semantic-message',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function textElement(tagName: string, className: string, value: string): Element {
  return {
    type: 'element',
    tagName,
    properties: { className: [className] },
    children: [{ type: 'text', value }],
  };
}

function illustrativeMark(strings: MessageStrings): Element {
  return textElement('span', 'semantic-illustrative', strings.illustrative);
}

function enhanceMessage(node: Element, context: BlockEnhancementContext<MessageStrings>): void {
  const from = takeStringProperty(node, 'dataFrom') ?? '';
  const time = takeStringProperty(node, 'dataTime');
  const status = takeStringProperty(node, 'dataStatus');
  const illustrative = node.properties.dataIllustrative === 'true';
  delete node.properties.dataIllustrative;
  if (illustrative) node.properties.dataIllustrative = '';
  const meta: ElementContent[] = [textElement('span', 'semantic-message-from', from)];
  if (time !== undefined) meta.push(textElement('span', 'semantic-message-time', time));
  if (illustrative) meta.push(illustrativeMark(context.messages));
  const body: Element = {
    type: 'element',
    tagName: 'div',
    properties: { className: ['semantic-message-body'] },
    children: node.children,
  };
  node.properties.ariaLabel = `${context.messages.from} ${from}${time === undefined ? '' : `, ${time}`}`;
  node.children = [
    {
      type: 'element',
      tagName: 'header',
      properties: { className: ['semantic-message-meta'] },
      children: meta,
    },
    body,
    ...(status === undefined ? [] : [textElement('p', 'semantic-message-status', status)]),
  ];
}

/** A conversation is its turns: text between them would have no sender and is refused, not dropped. */
function validateConversation(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const loose = (node.children ?? []).filter((child) => {
    const data = (child as { readonly data?: { readonly directiveLabel?: boolean } }).data;
    return !(isDirectiveNode(child) && child.name === 'message') && data?.directiveLabel !== true;
  });
  if (loose.length === 0) return 'accepted';
  context.report(
    context.violation(
      node,
      'INVALID_DIRECTIVE_CHILD',
      'conversation holds only message directives; text between them has no sender.',
      'Put the text inside a :::message{from="…"} or move it out of the conversation.',
    ),
  );
  return 'accepted';
}

function enhanceConversation(
  node: Element,
  context: BlockEnhancementContext<MessageStrings>,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const illustrative = node.properties.dataIllustrative === 'true';
  delete node.properties.dataIllustrative;
  if (illustrative) node.properties.dataIllustrative = '';
  const items: ElementContent[] = node.children.flatMap((child) =>
    child.type === 'element' && child.properties.dataSemantic === 'message'
      ? [{ type: 'element', tagName: 'li', properties: {}, children: [child] } satisfies Element]
      : [],
  );
  const caption: ElementContent[] = [];
  if (title !== undefined) caption.push(textElement('span', 'semantic-conversation-title', title));
  if (illustrative) caption.push(illustrativeMark(context.messages));
  node.properties.ariaLabel = title ?? context.messages.conversation;
  node.children = [
    ...(caption.length === 0
      ? []
      : [
          {
            type: 'element',
            tagName: 'figcaption',
            properties: { className: ['semantic-conversation-caption'] },
            children: caption,
          } satisfies Element,
        ]),
    {
      type: 'element',
      tagName: 'ol',
      properties: { className: ['semantic-conversation-list'] },
      children: items,
    },
  ];
}

const CONVERSATION_EXAMPLE = [
  '::::conversation{title="Night run" illustrative="true"}',
  ':::message{from="Moira" time="01:17" status="delivered"}',
  'Review finished: **0 findings**, 9 of 10 items accepted.',
  ':::',
  ':::message{from="You" time="01:18" side="out"}',
  'Merge it.',
  ':::',
  '::::',
  '',
].join('\n');

export const conversation = defineBlock<undefined, MessageStrings>({
  definition: conversationDefinition(),
  validate: validateConversation,
  enhance: enhanceConversation,
  strings: MESSAGE_STRINGS,
  styles: 'package',
  staticEquivalent:
    'The messages as an ordered list of bordered blocks, each with its sender and time, the same in print.',
  examples: [CONVERSATION_EXAMPLE],
});

export const message = defineBlock<undefined, MessageStrings>({
  definition: messageDefinition(),
  enhance: enhanceMessage,
  strings: MESSAGE_STRINGS,
  styles: 'package',
  staticEquivalent: 'A bordered block with the sender, time, text and status, the same in print.',
  examples: [
    ':::message{from="CI" time="09:41" status="failed" illustrative="true"}\nBuild 412 failed on `tests/e2e/data.spec.ts`.\n:::\n',
    CONVERSATION_EXAMPLE,
  ],
});
