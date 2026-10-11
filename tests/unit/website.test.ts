import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

interface SiteRoute {
  readonly id: string;
  readonly href: string;
  readonly source: string;
  readonly review?: string;
  readonly kind: 'page' | 'copy' | 'generated';
}

interface RouteManifest {
  readonly contractVersion: 1;
  readonly routes: readonly SiteRoute[];
}

interface ScreenshotProvenance {
  readonly screenshots: readonly {
    readonly id: string;
    readonly source: string;
    readonly liveRoute: string;
    readonly publicSourceRoute: string;
    readonly file: string;
    readonly darkFile: string;
  }[];
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const landingRoot = path.join(repositoryRoot, 'website/landing');
const routeManifestPath = path.join(repositoryRoot, 'website/routes.json');

// The public redesign must keep the old landing's actual destinations, including the repository.
// These are reviewed source destinations, not counts or an inventory derived from the replacement page.
const baselineDestinations = {
  'report.md': [
    'docs/agent/index.md',
    'docs/index.html',
    'docs/product/source-contract.md',
    'examples/answer/index.html',
    'examples/answer/report.md',
    'examples/architecture/index.html',
    'examples/architecture/report.md',
    'examples/capability-tour/index.html',
    'examples/capability-tour/report.md',
    'examples/cinematic-story/index.html',
    'examples/cinematic-story/report.md',
    'examples/code-review/index.html',
    'examples/code-review/report.md',
    'examples/dashboard/index.html',
    'examples/dashboard/report.md',
    'examples/document/index.html',
    'examples/document/report.md',
    'examples/executive-brief/index.html',
    'examples/executive-brief/report.md',
    'examples/incident-review/index.html',
    'examples/incident-review/report.md',
    'examples/interactive-catalog/index.html',
    'examples/interactive-catalog/report.md',
    'examples/landing/index.html',
    'examples/landing/report.md',
    'examples/launch-readiness/index.html',
    'examples/launch-readiness/report.md',
    'examples/manifest.json',
    'examples/motion-showcase/index.html',
    'examples/motion-showcase/report.md',
    'examples/presentation/index.html',
    'examples/presentation/report.md',
    'examples/question-review/index.html',
    'examples/question-review/report.md',
    'examples/research/index.html',
    'examples/research/report.md',
    'examples/response-workspace/index.html',
    'examples/review-workspace/index.html',
    'examples/review-workspace/prior-review.json',
    'examples/review-workspace/report.md',
    'examples/run-report/index.html',
    'examples/run-report/report.md',
    'examples/terminal-portfolio/index.html',
    'examples/terminal-portfolio/report.md',
    'examples/tutorial/index.html',
    'examples/tutorial/report.md',
    'examples/vendor-decision/index.html',
    'examples/vendor-decision/report.md',
    'examples/visual-catalog/index.html',
    'examples/visual-catalog/report.md',
    'examples/visualization-catalog/index.html',
    'examples/visualization-catalog/report.md',
    'https://github.com/witqq/agentic-report',
    'release.json',
    'skills/agentic-report/SKILL.md',
    'source/landing/report.md',
    'source/landing/report.ru.md',
    'source/starter/landing/report.md',
    'website/routes.json',
  ],
  'report.ru.md': [
    'docs/agent/index.md',
    'docs/index.html',
    'docs/product/source-contract.md',
    'examples/answer/index.html',
    'examples/answer/report.ru.md',
    'examples/architecture/index.html',
    'examples/architecture/report.ru.md',
    'examples/capability-tour/index.html',
    'examples/capability-tour/report.ru.md',
    'examples/cinematic-story/index.html',
    'examples/cinematic-story/report.ru.md',
    'examples/code-review/index.html',
    'examples/code-review/report.ru.md',
    'examples/dashboard/index.html',
    'examples/dashboard/report.ru.md',
    'examples/document/index.html',
    'examples/document/report.ru.md',
    'examples/executive-brief/index.html',
    'examples/executive-brief/report.ru.md',
    'examples/incident-review/index.html',
    'examples/incident-review/report.ru.md',
    'examples/interactive-catalog/index.html',
    'examples/interactive-catalog/report.ru.md',
    'examples/landing/index.html',
    'examples/landing/report.ru.md',
    'examples/launch-readiness/index.html',
    'examples/launch-readiness/report.ru.md',
    'examples/manifest.json',
    'examples/motion-showcase/index.html',
    'examples/motion-showcase/report.ru.md',
    'examples/presentation/index.html',
    'examples/presentation/report.ru.md',
    'examples/question-review/index.html',
    'examples/question-review/report.ru.md',
    'examples/research/index.html',
    'examples/research/report.ru.md',
    'examples/response-workspace/index.html',
    'examples/review-workspace/index.html',
    'examples/review-workspace/prior-review.json',
    'examples/review-workspace/report.ru.md',
    'examples/run-report/index.html',
    'examples/run-report/report.ru.md',
    'examples/terminal-portfolio/index.html',
    'examples/terminal-portfolio/report.ru.md',
    'examples/tutorial/index.html',
    'examples/tutorial/report.ru.md',
    'examples/vendor-decision/index.html',
    'examples/vendor-decision/report.ru.md',
    'examples/visual-catalog/index.html',
    'examples/visual-catalog/report.ru.md',
    'examples/visualization-catalog/index.html',
    'examples/visualization-catalog/report.ru.md',
    'https://github.com/witqq/agentic-report',
    'release.json',
    'skills/agentic-report/SKILL.md',
    'source/landing/report.md',
    'source/landing/report.ru.md',
    'source/starter/landing/report.md',
    'website/routes.json',
  ],
} as const;

const rawLandingDependencyFiles = [
  'report.md',
  'report.ru.md',
  'data/incident.json',
  'assets/compile-core.svg',
  'assets/compile-core-dark.svg',
  'assets/social-preview.png',
  'assets/incident-review.png',
  'assets/incident-review-dark.png',
  'assets/vendor-decision.png',
  'assets/vendor-decision-dark.png',
  'assets/launch-readiness.png',
  'assets/launch-readiness-dark.png',
  'assets/screenshots.json',
  'extensions/execution-core/extension.yaml',
  'extensions/execution-core/effect.mjs',
  'extensions/execution-core/README.md',
  'extensions/execution-core/LICENSE',
  'extensions/execution-core/example-report.md',
  'extensions/execution-core/example-decision.md',
  'extensions/execution-core/assets/compile-core.svg',
  'extensions/execution-core/assets/compile-core-dark.svg',
] as const;

const rawLandingPrefixes = ['source/landing', 'website/landing'] as const;
const rawLandingDestinations = rawLandingPrefixes.flatMap((prefix) =>
  rawLandingDependencyFiles.map((file) => `${prefix}/${file}`),
);

const readRoutes = async (): Promise<RouteManifest> =>
  JSON.parse(await readFile(routeManifestPath, 'utf8')) as RouteManifest;

const landingDestinations = (source: string): Set<string> => {
  const prose = source.replace(/```[\s\S]*?```/gu, '');
  return new Set(
    [...prose.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu), ...prose.matchAll(/\bhref="([^"]+)"/gu)]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .filter((href) => !href.startsWith('#')),
  );
};

