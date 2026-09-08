import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const generatedRoot = path.resolve('test-results/e2e-generated');
const stagedRoot = path.resolve('test-results/e2e-site');
const generatedUrl = (name: string): string => pathToFileURL(path.join(generatedRoot, name)).href;
const stagedUrl = (href: string): string => pathToFileURL(path.join(stagedRoot, href)).href;

const landingArtifacts = [
  { format: 'single-file', url: generatedUrl('public-landing.html') },
  { format: 'directory', url: generatedUrl('public-landing-directory/index.html') },
] as const;

const publicProofs = [
  {
    page: 'index.html',
    sources: ['source/landing/report.md', 'source/landing/report.ru.md'],
  },
  {
    page: 'examples/incident-review/index.html',
    sources: ['examples/incident-review/report.md', 'examples/incident-review/report.ru.md'],
  },
  {
    page: 'examples/vendor-decision/index.html',
    sources: ['examples/vendor-decision/report.md', 'examples/vendor-decision/report.ru.md'],
  },
  {
    page: 'examples/launch-readiness/index.html',
    sources: ['examples/launch-readiness/report.md', 'examples/launch-readiness/report.ru.md'],
  },
  {
    page: 'examples/review-workspace/index.html',
    sources: ['examples/review-workspace/report.md', 'examples/review-workspace/report.ru.md'],
  },
  {
    page: 'examples/response-workspace/index.html',
    sources: ['examples/response-workspace/report.md', 'examples/response-workspace/report.ru.md'],
  },
  ...[
    'basic',
    'research',
    'architecture',
    'tutorial',
    'dashboard',
    'landing',
    'visual-catalog',
    'interactive-catalog',
    'visualization-catalog',
    'terminal-portfolio',
    'cinematic-story',
  ].map((id) => ({
    page: `examples/${id}/index.html`,
    sources: [`examples/${id}/report.md`, `examples/${id}/report.ru.md`],
  })),
] as const;

const siteRoutes = JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
  readonly routes: readonly {
    readonly id: string;
    readonly href: string;
    readonly source: string;
    readonly kind: 'page' | 'copy' | 'generated';
  }[];
};

const expectNoOverflow = async (page: Page): Promise<void> => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
};

const expectLoadedImages = async (page: Page): Promise<void> => {
  expect(
    await page
      .locator('img')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0,
        ),
      ),
  ).toBe(true);
};

test('landing composes the public visual vocabulary identically in both output formats', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const rendered: string[] = [];
  for (const artifact of landingArtifacts) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { name: 'A page worth handing over. From Markdown.', level: 1 }),
    ).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Build the first page' }).first()).toBeInViewport();
    await expect(page.getByRole('img', { name: /monumental local report scene/iu })).toBeVisible();
    const expected = [
      ['styles', 'rail'],
      ['workflow', 'story'],
      ['examples', 'evidence'],
      ['review', 'evidence'],
      ['reasons', 'metrics'],
      ['agent-skill', 'evidence'],
      ['boundaries', 'story'],
    ] as const;
    for (const [id, recipe] of expected) {
      const section = page.locator(`#${id}`);
      await expect(section).toHaveAttribute('data-recipe', recipe);
    }
    expect(
      await page
        .locator('section.semantic-section')
        .evaluateAll((sections) => sections.map((section) => section.id)),
    ).toEqual(expected.map(([id]) => id));
    expect(
      await page
        .locator('[data-navigation] a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toEqual(expected.map(([id]) => `#${id}`));

    await expect(page.locator('.semantic-actions').first()).toHaveAttribute(
      'data-placement-resolved',
      'edge',
    );
    await expect(page.locator('#workflow > .semantic-actions')).toHaveAttribute(
      'data-placement-resolved',
      'inline',
    );
    await expect(page.locator('#boundaries > .semantic-actions')).toHaveAttribute(
      'data-placement-resolved',
      'bottom',
    );
    await expect(page.locator('#boundaries .semantic-action[data-kind="primary"]')).toHaveAttribute(
      'data-effect',
      'magnetic',
    );
    await expectLoadedImages(page);
    await expectNoOverflow(page);
    rendered.push(await page.locator('main').innerText());
  }
  expect(rendered[0]).toBe(rendered[1]);
});

