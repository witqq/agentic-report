import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const fixtureUrl = pathToFileURL(
  path.resolve('test-results/e2e-generated/section-rhythm.html'),
).href;

const openFixture = async (
  page: Page,
  viewport: { readonly width: number; readonly height: number },
  scheme: 'light' | 'dark',
): Promise<void> => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
  await page.goto(fixtureUrl);
};

test('split and stage place only their opening beside the title or picture', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 1440, height: 1000 }, 'light');

  const geometry = await page.evaluate(() =>
    ['long-split', 'long-stage'].map((id) => {
      const section = document.getElementById(id);
      if (section === null) throw new Error(`Missing section ${id}`);
      const style = getComputedStyle(section);
      const box = section.getBoundingClientRect();
      const contentLeft = box.left + section.clientLeft + Number.parseFloat(style.paddingLeft);
      const contentWidth =
        section.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const children = [...section.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      return {
        id,
        contentWidth,
        opening: children
          .filter((child) => child.dataset.sectionOpening !== undefined)
          .map((child) => ({
            part: child.dataset.sectionOpening,
            offset: child.getBoundingClientRect().left - contentLeft,
          })),
        body: children
          .filter(
            (child) =>
              child.dataset.sectionOpening === undefined &&
              !child.classList.contains('semantic-section-title'),
          )
          .map((child) => ({
            tag: child.tagName.toLowerCase(),
            offset: child.getBoundingClientRect().left - contentLeft,
            width: child.getBoundingClientRect().width,
          })),
      };
    }),
  );

  for (const section of geometry) {
    expect(section.opening.length, section.id).toBeGreaterThan(0);
    expect(section.body.length, section.id).toBeGreaterThan(0);
    for (const block of section.body) {
      expect(Math.abs(block.offset), `${section.id}:${block.tag}`).toBeLessThanOrEqual(1);
    }
    for (const block of section.body.filter(({ tag }) =>
      ['pre', 'details', 'figure'].includes(tag),
    )) {
      expect(block.width, `${section.id}:${block.tag}`).toBeGreaterThan(section.contentWidth - 2);
    }
  }
  const split = geometry.find(({ id }) => id === 'long-split');
  const stage = geometry.find(({ id }) => id === 'long-stage');
  expect(split?.opening.every(({ offset }) => offset > (split.contentWidth ?? 0) * 0.3)).toBe(true);
  expect(stage?.opening.find(({ part }) => part === 'media')?.offset).toBeGreaterThan(
    (stage?.contentWidth ?? 0) * 0.3,
  );
  expect(stage?.opening.find(({ part }) => part === 'text')?.offset).toBeLessThanOrEqual(1);
});

test('wide tables stay inside their owner and show that they scroll', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await openFixture(page, viewport, 'dark');
    const table = await page.locator('#long-split details table').evaluate((element) => {
      const owner = element.closest('details');
      if (owner === null) throw new Error('Missing disclosure');
      return {
        right: element.getBoundingClientRect().right,
        ownerRight: owner.getBoundingClientRect().right,
        overflows: element.scrollWidth > element.clientWidth + 1,
        cue: getComputedStyle(element).backgroundImage,
        cards: getComputedStyle(element.querySelector('tr') as Element).display !== 'table-row',
      };
    });
    expect(table.right, String(viewport.width)).toBeLessThanOrEqual(table.ownerRight + 1);
    // A grid carries the scroll cue; on a phone this table cannot fit readably, so its rows become
    // labelled cards (the `auto` table layout) and nothing scrolls sideways.
    if (viewport.width === 390) {
      expect(table.cards).toBe(true);
      expect(table.overflows).toBe(false);
    } else {
      expect(table.cards).toBe(false);
      expect(table.cue).toContain('radial-gradient');
    }
  }
});

