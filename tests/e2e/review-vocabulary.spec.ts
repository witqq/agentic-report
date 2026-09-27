import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Словарь, добавленный категориями: дифф, находки по серьёзности и состояние карточки. На узком
 * экране страница не прокручивается вбок — широкий дифф прокручивается внутри себя; при reduced
 * motion всё видно без движения; копирование диффа даёт сам дифф, без номеров строк.
 */
const LONG_LINE = `const key = [event.id, event.type, event.account, event.region, event.createdAt].join(':'); // ${'x'.repeat(60)}`;

function source(language: 'en' | 'ru'): string {
  return [
    '---',
    'title: Review vocabulary',
    `language: ${language}`,
    'layout: document',
    '---',
    '',
    '# Review vocabulary',
    '',
    ':::diff{file="src/webhooks/handler.ts" title="Key"}',
    '```diff',
    '@@ -40,3 +40,4 @@',
    ' const verified = verify(event);',
    '-apply(event);',
    `+${LONG_LINE}`,
    '+applyOnce(key, event);',
    ' return accept(event);',
    '```',
    ':::',
    '',
    '::::findings{title="Findings"}',
    ':::finding{severity="blocking" title="The key includes the attempt counter" location="src/webhooks/handler.ts:42"}',
    'Every retry gets a new key.',
    ':::',
    ':::finding{severity="note" title="Name"}',
    'Call it `deliveryKey`.',
    ':::',
    '::::',
    '',
    '::::cards',
    ':::card{title="Build" status="good"}',
    'All checks pass.',
    ':::',
    ':::card{title="Publication" status="risk"}',
    'Blocked on credentials.',
    ':::',
    '::::',
    '',
  ].join('\n');
}

const EXPECTED_DIFF = [
  '@@ -40,3 +40,4 @@',
  ' const verified = verify(event);',
  '-apply(event);',
  `+${LONG_LINE}`,
  '+applyOnce(key, event);',
  ' return accept(event);',
].join('\n');

async function buildPage(project: string, language: 'en' | 'ru'): Promise<string> {
  const root = path.resolve('test-results/e2e-review-vocabulary', project, language);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.md'), source(language));
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  return pathToFileURL(output).href;
}

for (const language of ['en', 'ru'] as const) {
  for (const width of [320, 1280]) {
    test(`${language} diff, findings and status read at ${width}px without page overflow`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(await buildPage(`${testInfo.project.name}-${width}`, language));

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const block = page.locator('.semantic-diff pre');
      const scroll = await block.evaluate((element) => ({
        scrollable: element.scrollWidth > element.clientWidth,
        right: element.getBoundingClientRect().right,
      }));
      expect(scroll.scrollable).toBe(true);
      expect(scroll.right).toBeLessThanOrEqual(width);

      // Номера старой и новой строки видны в поле номеров и сдвигаются вместе со строкой.
      const gutters = await page
        .locator('.semantic-diff .line')
        .evaluateAll((lines) =>
          lines.map((line) => getComputedStyle(line, '::before').content.replaceAll('"', '')),
        );
      expect(gutters).toEqual(['     ', '40 40', '41   ', '   41', '   42', '42 43']);

      const summary = page.locator('.semantic-findings-summary');
      await expect(summary).toHaveAccessibleName(
        language === 'en' ? 'Findings by severity' : 'Находки по серьёзности',
      );
      await expect(summary.locator('li')).toHaveText(
        language === 'en' ? ['Blocking 1', 'Note 1'] : ['Блокирует 1', 'Заметка 1'],
      );
      await expect(page.locator('.semantic-card .semantic-status')).toHaveText(
        language === 'en' ? ['Good', 'At risk'] : ['В норме', 'Под угрозой'],
      );
      // Серьёзность и состояние названы словом, цвет метки только повторяет его.
      for (const label of await page.locator('.semantic-finding-head .semantic-severity').all()) {
        await expect(label).toBeVisible();
        expect((await label.textContent())?.trim().length).toBeGreaterThan(0);
      }
    });
  }

  test(`${language} diff copies the diff text without line numbers`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            Reflect.set(globalThis, '__copied', value);
          },
        },
      });
    });
    await page.goto(await buildPage(`${testInfo.project.name}-copy`, language));
    await page.locator('.semantic-diff [data-copy-code]').click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(globalThis, '__copied') as string | undefined))
      .toBe(EXPECTED_DIFF);
  });
}

test('review vocabulary is complete and still under reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await buildPage(`${testInfo.project.name}-reduced`, 'en'));
  for (const selector of [
    '.semantic-diff',
    '.semantic-findings',
    '.semantic-finding',
    '.semantic-card[data-status]',
  ]) {
    for (const element of await page.locator(selector).all()) {
      await expect(element).toBeVisible();
      const state = await element.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          opacity: style.opacity,
          transform: style.transform,
          animation: style.animationName,
        };
      });
      expect(state, selector).toEqual({ opacity: '1', transform: 'none', animation: 'none' });
    }
  }
});
