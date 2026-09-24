import { type EdgeLabel, type GraphLabel, graphlib, layout, type NodeLabel } from '@dagrejs/dagre';

import { layoutOrthogonal } from './flow-elk.js';

/** Узел до раскладки: размер посчитан по подписи, места ещё нет. */
export interface FlowLayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly group?: string;
  /** Слой, названный автором атрибутом `row`; нумерация с единицы. */
  readonly row?: number;
}

export interface FlowLayoutGroup {
  readonly id: string;
  readonly titleWidth: number;
  readonly titleHeight: number;
}

export interface FlowLayoutEdge {
  readonly from: string;
  readonly to: string;
  /** Насколько связь тянет свои концы друг к другу при выборе слоёв и порядка. */
  readonly weight: number;
  readonly label?: { readonly width: number; readonly height: number };
}

export interface FlowLayoutInput {
  readonly nodes: readonly FlowLayoutNode[];
  readonly groups: readonly FlowLayoutGroup[];
  readonly edges: readonly FlowLayoutEdge[];
  /** `auto` пробует оба направления и оставляет то, где схема крупнее и чище на странице. */
  readonly direction: 'right' | 'down' | 'auto';
  /** Ширина страницы, в которую схема встаёт без уменьшения. */
  readonly widthBudget: number;
  readonly nodeGap: number;
  readonly layerGap: number;
  readonly margin: number;
}

export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlacedFlowGroup {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Место заголовка: при `start` — начало строки у левого края, при `middle` — её центр. */
  readonly title: LayoutPoint;
  /**
   * Заголовок стоит у левого края рамки, как во всех видах, если там ничего нет; иначе — там, где
   * раскладка отвела ему место.
   */
  readonly titleAlign: 'start' | 'middle';
}

export interface PlacedFlowEdge {
  /** От источника к цели в том направлении, в каком связь объявил автор. */
  readonly points: readonly LayoutPoint[];
  readonly label?: LayoutPoint;
  /** Связь идёт против потока слоёв. */
  readonly backward: boolean;
}

export interface FlowLayout {
  /** Направление, которое раскладка выбрала или получила от автора. */
  readonly direction: 'right' | 'down';
  readonly width: number;
  readonly height: number;
  /** Левый верхний угол коробки узла. */
  readonly nodes: ReadonlyMap<string, LayoutPoint>;
  /** Слой узла вдоль потока, с нуля. */
  readonly layers: ReadonlyMap<string, number>;
  readonly groups: ReadonlyMap<string, PlacedFlowGroup>;
  readonly edges: readonly PlacedFlowEdge[];
}

interface OrientedEdge {
  readonly tail: string;
  readonly head: string;
  readonly weight: number;
  /** Связь идёт против потока и развёрнута, чтобы граф слоёв был без циклов. */
  readonly reversed: boolean;
}

type DagreGraph = graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>;

interface GraphEdge {
  readonly v: string;
  readonly w: string;
}

const NODE_KEY = 'n:';
const GROUP_KEY = 'g:';
const TITLE_KEY = 't:';
/** Отступ заголовка группы от левого края рамки; тот же, что у вида «прямые углы». */
const TITLE_INSET = 16;
/** Поле между рамкой группы и её узлами или заголовком. */
const GROUP_PADDING = 20;
/** Зазор между заголовком группы и её узлами, а также между заголовком и верхней кромкой рамки. */
const TITLE_GAP = 12;
/** Шаг, с которым заголовок ищет свободное место вдоль верхней кромки группы. */
const TITLE_STEP = 4;

/**
 * Обратная связь разворачивается обходом в глубину в порядке автора: первым встреченным узлам
 * достаются первые слои, и обратными оказываются связи, которые возвращаются к уже начатому пути.
 */
function orientEdges(
  nodes: readonly FlowLayoutNode[],
  edges: readonly FlowLayoutEdge[],
): readonly OrientedEdge[] {
  const outgoing = new Map<string, number[]>();
  const incoming = new Set<string>();
  for (const [index, edge] of edges.entries()) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), index]);
    incoming.add(edge.to);
  }
  const reversed = edges.map(() => false);
  const state = new Map<string, 'active' | 'done'>();
  const visit = (id: string): void => {
    state.set(id, 'active');
    for (const index of outgoing.get(id) ?? []) {
      const target = edges[index]?.to ?? '';
      const seen = state.get(target);
      if (seen === 'active') reversed[index] = true;
      else if (seen === undefined) visit(target);
    }
    state.set(id, 'done');
  };
  const roots = [
    ...nodes.filter((node) => !incoming.has(node.id)),
    ...nodes.filter((node) => incoming.has(node.id)),
  ];
  for (const node of roots) if (!state.has(node.id)) visit(node.id);
  return edges.map((edge, index) =>
    reversed[index] === true
      ? { tail: edge.to, head: edge.from, weight: edge.weight, reversed: true }
      : { tail: edge.from, head: edge.to, weight: edge.weight, reversed: false },
  );
}

/** Слой каждого узла по самому длинному входящему пути, не выше нижней границы узла. */
function longestPathLayers(
  nodes: readonly FlowLayoutNode[],
  edges: readonly OrientedEdge[],
  floor: ReadonlyMap<string, number>,
): Map<string, number> {
  const layers = new Map<string, number>();
  const pending = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) pending.set(edge.head, (pending.get(edge.head) ?? 0) + 1);
  const ready = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
  for (const node of nodes) layers.set(node.id, floor.get(node.id) ?? 0);
  while (ready.length > 0) {
    const id = ready.shift() ?? '';
    for (const edge of edges) {
      if (edge.tail !== id) continue;
      layers.set(edge.head, Math.max(layers.get(edge.head) ?? 0, (layers.get(id) ?? 0) + 1));
      const left = (pending.get(edge.head) ?? 0) - 1;
      pending.set(edge.head, left);
      if (left === 0) ready.push(edge.head);
    }
  }
  return layers;
}

