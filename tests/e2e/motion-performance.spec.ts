import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

/**
 * Замер витрины движения при четырёхкратном замедлении процессора: во время прокрутки нет длинных
 * задач дольше 50 мс, а 95-й процентиль интервала кадров не больше 20 мс. Числа прогона пишутся в
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
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const store = { longTasks: [] as number[], frames: [] as number[], last: 0, running: true };
    Reflect.set(globalThis, '__perf', store);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) store.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
    const tick = (now: number): void => {
      if (store.last !== 0) store.frames.push(now - store.last);
      store.last = now;
      if (store.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 120) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  const result = await page.evaluate(() => {
    const store = Reflect.get(globalThis, '__perf') as {
      longTasks: number[];
      frames: number[];
      running: boolean;
    };
    store.running = false;
    const frames = [...store.frames].sort((a, b) => a - b);
    return {
      longest: Math.max(0, ...store.longTasks),
      longTasks: store.longTasks.length,
      p95: frames[Math.floor(frames.length * 0.95)] ?? 0,
      frames: frames.length,
    };
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await testInfo.attach('motion-performance', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  await mkdir(path.resolve('test-results/artifacts'), { recursive: true });
  await writeFile(
    path.resolve('test-results/artifacts/motion-performance.json'),
    JSON.stringify(result, null, 2),
  );
  expect(result.frames).toBeGreaterThan(50);
  expect(result.longest).toBeLessThanOrEqual(50);
  expect(result.p95).toBeLessThanOrEqual(20);
});
