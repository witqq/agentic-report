import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Схемы и процесс в браузере: прорисовка схемы без временной шкалы прокрутки идёт запасным путём по
 * часам страницы, маркер едет по рисуемой связи и стоит в конце без движения, импульсы проходят маршрут
 * и останавливаются, камера пролёта летит в узел по прогрессу, такт зажигает связь по её имени, график
 * растёт от нуля до значений, а мини-схема процесса стоит в строке. Движение ставится часами страницы
 * (`__clock.seek`) и прогрессом записи (`data-clock-progress`), поэтому проверки детерминированы.
 */
async function buildPage(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-diagrams-and-process', project);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source'), { recursive: true });
  await writeFile(
    path.join(root, 'source', 'report.md'),
    [
      '---',
      'title: Diagrams and process',
      'language: en',
      '---',
      '',
      '# Diagrams and process',
      '',
      '::::::section{title="Run" id="run"}',
      'The change is at :process[Plan > Build > Review > Ship]{current="Review" returns="Review>Build×2"} after two rounds.',
      '',
      ':::::diagram{title="Review run" description="A run with returns." layout="right" pulse="plan,build,review"}',
      '::node{id="plan" label="Plan" status="done"}',
      '::node{id="build" label="Build" status="done"}',
      '::node{id="review" label="Review" status="returned"}',
      '::edge{from="plan" to="build"}',
      '::edge{from="build" to="review"}',
      '::edge{from="review" to="build" label="changes" count="2"}',
      '::edge{from="review" to="review" label="re-run" count="3"}',
      ':::::',
      '::::::',
      '',
      '::::::section{title="Drawn" id="drawn"}',
      ':::::diagram{title="Request path" description="Three services." layout="right" draw="scroll"}',
      '::node{id="gateway" label="Gateway"}',
      '::node{id="service" label="Service"}',
      '::node{id="store" label="Store"}',
      '::edge{from="gateway" to="service"}',
      '::edge{from="service" to="store"}',
      ':::::',
      '::::::',
      '',
      '::::::section{title="Zoom" id="zoom"}',
      '::::diagram{title="Service" description="The API is a flow of its own."}',
      '::node{id="client" label="Client"}',
      '::node{id="api" label="API"}',
      '::node{id="store" label="Store"}',
      '::edge{from="client" to="api"}',
      '::edge{from="api" to="store"}',
      ':::zoom{node="api" title="Inside the API"}',
      '::node{id="router" label="Router"}',
      '::node{id="auth" label="Auth"}',
      '::node{id="handler" label="Handler"}',
      '::edge{from="router" to="auth"}',
      '::edge{from="auth" to="handler"}',
      ':::',
      '::::',
      '::::::',
      '',
      '::::::section{title="Steps" id="steps" scene="steps"}',
      ':::::diagram{title="Lit path" description="One connection lit by name." layout="right"}',
      '::node{id="first" label="First"}',
      '::node{id="second" label="Second"}',
      '::node{id="third" label="Third"}',
      '::edge{from="first" to="second" id="handoff"}',
      '::edge{from="second" to="third"}',
      ':::::',
      '',
      ':::beat{title="Handoff" focus="handoff"}',
      'Only the handoff is lit.',
      ':::',
      '',
      ':::beat{title="Rest"}',
      'Nothing is lit.',
      ':::',
      '::::::',
      '',
      '::::::section{title="Chart" id="chart"}',
      ':::::chart{title="Latency" description="Median latency." type="bar" y-label="ms" count-up="true"}',
      '::::series{label="p50"}',
      '::point{label="EU" value="40"}',
      '::point{label="US" value="20"}',
      '::::',
      ':::::',
      '::::::',
    ].join('\n'),
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'source'), output });
  return pathToFileURL(output).href;
}

async function openManual(page: Page, url: string, timeline = true): Promise<void> {
  await page.addInitScript((keepTimeline) => {
    window.__agenticReportClock = 'manual';
    // Firefox и Safari без временной шкалы прокрутки: запасной путь должен рисовать схему сам.
    if (!keepTimeline) {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...values: [string, string?]) =>
        values.join(' ').includes('animation-timeline')
          ? false
          : supports(...(values as [string]))) as typeof CSS.supports;
    }
  }, timeline);
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
}

