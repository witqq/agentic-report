import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Link } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { stageSite } from '../../scripts/build-site.js';
import { buildReport } from '../../src/core/compiler.js';

interface SiteRoute {
  readonly id: string;
  readonly href: string;
  readonly source: string;
  readonly review?: string;
  readonly kind: 'page' | 'copy' | 'generated';
  readonly owner: 'unit-4' | 'unit-5';
  readonly state: 'staged-ready';
}

interface ReleaseFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ReleaseRoute {
  readonly id: string;
  readonly href: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ReleaseMetadata {
  readonly contractVersion: 1;
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly engines: { readonly node: string };
  };
  readonly sourceRevision: string;
  readonly skill: {
    readonly version: string;
    readonly license: string;
    readonly compatibility: string;
    readonly href: string;
    readonly sha256: string;
  };
  readonly routes: readonly ReleaseRoute[];
  readonly files: readonly ReleaseFile[];
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const firstSite = path.join(repositoryRoot, 'test-results/site-unit-first');
const secondSite = path.join(repositoryRoot, 'test-results/site-unit-second');
const failureFixtureRoot = path.join(repositoryRoot, 'test-results/site-failure-fixtures');
const standalonePage = path.join(repositoryRoot, 'test-results/site-unit-standalone.html');
const revision = 'fd9b4b3721c5c33ca94e5df239e3480cf3b39b8e';

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

const listFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return files;
};

const readRoutes = async (): Promise<readonly SiteRoute[]> => {
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, 'website/routes.json'), 'utf8'),
  ) as { readonly routes: readonly SiteRoute[] };
  return manifest.routes;
};

const readRelease = async (root = firstSite): Promise<ReleaseMetadata> =>
  JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8')) as ReleaseMetadata;

const fixtureSkillRoute: SiteRoute = {
  id: 'skill',
  href: 'skills/agentic-report/SKILL.md',
  source: '../skills/agentic-report/SKILL.md',
  kind: 'copy',
  owner: 'unit-5',
  state: 'staged-ready',
};
const fixtureReleaseRoute: SiteRoute = {
  id: 'release',
  href: 'release.json',
  source: 'generated',
  kind: 'generated',
  owner: 'unit-5',
  state: 'staged-ready',
};
const baseFixtureRoutes: readonly SiteRoute[] = [fixtureSkillRoute, fixtureReleaseRoute];

const createSiteFixture = async (
  name: string,
  options: {
    readonly routes?: readonly SiteRoute[];
    readonly packageVersion?: string;
    readonly skillVersion?: string;
  } = {},
): Promise<string> => {
  const root = path.join(failureFixtureRoot, name);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'website'), { recursive: true });
  await mkdir(path.join(root, 'skills/agentic-report'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'agentic-report',
      version: options.packageVersion ?? '0.3.1',
      engines: { node: '>=24.18.0' },
    })}\n`,
  );
  await writeFile(
    path.join(root, 'skills/agentic-report/SKILL.md'),
    `---\nname: agentic-report\nlicense: MIT\nmetadata:\n  version: '${options.skillVersion ?? '0.3.1'}'\n  compatibility: Requires Node.js 24.18.0 or newer.\n---\n\n# Fixture skill\n`,
  );
  await writeFile(
    path.join(root, 'website/routes.json'),
    `${JSON.stringify({ contractVersion: 1, routes: options.routes ?? baseFixtureRoutes })}\n`,
  );
  return root;
};

const extractInternalLinks = (source: string, route: string): string[] => {
  const links: string[] = [];
  if (route.endsWith('.md')) {
    const tree = unified().use(remarkParse).parse(source);
    visit(tree, 'link', (node: Link) => {
      links.push(node.url);
    });
  } else if (route.endsWith('.html')) {
    links.push(
      ...[...source.matchAll(/\bhref="([^"]+)"/gu)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1]],
      ),
    );
  }
  return links
    .filter(
      (href) =>
        !href.startsWith('#') &&
        !href.startsWith('https://') &&
        !href.startsWith('http://') &&
        !href.startsWith('mailto:'),
    )
    .map((href) => {
      const withoutFragment = href.split('#', 1)[0] ?? '';
      return path.posix.normalize(path.posix.join(path.posix.dirname(route), withoutFragment));
    });
};