/**
 * Слои: самый длинный путь, затем узлы с одинаковым `row` поднимаются до общего слоя, затем
 * свободные узлы сдвигаются туда, где их связи короче. Это локальная замена сетевого симплекса:
 * на двадцати узлах она даёт те же слои и при этом слушается закреплений автора.
 */
function assignLayers(
  nodes: readonly FlowLayoutNode[],
  edges: readonly OrientedEdge[],
): Map<string, number> {
  const floor = new Map<string, number>();
  for (const node of nodes) if (node.row !== undefined) floor.set(node.id, node.row - 1);
  const rows = new Map<number, string[]>();
  for (const node of nodes) {
    if (node.row !== undefined) rows.set(node.row, [...(rows.get(node.row) ?? []), node.id]);
  }
  let layers = longestPathLayers(nodes, edges, floor);
  // Путь между двумя узлами одного `row` не даёт поставить их рядом: подъём одного тянет другой, и
  // число попыток ограничено, чтобы такой случай не зациклился.
  for (let attempt = 0; attempt <= nodes.length; attempt += 1) {
    let raised = false;
    for (const members of rows.values()) {
      const target = Math.max(...members.map((id) => layers.get(id) ?? 0));
      for (const id of members) {
        if ((floor.get(id) ?? 0) < target) {
          floor.set(id, target);
          raised = true;
        }
      }
    }
    if (!raised) break;
    layers = longestPathLayers(nodes, edges, floor);
  }

  const pinned = new Set(nodes.filter((node) => node.row !== undefined).map((node) => node.id));
  for (let pass = 0; pass < nodes.length * 4; pass += 1) {
    let moved = false;
    for (const node of nodes) {
      if (pinned.has(node.id)) continue;
      let lowest = Number.NEGATIVE_INFINITY;
      let highest = Number.POSITIVE_INFINITY;
      let pullUp = 0;
      let pullDown = 0;
      for (const edge of edges) {
        if (edge.head === node.id) {
          lowest = Math.max(lowest, (layers.get(edge.tail) ?? 0) + 1);
          pullUp += edge.weight;
        }
        if (edge.tail === node.id) {
          highest = Math.min(highest, (layers.get(edge.head) ?? 0) - 1);
          pullDown += edge.weight;
        }
      }
      const current = layers.get(node.id) ?? 0;
      let target =
        pullUp > pullDown && Number.isFinite(lowest)
          ? lowest
          : pullDown > pullUp && Number.isFinite(highest)
            ? highest
            : current;
      // Узел группы держится слоёв своих соседей по группе, пока связи это позволяют: иначе один
      // узел, притянутый к далёкой цели, растягивает рамку группы на всю схему, и она пустеет.
      const mates = nodes
        .filter(
          (other) =>
            other.group !== undefined && other.group === node.group && other.id !== node.id,
        )
        .map((other) => layers.get(other.id) ?? 0);
      if (mates.length > 0) {
        const low = Math.max(lowest, Math.min(...mates));
        const high = Math.min(highest, Math.max(...mates));
        if (low <= high) target = Math.min(high, Math.max(low, target));
      }
      if (target !== current) {
        layers.set(node.id, target);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const first = Math.min(0, ...layers.values());
  for (const [id, layer] of layers) layers.set(id, layer - first);
  return layers;
}

/**
 * Ранги внутреннего графа dagre выводятся из наших слоёв. На слой приходится `2 × nodeRankFactor`
 * рангов: dagre удваивает длину связей под подписи и умножает её на число уровней вложенности групп.
 * Пограничные узлы групп и корень вложенности ставятся вплотную к тем, кого они обрамляют.
 */
function rankFromLayers(
  internal: DagreGraph,
  layers: ReadonlyMap<string, number>,
  titleRank: (group: string, stride: number) => number,
): void {
  const factor = Number(internal.graph().nodeRankFactor ?? 1);
  const stride = 2 * factor;
  const ranked = new Map<string, number>();
  for (const id of internal.nodes()) {
    if (id.startsWith(NODE_KEY))
      ranked.set(id, (layers.get(id.slice(NODE_KEY.length)) ?? 0) * stride);
    if (id.startsWith(TITLE_KEY)) ranked.set(id, titleRank(id.slice(TITLE_KEY.length), stride));
  }
  for (const id of internal.nodes()) {
    if (id.startsWith('_bt')) {
      const inside = (internal.outEdges(id) ?? []).map(
        (edge: GraphEdge) => ranked.get(edge.w) ?? 0,
      );
      ranked.set(id, Math.min(...inside) - 1);
    }
    if (id.startsWith('_bb')) {
      const inside = (internal.inEdges(id) ?? []).map((edge: GraphEdge) => ranked.get(edge.v) ?? 0);
      ranked.set(id, Math.max(...inside) + 1);
    }
  }
  const root = String(internal.graph().nestingRoot ?? '');
  if (root !== '') ranked.set(root, Math.min(...ranked.values()) - stride);
  for (const [id, rank] of ranked) {
    const label = internal.node(id);
    if (label !== undefined) label.rank = rank;
  }
  for (const edge of internal.edges()) {
    const minimum = internal.edge(edge)?.minlen ?? 1;
    if ((ranked.get(edge.w) ?? 0) - (ranked.get(edge.v) ?? 0) < minimum) {
      throw new Error(`Flow layer assignment breaks the connection ${edge.v} -> ${edge.w}.`);
    }
  }
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Пересекает ли отрезок прямоугольник, включая касание его границы. */
export function segmentHitsBox(start: LayoutPoint, end: LayoutPoint, box: Box): boolean {
  // Отсечение Лианга — Барски: есть ли у отрезка общая часть с прямоугольником.
  let enter = 0;
  let leave = 1;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  for (const [direction, distance] of [
    [-deltaX, start.x - box.left],
    [deltaX, box.right - start.x],
    [-deltaY, start.y - box.top],
    [deltaY, box.bottom - start.y],
  ] as const) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) enter = Math.max(enter, ratio);
    else leave = Math.min(leave, ratio);
    if (enter > leave) return false;
  }
  return true;
}

/**
 * Концы связей садятся на грань узла, обращённую туда, откуда связь приходит по потоку, и
 * расходятся по ней в порядке подхода. Последний отрезок входит в узел отвесно от края полосы
 * его слоя: dagre целит связь в центр узла, и косой отрезок издалека задевает соседа по слою, а
 * несколько стрелок сходятся в одну точку.
 */
function attachEndpoints(
  edges: LayoutPoint[][],
  ends: readonly { readonly from: string; readonly to: string }[],
  boxes: ReadonlyMap<string, Box>,
  layers: ReadonlyMap<string, number>,
  direction: 'right' | 'down',
): void {
  const down = direction === 'down';
  // Полоса слоя поперёк потока: от самого раннего края его узлов до самого позднего.
  const bands = new Map<number, { start: number; end: number }>();
  for (const [id, box] of boxes) {
    const layer = layers.get(id) ?? 0;
    const band = bands.get(layer);
    const start = down ? box.top : box.left;
    const end = down ? box.bottom : box.right;
    bands.set(layer, {
      start: Math.min(band?.start ?? start, start),
      end: Math.max(band?.end ?? end, end),
    });
  }
  interface End {
    readonly edge: number;
    readonly atStart: boolean;
    readonly toward: LayoutPoint;
  }
  const faces = new Map<string, End[]>();
  for (const [edge, points] of edges.entries()) {
    const record = ends[edge];
    const first = points[0];
    const last = points.at(-1);
    if (record === undefined || first === undefined || last === undefined || points.length < 2) {
      continue;
    }
    for (const end of [
      { node: record.from, edge, atStart: true, toward: points[1] ?? last },
      { node: record.to, edge, atStart: false, toward: points.at(-2) ?? first },
    ]) {
      const box = boxes.get(end.node);
      if (box === undefined) continue;
      const before = down ? end.toward.y < box.top : end.toward.x < box.left;
      const key = `${end.node}\u0000${before ? 'before' : 'after'}`;
      faces.set(key, [...(faces.get(key) ?? []), end]);
    }
  }
  for (const [key, group] of faces) {
    const [node, face] = key.split('\u0000') as [string, 'before' | 'after'];
    const box = boxes.get(node);
    const band = bands.get(layers.get(node) ?? 0);
    if (box === undefined || band === undefined) continue;
    const low = down ? box.left : box.top;
    const high = down ? box.right : box.bottom;
    const across = (point: LayoutPoint): number => (down ? point.x : point.y);
    group.sort((first, second) => across(first.toward) - across(second.toward));
    const step = group.length < 2 ? 0 : Math.min(20, ((high - low) * 0.7) / (group.length - 1));
    const middle = (low + high) / 2;
    const faceAt = face === 'before' ? (down ? box.top : box.left) : down ? box.bottom : box.right;
    const bandAt = face === 'before' ? band.start - 8 : band.end + 8;
    for (const [order, end] of group.entries()) {
      // Одна связь входит там, откуда пришла, если это в пределах грани: так цепочка остаётся прямой.
      const position =
        group.length === 1
          ? Math.min(high - 12, Math.max(low + 12, across(end.toward)))
          : middle + (order - (group.length - 1) / 2) * step;
      const point = (along: number): LayoutPoint =>
        down ? { x: position, y: along } : { x: along, y: position };
      const points = edges[end.edge];
      if (points === undefined) continue;
      const attached =
        Math.abs(bandAt - faceAt) < 1 ? [point(faceAt)] : [point(faceAt), point(bandAt)];
      if (end.atStart) points.splice(0, 1, ...attached);
      else points.splice(points.length - 1, 1, ...attached.reverse());
    }
  }
}

/**
 * Упрощение ломаной (Рамер — Дуглас — Пекер): мелкие сдвиги промежуточных точек dagre на гладкой
 * кривой становятся волнами. Точку подписи и концы убирать нельзя.
 */
export function simplify(
  points: readonly LayoutPoint[],
  keep: number,
  tolerance: number,
  obstacles: readonly Box[],
): LayoutPoint[] {
  const kept = new Set([0, points.length - 1, keep]);
  const visit = (from: number, to: number): void => {
    const start = points[from];
    const end = points[to];
    if (start === undefined || end === undefined || to - from < 2) return;
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    let farthest = -1;
    let distance = tolerance;
    for (let index = from + 1; index < to; index += 1) {
      const point = points[index];
      if (point === undefined) continue;
      const away =
        Math.abs(
          (end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y),
        ) / length;
      if (away > distance || kept.has(index)) {
        farthest = index;
        distance = kept.has(index) ? Number.POSITIVE_INFINITY : away;
      }
    }
    // Спрямлять можно, только если хорда не идёт сквозь чужой узел: dagre обводит узлы именно этими
    // точками.
    if (farthest === -1 && obstacles.some((box) => segmentHitsBox(start, end, box))) {
      let widest = 0;
      for (let index = from + 1; index < to; index += 1) {
        const point = points[index];
        if (point === undefined) continue;
        const away =
          Math.abs(
            (end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y),
          ) / length;
        if (farthest === -1 || away > widest) {
          farthest = index;
          widest = away;
        }
      }
    }
    if (farthest === -1) return;
    kept.add(farthest);
    visit(from, farthest);
    visit(farthest, to);
  };
  visit(0, points.length - 1);
  return points.filter((_, index) => kept.has(index));
}

function nearestIndex(points: readonly LayoutPoint[], target: LayoutPoint): number {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const [index, point] of points.entries()) {
    const away = Math.hypot(point.x - target.x, point.y - target.y);
    if (away < distance) {
      nearest = index;
      distance = away;
    }
  }
  return nearest;
}

function segmentsCross(
  first: LayoutPoint,
  second: LayoutPoint,
  third: LayoutPoint,
  fourth: LayoutPoint,
): boolean {
  const turn = (a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return (
    turn(first, second, third) * turn(first, second, fourth) < 0 &&
    turn(third, fourth, first) * turn(third, fourth, second) < 0
  );
}

/** Сколько раз ломаные разных связей пересекают друг друга. */
function countCrossings(edges: readonly (readonly LayoutPoint[])[]): number {
  let crossings = 0;
  for (const [index, points] of edges.entries()) {
    for (const other of edges.slice(index + 1)) {
      for (let segment = 0; segment < points.length - 1; segment += 1) {
        for (let otherSegment = 0; otherSegment < other.length - 1; otherSegment += 1) {
          const [a, b, c, d] = [
            points[segment],
            points[segment + 1],
            other[otherSegment],
            other[otherSegment + 1],
          ];
          if (a && b && c && d && segmentsCross(a, b, c, d)) crossings += 1;
        }
      }
    }
  }
  return crossings;
}

interface Candidate {
  readonly layout: FlowLayout;
  readonly crossings: number;
  /** Размер поперёк страницы: он решает, во сколько раз страница ужмёт схему. */
  readonly across: number;
  /** Связи по потоку, нарисованные против него. */
  readonly violations: number;
}

/** Одна пересечённая связь стоит столько пикселей ширины: примерно ширина подписи. */
const CROSSING_COST = 120;

function score(candidate: Candidate, widthBudget: number): number {
  const overflow = Math.max(0, candidate.layout.width - widthBudget);
  return (
    (candidate.crossings + candidate.violations) * CROSSING_COST + candidate.across + overflow * 2
  );
}

/**
 * Упорядочивание внутри слоёв у dagre — эвристика, и её результат зависит от порядка, в котором
 * узлы и связи пришли. Несколько перемешанных порядков с фиксированным зерном дают ей другие
 * стартовые точки; схема остаётся детерминированной.
 */
const SHUFFLED_ORDERS = 6;

/** Перемешивание Фишера — Йетса по переданному генератору: одно зерно — один порядок. */
function shuffle<TItem>(items: readonly TItem[], random: () => number): TItem[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as TItem, result[index] as TItem];
  }
  return result;
}

