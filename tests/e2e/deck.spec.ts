import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Колода слайдов внутри документа: две колоды на странице, у первой шаги `appear`, заметки и переходы,
 * вторая — два простых слайда.
 */
const SOURCE = [
  '---',
  'title: Deck probe',
  'language: en',
  '---',
  '',
  '# Deck probe',
  '',
  'A paragraph of the document before the first deck, long enough to be the text column of the page.',
  '',
  '::::::::section{title="First deck" id="first"}',
  'Prose before the deck.',
  '',
  '::::::deck{title="Quarter in review" id="quarter"}',
  ':::slide',
  '## Revenue grew 18%',
  'The quarter in one line.',
  ':::',
  '',
  '::::slide{transition="push"}',
  '## Three reasons',
  '',
  ':::appear',
  '- New customers.',
  ':::',
  '',
  ':::appear{effect="fade"}',
  '- Fewer refunds.',
  ':::',
  '',
  ':::notes',
  'Mention refunds.',
  ':::',
  '::::',
  '',
  ':::slide{transition="zoom"}',
  '## Next quarter',
  '| Goal | Owner |',
  '| --- | --- |',
  '| Launch | Ana |',
  ':::',
  '::::::',
  '',
  'Prose after the deck.',
  '::::::::',
  '',
  '::::::section{title="Second deck" id="second"}',
  '::::deck',
  ':::slide',
  '## Another deck',
  'Independent from the first.',
  ':::',
  '',
  ':::slide',
  '## Its second slide',
  'Done.',
  ':::',
  '::::',
  '::::::',
  '',
].join('\n');

let url = '';

test.beforeAll(async () => {
  const root = path.resolve('test-results/e2e-deck', test.info().project.name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.md'), SOURCE);
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  url = pathToFileURL(output).href;
});

interface DeckState {
  readonly id: string;
  readonly current: string;
  readonly counter: string;
  readonly shown: number;
  readonly covering: boolean;
}

async function decks(page: Page): Promise<DeckState[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-deck]')].map((deck) => ({
      id: deck.id,
      current: [...deck.querySelectorAll<HTMLElement>('[data-slide-current]')]
        .map((slide) => slide.dataset.slide)
        .join(','),
      counter: deck.querySelector('.deck-counter')?.textContent ?? '',
      shown: deck.querySelectorAll('[data-shown]').length,
      covering: deck.hasAttribute('data-deck-covering'),
    })),
  );
}

test('pages each deck on its own with buttons and keys, step by step', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  const quarter = page.locator('#quarter');
  // Ловит: колоды делят состояние (вторая листается вместе с первой) или кнопки не листают.
  await quarter.getByRole('button', { name: 'Next slide' }).click();
  expect((await decks(page)).map(({ current }) => current)).toEqual(['1', '0']);
  expect((await decks(page))[0]?.counter).toBe('Slide 2 of 3');
  // Ловит: шаги слайда открыты сразу или клавиши не доходят до колоды в фокусе.
  expect((await decks(page))[0]?.shown).toBe(0);
  await quarter.locator('[data-deck-stage]').focus();
  await page.keyboard.press('ArrowRight');
  expect((await decks(page))[0]?.shown).toBe(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect((await decks(page))[0]).toMatchObject({ current: '2', counter: 'Slide 3 of 3' });
  await page.keyboard.press('Home');
  expect((await decks(page))[0]?.current).toBe('0');
  expect((await decks(page))[1]?.current).toBe('0');
  // Ловит: заметки докладчика видны на странице.
  await expect(quarter.locator('.semantic-notes')).toBeHidden();
});

test('opens a deck on the whole screen and leaves it on Escape with focus back', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  const quarter = page.locator('#quarter');
  await quarter.getByRole('button', { name: 'Full screen' }).click();
  // Ловит: кнопка не отдаёт колоду Fullscreen API или слайд не растёт на весь экран.
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('quarter');
  const width = await quarter
    .locator('[data-slide-current]')
    .evaluate((slide) => slide.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1300);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  // Ловит: фокус теряется после выхода, и клавиатурный читатель оказывается в начале страницы.
  await expect(quarter.getByRole('button', { name: 'Full screen' })).toBeFocused();
});

test('covers the window itself where the page cannot take the full screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(url);
  const quarter = page.locator('#quarter');
  await quarter.getByRole('button', { name: 'Full screen' }).click();
  // Ловит: без Fullscreen API (iPhone) кнопка ничего не делает.
  const box = await quarter.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 1024, height: 768 });
  expect((await decks(page))[0]?.covering).toBe(true);
  // Ловит: колода накрывает окно под верхней панелью страницы — её кнопки видны и нажимаются поверх.
  const onTop = await page.evaluate(() =>
    [
      [512, 4],
      [1016, 4],
      [8, 760],
    ].every(([x = 0, y = 0]) => document.elementFromPoint(x, y)?.closest('#quarter') !== null),
  );
  expect(onTop).toBe(true);
  // Ловит: Tab уходит из накрывшей окно колоды на невидимую страницу под ней.
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('#quarter') !== null)).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  expect((await decks(page))[0]?.covering).toBe(false);
  await expect(quarter.getByRole('button', { name: 'Full screen' })).toBeFocused();
});

test('prints every slide in sequence with every step and no controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(url);
  await page.emulateMedia({ media: 'print' });
  // Ловит: в печати остаётся только текущий слайд или скрытые шаги.
  const printed = await page.evaluate(() => {
    const visible = (element: Element): boolean =>
      getComputedStyle(element).visibility === 'visible' && element.getClientRects().length > 0;
    const slides = [...document.querySelectorAll('#quarter [data-slide]')];
    const tops = slides.map((slide) => slide.getBoundingClientRect().top);
    return {
      slides: slides.filter(visible).length,
      ordered: tops.every((top, index) => index === 0 || top > (tops[index - 1] ?? 0)),
      steps: [...document.querySelectorAll('#quarter .semantic-appear')].filter(visible).length,
      controls: [...document.querySelectorAll('.deck-controls')].filter(visible).length,
    };
  });
  expect(printed).toEqual({ slides: 3, ordered: true, steps: 2, controls: 0 });
});

test('opens every step at once and moves nothing under reduced motion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  const quarter = page.locator('#quarter');
  await quarter.getByRole('button', { name: 'Next slide' }).click();
  // Ловит: шаги ждут нажатий, а переход тянется, хотя читатель просил не двигать страницу.
  expect((await decks(page))[0]).toMatchObject({ current: '1', shown: 2 });
  expect(await quarter.getAttribute('data-slide-duration')).toBe('0');
});

test('fits a phone without sideways scroll and keeps slide text readable in the dark scheme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(url);
  const found = await page.evaluate(() => {
    const slide = document.querySelector<HTMLElement>('#quarter [data-slide-current]');
    const text = slide?.querySelector('p');
    if (slide === null || slide === undefined || text === null || text === undefined)
      throw new Error('Missing slide');
    const rgb = (value: string): number[] =>
      (value.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
    const luminance = (value: string): number => {
      const [r = 0, g = 0, b = 0] = rgb(value).map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fg = luminance(getComputedStyle(text).color);
    const bg = luminance(getComputedStyle(slide).backgroundColor);
    return {
      scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      size: Number.parseFloat(getComputedStyle(text).fontSize),
      contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
    };
  });
  // Ловит: слайд шире экрана, кегль от ширины слайда падает ниже читаемого, текст не в токенах схемы.
  expect(found.scrolls).toBe(false);
  expect(found.size).toBeGreaterThanOrEqual(13);
  expect(found.contrast).toBeGreaterThanOrEqual(4.5);
});
