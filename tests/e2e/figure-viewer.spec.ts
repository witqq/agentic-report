import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Схемы, которые удобно смотреть на телефоне и на компьютере: просмотр во весь экран для схемы, графика и
 * широкой таблицы; на узкой дорожке последовательность становится списком шагов, флоу встаёт узким видом
 * сверху вниз, а пролёт внутрь узла, который не дорос бы до читаемых подписей, остаётся двумя фигурами.
 */
const SOURCE = [
  '---',
  'title: Figures',
  '---',
  '',
  '# Figures',
  '',
  ':::diagram{title="Wide flow" description="Three sources feed one checker." layout="right"}',
  '::node{id="schema" label="Schema file" detail="loaded once"}',
  '::node{id="csv" label="Orders export" detail="2 GB on disk"}',
  '::node{id="api" label="Pricing service" detail="live prices"}',
  '::node{id="reader" label="Stream reader" detail="a piece at a time"}',
  '::node{id="checker" label="Row checker" detail="each value against its rule"}',
  '::node{id="report" label="Terminal report" detail="row, column, value, rule"}',
  '::edge{from="csv" to="reader" label="bytes" kind="data"}',
  '::edge{from="reader" to="checker" label="one row" kind="data"}',
  '::edge{from="schema" to="checker" label="column rules" kind="data"}',
  '::edge{from="api" to="checker" label="current prices"}',
  '::edge{from="checker" to="report" label="row 14, column price: -3.50 is below 0"}',
  ':::',
  '',
  ':::diagram{title="Request sequence" description="A request passes five parties." type="sequence"}',
  '::node{id="browser" label="Browser"}',
  '::node{id="gateway" label="Gateway"}',
  '::node{id="auth" label="Auth service"}',
  '::node{id="orders" label="Orders service"}',
  '::node{id="store" label="Order store"}',
  '::edge{from="browser" to="gateway" label="POST /orders with the basket"}',
  '::edge{from="gateway" to="auth" label="check the session token"}',
  '::edge{from="gateway" to="orders" label="create the order"}',
  '::edge{from="orders" to="orders" label="price every line"}',
  '::edge{from="orders" to="store" label="insert the order row"}',
  ':::',
  '',
  '::::diagram{title="Service zoom" description="The API is a flow of its own." direction="down"}',
  '::node{id="client" label="Client"}',
  '::node{id="api" label="API"}',
  '::node{id="db" label="Store"}',
  '::edge{from="client" to="api"}',
  '::edge{from="api" to="db"}',
  ':::zoom{node="api" title="Inside the API"}',
  '::node{id="router" label="Router"}',
  '::node{id="guard" label="Guard"}',
  '::node{id="handler" label="Handler"}',
  '::node{id="writer" label="Writer"}',
  '::edge{from="router" to="guard" label="request"}',
  '::edge{from="guard" to="handler" label="allowed"}',
  '::edge{from="handler" to="writer" label="rows"}',
  ':::',
  '::::',
  '',
  '::::diagram{title="Platform zoom" description="The compiler is a long pipeline of its own." layout="right"}',
  '::node{id="author" label="Author"}',
  '::node{id="compiler" label="Compiler"}',
  '::node{id="page" label="Page"}',
  '::node{id="reader" label="Reader"}',
  '::edge{from="author" to="compiler"}',
  '::edge{from="compiler" to="page"}',
  '::edge{from="page" to="reader"}',
  ':::zoom{node="compiler" title="Inside the compiler"}',
  '::node{id="parse" label="Parse Markdown"}',
  '::node{id="validate" label="Validate directives"}',
  '::node{id="layout" label="Lay out diagrams"}',
  '::node{id="render" label="Render the page"}',
  '::node{id="bundle" label="Bundle the runtime"}',
  '::edge{from="parse" to="validate" label="syntax tree"}',
  '::edge{from="validate" to="layout" label="typed graph"}',
  '::edge{from="layout" to="render" label="placed views"}',
  '::edge{from="render" to="bundle" label="document"}',
  ':::',
  '::::',
  '',
  '| Quarter | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| Q1 | 1000000.00 | 1012345.01 | 1024690.02 | 1037035.03 | 1049380.04 | 1061725.05 | 1074070.06 | 1086415.07 | 1098760.08 | 1111105.09 | 1123450.10 | 1135795.11 |',
  '| Q2 | 1000000.00 | 1012345.01 | 1024690.02 | 1037035.03 | 1049380.04 | 1061725.05 | 1074070.06 | 1086415.07 | 1098760.08 | 1111105.09 | 1123450.10 | 1135795.11 |',
  '',
].join('\n');

async function buildPage(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-figure-viewer', project);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.md'), SOURCE);
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  return pathToFileURL(output).href;
}

