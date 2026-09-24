import ElkModule from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';

import {
  type Box,
  type FlowLayout,
  type FlowLayoutInput,
  type LayoutPoint,
  type PlacedFlowEdge,
  type PlacedFlowGroup,
  segmentHitsBox,
} from './flow-layout.js';

/** Что раскладка по слоям уже решила и что ELK получает готовым. */
export interface OrthogonalContext {
  /** Связь идёт против потока: так её описывает текст схемы, в какой бы раскладке она ни была. */
  readonly backward: readonly boolean[];
  /** Слои потока из раскладки по слоям: одни и те же для текста и для всех видов. */
  readonly layers: ReadonlyMap<string, number>;
  readonly direction: 'right' | 'down';
}

const NODE_KEY = 'n:';
const GROUP_KEY = 'g:';
const TITLE_KEY = 't:';
/** Отступ заголовка группы от её рамки. */
const TITLE_INSET = 16;
/** Шаг, с которым заголовок ищет свободное от связей место вдоль верхней кромки группы. */
const TITLE_STEP = 4;
/** Поле над узлом заголовка внутри группы. */
const TITLE_TOP = 10;

// Пакет CommonJS: класс лежит и в самом экспорте, и в его поле `default`; типы видят только поле.
const engine = new ElkModule.default();

/**
 * Раскладка «прямые углы»: слоистый алгоритм ELK с ортогональной трассировкой. Группы — вложенные
 * узлы с полем под заголовок, связи ведутся по своим дорожкам и расходятся по граням узлов, подпись
 * встаёт на свою связь. Цикл разрывается в порядке автора, как в раскладке по слоям.
 */
