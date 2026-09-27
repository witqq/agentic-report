import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Словарь движения: сцена по шагам, прорисовка схемы, заголовок по строкам, досчитывающие числа и
 * WebGL-нити. При уменьшенном движении всё видно, ничего не закреплено и не сдвинуто; разбиение
 * заголовка на строки не меняет текст, поэтому заметка ревью и копирование видят прежнюю фразу.
 */
const generated = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;

async function stillState(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        opacity: style.opacity,
        transform: style.transform,
        position: style.position,
        visible: element.getBoundingClientRect().height > 0,
      };
    }),
  );
}

for (const width of [1440, 400]) {
  test(`reduced motion leaves every motion technique complete and still at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    for (const example of ['motion-showcase', 'layout-mixed']) {
      await page.goto(generated(example));
      const sections =
        example === 'motion-showcase' ? ['#steps', '#draw', '#numbers'] : ['#motion', '#threads'];
      for (const section of sections) {
        await page.locator(section).scrollIntoViewIfNeeded();
        for (const state of await stillState(
          page,
          `${section}, ${section} .scene-stage, ${section} .semantic-beat, ${section} img, ${section} .semantic-edge`,
        )) {
          expect(state.opacity, section).toBe('1');
          expect(state.transform, section).toBe('none');
          expect(state.position, section).not.toBe('sticky');
        }
        await expect(page.locator(`${section} [data-scene-live]`)).toHaveCount(0);
        await expect(page.locator(`${section}[data-title-lines]`)).toHaveCount(0);
        await expect(page.locator(`${section} canvas`)).toHaveCount(0);
      }
      const counts = page.locator('.semantic-count');
      for (const count of await counts.all()) {
        await count.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        expect(await count.textContent()).toMatch(/\d/u);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    }
  });
}

test('a steps scene pins its stage on a wide screen and switches picture and focus by beat', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(generated('motion-showcase'));
  const steps = page.locator('#steps');
  await expect(steps).toHaveAttribute('data-scene-live', '');
  const active = () => steps.locator('img[data-scene-active]').getAttribute('data-scene-frame');
  const beats = steps.locator('.semantic-beat');
  await beats.nth(0).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const beat = document.querySelectorAll<HTMLElement>('#steps .semantic-beat')[1];
    if (beat)
      window.scrollBy(
        0,
        beat.getBoundingClientRect().top + beat.offsetHeight / 2 - innerHeight / 2,
      );
  });
  await expect(beats.nth(1)).toHaveAttribute('data-current', '');
  await expect.poll(active).toBe('1');
  expect(
    await steps.locator('.scene-stage').evaluate((stage) => getComputedStyle(stage).position),
  ).toBe('sticky');

  const draw = page.locator('#draw');
  await page.evaluate(() => {
    const beat = document.querySelectorAll<HTMLElement>('#draw .semantic-beat')[2];
    if (beat)
      window.scrollBy(
        0,
        beat.getBoundingClientRect().top + beat.offsetHeight / 2 - innerHeight / 2,
      );
  });
  await expect(draw.locator('.semantic-beat').nth(2)).toHaveAttribute('data-current', '');
  const lit = await draw
    .locator('[data-layout-view]:not([hidden]) [data-node-id][data-lit]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.nodeId).sort());
  expect(lit).toEqual(['archive', 'model']);
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(steps).not.toHaveAttribute('data-scene-live', '');
});

test('a steps scene leaves no screens of emptiness on a tall or portrait monitor', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const [width, height] of [
    [1080, 1920],
    [1440, 2560],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(generated('motion-showcase'));
    for (const id of ['steps', 'draw']) {
      const scene = page.locator(`#${id}`);
      await expect(scene).toHaveAttribute('data-scene-live', '');
      const layout = await scene.evaluate((section) => {
        const text = [...section.querySelectorAll('.semantic-beat')].map((beat) => {
          const range = document.createRange();
          range.selectNodeContents(beat);
          return range.getBoundingClientRect();
        });
        const gaps = text.slice(1).map((rect, index) => rect.top - (text[index]?.bottom ?? 0));
        return { widestGap: Math.max(...gaps) };
      });
      // Между текстами тактов — не больше высоты такта (24rem) и полэкрана: рядом с закреплённой
      // сценой такты идут плотно, а не через экраны пустоты.
      expect(layout.widestGap, `${id} ${width}×${height}`).toBeLessThan(Math.min(height / 2, 384));
    }
  }
});

