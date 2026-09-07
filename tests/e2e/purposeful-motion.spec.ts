import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const artifact = pathToFileURL(
  path.resolve('test-results/e2e-generated/purposeful-motion.html'),
).href;
const captures = path.resolve('test-results/captures/purposeful-motion');

test('closed motion and control roles produce bounded input-aware behavior', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const evidence = { frames: 0 };
    Object.defineProperty(window, '__purposefulMotionEvidence', {
      value: evidence,
      configurable: true,
    });
    window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
      apply(target, thisArg, argumentsList: Parameters<typeof window.requestAnimationFrame>) {
        evidence.frames += 1;
        return Reflect.apply(target, thisArg, argumentsList) as number;
      },
    });
  });
  await mkdir(captures, { recursive: true });
  await page.goto(artifact);
  const mobile = info.project.name.startsWith('mobile');
  const sequence = page.locator('#sequence');
  await expect(sequence).toHaveAttribute('data-transition', 'stagger');
  await expect(sequence).toHaveAttribute('data-scene', 'progress');
  await expect(sequence).toHaveAttribute('data-choreography', 'cascade');
  await expect(sequence).toHaveAttribute('data-reveal-shown', '');
  await expect(sequence).toHaveAttribute('data-choreography-active', '');
  await expectOrderedChoreography(sequence.locator('.semantic-card'), 3);
  await expectFullyVisible(sequence.locator('.semantic-card'));
  const groups = page.locator('.semantic-actions');
  await expect(groups).toHaveCount(4);
  const resolved = await groups.evaluateAll((items) =>
    items.map((item) => (item as HTMLElement).dataset.placementResolved),
  );
  expect(resolved).toEqual([mobile ? 'bottom' : 'edge', 'edge', 'inline', 'bottom']);

  const firstProgress = Number(
    await sequence.evaluate((node) => node.style.getPropertyValue('--scene-progress')),
  );
  await page.locator('#pointer').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      sequence.evaluate((node) => Number(node.style.getPropertyValue('--scene-progress'))),
    )
    .not.toBe(firstProgress);

  const dataScene = page.locator('#data-scene');
  await dataScene.scrollIntoViewIfNeeded();
  await expect(dataScene).toHaveAttribute('data-choreography-active', '');
  const chartPoints = dataScene.locator('.semantic-chart .semantic-point');
  await expectOrderedChoreography(chartPoints, 3);
  await expectFullyVisible(chartPoints);
  expect(
    await groups.nth(3).evaluate((group) => {
      const rect = group.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight;
    }),
  ).toBe(false);
  await page.screenshot({
    path: path.join(captures, `${info.project.name}-ordered.png`),
  });

  const stickyImage = page.locator('#sticky > p:has(img)');
  expect(await stickyImage.evaluate((node) => getComputedStyle(node).position)).toBe(
    mobile ? 'static' : 'sticky',
  );

  const pointer = page.locator('#pointer');
  const pointerImage = pointer.locator('img');
  if (mobile) {
    await pointer.tap();
    await expect(pointer).not.toHaveAttribute('data-pointer-active');
    expect(await pointerImage.evaluate((node) => getComputedStyle(node).transform)).toBe('none');
    await page.screenshot({
      path: path.join(captures, `${info.project.name}-active.png`),
    });
  } else {
    await pointer.scrollIntoViewIfNeeded();
    const box = await pointer.boundingBox();
    if (box === null) throw new Error('Pointer section has no geometry.');
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.25);
    await expect(pointer).toHaveAttribute('data-pointer-active', '');
    expect(await pointerImage.evaluate((node) => getComputedStyle(node).transform)).not.toBe(
      'none',
    );
    await page.screenshot({
      path: path.join(captures, `${info.project.name}-active.png`),
    });
    const magnetic = page.getByRole('link', { name: 'Automatic primary' });
    await magnetic.scrollIntoViewIfNeeded();
    const actionBox = await magnetic.boundingBox();
    if (actionBox === null) throw new Error('Magnetic action has no geometry.');
    await page.mouse.move(actionBox.x + actionBox.width * 0.8, actionBox.y + actionBox.height / 2);
    await expect(magnetic).toHaveAttribute('data-pointer-active', '');
    expect(await magnetic.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');

    await pointer.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const framesBeforeBurst = await motionFrameCount(page);
    await pointer.evaluate((node) => {
      for (let index = 1; index <= 5; index += 1) {
        node.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: index * 10,
            clientY: index * 10,
          }),
        );
      }
    });
    await expect.poll(() => motionFrameCount(page)).toBe(framesBeforeBurst + 1);

    await page.evaluate(() =>
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await pointer.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.target === node && !entry.isIntersecting)) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(node);
        }),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(pointer).not.toHaveAttribute('data-pointer-active');
    const framesWhileOffscreen = await motionFrameCount(page);
    await pointer.dispatchEvent('pointermove', { clientX: 1, clientY: 1 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }),
    );
    expect(await motionFrameCount(page)).toBe(framesWhileOffscreen + 1);
  }

  const iconSizes = await page.locator('.semantic-action .package-icon').evaluateAll((icons) =>
    icons.map((icon) => ({
      width: icon.getBoundingClientRect().width,
      height: icon.getBoundingClientRect().height,
    })),
  );
  expect(iconSizes.every(({ width, height }) => width === 16 && height === 16)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function motionFrameCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          readonly __purposefulMotionEvidence: { readonly frames: number };
        }
      ).__purposefulMotionEvidence.frames,
  );
}

