import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { MEASURE_OPTIONS, measureInPage } from '../../dist/node/core/snapshot-measure.js';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Tables, the phone gutter and inline code breaks on real pages (`src/render/tables.ts` and the table block
 * of `src/blocks/table.css`). Each check names the defect it catches.
 */

const PROSE_TABLE = [
  '| Layer | Where | What it does |',
  '| --- | --- | --- |',
  '| Engine | `packages/anim/src/engine/cellValue.ts` | Computes the value of a cell at a moment of the show and tells the host when the object has settled and when nothing drives it any more. |',
  '| Stage | `packages/btmodel/src/staging/stageService.ts` | Holds the timeline, the steps, the loading window and the focus of the whole show, and answers the preview. |',
  '| Canvas stage | `packages/btkit/src/anim/canvasStage.ts` | Opens a show on one canvas on demand, keeps the not-played list and follows the active slide. |',
].join('\n');

const NUMBERS = [
  '| Region | Q1 2025 | Q2 2025 | Q3 2025 | Q4 2025 | Q1 2026 | Q2 2026 | Q3 2026 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  '| North America | 120 400 | 132 900 | 141 250 | 150 010 | 162 300 | 171 800 | 180 450 |',
  '| Europe | 98 100 | 101 700 | 117 900 | 123 400 | 131 200 | 140 050 | 149 900 |',
].join('\n');

const SMALL = ['| Key | Value |', '| --- | --- |', '| mode | on |', '| size | 12 |'].join('\n');

const LONG_PATH = 'apps/presentation/src/tools/SelectTool/ShapeSelection/SelectionOverlay.tsx';

const SOURCE = [
  '---',
  'title: Tables',
  '---',
  '',
  '# Tables',
  '',
  `The overlay lives in \`${LONG_PATH}\` and is drawn by \`packages/btkit/src/renderers/ShowTargetNodeRenderer.ts\` after the stage settles.`,
  '',
  '## Prose table',
  '',
  PROSE_TABLE,
  '',
  '## Numbers',
  '',
  ':::table{layout="scroll"}',
  NUMBERS,
  '',
  ':::',
  '',
  '## Small auto',
  '',
  SMALL,
  '',
  '## Small stack',
  '',
  ':::table{layout="stack"}',
  SMALL,
  '',
  ':::',
  '',
].join('\n');

let url: string;

test.beforeAll(async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const root = path.resolve('test-results/e2e-tables', testInfo.project.name);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'page'), { recursive: true });
  await writeFile(path.join(root, 'page', 'report.md'), SOURCE);
  const output = path.join(root, 'tables.html');
  await buildReport({ input: path.join(root, 'page'), output });
  url = pathToFileURL(output).href;
});

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
}

/** Whether each row of the n-th table is shown as a card (a row box that is not a table row). */
function cards(page: Page, index: number): Promise<boolean> {
  return page
    .locator('.report-content table')
    .nth(index)
    .evaluate(
      (table) =>
        getComputedStyle(table.querySelector('tbody tr') as Element).display !== 'table-row',
    );
}

test('a prose table wraps inside its column on a desktop instead of growing past it', async ({
  page,
}) => {
  // Defect: a table laid out at its unwrapped width, a thousand pixels of one-line cells.
  await open(page, 1440);
  const frame = page.locator('.table-frame').first();
  const geometry = await frame.evaluate((element) => ({
    overflow: element.scrollWidth - element.clientWidth,
    table: element.querySelector('table')?.getBoundingClientRect().width ?? 0,
    frame: element.clientWidth,
    rows: [...element.querySelectorAll('tbody tr')].map(
      (row) => row.getBoundingClientRect().height,
    ),
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.table).toBeLessThanOrEqual(geometry.frame);
  // The prose wraps to a few lines, not one word per line.
  for (const height of geometry.rows) expect(height).toBeLessThan(160);
  expect(await cards(page, 0)).toBe(false);
});

test('on a phone a table that cannot fit readably becomes labelled cards and stays a table', async ({
  page,
}) => {
  // Defect: three squeezed columns or a sideways scroll on a phone; or cards that lose table semantics.
  await open(page, 390);
  expect(await cards(page, 0)).toBe(true);
  const labels = await page
    .locator('.report-content table')
    .first()
    .locator('tbody tr:first-child td')
    .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell, '::before').content));
  expect(labels).toEqual(['"Layer" / ""', '"Where" / ""', '"What it does" / ""']);
  const frame = page.locator('.table-frame').first();
  expect(await frame.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);

  // The browser's own accessibility tree, not a role query: the cards are still a table with header
  // cells and data cells. Chromium keeps table semantics under a display change even without roles; the
  // explicit roles the compiler writes (asserted in tests/unit/tables.test.ts) are for engines that drop them.
  const session = await page.context().newCDPSession(page);
  const { nodes } = (await session.send('Accessibility.getFullAXTree')) as {
    nodes: { role?: { value?: string }; name?: { value?: string } }[];
  };
  const roles = nodes.map((node) => node.role?.value);
  expect(roles.filter((role) => role === 'table').length).toBeGreaterThanOrEqual(4);
  expect(roles).toContain('columnheader');
  expect(
    nodes.filter((node) => node.role?.value === 'cell').map((node) => node.name?.value),
  ).toContain('Engine');

  // A small table stays a table under auto and becomes cards when the author chose stack.
  expect(await cards(page, 2)).toBe(false);
  expect(await cards(page, 3)).toBe(true);
});

