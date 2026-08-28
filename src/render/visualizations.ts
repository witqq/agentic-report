import type { Element, ElementContent } from 'hast';
import type { PackageStrings } from '../localization.js';

const CHART_WIDTH = 720;
const CHART_HEIGHT = 360;
const PLOT = { left: 72, top: 34, width: 600, height: 242 } as const;
const PALETTE_SIZE = 6;

interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

interface ChartSeries {
  readonly label: string;
  readonly points: readonly ChartPoint[];
}

interface DiagramNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly group?: string;
  readonly x: number;
  readonly y: number;
}

interface DiagramGroup {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export function enhanceVisualization(
  node: Element,
  semantic: string,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): boolean {
  if (semantic === 'chart') {
    enhanceChart(node, instance, allocateId, strings);
    return true;
  }
  if (semantic === 'diagram') {
    enhanceDiagram(node, instance, allocateId, strings);
    return true;
  }
  if (semantic === 'timeline') {
    enhanceTimeline(node, instance, strings);
    return true;
  }
  return false;
}

function enhanceChart(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): void {
  const title = take(node, 'dataDirectiveTitle') ?? strings.chart;
  const description = take(node, 'dataDescription') ?? title;
  const type = take(node, 'dataType') ?? 'bar';
  const xLabel = take(node, 'dataXLabel');
  const yLabel = take(node, 'dataYLabel');
  const series = semanticChildren(node, 'series').map((seriesNode) => ({
    label: take(seriesNode, 'dataLabel') ?? strings.series,
    points: semanticChildren(seriesNode, 'point').map((point) => ({
      label: take(point, 'dataLabel') ?? strings.value,
      value: Number(take(point, 'dataValue') ?? '0'),
    })),
  }));
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const accessibleDescription = chartDescription(description, series, strings);
  const svgChildren: ElementContent[] = [
    element('title', { id: titleId }, [text(title)]),
    element('desc', { id: descriptionId }, [text(accessibleDescription)]),
    ...(type === 'pie'
      ? renderPie(series[0]?.points ?? [], strings.formatNumber)
      : renderCartesian(type, series, xLabel, yLabel, strings.formatNumber)),
  ];
  node.tagName = 'figure';
  node.properties.dataVisualization = 'chart';
  node.properties.dataChartType = type;
  node.children = [
    caption(title, description),
    element('div', { className: ['visualization-frame'] }, [
      element(
        'svg',
        {
          viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: ['visualization-svg', `visualization-chart-${type}`],
        },
        svgChildren,
      ),
    ]),
    renderLegend(series, type, strings),
  ];
}

function renderCartesian(
  type: string,
  series: readonly ChartSeries[],
  xLabel: string | undefined,
  yLabel: string | undefined,
  formatNumber: (value: number) => string,
): readonly ElementContent[] {
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const y = (value: number): number => PLOT.top + ((maximum - value) / span) * PLOT.height;
  const zeroY = y(0);
  const children: ElementContent[] = [];

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = minimum + (span * tick) / 4;
    const tickY = y(value);
    children.push(
      element('line', {
        x1: PLOT.left,
        y1: tickY,
        x2: PLOT.left + PLOT.width,
        y2: tickY,
        className: ['visualization-grid'],
      }),
      element(
        'text',
        {
          x: PLOT.left - 10,
          y: tickY + 4,
          textAnchor: 'end',
          className: ['visualization-axis-label'],
        },
        [text(formatNumber(value))],
      ),
    );
  }
  children.push(
    element('line', {
      x1: PLOT.left,
      y1: zeroY,
      x2: PLOT.left + PLOT.width,
      y2: zeroY,
      className: ['visualization-axis'],
    }),
  );

  const categoryWidth = PLOT.width / Math.max(1, labels.length);
  labels.forEach((label, index) => {
    const x = PLOT.left + categoryWidth * (index + 0.5);
    children.push(
      element(
        'text',
        {
          x,
          y: PLOT.top + PLOT.height + 24,
          textAnchor: 'middle',
          className: ['visualization-axis-label'],
        },
        [text(shortLabel(label, 14))],
      ),
    );
  });