const crawlRoutes = async (
  root: string,
  declaredRoutes: ReadonlySet<string>,
  navigableRoutes: ReadonlySet<string>,
  initial = 'index.html',
): Promise<Set<string>> => {
  const visited = new Set<string>();
  const queue = [initial];
  while (queue.length > 0) {
    const route = queue.shift();
    if (route === undefined || visited.has(route)) {
      continue;
    }
    if (!declaredRoutes.has(route)) {
      throw new Error(`Undeclared internal route: ${route}`);
    }
    const absolute = path.join(root, ...route.split('/'));
    const fileStat = await lstat(absolute);
    if (!fileStat.isFile()) {
      throw new Error(`Internal route is not a regular file: ${route}`);
    }
    visited.add(route);
    if (navigableRoutes.has(route)) {
      const links = extractInternalLinks(await readFile(absolute, 'utf8'), route);
      queue.push(...links.filter((link) => declaredRoutes.has(link)));
      const undeclaredExistingLinks = links.filter((link) => !declaredRoutes.has(link));
      if (undeclaredExistingLinks.length > 0) {
        throw new Error(`Undeclared internal route: ${undeclaredExistingLinks[0] ?? ''}`);
      }
    }
  }
  return visited;
};

beforeAll(async () => {
  await rm(firstSite, { recursive: true, force: true });
  await rm(secondSite, { recursive: true, force: true });
  await rm(failureFixtureRoot, { recursive: true, force: true });
  await rm(standalonePage, { force: true });
  await stageSite({ output: firstSite, revision, repositoryRoot });
  await stageSite({ output: secondSite, revision, repositoryRoot });
  await buildReport({
    input: path.join(repositoryRoot, 'website/docs/agent/index.md'),
    output: standalonePage,
  });
});

