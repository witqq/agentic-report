import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectExecutableSearch } from '../../scripts/package-provenance.ts';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('release provenance', () => {
  it('finds an executable present only in a later search directory', async () => {
    const workspace = await createTestWorkspace('release-executable-search');
    workspaces.push(workspace);
    const first = path.join(workspace, 'first-bin');
    const later = path.join(workspace, 'later-bin');
    await mkdir(first);
    await mkdir(later);
    const unintended = path.join(later, 'agentic-report');
    await writeFile(unintended, '#!/bin/sh\n');

    const observed = await inspectExecutableSearch([first, later], ['agentic-report']);

    expect(observed).toEqual({
      checks: [
        { path: path.join(first, 'agentic-report'), exists: false },
        { path: unintended, exists: true },
      ],
      allAbsent: false,
    });
  });

  it('binds every future registry command to one of two independently empty caches', async () => {
    const runbook = await readFile(path.resolve('docs/RELEASE.md'), 'utf8');
    const section = runbook
      .split('## Prove real registry npx\n')[1]
      ?.split('## Deploy and accept')[0];
    if (section === undefined)
      throw new Error('Release runbook is missing its registry-npx section.');
    const shellBlocks = [...section.matchAll(/```sh\n([\s\S]*?)```/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(shellBlocks).toHaveLength(3);
    const [setup = '', pinned = '', latest = ''] = shellBlocks;

    expect(setup).toContain('pinned_root="$(mktemp -d)"');
    expect(setup).toContain('latest_root="$(mktemp -d)"');
    expect(setup).toContain('test "$pinned_cache" != "$latest_cache"');
    expect(setup).toContain('find "$pinned_cache" -mindepth 1 -print -quit');
    expect(setup).toContain('find "$latest_cache" -mindepth 1 -print -quit');

    expect(pinned).toContain('cd "$pinned_work"');
    expect(latest).toContain('cd "$latest_work"');
    const pinnedRegistryCommands = registryCommands(pinned);
    const latestRegistryCommands = registryCommands(latest);
    expect(pinnedRegistryCommands).toHaveLength(6);
    expect(latestRegistryCommands).toHaveLength(7);
    expect(
      pinnedRegistryCommands.every((line) => line.includes('npm_config_cache="$pinned_cache"')),
    ).toBe(true);
    expect(
      latestRegistryCommands.every((line) => line.includes('npm_config_cache="$latest_cache"')),
    ).toBe(true);
    expect(
      pinnedRegistryCommands
        .filter((line) => line.includes('"$release_npx"'))
        .every((line) => line.includes('agentic-report@0.2.0')),
    ).toBe(true);
    expect(
      latestRegistryCommands
        .filter((line) => line.includes('"$release_npx"'))
        .every((line) => !line.includes('agentic-report@')),
    ).toBe(true);
  });
});

function registryCommands(block: string): string[] {
  return block
    .split('\n')
    .filter((line) => line.includes('"$release_npm"') || line.includes('"$release_npx"'));
}