async function expectOrderedChoreography(items: Locator, expectedItems: number): Promise<void> {
  const order = await items.evaluateAll((elements) =>
    elements.map((element) => ({
      index: Number((element as HTMLElement).style.getPropertyValue('--choreography-index')),
      delay: Number.parseFloat(getComputedStyle(element).transitionDelay) * 1000,
    })),
  );
  expect(order).toHaveLength(expectedItems);
  expect(order.map(({ index }) => index)).toEqual(
    [...order.map(({ index }) => index)].sort((left, right) => left - right),
  );
  expect(
    order.every((item, index) => {
      const previous = order[index - 1];
      return previous === undefined || item.delay > previous.delay;
    }),
  ).toBe(true);
}

async function expectFullyVisible(items: Locator): Promise<void> {
  await expect
    .poll(() =>
      items.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).opacity === '1'),
      ),
    )
    .toBe(true);
}

test('reduced motion keeps content visible and installs no scene or pointer state', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(artifact);
  await expect(page.locator('#sequence')).toBeVisible();
  await expect(page.locator('[data-reveal-pending], [data-reveal-motion]')).toHaveCount(0);
  await expect(page.locator('[data-scene-active], [data-choreography-motion]')).toHaveCount(0);
  const pointer = page.locator('#pointer');
  const box = await pointer.boundingBox();
  if (box === null) throw new Error('Pointer section has no geometry.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pointer).not.toHaveAttribute('data-pointer-active');
  await expect(page.locator('[data-scroll-progress-indicator]')).toHaveCount(0);
  await expect(page.locator('#data-scene .semantic-chart .semantic-point').first()).toHaveCSS(
    'opacity',
    '1',
  );
});

test('missing IntersectionObserver leaves enhancement content readable and runtime controls active', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(artifact);
  const sequence = page.locator('#sequence');
  await expect(sequence).toBeVisible();
  await expect(sequence).not.toHaveAttribute('data-scene-active');
  await expect(sequence).not.toHaveAttribute('data-choreography-motion');
  await expect(sequence.locator('.semantic-card').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('#data-scene .semantic-chart .semantic-point').first()).toHaveCSS(
    'opacity',
    '1',
  );
  const pointer = page.locator('#pointer');
  const box = await pointer.boundingBox();
  if (box === null) throw new Error('Pointer section has no geometry.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pointer).not.toHaveAttribute('data-pointer-active');
  await expect(page.locator('.semantic-actions').first()).toHaveAttribute(
    'data-placement-resolved',
    'edge',
  );
});