const authoredLinks = (source: string): Set<string> =>
  new Set([...landingDestinations(source)].filter((href) => !href.startsWith('https://')));

const frontmatter = (markdown: string): unknown => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (match?.[1] === undefined) throw new Error('Landing source is missing its frontmatter');
  return parseYaml(match[1]) as unknown;
};

describe('public landing route and preview contracts', () => {
  it('preserves every existing landing resource destination in both authored languages', async () => {
    for (const locale of ['report.md', 'report.ru.md'] as const) {
      const markdown = await readFile(path.join(landingRoot, locale), 'utf8');
      const actual = landingDestinations(markdown);
      // Catches a dropped old resource or raw dependency link: publishing source text is not crawling it.
      // Additional declared resources are allowed; fragments and fenced examples are not links.
      expect(
        baselineDestinations[locale].filter((href) => !actual.has(href)),
        `${locale}: missing existing destinations`,
      ).toEqual([]);
      expect(
        rawLandingDestinations.filter((href) => !actual.has(href)),
        `${locale}: missing raw dependency destinations`,
      ).toEqual([]);
    }
  });

  it('declares the complete raw landing dependency graph in both public source aliases', async () => {
    const { routes } = await readRoutes();
    for (const prefix of rawLandingPrefixes) {
      const actual = routes
        .filter((route) => route.href.startsWith(`${prefix}/`))
        .map(({ href, source, kind }) => ({ href, source, kind }))
        .sort((left, right) => left.href.localeCompare(right.href));
      const expected = rawLandingDependencyFiles
        .map((file) => ({ href: `${prefix}/${file}`, source: `landing/${file}`, kind: 'copy' }))
        .sort((left, right) => left.href.localeCompare(right.href));
      // Catches a missing locale/data/module/asset and an alias copying a different source tree.
      expect(actual, prefix).toEqual(expected);
    }
    for (const file of rawLandingDependencyFiles)
      expect((await stat(path.join(landingRoot, file))).isFile(), file).toBe(true);

    const english = await readFile(path.join(landingRoot, 'report.md'), 'utf8');
    const russian = await readFile(path.join(landingRoot, 'report.ru.md'), 'utf8');
    // Catches a declared route graph left intact while the actual bilingual page loses its inputs.
    expect(frontmatter(english)).toMatchObject({
      language: 'en',
      localizations: { ru: 'report.ru.md' },
      data: ['data/incident.json'],
      extensions: ['extensions/execution-core/extension.yaml'],
      image: 'assets/social-preview.png',
    });
    expect(frontmatter(russian)).toMatchObject({ language: 'ru' });
    const extension = parseYaml(
      await readFile(path.join(landingRoot, 'extensions/execution-core/extension.yaml'), 'utf8'),
    ) as unknown;
    expect(extension).toMatchObject({
      kind: 'effect',
      name: 'execution-core',
      module: 'effect.mjs',
      examples: ['example-report.md', 'example-decision.md'],
      targets: [
        { directive: 'section', attribute: 'execution-core', values: ['report', 'decision'] },
      ],
      ownsScroll: false,
    });
    const licence = await readFile(
      path.join(landingRoot, 'extensions/execution-core/LICENSE'),
      'utf8',
    );
    expect(licence).toContain('MIT License');
    expect(licence).toContain('Copyright (c) 2026 wit_qq');
    expect(licence).toContain('The above copyright notice and this permission notice');
  });

  it('declares every bilingual public proof page and canonical source exactly once', async () => {
    const manifest = await readRoutes();
    const byId = new Map(manifest.routes.map((route) => [route.id, route]));
    const required = [
      {
        page: ['landing', 'index.html', 'landing/report.md'],
        sources: [
          ['source-landing', 'source/landing/report.md', 'landing/report.md'],
          ['source-landing-ru', 'source/landing/report.ru.md', 'landing/report.ru.md'],
        ],
      },
      {
        page: [
          'example-incident',
          'examples/incident-review/index.html',
          '../examples/incident-review',
        ],
        sources: [
          [
            'source-incident',
            'examples/incident-review/report.md',
            '../examples/incident-review/report.md',
          ],
          [
            'source-incident-ru',
            'examples/incident-review/report.ru.md',
            '../examples/incident-review/report.ru.md',
          ],
        ],
      },
      {
        page: [
          'example-vendor',
          'examples/vendor-decision/index.html',
          '../examples/vendor-decision',
        ],
        sources: [
          [
            'source-vendor',
            'examples/vendor-decision/report.md',
            '../examples/vendor-decision/report.md',
          ],
          [
            'source-vendor-ru',
            'examples/vendor-decision/report.ru.md',
            '../examples/vendor-decision/report.ru.md',
          ],
        ],
      },
      {
        page: [
          'example-launch',
          'examples/launch-readiness/index.html',
          '../examples/launch-readiness',
        ],
        sources: [
          [
            'source-launch',
            'examples/launch-readiness/report.md',
            '../examples/launch-readiness/report.md',
          ],
          [
            'source-launch-ru',
            'examples/launch-readiness/report.ru.md',
            '../examples/launch-readiness/report.ru.md',
          ],
        ],
      },
    ] as const;

    expect(new Set(manifest.routes.map((route) => route.id)).size).toBe(manifest.routes.length);
    expect(new Set(manifest.routes.map((route) => route.href)).size).toBe(manifest.routes.length);
    for (const proof of required) {
      const [pageId, pageHref, pageSource] = proof.page;
      expect(byId.get(pageId)).toMatchObject({
        href: pageHref,
        source: pageSource,
        kind: 'page',
      });
      for (const [sourceId, sourceHref, canonicalSource] of proof.sources) {
        expect(byId.get(sourceId)).toEqual({
          id: sourceId,
          href: sourceHref,
          source: canonicalSource,
          kind: 'copy',
        });
        await expect(
          stat(path.resolve(repositoryRoot, 'website', canonicalSource)),
        ).resolves.toBeTruthy();
      }
    }
  });

  it('keeps every internal landing destination inside the declared public inventory', async () => {
    const manifest = await readRoutes();
    const declared = new Set(manifest.routes.map((route) => route.href));
    for (const locale of ['report.md', 'report.ru.md']) {
      const links = authoredLinks(await readFile(path.join(landingRoot, locale), 'utf8'));
      expect([...links].filter((href) => !declared.has(href))).toEqual([]);
    }
    for (const route of manifest.routes) {
      expect(route.href).not.toMatch(/^(?:\/|[a-z]+:|\.\.?\/)/iu);
      expect(route.source).not.toMatch(/^(?:\/|[a-z][a-z0-9+.-]*:|[a-z]:[\\/])/iu);
      if (route.kind !== 'generated') {
        await expect(
          stat(path.resolve(repositoryRoot, 'website', route.source)),
        ).resolves.toBeTruthy();
      }
    }
  });

  it('maps each preview to a live route, canonical source, and loadable 1280×800 PNG', async () => {
    const manifest = await readRoutes();
    const declared = new Set(manifest.routes.map((route) => route.href));
    const provenance = JSON.parse(
      await readFile(path.join(landingRoot, 'assets/screenshots.json'), 'utf8'),
    ) as ScreenshotProvenance;

    expect(provenance.screenshots.map(({ id }) => id)).toEqual([
      'incident-review',
      'vendor-decision',
      'launch-readiness',
    ]);
    for (const screenshot of provenance.screenshots) {
      expect(declared.has(screenshot.liveRoute)).toBe(true);
      expect(declared.has(screenshot.publicSourceRoute)).toBe(true);
      await expect(
        readFile(path.resolve(landingRoot, 'assets', screenshot.source)),
      ).resolves.toBeInstanceOf(Buffer);
      for (const file of [screenshot.file, screenshot.darkFile]) {
        const image = await readFile(path.resolve(landingRoot, 'assets', file));
        expect(image.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
        expect(image.readUInt32BE(16)).toBe(1280);
        expect(image.readUInt32BE(20)).toBe(800);
      }
    }
  });

  it('shows every page screenshot with its dark capture, so a dark landing shows no light page', async () => {
    const provenance = JSON.parse(
      await readFile(path.join(landingRoot, 'assets/screenshots.json'), 'utf8'),
    ) as ScreenshotProvenance;
    for (const locale of ['report.md', 'report.ru.md']) {
      const markdown = await readFile(path.join(landingRoot, locale), 'utf8');
      for (const { file, darkFile } of provenance.screenshots) {
        const uses = markdown.match(new RegExp(`\\]\\(assets/${file}\\)[^\\n]*`, 'gu')) ?? [];
        // Catches a declared preview removed from one locale, which would otherwise pass vacuously.
        expect(uses.length, `${locale}: ${file}`).toBeGreaterThan(0);
        for (const use of uses)
          expect(use, `${locale}: ${file}`).toContain(`{dark="assets/${darkFile}"}`);
      }
    }
  });
});