function shuffledOrders(
  nodes: readonly FlowLayoutNode[],
  edgeCount: number,
  count: number,
): { readonly nodes: readonly FlowLayoutNode[]; readonly edges: readonly number[] }[] {
  let seed = 1;
  const random = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  return Array.from({ length: count }, () => ({
    nodes: shuffle(nodes, random),
    edges: shuffle(
      Array.from({ length: edgeCount }, (_, index) => index),
      random,
    ),
  }));
}

/** Виды схемы: два по слоям (dagre) и «прямые углы» (ELK). */
export type FlowViewKind = 'down' | 'right' | 'orthogonal';

/** Все виды схемы и тот, что читается лучше всех: его `auto` показывает первым. */
export interface FlowViews {
  readonly down: FlowLayout;
  readonly right: FlowLayout;
  readonly orthogonal: FlowLayout;
  readonly preferred: FlowViewKind;
}

/**
 * Связи по потоку, которые вид рисует против потока: цель выше источника при потоке вниз или левее
 * при потоке вправо. Раскладка по слоям таких не рисует по построению; ELK на циклах рисует, и
 * тогда схема читается задом наперёд.
 */
function flowViolations(
  layout: FlowLayout,
  input: FlowLayoutInput,
  oriented: readonly OrientedEdge[],
): number {
  const centerOf = (id: string): LayoutPoint | undefined => {
    const corner = layout.nodes.get(id);
    const node = input.nodes.find((item) => item.id === id);
    return corner === undefined || node === undefined
      ? undefined
      : { x: corner.x + node.width / 2, y: corner.y + node.height / 2 };
  };
  return oriented.filter((edge) => {
    const tail = centerOf(edge.tail);
    const head = centerOf(edge.head);
    if (tail === undefined || head === undefined) return false;
    return layout.direction === 'down' ? head.y <= tail.y + 1 : head.x <= tail.x + 1;
  }).length;
}

