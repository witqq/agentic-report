import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Первый экран лендинга и формы драматургии: над заголовком лендинга нет рамки навигации, а
 * порядок оболочки прежний; первый экран с продуктом помещается в первые 900 px целиком; формы
 * каталога видны и неподвижны при уменьшенном движении; сравнение «до/после» управляется указателем
 * и клавиатурой; главы страницы отмечаются полосой в верхней панели.
 */
const generated = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;
const siteRoot = path.resolve('test-results/e2e-site');
const routes = (
  JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
    readonly routes: readonly { readonly href: string; readonly kind: string }[];
  }
).routes.filter((route) => route.kind === 'page');

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('no landing page stands a navigation frame above its title, and the shell order is unchanged', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  let landings = 0;
  for (const route of routes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pathToFileURL(path.join(siteRoot, route.href)).href);
    if ((await page.locator('html').getAttribute('data-layout')) !== 'landing') continue;
    landings += 1;
    const observation = await page.evaluate(() => {
      const title = document.querySelector('article h1')?.getBoundingClientRect();
      const frames = [...document.querySelectorAll<HTMLElement>('.sidebar, [data-navigation]')]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return getComputedStyle(element).display !== 'none' && box.width > 0 && box.height > 0;
        })
        .map((element) => element.getBoundingClientRect());
      const main = document.querySelector('main');
      const shell = ['.topbar', '.sidebar'].map((selector) => {
        const element = document.querySelector(selector);
        return element !== null && main !== null
          ? (element.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          : false;
      });
      return {
        titleBottom: title?.bottom ?? 0,
        framesAbove: frames.filter(
          (box) =>
            box.top < (title?.bottom ?? 0) &&
            box.top < 900 &&
            box.left < innerWidth / 2 &&
            box.width > innerWidth / 2,
        ).length,
        sideFrames: frames.filter((box) => box.width <= innerWidth / 2).length,
        shellBeforeMain: shell,
      };
    });
    expect(observation.framesAbove, route.href).toBe(0);
    expect(observation.shellBeforeMain, route.href).toEqual([true, true]);
    await page.setViewportSize({ width: 400, height: 900 });
    expect(await horizontalOverflow(page), route.href).toBeLessThanOrEqual(0);
  }
  expect(landings).toBeGreaterThan(3);
});

test('a first-screen demo fits the first 900 pixels beside the title', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(generated('starter-landing'));
  const boxes = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    return {
      title: box('.page-opening-copy > h1'),
      demo: box('.page-opening > section[data-place="opening"]'),
    };
  });
  expect(boxes.title).toBeDefined();
  expect(boxes.demo).toBeDefined();
  expect(boxes.demo?.top).toBeGreaterThanOrEqual(0);
  expect(boxes.demo?.bottom).toBeLessThanOrEqual(900);
  // Демо стоит рядом с заголовком, а не под ним.
  expect(boxes.demo?.left).toBeGreaterThan(boxes.title?.right ?? 0);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.setViewportSize({ width: 400, height: 900 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('a tall native opening preserves its drawing without pushing the title and action below the fold', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = testInfo.outputPath('tall-native-opening');
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'report.md');
  const output = path.join(root, 'page.html');
  const nodes = Array.from(
    { length: 14 },
    (_, index) =>
      `::node{id="step-${index}" label="Step ${index + 1}" detail="Inspect the evidence"}`,
  ).join('\n');
  const edges = Array.from(
    { length: 13 },
    (_, index) => `::edge{from="step-${index}" to="step-${index + 1}"}`,
  ).join('\n');
  await writeFile(
    source,
    `---
title: Inspect evidence
layout: landing
motion: none
---

# Inspect evidence

Read the original evidence and choose the next step.

:::actions
::action[Inspect source]{href="#source" kind="primary"}
:::

:::::section{title="Evidence flow" id="source" place="opening"}
::::diagram{title="Fourteen steps" description="A tall native drawing remains complete beside its introduction." layout="down"}
${nodes}
${edges}
::::
:::::
`,
  );
  await buildReport({ input: source, output });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pathToFileURL(output).href);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const opening = document.querySelector('.page-opening');
      const title = document.querySelector('.page-opening-copy > h1');
      const action = document.querySelector('.page-opening-copy .semantic-action');
      const frame = [...document.querySelectorAll('#source .visualization-frame')].find(
        (element) => element.getBoundingClientRect().width > 1,
      );
      const svg = frame?.querySelector('svg');
      if (!opening || !title || !action || !frame || !svg)
        throw new Error('Missing native opening');
      const bounds = frame.getBoundingClientRect();
      return {
        titleTop: title.getBoundingClientRect().top,
        openingTop: opening.getBoundingClientRect().top,
        actionBottom: action.getBoundingClientRect().bottom,
        drawingHeight: svg.getBoundingClientRect().height,
        frameOverflow: frame.scrollHeight - frame.clientHeight,
        clippedLabels: [...svg.querySelectorAll('text')].filter((label) => {
          const box = label.getBoundingClientRect();
          return box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1;
        }).length,
        copyBeforeResult:
          (title.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      };
    });
    // Catches: centring copy beside a tall drawing moves the title/action out of the initial viewport;
    // height-cropping the drawing would superficially fix that position while losing authored evidence.
    expect(Math.abs(geometry.titleTop - geometry.openingTop)).toBeLessThanOrEqual(1);
    expect(geometry.titleTop).toBeGreaterThanOrEqual(0);
    expect(geometry.actionBottom).toBeLessThanOrEqual(900);
    expect(geometry.drawingHeight).toBeGreaterThan(900);
    expect(geometry.frameOverflow).toBeLessThanOrEqual(1);
    expect(geometry.clippedLabels).toBe(0);
    expect(geometry.copyBeforeResult).toBe(true);
  }
});