  if (type === 'line') {
    series.forEach((item, seriesIndex) => {
      const points = item.points.map((point, pointIndex) => ({
        x: PLOT.left + categoryWidth * (pointIndex + 0.5),
        y: y(point.value),
        point,
      }));
      children.push(
        element('polyline', {
          points: points.map((point) => `${round(point.x)},${round(point.y)}`).join(' '),
          fill: 'none',
          className: ['visualization-line', `visualization-color-${seriesIndex % PALETTE_SIZE}`],
        }),
      );
      for (const plotted of points) {
        children.push(
          element('circle', {
            cx: plotted.x,
            cy: plotted.y,
            r: 5,
            className: [
              'semantic-point',
              'visualization-point',
              `visualization-color-${seriesIndex % PALETTE_SIZE}`,
            ],
          }),
        );
      }
    });
  } else {
    const groupWidth = categoryWidth * 0.72;
    const barWidth = groupWidth / Math.max(1, series.length);
    series.forEach((item, seriesIndex) => {
      item.points.forEach((point, pointIndex) => {
        const valueY = y(point.value);
        children.push(
          element('rect', {
            x:
              PLOT.left +
              categoryWidth * pointIndex +
              (categoryWidth - groupWidth) / 2 +
              barWidth * seriesIndex,
            y: Math.min(valueY, zeroY),
            width: Math.max(2, barWidth - 3),
            height: Math.max(1, Math.abs(zeroY - valueY)),
            rx: 3,
            className: [
              'semantic-point',
              'visualization-bar',
              `visualization-color-${seriesIndex % PALETTE_SIZE}`,
            ],
          }),
        );
      });
    });
  }

  if (xLabel !== undefined) {
    children.push(
      element(
        'text',
        {
          x: PLOT.left + PLOT.width / 2,
          y: 348,
          textAnchor: 'middle',
          className: ['visualization-axis-title'],
        },
        [text(xLabel)],
      ),
    );
  }
  if (yLabel !== undefined) {
    children.push(
      element(
        'text',
        {
          x: 17,
          y: PLOT.top + PLOT.height / 2,
          textAnchor: 'middle',
          transform: `rotate(-90 17 ${PLOT.top + PLOT.height / 2})`,
          className: ['visualization-axis-title'],
        },
        [text(yLabel)],
      ),
    );
  }
  return children;
}

function renderPie(
  points: readonly ChartPoint[],
  formatNumber: (value: number) => string,
): readonly ElementContent[] {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  let angle = -Math.PI / 2;
  const children: ElementContent[] = [];
  points.forEach((point, index) => {
    const next = angle + (point.value / total) * Math.PI * 2;
    children.push(
      element('path', {
        d: arcPath(280, 178, 126, angle, next),
        className: [
          'semantic-point',
          'visualization-slice',
          `visualization-color-${index % PALETTE_SIZE}`,
        ],
      }),
    );
    const middle = angle + (next - angle) / 2;
    children.push(
      element(
        'text',
        {
          x: 280 + Math.cos(middle) * 82,
          y: 182 + Math.sin(middle) * 82,
          textAnchor: 'middle',
          className: ['visualization-pie-label'],
        },
        [text(`${formatNumber((point.value / total) * 100)}%`)],
      ),
    );
    angle = next;
  });
  return children;
}

function renderLegend(
  series: readonly ChartSeries[],
  type: string,
  strings: PackageStrings,
): Element {
  const entries = series.flatMap((item, seriesIndex) =>
    type === 'pie'
      ? item.points.map((point, pointIndex) => ({
          label: point.label,
          color: pointIndex % PALETTE_SIZE,
        }))
      : [{ label: item.label, color: seriesIndex % PALETTE_SIZE }],
  );
  return element(
    'ul',
    { className: ['visualization-legend'], ariaLabel: strings.legend },
    entries.map((entry) =>
      element('li', { className: ['semantic-series'] }, [
        element('span', {
          className: ['visualization-legend-swatch', `visualization-color-${entry.color}`],
          ariaHidden: 'true',
        }),
        text(entry.label),
      ]),
    ),
  );
}

function chartDescription(
  description: string,
  series: readonly ChartSeries[],
  strings: PackageStrings,
): string {
  const data = series.flatMap((item) =>
    item.points.map(
      (point) => `${item.label}, ${point.label}: ${strings.formatNumber(point.value)}`,
    ),
  );
  return `${description} ${strings.data}: ${data.join('; ')}.`;
}

function enhanceDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): void {
  const title = take(node, 'dataDirectiveTitle') ?? strings.diagram;
  const description = take(node, 'dataDescription') ?? title;
  const type = take(node, 'dataType') ?? 'flow';
  const direction = take(node, 'dataDirection') ?? 'right';
  if (type === 'sequence') {
    enhanceSequenceDiagram(node, instance, allocateId, title, description, strings);
    return;
  }
  enhanceFlowDiagram(node, instance, allocateId, title, description, direction, strings);
}

function enhanceFlowDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  title: string,
  description: string,
  direction: string,
  strings: PackageStrings,
): void {
  const rawGroups = semanticChildren(node, 'group');
  const rawNodes = semanticChildren(node, 'node');
  const count = rawNodes.length;
  const groupRecords = rawGroups.map((child) => ({
    id: take(child, 'dataId') ?? '',
    label: take(child, 'dataLabel') ?? '',
  }));
  const rawRecords = rawNodes.map((child, index) => {
    const group = take(child, 'dataGroup');
    return {
      id: take(child, 'dataId') ?? `node-${index + 1}`,
      label: take(child, 'dataLabel') ?? strings.node(index + 1),
      kind: take(child, 'dataKind') ?? 'neutral',
      ...(group === undefined ? {} : { group }),
    };
  });
  const grouped = groupRecords.length > 0;
  let width: number;
  let height: number;
  let groups: DiagramGroup[];
  let nodes: DiagramNode[];
  if (grouped) {
    const groupWidth = 240;
    const groupGap = 24;
    const outer = 24;
    const titleHeight = 54;
    const rowHeight = 96;
    const maximumMembers = Math.max(
      ...groupRecords.map((group) => rawRecords.filter((item) => item.group === group.id).length),
    );
    const groupHeight = titleHeight + maximumMembers * rowHeight + 22;
    width = outer * 2 + groupRecords.length * groupWidth + (groupRecords.length - 1) * groupGap;
    height = outer * 2 + groupHeight;
    groups = groupRecords.map((group, index) => ({
      ...group,
      x: outer + index * (groupWidth + groupGap),
      y: outer,
      width: groupWidth,
      height: groupHeight,
    }));
    const memberIndex = new Map<string, number>();
    nodes = rawRecords.map((item) => {
      const group = groups.find((candidate) => candidate.id === item.group);
      if (group === undefined)
        throw new Error(`Validated diagram group is missing: ${item.group}.`);
      const index = memberIndex.get(group.id) ?? 0;
      memberIndex.set(group.id, index + 1);
      return { ...item, x: group.x + 50, y: group.y + titleHeight + index * rowHeight };
    });
  } else {
    const primary = Math.min(4, count);
    const columns = direction === 'right' ? primary : Math.ceil(count / primary);
    const rows = direction === 'right' ? Math.ceil(count / primary) : primary;
    width = Math.max(420, columns * 220 + 80);
    height = Math.max(210, rows * 122 + 70);
    groups = [];
    nodes = rawRecords.map((item, index) => {
      const column = direction === 'right' ? index % columns : Math.floor(index / rows);
      const row = direction === 'right' ? Math.floor(index / columns) : index % rows;
      return { ...item, x: 50 + column * 220, y: 38 + row * 122 };
    });
  }
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const edges: readonly DiagramEdge[] = semanticChildren(node, 'edge').map((edge) => {
    const label = take(edge, 'dataLabel');
    return {
      from: take(edge, 'dataFrom') ?? '',
      to: take(edge, 'dataTo') ?? '',
      ...(label === undefined ? {} : { label }),
    };
  });
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const groupById = new Map(groups.map((group, index) => [group.id, { group, index }]));
  const adjacentPairUsage = new Map<string, number>();
  let outerRouteCount = 0;
  const edgePlans = edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from === undefined || to === undefined) return { kind: 'missing' } as const;
    if (grouped && from.group !== to.group) {
      const fromGroup = groupById.get(from.group ?? '');
      const toGroup = groupById.get(to.group ?? '');
      if (fromGroup === undefined || toGroup === undefined) return { kind: 'missing' } as const;
      const pair = [fromGroup.group.id, toGroup.group.id].sort().join(':');
      const usage = adjacentPairUsage.get(pair) ?? 0;
      adjacentPairUsage.set(pair, usage + 1);
      if (Math.abs(fromGroup.index - toGroup.index) === 1 && usage === 0) {
        return { kind: 'adjacent', edge, index, from, to } as const;
      }
      const lane = outerRouteCount;
      outerRouteCount += 1;
      return {
        kind: 'outer',
        edge,
        index,
        from,
        to,
        fromGroup: fromGroup.group,
        toGroup: toGroup.group,
        lane,
      } as const;
    }
    if (grouped && Math.abs(from.y - to.y) > 100) {
      return { kind: 'internal', edge, index, from, to } as const;
    }
    return { kind: 'direct', edge, index, from, to } as const;
  });
  const outerRouteStart =
    groups.length === 0 ? height : Math.max(...groups.map((group) => group.y + group.height)) + 18;
  if (outerRouteCount > 0) height = outerRouteStart + outerRouteCount * 20 + 18;
  const edgeElements = edgePlans.flatMap((plan) => {
    switch (plan.kind) {
      case 'missing':
        return [];
      case 'adjacent':
        return groupedDiagramEdge(plan.from, plan.to, plan.edge.label, plan.index);
      case 'outer':
        return groupedOuterEdge(
          plan.from,
          plan.to,
          plan.fromGroup,
          plan.toGroup,
          plan.edge.label,
          plan.index,
          outerRouteStart + plan.lane * 20,
        );
      case 'internal':
        return groupedInternalEdge(plan.from, plan.to, plan.edge.label, plan.index);
      case 'direct':
        return diagramEdge(plan.from, plan.to, plan.edge.label, plan.index);
      default:
        return unreachableEdgePlan(plan);
    }
  });
  const groupElements = groups.map((item) => diagramGroup(item));
  const nodeElements = nodes.map((item) => diagramNode(item));
  const accessibleDescription = flowDiagramDescription(description, groups, nodes, edges, strings);

  node.tagName = 'figure';
  node.properties.dataVisualization = 'diagram';
  node.properties.dataDiagramType = 'flow';
  node.properties.dataDiagramDirection = direction;
  node.children = [
    caption(title, description),
    element('div', { className: ['visualization-frame'] }, [
      element(
        'svg',
        {
          viewBox: `0 0 ${width} ${height}`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: ['visualization-svg', 'visualization-diagram'],
        },
        [
          element('title', { id: titleId }, [text(title)]),
          element('desc', { id: descriptionId }, [text(accessibleDescription)]),
          ...groupElements,
          ...edgeElements,
          ...nodeElements,
        ],
      ),
    ]),
  ];
}

function enhanceSequenceDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  title: string,
  description: string,
  strings: PackageStrings,
): void {
  const participants = semanticChildren(node, 'node').map((child, index) => ({
    id: take(child, 'dataId') ?? `participant-${index + 1}`,
    label: take(child, 'dataLabel') ?? strings.participant(index + 1),
    kind: take(child, 'dataKind') ?? 'neutral',
    x: 50 + index * 160,
    y: 28,
  }));
  const messages = semanticChildren(node, 'edge').map((edge) => ({
    from: take(edge, 'dataFrom') ?? '',
    to: take(edge, 'dataTo') ?? '',
    label: take(edge, 'dataLabel') ?? '',
  }));
  const width = Math.max(720, participants.length * 160 + 40);
  const height = 150 + messages.length * 62;
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const bottom = height - 24;
  const participantElements = participants.flatMap((participant) => [
    element('line', {
      x1: participant.x + 70,
      y1: 100,
      x2: participant.x + 70,
      y2: bottom,
      className: ['visualization-sequence-lifeline'],
      dataParticipant: participant.id,
    }),
    diagramNode(participant),
  ]);
  const messageElements = messages.flatMap((message, index) => {
    const from = byId.get(message.from);
    const to = byId.get(message.to);
    if (from === undefined || to === undefined) return [];
    return sequenceMessage(from, to, message.label, index, 132 + index * 62);
  });
  const accessibleDescription = sequenceDiagramDescription(
    description,
    participants,
    messages,
    strings,
  );

  node.tagName = 'figure';
  node.properties.dataVisualization = 'diagram';
  node.properties.dataDiagramType = 'sequence';
  node.children = [
    caption(title, description),
    element('div', { className: ['visualization-frame'] }, [
      element(
        'svg',
        {
          viewBox: `0 0 ${width} ${height}`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: ['visualization-svg', 'visualization-diagram', 'visualization-sequence'],
        },
        [
          element('title', { id: titleId }, [text(title)]),
          element('desc', { id: descriptionId }, [text(accessibleDescription)]),
          ...participantElements,
          ...messageElements,
        ],
      ),
    ]),
  ];
}