/**
 * Раскладка по слоям в духе Sugiyama в обоих направлениях и вид «прямые углы». Слои выбирает пакет;
 * порядок внутри слоя, координаты, группы-кластеры и место подписи на середине связи — dagre, из
 * нескольких прогонов которого остаётся тот, где меньше пересечений и схема уже поперёк страницы.
 * Вид ELK получает те же слои для текста и тот же разворот обратных связей, а оценка у всех видов
 * общая: пересечения, размер поперёк страницы, выход за её ширину и связи, нарисованные против
 * потока.
 */
export async function layoutFlowViews(input: FlowLayoutInput): Promise<FlowViews> {
  const oriented = orientEdges(input.nodes, input.edges);
  const layers = assignLayers(input.nodes, oriented);
  const orders = [
    { nodes: input.nodes, edges: oriented.map((_, index) => index) },
    {
      nodes: [...input.nodes].reverse(),
      edges: oriented.map((_, index) => oriented.length - 1 - index),
    },
    ...shuffledOrders(input.nodes, oriented.length, SHUFFLED_ORDERS),
  ];
  const best = (direction: 'down' | 'right'): Candidate => {
    let chosen: Candidate | undefined;
    for (const [position, order] of orders.entries()) {
      // Выравнивания пробуются на двух порядках автора; перемешанные порядки ищут другое
      // упорядочивание слоёв и идут только со сбалансированным выравниванием: так прогонов вчетверо
      // меньше, а находки те же.
      const aligns = position < 2 ? ([undefined, 'UL', 'UR', 'DL', 'DR'] as const) : [undefined];
      for (const align of aligns) {
        const graph = runDagre(input, oriented, layers, direction, align, order);
        const candidate = readCandidate(input, oriented, layers, direction, graph);
        if (
          chosen === undefined ||
          score(candidate, input.widthBudget) < score(chosen, input.widthBudget)
        ) {
          chosen = candidate;
        }
      }
    }
    if (chosen === undefined) throw new Error('Flow layout produced no candidate.');
    return chosen;
  };
  const down = best('down');
  const right = best('right');
  const layered: 'down' | 'right' =
    input.direction === 'down' || input.direction === 'right'
      ? input.direction
      : score(right, input.widthBudget) < score(down, input.widthBudget)
        ? 'right'
        : 'down';
  const orthogonalLayout = await layoutOrthogonal(input, {
    backward: oriented.map((edge) => edge.reversed),
    layers,
    direction: layered,
  });
  const orthogonal: Candidate = {
    layout: orthogonalLayout,
    crossings: countCrossings(orthogonalLayout.edges.map((edge) => edge.points)),
    across: layered === 'right' ? orthogonalLayout.height : orthogonalLayout.width,
    violations: flowViolations(orthogonalLayout, input, oriented),
  };
  const ranked: readonly [FlowViewKind, Candidate][] = [
    ['down', down],
    ['right', right],
    ['orthogonal', orthogonal],
  ];
  const preferred = ranked
    .filter(
      ([kind]) => input.direction === 'auto' || kind !== (layered === 'down' ? 'right' : 'down'),
    )
    .reduce((winner, next) =>
      score(next[1], input.widthBudget) < score(winner[1], input.widthBudget) ? next : winner,
    )[0];
  return { down: down.layout, right: right.layout, orthogonal: orthogonal.layout, preferred };
}

