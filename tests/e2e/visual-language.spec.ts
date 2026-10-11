import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

const artifactUrl = pathToFileURL(
  path.resolve('test-results/e2e-generated/layout-mixed.html'),
).href;

test('native opening figures stay whole and flow disclosures follow the prose column', async ({
  page,
}, testInfo) => {
  // Defects: a 62svh opening frame clipped the chart's axis at 1440×900; a flow disclosure kept a
  // full-track rule beside narrower prose. Checking all rendered labels catches vertical clipping,
  // not merely horizontal overflow, and a broad nested table must keep the document's column width.
  // At 768px the old outer-figure query chose a wide chart although its padded drawing area made
  // ten labels 10.6px. Measure the rendered font rather than accepting a merely contained SVG.
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = testInfo.outputPath('native-opening');
  await mkdir(root, { recursive: true });
  for (const layout of ['landing', 'document', 'mixed']) {
    const source = path.join(root, `${layout}.md`);
    const output = path.join(root, `${layout}.html`);
    await writeFile(
      source,
      `---
title: Native evidence
layout: ${layout}
theme: neutral
motion: none
---

# Read the evidence

An agent supplies the source; the reader explores the result and returns questions.

::::::section{title="Checkout failure rate" id="opening-proof" recipe="demo" place="opening" transition="none"}
:::::chart{type="line" title="Failed attempts" description="Five fictional checkpoints show checkout failures rising and returning to baseline." x-label="UTC checkpoint" y-label="Failed attempts, percent"}
::::series{label="Failure rate"}
::point{label="09:35" value="0.6"}
::point{label="09:50" value="8.7"}
::point{label="10:05" value="18.4"}
::point{label="10:20" value="7.2"}
::point{label="10:35" value="0.8"}
::::
:::::
:::::diagram{type="flow" title="Evidence chain" description="An author supplies source, compilation produces a page, and the reader explores it and returns questions." layout="down"}
::node{id="source" label="Source" detail="Markdown and evidence"}
::node{id="compile" label="Compile" detail="Validate declarations"}
::node{id="render" label="Render" detail="Keep readable labels"}
::node{id="read" label="Read" detail="Explore evidence"}
::node{id="ask" label="Ask" detail="Return a question"}
::edge{from="source" to="compile"}
::edge{from="compile" to="render"}
::edge{from="render" to="read"}
::edge{from="read" to="ask"}
:::::
::::::

::::section{title="Readable source" id="source-proof" width="wide" composition="flow" transition="none"}
Keep the source beside the result. A disclosure keeps the same reading column as this explanatory paragraph.

:::disclosure{title="Inspect the source" open="false"}
This paragraph stays in the reading column when the source is expanded.

\`\`\`text
${'evidence '.repeat(40)}
\`\`\`

| Name | Kind | Input | Output | Notes | Owner | State |
| --- | --- | --- | --- | --- | --- | --- |
| Source | Declaration | Confined Markdown partials | A readable page | Original source retained | Author | Ready |
| Data | Evidence | Checked numeric values | An interactive figure | Five fictional checkpoints | Reader | Ready |
:::
::::
`,
    );
    await buildReport({ input: source, output });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(pathToFileURL(output).href);
      await page.evaluate(() => document.fonts.ready);
      const figures = await page
        .locator('#opening-proof .visualization-frame')
        .evaluateAll((frames) =>
          frames
            .filter((frame) => frame.getBoundingClientRect().width > 1)
            .map((frame) => {
              const box = frame.getBoundingClientRect();
              const labels = [...frame.querySelectorAll<SVGTextElement>('svg text')].filter(
                (label) =>
                  label.getClientRects().length > 0 && label.getBoundingClientRect().width > 1,
              );
              return {
                labels: labels.length,
                minimumFont: Math.min(
                  ...labels.map((label) => {
                    const matrix = label.getScreenCTM();
                    if (matrix === null)
                      throw new Error('A rendered figure label has no screen transform');
                    return (
                      Number.parseFloat(getComputedStyle(label).fontSize) *
                      Math.hypot(matrix.a, matrix.b)
                    );
                  }),
                ),
                clipped: labels.filter((label) => {
                  const bounds = label.getBoundingClientRect();
                  return bounds.top < box.top - 1 || bounds.bottom > box.bottom + 1;
                }).length,
                verticalOverflow: frame.scrollHeight - frame.clientHeight,
              };
            }),
        );
      expect(figures.length, `${layout}/${viewport.width}`).toBeGreaterThanOrEqual(2);
      for (const figure of figures) {
        expect(figure.labels).toBeGreaterThan(0);
        expect(figure.minimumFont).toBeGreaterThanOrEqual(11);
        expect(figure.clipped).toBe(0);
        expect(figure.verticalOverflow).toBeLessThanOrEqual(1);
      }
      const disclosure = page.locator('#source-proof > details');
      const paragraph = page.locator('#source-proof > p').first();
      const prose = await paragraph.boundingBox();
      expect(prose).not.toBeNull();
      for (const expanded of [false, true]) {
        if (expanded) await disclosure.locator('summary').click();
        const box = await disclosure.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs((box?.x ?? 0) - (prose?.x ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((box?.width ?? 0) - (prose?.width ?? 0))).toBeLessThanOrEqual(1);
      }
      if (viewport.width > 768 && layout !== 'landing') {
        await expect(disclosure.locator('thead th')).toHaveCount(7);
        const wide = await disclosure.locator('.table-frame').boundingBox();
        expect(wide).not.toBeNull();
        expect(Math.abs((wide?.x ?? 0) - (prose?.x ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((wide?.width ?? 0) - (prose?.width ?? 0))).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

test('declarative visual families remain distinct, readable, and contained', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile');
  const requestUrls: string[] = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1920 };
  await page.setViewportSize(viewport);
  await page.goto(artifactUrl);

  const expected = [
    [
      'stage',
      'stage',
      'full',
      'immersive',
      'display',
      'natural',
      'cover',
      'cinematic',
      'right',
      'tint',
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
      'tint',
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
      'tint',
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

  // Каталог показывает и формы драматургии; здесь проверяются семейства композиции.
  await expect(
    page.locator(expected.map(([id]) => `.semantic-section#${id}`).join(', ')),
  ).toHaveCount(expected.length);
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
  expect(visualState.stage.mask).toBe('none');
  expect(Math.abs(visualState.bleed.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualState.bleed.right)).toBeLessThanOrEqual(1);
  expect(visualState.galleryOverflows).toBe(true);
  expect(visualState.compatibleCombinations.layersCardsDisplay).toBe('grid');
  expect(visualState.compatibleCombinations.galleryCardsDisplay).toBe('grid');
  expect(visualState.surfaces.every((background) => background !== 'none')).toBe(true);
  // Каталог показывает все три непустые поверхности: tint, grain и grid.
  expect(new Set(visualState.surfaces).size).toBe(3);
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
    // A mosaic is a grid of several columns on a wide screen; how many depends on the section's width,
    // which on a mixed page is the column's wide step (1.5 × the reading measure): three cards fit one row
    // at 1440. Catches a mosaic that stays one column on a desktop.
    expect(visualState.mosaicColumns).toBeGreaterThan(1);
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
    await expect(
      page.getByRole('heading', { name: 'Complete visual language catalog', level: 1 }),
    ).toBeVisible();
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

test('legacy mask media remains unmasked without discarding authored framing in every render profile', async ({
  page,
}) => {
  // Defect: accepting legacy media="mask" must not retain the polygon that cuts real screenshot edges;
  // replacing all framing with natural defaults would also pass a clip-only assertion, so compare both.
  const url = pathToFileURL(path.resolve('test-results/e2e-generated/legacy-mask.html')).href;
  for (const profile of [
    { media: 'screen', reducedMotion: 'no-preference' },
    { media: 'screen', reducedMotion: 'reduce' },
    { media: 'print', reducedMotion: 'reduce' },
  ] as const) {
    await page.emulateMedia(profile);
    await page.goto(url);
    await expect(page.locator('#mask-proof')).toHaveAttribute('data-media', 'natural');
    for (const id of ['mask-proof', 'natural-proof']) {
      await expect(page.locator(`#${id} img`)).toBeVisible();
      await expect
        .poll(() =>
          page.locator(`#${id} img`).evaluate((image) => {
            const picture = image as HTMLImageElement;
            return picture.complete && picture.naturalWidth > 0;
          }),
        )
        .toBe(true);
    }
    const [legacy, natural] = await page.locator('.semantic-section img').evaluateAll((images) =>
      images.map((image) => {
        const style = getComputedStyle(image);
        return {
          clip: style.clipPath,
          mask: style.maskImage,
          fit: style.objectFit,
          aspect: style.aspectRatio,
          focal: style.objectPosition,
        };
      }),
    );
    expect(legacy, `${profile.media}/${profile.reducedMotion}`).toEqual(natural);
    expect(legacy).toMatchObject({ clip: 'none', mask: 'none', fit: 'cover', aspect: '21 / 9' });
    expect(legacy?.focal).toMatch(/100%|right/u);
  }
});

test('a picture in an evidence section is shown whole at every desktop width', async ({
  page,
}, testInfo) => {
  // Defect: the evidence recipe gave its media the photo art direction — a skewed quadrilateral mask and
  // a 16:10 cover crop — so a diagram or a screenshot offered as proof was drawn tilted and lost its
  // edges (the release document's evidence map lost «Markdown + assets» and «report.html»).
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const root = path.resolve('test-results/e2e-evidence-media');
  await mkdir(root, { recursive: true });
  const pages: string[] = [];
  for (const source of ['examples/document', 'examples/research', 'website/landing']) {
    const output = path.join(root, `${source.replaceAll('/', '-')}.html`);
    await buildReport({ input: path.resolve(source), output });
    pages.push(output);
  }
  for (const output of pages) {
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(pathToFileURL(output).href);
      const pictures = await page
        .locator('.semantic-section[data-recipe="evidence"] img')
        .evaluateAll((images) =>
          images.map((image) => {
            const picture = image as HTMLImageElement;
            const box = picture.getBoundingClientRect();
            const style = getComputedStyle(picture);
            return {
              clip: style.clipPath,
              fit: style.objectFit,
              drawn: box.width / box.height,
              natural: picture.naturalWidth / picture.naturalHeight,
            };
          }),
        );
      const label = `${path.basename(output)} at ${width}`;
      expect(pictures.length, label).toBeGreaterThan(0);
      for (const picture of pictures) {
        expect(picture.clip, label).toBe('none');
        // Whole: either the box keeps the picture's proportions or the picture is contained in it.
        if (picture.fit !== 'contain')
          expect(Math.abs(picture.drawn / picture.natural - 1), label).toBeLessThan(0.02);
      }
    }
  }
});
