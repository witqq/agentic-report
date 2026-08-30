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
      'docs/product/share-safe-build-extension.json',
      'docs/product/time-text-extension.json',
      'docs/product/source-link-extension.json',
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

  it('keeps all shipped review pillars in normative product requirements', async () => {
    const requirements = await readFile(path.resolve('PRODUCT-REQUIREMENTS.md'), 'utf8');
    for (const required of [
      'AR-AUTHOR-REVIEW-PROTOCOL',
      'AR-AUTHOR-REVIEW-BINDING',
      'AR-AUTHOR-REVIEW-RECONCILIATION',
      'AR-COMPONENT-REVIEW-WORKSPACE',
      '`review.json` версии 2',
      'сообщениями пользователя',
      'resolved или reopened',
      '`exact/changed/missing/ambiguous`',
      'Формальные verdict, approval gate и review-чек-листы не входят',
    ]) {
      expect(requirements, required).toContain(required);
    }
    expect(requirements).not.toContain('AR-COMPONENT-REVIEW-DECISIONS');
    expect(requirements).not.toContain('AR-COMPONENT-REVIEW-CHECKLISTS');
  });

  it('keeps static checklist metadata independent from review approval', async () => {
    const [architecture, sourceContract, registry, requirements, extension] = await Promise.all([
      readFile(path.resolve('docs/ARCHITECTURE.md'), 'utf8'),
      readFile(path.resolve('docs/product/source-contract.md'), 'utf8'),
      readFile(path.resolve('src/authoring/registry.ts'), 'utf8'),
      readFile(path.resolve('PRODUCT-REQUIREMENTS.md'), 'utf8'),
      readFile(path.resolve('docs/product/review-workspace-extension.json'), 'utf8'),
    ]);
    expect(architecture).toContain('owns in-memory discussion threads');
    expect(sourceContract).toContain('optional authored `required` marker');
    expect(sourceContract).toContain('prior thread segments');
    expect(registry).toContain('Marks this item as required in the static document.');
    expect(registry).toContain('Marks this decision as required in the static document.');
    expect(registry).toContain('Static structured checklist');
    expect(registry).toContain('fragment threads, user/agent messages, resolution');
    expect(architecture).toContain('binds its threads and revision segments');
    expect(architecture).toContain('resolve the thread segment');
    expect(sourceContract).toContain('Structured thread and message fields');
    expect(requirements).toContain('поля тредов и сообщений');
    expect(extension).toContain('revision-segment binding');
    for (const retired of [
      'Blocks approval while unchecked.',
      'Requires a selected, open, or deferred response.',
      'Typed review checklist',
      'independent verdicts',
      'structured responses',
      'resolve the response',
      'read-only feedback binding',
    ]) {
      expect(
        `${registry}\n${architecture}\n${sourceContract}\n${requirements}\n${extension}`,
      ).not.toContain(retired);
    }
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

  it('keeps the release cycle single-gated and delegates external checks to their owning stages', async () => {
    const runbook = await readFile(path.resolve('docs/RELEASE.md'), 'utf8');
    expect(runbook.match(/^pnpm verify$/gmu)).toHaveLength(1);
    expect(runbook).toContain('`pnpm verify` is the complete pre-release gate.');
    expect(runbook).toContain('do not run its constituent checks again');
    expect(runbook).toContain('do not duplicate it with a second download or isolated install');
    expect(runbook).toContain(
      'gh workflow run publish-npm.yml --ref main -f tag=v0.4.4 -f sha256="$candidate_sha256"',
    );
    expect(runbook).toContain('gh run watch "<databaseId>" --exit-status');
    expect(runbook).toContain('npm view agentic-report dist-tags version --json');
    expect(runbook).toContain('pnpm deploy:prod');
    expect(runbook).toContain('After a healthy deploy, perform one public smoke test');
    expect(runbook).toContain('Repeat only the affected gate and every later stage.');
    expect(runbook).not.toContain('npm publish ');
    expect(runbook).not.toContain('## Prove real registry npx');
    expect(runbook).not.toContain('shasum -a 256');
    expect(runbook).toContain('`[Made with Moira](https://moira-mcp.com/)`.');
  });

  it('labels every packaged example as fictional before its first evidence claims', async () => {
    const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8')) as {
      readonly examples: readonly {
        readonly id: string;
        readonly path: string;
        readonly entry: string;
      }[];
    };
    expect(manifest.examples).toHaveLength(17);
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