/** Сколько параллельных связей dagre ещё раскладывает сам; начиная с этого числа они идут пучком. */
const BUNDLE_SIZE = 3;
/** Расстояние между соседними связями пучка. */
const BUNDLE_GAP = 14;
/** Зазор между подписями пучка, стоящими стопкой. */
const BUNDLE_LABEL_GAP = 4;

/** Место связи в пучке параллельных связей: dagre видит только ведущую, остальные идут рядом с ней. */
interface BundleSlot {
  /** Номер ведущей связи пучка; у одиночной связи — её собственный. */
  readonly lead: number;
  /** Сдвиг линии поперёк потока от линии ведущей. */
  readonly offset: number;
  /** Сдвиг подписи от точки, которую dagre отвёл подписи ведущей. */
  readonly label: LayoutPoint;
  /** Место под подписи всего пучка; задано только у ведущей. */
  readonly size?: { readonly width: number; readonly height: number };
}

/**
 * Собирает пучки из трёх и более связей с общими концами после разворота. dagre 3.1 теряет
 * координаты фиктивных узлов, когда три параллельные связи выходят из группы, поэтому такой пучок
 * раскладывается одной связью с местом под все подписи, а линии и подписи расходятся поперёк потока.
 */
function bundleSlots(
  oriented: readonly OrientedEdge[],
  edges: readonly FlowLayoutEdge[],
  direction: 'right' | 'down',
): BundleSlot[] {
  const members = new Map<string, number[]>();
  for (const [index, edge] of oriented.entries()) {
    const key = `${edge.tail}\u0000${edge.head}`;
    members.set(key, [...(members.get(key) ?? []), index]);
  }
  const slots: BundleSlot[] = oriented.map((_, index) => ({
    lead: index,
    offset: 0,
    label: { x: 0, y: 0 },
  }));
  for (const indices of members.values()) {
    const lead = indices[0];
    if (lead === undefined || indices.length < BUNDLE_SIZE) continue;
    const sizes = indices.map((index) => edges[index]?.label);
    const labelled = sizes.filter((size) => size !== undefined);
    const spread = (indices.length - 1) * BUNDLE_GAP;
    const stack =
      labelled.reduce((sum, size) => sum + (direction === 'down' ? size.height : size.width), 0) +
      Math.max(0, labelled.length - 1) * BUNDLE_LABEL_GAP;
    const across = Math.max(
      0,
      ...labelled.map((size) => (direction === 'down' ? size.width : size.height)),
    );
    let along = -stack / 2;
    for (const [slot, index] of indices.entries()) {
      const offset = (slot - (indices.length - 1) / 2) * BUNDLE_GAP;
      const size = sizes[slot];
      const extent = size === undefined ? 0 : direction === 'down' ? size.height : size.width;
      const middle = along + extent / 2;
      if (size !== undefined) along += extent + BUNDLE_LABEL_GAP;
      slots[index] = {
        lead,
        offset,
        label: direction === 'down' ? { x: offset, y: middle } : { x: middle, y: offset },
        ...(index === lead
          ? {
              size:
                direction === 'down'
                  ? { width: across + spread, height: stack }
                  : { width: stack, height: across + spread },
            }
          : {}),
      };
    }
  }
  return slots;
}

