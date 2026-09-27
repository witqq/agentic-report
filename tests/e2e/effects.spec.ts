import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Browser, Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../../dist/node/page-clock.js';
import { expect, test } from './fixtures.js';

/**
 * Движок эффектов на образцовом эффекте уровня 2 `margin-mark` (tests/fixtures/effects/margin-mark): холст и DOM-деталь,
 * три режима отрисовки из одной геометрии, детерминизм по часам страницы, декор мимо текста, состояния
 * во всех режимах и цвет из токенов темы.
 */

const FIXTURE = path.resolve('tests/fixtures/effects/margin-mark');

async function buildMark(variant: string, effect?: string): Promise<string> {
  const root = path.resolve('test-results/e2e-effects', variant);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await cp(FIXTURE, root, { recursive: true });
  if (effect !== undefined) await writeFile(path.join(root, 'effect.mjs'), effect);
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'example-essay.md'), output });
  return pathToFileURL(output).href;
}

type Mode = 'live' | 'still' | 'static';

async function openMode(browser: Browser, url: string, mode: Mode): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: mode === 'still' ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  if (mode === 'static') await page.addInitScript(`window.__agenticReportRender = 'static';`);
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('.mark-badge').length))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const host = document.querySelector('[data-effect-margin-mark-mark]');
    host?.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForTimeout(50);
  await seek(page, 5);
  return page;
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((time) => window.__clock?.seek(time), seconds);
}

/** Геометрия меток, режим корня, состояния хостов и то, нарисовано ли кольцо на холсте. */
async function markState(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas.effect-canvas[data-effect="margin-mark"]',
    );
    const paint = canvas?.getContext('2d');
    const headings = [...document.querySelectorAll('[data-effect-margin-mark-mark] h2')];
    const badges = [...document.querySelectorAll<HTMLElement>('.mark-badge')].map(
      (badge, index) => {
        const box = badge.getBoundingClientRect();
        const head = headings[index]?.getBoundingClientRect();
        // Верхняя точка кольца: там оно нарисовано в любом режиме, где нарисовано вообще.
        const pixel = paint?.getImageData(
          Math.round(box.left + box.width / 2 - 1),
          Math.round(box.top + 1),
          3,
          3,
        ).data;
        const alpha =
          pixel === undefined
            ? 0
            : Math.max(...[3, 7, 11, 15, 19, 23, 27, 31, 35].map((i) => pixel[i] ?? 0));
        return {
          // Место метки у её заголовка: живой режим добавляет в поток кнопку паузы непрерывного
          // движения (WCAG 2.2.2), и главы ниже неё сдвигаются вместе с метками.
          offset: [
            Math.round(box.left - (head?.left ?? 0)),
            Math.round(box.top - (head?.top ?? 0)),
          ],
          drawn: alpha > 128,
          colour: pixel === undefined ? [] : [...pixel.slice(16, 19)],
        };
      },
    );
    const hosts = [...document.querySelectorAll('[data-effect-margin-mark-mark]')].map((host) =>
      [...host.attributes]
        .map((attribute) => attribute.name)
        .filter((name) => name.startsWith('data-state-'))
        .sort(),
    );
    return { render: document.documentElement.dataset.render, badges, hosts };
  });
}

test('live, still and static draw the same marks from one geometry and set the same states', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildMark('modes');
  const states: Record<Mode, Awaited<ReturnType<typeof markState>>> = {} as never;
  for (const mode of ['live', 'still', 'static'] as const) {
    const page = await openMode(browser, url, mode);
    states[mode] = await markState(page);
    await page.context().close();
  }
  // Ловит: движок не отражает режим на корне, и страница не знает, как она нарисована.
  expect([states.live.render, states.still.render, states.static.render]).toEqual([
    'live',
    'still',
    'static',
  ]);
  // Ловит: режимы считают геометрию по-разному — метка без движения стоит не там, где живая.
  expect(states.still.badges.map((badge) => badge.offset)).toEqual(
    states.live.badges.map((badge) => badge.offset),
  );
  expect(states.static.badges.map((badge) => badge.offset)).toEqual(
    states.live.badges.map((badge) => badge.offset),
  );
  // Ловит: режим без движения или без WebGL не рисует итог — читатель видит пустое место.
  for (const mode of ['live', 'still', 'static'] as const)
    expect(
      states[mode].badges.every((badge) => badge.drawn),
      mode,
    ).toBe(true);
  // Ловит: состояния (`data-state-*`) ставятся только в живом режиме.
  expect(states.live.hosts[0]).toEqual([
    'data-state-mark',
    'data-state-placed',
    'data-state-reached',
  ]);
  expect(states.still.hosts).toEqual(states.live.hosts);
  expect(states.static.hosts).toEqual(states.live.hosts);
});

