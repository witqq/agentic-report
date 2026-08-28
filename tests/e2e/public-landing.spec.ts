import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { test, expect } from './fixtures.js';

const generatedRoot = path.resolve('test-results/e2e-generated');
const stagedSiteRoot = path.resolve('test-results/e2e-site');
const artifactUrl = (name: string): string => pathToFileURL(path.join(generatedRoot, name)).href;

const landingArtifacts = [
  { format: 'single-file', url: artifactUrl('public-landing.html') },
  { format: 'directory', url: artifactUrl('public-landing-directory/index.html') },
] as const;

const exampleUrls = {
  incident: artifactUrl('incident-review.html'),
  vendor: artifactUrl('vendor-decision.html'),
  launch: artifactUrl('launch-readiness.html'),
} as const;

const expectNoDocumentOverflow = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
};

const expectLoaded = async (image: Locator): Promise<void> => {
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
};

const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

test('public repeat-review route exposes the fictional changed prior handoff', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(
    pathToFileURL(path.join(stagedSiteRoot, 'examples/review-workspace/index.html')).href,
  );
  await page.locator('[data-review-toggle]').click();
  await expect(page.locator('[data-review-prior-section]')).toContainText(
    'Prior · changed · unresolved',
  );
  await expect(page.locator('[data-review-prior-section]')).toContainText(
    'Explain why this evidence supports the release conclusion.',
  );
  await mkdir(path.resolve('test-results/captures/public-site'), { recursive: true });
  await page.screenshot({
    path: path.resolve('test-results/captures/public-site/repeat-review-desktop.png'),
    fullPage: true,
  });
});

const expectCompactFieldManualHeader = async (
  page: Page,
  width: 320 | 390,
  section: 'Proof' | 'Examples',
): Promise<void> => {
  await page.setViewportSize({ width, height: 844 });
  const identity = page.locator('.topbar-title-short');
  const current = page.locator('.topbar-current');
  await expect(identity).toHaveText('Agentic Report');
  await expect(current).toContainText(`Current / ${section}`);
  for (const label of [identity, current]) {
    expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
};

test('public landing has the exact proof-first contract in both output formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const renderedContent: string[] = [];
  for (const artifact of landingArtifacts) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(artifact.url);
    await expect(page).toHaveTitle(
      'agentic-report — declarative interactive pages for agent handoffs',
    );
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'editorial');
    await expect(
      page.getByRole('heading', { name: 'Give your agent a better handoff.', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('section.semantic-section')).toHaveCount(9);
    await expect(page.locator('[data-navigation] a')).toHaveText([
      'Proof',
      'Agent skill',
      'Workflow',
      'Examples',
      'Page types',
      'Landing pages',
      'Boundaries',
      'Docs',
      'Start',
    ]);
    await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveCount(1);
    const fieldManualState = await page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>('[data-nav-desktop-host]');
      const content = document.querySelector<HTMLElement>('.report-content');
      const action = document.querySelector<HTMLElement>('.semantic-action[data-kind="primary"]');
      const icon = action?.querySelector<SVGElement>('[data-package-icon="arrow-right"]');
      const navigationIcon = document.querySelector<SVGElement>(
        '.nav-toggle [data-package-icon="three-bars"]',
      );
      if (
        sidebar === null ||
        content === null ||
        action === null ||
        icon === undefined ||
        icon === null ||
        navigationIcon === null
      ) {
        throw new Error('Field Manual shell, action, and icon are required.');
      }
      const sidebarBox = sidebar.getBoundingClientRect();
      const contentBox = content.getBoundingClientRect();
      const controls = [
        ['nav', document.querySelector<HTMLElement>('.nav-toggle')],
        ['theme', document.querySelector<HTMLElement>('.theme-toggle')],
        ['copy', document.querySelector<HTMLElement>('.copy-code')],
        ['action', action],
      ] as const;
      return {
        sidebarPosition: getComputedStyle(sidebar).position,
        separated: sidebarBox.right <= contentBox.left,
        iconSize: icon.getBoundingClientRect().width,
        navigationIconSize: navigationIcon.getBoundingClientRect().width,
        controls: controls.map(([name, control]) => {
          if (control === null) throw new Error(`Missing Field Manual ${name} control.`);
          const style = getComputedStyle(control);
          return {
            name,
            height: control.getBoundingClientRect().height,
            paddingLeft: Number.parseFloat(style.paddingLeft),
            paddingRight: Number.parseFloat(style.paddingRight),
            gap: Number.parseFloat(style.gap),
          };
        }),
      };
    });
    expect(fieldManualState).toMatchObject({
      sidebarPosition: 'sticky',
      separated: true,
      iconSize: 16,
      navigationIconSize: 16,
    });
    for (const control of fieldManualState.controls) {
      expect(control.height, control.name).toBeGreaterThanOrEqual(32);
      expect(control.height, control.name).toBeLessThanOrEqual(40);
      expect(control.paddingLeft, control.name).toBeLessThanOrEqual(13.2);
      expect(control.paddingRight, control.name).toBeLessThanOrEqual(13.2);
      expect(control.gap, control.name).toBe(6);
    }
    await expect(page.locator('#page-types .semantic-card')).toHaveCount(8);
    await expect(page.locator('#proof .semantic-card')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Verbatim declarative source', level: 3 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compiled result', level: 3 })).toBeVisible();
    await expect(
      page.getByText('npx --yes agentic-report build ./website/landing', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Use Node.js 24.18.0 or newer.', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('package-owned browser runtime is included and required', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('Fictional sample.', { exact: true })).toHaveCount(3);
    for (const imageName of [
      /Fictional incident review/u,
      /Fictional vendor decision/u,
      /Fictional launch review/u,
    ]) {
      await expectLoaded(page.getByRole('img', { name: imageName }));
    }
    await expectNoDocumentOverflow(page);
    renderedContent.push(await page.locator('main').innerText());
  }
  expect(renderedContent[0]).toBe(renderedContent[1]);
});

