import type { Element, ElementContent } from 'hast';

import type { DiagramEdgeKindChoice } from '../authoring/registry.js';
import type { LayoutPoint } from './flow-layout.js';

export const NODE_FONT_SIZE = 14;

export const GROUP_FONT_SIZE = 16;

export const EDGE_FONT_SIZE = 13;

export const EDGE_LINE_HEIGHT = 15;

/** Уже этого подпись распадается на столбик из слов, который читается хуже, чем чуть более широкая. */
export const EDGE_LABEL_MIN_WIDTH = 110;

/** Над линией подпись поднимается на столько: отступ базовой линии плюс высота строки. */
export const EDGE_LABEL_RISE = 22;

export const NODE_LINE_HEIGHT = 19;

export const NODE_PADDING_X = 16;

export const NODE_PADDING_Y = 13;

export const NODE_MIN_WIDTH = 132;

export const NODE_MAX_WIDTH = 252;

export const NODE_MIN_HEIGHT = 56;

export const NODE_MAX_LINES = 4;

export const NODE_DEFAULT_WIDTH = 140;

export const NODE_DEFAULT_HEIGHT = 72;

export const NODE_DETAIL_FONT_SIZE = 12.5;

export const NODE_DETAIL_LINE_HEIGHT = 16;

export const NODE_DETAIL_MAX_LINES = 4;

export const NODE_DETAIL_GAP = 4;

/** Пояснение уже заголовка: длинное пояснение растит узел вниз, а не вширь. */
export const NODE_DETAIL_MAX_WIDTH = 150;

export const GROUP_TITLE_LINE_HEIGHT = 20;

export const ARROW_LENGTH = 11;

export const DIAGRAM_MARGIN = 22;

export const NARROW_GLYPHS = new Set(['i', 'l', 'j', 't', 'f', 'r', '.', ',', ';', ':', '!', '|']);

export const WIDE_GLYPHS = new Set(['m', 'w', 'M', 'W']);

export interface DiagramNode {
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
  /** Пояснение под заголовком узла и его готовые строки. */
  readonly detail?: string;
  readonly detailLines?: readonly string[];
  /** Слой флоу вдоль потока; у участника последовательности его нет. */
  readonly layer?: number;
}

export interface DiagramGroup {
  readonly id: string;
  readonly label: string;
  readonly lines: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Место заголовка: при `start` — начало строки у левого края, при `middle` — её центр. */
  readonly title: LayoutPoint;
  readonly titleAlign: 'start' | 'middle';
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind: DiagramEdgeKindChoice;
}

/** Заголовок стоит там, где раскладка отвела ему место, поэтому связи и узлы его не накрывают. */
export function diagramGroup(group: DiagramGroup): Element {
  const firstBaseline =
    group.title.y - ((group.lines.length - 1) * GROUP_TITLE_LINE_HEIGHT) / 2 + 5;
  return element('g', { dataGroupId: group.id, className: ['semantic-group'] }, [
    element('rect', {
      x: round(group.x),
      y: round(group.y),
      width: round(group.width),
      height: round(group.height),
      rx: 16,
      className: ['visualization-group'],
    }),
    ...group.lines.map((line, index) =>
      element(
        'text',
        {
          x: round(group.title.x),
          y: round(firstBaseline + index * GROUP_TITLE_LINE_HEIGHT),
          textAnchor: group.titleAlign,
          className: ['visualization-group-label'],
        },
        [text(line)],
      ),
    ),
  ]);
}

