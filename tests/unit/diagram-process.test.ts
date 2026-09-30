import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseProcess, processSvg, processWords } from '../../src/blocks/process.js';
import { cameraAt } from '../../src/browser/camera.js';
import { DIAGRAM_MESSAGES } from '../../src/render/diagram-process.js';
import { zoomGeometry } from '../../src/render/diagram-zoom.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function render(body: readonly string[], language = 'en'): Promise<string> {
  const workspace = await createTestWorkspace('diagram-process');
  workspaces.push(workspace);
  const markdown = `# Process\n${body.join('\n')}\n`;
  const rendered = await renderMarkdown(markdown, {
    language,
    sourceRoot: workspace,
    format: 'single-file',
    outputFilePath: path.join(workspace, 'artifact.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile: path.join(workspace, 'report.md'),
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
  });
  return rendered.html;
}

/** Разметка вида по умолчанию: остальные виды раскладки скрыты и проверяются отдельно. */
function defaultView(html: string): string {
  return (
    /<div id="[^"]*" role="tabpanel"[^>]*data-layout-default[^>]*>[\s\S]*?<\/svg><\/div><\/div>/u.exec(
      html,
    )?.[0] ?? ''
  );
}

const RUN = [
  ':::diagram{title="Run" description="A review run." layout="right" pulse="plan,build,review"}',
  '::node{id="plan" label="Plan" status="done"}',
  '::node{id="build" label="Build" status="done"}',
  '::node{id="review" label="Review" status="returned"}',
  '::edge{from="plan" to="build"}',
  '::edge{from="build" to="review" id="submit"}',
  '::edge{from="review" to="build" label="changes" count="2"}',
  '::edge{from="review" to="review" label="re-run" count="3"}',
  ':::',
];

describe('process diagram', () => {
  it('draws a status in its theme role with a glyph and names it in the legend in package words', async () => {
    const html = await render(RUN);
    const view = defaultView(html);
    // Ловит: статус теряется при переносе в узел — рамка без роли статуса и без значка.
    expect(view).toMatch(/data-node-id="review"[^>]*data-status="returned"/u);
    expect(view).toContain('visualization-node-status-returned');
    expect(view).toContain('visualization-status visualization-status-returned');
    // Ловит: пункт легенды статуса требует слов автора, как выделение `kind`.
    expect(html).toMatch(/data-node-status="done"[^>]*>[\s\S]*?done<\/li>/u);
    expect(html).toMatch(/data-node-status="returned"[^>]*>[\s\S]*?returned<\/li>/u);
    // Ловит: легенда перечисляет статусы, которых на схеме нет.
    expect(html).not.toContain('data-node-status="pending"');
    const russian = await render(RUN, 'ru');
    expect(russian).toMatch(/data-node-status="returned"[^>]*>[\s\S]*?возвращено<\/li>/u);
  });

  it('lets a legend item rename a status', async () => {
    const html = await render([
      ...RUN.slice(0, -1),
      '::legend-item{status="returned" label="sent back"}',
      ':::',
    ]);
    // Ловит: слово автора проигрывает слову пакета или статус попадает в легенду дважды.
    expect(html.match(/data-node-status="returned"/gu)).toHaveLength(1);
    expect(html).toMatch(/data-node-status="returned"[^>]*>[\s\S]*?sent back<\/li>/u);
    expect(html).toContain('Review [sent back]');
  });

  it('writes a count as «×N» on the connection and in the words', async () => {
    const html = await render(RUN);
    // Ловит: кратность остаётся атрибутом и не видна на схеме.
    expect(defaultView(html)).toContain('changes ×2');
    expect(defaultView(html)).toMatch(/data-count="2"/u);
    expect(html).toContain('Review → Build: changes ×2');
  });

  it('draws a connection to its own node as a loop on the node corner kept out of the layout', async () => {
    const html = await render(RUN);
    const view = defaultView(html);
    const loop =
      /<path d="M ([\d.]+) ([\d.]+) C[^"]*"[^>]*data-from="review" data-to="review"[^>]*data-self=""/u.exec(
        view,
      );
    // Ловит: самопетля отказана проверкой или отдана раскладке, которая её не рисует.
    expect(loop).not.toBeNull();
    const box =
      /<g data-node-id="review"[^>]*><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/u.exec(view);
    expect(box).not.toBeNull();
    const right = Number(box?.[1]) + Number(box?.[3]);
    // Петля выходит из верхней кромки у правого угла.
    expect(Number(loop?.[1])).toBeGreaterThan(right - 30);
    expect(Number(loop?.[1])).toBeLessThan(right);
    expect(Number(loop?.[2])).toBe(Number(box?.[2]));
    expect(view).toContain('re-run ×3');
    expect(html).toContain('Review, inside itself: re-run ×3');
    // Ловит: вид не расширен под петлю с подписью, и подпись режется краем картинки.
    const width = Number(/viewBox="0 0 ([\d.]+) /u.exec(view)?.[1]);
    expect(width).toBeGreaterThan(right + 30);
  });

  it('marks the pulse route in order and names it in the words', async () => {
    const html = await render(RUN);
    const view = defaultView(html);
    expect(html).toContain('Route of the pulses: 1. Plan. 2. Build. 3. Review.');
    const steps = [
      ...view.matchAll(/data-from="([a-z]+)" data-to="([a-z]+)"[^>]*data-pulse-step="(\d)"/gu),
    ].map((match) => `${match[3]}:${match[1]}>${match[2]}`);
    // Ловит: маршрут отмечен не по порядку или отмечена обратная связь между теми же узлами.
    expect(steps).toEqual(['1:plan>build', '2:build>review']);
    expect(view).toContain('data-pulse-dot=""');
  });

  it('addresses a connection by its id', async () => {
    const view = defaultView(await render(RUN));
    // Ловит: имя связи не доходит до разметки, и фокус такта не может её назвать.
    expect(view).toMatch(/data-from="build" data-to="review"[^>]*data-edge-id="submit"/u);
  });
});

