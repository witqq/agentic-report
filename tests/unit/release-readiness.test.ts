import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { afterEach, describe, expect, it } from 'vitest';

import { inspectExecutableSearch } from '../../scripts/package-provenance.ts';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('release provenance', () => {
  it('labels every packaged example as fictional before its first evidence claims', async () => {
    const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8')) as {
      readonly examples: readonly {
        readonly id: string;
        readonly path: string;
        readonly entry: string;
      }[];
    };

    expect(manifest.examples).toHaveLength(15);
    for (const example of manifest.examples) {
      const source = await readFile(path.resolve('examples', example.path, example.entry), 'utf8');
      expect(fictionalMarkerIssue(source), example.id).toBeUndefined();
    }

    expect(
      fictionalMarkerIssue(
        '# Dashboard\n\n142 checks passed in production.\n\n**Fictional sample.** Replace this.\n',
      ),
    ).toBe('first visible block after H1 is not a fictional notice');
    expect(
      fictionalMarkerIssue(
        '# Dashboard\n\n```markdown\n**Fictional sample.** Hidden example.\n```\n',
      ),
    ).toBe('first visible block after H1 is not a fictional notice');
    expect(
      fictionalMarkerIssue(
        '```markdown\n# Fake heading\n**Fictional sample.** Hidden example.\n```\n\n# Real dashboard\n\n142 checks passed in production.\n',
      ),
    ).toBe('first visible block is not H1');
    expect(
      fictionalMarkerIssue(
        '~~~~markdown\n# Fake heading\n**Fictional sample.** Hidden example.\n~~~~\n\n# Real dashboard\n\n142 checks passed in production.\n',
      ),
    ).toBe('first visible block is not H1');
    expect(
      fictionalMarkerIssue(
        '\t```markdown\n# Real dashboard\n\n142 checks passed in production.\n```\n# Fake heading\n**Fictional sample.** Hidden example.\n',
      ),
    ).toBe('first visible block is not H1');
    expect(
      fictionalMarkerIssue(
        '142 checks passed in production.\n\n# Dashboard\n\n**Fictional sample.** Too late.\n',
      ),
    ).toBe('first visible block is not H1');
    expect(
      fictionalMarkerIssue(
        '# Dashboard\n\n**`142 checks passed`Fictional sample.** Hidden after a visible claim.\n',
      ),
    ).toBe('first visible block after H1 is not a fictional notice');
  });

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

function fictionalMarkerIssue(source: string): string | undefined {
  let content: string;
  try {
    content = matter(source).content;
  } catch {
    return 'frontmatter is not closed';
  }
  const blocks = unified().use(remarkParse).parse(content).children;
  const h1 = blocks[0];
  if (h1 === undefined) return 'first H1 is missing';
  if (h1.type !== 'heading' || h1.depth !== 1) return 'first visible block is not H1';
  const firstVisible = blocks[1];
  if (firstVisible === undefined) return 'visible fictional notice is missing';
  const firstInline = firstVisible.type === 'paragraph' ? firstVisible.children[0] : undefined;
  const markerStart = firstInline?.type === 'strong' ? firstInline.children[0] : undefined;
  const marker = markerStart?.type === 'text' ? markerStart.value : '';
  return /^(?:Fictional sample\.|Fictional showcase ·)/u.test(marker)
    ? undefined
    : 'first visible block after H1 is not a fictional notice';
}
