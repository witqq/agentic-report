import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

/**
 * Замер витрины движения при четырёхкратном замедлении процессора: во время прокрутки нет длинных
 * задач дольше 50 мс, а кадровая частота остаётся близкой к частоте экрана. Числа прогона пишутся в
 * `test-results/artifacts/motion-performance.json`.
 */
// Запись видео и трассы снимает каждый кадр и сама создаёт длинные задачи при замедленном
// процессоре: замер производительности идёт без них.
test.use({ video: 'off', trace: 'off' });

test('the motion showcase scrolls without long tasks under a 4x slower CPU', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    pathToFileURL(path.resolve('test-results/e2e-generated/motion-showcase.html')).href,
  );
  await page.evaluate(() => document.fonts.ready);
  // Замер — о прокрутке: подготовка WebGL при загрузке (декодирование текстуры, компиляция шейдера)
  // идёт до него и считается работой загрузки, а не прокрутки.
  await expect(page.locator('img[data-webgl]')).toHaveAttribute('data-webgl-state', 'live');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  // A 20 ms frame budget means different things on a 60 Hz runner and a 120 Hz workstation. Measure
  // the browser's median refresh interval before throttling; a fast individual tick is not its
  // refresh period. Compare the scroll against that interval.
  const refreshMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const intervals: number[] = [];
        let last = 0;
        const sample = (now: number): void => {
          if (last !== 0) intervals.push(now - last);
          last = now;
          if (intervals.length < 60) requestAnimationFrame(sample);
          else {
            intervals.sort((a, b) => a - b);
            resolve(intervals[Math.floor(intervals.length / 2)] ?? 0);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const store = {
      longTasks: [] as { start: number; duration: number }[],
      frames: [] as { at: number; interval: number; scrollY: number }[],
      last: 0,
      running: true,
    };
    Reflect.set(globalThis, '__perf', store);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        store.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
    }).observe({ type: 'longtask', buffered: false });
    const tick = (now: number): void => {
      if (store.last !== 0)
        store.frames.push({ at: now, interval: now - store.last, scrollY: window.scrollY });
      store.last = now;
      if (store.running) requestAnimationFrame(tick);
    };
    window.__agenticReportEffectEngine?.resetTimings();
    requestAnimationFrame(tick);
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 120) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  const result = await page.evaluate(() => {
    const store = Reflect.get(globalThis, '__perf') as {
      longTasks: { start: number; duration: number }[];
      frames: { at: number; interval: number; scrollY: number }[];
      running: boolean;
    };
    store.running = false;
    const frames = [...store.frames].sort((a, b) => a.interval - b.interval);
    const locate = (at: number): number => {
      const frame = store.frames.find((sample) => sample.at >= at);
      return frame?.scrollY ?? store.frames.at(-1)?.scrollY ?? 0;
    };
    const sectionTops = [...document.querySelectorAll<HTMLElement>('article > section[id]')].map(
      (section) => section.getBoundingClientRect().top + scrollY,
    );
    const sectionIndexAt = (y: number): number => {
      for (let index = sectionTops.length - 1; index >= 0; index -= 1)
        if ((sectionTops[index] ?? Number.POSITIVE_INFINITY) <= y + innerHeight / 2) return index;
      return -1;
    };
    return {
      longest: Math.max(0, ...store.longTasks.map((task) => task.duration)),
      longTasks: store.longTasks.length,
      p95: frames[Math.floor(frames.length * 0.95)]?.interval ?? 0,
      mean: frames.reduce((sum, frame) => sum + frame.interval, 0) / Math.max(1, frames.length),
      frames: frames.length,
      longTaskDetails: store.longTasks.map((task) => ({
        ...task,
        scrollY: locate(task.start),
        sectionIndex: sectionIndexAt(locate(task.start)),
      })),
      slowFrameDetails: frames.slice(-10).map((frame) => ({
        ...frame,
        sectionIndex: sectionIndexAt(frame.scrollY),
      })),
      effectTimings: window.__agenticReportEffectEngine?.status().map((effect) => ({
        live: effect.render === 'live',
        rebuilds: effect.rebuilds,
        loopGuard: effect.loopGuard,
        longestMs: effect.longestMs,
      })),
    };
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await testInfo.attach('motion-performance', {
    body: JSON.stringify({ ...result, refreshMs }, null, 2),
    contentType: 'application/json',
  });
  await mkdir(path.resolve('test-results/artifacts'), { recursive: true });
  await writeFile(
    path.resolve('test-results/artifacts/motion-performance.json'),
    JSON.stringify({ ...result, refreshMs }, null, 2),
  );
  expect(result.frames).toBeGreaterThan(50);
  expect(refreshMs).toBeGreaterThan(0);
  expect(result.longest).toBeLessThanOrEqual(50);
  // One missed refresh can happen at either display rate; sustained half-rate rendering cannot.
  expect(result.p95).toBeLessThanOrEqual(refreshMs * 2.2);
  expect(result.mean).toBeLessThanOrEqual(refreshMs * 1.25);
});

test('scrolling far from a diagram skips its SVG work and entering it resumes drawing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    pathToFileURL(path.resolve('test-results/e2e-generated/motion-showcase.html')).href,
  );
  const offscreen = await page.evaluate(async () => {
    const figure = document.querySelector<HTMLElement>('figure[data-draw="scroll"]');
    if (figure === null) throw new Error('The motion showcase has no scroll-drawn diagram.');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = figure.getBoundingClientRect();
    if (box.top <= innerHeight * 2)
      throw new Error('The diagram must start far below the viewport.');

    const calls = { drawing: 0, length: 0, point: 0, geometryMs: 0 };
    Reflect.set(globalThis, '__diagramCalls', calls);
    const toggle = figure.toggleAttribute.bind(figure);
    figure.toggleAttribute = (name, force) => {
      if (name === 'data-draw-driven') calls.drawing += 1;
      return toggle(name, force);
    };
    const length = SVGGeometryElement.prototype.getTotalLength;
    SVGGeometryElement.prototype.getTotalLength = function () {
      calls.length += 1;
      const started = performance.now();
      try {
        return length.call(this);
      } finally {
        calls.geometryMs += performance.now() - started;
      }
    };
    const point = SVGGeometryElement.prototype.getPointAtLength;
    SVGGeometryElement.prototype.getPointAtLength = function (distance) {
      calls.point += 1;
      const started = performance.now();
      try {
        return point.call(this, distance);
      } finally {
        calls.geometryMs += performance.now() - started;
      }
    };
    scrollTo({ top: 120, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...calls, scrollY };
  });
  await testInfo.attach('offscreen-diagram-work', {
    body: JSON.stringify(offscreen, null, 2),
    contentType: 'application/json',
  });
  expect(offscreen.drawing).toBe(0);
  expect(offscreen.length).toBe(0);
  expect(offscreen.point).toBe(0);

  const onscreen = await page.evaluate(async () => {
    const figure = document.querySelector<HTMLElement>('figure[data-draw="scroll"]');
    if (figure === null) throw new Error('The diagram disappeared.');
    const calls = Reflect.get(globalThis, '__diagramCalls') as {
      drawing: number;
      length: number;
      point: number;
      geometryMs: number;
    };
    calls.drawing = 0;
    calls.length = 0;
    calls.point = 0;
    calls.geometryMs = 0;
    scrollTo({
      top: figure.getBoundingClientRect().top + scrollY - innerHeight / 2,
      behavior: 'instant',
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...calls };
  });
  expect(onscreen.drawing).toBeGreaterThan(0);
  expect(onscreen.length).toBeGreaterThan(0);
  expect(onscreen.point).toBeGreaterThan(0);
});
