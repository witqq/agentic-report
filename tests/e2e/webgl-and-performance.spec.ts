import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * WebGL-нити в трёх режимах — есть контекст, нет контекста (так же ведёт себя слабая видеокарта:
 * контекст с большой потерей производительности не создаётся) и уменьшенное движение — в обоих
 * форматах через `file://`; и замер витрины движения при четырёхкратном замедлении процессора.
 */
async function buildThreads(
  project: string,
  format: 'single-file' | 'directory',
  before = false,
): Promise<string> {
  const root = path.resolve('test-results/e2e-webgl', project, format);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source'), { recursive: true });
  await writeFile(
    path.join(root, 'source', 'plane.jpg'),
    await readFile(path.resolve('examples/motion-showcase/assets/richat.jpg')),
  );
  await writeFile(
    path.join(root, 'source', 'report.md'),
    [
      '---',
      'title: Threads',
      'language: en',
      '---',
      '',
      '# Threads',
      '',
      ...(before
        ? [
            '::::section{title="Before" id="before"}',
            ...Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}.\n`),
            '::::',
            '',
          ]
        : []),
      '::::section{title="Unweave" id="unweave" media-effect="threads"}',
      '![A red mineral plane](plane.jpg)',
      '::::',
      '',
      '::::section{title="After" id="after"}',
      ...Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of space below.\n`),
      '::::',
    ].join('\n'),
  );
  const output = path.join(root, format === 'directory' ? 'site' : 'page.html');
  await buildReport({ input: path.join(root, 'source'), output, format });
  return pathToFileURL(format === 'directory' ? path.join(output, 'index.html') : output).href;
}

test('an offscreen threads image clears its texture prewarm and leaves the canvas idle', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    const original = WebGLRenderingContext.prototype.clear;
    WebGLRenderingContext.prototype.clear = function (this: WebGLRenderingContext, mask: number) {
      const root = document.documentElement;
      root.dataset.threadsClearCount = String(Number(root.dataset.threadsClearCount ?? 0) + 1);
      original.call(this, mask);
    };
  });
  await page.goto(await buildThreads(`${testInfo.project.name}-offscreen`, 'single-file', true));
  await expect(page.locator('img[data-webgl]')).toHaveAttribute('data-webgl-state', 'live');
  const initial = await page.evaluate(() => ({
    top: document.querySelector('img[data-webgl]')?.getBoundingClientRect().top,
    clears: Number(document.documentElement.dataset.threadsClearCount ?? 0),
  }));
  expect(initial.top).toBeGreaterThan(900);
  expect(initial.clears).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => Number(document.documentElement.dataset.threadsClearCount ?? 0)),
  ).toBe(initial.clears);
});

