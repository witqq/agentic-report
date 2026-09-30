import type { Element, Root as HastRoot } from 'hast';
import { visit } from 'unist-util-visit';

import { DIAGRAM_CONTRACT } from '../authoring/directive-contract.js';
import { DIAGRAM_MESSAGES, type DiagramMessages } from '../render/diagram-process.js';
import {
  enhanceVisualization,
  type PreparedFlow,
  prepareVisualization,
} from '../render/visualizations.js';
import {
  booleanAttribute,
  descriptionAttribute,
  enumAttribute,
  identityAttribute,
  optionalIdentityAttribute,
  requiredTitleAttribute,
  textAttribute,
  visualizationContainer,
} from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { hasClassName, stringProperty } from './hast.js';
import { validateVisualization } from './visualization-checks.js';

/**
 * The diagram family: a diagram, its groups, nodes, edges, legend and legend items. A legend item
 * also names the event emphases of a timeline.
 */

function enhanceDiagram(
  node: Element,
  context: BlockEnhancementContext<DiagramMessages>,
  prepared: PreparedFlow | undefined,
): void {
  enhanceVisualization(
    node,
    'diagram',
    context.nextInstance(),
    context.allocateId,
    context.strings,
    prepared,
    context.messages,
  );
}

/**
 * Прорисовка схемы: каждая связь получает свой отрезок пути прокрутки по порядку потока — от слоя
 * источника, — а обратные связи идут отдельной поздней фазой. Длина пути нормирована, поэтому
 * таблица стилей рисует связь одним и тем же ключевым кадром.
 */
function enhanceDrawnDiagrams(tree: HastRoot): void {
  visit(tree, 'element', (diagram: Element) => {
    if (diagram.properties.dataSemantic !== 'diagram' || diagram.properties.dataDraw !== 'scroll')
      return;
    visit(diagram, 'element', (svg: Element) => {
      if (svg.tagName !== 'svg') return;
      const layers = new Map<string, number>();
      visit(svg, 'element', (node: Element) => {
        const id = stringProperty(node, 'dataNodeId');
        const layer = Number(stringProperty(node, 'dataLayer') ?? '0');
        if (id !== undefined) layers.set(id, layer);
      });
      const edges: Element[] = [];
      visit(svg, 'element', (edge: Element) => {
        if (edge.tagName === 'path' && stringProperty(edge, 'dataFrom') !== undefined)
          edges.push(edge);
      });
      const phase = (edge: Element): number => {
        const from = layers.get(stringProperty(edge, 'dataFrom') ?? '') ?? 0;
        const to = layers.get(stringProperty(edge, 'dataTo') ?? '') ?? 0;
        return to <= from ? 1 : 0;
      };
      const ordered = [...edges].sort((left, right) => {
        const byPhase = phase(left) - phase(right);
        if (byPhase !== 0) return byPhase;
        return (
          (layers.get(stringProperty(left, 'dataFrom') ?? '') ?? 0) -
          (layers.get(stringProperty(right, 'dataFrom') ?? '') ?? 0)
        );
      });
      const span = 1 / Math.max(1, ordered.length);
      const arrows = arrowsByEdge(svg);
      for (const [index, edge] of ordered.entries()) {
        const kind = stringProperty(edge, 'dataEdgeKind');
        // Пунктир вида связи задан в единицах длины: нормированная длина пути растянула бы его в
        // сплошную линию, поэтому такие связи проявляются, а сплошные — прорисовываются.
        if (kind !== 'data' && kind !== 'event') edge.properties.pathLength = '1';
        const vars = `--draw-start: ${Math.round(index * span * 100)}%; --draw-end: ${Math.round((index + 1) * span * 100)}%`;
        // Те же границы числом: запасной путь без временной шкалы прокрутки и маркер читают их
        // сценарием и ставят связь по прогрессу, выставленному часами страницы.
        const from = (Math.round(index * span * 10_000) / 10_000).toString();
        const to = (Math.round((index + 1) * span * 10_000) / 10_000).toString();
        for (const part of [edge, ...(arrows.get(edge) ?? [])]) {
          part.properties.dataDrawPhase = phase(edge) === 1 ? 'backward' : 'forward';
          part.properties.dataDrawFrom = from;
          part.properties.dataDrawTo = to;
          const existing = stringProperty(part, 'style');
          part.properties.style = `${existing === undefined ? '' : `${existing}; `}${vars}`;
        }
      }
      const last = ordered.at(-1);
      const rest = last === undefined ? undefined : pathEnd(stringProperty(last, 'd') ?? '');
      if (rest !== undefined) svg.children.push(drawMarker(rest));
    });
  });
}

