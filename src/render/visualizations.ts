import type { Element, ElementContent } from 'hast';
import type { PackageStrings } from '../localization.js';

const CHART_WIDTH = 720;
const CHART_HEIGHT = 360;
const PLOT = { left: 72, top: 34, width: 600, height: 242 } as const;
const PALETTE_SIZE = 6;
const NODE_FONT_SIZE = 13;
const GROUP_FONT_SIZE = 15;
const EDGE_FONT_SIZE = 12;
const NODE_LINE_HEIGHT = 18;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 13;
const NODE_MIN_WIDTH = 132;
const NODE_MAX_WIDTH = 252;
const NODE_MIN_HEIGHT = 56;
const NODE_MAX_LINES = 4;
const NODE_DEFAULT_WIDTH = 140;
const NODE_DEFAULT_HEIGHT = 72;
const GROUP_TITLE_HEIGHT = 52;
const GROUP_PADDING_X = 20;
const GROUP_PADDING_BOTTOM = 20;
const DIAGRAM_MARGIN = 22;
const LANE_STEP = 16;
const OUTER_LANE_STEP = 30;
/**
 * Ширина, после которой страница ужимает диаграмму и подпись узла уходит ниже читаемого размера.
 * Бюджет тратится в первую очередь на содержимое: запас под подписи рёбер отдаётся первым.
 */
const DIAGRAM_WIDTH_BUDGET = 860;
const NARROW_GLYPHS = new Set(['i', 'l', 'j', 't', 'f', 'r', '.', ',', ';', ':', '!', '|']);
const WIDE_GLYPHS = new Set(['m', 'w', 'M', 'W']);
const SPACING_SCALE: Readonly<Record<string, number>> = {
  compact: 0.78,
  comfortable: 1,
  spacious: 1.3,
};

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
  /** Размер коробки; когда его нет, берётся прежний постоянный. */
  readonly width?: number;
  readonly height?: number;
  /** Готовые строки подписи, посчитанные при раскладке. */
  readonly lines?: readonly string[];
}

/** Узел до размещения: размер посчитан, места ещё нет. */
interface MeasuredNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly group?: string;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  /** Строка, названная автором атрибутом `row`; нумерация с единицы. */
  readonly requestedRow?: number;
}

interface FlowEdgeRecord {
  readonly from: string;
  readonly to: string;
  readonly route: string;
  readonly label?: string;
}

type FlowEdgePlan =
  | { readonly kind: 'direct'; readonly edge: FlowEdgeRecord; readonly index: number }
  | {
      readonly kind: 'straight';
      readonly edge: FlowEdgeRecord;
      readonly index: number;
      readonly gapIndex: number;
    }
  | {
      readonly kind: 'gap';
      readonly edge: FlowEdgeRecord;
      readonly index: number;
      readonly gapIndex: number;
      readonly lane: number;
    }
  | { readonly kind: 'vertical'; readonly edge: FlowEdgeRecord; readonly index: number }
  | {
      readonly kind: 'gutter';
      readonly edge: FlowEdgeRecord;
      readonly index: number;
      readonly lane: number;
    }
  | {
      readonly kind: 'outer';
      readonly edge: FlowEdgeRecord;
      readonly index: number;
      readonly lane: number;
    };

/** Место узла в сетке без групп. */
interface GridPlacement {
  readonly box: MeasuredNode;
  readonly row: number;
  column: number;
}

interface FlowGeometry {
  readonly groups: readonly DiagramGroup[];
  readonly nodes: readonly DiagramNode[];
  readonly width: number;
  readonly height: number;
  readonly gapLaneX: (gapIndex: number, lane: number) => number;
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
  const spacing = take(node, 'dataSpacing') ?? 'comfortable';
  if (type === 'sequence') {
    enhanceSequenceDiagram(node, instance, allocateId, title, description, strings);
    return;
  }
  enhanceFlowDiagram(node, instance, allocateId, title, description, direction, spacing, strings);
}

function enhanceFlowDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  title: string,
  description: string,
  direction: string,
  spacing: string,
  strings: PackageStrings,
): void {
  const scale = SPACING_SCALE[spacing] ?? 1;
  const rowGap = Math.round(30 * scale);
  const columnGap = Math.round(34 * scale);
  const rawGroups = semanticChildren(node, 'group');
  const rawNodes = semanticChildren(node, 'node');
  const groupRecords = rawGroups.map((child) => ({
    id: take(child, 'dataId') ?? '',
    label: take(child, 'dataLabel') ?? '',
  }));
  const boxes = rawNodes.map((child, index) => {
    const group = take(child, 'dataGroup');
    const row = take(child, 'dataRow');
    const label = take(child, 'dataLabel') ?? strings.node(index + 1);
    const measured = layoutNodeBox(label);
    return {
      id: take(child, 'dataId') ?? `node-${index + 1}`,
      label,
      kind: take(child, 'dataKind') ?? 'neutral',
      lines: measured.lines,
      width: measured.width,
      height: measured.height,
      ...(group === undefined ? {} : { group }),
      ...(row === undefined ? {} : { requestedRow: Number.parseInt(row, 10) }),
    };
  });
  const edgeRecords = semanticChildren(node, 'edge').map((edge) => {
    const label = take(edge, 'dataLabel');
    const route = take(edge, 'dataRoute') ?? 'auto';
    return {
      from: take(edge, 'dataFrom') ?? '',
      to: take(edge, 'dataTo') ?? '',
      route,
      ...(label === undefined ? {} : { label }),
    };
  });
  const grouped = groupRecords.length > 0;
  const rowOfNode = assignRows(
    boxes,
    grouped ? groupRecords.map((group) => group.id) : [undefined],
  );
  const grid = grouped ? undefined : gridPlacement(boxes, rowOfNode, direction);
  const plans = planFlowEdges(edgeRecords, boxes, rowOfNode, groupRecords, grouped, grid);
  const geometry =
    grouped || grid === undefined
      ? groupedGeometry(groupRecords, boxes, rowOfNode, plans, rowGap, columnGap)
      : gridGeometry(grid, plans, rowGap, columnGap, scale);
  const { groups, nodes } = geometry;
  let { width, height } = geometry;
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const outerPlans = plans.filter((plan) => plan.kind === 'outer');
  const outerStart =
    groups.length === 0
      ? height + 4
      : Math.max(...groups.map((group) => group.y + group.height)) + 20;
  if (outerPlans.length > 0) height = outerStart + outerPlans.length * OUTER_LANE_STEP + 20;
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const edgeElements = plans.flatMap((plan) => {
    const from = byId.get(plan.edge.from);
    const to = byId.get(plan.edge.to);
    if (from === undefined || to === undefined) return [];
    switch (plan.kind) {
      case 'direct':
        return straightEdge(from, to, plan.edge.label, plan.index, plan.edge.route);
      case 'straight':
        return levelEdge(from, to, plan.edge.label, plan.index, plan.edge.route);
      case 'vertical':
        return columnEdge(from, to, plan.edge.label, plan.index, plan.edge.route);
      case 'gap': {
        const gap = geometry.gapLaneX(plan.gapIndex, plan.lane);
        return gapEdge(from, to, plan.edge.label, plan.index, gap, plan.edge.route);
      }
      case 'gutter': {
        const group = groupById.get(from.group ?? '');
        if (group === undefined) return [];
        return gutterEdge(
          from,
          to,
          plan.edge.label,
          plan.index,
          group.x + 16 + plan.lane * LANE_STEP,
          plan.lane,
          plan.edge.route,
        );
      }
      case 'outer': {
        const fromGroup = groupById.get(from.group ?? '');
        const toGroup = groupById.get(to.group ?? '');
        return outerEdge(
          from,
          to,
          fromGroup,
          toGroup,
          plan.edge.label,
          plan.index,
          outerStart + plan.lane * OUTER_LANE_STEP,
          plan.edge.route,
        );
      }
      default:
        return unreachableEdgePlan(plan);
    }
  });
  const plainEdges: readonly DiagramEdge[] = edgeRecords.map((edge) => ({
    from: edge.from,
    to: edge.to,
    ...(edge.label === undefined ? {} : { label: edge.label }),
  }));
  const accessibleDescription = flowDiagramDescription(
    description,
    groups,
    nodes,
    plainEdges,
    strings,
  );

  node.tagName = 'figure';
  node.properties.dataVisualization = 'diagram';
  node.properties.dataDiagramType = 'flow';
  node.properties.dataDiagramDirection = direction;
  node.properties.dataDiagramSpacing = spacing;
  node.children = [
    caption(title, description),
    element('div', { className: ['visualization-frame'] }, [
      element(
        'svg',
        {
          viewBox: `0 0 ${round(width)} ${round(height)}`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: ['visualization-svg', 'visualization-diagram'],
        },
        [
          element('title', { id: titleId }, [text(title)]),
          element('desc', { id: descriptionId }, [text(accessibleDescription)]),
          ...groups.map((item) => diagramGroup(item)),
          ...edgeElements.filter((item) => !isEdgeLabel(item)),
          ...nodes.map((item) => diagramNode(item)),
          ...edgeElements.filter((item) => isEdgeLabel(item)),
        ],
      ),
    ]),
  ];
}

/** Строка узла: объявленная автором, иначе следующая свободная в его группе. */
function assignRows(
  boxes: readonly MeasuredNode[],
  groupIds: readonly (string | undefined)[],
): ReadonlyMap<string, number> {
  const rows = new Map<string, number>();
  for (const groupId of groupIds) {
    const members = boxes.filter((box) => (groupId === undefined ? true : box.group === groupId));
    const taken = new Set<number>();
    for (const member of members) {
      const requested = member.requestedRow;
      if (requested !== undefined && Number.isInteger(requested) && requested > 0) {
        taken.add(requested - 1);
      }
    }
    let next = 0;
    for (const member of members) {
      const requested = member.requestedRow;
      if (requested !== undefined && Number.isInteger(requested) && requested > 0) {
        rows.set(member.id, requested - 1);
        continue;
      }
      while (taken.has(next)) next += 1;
      taken.add(next);
      rows.set(member.id, next);
    }
  }
  return rows;
}