/** Смещения штриха связей видимого вида и положение маркера относительно рисуемой связи. */
function drawing(page: Page) {
  return page.locator('figure[data-draw="scroll"]').evaluate((figure) => {
    const svg = [...figure.querySelectorAll<SVGSVGElement>('svg.visualization-diagram')].find(
      (candidate) => candidate.closest('[hidden]') === null,
    );
    if (svg === undefined) throw new Error('No visible view.');
    const paths = [...svg.querySelectorAll<SVGPathElement>('path[data-draw-from]')];
    const marker = svg.querySelector<SVGCircleElement>('[data-draw-marker]');
    const at = { x: Number(marker?.getAttribute('cx')), y: Number(marker?.getAttribute('cy')) };
    const nearest = paths.map((path) => {
      let best = Number.POSITIVE_INFINITY;
      const length = path.getTotalLength();
      for (let step = 0; step <= 100; step += 1) {
        const point = path.getPointAtLength((length * step) / 100);
        best = Math.min(best, Math.hypot(point.x - at.x, point.y - at.y));
      }
      return best;
    });
    const last = paths.at(-1);
    const end = last?.getPointAtLength(last.getTotalLength());
    return {
      driven: figure.hasAttribute('data-draw-driven'),
      offsets: paths.map((path) =>
        Number(getComputedStyle(path).strokeDashoffset.replace('px', '')),
      ),
      nearest,
      atEnd: end === undefined ? Number.NaN : Math.hypot(end.x - at.x, end.y - at.y),
    };
  });
}

test('a diagram draws without scroll timelines on the page clock, and its marker rides the edge being drawn', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, url, false);
  const figure = page.locator('figure[data-draw="scroll"]');

  // Прогресс по прокрутке: схема у нижнего края ещё не нарисована, посередине — нарисована частью.
  await figure.evaluate((element) =>
    window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - window.innerHeight),
  );
  await seek(page, 0.1);
  const before = await drawing(page);
  // Ловит: без временной шкалы схема стоит целиком — запасного пути нет.
  expect(before.driven).toBe(true);
  expect(before.offsets).toEqual([1, 1]);
  await figure.evaluate((element) =>
    window.scrollTo(
      0,
      element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55,
    ),
  );
  await seek(page, 0.2);
  const during = await drawing(page);
  expect(during.offsets[0]).toBeLessThan(1);

  // Прогресс записи ставит прорисовку точно: четверть — первая связь наполовину.
  await figure.evaluate((element) => element.setAttribute('data-clock-progress', '0.25'));
  await seek(page, 0.3);
  const quarter = await drawing(page);
  expect(quarter.offsets[0]).toBeCloseTo(0.5, 2);
  expect(quarter.offsets[1]).toBe(1);
  // Ловит: маркер стоит на месте или едет не по той связи, что рисуется.
  expect(quarter.nearest[0]).toBeLessThan(1.5);
  expect(quarter.atEnd).toBeGreaterThan(20);
  await figure.evaluate((element) => element.setAttribute('data-clock-progress', '1'));
  await seek(page, 0.4);
  const done = await drawing(page);
  expect(done.offsets).toEqual([0, 0]);
  expect(done.atEnd).toBeLessThan(1.5);
});

test('with a scroll timeline the stylesheet draws the diagram and the script leaves the edges alone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await openManual(page, url, true);
  await seek(page, 0.1);
  // Ловит: сценарий перехватывает прорисовку и там, где её уже ведёт таблица стилей.
  expect((await drawing(page)).driven).toBe(false);
});