test('a scroll table keeps its grid, scrolls sideways and keeps the first column in view', async ({
  page,
}) => {
  // Defect: a wide numeric table turned into cards, or its row names scrolled out of view.
  for (const width of [390, 1024]) {
    await open(page, width);
    expect(await cards(page, 1)).toBe(false);
    // The table is its own scroll container: its surface is as wide as the table, not the track.
    const frame = page.locator('[data-table-layout="scroll"] > table');
    const before = await frame.evaluate((element) => ({
      overflow: element.scrollWidth - element.clientWidth,
      nowrap: getComputedStyle(element.querySelector('td:last-child') as Element).whiteSpace,
    }));
    expect(before.nowrap).toBe('nowrap');
    if (width === 1024) continue;
    expect(before.overflow).toBeGreaterThan(100);
    const moved = await frame.evaluate((element) => {
      const first = element.querySelector('tbody td:first-child') as Element;
      const second = element.querySelector('tbody td:nth-child(2)') as Element;
      const start = [first.getBoundingClientRect().left, second.getBoundingClientRect().left];
      element.scrollLeft = 120;
      return {
        first: first.getBoundingClientRect().left - (start[0] ?? 0),
        second: second.getBoundingClientRect().left - (start[1] ?? 0),
      };
    });
    expect(Math.abs(moved.first)).toBeLessThan(1);
    expect(moved.second).toBeLessThan(-100);
  }
});

test('table cards work without container style queries at every declared fit boundary', async ({
  page,
}) => {
  // Safari 16.4 and Firefox 114 support size queries but ignore style queries: removing only those
  // rules must preserve cards below each fit width, grids at the boundary, and stack's 40rem boundary.
  await open(page, 1440);
  await page.evaluate(() => {
    const stripStyleQueries = (sheet: CSSStyleSheet | CSSGroupingRule): void => {
      for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
        const rule = sheet.cssRules[index];
        if (rule === undefined) continue;
        if ('conditionText' in rule && String(rule.conditionText).includes('style('))
          sheet.deleteRule(index);
        else if ('cssRules' in rule) stripStyleQueries(rule as CSSGroupingRule);
      }
    };
    for (const sheet of document.styleSheets) stripStyleQueries(sheet);
  });
  const frame = page.locator('.table-frame').first();
  for (const fit of [20, 24, 28, 32, 36, 40, 44, 48]) {
    for (const [below, expected] of [
      [true, true],
      [false, false],
    ] as const) {
      await frame.evaluate(
        (element, { fit, below }) => {
          element.dataset.tableFit = String(fit);
          element.style.width = `calc(${fit}rem - ${below ? 1 : 0}px)`;
          element.style.maxWidth = 'none';
        },
        { fit, below },
      );
      expect(await cards(page, 0), `auto ${fit}rem ${below ? 'below' : 'at'}`).toBe(expected);
    }
  }
  await frame.evaluate((element) => {
    element.dataset.tableLayout = 'stack';
    element.style.width = 'calc(40rem - 1px)';
  });
  expect(await cards(page, 0)).toBe(true);
  await frame.evaluate((element) => {
    element.style.width = '40rem';
  });
  expect(await cards(page, 0)).toBe(false);
  await frame.evaluate((element) => {
    element.dataset.tableLayout = 'scroll';
    element.style.width = '20rem';
  });
  expect(await cards(page, 0)).toBe(false);
});