function diagramGroup(group: DiagramGroup): Element {
  const lines = wrapLabel(group.label, 26, 2);
  return element('g', { dataGroupId: group.id, className: ['semantic-group'] }, [
    element('rect', {
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
      rx: 16,
      className: ['visualization-group'],
    }),
    ...lines.map((line, index) =>
      element(
        'text',
        {
          x: group.x + 18,
          y: group.y + 24 + index * 17,
          className: ['visualization-group-label'],
        },
        [text(line)],
      ),
    ),
  ]);
}

function diagramNode(node: DiagramNode): Element {
  const lines = wrapLabel(node.label, 20, 3);
  return element(
    'g',
    { dataNodeId: node.id, dataGroup: node.group, className: ['semantic-node'] },
    [
      element('rect', {
        x: node.x,
        y: node.y,
        width: 140,
        height: 72,
        rx: 12,
        className: ['visualization-node', `visualization-node-${node.kind}`],
      }),
      ...lines.map((line, index) =>
        element(
          'text',
          {
            x: node.x + 70,
            y: node.y + 31 + (index - (lines.length - 1) / 2) * 17,
            textAnchor: 'middle',
            className: ['visualization-node-label'],
          },
          [text(line)],
        ),
      ),
    ],
  );
}

function flowDiagramDescription(
  description: string,
  groups: readonly DiagramGroup[],
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  strings: PackageStrings,
): string {
  const groupText =
    groups.length === 0
      ? strings.none
      : groups
          .map((group) => {
            const members = nodes
              .filter((node) => node.group === group.id)
              .map((node) => node.id)
              .join(', ');
            return `${group.id}: ${group.label} (${members})`;
          })
          .join('; ');
  const nodeText = nodes.map((node) => `${node.id}: ${node.label}`).join('; ');
  const edgeText =
    edges.length === 0
      ? strings.none
      : edges
          .map(
            (edge) =>
              `${edge.from} ${strings.to} ${edge.to}${edge.label === undefined ? '' : `: ${edge.label}`}`,
          )
          .join('; ');
  return `${description} ${strings.groups}: ${groupText}. ${strings.nodes}: ${nodeText}. ${strings.connections}: ${edgeText}.`;
}

function sequenceDiagramDescription(
  description: string,
  participants: readonly DiagramNode[],
  messages: readonly DiagramEdge[],
  strings: PackageStrings,
): string {
  const participantText = participants
    .map((participant) => `${participant.id}: ${participant.label}`)
    .join('; ');
  const messageText = messages
    .map(
      (message, index) =>
        `${index + 1}. ${message.from} ${strings.to} ${message.to}: ${message.label ?? ''}`,
    )
    .join('; ');
  return `${description} ${strings.participants}: ${participantText}. ${strings.messagesInOrder}: ${messageText}.`;
}

