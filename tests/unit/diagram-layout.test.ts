import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { simplify } from '../../src/render/flow-layout.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

/** Разметка одного вида раскладки по его имени: `down`, `right` или `orthogonal`. */
function layoutView(html: string, mode: string): string {
  return (
    new RegExp(
      `<div id="[^"]*" role="tabpanel"[^>]*data-layout-view="${mode}"[^>]*>[\\s\\S]*?</svg></div></div>`,
      'u',
    ).exec(html)?.[0] ?? ''
  );
}

/**
 * Разметка без скрытых видов раскладки: каждая схема несёт виды «сверху вниз», «слева направо» и
 * «прямые углы», а геометрию проверяет тот, что показан по умолчанию.
 */
function defaultView(html: string): string {
  return html.replace(
    /<div id="[^"]*" role="tabpanel"[^>]*\bhidden\b[^>]*>[\s\S]*?<\/svg><\/div><\/div>/gu,
    '',
  );
}

async function renderDiagram(body: readonly string[]): Promise<string> {
  return defaultView(await renderAllViews(body));
}

async function renderAllViews(body: readonly string[], language?: string): Promise<string> {
  const workspace = await createTestWorkspace('diagram-layout');
  workspaces.push(workspace);
  const markdown = `# Diagram\n${body.join('\n')}\n`;
  const sourceFile = path.join(workspace, 'report.md');
  const rendered = await renderMarkdown(markdown, {
    ...(language === undefined ? {} : { language }),
    sourceRoot: workspace,
    format: 'single-file',
    outputFilePath: path.join(workspace, 'artifact.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile,
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
  });
  return rendered.html;
}

function nodeBox(html: string, id: string): { readonly width: number; readonly height: number } {
  const group = new RegExp(`<g data-node-id="${id}"[^>]*>(.*?)</g>`, 'su').exec(html)?.[1];
  if (group === undefined) throw new Error(`Missing node ${id}.`);
  const width = Number(/width="([0-9.]+)"/u.exec(group)?.[1] ?? '0');
  const height = Number(/height="([0-9.]+)"/u.exec(group)?.[1] ?? '0');
  return { width, height };
}

function viewBoxWidth(html: string): number {
  return Number(/viewBox="0 0 ([0-9.]+) [0-9.]+"/u.exec(html)?.[1] ?? '0');
}

function edgeRoutes(html: string): string[] {
  return [...html.matchAll(/data-from="[^"]+" data-to="[^"]+" data-route="([a-z]+)"/gu)].map(
    (match) => match[1] ?? '',
  );
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function rectBox(markup: string): Box {
  const read = (name: string): number =>
    Number(new RegExp(`\\b${name}="(-?[0-9.]+)"`, 'u').exec(markup)?.[1] ?? 'NaN');
  return { x: read('x'), y: read('y'), width: read('width'), height: read('height') };
}

function nodeBoxes(html: string): Box[] {
  return [...html.matchAll(/<g data-node-id="[^"]+"[^>]*><rect ([^>]*)>/gu)].map((match) =>
    rectBox(match[1] ?? ''),
  );
}

interface RenderedLabel {
  readonly plate: Box;
  readonly lines: readonly string[];
}

function edgeLabels(html: string): RenderedLabel[] {
  return [
    ...html.matchAll(/<g class="visualization-edge-label"><rect ([^>]*)>[\s\S]*?<\/text><\/g>/gu),
  ].map((match) => ({
    plate: rectBox(match[1] ?? ''),
    lines: [...(match[0] ?? '').matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/gu)].map(
      (line) => line[1] ?? '',
    ),
  }));
}

function overlaps(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

/** Сообщения последовательности в порядке автора: линия прямого сообщения или середина петли. */
function sequenceMessageLines(html: string): number[] {
  return [
    ...html.matchAll(
      /<(line|path) (?:x1="[^"]*" y1="([0-9.]+)"|d="M [0-9.]+ ([0-9.]+) [^"]*")[^>]*visualization-sequence-message/gu,
    ),
  ].map((match) => (match[1] === 'line' ? Number(match[2]) : Number(match[3]) + 12));
}

function layerOf(html: string, id: string): number {
  return Number(new RegExp(`<g data-node-id="${id}"[^>]*data-layer="(\\d+)"`, 'u').exec(html)?.[1]);
}

function diagramNodeTop(html: string, id: string): number {
  const group = new RegExp(`<g data-node-id="${id}"[^>]*><rect ([^>]*)>`, 'u').exec(html)?.[1];
  return rectBox(group ?? '').y;
}

function nodeBoxesById(html: string): Map<string, Box> {
  return new Map(
    [...html.matchAll(/<g data-node-id="([^"]+)"[^>]*><rect ([^>]*)>/gu)].map((match) => [
      match[1] ?? '',
      rectBox(match[2] ?? ''),
    ]),
  );
}

function groupBox(html: string, id: string): Box {
  return rectBox(
    new RegExp(`<g data-group-id="${id}"[^>]*><rect ([^>]*)>`, 'u').exec(html)?.[1] ?? '',
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Вершины пути связи по порядку. `controls` добавляет управляющие точки кривых: ломаная через них
 * охватывает кривую и годится для проверки «не задевает узел», но на самой линии они не лежат.
 */
function pathPoints(d: string, controls: boolean): Point[] {
  const points: Point[] = [];
  for (const command of d.matchAll(/([MLQC])([^MLQC]*)/gu)) {
    const numbers = [...(command[2] ?? '').matchAll(/-?[0-9.]+/gu)].map((match) =>
      Number(match[0]),
    );
    const pairs: Point[] = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      pairs.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
    }
    points.push(...(controls ? pairs : pairs.slice(-1)));
  }
  return points;
}

function edgePaths(html: string): { from: string; to: string; points: Point[]; onLine: Point[] }[] {
  return [
    ...html.matchAll(
      /<path d="([^"]+)" fill="none" class="semantic-edge[^"]*" data-edge="\d+" data-from="([^"]+)" data-to="([^"]+)"/gu,
    ),
  ].map((match) => ({
    from: match[2] ?? '',
    to: match[3] ?? '',
    points: pathPoints(match[1] ?? '', true),
    onLine: pathPoints(match[1] ?? '', false),
  }));
}

function edgePoints(html: string, from: string, to: string): Point[] {
  return edgePaths(html).find((path) => path.from === from && path.to === to)?.points ?? [];
}

