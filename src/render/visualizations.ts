import type { Element, ElementContent } from 'hast';

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
  readonly x: number;
  readonly y: number;
}

interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export function enhanceVisualization(node: Element, semantic: string, instance: number): boolean {
  if (semantic === 'chart') {
    enhanceChart(node, instance);
    return true;
  }
  if (semantic === 'diagram') {
    enhanceDiagram(node, instance);
    return true;
  }
  if (semantic === 'timeline') {
    enhanceTimeline(node, instance);
    return true;
  }
  return false;
}

function enhanceChart(node: Element, instance: number): void {
  const title = take(node, 'dataDirectiveTitle') ?? 'Chart';
  const description = take(node, 'dataDescription') ?? title;
  const type = take(node, 'dataType') ?? 'bar';
  const xLabel = take(node, 'dataXLabel');
  const yLabel = take(node, 'dataYLabel');
  const series = semanticChildren(node, 'series').map((seriesNode) => ({
    label: take(seriesNode, 'dataLabel') ?? 'Series',
    points: semanticChildren(seriesNode, 'point').map((point) => ({
      label: take(point, 'dataLabel') ?? 'Value',
      value: Number(take(point, 'dataValue') ?? '0'),
    })),
  }));
  const titleId = `visual-${instance}-title`;
  const descriptionId = `visual-${instance}-description`;
  const accessibleDescription = chartDescription(description, series);
  const svgChildren: ElementContent[] = [
    element('title', { id: titleId }, [text(title)]),
    element('desc', { id: descriptionId }, [text(accessibleDescription)]),
    ...(type === 'pie'
      ? renderPie(series[0]?.points ?? [])
      : renderCartesian(type, series, xLabel, yLabel)),
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
    renderLegend(series, type),
  ];
}

function renderCartesian(
  type: string,
  series: readonly ChartSeries[],
  xLabel: string | undefined,
  yLabel: string | undefined,
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

function renderPie(points: readonly ChartPoint[]): readonly ElementContent[] {
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

function renderLegend(series: readonly ChartSeries[], type: string): Element {
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
    { className: ['visualization-legend'], ariaLabel: 'Legend' },
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

function chartDescription(description: string, series: readonly ChartSeries[]): string {
  const data = series.flatMap((item) =>
    item.points.map((point) => `${item.label}, ${point.label}: ${formatNumber(point.value)}`),
  );
  return `${description} Data: ${data.join('; ')}.`;
}

function enhanceDiagram(node: Element, instance: number): void {
  const title = take(node, 'dataDirectiveTitle') ?? 'Diagram';
  const description = take(node, 'dataDescription') ?? title;
  const direction = take(node, 'dataDirection') ?? 'right';
  const rawNodes = semanticChildren(node, 'node');
  const count = rawNodes.length;
  const primary = Math.min(4, count);
  const columns = direction === 'right' ? primary : Math.ceil(count / primary);
  const rows = direction === 'right' ? Math.ceil(count / primary) : primary;
  const width = Math.max(420, columns * 220 + 80);
  const height = Math.max(210, rows * 122 + 70);
  const nodes: DiagramNode[] = rawNodes.map((child, index) => {
    const column = direction === 'right' ? index % columns : Math.floor(index / rows);
    const row = direction === 'right' ? Math.floor(index / columns) : index % rows;
    return {
      id: take(child, 'dataId') ?? `node-${index + 1}`,
      label: take(child, 'dataLabel') ?? `Node ${index + 1}`,
      kind: take(child, 'dataKind') ?? 'neutral',
      x: 50 + column * 220,
      y: 38 + row * 122,
    };
  });
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const edges: readonly DiagramEdge[] = semanticChildren(node, 'edge').map((edge) => {
    const label = take(edge, 'dataLabel');
    return {
      from: take(edge, 'dataFrom') ?? '',
      to: take(edge, 'dataTo') ?? '',
      ...(label === undefined ? {} : { label }),
    };
  });
  const titleId = `visual-${instance}-title`;
  const descriptionId = `visual-${instance}-description`;
  const edgeElements = edges.flatMap((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from === undefined || to === undefined) return [];
    return diagramEdge(from, to, edge.label, index);
  });
  const nodeElements = nodes.map((item) => diagramNode(item));
  const accessibleDescription = diagramDescription(description, nodes, edges);

  node.tagName = 'figure';
  node.properties.dataVisualization = 'diagram';
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
          ...edgeElements,
          ...nodeElements,
        ],
      ),
    ]),
  ];
}

function diagramNode(node: DiagramNode): Element {
  const lines = wrapLabel(node.label, 20, 3);
  return element('g', { dataNodeId: node.id, className: ['semantic-node'] }, [
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
  ]);
}

function diagramDescription(
  description: string,
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
): string {
  const nodeText = nodes.map((node) => `${node.id}: ${node.label}`).join('; ');
  const edgeText =
    edges.length === 0
      ? 'none'
      : edges
          .map(
            (edge) =>
              `${edge.from} to ${edge.to}${edge.label === undefined ? '' : `: ${edge.label}`}`,
          )
          .join('; ');
  return `${description} Nodes: ${nodeText}. Connections: ${edgeText}.`;
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
    children.push(
      element(
        'text',
        {
          x: (start.x + target.x) / 2,
          y: (start.y + target.y) / 2 - 8,
          textAnchor: 'middle',
          className: ['visualization-edge-label'],
        },
        [text(shortLabel(label, 22))],
      ),
    );
  }
  return children;
}

function enhanceTimeline(node: Element, _instance: number): void {
  const title = take(node, 'dataDirectiveTitle') ?? 'Timeline';
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
        const eventTitle = take(event, 'dataDirectiveTitle') ?? 'Event';
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 6, useGrouping: true }).format(value);
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