test('a visible intact threads image uses native pixels without updating the WebGL surface', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    const calls = { clear: 0, draw: 0 };
    Reflect.set(globalThis, '__threadsCalls', calls);
    const clear = WebGLRenderingContext.prototype.clear;
    WebGLRenderingContext.prototype.clear = function (mask) {
      calls.clear += 1;
      clear.call(this, mask);
    };
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (mode, first, count) {
      calls.draw += 1;
      draw.call(this, mode, first, count);
    };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    await buildThreads(`${testInfo.project.name}-native-handoff`, 'single-file', true),
  );
  await expect(page.locator('img[data-webgl]')).toHaveAttribute('data-webgl-state', 'live');
  const before = await page.evaluate(async () => {
    const image = document.querySelector<HTMLImageElement>('img[data-webgl]');
    if (image === null) throw new Error('No threads image.');
    const imageTop = image.getBoundingClientRect().top + scrollY;
    scrollTo({ top: imageTop - 300, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const calls = Reflect.get(globalThis, '__threadsCalls') as { clear: number; draw: number };
    return { imageTop, height: image.getBoundingClientRect().height, ...calls };
  });
  expect(await webglState(page)).toMatchObject({ active: false, imageVisible: true });
  await page.evaluate(async () => {
    scrollBy({ top: 120, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await page.evaluate(() => Reflect.get(globalThis, '__threadsCalls'))).toMatchObject({
    clear: before.clear,
    draw: before.draw,
  });

  await page.evaluate(async ({ imageTop, height }) => {
    scrollTo({ top: imageTop + height * 0.5, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, before);
  expect(await webglState(page)).toMatchObject({ active: true, imageVisible: false });
  const active = await page.evaluate(
    () => Reflect.get(globalThis, '__threadsCalls') as { clear: number; draw: number },
  );
  expect(active.clear).toBeGreaterThan(before.clear);
  expect(active.draw).toBeGreaterThan(before.draw);

  await page.evaluate(async (imageTop) => {
    scrollTo({ top: imageTop - 300, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, before.imageTop);
  expect(await webglState(page)).toMatchObject({ active: false, imageVisible: true });
  const restored = await page.evaluate(
    () => Reflect.get(globalThis, '__threadsCalls') as { clear: number; draw: number },
  );
  expect(restored.clear).toBeGreaterThan(active.clear);
  expect(restored.draw).toBe(active.draw);
  await page.evaluate(async () => {
    scrollBy({ top: 40, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await page.evaluate(() => Reflect.get(globalThis, '__threadsCalls'))).toMatchObject(
    restored,
  );
});

async function webglState(page: Page) {
  return page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('img[data-webgl]');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.webgl-canvas');
    const flat = document.querySelector<HTMLCanvasElement>(
      'canvas.effect-canvas:not(.webgl-canvas)',
    );
    // Непрозрачность 2D-холста в середине картинки: нити без WebGL действительно нарисованы.
    let flatPainted = false;
    let flatAnyPainted = false;
    if (flat !== null && image !== null) {
      const box = image.getBoundingClientRect();
      const ratio = flat.width / document.documentElement.clientWidth;
      const context = flat.getContext('2d');
      const pixel = context?.getImageData(
        Math.round((box.left + box.width / 2) * ratio),
        Math.round((box.top + box.height / 2) * ratio),
        1,
        1,
      ).data;
      flatPainted = (pixel?.[3] ?? 0) > 200;
      const left = Math.max(0, Math.floor(box.left * ratio));
      const top = Math.max(0, Math.floor(box.top * ratio));
      const right = Math.min(flat.width, Math.ceil(box.right * ratio));
      const bottom = Math.min(flat.height, Math.ceil(box.bottom * ratio));
      if (context !== null && right > left && bottom > top) {
        const pixels = context.getImageData(left, top, right - left, bottom - top).data;
        for (let index = 3; index < pixels.length; index += 4)
          if ((pixels[index] ?? 0) > 0) {
            flatAnyPainted = true;
            break;
          }
      }
    }
    return {
      render: document.documentElement.dataset.render,
      state: image?.dataset.webglState,
      active: image?.hasAttribute('data-webgl-active') ?? false,
      canvas: canvas !== null,
      flatCanvas: flat !== null,
      flatPainted,
      flatAnyPainted,
      progress: canvas?.dataset.progress,
      imageVisible: image !== null && getComputedStyle(image).visibility === 'visible',
    };
  });
}

for (const format of ['single-file', 'directory'] as const) {
  test(`${format} threads unweave with WebGL and start from the still image`, async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(await buildThreads(testInfo.project.name, format));
    await expect.poll(async () => (await webglState(page)).state).toBe('live');
    expect(await webglState(page)).toMatchObject({
      canvas: true,
      progress: '0.000',
      active: false,
      imageVisible: true,
    });
    const nativeImage = await page.locator('img[data-webgl]').screenshot();
    const withoutEffect = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await withoutEffect.addInitScript(() => {
      window.__agenticReportEffectsOff = true;
    });
    await withoutEffect.goto(page.url());
    await expect
      .poll(() =>
        withoutEffect
          .locator('img[data-webgl]')
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    expect(await withoutEffect.locator('img[data-webgl]').screenshot()).toEqual(nativeImage);
    await withoutEffect.close();
    await page.evaluate(() => {
      const image = document.querySelector('img[data-webgl]');
      if (image === null) throw new Error('Missing image');
      window.scrollBy(
        0,
        image.getBoundingClientRect().top + image.getBoundingClientRect().height * 0.5,
      );
    });
    await expect.poll(async () => Number((await webglState(page)).progress)).toBeGreaterThan(0.2);
    expect(await webglState(page)).toMatchObject({ active: true, imageVisible: false });
    await page.emulateMedia({ media: 'print' });
    expect(await webglState(page)).toMatchObject({ imageVisible: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(async () => (await webglState(page)).progress).toBe('0.000');
    expect(await webglState(page)).toMatchObject({ active: false, imageVisible: true });
    expect(await page.locator('img[data-webgl]').screenshot()).toEqual(nativeImage);
  });
}

test('a lost WebGL context clears the native-image handoff before the 2D fallback paints', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(await buildThreads(`${testInfo.project.name}-context-loss`, 'single-file'));
    await expect(page.locator('img[data-webgl]')).toHaveAttribute('data-webgl-state', 'live');
    await page.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>('img[data-webgl]');
      if (image === null) throw new Error('No threads image.');
      const box = image.getBoundingClientRect();
      scrollTo({ top: box.top + scrollY + box.height * 0.5, behavior: 'instant' });
    });
    await expect.poll(async () => (await webglState(page)).active).toBe(true);
    await page.evaluate(async () => {
      const engine = window.__agenticReportEffectEngine;
      if (engine === undefined) throw new Error('No effect engine.');
      for (let index = 0; index < 8; index += 1) {
        engine.rebuildAll('test-loop-guard');
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            window.__agenticReportEffectEngine?.status().find((effect) => effect.name === 'threads')
              ?.loopGuard,
        ),
      )
      .toBeGreaterThan(0);
    expect(await webglState(page)).toMatchObject({ state: 'live', active: true });
    const restoredOnLoss = await page.evaluate(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.webgl-canvas');
      const extension = canvas?.getContext('webgl')?.getExtension('WEBGL_lose_context');
      if (canvas === null || extension === null || extension === undefined)
        throw new Error('Cannot simulate WebGL context loss.');
      const restored = new Promise<{
        active: boolean;
        imageVisible: boolean;
        state: string | undefined;
      }>((resolve) =>
        canvas.addEventListener(
          'webglcontextlost',
          () => {
            const image = document.querySelector<HTMLImageElement>('img[data-webgl]');
            resolve({
              active: image?.hasAttribute('data-webgl-active') ?? false,
              imageVisible: image !== null && getComputedStyle(image).visibility === 'visible',
              state: image?.dataset.webglState,
            });
          },
          { once: true },
        ),
      );
      extension.loseContext();
      return restored;
    });
    expect(restoredOnLoss.active).toBe(false);
    if (restoredOnLoss.state === '2d') expect(restoredOnLoss.imageVisible).toBe(false);
    else expect(restoredOnLoss.imageVisible).toBe(true);
    await expect.poll(async () => (await webglState(page)).state).toBe('2d');
    expect(await webglState(page)).toMatchObject({
      active: false,
      flatCanvas: true,
      flatAnyPainted: true,
      imageVisible: false,
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await page.close();
  }
});

/**
 * Без WebGL нити рисует 2D-холст из той же геометрии (`static`), а не одна неподвижная картинка: дефект —
 * страница без WebGL показывает только исходную картинку. При уменьшенном движении (`still`) холста нет и
 * картинка целая: дефект — нити идут за прокруткой у читателя, попросившего меньше движения.
 */
test('without a WebGL context or on a weak GPU threads draw in 2D, with reduced motion the image stays still', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildThreads(`${testInfo.project.name}-fallback`, 'single-file');
  // Контекста нет вовсе.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      if (args[0] === 'webgl') return null;
      return (original as (...values: unknown[]) => unknown).apply(this, args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto(url);
  await expect.poll(async () => (await webglState(page)).state).toBe('2d');
  expect(await webglState(page)).toMatchObject({
    render: 'static',
    canvas: false,
    flatCanvas: true,
    flatPainted: true,
    imageVisible: false,
  });

  // Слабая видеокарта: контекст с большой потерей производительности браузер не отдаёт.
  const weak = await browser.newPage();
  await weak.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const options = args[1] as { failIfMajorPerformanceCaveat?: boolean } | undefined;
      if (args[0] === 'webgl' && options?.failIfMajorPerformanceCaveat === true) return null;
      return (original as (...values: unknown[]) => unknown).apply(this, args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await weak.goto(url);
  await expect.poll(async () => (await webglState(weak)).state).toBe('2d');
  expect(await webglState(weak)).toMatchObject({
    render: 'static',
    canvas: false,
    flatPainted: true,
  });
  await weak.close();

  const reduced = await browser.newPage();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.goto(url);
  await expect.poll(async () => (await webglState(reduced)).state).toBe('static');
  expect(await webglState(reduced)).toMatchObject({
    render: 'still',
    canvas: false,
    flatCanvas: false,
    imageVisible: true,
  });
  await reduced.close();
});

test('threads draw at high precision, no denser than 1.5 on a phone, and give up on slow frames', async ({
  page,
  browser,
}, testInfo) => {
  const url = await buildThreads(`${testInfo.project.name}-policy`, 'single-file');
  await page.goto(url);
  await expect.poll(async () => (await webglState(page)).state).toBe('live');
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.webgl-canvas');
    return { precision: canvas?.dataset.precision, ratio: Number(canvas?.dataset.pixelRatio) };
  });
  expect(drawn.precision).toBe('highp');
  if (testInfo.project.name === 'mobile-chromium') expect(drawn.ratio).toBeLessThanOrEqual(1.5);
  else expect(drawn.ratio).toBeLessThanOrEqual(2);

  if (testInfo.project.name !== 'desktop-chromium') return;
  // Медленная видеокарта: каждый кадр «длится» 40 мс — плотность снижается, затем картинка замирает.
  const slow = await browser.newPage();
  await slow.addInitScript(() => {
    let now = 0;
    performance.now = () => {
      now += 40;
      return now;
    };
  });
  await slow.goto(url);
  await slow.evaluate(async () => {
    for (let step = 0; step < 12; step += 1) {
      window.scrollBy(0, 40);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
  });
  await expect.poll(async () => (await webglState(slow)).state).toBe('static-slow');
  expect(await webglState(slow)).toMatchObject({ canvas: false, imageVisible: true });
  await slow.close();
});