function segmentHitsBox(start: Point, end: Point, box: Box): boolean {
  let enter = 0;
  let leave = 1;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  for (const [direction, distance] of [
    [-deltaX, start.x - box.x],
    [deltaX, box.x + box.width - start.x],
    [-deltaY, start.y - box.y],
    [deltaY, box.y + box.height - start.y],
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
 * Высокий сосед по слою выше грани цели: косой последний отрезок задевал его угол, пока связь не
 * входила в узел отвесно от края полосы слоя. Граф найден перебором случайных схем.
 */
const TALL_NEIGHBOURS: readonly string[] = [
  ':::diagram{title="F" description="F." direction="down"}',
  '::node{id="n0" label="Node 0" detail="a much longer explanation that wraps onto several lines inside the box"}',
  '::node{id="n1" label="Node 1" detail="a much longer explanation that wraps onto several lines inside the box"}',
  '::node{id="n2" label="Node 2"}',
  '::node{id="n3" label="Node 3"}',
  '::node{id="n4" label="Node 4" detail="short"}',
  '::node{id="n5" label="Node 5" detail="short"}',
  '::edge{from="n5" to="n2" label="step 0"}',
  '::edge{from="n2" to="n3"}',
  '::edge{from="n3" to="n1"}',
  '::edge{from="n5" to="n4"}',
  '::edge{from="n5" to="n4"}',
  '::edge{from="n5" to="n1" label="step 6"}',
  '::edge{from="n5" to="n3" label="step 7"}',
  ':::',
];

/**
 * Случайные схемы с фиксированным зерном: узлы разной высоты, связи в обе стороны, подписанные и
 * нет, оба направления. Проверяют свойство раскладки, а не отдельный случай.
 */
function randomFlows(count: number): (readonly string[])[] {
  let seed = 7;
  const random = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const details = [
    '',
    ' detail="short"',
    ' detail="a much longer explanation that wraps onto several lines inside the box"',
  ];
  return Array.from({ length: count }, () => {
    const size = 5 + Math.floor(random() * 8);
    const body = [
      `:::diagram{title="F" description="F." direction="${random() < 0.5 ? 'down' : 'right'}"}`,
      ...Array.from(
        { length: size },
        (_, index) =>
          `::node{id="n${index}" label="Node ${index}"${details[Math.floor(random() * 3)]}}`,
      ),
    ];
    const edges = size + Math.floor(random() * size);
    for (let edge = 0; edge < edges; edge += 1) {
      const from = Math.floor(random() * size);
      const to = Math.floor(random() * size);
      if (from === to) continue;
      body.push(
        `::edge{from="n${from}" to="n${to}"${random() < 0.5 ? ` label="step ${edge}"` : ''}}`,
      );
    }
    return [...body, ':::'];
  });
}

/** Схема пользователя, по которой рендер сравнивается с Mermaid. */
const REFERENCE_FLOW: readonly string[] = [
  ':::diagram{title="Показ" description="Показ анимаций поверхности."}',
  '::group{id="controller" label="Контроллер: show/ + queues/"}',
  '::node{id="user" label="Пользователь"}',
  '::node{id="app" label="Код приложения / UI" detail="интеграция показа ещё не подключена"}',
  '::node{id="model" label="Модель анимаций поверхности" detail="btmodel/…/animation"}',
  '::node{id="build" label="Сборка описания показа" detail="readSurface → lower" group="controller"}',
  '::node{id="live" label="Живая пересборка" detail="и окно загрузки поверхностей" group="controller"}',
  '::node{id="stage" label="Stage" detail="навигация, реакции, предпросмотр и очереди" group="controller"}',
  '::node{id="engine" label="Движок anim" detail="время и вычисление кадра"}',
  '::node{id="driver" label="Driver" detail="источник тиков"}',
  '::node{id="accessor" label="TargetAccessor" detail="адаптер значений"}',
  '::node{id="host" label="Обработчик команд хоста" detail="например управление медиа"}',
  '::node{id="renderer" label="Renderer"}',
  '::node{id="diagnostics" label="Диагностика модели и движка"}',
  '::edge{from="user" to="app" label="действия" kind="event"}',
  '::edge{from="app" to="model" label="редактирование"}',
  '::edge{from="model" to="build" label="описание" kind="data"}',
  '::edge{from="model" to="live" label="изменения" kind="event"}',
  '::edge{from="live" to="build" label="пересобрать"}',
  '::edge{from="build" to="stage" label="клипы, очереди и правила" kind="data"}',
  '::edge{from="live" to="stage" label="состав загруженных поверхностей" kind="data"}',
  '::edge{from="app" to="stage" label="API Stage и события"}',
  '::edge{from="stage" to="engine" label="клипы и команды воспроизведения"}',
  '::edge{from="engine" to="stage" label="завершение клипов" kind="event"}',
  '::edge{from="driver" to="engine" label="тики" kind="event"}',
  '::edge{from="engine" to="driver" label="start / stop"}',
  '::edge{from="engine" to="accessor" label="write: значения кадра" kind="data"}',
  '::edge{from="accessor" to="engine" label="read: базовые значения" kind="data"}',
  '::edge{from="accessor" to="renderer" label="временное состояние" kind="data"}',
  '::edge{from="engine" to="host" label="TargetAccessor.command"}',
  '::edge{from="renderer" to="user" label="изображение" kind="data"}',
  '::edge{from="build" to="diagnostics" label="ошибки описания" kind="event"}',
  '::edge{from="engine" to="diagnostics" label="нарушения контрактов" kind="event"}',
  '::edge{from="diagnostics" to="app" label="обработчики диагностики" kind="event"}',
  ':::',
];

const LONG_CALL = 'open(колода, accessor = привязка, driver, onUndriven, fallbackPolicy = retry)';

describe('flow diagram layout', () => {
  it('sizes a node box from its own label instead of a fixed rectangle', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Sizing" description="Box follows the label."}',
      '::node{id="short" label="A"}',
      '::node{id="long" label="Stage: advance, back, goTo, onEvent, preview"}',
      ':::',
    ]);
    const short = nodeBox(html, 'short');
    const long = nodeBox(html, 'long');
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.height).toBeGreaterThan(short.height);
    // Длинная подпись переносится на несколько строк, а не обрезается до одной.
    const longGroup = /<g data-node-id="long".*?<\/g>/su.exec(html)?.[0] ?? '';
    expect(longGroup.match(/class="visualization-node-label"/gu)?.length ?? 0).toBeGreaterThan(1);
  });

  it('puts nodes into layers along the flow and describes backward connections apart', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Loop" description="A loop back." direction="down"}',
      '::node{id="a" label="Alpha"}',
      '::node{id="b" label="Beta"}',
      '::node{id="c" label="Gamma"}',
      '::edge{from="a" to="b" label="first"}',
      '::edge{from="b" to="c" label="second"}',
      '::edge{from="c" to="a" label="again"}',
      ':::',
    ]);
    expect([layerOf(html, 'a'), layerOf(html, 'b'), layerOf(html, 'c')]).toEqual([0, 1, 2]);
    expect(html).toContain(
      'Connections along the flow: Alpha → Beta: first; Beta → Gamma: second. Connections back against the flow: Gamma → Alpha: again.',
    );
    // Обратная связь ведёт от своего источника к своей цели: линия кончается у Alpha, под
    // основанием наконечника, а не у Gamma.
    const back = edgePoints(html, 'c', 'a');
    const alpha = nodeBoxesById(html).get('a');
    const end = back.at(-1);
    expect(alpha).toBeDefined();
    expect(end).toBeDefined();
    if (alpha !== undefined && end !== undefined) {
      const outside = Math.max(
        alpha.x - end.x,
        end.x - (alpha.x + alpha.width),
        alpha.y - end.y,
        end.y - (alpha.y + alpha.height),
        0,
      );
      expect(outside).toBeLessThanOrEqual(12);
    }
  });

  it('keeps two opposite connections between the same nodes on separate paths', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Pair" description="Clips and completion." direction="down"}',
      '::node{id="stage" label="Stage"}',
      '::node{id="engine" label="Engine"}',
      '::edge{from="stage" to="engine" label="clips and commands" route="direct"}',
      '::edge{from="engine" to="stage" label="clip finished" kind="event"}',
      ':::',
    ]);
    expect(edgeRoutes(html)).toEqual(['direct', 'auto']);
    const forward = edgePoints(html, 'stage', 'engine');
    const backward = edgePoints(html, 'engine', 'stage');
    // Концы расходятся по грани узла, и середины путей не совпадают: ствола нет.
    expect(Math.abs((forward[0]?.x ?? 0) - (backward.at(-1)?.x ?? 0))).toBeGreaterThan(8);
    expect(Math.abs((forward.at(-1)?.x ?? 0) - (backward[0]?.x ?? 0))).toBeGreaterThan(8);
    const [first, second] = edgeLabels(html);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(overlaps(first.plate, second.plate)).toBe(false);
    }
  });

  it('never runs a connection through a node it does not touch', async () => {
    const catalog = await readFile(
      path.resolve('examples/visualization-catalog/report.md'),
      'utf8',
    );
    const lines = catalog.split('\n');
    const start = lines.findIndex((line) =>
      line.startsWith(':::diagram{title="Offline compilation flow"'),
    );
    const end = lines.findIndex((line, index) => index > start && line === ':::');
    for (const body of [REFERENCE_FLOW, lines.slice(start, end + 1), TALL_NEIGHBOURS]) {
      // Обе раскладки по слоям видны читателю через переключатель, поэтому проверяются обе.
      const all = await renderAllViews(body);
      for (const html of [layoutView(all, 'down'), layoutView(all, 'right')]) {
        const boxes = nodeBoxesById(html);
        for (const route of edgePaths(html)) {
          for (const [id, box] of boxes) {
            if (id === route.from || id === route.to) continue;
            const inner = {
              x: box.x + 1,
              y: box.y + 1,
              width: box.width - 2,
              height: box.height - 2,
            };
            for (let index = 0; index < route.points.length - 1; index += 1) {
              const from = route.points[index];
              const to = route.points[index + 1];
              if (from === undefined || to === undefined) continue;
              expect(
                segmentHitsBox(from, to, inner),
                `${route.from} -> ${route.to} crosses ${id}`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  it('never runs a connection through a node in seeded random flows', async () => {
    for (const body of randomFlows(40)) {
      // Обе раскладки по слоям видны читателю через переключатель, поэтому проверяются обе.
      const all = await renderAllViews(body);
      for (const html of [layoutView(all, 'down'), layoutView(all, 'right')]) {
        const boxes = nodeBoxesById(html);
        for (const route of edgePaths(html)) {
          for (const [id, box] of boxes) {
            if (id === route.from || id === route.to) continue;
            const inner = {
              x: box.x + 1,
              y: box.y + 1,
              width: box.width - 2,
              height: box.height - 2,
            };
            for (let index = 0; index < route.points.length - 1; index += 1) {
              const from = route.points[index];
              const to = route.points[index + 1];
              if (from === undefined || to === undefined) continue;
              expect(
                segmentHitsBox(from, to, inner),
                `${route.from} -> ${route.to} crosses ${id}`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  it('keeps every label on its own connection and spreads the ends at one node side', async () => {
    const html = await renderDiagram(REFERENCE_FLOW);
    const boxes = nodeBoxesById(html);
    const paths = edgePaths(html);
    expect(paths.length).toBe(20);
    for (const path of paths) {
      for (const [id, box] of boxes) {
        if (id === path.from || id === path.to) continue;
        const inner = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 };
        for (let index = 0; index < path.points.length - 1; index += 1) {
          const start = path.points[index];
          const end = path.points[index + 1];
          if (start === undefined || end === undefined) continue;
          expect(
            segmentHitsBox(start, end, inner),
            `${path.from} -> ${path.to} crosses ${id}`,
          ).toBe(false);
        }
      }
    }
    // Концы разных связей у одной грани узла расходятся: иначе стрелки сходятся в одну точку, и
    // не видно, какая откуда.
    const ends = paths.flatMap((path) => [
      { node: path.from, point: path.points[0] },
      { node: path.to, point: path.points.at(-1) },
    ]);
    for (const [index, end] of ends.entries()) {
      for (const other of ends.slice(index + 1)) {
        if (end.node !== other.node || end.point === undefined || other.point === undefined) {
          continue;
        }
        expect(
          Math.hypot(end.point.x - other.point.x, end.point.y - other.point.y),
          `ends at ${end.node}`,
        ).toBeGreaterThan(10);
      }
    }
    // Каждая подпись стоит на вершине пути своей связи. Все связи эталона подписаны, поэтому
    // подписи идут в том же порядке, что и пути.
    const labelled = paths;
    const labels = edgeLabels(html);
    expect(labels).toHaveLength(labelled.length);
    for (const [index, label] of labels.entries()) {
      const center = {
        x: label.plate.x + label.plate.width / 2,
        y: label.plate.y + label.plate.height / 2,
      };
      const onPath = (labelled[index]?.onLine ?? []).some(
        (point) => Math.abs(point.x - center.x) < 0.6 && Math.abs(point.y - center.y) < 0.6,
      );
      expect(onPath, labels[index]?.lines.join(' ')).toBe(true);
      for (const box of boxes.values()) expect(overlaps(label.plate, box)).toBe(false);
    }
  });

  it('spreads the ends of parallel connections along the node side', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Parallel" description="Two connections between one pair." direction="down"}',
      '::node{id="engine" label="Engine"}',
      '::node{id="accessor" label="TargetAccessor"}',
      '::edge{from="engine" to="accessor"}',
      '::edge{from="engine" to="accessor" kind="data"}',
      ':::',
    ]);
    const [first, second] = edgePaths(html);
    // Без разведения обе стрелки целят в центр узла и сходятся почти в одну точку.
    for (const [a, b] of [
      [first?.points[0], second?.points[0]],
      [first?.points.at(-1), second?.points.at(-1)],
    ] as const) {
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a !== undefined && b !== undefined) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
      }
    }
  });

  it('straightens a route only where the shortcut stays clear of other nodes', () => {
    // Излом в 5 px dagre ставит, чтобы обойти узел: спрямлять его нельзя, хотя допуск позволяет.
    const around = [
      { x: 0, y: 0 },
      { x: 5, y: 50 },
      { x: 0, y: 100 },
    ];
    const node = { left: -3, top: 40, right: 3, bottom: 60 };
    expect(simplify(around, 0, 10, [node])).toHaveLength(3);
    expect(simplify(around, 0, 10, [])).toHaveLength(2);
    // Точку подписи не убирает никакой допуск.
    expect(simplify(around, 1, 10, [])).toHaveLength(3);
  });

  it('puts nodes that share a row on one layer', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Rows" description="Named rows share a layer." direction="down"}',
      '::node{id="a" label="Start"}',
      '::node{id="b" label="Short branch" row="3"}',
      '::node{id="c" label="Long branch"}',
      '::node{id="d" label="Long branch end" row="3"}',
      '::edge{from="a" to="b" label="quick"}',
      '::edge{from="a" to="c" label="slow"}',
      '::edge{from="c" to="d" label="then"}',
      ':::',
    ]);
    expect(layerOf(html, 'b')).toBe(layerOf(html, 'd'));
    expect(diagramNodeTop(html, 'b')).toBe(diagramNodeTop(html, 'd'));
  });

  it('chooses the direction itself unless the author names one', async () => {
    const chain = (length: number, direction?: string): readonly string[] => [
      `:::diagram{title="Chain" description="A chain."${direction === undefined ? '' : ` direction="${direction}"`}}`,
      ...Array.from(
        { length },
        (_, index) => `::node{id="n${index}" label="Step number ${index}"}`,
      ),
      ...Array.from(
        { length: length - 1 },
        (_, index) => `::edge{from="n${index}" to="n${index + 1}" label="then"}`,
      ),
      ':::',
    ];
    const short = await renderDiagram(chain(3));
    const long = await renderDiagram(chain(9));
    expect(short).toContain('data-diagram-layout="auto" data-diagram-default-view="right"');
    expect(long).toContain('data-diagram-layout="auto" data-diagram-default-view="down"');
    const pinned = await renderDiagram(chain(9, 'right'));
    expect(pinned).toContain('data-diagram-default-view="right"');
  });

  it('draws groups in a downward flow with ungrouped nodes beside them', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Partial" description="One group and outsiders." direction="down"}',
      '::group{id="core" label="Core"}',
      '::node{id="user" label="User"}',
      '::node{id="build" label="Build" group="core"}',
      '::node{id="stage" label="Stage" group="core"}',
      '::node{id="engine" label="Engine"}',
      '::edge{from="user" to="build" label="asks"}',
      '::edge{from="build" to="stage" label="clips"}',
      '::edge{from="stage" to="engine" label="plays"}',
      ':::',
    ]);
    const group = groupBox(html, 'core');
    const boxes = nodeBoxesById(html);
    const inside = (box: Box): boolean =>
      box.x >= group.x &&
      box.y >= group.y &&
      box.x + box.width <= group.x + group.width &&
      box.y + box.height <= group.y + group.height;
    expect(inside(boxes.get('build') ?? group)).toBe(true);
    expect(inside(boxes.get('stage') ?? group)).toBe(true);
    expect(overlaps(boxes.get('user') ?? group, group)).toBe(false);
    expect(overlaps(boxes.get('engine') ?? group, group)).toBe(false);
    expect(html).toContain('Groups: “Core”: Build, Stage.');
  });

  it('follows the requested spacing without changing what is drawn', async () => {
    const body = (spacing: string): readonly string[] => [
      `:::diagram{title="Spacing" description="Breathing room." spacing="${spacing}"}`,
      '::node{id="a" label="First"}',
      '::node{id="b" label="Second"}',
      '::edge{from="a" to="b" label="next"}',
      ':::',
    ];
    const compact = await renderDiagram(body('compact'));
    const spacious = await renderDiagram(body('spacious'));
    expect(viewBoxWidth(compact)).toBeLessThan(viewBoxWidth(spacious));
    expect(nodeBox(compact, 'a')).toEqual(nodeBox(spacious, 'a'));
  });
  it('wraps a long edge label instead of truncating it and keeps it off every node', async () => {
    const layouts: readonly (readonly string[])[] = [
      [
        ':::diagram{title="Row" description="Level label."}',
        '::node{id="a" label="Deck"}',
        '::node{id="b" label="Binding"}',
        `::edge{from="a" to="b" label="${LONG_CALL}"}`,
        ':::',
      ],
      [
        ':::diagram{title="Column" description="Side label." direction="down"}',
        '::node{id="a" label="Deck"}',
        '::node{id="b" label="Binding"}',
        '::node{id="c" label="Driver"}',
        '::node{id="d" label="Renderer"}',
        '::node{id="e" label="Stage"}',
        `::edge{from="a" to="b" label="${LONG_CALL}"}`,
        ':::',
      ],
      [
        ':::diagram{title="Groups" description="Gap, level, inner and outer labels."}',
        '::group{id="left" label="Left"}',
        '::group{id="right" label="Right"}',
        '::node{id="a" label="Deck" group="left"}',
        '::node{id="b" label="Stage" group="left"}',
        '::node{id="c" label="Binding" group="right"}',
        '::node{id="d" label="Driver" group="right"}',
        `::edge{from="a" to="b" label="${LONG_CALL}"}`,
        `::edge{from="a" to="c" label="${LONG_CALL}"}`,
        `::edge{from="b" to="c" label="${LONG_CALL}"}`,
        `::edge{from="d" to="a" label="${LONG_CALL}"}`,
        `::edge{from="c" to="b" label="${LONG_CALL}"}`,
        ':::',
      ],
    ];
    for (const body of layouts) {
      const html = await renderDiagram(body);
      const labels = edgeLabels(html);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.lines.length).toBeGreaterThan(1);
        expect(label.lines.join(' ')).toBe(LONG_CALL);
      }
      expect(html).not.toMatch(/…<\/tspan>/u);
      const nodes = nodeBoxes(html);
      for (const label of labels) {
        for (const node of nodes) expect(overlaps(label.plate, node)).toBe(false);
        expect(label.plate.y).toBeGreaterThanOrEqual(0);
      }
      for (const [index, label] of labels.entries()) {
        for (const other of labels.slice(index + 1)) {
          expect(overlaps(label.plate, other.plate)).toBe(false);
        }
      }
    }
  });
});

