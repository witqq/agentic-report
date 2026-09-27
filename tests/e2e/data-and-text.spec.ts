import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Data and text in the browser, on the shipped `run-report` example: figures, cards, chart points and
 * table rows come from its JSON export; numbers agree with their nouns and times carry their zone in both
 * languages; the source line stands under its block; the message mock is an ordered, labelled list with
 * its illustrative mark; the typographic roles take their look from the theme; print keeps all of it; a
 * public build declares its language alternates. Nothing here moves, so no clock is needed.
 */
const root = path.resolve('test-results/e2e-data-and-text');

async function buildExample(name: string, options: { url?: string } = {}): Promise<string> {
  // Each browser project owns a separate copy so one profile cannot overwrite another's artifact.
  const target = path.join(root, test.info().project.name, name);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(path.resolve('examples/run-report'), path.join(target, 'source'), { recursive: true });
  const output = path.join(target, 'page.html');
  await buildReport({ input: path.join(target, 'source'), output, ...options });
  return pathToFileURL(output).href;
}

let pageUrl = '';
let publicUrl = '';

test.beforeAll(async () => {
  pageUrl = await buildExample('run-report');
  publicUrl = await buildExample('run-report-public', { url: 'https://example.com/run/' });
});

test.describe('english', () => {
  test.use({ locale: 'en-US' });

  // Defect: a placeholder, an `each` or an `expect` reaches the page instead of the data.
  test('writes every figure, card, chart point and row from the export', async ({ page }) => {
    await page.goto(pageUrl);
    const main = page.locator('main');
    await expect(main).not.toContainText('{{');
    await expect(page.locator('[data-semantic="each"], [data-semantic="expect"]')).toHaveCount(0);
    await expect(main.getByText('Run 96 finished with 0 findings.')).toBeVisible();
    await expect(page.locator('#result [data-semantic="card"]:visible')).toHaveCount(5);
    await expect(page.locator('#time table tbody tr:visible')).toHaveCount(5);
    await expect(page.locator('#time table tbody tr:visible').nth(2)).toContainText('Review');
    await expect(
      page.locator('#time svg [data-value], #time svg .visualization-bar'),
    ).not.toHaveCount(0);
    // Plural forms and the no-break space the build writes between the number and the noun.
    const plural = page.locator('#result .semantic-plural').first();
    await expect(plural).toHaveText('4 returns');
    await expect(page.locator('#result [data-semantic="card"]:visible').first()).toContainText(
      '3 items',
    );
    await expect(page.locator('#result [data-semantic="card"]:visible').nth(4)).toContainText(
      '1 item',
    );
    const moment = page.locator('#result time.semantic-time');
    await expect(moment).toHaveAttribute('datetime', '2026-09-24T22:17:00Z');
    await expect(moment).toContainText('GMT+3');
  });

  // Defect: the source line floats away from its block or loses its date; captions ignore the theme.
  test('sets the source line under its block with its date, in the theme caption face', async ({
    page,
  }) => {
    await page.goto(pageUrl);
    const line = page.locator('#result .semantic-source-line');
    await expect(line).toContainText('Source: Moira export of run 96, 212 records');
    await expect(line.locator('time')).toHaveAttribute('datetime', '2026-09-24T22:17:00Z');
    const cards = await page.locator('#result .semantic-cards:visible').boundingBox();
    const box = await line.boundingBox();
    if (cards === null || box === null) throw new Error('Missing geometry.');
    // The line tucks under its block by a small negative margin, never into it.
    expect(box.y).toBeGreaterThanOrEqual(cards.y + cards.height - 8);
    expect(box.y - (cards.y + cards.height)).toBeLessThan(40);
    expect(await line.evaluate((element) => getComputedStyle(element).fontStyle)).toBe('italic');
    // The chart caption follows the same caption role of the theme.
    const caption = page.locator('#time figcaption').first();
    expect(await caption.evaluate((element) => getComputedStyle(element).fontStyle)).toBe('italic');
  });

  // Defect: a mock without accessible structure, without its illustrative mark, or with both sides alike.
  test('renders the conversation as a labelled ordered list with the illustrative mark', async ({
    page,
  }) => {
    await page.goto(pageUrl);
    const conversation = page.getByRole('figure', { name: 'Moira notifications' });
    await expect(conversation).toBeVisible();
    await expect(conversation.getByRole('listitem')).toHaveCount(2);
    await expect(conversation.locator('.semantic-illustrative')).toHaveText('Illustrative');
    await expect(
      conversation.getByRole('article', { name: 'Message from Moira, 01:17' }),
    ).toBeVisible();
    const incoming = await conversation.locator('.semantic-message').first().boundingBox();
    const outgoing = await conversation.locator('.semantic-message[data-side="out"]').boundingBox();
    if (incoming === null || outgoing === null) throw new Error('Missing geometry.');
    expect(outgoing.x).toBeGreaterThan(incoming.x);
    expect(outgoing.x + outgoing.width).toBeGreaterThan(incoming.x + incoming.width);
    const colours = await conversation
      .locator('.semantic-message')
      .evaluateAll((messages) =>
        messages.map((message) => getComputedStyle(message).backgroundColor),
      );
    expect(colours[0]).not.toBe(colours[1]);
  });

  // Defect: the eyebrow sits under the section title, or the roles fall back to plain body text.
  test('places the eyebrow above the section title and styles the roles from the theme', async ({
    page,
  }) => {
    await page.goto(pageUrl);
    const eyebrow = page.locator('#result .semantic-eyebrow');
    const title = page.locator('#result .semantic-section-title');
    const eyebrowBox = await eyebrow.boundingBox();
    const titleBox = await title.boundingBox();
    if (eyebrowBox === null || titleBox === null) throw new Error('Missing geometry.');
    expect(eyebrowBox.y).toBeLessThan(titleBox.y);
    const styles = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`Missing ${selector}`);
        return getComputedStyle(element);
      };
      const paragraph = read('#result .semantic-muted').color;
      const body = getComputedStyle(
        document.querySelector('#result .semantic-muted')?.parentElement ?? document.body,
      ).color;
      return {
        caps: read('#result .semantic-eyebrow').fontVariantCaps,
        muted: paragraph,
        body,
        meta: read('#result .semantic-meta').fontFamily,
        text: read('#result .semantic-muted').fontFamily,
      };
    });
    expect(styles.caps).toBe('all-small-caps');
    expect(styles.muted).not.toBe(styles.body);
    expect(styles.meta).not.toBe(styles.text);
  });

  // Defect: print drops the source line or the messages, which carry facts the reader needs.
  test('keeps the source lines and messages in print', async ({ page }) => {
    await page.goto(pageUrl);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.semantic-source-line:visible')).toHaveCount(3);
    for (const line of await page.locator('.semantic-source-line:visible').all())
      await expect(line).toBeVisible();
    await expect(page.locator('.semantic-message').first()).toBeVisible();
    await expect(page.locator('.semantic-illustrative')).toBeVisible();
  });

  // Defect: a multilingual public page without language alternates for search engines.
  test('declares hreflang alternates for a public multilingual page', async ({ page }) => {
    await page.goto(publicUrl);
    const alternates = await page
      .locator('head link[rel="alternate"][hreflang]')
      .evaluateAll((links) =>
        links.map((link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`),
      );
    expect(alternates).toEqual([
      'en https://example.com/run/',
      'ru https://example.com/run/',
      'x-default https://example.com/run/',
    ]);
    await page.goto(pageUrl);
    await expect(page.locator('head link[rel="alternate"][hreflang]')).toHaveCount(0);
  });
});

test.describe('russian', () => {
  test.use({ locale: 'ru-RU' });

  // Defect: the Russian variant takes English plural rules, or dates in English.
  test('agrees Russian nouns with their numbers and writes the date in Russian', async ({
    page,
  }) => {
    await page.goto(pageUrl);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    const cards = page.locator('#result [data-semantic="card"]:visible');
    await expect(cards.nth(0)).toContainText('3 пункта');
    await expect(cards.nth(2)).toContainText('10 пунктов');
    await expect(cards.nth(3)).toContainText('21 пункт,');
    await expect(cards.nth(3)).toContainText('1 возврат');
    await expect(page.locator('#result .semantic-plural').first()).toHaveText('4 возврата');
    await expect(page.locator('#result time.semantic-time')).toContainText('25 сентября 2026');
    await expect(page.locator('#result .semantic-source-line')).toContainText('Источник:');
    await expect(page.locator('.semantic-illustrative')).toHaveText('Иллюстрация');
  });
});
