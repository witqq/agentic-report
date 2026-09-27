import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/** Начало лендинга: заголовок, вводный абзац и сразу под ними группа действий с заданным размещением. */
function landingSource(placement: string, preset?: string): string {
  return [
    '---',
    'title: Opening actions',
    'language: en',
    'layout: landing',
    ...(preset === undefined ? [] : [`theme: ${preset}`]),
    '---',
    '',
    '# Your agent makes the product film.',
    '',
    '**Give an AI agent the product and the point.**',
    '',
    `::::actions{placement="${placement}"}`,
    '::action[Give it to your agent]{href="#start" kind="primary"}',
    '::action[Watch the films]{href="#start" kind="secondary"}',
    '::::',
    '',
    '::::::section{title="Start" id="start"}',
    'The rest of the page.',
    '::::::',
    '',
    '::::::section{title="Next" id="next"}',
    'A second section gives the page its navigation.',
    '::::::',
    '',
  ].join('\n');
}

const pages = {
  auto: landingSource('auto'),
  inline: landingSource('inline'),
  edge: landingSource('edge'),
  editorial: landingSource('auto', 'blueprint'),
} as const;

type PageName = keyof typeof pages;

async function buildPages(project: string): Promise<Record<PageName, string>> {
  const root = path.resolve('test-results/e2e-opening-actions', project);
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

/**
 * Горизонтальные границы заголовка, его текста и видимой рамки группы действий: у нижней панели
 * это сама панель с фоном и рамкой, у остальных размещений — общая рамка кнопок.
 */
async function openingGeometry(page: Page): Promise<{
  readonly headingCenter: number;
  readonly headingTextLeft: number;
  readonly headingAlign: string;
  readonly actionsLeft: number;
  readonly actionsRight: number;
  readonly contentRight: number;
  readonly leadRight: number;
}> {
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('main article > h1');
    const group = document.querySelector<HTMLElement>('main .semantic-actions');
    const content = document.querySelector<HTMLElement>('main article');
    const lead = document.querySelector<HTMLElement>('main article > h1 + p');
    if (heading === null || group === null || content === null || lead === null)
      throw new Error('Expected the landing opening.');
    const actions =
      group.dataset.placementResolved === 'bottom'
        ? [group]
        : [...group.querySelectorAll<HTMLElement>('.semantic-action')];
    const text = document.createRange();
    text.selectNodeContents(heading);
    const headingBox = heading.getBoundingClientRect();
    const boxes = actions.map((action) => action.getBoundingClientRect());
    return {
      headingCenter: headingBox.left + headingBox.width / 2,
      headingTextLeft: Math.min(...[...text.getClientRects()].map((line) => line.left)),
      headingAlign: getComputedStyle(heading).textAlign,
      actionsLeft: Math.min(...boxes.map((box) => box.left)),
      actionsRight: Math.max(...boxes.map((box) => box.right)),
      contentRight: content.getBoundingClientRect().right,
      leadRight: lead.getBoundingClientRect().right,
    };
  });
}

test.describe('landing opening actions', () => {
  let urls: Record<PageName, string>;

  test.beforeAll(async () => {
    urls = await buildPages(test.info().project.name);
  });

  test('share the axis of a centred opening unless the author asked for the edge', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['auto', 'inline'] as const) {
        await page.goto(urls[name]);
        const opening = await openingGeometry(page);
        expect(opening.headingAlign, `${name} ${width}`).toBe('center');
        const actionsCenter = (opening.actionsLeft + opening.actionsRight) / 2;
        expect(Math.abs(actionsCenter - opening.headingCenter), `${name} ${width}`).toBeLessThan(2);
      }
      // Явный запрос края — край меры чтения начала: кнопки у конца вводного абзаца, а не на оси
      // и не у дальнего края колонки, где они повисали бы отдельно от текста.
      await page.goto(urls.edge);
      const edge = await openingGeometry(page);
      expect(edge.actionsRight, String(width)).toBeGreaterThan(edge.headingCenter + 100);
      expect(Math.abs(edge.leadRight - edge.actionsRight), String(width)).toBeLessThan(24);
    }
  });

  test('stay with a start-aligned opening heading', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    // Узкий экран: заголовок лендинга выровнен по началу, и кнопки начинаются там же, где он.
    for (const width of [390, 600]) {
      await page.setViewportSize({ width, height: 844 });
      for (const name of ['auto', 'inline'] as const) {
        await page.goto(urls[name]);
        const opening = await openingGeometry(page);
        expect(opening.headingAlign, `${name} ${width}`).toBe('start');
        expect(
          Math.abs(opening.actionsLeft - opening.headingTextLeft),
          `${name} ${width}`,
        ).toBeLessThan(2);
      }
    }
    // Редакционный пресет держит начало лендинга слева и на широком экране; центровка его не трогает.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(urls.editorial);
    const editorial = await openingGeometry(page);
    expect(editorial.headingAlign).toBe('left');
    const actionsCenter = (editorial.actionsLeft + editorial.actionsRight) / 2;
    expect(Math.abs(actionsCenter - editorial.headingCenter)).toBeGreaterThan(50);
  });
});