for (const width of [1440, 400]) {
  test(`dramaturgy forms read at ${width}px with reduced motion`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(generated('layout-mixed'));
    for (const id of ['demo', 'thesis', 'story', 'compare', 'blueprint', 'quote', 'figure']) {
      const section = page.locator(`section#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section, id).toBeVisible();
      const state = await section.evaluate((element) => {
        const style = getComputedStyle(element);
        const children = [...element.children].map((child) => getComputedStyle(child));
        return {
          opacity: style.opacity,
          transform: style.transform,
          childrenStill: children.every(
            (child) =>
              child.opacity === '1' && (child.transform === 'none' || child.transform === ''),
          ),
        };
      });
      expect(state, id).toEqual({ opacity: '1', transform: 'none', childrenStill: true });
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test('before and after follows the pointer and the keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(generated('layout-mixed'));
  const figure = page.locator('#compare [data-compare]');
  const stage = figure.locator('[data-compare-stage]');
  const range = figure.getByRole('slider');
  await stage.scrollIntoViewIfNeeded();
  await expect(range).toHaveAccessibleName('Divider between Wireframe and Built page');
  const box = await stage.boundingBox();
  if (box === null) throw new Error('No compare stage.');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(range).toHaveValue('25');
  const clip = () =>
    figure.locator('.compare-after').evaluate((element) => getComputedStyle(element).clipPath);
  expect(await clip()).toContain('25%');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(range).toHaveValue('70');
  await range.focus();
  for (let press = 0; press < 5; press += 1) await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('75');
  expect(await clip()).toContain('75%');
});

test('chapters fill as the reader moves through them and jump on click', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(generated('cinematic-story'));
  const chapters = await page.locator('article > section[data-semantic="section"][id]').count();
  const segments = page.locator('[data-chapter-progress] .chapter-progress-segment');
  await expect(segments).toHaveCount(chapters);
  const fills = () =>
    segments.evaluateAll((items) =>
      items.map((item) => Number(getComputedStyle(item).getPropertyValue('--chapter-fill'))),
    );
  expect((await fills()).at(-1)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await fills()).every((fill) => fill === 1)).toBe(true);
  await segments.first().click();
  await expect(page).toHaveURL(/#/u);
  await expect.poll(async () => (await fills()).at(-1)).toBe(0);
});