test('two seeks to one moment give byte-identical pictures, and another moment a different one', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('seek'), 'live');
  await seek(page, 0.4);
  const early = await page.screenshot();
  await seek(page, 5);
  await seek(page, 0.4);
  const earlyAgain = await page.screenshot();
  await seek(page, 5);
  const late = await page.screenshot();
  // Ловит: кольцо рисуется своим временем, а не часами страницы.
  expect(earlyAgain.equals(early)).toBe(true);
  // Ловит: перемотка ничего не двигает, и совпадение снимков ничего не доказывает.
  expect(late.equals(early)).toBe(false);
  await page.context().close();
});

/** Площадь пересечения меток со строками текста страницы на экране. */
async function coverage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const lines: DOMRect[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '' || node.parentElement?.closest('.effect-layer'))
        continue;
      range.selectNodeContents(node);
      lines.push(...range.getClientRects());
    }
    let area = 0;
    for (const badge of document.querySelectorAll('.mark-badge')) {
      const box = badge.getBoundingClientRect();
      for (const line of lines) {
        const x = Math.min(box.right, line.right) - Math.max(box.left, line.left);
        const y = Math.min(box.bottom, line.bottom) - Math.max(box.top, line.top);
        if (x > 0 && y > 0) area += x * y;
      }
    }
    return area;
  });
}

test('marks are placed in free regions and never on text, at wide and narrow widths', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('text'), 'live');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    await seek(page, 5);
    // Ловит: декор ложится на строки текста.
    expect(await coverage(page), `${width} px`).toBe(0);
  }
  await page.context().close();
  // Контрпример: метка, поставленная на заголовок, закрывает текст — проверка его видит.
  const planted = await openMode(
    browser,
    await buildMark(
      'text-planted',
      "import { defineEffect } from 'agentic-report/effect';\nimport { createMark } from './mark.mjs';\nexport default defineEffect(createMark({ placement: 'on-heading' }));\n",
    ),
    'live',
  );
  expect(await coverage(planted)).toBeGreaterThan(0);
  await planted.context().close();
});

test('a theme switch recolours the canvas through the tokens', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('theme'), 'live');
  const accent = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      document.body.append(probe);
      const channels = (getComputedStyle(probe).color.match(/[\d.]+/gu) ?? []).map(Number);
      probe.remove();
      return channels.slice(0, 3);
    });
  const light = (await markState(page)).badges[0]?.colour;
  expect(light).toEqual(await accent());
  await page.evaluate(() => {
    document.documentElement.dataset.scheme = 'dark';
  });
  await page.waitForTimeout(50);
  await seek(page, 5.5);
  const dark = (await markState(page)).badges[0]?.colour;
  // Ловит: цвет прочитан один раз и не следует за сменой схемы, или записан в коде эффекта.
  expect(dark).toEqual(await accent());
  expect(dark).not.toEqual(light);
  await page.context().close();
});

