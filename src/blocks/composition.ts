import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import {
  COMPOSITIONS,
  COMPOSITION_ACTIONS,
  COMPOSITION_EMPHASIS,
  COMPOSITION_TRACE_EFFECTS,
  COMPOSITION_ANCHOR,
  compositionFrame,
  compositionAddress,
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
  parent?: string | readonly [string, ...string[]],
): DirectiveDefinition {
  return {
    name,
    description:
      name === 'composition'
        ? 'A directed, responsive explanation made of named objects and timed actions.'
        : name === 'object'
          ? 'Named Markdown object on a composition stage.'
          : name === 'slot'
            ? 'Named changing value inside a stable object; content is independent of its owner.'
            : name === 'scene-group'
              ? 'A meaningful group of scene objects with a responsive package-owned arrangement.'
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
  const groups = children.filter((c) => c.name === 'scene-group');
  const objects = children.flatMap((c) =>
    c.name === 'object'
      ? [c]
      : c.name === 'scene-group'
        ? (c.children ?? []).filter(isDirectiveNode).filter((n) => n.name === 'object')
        : [],
  );
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
  if (
    (node.children ?? []).some(
      (c) => !isDirectiveNode(c) || !['object', 'scene-group', 'cue'].includes(c.name),
    )
  )
    fail(
      node,
      'Put blocks inside an object; a composition directly holds objects, scene groups and cues.',
    );
  for (const group of groups) {
    if ((group.children ?? []).some((c) => !isDirectiveNode(c) || c.name !== 'object'))
      fail(group, 'A scene-group directly holds objects. Put explanations inside an object.');
    if (!(group.children ?? []).some((c) => isDirectiveNode(c) && c.name === 'object'))
      fail(group, 'A scene-group needs at least one object.');
  }
  const slots = new Map(
    objects.map((o) => [
      String(context.attributes(o)?.id),
      (o.children ?? [])
        .filter(isDirectiveNode)
        .filter((n) => n.name === 'slot')
        .map((n) => String(context.attributes(n)?.id)),
    ]),
  );
  for (const object of objects) {
    const names = slots.get(String(context.attributes(object)?.id)) ?? [];
    if (new Set(names).size !== names.length)
      fail(object, 'Slot ids must be unique inside an object.');
  }
  for (const cue of cues) {
    const a = context.attributes(cue);
    if (a === undefined) continue;
    if (!ids.includes(String(a.target))) fail(cue, `Unknown composition object: ${a.target}.`);
    const hasSlot = (owner: unknown, slot: unknown) =>
      (slots.get(String(owner)) ?? []).includes(String(slot));
    if (a.slot !== undefined && !hasSlot(a.target, a.slot)) fail(cue, 'Unknown target slot.');
    if (a.toSlot !== undefined && !hasSlot(a.to, a.toSlot)) fail(cue, 'Unknown destination slot.');
    if (
      (a.slot !== undefined || a.toSlot !== undefined) &&
      !['copy', 'transfer', 'replace'].includes(String(a.action))
    )
      fail(cue, 'slot and toSlot belong to value replacement, copy or transfer.');
    if (a.toSlot !== undefined && !['copy', 'transfer'].includes(String(a.action)))
      fail(cue, 'toSlot belongs to copy or transfer.');
    if (
      ['copy', 'transfer', 'replace'].includes(String(a.action)) &&
      a.slot === undefined &&
      (slots.get(String(a.target))?.length ?? 0) > 0
    )
      fail(cue, 'Address a slot to change or move a value inside a stable object.');
    if (
      ['copy', 'transfer'].includes(String(a.action)) &&
      a.toSlot === undefined &&
      (slots.get(String(a.to))?.length ?? 0) > 0
    )
      fail(cue, 'Address the destination slot to preserve its stable owner.');
    const pair = ['copy', 'transfer', 'connect', 'compare', 'trace'].includes(String(a.action));
    if (
      pair &&
      (!ids.includes(String(a.to)) ||
        (a.to === a.target && (a.slot === undefined || a.slot === a.toSlot)))
    )
      fail(cue, 'This action needs a different named destination object.');
    if (!pair && a.to !== undefined)
      fail(cue, 'to belongs to copy, transfer, connect, compare or trace.');
    if (a.emphasis !== undefined && !['focus', 'compare'].includes(String(a.action)))
      fail(cue, 'emphasis belongs to focus or compare.');
    if (a.effect !== undefined && a.action !== 'trace') fail(cue, 'effect belongs to trace.');
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
    ...(n.properties.dataSlot === undefined ? {} : { slot: String(n.properties.dataSlot) }),
    ...(n.properties.dataToSlot === undefined ? {} : { toSlot: String(n.properties.dataToSlot) }),
    ...(n.properties.dataValue === undefined ? {} : { value: String(n.properties.dataValue) }),
    ...(n.properties.dataLines === undefined ? {} : { lines: String(n.properties.dataLines) }),
    ...(n.properties.dataEmphasis === undefined
      ? {}
      : { emphasis: String(n.properties.dataEmphasis) as NonNullable<CompositionCue['emphasis']> }),
    ...(n.properties.dataEffect === undefined
      ? {}
      : { effect: String(n.properties.dataEffect) as NonNullable<CompositionCue['effect']> }),
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
    const objects = stage.children.flatMap((c) =>
      c.type === 'element' && c.properties.dataSemantic === 'object'
        ? [c]
        : c.type === 'element' && c.properties.dataSemantic === 'scene-group'
          ? c.children.filter(
              (n): n is Element => n.type === 'element' && n.properties.dataSemantic === 'object',
            )
          : [],
    );
    const regions = objects.flatMap((o) => [
      {
        node: o,
        id: String(o.properties.dataId),
        slots: o.children.filter(
          (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'slot',
        ),
      },
      ...o.children
        .filter((c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'slot')
        .map((n) => ({
          node: n,
          id: compositionAddress(String(o.properties.dataId), String(n.properties.dataId)),
          slots: [] as Element[],
        })),
    ]);
    const cueNodes = stage.children.filter(
      (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'cue',
    );
    const titles = new Map(
      regions.map(({ node: o, id }) => [
        id,
        o.children.filter((c) => c.type === 'element' && c.tagName === 'h3'),
      ]),
    );
    const originals = new Map(
      regions.map(({ node: o, id }) => [
        id,
        structuredClone(
          o.children.filter(
            (c) =>
              !(
                c.type === 'element' &&
                (c.tagName === 'h3' || c.properties.dataSemantic === 'slot')
              ),
          ),
        ),
      ]),
    );
    const frame = compositionFrame(
      [...originals.keys()],
      cueNodes.map(cueOf),
      Number.POSITIVE_INFINITY,
    );
    for (const { node: object, id, slots } of regions) {
      object.properties[
        object.properties.dataSemantic === 'slot' ? 'dataCompositionSlot' : 'dataCompositionObject'
      ] = id;
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
        ...slots,
        {
          type: 'element',
          tagName: 'template',
          properties: { dataCompositionOriginal: '' },
          children: [],
          content: { type: 'root', children: originals.get(id) ?? [] },
        },
      ];
    }
    for (const group of stage.children.filter(
      (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'scene-group',
    )) {
      const members = group.children.filter(
        (c): c is Element => c.type === 'element' && c.properties.dataSemantic === 'object',
      );
      group.children = [
        ...group.children.filter((c) => c.type === 'element' && c.tagName === 'h3'),
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['scene-group-objects'] },
          children: members,
        },
      ];
    }
    for (const cue of cueNodes) cue.properties.hidden = true;
    stage.properties.style = `--composition-rows: ${Math.max(1, objects.filter((o) => !['code', 'detail'].includes(String(o.properties.dataRole))).length)}`;
    const spatialItems = stage.children.filter(
      (c) =>
        c.type === 'element' &&
        (c.properties.dataSemantic === 'scene-group' ||
          (c.properties.dataSemantic === 'object' && c.properties.dataRole !== 'code')),
    ).length;
    stage.properties.style += `;--composition-columns: ${Math.max(1, Math.min(3, spatialItems))}`;
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
        children: stage.children.filter(
          (c): c is Element =>
            c.type === 'element' &&
            ['object', 'scene-group'].includes(String(c.properties.dataSemantic)),
        ),
      },
      ...cueNodes,
    ];
  });
}
const stableExample = `::::::composition{id="stable" layout="column"}
:::::scene-group{id="owners" title="Independent owners" layout="row"}
::::object{id="original" title="Original"}
Keeps its value.
:::slot{id="value"}
Glow + shadow
:::
::::
::::object{id="local" title="Local"}
Owns the edited copy.
:::slot{id="value"}
Waiting
:::
::::
:::::
::cue{at="b2" action="copy" target="original" slot="value" to="local" toSlot="value"}
::cue{at="b3" action="replace" target="local" slot="value" value="Glow + new shadow"}
::::::`;
const layoutAttributes = [
  enumAttribute(
    'layout',
    'Spatial arrangement independent of the scene meaning; rows wrap on compact displays.',
    ['auto', 'row', 'column', 'grid'],
    'auto',
  ),
  enumAttribute(
    'align',
    'Shared cross-axis alignment; start preserves a common reading edge.',
    ['start', 'center', 'stretch'],
    'start',
  ),
] as const;
export const compositionGroup = defineBlock({
  definition: definition(
    'scene-group',
    [identityAttribute('id', 'Group identity.'), titleAttribute, ...layoutAttributes],
    false,
    'composition',
  ),
  enhance: prependDirectiveTitle,
  feature: 'composition',
  staticEquivalent: 'Related objects retained in their named group.',
  examples: [stableExample],
});
export const compositionSlot = defineBlock({
  definition: definition(
    'slot',
    [identityAttribute('id', 'Local value slot inside its stable owner.'), titleAttribute],
    false,
    'object',
  ),
  enhance: prependDirectiveTitle,
  feature: 'composition',
  staticEquivalent: 'The final value inside its unchanged owner.',
  examples: [stableExample],
});
export const composition = defineBlock({
  definition: definition('composition', [
    identityAttribute('id', 'Composition id for film selection.'),
    ...layoutAttributes,
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
    ['composition', 'scene-group'],
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
      textAttribute('slot', 'Local changing slot inside the target object.', false),
      textAttribute('toSlot', 'Local changing slot inside the destination object.', false),
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
      {
        ...textAttribute(
          'emphasis',
          'Focus treatment: preserve context by default; dim is explicit, none clears attention.',
          false,
        ),
        constraint: { kind: 'enum', values: COMPOSITION_EMPHASIS },
      },
      {
        ...textAttribute(
          'effect',
          'Trace style: moving beam, pulse or packet; follows the connection direction.',
          false,
        ),
        constraint: { kind: 'enum', values: COMPOSITION_TRACE_EFFECTS },
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