describe('sequence diagram layout', () => {
  it('wraps message labels and moves the next message below the tallest label', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Calls" description="Long calls." type="sequence"}',
      '::node{id="deck" label="Deck"}',
      '::node{id="binding" label="Binding"}',
      `::edge{from="deck" to="binding" label="${LONG_CALL}"}`,
      `::edge{from="binding" to="deck" label="${LONG_CALL}"}`,
      ':::',
    ]);
    const labels = edgeLabels(html);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.lines.length).toBeGreaterThan(1);
      expect(label.lines.join(' ')).toBe(LONG_CALL);
    }
    expect(html).not.toContain('…');
    const [first, second] = sequenceMessageLines(html);
    // Подпись второго сообщения растёт вверх от его линии и не достаёт до линии первого.
    expect(labels[1]?.plate.y ?? 0).toBeGreaterThan((first ?? 0) + 6);
    expect(second ?? 0).toBeGreaterThan(labels[1]?.plate.y ?? 0);
    for (const label of labels) {
      for (const node of nodeBoxes(html)) expect(overlaps(label.plate, node)).toBe(false);
    }
  });

  it('draws a message to the same participant as a labelled loop on its lifeline', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Stage" description="Inner steps." type="sequence"}',
      '::node{id="stage" label="Stage"}',
      '::node{id="renderer" label="Renderer"}',
      '::edge{from="stage" to="renderer" label="render(frame)"}',
      `::edge{from="renderer" to="renderer" label="${LONG_CALL}"}`,
      '::edge{from="stage" to="stage" label="collect clips"}',
      '::edge{from="renderer" to="stage" label="done"}',
      ':::',
    ]);
    const loops = [
      ...html.matchAll(
        /<path d="M ([0-9.]+) ([0-9.]+) H ([0-9.]+) V ([0-9.]+) H [0-9.]+"[^>]*visualization-sequence-self-message[^>]*data-from="([^"]+)" data-to="([^"]+)"/gu,
      ),
    ];
    expect(loops.map((loop) => [loop[5], loop[6]])).toEqual([
      ['renderer', 'renderer'],
      ['stage', 'stage'],
    ]);
    const lifelines = new Map(
      [...html.matchAll(/<line x1="([0-9.]+)"[^>]*data-participant="([^"]+)"/gu)].map((match) => [
        match[2],
        Number(match[1]),
      ]),
    );
    for (const loop of loops) {
      // Петля начинается на линии жизни своего участника и уходит вправо, а у последнего участника,
      // справа от которого соседа нет, — влево, чтобы не расширять картинку.
      expect(Number(loop[1])).toBe(lifelines.get(loop[5] ?? ''));
      if (loop[5] === 'renderer') expect(Number(loop[3])).toBeLessThan(Number(loop[1]));
      else expect(Number(loop[3])).toBeGreaterThan(Number(loop[1]));
    }
    // Подпись петли последнего участника стоит слева от петли и не выходит за правый край линий.
    const mirroredLabel = edgeLabels(html)[1];
    expect((mirroredLabel?.plate.x ?? 0) + (mirroredLabel?.plate.width ?? 0)).toBeLessThan(
      lifelines.get('renderer') ?? 0,
    );
    expect(html).toContain('4. Renderer → Stage: done');
    expect(html).toContain(`2. Renderer, inside itself: ${LONG_CALL}`);

    const labels = edgeLabels(html);
    expect(labels.map((label) => label.lines.join(' '))).toEqual([
      'render(frame)',
      LONG_CALL,
      'collect clips',
      'done',
    ]);
    const viewBox = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/u.exec(html);
    for (const [index, label] of labels.entries()) {
      expect(label.plate.x + label.plate.width).toBeLessThanOrEqual(Number(viewBox?.[1]));
      expect(label.plate.y + label.plate.height).toBeLessThanOrEqual(Number(viewBox?.[2]));
      for (const other of labels.slice(index + 1)) {
        expect(overlaps(label.plate, other.plate)).toBe(false);
      }
    }
    const lines = sequenceMessageLines(html);
    expect(lines).toHaveLength(4);
    expect([...lines].sort((first, second) => first - second)).toEqual(lines);
  });
});