/**
 * Маркер прорисовки едет по связи, которая рисуется сейчас. В разметке он стоит в конце последней
 * связи: так его видят страница без движения, печать и браузер без сценария — неподвижным в конце.
 */
function drawMarker(at: { readonly x: number; readonly y: number }): Element {
  return {
    type: 'element',
    tagName: 'circle',
    properties: {
      cx: String(at.x),
      cy: String(at.y),
      r: '5',
      className: ['visualization-draw-marker'],
      dataDrawMarker: '',
      ariaHidden: 'true',
    },
    children: [],
  };
}

/** Последняя точка пути SVG из команд `M`, `L`, `Q`, `C` с абсолютными координатами. */
export function pathEnd(d: string): { readonly x: number; readonly y: number } | undefined {
  const numbers = d.match(/-?\d+(?:\.\d+)?/gu);
  if (numbers === null || numbers.length < 2) return undefined;
  const x = Number(numbers.at(-2));
  const y = Number(numbers.at(-1));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/** Наконечник рисуется сразу после своей связи: он проявляется вместе с ней. */
function arrowsByEdge(svg: Element): Map<Element, Element[]> {
  const result = new Map<Element, Element[]>();
  visit(svg, 'element', (parent: Element) => {
    let current: Element | undefined;
    for (const child of parent.children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'path' && stringProperty(child, 'dataFrom') !== undefined) {
        current = child;
        result.set(child, []);
      } else if (
        current !== undefined &&
        (child.tagName === 'polygon' || child.tagName === 'polyline') &&
        (hasClassName(child, 'visualization-edge-arrow') ||
          hasClassName(child, 'visualization-edge-arrow-open') ||
          hasClassName(child, 'visualization-edge-arrow-hollow'))
      ) {
        result.get(current)?.push(child);
      }
    }
  });
  return result;
}

const DIAGRAM_EXAMPLE =
  ':::::diagram{title="Request path" description="A request passes the gateway to the service." draw="scroll"}\n::group{id="edge" label="Edge"}\n::node{id="gateway" label="Gateway" group="edge" kind="accent"}\n::node{id="service" label="Service" detail="Go"}\n::edge{from="gateway" to="service" label="HTTP" kind="call"}\n::legend{title="Legend"}\n::legend-item{node="accent" label="Public entry"}\n:::::\n';

const PROCESS_EXAMPLE =
  ':::::diagram{title="Review run" description="A change goes through review and returns twice." layout="right"}\n::node{id="plan" label="Plan" status="done"}\n::node{id="build" label="Build" status="done"}\n::node{id="review" label="Review" status="review"}\n::node{id="ship" label="Ship" status="pending"}\n::edge{from="plan" to="build"}\n::edge{from="build" to="review" id="submit"}\n::edge{from="review" to="build" label="changes" count="2"}\n::edge{from="review" to="review" label="re-run" count="3"}\n::edge{from="review" to="ship"}\n:::::\n';

const ZOOM_EXAMPLE =
  '::::::diagram{title="Service" description="A request reaches the API, and the API is a small flow of its own."}\n::node{id="client" label="Client"}\n::node{id="api" label="API"}\n::node{id="store" label="Store"}\n::edge{from="client" to="api"}\n::edge{from="api" to="store"}\n:::::zoom{node="api" title="Inside the API"}\n::node{id="router" label="Router"}\n::node{id="handler" label="Handler"}\n::edge{from="router" to="handler"}\n:::::\n::::::\n';