test('without motion every edge is drawn, the marker stands at the end, the zoom is two figures and the chart is final', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openManual(page, url, false);
  await seek(page, 0.5);
  const still = await drawing(page);
  expect(still.driven).toBe(false);
  expect(still.offsets).toEqual([0, 0]);
  expect(still.atEnd).toBeLessThan(1.5);
  await expect(page.locator('.visualization-zoom')).toBeHidden();
  await expect(page.locator('.visualization-zoom-still')).toHaveCount(2);
  await expect(page.locator('.visualization-zoom-still').first()).toBeVisible();
  await page.locator('figure[data-count-up]').scrollIntoViewIfNeeded();
  await seek(page, 0.6);
  const heights = await page
    .locator('figure[data-count-up] .visualization-svg-wide .visualization-bar')
    .evaluateAll((bars) => bars.map((bar) => Number(bar.getAttribute('height'))));
  expect(heights[0]).toBeGreaterThan(100);
  // Маршрут импульсов отмечен без движения; точки импульса нет.
  await expect(page.locator('figure[data-pulse]')).not.toHaveAttribute('data-pulse-live', '');
});

test('a page that declares motion: none shows the zoom as two figures and the chart final without the reader asking', async ({
  page,
}, testInfo) => {
  // Ловит: сценарий схем и таблица стилей пролёта слушают только системную настройку и двигают
  // страницу `motion: none`. Сборка такой страницы с пролётом не соберёт, поэтому уровень ставится
  // на корень собранной страницы — проверяется браузерная половина обещания.
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const file = fileURLToPath(await buildPage(testInfo.project.name));
  const html = await readFile(file, 'utf8');
  const still = /data-motion-level="[^"]*"/u.test(html)
    ? html.replace(/data-motion-level="[^"]*"/u, 'data-motion-level="none"')
    : html.replace(/<html /u, '<html data-motion-level="none" ');
  const stillFile = file.replace(/page\.html$/u, 'page-none.html');
  await writeFile(stillFile, still);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, pathToFileURL(stillFile).href);
  await expect(page.locator('html')).toHaveAttribute('data-motion-level', 'none');
  await expect(page.locator('figure[data-zoom]')).not.toHaveAttribute('data-zoom-live', '');
  await expect(page.locator('.visualization-zoom')).toBeHidden();
  await expect(page.locator('.visualization-zoom-still').first()).toBeVisible();
  await page.locator('figure[data-count-up]').scrollIntoViewIfNeeded();
  await seek(page, 0.3);
  const heights = await page
    .locator('figure[data-count-up] .visualization-svg-wide .visualization-bar')
    .evaluateAll((bars) => bars.map((bar) => Number(bar.getAttribute('height'))));
  expect(heights[0]).toBeGreaterThan(100);
  await expect(page.locator('figure[data-pulse]')).not.toHaveAttribute('data-pulse-live', '');
});

test('the camera flies into the node by progress and the nested labels grow readable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, url);
  const figure = page.locator('figure[data-zoom]');
  await expect(figure).toHaveAttribute('data-zoom-live', '');
  await expect(page.locator('.visualization-zoom-static')).toBeHidden();
  const frame = async (progress: number) => {
    await figure.evaluate(
      (element, value) => element.setAttribute('data-clock-progress', String(value)),
      progress,
    );
    await seek(page, 1 + progress);
    return figure.evaluate((element) => {
      const camera = element.querySelector<SVGSVGElement>('.visualization-zoom-camera');
      const inner = camera?.querySelector('.visualization-zoom-inner text');
      const outer = camera?.querySelector('[data-zoom-target] text');
      return {
        box: (camera?.getAttribute('viewBox') ?? '').split(' ').map(Number),
        from: (camera?.dataset.zoomFrom ?? '').split(' ').map(Number),
        to: (camera?.dataset.zoomTo ?? '').split(' ').map(Number),
        inner: inner === null || inner === undefined ? -1 : Number(getComputedStyle(inner).opacity),
        outer: outer === null || outer === undefined ? -1 : Number(getComputedStyle(outer).opacity),
      };
    });
  };
  const start = await frame(0);
  expect(start.box).toEqual(start.from);
  // Ловит: подписи вложенного потока видны, пока они мельче читаемого.
  expect(start.inner).toBe(0);
  expect(start.outer).toBe(1);
  const middle = await frame(0.5);
  // Ловит: пролёт — масштаб с затуханием, а не движение кадра: ширина кадра не меняется по экспоненте.
  expect(middle.box[2]).toBeCloseTo(Math.sqrt((start.from[2] ?? 0) * (start.to[2] ?? 0)), 0);
  const end = await frame(1);
  for (const [index, value] of end.box.entries()) expect(value).toBeCloseTo(end.to[index] ?? 0, 1);
  expect(end.inner).toBe(1);
  expect(end.outer).toBe(0);

  // Без прогресса записи камеру ведёт прокрутка дорожки, пока картинка закреплена.
  await figure.evaluate((element) => element.removeAttribute('data-clock-progress'));
  const track = page.locator('.visualization-zoom');
  const top = await track.evaluate((element) => element.getBoundingClientRect().top + scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), top - 40);
  await seek(page, 3);
  const pinnedStart = await figure.evaluate((element) => element.dataset.zoomProgress);
  await page.evaluate((y) => window.scrollTo(0, y + window.innerHeight), top);
  await seek(page, 3.1);
  const pinnedLater = await figure.evaluate((element) => element.dataset.zoomProgress);
  expect(Number(pinnedLater)).toBeGreaterThan(Number(pinnedStart));
  await expect(page.locator('.visualization-zoom-camera')).toBeInViewport();
});