describe('diagram kinds, legend and description', () => {
  it('draws every connection kind with its own line and arrowhead and explains a mix', async () => {
    const single = await renderDiagram([
      ':::diagram{title="One kind" description="Calls only."}',
      '::node{id="a" label="A"}',
      '::node{id="b" label="B"}',
      '::edge{from="a" to="b" label="call"}',
      ':::',
    ]);
    expect(single).toContain('visualization-edge-kind-call');
    // Один вид ничего не различает, поэтому легенды нет и описание вид не называет.
    expect(single).not.toContain('semantic-legend');
    expect(single).toContain('Connections along the flow: A → B: call.');

    const mixed = await renderDiagram([
      ':::diagram{title="Mixed" description="Four kinds."}',
      '::node{id="a" label="A"}',
      '::node{id="b" label="B"}',
      '::node{id="c" label="C"}',
      '::edge{from="a" to="b" label="calls"}',
      '::edge{from="b" to="c" label="values" kind="data"}',
      '::edge{from="c" to="a" label="done" kind="event"}',
      '::edge{from="a" to="c" label="creates" kind="dependency"}',
      ':::',
    ]);
    for (const kind of ['call', 'data', 'event', 'dependency']) {
      expect(mixed).toMatch(new RegExp(`class="[^"]*visualization-edge-kind-${kind}"`, 'u'));
      expect(mixed).toContain(`<li class="semantic-legend-item" data-edge-kind="${kind}">`);
    }
    expect(mixed).toContain('visualization-edge-arrow-open');
    expect(mixed).toContain('visualization-edge-arrow-hollow');
    expect(mixed).toContain('B → C: values (data or values)');
    expect(mixed).toContain('C → A: done (event or callback)');
  });

  it('lets the author title the legend, rename, add and hide entries in their own words', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Status" description="Where each part comes from."}',
      '::node{id="engine" label="Engine" kind="success"}',
      '::node{id="stage" label="Stage" kind="accent"}',
      '::node{id="queue" label="Queue" kind="warning"}',
      '::edge{from="stage" to="engine" label="play"}',
      '::edge{from="engine" to="queue" label="frame" kind="data"}',
      '::edge{from="queue" to="stage" label="drained" kind="event"}',
      '::legend{title="How to read"}',
      '::legend-item{edge="call" label="calls a method"}',
      '::legend-item{node="success" label="in trunk"}',
      '::legend-item{node="accent" label="from the branch, stays"}',
      '::legend-item{edge="event" hidden="true"}',
      ':::',
    ]);
    expect(html).toContain('<p class="visualization-legend-title">How to read</p>');
    const entries = [
      ...html.matchAll(
        /<li class="semantic-legend-item" data-(edge|node)-kind="([a-z]+)">[\s\S]*?<\/svg>([^<]*)<\/li>/gu,
      ),
    ].map((match) => `${match[1]}:${match[2]}:${match[3]}`);
    // Сначала пункты автора в его порядке, затем виды, которые схема смешивает и автор не назвал;
    // скрытый вид в легенду не попадает.
    expect(entries).toEqual([
      'edge:call:calls a method',
      'node:success:in trunk',
      'node:accent:from the branch, stays',
      'edge:data:data or values',
    ]);
    expect(html).toContain('Engine [in trunk]');
    expect(html).toContain('Stage → Engine: play (calls a method)');

    const manual = await renderDiagram([
      ':::diagram{title="Manual" description="Only named entries."}',
      '::node{id="a" label="A" kind="success"}',
      '::node{id="b" label="B"}',
      '::edge{from="a" to="b" label="one"}',
      '::edge{from="b" to="a" label="two" kind="data"}',
      '::legend{auto="false"}',
      '::legend-item{node="success" label="in trunk"}',
      ':::',
    ]);
    expect(manual.match(/class="semantic-legend-item"/gu)).toHaveLength(1);
  });

  it('adds a smaller second line under the node label', async () => {
    const plain = await renderDiagram([
      ':::diagram{title="Plain" description="No detail."}',
      '::node{id="a" label="Engine"}',
      ':::',
    ]);
    const detailed = await renderDiagram([
      ':::diagram{title="Detailed" description="With detail."}',
      '::node{id="a" label="Engine" detail="time and frame computation"}',
      ':::',
    ]);
    const detailLines = [
      ...detailed.matchAll(/class="visualization-node-detail">([^<]*)<\/text>/gu),
    ].map((match) => match[1]);
    expect(detailLines.join(' ')).toBe('time and frame computation');
    expect(nodeBox(detailed, 'a').height).toBeGreaterThan(nodeBox(plain, 'a').height);
    expect(detailed).toContain('Layers along the flow: 1. Engine — time and frame computation.');
  });

  it('writes the diagram out in words under the picture', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Words" description="Readable text."}',
      '::node{id="a" label="Alpha"}',
      '::node{id="b" label="Beta"}',
      '::edge{from="a" to="b" label="next"}',
      ':::',
    ]);
    const transcript = /<details class="visualization-transcript">[\s\S]*?<\/details>/u.exec(
      html,
    )?.[0];
    expect(transcript).toContain('<summary>Diagram in words</summary>');
    expect(transcript).toContain('<li>Alpha → Beta: next</li>');
  });
});

