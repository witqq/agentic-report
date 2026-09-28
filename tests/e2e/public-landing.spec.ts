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

const siteRoutes = JSON.parse(await readFile(path.resolve('website/routes.json'), 'utf8')) as {
  readonly routes: readonly {
    readonly id: string;
    readonly href: string;
    readonly source: string;
    readonly kind: 'page' | 'copy' | 'generated';
  }[];
};

const publicProofs = siteRoutes.routes
  .filter(
    (route) => route.kind === 'page' && (route.id === 'landing' || route.id.startsWith('example-')),
  )
  .map((route) => {
    const sourceDirectory =
      route.id === 'landing' ? 'source/landing' : path.posix.dirname(route.href);
    const sources = siteRoutes.routes
      .filter(
        (candidate) =>
          candidate.kind === 'copy' &&
          path.posix.dirname(candidate.href) === sourceDirectory &&
          ['report.md', 'report.ru.md'].includes(path.posix.basename(candidate.href)),
      )
      .map((candidate) => candidate.href)
      .sort();
    if (sources.length !== 2) {
      throw new Error(`Expected an English/Russian source pair for ${route.id}.`);
    }
    return { page: route.href, sources };
  });

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

test('landing presents the same navigable source-to-page proof in both output formats', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const rendered: string[] = [];
  for (const artifact of landingArtifacts) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'A finished page from Markdown.',
    );
    await expect(
      page.locator('.semantic-actions').first().getByRole('link', { name: 'Build a page' }),
    ).toBeInViewport();
    await expect(page.locator('main pre').filter({ hasText: 'npx skills add' })).toBeVisible();
    await expect(page.locator('#demo')).toContainText('18.4% peak failures');
    await expect(page.locator('#demo img')).toHaveAttribute('alt', /18\.4 percent peak failures/u);
    await expect(page.locator('#demo a[href="examples/incident-review/index.html"]')).toHaveCount(
      1,
    );
    await expect(page.locator('#demo a[href="examples/incident-review/report.md"]')).toBeVisible();
    await expect(page.locator('#demo')).toHaveAttribute('data-recipe', 'demo');
    const sections = await page
      .locator('section.semantic-section')
      .evaluateAll((items) => items.map((item) => item.id));
    expect(sections).toEqual([
      'demo',
      'styles',
      'workflow',
      'examples',
      'review',
      'reasons',
      'agent-skill',
      'boundaries',
    ]);
    expect(
      await page
        .locator('[data-navigation] a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toEqual(sections.map((id) => `#${id}`));
    await expect(page.locator('#examples a[href^="examples/"]')).not.toHaveCount(0);
    await expectLoadedImages(page);
    expect(
      await page
        .locator('#examples .semantic-card img')
        .evaluateAll((images) =>
          images.map((image) => (image instanceof HTMLImageElement ? image.naturalWidth : 0)),
        ),
    ).toEqual([390, 390, 390]);
    await expectNoOverflow(page);
    rendered.push(await page.locator('main').innerText());
  }
  expect(rendered[0]).toBe(rendered[1]);
});

