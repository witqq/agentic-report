import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

const LIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#f4f4f4"/></svg>';
const DARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#111111"/></svg>';
/** A one-pixel PNG: the poster's dark variant, other bytes than the fixture poster. */
const DARK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function source(scheme: 'light' | 'system'): string {
  return `---
title: Scheme media
scheme: ${scheme}
---

# Scheme media

![A box that follows the scheme](light.svg){dark="dark.svg"}

::video{src="playback.webm" poster="poster.png" dark-poster="poster-dark.png" caption="A clip."}

:::section{title="Contrast band" tone="contrast" id="band"}
![A box inside the band](light.svg){dark="dark.svg"}
:::
`;
}

/** Builds the page in both formats; each project writes into its own directory. */
async function buildPage(
  project: string,
  scheme: 'light' | 'system',
): Promise<{ single: string; directory: string }> {
  const root = path.resolve('test-results/e2e-scheme-media', project, scheme);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'source'), { recursive: true });
  await writeFile(path.join(root, 'source/light.svg'), LIGHT);
  await writeFile(path.join(root, 'source/dark.svg'), DARK);
  await writeFile(path.join(root, 'source/poster-dark.png'), Buffer.from(DARK_PNG, 'base64'));
  for (const file of ['playback.webm', 'poster.png'])
    await copyFile(path.resolve('tests/fixtures/video', file), path.join(root, 'source', file));
  await writeFile(path.join(root, 'source/report.md'), source(scheme));
  const single = path.join(root, 'single.html');
  const directory = path.join(root, 'directory');
  await buildReport({ input: path.join(root, 'source'), output: single });
  await buildReport({ input: path.join(root, 'source'), output: directory, format: 'directory' });
  return {
    single: pathToFileURL(single).href,
    directory: pathToFileURL(path.join(directory, 'index.html')).href,
  };
}

/**
 * Which variant each medium shows, read from what the browser loaded: `currentSrc` of the image against
 * the file's own dark source, the poster against the dark poster, and whether the picture decoded.
 */
async function shown(page: Page): Promise<{
  readonly main: 'dark' | 'light';
  readonly band: 'dark' | 'light';
  readonly poster: 'dark' | 'light';
  readonly broken: number;
}> {
  return page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('main img[data-dark-src]')];
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
    const variant = (image: HTMLImageElement | undefined): 'dark' | 'light' =>
      image !== undefined && image.getAttribute('src') === image.dataset.darkSrc ? 'dark' : 'light';
    const video = document.querySelector<HTMLVideoElement>('video[data-dark-poster]');
    return {
      main: variant(images.find((image) => image.closest('#band') === null)),
      band: variant(images.find((image) => image.closest('#band') !== null)),
      poster:
        video !== null && video.getAttribute('poster') === video.dataset.darkPoster
          ? 'dark'
          : 'light',
      broken: images.filter((image) => image.naturalWidth === 0).length,
    };
  });
}

test.describe('media that follow the colour scheme', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  for (const format of ['single', 'directory'] as const) {
    test(`switches the dark variant with the scheme toggle in ${format} output`, async ({
      page,
    }) => {
      const urls = await buildPage(`${test.info().project.name}-${format}`, 'light');
      await page.goto(urls[format]);
      // A light page shows the light file, and the contrast band — dark in a light theme — the dark one.
      await expect
        .poll(() => shown(page))
        .toEqual({
          main: 'light',
          band: 'dark',
          poster: 'light',
          broken: 0,
        });

      await page.locator('[data-scheme-toggle]').first().click();
      await expect
        .poll(() => shown(page))
        .toEqual({
          main: 'dark',
          band: 'light',
          poster: 'dark',
          broken: 0,
        });

      // Print is paper: the light variant even on a dark page.
      await page.emulateMedia({ media: 'print' });
      await expect.poll(() => shown(page)).toMatchObject({ main: 'light', poster: 'light' });
      await page.emulateMedia({ media: 'screen' });
      await expect.poll(() => shown(page)).toMatchObject({ main: 'dark', poster: 'dark' });

      await page.locator('[data-scheme-toggle]').first().click();
      await expect.poll(() => shown(page)).toMatchObject({ main: 'light', poster: 'light' });
    });
  }

  test('follows the system scheme on a system page', async ({ page }) => {
    const urls = await buildPage(`${test.info().project.name}-system`, 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(urls.single);
    await expect.poll(() => shown(page)).toMatchObject({ main: 'dark', poster: 'dark', broken: 0 });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => shown(page)).toMatchObject({ main: 'light', poster: 'light' });
  });
});
