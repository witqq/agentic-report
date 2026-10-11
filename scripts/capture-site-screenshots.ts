/**
 * Re-shoots the page screenshots the landing shows, in both colour schemes, from the contract in
 * `website/landing/assets/screenshots.json`: every entry names the example it photographs, the light file
 * (`file`) and the dark one (`darkFile`). Each example is built as one ordinary HTML file, opened through
 * `file://` at the contract's viewport on the page clock stopped after every entrance, switched to the
 * scheme exactly as the reader's toggle does, and photographed. The landing then writes each screenshot as
 * `![…](assets/<file>){dark="assets/<darkFile>"}`, so a dark page shows the dark shot.
 *
 * Run after `pnpm build`: `node --experimental-strip-types scripts/capture-site-screenshots.ts`.
 * The default run also photographs the authored landing first screen at its social viewport.
 * Pass `--social-preview` to leave the three maintained example pairs untouched.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import { buildReport } from '../dist/node/index.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../dist/node/page-clock.js';

interface ScreenshotEntry {
  readonly id: string;
  readonly source: string;
  readonly file: string;
  readonly darkFile: string;
}

interface ScreenshotContract {
  readonly capture: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
  };
  readonly screenshots: readonly ScreenshotEntry[];
  readonly socialPreview: {
    readonly source: string;
    readonly file: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
    readonly scheme: 'light' | 'dark';
  };
}

/** The moment of the page clock by which every entrance, count and transition has finished. */
const SETTLED_SECONDS = 10;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'website/landing/assets');
const contract = JSON.parse(
  await readFile(path.join(assets, 'screenshots.json'), 'utf8'),
) as ScreenshotContract;

const work = await mkdtemp(path.join(tmpdir(), 'agentic-report-screenshots-'));
const browser = await chromium.launch({ headless: true });
try {
  const captureSocialPreview = async (): Promise<void> => {
    const entry = contract.socialPreview;
    const output = path.join(work, 'landing.html');
    await buildReport({ input: path.resolve(assets, entry.source), output });
    const context = await browser.newContext({
      viewport: entry.viewport,
      deviceScaleFactor: entry.deviceScaleFactor,
      colorScheme: entry.scheme,
      reducedMotion: 'no-preference',
      locale: 'en-US',
    });
    try {
      const tab = await context.newPage();
      await tab.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
      await tab.goto(pathToFileURL(output).href, { waitUntil: 'load' });
      await tab.locator('[data-language-select]').selectOption('en');
      await tab.evaluate((scheme) => {
        document.documentElement.dataset.scheme = scheme;
      }, entry.scheme);
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await tab.evaluate((seconds) => {
        (window as unknown as { __clock?: { seek(value: number): void } }).__clock?.seek(seconds);
      }, SETTLED_SECONDS);
      await tab.waitForTimeout(100);
      await tab.evaluate((seconds) => {
        (window as unknown as { __clock?: { seek(value: number): void } }).__clock?.seek(seconds);
      }, SETTLED_SECONDS + 1);
      await tab.screenshot({ path: path.join(assets, entry.file), fullPage: false });
      process.stdout.write(`landing ${entry.scheme} → website/landing/assets/${entry.file}\n`);
    } finally {
      await context.close();
    }
  };
  if (!process.argv.includes('--social-preview')) {
    for (const entry of contract.screenshots) {
      const page = path.join(work, `${entry.id}.html`);
      await buildReport({ input: path.resolve(assets, entry.source), output: page });
      for (const [scheme, file] of [
        ['light', entry.file],
        ['dark', entry.darkFile],
      ] as const) {
        const context = await browser.newContext({
          viewport: contract.capture.viewport,
          deviceScaleFactor: contract.capture.deviceScaleFactor,
          colorScheme: scheme,
          reducedMotion: 'reduce',
        });
        try {
          const tab = await context.newPage();
          await tab.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
          await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
          await tab.evaluate((value) => {
            document.documentElement.dataset.scheme = value;
          }, scheme);
          await tab.evaluate(() => document.fonts.ready.then(() => true));
          await tab.evaluate((seconds) => {
            (window as unknown as { __clock?: { seek(value: number): void } }).__clock?.seek(
              seconds,
            );
          }, SETTLED_SECONDS);
          await tab.waitForTimeout(100);
          await tab.screenshot({ path: path.join(assets, file), fullPage: false });
          process.stdout.write(`${entry.id} ${scheme} → website/landing/assets/${file}\n`);
        } finally {
          await context.close();
        }
      }
    }
  }
  await captureSocialPreview();
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
