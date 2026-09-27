import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Browser } from '@playwright/test';

import { effectCheck } from '../../dist/node/core/effect-check.js';
import { buildReport } from '../../dist/node/index.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../../dist/node/page-clock.js';
import { expect, test } from './fixtures.js';

/**
 * The reference effects in `extensions/` — `wall-thread` and `loom` — stay whole when the engine
 * changes: each passes the eleven effect-check checks with either of its examples as the checked page,
 * and each actually draws. The drawing test catches what effect-check cannot: an effect that paints
 * nothing, or paints the same in `live` as in `still`, passes all eleven checks.
 */

const EFFECTS = [
  { name: 'wall-thread', attribute: 'thread', states: ['reached'] },
  { name: 'loom', attribute: 'loom', states: ['weaving', 'woven'] },
] as const;

/** A copy of the extension folder whose manifest checks the examples in the given order. */
async function copyWithOrder(
  name: string,
  reversed: boolean,
  purpose: 'check' | 'drawing' = 'check',
): Promise<string> {
  const root = path.resolve(
    'test-results/e2e-reference-effects',
    `${name}-${reversed ? 'b' : 'a'}${purpose === 'drawing' ? '-drawing' : ''}`,
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'source');
  await cp(path.resolve('extensions', name), source, { recursive: true });
  const manifest = path.join(source, 'extension.yaml');
  if (reversed) {
    const text = await readFile(manifest, 'utf8');
    await writeFile(
      manifest,
      text.replace(/examples: \[([^,\]]+), ([^\]]+)\]/u, 'examples: [$2, $1]'),
    );
  }
  return root;
}

async function opaquePixels(
  browser: Browser,
  url: string,
  name: string,
  attribute: string,
  mode: 'live' | 'still',
): Promise<{ pixels: number; states: string[]; errors: string[] }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: mode === 'still' ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate((selector) => {
    const host = document.querySelector(selector);
    host?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, `[data-effect-${name}-${attribute}]`);
  await page.waitForTimeout(100);
  const result = await page.evaluate((effect) => {
    window.__clock?.seek(2);
    let pixels = 0;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      `.effect-layer canvas[data-effect="${effect}"]`,
    )) {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const paint = copy.getContext('2d', { willReadFrequently: true });
      if (paint === null) continue;
      paint.drawImage(canvas, 0, 0);
      const data = paint.getImageData(0, 0, copy.width, copy.height).data;
      for (let index = 3; index < data.length; index += 4) if ((data[index] ?? 0) > 25) pixels += 1;
    }
    const status = window.__agenticReportEffectEngine
      ?.status()
      .find((entry) => entry.name === effect);
    return { pixels, states: status === undefined ? [] : [...status.states] };
  }, name);
  await context.close();
  return { ...result, errors };
}

test.describe.configure({ timeout: 240_000 });

for (const effect of EFFECTS)
  for (const reversed of [false, true])
    test(`${effect.name} passes all eleven checks with its ${reversed ? 'second' : 'first'} example checked`, async ({
      browserName,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium');
      const root = await copyWithOrder(effect.name, reversed);
      const result = await effectCheck({
        manifest: path.join(root, 'source', 'extension.yaml'),
        output: path.join(root, 'out'),
      });
      expect(
        result.checks.filter((check) => !check.passed).map((check) => check.id),
        JSON.stringify(result.checks, null, 2),
      ).toEqual([]);
      expect(result.summary).toBe('11 of 11 checks passed');
      const states = result.checks.find((check) => check.id === 'states')?.details ?? [];
      expect(states).toEqual([`states: ${effect.states.join(', ')}`]);
    });

for (const effect of EFFECTS)
  test(`${effect.name} draws, and draws less while the reader is on the way than when it is finished`, async ({
    browser,
    browserName,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium');
    const root = await copyWithOrder(effect.name, false, 'drawing');
    const manifest = await readFile(path.join(root, 'source', 'extension.yaml'), 'utf8');
    const first = /examples: \[([^,\]]+),/u.exec(manifest)?.[1];
    expect(first).toBeDefined();
    const output = path.join(root, 'page.html');
    await buildReport({ input: path.join(root, 'source', first ?? ''), output });
    const url = pathToFileURL(output).href;
    const live = await opaquePixels(browser, url, effect.name, effect.attribute, 'live');
    const still = await opaquePixels(browser, url, effect.name, effect.attribute, 'still');
    expect([...live.errors, ...still.errors]).toEqual([]);
    expect(still.pixels).toBeGreaterThan(1500);
    expect(live.pixels).toBeGreaterThan(0);
    expect(still.pixels).toBeGreaterThan(live.pixels * 1.1);
    expect(still.states).toEqual([...effect.states]);
  });
