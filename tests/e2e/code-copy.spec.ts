import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/** Первая строка длиннее любой колонки: без отведённого места её конец ушёл бы под кнопку копирования. */
function codeSource(language: 'en' | 'ru', preset: string): string {
  return [
    '---',
    'title: Code copy',
    `language: ${language}`,
    `theme: ${preset}`,
    '---',
    '',
    '# Code copy',
    '',
    '```sh',
    'npm install --save-exact agentic-screencast@1.2.0 && npx agentic-screencast build --source story.md --out draft.mp4 --voice-json \'{"engine":"stub","name":"silent","cps":15}\' --keys-only',
    'npx agentic-screencast check draft.mp4',
    '```',
    '',
    '```sh',
    'npm install --save-exact agentic-screencast@1.2.0',
    '```',
    '',
  ].join('\n');
}

// Темы с широкой моноширинной гарнитурой меток (Martian Mono, Victor Mono): код набран гарнитурой кода темы,
// а кнопка — гарнитурой интерфейса, так что проверка держит обе роли.
const pages = {
  english: codeSource('en', 'blueprint'),
  russianEditorial: codeSource('ru', 'aurora'),
} as const;

type PageName = keyof typeof pages;

async function buildPages(project: string): Promise<Record<PageName, string>> {
  const root = path.resolve('test-results/e2e-code-copy', project);
  await rm(root, { recursive: true, force: true });
  const urls: Partial<Record<PageName, string>> = {};
  for (const [name, source] of Object.entries(pages) as [PageName, string][]) {
    await mkdir(path.join(root, name), { recursive: true });
    await writeFile(path.join(root, name, 'report.md'), source);
    const output = path.join(root, `${name}.html`);
    await buildReport({ input: path.join(root, name), output });
    urls[name] = pathToFileURL(output).href;
  }
  return urls as Record<PageName, string>;
}

/** Для каждого блока кода — пересекается ли хоть один фрагмент строки с кнопкой копирования. */
async function textUnderCopyButton(page: Page): Promise<boolean[]> {
  return page.locator('pre').evaluateAll((blocks) =>
    blocks.map((block) => {
      const button = block.querySelector<HTMLElement>(':scope > [data-copy-code]');
      const code = block.querySelector<HTMLElement>('code');
      if (button === null || code === null) throw new Error('Expected code with a copy button.');
      const control = button.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(code);
      return [...text.getClientRects()].some(
        (line) =>
          line.width > 0 &&
          line.left < control.right &&
          line.right > control.left &&
          line.top < control.bottom &&
          line.bottom > control.top,
      );
    }),
  );
}

test.describe('code copy button', () => {
  let urls: Record<PageName, string>;

  test.beforeAll(async () => {
    urls = await buildPages(test.info().project.name);
  });

  test('never covers a line of code while wide code still scrolls in its block', async ({
    page,
  }, testInfo) => {
    const widths = testInfo.project.name === 'desktop-chromium' ? [1440, 390] : [undefined];
    for (const name of Object.keys(pages) as PageName[]) {
      for (const width of widths) {
        if (width !== undefined) await page.setViewportSize({ width, height: 900 });
        await page.goto(urls[name]);
        const label = `${name} ${width ?? testInfo.project.name}`;
        await expect(page.locator('pre [data-copy-code]')).toHaveCount(2);
        expect(await textUnderCopyButton(page), label).toEqual([false, false]);

        // Широкий код прокручивается внутри своего блока, а страница остаётся в ширину экрана.
        const wide = page.locator('pre').first();
        const scroll = await wide.evaluate((block) => ({
          local: block.scrollWidth > block.clientWidth,
          root: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }));
        expect(scroll, label).toEqual({ local: true, root: false });
        await wide.evaluate((block) => {
          block.scrollLeft = block.scrollWidth;
        });
        expect(await textUnderCopyButton(page), `${label} scrolled`).toEqual([false, false]);
      }
    }
  });
});
