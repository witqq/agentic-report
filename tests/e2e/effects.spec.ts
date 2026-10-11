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

test('closed disclosure bodies are absent from obstacle layers and return when opened', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('disclosure-obstacles'), 'live');
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'obstacle-visibility-fixture';
    fixture.innerHTML = `
      <style>#obstacle-pseudo::before {content:'Visible generated label';visibility:visible;display:block}</style>
      <details id="obstacle-disclosure">
        <summary><span id="obstacle-summary">Visible disclosure summary</span></summary>
        Direct closed disclosure text
        <pre><code id="obstacle-code">Hidden disclosure code</code><button id="obstacle-copy">Copy hidden code</button></pre>
        <details><summary><span id="obstacle-nested">Nested summary</span></summary></details>
        <button id="obstacle-pinned" style="position:sticky;top:0">Hidden pinned control</button>
      </details>
      <p id="obstacle-entrance" style="opacity:0">Entrance text retains its neutral obstacle</p>
      <div style="visibility:hidden"><p id="obstacle-visible-child" style="visibility:visible">Visible child overrides hidden parent</p></div>
      <p id="obstacle-hidden-override" hidden style="display:block!important">CSS overrides the hidden attribute</p>
      <div id="obstacle-contents" style="display:contents">Visible display contents text</div>
      <p id="obstacle-hidden-text" style="visibility:hidden">Hidden ordinary text</p>
      <p id="obstacle-pseudo" style="visibility:hidden">Hidden holder with visible generated label</p>
      <svg width="320" height="40"><text id="obstacle-svg" x="0" y="25"><tspan>Visible SVG diagram label</tspan></text></svg>
      <div style="content-visibility:hidden"><p id="obstacle-content-hidden">Content visibility hides this text</p></div>`;
    document.querySelector('main')?.append(fixture);
    const queue = window.__agenticReportEffects;
    if (queue === undefined || Array.isArray(queue))
      throw new Error('Effect engine is unavailable.');
    queue.push({
      name: 'visibility-probe',
      selector: 'body',
      ownsScroll: false,
      definition: {
        mount(ctx) {
          (window as unknown as { __obstacleMeasure: typeof ctx.measure }).__obstacleMeasure =
            ctx.measure;
          return { at() {} };
        },
      },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __obstacleMeasure?: unknown }).__obstacleMeasure !== undefined,
      ),
    )
    .toBe(true);
  const read = (open: boolean) =>
    page.evaluate((expanded) => {
      const disclosure = document.querySelector<HTMLDetailsElement>('#obstacle-disclosure');
      const engine = window.__agenticReportEffectEngine;
      if (disclosure === null || engine === undefined)
        throw new Error('Disclosure obstacle fixture or effect engine is absent.');
      disclosure.open = expanded;
      const layers = engine.obstacles();
      const measure = (
        window as unknown as {
          __obstacleMeasure: {
            lines(
              element: Element,
            ): readonly { x: number; y: number; width: number; height: number }[];
          };
        }
      ).__obstacleMeasure;
      const elementById = (id: string) => {
        const element = document.getElementById(id);
        if (element === null) throw new Error(`Obstacle fixture element is absent: ${id}`);
        return element;
      };
      const ownLines = (id: string) => measure.lines(elementById(id));
      const overlap = (
        id: string,
        rects: readonly { x: number; y: number; width: number; height: number }[],
      ) => {
        const element = elementById(id);
        const range = document.createRange();
        range.selectNodeContents(element);
        const boxes = [...range.getClientRects()];
        return rects.some((rect) =>
          boxes.some(
            (box) =>
              Math.min(rect.x + rect.width, box.right + scrollX) >
                Math.max(rect.x, box.left + scrollX) &&
              Math.min(rect.y + rect.height, box.bottom + scrollY) >
                Math.max(rect.y, box.top + scrollY),
          ),
        );
      };
      const copy = elementById('obstacle-copy').getBoundingClientRect();
      return {
        summary: overlap('obstacle-summary', layers.text),
        code: overlap('obstacle-code', layers.text),
        direct:
          JSON.stringify(ownLines('obstacle-disclosure')) !==
          JSON.stringify(ownLines('obstacle-summary')),
        nested: ownLines('obstacle-nested').length > 0,
        copy: overlap('obstacle-copy', layers.chrome),
        pinned: layers.pinned.some((entry) => entry.element.id === 'obstacle-pinned'),
        entrance: overlap('obstacle-entrance', layers.text),
        visibleChild: overlap('obstacle-visible-child', layers.text),
        overriddenHidden: overlap('obstacle-hidden-override', layers.text),
        contentHidden: overlap('obstacle-content-hidden', layers.text),
        displayContents: overlap('obstacle-contents', layers.text),
        hiddenText: ownLines('obstacle-hidden-text').length > 0,
        generatedLabel: ownLines('obstacle-pseudo').length > 0,
        svgLabel: ownLines('obstacle-svg').length > 0,
        hiddenBodyHasGeometry: copy.width > 0 && copy.height > 0,
      };
    }, open);
  for (const native of ['current', 'legacy', 'absent']) {
    if (native === 'legacy')
      await page.evaluate(() => {
        const check = Element.prototype.checkVisibility;
        Object.defineProperty(Element.prototype, 'checkVisibility', {
          configurable: true,
          // Models Chrome 111 accepting the method but ignoring its newer visibility option.
          value: function (this: Element) {
            return check.call(this);
          },
        });
      });
    if (native === 'absent')
      await page.evaluate(() => {
        Object.defineProperty(Element.prototype, 'checkVisibility', {
          configurable: true,
          value: undefined,
        });
      });
    const closed = await read(false);
    // Catches invisible native details descendants retaining positive boxes and punching false cuts.
    expect(closed.hiddenBodyHasGeometry).toBe(true);
    expect(closed).toMatchObject({
      summary: true,
      code: false,
      direct: false,
      nested: false,
      copy: false,
      pinned: false,
      entrance: true,
      visibleChild: true,
      overriddenHidden: true,
      contentHidden: false,
      displayContents: true,
      hiddenText: false,
      generatedLabel: true,
      svgLabel: true,
    });
    // Catches blanket removal of disclosure content and incompatibility when Safari lacks the native test.
    expect(await read(true)).toMatchObject({
      summary: true,
      code: true,
      direct: true,
      nested: true,
      copy: true,
      pinned: true,
      entrance: true,
      visibleChild: true,
      overriddenHidden: true,
      contentHidden: false,
      displayContents: true,
      hiddenText: false,
      generatedLabel: true,
      svgLabel: true,
    });
    expect(await read(false)).toEqual(closed);
  }
  await page.context().close();
});

