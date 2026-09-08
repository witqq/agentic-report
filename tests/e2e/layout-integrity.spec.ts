import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator } from '@playwright/test';

import { expect, test } from './fixtures.js';

const siteRoot = path.resolve('test-results/e2e-site');
const routes = (
  JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
    readonly routes: readonly {
      readonly id: string;
      readonly href: string;
      readonly kind: string;
    }[];
  }
).routes.filter((route) => route.kind === 'page');

const routeUrl = (href: string): string => pathToFileURL(path.join(siteRoot, href)).href;

const overlayObservation = async (
  panel: Locator,
): Promise<{ readonly contained: boolean; readonly topmost: boolean }> =>
  panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? innerWidth);
    const bottom = top + (viewport?.height ?? innerHeight);
    const points = [0.12, 0.5, 0.88].flatMap((xShare) =>
      [0.12, 0.5, 0.88].map((yShare) => ({
        x: rect.left + rect.width * xShare,
        y: rect.top + rect.height * yShare,
      })),
    );
    return {
      contained:
        rect.left >= left - 1 &&
        rect.top >= top - 1 &&
        rect.right <= right + 1 &&
        rect.bottom <= bottom + 1,
      topmost: points.every(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit === element || (hit !== null && element.contains(hit));
      }),
    };
  });

