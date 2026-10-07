import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import {
  COMPOSITIONS,
  COMPOSITION_ACTIONS,
  COMPOSITION_ANCHOR,
  compositionFrame,
  compositionReference,
  type CompositionCue,
} from '../composition.js';
import { defineBlock, type BlockValidationContext } from './define-block.js';
import {
  enumAttribute,
  identityAttribute,
  requiredEnumAttribute,
  textAttribute,
  titleAttribute,
} from './definitions.js';
import { prependDirectiveTitle } from './hast.js';
import { isDirectiveNode, type DirectiveNode } from './mdast.js';

function definition(
  name: string,
  attributes: readonly DirectiveAttributeDefinition[],
  leaf = false,
  parent?: string,
): DirectiveDefinition {
  return {
    name,
    description:
      name === 'composition'
        ? 'A directed, responsive explanation made of named objects and timed actions.'
        : name === 'object'
          ? 'Named Markdown object on a composition stage.'
          : 'One declarative action at a time or speech anchor.',
    forms: leaf ? ['leaf'] : ['container'],
    attributes,
    children: leaf ? 'none' : 'markdown',
    placement: parent === undefined ? {} : { requiredParent: parent },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-scene' },
    sanitizer: {
      tagName: leaf ? 'span' : 'section',
      className: `semantic-${name}`,
      properties: ['dataSemantic', ...attributes.map((a) => a.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}
const at: DirectiveAttributeDefinition = {
  ...textAttribute(
    'at',
    'Seconds or speech anchor b2, b2.end, b2+0.3; standalone beats use three seconds.',
    true,
  ),
  constraint: {
    kind: 'string',
    normalization: 'trim',
    minLength: 1,
    maxLength: 40,
    pattern: COMPOSITION_ANCHOR.source,
  },
};
const duration: DirectiveAttributeDefinition = {
  name: 'duration',
  description: 'Movement duration in seconds (default 0.6).',
  required: false,
  default: 0.6,
  constraint: { kind: 'number', minimum: 0.1, maximum: 3, lexicalPattern: '^\\d+(?:\\.\\d+)?$' },
  renderProperty: 'dataDuration',
  invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
};
const example =
  '::::composition{id="edit" title="First edit" kind="ownership"}\n:::object{id="layout" title="Layout" role="source"}\nGlow + shadow\n:::\n:::object{id="shape" title="Shape" role="result"}\nInherited\n:::\n::cue{at="0" action="connect" target="layout" to="shape"}\n::cue{at="b2" action="copy" target="layout" to="shape"}\n::cue{at="b3" action="replace" target="shape" value="Glow + new shadow"}\n::::\n';
function validate(node: DirectiveNode, context: BlockValidationContext): 'accepted' | 'refused' {
  const children = (node.children ?? []).filter(isDirectiveNode);
  const objects = children.filter((c) => c.name === 'object');
  const cues = children.filter((c) => c.name === 'cue');
  const ids = objects.map((o) => String(context.attributes(o)?.id ?? ''));
  const fail = (n: DirectiveNode, message: string) =>
    context.report(
      context.violation(
        n,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        message,
        'Use named objects and compatible cue fields inside one composition.',
      ),
    );
  if (objects.length === 0 || objects.length > 16) fail(node, 'A composition needs 1–16 objects.');
  if (cues.length > 64) fail(node, 'A composition supports at most 64 cues.');
  if (new Set(ids).size !== ids.length)
    fail(node, 'Composition object ids must be unique within the stage.');
  if ((node.children ?? []).some((c) => !isDirectiveNode(c) || !['object', 'cue'].includes(c.name)))
    fail(node, 'Put blocks inside an object; a composition directly holds objects and cues.');
  for (const cue of cues) {
    const a = context.attributes(cue);
    if (a === undefined) continue;
    if (!ids.includes(String(a.target))) fail(cue, `Unknown composition object: ${a.target}.`);
    const pair = ['copy', 'transfer', 'connect', 'compare'].includes(String(a.action));
    if (pair && (!ids.includes(String(a.to)) || a.to === a.target))
      fail(cue, 'This action needs a different named destination object.');
    if (!pair && a.to !== undefined) fail(cue, 'to belongs to copy, transfer, connect or compare.');
    if (a.action === 'replace' && a.value === undefined)
      fail(cue, 'replace needs a plain-text value.');
    if (a.value !== undefined && !['replace', 'connect'].includes(String(a.action)))
      fail(cue, 'value belongs to replace or a connection label.');
    if (
      a.lines !== undefined &&
      (a.action !== 'focus' ||
        objects.find((o) => context.attributes(o)?.id === a.target)?.attributes?.role !== 'code')
    )
      fail(cue, 'lines belongs to focus on a code object.');
  }
  return 'accepted';
}
function cueOf(n: Element): CompositionCue {
  return {
    at: String(n.properties.dataAt),
    action: String(n.properties.dataAction) as CompositionCue['action'],
    target: String(n.properties.dataTarget),
    duration: Number(n.properties.dataDuration ?? 0.6),
    ...(n.properties.dataTo === undefined ? {} : { to: String(n.properties.dataTo) }),
    ...(n.properties.dataValue === undefined ? {} : { value: String(n.properties.dataValue) }),
    ...(n.properties.dataLines === undefined ? {} : { lines: String(n.properties.dataLines) }),
  };
}
function cloneContent(children: Element['children'], prefix: string): Element['children'] {
  const root: Root = { type: 'root', children: structuredClone(children) };
  const ids = new Map<string, string>();
  visit(root, 'element', (node: Element) => {
    if (typeof node.properties.id === 'string')
      ids.set(node.properties.id, `${prefix}-${node.properties.id}`);
  });
  visit(root, 'element', (node: Element) => {
    delete node.position;
    delete node.properties.dataReviewTarget;
    for (const [name, value] of Object.entries(node.properties)) {
      if (typeof value === 'string')
        node.properties[name] =
          name === 'id'
            ? (ids.get(value) ?? value)
            : ['ariaLabelledBy', 'ariaDescribedBy', 'ariaControls'].includes(name)
              ? value
                  .split(/\s+/u)
                  .map((id) => ids.get(id) ?? id)
                  .join(' ')
              : compositionReference(value, ids);
      else if (
        Array.isArray(value) &&
        ['ariaLabelledBy', 'ariaDescribedBy', 'ariaControls'].includes(name)
      )
        node.properties[name] = value.map((id) =>
          typeof id === 'string' ? (ids.get(id) ?? id) : id,
        );
    }
  });
  return root.children.filter(
    (node): node is Element['children'][number] => node.type !== 'doctype',
  );
}
function finalize(tree: Root): void {
  visit(tree, 'element', (stage: Element) => {
    if (stage.properties.dataSemantic !== 'composition') return;
    const objects = stage.children.filter(
      (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'object',
    );
    const cueNodes = stage.children.filter(
      (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'cue',
    );
    const titles = new Map(
      objects.map((o) => [
        String(o.properties.dataId),
        o.children.filter((c) => c.type === 'element' && c.tagName === 'h3'),
      ]),
    );
    const originals = new Map(
      objects.map((o) => [
        String(o.properties.dataId),
        structuredClone(o.children.filter((c) => !(c.type === 'element' && c.tagName === 'h3'))),
      ]),
    );
    const frame = compositionFrame(
      [...originals.keys()],
      cueNodes.map(cueOf),
      Number.POSITIVE_INFINITY,
    );
    for (const object of objects) {
      const id = String(object.properties.dataId);
      object.properties.dataCompositionObject = id;
      const current = frame.objects.get(id);
      if (current === undefined) throw new Error(`Missing compiled composition object: ${id}`);
      const content =
        'source' in current.content
          ? current.content.source === id
            ? structuredClone(originals.get(id) ?? [])
            : cloneContent(
                originals.get(current.content.source) ?? [],
                `composition-${stage.properties.dataId}-${id}`,
              )
          : 'text' in current.content
            ? [{ type: 'text' as const, value: current.content.text }]
            : [];
      object.children = [
        ...(titles.get(id) ?? []),
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['composition-content'], dataCompositionContent: '' },
          children: content,
        },
        {
          type: 'element',
          tagName: 'template',
          properties: { dataCompositionOriginal: '' },
          children: [],
          content: { type: 'root', children: originals.get(id) ?? [] },
        },
      ];
    }
    for (const cue of cueNodes) cue.properties.hidden = true;
    stage.properties.style = `--composition-rows: ${Math.max(1, objects.filter((o) => !['code', 'detail'].includes(String(o.properties.dataRole))).length)}`;
    stage.properties.dataComposition = String(stage.properties.dataKind);
    stage.properties.dataCompositionId = String(stage.properties.dataId);
    prependDirectiveTitle(stage);
    const title = stage.children.filter((c) => c.type === 'element' && c.tagName === 'h3');
    stage.children = [
      ...title,
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['composition-stage'], dataCompositionStage: '' },
        children: objects,
      },
      ...cueNodes,
    ];
  });
}
export const composition = defineBlock({
  definition: definition('composition', [
    identityAttribute('id', 'Composition id for film selection.'),
    titleAttribute,
    enumAttribute(
      'kind',
      'Meaning of the composition; layout is package-owned.',
      COMPOSITIONS,
      'diagram-code',
    ),
  ]),
  validate,
  finalize,
  feature: 'composition',
  staticEquivalent: 'Final object values and all explanatory Markdown, without moving overlays.',
  examples: [example],
});
export const compositionObject = defineBlock({
  definition: definition(
    'object',
    [
      identityAttribute('id', 'Local object name.'),
      titleAttribute,
      enumAttribute(
        'role',
        'Semantic place in the layout.',
        ['visual', 'code', 'source', 'result', 'detail'],
        'visual',
      ),
    ],
    false,
    'composition',
  ),
  enhance: prependDirectiveTitle,
  feature: 'composition',
  staticEquivalent: 'An object with its final content.',
  examples: [example],
});
export const compositionCue = defineBlock({
  definition: definition(
    'cue',
    [
      at,
      requiredEnumAttribute('action', 'Directed operation.', COMPOSITION_ACTIONS),
      textAttribute('target', 'Local object name.', true),
      textAttribute('to', 'Destination object for pair actions.', false),
      textAttribute('value', 'Replacement text or connection label.', false),
      {
        ...textAttribute('lines', 'Code line ranges, such as 2-4,7 (1–999).', false),
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: 1,
          maxLength: 80,
          pattern:
            '^[1-9][0-9]{0,2}(?:-[1-9][0-9]{0,2})?(?:\\s*,\\s*[1-9][0-9]{0,2}(?:-[1-9][0-9]{0,2})?)*$',
        },
      },
      duration,
    ],
    true,
    'composition',
  ),
  feature: 'composition',
  staticEquivalent: 'The authored action is reflected in the final object state.',
  examples: [example],
});
