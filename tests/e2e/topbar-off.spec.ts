import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';
import { addBuiltInThemes, BUILT_IN_THEME_ATTRIBUTES } from './themes.js';

/**
 * `topbar: false` builds a page to be filmed as a scene: no top bar, nothing reserved above the
 * content, anchors and the current contents entry still measured from the top edge. The same page
 * without the key keeps its bar, so a bar that disappeared everywhere fails here too.
 */
const root = path.resolve('test-results/e2e-topbar-off');
const layouts = ['document', 'landing'] as const;
const url = (name: string): string => pathToFileURL(path.join(root, `${name}.html`)).href;

function page(layout: string, topbar: boolean): string {
  const chapters = [1, 2, 3, 4]
    .map((index) => `## Chapter ${index}\n\n${'A sentence of the chapter. '.repeat(90)}\n`)
    .join('\n');
  return `---\ntitle: Scene\nlanguage: en\nlayout: ${layout}\n${topbar ? '' : 'topbar: false\n'}---\n\n# Scene\n\nIntroduction.\n\n${chapters}`;
}

test.beforeAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const layout of layouts) {
    for (const topbar of [false, true]) {
      const name = `${layout}-${topbar ? 'bar' : 'none'}`;
      const source = path.join(root, `${name}-source`);
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'report.md'), page(layout, topbar));
      await buildReport({ input: source, output: path.join(root, `${name}.html`) });
    }
  }
});

/** Top of the content column (inside the shell's padding) and of the page heading, at scroll 0. */
async function tops(target: Page): Promise<{ content: number; heading: number }> {
  return target.evaluate(() => {
    scrollTo(0, 0);
    const top = (selector: string): number =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN;
    return { content: top('.report-content'), heading: top('article > h1') };
  });
}

for (const layout of layouts) {
  test(`${layout}: topbar false leaves no bar and no empty band above the content in every built-in theme and scheme`, async ({
    page,
  }) => {
    // Defect caught: the bar still rendered, or its height (or the shell's top padding) still
    // reserved above the first content in some theme, scheme or width.
    await page.goto(url(`${layout}-none`));
    await addBuiltInThemes(page);
    expect(await page.locator('.topbar').count()).toBe(0);
    await expect(page.locator('html')).toHaveAttribute('data-topbar', 'none');
    for (const scheme of ['light', 'dark'] as const) {
      for (const { name, attributes } of BUILT_IN_THEME_ATTRIBUTES) {
        await page.locator('html').evaluate(
          (element, state) => {
            for (const [key, value] of Object.entries(state.attributes))
              element.setAttribute(key, value);
            element.dataset.scheme = state.scheme;
          },
          { attributes, scheme },
        );
        const measured = await tops(page);
        expect(Math.abs(measured.content), `${name} ${scheme} content`).toBeLessThanOrEqual(1);
        expect(measured.heading, `${name} ${scheme} heading`).toBeLessThan(80);
      }
    }
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.topbar').count()).toBe(0);
    expect(Math.abs((await tops(page)).content)).toBeLessThanOrEqual(1);
  });

  test(`${layout}: the same page without the key keeps its top bar above the content`, async ({
    page,
  }) => {
    // Defect caught: the key's effect leaking into ordinary pages.
    await page.goto(url(`${layout}-bar`));
    await expect(page.locator('.topbar')).toBeVisible();
    expect(await page.locator('html').getAttribute('data-topbar')).toBeNull();
    const bar = await page
      .locator('.topbar')
      .evaluate((element) => element.getBoundingClientRect());
    expect(bar.top).toBeLessThanOrEqual(1);
    expect((await tops(page)).heading).toBeGreaterThanOrEqual(bar.bottom);
  });
}

test('an anchor lands at the top edge and the contents follow the reader without the bar', async ({
  page,
}, testInfo) => {
  // Defect caught: the anchor offset still reserving the bar's height (a band above the heading), or
  // the navigation runtime giving up without the bar and leaving the current contents entry stale.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${url('document-none')}#chapter-3`);
  await expect
    .poll(() =>
      page.locator('#chapter-3').evaluate((heading) => heading.getBoundingClientRect().top),
    )
    .toBeLessThan(24);
  expect(
    await page.locator('#chapter-3').evaluate((heading) => heading.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0);
  if (testInfo.project.name === 'desktop-chromium') {
    await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveText(
      'Chapter 3',
    );
    await page.locator('[data-navigation] a[href="#chapter-1"]').click();
    await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveText(
      'Chapter 1',
    );
    await expect
      .poll(() =>
        page.locator('#chapter-1').evaluate((heading) => heading.getBoundingClientRect().top),
      )
      .toBeLessThan(24);
  }
});
