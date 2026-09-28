import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { BUILT_IN_THEME_NAMES } from '../../src/authoring/themes.js';
import { expect, test } from './fixtures.js';

/**
 * Своя тема агента наследует встроенную на собранной странице, а не только в данных: наследник без
 * изменений обязан выглядеть так же, как родитель, во всех приёмах оболочки и в обеих схемах, а
 * наследник с одним изменённым полем — отличаться ровно им.
 */
const body = [
  '# Theme inheritance',
  '',
  'Opening paragraph of the page.',
  '',
  '::::actions',
  '::action[Primary action]{href="#one" kind="primary"}',
  '::::',
  '',
  '::::::section{title="Hero chapter" id="one" recipe="hero" transition="reveal"}',
  'The hero chapter.',
  '::::::',
  '',
  '::::::section{title="Cards" id="two" tone="soft" transition="reveal"}',
  ':::::cards',
  '::::card{title="Linked card" href="#one"}',
  'Goes somewhere.',
  '::::',
  '::::card{title="Plain card"}',
  'Stays here.',
  '::::',
  ':::::',
  '::::::',
  '',
].join('\n');

function source(theme: string): string {
  return [
    '---',
    'title: Theme inheritance',
    'language: en',
    'layout: landing',
    theme,
    '---',
    '',
    body,
  ].join('\n');
}

async function build(root: string, name: string, frontmatterTheme: string): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'report.md'), source(frontmatterTheme));
  const output = path.join(root, `${name}.html`);
  await buildReport({ input: directory, output });
  return pathToFileURL(output).href;
}

const PROPERTIES = [
  ['body', null, 'backgroundColor'],
  ['body', null, 'backgroundImage'],
  ['body', null, 'fontFamily'],
  ['body', null, 'letterSpacing'],
  ['h1', null, 'fontFamily'],
  ['h1', null, 'fontWeight'],
  ['h1', null, 'letterSpacing'],
  ['h1', '::before', 'content'],
  ['.semantic-section-title', null, 'borderBottomWidth'],
  ['.semantic-section-title', null, 'borderLeftWidth'],
  ['.semantic-section-title', '::after', 'animationName'],
  ['#two', null, 'backgroundColor'],
  ['#one', null, 'boxShadow'],
  ['.semantic-card[data-linked-card]', null, 'borderLeftWidth'],
  ['.semantic-action[data-kind="primary"]', null, 'backgroundColor'],
  ['.topbar', null, 'backdropFilter'],
  ['.sidebar', null, 'borderRightWidth'],
] as const;

async function computed(page: Page, url: string, scheme: string): Promise<Record<string, string>> {
  await page.goto(url);
  await page.locator('html').evaluate((element, value) => {
    element.dataset.scheme = value;
  }, scheme);
  return page.evaluate((properties) => {
    const out: Record<string, string> = {};
    for (const [selector, pseudo, property] of properties) {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`Missing ${selector}`);
      out[`${selector}${pseudo ?? ''}.${property}`] = String(
        getComputedStyle(element, pseudo)[property as keyof CSSStyleDeclaration],
      );
    }
    return out;
  }, PROPERTIES);
}

test('a theme extending a built-in theme renders exactly like it until it changes a field', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const root = path.resolve('test-results/e2e-theme-engine');
  await rm(root, { recursive: true, force: true });

  for (const name of BUILT_IN_THEME_NAMES) {
    const parent = await build(root, `${name}-parent`, `theme: ${name}`);
    const child = await build(
      root,
      `${name}-child`,
      `theme:\n  extends: ${name}\n  name: ${name}-child`,
    );
    const changed = await build(
      root,
      `${name}-changed`,
      `theme:\n  extends: ${name}\n  name: ${name}-changed\n  colors:\n    light:\n      surface: '#fafafa'\n    dark:\n      surface: '#101010'`,
    );
    for (const scheme of ['light', 'dark'] as const) {
      const expected = await computed(page, parent, scheme);
      expect(await computed(page, child, scheme), `${name}/${scheme}`).toEqual(expected);
      const differing = Object.entries(await computed(page, changed, scheme))
        .filter(([key, value]) => expected[key] !== value)
        .map(([key]) => key);
      // Тема «только тёмная» рисует тёмную палитру и в светлой схеме.
      expect(differing, `${name}/${scheme}`).toEqual(['#two.backgroundColor']);
    }
  }
});

test('changing one field of a theme file changes the built page without any CSS', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve('test-results/e2e-theme-engine/detector');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.md'), source('theme: look.yaml\nscheme: light'));
  const output = path.join(root, '..', 'detector.html');
  const background = async (): Promise<string> => {
    await buildReport({ input: root, output });
    await page.goto(pathToFileURL(output).href);
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  };
  await writeFile(
    path.join(root, 'look.yaml'),
    'extends: blueprint\ncolors:\n  light:\n    background: "#f0f3f7"\n',
  );
  expect(await background()).toBe('rgb(240, 243, 247)');
  await writeFile(
    path.join(root, 'look.yaml'),
    'extends: blueprint\ncolors:\n  light:\n    background: "#f7f0e8"\n',
  );
  expect(await background()).toBe('rgb(247, 240, 232)');
});
