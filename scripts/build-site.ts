import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse as parseYaml } from 'yaml';

import { buildReport } from '../dist/node/index.js';

const execFileAsync = promisify(execFile);

type RouteKind = 'page' | 'copy' | 'generated';

interface SiteRoute {
  readonly id: string;
  readonly href: string;
  readonly source: string;
  readonly review?: string;
  readonly kind: RouteKind;
  readonly owner: 'unit-4' | 'unit-5';
  readonly state: 'staged-ready';
}

interface RouteManifest {
  readonly contractVersion: 1;
  readonly routes: readonly SiteRoute[];
}

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly engines: { readonly node: string };
}

export interface StageSiteOptions {
  readonly output: string;
  readonly revision: string;
  readonly repositoryRoot?: string;
}

export interface StagedSiteResult {
  readonly output: string;
  readonly releaseSha256: string;
  readonly fileCount: number;
  readonly routeCount: number;
}

interface FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

const moiraAttribution = `<style data-site-attribution-style>
.site-attribution{display:flex;justify-content:center;padding:1.5rem 1rem 2rem}.site-attribution a{display:inline-flex;align-items:center;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:999px;padding:.42rem .78rem;color:inherit;font:600 .78rem/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;text-decoration:none;opacity:.78}.site-attribution a:hover,.site-attribution a:focus-visible{opacity:1}.site-attribution a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
</style>`;
const moiraAttributionFooter = `<footer class="site-attribution" data-site-attribution><a href="https://moira-mcp.com/" aria-label="Made with Moira">Made with Moira</a></footer>`;

const addMoiraAttribution = (source: string): string => {
  if (!source.includes('</head>') || !source.includes('</body>')) {
    throw new Error('Compiled site page is missing the expected HTML document boundaries.');
  }
  if (source.includes('data-site-attribution')) {
    throw new Error('Compiled site page already contains a site attribution marker.');
  }
  return source
    .replace('</head>', `${moiraAttribution}</head>`)
    .replace('</body>', `${moiraAttributionFooter}</body>`);
};

const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
};

const resolveConfined = (root: string, relativePath: string, label: string): string => {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be relative.`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!isWithin(root, resolved)) {
    throw new Error(`${label} escapes its root.`);
  }
  return resolved;
};

const resolveRepositorySource = (
  repositoryRoot: string,
  websiteRoot: string,
  relativePath: string,
  label: string,
): string => {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be relative.`);
  }
  const resolved = path.resolve(websiteRoot, relativePath);
  if (!isWithin(repositoryRoot, resolved)) {
    throw new Error(`${label} escapes the repository root.`);
  }
  return resolved;
};

const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const readPackageMetadata = async (repositoryRoot: string): Promise<PackageMetadata> => {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const record = requireObject(parsed, 'package.json');
  const engines = requireObject(record.engines, 'package.json engines');
  if (
    record.name !== 'agentic-report' ||
    typeof record.version !== 'string' ||
    typeof engines.node !== 'string'
  ) {
    throw new Error('package.json does not expose the required release identity.');
  }
  return {
    name: record.name,
    version: record.version,
    engines: { node: engines.node },
  };
};

const readRouteManifest = async (repositoryRoot: string): Promise<RouteManifest> => {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(repositoryRoot, 'website/routes.json'), 'utf8'),
  );
  const record = requireObject(parsed, 'website/routes.json');
  if (record.contractVersion !== 1 || !Array.isArray(record.routes)) {
    throw new Error('website/routes.json has an unsupported contract.');
  }
  const routes = record.routes.map((value, index): SiteRoute => {
    const route = requireObject(value, `route ${index}`);
    if (
      typeof route.id !== 'string' ||
      typeof route.href !== 'string' ||
      typeof route.source !== 'string' ||
      (route.review !== undefined && typeof route.review !== 'string') ||
      !['page', 'copy', 'generated'].includes(String(route.kind)) ||
      !['unit-4', 'unit-5'].includes(String(route.owner)) ||
      route.state !== 'staged-ready'
    ) {
      throw new Error(`Route ${index} is not a complete staged route declaration.`);
    }
    if (route.review !== undefined && route.kind !== 'page') {
      throw new Error(`Route ${index} may use review only for a page build.`);
    }
    return route as unknown as SiteRoute;
  });
  if (new Set(routes.map((route) => route.id)).size !== routes.length) {
    throw new Error('Route IDs must be unique.');
  }
  if (new Set(routes.map((route) => route.href)).size !== routes.length) {
    throw new Error('Route href values must be unique.');
  }
  return { contractVersion: 1, routes };
};

const resolveCanonicalRepositorySource = async (
  canonicalRepositoryRoot: string,
  source: string,
): Promise<string> => {
  const canonical = await realpath(source);
  if (!isWithin(canonicalRepositoryRoot, canonical)) {
    throw new Error('Route source resolves outside the repository root.');
  }
  return canonical;
};

const assertRegularDirectFile = async (repositoryRoot: string, source: string): Promise<void> => {
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(
      `Direct source is not a regular file: ${path.relative(repositoryRoot, source)}`,
    );
  }
};

const listFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Staged output contains a symbolic link: ${path.relative(root, absolute)}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    } else {
      throw new Error(`Staged output contains a special file: ${path.relative(root, absolute)}`);
    }
  }
  return files;
};