/**
 * Маршрут выбирается по ГЕОМЕТРИИ, а не по счётчику: соседние группы на одной строке соединяются
 * прямой, разные строки — полосой в зазоре между группами, и только обратное или перепрыгивающее
 * ребро уходит под диаграмму. Автор может назвать маршрут сам атрибутом `route`.
 */
function planFlowEdges(
  edges: readonly FlowEdgeRecord[],
  boxes: readonly MeasuredNode[],
  rowOfNode: ReadonlyMap<string, number>,
  groupRecords: readonly { readonly id: string }[],
  grouped: boolean,
  grid?: ReadonlyMap<string, GridPlacement>,
): readonly FlowEdgePlan[] {
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const groupIndex = new Map(groupRecords.map((group, index) => [group.id, index]));
  const gapLanes = new Map<number, number>();
  const gutterLanes = new Map<string, number>();
  let outerLane = 0;
  const plans: FlowEdgePlan[] = [];
  for (const [index, edge] of edges.entries()) {
    const from = boxById.get(edge.from);
    const to = boxById.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const rowFrom = rowOfNode.get(from.id) ?? 0;
    const rowTo = rowOfNode.get(to.id) ?? 0;
    if (!grouped) {
      const fromCell = grid?.get(from.id);
      const toCell = grid?.get(to.id);
      if (fromCell === undefined || toCell === undefined) {
        plans.push({ kind: 'direct', edge, index });
        continue;
      }
      const columnStep = toCell.column - fromCell.column;
      const rowStep = toCell.row - fromCell.row;
      if (rowStep === 0 && Math.abs(columnStep) === 1 && edge.route !== 'around') {
        plans.push({
          kind: 'straight',
          edge,
          index,
          gapIndex: Math.min(fromCell.column, toCell.column),
        });
        continue;
      }
      if (columnStep === 0 && Math.abs(rowStep) === 1 && edge.route !== 'around') {
        plans.push({ kind: 'vertical', edge, index });
        continue;
      }
      // Всё остальное пересекло бы чужие коробки по диагонали, поэтому идёт полосой под сеткой.
      plans.push({ kind: 'outer', edge, index, lane: outerLane });
      outerLane += 1;
      continue;
    }
    if (from.group === to.group) {
      const group = from.group ?? '';
      if (Math.abs(rowFrom - rowTo) <= 1 && edge.route !== 'around') {
        plans.push({ kind: 'direct', edge, index });
        continue;
      }
      const lane = gutterLanes.get(group) ?? 0;
      gutterLanes.set(group, lane + 1);
      plans.push({ kind: 'gutter', edge, index, lane });
      continue;
    }
    const fromIndex = groupIndex.get(from.group ?? '') ?? 0;
    const toIndex = groupIndex.get(to.group ?? '') ?? 0;
    const forwardStep = toIndex - fromIndex;
    const around = edge.route === 'around' || (edge.route !== 'direct' && forwardStep !== 1);
    if (around) {
      plans.push({ kind: 'outer', edge, index, lane: outerLane });
      outerLane += 1;
      continue;
    }
    const gapIndex = Math.min(fromIndex, toIndex);
    if (rowFrom === rowTo) {
      plans.push({ kind: 'straight', edge, index, gapIndex });
      continue;
    }
    const lane = gapLanes.get(gapIndex) ?? 0;
    gapLanes.set(gapIndex, lane + 1);
    plans.push({ kind: 'gap', edge, index, gapIndex, lane });
  }
  return plans;
}