describe('diagram drawing', () => {
  it('gives every drawn part numeric bounds and puts the marker at the end of the last connection', async () => {
    const html = await render([
      ':::diagram{title="Drawn" description="Three steps." draw="scroll" layout="right"}',
      '::node{id="a" label="A"}',
      '::node{id="b" label="B"}',
      '::node{id="c" label="C"}',
      '::edge{from="a" to="b"}',
      '::edge{from="b" to="c"}',
      ':::',
    ]);
    const view = defaultView(html);
    const bounds = [
      ...view.matchAll(/<path d="([^"]+)"[^>]*data-draw-from="([\d.]+)" data-draw-to="([\d.]+)"/gu),
    ];
    // Ловит: запасной путь без временной шкалы не знает, когда рисовать связь.
    expect(bounds.map((match) => [match[2], match[3]])).toEqual([
      ['0', '0.5'],
      ['0.5', '1'],
    ]);
    const last = bounds.at(-1)?.[1]?.match(/-?[\d.]+/gu) ?? [];
    const marker =
      /<circle cx="([\d.]+)" cy="([\d.]+)" r="5" class="visualization-draw-marker"/u.exec(view);
    // Ловит: маркер без движения стоит в начале или вне схемы, а не в конце маршрута.
    expect([marker?.[1], marker?.[2]]).toEqual([last.at(-2), last.at(-1)]);
  });
});

describe('zoom into a node', () => {
  const ZOOM = [
    '::::diagram{title="Service" description="The API is a flow of its own."}',
    '::node{id="client" label="Client"}',
    '::node{id="api" label="API"}',
    '::edge{from="client" to="api"}',
    ':::zoom{node="api" title="Inside the API"}',
    '::node{id="router" label="Router"}',
    '::node{id="handler" label="Handler"}',
    '::edge{from="router" to="handler"}',
    ':::',
    '::::',
  ];

  it('draws the nested flow inside the node for the camera and both figures for the still page', async () => {
    const html = await render(ZOOM);
    const camera = /<svg[^>]*class="[^"]*visualization-zoom-camera"[^>]*>/u.exec(html)?.[0] ?? '';
    // Ловит: пролёт сделан масштабом картинки, а не кадром камеры в координатах схемы.
    expect(camera).toMatch(/data-zoom-from="0 0 [\d.]+ [\d.]+"/u);
    expect(camera).toMatch(/data-zoom-to="[\d.-]+ [\d.-]+ [\d.]+ [\d.]+"/u);
    expect(html).toMatch(
      /class="visualization-zoom-inner" transform="translate\([\d. -]+\) scale\(0\.\d+\)"/u,
    );
    // Ловит: без движения видна только одна фигура.
    expect(
      html.match(/class="visualization-svg visualization-diagram visualization-zoom-still"/gu),
    ).toHaveLength(2);
    expect(html).toContain('Inside the API');
    expect(html).toContain('Inside “API”');
    // Схема с пролётом держит один вид: камере нужна одна геометрия.
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('data-zoom="api"');
  });

  it('frames the nested flow in the aspect of the whole diagram', () => {
    const geometry = zoomGeometry(
      { width: 600, height: 200 },
      { width: 400, height: 100 },
      { id: 'api', x: 200, y: 60, width: 140, height: 56 },
    );
    const drawn = { width: 400 * geometry.scale, height: 100 * geometry.scale };
    // Вложенный поток вписан в коробку узла с полем.
    expect(drawn.width).toBeLessThanOrEqual(130);
    expect(drawn.height).toBeLessThanOrEqual(46);
    // Ловит: конечный кадр другой пропорции — картинка растянулась бы или камера «прыгнула».
    expect(geometry.final.width / geometry.final.height).toBeCloseTo(3, 6);
    expect(geometry.final.width).toBeGreaterThanOrEqual(drawn.width);
    expect(geometry.final.x + geometry.final.width / 2).toBeCloseTo(270, 6);
  });

  it('moves the camera exponentially toward a point that stays in place on screen', () => {
    const from = [0, 0, 600, 200] as const;
    const to = [200, 60, 120, 40] as const;
    expect(cameraAt(from, to, 0)).toEqual(from);
    expect(cameraAt(from, to, 1).map((value) => Math.round(value * 1000) / 1000)).toEqual([
      200, 60, 120, 40,
    ]);
    const middle = cameraAt(from, to, 0.5);
    // Ловит: ширина кадра меняется линейно — приближение замедляется к концу, а не идёт ровно.
    expect(middle[2]).toBeCloseTo(Math.sqrt(600 * 120), 6);
    // Неподвижная точка пролёта стоит на одном месте экрана во всех кадрах.
    const fixed = (from[0] * to[2] - to[0] * from[2]) / (to[2] - from[2]);
    const share = (box: readonly number[]): number => (fixed - (box[0] ?? 0)) / (box[2] ?? 1);
    expect(share(middle)).toBeCloseTo(share(from), 6);
    expect(share(cameraAt(from, to, 0.8))).toBeCloseTo(share(from), 6);
  });
});

