import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../../dist/node/page-clock.js';
import { expect, test } from './fixtures.js';

/**
 * A reference WebGL effect must draw both variants and preserve the image under still/static/print. A
 * transparent canvas, a 2D-only implementation, or two variants that paint the same marks fail the pixel
 * and mode assertions. Its effect-check contract, which includes a timed budget, runs in
 * `tests/perf/reference-effect-checks.spec.ts`.
 */
const root = path.resolve('test-results/e2e-focus-frame');
const extension = path.resolve('extensions/focus-frame');

async function example(name: 'field' | 'workshop'): Promise<string> {
  await mkdir(root, { recursive: true });
  const output = path.join(root, `${name}.html`);
  await buildReport({ input: path.join(extension, `example-${name}.md`), output });
  return pathToFileURL(output).href;
}

async function pixels(page: import('@playwright/test').Page, progress: number) {
  return page.evaluate((value) => {
    const host = document.querySelector<HTMLElement>('[data-effect-focus-frame-focus-frame]');
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.effect-layer canvas[data-effect="focus-frame"]',
    );
    if (host === null || canvas === null) throw new Error('Focus frame did not mount.');
    host.dataset.clockProgress = String(value);
    window.__clock?.seek(2);
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('Cannot inspect effect pixels.');
    context.drawImage(canvas, 0, 0);
    const rgba = context.getImageData(0, 0, copy.width, copy.height).data;
    let count = 0;
    let rightmost = -1;
    let first: readonly number[] | undefined;
    for (let index = 0; index < rgba.length; index += 4) {
      if ((rgba[index + 3] ?? 0) < 128) continue;
      count += 1;
      rightmost = Math.max(rightmost, (index / 4) % copy.width);
      first ??= [rgba[index] ?? 0, rgba[index + 1] ?? 0, rgba[index + 2] ?? 0];
    }
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    return {
      kind: canvas.classList.contains('webgl-canvas') ? 'webgl' : '2d',
      count,
      first,
      right: rightmost < 0 ? undefined : (rightmost + 1) / ratio,
      imageRight: host.querySelector('img')?.getBoundingClientRect().right,
      imageVisible: host.querySelector('img')?.getClientRects().length === 1,
    };
  }, progress);
}

test.describe.configure({ timeout: 180_000 });

test('trace and corners draw distinct WebGL marks from the page clock and theme', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  await page.goto(await example('field'));
  await page.locator('[data-effect-focus-frame-focus-frame]').scrollIntoViewIfNeeded();
  const empty = await pixels(page, 0);
  const traced = await pixels(page, 1);
  expect(empty).toMatchObject({ kind: 'webgl', count: 0, imageVisible: true });
  expect(traced.count).toBeGreaterThan(1000);
  expect(traced.first).toBeDefined();
  await page.evaluate(() => {
    document.documentElement.dataset.scheme = 'dark';
  });
  await expect.poll(async () => (await pixels(page, 1)).first).not.toEqual(traced.first);

  await page.goto(await example('workshop'));
  await page.locator('[data-effect-focus-frame-focus-frame]').scrollIntoViewIfNeeded();
  const corners = await pixels(page, 1);
  expect(corners).toMatchObject({ kind: 'webgl', imageVisible: true });
  expect(corners.count).toBeGreaterThan(100);
  expect(corners.count * 3).toBeLessThan(traced.count);
});