test('text and control obstacles keep only visible overflow fragments on each axis', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const page = await openMode(browser, await buildMark('overflow-obstacles'), 'live');
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <style>#overflow-generated::before{content:'Generated label';display:block}</style>
      <div id="overflow-x" style="position:relative;width:140px;height:48px;border:3px solid;padding:4px;overflow:auto;white-space:nowrap">
        <span id="overflow-x-text">Visible text followed by a long invisible continuation in the neighboring track</span>
        <button id="overflow-control" style="position:absolute;left:180px;top:4px;width:80px">A control</button>
        <div id="overflow-generated" style="width:300px"></div>
      </div>
      <div id="overflow-y" style="width:220px;height:32px;overflow-x:hidden;overflow-y:auto;line-height:20px">
        <span id="overflow-y-text">First visible line<br>Second clipped line<br>Third invisible line</span>
      </div>
      <div id="overflow-visible" style="width:140px;height:32px;overflow:visible;white-space:nowrap">
        <span id="overflow-visible-text">Visible text followed by a long visible continuation in the neighboring track</span>
      </div>
      <div style="width:240px;height:32px;overflow:hidden;white-space:nowrap">
        <span id="overflow-entrance-text" data-reveal-pending style="display:inline-block;opacity:0;transform:translateX(-20px)">Neutral arrival</span>
      </div>`;
    document.querySelector('main')?.append(fixture);
    const queue = window.__agenticReportEffects;
    if (queue === undefined || Array.isArray(queue))
      throw new Error('Effect engine is unavailable.');
    queue.push({
      name: 'overflow-probe',
      selector: 'body',
      ownsScroll: false,
      definition: {
        mount(ctx) {
          (window as unknown as { __overflowMeasure: typeof ctx.measure }).__overflowMeasure =
            ctx.measure;
          return { at() {} };
        },
      },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __overflowMeasure?: unknown }).__overflowMeasure !== undefined,
      ),
    )
    .toBe(true);
  const read = () =>
    page.evaluate(() => {
      const measure = (
        window as unknown as {
          __overflowMeasure: {
            lines(
              element: Element,
            ): readonly { x: number; y: number; width: number; height: number }[];
          };
        }
      ).__overflowMeasure;
      const elementById = (id: string) => {
        const element = document.getElementById(id);
        if (element === null) throw new Error(`Overflow fixture element is absent: ${id}`);
        return element;
      };
      const lines = (id: string) => measure.lines(elementById(id));
      const viewport = (id: string) => {
        const element = elementById(id),
          r = element.getBoundingClientRect();
        return {
          left: r.left + scrollX + element.clientLeft,
          right: r.left + scrollX + element.clientLeft + element.clientWidth,
          top: r.top + scrollY + element.clientTop,
          bottom: r.top + scrollY + element.clientTop + element.clientHeight,
        };
      };
      const raw = (id: string) => {
        const range = document.createRange();
        range.selectNodeContents(elementById(id));
        return [...range.getClientRects()].map((r) => ({
          x: r.left + scrollX,
          y: r.top + scrollY,
          width: r.width,
          height: r.height,
        }));
      };
      const control = elementById('overflow-control').getBoundingClientRect();
      const engine = window.__agenticReportEffectEngine;
      if (engine === undefined) throw new Error('Overflow fixture effect engine is absent.');
      const chrome = engine
        .obstacles()
        .chrome.filter(
          (r) =>
            r.x < control.right + scrollX &&
            r.x + r.width > control.left + scrollX &&
            r.y < control.bottom + scrollY &&
            r.y + r.height > control.top + scrollY,
        );
      return {
        x: lines('overflow-x-text'),
        y: lines('overflow-y-text'),
        generated: lines('overflow-generated'),
        visible: lines('overflow-visible-text'),
        rawX: raw('overflow-x-text'),
        rawY: raw('overflow-y-text'),
        rawVisible: raw('overflow-visible-text'),
        entrance: lines('overflow-entrance-text'),
        rawEntrance: raw('overflow-entrance-text'),
        boxX: viewport('overflow-x'),
        boxY: viewport('overflow-y'),
        chrome,
      };
    });
  const assertClipped = (state: Awaited<ReturnType<typeof read>>) => {
    // Catches invisible Range tails punching canvas cuts beyond a real scroll/clip viewport.
    for (const [fragments, bounds] of [
      [state.x, state.boxX],
      [state.y, state.boxY],
      [state.generated, state.boxX],
    ] as const) {
      expect(fragments.length).toBeGreaterThan(0);
      for (const rect of fragments) {
        expect(rect.x).toBeGreaterThanOrEqual(bounds.left - 0.01);
        expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.right + 0.01);
        expect(rect.y).toBeGreaterThanOrEqual(bounds.top - 0.01);
        expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.bottom + 0.01);
      }
    }
    // Visible overflow still owns its complete lines; a blanket parent-box clamp is incorrect.
    expect(state.visible).toEqual(state.rawVisible);
    // Clipping keeps the established neutral-entrance contract, not only its temporarily visible slice.
    expect(state.entrance).toEqual(state.rawEntrance.map((rect) => ({ ...rect, x: rect.x + 20 })));
  };
  const before = await read();
  expect(before.rawX.some((r) => r.x + r.width > before.boxX.right)).toBe(true);
  expect(before.rawY.some((r) => r.y + r.height > before.boxY.bottom)).toBe(true);
  assertClipped(before);
  expect(before.chrome).toEqual([]);
  await page.evaluate(() => {
    const horizontal = document.getElementById('overflow-x');
    const vertical = document.getElementById('overflow-y');
    if (horizontal === null || vertical === null)
      throw new Error('Overflow fixture scroll containers are absent.');
    horizontal.scrollLeft = 120;
    vertical.scrollTop = 20;
  });
  const after = await read();
  assertClipped(after);
  expect(after.rawX[0]?.x).not.toBe(before.rawX[0]?.x);
  expect(after.rawY[0]?.y).not.toBe(before.rawY[0]?.y);
  expect(after.chrome.length).toBeGreaterThan(0);
  expect(
    after.chrome.every((r) => r.x >= after.boxX.left && r.x + r.width <= after.boxX.right),
  ).toBe(true);
  await page.context().close();
});