test('every public page keeps surfaces inside their immediate layout owner', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');

  for (const viewport of [
    { name: 'narrow', width: 304, height: 760 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(routeUrl(route.href));
      const geometry = await page.evaluate(() => {
        const visible = (element: HTMLElement): boolean => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const label = (element: HTMLElement): string =>
          element.id ||
          [...element.classList].slice(0, 3).join('.') ||
          element.tagName.toLowerCase();
        const cards = [
          ...document.querySelectorAll<HTMLElement>('.semantic-cards > .semantic-card'),
        ]
          .filter(visible)
          .filter((card) => {
            const owner = card.parentElement;
            if (owner === null) return true;
            return card.getBoundingClientRect().width > owner.clientWidth + 1;
          })
          .map(label);
        const surfaces = [
          ...document.querySelectorAll<HTMLElement>(
            'table, pre, .semantic-tab-list, .visualization-frame, .semantic-cards, .semantic-chart, .semantic-diagram, .semantic-timeline, .semantic-tabs, .semantic-popover, .semantic-response, .semantic-callout, .semantic-decision, .semantic-demo, .semantic-steps, .semantic-glossary, .semantic-disclosure, .semantic-filter, .semantic-toggle',
          ),
        ]
          .filter(visible)
          .filter((surface) => {
            const owner = surface.parentElement;
            if (owner === null) return true;
            const rect = surface.getBoundingClientRect();
            const ownerRect = owner.getBoundingClientRect();
            return rect.left < ownerRect.left - 1 || rect.right > ownerRect.right + 1;
          })
          .map(label);
        return {
          rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cards,
          surfaces,
          galleries: [
            ...document.querySelectorAll<HTMLElement>(
              '.semantic-section[data-media="gallery"] > .semantic-cards',
            ),
          ]
            .filter(visible)
            .map((gallery) => {
              const galleryRect = gallery.getBoundingClientRect();
              const cards = [...gallery.children].filter(
                (child): child is HTMLElement =>
                  child instanceof HTMLElement && child.matches('.semantic-card'),
              );
              const first = cards[0]?.getBoundingClientRect();
              const second = cards[1]?.getBoundingClientRect();
              return {
                label: label(gallery),
                overflows: gallery.scrollWidth > gallery.clientWidth + 1,
                userScrollable: ['auto', 'scroll'].includes(getComputedStyle(gallery).overflowX),
                hasScrollSemantics:
                  gallery.hasAttribute('data-gallery-scroller') &&
                  gallery.tabIndex === 0 &&
                  gallery.getAttribute('role') === 'group' &&
                  (gallery.getAttribute('aria-label')?.trim().length ?? 0) > 0,
                firstLeavesContinuation: first !== undefined && first.right < galleryRect.right - 1,
                nextCardVisible:
                  second !== undefined &&
                  second.left < galleryRect.right - 1 &&
                  second.right > galleryRect.left + 1,
              };
            }),
        };
      });
      expect(geometry.rootOverflow, `${route.id}:${viewport.name}:root`).toBe(false);
      expect(geometry.cards, `${route.id}:${viewport.name}:cards`).toEqual([]);
      expect(geometry.surfaces, `${route.id}:${viewport.name}:surfaces`).toEqual([]);
      for (const gallery of geometry.galleries) {
        expect(
          gallery.hasScrollSemantics,
          `${route.id}:${viewport.name}:${gallery.label}:responsive-semantics`,
        ).toBe(gallery.overflows);
        if (!gallery.overflows) continue;
        expect(
          gallery,
          `${route.id}:${viewport.name}:${gallery.label}:gallery-affordance`,
        ).toMatchObject({
          userScrollable: true,
          hasScrollSemantics: true,
          firstLeavesContinuation: true,
          nextCardVisible: true,
        });
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(routeUrl('index.html'));
  const localizedGallery = page
    .locator('.semantic-section[data-media="gallery"] > .semantic-cards')
    .first();
  await expect(localizedGallery).toHaveAttribute('aria-label', 'Scrollable gallery');
  await page.locator('[data-language-select]').selectOption('ru');
  await expect(localizedGallery).toHaveAttribute('aria-label', 'Прокручиваемая галерея');
});

test('every qualifying gallery rail shares visible and accessible scroll ownership', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    pathToFileURL(path.join('test-results/e2e-generated', 'gallery-structure.html')).href,
  );

  const rails = page.locator('.semantic-section[data-media="gallery"] > .semantic-cards');
  await expect(rails).toHaveCount(5);
  const single = rails.nth(0);
  await expect(single).not.toHaveAttribute('data-gallery-scroller', '');
  await expect(single).not.toHaveAttribute('role', 'group');
  await expect(single).not.toHaveAttribute('aria-label', /.+/u);
  await expect(single).not.toHaveAttribute('tabindex', '0');
  expect(
    await single.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const item = element.firstElementChild?.getBoundingClientRect();
      return {
        directItems: element.children.length,
        overflows: element.scrollWidth > element.clientWidth + 1,
        itemContained:
          item !== undefined && item.left >= rect.left - 1 && item.right <= rect.right + 1,
      };
    }),
  ).toEqual({ directItems: 1, overflows: false, itemContained: true });

  for (const index of [1, 2, 3, 4]) {
    const rail = rails.nth(index);
    await expect(rail).toHaveAttribute('data-gallery-rail', '');
    await expect(rail).toHaveAttribute('data-gallery-scroller', '');
    await expect(rail).toHaveAttribute('role', 'group');
    await expect(rail).toHaveAttribute('aria-label', 'Scrollable gallery');
    await expect(rail).toHaveAttribute('tabindex', '0');
    expect(
      await rail.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const items = [...element.children].filter(
          (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const first = items[0]?.getBoundingClientRect();
        const continuation = items[1]?.getBoundingClientRect();
        return {
          userScrollable: ['auto', 'scroll'].includes(getComputedStyle(element).overflowX),
          overflows: element.scrollWidth > element.clientWidth + 1,
          firstLeavesContinuation: first !== undefined && first.right < rect.right - 1,
          continuationVisible:
            continuation !== undefined &&
            continuation.left < rect.right - 1 &&
            continuation.right > rect.left + 1,
        };
      }),
    ).toEqual({
      userScrollable: true,
      overflows: true,
      firstLeavesContinuation: true,
      continuationVisible: true,
    });
    await rail.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const afterRight = await rail.evaluate((element) => element.scrollLeft);
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBeLessThan(afterRight);
  }

  await page.setViewportSize({ width: 2560, height: 1440 });
  const readWideStates = () =>
    rails.evaluateAll((elements) =>
      elements.map((element) => ({
        candidate: element.hasAttribute('data-gallery-rail'),
        overflows: element.scrollWidth > element.clientWidth + 1,
        marker: element.hasAttribute('data-gallery-scroller'),
        group: element.getAttribute('role') === 'group',
        label: element.getAttribute('aria-label') === 'Scrollable gallery',
        focusable: (element as HTMLElement).tabIndex === 0,
      })),
    );
  await expect
    .poll(async () => {
      const states = await readWideStates();
      return {
        hasFittingCandidate: states.some((state) => state.candidate && !state.overflows),
        hasOverflowingCandidate: states.some((state) => state.candidate && state.overflows),
        everyFieldMatchesOverflow: states.every(
          (state) =>
            state.marker === state.overflows &&
            state.group === state.overflows &&
            state.label === state.overflows &&
            state.focusable === state.overflows,
        ),
      };
    })
    .toEqual({
      hasFittingCandidate: true,
      hasOverflowingCandidate: true,
      everyFieldMatchesOverflow: true,
    });
  const wideStates = await readWideStates();
  expect(wideStates.some((state) => state.candidate && !state.overflows)).toBe(true);
  for (const state of wideStates) {
    expect(state.marker).toBe(state.overflows);
    expect(state.group).toBe(state.overflows);
    expect(state.label).toBe(state.overflows);
    expect(state.focusable).toBe(state.overflows);
  }
});