function sequenceMessage(
  from: DiagramNode,
  to: DiagramNode,
  label: string,
  index: number,
  y: number,
): readonly Element[] {
  const fromX = from.x + 70;
  const toX = to.x + 70;
  const direction = Math.sign(toX - fromX) || 1;
  const endX = toX - direction * 9;
  const baseX = endX - direction * 11;
  return [
    element('line', {
      x1: fromX,
      y1: y,
      x2: endX,
      y2: y,
      className: ['semantic-edge', 'visualization-edge', 'visualization-sequence-message'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataMessageOrder: String(index + 1),
    }),
    element('polygon', {
      points: `${round(endX)},${round(y)} ${round(baseX)},${round(y - 5)} ${round(baseX)},${round(y + 5)}`,
      className: ['visualization-edge-arrow'],
    }),
    element(
      'text',
      {
        x: (fromX + toX) / 2,
        y: y - 9,
        textAnchor: 'middle',
        className: ['visualization-edge-label', 'visualization-sequence-label'],
      },
      [text(shortLabel(label, 36))],
    ),
  ];
}

function diagramEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
): readonly Element[] {
  const start = { x: from.x + 70, y: from.y + 36 };
  const target = { x: to.x + 70, y: to.y + 36 };
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const unit = { x: dx / length, y: dy / length };
  const end = { x: target.x - unit.x * 76, y: target.y - unit.y * 42 };
  const base = { x: end.x - unit.x * 11, y: end.y - unit.y * 11 };
  const perpendicular = { x: -unit.y * 5, y: unit.x * 5 };
  const children = [
    element('line', {
      x1: start.x + unit.x * 76,
      y1: start.y + unit.y * 42,
      x2: end.x,
      y2: end.y,
      className: ['semantic-edge', 'visualization-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
    }),
    element('polygon', {
      points: `${round(end.x)},${round(end.y)} ${round(base.x + perpendicular.x)},${round(base.y + perpendicular.y)} ${round(base.x - perpendicular.x)},${round(base.y - perpendicular.y)}`,
      className: ['visualization-edge-arrow'],
    }),
  ];
  if (label !== undefined) {
    const vertical = Math.abs(dy) > Math.abs(dx);
    children.push(
      element(
        'text',
        {
          x: (start.x + target.x) / 2 + (vertical ? 12 : 0),
          y: (start.y + target.y) / 2 + (vertical ? 4 : -8),
          textAnchor: vertical ? 'start' : 'middle',
          className: ['visualization-edge-label'],
        },
        [text(shortLabel(label, 22))],
      ),
    );
  }
  return children;
}

function groupedDiagramEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
): readonly Element[] {
  const rightward = to.x > from.x;
  const startX = rightward ? from.x + 140 : from.x;
  const endX = rightward ? to.x : to.x + 140;
  const startY = from.y + 36;
  const endY = to.y + 36;
  const gutterX = (startX + endX) / 2;
  const arrowBaseX = endX + (rightward ? -11 : 11);
  const children = [
    element('path', {
      d: `M ${round(startX)} ${round(startY)} H ${round(gutterX)} V ${round(endY)} H ${round(endX)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
    }),
    element('polygon', {
      points: `${round(endX)},${round(endY)} ${round(arrowBaseX)},${round(endY - 5)} ${round(arrowBaseX)},${round(endY + 5)}`,
      className: ['visualization-edge-arrow'],
    }),
  ];
  if (label !== undefined) {
    children.push(
      element(
        'text',
        {
          x: (gutterX + endX) / 2,
          y: endY - 8,
          textAnchor: 'middle',
          className: ['visualization-edge-label'],
        },
        [text(shortLabel(label, 12))],
      ),
    );
  }
  return children;
}

function groupedOuterEdge(
  from: DiagramNode,
  to: DiagramNode,
  fromGroup: DiagramGroup,
  toGroup: DiagramGroup,
  label: string | undefined,
  index: number,
  laneY: number,
): readonly Element[] {
  const rightward = toGroup.x > fromGroup.x;
  const startX = rightward ? from.x + 140 : from.x;
  const endX = rightward ? to.x : to.x + 140;
  const startY = from.y + 36;
  const endY = to.y + 36;
  const sourceLaneX = rightward ? fromGroup.x + fromGroup.width - 12 : fromGroup.x + 12;
  const targetLaneX = rightward ? toGroup.x + 12 : toGroup.x + toGroup.width - 12;
  const arrowBaseX = endX + (rightward ? -11 : 11);
  const children = [
    element('path', {
      d: `M ${round(startX)} ${round(startY)} H ${round(sourceLaneX)} V ${round(laneY)} H ${round(targetLaneX)} V ${round(endY)} H ${round(endX)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-outer-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRouteLane: String(laneY),
    }),
    element('polygon', {
      points: `${round(endX)},${round(endY)} ${round(arrowBaseX)},${round(endY - 5)} ${round(arrowBaseX)},${round(endY + 5)}`,
      className: ['visualization-edge-arrow'],
    }),
  ];
  if (label !== undefined) {
    children.push(
      element(
        'text',
        {
          x: (sourceLaneX + targetLaneX) / 2,
          y: laneY - 6,
          textAnchor: 'middle',
          className: ['visualization-edge-label'],
        },
        [text(shortLabel(label, 20))],
      ),
    );
  }
  return children;
}

function unreachableEdgePlan(plan: never): never {
  throw new Error(`Unsupported grouped edge plan: ${JSON.stringify(plan)}.`);
}

function groupedInternalEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
): readonly Element[] {
  const startX = from.x + 140;
  const endX = to.x + 140;
  const startY = from.y + 36;
  const endY = to.y + 36;
  const laneX = startX + 22 + (index % 3) * 5;
  const children = [
    element('path', {
      d: `M ${round(startX)} ${round(startY)} H ${round(laneX)} V ${round(endY)} H ${round(endX)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-internal-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
    }),
    element('polygon', {
      points: `${round(endX)},${round(endY)} ${round(endX + 11)},${round(endY - 5)} ${round(endX + 11)},${round(endY + 5)}`,
      className: ['visualization-edge-arrow'],
    }),
  ];
  if (label !== undefined) {
    const labelY = (startY + endY) / 2;
    children.push(
      element(
        'text',
        {
          x: laneX,
          y: labelY,
          textAnchor: 'middle',
          transform: `rotate(-90 ${round(laneX)} ${round(labelY)})`,
          className: ['visualization-edge-label', 'visualization-group-internal-label'],
        },
        [text(shortLabel(label, 12))],
      ),
    );
  }
  return children;
}

function enhanceTimeline(node: Element, _instance: number, strings: PackageStrings): void {
  const title = take(node, 'dataDirectiveTitle') ?? strings.timeline;
  const description = take(node, 'dataDescription') ?? title;
  const events = semanticChildren(node, 'event');
  node.tagName = 'section';
  node.properties.dataVisualization = 'timeline';
  node.children = [
    caption(title, description, 'header'),
    element(
      'ol',
      { className: ['visualization-timeline-list'] },
      events.map((event) => {
        const date = take(event, 'dataDate') ?? '';
        const eventTitle = take(event, 'dataDirectiveTitle') ?? strings.event;
        const kind = take(event, 'dataKind') ?? 'neutral';
        event.tagName = 'li';
        event.properties.className = [
          'semantic-event',
          'visualization-timeline-event',
          `visualization-event-${kind}`,
        ];
        delete event.properties.dataSemantic;
        event.children = [
          element('time', { className: ['visualization-timeline-date'] }, [text(date)]),
          element('h4', { className: ['visualization-timeline-title'] }, [text(eventTitle)]),
          ...event.children,
        ];
        return event;
      }),
    ),
  ];
}

function caption(
  title: string,
  description: string,
  tagName: 'figcaption' | 'header' = 'figcaption',
): Element {
  return element(tagName, { className: ['visualization-caption'] }, [
    element('span', { className: ['visualization-title'] }, [text(title)]),
    element('span', { className: ['visualization-description'] }, [text(description)]),
  ]);
}

function semanticChildren(node: Element, semantic: string): Element[] {
  return node.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === semantic,
  );
}

function take(node: Element, property: string): string | undefined {
  const value = node.properties[property];
  delete node.properties[property];
  return typeof value === 'string' ? value : undefined;
}

function element(
  tagName: string,
  properties: Readonly<
    Record<string, string | readonly string[] | number | boolean | null | undefined>
  >,
  children: ElementContent[] = [],
): Element {
  const serialized = Object.fromEntries(
    Object.entries(properties).map(([name, value]) => [
      name,
      typeof value === 'number' ? String(round(value)) : value,
    ]),
  ) as Element['properties'];
  return { type: 'element', tagName, properties: serialized, children };
}

function text(value: string): ElementContent {
  return { type: 'text', value };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function shortLabel(value: string, maximum: number): string {
  const points = [...value];
  return points.length <= maximum ? value : `${points.slice(0, maximum - 1).join('')}…`;
}

function wrapLabel(value: string, width: number, maximumLines: number): readonly string[] {
  const words = value.split(/\s+/u);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (current === undefined || current.length + word.length + 1 > width) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  if (lines.length <= maximumLines) return lines.map((line) => shortLabel(line, width));
  return [
    ...lines.slice(0, maximumLines - 1),
    shortLabel(lines.slice(maximumLines - 1).join(' '), width),
  ];
}

function arcPath(
  centerX: number,
  centerY: number,
  radius: number,
  start: number,
  end: number,
): string {
  const startPoint = {
    x: centerX + Math.cos(start) * radius,
    y: centerY + Math.sin(start) * radius,
  };
  const endPoint = { x: centerX + Math.cos(end) * radius, y: centerY + Math.sin(end) * radius };
  if (end - start >= Math.PI * 2 - 0.000_001) {
    return `M ${centerX} ${centerY} L ${round(startPoint.x)} ${round(startPoint.y)} A ${radius} ${radius} 0 1 1 ${round(centerX - Math.cos(start) * radius)} ${round(centerY - Math.sin(start) * radius)} A ${radius} ${radius} 0 1 1 ${round(startPoint.x)} ${round(startPoint.y)} Z`;
  }
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${centerX} ${centerY} L ${round(startPoint.x)} ${round(startPoint.y)} A ${radius} ${radius} 0 ${largeArc} 1 ${round(endPoint.x)} ${round(endPoint.y)} Z`;
}
