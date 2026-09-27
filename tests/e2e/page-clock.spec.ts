import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Часы страницы: в ручном режиме `window.__clock.seek(t)` приводит всё движение страницы — появление
 * секции, досчёт числа, прогресс сцены и WebGL-нити — к моменту `t`. Приёмка: один и тот же `t` даёт
 * побайтово одинаковый снимок на двух загрузках и после перемотки туда и обратно, разные `t` — разные
 * снимки.
 */
async function buildClockPage(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-clock', project);
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
      'title: Clock',
      'language: en',
      '---',
      '',
      '# Clock',
      '',
      '::::section{title="Arrives" id="arrives" transition="reveal"}',
      ':count[1,284] frames were read, and :count[97.5%] of them kept their horizon.',
      '::::',
      '',
      '::::section{title="Drifts" id="drifts" scene="progress"}',
      '![A mineral plane](plane.jpg)',
      '::::',
      '',
      '::::section{title="Unweaves" id="unweaves" media-effect="threads"}',
      '![A mineral plane seen from orbit](plane.jpg)',
      '::::',
    ].join('\n'),
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'source'), output });
  return pathToFileURL(output).href;
}

async function openManual(page: Page, url: string): Promise<void> {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // Нити загружают текстуру вне главного потока; снимать можно, когда холст живой.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector<HTMLImageElement>('img[data-webgl]')?.dataset.webglState,
      ),
    )
    .toMatch(/^(live|static)$/u);
}

/**
 * Перемотка, настоящая пауза, чтобы наблюдатели страницы отозвались, и вторая перемотка в тот же
 * момент: переходы, начатые откликом наблюдателей, тоже встают в положение по часам.
 */
async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
  await page.waitForTimeout(80);
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
}

async function shot(page: Page, seconds: number): Promise<string> {
  await seek(page, seconds);
  return (
    createHash('sha256')
      // Снимок окна, а не всей страницы: снимок всей страницы меняет размер окна, и страница заново
      // ставит досчёт чисел, то есть сам снимок менял бы снимаемое. Окно вмещает всю страницу.
      .update(await page.screenshot({ animations: 'allow' }))
      .digest('hex')
  );
}

test('the same clock time gives byte-identical snapshots across loads and seeks, and another time a different one', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 2400 });
  const url = await buildClockPage(testInfo.project.name);

  await openManual(page, url);
  // Ловит: время в ручном режиме идёт само — между загрузкой и перемоткой оно бы ушло вперёд.
  expect(await page.evaluate(() => [performance.now(), Date.now()])).toEqual([0, 0]);
  const early = await shot(page, 0.15);
  const later = await shot(page, 0.45);
  const earlyAgain = await shot(page, 0.15);
  const count = await page.locator('.semantic-count').first().textContent();

  await openManual(page, url);
  const earlySecondLoad = await shot(page, 0.15);
  const laterSecondLoad = await shot(page, 0.45);

  // Ловит: снимок зависит от настоящего времени загрузки или от истории перемоток.
  expect(earlyAgain).toBe(early);
  expect(earlySecondLoad).toBe(early);
  expect(laterSecondLoad).toBe(later);
  // Ловит: перемотка ничего не двигает, и одинаковость снимков ничего не доказывает.
  expect(later).not.toBe(early);
  // Ловит: досчёт числа идёт своим временем, а не часами (в момент 0,45 с он ещё не закончен).
  expect(count).not.toBe('1,284');
});

test('a recording sets scroll-driven progress through data-clock-progress, applied on seek', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 900 });
  await openManual(page, await buildClockPage(testInfo.project.name));
  const state = () =>
    page.evaluate(() => ({
      scene: document
        .querySelector<HTMLElement>('#drifts')
        ?.style.getPropertyValue('--scene-progress'),
      threads: document.querySelector<HTMLCanvasElement>('canvas.webgl-canvas')?.dataset.progress,
      webgl: document.querySelector<HTMLImageElement>('img[data-webgl]')?.dataset.webglState,
    }));
  await page.evaluate(() => {
    document.querySelector('#drifts')?.setAttribute('data-clock-progress', '0.25');
    document.querySelector('img[data-webgl]')?.setAttribute('data-clock-progress', '0.6');
  });
  await seek(page, 1);
  const set = await state();
  // Ловит: сцена и нити читают только положение на экране, и запись не может выставить их прогресс.
  expect(set.scene).toBe('0.2500');
  if (set.webgl === 'live') expect(set.threads).toBe('0.600');

  await page.evaluate(() => {
    document.querySelector('#drifts')?.setAttribute('data-clock-progress', '0.75');
  });
  // Ловит: прогресс применяется только кадром браузера, а не перемоткой часов.
  await page.evaluate(() => window.__clock?.seek(2));
  expect((await state()).scene).toBe('0.7500');
});

test('without manual mode the page keeps the real clock', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(await buildClockPage(testInfo.project.name));
  // Ловит: обычный просмотр подменяет время или ставит управление часами.
  const before = await page.evaluate(() => ({
    clock: typeof window.__clock,
    now: performance.now(),
  }));
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => performance.now());
  expect(before.clock).toBe('undefined');
  expect(after).toBeGreaterThan(before.now);
  await expect(page.locator('.semantic-count').first()).toHaveText('1,284');
});
