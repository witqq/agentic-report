import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Презентация: листается клавиатурой, щелчком и адресом, открывает шаги, прячет заметки от зрителя,
 * печатает слайд на лист, не прокручивается вбок на узком экране и пригодна для съёмки — слайд и шаг
 * адресуются снаружи, вид без оболочки, длительности переходов объявлены и соблюдаются, признак
 * «переход завершён» наблюдаем, а кадры повторяются.
 */
test.use({ video: 'off', trace: 'off' });

async function buildDeck(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-presentation', project);
  await rm(root, { recursive: true, force: true });
  await cp(path.resolve('tests/fixtures/presentation-tools'), path.join(root, 'source'), {
    recursive: true,
  });
  await buildReport({ input: path.join(root, 'source'), output: path.join(root, 'deck.html') });
  return pathToFileURL(path.join(root, 'deck.html')).href;
}

interface SlideState {
  readonly slide: number;
  readonly step: number;
  readonly steps: number;
  readonly duration: number;
  readonly settled: boolean;
}

const state = (page: Page): Promise<SlideState> =>
  page.evaluate(() =>
    (Reflect.get(window, 'agenticSlides') as { state: () => SlideState }).state(),
  );
const settled = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (Reflect.get(window, 'agenticSlides') as { settled: () => Promise<void> }).settled(),
  );

/** Доля различающихся пикселей двух снимков; сравнение идёт в браузере по данным холста. */
async function difference(page: Page, first: Buffer, second: Buffer): Promise<number> {
  if (first.equals(second)) return 0;
  return page.evaluate(
    async ([a, b]) => {
      const load = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('No 2D context');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [left, right] = await Promise.all([load(a ?? ''), load(b ?? '')]);
      let changed = 0;
      for (let index = 0; index < left.length; index += 4) {
        if (
          Math.abs((left[index] ?? 0) - (right[index] ?? 0)) > 2 ||
          Math.abs((left[index + 1] ?? 0) - (right[index + 1] ?? 0)) > 2 ||
          Math.abs((left[index + 2] ?? 0) - (right[index + 2] ?? 0)) > 2
        )
          changed += 1;
      }
      return changed / (left.length / 4);
    },
    [first.toString('base64'), second.toString('base64')],
  );
}

test('slides turn by keyboard, click and address and reveal their steps', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 800 });
  const url = await buildDeck(testInfo.project.name);
  await page.goto(url);
  await settled(page);
  expect(await state(page)).toMatchObject({ slide: 1, step: 0 });
  await expect(page.locator('section[data-slide-current] h1')).toHaveText('Presentation tools');

  await page.keyboard.press('ArrowRight');
  await settled(page);
  expect(await state(page)).toMatchObject({ slide: 2 });
  await expect(page).toHaveURL(/#\/2\/0$/u);
  await expect(page.locator('section[data-slide-current] .semantic-diagram')).toBeVisible();

  await page.locator('section[data-slide-current] h2').click();
  await settled(page);
  expect(await state(page)).toMatchObject({ slide: 3 });

  await page.keyboard.press('ArrowLeft');
  await settled(page);
  expect(await state(page)).toMatchObject({ slide: 2 });

  await page.goto(`${url}#/6/0`);
  await settled(page);
  const appears = page.locator('section[data-slide-current] .semantic-appear');
  await expect(appears.nth(0)).toBeHidden();
  await page.keyboard.press('Space');
  await settled(page);
  await expect(appears.nth(0)).toBeVisible();
  await expect(appears.nth(1)).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await settled(page);
  await expect(appears.nth(1)).toBeVisible();
  expect(await state(page)).toMatchObject({ slide: 6, step: 2, steps: 2 });
  await page.keyboard.press('ArrowLeft');
  await settled(page);
  await expect(appears.nth(1)).toBeHidden();

  // Заметки докладчика зрителю не видны; вид докладчика показывает их под слайдом.
  await expect(page.locator('section[data-slide-current] .semantic-notes')).toBeHidden();
  await page.goto(`${url.replace('deck.html', 'deck.html?view=presenter')}#/6/0`);
  await settled(page);
  await expect(page.locator('section[data-slide-current] .semantic-notes')).toBeVisible();
});

test('tools of other categories work on slides', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 800 });
  const url = await buildDeck(`${testInfo.project.name}-tools`);
  await page.goto(`${url}#/3/0`);
  await settled(page);
  await expect(page.locator('section[data-slide-current] video')).toBeVisible();
  await page.goto(`${url}#/4/0`);
  await settled(page);
  const option = page.getByRole('radio', { name: 'Two' });
  await option.check();
  await expect(option).toBeChecked();
  expect(await state(page)).toMatchObject({ slide: 4 });
  // Сцена по шагам на слайде не закрепляется: такты идут подряд.
  await page.goto(`${url}#/5/0`);
  await settled(page);
  await expect(page.locator('section[data-slide-current][data-scene-live]')).toHaveCount(0);
  await expect(page.locator('section[data-slide-current] .semantic-beat')).toHaveCount(2);
});

