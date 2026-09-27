import type { Element, ElementContent } from 'hast';

import { DIAGRAM_CONTRACT, type DiagramEdgeKindChoice } from '../authoring/directive-contract.js';
import type { PackageStrings } from '../localization.js';
import {
  countText,
  DIAGRAM_MESSAGES,
  type DiagramMessages,
  NODE_STATUSES,
  type NodeStatus,
  nodeStatusOf,
  SELF_LOOP_REACH,
  selfLoop,
  statusBadge,
} from './diagram-process.js';
import { renderZoomScene } from './diagram-zoom.js';
import {
  type DescribedEdge,
  type DescribedNode,
  type DiagramDescription,
  describeFlow,
  describeSequence,
  descriptionSentence,
} from './diagram-description.js';
import {
  ARROW_LENGTH,
  DIAGRAM_MARGIN,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  diagramGroup,
  diagramNode,
  EDGE_LABEL_MIN_WIDTH,
  EDGE_LABEL_RISE,
  edgeArrow,
  edgeLabel,
  element,
  GROUP_FONT_SIZE,
  GROUP_FONT_WEIGHT,
  GROUP_TITLE_LINE_HEIGHT,
  layoutEdgeLabel,
  layoutNodeBox,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  round,
  text,
  wrapMeasured,
} from './diagram-svg.js';
import {
  type FlowViewKind,
  type FlowViews,
  type LayoutPoint,
  layoutFlowViews,
} from './flow-layout.js';

const CHART_WIDTH = 720;
const CHART_HEIGHT = 360;
const PLOT = { left: 72, top: 34, width: 600, height: 242 } as const;

/**
 * Геометрия декартова графика. Широкая — для страницы; узкая — для телефона: её показывают вместо
 * широкой на узком экране, чтобы график помещался в колонку, а подписи оставались читаемыми, а не
 * уезжали за край и не мельчали до нечитаемого.
 */
interface ChartFrame {
  readonly width: number;
  readonly height: number;
  readonly plot: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly axisTitleY: number;
  readonly labelLength: number;
  /** Точки узкого варианта не несут `semantic-point`: их число и порядок принадлежат широкому. */
  readonly semanticPoints: boolean;
}
const WIDE_CHART: ChartFrame = {
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  plot: PLOT,
  axisTitleY: 348,
  labelLength: 14,
  semanticPoints: true,
};
const NARROW_CHART: ChartFrame = {
  width: 400,
  height: 340,
  plot: { left: 58, top: 24, width: 326, height: 222 },
  axisTitleY: 330,
  labelLength: 10,
  semanticPoints: false,
};
/** Узкий вариант круговой диаграммы — та же картинка, обрезанная по кругу. */
const NARROW_PIE_VIEWBOX = '146 44 268 268';
/** Центр круга: доли растут из него, когда график досчитывает до значений. */
const PIE_CENTRE_X = 280;
const PIE_CENTRE_Y = 178;
const PIE_CENTRE = `${PIE_CENTRE_X} ${PIE_CENTRE_Y}`;
const PALETTE_SIZE = 6;
const SEQUENCE_MESSAGE_STEP = 62;
const SEQUENCE_SELF_LOOP_WIDTH = 34;
const SEQUENCE_SELF_LOOP_HEIGHT = 24;
/** Участник последовательности переносит имя уже, чем узел флоу: шесть коробок встают в колонку. */
const SEQUENCE_NODE_MAX_WIDTH = 128;
/** Самый узкий промежуток между линиями жизни. */
const SEQUENCE_MIN_GAP = 120;
/** Зазор между коробками соседних участников. */
const SEQUENCE_BOX_GAP = 20;
/** Шире этого подпись сообщения не раздвигает участников, а переносится. */
const SEQUENCE_LABEL_ROOM = 240;
/** Поле слева от первого участника и справа от последнего. */
const SEQUENCE_MARGIN = 24;
/** Картинка последовательности не уже этого. */
const SEQUENCE_MIN_WIDTH = 480;
/** Ширина, в которую последовательность старается уложиться: та же колонка, что у флоу. */
const SEQUENCE_WIDTH_BUDGET = 640;
/** Остриё стрелки не доходит до линии жизни на столько, чтобы не сливаться с её штрихом. */
const SEQUENCE_ARROW_GAP = 3;
const GROUP_TITLE_MAX_WIDTH = 260;
/** Ширина, до которой переносится подпись связи во флоу: подпись становится узлом раскладки. */
const FLOW_LABEL_WIDTH = 112;
/**
 * Узел флоу уже узла последовательности: ширина слоя складывается из узлов и подписей, и узкие узлы
 * держат всю схему крупнее на странице.
 */
const FLOW_NODE_MAX_WIDTH = 196;
/**
 * Ширина колонки отчёта с оглавлением сбоку при окне 1100 px: шире неё схема ужимается вместе с
 * текстом. Без оглавления колонка шире, и схема просто встаёт в неё целиком.
 */
const FLOW_WIDTH_BUDGET = 640;
const EDGE_CORNER_RADIUS = 18;
/** Прямые углы скругляются меньше: дорожки ELK идут в двенадцати пикселях друг от друга. */
const ORTHOGONAL_CORNER_RADIUS = 8;
/** Насколько связь тянет свои концы друг к другу: `direct` держит её короткой, `around` отпускает. */
const ROUTE_WEIGHT: Readonly<Record<string, number>> = { auto: 1, direct: 4, around: 0.25 };
const SPACING_SCALE: Readonly<Record<string, number>> = {
  compact: 0.78,
  comfortable: 1,
  spacious: 1.3,
};

/** Одна раскладка схемы, готовая к рисованию: переключатель показывает их по одной. */
interface FlowView {
  readonly mode: FlowViewKind;
  readonly width: number;
  readonly height: number;
  readonly groups: readonly DiagramGroup[];
  readonly nodes: readonly (DiagramNode & { readonly status?: NodeStatus })[];
  readonly edges: readonly Element[];
  readonly labels: readonly Element[];
}

interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

interface ChartSeries {
  readonly label: string;
  readonly points: readonly ChartPoint[];
}

interface FlowGroupRecord {
  readonly id: string;
  readonly label: string;
  readonly lines: readonly string[];
  readonly titleWidth: number;
  readonly titleHeight: number;
}

interface FlowBox {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly status?: NodeStatus;
  readonly lines: readonly string[];
  readonly detailLines: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly detail?: string;
  readonly group?: string;
  readonly row?: number;
}

interface FlowEdgeRecord extends DiagramEdge {
  readonly route: string;
  readonly id?: string;
  /** Сколько раз связь пройдена: «×N» на схеме. */
  readonly count?: number;
  /**
   * Номер связи в раскладке. У петли (связь узла с самим собой) его нет: раскладка по слоям петель не
   * знает, петля рисуется на углу своего узла.
   */
  readonly layoutIndex?: number;
}

/**
 * Флоу, измеренный и разложенный до обогащения разметки: вид «прямые углы» считает ELK, а его вызов
 * асинхронный, тогда как обогащение идёт синхронным обходом дерева.
 */