test('the staged public gallery opens every bilingual artifact and canonical source pair', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/captures/public-locales');
  await mkdir(captureRoot, { recursive: true });
  await page.setViewportSize({ width: 304, height: 844 });
  for (const proof of publicProofs) {
    await page.goto(stagedUrl(proof.page));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main p').filter({ hasText: /^:{3,}$/u })).toHaveCount(0);
    const englishTitle = await page.title();
    const englishHeading = await page.locator('h1').innerText();
    expect(
      await page
        .locator('section.semantic-section')
        .first()
        .evaluate((section) => {
          const title = section.querySelector<HTMLElement>('.semantic-section-title');
          if (title === null) throw new Error('Public proof section title is absent.');
          const parse = (value: string): readonly [number, number, number] => {
            const channels = value
              .match(/[\d.]+/gu)
              ?.slice(0, 3)
              .map(Number);
            if (channels?.length !== 3) throw new Error(`Unsupported color: ${value}`);
            return channels as unknown as readonly [number, number, number];
          };
          const luminance = (value: string): number => {
            const linear = (channel: number): number => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            };
            const [red, green, blue] = parse(value);
            return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
          };
          const foreground = luminance(getComputedStyle(title).color);
          const background = luminance(getComputedStyle(section).backgroundColor);
          return (
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
          );
        }),
    ).toBeGreaterThanOrEqual(4.5);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('main p').filter({ hasText: /^:{3,}$/u })).toHaveCount(0);
    expect(await page.title()).not.toBe(englishTitle);
    expect(await page.locator('h1').innerText()).not.toBe(englishHeading);
    await expect(page.getByRole('combobox', { name: 'Язык' })).toHaveValue('ru');
    await expectNoOverflow(page);
    if (proof.page === 'index.html') {
      await page.screenshot({ path: path.join(captureRoot, 'landing-ru-narrow.png') });
    }
    expect(
      await page.locator('.topbar > *').evaluateAll((items) =>
        items.every((item) => {
          const box = item.getBoundingClientRect();
          return box.left >= 0 && box.right <= document.documentElement.clientWidth;
        }),
      ),
    ).toBe(true);

    for (const source of proof.sources) {
      const route = siteRoutes.routes.find((candidate) => candidate.href === source);
      expect(route?.kind, source).toBe('copy');
      if (route === undefined || route.source === 'generated') {
        throw new Error(`Canonical source route is absent: ${source}`);
      }
      const [stagedBytes, canonicalBytes] = await Promise.all([
        readFile(path.join(stagedRoot, ...source.split('/'))),
        readFile(path.resolve('website', route.source)),
      ]);
      expect(stagedBytes, source).toEqual(canonicalBytes);
      await page.goto(stagedUrl(source));
      expect((await page.locator('body').innerText()).trim().length, source).toBeGreaterThan(0);
    }
  }

  for (const route of siteRoutes.routes) {
    await page.goto(stagedUrl(route.href));
    expect((await page.locator('body').innerText()).trim().length, route.href).toBeGreaterThan(0);
  }
});

test('desktop stage keeps unrelated direct children in readable non-overlapping regions', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });

  const stageGeometry = async (): Promise<{
    readonly overlaps: readonly string[];
  }> =>
    page.locator('section.semantic-section[data-composition="stage"]').evaluateAll((sections) => {
      const overlaps: string[] = [];
      for (const section of sections) {
        const children = [...section.children].filter((child): child is HTMLElement => {
          if (!(child instanceof HTMLElement)) return false;
          const rect = child.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        });
        for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
          const left = children[leftIndex];
          if (left === undefined) continue;
          const leftRect = left.getBoundingClientRect();
          for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
            const right = children[rightIndex];
            if (right === undefined) continue;
            const rightRect = right.getBoundingClientRect();
            const overlapWidth =
              Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
            const overlapHeight =
              Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
            if (overlapWidth > 1 && overlapHeight > 1) {
              overlaps.push(
                `${section.id}:${left.tagName.toLowerCase()}.${left.className}:${right.tagName.toLowerCase()}.${right.className}`,
              );
            }
          }
        }
      }
      return { overlaps };
    });

  for (const proof of publicProofs) {
    await page.goto(stagedUrl(proof.page));
    expect(await stageGeometry(), `${proof.page}:en`).toEqual({ overlaps: [] });
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
    expect(await stageGeometry(), `${proof.page}:ru`).toEqual({ overlaps: [] });
  }
});

