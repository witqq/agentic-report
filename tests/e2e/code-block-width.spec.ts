import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

// A line of about 140 characters: wider than the reading measure, so it scrolls inside a block that keeps
// the width of the text column.
const LONG =
  'const matrix = new TransformMatrix(1, 0, 0, 1, offsetX, offsetY).multiply(rotation).multiply(scale); // shift, rotate, scale: 0O 1lI';

const source = [
  '---',
  'title: Code width',
  'language: en',
  'layout: document',
  'theme: neutral',
  '---',
  '',
  '# Code width',
  '',
  'A paragraph that keeps the reading measure while the code below it takes the width its longest line needs.',
  '',
  '```ts',
  LONG,
  '```',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '::::::section{title="Inside containers" id="inside"}',
  '',
  'Section prose.',
  '',
  ':::disclosure{title="Code: the matrix" open="true"}',
  '',
  'Disclosure prose.',
  '',
  '```ts',
  LONG,
  '```',
  '',
  ':::',
  '',
  '::::tabs{title="Views"}',
  ':::tab{label="Code"}',
  '```ts',
  LONG,
  '```',
  ':::',
  ':::tab{label="Text"}',
  'Text.',
  ':::',
  '::::',
  '',
  '::::::',
  '',
].join('\n');

interface Block {
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly cut: number;
  readonly font: string;
}

async function measure(page: Page): Promise<{
  readonly prose: { readonly left: number; readonly width: number };
  readonly track: number;
  readonly screen: number;
  readonly pageScrolls: boolean;
  readonly blocks: readonly Block[];
}> {
  return page.evaluate(() => {
    const paragraph = document.querySelector('.report-content article > p');
    const article = document.querySelector('.report-content article');
    if (paragraph === null || article === null) throw new Error('Expected an article paragraph.');
    const prose = paragraph.getBoundingClientRect();
    const track = article.getBoundingClientRect();
    return {
      prose: { left: prose.left, width: prose.width },
      track: track.right,
      screen: document.documentElement.clientWidth,
      pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      blocks: [...document.querySelectorAll('pre')]
        .filter((block) => block.getClientRects().length > 0)
        .map((block) => {
          const box = block.getBoundingClientRect();
          const code = block.querySelector('code');
          if (code === null) throw new Error('Expected code in a code block.');
          return {
            left: box.left,
            right: box.right,
            width: box.width,
            cut: block.scrollWidth - block.clientWidth,
            font: getComputedStyle(code).fontFamily,
          };
        }),
    };
  });
}

test.describe('code block width', () => {
  let url: string;

  test.beforeAll(async () => {
    const root = path.resolve('test-results/e2e-code-width', test.info().project.name);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'report.md'), source);
    const output = path.join(root, 'report.html');
    await buildReport({ input: root, output });
    url = pathToFileURL(output).href;
  });

  // Catches a code block wider or narrower than the text column on a wide screen (inside a disclosure and
  // a tab too) — the column's edges would step out — and a code block wider than the screen on a phone.
  test('keeps the text column width, scrolls a longer line inside, and stays on a phone screen', async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop-chromium';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    const result = await measure(page);
    expect(result.blocks).toHaveLength(4);
    expect(result.pageScrolls).toBe(false);
    for (const block of result.blocks) {
      // The code face is the theme's programming mono, not its label face (Martian Mono in `neutral`).
      expect(block.font).toContain('JetBrains Mono');
      expect(block.right).toBeLessThanOrEqual(result.screen + 0.5);
    }
    if (!desktop) return;

    const [wide, short, disclosed, tabbed] = result.blocks as [Block, Block, Block, Block];
    for (const [label, block] of [
      ['article', wide],
      ['short', short],
      ['disclosure', disclosed],
      ['tab', tabbed],
    ] as const) {
      expect(Math.abs(block.width - result.prose.width), label).toBeLessThan(1);
      expect(Math.abs(block.left - result.prose.left), label).toBeLessThan(1);
    }
    // The line longer than the column scrolls inside its block, not the page.
    expect(wide.cut).toBeGreaterThan(0);
  });
});
