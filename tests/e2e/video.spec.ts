import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { test, expect } from './fixtures.js';

const SOURCE = `---
title: Video playback
description: A recorded animation embedded in the report.
---

# Video playback

![Square moving right](assets/playback.webm)

::video{src="assets/playback.webm" poster="assets/poster.png" caption="The square slides across and back."}
`;

/** Собирает страницу с видео в обоих форматах; у каждого проекта свой каталог, прогоны идут параллельно. */
async function buildVideoPage(project: string): Promise<{ single: string; directory: string }> {
  const root = path.resolve('test-results/e2e-video', project);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source/assets'), { recursive: true });
  await cp(path.resolve('tests/fixtures/video'), path.join(root, 'source/assets'), {
    recursive: true,
  });
  await writeFile(path.join(root, 'source/report.md'), SOURCE);
  const single = path.join(root, 'single.html');
  const directory = path.join(root, 'directory');
  await buildReport({ input: path.join(root, 'source'), output: single });
  await buildReport({ input: path.join(root, 'source'), output: directory, format: 'directory' });
  return {
    single: pathToFileURL(single).href,
    directory: pathToFileURL(path.join(directory, 'index.html')).href,
  };
}

async function playedSeconds(page: Page, index: number): Promise<number> {
  return page
    .locator('video')
    .nth(index)
    .evaluate((video: HTMLVideoElement) => video.currentTime);
}

test.describe('embedded video', () => {
  let urls: { single: string; directory: string };

  test.beforeAll(async () => {
    urls = await buildVideoPage(test.info().project.name);
  });

  for (const format of ['single', 'directory'] as const) {
    test(`plays a recording inline in ${format} output`, async ({ page }) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (message.text().includes('Content Security Policy')) violations.push(message.text());
      });
      await page.goto(urls[format]);
      const videos = page.locator('video');
      await expect(videos).toHaveCount(2);
      for (const index of [0, 1]) {
        const video = videos.nth(index);
        await expect(video).toHaveAttribute('controls', '');
        await expect(video).toHaveAttribute('loop', '');
        await expect(video).toHaveAttribute('playsinline', '');
        await video.scrollIntoViewIfNeeded();
        // Видео на экране запускается само и идёт: время проигрывания растёт.
        await expect
          .poll(() => playedSeconds(page, index), { timeout: 10_000 })
          .toBeGreaterThan(0.2);
        expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
        // Файл загружен и разобран: у записи есть длительность.
        const duration = await video.evaluate((element: HTMLVideoElement) => element.duration);
        expect(Number.isFinite(duration)).toBe(true);
        expect(duration).toBeGreaterThan(0);
      }
      await expect(videos.first()).toHaveAttribute('aria-label', 'Square moving right');
      await expect(videos.nth(1)).toHaveAttribute('poster', /./u);
      await expect(page.locator('figure.semantic-video figcaption')).toHaveText(
        'The square slides across and back.',
      );
      expect(violations).toEqual([]);
    });
  }

  test('waits for the reader under reduced motion and keeps a reader pause', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(urls.single);
    const video = page.locator('video').first();
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_500);
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
    expect(await playedSeconds(page, 0)).toBe(0);

    // Кнопка запуска работает и при «меньше движения».
    await video.evaluate((element: HTMLVideoElement) => element.play());
    await expect.poll(() => playedSeconds(page, 0), { timeout: 10_000 }).toBeGreaterThan(0.2);

    // Пауза читателя остаётся паузой, пока он сам не запустит видео снова.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await video.evaluate((element: HTMLVideoElement) => element.pause());
    await page.waitForTimeout(1_000);
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  });
});
