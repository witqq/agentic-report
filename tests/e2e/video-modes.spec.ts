import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Видео продукта в собранной странице: настоящий ролик agentic-screencast с тремя кодировками
 * играет, браузер берёт первую кодировку, которую умеет, главы переносят к своему началу, фон
 * останавливается кнопкой, ручной ролик ждёт читателя, а при уменьшенном движении ничего не играет.
 */
async function buildPage(project: string, format: 'single-file' | 'directory'): Promise<string> {
  const root = path.resolve('test-results/e2e-video-modes', project, format);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source'), { recursive: true });
  await cp(path.resolve('examples/presentation/assets'), path.join(root, 'source'), {
    recursive: true,
  });
  await writeFile(
    path.join(root, 'source', 'two.chapters.vtt'),
    'WEBVTT\n\n00:00.000 --> 00:06.000\nSource\n\n00:06.000 --> 00:18.000\nResult\n',
  );
  const clip = 'src="demo.h264.mp4" sources="demo.av1.mp4, demo.vp9.webm" poster="demo.poster.jpg"';
  await writeFile(
    path.join(root, 'source', 'report.md'),
    [
      '---',
      'title: Video modes',
      'language: en',
      '---',
      '',
      '# Video modes',
      '',
      `::video{${clip} chapters="two.chapters.vtt" caption="Clip."}`,
      '',
      `::video{${clip} mode="background" caption="Background."}`,
      '',
      `::video{${clip} mode="manual" caption="Manual."}`,
      '',
    ].join('\n'),
  );
  const output = path.join(root, format === 'directory' ? 'site' : 'page.html');
  await buildReport({ input: path.join(root, 'source'), output, format });
  return pathToFileURL(format === 'directory' ? path.join(output, 'index.html') : output).href;
}

const player = (page: Page, caption: string) =>
  page.locator('figure.semantic-video').filter({ hasText: caption }).locator('video');

for (const format of ['single-file', 'directory'] as const) {
  test(`${format} clip plays the encoding the browser can decode first and jumps to chapters`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(await buildPage(testInfo.project.name, format));
    const clip = player(page, 'Clip.');
    await clip.scrollIntoViewIfNeeded();
    await expect
      .poll(() => clip.evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThan(0.5);
    const choice = await clip.evaluate((video: HTMLVideoElement) => {
      const sources = [...video.querySelectorAll('source')];
      const expected = sources.find((source) => video.canPlayType(source.type) !== '');
      return { current: video.currentSrc, expected: expected?.src, count: sources.length };
    });
    expect(choice.count).toBe(format === 'directory' ? 3 : 1);
    expect(choice.current).toBe(choice.expected);
    if (format === 'single-file') expect(choice.current).toMatch(/^data:video\/mp4;base64,/u);

    await page.getByRole('button', { name: /Result/u }).click();
    await expect
      .poll(() => clip.evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThanOrEqual(6);
  });
}

test('a background video has no controls and a pause button; a manual video waits for the reader', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(await buildPage(`${testInfo.project.name}-modes`, 'directory'));
  const background = player(page, 'Background.');
  await background.scrollIntoViewIfNeeded();
  expect(await background.evaluate((video: HTMLVideoElement) => video.controls)).toBe(false);
  await expect
    .poll(() => background.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);
  const toggle = page.locator('figure.semantic-video[data-mode="background"] [data-video-toggle]');
  await expect(toggle).toHaveAccessibleName('Pause video');
  await toggle.click();
  await expect
    .poll(() => background.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  await expect(toggle).toHaveAccessibleName('Play video');
  await toggle.click();
  await expect
    .poll(() => background.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);

  const manual = player(page, 'Manual.');
  await manual.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  expect(
    await manual.evaluate((video: HTMLVideoElement) => ({
      paused: video.paused,
      muted: video.muted,
      time: video.currentTime,
    })),
  ).toEqual({
    paused: true,
    muted: false,
    time: 0,
  });
});

test('under reduced motion no video plays by itself', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(await buildPage(`${testInfo.project.name}-reduced`, 'single-file'));
  for (const caption of ['Clip.', 'Background.']) {
    const video = player(page, caption);
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused), caption).toBe(true);
  }
  await expect(page.locator('[data-video-toggle]')).toHaveAccessibleName('Play video');
});