test('a zoom whose outer labels would start under 11 px stands as two figures instead of flying', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve(
    'test-results/e2e-diagrams-and-process',
    testInfo.project.name,
    'zoom-labels',
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'report.md'),
    [
      '---\ntitle: Zoom labels\nlanguage: en\n---\n\n# Zoom labels\n',
      '::::::section{title="Server" id="server"}',
      '::::diagram{title="Server" description="Readings travel to the server, which publishes and stores them."}',
      '::node{id="stations" label="Six stations"}\n::node{id="gateway" label="Radio gateway"}',
      '::node{id="server" label="Kestrel server"}\n::node{id="page" label="Harbour page"}\n::node{id="archive" label="Archive"}',
      '::edge{from="stations" to="gateway" label="every ten minutes" kind="data"}',
      '::edge{from="gateway" to="server" label="readings" kind="data"}',
      '::edge{from="server" to="page" label="publishes"}\n::edge{from="server" to="archive" label="stores"}',
      ':::zoom{node="server" title="Inside the server"}',
      '::node{id="intake" label="Intake"}\n::node{id="check" label="Quality check"}',
      '::edge{from="intake" to="check"}\n:::\n::::\n::::::\n',
    ].join('\n'),
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  const figure = page.locator('figure[data-zoom]');
  const edgeLabelPx = () =>
    figure.evaluate((element) => {
      const camera = element.querySelector<SVGSVGElement>('.visualization-zoom-camera');
      const from = (camera?.dataset.zoomFrom ?? '').split(' ').map(Number);
      return 13 * ((camera?.clientWidth ?? 0) / (from[2] ?? 1));
    });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, pathToFileURL(output).href);
  await expect(figure).toHaveAttribute('data-zoom-live', '');
  await page.setViewportSize({ width: 320, height: 800 });
  await openManual(page, pathToFileURL(output).href);
  // Ловит: на узкой дорожке камера стартует с подписями связей мельче 11 px, а пролёт всё равно идёт.
  await expect(figure).not.toHaveAttribute('data-zoom-live', '');
  await expect(page.locator('.visualization-zoom-still').first()).toBeVisible();
  // Контрпример в той же фигуре: на этой ширине начало пролёта действительно мельче читаемого.
  await figure.evaluate((element) => element.setAttribute('data-zoom-live', ''));
  expect(await edgeLabelPx()).toBeLessThan(11);
});