describe('deterministic public site staging', () => {
  it('produces identical complete bytes for identical source, package, and revision inputs', async () => {
    const firstFiles = await listFiles(firstSite);
    const secondFiles = await listFiles(secondSite);
    expect(firstFiles).toEqual(secondFiles);
    for (const file of firstFiles) {
      expect(await readFile(path.join(firstSite, file))).toEqual(
        await readFile(path.join(secondSite, file)),
      );
    }
  });

  it('crawls every declared route from the landing through exact case-sensitive file targets', async () => {
    const routes = await readRoutes();
    const declared = new Set(routes.map((route) => route.href));
    const navigable = new Set(
      routes
        .filter(
          (route) =>
            route.kind === 'page' ||
            route.href.startsWith('docs/') ||
            ['PRODUCT-REQUIREMENTS.md', 'llms.txt'].includes(route.href),
        )
        .map((route) => route.href),
    );
    expect(await crawlRoutes(firstSite, declared, navigable)).toEqual(declared);
    const declaredWithMissing = new Set([...declared, 'docs/deliberately-missing.md']);
    await expect(
      crawlRoutes(
        firstSite,
        declaredWithMissing,
        new Set([...navigable, 'docs/deliberately-missing.md']),
        'docs/deliberately-missing.md',
      ),
    ).rejects.toThrow(/ENOENT/u);
  });

  it('follows real Markdown links while ignoring illustrative links in fenced code', () => {
    expect(
      extractInternalLinks(
        '```md\n[Illustrative only](missing.md)\n```\n\n[Follow this](present.md)\n',
        'docs/reference.md',
      ),
    ).toEqual(['docs/present.md']);
  });

  it('adds one linked Moira attribution footer to every public HTML page only', async () => {
    const routes = await readRoutes();
    for (const route of routes.filter((candidate) => candidate.kind === 'page')) {
      const source = await readFile(path.join(firstSite, route.href), 'utf8');
      expect(source.match(/data-site-attribution(?:[ >])/gu), route.href).toHaveLength(1);
      expect(source, route.href).toContain(
        '<a href="https://moira-mcp.com/" aria-label="Made with Moira">Made with Moira</a>',
      );
      expect(source.indexOf('<footer class="site-attribution"'), route.href).toBeGreaterThan(
        source.lastIndexOf('</main>'),
      );
    }
    for (const route of routes.filter((candidate) => candidate.kind === 'copy')) {
      const source = await readFile(path.join(firstSite, route.href), 'utf8');
      expect(source, route.href).not.toContain('data-site-attribution');
    }
    expect(await readFile(standalonePage, 'utf8')).not.toContain('data-site-attribution');
  });

  it('stages the public repeat-review route with its declared prior handoff', async () => {
    const html = await readFile(
      path.join(firstSite, 'examples/review-workspace/index.html'),
      'utf8',
    );
    expect(html).toContain('data-prior-review="true"');
    expect(html).toContain('&quot;reportStatus&quot;:&quot;stale&quot;');
    expect(html).toContain('Recheck activation after the cohort revision.');
    expect(
      await readFile(path.join(firstSite, 'examples/review-workspace/prior-review.json')),
    ).toEqual(
      await readFile(path.join(repositoryRoot, 'examples/review-workspace/prior-review.json')),
    );
  });

  it('copies direct documentation and skill bytes and records every staged hash', async () => {
    const routes = await readRoutes();
    const release = await readRelease();
    expect(release).toMatchObject({
      contractVersion: 1,
      package: {
        name: 'agentic-report',
        version: '0.3.1',
        engines: { node: '>=24.18.0' },
      },
      sourceRevision: revision,
      skill: { version: '0.3.1', license: 'MIT' },
    });
    expect(release.routes).toHaveLength(routes.length - 1);
    const actualFiles = (await listFiles(firstSite)).filter((file) => file !== 'release.json');
    expect(release.files.map((file) => file.path)).toEqual(actualFiles);

    for (const file of release.files) {
      const bytes = await readFile(path.join(firstSite, ...file.path.split('/')));
      expect(file.bytes).toBe(bytes.byteLength);
      expect(file.sha256).toBe(sha256(bytes));
    }
    for (const route of routes.filter((candidate) => candidate.kind === 'copy')) {
      const canonical = path.resolve(repositoryRoot, 'website', route.source);
      expect(await readFile(path.join(firstSite, route.href))).toEqual(await readFile(canonical));
    }
    expect(release.skill.sha256).toBe(
      sha256(await readFile(path.join(repositoryRoot, 'skills/agentic-report/SKILL.md'))),
    );
  });

  it('keeps package, skill, OpenAI, Claude, and community distribution identity synchronized', async () => {
    const packageMetadata = JSON.parse(
      await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
    ) as {
      readonly version: string;
      readonly homepage: string;
      readonly engines: { node: string };
    };
    const skillSource = await readFile(
      path.join(repositoryRoot, 'skills/agentic-report/SKILL.md'),
      'utf8',
    );
    const skillFrontmatter = parseYaml(
      skillSource.match(/^---\n([\s\S]*?)\n---\n/u)?.[1] ?? '',
    ) as {
      readonly name: string;
      readonly license: string;
      readonly metadata: {
        readonly version: string;
        readonly homepage: string;
        readonly compatibility: string;
      };
    };
    const openAiPlugin = JSON.parse(
      await readFile(path.join(repositoryRoot, '.codex-plugin/plugin.json'), 'utf8'),
    ) as {
      readonly name: string;
      readonly version: string;
      readonly license: string;
      readonly skills: string;
    };
    const claudePlugin = JSON.parse(
      await readFile(path.join(repositoryRoot, '.claude-plugin/plugin.json'), 'utf8'),
    ) as {
      readonly name: string;
      readonly version: string;
      readonly license: string;
      readonly skills: string;
    };
    const marketplace = JSON.parse(
      await readFile(path.join(repositoryRoot, '.claude-plugin/marketplace.json'), 'utf8'),
    ) as {
      readonly version: string;
      readonly plugins: readonly {
        readonly name: string;
        readonly version: string;
        readonly source: string;
      }[];
    };

    expect(skillFrontmatter).toMatchObject({
      name: 'agentic-report',
      license: 'MIT',
      metadata: { version: packageMetadata.version, homepage: packageMetadata.homepage },
    });
    expect(packageMetadata.version).toBe('0.3.1');
    expect(skillFrontmatter.metadata.compatibility).toContain('Node.js 24.18.0 or newer');
    expect(packageMetadata.engines.node).toBe('>=24.18.0');
    for (const plugin of [openAiPlugin, claudePlugin]) {
      expect(plugin).toMatchObject({
        name: 'agentic-report',
        version: packageMetadata.version,
        license: 'MIT',
        skills: './skills/',
      });
    }
    expect(marketplace.version).toBe(packageMetadata.version);
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: 'agentic-report',
        version: packageMetadata.version,
        source: './',
      }),
    ]);
    expect(skillSource).toContain(
      'npx --yes agentic-report@0.3.1 build ./my-page --output ./my-page.html --json',
    );
    expect(skillSource).toContain('Do not deploy, publish, use credentials');
    for (const [publicSource, source] of [
      ['skills/agentic-report/SKILL.md', skillSource],
      [
        'website/docs/agent/index.md',
        await readFile(path.join(repositoryRoot, 'website/docs/agent/index.md'), 'utf8'),
      ],
      ['website/llms.txt', await readFile(path.join(repositoryRoot, 'website/llms.txt'), 'utf8')],
    ] as const) {
      const pinnedVersions = [...source.matchAll(/\bagentic-report@(\d+\.\d+\.\d+)/gu)].map(
        (match) => match[1],
      );
      expect(pinnedVersions.length, publicSource).toBeGreaterThan(0);
      expect(new Set(pinnedVersions), publicSource).toEqual(new Set([packageMetadata.version]));
    }
    const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
    expect(readme.trimEnd()).toMatch(
      /<a href="https:\/\/moira-mcp\.com\/"><img alt="Made with Moira"[^>]*><\/a>\n<\/p>$/u,
    );
  });

  it('contains no internal workflow paths, workstation paths, credential assignments, or authority claims', async () => {
    const publicFiles = await listFiles(firstSite);
    for (const file of publicFiles) {
      const source = await readFile(path.join(firstSite, ...file.split('/')), 'utf8');
      expect(source).not.toMatch(/(?:\/Users\/|moira-ws|agent_temp_files_local|CODEX_THREAD_ID)/u);
      expect(source).not.toMatch(/(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s"']+/iu);
      expect(source).not.toMatch(
        /(?:official|curated|verified)\s+(?:OpenAI|Anthropic|skills\.sh)/iu,
      );
    }
  });

  it('rejects route and source escapes and direct-file symlinks at the production staging boundary', async () => {
    const hostileCases: readonly {
      readonly name: string;
      readonly route: SiteRoute;
      readonly expected: RegExp;
      readonly prepare?: (root: string) => Promise<void>;
    }[] = [
      {
        name: 'route-escape',
        route: { ...fixtureSkillRoute, href: '../escaped.md' },
        expected: /href escapes its root/u,
      },
      {
        name: 'source-escape',
        route: { ...fixtureSkillRoute, source: '../../outside.md' },
        expected: /source escapes the repository root/u,
      },
      {
        name: 'direct-symlink',
        route: { ...fixtureSkillRoute, source: 'direct-skill.md' },
        expected: /Direct source is not a regular file/u,
        prepare: async (root) =>
          symlink(
            '../skills/agentic-report/SKILL.md',
            path.join(root, 'website/direct-skill.md'),
            'file',
          ),
      },
      {
        name: 'page-source-symlink-escape',
        route: {
          id: 'external-page',
          href: 'external/index.html',
          source: 'external-page',
          kind: 'page',
          owner: 'unit-5',
          state: 'staged-ready',
        },
        expected: /source resolves outside the repository root/u,
        prepare: async (root) => {
          const external = `${root}-outside`;
          await rm(external, { recursive: true, force: true });
          await mkdir(external, { recursive: true });
          await writeFile(
            path.join(external, 'report.md'),
            '---\ncontractVersion: 1\ntitle: External page\n---\n\n# External page\n',
          );
          await symlink(external, path.join(root, 'website/external-page'), 'dir');
        },
      },
    ];

    for (const hostileCase of hostileCases) {
      const routes =
        hostileCase.route.kind === 'page'
          ? [fixtureSkillRoute, hostileCase.route, fixtureReleaseRoute]
          : [hostileCase.route, fixtureReleaseRoute];
      const root = await createSiteFixture(hostileCase.name, {
        routes,
      });
      await hostileCase.prepare?.(root);
      const output = path.join(root, 'public-site');
      await expect(stageSite({ output, revision, repositoryRoot: root })).rejects.toThrow(
        hostileCase.expected,
      );
      await expect(lstat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('preserves an existing destination instead of merging or replacing it', async () => {
    const root = await createSiteFixture('existing-destination');
    const output = path.join(root, 'public-site');
    const marker = path.join(output, 'owner.txt');
    await mkdir(output);
    await writeFile(marker, 'preserve me\n');

    await expect(stageSite({ output, revision, repositoryRoot: root })).rejects.toThrow(
      /must not already exist/u,
    );
    expect(await readFile(marker, 'utf8')).toBe('preserve me\n');
    expect(await readdir(output)).toEqual(['owner.txt']);
  });

  it('rejects divergent package and skill versions before creating a staging candidate', async () => {
    const root = await createSiteFixture('version-mismatch', { skillVersion: '9.9.9' });
    const output = path.join(root, 'public-site');

    await expect(stageSite({ output, revision, repositoryRoot: root })).rejects.toThrow(
      /Skill and package versions differ/u,
    );
    expect((await readdir(root)).filter((entry) => entry.includes('agentic-report-site'))).toEqual(
      [],
    );
  });

  it('removes its private candidate when a generated-route contract fails after staging begins', async () => {
    const invalidGenerated = {
      ...fixtureReleaseRoute,
      id: 'not-release',
      href: 'other.json',
    } as SiteRoute;
    const root = await createSiteFixture('generated-route-failure', {
      routes: [fixtureSkillRoute, invalidGenerated],
    });
    const output = path.join(root, 'public-site');

    await expect(stageSite({ output, revision, repositoryRoot: root })).rejects.toThrow(
      /Unknown generated route/u,
    );
    await expect(lstat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(root)).filter((entry) => entry.includes('agentic-report-site'))).toEqual(
      [],
    );
  });
});
