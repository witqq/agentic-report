import { execFileSync } from 'node:child_process';
import { copyFile, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BUILT_IN_BLOCKS } from '../../src/blocks/index.js';
import { buildReport } from '../../src/core/compiler.js';
import { bundlePageAssets, pageAssetEntries } from '../../src/core/page-assets.js';
import { EN_STRINGS } from '../../src/localization/en.js';
import { RU_STRINGS } from '../../src/localization/ru.js';
import {
  CORE_STYLES,
  PAGE_FEATURES,
  type PageFeatureDefinition,
  type PageFeatureId,
  isPageFeatureId,
  pageFeature,
  resolvePageFeatures,
} from '../../src/page-features.js';
import { packageStylesheetFiles } from '../helpers/package-stylesheet.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

const FEATURES: readonly PageFeatureDefinition[] = PAGE_FEATURES;
let sites = 0;

/** The stable markers a feature leaves in a page: the legal comments its module and stylesheet begin with. */
const scriptMarker = (id: string): string => `agentic-report script: ${id} */`;
const styleMarker = (id: string): string => `agentic-report style: ${id} */`;

async function workspace(prefix: string): Promise<string> {
  const root = await createTestWorkspace(prefix);
  workspaces.push(root);
  await writeFile(path.join(root, 'data.json'), '{"local":true}\n');
  await writeFile(path.join(root, 'reader.woff'), 'package-owned-font-bytes');
  await copyFile(path.resolve('tests/fixtures/video/playback.webm'), path.join(root, 'clip.webm'));
  for (const image of ['clip-poster.png', 'before.png', 'after.png'])
    await copyFile(path.resolve('tests/fixtures/video/poster.png'), path.join(root, image));
  await cp(path.resolve('tests/fixtures/video/film'), path.join(root, 'film'), { recursive: true });
  return root;
}

/** The page's script and stylesheet text, from the single file or from the directory's assets. */
async function pageAssets(
  root: string,
  markdown: string,
  format: 'single-file' | 'directory',
): Promise<{ readonly script: string; readonly styles: string }> {
  await writeFile(path.join(root, 'report.md'), markdown);
  sites += 1;
  const output = path.join(root, format === 'single-file' ? 'page.html' : `site-${sites}`);
  await buildReport({ input: root, output, format });
  if (format === 'single-file') {
    const html = await readFile(output, 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((m) => m[1]).join('');
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gu)].map((m) => m[1]).join('');
    return { script, styles };
  }
  const assets = await readdir(path.join(output, 'assets'));
  const read = (prefix: string): Promise<string> => {
    const name = assets.find((file) => file.startsWith(prefix));
    if (name === undefined) throw new Error(`No ${prefix} asset`);
    return readFile(path.join(output, 'assets', name), 'utf8');
  };
  return { script: await read('runtime.'), styles: await read('document.') };
}

const page = (body: string): string =>
  `---\ncontractVersion: 1\ntitle: Features\nlanguage: en\n---\n\n# Features\n\n${body}\n`;