test('a table owns its surface at its own width and keeps its text off the surface edge', async ({
  page,
}) => {
  // Defect: a short table on a filled panel as wide as the track (two thirds of it empty), or its outer
  // cells' text flush with the panel edge.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await open(page, width);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const found = await page.evaluate(measureInPage, MEASURE_OPTIONS);
      expect(found.tables.deadSurface, `${scheme} ${width}`).toEqual({ count: 0, samples: [] });
      expect(found.tables.flushText, `${scheme} ${width}`).toEqual({ count: 0, samples: [] });
    }
    await open(page, 1440);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const small = await page
      .locator('.table-frame')
      .nth(2)
      .evaluate((frame) => {
        const table = frame.querySelector('table') as HTMLElement;
        const cell = table.querySelector('td') as HTMLElement;
        const text = document.createRange();
        text.selectNodeContents(cell);
        return {
          frame: frame.getBoundingClientRect().width,
          frameFill: getComputedStyle(frame).backgroundColor,
          table: table.getBoundingClientRect().width,
          tableFill: getComputedStyle(table).backgroundColor,
          inset: text.getBoundingClientRect().left - table.getBoundingClientRect().left,
        };
      });
    expect(small.frameFill).toBe('rgba(0, 0, 0, 0)');
    expect(small.tableFill).not.toBe('rgba(0, 0, 0, 0)');
    expect(small.table).toBeLessThan(small.frame / 2);
    expect(small.inset).toBeCloseTo(20, 0);
  }
});

test('a phone has one gutter from the theme and wide blocks reach the screen edges', async ({
  page,
}) => {
  // Defect: the shell gutter and the column padding adding up to a 319 px column on a 390 px screen.
  await open(page, 390);
  const gutter = await page.evaluate(
    () =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--phone-gutter'),
      ) * 16,
  );
  expect(gutter).toBeGreaterThanOrEqual(16);
  expect(gutter).toBeLessThanOrEqual(20);
  const paragraph = await page.locator('.report-content article > p').first().boundingBox();
  expect(paragraph?.x).toBeCloseTo(gutter, 0);
  expect(paragraph?.width).toBeCloseTo(390 - 2 * gutter, 0);
  const frame = await page.locator('.table-frame').first().boundingBox();
  expect(frame?.x).toBeCloseTo(0, 0);
  expect(frame?.width).toBeCloseTo(390, 0);
  const row = await page
    .locator('.report-content table')
    .first()
    .locator('td')
    .first()
    .boundingBox();
  expect(row?.x).toBeCloseTo(gutter, 0);
});

test('inline code wraps only between the parts of a path and copies as written', async ({
  page,
}) => {
  // Defect: `overflow-wrap: anywhere` splitting a path mid-word; or a break marker leaking into the text.
  await open(page, 390);
  const code = page.locator('.report-content article > p code').first();
  const result = await code.evaluate((element) => {
    const characters: [Text, number][] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null)
      for (let index = 0; index < node.data.length; index += 1) characters.push([node, index]);
    const breaks: string[] = [];
    let previous: { top: number; character: string } | undefined;
    for (const [node, index] of characters) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const top = range.getBoundingClientRect().top;
      const character = node.data[index] ?? '';
      if (previous !== undefined && top > previous.top + 2) breaks.push(previous.character);
      previous = { top, character };
    }
    const selection = window.getSelection() as Selection;
    selection.selectAllChildren(element);
    return { breaks, copied: selection.toString(), lines: element.getClientRects().length };
  });
  expect(result.lines).toBeGreaterThan(1);
  expect(result.breaks.length).toBeGreaterThan(0);
  for (const character of result.breaks) expect('/._-:(,').toContain(character);
  expect(result.copied).toBe(LONG_PATH);
});

test('a printed table is as wide as its columns and wraps within the page', async ({ page }) => {
  // Defect: on paper the table kept the block box it scrolls in on screen at `width: auto`, so its top
  // rule and its fill spanned the whole track while its columns ended far short of it.
  for (const width of [1440, 720]) {
    await open(page, width);
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
    const tables = await page.locator('.table-frame > table').evaluateAll((elements) =>
      elements.map((table) => {
        const box = table.getBoundingClientRect();
        const cells = [...table.querySelectorAll('th, td')].map((cell) =>
          cell.getBoundingClientRect(),
        );
        const frame = table.parentElement?.getBoundingClientRect();
        return {
          left: box.left - Math.min(...cells.map((cell) => cell.left)),
          right: box.right - Math.max(...cells.map((cell) => cell.right)),
          past: box.right - (frame?.right ?? Number.NaN),
          overflow: table.scrollWidth - table.clientWidth,
          fill: getComputedStyle(table).backgroundImage,
        };
      }),
    );
    expect(tables).toHaveLength(4);
    for (const [index, table] of tables.entries()) {
      const label = `${width} table ${index + 1}`;
      expect(Math.abs(table.left), label).toBeLessThanOrEqual(1);
      expect(Math.abs(table.right), label).toBeLessThanOrEqual(1);
      expect(table.past, label).toBeLessThanOrEqual(1);
      expect(table.overflow, label).toBeLessThanOrEqual(0);
      expect(table.fill, label).toBe('none');
    }
  }
});
