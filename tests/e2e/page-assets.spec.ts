import { readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUILT_IN_BLOCKS } from '../../dist/node/blocks/index.js';
import { buildReport } from '../../dist/node/index.js';
import {
  featureHostSelector,
  PAGE_FEATURES,
  type PageFeatureDefinition,
} from '../../dist/node/page-features.js';
import { expect, test } from './fixtures.js';

/**
 * A page receives only the features its compiler selected. This check looks from the other side, at the
 * built page in the browser: every element that a feature exists for — a block's element, a code block, a
 * table, a video, a scene, the review entry, the slide deck — must come with that feature's script and
 * stylesheet. It catches a selection that misses a host the finished page holds, which the per-block
 * unit test cannot see: a host created by another block's enhancement, a page setting, or a localized
 * variant.
 */
const root = path.resolve('test-results/e2e-page-assets');
const FEATURES: readonly PageFeatureDefinition[] = PAGE_FEATURES;

/** Selectors of the elements a feature is needed for, in the built page. */
function hostSelectors(feature: PageFeatureDefinition): string[] {
  const selectors = (feature.hosts ?? []).map(featureHostSelector);
  for (const block of BUILT_IN_BLOCKS) {
    if (block.feature !== feature.id) continue;
    selectors.push(
      block.definition.behavior.renderer === 'semantic-container'
        ? `[data-semantic="${block.name}"]`
        : `.${block.definition.sanitizer.className}`,
    );
  }
  const pageHosts: Readonly<Record<string, string>> = {
    slides: ':root[data-layout="slides"]',
    screens: ':root[data-layout="screens"]',
    review: '[data-review-toggle]',
    edition: '[data-edition-list-toggle]',
    islands: '[data-island-document]',
  };
  if (pageHosts[feature.id] !== undefined) selectors.push(pageHosts[feature.id] ?? '');
  return selectors;
}

const pages: {
  readonly name: string;
  readonly input: string;
  readonly since?: string;
  readonly review?: string;
}[] = [];

test.beforeAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const name of (await readdir(path.resolve('examples'))).sort()) {
    const input = path.resolve('examples', name);
    if (!existsSync(path.join(input, 'report.md'))) continue;
    pages.push({
      name,
      input,
      ...(name === 'review-workspace' ? { review: 'prior-review.json' } : {}),
    });
  }
  pages.push(
    { name: 'landing-site', input: path.resolve('website/landing/report.md') },
    { name: 'docs', input: path.resolve('website/docs/report.md') },
    { name: 'screens', input: path.resolve('examples/capability-tour/screens.md') },
    {
      name: 'edition',
      input: path.resolve('examples/capability-tour/edition-2.md'),
      since: path.resolve('examples/capability-tour/edition-1.md'),
    },
  );
  for (const page of pages)
    await buildReport({
      input: page.input,
      output: path.join(root, `${page.name}.html`),
      ...(page.since === undefined ? {} : { since: page.since }),
      ...(page.review === undefined ? {} : { review: page.review }),
    });
});

test('every feature host on a built page comes with its feature', async ({ page }) => {
  test.setTimeout(240_000);
  const hosts = FEATURES.map((feature) => ({
    id: feature.id,
    script: feature.script !== undefined,
    styles: (feature.styles?.length ?? 0) > 0,
    selectors: hostSelectors(feature),
  }));
  for (const built of pages) {
    await page.goto(pathToFileURL(path.join(root, `${built.name}.html`)).href);
    const missing = await page.evaluate((features) => {
      const script = [...document.querySelectorAll('script:not([src])')]
        .map((element) => element.textContent)
        .join('');
      const styles = [...document.querySelectorAll('style')]
        .map((element) => element.textContent)
        .join('');
      const problems: string[] = [];
      for (const feature of features) {
        // Language variants other than the shown one wait in templates; their hosts count too.
        const scopes: ParentNode[] = [
          document,
          ...[...document.querySelectorAll('template')].map((template) => template.content),
        ];
        const host = feature.selectors.find((selector) =>
          scopes.some((scope) => scope.querySelector(selector) !== null),
        );
        if (host === undefined) continue;
        if (feature.script && !script.includes(`agentic-report script: ${feature.id} */`))
          problems.push(`${feature.id} script missing for ${host}`);
        if (feature.styles && !styles.includes(`agentic-report style: ${feature.id} */`))
          problems.push(`${feature.id} styles missing for ${host}`);
      }
      return problems;
    }, hosts);
    expect(missing, built.name).toEqual([]);
  }
});
