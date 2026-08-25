import { createHash } from 'node:crypto';
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

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const landingPath = path.join(repositoryRoot, 'website/landing/report.md');
const routeManifestPath = path.join(repositoryRoot, 'website/routes.json');

const readLanding = (): Promise<string> => readFile(landingPath, 'utf8');

const readRoutes = async (): Promise<RouteManifest> =>
  JSON.parse(await readFile(routeManifestPath, 'utf8')) as RouteManifest;

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

describe('public landing product proof', () => {
  it('documents only durable public route fields', async () => {
    const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
    expect(readme).toContain(
      'one relative URL, canonical repository source, route kind, and an optional confined',
    );
    expect(readme).not.toMatch(/routes\.json[^\n]*owner|owner, and readiness state/u);
  });

  it('keeps the accepted promise, section order, page types, and qualified boundaries explicit', async () => {
    const source = await readLanding();
    const normalizedSource = source.replace(/\s+/gu, ' ');
    const proseSource = source.replace(/```[\s\S]*?```/gu, '');
    const sections = [...proseSource.matchAll(/^:{4,}section\{[^\n]*nav="([^"]+)"/gmu)].map(
      (match) => match[1],
    );
    expect(sections).toEqual([
      'Proof',
      'Workflow',
      'Examples',
      'Page types',
      'Landing pages',
      'Boundaries',
      'Docs',
      'Start',
    ]);
    expect(source).toContain(
      'Turn declarative Markdown into a finished interactive page an agent can hand to a human—locally, with one\nbuild command and no frontend project.',
    );
    expect(source).toContain('preset: editorial');
    expect(source).toContain('No author JSX, JS, or CSS');
    expect(source).toContain('Use Node.js 24.18.0 or newer.');
    expect(source).toContain('first `npx` run needs registry and network access');
    expect(source).toContain('package-owned browser runtime is included and required');
    expect(source).toContain('one self-contained HTML file by default');
    expect(normalizedSource).toContain('Directory output keeps the same page and runtime behavior');
    expect(source).toContain('print or disabled-JavaScript parity');
    expect(source).toContain('title="This landing has its own public build path"');
    expect(source).toContain('[complete canonical landing source](source/landing/report.md)');
    expect(source).toContain(
      'npx --yes agentic-report build ./website/landing --output ./site/index.html --json',
    );
    expect(source).toContain('[`release.json`](release.json)');

    const pageTypes = [
      'Report',
      'Research',
      'Architecture',
      'Tutorial',
      'Dashboard',
      'Decision',
      'Landing',
    ];
    for (const pageType of pageTypes) {
      expect(source).toContain(`:::card{title="${pageType}"}`);
    }
    expect(source).toContain('Use the existing `report` or\n`architecture` starter');
    expect(source).not.toMatch(/customer logo|testimonial|adoption number|pages? in seconds/iu);
    expect(source).not.toMatch(/<(?:script|style|link)\b/iu);
  });

  it('links every fictional proof card to a separately published page and its public source route', async () => {
    const source = await readLanding();
    const expected = [
      {
        id: 'incident-review',
        live: 'examples/incident-review/index.html',
        source: 'examples/incident-review/report.md',
      },
      {
        id: 'vendor-decision',
        live: 'examples/vendor-decision/index.html',
        source: 'examples/vendor-decision/report.md',
      },
      {
        id: 'launch-readiness',
        live: 'examples/launch-readiness/index.html',
        source: 'examples/launch-readiness/report.md',
      },
    ] as const;

    for (const example of expected) {
      expect(source).toContain(`[Open live example](${example.live})`);
      expect(source).toContain(`[View declarative source](${example.source})`);
      expect(source).toContain(`assets/${example.id}.png`);
      expect(
        await stat(path.join(repositoryRoot, 'examples', example.id, 'report.md')),
      ).toBeTruthy();
      expect(
        await readFile(path.join(repositoryRoot, 'examples', example.id, 'report.md'), 'utf8'),
      ).toMatch(/Fictional showcase/iu);
      const image = await readFile(
        path.join(repositoryRoot, 'website/landing/assets', `${example.id}.png`),
      );
      expect(image.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(image.readUInt32BE(16)).toBe(1280);
      expect(image.readUInt32BE(20)).toBe(800);
    }
    expect(source.match(/\*\*Fictional sample\.\*\*/gu)).toHaveLength(3);
  });

  it('binds every local screenshot to the real declarative source and captured artifact', async () => {
    const provenance = JSON.parse(
      await readFile(path.join(repositoryRoot, 'website/landing/assets/screenshots.json'), 'utf8'),
    ) as {
      readonly capture: {
        readonly viewport: { readonly width: number; readonly height: number };
        readonly source: string;
      };
      readonly screenshots: readonly {
        readonly id: string;
        readonly source: string;
        readonly liveRoute: string;
        readonly publicSourceRoute: string;
        readonly sourceSha256: string;
        readonly file: string;
        readonly sha256: string;
        readonly proofExcerpt?: {
          readonly startLine: number;
          readonly endLine: number;
          readonly sha256: string;
        };
      }[];
    };
    expect(provenance.capture).toMatchObject({
      viewport: { width: 1280, height: 800 },
      source: 'ordinary single-file build opened through file://',
    });
    expect(provenance.screenshots.map((screenshot) => screenshot.id)).toEqual([
      'incident-review',
      'vendor-decision',
      'launch-readiness',
    ]);
    const landing = await readLanding();
    for (const screenshot of provenance.screenshots) {
      const sourcePath = path.resolve(repositoryRoot, 'website/landing/assets', screenshot.source);
      const imagePath = path.resolve(repositoryRoot, 'website/landing/assets', screenshot.file);
      expect(sha256(await readFile(sourcePath))).toBe(screenshot.sourceSha256);
      expect(sha256(await readFile(imagePath))).toBe(screenshot.sha256);
      expect(landing).toContain(`(${screenshot.liveRoute})`);
      expect(landing).toContain(`(${screenshot.publicSourceRoute})`);
    }

    const proof = provenance.screenshots.find((screenshot) => screenshot.id === 'launch-readiness');
    if (proof?.proofExcerpt === undefined) {
      throw new Error('Launch proof excerpt provenance is required.');
    }
    const proofSource = await readFile(
      path.resolve(repositoryRoot, 'website/landing/assets', proof.source),
      'utf8',
    );
    const excerpt = proofSource
      .split('\n')
      .slice(proof.proofExcerpt.startLine - 1, proof.proofExcerpt.endLine)
      .join('\n');
    expect(sha256(excerpt)).toBe(proof.proofExcerpt.sha256);
    expect(landing).toContain(`\`\`\`markdown\n${excerpt}\n\`\`\``);
    expect(landing).toContain(`[Read the complete launch source](${proof.publicSourceRoute})`);
    expect(landing).toContain(`[Open this fictional launch page](${proof.liveRoute})`);
  });

  it('declares one canonical relative route and owner for every internal landing destination', async () => {
    const source = await readLanding();
    const manifest = await readRoutes();
    expect(manifest.contractVersion).toBe(1);
    expect(new Set(manifest.routes.map((route) => route.id)).size).toBe(manifest.routes.length);
    expect(new Set(manifest.routes.map((route) => route.href)).size).toBe(manifest.routes.length);

    const routeHrefs = new Set(manifest.routes.map((route) => route.href));
    const internalLinks = [...source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu)]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .filter((href) => !href.startsWith('#') && !href.startsWith('https://'));
    expect(new Set(internalLinks)).toEqual(
      new Set([...internalLinks].filter((href) => routeHrefs.has(href))),
    );

    for (const route of manifest.routes) {
      expect(Object.keys(route).sort()).toEqual(
        [
          ...(route.review === undefined
            ? ['id', 'href', 'kind', 'source']
            : ['id', 'href', 'kind', 'review', 'source']),
        ].sort(),
      );
      expect(route.href).not.toMatch(/^(?:\/|[a-z]+:|\.\.?\/)/iu);
      expect(route.href).not.toMatch(/placeholder|todo|example\.com|\/Users\//iu);
      expect(['page', 'copy', 'generated']).toContain(route.kind);
      expect(route.source.trim()).not.toBe('');
      expect(route.source).not.toMatch(/^(?:\/|[a-z][a-z0-9+.-]*:|[a-z]:[\\/])/iu);
      expect(route.source).not.toMatch(/placeholder|todo|example\.com|\/Users\//iu);
      if (route.kind !== 'generated') {
        expect(await stat(path.resolve(repositoryRoot, 'website', route.source))).toBeTruthy();
      }
    }
  });
});
