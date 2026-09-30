import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport, type BuildManifestDefaults } from '../../src/index.js';
import { loadSource } from '../../src/source/load-source.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
const SCENE_DEFAULTS: BuildManifestDefaults = {
  topbar: false,
  schemeToggle: false,
  themeSwitcher: false,
  review: false,
};

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(): Promise<string> {
  const root = await createTestWorkspace('manifest-defaults');
  workspaces.push(root);
  return root;
}

function targetIds(html: string): string[] {
  return [...html.matchAll(/data-review-target="([^"]+)"/gu)].map((match) => match[1] ?? '');
}

describe('buildReport manifest defaults', () => {
  it('preserves original source identity, aliases and locale targets without copying or rewriting source', async () => {
    // A temporary sibling entry changes automatic review IDs; caller defaults must retain every original
    // source map and digest, including an include alias absent from the canonical sourceFiles graph.
    const root = await workspace();
    await mkdir(path.join(root, 'partials'));
    const entry = path.join(root, 'report.md');
    const localized = path.join(root, 'report.ru.md');
    const partial = path.join(root, 'partials', 'actual.md');
    await writeFile(
      entry,
      '---\ntitle: Original\nlanguage: en\nlocalizations:\n  ru: report.ru.md\n---\n\n# Original\n\nEntry paragraph.\n\n{{include: alias.md}}\n',
    );
    await writeFile(
      localized,
      '---\ntitle: Исходник\nlanguage: ru\n---\n\n# Исходник\n\nДругой абзац.\n\n{{include: alias.md}}\n',
    );
    await writeFile(partial, '## Included heading\n\nIncluded paragraph.\n');
    await symlink(partial, path.join(root, 'alias.md'));
    const authoredPaths = [entry, localized, partial];
    const beforeBytes = await Promise.all(authoredPaths.map((file) => readFile(file)));
    const normal = await loadSource(entry);
    const scene = await loadSource(entry, SCENE_DEFAULTS);
    expect(normal.sourceFiles).toContain(partial);
    expect(normal.sourceFiles).not.toContain(path.join(root, 'alias.md'));
    expect(scene.entryPath).toBe(normal.entryPath);
    expect(scene.sourceRoot).toBe(normal.sourceRoot);
    expect(scene.sourceFiles).toEqual(normal.sourceFiles);
    expect(scene.sourceMap).toEqual(normal.sourceMap);
    expect(scene.sourceDigests).toEqual(normal.sourceDigests);
    expect(scene.markdown).toBe(normal.markdown);
    expect(scene.manifest).toMatchObject(SCENE_DEFAULTS);
    expect(scene.localizations).toHaveLength(1);
    expect(scene.localizations[0]).toMatchObject({
      entryPath: normal.localizations[0]?.entryPath,
      sourceMap: normal.localizations[0]?.sourceMap,
      sourceDigests: normal.localizations[0]?.sourceDigests,
      manifest: SCENE_DEFAULTS,
    });
    const baselineOutput = path.join(root, 'baseline.html');
    const sceneOutput = path.join(root, 'scene.html');
    const repeatedOutput = path.join(root, 'repeated.html');
    await buildReport({ input: entry, output: baselineOutput });
    await buildReport({ input: entry, output: sceneOutput, manifestDefaults: SCENE_DEFAULTS });
    await buildReport({ input: entry, output: repeatedOutput, manifestDefaults: SCENE_DEFAULTS });
    const baseline = await readFile(baselineOutput, 'utf8');
    const sceneHtml = await readFile(sceneOutput, 'utf8');
    const repeated = await readFile(repeatedOutput, 'utf8');
    expect(targetIds(baseline)).toHaveLength(8);
    expect(targetIds(sceneHtml)).toEqual(targetIds(baseline));
    expect(targetIds(repeated)).toEqual(targetIds(baseline));
    expect(sceneHtml).toContain('data-topbar="none"');
    expect(sceneHtml).not.toMatch(/<header[^>]*class="topbar"/u);
    expect(sceneHtml).not.toMatch(/<button[^>]*data-scheme-toggle/u);
    expect(repeated).toBe(sceneHtml);
    expect(await Promise.all(authoredPaths.map((file) => readFile(file)))).toEqual(beforeBytes);
  });

  it('lets project metadata and then primary frontmatter win, including explicit false values in every locale', async () => {
    // Applying defaults after parsed metadata would overwrite author decisions and ignore the sidecar.
    const root = await workspace();
    await writeFile(
      path.join(root, 'agentic-report.yaml'),
      'topbar: true\nschemeToggle: false\nreview: true\nthemeSwitcher: true\n',
    );
    await writeFile(
      path.join(root, 'report.md'),
      '---\nlanguage: en\nlocalizations:\n  ru: report.ru.md\nschemeToggle: true\nthemeSwitcher: false\n---\n# English\n',
    );
    await writeFile(path.join(root, 'report.ru.md'), '---\nlanguage: ru\n---\n# Русский\n');
    const source = await loadSource(root, SCENE_DEFAULTS);
    const expected = { topbar: true, schemeToggle: true, themeSwitcher: false, review: true };
    expect(source.manifest).toMatchObject(expected);
    expect(source.localizations[0]?.manifest).toMatchObject(expected);
    await buildReport({
      input: root,
      output: path.join(root, 'authored.html'),
      manifestDefaults: SCENE_DEFAULTS,
    });
    const html = await readFile(path.join(root, 'authored.html'), 'utf8');
    expect(html).toMatch(/<header[^>]*class="topbar"/u);
    expect(html).toContain('data-review-manifest');
    await writeFile(
      path.join(root, 'report.md'),
      '---\nlanguage: en\nlocalizations:\n  ru: report.ru.md\ntopbar: false\nschemeToggle: false\nthemeSwitcher: false\nreview: false\n---\n# Author opted out\n',
    );
    const optedOut = await loadSource(root, {
      topbar: true,
      schemeToggle: true,
      themeSwitcher: true,
      review: true,
    });
    expect(optedOut.manifest).toMatchObject(SCENE_DEFAULTS);
    expect(optedOut.localizations[0]?.manifest).toMatchObject(SCENE_DEFAULTS);
  });

  it('keeps omitted and undefined defaults equivalent to the registry, while a supplied false takes effect', async () => {
    const root = await workspace();
    await writeFile(path.join(root, 'report.md'), '# Plain\n');
    const normal = await loadSource(root);
    expect((await loadSource(root, {})).manifest).toEqual(normal.manifest);
    expect((await loadSource(root, { topbar: undefined, review: undefined })).manifest).toEqual(
      normal.manifest,
    );
    expect(normal.manifest).toMatchObject({
      topbar: true,
      schemeToggle: true,
      themeSwitcher: false,
      review: false,
    });
    expect((await loadSource(root, { schemeToggle: false })).manifest.schemeToggle).toBe(false);
  });

  it('rejects malformed options before source I/O without echoing unknown keys or values', async () => {
    // A missing entry distinguishes option validation from source loading, and the canaries catch private
    // submitted values being copied into a diagnostic or its details/cause.
    const root = await workspace();
    const nonEnumerable = Object.defineProperty({}, 'PRIVATE_KEY_CANARY', {
      value: 'PRIVATE_VALUE_CANARY',
    });
    const invalid: unknown[] = [
      null,
      [],
      true,
      'PRIVATE_VALUE_CANARY',
      new Date(),
      { topbar: 'PRIVATE_VALUE_CANARY' },
      { review: null },
      { PRIVATE_KEY_CANARY: false },
      { layout: 'document' },
      nonEnumerable,
      { [Symbol('PRIVATE_KEY_CANARY')]: false },
    ];
    for (const value of invalid) {
      try {
        await buildReport({
          input: path.join(root, 'missing.md'),
          manifestDefaults: value as BuildManifestDefaults,
        });
        throw new Error('Malformed manifest defaults were accepted.');
      } catch (error) {
        expect(error).toMatchObject({ diagnostic: { code: 'INVALID_MANIFEST_DEFAULTS' } });
        expect(JSON.stringify(error)).not.toContain('PRIVATE_KEY_CANARY');
        expect(JSON.stringify(error)).not.toContain('PRIVATE_VALUE_CANARY');
      }
    }
    await writeFile(path.join(root, 'report.md'), '---\ntopbar: true\n---\n# Author wins\n');
    await expect(
      loadSource(root, { topbar: 'PRIVATE_VALUE_CANARY' } as unknown as BuildManifestDefaults),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_MANIFEST_DEFAULTS' } });
  });

  it('preserves topbar-control conflicts and rejects authored null instead of replacing it', async () => {
    const root = await workspace();
    await writeFile(path.join(root, 'report.md'), '---\nreview: true\n---\n# Review required\n');
    await expect(
      buildReport({
        input: root,
        output: path.join(root, 'conflict.html'),
        manifestDefaults: SCENE_DEFAULTS,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'INVALID_MANIFEST' } });
    await writeFile(
      path.join(root, 'report.md'),
      '---\ntopbar: null\n---\n# Invalid authored control\n',
    );
    await expect(loadSource(root, { topbar: true })).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_MANIFEST' },
    });
  });

  it('keeps canonical confinement for includes when defaults are supplied', async () => {
    const root = await workspace();
    const outside = await workspace();
    await writeFile(path.join(outside, 'private.md'), 'PRIVATE_INCLUDE_CANARY\n');
    await symlink(path.join(outside, 'private.md'), path.join(root, 'alias.md'));
    await writeFile(path.join(root, 'report.md'), '# Local\n\n{{include: alias.md}}\n');
    await expect(
      buildReport({
        input: root,
        output: path.join(root, 'page.html'),
        manifestDefaults: SCENE_DEFAULTS,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'PARTIAL_OUTSIDE_SOURCE' } });
  });
});