describe('page features', () => {
  it('carries the chrome of a theme and the icons of a module only on a page that uses them', async () => {
    const root = await workspace('theme-chrome');
    const themed = (theme: string): string =>
      `---\ncontractVersion: 1\ntitle: Themes\nlanguage: en\ntheme: ${theme}\n---\n\n# Themes\n\nProse.\n`;
    // Ловит: полосы консоли и оболочка ledger едут на каждую страницу, хотя их тема у страницы другая.
    const plain = await pageAssets(root, themed('calm-paper'), 'single-file');
    expect(plain.styles).not.toContain(styleMarker('theme-console'));
    expect(plain.styles).not.toContain(styleMarker('theme-ledger'));
    const terminal = await pageAssets(root, themed('terminal'), 'single-file');
    expect(terminal.styles).toContain(styleMarker('theme-console'));
    const blueprint = await pageAssets(root, themed('blueprint'), 'single-file');
    expect(blueprint.styles).toContain(styleMarker('theme-ledger'));
    expect(blueprint.styles).not.toContain(styleMarker('theme-console'));
    // Ловит: весь набор иконок в скрипте страницы, которой нужна одна кнопка копирования.
    const code = await pageAssets(root, page('```ts\nconst a = 1;\n```'), 'single-file');
    const palette = 'M8 1a7 7 0 0 0 0 14c';
    const copy = 'M0 6.75C0 5.784.784 5 1.75 5h1.5';
    expect(code.script).toContain(copy);
    expect(code.script).not.toContain(palette);
  });

  it('maps every built-in block to the core or to a feature of the table', () => {
    // Catches a block left without its styles or controller: its feature must exist and bring something.
    for (const block of BUILT_IN_BLOCKS) {
      expect(block.feature === 'core' || isPageFeatureId(block.feature), block.name).toBe(true);
    }
    for (const feature of FEATURES) {
      expect(
        feature.script !== undefined || (feature.styles?.length ?? 0) > 0,
        `${feature.id} carries neither a script nor a stylesheet`,
      ).toBe(true);
      for (const required of feature.requires ?? [])
        expect(isPageFeatureId(required), `${feature.id} requires ${required}`).toBe(true);
    }
  });

  it('owns every stylesheet and feature module of the source tree exactly once', async () => {
    // Catches a stylesheet or controller that no feature lists: it would never reach a page.
    const listed = packageStylesheetFiles();
    expect(new Set(listed).size).toBe(listed.length);
    const onDisk = [
      ...(await readdir(path.resolve('src/blocks')))
        .filter((file) => file.endsWith('.css'))
        .map((file) => `src/blocks/${file}`),
      ...(await readdir(path.resolve('src/browser/styles')))
        .filter((file) => file.endsWith('.css'))
        .map((file) => `src/browser/styles/${file}`),
    ];
    expect([...listed].sort()).toEqual(onDisk.sort());
    expect(CORE_STYLES).toEqual(['browser/styles/core.css']);
    const modules = (await readdir(path.resolve('src/browser/features'))).map(
      (file) => `browser/features/${file}`,
    );
    const scripts = FEATURES.flatMap((feature) => feature.script ?? []).filter((script) =>
      script.startsWith('browser/features/'),
    );
    expect([...scripts].sort()).toEqual(modules.sort());
    // Each module and stylesheet names its feature in the marker a built page carries.
    for (const feature of FEATURES)
      if (feature.script !== undefined)
        expect(await readFile(path.resolve('src', feature.script), 'utf8')).toMatch(
          new RegExp(`^/\\*! agentic-report script: ${feature.id} \\*/`, 'u'),
        );
  });

  it('closes a selection under requires and keeps table order', () => {
    expect(resolvePageFeatures(['diagram'])).toEqual(
      FEATURES.map((feature) => feature.id).filter((id) =>
        ['diagram', 'visualization', 'figure-viewer', 'tabs'].includes(id),
      ),
    );
    expect(resolvePageFeatures(['core'])).toEqual([]);
  });

  it('starts the edition layer, islands and effects after the runtime and every other feature before it', () => {
    const entry = pageAssetEntries(FEATURES.map((feature) => feature.id as PageFeatureId)).script;
    const runtime = entry.indexOf('./browser/runtime.js');
    for (const feature of FEATURES) {
      if (feature.script === undefined) continue;
      const at = entry.indexOf(`./${feature.script.replace(/\.ts$/u, '.js')}`);
      expect(at, feature.id).toBeGreaterThanOrEqual(0);
      expect(at > runtime, feature.id).toBe(feature.scriptAfterRuntime === true);
    }
  });
});