test('pulses run the route three times on the page clock and stop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await openManual(page, url);
  const figure = page.locator('figure[data-pulse]');
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => figure.getAttribute('data-pulse-live')).toBe(null);
  // Наблюдатель отзывается по настоящему времени; импульсы начинаются с момента часов, когда он отозвался.
  await page.waitForTimeout(200);
  const dot = async (seconds: number) => {
    await seek(page, seconds);
    return figure.evaluate((element) => {
      const svg = [...element.querySelectorAll<SVGSVGElement>('svg.visualization-diagram')].find(
        (candidate) => candidate.closest('[hidden]') === null,
      );
      const circle = svg?.querySelector('[data-pulse-dot]');
      return {
        live: element.hasAttribute('data-pulse-live'),
        at: [Number(circle?.getAttribute('cx')), Number(circle?.getAttribute('cy'))],
      };
    });
  };
  const first = await dot(0.2);
  const second = await dot(0.9);
  expect(first.live).toBe(true);
  // Ловит: точка стоит — импульсы не идут по часам страницы.
  expect(second.at).not.toEqual(first.at);
  const again = await dot(0.2 + 1.3);
  // Второй проход повторяет первый: время маршрута — функция часов.
  expect(again.at[0]).toBeCloseTo(first.at[0] ?? 0, 1);
  const over = await dot(10);
  // Ловит: импульсы идут без конца — непрерывное движение дольше пяти секунд без паузы.
  expect(over.live).toBe(false);
});

test('a beat lights a connection by its id without lighting its nodes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, url);
  await page.locator('#steps .semantic-beat').first().scrollIntoViewIfNeeded();
  await page
    .locator('#steps .semantic-beat')
    .first()
    .evaluate((beat) =>
      window.scrollTo(0, beat.getBoundingClientRect().top + scrollY - window.innerHeight / 2 + 20),
    );
  const svg = page.locator('#steps svg.visualization-diagram:visible');
  // Ловит: связь загорается только между горящими узлами, по имени — нет.
  await expect(svg.locator('[data-edge-id="handoff"]')).toHaveAttribute('data-lit', '');
  await expect(svg.locator('[data-from="second"][data-to="third"]')).not.toHaveAttribute(
    'data-lit',
    '',
  );
  await expect(svg.locator('[data-node-id="first"]')).not.toHaveAttribute('data-lit', '');
});

test('a chart grows from zero to its values on the page clock', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await openManual(page, url);
  const bars = page.locator('figure[data-count-up] .visualization-svg-wide .visualization-bar');
  const heights = () =>
    bars.evaluateAll((items) => items.map((bar) => Number(bar.getAttribute('height'))));
  // Ловит: график стоит в конечных значениях до того, как показался.
  expect(await heights()).toEqual([0, 0]);
  await page.locator('figure[data-count-up]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await seek(page, 0.3);
  const growing = await heights();
  await seek(page, 5);
  const final = await heights();
  expect(growing[0]).toBeGreaterThan(0);
  expect(growing[0]).toBeLessThan(final[0] ?? 0);
  // Пропорции сохраняются во время роста: столбцы растут от нуля одновременно.
  expect((growing[0] ?? 0) / (growing[1] ?? 1)).toBeCloseTo(2, 1);
  expect((final[0] ?? 0) / (final[1] ?? 1)).toBeCloseTo(2, 1);
});

test('a mini process stands in its line of text with its steps said in words', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildPage(testInfo.project.name);
  await page.goto(url);
  const process = page.locator('.semantic-process').first();
  const box = await process.boundingBox();
  const line = await process.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element.parentElement ?? element).fontSize),
  );
  // Ловит: знак раздувается до размера картинки или сжимается до точки.
  expect(box?.height ?? 0).toBeGreaterThan(line);
  expect(box?.height ?? 0).toBeLessThan(line * 2.2);
  // Ловит: кратность возврата «×2» набрана мельче 11 px, и её не прочесть.
  const count = await process.locator('.visualization-process-count').boundingBox();
  expect(count?.height ?? 0).toBeGreaterThanOrEqual(11);
  await expect(process.locator('.visually-hidden')).toHaveText(
    'Steps: Plan (done) → Build (done) → Review (in review) → Ship (not started); returned from Review to Build 2 times.',
  );
});