/** Самый мелкий текст видимых рисунков фигуры на экране, в пикселях. */
function smallestText(figure: Locator): Promise<number> {
  return figure.evaluate((root) => {
    const sizes = [...root.querySelectorAll<SVGTextElement>('svg text')]
      .filter((text) => text.getBoundingClientRect().width > 0)
      .map(
        (text) =>
          Number.parseFloat(getComputedStyle(text).fontSize) * (text.getScreenCTM()?.a ?? 1),
      );
    return sizes.length === 0 ? Number.NaN : Math.min(...sizes);
  });
}

function stage(page: Page): Promise<{ scale: number; transform: string }> {
  return page.locator('[data-figure-viewer]').evaluate((dialog) => ({
    scale: Number((dialog as HTMLElement).dataset.viewerScale),
    transform: dialog.querySelector<HTMLElement>('[data-viewer-stage]')?.style.transform ?? '',
  }));
}

test('the viewer opens a diagram full screen, zooms, pans, closes on Escape and returns focus', async ({
  page,
}, testInfo) => {
  await page.goto(await buildPage(`${testInfo.project.name}-viewer`));
  const figure = page.locator('figure[data-diagram-type="flow"]').first();
  const open = figure.locator('[data-figure-open]');
  await open.scrollIntoViewIfNeeded();
  await open.click();
  const dialog = page.locator('[data-figure-viewer]');
  await expect(dialog).toBeVisible();
  // Ловит: просмотр показывает не ту же схему — копию полного рисунка выбранного вида.
  await expect(dialog.locator('svg [data-node-id="checker"]')).toHaveCount(1);
  await expect(dialog.locator('[data-viewer-viewport]')).toBeFocused();
  const box = await dialog.locator('[data-viewer-viewport]').boundingBox();
  const viewport = page.viewportSize();
  // Во весь экран на обоих проектах, а не окошко посреди страницы.
  expect(box?.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);

  const fitted = await stage(page);
  await dialog.locator('[data-viewer-zoom-in]').click();
  const zoomed = await stage(page);
  expect(zoomed.scale).toBeCloseTo(fitted.scale * 1.4, 3);
  // SVG перерисован под масштаб (размер, а не преобразование): подпись крупнее на экране.
  const labelHeight = () =>
    dialog
      .locator('svg text')
      .first()
      .evaluate((text) => text.getBoundingClientRect().height);
  const before = await labelHeight();
  await page.keyboard.press('+');
  expect(await labelHeight()).toBeGreaterThan(before * 1.3);
  await page.keyboard.press('-');
  await page.keyboard.press('0');
  expect((await stage(page)).scale).toBeCloseTo(fitted.scale, 3);

  // Перетаскивание сдвигает рисунок, стрелка тоже.
  const centre = {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 30, centre.y + 20, { steps: 4 });
  await page.mouse.up();
  const dragged = await stage(page);
  expect(dragged.transform).not.toBe(fitted.transform);
  await page.keyboard.press('ArrowLeft');
  expect((await stage(page)).transform).not.toBe(dragged.transform);

  // Ctrl + прокрутка — щипок трекпада — приближает вокруг указателя.
  await page.mouse.move(centre.x, centre.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  expect((await stage(page)).scale).toBeGreaterThan(fitted.scale);

  // Фокус заперт в диалоге.
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.activeElement?.closest('[data-figure-viewer]') !== null),
  ).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('a table wider than its track and a sequence get the viewer', async ({ page }, testInfo) => {
  await page.goto(await buildPage(`${testInfo.project.name}-table`));
  const sequence = page.locator('figure[data-diagram-type="sequence"]');
  await sequence.locator('[data-figure-open]').click();
  // Последовательность в просмотре — рисунок, даже когда на странице она показана списком.
  await expect(page.locator('[data-figure-viewer] svg.visualization-sequence')).toBeVisible();
  await page.keyboard.press('Escape');
  // Кнопка у таблицы есть, пока таблица шире своей дорожки; на телефоне эта таблица меняет раскладку и
  // помещается, на компьютере её двенадцать столбцов шире колонки.
  const bar = page.locator('.figure-viewer-bar');
  // Таблица прокручивает себя сама: её поверхность по её ширине, рамка только задаёт дорожку.
  const scroller = page.locator('.table-frame > table');
  const overflowing = await scroller.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  if (!overflowing) {
    await expect(bar).toBeHidden();
    return;
  }
  await expect(bar).toBeVisible();
  await bar.locator('[data-figure-open]').click();
  await expect(page.locator('[data-viewer-stage] table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bar.locator('[data-figure-open]')).toBeFocused();
});

test('on a phone a sequence becomes a list of steps and the diagram in words is open', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto(await buildPage(`${testInfo.project.name}-sequence`));
  const figure = page.locator('figure[data-diagram-type="sequence"]');
  await expect(figure).toHaveAttribute('data-diagram-form', 'list');
  await expect(figure.locator('.visualization-frame')).toBeHidden();
  const steps = figure.locator('[data-sequence-list] ol > li');
  await expect(steps).toHaveCount(5);
  await expect(steps.first()).toHaveText('Browser → Gateway: POST /orders with the basket');
  await expect(steps.nth(3)).toHaveText('Orders service, inside itself: price every line');
  await expect(figure.locator('[data-sequence-list] ul > li')).toHaveText([
    'Browser',
    'Gateway',
    'Auth service',
    'Orders service',
    'Order store',
  ]);
  // Список и есть слова последовательности: «схема словами» её не повторяет открытой.
  expect(
    await figure
      .locator('details.visualization-transcript')
      .evaluate((d) => (d as HTMLDetailsElement).open),
  ).toBe(false);
  const flow = page.locator('figure[data-diagram-type="flow"]').first();
  expect(
    await flow
      .locator('details.visualization-transcript')
      .evaluate((d) => (d as HTMLDetailsElement).open),
  ).toBe(true);
});

test('on a desktop a sequence stays a drawing and the diagram in words stays closed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(await buildPage(`${testInfo.project.name}-sequence`));
  const figure = page.locator('figure[data-diagram-type="sequence"]');
  await expect(figure).toHaveAttribute('data-diagram-form', 'drawing');
  await expect(figure.locator('[data-sequence-list]')).toBeHidden();
  expect(await smallestText(figure)).toBeGreaterThanOrEqual(11);
  expect(
    await figure
      .locator('details.visualization-transcript')
      .evaluate((d) => (d as HTMLDetailsElement).open),
  ).toBe(false);
});

test('on a phone a wide flow stands in its narrow top-down view with labels of 11px or more', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto(await buildPage(`${testInfo.project.name}-flow`));
  const figure = page.locator('figure[data-diagram-type="flow"]').first();
  const panel = figure.locator('[data-tab-panel]:not([hidden])');
  await expect(panel).toHaveAttribute('data-layout-view', 'down');
  await expect(panel).toHaveAttribute('data-diagram-form', 'compact');
  await expect(panel.locator('svg[data-diagram-compact]')).toBeVisible();
  // Ловит: схема ужата под колонку мельче читаемого или прокручивается вбок.
  expect(await smallestText(figure)).toBeGreaterThanOrEqual(10.95);
  const frame = panel.locator('.visualization-frame');
  expect(await frame.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1,
  );
  // Полный рисунок остаётся в просмотре.
  await figure.locator('[data-figure-open]').click();
  await expect(page.locator('[data-viewer-stage] > svg')).toHaveCount(1);
  await expect(page.locator('[data-viewer-stage] > svg[data-diagram-compact]')).toHaveCount(0);
});