export function diagramNode(node: DiagramNode): Element {
  const width = node.width ?? NODE_DEFAULT_WIDTH;
  const height = node.height ?? NODE_DEFAULT_HEIGHT;
  const measured = layoutNodeBox(node.label, node.detail);
  const lines = node.lines ?? measured.lines;
  const detailLines = node.detailLines ?? measured.detailLines;
  const detailBlock =
    detailLines.length === 0 ? 0 : NODE_DETAIL_GAP + detailLines.length * NODE_DETAIL_LINE_HEIGHT;
  // Заголовок и пояснение стоят одним блоком посередине коробки.
  const top = node.y + (height - lines.length * NODE_LINE_HEIGHT - detailBlock) / 2;
  const detailTop = top + lines.length * NODE_LINE_HEIGHT + NODE_DETAIL_GAP;
  return element(
    'g',
    {
      dataNodeId: node.id,
      dataGroup: node.group,
      dataLayer: node.layer === undefined ? undefined : String(node.layer),
      className: ['semantic-node'],
    },
    [
      element('rect', {
        x: round(node.x),
        y: round(node.y),
        width,
        height,
        rx: 12,
        className: ['visualization-node', `visualization-node-${node.kind}`],
      }),
      ...lines.map((line, index) =>
        element(
          'text',
          {
            x: round(node.x + width / 2),
            y: round(top + index * NODE_LINE_HEIGHT + 15),
            textAnchor: 'middle',
            className: ['visualization-node-label'],
          },
          [text(line)],
        ),
      ),
      ...detailLines.map((line, index) =>
        element(
          'text',
          {
            x: round(node.x + width / 2),
            y: round(detailTop + index * NODE_DETAIL_LINE_HEIGHT + 12.5),
            textAnchor: 'middle',
            className: ['visualization-node-detail'],
          },
          [text(line)],
        ),
      ),
    ],
  );
}

/** Ширина строки в единицах вида, считанная по начертаниям: коробка узла растёт от подписи. */
export function glyphWidth(character: string): number {
  if (character === ' ') return 0.29;
  if (NARROW_GLYPHS.has(character)) return 0.34;
  if (WIDE_GLYPHS.has(character)) return 0.92;
  if (character >= '0' && character <= '9') return 0.58;
  if (character !== character.toLowerCase() && character === character.toUpperCase()) return 0.7;
  return 0.56;
}

export function measureText(value: string, fontSize: number, weight: number): number {
  let units = 0;
  for (const character of value) units += glyphWidth(character);
  return units * fontSize * (weight >= 700 ? 1.05 : 1);
}

