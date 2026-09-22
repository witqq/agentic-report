import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator } from '@playwright/test';

import { expect, test } from './fixtures.js';

const artifact = (file: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', file)).href;

async function expectStableViewportSurface(surface: Locator): Promise<void> {
  const samples = await surface.evaluate(async (element) => {
    const observe = () => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        contained:
          rect.left >= left &&
          rect.top >= top &&
          rect.right <= left + (viewport?.width ?? innerWidth) &&
          rect.bottom <= top + (viewport?.height ?? innerHeight),
      };
    };
    const result = [observe()];
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      result.push(observe());
    }
    return result;
  });
  for (const sample of samples)
    expect(sample, 'surface stays inside the viewport').toMatchObject({ contained: true });
  const first = samples[0];
  if (first === undefined) throw new Error('Expected the opening geometry.');
  for (const sample of samples) {
    for (const coordinate of ['left', 'top', 'width', 'height'] as const) {
      expect(Math.abs(sample[coordinate] - first[coordinate]), coordinate).toBeLessThanOrEqual(1);
    }
  }
}

for (const file of ['public-landing.html', 'public-landing-directory/index.html']) {
  test(`${file} opens long selected-text Review at its final size without a recovery scroll`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: info.project.name === 'mobile-chromium' ? 390 : 1440,
      height: info.project.name === 'mobile-chromium' ? 844 : 1000,
    });
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      await page.goto(artifact(file));
      for (const locale of ['ru', 'en']) {
        await page.locator('[data-language-select]').selectOption(locale);
        const target = page.locator('main p[data-review-target]').first();
        await target.scrollIntoViewIfNeeded();
        await target.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        });
        await page.locator('[data-review-selection-action]').click();
        const surface = page.locator('[data-review-popover]');
        await expect(surface).toBeVisible();
        await expectStableViewportSurface(surface);
        await page.locator('[data-review-popover-close]').click();
      }
    }
  });
}

test('reduced-motion authored popovers use their final constrained width on first open', async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === 'mobile-chromium' ? 390 : 1440,
    height: 844,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(artifact('interactive-catalog.html'));
  const trigger = page.locator('.semantic-popover [data-popover-trigger]').first();
  await trigger.click();
  const surface = page.locator(`#${await trigger.getAttribute('aria-controls')}`);
  await expectStableViewportSurface(surface);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