/** Расстояние от точки до ближайшего отрезка ломаной. */
function distanceToPolyline(point: Point, points: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined) continue;
    const length = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    const ratio =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
                length,
            ),
          );
    best = Math.min(
      best,
      Math.hypot(
        point.x - (start.x + ratio * (end.x - start.x)),
        point.y - (start.y + ratio * (end.y - start.y)),
      ),
    );
  }
  return best;
}

/** Рамка группы и полоса её заголовка: ширина строки оценена по числу знаков. */
function groupFrames(html: string): { id: string; frame: Box; title: Box; anchor: string }[] {
  return [
    ...html.matchAll(
      /<g data-group-id="([^"]+)" class="semantic-group"><rect ([^>]*)><\/rect><text x="(-?[0-9.]+)" y="(-?[0-9.]+)" text-anchor="(start|middle)" class="visualization-group-label">([^<]*)<\/text>/gu,
    ),
  ].map((match) => {
    const width = (match[6] ?? '').length * 8.5;
    const x = Number(match[3]) - (match[5] === 'middle' ? width / 2 : 0);
    return {
      id: match[1] ?? '',
      frame: rectBox(match[2] ?? ''),
      title: { x, y: Number(match[4]) - 13, width, height: 16 },
      anchor: match[5] ?? '',
    };
  });
}