test('cards, table headers, and pictures stay readable in every tone and theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const scheme of ['light', 'dark'] as const) {
    await openFixture(page, { width: 1440, height: 1000 }, scheme);
    const ratios = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('Missing canvas');
      const rgba = (color: string): [number, number, number, number] => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
        return [red, green, blue, alpha];
      };
      const background = (element: Element | null): [number, number, number, number] => {
        for (let current = element; current !== null; current = current.parentElement) {
          const color = rgba(getComputedStyle(current).backgroundColor);
          if (color[3] > 200) return color;
        }
        return rgba(getComputedStyle(document.body).backgroundColor);
      };
      const luminance = ([red, green, blue]: readonly number[]): number => {
        const [r = 0, g = 0, b = 0] = [red, green, blue].map((channel = 0) => {
          const value = channel / 255;
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return [
        ...document.querySelectorAll<HTMLElement>(
          '#contrast .semantic-card :is(p, .semantic-title), #contrast th, #contrast td',
        ),
      ].map((element) => {
        const foreground = luminance(rgba(getComputedStyle(element).color));
        const back = luminance(background(element));
        return {
          text: element.textContent?.trim().slice(0, 24),
          ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05),
        };
      });
    });
    expect(ratios.length).toBeGreaterThan(4);
    for (const { text, ratio } of ratios) {
      expect(ratio, `${scheme}:${text}`).toBeGreaterThanOrEqual(4.5);
    }
    // A transparent picture gets no paper from a built-in theme in either scheme: the surface shows through
    // and the picture stays in the page's scheme (a drawing in dark ink ships a `{dark}` variant instead,
    // tests/e2e/scheme-media.spec.ts). The counterexample is a light paper slab on a dark surface.
    const pictures = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('Missing canvas');
      const rgba = (color: string): number[] => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      return ['long-stage', 'contrast'].map((id) => {
        const image = document.querySelector(`#${id} img`);
        if (image === null) throw new Error(`Missing picture in ${id}`);
        let surface = [255, 255, 255, 255];
        for (let owner = image.parentElement; owner !== null; owner = owner.parentElement) {
          const color = rgba(getComputedStyle(owner).backgroundColor);
          if ((color[3] ?? 0) > 200) {
            surface = color;
            break;
          }
        }
        const [red = 0, green = 0, blue = 0] = surface;
        return {
          id,
          darkSurface: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.4,
          backed: (rgba(getComputedStyle(image).backgroundColor)[3] ?? 0) > 200,
        };
      });
    });
    expect(pictures.some(({ darkSurface }) => darkSurface)).toBe(true);
    for (const picture of pictures) {
      expect(picture.backed, `${scheme}:${picture.id}`).toBe(false);
    }
  }
});

test('a diagram that must scroll opens at the start of its flow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 390, height: 844 }, 'dark');
  const frame = page.locator('#branching [data-tab-panel]:not([hidden]) .visualization-frame');
  await expect
    .poll(() =>
      frame.evaluate((element) => {
        const box = element.getBoundingClientRect();
        // The drawing shown: on a phone a wide flow is drawn in its narrow form, the page form is hidden.
        const shown = [...element.querySelectorAll('svg')].find(
          (svg) => svg.getClientRects().length > 0,
        );
        const root = shown?.querySelector('[data-layer="0"]')?.getBoundingClientRect();
        return {
          overflows: element.scrollWidth > element.clientWidth + 1,
          rootVisible:
            root !== undefined && root.left >= box.left - 1 && root.right <= box.right + 1,
        };
      }),
    )
    .toEqual({ overflows: true, rootVisible: true });
});

