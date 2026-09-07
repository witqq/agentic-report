import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { inspectExecutableSearch } from '../../scripts/package-provenance.ts';
import { validateExtensionProposal } from '../../src/authoring/extension-gate.js';
import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('release readiness', () => {
  it('ships accepted evidence for every product extension proposal', async () => {
    for (const file of [
      'docs/product/code-glossary-extension.json',
      'docs/product/copyable-prose-extension.json',
      'docs/product/diagram-extension.json',
      'docs/product/in-flow-contents-extension.json',
      'docs/product/review-workspace-extension.json',
      'docs/product/response-workspace-extension.json',
      'docs/product/section-prose-extension.json',
      'docs/product/share-safe-build-extension.json',
      'docs/product/time-text-extension.json',
      'docs/product/source-link-extension.json',
      'docs/product/violation-inventory-extension.json',
    ]) {
      const proposal = JSON.parse(await readFile(path.resolve(file), 'utf8')) as unknown;
      expect(validateExtensionProposal(proposal), file).toEqual({ accepted: true, issues: [] });
    }
  });

  it('keeps the primary README source example buildable as written', async () => {
    const readme = await readFile(path.resolve('README.md'), 'utf8');
    const example = /````markdown\n([\s\S]*?)\n````/u.exec(readme)?.[1];
    if (example === undefined) throw new Error('README primary Markdown example is missing.');
    const workspace = await createTestWorkspace('release-readme-example');
    workspaces.push(workspace);
    await mkdir(path.join(workspace, 'partials'), { recursive: true });
    await mkdir(path.join(workspace, 'assets'), { recursive: true });
    await writeFile(path.join(workspace, 'report.md'), example);
    await writeFile(path.join(workspace, 'partials/context.md'), 'Context for the decision.\n');
    await writeFile(
      path.join(workspace, 'assets/system.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>\n',
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).resolves.toMatchObject({ format: 'single-file' });
  });

  it('targets a real Compose service and its declared health container', async () => {
    const deploy = JSON.parse(await readFile(path.resolve('.deploy-config.json'), 'utf8')) as {
      readonly serviceName?: string;
      readonly healthCheck?: { readonly containerName?: string };
    };
    const compose = parseYaml(
      await readFile(path.resolve('docker-compose.remote.yml'), 'utf8'),
    ) as {
      readonly services?: Record<string, { readonly container_name?: string }>;
    };
    const service =
      deploy.serviceName === undefined ? undefined : compose.services?.[deploy.serviceName];
    expect(service, deploy.serviceName).toBeDefined();
    expect(service?.container_name).toBe(deploy.healthCheck?.containerName);
  });

  it('labels every packaged example as fictional before its first evidence claims', async () => {
    const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8')) as {
      readonly examples: readonly {
        readonly id: string;
        readonly path: string;
        readonly entry: string;
      }[];
    };
    for (const example of manifest.examples) {
      const source = await readFile(path.resolve('examples', example.path, example.entry), 'utf8');
      expect(fictionalMarkerIssue(source), example.id).toBeUndefined();
    }

    const late = '# Dashboard\n\n142 checks passed.\n\n**Fictional sample.** Replace this.\n';
    const hidden = '# Dashboard\n\n```markdown\n**Fictional sample.** Hidden.\n```\n';
    expect(fictionalMarkerIssue(late)).toBe(
      'first visible block after H1 is not a fictional notice',
    );
    expect(fictionalMarkerIssue(hidden)).toBe(
      'first visible block after H1 is not a fictional notice',
    );
    expect(fictionalMarkerIssue('Text first.\n\n# Dashboard\n')).toBe(
      'first visible block is not H1',
    );
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

    expect(await inspectExecutableSearch([first, later], ['agentic-report'])).toEqual({
      checks: [
        { path: path.join(first, 'agentic-report'), exists: false },
        { path: unintended, exists: true },
      ],
      allAbsent: false,
    });
  });
});

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
