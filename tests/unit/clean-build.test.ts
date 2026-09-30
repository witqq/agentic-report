import { execSync } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BUILD_OUTPUTS } from '../../scripts/clean-build.ts';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

describe('build outputs', () => {
  it('removes a module the sources no longer have before the build writes again', async () => {
    // Catches a build that only adds and overwrites: a deleted `src/` module kept its compiled files
    // in dist/node, shipped in the tarball and failed the release allowlist of `pnpm pack:check`.
    const manifest = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    const commands = (manifest.scripts.build ?? '').split(' && ');
    const firstWriter = commands.findIndex((command) => /^(?:tsc|vite) /u.test(command));
    expect(firstWriter).toBeGreaterThan(-1);
    const beforeWriting = commands.slice(0, firstWriter);

    const workspace = await createTestWorkspace('clean-build');
    workspaces.push(workspace);
    await mkdir(path.join(workspace, 'scripts'));
    await copyFile(
      path.resolve('scripts/clean-build.ts'),
      path.join(workspace, 'scripts/clean-build.ts'),
    );
    const stale = [
      path.join(workspace, 'dist/node/removed-module.js'),
      path.join(workspace, 'dist/node/nested/removed-module.d.ts'),
      path.join(workspace, 'dist/browser/removed-bundle.js'),
    ];
    const foreign = path.join(workspace, 'dist/site/keep.txt');
    for (const file of [...stale, foreign]) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, 'stale');
    }
    for (const command of beforeWriting) execSync(command, { cwd: workspace, stdio: 'pipe' });

    for (const file of stale) expect(await exists(file), file).toBe(false);
    expect(await exists(foreign)).toBe(true);
  });

  it('owns every directory the build writes to', async () => {
    // Catches a new build target outside the cleaned list: its removed files would linger again.
    const configs = ['tsconfig.build.json', 'scripts/build-browser.ts'];
    const targets: string[] = [];
    for (const config of configs) {
      const text = await readFile(path.resolve(config), 'utf8');
      for (const match of text.matchAll(
        /(?:"outDir": "\.\/|'|path\.resolve\(projectRoot, ')(dist\/[a-z]+)/gu,
      ))
        targets.push(match[1] ?? '');
    }
    expect(new Set(targets)).toEqual(new Set(BUILD_OUTPUTS));
  });
});