test('frame follows an image whose intrinsic size changes after effect mount', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const output = path.join(root, 'late-directory');
  await rm(output, { recursive: true, force: true });
  await buildReport({
    input: path.join(extension, 'example-field.md'),
    output,
    format: 'directory',
  });
  const url = pathToFileURL(path.join(output, 'index.html')).href;
  await writeFile(
    path.join(output, 'late-image.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#ccddee"/></svg>',
  );
  await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  await page.goto(url);
  await page.locator('[data-effect-focus-frame-focus-frame] img').scrollIntoViewIfNeeded();
  const before = await pixels(page, 1);
  expect(before.kind).toBe('webgl');
  expect(Math.abs((before.right ?? 0) - (before.imageRight ?? 0))).toBeLessThan(6);

  const loadedWidth = await page.evaluate(async () => {
    const image = document.querySelector<HTMLImageElement>(
      '[data-effect-focus-frame-focus-frame] img',
    );
    if (image === null) throw new Error('The image is missing.');
    image.src = new URL('./late-image.svg', location.href).href;
    await image.decode();
    return image.naturalWidth;
  });
  expect(loadedWidth).toBe(240);
  const after = await pixels(page, 1);
  expect((before.imageRight ?? 0) - (after.imageRight ?? 0)).toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const frame = await pixels(page, 1);
      return Math.abs((frame.right ?? 0) - (frame.imageRight ?? 0));
    })
    .toBeLessThan(6);
});

test('missing or lost WebGL uses the same 2D geometry, and still/print keep the image', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const url = await example('field');
  const lostWebgl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await lostWebgl.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  const lostPage = await lostWebgl.newPage();
  const unexpectedErrors: string[] = [];
  lostPage.on('pageerror', (error) => unexpectedErrors.push(error.message));
  lostPage.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !/^\[agentic-report\] effect "focus-frame" failed: Effect requested a fallback\.$/u.test(
        message.text(),
      )
    )
      unexpectedErrors.push(message.text());
  });
  await lostPage.goto(url);
  await lostPage.locator('[data-effect-focus-frame-focus-frame]').scrollIntoViewIfNeeded();
  expect(await pixels(lostPage, 1)).toMatchObject({ kind: 'webgl', imageVisible: true });
  await lostPage.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.effect-layer canvas[data-effect="focus-frame"]',
    );
    const context = canvas?.getContext('webgl');
    if (context === null || context === undefined) throw new Error('No WebGL context to lose.');
    const loss = context.getExtension('WEBGL_lose_context');
    if (loss === null) throw new Error('The browser cannot simulate context loss.');
    loss.loseContext();
  });
  await expect
    .poll(() =>
      lostPage.evaluate(
        () =>
          window.__agenticReportEffectEngine?.status().find((entry) => entry.name === 'focus-frame')
            ?.render,
      ),
    )
    .toBe('static');
  expect(await pixels(lostPage, 1)).toMatchObject({ kind: '2d', imageVisible: true });
  expect(unexpectedErrors).toEqual([]);
  await lostWebgl.close();

  const noWebgl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await noWebgl.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      options?: unknown,
    ) {
      if (kind === 'webgl') return null;
      return original.call(this, kind as '2d', options as CanvasRenderingContext2DSettings);
    } as typeof original;
    window.__agenticReportClock = 'manual';
  });
  const staticPage = await noWebgl.newPage();
  await staticPage.goto(url);
  await staticPage.locator('[data-effect-focus-frame-focus-frame]').scrollIntoViewIfNeeded();
  expect(await pixels(staticPage, 0)).toMatchObject({ kind: '2d', count: 0, imageVisible: true });
  expect((await pixels(staticPage, 1)).count).toBeGreaterThan(1000);
  await expect
    .poll(() =>
      staticPage.evaluate(
        () =>
          window.__agenticReportEffectEngine?.status().find((entry) => entry.name === 'focus-frame')
            ?.render,
      ),
    )
    .toBe('static');
  await noWebgl.close();

  const still = await browser.newContext({ reducedMotion: 'reduce' });
  await still.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  const stillPage = await still.newPage();
  await stillPage.goto(url);
  await stillPage.locator('[data-effect-focus-frame-focus-frame]').scrollIntoViewIfNeeded();
  expect(await pixels(stillPage, 0)).toMatchObject({ kind: '2d', imageVisible: true });
  expect((await pixels(stillPage, 0)).count).toBeGreaterThan(1000);
  await stillPage.emulateMedia({ media: 'print' });
  expect(
    await stillPage.locator('.effect-layer').evaluate((layer) => getComputedStyle(layer).display),
  ).toBe('none');
  await expect(stillPage.getByAltText(/survey sketch showing a curving shore/u)).toBeVisible();
  await still.close();
});