describe('page assets', () => {
  it(
    'carries a feature’s script and stylesheet exactly on pages that render its block, in both formats',
    { timeout: 180_000 },
    async () => {
      // Distinguishes a page that received only what it needs from one that received everything: a
      // plain page has no feature marker, and a page with block X has X's markers and its requirements'.
      const root = await workspace('page-assets');
      for (const format of ['single-file', 'directory'] as const) {
        const plain = await pageAssets(root, page('Plain prose, nothing more.'), format);
        // The chrome of the page's theme follows the theme, not a block (the theme test above).
        for (const feature of FEATURES.filter((entry) => !entry.id.startsWith('theme-'))) {
          expect(plain.script, `${format} plain page has ${feature.id}`).not.toContain(
            scriptMarker(feature.id),
          );
          expect(plain.styles, `${format} plain page has ${feature.id}`).not.toContain(
            styleMarker(feature.id),
          );
        }
        expect(plain.styles).toContain(styleMarker('core'));
        const checked = new Set<string>();
        for (const block of BUILT_IN_BLOCKS) {
          if (block.feature === 'core' || checked.has(block.feature)) continue;
          const [example] = block.examples;
          if (example === undefined) continue;
          checked.add(block.feature);
          const assets = await pageAssets(root, page(example), format);
          for (const id of resolvePageFeatures([block.feature])) {
            const definition = pageFeature(id);
            if (definition.script !== undefined)
              expect(assets.script, `${format} ${block.name} → ${id} script`).toContain(
                scriptMarker(id),
              );
            if ((definition.styles?.length ?? 0) > 0)
              expect(assets.styles, `${format} ${block.name} → ${id} styles`).toContain(
                styleMarker(id),
              );
          }
        }
        // Every block feature was exercised by at least one block example.
        const blockFeatures = new Set(
          BUILT_IN_BLOCKS.map((block) => block.feature).filter((id) => id !== 'core'),
        );
        expect([...checked].sort()).toEqual([...blockFeatures].sort());
      }
    },
  );

  it('carries the package strings of the page’s languages only', async () => {
    // Catches a page script that still carries every locale: an English page has no Russian strings.
    const english = await bundlePageAssets([], ['en']);
    const russian = await bundlePageAssets([], ['ru']);
    const both = await bundlePageAssets([], ['ru', 'en']);
    expect(english.script).toContain(EN_STRINGS.hideContents);
    expect(english.script).not.toContain(RU_STRINGS.hideContents);
    expect(russian.script).toContain(RU_STRINGS.hideContents);
    expect(russian.script).not.toContain(EN_STRINGS.hideContents);
    expect(both.script).toContain(EN_STRINGS.hideContents);
    expect(both.script).toContain(RU_STRINGS.hideContents);
  });

  it(
    'rebuilds a page byte for byte in a fresh process, in both formats',
    { timeout: 60_000 },
    async () => {
      // Separate processes: nothing cached from the first build can make the second one equal.
      const root = await workspace('page-assets-determinism');
      await writeFile(
        path.join(root, 'report.md'),
        page(
          ':::diagram{title="Flow" description="Two steps."}\n::node{id="a" label="A"}\n::node{id="b" label="B"}\n::edge{from="a" to="b"}\n:::\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst a = 1;\n```',
        ),
      );
      const cli = path.resolve('dist/node/cli.js');
      const build = (output: string, format: string): void => {
        execFileSync('node', [cli, 'build', root, '--output', output, '--format', format], {
          stdio: 'pipe',
        });
      };
      build(path.join(root, 'one.html'), 'single-file');
      build(path.join(root, 'two.html'), 'single-file');
      expect(
        (await readFile(path.join(root, 'one.html'))).equals(
          await readFile(path.join(root, 'two.html')),
        ),
      ).toBe(true);
      build(path.join(root, 'one'), 'directory');
      build(path.join(root, 'two'), 'directory');
      const files = async (directory: string): Promise<Record<string, string>> => {
        const result: Record<string, string> = {};
        for (const name of [
          'index.html',
          ...(await readdir(path.join(directory, 'assets'))).map((file) => `assets/${file}`),
        ])
          result[name] = (await readFile(path.join(directory, name))).toString('base64');
        return result;
      };
      expect(await files(path.join(root, 'two'))).toEqual(await files(path.join(root, 'one')));
    },
  );
});
