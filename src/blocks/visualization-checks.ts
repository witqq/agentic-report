import { DIAGRAM_CONTRACT } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import type { BlockAttributeValues, BlockValidationContext, BlockVerdict } from './define-block.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

interface VisualizationContext {
  readonly attributes: (node: DirectiveNode) => BlockAttributeValues;
  readonly fail: (node: DirectiveNode, message: string, remediation: string) => AgenticReportError;
  readonly warn: (node: DirectiveNode, code: string, message: string, remediation: string) => void;
}

interface ChartSubject extends VisualizationContext {
  readonly chart: DirectiveNode;
  readonly series: readonly DirectiveNode[];
  readonly chartType: string;
}

interface ChartSeriesSubject extends VisualizationContext {
  readonly seriesNode: DirectiveNode;
  readonly points: readonly DirectiveNode[];
  readonly chartType: string;
  readonly canonicalLabels: () => readonly string[] | undefined;
  readonly rememberLabels: (labels: readonly string[]) => void;
}

interface DiagramEdgeSubject extends VisualizationContext {
  readonly edge: DirectiveNode;
  readonly known: ReadonlySet<string>;
  readonly type: string;
}

interface FlowDiagramSubject extends VisualizationContext {
  readonly diagram: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly nodes: readonly DirectiveNode[];
  readonly edges: readonly DirectiveNode[];
}

interface FlowNodeSubject extends VisualizationContext {
  readonly node: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly knownGroups: ReadonlySet<string>;
}

interface FlowGroupSubject extends VisualizationContext {
  readonly group: DirectiveNode;
  readonly nodes: readonly DirectiveNode[];
}

interface DiagramLegendSubject extends VisualizationContext {
  readonly diagram: DirectiveNode;
  readonly legends: readonly DirectiveNode[];
  readonly items: readonly DirectiveNode[];
}

interface LegendItemSubject extends VisualizationContext {
  readonly item: DirectiveNode;
  readonly earlier: readonly DirectiveNode[];
}

interface SequenceDiagramSubject extends VisualizationContext {
  readonly diagram: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly participants: readonly DirectiveNode[];
  readonly messages: readonly DirectiveNode[];
}

interface SequenceParticipantSubject extends VisualizationContext {
  readonly participant: DirectiveNode;
}

interface SequenceMessageSubject extends VisualizationContext {
  readonly message: DirectiveNode;
}

/** Series count and pie arity are separate questions about the same chart. */
const chartRules = declareAuthoredRules<ChartSubject>({
  subject: 'chart',
  rules: [
    {
      id: 'pie-single-series',
      check: ({ chart, series, chartType, fail }) =>
        chartType === 'pie' && series.length !== 1
          ? fail(
              chart,
              'Pie charts require exactly one series.',
              'Keep one series or use a bar chart.',
            )
          : undefined,
    },
  ],
});

/**
 * The rules of one chart series. Label uniqueness, pie values and alignment with the first series
 * are independent readings of the same series; only alignment needs the labels this series declares,
 * which is why it names that dependency instead of relying on statement order.
 */
const chartSeriesRules = declareAuthoredRules<ChartSeriesSubject>({
  subject: 'chart/series',
  rules: [
    {
      id: 'unique-point-labels',
      check: ({ seriesNode, points, attributes, fail }) => {
        const labels = points.map((point) => String(attributes(point).label));
        return new Set(labels).size === labels.length
          ? undefined
          : fail(
              seriesNode,
              'Chart point labels must be unique within each series.',
              'Use each category label once per series.',
            );
      },
    },
    {
      id: 'pie-values',
      check: ({ seriesNode, points, chartType, attributes, fail }) => {
        if (chartType !== 'pie') return undefined;
        const values = points.map((point) => Number(attributes(point).value));
        return values.some((value) => value < 0) || values.every((value) => value === 0)
          ? fail(
              seriesNode,
              'Pie chart values must be non-negative and include at least one positive value.',
              'Use zero or positive values, or select a bar or line chart.',
            )
          : undefined;
      },
    },
    {
      id: 'aligned-categories',
      dependsOn: ['unique-point-labels'],
      check: ({ seriesNode, points, attributes, canonicalLabels, rememberLabels, fail }) => {
        const labels = points.map((point) => String(attributes(point).label));
        const canonical = canonicalLabels();
        if (canonical === undefined) {
          rememberLabels(labels);
          return undefined;
        }
        return labels.length !== canonical.length ||
          labels.some((label, index) => label !== canonical[index])
          ? fail(
              seriesNode,
              'Every chart series must use the same point labels in the same order.',
              'Align this series with the first series category list.',
            )
          : undefined;
      },
    },
  ],
});

