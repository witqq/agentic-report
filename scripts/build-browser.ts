/**
 * Builds the browser half of the package: the sources every page's assets are bundled from.
 *
 * A page receives only the scripts and styles it needs, so the package no longer ships one prebuilt
 * runtime and one stylesheet. It ships the modules of the core runtime and of every page feature as ESM
 * (`dist/browser/modules/**`, one transpiled file per source module, imports kept) and their stylesheets
 * (`dist/browser/modules/**.css`, prefixed for the package's browser targets and otherwise as written);
 * the compiler bundles a page's selection with esbuild (`src/core/page-assets.ts`). The embedded fonts are
 * copied beside them.
 *
 * The defect it catches: a feature whose module or stylesheet is missing from `dist` fails here, at build
 * time, instead of in the first page that needs it.
 */
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build, transform } from 'esbuild';

import {
  BROWSER_TARGETS,
  CORE_SCRIPT,
  CORE_STYLES,
  PAGE_FEATURES,
  type PageFeatureDefinition,
} from '../dist/node/page-features.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const modulesRoot = path.join(projectRoot, 'dist/browser/modules');

const features: readonly PageFeatureDefinition[] = PAGE_FEATURES;

/**
 * The source modules a page bundle can import, relative to `src/`: the module closure of the core runtime
 * and of every feature script. `scripts/check-package.ts` expects exactly their transpiled files.
 */
export async function browserModuleSources(): Promise<readonly string[]> {
  const scripts = [
    CORE_SCRIPT,
    ...features.flatMap((feature) => (feature.script === undefined ? [] : [feature.script])),
  ];
  const closure = await build({
    entryPoints: scripts.map((script) => path.join(sourceRoot, script)),
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    outdir: path.join(projectRoot, 'dist/.browser-closure'),
    logLevel: 'silent',
  });
  return Object.keys(closure.metafile.inputs)
    .map((input) => {
      const relative = path.relative(sourceRoot, path.resolve(projectRoot, input));
      if (relative.startsWith('..') || !/\.tsx?$/u.test(relative))
        throw new Error(`Browser module outside src/ or not TypeScript: ${input}`);
      return relative;
    })
    .sort();
}

/** Every stylesheet a page can receive, relative to `src/`, with the feature that owns it. */
export function browserStylesheets(): ReadonlyMap<string, string> {
  const owners = new Map<string, string>(CORE_STYLES.map((file) => [file, 'core']));
  for (const feature of features)
    for (const file of feature.styles ?? []) {
      if (owners.has(file)) throw new Error(`Stylesheet ${file} belongs to two features.`);
      owners.set(file, feature.id);
    }
  return owners;
}

async function buildBrowser(): Promise<void> {
  for (const relative of await browserModuleSources()) {
    const result = await transform(await readFile(path.join(sourceRoot, relative), 'utf8'), {
      loader: 'ts',
      format: 'esm',
      target: [...BROWSER_TARGETS],
      charset: 'utf8',
      sourcefile: relative,
    });
    const output = path.join(modulesRoot, relative.replace(/\.tsx?$/u, '.js'));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, result.code);
  }

  // Lightning CSS is Vite's CSS minifier, which added these prefixes to the former package stylesheet;
  // running its transform here keeps the page's declarations for the same targets.
  const viteRequire = createRequire(createRequire(import.meta.url).resolve('vite'));
  const lightningcss = viteRequire('lightningcss') as LightningCss;
  const version = (target: string): number => {
    const [major = 0, minor = 0] = target
      .replace(/^[a-z]+/u, '')
      .split('.')
      .map(Number);
    return (major << 16) | (minor << 8);
  };
  const targets = Object.fromEntries(
    BROWSER_TARGETS.map((target) => [target.replace(/[\d.]+$/u, ''), version(target)]),
  );
  for (const [file, owner] of browserStylesheets()) {
    const { code } = lightningcss.transform({
      filename: file,
      code: await readFile(path.join(sourceRoot, file)),
      minify: false,
      targets,
    });
    const output = path.join(modulesRoot, file);
    await mkdir(path.dirname(output), { recursive: true });
    // The legal comment survives minification: it is how a check tells which stylesheets a page carries.
    await writeFile(
      output,
      `/*! agentic-report style: ${owner} */\n${Buffer.from(code).toString()}`,
    );
  }

  await cp(path.join(sourceRoot, 'fonts'), path.join(projectRoot, 'dist/browser/fonts'), {
    recursive: true,
  });
}

interface LightningCss {
  transform(options: {
    readonly filename: string;
    readonly code: Uint8Array;
    readonly minify: boolean;
    readonly targets: Readonly<Record<string, number>>;
  }): { readonly code: Uint8Array };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildBrowser();
  // The build cleans dist first, so tsc writes the CLI entry afresh without the execute bit that
  // `npm link` set once; a linked `agentic-report` would then fail with «Permission denied».
  await chmod(path.join(projectRoot, 'dist/node/cli.js'), 0o755);
}