test('landing proof links identify separately publishable examples and their public source targets', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(landingArtifacts[0].url);
  const expectedLinks = [
    ['examples/incident-review/index.html', 'examples/incident-review/report.md'],
    ['examples/vendor-decision/index.html', 'examples/vendor-decision/report.md'],
    ['examples/launch-readiness/index.html', 'examples/launch-readiness/report.md'],
  ] as const;
  for (const [live, source] of expectedLinks) {
    await expect(page.locator(`#examples a[href="${live}"]`)).toHaveCount(1);
    await expect(page.locator(`#examples a[href="${source}"]`)).toHaveCount(1);
  }
  await expect(page.getByRole('link', { name: 'Architecture', exact: true })).toHaveAttribute(
    'href',
    'docs/ARCHITECTURE.md',
  );

  const provenance = JSON.parse(
    await readFile(path.resolve('website/landing/assets/screenshots.json'), 'utf8'),
  ) as {
    readonly screenshots: readonly {
      readonly id: string;
      readonly artifactSha256: string;
      readonly liveRoute: string;
      readonly publicSourceRoute: string;
    }[];
  };
  const artifactNames = {
    incident: 'incident-review.html',
    vendor: 'vendor-decision.html',
    launch: 'launch-readiness.html',
  } as const;
  const provenanceIds = {
    'incident-review': 'incident',
    'vendor-decision': 'vendor',
    'launch-readiness': 'launch',
  } as const;
  for (const screenshot of provenance.screenshots) {
    const exampleId = provenanceIds[screenshot.id as keyof typeof provenanceIds];
    expect(exampleId).toBeDefined();
    expect(sha256(await readFile(path.join(generatedRoot, artifactNames[exampleId])))).toBe(
      screenshot.artifactSha256,
    );
    if (screenshot.id === 'launch-readiness') {
      const proof = page.locator('#proof');
      await expect(
        proof.getByRole('link', { name: 'Read the complete launch source' }),
      ).toHaveAttribute('href', screenshot.publicSourceRoute);
      await expect(
        proof.getByRole('link', { name: 'Open this fictional launch page' }),
      ).toHaveAttribute('href', screenshot.liveRoute);
      await expectLoaded(
        proof.getByRole('img', {
          name: 'Decision-oriented launch page with navigation, evidence cards, charts, and a timeline',
        }),
      );
    }
  }

  await page.goto(exampleUrls.incident);
  const ruledOut = page.getByRole('tab', { name: 'Ruled out' });
  await ruledOut.click();
  await expect(ruledOut).toHaveAttribute('aria-selected', 'true');
  const communication = page
    .locator('[data-disclosure]')
    .filter({ hasText: 'Open the customer communication draft' });
  await communication.getByText('Open the customer communication draft', { exact: true }).click();
  await expect(communication).toHaveAttribute('open', '');

  await page.goto(exampleUrls.vendor);
  await page.getByRole('button', { name: 'Why not the top score?' }).click();
  await expect(page.getByRole('dialog', { name: 'Ranking exception' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open the evidence checklist' }).click();
  await expect(page.getByRole('dialog', { name: 'Reviewer evidence checklist' })).toBeVisible();

  await page.goto(exampleUrls.launch);
  const residualRisk = page.getByRole('tab', { name: 'Residual risk' });
  await residualRisk.click();
  await expect(residualRisk).toHaveAttribute('aria-selected', 'true');
  const hold = page.getByRole('switch', { name: 'Show the automatic hold condition' });
  await hold.click();
  await expect(hold).toHaveAttribute('aria-checked', 'true');
});

test('captures the complete public-landing acceptance states in both formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-4-captures/landing');
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });

  const capture = async (
    artifact: (typeof landingArtifacts)[number],
    state: string,
    options: {
      readonly width: number;
      readonly height: number;
      readonly theme?: 'light' | 'dark';
      readonly reducedMotion?: 'reduce' | 'no-preference';
      readonly target?: string;
      readonly collapse?: boolean;
      readonly drawer?: boolean;
    },
  ): Promise<void> => {
    await page.setViewportSize({ width: options.width, height: options.height });
    await page.emulateMedia({
      colorScheme: options.theme === 'dark' ? 'dark' : 'light',
      reducedMotion: options.reducedMotion ?? 'no-preference',
    });
    await page.goto(artifact.url);
    await page.locator('html').evaluate((element, theme) => {
      element.dataset.theme = theme;
    }, options.theme ?? 'light');
    if (options.target !== undefined) {
      const target = page.locator(options.target);
      await target.evaluate((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
      await expect(target).not.toHaveAttribute('data-reveal-pending', '');
      await expect(target).toHaveCSS('opacity', '1');
      await expect(target).toHaveCSS('transform', 'none');
    }
    if (options.collapse === true) {
      await page.getByRole('button', { name: 'Hide contents' }).click();
    }
    if (options.drawer === true) {
      await page.getByRole('button', { name: 'Open contents' }).click();
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await expect(page.locator('[data-navigation] a')).toHaveCount(9);
      await expect(page.locator('[data-nav-dialog]')).toHaveCSS('opacity', '1');
      await expect(page.locator('[data-nav-dialog]')).toHaveCSS(
        'transform',
        /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u,
      );
      const drawerBounds = await page.locator('[data-nav-dialog]').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, height: box.height, width: box.width };
      });
      expect(drawerBounds.x).toBe(0);
      expect(drawerBounds.height).toBe(options.height);
      expect(drawerBounds.width).toBeLessThan(options.width);
      const closeMetrics = await page
        .getByRole('button', { name: 'Close', exact: true })
        .evaluate((button) => {
          const style = getComputedStyle(button);
          return {
            height: button.getBoundingClientRect().height,
            paddingLeft: Number.parseFloat(style.paddingLeft),
            paddingRight: Number.parseFloat(style.paddingRight),
            gap: Number.parseFloat(style.gap),
          };
        });
      expect(closeMetrics).toEqual({ height: 40, paddingLeft: 12, paddingRight: 12, gap: 6 });
    }
    await expectNoDocumentOverflow(page);
    await page.screenshot({
      path: path.join(captureRoot, `${artifact.format}-${state}.png`),
    });
  };

  for (const artifact of landingArtifacts) {
    for (const width of [320, 390] as const) {
      await page.goto(artifact.url);
      await expectCompactFieldManualHeader(page, width, 'Proof');
      await page.goto(`${artifact.url}#examples`);
      await expectCompactFieldManualHeader(page, width, 'Examples');
    }
    await capture(artifact, 's1-hero-light-expanded', { width: 1440, height: 1000 });
    await capture(artifact, 's2-examples-dark-expanded', {
      width: 1440,
      height: 1000,
      theme: 'dark',
      target: '#examples',
    });
    await capture(artifact, 's3-light-collapsed', {
      width: 1280,
      height: 900,
      collapse: true,
    });
    await capture(artifact, 's4-page-types-1024', {
      width: 1024,
      height: 900,
      target: '#page-types',
    });
    expect(
      await page
        .locator('#page-types .semantic-cards')
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length,
        ),
    ).toBe(2);
    await capture(artifact, 's5-mobile-hero', { width: 390, height: 844 });
    expect(
      await page
        .getByRole('img', {
          name: 'Fictional regional beta launch page compiled from the public declarative source',
        })
        .first()
        .evaluate((element) => element.getBoundingClientRect().top < innerHeight),
    ).toBe(true);
    await capture(artifact, 's6-mobile-drawer-dark', {
      width: 390,
      height: 844,
      theme: 'dark',
      drawer: true,
    });
    await capture(artifact, 's7-reduced-proof', {
      width: 390,
      height: 844,
      reducedMotion: 'reduce',
      target: '#proof',
    });
    await expect(
      page.locator('[data-scroll-progress-indicator], [data-reveal-pending]'),
    ).toHaveCount(0);
    await capture(artifact, 's7-reduced-examples', {
      width: 390,
      height: 844,
      reducedMotion: 'reduce',
      target: '#examples',
    });
    await expect(
      page.locator('[data-scroll-progress-indicator], [data-reveal-pending]'),
    ).toHaveCount(0);
    await capture(artifact, 's9-self-hosting-proof', {
      width: 1440,
      height: 1000,
      target: '#proof',
    });
  }

  const expected = landingArtifacts.flatMap((artifact) =>
    [
      's1-hero-light-expanded',
      's2-examples-dark-expanded',
      's3-light-collapsed',
      's4-page-types-1024',
      's5-mobile-hero',
      's6-mobile-drawer-dark',
      's7-reduced-proof',
      's7-reduced-examples',
      's9-self-hosting-proof',
    ].map((state) => `${artifact.format}-${state}.png`),
  );
  expect((await readdir(captureRoot)).sort()).toEqual(expected.sort());
});

test('recaptures the six dense fictional-example states after runtime changes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-4-captures/dense-examples');
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const [name, url] of Object.entries(exampleUrls)) {
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(url);
      await page.locator('html').evaluate((element, value) => {
        element.dataset.theme = value;
      }, theme);
      await expectNoDocumentOverflow(page);
      await page.screenshot({ path: path.join(captureRoot, `${name}-${theme}.png`) });
    }
  }
  expect((await readdir(captureRoot)).sort()).toEqual([
    'incident-dark.png',
    'incident-light.png',
    'launch-dark.png',
    'launch-light.png',
    'vendor-dark.png',
    'vendor-light.png',
  ]);
});