function runDagre(
  input: FlowLayoutInput,
  oriented: readonly OrientedEdge[],
  layers: ReadonlyMap<string, number>,
  direction: 'right' | 'down',
  align: GraphLabel['align'],
  order: { readonly nodes: readonly FlowLayoutNode[]; readonly edges: readonly number[] },
): DagreGraph {
  const rightward = direction === 'right';
  const firstLayer = new Map<string, number>();
  for (const node of input.nodes) {
    if (node.group === undefined) continue;
    const layer = layers.get(node.id) ?? 0;
    firstLayer.set(node.group, Math.min(firstLayer.get(node.group) ?? layer, layer));
  }
  // Вниз заголовок группы занимает полранга над первым слоем её узлов; вправо полранг — это
  // колонка сбоку, поэтому там заголовок встаёт первым в первом слое группы.
  const titleRank = (group: string, stride: number): number =>
    (firstLayer.get(group) ?? 0) * stride - (rightward ? 0 : stride / 2);
  const graph: DagreGraph = new graphlib.Graph({ multigraph: true, compound: true });
  graph.setGraph(
    Object.assign(
      {
        rankdir: rightward ? 'LR' : 'TB',
        nodesep: input.nodeGap,
        ranksep: input.layerGap,
        edgesep: 10,
        marginx: input.margin,
        marginy: input.margin,
        ...(align === undefined ? {} : { align }),
      } satisfies GraphLabel,
      { ranker: (internal: DagreGraph) => rankFromLayers(internal, layers, titleRank) },
    ),
  );
  graph.setDefaultEdgeLabel(() => ({}));
  for (const group of input.groups) {
    graph.setNode(`${GROUP_KEY}${group.id}`, { width: 0, height: 0 });
    graph.setNode(`${TITLE_KEY}${group.id}`, {
      width: group.titleWidth,
      height: group.titleHeight,
    });
    graph.setParent(`${TITLE_KEY}${group.id}`, `${GROUP_KEY}${group.id}`);
  }
  for (const node of order.nodes) {
    graph.setNode(`${NODE_KEY}${node.id}`, { width: node.width, height: node.height });
    if (node.group !== undefined) {
      graph.setParent(`${NODE_KEY}${node.id}`, `${GROUP_KEY}${node.group}`);
    }
  }
  const slots = bundleSlots(oriented, input.edges, direction);
  for (const index of order.edges) {
    const edge = oriented[index];
    const slot = slots[index];
    if (edge === undefined || slot === undefined || slot.lead !== index) continue;
    const label = slot.size ?? input.edges[index]?.label;
    graph.setEdge(
      `${NODE_KEY}${edge.tail}`,
      `${NODE_KEY}${edge.head}`,
      {
        minlen: 1,
        weight: slots.reduce(
          (sum, other, member) =>
            sum + (other.lead === index ? (oriented[member]?.weight ?? 0) : 0),
          0,
        ),
        width: label?.width ?? 0,
        height: label?.height ?? 0,
        labelpos: 'c',
      },
      String(index),
    );
  }
  // Порядок внутри слоя не навязывается ограничениями `constraints`: в dagre 3.1 они дают двум узлам
  // слоя один номер, и узел теряет координаты. Заголовок заводится раньше узлов и потому встаёт
  // первым в слое сам.
  layout(graph);
  return graph;
}

/**
 * Сдвигает схему к полю `margin` и обрезает пустое место по краям. У dagre оно остаётся там, где
 * стояли узлы заголовков и рамки групп до того, как рамки сжались до своих узлов.
 */
