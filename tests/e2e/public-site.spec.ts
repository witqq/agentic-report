import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const siteRoot = path.resolve('test-results/e2e-site');
const generatedRoot = path.resolve('test-results/e2e-generated');
const fileUrl = (file: string): string => pathToFileURL(path.join(siteRoot, file)).href;

const docsArtifacts = [
  { format: 'single-file', url: fileUrl('docs/index.html') },
  {
    format: 'directory',
    url: pathToFileURL(path.join(generatedRoot, 'human-docs-directory/index.html')).href,
  },
] as const;

const agentArtifacts = [
  { format: 'single-file', url: fileUrl('docs/agent/index.html') },
  {
    format: 'directory',
    url: pathToFileURL(path.join(generatedRoot, 'agent-docs-directory/index.html')).href,
  },
] as const;

const expectContained = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overflowingCode = await page
    .locator('pre')
    .evaluateAll((elements) =>
      elements.filter(
        (element) =>
          element.scrollWidth > element.clientWidth &&
          getComputedStyle(element).overflowX !== 'auto',
      ),
    );
  expect(overflowingCode).toEqual([]);
};

const revealAllSections = async (page: Page): Promise<void> => {
  const sections = page.locator('section.semantic-section');
  for (let index = 0; index < (await sections.count()); index += 1) {
    await sections.nth(index).evaluate((element) => {
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
  }
  await expect(page.locator('[data-reveal-pending]')).toHaveCount(0);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
};

test('staged landing reaches live examples, human docs, and direct agent instructions through file URLs', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(fileUrl('index.html'));
  await expect(
    page.getByRole('heading', { name: 'Give your agent a better handoff.' }),
  ).toBeVisible();
  await expect(
    page.getByText('npx skills add witqq/agentic-report --skill agentic-report', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('name: architecture-handoff', { exact: false })).toBeVisible();
  const attribution = page.locator('[data-site-attribution]');
  await expect(attribution.getByRole('link', { name: 'Made with Moira' })).toHaveAttribute(
    'href',
    'https://moira-mcp.com/',
  );
  const attributionLink = attribution.getByRole('link', { name: 'Made with Moira' });
  for (const theme of ['light', 'dark'] as const) {
    await page.locator('html').evaluate((element, value) => {
      element.dataset.theme = value;
    }, theme);
    await page.keyboard.press('Tab');
    await attributionLink.focus();
    await expect(attributionLink).toBeFocused();
    const focusStyle = await attributionLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        color: style.outlineColor,
      };
    });
    expect(focusStyle.style, theme).not.toBe('none');
    expect(focusStyle.width, theme).toBeGreaterThanOrEqual(2);
    expect(focusStyle.color, theme).not.toBe('rgba(0, 0, 0, 0)');
  }
  expect(await attribution.evaluate((element) => element.nextElementSibling === null)).toBe(true);
  await page.locator('a[href="docs/index.html"]').first().click();
  await expect(page).toHaveTitle('agentic-report documentation');
  await expect(
    page.getByRole('heading', { name: 'Build the page, not a frontend project' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Build from source' })).toBeVisible();
  await expect(
    page.getByText('git clone --branch v0.7.0 --depth 1', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the quickstart' })).toHaveAttribute(
    'href',
    'agent/index.html',
  );
  await page.getByRole('link', { name: 'Open the quickstart' }).click();
  await expect(page).toHaveTitle('Agent quickstart');
  await expect(page.getByText('Node.js 24.18.0 or newer', { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText('npx --yes agentic-report@0.7.0 init ./my-page', { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use it inside your own skill' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Use reviewed source instead of the npm package' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'complete agent reference' })).toHaveAttribute(
    'href',
    '../AGENT-REFERENCE.md',
  );
  await page.getByRole('link', { name: 'complete agent reference' }).click();
  await expect(page.locator('body')).toContainText('This is the copyable reference');

  await page.goto(fileUrl('docs/agent/index.html'));
  await expect(page.getByRole('link', { name: 'declarative source contract' })).toHaveAttribute(
    'href',
    '../product/source-contract.md',
  );
  await page.getByRole('link', { name: 'declarative source contract' }).click();
  await expect(page.locator('body')).toContainText(
    'This document defines the current author-facing input',
  );

  await page.goto(fileUrl('docs/agent/index.md'));
  await expect(page.locator('body')).toContainText('npx --yes agentic-report@0.7.0 validate');
  await expect(page.locator('body')).toContainText('Authors do not need React');

  for (const example of ['incident-review', 'vendor-decision', 'launch-readiness']) {
    await page.goto(fileUrl(`examples/${example}/index.html`));
    await expect(page.locator('main')).not.toBeEmpty();
    await expect(page.locator('[data-navigation]')).toBeVisible();
  }
});

test('human and agent documentation preserve content, navigation, and containment in both output formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const artifacts of [docsArtifacts, agentArtifacts]) {
    const content: string[] = [];
    for (const artifact of artifacts) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(artifact.url);
      await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveCount(1);
      await expect(page.locator('main p').filter({ hasText: /^::::$/u })).toHaveCount(0);
      await expectContained(page);
      content.push(await page.locator('main').innerText());
    }
    expect(content[0]).toBe(content[1]);
  }
});

test('captures documentation desktop and mobile states in both output formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-5-captures/docs');
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });

  for (const [pageName, artifacts] of [
    ['human', docsArtifacts],
    ['agent', agentArtifacts],
  ] as const) {
    for (const artifact of artifacts) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.goto(artifact.url);
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = 'dark';
      });
      await revealAllSections(page);
      await expectContained(page);
      await page.screenshot({
        path: path.join(captureRoot, `${pageName}-${artifact.format}-desktop-dark.png`),
        fullPage: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.goto(artifact.url);
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = 'light';
      });
      await expectContained(page);
      await page.screenshot({
        path: path.join(captureRoot, `${pageName}-${artifact.format}-mobile-light.png`),
        fullPage: true,
      });
      if ((await page.getByRole('button', { name: 'Open contents' }).count()) > 0) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.getByRole('button', { name: 'Open contents' }).click();
        await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        await expect(page.locator('[data-nav-dialog]')).toHaveCSS('opacity', '1');
        await expect(page.locator('[data-nav-dialog]')).toHaveCSS(
          'transform',
          /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u,
        );
        await page.screenshot({
          path: path.join(captureRoot, `${pageName}-${artifact.format}-mobile-nav-light.png`),
        });
      }
    }
  }
});
