import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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
  }[];
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const landingRoot = path.join(repositoryRoot, 'website/landing');
const routeManifestPath = path.join(repositoryRoot, 'website/routes.json');

const readRoutes = async (): Promise<RouteManifest> =>
  JSON.parse(await readFile(routeManifestPath, 'utf8')) as RouteManifest;

const authoredLinks = (source: string): Set<string> =>
  new Set(
    [
      ...source.replace(/```[\s\S]*?```/gu, '').matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu),
      ...source.matchAll(/\bhref="([^"]+)"/gu),
    ]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .filter((href) => !href.startsWith('#') && !href.startsWith('https://')),
  );

describe('public landing route and preview contracts', () => {
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
      const image = await readFile(path.resolve(landingRoot, 'assets', screenshot.file));
      expect(image.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(image.readUInt32BE(16)).toBe(1280);
      expect(image.readUInt32BE(20)).toBe(800);
    }
  });
});