test('reduced motion shows every step at once and turns without transitions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const url = await buildDeck(`${testInfo.project.name}-reduced`);
  await page.goto(`${url}#/6/0`);
  await settled(page);
  for (const appear of await page.locator('section[data-slide-current] .semantic-appear').all())
    await expect(appear).toBeVisible();
  expect(await state(page)).toMatchObject({ steps: 0, duration: 0 });
  await page.keyboard.press('ArrowLeft');
  expect(await state(page)).toMatchObject({ slide: 5, duration: 0, settled: true });
});

test('print puts every slide on its own page and hides the notes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const url = await buildDeck(`${testInfo.project.name}-print`);
  await page.goto(url);
  await settled(page);
  await page.emulateMedia({ media: 'print' });
  const slides = await page.locator('article > section[data-slide]').evaluateAll((sections) =>
    sections.map((section) => ({
      visible: getComputedStyle(section).visibility === 'visible',
      position: getComputedStyle(section).position,
      breakAfter: getComputedStyle(section).breakAfter,
    })),
  );
  expect(slides).toHaveLength(6);
  for (const slide of slides)
    expect(slide).toEqual({ visible: true, position: 'static', breakAfter: 'page' });
  await expect(page.locator('.semantic-notes').first()).toBeHidden();
  const pdf = await page.pdf({ format: 'A4', landscape: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/gu) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(6);
});

test('slides do not scroll sideways on a narrow screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 400, height: 800 });
  const url = await buildDeck(`${testInfo.project.name}-narrow`);
  for (let slide = 1; slide <= 6; slide += 1) {
    await page.goto(`${url}#/${slide}/0`);
    await settled(page);
    const overflow = await page.evaluate(() => {
      const current = document.querySelector<HTMLElement>('section[data-slide-current]');
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        slide: current === null ? 0 : current.scrollWidth - current.clientWidth,
      };
    });
    expect(overflow, `slide ${slide}`).toEqual({ page: 0, slide: 0 });
  }
});

test('a film view is addressable, chrome-free, repeatable and signals the end of every transition', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1280, height: 720 });
  const url = `${(await buildDeck(`${testInfo.project.name}-film`)).replace('deck.html', 'deck.html?view=film')}`;
  const frames = async (): Promise<Buffer[]> => {
    const shots: Buffer[] = [];
    for (const address of ['#/1/0', '#/2/0', '#/6/1', '#/6/2']) {
      await page.goto(`${url}${address}`);
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      shots.push(await page.screenshot());
    }
    return shots;
  };
  const first = await frames();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.slide-controls')).toBeHidden();
  const second = await frames();
  for (const [index, frame] of first.entries()) {
    expect(
      await difference(page, frame, second[index] ?? Buffer.alloc(0)),
      `frame ${index}`,
    ).toBeLessThanOrEqual(0.001);
  }

  // Листание в одной загрузке, как при записи: команда снимает признак «завершено», признак
  // появляется через объявленную длительность, и кадр совпадает с прямой загрузкой того же адреса.
  await page.goto(`${url}#/1/0`);
  await settled(page);
  const declared: number[] = [];
  const references = [second[1], undefined, undefined];
  for (const [index, command] of (['next', 'next', 'next'] as const).entries()) {
    const measured = await page.evaluate(async (name) => {
      const slides = Reflect.get(window, 'agenticSlides') as {
        next: () => void;
        state: () => SlideState;
        settled: () => Promise<void>;
      };
      const started = performance.now();
      if (name === 'next') slides.next();
      const immediately = slides.state();
      await slides.settled();
      return { immediately, elapsed: performance.now() - started, after: slides.state() };
    }, command);
    declared.push(measured.immediately.duration);
    if (measured.immediately.duration > 0) {
      expect(measured.immediately.settled, `command ${index}`).toBe(false);
      expect(
        Math.abs(measured.elapsed - measured.immediately.duration),
        `command ${index}`,
      ).toBeLessThanOrEqual(60);
    }
    expect(measured.after.settled).toBe(true);
    const reference = references[index];
    if (reference !== undefined) {
      expect(await difference(page, await page.screenshot(), reference)).toBeLessThanOrEqual(0.001);
    }
  }
  const again: number[] = [];
  for (let slide = 1; slide <= 6; slide += 1)
    again.push(
      await page.evaluate(
        (index) =>
          (
            Reflect.get(window, 'agenticSlides') as { durationOf: (value: number) => number }
          ).durationOf(index),
        slide,
      ),
    );
  expect(declared).toEqual(again.slice(1, 4));
  expect(declared.every((duration) => duration > 0)).toBe(true);
});
