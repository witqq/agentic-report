import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { measureReport } from '../../dist/node/core/snapshot.js';
import { expect, test } from './fixtures.js';
import { addBuiltInThemes, BUILT_IN_THEME_ATTRIBUTES } from './themes.js';

/**
 * Слой изменений с прошлой редакции, собранный `build --since`, открытый через `file://`. Каждая
 * проверка называет дефект, который ловит, и падает на его контрпримере.
 */

const FIRST = [
  '::::section{title="Storage" id="storage"}',
  '',
  'The cache keeps many frames in memory so the player can seek quickly.',
  '',
  'This paragraph was wrong and is removed.',
  '',
  '| Name | Size |',
  '| --- | --- |',
  '| alpha | 1 |',
  '| beta | 2 |',
  '',
  '```ts',
  'const a = 1;',
  'const b = 2;',
  'console.log(a + b);',
  '```',
  '',
  '::::',
  '',
  '::::section{title="Network" id="network"}',
  '',
  'Requests are batched every frame.',
  '',
  '::::',
];

const SECOND = [
  '::::section{title="Storage" id="storage"}',
  '',
  'The cache keeps decoded frames in memory so the player can seek quickly.',
  '',
  '| Name | Size |',
  '| --- | --- |',
  '| alpha | 1 |',
  '',
  '```ts',
  'const a = 1;',
  'const b = 3;',
  'console.log(a + b);',
  '```',
  '',
  '::::',
  '',
  '::::section{title="Network" id="network"}',
  '',
  'Requests are batched every frame.',
  '',
  '::::',
  '',
  '::::section{title="Security" id="security"}',
  '',
  'Tokens are rotated daily.',
  '',
  '::::',
];

function source(body: readonly string[]): string {
  return [
    '---',
    'title: Editions',
    'language: en',
    'review: true',
    '---',
    '',
    '# Editions',
    '',
    'Intro.',
    '',
    '::contents',
    '',
    ...body,
    '',
  ].join('\n');
}

interface Pages {
  readonly changed: string;
  readonly plain: string;
  readonly directory: string;
  readonly root: string;
}

let pages: Pages | undefined;

async function build(project: string): Promise<Pages> {
  const root = path.resolve('test-results/e2e-edition-changes', project);
  await rm(root, { recursive: true, force: true });
  for (const [name, body] of [
    ['first', FIRST],
    ['second', SECOND],
  ] as const) {
    await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, name, 'report.md'), source(body));
  }
  const previous = path.join(root, 'first.html');
  await buildReport({ input: path.join(root, 'first'), output: previous });
  const changed = path.join(root, 'second.html');
  await buildReport({ input: path.join(root, 'second'), output: changed, since: previous });
  const plain = path.join(root, 'second-plain.html');
  await buildReport({ input: path.join(root, 'second'), output: plain });
  const directory = path.join(root, 'second-directory');
  await buildReport({
    input: path.join(root, 'second'),
    output: directory,
    format: 'directory',
    since: previous,
  });
  return {
    changed: pathToFileURL(changed).href,
    plain: pathToFileURL(plain).href,
    directory: pathToFileURL(path.join(directory, 'index.html')).href,
    root,
  };
}

test.beforeAll(async () => {
  pages = await build(test.info().project.name);
});

function built(): Pages {
  if (pages === undefined) throw new Error('Pages were not built.');
  return pages;
}

test('the strip and the button count the changes, and a list entry focuses its block', async ({
  page,
}) => {
  // Дефект: счётчик и полоса расходятся с `totals`, или строка списка ведёт мимо блока.
  await page.goto(built().changed);
  await expect(page.locator('[data-edition-strip]')).toContainText(
    'Edition 2. Since the previous one: 3 blocks changed in 2 sections, 1 added, 1 removed.',
  );
  const entries = page.locator('[data-edition-dialog] [data-edition-jump]');
  const count = await entries.count();
  await expect(page.locator('[data-edition-list-toggle] .review-toggle-count')).toHaveText(
    String(count),
  );
  await page.locator('[data-edition-list-toggle]').click();
  await expect(page.locator('[data-edition-dialog]')).toBeVisible();
  const table = entries.filter({ hasText: 'table' }).first();
  const href = await table.getAttribute('href');
  await table.click();
  await expect(page.locator('[data-edition-dialog]')).toBeHidden();
  await expect(page.locator(href ?? '#missing')).toBeFocused();
  await expect(page.locator('[data-navigation] li').first().locator('.edition-dot')).toHaveCount(1);
});