/** Колонки групп: ширина каждой считается от самого широкого узла, зазор — от числа полос в нём. */
function groupedGeometry(
  groupRecords: readonly { readonly id: string; readonly label: string }[],
  boxes: readonly MeasuredNode[],
  rowOfNode: ReadonlyMap<string, number>,
  plans: readonly FlowEdgePlan[],
  rowGap: number,
  columnGap: number,
): FlowGeometry {
  const rowCount = Math.max(1, ...boxes.map((box) => (rowOfNode.get(box.id) ?? 0) + 1));
  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(
      NODE_MIN_HEIGHT,
      ...boxes.filter((box) => rowOfNode.get(box.id) === row).map((box) => box.height),
    ),
  );
  const rowTop: number[] = [];
  let cursor = GROUP_TITLE_HEIGHT;
  for (const height of rowHeights) {
    rowTop.push(cursor);
    cursor += height + rowGap;
  }
  const groupHeight = cursor - rowGap + GROUP_PADDING_BOTTOM;
  const reserveByGroup = new Map<string, number>();
  const widestByGroup = new Map<string, number>();
  for (const group of groupRecords) {
    const gutterPlans = plans.filter(
      (plan) =>
        plan.kind === 'gutter' &&
        boxes.find((box) => box.id === plan.edge.from)?.group === group.id,
    );
    const gutterLabel = Math.max(
      0,
      ...gutterPlans
        .map((plan) => plan.edge.label)
        .filter((label): label is string => label !== undefined)
        .map((label) => Math.min(measureText(label, EDGE_FONT_SIZE, 400), 130)),
    );
    reserveByGroup.set(
      group.id,
      gutterPlans.length === 0
        ? GROUP_PADDING_X
        : GROUP_PADDING_X + gutterPlans.length * LANE_STEP + Math.ceil(gutterLabel) + 16,
    );
    widestByGroup.set(
      group.id,
      Math.max(
        NODE_MIN_WIDTH,
        ...boxes.filter((box) => box.group === group.id).map((box) => box.width),
      ),
    );
  }
  const gapWidths = Array.from({ length: Math.max(0, groupRecords.length - 1) }, (_, gapIndex) => {
    const lanes = plans.filter((plan) => plan.kind === 'gap' && plan.gapIndex === gapIndex).length;
    // Подпись ребра живёт в зазоре, поэтому зазор обязан её вместить: иначе она обрезается
    // многоточием, хотя места на странице сколько угодно.
    const labels = plans
      .filter(
        (plan) => (plan.kind === 'straight' || plan.kind === 'gap') && plan.gapIndex === gapIndex,
      )
      .map((plan) => plan.edge.label)
      .filter((label): label is string => label !== undefined)
      .map((label) => measureText(label, EDGE_FONT_SIZE, 400));
    // Потолок держит картинку читаемой: широкая диаграмма ужимается страницей, и подпись узла
    // вместе с ней уходит ниже читаемого размера.
    const labelRoom = labels.length === 0 ? 0 : Math.max(...labels) + 20;
    return Math.max(columnGap, 30 + lanes * LANE_STEP, Math.min(labelRoom, 170));
  });
  const columnWidths = groupRecords.map(
    (group) =>
      (reserveByGroup.get(group.id) ?? GROUP_PADDING_X) +
      (widestByGroup.get(group.id) ?? NODE_MIN_WIDTH) +
      GROUP_PADDING_X,
  );
  shrinkGapsToBudget(gapWidths, columnWidths, columnGap, plans);
  const groups: DiagramGroup[] = [];
  let x = DIAGRAM_MARGIN;
  for (const [index, group] of groupRecords.entries()) {
    const width = columnWidths[index] ?? NODE_MIN_WIDTH;
    groups.push({ ...group, x, y: DIAGRAM_MARGIN, width, height: groupHeight });
    x += width + (gapWidths[index] ?? 0);
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nodes: DiagramNode[] = boxes.map((box) => {
    const group = groupById.get(box.group ?? '');
    const row = rowOfNode.get(box.id) ?? 0;
    if (group === undefined) throw new Error(`Validated diagram group is missing: ${box.group}.`);
    const reserve = reserveByGroup.get(group.id) ?? GROUP_PADDING_X;
    const inner = group.width - reserve - GROUP_PADDING_X;
    return {
      ...box,
      x: group.x + reserve + Math.round((inner - box.width) / 2),
      y: group.y + (rowTop[row] ?? GROUP_TITLE_HEIGHT),
    };
  });
  const gapStart = groups.map((group) => group.x + group.width);
  return {
    groups,
    nodes,
    // После последней группы зазор не добавлялся, поэтому вычитать его отсюда нельзя.
    width: x + DIAGRAM_MARGIN,
    height: DIAGRAM_MARGIN * 2 + groupHeight,
    gapLaneX: (gapIndex, lane) => (gapStart[gapIndex] ?? 0) + 16 + lane * LANE_STEP,
  };
}

/**
 * Запас под подписи рёбер отдаётся, пока картинка не уложится в бюджет ширины. Ниже минимума,
 * который нужен полосам маршрутов, зазор не опускается: там уже идут линии, а не воздух.
 */
function shrinkGapsToBudget(
  gapWidths: number[],
  columnWidths: readonly number[],
  columnGap: number,
  plans: readonly FlowEdgePlan[],
): void {
  const minimums = gapWidths.map((_, gapIndex) => {
    const lanes = plans.filter((plan) => plan.kind === 'gap' && plan.gapIndex === gapIndex).length;
    return Math.max(24, 30 + lanes * LANE_STEP - columnGap + 24);
  });
  const total = (): number =>
    DIAGRAM_MARGIN * 2 +
    columnWidths.reduce((sum, width) => sum + width, 0) +
    gapWidths.reduce((sum, width) => sum + width, 0);
  while (total() > DIAGRAM_WIDTH_BUDGET) {
    let widest = -1;
    for (const [index, width] of gapWidths.entries()) {
      if (width <= (minimums[index] ?? 24)) continue;
      if (widest === -1 || width > (gapWidths[widest] ?? 0)) widest = index;
    }
    if (widest === -1) return;
    gapWidths[widest] = Math.max(minimums[widest] ?? 24, (gapWidths[widest] ?? 0) - 8);
  }
}