describe('chart value axis', () => {
  it('labels the value axis with round steps that cover the data', async () => {
    const axis = async (values: readonly string[]): Promise<string[]> => {
      const html = await renderAllViews([
        '::::chart{type="line" title="Axis" description="Round ticks." x-label="Week" y-label="Value"}',
        ':::series{label="Values"}',
        ...values.map((value, index) => `::point{label="W${index + 1}" value="${value}"}`),
        ':::',
        '::::',
      ]);
      return [
        ...html.matchAll(/text-anchor="end" class="visualization-axis-label">([^<]*)</gu),
      ].map((match) => match[1] ?? '');
    };
    expect(await axis(['61.5', '70', '82.5', '91'])).toEqual(['0', '25', '50', '75', '100']);
    expect(await axis(['-12', '7', '30'])).toEqual(['-20', '0', '20', '40']);
    expect(await axis(['0.12', '0.3'])).toEqual(['0', '0.1', '0.2', '0.3']);
  });
});

describe('sequence participant spacing', () => {
  it('widens only the gap a long message needs and stays within the page budget', async () => {
    const html = await renderDiagram([
      ':::diagram{type="sequence" title="Gaps" description="One long message between the first two."}',
      '::node{id="a" label="Canvas"}',
      '::node{id="b" label="Accessor"}',
      '::node{id="c" label="Driver"}',
      '::node{id="d" label="Stage"}',
      '::edge{from="a" to="b" label="new CanvasAccessor(target lookup on this canvas, diagnostics sink)"}',
      '::edge{from="b" to="c" label="tick"}',
      '::edge{from="c" to="d" label="open"}',
      ':::',
    ]);
    const lifelines = [
      ...html.matchAll(/<line x1="([0-9.]+)"[^>]*data-participant="([^"]+)"/gu),
    ].map((match) => Number(match[1]));
    const gaps = lifelines.slice(1).map((x, index) => x - (lifelines[index] ?? 0));
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toBeGreaterThan((gaps[1] ?? 0) + 10);
    expect(gaps[1]).toBe(gaps[2]);
    expect(viewBoxWidth(html)).toBeLessThanOrEqual(640);
  });

  it('wraps a participant name by words but never cuts a word', async () => {
    const html = await renderDiagram([
      ':::diagram{type="sequence" title="Names" description="Long names."}',
      '::node{id="a" label="ShowSessionController"}',
      '::node{id="b" label="Рендерер картинки"}',
      '::edge{from="a" to="b" label="apply"}',
      ':::',
    ]);
    expect(html).not.toContain('…');
    expect(html).toContain('>ShowSessionController</text>');
    expect(html).toContain('>Рендерер</text>');
    expect(html).toContain('>картинки</text>');
  });
});

