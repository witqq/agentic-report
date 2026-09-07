import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

const artifactUrl = pathToFileURL(
  path.resolve('test-results/e2e-generated/layout-mixed.html'),
).href;

test('declarative visual families remain distinct, readable, and contained', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile');
  const requestUrls: string[] = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1200, height: 1920 };
  await page.setViewportSize(viewport);
  await page.goto(artifactUrl);

  const expected = [
    [
      'stage',
      'stage',
      'full',
      'immersive',
      'display',
      'mask',
      'cover',
      'cinematic',
      'right',
      'mesh',
    ],
    [
      'split',
      'split',
      'bounded',
      'editorial',
      'editorial',
      'natural',
      'natural',
      'natural',
      'center',
      'grain',
    ],
    [
      'mosaic',
      'mosaic',
      'adaptive',
      'compact',
      'body',
      'natural',
      'cover',
      'landscape',
      'center',
      'grid',
    ],
    [
      'story',
      'story',
      'bounded',
      'immersive',
      'display',
      'natural',
      'cover',
      'landscape',
      'left',
      'glow',
    ],
    [
      'stack',
      'stack',
      'adaptive',
      'editorial',
      'editorial',
      'natural',
      'natural',
      'natural',
      'center',
      'plain',
    ],
    [
      'bleed',
      'flow',
      'bounded',
      'immersive',
      'display',
      'bleed',
      'cover',
      'cinematic',
      'center',
      'mesh',
    ],
    [
      'layers',
      'split',
      'bounded',
      'editorial',
      'editorial',
      'layers',
      'cover',
      'portrait',
      'center',
      'grain',
    ],
    [
      'gallery',
      'stage',
      'adaptive',
      'compact',
      'body',
      'gallery',
      'cover',
      'landscape',
      'center',
      'plain',
    ],
  ] as const;

  await expect(page.locator('.semantic-section')).toHaveCount(expected.length);
  for (const [
    id,
    composition,
    viewport,
    density,
    type,
    media,
    mediaFit,
    mediaAspect,
    focal,
    surface,
  ] of expected) {
    const section = page.locator(`#${id}`);
    await expect(section).toHaveAttribute('data-composition', composition);
    await expect(section).toHaveAttribute('data-viewport', viewport);
    await expect(section).toHaveAttribute('data-section-density', density);
    await expect(section).toHaveAttribute('data-type', type);
    await expect(section).toHaveAttribute('data-media', media);
    await expect(section).toHaveAttribute('data-media-fit', mediaFit);
    await expect(section).toHaveAttribute('data-media-aspect', mediaAspect);
    await expect(section).toHaveAttribute('data-focal', focal);
    await expect(section).toHaveAttribute('data-surface', surface);
  }

  const layouts = await page.locator('.semantic-section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      display: getComputedStyle(section).display,
      left: section.getBoundingClientRect().left,
      right: section.getBoundingClientRect().right,
    })),
  );
  expect(layouts.every(({ left, right }) => left >= -1 && right <= viewport.width + 1)).toBe(true);
  const visualState = await page.evaluate(() => {
    const required = (selector: string): HTMLElement => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`Missing visual evidence: ${selector}`);
      return element;
    };
    const stageImage = required('#stage img');
    const storyMedia = required('#story > p:has(img)');
    const bleed = required('#bleed');
    const bleedMedia = required('#bleed > p:has(img)');
    const layerCards = [...document.querySelectorAll<HTMLElement>('#layers .semantic-card')];
    const layerImages = [...document.querySelectorAll<HTMLElement>('#layers .semantic-card img')];
    const gallery = required('#gallery .semantic-cards');
    const galleryTitle = required('#gallery > .semantic-section-title');
    return {
      mosaicColumns: getComputedStyle(required('#mosaic .semantic-cards'))
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length,
      storyPosition: getComputedStyle(storyMedia).position,
      storyFloat: getComputedStyle(storyMedia).float,
      stage: {
        aspect: getComputedStyle(stageImage).aspectRatio,
        fit: getComputedStyle(stageImage).objectFit,
        focal: getComputedStyle(stageImage).objectPosition,
        mask: getComputedStyle(stageImage).clipPath,
      },
      bleed: {
        left: bleedMedia.getBoundingClientRect().left - bleed.getBoundingClientRect().left,
        right: bleed.getBoundingClientRect().right - bleedMedia.getBoundingClientRect().right,
      },
      layerCardTransforms: layerCards.map((card) => getComputedStyle(card).transform),
      layers: layerImages.map((image) => ({
        top: image.getBoundingClientRect().top,
        height: image.getBoundingClientRect().height,
        transform: getComputedStyle(image).transform,
      })),
      galleryOverflows: gallery.scrollWidth > gallery.clientWidth,
      compatibleCombinations: {
        layersSectionDisplay: getComputedStyle(required('#layers')).display,
        layersCardsDisplay: getComputedStyle(required('#layers .semantic-cards')).display,
        gallerySectionDisplay: getComputedStyle(required('#gallery')).display,
        galleryCardsDisplay: getComputedStyle(gallery).display,
        gallerySeparated:
          galleryTitle.getBoundingClientRect().right <= gallery.getBoundingClientRect().left,
      },
      surfaces: ['stage', 'split', 'mosaic', 'story', 'bleed', 'layers'].map(
        (id) => getComputedStyle(required(`#${id}`), '::before').backgroundImage,
      ),
    };
  });
  expect(visualState.stage).toMatchObject({ aspect: '21 / 9', fit: 'cover' });
  expect(visualState.stage.focal).toMatch(/100%|right/u);
  expect(visualState.stage.mask).not.toBe('none');
  expect(Math.abs(visualState.bleed.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualState.bleed.right)).toBeLessThanOrEqual(1);
  expect(visualState.galleryOverflows).toBe(true);
  expect(visualState.compatibleCombinations.layersCardsDisplay).toBe('grid');
  expect(visualState.compatibleCombinations.galleryCardsDisplay).toBe('grid');
  expect(visualState.surfaces.every((background) => background !== 'none')).toBe(true);
  expect(new Set(visualState.surfaces).size).toBe(4);
  expect(visualState.layerCardTransforms.every((transform) => transform === 'none')).toBe(true);
  if (mobile) {
    expect(visualState.mosaicColumns).toBe(1);
    expect(visualState.storyPosition).toBe('static');
    expect(visualState.storyFloat).toBe('none');
    expect(visualState.layers.every(({ transform }) => transform === 'none')).toBe(true);
    expect(
      visualState.layers.every((layer, index, layers) =>
        index === 0 ? true : layer.top >= (layers[index - 1]?.top ?? 0),
      ),
    ).toBe(true);
    expect(layouts.find(({ id }) => id === 'stage')?.display).toBe('block');
    expect(visualState.compatibleCombinations.layersSectionDisplay).toBe('block');
    expect(visualState.compatibleCombinations.gallerySectionDisplay).toBe('block');
    expect(
      await page
        .locator('#stack .semantic-card')
        .first()
        .evaluate((card) => getComputedStyle(card).position),
    ).toBe('static');
  } else {
    expect(visualState.mosaicColumns).toBe(2);
    expect(visualState.storyPosition).toBe('sticky');
    expect(visualState.storyFloat).toBe('right');
    expect(visualState.layers.length).toBeGreaterThan(1);
    expect(visualState.layers.every(({ transform }) => transform !== 'none')).toBe(true);
    expect(
      Math.abs((visualState.layers[0]?.top ?? 0) - (visualState.layers[1]?.top ?? 0)),
    ).toBeLessThan(visualState.layers[0]?.height ?? 0);
    expect(layouts.find(({ id }) => id === 'stage')?.display).toBe('grid');
    expect(layouts.find(({ id }) => id === 'split')?.display).toBe('grid');
    expect(visualState.compatibleCombinations.layersSectionDisplay).toBe('grid');
    expect(visualState.compatibleCombinations.gallerySectionDisplay).toBe('grid');
    expect(visualState.compatibleCombinations.gallerySeparated).toBe(true);
    expect(
      await page
        .locator('#stack .semantic-card')
        .first()
        .evaluate((card) => getComputedStyle(card).position),
    ).toBe('sticky');
  }

  expect(
    await page
      .locator('img')
      .evaluateAll(
        (images) =>
          images.length > 0 &&
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0 &&
              image.naturalHeight > 0,
          ),
      ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText('Fictional sample.', { exact: false })).toBeVisible();
  await expect(page.getByText('Finally act', { exact: true })).toBeAttached();

  const overviewPath = path.resolve(
    'test-results/captures/visual-language',
    `${testInfo.project.name}-overview.png`,
  );
  await mkdir(path.dirname(overviewPath), { recursive: true });
  await page.screenshot({ path: overviewPath, fullPage: true });

  const profiles = mobile
    ? [
        { name: 'mobile-390x844', width: 390, height: 844 },
        { name: 'narrow-304x844', width: 304, height: 844 },
      ]
    : [
        { name: 'tall-1200x1920', width: 1200, height: 1920 },
        { name: 'desktop-1440x1000', width: 1440, height: 1000 },
        { name: 'ultrawide-2560x1440', width: 2560, height: 1440 },
      ];
  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(artifactUrl);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Research synthesis', level: 1 })).toBeVisible();
    const initialStage = page.locator('#stage');
    await expect
      .poll(() =>
        initialStage.evaluate((section) => {
          if (section.getBoundingClientRect().top >= innerHeight) return true;
          return (
            !section.hasAttribute('data-reveal-pending') &&
            [...section.children].every((child) => getComputedStyle(child).opacity === '1')
          );
        }),
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: path.resolve('test-results/captures/visual-language', `${profile.name}-initial.png`),
    });
    await page.locator('#story').evaluate((section) => {
      const topbar = document.querySelector<HTMLElement>('.topbar');
      const offset = (topbar?.getBoundingClientRect().height ?? 0) + 16;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - offset });
    });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.screenshot({
      path: path.resolve('test-results/captures/visual-language', `${profile.name}-story.png`),
    });
  }
  expect(requestUrls.length).toBeGreaterThan(0);
  expect(requestUrls.every((url) => url.startsWith('file://'))).toBe(true);
});