test('width resize rebuilds before drawing and resets only the changed canvas dimension', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(await buildMark('resize-order'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('.mark-badge').length))
    .toBe(2);
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-effect="margin-mark"]');
    if (canvas === null) throw new Error('The mark canvas is missing.');
    const counts = { width: 0, height: 0 };
    const draws: Array<{ rebuilds: number; width: number; height: number }> = [];
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('The mark canvas has no 2D context.');
    for (const dimension of ['width', 'height'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dimension);
      if (descriptor?.get === undefined || descriptor.set === undefined)
        throw new Error(`Cannot observe canvas ${dimension}.`);
      Object.defineProperty(canvas, dimension, {
        configurable: true,
        get: () => descriptor.get?.call(canvas),
        set: (value: number) => {
          counts[dimension] += 1;
          descriptor.set?.call(canvas, value);
        },
      });
    }
    const clear = context.clearRect.bind(context);
    context.clearRect = (...args) => {
      draws.push({
        rebuilds:
          window.__agenticReportEffectEngine?.status().find((item) => item.name === 'margin-mark')
            ?.rebuilds ?? -1,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      clear(...args);
    };
    (
      window as unknown as {
        __canvasResizeProbe: { counts: typeof counts; draws: typeof draws };
      }
    ).__canvasResizeProbe = { counts, draws };
    return (
      window.__agenticReportEffectEngine?.status().find((item) => item.name === 'margin-mark')
        ?.rebuilds ?? -1
    );
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__agenticReportEffectEngine?.status().find((item) => item.name === 'margin-mark')
            ?.rebuilds,
      ),
    )
    .toBeGreaterThan(before);
  const widthChange = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __canvasResizeProbe: {
          counts: { width: number; height: number };
          draws: Array<{ rebuilds: number; width: number; height: number }>;
        };
      }
    ).__canvasResizeProbe;
    return { ...probe.counts, draws: [...probe.draws] };
  });
  expect(widthChange.width).toBeGreaterThan(0);
  expect(widthChange.height).toBe(0);
  const resizedDraws = widthChange.draws.filter((draw) => draw.width === 768);
  expect(resizedDraws.length).toBeGreaterThan(0);
  expect(
    resizedDraws.every((draw) => draw.rebuilds > before),
    JSON.stringify(widthChange),
  ).toBe(true);

  await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __canvasResizeProbe: {
          counts: { width: number; height: number };
          draws: Array<{ rebuilds: number; width: number; height: number }>;
        };
      }
    ).__canvasResizeProbe;
    probe.counts.width = 0;
    probe.counts.height = 0;
    probe.draws.length = 0;
  });
  await page.setViewportSize({ width: 768, height: 850 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __canvasResizeProbe: {
                draws: Array<{ rebuilds: number; width: number; height: number }>;
              };
            }
          ).__canvasResizeProbe.draws.filter((draw) => draw.width === 768 && draw.height === 850)
            .length,
      ),
    )
    .toBeGreaterThan(0);
  const heightChange = await page.evaluate(() => {
    const probe = (
      window as unknown as { __canvasResizeProbe: { counts: { width: number; height: number } } }
    ).__canvasResizeProbe;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-effect="margin-mark"]');
    return { ...probe.counts, canvasHeight: canvas?.height };
  });
  expect(heightChange.width).toBe(0);
  expect(heightChange.height).toBeGreaterThan(0);
  expect(heightChange.canvasHeight).toBe(850);
  await page.close();
});

test('a queued rebuild of one effect cannot resume another at stale width', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(await buildMark('resize-interleaved'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => {
    const observations: Array<{ viewport: number; geometry: number }> = [];
    let requestHeightRebuild = (): void => {
      throw new Error('The first effect has not mounted.');
    };
    const queue = window.__agenticReportEffects;
    if (queue === undefined || Array.isArray(queue))
      throw new Error('Effect engine is unavailable.');
    queue.push({
      name: 'height-probe',
      selector: 'body',
      ownsScroll: false,
      definition: {
        continuous: false,
        mount(ctx) {
          requestHeightRebuild = () => ctx.rebuild('height');
          return { at() {}, rebuild() {} };
        },
      },
    });
    queue.push({
      name: 'width-probe',
      selector: 'body',
      ownsScroll: false,
      definition: {
        mount(ctx) {
          let geometry = ctx.layout.width;
          return {
            at() {
              observations.push({ viewport: window.innerWidth, geometry });
            },
            rebuild() {
              geometry = ctx.layout.width;
            },
          };
        },
      },
    });
    (
      window as unknown as {
        __resizeRaceProbe: {
          observations: typeof observations;
          requestHeightRebuild: () => void;
        };
      }
    ).__resizeRaceProbe = { observations, requestHeightRebuild: () => requestHeightRebuild() };
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__agenticReportEffectEngine?.status().find((item) => item.name === 'width-probe')
            ?.hosts,
      ),
    )
    .toBe(1);
  await page.evaluate(() => window.__agenticReportEffectEngine?.pause('resize-race-test'));
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __resizeRaceProbe: {
          observations: Array<{ viewport: number; geometry: number }>;
          requestHeightRebuild: () => void;
          frames?: Array<{ handle: number; callback: FrameRequestCallback }>;
          resizeWidths?: number[];
        };
      }
    ).__resizeRaceProbe;
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    let nextHandle = -1;
    const frames: Array<{ handle: number; callback: FrameRequestCallback }> = [];
    probe.frames = frames;
    probe.resizeWidths = [];
    window.requestAnimationFrame = (callback) => {
      const handle = nextHandle--;
      frames.push({ handle, callback });
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      if (handle < 0) {
        const index = frames.findIndex((frame) => frame.handle === handle);
        if (index >= 0) frames.splice(index, 1);
      } else nativeCancel(handle);
    };
    window.addEventListener('resize', () => {
      probe.resizeWidths?.push(window.innerWidth);
    });
    probe.observations.length = 0;
    probe.requestHeightRebuild();
    window.dispatchEvent(new Event('scroll'));
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __resizeRaceProbe: { resizeWidths?: number[] } }
        ).__resizeRaceProbe.resizeWidths?.includes(768),
      ),
    )
    .toBe(true);
  const outcome = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __resizeRaceProbe: {
          frames: Array<{ handle: number; callback: FrameRequestCallback }>;
          observations: Array<{ viewport: number; geometry: number }>;
        };
      }
    ).__resizeRaceProbe;
    const initialFrames = probe.frames.length;
    let flushed = 0;
    while (probe.frames.length > 0 && flushed < 40) {
      probe.frames.shift()?.callback(performance.now());
      flushed += 1;
      const rebuilt = window.__agenticReportEffectEngine
        ?.status()
        .find((item) => item.name === 'width-probe')?.rebuilds;
      if (
        rebuilt !== undefined &&
        rebuilt > 0 &&
        probe.observations.some((item) => item.viewport === 768)
      )
        break;
    }
    return { initialFrames, flushed, observations: probe.observations };
  });
  const resized = outcome.observations.filter((item) => item.viewport === 768);
  expect(outcome.initialFrames).toBeGreaterThanOrEqual(3);
  expect(resized.length).toBeGreaterThan(0);
  expect(
    resized.every((item) => item.geometry === 768),
    JSON.stringify(resized),
  ).toBe(true);

  const beforeSecond = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __resizeRaceProbe: { observations: Array<{ viewport: number; geometry: number }> };
      }
    ).__resizeRaceProbe;
    probe.observations.length = 0;
    return (
      window.__agenticReportEffectEngine?.status().find((item) => item.name === 'width-probe')
        ?.rebuilds ?? 0
    );
  });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __resizeRaceProbe: { resizeWidths?: number[] } }
        ).__resizeRaceProbe.resizeWidths?.includes(1024),
      ),
    )
    .toBe(true);
  const final = await page.evaluate((previous) => {
    const probe = (
      window as unknown as {
        __resizeRaceProbe: {
          frames: Array<{ handle: number; callback: FrameRequestCallback }>;
          observations: Array<{ viewport: number; geometry: number }>;
        };
      }
    ).__resizeRaceProbe;
    for (let step = 0; probe.frames.length > 0 && step < 40; step += 1) {
      probe.frames.shift()?.callback(performance.now());
      const rebuilt = window.__agenticReportEffectEngine
        ?.status()
        .find((item) => item.name === 'width-probe')?.rebuilds;
      if (
        rebuilt !== undefined &&
        rebuilt > previous &&
        probe.observations.some((item) => item.viewport === 1024)
      )
        break;
    }
    return probe.observations.filter((item) => item.viewport === 1024);
  }, beforeSecond);
  expect(final.length).toBeGreaterThan(0);
  expect(
    final.every((item) => item.geometry === 1024),
    JSON.stringify(final),
  ).toBe(true);
  await page.close();
});