function trimLayout(layout: FlowLayout, input: FlowLayoutInput): FlowLayout {
  const boxes: Box[] = [
    ...input.nodes.flatMap((node) => {
      const corner = layout.nodes.get(node.id);
      return corner === undefined
        ? []
        : [
            {
              left: corner.x,
              top: corner.y,
              right: corner.x + node.width,
              bottom: corner.y + node.height,
            },
          ];
    }),
    ...[...layout.groups.values()].map((group) => ({
      left: group.x,
      top: group.y,
      right: group.x + group.width,
      bottom: group.y + group.height,
    })),
    ...layout.edges.flatMap((edge, index) => {
      const size = input.edges[index]?.label;
      return [
        ...edge.points.map((point) => ({
          left: point.x,
          top: point.y,
          right: point.x,
          bottom: point.y,
        })),
        ...(edge.label === undefined || size === undefined
          ? []
          : [
              {
                left: edge.label.x - size.width / 2,
                top: edge.label.y - size.height / 2,
                right: edge.label.x + size.width / 2,
                bottom: edge.label.y + size.height / 2,
              },
            ]),
      ];
    }),
  ];
  if (boxes.length === 0) return layout;
  const shiftX = Math.min(...boxes.map((box) => box.left)) - input.margin;
  const shiftY = Math.min(...boxes.map((box) => box.top)) - input.margin;
  const move = (point: LayoutPoint): LayoutPoint => ({ x: point.x - shiftX, y: point.y - shiftY });
  return {
    ...layout,
    width: Math.max(...boxes.map((box) => box.right)) - shiftX + input.margin,
    height: Math.max(...boxes.map((box) => box.bottom)) - shiftY + input.margin,
    nodes: new Map([...layout.nodes].map(([id, corner]) => [id, move(corner)])),
    groups: new Map(
      [...layout.groups].map(([id, group]) => [
        id,
        { ...group, x: group.x - shiftX, y: group.y - shiftY, title: move(group.title) },
      ]),
    ),
    edges: layout.edges.map((edge) => ({
      ...edge,
      points: edge.points.map(move),
      ...(edge.label === undefined ? {} : { label: move(edge.label) }),
    })),
  };
}