/** Место каждого узла в сетке: строка по автору или по порядку, колонка по порядку внутри строки. */
function gridPlacement(
  boxes: readonly MeasuredNode[],
  rowOfNode: ReadonlyMap<string, number>,
  direction: string,
): ReadonlyMap<string, GridPlacement> {
  const count = boxes.length;
  const primary = Math.min(4, Math.max(1, count));
  const perRow = direction === 'right' ? primary : Math.max(1, Math.ceil(count / primary));
  const explicitRows = boxes.some((box) => box.requestedRow !== undefined);
  const placement = boxes.map<GridPlacement>((box, index) => ({
    box,
    row: explicitRows ? (rowOfNode.get(box.id) ?? 0) : Math.floor(index / perRow),
    column: explicitRows ? 0 : index % perRow,
  }));
  if (explicitRows) {
    const perRowIndex = new Map<number, number>();
    for (const item of placement) {
      const next = perRowIndex.get(item.row) ?? 0;
      item.column = next;
      perRowIndex.set(item.row, next + 1);
    }
  }
  return new Map(placement.map((item) => [item.box.id, item]));
}

/**
 * Сетка без групп. Зазор между колонками и между строками считается от подписей тех связей, что
 * через него проходят: подпись живёт в зазоре, и узкий зазор обрезает её или кладёт на чужую коробку.
 */
function gridGeometry(
  grid: ReadonlyMap<string, GridPlacement>,
  plans: readonly FlowEdgePlan[],
  rowGap: number,
  columnGap: number,
  scale: number,
): FlowGeometry {
  const placement = [...grid.values()];
  const rowCount = Math.max(1, ...placement.map((item) => item.row + 1));
  const columnCount = Math.max(1, ...placement.map((item) => item.column + 1));
  const columnWidths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(
      NODE_MIN_WIDTH,
      ...placement.filter((item) => item.column === column).map((item) => item.box.width),
    ),
  );
  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(
      NODE_MIN_HEIGHT,
      ...placement.filter((item) => item.row === row).map((item) => item.box.height),
    ),
  );
  const labelWidth = (plan: FlowEdgePlan): number =>
    plan.edge.label === undefined ? 0 : measureText(plan.edge.label, EDGE_FONT_SIZE, 400);
  const columnGaps = Array.from({ length: Math.max(0, columnCount - 1) }, (_, gapIndex) => {
    const widths = plans
      .filter((plan) => plan.kind === 'straight' && plan.gapIndex === gapIndex)
      .map(labelWidth);
    const room = widths.length === 0 ? 0 : Math.max(...widths) + Math.round(26 * scale);
    return Math.max(columnGap, Math.min(room, 230));
  });
  // Подпись вертикальной связи стоит сбоку от линии, поэтому ей нужна высота строки, а не ширина.
  const verticalLabel = Math.max(
    0,
    ...plans.filter((plan) => plan.kind === 'vertical').map(labelWidth),
  );
  const rowGaps = Array.from({ length: Math.max(0, rowCount - 1) }, () =>
    Math.max(rowGap, verticalLabel === 0 ? rowGap : 46),
  );
  const columnX: number[] = [];
  let x = DIAGRAM_MARGIN;
  for (const [index, width] of columnWidths.entries()) {
    columnX.push(x);
    x += width + (columnGaps[index] ?? 0);
  }
  const rowY: number[] = [];
  let y = DIAGRAM_MARGIN;
  for (const [index, height] of rowHeights.entries()) {
    rowY.push(y);
    y += height + (rowGaps[index] ?? 0);
  }
  const nodes: DiagramNode[] = placement.map((item) => ({
    ...item.box,
    x:
      (columnX[item.column] ?? DIAGRAM_MARGIN) +
      Math.round(((columnWidths[item.column] ?? item.box.width) - item.box.width) / 2),
    y: rowY[item.row] ?? DIAGRAM_MARGIN,
  }));
  return {
    groups: [],
    nodes,
    width: x + DIAGRAM_MARGIN,
    height: y + DIAGRAM_MARGIN,
    gapLaneX: () => 0,
  };
}

function enhanceSequenceDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  title: string,
  description: string,
  strings: PackageStrings,
): void {
  const measured = semanticChildren(node, 'node').map((child, index) => {
    const label = take(child, 'dataLabel') ?? strings.participant(index + 1);
    const box = layoutNodeBox(label);
    return {
      id: take(child, 'dataId') ?? `participant-${index + 1}`,
      label,
      kind: take(child, 'dataKind') ?? 'neutral',
      ...box,
    };
  });
  const pitch = Math.max(160, Math.max(0, ...measured.map((item) => item.width)) + 28);
  const participants = measured.map((item, index) => ({
    ...item,
    x: 50 + index * pitch + Math.round((pitch - 28 - item.width) / 2),
    y: 28,
  }));
  const messages = semanticChildren(node, 'edge').map((edge) => ({
    from: take(edge, 'dataFrom') ?? '',
    to: take(edge, 'dataTo') ?? '',
    label: take(edge, 'dataLabel') ?? '',
  }));
  const width = Math.max(720, participants.length * pitch + 40);
  const height = 150 + messages.length * 62;
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const bottom = height - 24;
  const participantElements = participants.flatMap((participant) => [
    element('line', {
      x1: participant.x + participant.width / 2,
      y1: 100,
      x2: participant.x + participant.width / 2,
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

/** Вертикальная связь соседних строк одной колонки: подпись стоит сбоку от линии. */
function columnEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const downward = target.centerY >= source.centerY;
  const startY = downward ? source.bottom + 6 : source.top - 6;
  const endY = downward ? target.top - 6 : target.bottom + 6;
  const x = source.centerX;
  const children: Element[] = [
    element('line', {
      x1: round(x),
      y1: round(startY),
      x2: round(target.centerX),
      y2: round(endY),
      className: ['semantic-edge', 'visualization-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
    }),
    arrowHead(target.centerX, endY, 0, downward ? 1 : -1),
  ];
  if (label !== undefined) {
    children.push(edgeLabel(label, x + 10, (startY + endY) / 2 + 4, 'start', 200));
  }
  return children;
}

/** Подписи выносятся отдельным слоем: иначе линия соседнего ребра перечёркивает чужую подпись. */
function isEdgeLabel(item: Element): boolean {
  const className = item.properties.className;
  return Array.isArray(className) && className.includes('visualization-edge-label');
}

function diagramGroup(group: DiagramGroup): Element {
  const wrapped = wrapMeasured(group.label, group.width - 36, 2, GROUP_FONT_SIZE, 780);
  return element('g', { dataGroupId: group.id, className: ['semantic-group'] }, [
    element('rect', {
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
      rx: 16,
      className: ['visualization-group'],
    }),
    ...wrapped.lines.map((line, index) =>
      element(
        'text',
        {
          x: group.x + 18,
          y: group.y + 26 + index * 18,
          className: ['visualization-group-label'],
        },
        [text(line)],
      ),
    ),
  ]);
}

function diagramNode(node: DiagramNode): Element {
  const width = node.width ?? NODE_DEFAULT_WIDTH;
  const height = node.height ?? NODE_DEFAULT_HEIGHT;
  const lines = node.lines ?? layoutNodeBox(node.label).lines;
  return element(
    'g',
    { dataNodeId: node.id, dataGroup: node.group, className: ['semantic-node'] },
    [
      element('rect', {
        x: node.x,
        y: node.y,
        width,
        height,
        rx: 12,
        className: ['visualization-node', `visualization-node-${node.kind}`],
      }),
      ...lines.map((line, index) =>
        element(
          'text',
          {
            x: node.x + width / 2,
            y: node.y + height / 2 + 5 + (index - (lines.length - 1) / 2) * NODE_LINE_HEIGHT,
            textAnchor: 'middle',
            className: ['visualization-node-label'],
          },
          [text(line)],
        ),
      ),
    ],
  );
}

/** Ширина строки в единицах вида, считанная по начертаниям: коробка узла растёт от подписи. */
function glyphWidth(character: string): number {
  if (character === ' ') return 0.29;
  if (NARROW_GLYPHS.has(character)) return 0.34;
  if (WIDE_GLYPHS.has(character)) return 0.92;
  if (character >= '0' && character <= '9') return 0.58;
  if (character !== character.toLowerCase() && character === character.toUpperCase()) return 0.7;
  return 0.56;
}

function measureText(value: string, fontSize: number, weight: number): number {
  let units = 0;
  for (const character of value) units += glyphWidth(character);
  return units * fontSize * (weight >= 700 ? 1.05 : 1);
}

function truncateMeasured(
  value: string,
  maximumWidth: number,
  fontSize: number,
  weight: number,
): string {
  if (measureText(value, fontSize, weight) <= maximumWidth) return value;
  let result = '';
  for (const point of value) {
    if (measureText(`${result}${point}…`, fontSize, weight) > maximumWidth) break;
    result += point;
  }
  return `${result.trimEnd()}…`;
}

function wrapMeasured(
  value: string,
  maximumWidth: number,
  maximumLines: number,
  fontSize: number,
  weight: number,
): { readonly lines: readonly string[]; readonly width: number } {
  const words = value.split(/\s+/u).filter((word) => word.length > 0);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    const candidate = current === undefined ? word : `${current} ${word}`;
    if (current !== undefined && measureText(candidate, fontSize, weight) <= maximumWidth) {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(word);
    }
  }
  if (lines.length === 0) lines.push(value);
  const bounded =
    lines.length <= maximumLines
      ? lines
      : [...lines.slice(0, maximumLines - 1), lines.slice(maximumLines - 1).join(' ')];
  const trimmed = bounded.map((line) => truncateMeasured(line, maximumWidth, fontSize, weight));
  return {
    lines: trimmed,
    width: Math.max(...trimmed.map((line) => measureText(line, fontSize, weight))),
  };
}

function layoutNodeBox(label: string): {
  readonly lines: readonly string[];
  readonly width: number;
  readonly height: number;
} {
  const wrapped = wrapMeasured(
    label,
    NODE_MAX_WIDTH - NODE_PADDING_X * 2,
    NODE_MAX_LINES,
    NODE_FONT_SIZE,
    720,
  );
  return {
    lines: wrapped.lines,
    width: Math.min(
      NODE_MAX_WIDTH,
      Math.max(NODE_MIN_WIDTH, Math.ceil(wrapped.width) + NODE_PADDING_X * 2),
    ),
    height: Math.max(NODE_MIN_HEIGHT, wrapped.lines.length * NODE_LINE_HEIGHT + NODE_PADDING_Y * 2),
  };
}

function nodeBox(node: DiagramNode): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
} {
  const width = node.width ?? NODE_DEFAULT_WIDTH;
  const height = node.height ?? NODE_DEFAULT_HEIGHT;
  return {
    left: node.x,
    right: node.x + width,
    top: node.y,
    bottom: node.y + height,
    centerX: node.x + width / 2,
    centerY: node.y + height / 2,
  };
}

function edgeLabel(
  value: string,
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end',
  maximumWidth: number,
): Element {
  const shown = truncateMeasured(value, maximumWidth, EDGE_FONT_SIZE, 400);
  const width = measureText(shown, EDGE_FONT_SIZE, 400) + 8;
  const left = anchor === 'start' ? x - 4 : anchor === 'end' ? x - width + 4 : x - width / 2;
  return element('g', { className: ['visualization-edge-label'] }, [
    element('rect', {
      x: round(left),
      y: round(y - 12),
      width: round(width),
      height: 16,
      rx: 4,
      className: ['visualization-edge-label-plate'],
    }),
    element(
      'text',
      {
        x: round(x),
        y: round(y),
        textAnchor: anchor,
        className: ['visualization-edge-label-text'],
      },
      [text(shown)],
    ),
  ]);
}

function arrowHead(x: number, y: number, unitX: number, unitY: number): Element {
  const baseX = x - unitX * 11;
  const baseY = y - unitY * 11;
  const perpendicularX = -unitY * 5;
  const perpendicularY = unitX * 5;
  return element('polygon', {
    points: `${round(x)},${round(y)} ${round(baseX + perpendicularX)},${round(baseY + perpendicularY)} ${round(baseX - perpendicularX)},${round(baseY - perpendicularY)}`,
    className: ['visualization-edge-arrow'],
  });
}

/** Прямая между центрами, обрезанная по граням коробок: длина зависит от РАЗМЕРА узла, не от числа. */
function straightEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const deltaX = target.centerX - source.centerX;
  const deltaY = target.centerY - source.centerY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const start = boundaryPoint(source, unitX, unitY, 6);
  const end = boundaryPoint(target, -unitX, -unitY, 6);
  const children: Element[] = [
    element('line', {
      x1: round(start.x),
      y1: round(start.y),
      x2: round(end.x),
      y2: round(end.y),
      className: ['semantic-edge', 'visualization-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
    }),
    arrowHead(end.x, end.y, unitX, unitY),
  ];
  if (label !== undefined) {
    const vertical = Math.abs(deltaY) > Math.abs(deltaX);
    children.push(
      edgeLabel(
        label,
        (start.x + end.x) / 2 + (vertical ? 12 : 0),
        (start.y + end.y) / 2 + (vertical ? 4 : -9),
        vertical ? 'start' : 'middle',
        vertical ? 150 : Math.max(90, Math.abs(deltaX)),
      ),
    );
  }
  return children;
}

function boundaryPoint(
  box: ReturnType<typeof nodeBox>,
  unitX: number,
  unitY: number,
  inset: number,
): { readonly x: number; readonly y: number } {
  const halfWidth = (box.right - box.left) / 2 + inset;
  const halfHeight = (box.bottom - box.top) / 2 + inset;
  const scaleX = unitX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(unitX);
  const scaleY = unitY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(unitY);
  const scale = Math.min(scaleX, scaleY);
  return { x: box.centerX + unitX * scale, y: box.centerY + unitY * scale };
}

/** Соседние группы, одна строка: горизонтальная прямая, подпись над серединой зазора. */
function levelEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const rightward = target.centerX >= source.centerX;
  const startX = rightward ? source.right + 6 : source.left - 6;
  const endX = rightward ? target.left - 6 : target.right + 6;
  const y = source.centerY;
  const children: Element[] = [
    element('line', {
      x1: round(startX),
      y1: round(y),
      x2: round(endX),
      y2: round(target.centerY),
      className: ['semantic-edge', 'visualization-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
    }),
    arrowHead(endX, target.centerY, rightward ? 1 : -1, 0),
  ];
  if (label !== undefined) {
    children.push(
      edgeLabel(
        label,
        (startX + endX) / 2,
        y - 9,
        'middle',
        Math.max(70, Math.abs(endX - startX) - 8),
      ),
    );
  }
  return children;
}

/** Соседние группы, разные строки: полоса в зазоре между колонками, подпись горизонтальная. */
function gapEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
  laneX: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const rightward = target.centerX >= source.centerX;
  const startX = rightward ? source.right + 6 : source.left - 6;
  const endX = rightward ? target.left - 6 : target.right + 6;
  const children: Element[] = [
    element('path', {
      d: `M ${round(startX)} ${round(source.centerY)} H ${round(laneX)} V ${round(target.centerY)} H ${round(endX)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-gap-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
    }),
    arrowHead(endX, target.centerY, rightward ? 1 : -1, 0),
  ];
  if (label !== undefined) {
    children.push(
      edgeLabel(
        label,
        startX + (rightward ? 6 : -6),
        source.centerY - 10,
        rightward ? 'start' : 'end',
        Math.max(110, Math.abs(laneX - startX) + 60),
      ),
    );
  }
  return children;
}

/** Далёкие строки одной группы: собственный жёлоб слева, подпись горизонтальная над поворотом. */
function gutterEdge(
  from: DiagramNode,
  to: DiagramNode,
  label: string | undefined,
  index: number,
  laneX: number,
  lane: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const children: Element[] = [
    element('path', {
      d: `M ${round(source.left - 6)} ${round(source.centerY)} H ${round(laneX)} V ${round(target.centerY)} H ${round(target.left - 6)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-internal-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
    }),
    arrowHead(target.left - 6, target.centerY, 1, 0),
  ];
  if (label !== undefined) {
    // Подпись сидит на своей полосе: середина отрезка разводит рёбра с разными концами, номер
    // полосы — рёбра, у которых концы совпали или совпал источник.
    children.push(
      edgeLabel(
        label,
        laneX + 6,
        (source.centerY + target.centerY) / 2 + 4 + lane * 15,
        'start',
        Math.max(60, source.left - laneX - 12),
      ),
    );
  }
  return children;
}

/** Обратное или перепрыгивающее ребро: полоса под группами, подпись горизонтальная над полосой. */
function outerEdge(
  from: DiagramNode,
  to: DiagramNode,
  fromGroup: DiagramGroup | undefined,
  toGroup: DiagramGroup | undefined,
  label: string | undefined,
  index: number,
  laneY: number,
  route: string,
): readonly Element[] {
  const source = nodeBox(from);
  const target = nodeBox(to);
  const rightward = target.centerX >= source.centerX;
  const startX = rightward ? source.right + 6 : source.left - 6;
  const endX = rightward ? target.left - 6 : target.right + 6;
  const sourceLaneX =
    fromGroup === undefined
      ? startX
      : rightward
        ? fromGroup.x + fromGroup.width + 10
        : fromGroup.x - 10;
  const targetLaneX =
    toGroup === undefined ? endX : rightward ? toGroup.x - 10 : toGroup.x + toGroup.width + 10;
  const children: Element[] = [
    element('path', {
      d: `M ${round(startX)} ${round(source.centerY)} H ${round(sourceLaneX)} V ${round(laneY)} H ${round(targetLaneX)} V ${round(target.centerY)} H ${round(endX)}`,
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', 'visualization-group-outer-edge'],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataRoute: route,
      dataRouteLane: String(laneY),
    }),
    arrowHead(endX, target.centerY, rightward ? 1 : -1, 0),
  ];
  if (label !== undefined) {
    children.push(
      edgeLabel(
        label,
        (sourceLaneX + targetLaneX) / 2,
        laneY - 8,
        'middle',
        Math.max(80, Math.abs(targetLaneX - sourceLaneX) - 10),
      ),
    );
  }
  return children;
}

function unreachableEdgePlan(plan: never): never {
  throw new Error(`Unsupported grouped edge plan: ${JSON.stringify(plan)}.`);
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
  const fromX = from.x + (from.width ?? NODE_DEFAULT_WIDTH) / 2;
  const toX = to.x + (to.width ?? NODE_DEFAULT_WIDTH) / 2;
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
        className: ['visualization-edge-label-text', 'visualization-sequence-label'],
      },
      [text(shortLabel(label, 36))],
    ),
  ];
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