/**
 * Reference validity and self-connection are separate readings of the same edge. A sequence accepts a
 * message to its own participant as a step inside it; a flow draws a connection to its own node as a
 * loop on the node, a step that repeats. The contract decides; the rule only reads it.
 */
const diagramEdgeRules = declareAuthoredRules<DiagramEdgeSubject>({
  subject: 'diagram/edge',
  rules: [
    {
      id: 'known-endpoints',
      check: ({ edge, known, attributes, fail }) => {
        const from = String(attributes(edge).from);
        const to = String(attributes(edge).to);
        return known.has(from) && known.has(to)
          ? undefined
          : fail(
              edge,
              `Diagram edge references an unknown node: ${!known.has(from) ? from : to}.`,
              'Use ids declared by node directives in this diagram.',
            );
      },
    },
    {
      id: 'self-connection',
      check: ({ edge, type, attributes, fail }) => {
        const from = String(attributes(edge).from);
        const to = String(attributes(edge).to);
        const selfConnectionAllowed =
          type === 'sequence'
            ? DIAGRAM_CONTRACT.sequence.selfMessages
            : DIAGRAM_CONTRACT.flow.selfEdges;
        return from === to && !selfConnectionAllowed
          ? fail(
              edge,
              'Flow diagram self-edges are not supported.',
              'Connect two distinct nodes, or use type="sequence" to show a step inside one participant.',
            )
          : undefined;
      },
    },
  ],
});

