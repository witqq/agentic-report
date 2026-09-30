import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from '../e2e/fixtures.js';

interface LongFrameSample {
  readonly start: number;
  readonly duration: number;
  readonly blockingMs: number;
  readonly preRenderMs: number | null;
  readonly renderTailMs: number | null;
  readonly styleLayoutTailMs: number | null;
  readonly scriptCount: number;
  readonly scriptMs: number;
  readonly forcedStyleLayoutMs: number;
}

/**
 * Замер витрины движения при четырёхкратном замедлении процессора: во время прокрутки нет длинных
 * задач дольше 50 мс, а кадровая частота остаётся близкой к частоте экрана. Числа прогона пишутся в
 * `test-results/artifacts/motion-performance.json`.
 */
// Запись видео и трассы снимает каждый кадр и сама создаёт длинные задачи при замедленном
// процессоре: замер производительности идёт без них.
test.use({ video: 'off', trace: 'off' });

const showcase = path.resolve('test-results/perf/motion-showcase.html');

test.beforeAll(async () => {
  await buildReport({ input: path.resolve('examples/motion-showcase'), output: showcase });
});

test('the motion showcase scrolls without long tasks under a 4x slower CPU', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(showcase).href);
  await page.evaluate(() => document.fonts.ready);
  // Дождаться шрифтов и начальной геометрии до начала замера прокрутки.
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
      longFrames: [] as LongFrameSample[],
      longFrameSupported: PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'),
      longFrameObserver: null as PerformanceObserver | null,
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
    const recordLongFrame = (raw: PerformanceEntry): void => {
      const entry = raw as PerformanceEntry & {
        readonly blockingDuration: number;
        readonly renderStart: number;
        readonly styleAndLayoutStart: number;
        readonly scripts: readonly {
          readonly duration: number;
          readonly forcedStyleAndLayoutDuration: number;
        }[];
      };
      const end = entry.startTime + entry.duration;
      store.longFrames.push({
        start: entry.startTime,
        duration: entry.duration,
        blockingMs: entry.blockingDuration,
        preRenderMs:
          entry.renderStart > 0 ? Math.max(0, entry.renderStart - entry.startTime) : null,
        renderTailMs: entry.renderStart > 0 ? Math.max(0, end - entry.renderStart) : null,
        styleLayoutTailMs:
          entry.styleAndLayoutStart > 0 ? Math.max(0, end - entry.styleAndLayoutStart) : null,
        scriptCount: entry.scripts.length,
        scriptMs: entry.scripts.reduce((sum, script) => sum + script.duration, 0),
        forcedStyleLayoutMs: entry.scripts.reduce(
          (sum, script) => sum + script.forcedStyleAndLayoutDuration,
          0,
        ),
      });
    };
    if (store.longFrameSupported) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) recordLongFrame(entry);
      });
      observer.observe({ type: 'long-animation-frame', buffered: false });
      store.longFrameObserver = observer;
    }
    Reflect.set(globalThis, '__recordLongFrame', recordLongFrame);
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
      longFrames: LongFrameSample[];
      longFrameSupported: boolean;
      longFrameObserver: PerformanceObserver | null;
      frames: { at: number; interval: number; scrollY: number }[];
      running: boolean;
    };
    store.running = false;
    const recordLongFrame = Reflect.get(globalThis, '__recordLongFrame') as (
      entry: PerformanceEntry,
    ) => void;
    for (const entry of store.longFrameObserver?.takeRecords() ?? []) recordLongFrame(entry);
    store.longFrameObserver?.disconnect();
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
      longFrameSupported: store.longFrameSupported,
      longFrames: store.longFrames.length,
      // These frame-end tails exclude presentation time.
      longFrameDetails: [...store.longFrames]
        .sort((left, right) => right.duration - left.duration)
        .slice(0, 12)
        .map((frame) => ({
          ...frame,
          scrollY: locate(frame.start),
          sectionIndex: sectionIndexAt(locate(frame.start)),
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