export const diagram = defineBlock<PreparedFlow | undefined, DiagramMessages>({
  definition: visualizationContainer(
    'diagram',
    'Directed flow diagram rendered as deterministic SVG.',
    {
      attributes: [
        requiredTitleAttribute(),
        descriptionAttribute(),
        enumAttribute(
          'type',
          'Diagram form.',
          DIAGRAM_CONTRACT.types,
          DIAGRAM_CONTRACT.defaultType,
        ),
        enumAttribute(
          'direction',
          'Direction in which flow layers follow each other; auto lets the layout pick the one that reads larger on the page.',
          DIAGRAM_CONTRACT.flow.directions,
          'auto',
        ),
        enumAttribute(
          'layout',
          'Flow view shown first and printed: auto picks the clearest; down and right are layered, orthogonal routes at right angles; readers can switch.',
          DIAGRAM_CONTRACT.flow.layouts,
          'auto',
        ),
        enumAttribute(
          'spacing',
          'Layout breathing room; the package keeps a readable result at every value.',
          ['compact', 'comfortable', 'spacious'],
          'comfortable',
        ),
        enumAttribute(
          'draw',
          'Draw the connections as the diagram scrolls through the view, in flow order, with backward connections as a later phase, while a marker rides the connection being drawn; still and complete, the marker at the end, under reduced motion.',
          ['none', 'scroll'],
          'none',
        ),
        {
          name: 'pulse',
          description:
            'A route of node identities separated by commas, each joined to the next by a connection: pulses travel along it three times when the diagram comes into view; under reduced motion the route is marked still.',
          required: false,
          constraint: {
            kind: 'string',
            normalization: 'trim',
            minLength: 3,
            maxLength: 800,
            pattern: '^[a-z][a-z0-9-]{0,63}(\\s*,\\s*[a-z][a-z0-9-]{0,63})+$',
          },
          renderProperty: 'dataPulse',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
      ],
      children: 'diagram-part-directives',
    },
  ),
  validate: validateVisualization,
  prepare: (element, context) => prepareVisualization(element, context.strings),
  enhance: enhanceDiagram,
  finalize: enhanceDrawnDiagrams,
  strings: DIAGRAM_MESSAGES,
  feature: 'diagram',
  staticEquivalent:
    'The diagram drawn complete as SVG in its first view, with every connection shown and the diagram written out in words; a zoom shows the whole diagram and the inside of its node as two figures side by side.',
  examples: [DIAGRAM_EXAMPLE, PROCESS_EXAMPLE, ZOOM_EXAMPLE],
});

export const group = defineBlock({
  definition: visualizationContainer(
    'group',
    'One labelled subsystem group around some nodes of a flow diagram.',
    {
      attributes: [
        identityAttribute('id', 'Unique group identity within the diagram.'),
        textAttribute('label', 'Visible group label.', true),
      ],
      children: 'none',
      requiredParent: ['diagram', 'zoom'],
      tagName: 'span',
      forms: ['leaf'],
    },
  ),
  feature: 'diagram',
  staticEquivalent: 'A labelled frame around its nodes in the drawn diagram.',
  examples: [DIAGRAM_EXAMPLE],
});

export const node = defineBlock({
  definition: visualizationContainer('node', 'One labelled node in a flow diagram.', {
    attributes: [
      identityAttribute('id', 'Unique node identity within the diagram.'),
      textAttribute('label', 'Visible node label.', true),
      textAttribute(
        'detail',
        'Optional second line under the label, set smaller: what the node holds or does.',
        false,
      ),
      optionalIdentityAttribute(
        'group',
        'Optional subsystem group identity; nodes without one stand beside the groups.',
      ),
      enumAttribute(
        'kind',
        'Package-owned node emphasis; a legend item names what it means.',
        DIAGRAM_CONTRACT.nodeKinds,
        'neutral',
      ),
      {
        name: 'row',
        description:
          'Optional one-based flow layer; nodes sharing a row share a layer when their connections allow it.',
        required: false,
        constraint: { kind: 'integer', minimum: 1, maximum: 20 },
        renderProperty: 'dataRow',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      {
        name: 'status',
        description:
          'Where this step of a process stands: done, review, returned or pending; drawn in the theme status roles with a glyph, named in the legend in package words.',
        required: false,
        constraint: { kind: 'enum', values: DIAGRAM_CONTRACT.nodeStatuses },
        renderProperty: 'dataStatus',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
    ],
    children: 'none',
    requiredParent: ['diagram', 'zoom'],
    tagName: 'span',
    forms: ['leaf'],
  }),
  feature: 'diagram',
  staticEquivalent: 'One labelled box of the drawn diagram.',
  examples: [DIAGRAM_EXAMPLE],
});

export const edge = defineBlock({
  definition: visualizationContainer(
    'edge',
    'One directed connection between diagram nodes; from equal to to is a step that repeats, drawn as a loop on the node in a flow and on the lifeline in a sequence.',
    {
      attributes: [
        identityAttribute('from', 'Source node identity.'),
        identityAttribute('to', 'Target node identity; a flow requires a different node.'),
        textAttribute(
          'label',
          'Optional connection label, required in a sequence; a long label wraps onto several lines and is never cut.',
          false,
        ),
        enumAttribute(
          'kind',
          'What the connection means; each kind has its own package-drawn line and arrowhead.',
          DIAGRAM_CONTRACT.edgeKinds,
          DIAGRAM_CONTRACT.defaultEdgeKind,
        ),
        enumAttribute(
          'route',
          'Optional layout pull; direct keeps the connection short and straight, around lets it stretch.',
          ['auto', 'direct', 'around'],
          'auto',
        ),
        optionalIdentityAttribute(
          'id',
          'Optional connection identity, distinct from the node identities: a beat focus lights the connection by it.',
        ),
        {
          name: 'count',
          description:
            'How many times the connection was taken, written «×N» on it: a return repeated, a retry.',
          required: false,
          constraint: {
            kind: 'integer',
            minimum: DIAGRAM_CONTRACT.edgeCount.minimum,
            maximum: DIAGRAM_CONTRACT.edgeCount.maximum,
          },
          renderProperty: 'dataCount',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
      ],
      children: 'none',
      requiredParent: ['diagram', 'zoom'],
      tagName: 'span',
      forms: ['leaf'],
    },
  ),
  feature: 'diagram',
  staticEquivalent: 'One drawn connection with its arrowhead and label.',
  examples: [DIAGRAM_EXAMPLE],
});

export const legend = defineBlock({
  definition: visualizationContainer(
    'legend',
    'Optional title and policy for the diagram legend; at most one per diagram.',
    {
      attributes: [
        textAttribute('title', 'Visible legend title.', false),
        booleanAttribute(
          'auto',
          'Add the connection kinds the diagram mixes without a legend item of their own.',
          true,
        ),
      ],
      children: 'none',
      requiredParent: 'diagram',
      tagName: 'span',
      forms: ['leaf'],
    },
  ),
  feature: 'diagram',
  staticEquivalent: 'The title of the legend printed under the diagram.',
  examples: [DIAGRAM_EXAMPLE],
});

export const legendItem = defineBlock({
  definition: visualizationContainer(
    'legend-item',
    "One legend entry: names a connection kind, a node emphasis, a node status, or a timeline event emphasis in the author's words, or hides a connection kind.",
    {
      attributes: [
        {
          name: 'edge',
          description: 'Connection kind this entry names; exclusive with node.',
          required: false,
          constraint: { kind: 'enum', values: DIAGRAM_CONTRACT.edgeKinds },
          renderProperty: 'dataEdge',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
        {
          name: 'node',
          description: 'Node emphasis this entry names; exclusive with edge and requires a label.',
          required: false,
          constraint: { kind: 'enum', values: DIAGRAM_CONTRACT.nodeKinds },
          renderProperty: 'dataNode',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
        {
          name: 'status',
          description:
            "Node status this entry renames in the author's words; exclusive with edge and node.",
          required: false,
          constraint: { kind: 'enum', values: DIAGRAM_CONTRACT.nodeStatuses },
          renderProperty: 'dataStatus',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
        {
          name: 'event',
          description:
            'Timeline event emphasis this entry names, inside a timeline; requires a label.',
          required: false,
          constraint: { kind: 'enum', values: ['accent', 'success', 'warning'] },
          renderProperty: 'dataEvent',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
        textAttribute(
          'label',
          'Entry text; a connection kind without one keeps its package name.',
          false,
        ),
        booleanAttribute('hidden', 'Leave this connection kind out of the legend.', false),
      ],
      children: 'none',
      requiredParent: ['diagram', 'timeline'],
      tagName: 'span',
      forms: ['leaf'],
    },
  ),
  feature: 'diagram',
  staticEquivalent: 'One legend entry: the drawn sample and its words.',
  examples: [DIAGRAM_EXAMPLE],
});