/** Size, grouping arity and the default view are independent questions about one flow diagram. */
const flowDiagramRules = declareAuthoredRules<FlowDiagramSubject>({
  subject: 'diagram/flow',
  rules: [
    {
      id: 'layout-or-direction',
      check: ({ diagram, fail }) =>
        diagram.attributes?.layout !== undefined &&
        diagram.attributes?.layout !== null &&
        diagram.attributes?.direction !== undefined &&
        diagram.attributes?.direction !== null
          ? fail(
              diagram,
              'A flow diagram names its default view once: layout and direction cannot both be set.',
              'Keep layout="…"; direction is its older spelling.',
            )
          : undefined,
    },
    {
      id: 'node-count',
      check: ({ diagram, nodes, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return nodes.length < contract.nodes.minimum || nodes.length > contract.nodes.maximum
          ? fail(
              diagram,
              `Flow diagrams require ${contract.nodes.minimum} to ${contract.nodes.maximum} nodes.`,
              'Add nodes or split a larger flow.',
            )
          : undefined;
      },
    },
    {
      id: 'edge-count',
      check: ({ diagram, edges, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return edges.length > contract.edges.maximum
          ? fail(
              diagram,
              `Flow diagrams support at most ${contract.edges.maximum} edges.`,
              'Split the flow or remove non-essential connections.',
            )
          : undefined;
      },
    },
    {
      id: 'group-count',
      check: ({ diagram, groups, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return groups.length > contract.groups.maximum
          ? fail(
              diagram,
              `Flow diagrams support at most ${contract.groups.maximum} groups.`,
              'Merge related groups or split the flow into two diagrams.',
            )
          : undefined;
      },
    },
  ],
});

/** One node's group assignment, read against the groups the diagram declares. */
const flowNodeRules = declareAuthoredRules<FlowNodeSubject>({
  subject: 'diagram/flow/node',
  rules: [
    {
      id: 'group-assignment',
      check: ({ node, knownGroups, attributes, fail }) => {
        const group = attributes(node).group;
        // A node may stand outside every group; a named group must be one the diagram declares.
        return group === undefined || knownGroups.has(String(group))
          ? undefined
          : fail(
              node,
              `Diagram node references an undeclared group: ${String(group)}.`,
              'Declare the group or remove the group attribute.',
            );
      },
    },
  ],
});

/** Whether a group holds nodes, read from the node assignments the diagram accepted. */
const flowGroupRules = declareAuthoredRules<FlowGroupSubject>({
  subject: 'diagram/flow/group',
  rules: [
    {
      id: 'group-membership',
      check: ({ group, nodes, attributes, fail }) => {
        const id = String(attributes(group).id);
        return nodes.some((node) => attributes(node).group === id)
          ? undefined
          : fail(
              group,
              `Diagram group has no nodes: ${id}.`,
              'Assign at least one node to this group.',
            );
      },
    },
  ],
});

/** How many legends and entries one diagram declares; each entry is read on its own below. */
const diagramLegendRules = declareAuthoredRules<DiagramLegendSubject>({
  subject: 'diagram/legend',
  rules: [
    {
      id: 'legend-count',
      check: ({ diagram, legends, fail }) =>
        legends.length > DIAGRAM_CONTRACT.legend.maximumPerDiagram
          ? fail(
              legends[1] ?? diagram,
              'A diagram accepts at most one legend directive.',
              'Keep one legend and move its title and policy there.',
            )
          : undefined,
    },
    {
      id: 'item-count',
      check: ({ diagram, items, fail }) =>
        items.length > DIAGRAM_CONTRACT.legend.maximumItems
          ? fail(
              items[DIAGRAM_CONTRACT.legend.maximumItems] ?? diagram,
              `A diagram legend accepts at most ${DIAGRAM_CONTRACT.legend.maximumItems} items.`,
              'Name only the kinds a reader needs to tell apart.',
            )
          : undefined,
    },
  ],
});

/** One legend entry names exactly one kind, once, and a node emphasis always needs words. */
const legendItemRules = declareAuthoredRules<LegendItemSubject>({
  subject: 'diagram/legend-item',
  rules: [
    {
      id: 'one-subject',
      check: ({ item, attributes, fail }) => {
        const values = attributes(item);
        const subjects = [values.edge, values.node, values.status].filter(
          (value) => value !== undefined,
        );
        return subjects.length !== 1
          ? fail(
              item,
              'A legend item names exactly one connection kind (edge), one node emphasis (node) or one node status (status).',
              'Set one of edge="…", node="…" or status="…" on this legend item.',
            )
          : undefined;
      },
    },
    {
      id: 'node-label',
      dependsOn: ['one-subject'],
      check: ({ item, attributes, fail }) => {
        const values = attributes(item);
        return values.node !== undefined && values.label === undefined
          ? fail(
              item,
              'A node emphasis has no package meaning, so its legend item needs a label.',
              'Add label="…" saying what this emphasis marks.',
            )
          : undefined;
      },
    },
    {
      id: 'hidden-edge-only',
      dependsOn: ['one-subject'],
      check: ({ item, attributes, fail }) => {
        const values = attributes(item);
        if (values.hidden !== true) return undefined;
        return values.node !== undefined ||
          values.status !== undefined ||
          values.label !== undefined
          ? fail(
              item,
              'Only a connection kind without a label can be hidden from the legend.',
              'Remove hidden="true", or remove the node or label attribute.',
            )
          : undefined;
      },
    },
    {
      id: 'unique-subject',
      dependsOn: ['one-subject'],
      check: ({ item, earlier, attributes, fail }) => {
        const values = attributes(item);
        const same = earlier.some(
          (other) =>
            attributes(other).edge === values.edge &&
            attributes(other).node === values.node &&
            attributes(other).status === values.status,
        );
        return same
          ? fail(
              item,
              `The legend already has an item for ${String(values.edge ?? values.node ?? values.status)}.`,
              'Keep one item per connection kind, node emphasis or node status.',
            )
          : undefined;
      },
    },
  ],
});

/** Group support, direction and the two arities are independent readings of one sequence diagram. */
const sequenceDiagramRules = declareAuthoredRules<SequenceDiagramSubject>({
  subject: 'diagram/sequence',
  rules: [
    {
      id: 'no-groups',
      check: ({ diagram, groups, fail }) =>
        !DIAGRAM_CONTRACT.sequence.groups && groups.length > 0
          ? fail(
              groups[0] ?? diagram,
              'Sequence diagrams do not support subsystem groups.',
              'Remove group directives and node group attributes.',
            )
          : undefined,
    },
    {
      id: 'no-direction',
      check: ({ diagram, fail }) =>
        DIAGRAM_CONTRACT.sequence.direction === 'forbidden' &&
        diagram.attributes?.direction !== undefined
          ? fail(
              diagram,
              'Sequence diagrams do not accept a flow direction.',
              'Remove the direction attribute from this sequence diagram.',
            )
          : undefined,
    },
    {
      id: 'no-layout',
      check: ({ diagram, fail }) =>
        diagram.attributes?.layout !== undefined && diagram.attributes?.layout !== null
          ? fail(
              diagram,
              'Sequence diagrams do not accept a flow layout.',
              'Remove the layout attribute from this sequence diagram.',
            )
          : undefined,
    },
    {
      id: 'participant-count',
      check: ({ diagram, participants, fail }) => {
        const contract = DIAGRAM_CONTRACT.sequence;
        return participants.length < contract.participants.minimum ||
          participants.length > contract.participants.maximum
          ? fail(
              diagram,
              `Sequence diagrams require ${contract.participants.minimum} to ${contract.participants.maximum} participants.`,
              'Adjust the number of node participants.',
            )
          : undefined;
      },
    },
    {
      id: 'message-count',
      check: ({ diagram, messages, fail }) => {
        const contract = DIAGRAM_CONTRACT.sequence;
        return messages.length < contract.messages.minimum ||
          messages.length > contract.messages.maximum
          ? fail(
              diagram,
              `Sequence diagrams require ${contract.messages.minimum} to ${contract.messages.maximum} messages.`,
              'Adjust the number of edge messages.',
            )
          : undefined;
      },
    },
  ],
});

const sequenceParticipantRules = declareAuthoredRules<SequenceParticipantSubject>({
  subject: 'diagram/sequence/participant',
  rules: [
    {
      id: 'no-participant-group',
      check: ({ participant, attributes, fail }) =>
        !DIAGRAM_CONTRACT.sequence.participantGroups && attributes(participant).group !== undefined
          ? fail(
              participant,
              'Sequence participants do not accept a group.',
              'Remove the group attribute.',
            )
          : undefined,
    },
  ],
});

const sequenceMessageRules = declareAuthoredRules<SequenceMessageSubject>({
  subject: 'diagram/sequence/message',
  rules: [
    {
      id: 'label-required',
      check: ({ message, attributes, fail }) =>
        DIAGRAM_CONTRACT.sequence.messages.labelRequired && attributes(message).label === undefined
          ? fail(message, 'Sequence messages require a label.', 'Add a label to this edge message.')
          : undefined,
    },
  ],
});

/**
 * The data checks of the three visualizations. They are one check shared by chart, diagram and
 * timeline, so a refused visualization skips every visualization nested inside it.
 */
export function validateVisualization(
  candidate: DirectiveNode,
  blockContext: BlockValidationContext,
): BlockVerdict {
  const context: VisualizationContext = { attributes, fail, warn };
  if (!fullyInterpreted(candidate)) return 'refused';
  const found: AgenticReportError[] = [];
  if (candidate.name === 'chart') validateChart(candidate, found);
  if (candidate.name === 'diagram') validateDiagram(candidate, found);
  if (candidate.name === 'timeline') validateTimeline(candidate, found);
  blockContext.report(found);
  return found.length === 0 ? 'accepted' : 'refused';

  function validateChart(chart: DirectiveNode, found: AgenticReportError[]): void {
    const series = requireBoundedChildren(chart, 'series', 1, 6, found);
    if (series === undefined) return;
    const chartType = String(attributes(chart).type);
    // Series are read against an accepted chart shape: with the arity of a pie chart refused, the
    // second series is not a series the author meant to align, and judging it would only restate
    // the refusal.
    if (runAuthoredRules(chartRules, { ...context, chart, series, chartType }, found) === 'refused')
      return;
    let canonicalLabels: readonly string[] | undefined;
    // Series are read against the labels of the first accepted series, so a refused series says
    // nothing about the next one: the chart answers for each of them.
    for (const seriesNode of series) {
      const points = requireBoundedChildren(seriesNode, 'point', 1, 12, found);
      if (points === undefined) continue;
      runAuthoredRules(
        chartSeriesRules,
        {
          ...context,
          seriesNode,
          points,
          chartType,
          canonicalLabels: () => canonicalLabels,
          rememberLabels: (labels) => {
            canonicalLabels = labels;
          },
        },
        found,
      );
    }
  }

  /**
   * Лента времени: события и пункты её легенды. Пункт легенды ленты называет выделение события
   * (`event`) и обязан сказать его смысл словами; выделение события без пункта легенды — предупреждение:
   * один цвет точки читателю ничего не говорит.
   */
  function validateTimeline(timeline: DirectiveNode, found: AgenticReportError[]): void {
    const children = requireOnlyDirectiveChildren(timeline, ['event', 'legend-item'], found);
    if (children === undefined) return;
    const events = children.filter((child) => child.name === 'event');
    if (events.length < 1 || events.length > 20) {
      found.push(
        fail(
          timeline,
          `A timeline holds 1 to 20 events; this one has ${events.length}.`,
          'Keep between 1 and 20 event directives in the timeline.',
        ),
      );
      return;
    }
    const named = new Set<string>();
    for (const item of children.filter((child) => child.name === 'legend-item')) {
      const values = attributes(item);
      if (
        values.event === undefined ||
        values.label === undefined ||
        values.edge !== undefined ||
        values.node !== undefined ||
        values.status !== undefined
      ) {
        found.push(
          fail(
            item,
            'A timeline legend item names one event emphasis (event) in words (label).',
            'Write ::legend-item{event="success" label="Shipped"} inside the timeline.',
          ),
        );
        continue;
      }
      named.add(String(values.event));
    }
    const missing = new Set(
      events
        .map((event) => String(attributes(event).kind ?? 'neutral'))
        .filter((kind) => kind !== 'neutral' && !named.has(kind)),
    );
    for (const kind of missing)
      warn(
        timeline,
        'LEGEND_ENTRY_MISSING',
        `Timeline events are marked ${kind}, but no legend item says what ${kind} means.`,
        `Add ::legend-item{event="${kind}" label="…"} inside the timeline, or remove kind="${kind}".`,
      );
  }

  function validateDiagram(diagram: DirectiveNode, found: AgenticReportError[]): void {
    const children = requireOnlyDirectiveChildren(
      diagram,
      ['group', 'node', 'edge', 'legend', 'legend-item', 'zoom'],
      found,
    );
    if (children === undefined) return;
    const type = String(attributes(diagram).type);
    const groups = children.filter((child) => child.name === 'group');
    const nodes = children.filter((child) => child.name === 'node');
    const edges = children.filter((child) => child.name === 'edge');
    const ids = nodes.map((node) => String(attributes(node).id));
    if (new Set(ids).size !== ids.length) {
      found.push(
        fail(diagram, 'Diagram node ids must be unique.', 'Give every node a distinct id.'),
      );
    }
    validateEdgeIds(edges, new Set(ids), found);
    validateZooms(
      diagram,
      type,
      children.filter((child) => child.name === 'zoom'),
      new Set(ids),
      found,
    );
    validatePulse(diagram, type, new Set(ids), edges, found);
    const groupIds = groups.map((group) => String(attributes(group).id));
    if (new Set(groupIds).size !== groupIds.length) {
      found.push(
        fail(diagram, 'Diagram group ids must be unique.', 'Give every group a distinct id.'),
      );
    }
    if (type === 'flow') validateFlowDiagram(diagram, groups, nodes, edges, groupIds, found);
    else validateSequenceDiagram(diagram, groups, nodes, edges, found);
    const legends = children.filter((child) => child.name === 'legend');
    const legendItems = children.filter((child) => child.name === 'legend-item');
    runAuthoredRules(
      diagramLegendRules,
      { ...context, diagram, legends, items: legendItems },
      found,
    );
    for (const [index, item] of legendItems.entries()) {
      runAuthoredRules(
        legendItemRules,
        { ...context, item, earlier: legendItems.slice(0, index) },
        found,
      );
    }
    // Выделение узла без пункта легенды — предупреждение: один цвет читателю ничего не говорит.
    const namedKinds = new Set(legendItems.map((item) => String(attributes(item).node)));
    const unnamed = new Set(
      nodes
        .map((node) => String(attributes(node).kind ?? 'neutral'))
        .filter((kind) => kind !== 'neutral' && !namedKinds.has(kind)),
    );
    for (const kind of unnamed)
      warn(
        diagram,
        'LEGEND_ENTRY_MISSING',
        `Diagram nodes are marked ${kind}, but no legend item says what ${kind} means.`,
        `Add ::legend-item{node="${kind}" label="…"} inside the diagram, or remove kind="${kind}".`,
      );
    const known = new Set(ids);
    // Edges are read against the declared nodes, not against each other, so every edge answers for
    // itself and a refused one does not hide the next.
    for (const edge of edges) {
      runAuthoredRules(diagramEdgeRules, { ...context, edge, known, type }, found);
    }
  }

  /**
   * Connection identities: a beat focus names nodes and connections in one list, so an edge id is
   * unique among edges and never equal to a node id — otherwise one name would light two things.
   */
  function validateEdgeIds(
    edges: readonly DirectiveNode[],
    nodeIds: ReadonlySet<string>,
    found: AgenticReportError[],
  ): void {
    const seen = new Set<string>();
    for (const edge of edges) {
      const id = attributes(edge).id;
      if (id === undefined) continue;
      const name = String(id);
      if (seen.has(name) || nodeIds.has(name)) {
        found.push(
          fail(
            edge,
            `Diagram connection id ${name} is already the id of ${nodeIds.has(name) ? 'a node' : 'another connection'}.`,
            'Give every connection id a name no node or other connection of this diagram uses.',
          ),
        );
      }
      seen.add(name);
    }
  }

  /**
   * Пролёт: у потока не больше одного, он раскрывает объявленный узел, а внутри — такой же поток по
   * тем же правилам. Пролёт сам ведёт схему по прокрутке, поэтому с прорисовкой `draw` не сочетается.
   */
  function validateZooms(
    diagram: DirectiveNode,
    type: string,
    zooms: readonly DirectiveNode[],
    nodeIds: ReadonlySet<string>,
    found: AgenticReportError[],
  ): void {
    if (zooms.length === 0) return;
    const [first] = zooms;
    if (type !== 'flow') {
      found.push(
        fail(
          first ?? diagram,
          'Only a flow diagram opens a node into a nested flow.',
          'Remove the zoom or use a flow diagram.',
        ),
      );
      return;
    }
    if (zooms.length > DIAGRAM_CONTRACT.zoom.maximumPerDiagram) {
      found.push(
        fail(
          zooms[1] ?? diagram,
          `A diagram opens at most ${DIAGRAM_CONTRACT.zoom.maximumPerDiagram} node into a nested flow.`,
          'Keep one zoom, or split the story into two diagrams.',
        ),
      );
    }
    if (attributes(diagram).draw === 'scroll') {
      found.push(
        fail(
          diagram,
          'A diagram with a zoom is already a scroll scene, so it cannot also draw its connections by scroll.',
          'Remove draw="scroll" or the zoom.',
        ),
      );
    }
    for (const zoom of zooms) {
      if (blockContext.attributes(zoom) === undefined) continue;
      const target = String(attributes(zoom).node);
      if (!nodeIds.has(target)) {
        found.push(
          fail(
            zoom,
            `The zoom opens a node the diagram does not declare: ${target}.`,
            'Name the id of a node declared in this diagram.',
          ),
        );
      }
      const parts = requireOnlyDirectiveChildren(zoom, ['group', 'node', 'edge'], found);
      if (parts === undefined) continue;
      if (parts.some((part) => blockContext.attributes(part) === undefined)) continue;
      const innerGroups = parts.filter((part) => part.name === 'group');
      const innerNodes = parts.filter((part) => part.name === 'node');
      const innerEdges = parts.filter((part) => part.name === 'edge');
      const innerIds = innerNodes.map((node) => String(attributes(node).id));
      if (new Set(innerIds).size !== innerIds.length) {
        found.push(
          fail(
            zoom,
            'Zoom node ids must be unique.',
            'Give every node inside the zoom a distinct id.',
          ),
        );
      }
      const innerGroupIds = innerGroups.map((group) => String(attributes(group).id));
      validateFlowDiagram(zoom, innerGroups, innerNodes, innerEdges, innerGroupIds, found);
      validateEdgeIds(innerEdges, new Set(innerIds), found);
      const known = new Set(innerIds);
      for (const edge of innerEdges) {
        runAuthoredRules(diagramEdgeRules, { ...context, edge, known, type: 'flow' }, found);
      }
    }
  }

  /** Маршрут импульсов: узлы этой схемы, и каждый соседний по маршруту соединён связью. */
  function validatePulse(
    diagram: DirectiveNode,
    type: string,
    nodeIds: ReadonlySet<string>,
    edges: readonly DirectiveNode[],
    found: AgenticReportError[],
  ): void {
    const written = attributes(diagram).pulse;
    if (written === undefined) return;
    if (type !== 'flow') {
      found.push(
        fail(diagram, 'Only a flow diagram runs pulses along a route.', 'Remove pulse="…".'),
      );
      return;
    }
    const route = String(written)
      .split(',')
      .map((id) => id.trim());
    const bounds = DIAGRAM_CONTRACT.pulse;
    if (route.length < bounds.minimumNodes || route.length > bounds.maximumNodes) {
      found.push(
        fail(
          diagram,
          `A pulse route names ${bounds.minimumNodes} to ${bounds.maximumNodes} nodes; this one names ${route.length}.`,
          'Name the nodes the pulses pass, in order.',
        ),
      );
      return;
    }
    const unknown = route.filter((id) => !nodeIds.has(id));
    if (unknown.length > 0) {
      found.push(
        fail(
          diagram,
          `The pulse route names nodes the diagram does not declare: ${unknown.join(', ')}.`,
          'Name ids of nodes declared in this diagram.',
        ),
      );
      return;
    }
    const joined = new Set(
      edges.map((edge) => `${String(attributes(edge).from)}\u0000${String(attributes(edge).to)}`),
    );
    for (let index = 1; index < route.length; index += 1) {
      const from = route[index - 1] ?? '';
      const to = route[index] ?? '';
      if (!joined.has(`${from}\u0000${to}`)) {
        found.push(
          fail(
            diagram,
            `The pulse route goes from ${from} to ${to}, but no connection joins them in that direction.`,
            `Add ::edge{from="${from}" to="${to}"} or name a route along existing connections.`,
          ),
        );
        return;
      }
    }
  }

  function validateFlowDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    nodes: readonly DirectiveNode[],
    edges: readonly DirectiveNode[],
    groupIds: readonly string[],
    found: AgenticReportError[],
  ): void {
    runAuthoredRules(flowDiagramRules, { ...context, diagram, groups, nodes, edges }, found);
    const knownGroups = new Set(groupIds);
    // Nodes are read against the declared groups, not against each other.
    const beforeNodes = found.length;
    for (const node of nodes) {
      runAuthoredRules(flowNodeRules, { ...context, node, groups, knownGroups }, found);
    }
    // Whether a group holds nodes is read from the very assignments just refused, so an empty group
    // beside a node without its group only repeats that refusal.
    if (found.length !== beforeNodes) return;
    for (const group of groups) {
      runAuthoredRules(flowGroupRules, { ...context, group, nodes }, found);
    }
  }

  function validateSequenceDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    participants: readonly DirectiveNode[],
    messages: readonly DirectiveNode[],
    found: AgenticReportError[],
  ): void {
    runAuthoredRules(
      sequenceDiagramRules,
      { ...context, diagram, groups, participants, messages },
      found,
    );
    // Participants and messages are read against the diagram contract, not against each other, so
    // every one of them answers for itself.
    for (const participant of participants) {
      runAuthoredRules(sequenceParticipantRules, { ...context, participant }, found);
    }
    for (const message of messages) {
      runAuthoredRules(sequenceMessageRules, { ...context, message }, found);
    }
  }

  function requireBoundedChildren(
    parent: DirectiveNode,
    childName: string,
    minimum: number,
    maximum: number,
    found: AgenticReportError[],
  ): readonly DirectiveNode[] | undefined {
    const children = requireOnlyDirectiveChildren(parent, [childName], found);
    if (children === undefined) return undefined;
    if (children.length < minimum || children.length > maximum) {
      found.push(
        fail(
          parent,
          `${parent.name} requires ${minimum} to ${maximum} ${childName} directives.`,
          `Adjust the number of direct ${childName} children.`,
        ),
      );
      return undefined;
    }
    return children;
  }

  function requireOnlyDirectiveChildren(
    parent: DirectiveNode,
    allowed: readonly string[],
    found: AgenticReportError[],
  ): readonly DirectiveNode[] | undefined {
    const children = parent.children ?? [];
    const directives = children.filter(isDirectiveNode);
    if (directives.length !== children.length) {
      found.push(
        fail(
          parent,
          `${parent.name} accepts only ${allowed.join(' or ')} directives as direct children.`,
          'Move prose into an event body or outside this data container.',
        ),
      );
      return undefined;
    }
    return directives;
  }

  function attributes(node: DirectiveNode): BlockAttributeValues {
    return blockContext.attributes(node) ?? {};
  }

  /**
   * Whether every node of this visualization reached interpretation. One that did not had its own
   * form or attributes refused already, and every reading below — node identity, edge endpoints,
   * group membership — is derived from that unmade interpretation, so the visualization is skipped
   * instead of answering about values nobody accepted.
   */
  function fullyInterpreted(root: DirectiveNode): boolean {
    if (blockContext.attributes(root) === undefined) return false;
    return (root.children ?? []).every(
      (child) => !isDirectiveNode(child) || blockContext.attributes(child) !== undefined,
    );
  }

  function fail(node: DirectiveNode, message: string, remediation: string): AgenticReportError {
    return blockContext.violation(node, 'INVALID_VISUALIZATION_DATA', message, remediation);
  }

  function warn(node: DirectiveNode, code: string, message: string, remediation: string): void {
    blockContext.warn(node, code, message, remediation);
  }
}