export async function layoutOrthogonal(
  input: FlowLayoutInput,
  context: OrthogonalContext,
): Promise<FlowLayout> {
  const nodeOf = (node: FlowLayoutInput['nodes'][number]): ElkNode => ({
    id: `${NODE_KEY}${node.id}`,
    width: node.width,
    height: node.height,
  });
  const groupOf = new Map(input.nodes.map((node) => [node.id, node.group]));
  // Отдельный узел заголовка нужен только группе, в которую связи входят снаружи через верхнюю кромку.
  const titled = new Set(
    context.direction === 'down'
      ? input.edges.flatMap((edge) => {
          const target = groupOf.get(edge.to);
          return target !== undefined && groupOf.get(edge.from) !== target ? [target] : [];
        })
      : [],
  );
  const children: ElkNode[] = [
    ...input.groups.map((group) => ({
      id: `${GROUP_KEY}${group.id}`,
      layoutOptions: {
        // Рамка не уже заголовка, даже если узел в группе один.
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${Math.ceil(group.titleWidth + 2 * TITLE_INSET)},0)`,
        'elk.padding': titled.has(group.id)
          ? `[top=${TITLE_TOP},left=${TITLE_INSET},bottom=${TITLE_INSET},right=${TITLE_INSET}]`
          : `[top=${Math.round(group.titleHeight + 18)},left=${TITLE_INSET},bottom=${TITLE_INSET},right=${TITLE_INSET}]`,
      },
      children: [
        // Сверху вниз связи входят в группу через верхнюю кромку. Заголовок — отдельный узел слоем
        // выше всех узлов группы: ELK обводит настоящие связи вокруг него, как вокруг любого узла.
        ...(titled.has(group.id)
          ? [
              {
                id: `${TITLE_KEY}${group.id}`,
                width: group.titleWidth,
                height: group.titleHeight,
              },
            ]
          : []),
        ...input.nodes.filter((node) => node.group === group.id).map(nodeOf),
      ],
    })),
    ...input.nodes.filter((node) => node.group === undefined).map(nodeOf),
  ];
  const edges: ElkExtendedEdge[] = input.edges.map((edge, index) => ({
    id: `e${index}`,
    sources: [`${NODE_KEY}${edge.from}`],
    targets: [`${NODE_KEY}${edge.to}`],
    labels:
      edge.label === undefined
        ? []
        : // Без текста ELK не расставляет подпись и оставляет её в начале координат; размер
          // задаём сами, текст служит только признаком подписи.
          // Признак «подпись на самой связи» ELK читает у подписи, а не у графа.
          [
            {
              id: `l${index}`,
              text: 'label',
              width: edge.label.width,
              height: edge.label.height,
              layoutOptions: { 'elk.edgeLabels.inline': 'true' },
            },
          ],
  }));
  // Слой под заголовок держат служебные связи от него ко всем узлам группы: слои у ELK общие для
  // всего графа, поэтому ограничение слоя (`FIRST`, `FIRST_SEPARATE`) подняло бы заголовок к верху
  // всей схемы, а `FIRST_SEPARATE` ELK 0.12 к тому же роняет вместе с порядком автора. В раскладку
  // служебные связи не попадают.
  const titleEdges: ElkExtendedEdge[] = [...titled].flatMap((group) =>
    input.nodes
      .filter((node) => node.group === group)
      .map((node) => ({
        id: `${TITLE_KEY}${group}>${node.id}`,
        sources: [`${TITLE_KEY}${group}`],
        targets: [`${NODE_KEY}${node.id}`],
      })),
  );
  const spacing = (value: number): string => String(Math.round(value));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': context.direction === 'down' ? 'DOWN' : 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': spacing(input.layerGap * 0.6),
      'elk.spacing.nodeNode': spacing(input.nodeGap + 4),
      'elk.spacing.edgeNode': '18',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.edgeNodeBetweenLayers': '18',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.spacing.edgeLabel': '4',
      'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'MEDIAN_LAYER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '30',
      'elk.padding': `[top=${input.margin},left=${input.margin},bottom=${input.margin},right=${input.margin}]`,
    },
    children,
    edges: [...edges, ...titleEdges],
  };
  const placed: ElkNode = await engine.layout(graph);

  // ELK отдаёт координаты вложенных узлов от их родителя, а связи — от контейнера связи.
  const origins = new Map<string, LayoutPoint>([['root', { x: 0, y: 0 }]]);
  const nodes = new Map<string, LayoutPoint>();
  const groups = new Map<string, PlacedFlowGroup>();
  const titles = new Map<string, LayoutPoint>();
  const walk = (parent: ElkNode, origin: LayoutPoint): void => {
    for (const child of parent.children ?? []) {
      const corner = { x: origin.x + (child.x ?? 0), y: origin.y + (child.y ?? 0) };
      origins.set(child.id, corner);
      if (child.id.startsWith(GROUP_KEY)) {
        const id = child.id.slice(GROUP_KEY.length);
        const titleHeight = input.groups.find((group) => group.id === id)?.titleHeight ?? 0;
        groups.set(id, {
          x: corner.x,
          y: corner.y,
          width: child.width ?? 0,
          height: child.height ?? 0,
          title: { x: corner.x + TITLE_INSET, y: corner.y + 10 + titleHeight / 2 },
          titleAlign: 'start',
        });
        walk(child, corner);
      } else if (child.id.startsWith(TITLE_KEY)) {
        titles.set(child.id.slice(TITLE_KEY.length), {
          x: corner.x,
          y: corner.y + (child.height ?? 0) / 2,
        });
      } else {
        nodes.set(child.id.slice(NODE_KEY.length), corner);
      }
    }
  };
  walk(placed, { x: 0, y: 0 });

  const placedEdges = (placed.edges ?? []) as ElkExtendedEdge[];
  const routes = input.edges.map((_, index): PlacedFlowEdge => {
    const edge = placedEdges.find((candidate) => candidate.id === `e${index}`);
    const origin = origins.get(edge?.container ?? 'root') ?? { x: 0, y: 0 };
    const section = edge?.sections?.[0];
    const points =
      section === undefined
        ? []
        : [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
            x: point.x + origin.x,
            y: point.y + origin.y,
          }));
    const label = edge?.labels?.[0];
    return {
      points,
      backward: context.backward[index] ?? false,
      ...(label === undefined
        ? {}
        : {
            label: {
              x: origin.x + (label.x ?? 0) + (label.width ?? 0) / 2,
              y: origin.y + (label.y ?? 0) + (label.height ?? 0) / 2,
            },
          }),
    };
  });
  // Заголовок встаёт в самое левое место полосы, которое не пересекает ни одна связь и ни одна подпись.
  const labelBoxes = routes.flatMap((route, index): Box[] => {
    const size = input.edges[index]?.label;
    return route.label === undefined || size === undefined
      ? []
      : [
          {
            left: route.label.x - size.width / 2,
            right: route.label.x + size.width / 2,
            top: route.label.y - size.height / 2,
            bottom: route.label.y + size.height / 2,
          },
        ];
  });
  const hits = (band: Box): number =>
    routes.filter((route) =>
      route.points.some((point, index) => {
        const next = route.points[index + 1];
        return next !== undefined && segmentHitsBox(point, next, band);
      }),
    ).length +
    labelBoxes.filter(
      (box) =>
        box.left < band.right &&
        band.left < box.right &&
        box.top < band.bottom &&
        band.top < box.bottom,
    ).length;
  for (const [id, group] of groups) {
    const size = input.groups.find((item) => item.id === id);
    if (size === undefined) continue;
    // Узел заголовка ELK уже развёл со связями; у левой кромки он встаёт, только если там свободно.
    const node = titles.get(id);
    const y = node?.y ?? group.title.y;
    const first = group.x + TITLE_INSET;
    const last = Math.max(first, group.x + group.width - TITLE_INSET - size.titleWidth);
    const candidates = [first, ...(node === undefined ? [] : [node.x])];
    for (let x = first + TITLE_STEP; node === undefined && x <= last; x += TITLE_STEP)
      candidates.push(x);
    let best = { x: first, hits: Number.POSITIVE_INFINITY };
    for (const x of candidates) {
      const count = hits({
        left: x - TITLE_STEP,
        right: x + size.titleWidth + TITLE_STEP,
        top: y - size.titleHeight / 2,
        bottom: y + size.titleHeight / 2,
      });
      if (count < best.hits) best = { x, hits: count };
      if (count === 0) break;
    }
    groups.set(id, { ...group, title: { x: best.x, y } });
  }
  return {
    direction: context.direction,
    width: placed.width ?? 0,
    height: placed.height ?? 0,
    nodes,
    layers: context.layers,
    groups,
    edges: routes,
  };
}