export function truncateMeasured(
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

export function wrapMeasured(
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

export function layoutNodeBox(
  label: string,
  detail?: string,
  maximumWidth = NODE_MAX_WIDTH,
): {
  readonly lines: readonly string[];
  readonly detailLines: readonly string[];
  readonly width: number;
  readonly height: number;
} {
  // Узкая коробка переносит имя по словам, но слово не режет: самое длинное слово раздвигает её
  // до NODE_MAX_WIDTH, иначе `ShowSession` превращается в `ShowSessi…`.
  const widestWord = Math.max(
    0,
    ...label.split(/\s+/u).map((word) => measureText(word, NODE_FONT_SIZE, 720)),
  );
  const inner = Math.min(
    NODE_MAX_WIDTH - NODE_PADDING_X * 2,
    Math.max(maximumWidth - NODE_PADDING_X * 2, Math.ceil(widestWord)),
  );
  const wrapped = wrapMeasured(label, inner, NODE_MAX_LINES, NODE_FONT_SIZE, 720);
  const explained =
    detail === undefined
      ? { lines: [], width: 0 }
      : wrapMeasured(
          detail,
          Math.min(NODE_DETAIL_MAX_WIDTH, inner),
          NODE_DETAIL_MAX_LINES,
          NODE_DETAIL_FONT_SIZE,
          500,
        );
  const detailBlock =
    explained.lines.length === 0
      ? 0
      : NODE_DETAIL_GAP + explained.lines.length * NODE_DETAIL_LINE_HEIGHT;
  return {
    lines: wrapped.lines,
    detailLines: explained.lines,
    width: Math.min(
      maximumWidth,
      Math.max(
        NODE_MIN_WIDTH,
        Math.ceil(Math.max(wrapped.width, explained.width)) + NODE_PADDING_X * 2,
      ),
    ),
    height: Math.max(
      NODE_MIN_HEIGHT,
      wrapped.lines.length * NODE_LINE_HEIGHT + detailBlock + NODE_PADDING_Y * 2,
    ),
  };
}

export interface EdgeLabelLayout {
  readonly lines: readonly string[];
  /** Ширина плашки вместе с полями. */
  readonly width: number;
  readonly height: number;
}

/**
 * Подпись связи переносится по словам без потолка строк и никогда не режется: слово шире зазора
 * расширяет строку, но не теряет букв. Раскладка резервирует место по этой же функции, поэтому
 * высота, под которую раздвинуты ряды, совпадает с нарисованной.
 */
export function layoutEdgeLabel(
  value: string,
  maximumWidth: number,
  weight = 400,
): EdgeLabelLayout {
  const widestWord = Math.max(
    0,
    ...value.split(/\s+/u).map((word) => measureText(word, EDGE_FONT_SIZE, weight)),
  );
  const wrapped = wrapMeasured(
    value,
    Math.max(maximumWidth, EDGE_LABEL_MIN_WIDTH, Math.ceil(widestWord)),
    Number.POSITIVE_INFINITY,
    EDGE_FONT_SIZE,
    weight,
  );
  return {
    lines: wrapped.lines,
    width: wrapped.width + 8,
    height: 17 + (wrapped.lines.length - 1) * EDGE_LINE_HEIGHT,
  };
}

/**
 * `up` держит на месте базовую линию последней строки, и лишние строки растут вверх, прочь от
 * линии связи; `center` держит середину плашки, когда подпись стоит сбоку от линии.
 */
export function edgeLabel(
  value: string,
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end',
  maximumWidth: number,
  growth: 'up' | 'center' = 'up',
  emphasis = false,
): Element {
  const layout = layoutEdgeLabel(value, maximumWidth, emphasis ? 700 : 400);
  const left =
    anchor === 'start' ? x - 4 : anchor === 'end' ? x - layout.width + 4 : x - layout.width / 2;
  const plateTop =
    growth === 'up'
      ? y - 13 - (layout.lines.length - 1) * EDGE_LINE_HEIGHT
      : y - 4 - layout.height / 2;
  const firstBaseline = plateTop + 13;
  return element('g', { className: ['visualization-edge-label'] }, [
    element('rect', {
      x: round(left),
      y: round(plateTop),
      width: round(layout.width),
      height: layout.height,
      rx: 4,
      className: ['visualization-edge-label-plate'],
    }),
    element(
      'text',
      {
        x: round(x),
        y: round(firstBaseline),
        textAnchor: anchor,
        className: [
          'visualization-edge-label-text',
          ...(emphasis ? ['visualization-sequence-label'] : []),
        ],
      },
      layout.lines.map((line, lineIndex) =>
        element('tspan', { x: round(x), y: round(firstBaseline + lineIndex * EDGE_LINE_HEIGHT) }, [
          text(line),
        ]),
      ),
    ),
  ]);
}

export function arrowHead(x: number, y: number, unitX: number, unitY: number): Element {
  const baseX = x - unitX * 11;
  const baseY = y - unitY * 11;
  const perpendicularX = -unitY * 5;
  const perpendicularY = unitX * 5;
  return element('polygon', {
    points: `${round(x)},${round(y)} ${round(baseX + perpendicularX)},${round(baseY + perpendicularY)} ${round(baseX - perpendicularX)},${round(baseY - perpendicularY)}`,
    className: ['visualization-edge-arrow'],
  });
}

/**
 * Наконечник по виду связи: вызов и данные — закрашенный треугольник, событие — открытая галка,
 * зависимость — полый треугольник. Вместе с начертанием линии вид читается и без цвета.
 */
export function edgeArrow(
  kind: DiagramEdgeKindChoice,
  x: number,
  y: number,
  unitX: number,
  unitY: number,
): Element {
  if (kind === 'call' || kind === 'data') return arrowHead(x, y, unitX, unitY);
  const baseX = x - unitX * ARROW_LENGTH;
  const baseY = y - unitY * ARROW_LENGTH;
  const sideX = -unitY * 5;
  const sideY = unitX * 5;
  const points = `${round(baseX + sideX)},${round(baseY + sideY)} ${round(x)},${round(y)} ${round(baseX - sideX)},${round(baseY - sideY)}`;
  return kind === 'event'
    ? element('polyline', {
        points,
        className: ['visualization-edge-arrow', 'visualization-edge-arrow-open'],
      })
    : element('polygon', {
        points,
        className: ['visualization-edge-arrow', 'visualization-edge-arrow-hollow'],
      });
}

export function element(
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

export function text(value: string): ElementContent {
  return { type: 'text', value };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}