export interface PreparedFlow {
  readonly groups: readonly FlowGroupRecord[];
  readonly boxes: readonly FlowBox[];
  readonly edges: readonly FlowEdgeRecord[];
  readonly views: FlowViews;
  /** Вложенный поток одного узла, в который летит камера. */
  readonly zoom?: {
    readonly node: string;
    readonly title: string;
    readonly flow: PreparedFlow;
  };
}

/** Подпись связи на схеме: слова автора и кратность «×N». */
function shownEdgeLabel(edge: {
  readonly label?: string;
  readonly count?: number;
}): string | undefined {
  if (edge.count === undefined) return edge.label;
  return edge.label === undefined
    ? countText(edge.count)
    : `${edge.label} ${countText(edge.count)}`;
}

/** Читает свойство, не забирая его: подготовка идёт до обогащения, которое заберёт его само. */
function peek(node: Element, property: string): string | undefined {
  const value = node.properties[property];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Раскладывает флоу во все виды заранее. Для графиков, хронологий и последовательностей подготовка
 * не нужна.
 */
export async function prepareVisualization(
  node: Element,
  strings: PackageStrings,
): Promise<PreparedFlow | undefined> {
  if (node.properties.dataSemantic !== 'diagram' || peek(node, 'dataType') === 'sequence') {
    return undefined;
  }
  const flow = await prepareFlow(node, node, strings);
  const zoom = semanticChildren(node, 'zoom')[0];
  if (zoom === undefined) return flow;
  return {
    ...flow,
    zoom: {
      node: peek(zoom, 'dataNode') ?? '',
      title: peek(zoom, 'dataDirectiveTitle') ?? '',
      flow: await prepareFlow(zoom, node, strings),
    },
  };
}

/**
 * Измеряет и раскладывает поток из прямых потомков `parts`: самой схемы или её пролёта. Отступы и
 * вид по умолчанию берутся у схемы `settings`.
 */
async function prepareFlow(
  parts: Element,
  settings: Element,
  strings: PackageStrings,
): Promise<PreparedFlow> {
  const node = parts;
  const scale = SPACING_SCALE[peek(settings, 'dataSpacing') ?? 'comfortable'] ?? 1;
  const layout = parts === settings ? (peek(settings, 'dataLayout') ?? 'auto') : 'right';
  const direction = parts === settings ? (peek(settings, 'dataDirection') ?? 'auto') : 'auto';
  const groups = semanticChildren(node, 'group').map((child): FlowGroupRecord => {
    const label = peek(child, 'dataLabel') ?? '';
    const wrapped = wrapMeasured(
      label,
      GROUP_TITLE_MAX_WIDTH,
      2,
      GROUP_FONT_SIZE,
      GROUP_FONT_WEIGHT,
    );
    return {
      id: peek(child, 'dataId') ?? '',
      label,
      lines: wrapped.lines,
      titleWidth: Math.ceil(wrapped.width) + 12,
      titleHeight: wrapped.lines.length * GROUP_TITLE_LINE_HEIGHT + 4,
    };
  });
  const boxes = semanticChildren(node, 'node').map((child, index): FlowBox => {
    const label = peek(child, 'dataLabel') ?? strings.node(index + 1);
    const detail = peek(child, 'dataDetail');
    const group = peek(child, 'dataGroup');
    const row = peek(child, 'dataRow');
    const status = nodeStatusOf(peek(child, 'dataStatus'));
    return {
      id: peek(child, 'dataId') ?? `node-${index + 1}`,
      label,
      kind: peek(child, 'dataKind') ?? 'neutral',
      ...(status === undefined ? {} : { status }),
      ...layoutNodeBox(label, detail, FLOW_NODE_MAX_WIDTH),
      ...(detail === undefined ? {} : { detail }),
      ...(group === undefined ? {} : { group }),
      ...(row === undefined ? {} : { row: Number.parseInt(row, 10) }),
    };
  });
  let laidOut = 0;
  const edges = semanticChildren(node, 'edge').map((edge): FlowEdgeRecord => {
    const label = peek(edge, 'dataLabel');
    const id = peek(edge, 'dataId');
    const count = peek(edge, 'dataCount');
    const from = peek(edge, 'dataFrom') ?? '';
    const to = peek(edge, 'dataTo') ?? '';
    return {
      from,
      to,
      route: peek(edge, 'dataRoute') ?? 'auto',
      kind: edgeKindOf(peek(edge, 'dataKind')),
      ...(label === undefined ? {} : { label }),
      ...(id === undefined ? {} : { id }),
      ...(count === undefined ? {} : { count: Number.parseInt(count, 10) }),
      ...(from === to ? {} : { layoutIndex: laidOut++ }),
    };
  });
  const layered =
    layout === 'down' || layout === 'right'
      ? layout
      : direction === 'down' || direction === 'right'
        ? direction
        : 'auto';
  const views = await layoutFlowViews({
    nodes: boxes.map((box) => ({
      id: box.id,
      width: box.width,
      height: box.height,
      ...(box.group === undefined ? {} : { group: box.group }),
      ...(box.row === undefined || !Number.isInteger(box.row) ? {} : { row: box.row }),
    })),
    groups: groups.map((group) => ({
      id: group.id,
      titleWidth: group.titleWidth,
      titleHeight: group.titleHeight,
    })),
    edges: edges.flatMap((edge) => {
      if (edge.layoutIndex === undefined) return [];
      const shown = shownEdgeLabel(edge);
      const label = shown === undefined ? undefined : layoutEdgeLabel(shown, FLOW_LABEL_WIDTH);
      return {
        from: edge.from,
        to: edge.to,
        weight: ROUTE_WEIGHT[edge.route] ?? 1,
        // Поля вокруг плашки: соседняя связь проходит мимо подписи, а не впритык к ней.
        ...(label === undefined
          ? {}
          : { label: { width: label.width + 4, height: label.height + 4 } }),
      };
    }),
    direction: layered,
    widthBudget: FLOW_WIDTH_BUDGET,
    nodeGap: Math.round(24 * scale),
    layerGap: Math.round(60 * scale),
    margin: DIAGRAM_MARGIN,
  });
  return { groups, boxes, edges, views };
}

export function enhanceVisualization(
  node: Element,
  semantic: string,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
  prepared?: PreparedFlow,
  messages: DiagramMessages = DIAGRAM_MESSAGES.en,
): boolean {
  if (semantic === 'chart') {
    enhanceChart(node, instance, allocateId, strings);
    return true;
  }
  if (semantic === 'diagram') {
    enhanceDiagram(node, instance, allocateId, strings, prepared, messages);
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
      : renderCartesian(type, series, xLabel, yLabel, strings.formatNumber, WIDE_CHART)),
  ];
  const narrowChildren: readonly ElementContent[] =
    type === 'pie'
      ? renderPie(series[0]?.points ?? [], strings.formatNumber, false)
      : renderCartesian(type, series, xLabel, yLabel, strings.formatNumber, NARROW_CHART);
  // Рост от нуля ведёт сценарий по часам страницы; разметка держит конечные значения.
  const countUp = take(node, 'dataCountUp') === 'true';
  node.tagName = 'figure';
  node.properties.dataVisualization = 'chart';
  node.properties.dataChartType = type;
  if (countUp) node.properties.dataCountUp = '';
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
          className: ['visualization-svg', 'visualization-svg-wide', `visualization-chart-${type}`],
          ...(type === 'pie' ? { dataPieCentre: PIE_CENTRE } : {}),
        },
        svgChildren,
      ),
      element(
        'svg',
        {
          viewBox:
            type === 'pie'
              ? NARROW_PIE_VIEWBOX
              : `0 0 ${NARROW_CHART.width} ${NARROW_CHART.height}`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: [
            'visualization-svg',
            'visualization-svg-narrow',
            `visualization-chart-${type}`,
          ],
          ...(type === 'pie' ? { dataPieCentre: PIE_CENTRE } : {}),
        },
        [...narrowChildren],
      ),
    ]),
    renderLegend(series, type, strings),
  ];
}