describe('right-angle view and group frames', () => {
  it('puts every label of the right-angle view on its own connection and off every node', async () => {
    const view = layoutView(await renderAllViews(REFERENCE_FLOW), 'orthogonal');
    const paths = edgePaths(view);
    const labels = edgeLabels(view);
    const boxes = nodeBoxesById(view);
    expect(paths).toHaveLength(20);
    expect(labels).toHaveLength(20);
    for (const [index, label] of labels.entries()) {
      const center = {
        x: label.plate.x + label.plate.width / 2,
        y: label.plate.y + label.plate.height / 2,
      };
      expect(
        distanceToPolyline(center, paths[index]?.onLine ?? []),
        label.lines.join(' '),
      ).toBeLessThan(1.5);
      for (const box of boxes.values()) expect(overlaps(label.plate, box)).toBe(false);
    }
    for (const path of paths) {
      for (const [id, box] of boxes) {
        if (id === path.from || id === path.to) continue;
        const inner = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 };
        for (let index = 0; index + 1 < path.points.length; index += 1) {
          const start = path.points[index];
          const end = path.points[index + 1];
          if (start === undefined || end === undefined) continue;
          expect(
            segmentHitsBox(start, end, inner),
            `${path.from} -> ${path.to} crosses ${id}`,
          ).toBe(false);
        }
      }
    }
  });

  it('fits every group frame to its nodes and keeps its title clear of connections', async () => {
    const html = await renderAllViews([
      ':::diagram{title="Groups" description="Connections enter both groups from above."}',
      '::group{id="authoring" label="Authoring graph"}',
      '::group{id="compiler" label="Compiler pipeline"}',
      '::node{id="assets" label="Local assets" group="authoring"}',
      '::node{id="source" label="Declarative source" group="authoring"}',
      '::node{id="partials" label="Markdown partials" group="authoring"}',
      '::node{id="validate" label="Validate data" group="compiler"}',
      '::node{id="confine" label="Confine resources" group="compiler"}',
      '::node{id="output" label="Serialize output" group="compiler"}',
      '::node{id="artifact" label="Portable artifact"}',
      '::edge{from="source" to="validate" label="parse"}',
      '::edge{from="partials" to="validate" label="expand"}',
      '::edge{from="assets" to="confine" label="resolve"}',
      '::edge{from="validate" to="confine" label="typed graph"}',
      '::edge{from="confine" to="output" label="safe source"}',
      '::edge{from="output" to="artifact" label="document"}',
      ':::',
    ]);
    const members: Record<string, readonly string[]> = {
      authoring: ['assets', 'source', 'partials'],
      compiler: ['validate', 'confine', 'output'],
    };
    for (const mode of ['down', 'right', 'orthogonal']) {
      const view = layoutView(html, mode);
      const boxes = nodeBoxesById(view);
      const frames = groupFrames(view);
      expect(frames.map((frame) => frame.id).sort(), mode).toEqual(['authoring', 'compiler']);
      for (const { id, frame, title, anchor } of frames) {
        const inside = (members[id] ?? []).map((member) => boxes.get(member));
        // Рамка охватывает свои узлы и заголовок. Шире узлов она становится только ради заголовка,
        // которому над узлами не нашлось свободной полосы, и не больше чем на его ширину с полями.
        for (const box of inside) {
          expect(box, `${mode} ${id}`).toBeDefined();
          if (box === undefined) continue;
          expect(box.x, `${mode} ${id}`).toBeGreaterThanOrEqual(frame.x);
          expect(box.y, `${mode} ${id}`).toBeGreaterThanOrEqual(frame.y);
          expect(box.x + box.width, `${mode} ${id}`).toBeLessThanOrEqual(frame.x + frame.width);
          expect(box.y + box.height, `${mode} ${id}`).toBeLessThanOrEqual(frame.y + frame.height);
          expect(title.y + title.height, `${mode} ${id} title above`).toBeLessThanOrEqual(
            box.y + 1,
          );
        }
        const content =
          Math.max(...inside.map((box) => (box === undefined ? 0 : box.x + box.width))) -
          Math.min(...inside.map((box) => (box === undefined ? 0 : box.x)));
        expect(frame.width, `${mode} ${id} width`).toBeLessThanOrEqual(
          content + title.width + 2 * 48,
        );
        expect(anchor).toBe('start');
        expect(title.x, `${mode} ${id}`).toBeGreaterThanOrEqual(frame.x);
        for (const path of edgePaths(view)) {
          for (let index = 0; index + 1 < path.points.length; index += 1) {
            const start = path.points[index];
            const end = path.points[index + 1];
            if (start === undefined || end === undefined) continue;
            expect(
              segmentHitsBox(start, end, title),
              `${mode}: ${path.from} -> ${path.to} crosses the title of ${id}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('lays three parallel connections out of a group side by side instead of failing', async () => {
    // dagre 3.1 теряет координаты фиктивных узлов, когда три параллельные связи выходят из группы.
    const html = await renderAllViews([
      ':::diagram{title="Bundle" description="Three messages between one pair." layout="down"}',
      '::group{id="core" label="Core"}',
      '::group{id="side" label="Side"}',
      '::node{id="target" label="Target" detail="outside every group"}',
      '::node{id="source" label="Source" group="core"}',
      '::node{id="other" label="Other" group="side"}',
      '::edge{from="source" to="target" label="first message"}',
      '::edge{from="source" to="target"}',
      '::edge{from="source" to="target" label="third message"}',
      ':::',
    ]);
    for (const mode of ['down', 'right']) {
      const view = layoutView(html, mode);
      const paths = edgePaths(view);
      expect(paths, mode).toHaveLength(3);
      const starts = paths.map((path) => path.points[0]);
      for (const [index, start] of starts.entries()) {
        for (const other of starts.slice(index + 1)) {
          expect(
            Math.hypot((start?.x ?? 0) - (other?.x ?? 0), (start?.y ?? 0) - (other?.y ?? 0)),
            mode,
          ).toBeGreaterThan(10);
        }
      }
      const labels = edgeLabels(view);
      expect(labels.map((label) => label.lines.join(' '))).toEqual([
        'first message',
        'third message',
      ]);
      expect(overlaps(labels[0]?.plate ?? rectBox(''), labels[1]?.plate ?? rectBox(''))).toBe(
        false,
      );
    }
  });

  it('lets a wide diagram shrink to three quarters of its width and no further', async () => {
    const html = await renderAllViews(REFERENCE_FLOW);
    const svgs = [
      ...html.matchAll(
        /<svg viewBox="0 0 ([0-9.]+) [0-9.]+" width="([0-9.]+)" style="--diagram-width: ([0-9.]+)px"/gu,
      ),
    ];
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) {
      expect(svg[2]).toBe(svg[1]);
      expect(svg[3]).toBe(svg[1]);
    }
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    expect(css).toContain('min-width: calc(var(--diagram-width, 0px) * 0.75);');
  });
});

describe('diagram layout switcher', () => {
  const grouped = (layout?: string): readonly string[] => [
    `:::diagram{title="Views" description="Three views."${layout === undefined ? '' : ` layout="${layout}"`}}`,
    '::group{id="core" label="Core"}',
    '::node{id="user" label="User"}',
    '::node{id="stage" label="Stage" group="core"}',
    '::node{id="engine" label="Engine" group="core"}',
    '::edge{from="user" to="stage" label="asks"}',
    '::edge{from="stage" to="engine" label="plays"}',
    ':::',
  ];
  const tabs = (html: string): string[] =>
    [
      ...html.matchAll(
        /<button type="button"[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*data-layout-mode="([a-z]+)">([^<]*)<\/button>/gu,
      ),
    ].map((match) => `${match[2]}:${match[1]}:${match[3]}`);
  const panels = (html: string): string[] =>
    [...html.matchAll(/role="tabpanel"[^>]*data-layout-view="([a-z]+)"([^>]*)>/gu)].map(
      (match) =>
        `${match[1]}:${(match[2] ?? '').includes('data-layout-default') ? 'default' : (match[2] ?? '').includes('hidden') ? 'hidden' : 'shown'}`,
    );

  it('ships every view, selects the author default, and hides the rest', async () => {
    const html = await renderAllViews(grouped('orthogonal'));
    expect(tabs(html)).toEqual([
      'down:false:Top to bottom',
      'right:false:Left to right',
      'orthogonal:true:Right angles',
    ]);
    expect(panels(html)).toEqual(['down:hidden', 'right:hidden', 'orthogonal:default']);
    expect(html).toContain(
      '<div role="tablist" aria-label="Diagram layout" class="semantic-tab-list visualization-layout-switch">',
    );
    expect(html).toContain(
      'data-diagram-layout="orthogonal" data-diagram-default-view="orthogonal"',
    );
    // У каждого вида свои координаты, узлы те же.
    for (const mode of ['down', 'right', 'orthogonal']) {
      expect(layoutView(html, mode).match(/<g data-node-id=/gu)).toHaveLength(3);
    }
    // Только выбранная вкладка в порядке обхода клавиатурой; остальные доступны стрелками.
    expect(html.match(/role="tab"[^>]*tabindex="0"/gu)).toHaveLength(1);
  });

  it('offers all three views with or without groups and names them in the page language', async () => {
    const ungrouped = await renderAllViews(
      [
        ':::diagram{title="Plain" description="No groups." layout="down"}',
        '::node{id="a" label="A"}',
        '::node{id="b" label="B"}',
        '::edge{from="a" to="b" label="next"}',
        ':::',
      ],
      'ru',
    );
    expect(tabs(ungrouped)).toEqual([
      'down:true:Сверху вниз',
      'right:false:Слева направо',
      'orthogonal:false:Прямые углы',
    ]);
    expect(ungrouped).toContain('aria-label="Раскладка схемы"');
    const russian = await renderAllViews(grouped(), 'ru');
    expect(tabs(russian).map((tab) => tab.split(':')[2])).toEqual([
      'Сверху вниз',
      'Слева направо',
      'Прямые углы',
    ]);
  });

  it('keeps the older direction spelling as the default view', async () => {
    const html = await renderAllViews([
      ':::diagram{title="Old" description="Direction still works." direction="right"}',
      '::node{id="a" label="A"}',
      '::node{id="b" label="B"}',
      '::edge{from="a" to="b" label="next"}',
      ':::',
    ]);
    expect(panels(html)).toEqual(['down:hidden', 'right:default', 'orthogonal:hidden']);
  });
});

describe('architecture layer map fixture', () => {
  it('draws the layer map with its three connection kinds and the author legend, clear of nodes', async () => {
    const fixture = await readFile(
      path.resolve('tests/fixtures/diagrams/architecture-layer-map.md'),
      'utf8',
    );
    const lines = fixture.split('\n');
    const body = lines.slice(lines.findIndex((line) => line.startsWith(':::diagram{')));
    const all = await renderAllViews(body, 'ru');
    const html = defaultView(all);
    expect(nodeBoxesById(html).size).toBe(7);
    for (const kind of ['dependency', 'data', 'call']) {
      expect(html).toMatch(new RegExp(`class="[^"]*visualization-edge-kind-${kind}"`, 'u'));
    }
    const entries = [
      ...all.matchAll(
        /<li class="semantic-legend-item" data-(?:edge|node)-kind="[a-z]+">[\s\S]*?<\/svg>([^<]*)<\/li>/gu,
      ),
    ].map((match) => match[1]);
    expect(entries).toEqual([
      'создаёт',
      'внедряет',
      'вызывает',
      'в транке',
      'из ветки, остаётся',
      'из ветки, переделывается',
      'новое',
    ]);
    expect(all).toContain('<p class="visualization-legend-title">Как читать карту</p>');
    expect(all).toContain('Холст → Driver: new Driver() (создаёт)');
    expect(all).toContain('Stage — постановщик: лента, шаги, предпросмотр [в транке]');
    for (const view of [layoutView(all, 'down'), layoutView(all, 'right')]) {
      const boxes = nodeBoxesById(view);
      for (const route of edgePaths(view)) {
        for (const [id, box] of boxes) {
          if (id === route.from || id === route.to) continue;
          const inner = {
            x: box.x + 1,
            y: box.y + 1,
            width: box.width - 2,
            height: box.height - 2,
          };
          for (let index = 0; index < route.points.length - 1; index += 1) {
            const from = route.points[index];
            const to = route.points[index + 1];
            if (from === undefined || to === undefined) continue;
            expect(
              segmentHitsBox(from, to, inner),
              `${route.from} -> ${route.to} crosses ${id}`,
            ).toBe(false);
          }
        }
      }
    }
  });
});