test('a diagram draws its connections in flow order with backward ones last', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(generated('motion-showcase'));
  const edges = await page
    .locator('#draw [data-layout-view="right"] path[data-draw-phase]')
    .evaluateAll((paths) =>
      paths.map((edge) => ({
        from: edge.getAttribute('data-from'),
        phase: edge.getAttribute('data-draw-phase'),
        start: Number.parseFloat(getComputedStyle(edge).getPropertyValue('--draw-start')),
      })),
    );
  const backward = edges.filter((edge) => edge.phase === 'backward');
  expect(backward.map((edge) => edge.from)).toEqual(['model']);
  const forwardStarts = edges.filter((edge) => edge.phase === 'forward').map((edge) => edge.start);
  expect(Math.min(...backward.map((edge) => edge.start))).toBeGreaterThan(
    Math.max(...forwardStarts),
  );
  // Пока схема ниже экрана, связи не нарисованы; когда она прошла экран — нарисованы целиком.
  const offset = () =>
    page
      .locator('#draw [data-layout-view]:not([hidden]) path[data-draw-phase][pathLength]')
      .first()
      .evaluate((edge) => Number.parseFloat(getComputedStyle(edge).strokeDashoffset));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(offset).toBeGreaterThan(0.9);
  await page.locator('#fallback').scrollIntoViewIfNeeded();
  await expect.poll(offset).toBeLessThan(0.05);
});

test('numbers count up to the written value', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(generated('motion-showcase'));
  const count = page.locator('#numbers .semantic-count').first();
  await expect(count).toHaveText('1,284');
  const seen = new Set<string>();
  await count.scrollIntoViewIfNeeded();
  for (let sample = 0; sample < 12; sample += 1) {
    seen.add((await count.textContent()) ?? '');
    await page.waitForTimeout(60);
  }
  await expect(count).toHaveText('1,284');
  expect([...seen].some((value) => value !== '1,284' && /^\d{1,3}(,\d{3})?$/u.test(value))).toBe(
    true,
  );
});

test('a title opens line by line without changing its text for review and copy', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve('test-results/e2e-motion-lines');
  await rm(root, { recursive: true, force: true });
  await cp(path.resolve('tests/fixtures/motion-lines'), path.join(root, 'source'), {
    recursive: true,
  });
  await buildReport({ input: path.join(root, 'source'), output: path.join(root, 'page.html') });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en'] });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Reflect.set(globalThis, '__copied', value);
        },
      },
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pathToFileURL(path.join(root, 'page.html')).href);
  const section = page.locator('#lines');
  const title = section.locator('.semantic-section-title');
  const original = await title.evaluate((element) => element.innerHTML);
  await expect(section).toHaveAttribute('data-title-lines', /pending|shown/u);
  await expect(section).toHaveAttribute('data-title-lines', 'shown');

  await title.evaluate((element) => {
    const text = element.firstChild;
    if (!(text instanceof Text)) throw new Error('Title is not plain text.');
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 16);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Is the ridge the right image?');
  await page.getByRole('button', { name: 'Add message' }).click();
  await page.locator('[data-review-popover-close]').click();
  const quote = () =>
    page.evaluate(() => {
      const highlight = CSS.highlights.get('agentic-review-open');
      return highlight === undefined ? [] : [...highlight].map((range) => range.toString());
    });
  await expect.poll(quote).toEqual(['quick signal']);

  const wide = await section.evaluate((element) =>
    element.style.getPropertyValue('--title-line-count'),
  );
  await page.setViewportSize({ width: 400, height: 900 });
  await expect
    .poll(() => section.evaluate((element) => element.style.getPropertyValue('--title-line-count')))
    .not.toBe(wide);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.locator('#lines .semantic-section-title')).toContainText('Быстрый сигнал');
  await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(quote).toEqual(['quick signal']);
  expect(
    await page.locator('#lines .semantic-section-title').evaluate((element) => element.innerHTML),
  ).toBe(original);

  await page.locator('#lines [data-copy-prose]').click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__copied') as string | undefined))
    .toBe('Copy this sentence exactly.');
});