test('every public popover escapes clipping and follows the visual viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(routeUrl(route.href));
      const triggers = page.locator('[data-popover-trigger]');
      const count = await triggers.count();
      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const controlled = await trigger.getAttribute('aria-controls');
        if (controlled === null) throw new Error(`${route.id}:${index} has no controlled panel.`);
        const panel = page.locator(`#${controlled}`);
        await expect(panel, `${route.id}:${viewport.name}:${index}:visible`).toBeVisible();
        await expect(panel).toHaveAttribute('data-popover-portal', '');
        await expect(panel.locator('xpath=..')).toHaveAttribute('data-overlay-host', '');
        expect(
          await overlayObservation(panel),
          `${route.id}:${viewport.name}:${index}:initial`,
        ).toEqual({ contained: true, topmost: true });

        await page.evaluate(() => scrollBy({ top: 24, behavior: 'instant' }));
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        expect(
          await overlayObservation(panel),
          `${route.id}:${viewport.name}:${index}:scrolled`,
        ).toEqual({ contained: true, topmost: true });

        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(panel).not.toHaveAttribute('data-popover-portal', '');
        await expect(trigger).toBeFocused();
      }
    }
  }
});

test('portaled panels survive local scrolling, viewport resizing, and locale replacement', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    pathToFileURL(path.join('test-results/e2e-generated', 'glossary-code.html')).href,
  );

  const codeTrigger = page.locator('pre [data-glossary-trigger]').first();
  await codeTrigger.click();
  const codePanel = page.locator(`#${await codeTrigger.getAttribute('aria-controls')}`);
  await expect(codePanel).toBeVisible();
  await codePanel.evaluate((element) => {
    element.style.top = '9999px';
  });
  await codeTrigger.evaluate((element) => {
    const scroller = element.closest('pre');
    if (scroller === null)
      throw new Error('Expected the glossary trigger inside a local scroller.');
    scroller.scrollLeft += 24;
    scroller.dispatchEvent(new Event('scroll'));
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await overlayObservation(codePanel)).toEqual({ contained: true, topmost: true });

  await page.setViewportSize({ width: 390, height: 620 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await overlayObservation(codePanel)).toEqual({ contained: true, topmost: true });
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(routeUrl('examples/interactive-catalog/index.html'));
  const popoverTrigger = page.locator('.semantic-popover [data-popover-trigger]').first();
  await popoverTrigger.click();
  await expect(page.locator('[data-popover-portal]')).toHaveCount(1);
  await page.locator('[data-language-select]').selectOption('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('[data-popover-portal]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-overlay-host', '');
  await page.locator('.semantic-popover [data-popover-trigger]').first().click();
  const localizedPanel = page.locator('[data-popover-portal]');
  await expect(localizedPanel).toBeVisible();
  expect(await overlayObservation(localizedPanel)).toEqual({ contained: true, topmost: true });
});

test('an authored popover stays trigger-anchored through scroll and visual viewport events', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(routeUrl('examples/interactive-catalog/index.html'));

  const trigger = page.locator('.semantic-popover [data-popover-trigger]').first();
  await trigger.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await trigger.click();
  const panel = page.locator('[data-popover-portal]');

  const anchored = async (): Promise<{
    readonly inlineDelta: number;
    readonly blockGap: number;
    readonly triggerTop: number;
  }> =>
    page.evaluate(() => {
      const currentTrigger = document.querySelector<HTMLElement>(
        '.semantic-popover [data-popover-trigger]',
      );
      const currentPanel = document.querySelector<HTMLElement>('[data-popover-portal]');
      if (currentTrigger === null || currentPanel === null) throw new Error('Popover is not open.');
      const triggerRect = currentTrigger.getBoundingClientRect();
      const panelRect = currentPanel.getBoundingClientRect();
      return {
        inlineDelta: Math.abs(
          panelRect.left + panelRect.width / 2 - (triggerRect.left + triggerRect.width / 2),
        ),
        blockGap: panelRect.top - triggerRect.bottom,
        triggerTop: triggerRect.top,
      };
    });

  const expectAnchored = async () => {
    const position = await anchored();
    expect(position.inlineDelta).toBeLessThanOrEqual(1);
    expect(position.blockGap).toBeGreaterThanOrEqual(0);
    expect(position.blockGap).toBeLessThanOrEqual(16);
    return position;
  };

  const initial = await expectAnchored();
  await page.evaluate(() => scrollBy({ top: 24, behavior: 'instant' }));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const afterScroll = await expectAnchored();
  expect(afterScroll.triggerTop).toBeLessThan(initial.triggerTop - 10);

  await panel.evaluate((element) => {
    element.style.top = '9999px';
  });
  await page.evaluate(() => {
    window.visualViewport?.dispatchEvent(new Event('scroll'));
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expectAnchored();
});
