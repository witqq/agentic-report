import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator } from '@playwright/test';

import { test, expect } from './fixtures.js';

const artifactUrl = pathToFileURL(path.resolve('test-results/e2e-artifact/report.html')).href;
const directoryArtifactUrl = pathToFileURL(
  path.resolve('test-results/e2e-generated/directory-artifact/index.html'),
).href;
const layoutArtifactUrl = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;

const interactiveArtifactUrl = layoutArtifactUrl('interactive-catalog');
const starterArtifactUrl = (id: string): string => layoutArtifactUrl(`starter-${id}`);
const landingSectionArtifacts = [
  { format: 'single-file', url: starterArtifactUrl('landing') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/starter-landing-directory/index.html'),
    ).href,
  },
] as const;
const visualizationArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('visualization-catalog') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/visualization-catalog-directory/index.html'),
    ).href,
  },
] as const;
const incidentReviewArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('incident-review') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/incident-review-directory/index.html'),
    ).href,
  },
] as const;
const vendorDecisionArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('vendor-decision') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/vendor-decision-directory/index.html'),
    ).href,
  },
] as const;
const launchReadinessArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('launch-readiness') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/launch-readiness-directory/index.html'),
    ).href,
  },
] as const;

const starters = [
  {
    id: 'basic',
    heading: 'Release decision report',
    layout: 'document',
    component: '.semantic-timeline',
    image: 'Evidence moving from source through verification to a release decision',
  },
  {
    id: 'research',
    heading: 'Assisted authoring research synthesis',
    layout: 'mixed',
    component: '.semantic-chart',
    image: 'Research inputs converging into a recommendation',
  },
  {
    id: 'architecture',
    heading: 'Portable page architecture',
    layout: 'document',
    component: '.semantic-diagram',
    image: 'The source, compiler, artifact, and browser boundary',
  },
  {
    id: 'tutorial',
    heading: 'Build your first portable page',
    layout: 'document',
    component: '.semantic-demo',
  },
  {
    id: 'dashboard',
    heading: 'Delivery control room',
    layout: 'dashboard',
    component: '.semantic-filter',
  },
  {
    id: 'landing',
    heading: 'From Markdown to a page worth sharing',
    layout: 'landing',
    component: '.semantic-timeline',
  },
] as const;

