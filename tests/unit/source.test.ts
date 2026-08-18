import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadSource } from '../../src/source/load-source.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('loadSource', () => {
  it('merges manifest, frontmatter, and confined Markdown partials', async () => {
    const workspace = await trackedWorkspace('source');
    await mkdir(path.join(workspace, 'partials'));
    await writeFile(
      path.join(workspace, 'agentic-report.yaml'),
      'description: From manifest\noutput:\n  maxInlineBytes: 1000\n',
    );
    await writeFile(
      path.join(workspace, 'partials', 'summary.md'),
      '## Included section\nDetails.\n',
    );
    await writeFile(
      path.join(workspace, 'report.md'),
      '---\ntitle: Source title\n---\n# Heading\n{{include: partials/summary.md}}\n',
    );

    const source = await loadSource(workspace);

    expect(source.manifest.title).toBe('Source title');
    expect(source.manifest.description).toBe('From manifest');
    expect(source.manifest.output.maxInlineBytes).toBe(1000);
    expect(source.markdown).toContain('## Included section');
    expect(source.sourceFiles).toEqual(
      expect.arrayContaining([
        path.join(workspace, 'report.md'),
        path.join(workspace, 'agentic-report.yaml'),
        path.join(workspace, 'partials', 'summary.md'),
      ]),
    );
  });

  it('rejects non-object metadata without silently replacing it with defaults', async () => {
    const manifestWorkspace = await trackedWorkspace('invalid-manifest-shape');
    const rootManifestWorkspace = await trackedWorkspace('invalid-root-manifest-shape');
    const frontmatterWorkspace = await trackedWorkspace('invalid-frontmatter-output');
    const manifestPath = path.join(manifestWorkspace, 'agentic-report.yaml');
    const frontmatterPath = path.join(frontmatterWorkspace, 'report.md');
    await writeFile(path.join(manifestWorkspace, 'report.md'), '# Report\n');
    await writeFile(manifestPath, 'output: not-an-object\n');
    const rootManifestPath = path.join(rootManifestWorkspace, 'agentic-report.yaml');
    await writeFile(path.join(rootManifestWorkspace, 'report.md'), '# Report\n');
    await writeFile(rootManifestPath, '- not\n- an\n- object\n');
    await writeFile(frontmatterPath, '---\noutput: not-an-object\n---\n# Report\n');

    await expect(loadSource(manifestWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: { file: manifestPath, line: 1, column: 1, endLine: 1 },
      },
    });
    await expect(loadSource(frontmatterWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: { file: frontmatterPath, line: 2, column: 1, endLine: 2 },
      },
    });
    await expect(loadSource(rootManifestWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: { file: rootManifestPath, line: 1, column: 1, endLine: 1 },
      },
    });
  });

  it('returns an authored range for malformed frontmatter syntax', async () => {
    const workspace = await trackedWorkspace('malformed-frontmatter');
    const entryPath = path.join(workspace, 'report.md');
    await writeFile(entryPath, '---\ntitle: [\n---\n# Report\n');

    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'FRONTMATTER_READ_FAILED',
        source: {
          file: entryPath,
          line: expect.any(Number),
          column: expect.any(Number),
          endLine: expect.any(Number),
          endColumn: expect.any(Number),
        },
      },
    });
  });

  it('maps manifest and frontmatter validation failures to the authored field range', async () => {
    const manifestWorkspace = await trackedWorkspace('manifest-validation-location');
    const frontmatterWorkspace = await trackedWorkspace('frontmatter-validation-location');
    const manifestPath = path.join(manifestWorkspace, 'agentic-report.yaml');
    const frontmatterPath = path.join(frontmatterWorkspace, 'report.md');
    await writeFile(path.join(manifestWorkspace, 'report.md'), '# Report\n');
    await writeFile(manifestPath, 'theme: ultraviolet\n');
    await writeFile(frontmatterPath, '---\nlanguage: invalid_tag\n---\n# Report\n');

    await expect(loadSource(manifestWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: {
          file: manifestPath,
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: expect.any(Number),
        },
      },
    });
    await expect(loadSource(frontmatterWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        source: {
          file: frontmatterPath,
          line: 2,
          column: 1,
          endLine: 2,
          endColumn: expect.any(Number),
        },
      },
    });
  });

  it('rejects a partial that escapes the source root', async () => {
    const workspace = await trackedWorkspace('escape');
    await writeFile(path.join(workspace, 'report.md'), '# Report\n{{include: ../secret.md}}\n');

    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: { code: 'PARTIAL_OUTSIDE_SOURCE' },
    });
  });

  it('normalizes URI-encoded partial references before confinement', async () => {
    const safeWorkspace = await trackedWorkspace('encoded-safe-partials');
    const traversalWorkspace = await trackedWorkspace('encoded-traversal-partial');
    const separatorWorkspace = await trackedWorkspace('encoded-separator-partial');
    const malformedWorkspace = await trackedWorkspace('malformed-uri-partial');
    await mkdir(path.join(safeWorkspace, 'partials'));
    await writeFile(path.join(safeWorkspace, 'partials', 'space name.md'), 'encoded space\n');
    await writeFile(path.join(safeWorkspace, 'partials', '100%.md'), 'literal percent\n');
    await writeFile(
      path.join(safeWorkspace, 'report.md'),
      '# Report\n{{include: partials/space%20name.md}}\n{{include: partials/100%25.md}}\n',
    );
    await writeFile(
      path.join(traversalWorkspace, 'report.md'),
      '# Report\n{{include: %2e%2e/outside.md}}\n',
    );
    await writeFile(
      path.join(separatorWorkspace, 'report.md'),
      '# Report\n{{include: partials%2Foutside.md}}\n',
    );
    await writeFile(
      path.join(malformedWorkspace, 'report.md'),
      '# Report\n{{include: partials/100%.md}}\n',
    );

    const safe = await loadSource(safeWorkspace);
    expect(safe.markdown).toContain('encoded space');
    expect(safe.markdown).toContain('literal percent');
    await expect(loadSource(traversalWorkspace)).rejects.toMatchObject({
      diagnostic: { code: 'PARTIAL_OUTSIDE_SOURCE' },
    });
    await expect(loadSource(separatorWorkspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'PARTIAL_OUTSIDE_SOURCE',
        details: { reference: 'partials%2Foutside.md' },
      },
    });
    await expect(loadSource(malformedWorkspace)).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_LOCAL_REFERENCE' },
    });
  });

  it('rejects recursive partial includes', async () => {
    const workspace = await trackedWorkspace('cycle');
    await mkdir(path.join(workspace, 'partials'));
    await writeFile(path.join(workspace, 'report.md'), '# Report\n{{include: partials/a.md}}\n');
    await writeFile(path.join(workspace, 'partials', 'a.md'), '{{include: partials/b.md}}\n');
    await writeFile(path.join(workspace, 'partials', 'b.md'), '{{include: partials/a.md}}\n');

    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: { code: 'PARTIAL_CYCLE' },
    });
  });

  it('returns an actionable input diagnostic for a missing partial', async () => {
    const workspace = await trackedWorkspace('missing-partial');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n{{include: partials/missing.md}}\n',
    );

    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'PARTIAL_READ_FAILED',
        remediation: 'Fix the partial path or add the missing .md file under the source directory.',
        source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
        details: { reference: 'partials/missing.md' },
      },
    });
  });

  it('rejects a partial symlink whose canonical target escapes the source root', async () => {
    const workspace = await trackedWorkspace('partial-symlink');
    const outside = await trackedWorkspace('outside-partial');
    await mkdir(path.join(workspace, 'partials'));
    await writeFile(path.join(outside, 'outside.md'), 'outside source bytes\n');
    await symlink(path.join(outside, 'outside.md'), path.join(workspace, 'partials', 'outside.md'));
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n{{include: partials/outside.md}}\n',
    );

    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: { code: 'PARTIAL_OUTSIDE_SOURCE' },
    });
  });

  it('rejects entry and manifest symlinks whose canonical targets escape a source directory', async () => {
    const entryWorkspace = await trackedWorkspace('entry-symlink');
    const manifestWorkspace = await trackedWorkspace('manifest-symlink');
    const outside = await trackedWorkspace('outside-metadata');
    await writeFile(path.join(outside, 'outside.md'), '# Outside\n');
    await writeFile(path.join(outside, 'outside.yaml'), 'title: Outside\n');
    await symlink(path.join(outside, 'outside.md'), path.join(entryWorkspace, 'report.md'));
    await writeFile(path.join(manifestWorkspace, 'report.md'), '# Local\n');
    await symlink(
      path.join(outside, 'outside.yaml'),
      path.join(manifestWorkspace, 'agentic-report.yaml'),
    );

    await expect(loadSource(entryWorkspace)).rejects.toMatchObject({
      diagnostic: { code: 'SOURCE_ENTRY_OUTSIDE_SOURCE' },
    });
    await expect(loadSource(manifestWorkspace)).rejects.toMatchObject({
      diagnostic: { code: 'MANIFEST_OUTSIDE_SOURCE' },
    });
  });
});

async function trackedWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  return workspace;
}