test('landing and a non-landing demo execute reusable scroll, pointer, and choreography motion', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(landingArtifacts[0].url);

  const dataScene = page.locator('#workflow');
  const initialProgress = Number(
    await dataScene.evaluate((node) => node.style.getPropertyValue('--scene-progress')),
  );
  await dataScene.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      dataScene.evaluate((node) => Number(node.style.getPropertyValue('--scene-progress'))),
    )
    .not.toBe(initialProgress);
  await expect(dataScene).toHaveAttribute('data-scene-active', '');

  const pointerScene = page.locator('#review');
  await pointerScene.scrollIntoViewIfNeeded();
  const workflowImage = pointerScene.locator('img').first();
  const imageBox = await workflowImage.boundingBox();
  if (imageBox === null) throw new Error('Landing story image has no geometry.');
  await page.mouse.move(imageBox.x + imageBox.width * 0.75, imageBox.y + imageBox.height * 0.35);
  await expect(pointerScene).toHaveAttribute('data-pointer-active', '');
  expect(await workflowImage.evaluate((image) => getComputedStyle(image).transform)).not.toBe(
    'none',
  );

  await page.goto(generatedUrl('launch-readiness.html'));
  const activation = page.locator('#activation');
  await activation.scrollIntoViewIfNeeded();
  await expect(activation).toHaveAttribute('data-scene-active', '');
  await expect(activation).toHaveAttribute('data-choreography-active', '');
  await expect(activation.locator('.semantic-point').first()).toHaveCSS('opacity', '1');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.locator('#activation')).toHaveAttribute('data-composition', 'split');
  await expect(page.locator('#launch-signal')).toHaveAttribute('data-surface', 'mesh');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(landingArtifacts[0].url);
  await expect(page.locator('[data-reveal-pending], [data-reveal-motion]')).toHaveCount(0);
  await expect(
    page.locator('[data-scene-active], [data-choreography-motion], [data-pointer-active]'),
  ).toHaveCount(0);
  await expect(page.locator('#styles')).toBeVisible();
  await expect(page.locator('#workflow img')).toBeVisible();
  await mkdir(path.resolve('test-results/captures/public-motion'), { recursive: true });
  await page.screenshot({
    path: path.resolve('test-results/captures/public-motion/landing-reduced-motion.png'),
  });
});

test('Terminal and Cinematic gallery pages expose different structural experiences', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(stagedUrl('examples/terminal-portfolio/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'terminal');
  await expect(page.locator('.semantic-card[data-linked-card]')).toHaveCount(5);
  const terminalTreatment = await page
    .locator('#profile > .semantic-section-title')
    .evaluate((heading) => ({
      prompt: getComputedStyle(heading, '::before').content,
      cursor: getComputedStyle(heading, '::after').animationName,
      background: getComputedStyle(document.body).backgroundImage,
    }));
  expect(terminalTreatment.prompt).toContain('>');
  expect(terminalTreatment.cursor).toBe('agentic-cursor');
  expect(terminalTreatment.background).toContain('repeating-linear-gradient');
  await expectNoOverflow(page);

  await page.goto(stagedUrl('examples/cinematic-story/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'cinematic');
  await expect(page.locator('#field-roll')).toHaveAttribute('data-media', 'gallery');
  await expect(page.locator('img')).toHaveCount(4);
  await expectLoadedImages(page);
  const story = page.locator('#story');
  const initial = Number(
    await story.evaluate((node) => node.style.getPropertyValue('--scene-progress')),
  );
  await story.scrollIntoViewIfNeeded();
  await expect
    .poll(() => story.evaluate((node) => Number(node.style.getPropertyValue('--scene-progress'))))
    .not.toBe(initial);
  await expect(story).toHaveAttribute('data-scene-active', '');
  await expectNoOverflow(page);
});

test('viewport matrix keeps content readable, mobile concise, and wide layouts occupied', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/captures/public-visual-language');
  await mkdir(captureRoot, { recursive: true });
  const profiles = [
    { name: 'ultrawide', width: 2560, height: 1440, maxHeight: 13_000 },
    { name: 'tall', width: 1200, height: 1920, maxHeight: 14_000 },
    { name: 'desktop', width: 1440, height: 1000, maxHeight: 13_000 },
    { name: 'mobile', width: 390, height: 844, maxHeight: 15_000 },
    { name: 'narrow', width: 304, height: 844, maxHeight: 17_000 },
  ] as const;

  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(landingArtifacts[0].url);
    await expect(page.locator('h1')).toBeVisible();
    await expectNoOverflow(page);
    if (profile.name === 'tall') {
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(
        page.getByRole('link', { name: 'Build the first page' }).first(),
      ).toBeInViewport();
      await expect(page.getByRole('link', { name: 'Choose a visual direction' })).toBeInViewport();
    }
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.report-shell');
      const heading = document.querySelector<HTMLElement>('h1');
      const sections = [...document.querySelectorAll<HTMLElement>('section.semantic-section')];
      if (shell === null || heading === null) throw new Error('Landing geometry is incomplete.');
      return {
        height: document.documentElement.scrollHeight,
        shellWidth: shell.getBoundingClientRect().width,
        headingFits: heading.scrollWidth <= heading.clientWidth,
        topbarContained: [...document.querySelectorAll<HTMLElement>('.topbar > *')].every(
          (item) => {
            const box = item.getBoundingClientRect();
            return box.left >= 0 && box.right <= document.documentElement.clientWidth;
          },
        ),
        sectionWidths: sections.map((section) => section.getBoundingClientRect().width),
        sectionHeights: sections.map((section) => section.getBoundingClientRect().height),
      };
    });
    expect(geometry.height).toBeLessThan(profile.maxHeight);
    expect(geometry.height).toBeGreaterThan(profile.height * 2);
    expect(geometry.headingFits).toBe(true);
    expect(geometry.topbarContained).toBe(true);
    expect(geometry.sectionWidths.every((width) => width > 0 && width <= profile.width)).toBe(true);
    expect(geometry.sectionHeights.every((height) => height > 120)).toBe(true);
    if (profile.width >= 1200) {
      expect(geometry.shellWidth).toBeGreaterThan(profile.width * 0.55);
    }

    await page.screenshot({
      path: path.join(captureRoot, `${profile.name}-initial.png`),
    });
    await page.locator('#workflow').scrollIntoViewIfNeeded();
    await expectSettledSection(page.locator('#workflow'));
    await page.locator('#examples').scrollIntoViewIfNeeded();
    await expectSettledSection(page.locator('#examples'));
    await page.screenshot({
      path: path.join(captureRoot, `${profile.name}-scrolled.png`),
    });
  }
});