const identifyFile = async (root: string, relativePath: string): Promise<FileIdentity> => {
  const bytes = await readFile(path.join(root, ...relativePath.split('/')));
  return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
};

const parseSkillMetadata = async (
  repositoryRoot: string,
): Promise<{
  readonly version: string;
  readonly license: string;
  readonly compatibility: string;
}> => {
  const skill = await readFile(path.join(repositoryRoot, 'skills/agentic-report/SKILL.md'), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/u)?.[1];
  if (frontmatter === undefined) {
    throw new Error('Canonical skill is missing YAML frontmatter.');
  }
  const metadata = requireObject(parseYaml(frontmatter), 'skill frontmatter');
  const nested = requireObject(metadata.metadata, 'skill metadata');
  if (
    typeof nested.version !== 'string' ||
    typeof metadata.license !== 'string' ||
    typeof nested.compatibility !== 'string'
  ) {
    throw new Error('Canonical skill is missing version, license, or compatibility metadata.');
  }
  return {
    version: nested.version,
    license: metadata.license,
    compatibility: nested.compatibility,
  };
};

export const stageSite = async (options: StageSiteOptions): Promise<StagedSiteResult> => {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? '.');
  const canonicalRepositoryRoot = await realpath(repositoryRoot);
  const output = path.resolve(repositoryRoot, options.output);
  if (!/^[0-9a-f]{40}$/u.test(options.revision)) {
    throw new Error('Site revision must be a complete 40-character lowercase Git commit ID.');
  }
  if (isWithin(output, repositoryRoot) && output === repositoryRoot) {
    throw new Error('Site output cannot replace the repository root.');
  }
  try {
    await lstat(output);
    throw new Error('Site output must not already exist.');
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const packageMetadata = await readPackageMetadata(repositoryRoot);
  const skillMetadata = await parseSkillMetadata(repositoryRoot);
  if (skillMetadata.version !== packageMetadata.version) {
    throw new Error('Skill and package versions differ.');
  }

  const manifest = await readRouteManifest(repositoryRoot);
  const websiteRoot = path.join(repositoryRoot, 'website');
  const staging = path.join(
    path.dirname(output),
    `.${path.basename(output)}.agentic-report-site-${randomBytes(8).toString('hex')}`,
  );
  await mkdir(staging, { recursive: false });

  try {
    for (const route of manifest.routes) {
      const target = resolveConfined(staging, route.href, `Route ${route.id} href`);
      if (route.kind === 'generated') {
        if (route.id !== 'release' || route.href !== 'release.json') {
          throw new Error(`Unknown generated route: ${route.id}`);
        }
        continue;
      }
      const source = resolveRepositorySource(
        repositoryRoot,
        websiteRoot,
        route.source,
        `Route ${route.id} source`,
      );
      const canonicalSource = await resolveCanonicalRepositorySource(
        canonicalRepositoryRoot,
        source,
      );
      await mkdir(path.dirname(target), { recursive: true });
      if (route.kind === 'page') {
        await buildReport({
          input: canonicalSource,
          output: target,
          ...(route.review === undefined ? {} : { review: route.review }),
        });
        const compiled = await readFile(target, 'utf8');
        await writeFile(target, addMoiraAttribution(compiled));
      } else {
        await assertRegularDirectFile(repositoryRoot, source);
        await copyFile(canonicalSource, target);
      }
    }

    const inventoryPaths = (await listFiles(staging)).filter((file) => file !== 'release.json');
    const files = await Promise.all(inventoryPaths.map((file) => identifyFile(staging, file)));
    const fileByPath = new Map(files.map((file) => [file.path, file]));
    const routeFiles = manifest.routes
      .filter((route) => route.kind !== 'generated')
      .map((route) => {
        const identity = fileByPath.get(route.href);
        if (identity === undefined) {
          throw new Error(`Staged route is absent from inventory: ${route.href}`);
        }
        return { id: route.id, href: route.href, bytes: identity.bytes, sha256: identity.sha256 };
      });
    const skillRoute = routeFiles.find((route) => route.id === 'skill');
    if (skillRoute === undefined) {
      throw new Error('Staged site is missing the canonical skill route.');
    }

    const release = {
      contractVersion: 1,
      package: packageMetadata,
      sourceRevision: options.revision,
      skill: {
        version: skillMetadata.version,
        license: skillMetadata.license,
        compatibility: skillMetadata.compatibility,
        href: 'skills/agentic-report/SKILL.md',
        sha256: skillRoute.sha256,
      },
      routes: routeFiles,
      files,
    };
    const releaseBytes = `${JSON.stringify(release, null, 2)}\n`;
    await writeFile(path.join(staging, 'release.json'), releaseBytes, { flag: 'wx' });
    await rename(staging, output);
    return {
      output,
      releaseSha256: sha256(releaseBytes),
      fileCount: files.length + 1,
      routeCount: manifest.routes.length,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
};

const parseArguments = async (): Promise<StageSiteOptions> => {
  const args = process.argv.slice(2);
  let output = 'site';
  let revision: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '--output') {
      output = args[index + 1] ?? '';
      index += 1;
    } else if (argument === '--revision') {
      revision = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown site-build argument: ${argument ?? ''}`);
    }
  }
  if (output.trim() === '') {
    throw new Error('--output requires a path.');
  }
  if (revision === undefined) {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve('.') });
    revision = result.stdout.trim();
  }
  return { output, revision };
};

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  stageSite(await parseArguments())
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown site build failure.';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
