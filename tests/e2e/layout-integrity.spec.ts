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
          .filter((element) => {
            // A table scrolls inside its frame (`div.table-frame`), so the frame is the surface that
            // must stay inside its owner. On a phone a frame or a code block in the text flow bleeds by
            // the page gutter to the edges of the content column: its owner is then the column.
            const frame = element.matches('table') ? element.parentElement : null;
            const surface = frame?.matches('.table-frame') === true ? frame : element;
            const bleeds =
              surface.matches('pre, .table-frame') &&
              Number.parseFloat(getComputedStyle(surface).marginLeft) < 0 &&
              getComputedStyle(surface).getPropertyValue('--bleed').trim() !== '';
            const owner = bleeds ? surface.closest('.report-content') : surface.parentElement;
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

/**
 * Текст, сжатый внутри своего блока, не выходит за окно, поэтому проверка переполнения выше его не
 * видит: на 0.17.0 подпись таймлайна `cinematic-story#story` стояла колонкой в 14 px — по букве в
 * строке, — а карточки ленты `#field-roll` при 1440 px были столбиками шириной 158 px. Сравнивать
 * блок с его контейнером нельзя: там сжат и сам контейнер. Поэтому меряется то, что видит читатель.
 *
 * Длина строки — среднее число символов в отрисованной строке блока длиннее 40 символов (строки
 * считаются по прямоугольникам `Range.getClientRects()`). Порог 4 лежит между двумя замеренными
 * полосами: сжатая подпись на 0.17.0 даёт 1,1–1,6 символа в строке, а наименьшее законное значение
 * на всех публичных страницах при 304–1440 px в обоих языках — 7 (узкая колонка таблицы
 * `launch-readiness` на 304 px); узкие колонки таблиц и крупные русские заголовки на 304 px дают
 * 7–11, поэтому порог 12 отбраковал бы законные блоки.
 *
 * Ширина элемента ленты — не меньше меньшего из 0,4 ширины содержимого секции и 18rem: на 0.17.0
 * при 1440 px карточки `#field-roll` — 158 px при пределе 288 px.
 */
const MINIMUM_CHARACTERS_PER_LINE = 4;
const MEASURED_TEXT_LENGTH = 40;

test('every public page keeps its text in readable lines and its gallery items wide', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(10 * 60_000);

  const violations: string[] = [];
  for (const width of [304, 400, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(routeUrl(route.href));
      const languages = await page
        .locator('[data-language-select] option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      for (const language of languages.length > 0 ? languages : ['']) {
        if (language !== '') await page.locator('[data-language-select]').selectOption(language);
        const found = await page.evaluate(
          ({ minimum, measured }) => {
            const out: string[] = [];
            const label = (element: Element): string =>
              `${element.tagName.toLowerCase()}${element.id === '' ? '' : `#${element.id}`}.${[
                ...element.classList,
              ]
                .slice(0, 2)
                .join('.')}`;
            const blocks = [...document.querySelectorAll<HTMLElement>('main *')].filter(
              (element) => {
                if (element.closest('[hidden], template, pre, code, svg') !== null) return false;
                const style = getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                if (style.display.startsWith('inline') || style.display === 'contents')
                  return false;
                const ownText = [...element.childNodes].some(
                  (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '',
                );
                if (!ownText) return false;
                return [...element.children].every((child) => {
                  const display = getComputedStyle(child).display;
                  return (
                    display.startsWith('inline') || display === 'none' || display === 'contents'
                  );
                });
              },
            );
            for (const block of blocks) {
              const text = (block.textContent ?? '').replace(/\s+/gu, ' ').trim();
              if (text.length <= measured) continue;
              const rect = block.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              const range = document.createRange();
              range.selectNodeContents(block);
              const lines = new Set(
                [...range.getClientRects()]
                  .filter((line) => line.width > 0)
                  .map((line) => Math.round(line.top)),
              ).size;
              const perLine = text.length / Math.max(1, lines);
              if (perLine < minimum) {
                out.push(`${label(block)} ${perLine.toFixed(1)} chars/line, ${rect.width}px`);
              }
            }
            const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
            for (const section of document.querySelectorAll<HTMLElement>(
              '.semantic-section[data-media="gallery"]',
            )) {
              if (section.closest('[hidden]') !== null) continue;
              const style = getComputedStyle(section);
              const content =
                section.clientWidth -
                Number.parseFloat(style.paddingLeft) -
                Number.parseFloat(style.paddingRight);
              const limit = Math.min(0.4 * content, 18 * rem);
              for (const item of section.querySelectorAll<HTMLElement>(
                ':scope > .semantic-cards > *',
              )) {
                const itemWidth = item.getBoundingClientRect().width;
                if (itemWidth > 0 && itemWidth < limit - 0.5) {
                  out.push(
                    `${label(section)} gallery item ${itemWidth.toFixed(0)}px < ${limit.toFixed(0)}px`,
                  );
                }
              }
            }
            return out;
          },
          { minimum: MINIMUM_CHARACTERS_PER_LINE, measured: MEASURED_TEXT_LENGTH },
        );
        violations.push(...found.map((entry) => `${route.id}:${width}:${language}: ${entry}`));
      }
    }
  }
  expect(violations).toEqual([]);
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
  // Исходное положение меряется на остановившейся странице. Плавная прокрутка документа закончилась
  // бы уже после замера, а ступенчатое появление секции сдвигает триггер на 24 px ещё 420 мс после
  // пересечения — тогда триггер уезжал вниз вместо ожидаемого подъёма, и тест падал от раза к разу.
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.semantic-popover [data-popover-trigger]')
      ?.closest('[data-semantic="section"]')
      ?.hasAttribute('data-reveal-shown'),
  );
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
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