test('a diagram shows a view that fits its frame until the reader picks one', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 390, height: 844 }, 'light');
  const diagram = page.locator('#long-stage .semantic-diagram');
  const visibleView = async (
    section = '#long-stage',
  ): Promise<{
    readonly mode: string | undefined;
    readonly authored: boolean;
    readonly fits: boolean;
  }> =>
    page.locator(`${section} .semantic-diagram .visualization-layouts`).evaluate((switcher) => {
      const panel = [...switcher.querySelectorAll<HTMLElement>('[data-tab-panel]')].find(
        (candidate) => !candidate.hidden,
      );
      const width = Number(panel?.querySelector('svg')?.getAttribute('width') ?? 0);
      return {
        mode: panel?.dataset.layoutView,
        authored: panel?.hasAttribute('data-layout-default') ?? false,
        fits: (width * 12) / 13 <= switcher.clientWidth,
      };
    });

  await expect.poll(() => visibleView()).toMatchObject({ authored: false, fits: true });
  await diagram.getByRole('tab', { name: 'Left to right' }).click();
  await page.setViewportSize({ width: 380, height: 844 });
  await expect.poll(() => visibleView()).toMatchObject({ mode: 'right', authored: true });

  // A stage section of a document lays out inside the text column, so even on a wide screen the long
  // left-to-right chain (1216 px) does not fit it: a fresh open shows the widest view that does — here the
  // top-to-bottom one — not the reader's choice from the previous page.
  await openFixture(page, { width: 1920, height: 1000 }, 'light');
  await expect
    .poll(() => visibleView())
    .toMatchObject({
      mode: 'down',
      authored: false,
      fits: true,
    });
  // The authored view stays wherever it fits: the branching diagram's left-to-right view (865 px) fits the
  // step, and the view that would fill more of the frame (orthogonal, 889 px) does not replace it.
  await expect
    .poll(() => visibleView('#branching'))
    .toMatchObject({
      mode: 'right',
      authored: true,
      fits: true,
    });
});

test('the contents open as a full-height side panel on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 390, height: 844 }, 'dark');
  const toggle = page.locator('[data-nav-toggle]');
  const dialog = page.locator('[data-nav-dialog]');
  await expect(dialog).toBeHidden();
  await toggle.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('transform', /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u);
  const box = await dialog.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(844);
  expect(box?.width).toBeLessThan(390);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('callout kinds keep their signal and table code stays whole on wide screens', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 1440, height: 1000 }, 'light');
  const rules = await page
    .locator('#long-stage .semantic-callout')
    .evaluateAll((callouts) =>
      callouts.map((callout) => getComputedStyle(callout).borderLeftColor),
    );
  expect(rules).toHaveLength(2);
  expect(rules[0]).not.toBe(rules[1]);
  await expect(page.locator('#long-split td code').first()).toHaveCSS('white-space', 'nowrap');

  await openFixture(page, { width: 390, height: 844 }, 'light');
  await expect(page.locator('#long-split td code').first()).not.toHaveCSS('white-space', 'nowrap');
});

test('every boxed section starts its content at one left edge whatever tone draws the box', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const scheme of ['light', 'dark'] as const) {
    await openFixture(page, { width: 1440, height: 1000 }, scheme);
    const edges = await page.evaluate(() =>
      ['long-split', 'long-stage', 'contrast'].map((id) => {
        const section = document.getElementById(id);
        if (section === null) throw new Error(`Missing section ${id}`);
        return Math.round(
          section.getBoundingClientRect().left +
            section.clientLeft +
            Number.parseFloat(getComputedStyle(section).paddingLeft),
        );
      }),
    );
    expect(new Set(edges).size, `${scheme}:${edges.join(',')}`).toBe(1);
  }
});

// The lead is a paragraph: the prose measure in `ch` of the body rule, read at the lead's larger size, would
// carry it about a quarter past the column the body text keeps.
test('a lead in a wide section stays within the prose column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openFixture(page, { width: 1440, height: 1000 }, 'light');
  const edges = await page.evaluate(() => {
    const section = document.getElementById('long-lead');
    const lead = section?.querySelector<HTMLElement>(':scope > .semantic-lead');
    const body = section?.querySelector<HTMLElement>(':scope > p:not(.semantic-lead)');
    if (!lead || !body) throw new Error('Missing lead or body');
    return {
      lead: lead.getBoundingClientRect().right,
      body: body.getBoundingClientRect().right,
    };
  });
  expect(edges.lead).toBeLessThanOrEqual(edges.body + 1);
});
