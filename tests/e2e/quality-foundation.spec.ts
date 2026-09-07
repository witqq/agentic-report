import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

const artifactUrl = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;

test('compact shell exposes a quiet localized icon toolbar without synthetic page identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(artifactUrl('public-landing'));

  await expect(page.locator('.topbar-context')).toBeHidden();
  await expect(page.locator('[data-nav-toggle] [data-package-icon="three-bars"]')).toBeVisible();
  await expect(page.locator('[data-review-toggle] [data-package-icon="comment"]')).toBeVisible();
  await expect(page.locator('.language-select [data-package-icon="language"]')).toBeVisible();
  await expect(page.locator('[data-theme-toggle] [data-package-icon="sun"]')).toBeVisible();

  const toolbar = await page.locator('.topbar').evaluate((topbar) => {
    const controls = [
      topbar.querySelector<HTMLElement>('[data-nav-toggle]'),
      topbar.querySelector<HTMLElement>('[data-review-toggle]'),
      topbar.querySelector<HTMLElement>('.language-select'),
      topbar.querySelector<HTMLElement>('[data-theme-toggle]'),
    ];
    return {
      heightShare: topbar.getBoundingClientRect().height / innerHeight,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      controls: controls.map((control) => {
        if (control === null) throw new Error('Expected every compact toolbar control.');
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return {
          width: box.width,
          height: box.height,
          borderStyle: style.borderTopStyle,
          background: style.backgroundColor,
        };
      }),
      visibleLabels: [
        ...topbar.querySelectorAll<HTMLElement>('[data-topbar-control-label]'),
      ].filter((label) => getComputedStyle(label).display !== 'none').length,
    };
  });
  expect(toolbar.heightShare).toBeLessThan(0.1);
  expect(toolbar.visibleLabels).toBe(0);
  for (const control of toolbar.controls) {
    const minimumTarget = toolbar.coarsePointer ? 44 : 40;
    expect(control.width).toBeGreaterThanOrEqual(minimumTarget);
    expect(control.height).toBeGreaterThanOrEqual(minimumTarget);
    expect(control.width).toBeLessThanOrEqual(48);
    expect(control.height).toBeLessThanOrEqual(48);
    expect(control.borderStyle).toBe('none');
    expect(control.background).toBe('rgba(0, 0, 0, 0)');
  }

  const language = page.getByRole('combobox', { name: 'Language' });
  await expect(language).toHaveAttribute('title', 'Language');
  await language.selectOption('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const localizedLanguage = page.getByRole('combobox', { name: 'Язык' });
  await expect(localizedLanguage).toHaveAttribute('title', 'Язык');
  await expect(localizedLanguage).toBeFocused();
  expect(
    await page.locator('.language-select').evaluate((control) => {
      const style = getComputedStyle(control);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    }),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Открыть содержание' })).toHaveAttribute(
    'title',
    'Открыть содержание',
  );
  await expect(page.getByRole('button', { name: 'Ревью' })).toHaveAttribute('title', 'Ревью');
  await expect(page.getByRole('button', { name: 'Переключить цветовую тему' })).toHaveAttribute(
    'title',
    'Переключить цветовую тему',
  );
});

test('localized landing keeps its heading and primary action in the compact opening composition', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(artifactUrl('public-landing'));

  const inspectOpening = async () =>
    await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      const action = document.querySelector<HTMLElement>(
        'main .semantic-action[data-kind="primary"]',
      );
      if (heading === null || action === null) throw new Error('Expected landing opening content.');
      return {
        headingShare: heading.getBoundingClientRect().height / innerHeight,
        actionBottom: action.getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
      };
    });

  for (const opening of [
    await inspectOpening(),
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru').then(inspectOpening),
  ]) {
    expect(opening.headingShare).toBeLessThan(0.3);
    expect(opening.actionBottom).toBeLessThan(opening.viewportHeight);
  }
});

test('localized stage heading stays readable across desktop composition widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const viewport of [
    { width: 1200, height: 1920 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(artifactUrl('layout-mixed'));
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');

    const geometry = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('#stage > .semantic-section-title');
      const media = document.querySelector<HTMLElement>('#stage > :has(img)');
      if (heading === null || media === null)
        throw new Error('Expected localized stage and media.');
      const text = document.createRange();
      text.selectNodeContents(heading);
      const textBox = text.getBoundingClientRect();
      const mediaBox = media.getBoundingClientRect();
      return {
        textFitsHeading: heading.scrollWidth <= heading.clientWidth,
        textClearsMedia:
          textBox.bottom <= mediaBox.top ||
          textBox.top >= mediaBox.bottom ||
          textBox.right <= mediaBox.left ||
          textBox.left >= mediaBox.right,
      };
    });
    expect(geometry.textFitsHeading, String(viewport.width)).toBe(true);
    expect(geometry.textClearsMedia, String(viewport.width)).toBe(true);
  }
});

test('story media remains inside its section when the authored prose is shorter than the media', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(artifactUrl('vendor-decision'));

  const geometry = await page.evaluate(() => {
    const story = document.querySelector<HTMLElement>('#gates');
    const next = document.querySelector<HTMLElement>('#evidence');
    const mediaOwner = story?.querySelector<HTMLElement>(':scope > :has(img)');
    if (story === null || next === null || mediaOwner === undefined || mediaOwner === null) {
      throw new Error('Expected adjacent story, media, and evidence sections.');
    }
    story.dataset.viewport = 'adaptive';
    story.dataset.surface = 'plain';
    for (const child of story.children) {
      if (
        child !== story.firstElementChild &&
        child !== mediaOwner &&
        child instanceof HTMLElement
      ) {
        child.hidden = true;
      }
    }
    const storyBox = story.getBoundingClientRect();
    const mediaBox = mediaOwner.getBoundingClientRect();
    const nextBox = next.getBoundingClientRect();
    return {
      storyBottom: storyBox.bottom,
      mediaBottom: mediaBox.bottom,
      nextTop: nextBox.top,
    };
  });
  expect(geometry.storyBottom).toBeGreaterThanOrEqual(geometry.mediaBottom);
  expect(geometry.nextTop).toBeGreaterThan(geometry.storyBottom);
});