for (const starter of starters) {
  test(`starter ${starter.id} is useful, responsive, and interactive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(starterArtifactUrl(starter.id));
    await expect(page.locator('html')).toHaveAttribute('data-layout', starter.layout);
    await expect(page.getByRole('heading', { name: starter.heading, level: 1 })).toBeVisible();
    await expect(page.locator(starter.component).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/lorem ipsum|todo|placeholder/iu);
    if ('image' in starter) await expectLoadedImage(page.getByRole('img', { name: starter.image }));

    switch (starter.id) {
      case 'basic': {
        const disclosure = page.locator('[data-disclosure]');
        await disclosure.getByText('Open the residual-risk register', { exact: true }).click();
        await expect(disclosure).toHaveAttribute('open', '');
        break;
      }
      case 'research': {
        const constraints = page.getByRole('tab', { name: 'Constraints' });
        await constraints.click();
        await expect(constraints).toHaveAttribute('aria-selected', 'true');
        break;
      }
      case 'architecture': {
        const opener = page.getByRole('button', { name: 'Open review checklist' });
        await opener.click();
        await expect(
          page.getByRole('dialog', { name: 'Architecture review checklist' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
        break;
      }
      case 'tutorial': {
        const output = page.locator('[data-demo-output]');
        await expect(output).toHaveText('0');
        await page.getByRole('button', { name: 'Increment' }).click();
        await expect(output).toHaveText('1');
        break;
      }
      case 'dashboard': {
        const search = page.getByRole('searchbox', { name: 'Filter' });
        await search.fill('Product');
        await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
        const toggle = page.getByRole('switch', { name: 'Show external release boundary' });
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        break;
      }
      case 'landing': {
        const trigger = page.getByRole('button', { name: 'Why does file:// matter?' });
        await trigger.click();
        await expect(page.getByRole('dialog', { name: 'Portability details' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        break;
      }
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const captureDirectory = path.resolve('test-results/starter-captures', testInfo.project.name);
    await mkdir(captureDirectory, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(captureDirectory, `${starter.id}.png`),
      fullPage: true,
    });
  });
}

for (const artifact of landingSectionArtifacts) {
  test(`${artifact.format} section and action contract is semantic and responsive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    const sections = page.locator('section.semantic-section');
    await expect(sections).toHaveCount(4);
    await expect(page.locator('#workflow')).toHaveAttribute('aria-labelledby', 'workflow-title');
    await expect(
      page.getByRole('heading', { name: 'Start with the work, not the framework', level: 2 }),
    ).toHaveAttribute('id', 'workflow-title');
    await expect(page.locator('#workflow')).toHaveAttribute('data-width', 'wide');
    await expect(page.locator('#workflow')).toHaveAttribute('data-tone', 'soft');
    await expect(page.locator('#proof')).toHaveAttribute('data-width', 'reading');
    await expect(page.locator('#proof')).toHaveAttribute('data-tone', 'accent');
    await expect(page.locator('#boundaries')).toHaveAttribute('data-align', 'center');
    await expect(page.locator('#boundaries')).toHaveAttribute('data-tone', 'contrast');

    const navigation = page.locator('[data-navigation]');
    await expect(navigation.locator('a')).toHaveCount(4);
    await expect(navigation.locator('a', { hasText: 'Workflow' })).toHaveAttribute(
      'href',
      '#workflow',
    );
    await expect(navigation.locator('a', { hasText: 'Proof' })).toHaveAttribute('href', '#proof');

    const primary = page.locator('.semantic-action[data-kind="primary"]').first();
    const secondary = page.locator('.semantic-action[data-kind="secondary"]').first();
    const quiet = page.locator('.semantic-action[data-kind="quiet"]').first();
    await expect(primary).toHaveAttribute('href', '#workflow');
    await expect(secondary).toHaveAttribute('href', '#proof');
    await expect(quiet).toHaveAttribute('href', '#boundaries');
    await primary.focus();
    await expect(primary).toBeFocused();
    expect(
      await primary.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const contrastActions = page.locator('#boundaries .semantic-action');
    await expect(contrastActions).toHaveCount(3);
    const themeVariants = [
      { theme: 'light', colorScheme: 'light' },
      { theme: 'dark', colorScheme: 'dark' },
      { theme: 'system', colorScheme: 'light' },
      { theme: 'system', colorScheme: 'dark' },
    ] as const;
    for (const variant of themeVariants) {
      await page.emulateMedia({ colorScheme: variant.colorScheme });
      for (const accent of ['indigo', 'teal', 'coral'] as const) {
        await page.locator('html').evaluate(
          (root, state) => {
            root.dataset.theme = state.theme;
            root.dataset.accent = state.accent;
          },
          { theme: variant.theme, accent },
        );
        for (const tone of ['plain', 'soft', 'accent', 'contrast'] as const) {
          await page.locator('#boundaries').evaluate((section, value) => {
            section.dataset.tone = value;
          }, tone);
          for (const kind of ['primary', 'secondary', 'quiet'] as const) {
            const action = page.locator(`#boundaries .semantic-action[data-kind="${kind}"]`);
            await action.focus();
            const contrast = await action.evaluate((element) => {
              const section = element.closest<HTMLElement>('.semantic-section');
              if (section === null) throw new Error('Action has no owning section.');
              const actionStyle = getComputedStyle(element);
              const sectionStyle = getComputedStyle(section);
              const parseRgb = (value: string): readonly [number, number, number] => {
                const channels = value
                  .match(/[\d.]+/gu)
                  ?.slice(0, 3)
                  .map(Number);
                if (channels?.length !== 3) throw new Error(`Unsupported computed color: ${value}`);
                return channels as unknown as readonly [number, number, number];
              };
              const luminance = (value: string): number => {
                const linearize = (channel: number): number => {
                  const normalized = channel / 255;
                  return normalized <= 0.04045
                    ? normalized / 12.92
                    : ((normalized + 0.055) / 1.055) ** 2.4;
                };
                const [red, green, blue] = parseRgb(value);
                return (
                  0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
                );
              };
              const ratio = (first: string, second: string): number => {
                const firstLuminance = luminance(first);
                const secondLuminance = luminance(second);
                const lighter = Math.max(firstLuminance, secondLuminance);
                const darker = Math.min(firstLuminance, secondLuminance);
                return (lighter + 0.05) / (darker + 0.05);
              };
              const transparent = (value: string): boolean => value.endsWith(', 0)');
              const sectionBackground = transparent(sectionStyle.backgroundColor)
                ? getComputedStyle(document.body).backgroundColor
                : sectionStyle.backgroundColor;
              const ownBackground = actionStyle.backgroundColor;
              const textBackground = transparent(ownBackground) ? sectionBackground : ownBackground;
              return {
                text: ratio(actionStyle.color, textBackground),
                focus: ratio(actionStyle.outlineColor, sectionBackground),
                outlineWidth: Number.parseFloat(actionStyle.outlineWidth),
              };
            });
            expect(
              contrast.text,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/text`,
            ).toBeGreaterThanOrEqual(4.5);
            expect(
              contrast.focus,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/focus`,
            ).toBeGreaterThanOrEqual(3);
            expect(
              contrast.outlineWidth,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/outline`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }

    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('html').evaluate((root) => {
      root.dataset.theme = 'light';
      root.dataset.accent = 'coral';
    });
    await page.locator('#boundaries').evaluate((section) => {
      section.dataset.tone = 'contrast';
    });
    await page.locator('#boundaries .semantic-action[data-kind="quiet"]').focus();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const captureDirectory = path.resolve('test-results/step-1-captures', testInfo.project.name);
    await mkdir(captureDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(captureDirectory, `${artifact.format}-landing.png`),
      fullPage: true,
    });
  });
}

test('generated artifact is navigable and interactive from file URL', async ({ page }) => {
  await page.goto(artifactUrl);

  await expect(page).toHaveTitle('Portable architecture report');
  await expect(page.getByRole('heading', { name: 'Architecture report' })).toBeVisible();
  const navigation = page.locator('[data-navigation]');
  await expect(navigation).toBeAttached();
  await expect(navigation.getByText('Decision branches', { exact: true })).toHaveAttribute(
    'href',
    '#decision-branches',
  );
  await expect(page.locator('pre code')).toContainText("const output = 'single-file';");
  const embeddedImage = page.getByRole('img', { name: 'Runtime placement' });
  await expect(embeddedImage).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/u);
  await expectLoadedImage(embeddedImage);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();

  const demoOutput = page.locator('[data-demo-output]');
  await expect(demoOutput).toHaveText('1');
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(demoOutput).toHaveText('3');

  const theme = page.locator('html');
  const before = await theme.getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(theme).not.toHaveAttribute('data-theme', before ?? '');
});

test('code copy control handles file URL clipboard behavior without runtime errors', async ({
  page,
}) => {
  await page.goto(artifactUrl);
  const copy = page.getByRole('button', { name: 'Copy' });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(copy).toHaveText(/Copied|Copy unavailable/);
});

test('directory artifact loads external assets directly from file URL', async ({ page }) => {
  await page.goto(directoryArtifactUrl);
  await expect(page.getByRole('heading', { name: 'Architecture report' })).toBeVisible();
  await expect(page.locator('pre code')).toContainText("const output = 'single-file';");
  const externalImage = page.getByRole('img', { name: 'Runtime placement' });
  await expect(externalImage).toHaveAttribute(
    'src',
    /^assets\/runtime-placement\.[a-f0-9]{12}\.svg$/u,
  );
  await expectLoadedImage(externalImage);

  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.locator('[data-demo-output]')).toHaveText('3');
});

for (const fixture of [
  { file: 'tutorial.html', heading: 'Code tutorial', selector: '[data-demo-counter]' },
  { file: 'work-report.html', heading: 'Weekly work report', selector: '.semantic-callout' },
  { file: 'landing.html', heading: 'Portable reports for agents', selector: '.semantic-cards' },
] as const) {
  test(`representative ${fixture.file} artifact is semantic and portable`, async ({ page }) => {
    const url = pathToFileURL(path.resolve('test-results/e2e-generated', fixture.file)).href;
    await page.goto(url);
    await expect(page.getByRole('heading', { name: fixture.heading, level: 1 })).toBeVisible();
    await expect(page.locator(fixture.selector)).toBeVisible();
    if (fixture.file === 'landing.html') {
      await expect(page.getByRole('button', { name: 'Contents' })).toHaveCount(0);
      await expect(page.locator('[data-navigation]')).toHaveCount(0);
    }
  });
}

test('reduced-motion preference disables smooth scrolling and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(artifactUrl);

  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior),
  ).toBe('auto');
  const transitionDuration = await page
    .getByRole('button', { name: 'Toggle color theme' })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
});

test('mobile navigation opens without a hardcoded server URL', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  await page.goto(artifactUrl);
  const toggle = page.getByRole('button', { name: 'Contents' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-navigation]')).toHaveAttribute('data-open', '');
  await expect(page.locator('[data-navigation]')).toBeVisible();
});

test('declarative interactions preserve scoped state, focus, and responsive file behavior', async ({
  page,
}, testInfo) => {
  await page.goto(interactiveArtifactUrl);
  const activate = async (locator: Locator): Promise<void> => {
    if (testInfo.project.name.startsWith('mobile')) await locator.tap();
    else await locator.click();
  };

  const terms = page.getByRole('button', { name: 'Decision packet' });
  await expect(terms).toHaveCount(2);
  const term = terms.first();
  await expect(term.locator('xpath=ancestor::p')).toContainText(
    'keeps a reusable definition close to the exact language',
  );
  await expect(page.locator('#glossary-decision-packet')).toContainText(
    'A compact bundle of evidence',
  );
  const termReference = term.locator('..');
  const termExplanation = termReference.getByRole('dialog', { name: 'Decision packet' });
  if (!testInfo.project.name.startsWith('mobile')) {
    await term.hover();
    await expect(termExplanation).toBeVisible();
    await page.getByRole('heading', { name: 'Interactive component catalog' }).hover();
    await expect(termExplanation).toBeHidden();
  }
  await term.focus();
  await expect(termExplanation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(termExplanation).toBeHidden();
  await expect(term).toBeFocused();
  await activate(term);
  await expect(termExplanation).toBeVisible();
  const fullDefinitionLink = termReference.getByRole('link', { name: 'View full definition' });
  await expect(fullDefinitionLink).toHaveAttribute('href', '#glossary-decision-packet');
  await activate(fullDefinitionLink);
  await expect(page).toHaveURL(/#glossary-decision-packet$/u);
  await expect(page.locator('#glossary-decision-packet')).toBeInViewport();
  await page.getByRole('heading', { name: 'Progressive detail' }).click();
  await expect(termExplanation).toBeHidden();
  const secondTerm = terms.nth(1);
  const secondExplanation = secondTerm.locator('..').getByRole('dialog', {
    name: 'Decision packet',
  });
  await expect(secondExplanation).toBeHidden();
  await activate(secondTerm);
  await expect(secondExplanation).toBeVisible();
  await expect(termExplanation).toBeHidden();
  await expect(term).toHaveAttribute('aria-expanded', 'false');
  await expect(secondTerm).toHaveAttribute('aria-expanded', 'true');
  expect(await term.getAttribute('aria-controls')).not.toBe(
    await secondTerm.getAttribute('aria-controls'),
  );
  await page.keyboard.press('Escape');
  await expect(secondExplanation).toBeHidden();
  await expect(secondTerm).toBeFocused();

  const disclosure = page.locator('[data-disclosure]');
  await expect(disclosure).toHaveAttribute('open', '');
  await activate(disclosure.getByText('Why the source stays declarative', { exact: true }));
  await expect(disclosure).not.toHaveAttribute('open', '');

  const tabGroups = page.locator('[data-tabs]');
  await expect(tabGroups).toHaveCount(2);
  const deliveryTabs = tabGroups.nth(0);
  const independentTabs = tabGroups.nth(1);
  await activate(deliveryTabs.getByRole('tab', { name: 'Directory' }));
  await expect(deliveryTabs.getByRole('tab', { name: 'Directory' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    deliveryTabs.getByRole('tabpanel').filter({ hasText: 'content-addressed' }),
  ).toBeVisible();
  await expect(independentTabs.getByRole('tab', { name: 'Requirements' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await deliveryTabs.getByRole('tab', { name: 'Directory' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const modalOpener = page.getByRole('button', { name: 'Open release checklist' });
  await activate(modalOpener);
  const dialog = page.getByRole('dialog', { name: 'Release checklist' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(modalOpener).toBeFocused();
  await activate(modalOpener);
  await activate(dialog.getByRole('button', { name: 'Close' }));
  await expect(modalOpener).toBeFocused();

  const popoverTrigger = page.getByRole('button', { name: 'Show portability note' });
  await activate(popoverTrigger);
  const popover = page.getByRole('dialog', { name: 'Portability note' });
  await expect(popover).toBeVisible();
  await expect(popoverTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(popoverTrigger).toBeFocused();

  const filter = page.getByRole('searchbox', { name: 'Filter' });
  const filterRoot = page.locator('[data-filter]');
  const directFilterItems = filterRoot.locator(':scope > ul > li');
  const nestedFilterItem = filterRoot.getByText('Nested keyboard route', { exact: true });
  await filter.fill('NESTED KEYBOARD ROUTE');
  await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
  await expect(directFilterItems).toHaveCount(5);
  await expect(directFilterItems.filter({ hasText: 'Focus-restoring modal' })).toBeVisible();
  await expect(nestedFilterItem).toBeVisible();
  await expect(nestedFilterItem).not.toHaveAttribute('hidden', '');
  await expect(directFilterItems.filter({ hasText: 'Native disclosure' })).toBeHidden();

  const hiddenToggle = page.getByRole('switch', { name: 'Show verification evidence' });
  const visibleToggle = page.getByRole('switch', { name: 'Show authoring note' });
  await expect(hiddenToggle).toHaveAttribute('aria-checked', 'false');
  await expect(visibleToggle).toHaveAttribute('aria-checked', 'true');
  await activate(hiddenToggle);
  await expect(hiddenToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('The generated artifact was opened', { exact: false })).toBeVisible();
  await expect(visibleToggle).toHaveAttribute('aria-checked', 'true');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

for (const artifact of visualizationArtifacts) {
  test(`${artifact.format} declarative visualizations are labelled, themed, and responsive from file URL`, async ({
    page,
  }) => {
    await page.goto(artifact.url);
    await expect(
      page.getByRole('heading', { name: 'Product signal atlas', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('[data-visualization="chart"]')).toHaveCount(3);
    await expect(page.locator('[data-chart-type="bar"]')).toBeVisible();
    await expect(page.locator('[data-chart-type="line"]')).toBeVisible();
    await expect(page.locator('[data-chart-type="pie"]')).toBeVisible();
    const adoptionChart = page.getByRole('img', { name: /Weekly active agents/u });
    await expect(adoptionChart).toBeVisible();
    await expect(adoptionChart).toHaveAccessibleDescription(/Assisted, W1: 42/u);
    await expect(page.getByRole('img', { name: /Successful first builds/u })).toBeVisible();
    await expect(page.getByRole('img', { name: /Generated page mix/u })).toBeVisible();
    const flowDiagram = page.getByRole('img', { name: /Offline compilation flow/u });
    await expect(flowDiagram).toBeVisible();
    await expect(flowDiagram).toHaveAccessibleDescription(
      /source: Declarative source.*source to validate: parse/u,
    );
    await expect(page.locator('[data-node-id="source"]')).toBeAttached();
    await expect(page.locator('[data-from="source"][data-to="validate"]')).toBeAttached();
    await expect(page.locator('.visualization-timeline-event')).toHaveCount(4);
    await expect(page.getByText('Compile offline', { exact: true })).toBeVisible();

    const firstBar = page.locator('.visualization-bar').first();
    const before = await firstBar.evaluate((element) => getComputedStyle(element).fill);
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    const after = await firstBar.evaluate((element) => getComputedStyle(element).fill);
    expect(after).not.toBe(before);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.visualization-frame')
        .first()
        .evaluate((element) => element.scrollWidth >= element.clientWidth),
    ).toBe(true);
  });
}

for (const artifact of incidentReviewArtifacts) {
  test(`${artifact.format} incident review is decision-ready and interactive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'mixed');
    await expect(
      page.getByRole('heading', { name: 'OrbitDesk P1 incident review', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample topology showing traffic entering checkout, billing, and the payment provider',
      }),
    );
    await expect(page.getByRole('img', { name: /Failed checkout attempts/u })).toBeVisible();
    await expect(page.getByRole('img', { name: /Causal chain/u })).toBeVisible();
    await expect(page.locator('.visualization-timeline-event')).toHaveCount(5);

    const filter = page.getByRole('searchbox', { name: 'Filter' });
    await filter.fill('Reliability');
    await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
    await expect(page.getByText('Amplification alert', { exact: true })).toBeVisible();
    await expect(page.getByText('Pool reservation', { exact: false })).toBeHidden();

    const tab = page.getByRole('tab', { name: 'Ruled out' });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Ledger and order-store writes', { exact: false })).toBeVisible();

    await tab.focus();
    await expect(tab).toBeFocused();
    expect(
      await tab.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0);

    const disclosure = page.locator('[data-disclosure]');
    await disclosure.getByText('Open the customer communication draft', { exact: true }).click();
    await expect(disclosure).toHaveAttribute('open', '');

    if (testInfo.project.name.startsWith('mobile')) {
      const navigationToggle = page.getByRole('button', { name: 'Contents' });
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toHaveAttribute('data-open', '');
      await expect(page.locator('[data-navigation]')).toBeVisible();
      await expect(navigationToggle).toBeFocused();
      expect(
        await navigationToggle.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).outlineWidth),
        ),
      ).toBeGreaterThan(0);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const artifact of vendorDecisionArtifacts) {
  test(`${artifact.format} vendor decision keeps hard gates ahead of scoring from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'document');
    await expect(
      page.getByRole('heading', { name: 'AI support vendor decision packet', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample evidence map connecting requirements, vendor evidence, gates, scoring, and a conditional decision',
      }),
    );
    await expect(
      page.getByRole('img', { name: /Weighted score after evidence review/u }),
    ).toBeVisible();
    await expect(page.getByText('Fail · global support telemetry', { exact: true })).toBeVisible();
    await expect(page.getByText('Meridian Reply · 89/100', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Approve Cedar Assist for a reversible pilot', { exact: true }),
    ).toBeVisible();

    const term = page.getByRole('button', { name: /hard gate/iu }).first();
    await term.focus();
    await page.keyboard.press('Enter');
    const glossaryDialog = page.getByRole('dialog', { name: 'Hard gate' });
    await expect(glossaryDialog).toBeVisible();
    await expect(glossaryDialog).toContainText('disqualifies a candidate');
    await page.keyboard.press('Escape');
    await expect(glossaryDialog).toBeHidden();
    await expect(term).toBeFocused();
    expect(
      await term.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0);

    const residualRisk = page.getByRole('tab', { name: 'Residual risks' });
    await residualRisk.click();
    await expect(residualRisk).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tabpanel').filter({ hasText: 'Cedar must prove deletion propagation' }),
    ).toBeVisible();

    const rankingTrigger = page.getByRole('button', { name: 'Why not the top score?' });
    await rankingTrigger.click();
    const rankingDialog = page.getByRole('dialog', { name: 'Ranking exception' });
    await expect(rankingDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rankingDialog).toBeHidden();
    await expect(rankingTrigger).toBeFocused();

    const checklistTrigger = page.getByRole('button', { name: 'Open the evidence checklist' });
    await checklistTrigger.focus();
    await page.keyboard.press('Enter');
    const checklist = page.getByRole('dialog', { name: 'Reviewer evidence checklist' });
    await expect(checklist).toBeVisible();
    await expect(rankingDialog).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(checklist).toBeHidden();
    await expect(checklistTrigger).toBeFocused();

    if (testInfo.project.name.startsWith('mobile')) {
      const comparison = page.getByRole('table').filter({ hasText: 'Weighted criterion' });
      expect(
        await comparison.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
      const navigationToggle = page.getByRole('button', { name: 'Contents' });
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toHaveAttribute('data-open', '');
      await expect(page.locator('[data-navigation]')).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const artifact of launchReadinessArtifacts) {
  test(`${artifact.format} launch readiness keeps evidence and hold conditions actionable from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'landing');
    await expect(
      page.getByRole('heading', { name: 'Regional beta launch readiness', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample beta learning loop connecting a bounded audience, collaborative value, evidence, and a governed rollout',
      }),
    );
    await expect(
      page.getByRole('img', { name: /Activated workspace rate by cohort/u }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /Design-partner funnel/u })).toBeVisible();
    await expect(page.getByText('64% · target ≥ 60%', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Go: bounded European Economic Area beta', { exact: true }),
    ).toBeVisible();

    const residualRisk = page.getByRole('tab', { name: 'Residual risk' });
    await residualRisk.click();
    await expect(residualRisk).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tabpanel').filter({ hasText: 'Single-participant rooms' }),
    ).toBeVisible();

    const regionTrigger = page.getByRole('button', { name: 'Why not launch globally?' });
    await regionTrigger.focus();
    await page.keyboard.press('Enter');
    const regionDialog = page.getByRole('dialog', { name: 'Regional boundary' });
    await expect(regionDialog).toBeVisible();
    await expect(regionDialog).toContainText('invalidate the current capacity');
    await page.keyboard.press('Escape');
    await expect(regionDialog).toBeHidden();
    await expect(regionTrigger).toBeFocused();

    const holdToggle = page.getByRole('switch', { name: 'Show the automatic hold condition' });
    await expect(holdToggle).toHaveAttribute('aria-checked', 'false');
    await holdToggle.focus();
    await page.keyboard.press('Enter');
    await expect(holdToggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Pause new invitations', { exact: false })).toBeVisible();
    expect(
      await holdToggle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const limits = page
      .locator('[data-disclosure]')
      .filter({ hasText: 'Read the experiment limits' });
    await limits.getByText('Read the experiment limits', { exact: true }).click();
    await expect(limits).toHaveAttribute('open', '');

    if (testInfo.project.name.startsWith('mobile')) {
      const register = page.getByRole('table').filter({ hasText: 'Mandatory condition' });
      expect(await register.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      );
      const navigationToggle = page.getByRole('button', { name: 'Contents' });
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toHaveAttribute('data-open', '');
      await expect(page.locator('[data-navigation]')).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const example of [
  {
    name: 'layout-document',
    layout: 'document',
    theme: 'system',
    density: 'comfortable',
    font: 'serif',
    accent: 'indigo',
    width: 'narrow',
    contentWidth: '60rem',
    spaceFactor: '1',
    fontFamily: 'Charter',
    focusColor: 'rgb(56, 86, 216)',
    surfaceRadius: '21.6px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'soft',
    heading: 'Architecture decision record',
    component: '.semantic-decision',
    image: 'A layered page model',
    table: true,
  },
  {
    name: 'layout-dashboard',
    layout: 'dashboard',
    theme: 'dark',
    density: 'compact',
    font: 'sans',
    accent: 'teal',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '.78',
    fontFamily: 'Inter',
    focusColor: 'rgb(117, 234, 219)',
    surfaceRadius: '6.4px',
    backgroundColor: 'rgb(12, 17, 28)',
    radius: 'sharp',
    heading: 'Delivery health dashboard',
    component: '.semantic-card',
    table: true,
  },
  {
    name: 'layout-landing',
    layout: 'landing',
    theme: 'light',
    density: 'spacious',
    font: 'sans',
    accent: 'coral',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '1.28',
    fontFamily: 'Inter',
    focusColor: 'rgb(194, 65, 93)',
    surfaceRadius: '32px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'round',
    heading: 'Pages agents can finish',
    component: '.semantic-card',
  },
  {
    name: 'layout-mixed',
    layout: 'mixed',
    theme: 'system',
    density: 'comfortable',
    font: 'sans',
    accent: 'teal',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '1',
    fontFamily: 'Inter',
    focusColor: 'rgb(8, 127, 117)',
    surfaceRadius: '21.6px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'soft',
    heading: 'Research synthesis',
    component: '.semantic-card',
    image: 'Four page layouts sharing one foundation',
    table: true,
  },
] as const) {
  test(`${example.layout} page applies registry-owned layout and tokens without viewport overflow`, async ({
    page,
  }, testInfo) => {
    await page.goto(layoutArtifactUrl(example.name));
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-layout', example.layout);
    await expect(root).toHaveAttribute('data-theme', example.theme);
    await expect(root).toHaveAttribute('data-density', example.density);
    await expect(root).toHaveAttribute('data-font', example.font);
    await expect(root).toHaveAttribute('data-accent', example.accent);
    await expect(root).toHaveAttribute('data-width', example.width);
    await expect(root).toHaveAttribute('data-radius', example.radius);
    await expect(page.getByRole('heading', { name: example.heading, level: 1 })).toBeVisible();
    await expect(page.locator(example.component).first()).toBeVisible();

    const themeToggle = page.getByRole('button', { name: 'Toggle color theme' });
    await themeToggle.focus();
    const visualState = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const shell = document.querySelector<HTMLElement>('.report-shell');
      const surface = document.querySelector<HTMLElement>('.report-content');
      const focused = document.querySelector<HTMLElement>('[data-theme-toggle]');
      return {
        token: rootStyle.getPropertyValue('--content-width').trim(),
        shell: shell?.getBoundingClientRect().width,
        rootFontSize: Number.parseFloat(rootStyle.fontSize),
        viewport: window.innerWidth,
        spaceFactor: rootStyle.getPropertyValue('--space-factor').trim(),
        fontFamily: getComputedStyle(document.body).fontFamily,
        focusColor: focused === null ? undefined : getComputedStyle(focused).outlineColor,
        surfaceRadius: surface === null ? undefined : getComputedStyle(surface).borderRadius,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(visualState.token).toBe(example.contentWidth);
    expect(visualState.shell).toBeCloseTo(
      Math.min(
        visualState.viewport,
        Number.parseFloat(example.contentWidth) * visualState.rootFontSize,
      ),
      4,
    );
    expect(visualState.spaceFactor).toBe(example.spaceFactor);
    expect(visualState.fontFamily).toContain(example.fontFamily);
    expect(visualState.focusColor).toBe(example.focusColor);
    expect(visualState.surfaceRadius).toBe(example.surfaceRadius);
    expect(visualState.backgroundColor).toBe(example.backgroundColor);

    if ('image' in example) {
      await expectLoadedImage(page.getByRole('img', { name: example.image }));
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await themeToggle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const navigation = page.locator('[data-navigation]');
    await expect(navigation).toBeAttached();
    if (testInfo.project.name.startsWith('mobile')) {
      if ('table' in example) {
        const table = page.locator('table').first();
        expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
          true,
        );
        expect(
          await table
            .locator('th')
            .first()
            .evaluate((element) => getComputedStyle(element).overflowWrap),
        ).toBe('normal');
      }
      const toggle = page.getByRole('button', { name: 'Contents' });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation).toHaveAttribute('data-open', '');
      await expect(navigation).toBeVisible();
    } else {
      await expect(navigation).toBeVisible();
    }
  });
}

test('system theme follows dark preference and becomes an explicit theme after activation', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(layoutArtifactUrl('layout-document'));
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'system');
  const before = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const darkCode = await codeThemeState(page.locator('pre.shiki'));
  expect(darkCode).toEqual({
    background: 'rgb(36, 41, 46)',
    tokens: ['rgb(133, 232, 157)', 'rgb(225, 228, 232)', 'rgb(158, 203, 255)'],
  });
  expect(new Set(darkCode.tokens).size).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  const after = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
  const lightCode = await codeThemeState(page.locator('pre.shiki'));
  expect(lightCode).toEqual({
    background: 'rgb(255, 255, 255)',
    tokens: ['rgb(34, 134, 58)', 'rgb(36, 41, 46)', 'rgb(3, 47, 98)'],
  });
  expect(new Set(lightCode.tokens).size).toBeGreaterThan(1);
  expect(lightCode.tokens).not.toEqual(darkCode.tokens);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  expect(await codeThemeState(page.locator('pre.shiki'))).toEqual(darkCode);
});

async function codeThemeState(
  block: Locator,
): Promise<{ readonly background: string; readonly tokens: readonly string[] }> {
  return block.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    tokens: [...element.querySelectorAll<HTMLElement>('code span[style]')]
      .slice(0, 3)
      .map((token) => getComputedStyle(token).color),
  }));
}

async function expectLoadedImage(image: Locator): Promise<void> {
  await expect
    .poll(async () =>
      image.evaluate((element) => {
        const rendered = element as HTMLImageElement;
        return rendered.complete && rendered.naturalWidth > 0;
      }),
    )
    .toBe(true);
}