async function expectSettledSection(section: Locator): Promise<void> {
  await expect(section).not.toHaveAttribute('data-reveal-pending', '');
  await expect
    .poll(() =>
      section.evaluate((owner) =>
        [...owner.children].every((child) => {
          const style = getComputedStyle(child);
          return style.opacity === '1';
        }),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      section
        .locator('[data-choreography-motion]')
        .evaluateAll((items) => items.every((item) => getComputedStyle(item).opacity === '1')),
    )
    .toBe(true);
}

test('selection review remains anchored and non-reflowing on desktop and constrained mobile', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/captures/public-review');
  await mkdir(captureRoot, { recursive: true });

  for (const profile of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(landingArtifacts[0].url);
    const target = page.locator('#review p[data-review-target]').filter({
      hasText: 'Select any words in this sentence',
    });
    await target.scrollIntoViewIfNeeded();
    const before = await reportGeometry(page);
    await selectText(target, 'any words in this sentence');
    await page.getByRole('button', { name: 'Create note' }).click();
    await expect(page.locator('[data-review-popover]')).toBeVisible();
    await page.locator('[data-review-message]').fill(`${profile.name} integrated note`);
    await page.getByRole('button', { name: 'Add message' }).click();
    await expect(page.locator('[data-review-highlight-marker]')).toHaveCount(1);
    const after = await reportGeometry(page);
    expect(after.documentWidth).toBe(before.documentWidth);
    expect(after.mainLeft).toBeCloseTo(before.mainLeft, 1);
    expect(after.mainWidth).toBeCloseTo(before.mainWidth, 1);
    expect(after.targetLeft).toBeCloseTo(before.targetLeft, 1);
    expect(after.targetWidth).toBeCloseTo(before.targetWidth, 1);
    expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);

    const popover = await page.locator('[data-review-popover]').boundingBox();
    if (popover === null) throw new Error('Review popover has no geometry.');
    expect(popover.x).toBeGreaterThanOrEqual(0);
    expect(popover.y).toBeGreaterThanOrEqual(0);
    expect(popover.x + popover.width).toBeLessThanOrEqual(profile.width + 1);
    expect(popover.y + popover.height).toBeLessThanOrEqual(profile.height + 1);
    await page.screenshot({ path: path.join(captureRoot, `${profile.name}-open-thread.png`) });

    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('[data-review-highlight-marker]').click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      `${profile.name} integrated note`,
    );
  }
});

async function selectText(target: Locator, needle: string): Promise<void> {
  await target.evaluate((owner, value) => {
    const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(value) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + value.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      owner.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return;
    }
    throw new Error(`Selection text is absent: ${value}`);
  }, needle);
}

async function reportGeometry(page: Page): Promise<{
  readonly documentWidth: number;
  readonly mainLeft: number;
  readonly mainWidth: number;
  readonly targetLeft: number;
  readonly targetWidth: number;
  readonly scrollY: number;
}> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main');
    const target = [
      ...document.querySelectorAll<HTMLElement>('#review p[data-review-target]'),
    ].find((node) => node.textContent?.includes('Select any words in this sentence'));
    if (main === null || target === undefined) throw new Error('Review geometry target is absent.');
    const mainBox = main.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      mainLeft: mainBox.left,
      mainWidth: mainBox.width,
      targetLeft: targetBox.left,
      targetWidth: targetBox.width,
      scrollY,
    };
  });
}