test('previous starts at the last change and next wraps to the first change', async ({ page }) => {
  // Catches Previous skipping the last change when no change has been selected yet.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(built().changed);
  const entries = page.locator('[data-edition-dialog] [data-edition-jump]');
  expect(await entries.count()).toBeGreaterThan(1);
  const last = await entries.last().getAttribute('href');
  const first = await entries.first().getAttribute('href');
  await page.locator('[data-edition-step="previous"]').click();
  await expect(page.locator(last ?? '#missing')).toBeFocused();
  await page.locator('[data-edition-step="next"]').click();
  await expect(page.locator(first ?? '#missing')).toBeFocused();
});

test('switching the layer off removes deleted text from layout, copy and assistive reading', async ({
  page,
}) => {
  // Дефект: скрытие через прозрачность — зачёркнутый текст остался бы в копировании и у экранного чтеца.
  await page.goto(built().changed);
  const removed = page.locator('[data-edition-removed]');
  expect(await removed.count()).toBeGreaterThan(3);
  await page.locator('[data-edition-layer-toggle]').click();
  await expect(page.locator('[data-edition-layer-toggle]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const displays = await removed.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).display),
  );
  expect(new Set(displays)).toEqual(new Set(['none']));
  const inserted = await page.locator('ins.edition-ins').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return `${style.textDecorationLine}|${style.backgroundColor}`;
    }),
  );
  expect(new Set(inserted)).toEqual(new Set(['none|rgba(0, 0, 0, 0)']));
  const paragraph = page.locator('p[data-review-target]').filter({ hasText: 'The cache keeps' });
  expect(await paragraph.evaluate((node) => (node as HTMLElement).innerText)).toBe(
    'The cache keeps decoded frames in memory so the player can seek quickly.',
  );
  // Новая строка кода тоже теряет оформление.
  expect(
    await page
      .locator('.line[data-change="added"]')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
});