/** Сколько делений примерно хочет ось значений. */
const AXIS_TICKS = 4;

/** Шаг делений из ряда 1, 2, 2.5 и 5, умноженных на степень десяти: подписи оси — круглые числа. */
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function renderCartesian(
  type: string,
  series: readonly ChartSeries[],
  xLabel: string | undefined,
  yLabel: string | undefined,
  formatNumber: (value: number) => string,
  frame: ChartFrame,
): readonly ElementContent[] {
  const PLOT = frame.plot;
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const step = niceStep((Math.max(0, ...values) - Math.min(0, ...values)) / AXIS_TICKS);
  const minimum = Math.floor(Math.min(0, ...values) / step) * step;
  const maximum = Math.max(minimum + step, Math.ceil(Math.max(0, ...values) / step) * step);
  const span = maximum - minimum;
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const y = (value: number): number => PLOT.top + ((maximum - value) / span) * PLOT.height;
  const zeroY = y(0);
  const children: ElementContent[] = [];

  for (let tick = 0; minimum + tick * step <= maximum + step / 2; tick += 1) {
    // Сложение шагов копит двоичную погрешность: 0.1 × 3 даёт 0.30000000000000004.
    const value = Number((minimum + tick * step).toPrecision(12));
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
        labelLines(label, frame.labelLength).map((line, lineIndex) =>
          element('tspan', { x, dy: lineIndex === 0 ? 0 : '1.15em' }, [text(line)]),
        ),
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
              ...(frame.semanticPoints ? ['semantic-point'] : []),
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
              ...(frame.semanticPoints ? ['semantic-point'] : []),
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
          y: frame.axisTitleY,
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

/**
 * Подпись категории: на узком графике — до двух строк по словам вместо обрезки многоточием, чтобы
 * «Ticket search» не становилось «Ticket s…».
 */
function labelLines(label: string, length: number): readonly string[] {
  if (label.length <= length) return [label];
  const words = label.split(/\s+/u);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length <= length + 3 || current === '') current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  if (lines.length <= 2) return lines.map((line) => shortLabel(line, length + 4));
  return [lines[0] ?? '', shortLabel(lines.slice(1).join(' '), length + 4)];
}

function renderPie(
  points: readonly ChartPoint[],
  formatNumber: (value: number) => string,
  semanticPoints = true,
): readonly ElementContent[] {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  let angle = -Math.PI / 2;
  const children: ElementContent[] = [];
  points.forEach((point, index) => {
    const next = angle + (point.value / total) * Math.PI * 2;
    children.push(
      element('path', {
        d: arcPath(PIE_CENTRE_X, PIE_CENTRE_Y, 126, angle, next),
        className: [
          ...(semanticPoints ? ['semantic-point'] : []),
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
  prepared: PreparedFlow | undefined,
  messages: DiagramMessages,
): void {
  const title = take(node, 'dataDirectiveTitle') ?? strings.diagram;
  const description = take(node, 'dataDescription') ?? title;
  const type = take(node, 'dataType') ?? 'flow';
  const direction = take(node, 'dataDirection') ?? 'auto';
  const layout = take(node, 'dataLayout') ?? 'auto';
  const spacing = take(node, 'dataSpacing') ?? 'comfortable';
  if (type === 'sequence') {
    enhanceSequenceDiagram(node, instance, allocateId, title, description, strings);
    return;
  }
  if (prepared === undefined) {
    throw new Error('A flow diagram reached enhancement without its prepared layout.');
  }
  enhanceFlowDiagram(
    node,
    instance,
    allocateId,
    title,
    description,
    direction,
    layout,
    spacing,
    strings,
    prepared,
    messages,
  );
}

function edgeKindOf(value: string | undefined): DiagramEdgeKindChoice {
  return (
    DIAGRAM_CONTRACT.edgeKinds.find((kind) => kind === value) ?? DIAGRAM_CONTRACT.defaultEdgeKind
  );
}

type LegendEntry =
  | { readonly subject: 'edge'; readonly kind: DiagramEdgeKindChoice; readonly label: string }
  | { readonly subject: 'node'; readonly kind: string; readonly label: string }
  | { readonly subject: 'status'; readonly kind: NodeStatus; readonly label: string };

interface DiagramLegend {
  readonly title?: string;
  readonly entries: readonly LegendEntry[];
  /** Слова, которыми схема называет вид связи: авторские из легенды или пакетные. */
  readonly edgeWords: (kind: DiagramEdgeKindChoice) => string;
  /** Авторский смысл выделения узла; у выделения без пункта легенды смысла нет. */
  readonly nodeWords: (kind: string) => string | undefined;
  /** Показывать ли вид связи в описании: только если легенда его различает. */
  readonly namesEdgeKinds: boolean;
  /** Слово статуса: авторское из легенды или пакетное. */
  readonly statusWords: (status: NodeStatus) => string;
}

/**
 * Легенда: пункты автора в его порядке, затем виды связей, которые схема смешивает, если автор их
 * не назвал и не скрыл. Начертания пунктов рисует пакет, автор задаёт только слова.
 */
function readLegend(
  node: Element,
  edges: readonly DiagramEdge[],
  strings: PackageStrings,
  messages: DiagramMessages = DIAGRAM_MESSAGES.en,
  statuses: readonly NodeStatus[] = [],
): DiagramLegend {
  const settings = semanticChildren(node, 'legend')[0];
  const title = settings === undefined ? undefined : take(settings, 'dataTitle');
  const automatic = settings === undefined || take(settings, 'dataAuto') !== 'false';
  const items = semanticChildren(node, 'legend-item').map((item) => {
    // `take` забирает свойство, поэтому читается один раз, до сравнения.
    const edge = take(item, 'dataEdge');
    return {
      edge: DIAGRAM_CONTRACT.edgeKinds.find((kind) => kind === edge),
      node: take(item, 'dataNode'),
      status: nodeStatusOf(take(item, 'dataStatus')),
      label: take(item, 'dataLabel'),
      hidden: take(item, 'dataHidden') === 'true',
    };
  });
  const statusWords = (status: NodeStatus): string =>
    items.find((item) => item.status === status && item.label !== undefined)?.label ??
    messages.statuses[status];
  const edgeWords = (kind: DiagramEdgeKindChoice): string =>
    items.find((item) => item.edge === kind && item.label !== undefined)?.label ??
    strings.edgeKinds[kind];
  const entries: LegendEntry[] = items.flatMap((item): LegendEntry[] => {
    if (item.hidden) return [];
    if (item.edge !== undefined) {
      return [{ subject: 'edge', kind: item.edge, label: edgeWords(item.edge) }];
    }
    if (item.status !== undefined) {
      return statuses.includes(item.status)
        ? [{ subject: 'status', kind: item.status, label: statusWords(item.status) }]
        : [];
    }
    return item.node === undefined || item.label === undefined
      ? []
      : [{ subject: 'node', kind: item.node, label: item.label }];
  });
  const mixed = DIAGRAM_CONTRACT.edgeKinds.filter((kind) =>
    edges.some((edge) => edge.kind === kind),
  );
  if (automatic && mixed.length >= DIAGRAM_CONTRACT.edgeKindLegend.minimumKinds) {
    for (const kind of mixed) {
      if (items.some((item) => item.edge === kind)) continue;
      entries.push({ subject: 'edge', kind, label: edgeWords(kind) });
    }
  }
  // Статус имеет смысл пакета: его пункт появляется сам, в порядке статусов, если автор его не назвал.
  if (automatic) {
    for (const status of NODE_STATUSES) {
      if (!statuses.includes(status) || items.some((item) => item.status === status)) continue;
      entries.push({ subject: 'status', kind: status, label: statusWords(status) });
    }
  }
  return {
    ...(title === undefined ? {} : { title }),
    entries,
    edgeWords,
    nodeWords: (kind) => items.find((item) => item.node === kind)?.label,
    namesEdgeKinds: entries.some((entry) => entry.subject === 'edge'),
    statusWords,
  };
}

function enhanceFlowDiagram(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  title: string,
  description: string,
  direction: string,
  layout: string,
  spacing: string,
  strings: PackageStrings,
  prepared: PreparedFlow,
  messages: DiagramMessages,
): void {
  const { boxes, edges: edgeRecords, views: placedViews } = prepared;
  const pulse = (peek(node, 'dataPulse') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const views: readonly FlowView[] = [
    drawFlow(prepared, 'down', pulse),
    drawFlow(prepared, 'right', pulse),
    drawFlow(prepared, 'orthogonal', pulse),
  ];
  const defaultView = resolveDefaultView(layout, direction, placedViews.preferred);
  const described = views[0] ?? drawFlow(prepared, 'down', pulse);
  const legend = readLegend(node, edgeRecords, strings, messages, statusesOf(boxes));
  const words = describeFlow(
    described.nodes.map((item) => describedNode(item, legend)),
    described.groups,
    edgeRecords.map((edge) => ({
      ...describedEdge(edge, legend),
      backward:
        edge.layoutIndex === undefined ||
        (placedViews.down.edges[edge.layoutIndex]?.backward ?? false),
    })),
    strings,
  );
  const sections = [...words.sections];
  if (pulse.length > 0) {
    const labels = new Map(boxes.map((box) => [box.id, box.label]));
    sections.push({
      heading: messages.pulseRoute,
      ordered: true,
      items: pulse.map((id) => labels.get(id) ?? id),
    });
  }
  const zoom = prepared.zoom;
  const zoomTarget = zoom === undefined ? undefined : boxes.find((box) => box.id === zoom.node);
  if (zoom !== undefined && zoomTarget !== undefined) {
    const inner = drawFlow(zoom.flow, 'down', []);
    const innerWords = describeFlow(
      inner.nodes.map((item) => describedNode(item, legend)),
      inner.groups,
      zoom.flow.edges.map((edge) => ({
        ...describedEdge(edge, legend),
        backward:
          edge.layoutIndex === undefined ||
          (zoom.flow.views.down.edges[edge.layoutIndex]?.backward ?? false),
      })),
      strings,
    );
    sections.push({
      heading: messages.zoomSection(zoomTarget.label),
      ordered: false,
      items: [
        ...(zoom.title === '' ? [] : [zoom.title]),
        innerWords.lead,
        ...innerWords.sections.map((section) => `${section.heading}: ${section.items.join('; ')}`),
      ],
    });
  }
  const allWords = { lead: words.lead, sections };
  const summary = descriptionSentence(description, allWords);
  node.tagName = 'figure';
  node.properties.dataVisualization = 'diagram';
  node.properties.dataDiagramType = 'flow';
  node.properties.dataDiagramDirection = direction;
  node.properties.dataDiagramLayout = layout;
  // Вид, который автор получает по умолчанию и который уходит в печать.
  node.properties.dataDiagramDefaultView = defaultView;
  node.properties.dataDiagramSpacing = spacing;

  if (zoom !== undefined && zoomTarget !== undefined) {
    const outer = views.find((view) => view.mode === defaultView) ?? described;
    node.properties.dataZoom = zoom.node;
    node.children = [
      caption(title, description),
      ...renderZoomScene({
        outer,
        inner: closestAspect(
          zoom.flow,
          outer.nodes.find((item) => item.id === zoom.node),
        ),
        target: zoom.node,
        title,
        summary,
        innerTitle: zoom.title === '' ? messages.zoomInside(zoomTarget.label) : zoom.title,
        outsideCaption: messages.zoomOutside,
        allocateId,
        instance,
        // Каждая картинка получает свои копии слоёв: одна и та же связь не живёт в двух местах дерева.
        body: (view) => structuredClone(flowBody(view)),
      }),
      ...diagramLegend(legend, strings),
      diagramTranscript(allWords, strings),
    ];
    return;
  }

  const panels = views.map((view) => {
    const selected = view.mode === defaultView;
    const titleId = allocateId(`visual-${instance}-${view.mode}-title`);
    const descriptionId = allocateId(`visual-${instance}-${view.mode}-description`);
    const panelId = allocateId(`visual-${instance}-${view.mode}`);
    const tabId = allocateId(`visual-${instance}-${view.mode}-tab`);
    const svg = element(
      'svg',
      {
        viewBox: `0 0 ${round(view.width)} ${round(view.height)}`,
        // Естественная ширина: страница ужимает схему, когда та не помещается, но не раздувает её.
        width: round(view.width),
        style: `--diagram-width: ${round(view.width)}px`,
        role: 'img',
        ariaLabelledBy: [titleId],
        ariaDescribedBy: [descriptionId],
        className: ['visualization-svg', 'visualization-diagram'],
      },
      [
        element('title', { id: titleId }, [text(title)]),
        element('desc', { id: descriptionId }, [text(summary)]),
        ...flowBody(view),
        ...(pulse.length > 0
          ? [
              element('circle', {
                r: 5,
                cx: -20,
                cy: -20,
                className: ['visualization-pulse-dot'],
                dataPulseDot: '',
                ariaHidden: 'true',
              }),
            ]
          : []),
      ],
    );
    return {
      button: element(
        'button',
        {
          type: 'button',
          id: tabId,
          role: 'tab',
          ariaControls: [panelId],
          ariaSelected: selected ? 'true' : 'false',
          tabIndex: selected ? 0 : -1,
          dataTab: '',
          dataLayoutMode: view.mode,
        },
        [text(strings.diagramLayouts[view.mode])],
      ),
      panel: element(
        'div',
        {
          id: panelId,
          role: 'tabpanel',
          ariaLabelledBy: [tabId],
          tabIndex: 0,
          dataTabPanel: '',
          dataLayoutView: view.mode,
          ...(selected ? { dataLayoutDefault: '' } : { hidden: true }),
          className: ['visualization-layout-view'],
        },
        [element('div', { className: ['visualization-frame'] }, [svg])],
      ),
    };
  });

  node.children = [
    caption(title, description),
    // Переключатель — те же вкладки пакета: клавиатура и выбор уже живут в их среде выполнения.
    element('div', { className: ['visualization-layouts'], dataTabs: '' }, [
      element(
        'div',
        {
          role: 'tablist',
          ariaLabel: strings.diagramLayouts.switcher,
          className: ['semantic-tab-list', 'visualization-layout-switch'],
        },
        panels.map((item) => item.button),
      ),
      ...panels.map((item) => item.panel),
    ]),
    ...diagramLegend(legend, strings),
    diagramTranscript(allWords, strings),
  ];
}

/** Статусы, которые несут узлы схемы, в порядке пакета. */
function statusesOf(boxes: readonly FlowBox[]): readonly NodeStatus[] {
  return NODE_STATUSES.filter((status) => boxes.some((box) => box.status === status));
}

/** Слои SVG одного вида по порядку рисования: группы, связи, узлы, подписи поверх всего. */
function flowBody(view: FlowView): readonly Element[] {
  return [
    ...view.groups.map((item) => diagramGroup(item)),
    ...view.edges,
    ...view.nodes.map((item) => flowNode(item)),
    // Подписи идут последним слоем: иначе линия соседней связи перечёркивает чужую подпись.
    ...view.labels,
  ];
}

/** Узел потока; узел со статусом получает рамку цвета статуса и значок на кромке. */
function flowNode(node: DiagramNode & { readonly status?: NodeStatus }): Element {
  const drawn = diagramNode(node);
  if (node.status === undefined) return drawn;
  drawn.properties.dataStatus = node.status;
  const [frame] = drawn.children;
  if (frame?.type === 'element') {
    const classes = Array.isArray(frame.properties.className) ? frame.properties.className : [];
    frame.properties.className = [...classes, `visualization-node-status-${node.status}`];
  }
  drawn.children.push(statusBadge(node.status, node.x, node.y));
  return drawn;
}

/**
 * Вид вложенного потока, чьи пропорции ближе всего к коробке узла: камера вписывает его в узел, и
 * вытянутый поперёк узла вид вышел бы мельче.
 */
function closestAspect(flow: PreparedFlow, box: DiagramNode | undefined): FlowView {
  const aspect = (box?.width ?? NODE_DEFAULT_WIDTH) / (box?.height ?? NODE_DEFAULT_HEIGHT);
  const candidates = (['right', 'down'] as const).map((mode) => drawFlow(flow, mode, []));
  return candidates.reduce((best, next) =>
    Math.abs(Math.log(next.width / next.height / aspect)) <
    Math.abs(Math.log(best.width / best.height / aspect))
      ? next
      : best,
  );
}

/** Связи маршрута импульсов: номер шага у первой связи, ведущей от узла маршрута к следующему. */
function pulseSteps(
  edges: readonly FlowEdgeRecord[],
  route: readonly string[],
): ReadonlyMap<number, number> {
  const steps = new Map<number, number>();
  for (let step = 1; step < route.length; step += 1) {
    const index = edges.findIndex(
      (edge) => edge.from === route[step - 1] && edge.to === route[step],
    );
    if (index !== -1 && !steps.has(index)) steps.set(index, step);
  }
  return steps;
}

/** Ширина, до которой переносится подпись петли: она стоит сбоку от узла, в зазоре между узлами. */
const SELF_LOOP_LABEL_WIDTH = 96;

/**
 * Один вид потока, готовый к рисованию. Петли раскладка не видит: они рисуются на углу своего узла, и
 * вид расширяется, если петля с подписью выходит за его край.
 */
function drawFlow(prepared: PreparedFlow, mode: FlowViewKind, pulse: readonly string[]): FlowView {
  const placed = prepared.views[mode];
  const nodes = prepared.boxes.map((box) => ({
    ...box,
    ...(placed.nodes.get(box.id) ?? { x: 0, y: 0 }),
    layer: placed.layers.get(box.id) ?? 0,
  }));
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const steps = pulseSteps(prepared.edges, pulse);
  const radius = mode === 'orthogonal' ? ORTHOGONAL_CORNER_RADIUS : EDGE_CORNER_RADIUS;
  let width = placed.width;
  let height = placed.height;
  const edges = prepared.edges.flatMap((edge, index): Element[] => {
    const laid = edge.layoutIndex === undefined ? undefined : placed.edges[edge.layoutIndex];
    const extra: Record<string, string> = {
      ...(edge.id === undefined ? {} : { dataEdgeId: edge.id }),
      ...(edge.count === undefined ? {} : { dataCount: String(edge.count) }),
      ...(steps.has(index) ? { dataPulseStep: String(steps.get(index)) } : {}),
      ...(edge.layoutIndex === undefined ? { dataSelf: '' } : {}),
      ...(laid?.backward === true ? { dataBackward: '' } : {}),
    };
    if (edge.layoutIndex !== undefined) {
      return [...flowEdge(edge, index, laid?.points ?? [], laid?.label, radius, extra)];
    }
    const box = byId.get(edge.from);
    if (box === undefined) return [];
    const loop = selfLoop(
      { x: box.x, y: box.y, width: box.width },
      index,
      {
        dataFrom: edge.from,
        dataTo: edge.to,
        dataRoute: edge.route,
        dataEdgeKind: edge.kind,
        ...extra,
      },
      ['semantic-edge', 'visualization-edge', `visualization-edge-kind-${edge.kind}`],
    );
    width = Math.max(width, box.x + box.width + SELF_LOOP_REACH.right + DIAGRAM_MARGIN / 2);
    return [loop.path, edgeArrow(edge.kind, loop.tip.x, loop.tip.y, -1, 0)];
  });
  const labels = prepared.edges.flatMap((edge): Element[] => {
    const shown = shownEdgeLabel(edge);
    if (shown === undefined) return [];
    if (edge.layoutIndex === undefined) {
      const box = byId.get(edge.from);
      if (box === undefined) return [];
      const x = box.x + box.width + SELF_LOOP_REACH.right - 4;
      const plate = layoutEdgeLabel(shown, SELF_LOOP_LABEL_WIDTH);
      width = Math.max(width, x + plate.width + DIAGRAM_MARGIN / 2);
      height = Math.max(height, box.y + plate.height + DIAGRAM_MARGIN / 2);
      return [edgeLabel(shown, x, box.y - 6, 'start', SELF_LOOP_LABEL_WIDTH, 'center')];
    }
    const point = placed.edges[edge.layoutIndex]?.label;
    return point === undefined
      ? []
      : [edgeLabel(shown, point.x, point.y + 4, 'middle', FLOW_LABEL_WIDTH, 'center')];
  });
  return {
    mode,
    width,
    height,
    nodes,
    groups: prepared.groups.map((group) => {
      const box = placed.groups.get(group.id);
      return {
        id: group.id,
        label: group.label,
        lines: group.lines,
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        title: box?.title ?? { x: 0, y: 0 },
        titleAlign: box?.titleAlign ?? 'middle',
      };
    }),
    edges,
    labels,
  };
}

/**
 * Вид по умолчанию: названный `layout`, иначе направление из `direction`, иначе тот, что раскладка
 * сочла лучшим по пересечениям, размеру на странице и порядку потока.
 */
function resolveDefaultView(
  layout: string,
  direction: string,
  preferred: FlowViewKind,
): FlowViewKind {
  if (layout === 'down' || layout === 'right' || layout === 'orthogonal') return layout;
  if (direction === 'down' || direction === 'right') return direction;
  return preferred;
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
    const detail = take(child, 'dataDetail');
    return {
      id: take(child, 'dataId') ?? `participant-${index + 1}`,
      label,
      kind: take(child, 'dataKind') ?? 'neutral',
      ...layoutNodeBox(label, detail, SEQUENCE_NODE_MAX_WIDTH),
      ...(detail === undefined ? {} : { detail }),
    };
  });
  const messages = semanticChildren(node, 'edge').map((edge) => ({
    from: take(edge, 'dataFrom') ?? '',
    to: take(edge, 'dataTo') ?? '',
    label: take(edge, 'dataLabel') ?? '',
    kind: edgeKindOf(take(edge, 'dataKind')),
  }));
  const gaps = sequenceGaps(measured, messages);
  const firstLifeline = SEQUENCE_MARGIN + (measured[0]?.width ?? 0) / 2;
  const participants = measured.map((item, index) => {
    const lifeline = firstLifeline + gaps.slice(0, index).reduce((sum, gap) => sum + gap, 0);
    return { ...item, x: Math.round(lifeline - item.width / 2), y: 28 };
  });
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const placed = placeSequenceMessages(messages, byId, gaps, participants);
  const lastMessage = placed.at(-1);
  const lastParticipant = participants.at(-1);
  const width = Math.max(
    SEQUENCE_MIN_WIDTH,
    lastParticipant === undefined ? 0 : lastParticipant.x + lastParticipant.width + SEQUENCE_MARGIN,
    ...placed.map((message) => message.right + DIAGRAM_MARGIN),
  );
  const height =
    lastMessage === undefined
      ? 150
      : Math.max(lastMessage.y + 80, lastMessage.y + lastMessage.below + 42);
  const titleId = allocateId(`visual-${instance}-title`);
  const descriptionId = allocateId(`visual-${instance}-description`);
  const bottom = height - 24;
  const participantElements = participants.flatMap((participant) => [
    element('line', {
      x1: participant.x + participant.width / 2,
      y1: participant.y + participant.height,
      x2: participant.x + participant.width / 2,
      y2: bottom,
      className: ['visualization-sequence-lifeline'],
      dataParticipant: participant.id,
    }),
    diagramNode(participant),
  ]);
  const messageElements = placed.flatMap((message, index) =>
    message.from === message.to
      ? sequenceSelfMessage(message, index)
      : sequenceMessage(message, index),
  );
  const legend = readLegend(node, messages, strings);
  const words = describeSequence(
    participants.map((item) => describedNode(item, legend)),
    messages.map((message) => describedEdge(message, legend)),
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
          width,
          style: `--diagram-width: ${width}px`,
          role: 'img',
          ariaLabelledBy: [titleId],
          ariaDescribedBy: [descriptionId],
          className: ['visualization-svg', 'visualization-diagram', 'visualization-sequence'],
        },
        [
          element('title', { id: titleId }, [text(title)]),
          element('desc', { id: descriptionId }, [text(descriptionSentence(description, words))]),
          ...participantElements,
          ...messageElements,
        ],
      ),
    ]),
    ...diagramLegend(legend, strings),
    diagramTranscript(words, strings),
  ];
}

/**
 * Ломаная раскладки со скруглёнными углами. Сплайн через те же точки на резком повороте выгибается
 * наружу и задевает соседний узел; скругление остаётся внутри угла, а прямые участки раскладка уже
 * провела мимо узлов.
 */
function roundedPath(
  points: readonly LayoutPoint[],
  radius: number,
  sharp: LayoutPoint | undefined,
): string {
  const [first] = points;
  if (first === undefined) return '';
  const commands = [`M ${round(first.x)} ${round(first.y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? first;
    const corner = points[index] ?? first;
    const after = points[index + 1] ?? corner;
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y) || 1;
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y) || 1;
    // Точка подписи остаётся на линии: скругление срезало бы угол мимо неё.
    const cut = corner === sharp ? 0 : Math.min(radius, incoming / 2, outgoing / 2);
    const enter = {
      x: corner.x - ((corner.x - before.x) / incoming) * cut,
      y: corner.y - ((corner.y - before.y) / incoming) * cut,
    };
    const leave = {
      x: corner.x + ((after.x - corner.x) / outgoing) * cut,
      y: corner.y + ((after.y - corner.y) / outgoing) * cut,
    };
    commands.push(
      `L ${round(enter.x)} ${round(enter.y)} Q ${round(corner.x)} ${round(corner.y)} ${round(leave.x)} ${round(leave.y)}`,
    );
  }
  const last = points.at(-1) ?? first;
  commands.push(`L ${round(last.x)} ${round(last.y)}`);
  return commands.join(' ');
}

/** Связь флоу: своя кривая через свои точки, наконечник по виду связи на грани цели. */
function flowEdge(
  edge: {
    readonly from: string;
    readonly to: string;
    readonly route: string;
    readonly kind: DiagramEdgeKindChoice;
  },
  index: number,
  points: readonly LayoutPoint[],
  label: LayoutPoint | undefined,
  radius: number,
  extra: Readonly<Record<string, string>> = {},
): readonly Element[] {
  const end = points.at(-1);
  const before = points.at(-2);
  if (end === undefined || before === undefined) return [];
  const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
  const unitX = (end.x - before.x) / length;
  const unitY = (end.y - before.y) / length;
  // Наконечник отступает от грани узла, а линия кончается под его основанием и не торчит из острия.
  const tip = { x: end.x - unitX * 2, y: end.y - unitY * 2 };
  const shaftEnd = { x: tip.x - unitX * (ARROW_LENGTH - 2), y: tip.y - unitY * (ARROW_LENGTH - 2) };
  return [
    element('path', {
      d: roundedPath(
        [...points.slice(0, -1), shaftEnd],
        radius,
        points.find((point) => point.x === label?.x && point.y === label.y),
      ),
      fill: 'none',
      className: ['semantic-edge', 'visualization-edge', `visualization-edge-kind-${edge.kind}`],
      dataEdge: String(index + 1),
      dataFrom: edge.from,
      dataTo: edge.to,
      dataRoute: edge.route,
      dataEdgeKind: edge.kind,
      ...extra,
    }),
    edgeArrow(edge.kind, tip.x, tip.y, unitX, unitY),
  ];
}

/** Образец пункта легенды рисуется тем же начертанием, что и связь или узел на схеме. */
function legendSample(entry: LegendEntry): Element {
  if (entry.subject === 'status') {
    return element(
      'svg',
      {
        viewBox: '0 -9 40 26',
        className: ['visualization-legend-sample'],
        ariaHidden: 'true',
      },
      [
        element('rect', {
          x: 1,
          y: 0,
          width: 38,
          height: 16,
          rx: 5,
          className: ['visualization-node', `visualization-node-status-${entry.kind}`],
        }),
        statusBadge(entry.kind, 1, 0),
      ],
    );
  }
  return entry.subject === 'edge'
    ? element(
        'svg',
        { viewBox: '0 0 44 12', className: ['visualization-legend-sample'], ariaHidden: 'true' },
        [
          element('path', {
            d: 'M 2 6 H 32',
            fill: 'none',
            className: ['visualization-edge', `visualization-edge-kind-${entry.kind}`],
          }),
          edgeArrow(entry.kind, 42, 6, 1, 0),
        ],
      )
    : element(
        'svg',
        { viewBox: '0 0 30 18', className: ['visualization-legend-sample'], ariaHidden: 'true' },
        [
          element('rect', {
            x: 1,
            y: 1,
            width: 28,
            height: 16,
            rx: 5,
            className: ['visualization-node', `visualization-node-${entry.kind}`],
          }),
        ],
      );
}

function diagramLegend(legend: DiagramLegend, strings: PackageStrings): Element[] {
  if (legend.entries.length === 0) return [];
  return [
    element('div', { className: ['semantic-legend', 'visualization-diagram-legend'] }, [
      ...(legend.title === undefined
        ? []
        : [element('p', { className: ['visualization-legend-title'] }, [text(legend.title)])]),
      element(
        'ul',
        {
          className: ['visualization-legend', 'visualization-edge-legend'],
          ariaLabel: legend.title ?? strings.legend,
        },
        legend.entries.map((entry) =>
          element(
            'li',
            {
              className: ['semantic-legend-item'],
              ...(entry.subject === 'edge'
                ? { dataEdgeKind: entry.kind }
                : entry.subject === 'status'
                  ? { dataNodeStatus: entry.kind }
                  : { dataNodeKind: entry.kind }),
            },
            [legendSample(entry), text(entry.label)],
          ),
        ),
      ),
    ]),
  ];
}

function describedNode(
  node: DiagramNode & { readonly status?: NodeStatus },
  legend: DiagramLegend,
): DescribedNode {
  const meaning = legend.nodeWords(node.kind);
  return {
    id: node.id,
    label: node.label,
    ...(node.status === undefined ? {} : { status: legend.statusWords(node.status) }),
    ...(node.detail === undefined ? {} : { detail: node.detail }),
    ...(meaning === undefined ? {} : { meaning }),
    ...(node.group === undefined ? {} : { group: node.group }),
    ...(node.layer === undefined ? {} : { layer: node.layer }),
  };
}

function describedEdge(
  edge: DiagramEdge & { readonly count?: number },
  legend: DiagramLegend,
): DescribedEdge {
  return {
    from: edge.from,
    to: edge.to,
    ...(edge.count === undefined ? {} : { count: countText(edge.count) }),
    ...(edge.label === undefined ? {} : { label: edge.label }),
    ...(legend.namesEdgeKinds ? { kind: legend.edgeWords(edge.kind) } : {}),
  };
}

/**
 * Схема словами под картинкой: закрытый `<details>` для читателя, которому картинка не помогает.
 * Текст тот же, что в `<desc>`, только разложен по спискам.
 */
function diagramTranscript(words: DiagramDescription, strings: PackageStrings): Element {
  return element('details', { className: ['visualization-transcript'] }, [
    element('summary', {}, [text(strings.diagramText.transcript)]),
    element('p', {}, [text(words.lead)]),
    ...words.sections.flatMap((section) => [
      element('p', { className: ['visualization-transcript-heading'] }, [text(section.heading)]),
      element(
        section.ordered ? 'ol' : 'ul',
        {},
        section.items.map((item) => element('li', {}, [text(item)])),
      ),
    ]),
  ]);
}

interface PlacedSequenceMessage {
  readonly from: DiagramNode;
  readonly to: DiagramNode;
  readonly label: string;
  readonly kind: DiagramEdgeKindChoice;
  /** Линия сообщения; у сообщения самому себе — середина петли. */
  readonly y: number;
  readonly labelWidth: number;
  /** Сколько сообщение занимает под своей линией. */
  readonly below: number;
  /** Правый край сообщения вместе с подписью. */
  readonly right: number;
  /** Петля сообщения самому себе смотрит влево от линии жизни. */
  readonly mirrored: boolean;
}

function lifelineX(participant: DiagramNode): number {
  return participant.x + (participant.width ?? NODE_DEFAULT_WIDTH) / 2;
}

/**
 * Шаг между сообщениями считается от высоты подписей: многострочная подпись растёт вверх от своей
 * линии и не должна доставать до линии предыдущего сообщения.
 */
/**
 * Промежутки между соседними линиями жизни. Промежуток не уже соседних коробок и растёт под подписи
 * сообщений между этими двумя участниками и под петли левого из них, но не шире
 * SEQUENCE_LABEL_ROOM и в пределах SEQUENCE_WIDTH_BUDGET: длинная подпись переносится, а не
 * раздувает картинку. Сообщение через несколько участников места не просит — ему хватает суммы
 * промежутков.
 */
function sequenceGaps(
  participants: readonly { readonly id: string; readonly width: number }[],
  messages: readonly { readonly from: string; readonly to: string; readonly label: string }[],
): number[] {
  const position = new Map(participants.map((participant, index) => [participant.id, index]));
  const wanted = participants.slice(0, -1).map((participant, index) => {
    const next = participants[index + 1];
    const boxes = (participant.width + (next?.width ?? 0)) / 2 + SEQUENCE_BOX_GAP;
    const labels = messages.flatMap((message) => {
      const from = position.get(message.from);
      const to = position.get(message.to);
      if (from === undefined || to === undefined) return [];
      const natural = layoutEdgeLabel(message.label, Number.POSITIVE_INFINITY).width;
      if (from === to) {
        const loopSide = from === participants.length - 1 ? from - 1 : from;
        return loopSide === index
          ? [Math.min(natural, SEQUENCE_LABEL_ROOM) + SEQUENCE_SELF_LOOP_WIDTH + 36]
          : [];
      }
      return Math.min(from, to) === index && Math.max(from, to) === index + 1
        ? [Math.min(natural, SEQUENCE_LABEL_ROOM) + 24]
        : [];
    });
    return {
      base: Math.max(SEQUENCE_MIN_GAP, boxes),
      wanted: Math.max(SEQUENCE_MIN_GAP, boxes, ...labels),
    };
  });
  // Подписям достаётся только то, что остаётся от бюджета ширины после коробок: иначе страница
  // ужимает всю картинку, и мельчает текст всех сообщений, а не переносится одна подпись.
  const ends = ((participants[0]?.width ?? 0) + (participants.at(-1)?.width ?? 0)) / 2;
  const available = SEQUENCE_WIDTH_BUDGET - 2 * SEQUENCE_MARGIN - ends;
  const base = wanted.reduce((sum, gap) => sum + gap.base, 0);
  const extra = wanted.reduce((sum, gap) => sum + gap.wanted - gap.base, 0);
  const share = extra === 0 ? 0 : Math.min(1, Math.max(0, (available - base) / extra));
  return wanted.map((gap) => Math.ceil(gap.base + (gap.wanted - gap.base) * share));
}

function placeSequenceMessages(
  messages: readonly {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly kind: DiagramEdgeKindChoice;
  }[],
  byId: ReadonlyMap<string, DiagramNode>,
  gaps: readonly number[],
  participants: readonly DiagramNode[],
): readonly PlacedSequenceMessage[] {
  const headerBottom =
    28 +
    Math.max(0, ...participants.map((participant) => participant.height ?? NODE_DEFAULT_HEIGHT));
  const placed: PlacedSequenceMessage[] = [];
  for (const message of messages) {
    const from = byId.get(message.from);
    const to = byId.get(message.to);
    if (from === undefined || to === undefined) continue;
    const self = from === to;
    const position = participants.indexOf(from);
    // Петля занимает промежуток до правого соседа, у последнего участника — до левого.
    const room = gaps[position] ?? gaps[position - 1] ?? SEQUENCE_MIN_GAP;
    const labelWidth = self
      ? Math.max(EDGE_LABEL_MIN_WIDTH, room - SEQUENCE_SELF_LOOP_WIDTH - 36)
      : Math.max(EDGE_LABEL_MIN_WIDTH, Math.abs(lifelineX(to) - lifelineX(from)) - 24);
    const layout = layoutEdgeLabel(message.label, labelWidth);
    const above = self
      ? Math.max(SEQUENCE_SELF_LOOP_HEIGHT / 2, layout.height / 2 + 4)
      : EDGE_LABEL_RISE + layout.height - 17;
    const below = self ? Math.max(SEQUENCE_SELF_LOOP_HEIGHT / 2 + 6, layout.height / 2 - 4) : 6;
    const previous = placed.at(-1);
    const y =
      previous === undefined
        ? Math.max(132, headerBottom + 14 + above)
        : Math.max(previous.y + SEQUENCE_MESSAGE_STEP, previous.y + previous.below + 14 + above);
    // У последнего участника справа нет соседа: петля и подпись уходят влево, и картинка не
    // расширяется ради одной подписи.
    const mirrored = self && from === participants.at(-1);
    const right =
      self && !mirrored
        ? lifelineX(from) + SEQUENCE_SELF_LOOP_WIDTH + 10 + layout.width
        : Math.max(lifelineX(from), lifelineX(to));
    placed.push({
      from,
      to,
      label: message.label,
      kind: message.kind,
      y,
      labelWidth,
      below,
      right,
      mirrored,
    });
  }
  return placed;
}

function sequenceMessage(message: PlacedSequenceMessage, index: number): readonly Element[] {
  const { from, to, label, kind, y, labelWidth } = message;
  const fromX = lifelineX(from);
  const toX = lifelineX(to);
  const direction = Math.sign(toX - fromX) || 1;
  const endX = toX - direction * SEQUENCE_ARROW_GAP;
  return [
    element('line', {
      x1: fromX,
      y1: y,
      // Линия кончается под основанием наконечника, чтобы не торчать из полого или открытого.
      x2: endX - direction * (ARROW_LENGTH - 2),
      y2: y,
      className: [
        'semantic-edge',
        'visualization-edge',
        'visualization-sequence-message',
        `visualization-edge-kind-${kind}`,
      ],
      dataEdge: String(index + 1),
      dataFrom: from.id,
      dataTo: to.id,
      dataMessageOrder: String(index + 1),
      dataEdgeKind: kind,
    }),
    edgeArrow(kind, endX, y, direction, 0),
    edgeLabel(label, (fromX + toX) / 2, y - 9, 'middle', labelWidth, 'up'),
  ];
}

/** Шаг внутри участника: петля от линии жизни и обратно, подпись справа от петли. */
function sequenceSelfMessage(message: PlacedSequenceMessage, index: number): readonly Element[] {
  const { from: participant, label, kind, y, labelWidth, mirrored } = message;
  const x = lifelineX(participant);
  const side = mirrored ? -1 : 1;
  const top = y - SEQUENCE_SELF_LOOP_HEIGHT / 2;
  const bottom = y + SEQUENCE_SELF_LOOP_HEIGHT / 2;
  const outer = x + side * SEQUENCE_SELF_LOOP_WIDTH;
  const tip = x + side * SEQUENCE_ARROW_GAP;
  return [
    element('path', {
      d: `M ${round(x)} ${round(top)} H ${round(outer)} V ${round(bottom)} H ${round(tip + side * (ARROW_LENGTH - 2))}`,
      fill: 'none',
      className: [
        'semantic-edge',
        'visualization-edge',
        'visualization-sequence-message',
        'visualization-sequence-self-message',
        `visualization-edge-kind-${kind}`,
      ],
      dataEdge: String(index + 1),
      dataFrom: participant.id,
      dataTo: participant.id,
      dataMessageOrder: String(index + 1),
      dataEdgeKind: kind,
    }),
    edgeArrow(kind, tip, bottom, -side, 0),
    edgeLabel(label, outer + side * 10, y + 4, mirrored ? 'end' : 'start', labelWidth, 'center'),
  ];
}

function enhanceTimeline(node: Element, _instance: number, strings: PackageStrings): void {
  const title = take(node, 'dataDirectiveTitle') ?? strings.timeline;
  const description = take(node, 'dataDescription') ?? title;
  const events = semanticChildren(node, 'event');
  // Легенда ленты: слова автора для выделения события. Цвет точки сам смысла не несёт, поэтому смысл
  // выделения ещё и произносится у самого события.
  const meanings = new Map<string, string>();
  for (const item of semanticChildren(node, 'legend-item')) {
    const kind = take(item, 'dataEvent');
    const label = take(item, 'dataLabel');
    if (kind !== undefined && label !== undefined) meanings.set(kind, label);
  }
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
        const meaning = meanings.get(kind);
        event.children = [
          element('time', { className: ['visualization-timeline-date'] }, [text(date)]),
          element('h4', { className: ['visualization-timeline-title'] }, [text(eventTitle)]),
          ...(meaning === undefined
            ? []
            : [element('p', { className: ['visually-hidden'] }, [text(meaning)])]),
          ...event.children,
        ];
        return event;
      }),
    ),
    ...(meanings.size === 0
      ? []
      : [
          element('div', { className: ['semantic-legend', 'visualization-timeline-legend'] }, [
            element(
              'ul',
              { className: ['visualization-legend'], ariaLabel: strings.legend },
              [...meanings].map(([kind, label]) =>
                element('li', { className: ['semantic-legend-item'], dataEventKind: kind }, [
                  element(
                    'span',
                    {
                      className: [
                        'visualization-timeline-legend-dot',
                        `visualization-event-${kind}`,
                      ],
                      ariaHidden: 'true',
                    },
                    [],
                  ),
                  text(label),
                ]),
              ),
            ),
          ]),
        ]),
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