test('the first screen exposes the promise, copyable install command, built proof, and primary action', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(landingArtifacts[0].url);
    const heading = page.getByRole('heading', { level: 1 });
    const install = page.locator('main pre').filter({ hasText: 'npx skills add' });
    const source = page.locator('#demo code').filter({ hasText: '18.4% peak failures' });
    const result = page.locator('#demo img').first();
    const actions = page.locator('.semantic-actions').first();
    const action = actions.getByRole('link', { name: 'Build a page' });
    const examples = actions.getByRole('link', { name: 'See examples' });
    for (const [name, element] of [
      ['promise', heading],
      ['install', install],
      ['source', source],
      ['result', result],
      ['action', action],
    ] as const) {
      await expect(element, `${width}px: ${name}`).toBeInViewport({ ratio: 1 });
    }
    await expect(install.locator('[data-copy-code]')).toBeVisible();
    await expect(action).toHaveAttribute('href', '#workflow');
    await expect(examples).toBeInViewport();
    await expect(examples).toHaveAttribute('href', '#examples');
    await expectNoOverflow(page);
  }
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
        // Титульный слайд презентации — секция без своего заголовка: берётся первая с заголовком.
        .locator('section.semantic-section:has(> .semantic-section-title)')
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
            return (value.startsWith('color(srgb')
              ? channels.map((channel) => channel * 255)
              : channels) as unknown as readonly [number, number, number];
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
          // Полоса без собственного фона стоит на фоне страницы: берётся первый непрозрачный предок.
          let owner: Element | null = section;
          let backgroundColor = getComputedStyle(section).backgroundColor;
          while (owner !== null && /rgba\([^)]*,\s*0\)$|transparent/u.test(backgroundColor)) {
            owner = owner.parentElement;
            backgroundColor =
              owner === null
                ? getComputedStyle(document.documentElement).backgroundColor
                : getComputedStyle(owner).backgroundColor;
          }
          const foreground = luminance(getComputedStyle(title).color);
          const background = luminance(backgroundColor);
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
      await expectLoadedImages(page);
      expect(
        await page
          .locator('#examples .semantic-card img')
          .evaluateAll((images) =>
            images.map((image) => (image instanceof HTMLImageElement ? image.naturalWidth : 0)),
          ),
      ).toEqual([390, 390, 390]);
      await expect(page.locator('#examples .semantic-card img').first()).toHaveAttribute(
        'alt',
        /восстановления/u,
      );
      await page.screenshot({ path: path.join(captureRoot, 'landing-ru-narrow.png') });
    }
    expect(
      await page.locator('.topbar > *').evaluateAll((items) =>
        items
          .filter((item) => {
            const box = item.getBoundingClientRect();
            return box.left < 0 || box.right > document.documentElement.clientWidth;
          })
          .map((item) => `${item.className}: ${item.getBoundingClientRect().right}`),
      ),
      proof.page,
    ).toEqual([]);

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