test('pinned elements are their own obstacle layer, so the page layers do not depend on the scroll', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('pinned'), 'live');
  // A sticky note with text inside the content: at the top of the page it stands in the flow, further
  // down it sticks to the top of the window, so its place in page coordinates follows the scroll.
  await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const note = document.createElement('p');
    note.id = 'pinned-note';
    note.style.cssText = 'position: sticky; top: 0';
    note.textContent = 'A pinned note that follows the reader down the page';
    main.prepend(note);
    const spacer = document.createElement('div');
    spacer.style.height = '2400px';
    main.append(spacer);
  });
  const layers = (top: number) =>
    page.evaluate((scroll) => {
      window.scrollTo({ top: scroll, behavior: 'instant' });
      const found = window.__agenticReportEffectEngine?.obstacles();
      const rounded = (rects: readonly { x: number; y: number; width: number; height: number }[]) =>
        rects.map((rect) =>
          [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value)).join(','),
        );
      return {
        text: rounded(found?.text ?? []),
        chrome: rounded(found?.chrome ?? []),
        pinned: (found?.pinned ?? []).map((entry) => entry.element.id).filter(Boolean),
        pinnedTop: Math.round(
          (found?.pinned ?? []).find((entry) => entry.element.id === 'pinned-note')?.rect.y ?? -1,
        ),
      };
    }, top);
  const atTop = await layers(0);
  const below = await layers(900);
  // Ловит: закреплённый элемент не отдан отдельным слоем, и эффект не может вырезать его из рисунка.
  expect(atTop.pinned).toContain('pinned-note');
  expect(below.pinned).toContain('pinned-note');
  // Слой закреплённых — в координатах окна: внизу страницы заметка прилипла к верху окна.
  expect(below.pinnedTop).toBe(0);
  // Ловит: строки текста закреплённого элемента в слое текста страницы — тогда их место на странице
  // зависит от прокрутки в момент замера, и маршрут декора расходится между пересборками.
  expect(below.text).toEqual(atTop.text);
  expect(below.chrome).toEqual(atTop.chrome);
  await page.context().close();
});