/** Подпись вложенного потока на экране в конце пролёта, в пикселях. */
function zoomEnd(figure: Locator): Promise<number> {
  return figure.evaluate((element) => {
    const camera = element.querySelector<SVGSVGElement>('.visualization-zoom-camera');
    const to = (camera?.dataset.zoomTo ?? '').split(' ').map(Number);
    return (14 * Number(camera?.dataset.zoomScale) * (camera?.clientWidth ?? 0)) / (to[2] ?? 1);
  });
}

test('a zoom into a top-down diagram grows its inner labels readable on a phone and a desktop', async ({
  page,
}, testInfo) => {
  await page.goto(await buildPage(`${testInfo.project.name}-zoom-down`));
  const figure = page.locator('figure[data-zoom]').first();
  // Ловит: камера в высокой схеме сверху вниз приближала широкий вложенный поток в полтора раза, и его
  // подписи так и не становились читаемыми.
  await expect(figure).toHaveAttribute('data-zoom-live', '');
  expect(await zoomEnd(figure)).toBeGreaterThanOrEqual(11);
});

test('a zoom that would end unreadable on a phone stands as two readable figures', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto(await buildPage(`${testInfo.project.name}-zoom-wide`));
  const figure = page.locator('figure[data-zoom]').nth(1);
  await expect(figure).toHaveAttribute('data-zoom-unreadable', '');
  await expect(figure).not.toHaveAttribute('data-zoom-live', '');
  const stills = figure.locator('.visualization-zoom-static .visualization-zoom-panel');
  await expect(stills).toHaveCount(2);
  await expect(figure.locator('.visualization-zoom-static')).toBeVisible();
  // Две фигуры стоят друг под другом, и подписи обеих не мельче 11 px.
  const [first, second] = await stills.evaluateAll((panels) =>
    panels.map((panel) => panel.getBoundingClientRect().top),
  );
  expect(second).toBeGreaterThan(first ?? 0);
  expect(await smallestText(figure.locator('.visualization-zoom-static'))).toBeGreaterThanOrEqual(
    10.95,
  );
  await figure.locator('[data-figure-open]').click();
  await expect(page.locator('[data-viewer-stage] > svg')).toHaveCount(2);
});