test('marks keep 3:1 against the page and text in insertions and deletions stays body text in every theme', async ({
  page,
}, info) => {
  // Дефект: цвет пометки мимо ролей состояния или цвет текста правки вместо цвета текста —
  // в какой-то теме или схеме полоса терялась бы, а слово в `del` читалось бы хуже соседних.
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(built().changed);
  await addBuiltInThemes(page);
  const problems: string[] = [];
  for (const theme of BUILT_IN_THEME_ATTRIBUTES)
    for (const scheme of ['light', 'dark'] as const) {
      const result = await page.evaluate(
        ({ attributes, scheme }) => {
          const root = document.documentElement;
          for (const [name, value] of Object.entries(attributes))
            root.setAttribute(name, String(value));
          root.dataset.scheme = scheme;
          const rgb = (value: string): number[] => {
            const canvas = document.createElement('canvas').getContext('2d');
            if (canvas === null) return [0, 0, 0];
            canvas.fillStyle = value;
            canvas.fillRect(0, 0, 1, 1);
            return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
          };
          const luminance = ([r = 0, g = 0, b = 0]: number[]): number =>
            [r, g, b]
              .map((channel) => channel / 255)
              .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
              .reduce((sum, c, index) => sum + c * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
          const contrast = (a: string, b: string): number => {
            const [high, low] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
            return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
          };
          const background = getComputedStyle(document.body).backgroundColor;
          const bars = [...document.querySelectorAll<HTMLElement>('.edition-bar')].map((bar) =>
            contrast(getComputedStyle(bar).backgroundColor, background),
          );
          const paragraph = document.querySelector('p[data-review-target] del')?.parentElement;
          const body =
            paragraph === null || paragraph === undefined ? '' : getComputedStyle(paragraph).color;
          const texts = [...document.querySelectorAll('ins.edition-ins, del.edition-del')].map(
            (node) => getComputedStyle(node).color,
          );
          return { bars, body, texts };
        },
        { attributes: theme.attributes, scheme },
      );
      for (const ratio of result.bars)
        if (ratio < 3) problems.push(`${theme.name} ${scheme}: bar ${ratio.toFixed(2)}`);
      if (result.texts.some((color) => color !== result.body))
        problems.push(`${theme.name} ${scheme}: edit text is not body text`);
    }
  expect(problems).toEqual([]);
});

test('the page with its layer has no measured defects on a phone and a desktop', async () => {
  const info = test.info();
  // Дефект: слой, ломающий раскладку — боковой выход, мелкий текст, низкий контраст ярлыков.
  test.skip(info.project.name !== 'desktop-chromium');
  const root = built().root;
  const result = await measureReport({
    input: path.join(root, 'second'),
    output: path.join(root, 'measure'),
    since: path.join(root, 'first.html'),
    widths: [390, 1440],
    schemes: ['light', 'dark'],
    motions: ['reduce'],
  });
  expect(
    result.measurements.map((measurement) => ({
      at: `${measurement.width} ${measurement.scheme}`,
      defects: measurement.defects,
      overflow: measurement.horizontalOverflow,
      contrast: measurement.lowContrast.samples,
      small: measurement.smallText.samples,
    })),
  ).toEqual(
    result.measurements.map((measurement) => ({
      at: `${measurement.width} ${measurement.scheme}`,
      defects: 0,
      overflow: 0,
      contrast: [],
      small: [],
    })),
  );
});

test('with less motion a jump to a change scrolls instantly and flashes nothing', async ({
  page,
}) => {
  // Дефект: подсветка перехода без учёта `prefers-reduced-motion`.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(built().changed);
  await page.locator('[data-edition-step="next"]').click();
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('data-edition-change', /\d+/u);
  await expect(page.locator('[data-edition-flash]')).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('print shows removed blocks open with their label and struck-through words', async ({
  page,
}) => {
  // Дефект: призрак в печати свёрнут или удалённое слово напечатано без зачёркивания.
  await page.goto(built().changed);
  await page.emulateMedia({ media: 'print' });
  const ghost = page.locator('details.edition-ghost').first();
  await expect(ghost.locator('summary')).toContainText('Removed: paragraph');
  await expect(ghost.locator('.edition-ghost-body')).toBeVisible();
  await expect(ghost.locator('.edition-ghost-body')).toContainText('This paragraph was wrong');
  await expect(page.locator('[data-edition-strip] .edition-strip-actions')).toBeHidden();
  expect(
    await page
      .locator('del.edition-del')
      .first()
      .evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe('line-through');
});

test('a note on a paragraph with deleted words anchors to the new text only', async ({
  page,
}, info) => {
  // Дефект: обход смещений ревью, считающий текст `del`; цитата получила бы удалённое слово, а заметка не
  // восстановилась бы на той же странице без слоя.
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(built().changed);
  const paragraph = page.locator('p[data-review-target]').filter({ hasText: 'The cache keeps' });
  await select(page, paragraph, 'cache', 'frames');
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Why decoded frames?');
  await page.getByRole('button', { name: 'Add message' }).click();
  await page.locator('[data-review-popover-close]').click();
  await page.locator('[data-review-toggle]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review.json' }).click();
  const download = await downloadPromise;
  const file = path.join(built().root, 'review.json');
  await download.saveAs(file);
  const { readFile } = await import('node:fs/promises');
  const review = JSON.parse(await readFile(file, 'utf8')) as {
    threads: { segments: { selection?: { quote: string } }[] }[];
  };
  expect(review.threads[0]?.segments[0]?.selection?.quote).toBe('cache keeps decoded frames');

  // Та же заметка ложится на страницу без слоя изменений: смещения одинаковы.
  await page.goto(built().plain);
  await page.locator('[data-review-toggle]').click();
  await page.locator('[data-review-import]').setInputFiles(file);
  await expect(page.locator('[data-review-error]')).toBeHidden();
  await expect(page.locator('[data-review-summary]')).toContainText('1');
});

test('the copy button of a changed code block copies only the new code', async ({
  page,
  context,
}, info) => {
  // Дефект: удалённые строки прошлой редакции попали бы в буфер вместе с новым кодом.
  test.skip(info.project.name !== 'desktop-chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(built().changed);
  const block = page.locator('pre[data-edition-code]');
  await expect(block.locator('.edition-ghost-line')).toContainText('const b = 2;');
  await block.hover();
  await block.locator('[data-copy-code]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'const a = 1;\nconst b = 3;\nconsole.log(a + b);',
  );
});

test('the layer runs under the page policy in both output formats', async ({ page }) => {
  // Дефект: скрипт или стиль слоя мимо политики CSP — консоль получила бы нарушение (фикстура падает на
  // любой ошибке консоли).
  for (const url of [built().changed, built().directory]) {
    await page.goto(url);
    await page.locator('[data-edition-step="next"]').click();
    await page.locator('[data-edition-layer-toggle]').click();
    await expect(page.locator('[data-edition-strip]')).toBeVisible();
  }
});

async function select(page: Page, owner: Locator, from: string, to: string): Promise<void> {
  const id = await owner.getAttribute('data-review-target');
  if (id === null) throw new Error('Missing target.');
  await page.evaluate(
    ({ id, from, to }) => {
      const element = document.querySelector(`[data-review-target="${CSS.escape(id)}"]`);
      if (element === null) throw new Error('Missing owner.');
      const find = (needle: string, end: boolean) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node.parentElement?.closest('[data-edition-removed]')) continue;
          const index = node.textContent?.indexOf(needle) ?? -1;
          if (index >= 0) return { node, offset: index + (end ? needle.length : 0) };
        }
        throw new Error(`Missing ${needle}`);
      };
      const start = find(from, false);
      const finish = find(to, true);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(finish.node, finish.offset);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },
    { id, from, to },
  );
}