test('a non-landing demo executes reusable scroll and choreography motion', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(generatedUrl('launch-readiness.html'));
  const activation = page.locator('#activation');
  await activation.scrollIntoViewIfNeeded();
  await expect(activation).toHaveAttribute('data-scene-active', '');
  await expect(activation).toHaveAttribute('data-choreography-active', '');
  await expect(activation.locator('.semantic-point').first()).toHaveCSS('opacity', '1');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.locator('#activation')).toHaveAttribute('data-composition', 'split');
  await expect(page.locator('#launch-signal')).toHaveAttribute('data-surface', 'tint');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(landingArtifacts[0].url);
  await expect(page.locator('[data-reveal-pending], [data-reveal-motion]')).toHaveCount(0);
  await expect(
    page.locator('[data-scene-active], [data-choreography-motion], [data-pointer-active]'),
  ).toHaveCount(0);
  await expect(page.locator('#styles')).toBeVisible();
  await expect(page.locator('#demo img')).toHaveCount(1);
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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
  await expect(page.locator('.semantic-card[data-linked-card]')).toHaveCount(3);
  // Подпись терминала — одна подсказка и один курсор у заголовка страницы, без сканлайнов и свечения.
  const terminalTreatment = await page.evaluate(() => {
    const pageHeading = document.querySelector<HTMLElement>('.report-content article h1');
    const sectionTitle = document.querySelector<HTMLElement>('#profile > .semantic-section-title');
    if (pageHeading === null || sectionTitle === null)
      throw new Error('Missing terminal headings.');
    return {
      prompt: getComputedStyle(pageHeading, '::before').content,
      cursor: getComputedStyle(pageHeading, '::after').animationName,
      sectionPrompt: getComputedStyle(sectionTitle, '::before').content,
      bodyFont: getComputedStyle(document.body).fontFamily,
      background: getComputedStyle(document.body).backgroundImage,
      // Развёртку рисует слой `body::after`, свечение — `text-shadow` заголовка: смотрим туда, где они живут.
      scanlines: getComputedStyle(document.body, '::after').backgroundImage,
      glow: getComputedStyle(pageHeading).textShadow,
      cursorRuns: getComputedStyle(pageHeading, '::after').animationIterationCount,
    };
  });
  expect(terminalTreatment.prompt).toContain('>');
  expect(terminalTreatment.cursor).toBe('agentic-cursor');
  // У главы — её номер в скобках, а не второй промпт: промпт стоит только у заголовка страницы.
  expect(terminalTreatment.sectionPrompt).toMatch(/^"\[\d{2}\]"/u);
  expect(terminalTreatment.bodyFont).toContain('JetBrains Mono');
  expect(terminalTreatment.background).not.toMatch(/gradient/u);
  expect(terminalTreatment.scanlines).not.toMatch(/gradient/u);
  expect(terminalTreatment.glow).toBe('none');
  // Курсор мигает шесть раз и дальше горит ровно: бесконечное мигание нарушает WCAG 2.2.2.
  expect(terminalTreatment.cursorRuns).toBe('6');
  await expectNoOverflow(page);

  await page.goto(stagedUrl('examples/cinematic-story/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noir');
  await expect(page.locator('#field-roll')).toHaveAttribute('data-media', 'gallery');
  await expect(page.locator('img')).toHaveCount(5);
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

test('executive and motion showcases exercise package-owned composition and fallbacks', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(stagedUrl('examples/executive-brief/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight');
  await expect(page.locator('#opening')).toHaveAttribute('data-recipe', 'hero');
  await expect(page.locator('#evidence')).toHaveAttribute('data-recipe', 'metrics');
  await expect(page.locator('#path')).toHaveAttribute('data-recipe', 'story');
  await expect(page.locator('#handoff')).toHaveAttribute('data-recipe', 'evidence');
  await expect(page.locator('.visualization-timeline-event')).toHaveCount(4);
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expectSettledSection(page.locator('#evidence'));
  const metricCards = await page.locator('#evidence .semantic-card').evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { top: Math.round(box.top), height: box.height };
    }),
  );
  expect(new Set(metricCards.map((card) => card.top)).size).toBeLessThanOrEqual(2);
  expect(Math.max(...metricCards.map((card) => card.height))).toBeLessThanOrEqual(
    Math.min(...metricCards.map((card) => card.height)) + 1,
  );
  await expectLoadedImages(page);
  await expectNoOverflow(page);

  await page.goto(stagedUrl('examples/motion-showcase/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora');
  await expect(page.locator('#opening')).toHaveAttribute('data-interaction', 'depth');
  await expect(page.locator('#rail')).toHaveAttribute('data-scene', 'progress');
  await expect(page.locator('#rail .semantic-card')).toHaveCount(3);
  const rail = page.locator('#rail');
  expect(
    await rail.evaluate((section) => {
      const viewport = section.querySelector<HTMLElement>('.semantic-cards');
      if (viewport === null) throw new Error('Motion rail viewport is absent.');
      const boundary = viewport.getBoundingClientRect();
      return [...viewport.querySelectorAll<HTMLElement>(':scope > .semantic-card')].filter(
        (card) => {
          const box = card.getBoundingClientRect();
          return box.right > boundary.left && box.left < boundary.right;
        },
      ).length;
    }),
  ).toBeGreaterThanOrEqual(2);
  const initial = Number(
    await rail.evaluate((node) => node.style.getPropertyValue('--scene-progress')),
  );
  await rail.scrollIntoViewIfNeeded();
  await expect
    .poll(() => rail.evaluate((node) => Number(node.style.getPropertyValue('--scene-progress'))))
    .not.toBe(initial);
  await expect(rail).toHaveAttribute('data-scene-active', '');
  await expectLoadedImages(page);
  await expectNoOverflow(page);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(
    page.locator('[data-scene-active], [data-choreography-motion], [data-pointer-active]'),
  ).toHaveCount(0);
  await expect(page.locator('#opening img')).toBeVisible();
  await expect(page.locator('#rail .semantic-card')).toHaveCount(3);
  await expect(page.locator('#fallback')).toBeVisible();
});

test('viewport matrix keeps content readable, mobile concise, and wide layouts occupied', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/captures/public-visual-language');
  await mkdir(captureRoot, { recursive: true });
  const profiles = [
    { name: 'ultrawide', width: 2560, height: 1440 },
    { name: 'tall', width: 1200, height: 1920 },
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'narrow', width: 304, height: 844 },
  ] as const;

  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(landingArtifacts[0].url);
    await expect(page.locator('h1')).toBeVisible();
    await expectNoOverflow(page);
    if (profile.name === 'tall') {
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(
        page.locator('.semantic-actions').first().getByRole('link', { name: 'Build a page' }),
      ).toBeInViewport();
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