function readCandidate(
  input: FlowLayoutInput,
  oriented: readonly OrientedEdge[],
  layers: ReadonlyMap<string, number>,
  direction: 'right' | 'down',
  graph: DagreGraph,
): Candidate {
  const center = (key: string): LayoutPoint => {
    const label = graph.node(key);
    return { x: label?.x ?? 0, y: label?.y ?? 0 };
  };
  const nodes = new Map(
    input.nodes.map((node) => {
      const point = center(`${NODE_KEY}${node.id}`);
      return [node.id, { x: point.x - node.width / 2, y: point.y - node.height / 2 }] as const;
    }),
  );
  const boxes = new Map(
    input.nodes.map((node) => {
      const corner = nodes.get(node.id) ?? { x: 0, y: 0 };
      return [
        node.id,
        {
          left: corner.x,
          top: corner.y,
          right: corner.x + node.width,
          bottom: corner.y + node.height,
        },
      ] as const;
    }),
  );
  // Рамку группы dagre растягивает на обходящие её связи и на место, где встал узел заголовка: остаётся
  // пустое поле. Рамка сжимается до узлов группы с полем GROUP_PADDING и никогда не растёт; заголовок
  // ставится в неё позже, когда известны связи и подписи.
  const frames = new Map(
    input.groups.map((group) => {
      const box = graph.node(`${GROUP_KEY}${group.id}`);
      const width = box?.width ?? 0;
      const height = box?.height ?? 0;
      const outer: Box = {
        left: (box?.x ?? 0) - width / 2,
        top: (box?.y ?? 0) - height / 2,
        right: (box?.x ?? 0) + width / 2,
        bottom: (box?.y ?? 0) + height / 2,
      };
      const title = center(`${TITLE_KEY}${group.id}`);
      const titleBox: Box = {
        left: title.x - group.titleWidth / 2,
        top: title.y - group.titleHeight / 2,
        right: title.x + group.titleWidth / 2,
        bottom: title.y + group.titleHeight / 2,
      };
      const members = input.nodes.flatMap((node) => {
        const member = node.group === group.id ? boxes.get(node.id) : undefined;
        return member === undefined ? [] : [member];
      });
      const content: Box = {
        left: Math.min(...members.map((item) => item.left)),
        top: Math.min(...members.map((item) => item.top)),
        right: Math.max(...members.map((item) => item.right)),
        bottom: Math.max(...members.map((item) => item.bottom)),
      };
      return [group.id, { outer, title, titleBox, content }] as const;
    }),
  );
  const slots = bundleSlots(oriented, input.edges, direction);
  const placedEdge = (index: number): EdgeLabel | undefined => {
    const edge = oriented[index];
    return edge === undefined
      ? undefined
      : graph.edge(`${NODE_KEY}${edge.tail}`, `${NODE_KEY}${edge.head}`, String(index));
  };
  const labels = oriented.map((_, index): LayoutPoint | undefined => {
    const slot = slots[index] ?? { lead: index, offset: 0, label: { x: 0, y: 0 } };
    const placed = placedEdge(slot.lead);
    return input.edges[index]?.label === undefined ||
      placed?.x === undefined ||
      placed.y === undefined
      ? undefined
      : { x: Number(placed.x) + slot.label.x, y: Number(placed.y) + slot.label.y };
  });
  const raw: LayoutPoint[][] = oriented.map((edge, index) => {
    const slot = slots[index] ?? { lead: index, offset: 0, label: { x: 0, y: 0 } };
    const shift = direction === 'down' ? { x: slot.offset, y: 0 } : { x: 0, y: slot.offset };
    const points = (placedEdge(slot.lead)?.points ?? []).map((point: LayoutPoint) => ({
      x: point.x + shift.x,
      y: point.y + shift.y,
    }));
    return edge.reversed ? points.reverse() : points;
  });
  attachEndpoints(raw, input.edges, boxes, layers, direction);
  const polylines = raw.map((points, index) => {
    const label = labels[index];
    const keep = label === undefined ? 0 : nearestIndex(points, label);
    const own = input.edges[index];
    const obstacles = input.nodes.flatMap((node) => {
      const box = boxes.get(node.id);
      return box === undefined || node.id === own?.from || node.id === own?.to
        ? []
        : [{ left: box.left - 4, top: box.top - 4, right: box.right + 4, bottom: box.bottom + 4 }];
    });
    // Место заголовка dagre обходит как узел; спрямление обязано его тоже обходить, иначе у
    // заголовка, которому не нашлось другой полосы, не остаётся свободного места.
    const titles = [...frames.values()].map(({ titleBox }) => ({
      left: titleBox.left - 4,
      top: titleBox.top - 4,
      right: titleBox.right + 4,
      bottom: titleBox.bottom + 4,
    }));
    return simplify(points, keep, 10, [...obstacles, ...titles]);
  });
  const width = graph.graph().width ?? 0;
  const height = graph.graph().height ?? 0;
  const labelBoxes = labels.flatMap((label, index): Box[] => {
    const size = input.edges[index]?.label;
    return label === undefined || size === undefined
      ? []
      : [
          {
            left: label.x - size.width / 2,
            right: label.x + size.width / 2,
            top: label.y - size.height / 2,
            bottom: label.y + size.height / 2,
          },
        ];
  });
  const overlaps = (box: Box, band: Box): boolean =>
    box.left < band.right &&
    band.left < box.right &&
    box.top < band.bottom &&
    band.top < box.bottom;
  const blocked = (band: Box): boolean =>
    labelBoxes.some((box) => overlaps(box, band)) ||
    [...boxes.values()].some((box) => overlaps(box, band)) ||
    polylines.some((points) =>
      points.some((point, index) => {
        const next = points[index + 1];
        return next !== undefined && segmentHitsBox(point, next, band);
      }),
    );
  const aligned = new Map(
    input.groups.map((group) => {
      const frame = frames.get(group.id);
      if (frame === undefined) throw new Error(`Flow group ${group.id} has no frame.`);
      const { outer, title, titleBox, content } = frame;
      const clamp = (box: Box): Box => ({
        left: Math.max(outer.left, box.left),
        top: Math.max(outer.top, box.top),
        right: Math.min(outer.right, box.right),
        bottom: Math.min(outer.bottom, box.bottom),
      });
      const place = (box: Box, point: LayoutPoint, align: 'start' | 'middle'): PlacedFlowGroup => ({
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
        title: point,
        titleAlign: align,
      });
      // Рамка по ширине — узлы группы, но не уже заголовка. Заголовок ищет над узлами полосу,
      // свободную от связей, подписей и узлов: сначала вплотную к ним, потом выше, в последнюю
      // очередь — место узла заголовка, которое dagre оставил свободным. Из свободных мест берётся
      // то, что меньше всего раздвигает рамку, при равенстве — первое по высоте и самое левое.
      const needed = group.titleWidth + 2 * TITLE_INSET;
      const middle = (content.left + content.right) / 2;
      const across = clamp({
        left: Math.min(content.left - GROUP_PADDING, middle - needed / 2),
        top: outer.top,
        right: Math.max(content.right + GROUP_PADDING, middle + needed / 2),
        bottom: content.bottom + GROUP_PADDING,
      });
      const close = content.top - TITLE_GAP - group.titleHeight / 2;
      // Вниз заголовок стоит на полранга выше узлов, и полоса между ним и узлами — единственная
      // выше узлов. Вправо над узлами только поле рамки: полоса поднимается по нему шагами.
      const heights =
        direction === 'down'
          ? [close, title.y]
          : [
              ...Array.from(
                {
                  length:
                    Math.max(
                      0,
                      Math.floor((close - outer.top - group.titleHeight / 2) / TITLE_STEP),
                    ) + 1,
                },
                (_, step) => close - step * TITLE_STEP,
              ),
              title.y,
            ];
      let chosen: { x: number; y: number; growth: number } | undefined;
      for (const y of heights) {
        const starts: number[] = [];
        for (
          let x = outer.left + TITLE_INSET;
          x + group.titleWidth <= outer.right - TITLE_INSET + 0.5;
          x += TITLE_STEP
        ) {
          starts.push(x);
        }
        if (y === title.y) starts.push(titleBox.left);
        for (const x of starts) {
          const growth =
            Math.max(0, across.left - (x - TITLE_INSET)) +
            Math.max(0, x + group.titleWidth + TITLE_INSET - across.right);
          if (chosen !== undefined && growth >= chosen.growth) continue;
          const band: Box = {
            left: x - 4,
            right: x + group.titleWidth + 4,
            top: y - group.titleHeight / 2,
            bottom: y + group.titleHeight / 2,
          };
          if (!blocked(band)) chosen = { x, y, growth };
        }
      }
      const spot = chosen ?? { x: titleBox.left, y: title.y };
      const box = clamp({
        left: Math.min(across.left, spot.x - TITLE_INSET),
        top: Math.min(content.top - GROUP_PADDING, spot.y - group.titleHeight / 2 - TITLE_GAP),
        right: Math.max(across.right, spot.x + group.titleWidth + TITLE_INSET),
        bottom: Math.max(across.bottom, spot.y + group.titleHeight / 2 + TITLE_GAP),
      });
      return [group.id, place(box, { x: spot.x, y: spot.y }, 'start')] as const;
    }),
  );
  const layout = trimLayout(
    {
      direction,
      width,
      height,
      nodes,
      layers,
      groups: aligned,
      edges: polylines.map((points, index) => {
        const label = labels[index];
        return {
          points,
          backward: oriented[index]?.reversed ?? false,
          ...(label === undefined ? {} : { label }),
        };
      }),
    },
    input,
  );
  return {
    layout,
    crossings: countCrossings(polylines),
    across: direction === 'right' ? layout.height : layout.width,
    violations: 0,
  };
}
