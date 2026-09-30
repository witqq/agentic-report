import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Колонка документа одной ширины: текст и каждый блок — таблица, схема, код, картинка — в одной колонке. Страница
 * с абзацами, кнопками, таблицами, схемой, кодом и картинкой на уровне статьи, в обычном разделе, в
 * раскрытии, в широкой ленте и в разделе меры чтения.
 */
const SOURCE = [
  '---',
  'title: Column axis probe',
  'language: en',
  '---',
  '',
  '# Column axis probe',
  '',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '::::actions{placement="edge"}',
  '::action[Start]{href="#plain" kind="primary"}',
  '::::',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row 0 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 1 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 2 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '',
  '::::::section{title="Plain section" id="plain"}',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '::::diagram{title="Chain" description="A chain wider than the text." type="flow" direction="right"}',
  '::node{id="a" label="Fill and picture correction"}',
  '::node{id="b" label="Fill overlay, inner shadow"}',
  '::node{id="c" label="Soft edges, blur, glow"}',
  '::node{id="d" label="Outer shadow"}',
  '::node{id="e" label="Reflection"}',
  '::edge{from="a" to="b"}',
  '::edge{from="b" to="c"}',
  '::edge{from="c" to="d"}',
  '::edge{from="d" to="e"}',
  '::::',
  '',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row 0 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 1 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 2 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```ts',
  "const wide = 'a code line that is longer than the reading measure of the page a code line that is longer than the reading measure of the page ';",
  '```',
  '',
  '![A wide picture](wide.png)',
  '',
  ':::::disclosure{title="Details with a table" open="true"}',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row 0 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 1 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 2 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  ':::::',
  '::::::',
  '',
  '::::::section{title="Tabs" id="tabs"}',
  '::::tabs{title="Views"}',
  ':::tab{label="Table"}',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen.',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  ':::',
  ':::tab{label="Other"}',
  'Short.',
  ':::',
  '::::',
  '::::::',
  '',
  '::::::section{title="Split" id="split" composition="split"}',
  ':::lead',
  'A lead beside the picture.',
  ':::',
  '![A wide picture](wide.png)',
  '',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen.',
  '::::::',
  '',
  '::::::section{title="Wide band" id="band" width="wide" tone="soft" surface="tint"}',
  ':::lead',
  'A lead in a wide band.',
  ':::',
  '',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '::::diagram{title="Chain" description="A chain wider than the text." type="flow" direction="right"}',
  '::node{id="a" label="Fill and picture correction"}',
  '::node{id="b" label="Fill overlay, inner shadow"}',
  '::node{id="c" label="Soft edges, blur, glow"}',
  '::node{id="d" label="Outer shadow"}',
  '::node{id="e" label="Reflection"}',
  '::edge{from="a" to="b"}',
  '::edge{from="b" to="c"}',
  '::edge{from="c" to="d"}',
  '::edge{from="d" to="e"}',
  '::::',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row 0 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 1 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 2 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '::::::',
  '',
  '::::::section{title="Reading" id="reading" width="reading"}',
  'Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. Prose long enough to fill the reading measure of the page so that its box is the text column and its right edge is where the text ends on a wide screen. ',
  '',
  '| Name | Kind | Input | Output | Notes | Owner | State |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| row 0 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 1 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '| row 2 | a long cell value here | another long value | output value | a note that is long | owner name | active |',
  '::::::',
  '',
].join('\n');

let url = '';

test.beforeAll(async () => {
  const root = path.resolve('test-results/e2e-column-axis', test.info().project.name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.md'), SOURCE);
  await copyFile(path.resolve('tests/fixtures/video/poster.png'), path.join(root, 'wide.png'));
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  url = pathToFileURL(output).href;
});

test('text and every block share one column width and edge', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const width of [1440, 2000]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    const found = await page.evaluate(() => {
      const text = [
        ...document.querySelectorAll<HTMLElement>(
          'main article > p, main article > .semantic-section > p:not(:has(> img)):not([data-section-opening]), main article .semantic-disclosure > p, main article [data-tab-panel]:not([hidden]) > p, main article .semantic-tabs > .semantic-tab-list, main article > .semantic-section > .semantic-section-title, main article > h1',
        ),
      ].map((element) => element.getBoundingClientRect());
      // Рамки блоков: таблица, схема, код, картинка.
      const blocks = [
        ...document.querySelectorAll<HTMLElement>(
          'main article .table-frame, main article figure.semantic-diagram, main article pre, main article > p > img, main article [data-composition="flow"] p > img',
        ),
      ].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.tagName.toLowerCase(),
          frame: !element.matches('img'),
          left: box.left,
          right: box.right,
        };
      });
      return {
        lefts: text.map((box) => Math.round(box.left)),
        right: Math.max(...text.map((box) => box.right)),
        blocks,
      };
    });
    // Ловит: абзацы и заголовки в ленте, раскрытии, вкладках или разделе split на другой левой кромке.
    expect(new Set(found.lefts).size, `${width}: ${found.lefts.join(',')}`).toBe(1);
    const left = found.lefts[0] ?? 0;
    // Ловит: схема, таблица или код шире текста — край колонки рвётся ступенькой; картинка у другого края.
    for (const block of found.blocks) {
      const label = `${width} ${block.name} ${Math.round(block.left)}..${Math.round(block.right)} column ${left}..${Math.round(found.right)}`;
      expect(Math.abs(block.left - left), label).toBeLessThan(3);
      if (block.frame) expect(Math.abs(block.right - found.right), label).toBeLessThan(3);
      else expect(block.right, label).toBeLessThanOrEqual(found.right + 2);
    }
  }
});

test('a wide screen centres the column in the window and widens it with the type', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const measure = async (width: number): Promise<{ centre: number; width: number }> => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url);
    return page.evaluate(() => {
      const box = document.querySelector('main article > p')?.getBoundingClientRect();
      if (box === undefined) throw new Error('Missing paragraph');
      return { centre: (box.left + box.right) / 2, width: box.width };
    });
  };
  const standard = await measure(1440);
  const wide = await measure(2000);
  // Ловит: колонка стоит правее центра окна вместе с оглавлением — текст «не посередине». На 1440 px правой
  // полосе может не хватить места, и колонка держит зазор от оглавления.
  expect(Math.abs(wide.centre - 1000)).toBeLessThan(3);
  // Ловит: на широком экране колонка той же ширины, что на ноутбуке, — страница выглядит узкой полосой.
  expect(wide.width).toBeGreaterThan(standard.width * 1.1);
});