describe('mini process', () => {
  it('reads steps, the current step and the returns, and refuses what it cannot draw', () => {
    const parsed = parseProcess(
      'Plan > Build > Review > Ship',
      'Review',
      'Review>Build×2, Review>Review x3',
    );
    expect(parsed).toEqual({
      steps: ['Plan', 'Build', 'Review', 'Ship'],
      current: 2,
      returns: [
        { from: 2, to: 1, count: 2 },
        { from: 2, to: 2, count: 3 },
      ],
    });
    // Ловит: возврат вперёд, неизвестный шаг и один шаг принимаются молча.
    expect(parseProcess('Plan > Build', undefined, 'Plan>Build')).toMatch(/goes back/u);
    expect(parseProcess('Plan > Build', 'Ship', undefined)).toMatch(/current names/u);
    expect(parseProcess('Plan', undefined, undefined)).toMatch(/2 to 12 steps/u);
    expect(parseProcess('Plan > Build', undefined, 'Build>Plan×0')).toMatch(/between 1 and 999/u);
  });

  it('draws the steps by where the work stands and says it in words', async () => {
    const parsed = parseProcess('Plan > Build > Review > Ship', 'Review', 'Review>Build×2');
    if (typeof parsed === 'string') throw new Error(parsed);
    const svg = JSON.stringify(processSvg(parsed));
    // Ловит: состояния шагов не различаются, и текущий шаг не виден.
    expect(svg.match(/visualization-process-step-done/gu)).toHaveLength(2);
    expect(svg.match(/visualization-process-step-review/gu)).toHaveLength(1);
    expect(svg.match(/visualization-process-step-pending/gu)).toHaveLength(1);
    expect(svg).toContain('×2');
    expect(processWords(parsed, DIAGRAM_MESSAGES.en)).toBe(
      'Steps: Plan (done) → Build (done) → Review (in review) → Ship (not started); returned from Review to Build 2 times.',
    );
    const html = await render([
      'At :process[Plan > Build > Review]{current="Review" returns="Review>Plan×3"} now.',
    ]);
    expect(html).toContain('class="semantic-process"');
    expect(html).toContain('<svg viewBox="0 0 50 30" class="visualization-process"');
    expect(html).toContain('returned from Review to Plan 3 times');
    // Ловит: неверная мини-схема собирается в пустой знак вместо ошибки.
    await expect(render([':process[Plan > Build]{current="Ship"}'])).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_DIRECTIVE_ATTRIBUTE' },
    });
  });
});

describe('chart count-up', () => {
  it('marks a counting chart and keeps its final values in the markup', async () => {
    const html = await render([
      ':::::chart{title="Share" description="Split." type="pie" count-up="true"}',
      '::::series{label="Share"}',
      '::point{label="A" value="3"}',
      '::point{label="B" value="1"}',
      '::::',
      ':::::',
    ]);
    // Ловит: график считает от нуля в разметке — без сценария и в печати значения потерялись бы.
    expect(html).toContain('data-count-up=""');
    expect(html).toContain('>75%</text>');
    expect(html).toContain('data-pie-centre="280 178"');
    const still = await render([
      ':::::chart{title="Share" description="Split." type="pie"}',
      '::::series{label="Share"}',
      '::point{label="A" value="3"}',
      '::::',
      ':::::',
    ]);
    expect(still).not.toContain('data-count-up');
  });
});
