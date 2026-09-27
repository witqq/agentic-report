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

/**
 * Секции задают кадр своим медиа: запись 160×90 в портретном кадре с вписыванием и в квадратном с
 * заполнением от левого края — оба вида плеера, директивой и картинкой Markdown.
 */
const FRAMED_SOURCE = `---
title: Framed video
description: Section framing roles applied to recordings.
---

# Framed video

::::::section{title="Contained" id="contained" media-fit="contain" media-aspect="portrait"}
::video{src="assets/playback.webm" caption="The whole frame stays visible."}
::::::

::::::section{title="Covered" id="covered" media-fit="cover" media-aspect="square" focal="left"}
![Square moving right](assets/playback.webm)
::::::
`;

/** Собирает страницу с видео в обоих форматах; у каждого проекта свой каталог, прогоны идут параллельно. */
async function buildVideoPage(
  project: string,
  source = SOURCE,
  name = 'plain',
): Promise<{ single: string; directory: string }> {
  const root = path.resolve('test-results/e2e-video', project, name);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source/assets'), { recursive: true });
  await cp(path.resolve('tests/fixtures/video'), path.join(root, 'source/assets'), {
    recursive: true,
  });
  await writeFile(path.join(root, 'source/report.md'), source);
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

test.describe('framed video', () => {
  let url: string;

  test.beforeAll(async () => {
    ({ single: url } = await buildVideoPage(test.info().project.name, FRAMED_SOURCE, 'framed'));
  });

  test('takes the section fit, aspect and focal point like an image', async ({ page }) => {
    await page.goto(url);
    const frame = async (selector: string) =>
      page.locator(selector).evaluate(async (video: HTMLVideoElement) => {
        if (video.readyState < 1)
          await new Promise((resolve) =>
            video.addEventListener('loadedmetadata', resolve, { once: true }),
          );
        const style = getComputedStyle(video);
        const box = video.getBoundingClientRect();
        return {
          intrinsic: video.videoWidth / video.videoHeight,
          rendered: box.width / box.height,
          fit: style.objectFit,
          position: style.objectPosition,
        };
      });

    // Запись шире кадра: без правила секции плеер принял бы её собственные пропорции 16:9.
    const contained = await frame('#contained video');
    expect(contained.intrinsic).toBeCloseTo(16 / 9, 2);
    expect(contained.rendered).toBeCloseTo(4 / 5, 2);
    expect(contained.fit).toBe('contain');

    const covered = await frame('#covered video');
    expect(covered.rendered).toBeCloseTo(1, 2);
    expect(covered.fit).toBe('cover');
    expect(covered.position).toBe('0% 50%');
  });
});
