import { createHash } from 'node:crypto';
import { link, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildReportOptions, Diagnostic } from '../../src/contracts.js';
import { type AgenticReportError, exitCodeForDiagnostic } from '../../src/diagnostics.js';
import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
const publicationControl = vi.hoisted(() => ({
  failStagedWriteFor: undefined as string | undefined,
  failDirectoryWriteFor: undefined as string | undefined,
  failRenameTo: undefined as string | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...arguments_: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...arguments_);
      const target = String(arguments_[0]);
      if (
        publicationControl.failStagedWriteFor === undefined ||
        !isStagingPathFor(target, publicationControl.failStagedWriteFor)
      ) {
        return handle;
      }
      return {
        writeFile: async (contents: string) => {
          await handle.writeFile(contents.slice(0, 32), 'utf8');
          throw Object.assign(new Error('injected staged write failure'), { code: 'EIO' });
        },
        close: async () => await handle.close(),
      } as unknown as Awaited<ReturnType<typeof actual.open>>;
    },
    writeFile: async (...arguments_: Parameters<typeof actual.writeFile>) => {
      const target = String(arguments_[0]);
      if (
        publicationControl.failDirectoryWriteFor === undefined ||
        !isDirectoryStagingPathFor(target, publicationControl.failDirectoryWriteFor)
      ) {
        return await actual.writeFile(...arguments_);
      }
      await actual.writeFile(target, Buffer.from('partial staged directory output'));
      throw Object.assign(new Error('injected directory write failure'), { code: 'EIO' });
    },
    rename: async (...arguments_: Parameters<typeof actual.rename>) => {
      if (
        publicationControl.failRenameTo !== undefined &&
        path.resolve(String(arguments_[1])) === publicationControl.failRenameTo
      ) {
        throw Object.assign(new Error('injected publication rename failure'), { code: 'EIO' });
      }
      return await actual.rename(...arguments_);
    },
  };
});

afterEach(async () => {
  publicationControl.failStagedWriteFor = undefined;
  publicationControl.failDirectoryWriteFor = undefined;
  publicationControl.failRenameTo = undefined;
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('buildReport', () => {
  it('builds a self-contained HTML file with an embedded binary image', async () => {
    const workspace = await fixtureWorkspace('single');
    const output = path.join(workspace, 'output', 'report.html');

    const result = await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');

    expect(result.format).toBe('single-file');
    expect(result.embeddedAssets).toBeGreaterThanOrEqual(3);
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).toContain('Included analysis');
    const inlineRuntime = extractInlineRuntime(html);
    expect(extractContentSecurityPolicy(html)).toEqual([
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      'img-src data:',
      'font-src data:',
      "style-src 'unsafe-inline'",
      `script-src 'sha256-${createHash('sha256').update(inlineRuntime).digest('base64')}'`,
    ]);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('onerror=');
  });

  it('produces identical HTML and hashes for identical sources', async () => {
    const workspace = await fixtureWorkspace('deterministic');
    const firstOutput = path.join(workspace, 'first.html');
    const secondOutput = path.join(workspace, 'second.html');

    const first = await buildReport({ input: workspace, output: firstOutput });
    const second = await buildReport({ input: workspace, output: secondOutput });

    expect(second.contentHash).toBe(first.contentHash);
    expect(await readFile(secondOutput, 'utf8')).toBe(await readFile(firstOutput, 'utf8'));
  });

  it('reports a structured warning when the inline size threshold is exceeded', async () => {
    const workspace = await fixtureWorkspace('size-warning');
    await writeFile(path.join(workspace, 'agentic-report.yaml'), 'output:\n  maxInlineBytes: 1\n');

    const result = await buildReport({
      input: workspace,
      output: path.join(workspace, 'report.html'),
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
      }),
    );
  });

  it('counts serialized data URLs and the embedded runtime for single-file output', async () => {
    const encodedWorkspace = await trackedWorkspace('encoded-size-warning');
    const [styles, runtime] = await Promise.all([
      readFile(path.resolve('dist/browser/document.css')),
      readFile(path.resolve('dist/browser/runtime.js')),
    ]);
    const payload = Buffer.alloc(6_000, 0x61);
    const rawTotal = styles.byteLength + runtime.byteLength + payload.byteLength;
    const encodedTotal =
      styles.byteLength +
      runtime.byteLength +
      Buffer.byteLength(`data:application/octet-stream;base64,${payload.toString('base64')}`);
    const threshold = Math.floor((rawTotal + encodedTotal) / 2);
    await writeFile(path.join(encodedWorkspace, 'payload.bin'), payload);
    await writeFile(
      path.join(encodedWorkspace, 'report.md'),
      [
        '---',
        'title: Encoded size',
        'output:',
        `  maxInlineBytes: ${threshold}`,
        '---',
        '# Report',
        '::asset[payload]{src="payload.bin"}',
      ].join('\n'),
    );

    const encodedResult = await buildReport({
      input: encodedWorkspace,
      output: path.join(encodedWorkspace, 'report.html'),
    });
    expect(rawTotal).toBeLessThan(threshold);
    expect(encodedResult.warnings).toContainEqual(
      expect.objectContaining({ code: 'INLINE_SIZE_THRESHOLD_EXCEEDED' }),
    );
  });

  it('counts an inline font data URL exactly once through its serialized stylesheet', async () => {
    const workspace = await trackedWorkspace('font-size-accounting');
    await writeFile(path.join(workspace, 'reader.woff2'), Buffer.from('font-contents'));
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Font accounting\n::font{src="reader.woff2" family="Reader"}\n',
    );
    const probeOutput = path.join(workspace, 'probe.html');
    const probe = await buildReport({ input: workspace, output: probeOutput });
    const probeHtml = await readFile(probeOutput, 'utf8');
    const exactBundledBytes =
      Buffer.byteLength(extractInlineStyles(probeHtml)) +
      Buffer.byteLength(extractInlineRuntime(probeHtml));
    expect(probe.warnings).toEqual([]);
    expect(probeHtml.match(/data:font\/woff2;base64,/gu)).toHaveLength(1);

    await writeFile(
      path.join(workspace, 'agentic-report.yaml'),
      `output:\n  maxInlineBytes: ${exactBundledBytes}\n`,
    );
    const exact = await buildReport({
      input: workspace,
      output: path.join(workspace, 'exact.html'),
    });
    expect(exact.warnings).toEqual([]);

    await writeFile(
      path.join(workspace, 'agentic-report.yaml'),
      `output:\n  maxInlineBytes: ${exactBundledBytes - 1}\n`,
    );
    const exceeded = await buildReport({
      input: workspace,
      output: path.join(workspace, 'exceeded.html'),
    });
    expect(exceeded.warnings).toContainEqual(
      expect.objectContaining({
        code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
        details: { bundledBytes: exactBundledBytes, threshold: exactBundledBytes - 1 },
      }),
    );
  });

  it('builds a directory artifact with deterministic external assets', async () => {
    const workspace = await fixtureWorkspace('directory');
    const output = path.join(workspace, 'artifact');
    await mkdir(output);

    const result = await buildReport({
      input: workspace,
      output,
      format: 'directory',
    });
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const assets = await readdir(path.join(output, 'assets'));

    expect(result.externalAssets).toBeGreaterThanOrEqual(3);
    expect(assets.some((file) => /^pixel\.[a-f0-9]{12}\.png$/.test(file))).toBe(true);
    const runtimeName = requireMatchingAsset(assets, /^runtime\.[a-f0-9]{12}\.js$/u);
    const styleName = requireMatchingAsset(assets, /^document\.[a-f0-9]{12}\.css$/u);
    await expectContentAddressedAsset(path.join(output, 'assets'), runtimeName);
    await expectContentAddressedAsset(path.join(output, 'assets'), styleName);
    expect(html).toContain(`src="assets/${runtimeName}"`);
    expect(html).toContain(`href="assets/${styleName}"`);
    expect(extractContentSecurityPolicy(html)).toEqual([
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "img-src data: 'self'",
      "font-src data: 'self'",
      "style-src 'unsafe-inline' 'self'",
      "script-src 'self'",
    ]);
    expect(html).not.toContain('data:image/png;base64,');
  });

  it('uses manifest format by default and lets an explicit option override it', async () => {
    const workspace = await fixtureWorkspace('manifest-directory');
    await writeFile(path.join(workspace, 'agentic-report.yaml'), 'output:\n  format: directory\n');
    const directoryOutput = path.join(workspace, 'from-manifest');

    const fromManifest = await buildReport({ input: workspace, output: directoryOutput });
    expect(fromManifest).toMatchObject({
      format: 'directory',
      outputPath: path.join(directoryOutput, 'index.html'),
    });
    expect(await readFile(fromManifest.outputPath, 'utf8')).toContain(
      '<script src="assets/runtime.',
    );

    const overrideOutput = path.join(workspace, 'override.html');
    const fromOverride = await buildReport({
      input: workspace,
      output: overrideOutput,
      format: 'single-file',
    });
    expect(fromOverride).toMatchObject({ format: 'single-file', outputPath: overrideOutput });
    expect(await readFile(overrideOutput, 'utf8')).toContain('<script>');
  });

  it('rejects an invalid runtime API format before source reads or output mutation', async () => {
    const workspace = await trackedWorkspace('invalid-api-format');
    const assets = path.join(workspace, 'assets');
    const sentinel = path.join(assets, 'sentinel.txt');
    const output = path.join(workspace, 'report-output');
    await mkdir(assets);
    await writeFile(sentinel, 'preserve me');
    const invalidOptions = {
      input: path.join(workspace, 'missing-source.md'),
      output,
      format: 'bogus',
    } as unknown as BuildReportOptions;

    await expect(buildReport(invalidOptions)).rejects.toMatchObject({
      diagnostic: {
        level: 'error',
        code: 'OUTPUT_FORMAT_INVALID',
        remediation: 'Use one of: single-file, directory.',
        details: { supportedFormats: ['single-file', 'directory'] },
      },
    });
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(assets)).toEqual(['sentinel.txt']);
    expect(await readFile(sentinel, 'utf8')).toBe('preserve me');
  });

  it('changes the content-addressed stylesheet name when generated CSS changes', async () => {
    const plainWorkspace = await fixtureWorkspace('plain-styles');
    const fontWorkspace = await fixtureWorkspace('font-styles');
    await writeFile(path.join(fontWorkspace, 'reader.woff2'), Buffer.from('font-contents'));
    await writeFile(
      path.join(fontWorkspace, 'report.md'),
      '# Font styles\n::font{src="reader.woff2" family="Reader"}\n',
    );
    const plainOutput = path.join(plainWorkspace, 'artifact');
    const fontOutput = path.join(fontWorkspace, 'artifact');
    await buildReport({ input: plainWorkspace, output: plainOutput, format: 'directory' });
    await buildReport({ input: fontWorkspace, output: fontOutput, format: 'directory' });
    const plainStyle = requireMatchingAsset(
      await readdir(path.join(plainOutput, 'assets')),
      /^document\.[a-f0-9]{12}\.css$/u,
    );
    const fontStyle = requireMatchingAsset(
      await readdir(path.join(fontOutput, 'assets')),
      /^document\.[a-f0-9]{12}\.css$/u,
    );

    expect(fontStyle).not.toBe(plainStyle);
    await expectContentAddressedAsset(path.join(plainOutput, 'assets'), plainStyle);
    await expectContentAddressedAsset(path.join(fontOutput, 'assets'), fontStyle);
  });

  it('rejects output collisions with every source-file class without changing contents', async () => {
    const workspace = await trackedWorkspace('output-collisions');
    await mkdir(path.join(workspace, 'partials'));
    const entryPath = path.join(workspace, 'report.md');
    const manifestPath = path.join(workspace, 'agentic-report.yaml');
    const partialPath = path.join(workspace, 'partials', 'section.md');
    const assetPath = path.join(workspace, 'asset.txt');
    await writeFile(
      entryPath,
      '# Collision report\n{{include: partials/section.md}}\n::asset[data]{src="asset.txt"}\n',
    );
    await writeFile(manifestPath, 'description: Collision fixture\n');
    await writeFile(partialPath, '');
    await writeFile(assetPath, 'asset sentinel\n');
    const originals = new Map(
      await Promise.all(
        [entryPath, manifestPath, partialPath, assetPath].map(
          async (file) => [file, await readFile(file, 'utf8')] as const,
        ),
      ),
    );

    for (const format of ['single-file', 'directory'] as const) {
      for (const output of originals.keys()) {
        await expect(buildReport({ input: workspace, output, format })).rejects.toMatchObject({
          diagnostic: { code: 'OUTPUT_COLLIDES_WITH_SOURCE' },
        });
        expect(await readFile(output, 'utf8')).toBe(originals.get(output));
      }
    }
  });

  it('rejects hard-link aliases of the entry and a local asset without changing either source', async () => {
    const entryWorkspace = await trackedWorkspace('entry-hard-link-collision');
    const entry = path.join(entryWorkspace, 'report.md');
    const entryAlias = path.join(entryWorkspace, 'entry-alias.html');
    await writeFile(entry, '# Entry source\n');
    await link(entry, entryAlias);

    for (const format of ['single-file', 'directory'] as const) {
      await expect(
        buildReport({ input: entryWorkspace, output: entryAlias, format }),
      ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_COLLIDES_WITH_SOURCE' } });
    }
    await expect(readFile(entry, 'utf8')).resolves.toBe('# Entry source\n');

    const assetWorkspace = await trackedWorkspace('asset-hard-link-collision');
    const asset = path.join(assetWorkspace, 'evidence.txt');
    const assetAlias = path.join(assetWorkspace, 'asset-alias.html');
    await writeFile(asset, 'asset source bytes\n');
    await writeFile(
      path.join(assetWorkspace, 'report.md'),
      '# Asset source\n::asset[evidence]{src="evidence.txt"}\n',
    );
    await link(asset, assetAlias);

    for (const format of ['single-file', 'directory'] as const) {
      await expect(
        buildReport({ input: assetWorkspace, output: assetAlias, format }),
      ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_COLLIDES_WITH_SOURCE' } });
    }
    await expect(readFile(asset, 'utf8')).resolves.toBe('asset source bytes\n');
  });

  it('keeps directory target diagnostics and contents for non-source file and non-empty directory targets', async () => {
    const workspace = await trackedWorkspace('directory-target-diagnostics');
    await writeFile(path.join(workspace, 'report.md'), '# Directory target diagnostics\n');

    const fileTarget = path.join(workspace, 'ordinary-file.txt');
    await writeFile(fileTarget, 'file sentinel\n');
    await expect(
      buildReport({ input: workspace, output: fileTarget, format: 'directory' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_DIRECTORY_INVALID' } });
    await expect(readFile(fileTarget, 'utf8')).resolves.toBe('file sentinel\n');

    const directoryTarget = path.join(workspace, 'non-empty-directory');
    const directorySentinel = path.join(directoryTarget, 'sentinel.txt');
    await mkdir(directoryTarget);
    await writeFile(directorySentinel, 'directory sentinel\n');
    await expect(
      buildReport({ input: workspace, output: directoryTarget, format: 'directory' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_DIRECTORY_NOT_EMPTY' } });
    await expect(readFile(directorySentinel, 'utf8')).resolves.toBe('directory sentinel\n');
  });

  it.each(['staged-write', 'rename'] as const)(
    'preserves an existing single-file artifact when %s publication fails',
    async (failure) => {
      const workspace = await fixtureWorkspace(`single-file-${failure}`);
      const output = path.join(workspace, 'published.html');
      await writeFile(output, 'previous authoritative artifact\n');
      if (failure === 'staged-write') publicationControl.failStagedWriteFor = output;
      else publicationControl.failRenameTo = output;

      const error = await buildReport({ input: workspace, output, share: true }).catch(
        (reason: unknown) => reason,
      );
      expect(error).toMatchObject({ diagnostic: { code: 'OUTPUT_PUBLICATION_FAILED' } });
      expect(JSON.stringify(error)).not.toContain('path-sentinel');
      await expect(readFile(output, 'utf8')).resolves.toBe('previous authoritative artifact\n');
      expect((await readdir(workspace)).some((name) => name.includes('.agentic-report-'))).toBe(
        false,
      );

      publicationControl.failStagedWriteFor = undefined;
      publicationControl.failRenameTo = undefined;
      const retry = await buildReport({ input: workspace, output, share: true });
      expect(retry).toMatchObject({ outputPath: output, share: true });
      await expect(readFile(output, 'utf8')).resolves.toContain('<!doctype html>');
    },
  );

  it('redacts credential-bearing publication and staging paths from structured failures', async () => {
    const workspace = await fixtureWorkspace('publication-redaction');
    const output = path.join(workspace, 'token=path-sentinel', 'report.html');
    publicationControl.failStagedWriteFor = output;

    const error = await buildReport({ input: workspace, output }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({
      diagnostic: {
        code: 'OUTPUT_PUBLICATION_FAILED',
        details: { outputPath: expect.stringContaining('token=[REDACTED]') },
      },
    });
    expect(JSON.stringify(error)).not.toContain('path-sentinel');
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes compiler-owned staging output after failure and allows an immediate retry', async () => {
    const workspace = await trackedWorkspace('directory-transaction');
    const output = path.join(workspace, 'artifact');
    await writeFile(path.join(workspace, 'valid.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n![valid](valid.svg)\n![missing](missing.svg)\n',
    );

    await expect(
      buildReport({ input: workspace, output, format: 'directory', share: true }),
    ).rejects.toMatchObject({ diagnostic: { code: 'ASSET_READ_FAILED' } });
    await expect(readdir(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(workspace)).some((name) => name.includes('.agentic-report-'))).toBe(
      false,
    );

    await writeFile(
      path.join(workspace, 'missing.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const result = await buildReport({
      input: workspace,
      output,
      format: 'directory',
    });
    expect(result.outputPath).toBe(path.join(output, 'index.html'));
    expect(await readFile(result.outputPath, 'utf8')).toMatch(
      /<h1[^>]*id="report"[^>]*>Report<\/h1>/u,
    );
  });

  it('removes a partially written directory stage and leaves a missing destination absent', async () => {
    const workspace = await fixtureWorkspace('directory-write-failure');
    const output = path.join(workspace, 'artifact');
    publicationControl.failDirectoryWriteFor = output;

    await expect(
      buildReport({ input: workspace, output, format: 'directory' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_PUBLICATION_FAILED' } });
    await expect(readdir(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(workspace)).some((name) => name.includes('.agentic-report-'))).toBe(
      false,
    );

    publicationControl.failDirectoryWriteFor = undefined;
    const retry = await buildReport({
      input: workspace,
      output,
      format: 'directory',
      share: true,
    });
    expect(retry.share).toBe(true);
    await expect(readFile(retry.outputPath, 'utf8')).resolves.toContain('<!doctype html>');
  });

  it('restores an existing empty directory when publication rename fails', async () => {
    const workspace = await fixtureWorkspace('directory-rename-failure');
    const output = path.join(workspace, 'artifact');
    await mkdir(output);
    publicationControl.failRenameTo = output;

    await expect(
      buildReport({ input: workspace, output, format: 'directory', share: true }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_PUBLICATION_FAILED' } });
    expect(await readdir(output)).toEqual([]);
    expect((await readdir(workspace)).some((name) => name.includes('.agentic-report-'))).toBe(
      false,
    );

    publicationControl.failRenameTo = undefined;
    const retry = await buildReport({
      input: workspace,
      output,
      format: 'directory',
      share: true,
    });
    expect(retry.share).toBe(true);
    await expect(readFile(retry.outputPath, 'utf8')).resolves.toContain('<!doctype html>');
  });

  it('rejects remote image fetching', async () => {
    const workspace = await trackedWorkspace('remote');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n![remote](https://example.com/a.png)\n',
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REMOTE_ASSET_BLOCKED' } });
  });

  it('embeds local assets whose Unicode paths contain spaces', async () => {
    const workspace = await trackedWorkspace('unicode');
    const assetName = 'схема с пробелом.png';
    await writeFile(path.join(workspace, assetName), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(workspace, 'report.md'), `# Report\n![diagram](<${assetName}>)\n`);
    const output = path.join(workspace, 'report.html');

    await buildReport({ input: workspace, output });

    expect(await readFile(output, 'utf8')).toContain('data:image/png;base64,');
  });

  it('returns an actionable diagnostic for a missing local asset', async () => {
    const workspace = await trackedWorkspace('missing-asset');
    await writeFile(path.join(workspace, 'report.md'), '# Report\n![missing](not-here.png)\n');

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'ASSET_READ_FAILED',
        remediation: 'Fix the asset path or add the missing file under the source directory.',
        source: { file: path.join(workspace, 'report.md'), line: 2, column: 1 },
        details: { reference: 'not-here.png' },
      },
    });
  });

  it('rejects an asset symlink whose canonical target escapes the source root', async () => {
    const workspace = await trackedWorkspace('asset-symlink');
    const outside = await trackedWorkspace('outside-asset');
    await writeFile(path.join(outside, 'outside.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await symlink(path.join(outside, 'outside.png'), path.join(workspace, 'outside.png'));
    await writeFile(path.join(workspace, 'report.md'), '# Report\n![outside](outside.png)\n');

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'ASSET_OUTSIDE_SOURCE' } });
  });

  it('renders semantic primitives, a downloadable asset, and a MIME-qualified font', async () => {
    const workspace = await trackedWorkspace('semantic');
    await writeFile(path.join(workspace, 'data.json'), '{"portable":true}\n');
    await writeFile(path.join(workspace, 'report.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
    await writeFile(
      path.join(workspace, 'report.md'),
      [
        '---',
        'title: Semantic report',
        'language: ru',
        '---',
        '# Report',
        ':::callout{title="Важно" kind="warning"}',
        'Декларативный блок.',
        ':::',
        ':::demo{title="Counter" start="2" step="3"}',
        'Safe built-in interaction.',
        ':::',
        '::::cards',
        ':::card{title="Portable"}',
        'One file.',
        ':::',
        '::::',
        '::asset[Download data]{src="data.json"}',
        '::asset{src="data.json"}',
        '::font{src="report.woff2" family="Report Sans"}',
      ].join('\n'),
    );
    const output = path.join(workspace, 'report.html');

    const result = await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');

    expect(result.embeddedAssets).toBeGreaterThanOrEqual(4);
    expect(html).toContain('<html lang="ru"');
    expect(html).toContain('class="semantic-callout"');
    expect(html).toContain('class="semantic-demo"');
    expect(html).toContain('class="semantic-cards"');
    expect(html).toContain('data-demo-counter');
    expect(html).toContain('data:application/json;base64,');
    expect(html).toContain('class="semantic-asset"');
    expect(html).toContain('>Скачать data.json</a>');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).toContain('@font-face');

    const directoryOutput = path.join(workspace, 'directory-artifact');
    await buildReport({
      input: workspace,
      output: directoryOutput,
      format: 'directory',
    });
    const directoryHtml = await readFile(path.join(directoryOutput, 'index.html'), 'utf8');
    const directoryAssets = await readdir(path.join(directoryOutput, 'assets'));
    const fontName = directoryAssets.find((name) => /^report\.[a-f0-9]{12}\.woff2$/.test(name));
    const dataName = directoryAssets.find((name) => /^data\.[a-f0-9]{12}\.json$/.test(name));
    const styleName = directoryAssets.find((name) => /^document\.[a-f0-9]{12}\.css$/.test(name));
    expect(fontName).toBeDefined();
    expect(dataName).toBeDefined();
    expect(styleName).toBeDefined();
    expect(directoryHtml).toContain(`href="assets/${dataName}"`);
    expect(await readFile(path.join(directoryOutput, 'assets', styleName ?? ''), 'utf8')).toContain(
      `url("./${fontName}")`,
    );
  });

  it('rejects unknown directives instead of silently dropping content', async () => {
    const workspace = await trackedWorkspace('unknown-directive');
    await writeFile(path.join(workspace, 'report.md'), '# Report\n:::unknown\nContent\n:::\n');

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'UNSUPPORTED_DIRECTIVE' } });
  });

  it('requires a registered term once per section instead of at every mention', async () => {
    const workspace = await trackedWorkspace('glossary-introduction');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const source = (...body: readonly string[]): string =>
      [
        '---',
        'contractVersion: 1',
        'title: Словарь',
        'language: ru',
        '---',
        '',
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ...body,
      ].join('\n');
    const refused = async (): Promise<Diagnostic | undefined> =>
      await buildReport({ input: workspace, output }).then(
        () => undefined,
        (error: unknown) => (error as AgenticReportError).diagnostic,
      );

    // Accepted: the section introduces the term once, later mentions stay ordinary prose.
    await writeFile(
      entry,
      source('## Раздел', '', 'Тут :term[спека]{key="spec"} есть, а вторая спека нет.'),
    );
    await expect(buildReport({ input: workspace, output })).resolves.toMatchObject({
      format: 'single-file',
    });

    // Order matters: an unmarked first mention is still refused even when a later one is marked, so
    // a check that merely looks for "any marked reference in the document" cannot pass here.
    await writeFile(
      entry,
      source('## Раздел', '', 'Тут спека без разметки, а потом :term[спека]{key="spec"}.'),
    );
    expect((await refused())?.code).toBe('UNMARKED_GLOSSARY_TERM');

    // Every section is introduced on its own.
    await writeFile(
      entry,
      source(
        '## Свод',
        '',
        ':::section{title="Первый"}',
        'Тут :term[спека]{key="spec"} есть.',
        ':::',
        '',
        ':::section{title="Второй"}',
        'А тут спека без разметки.',
        ':::',
      ),
    );
    expect((await refused())?.code).toBe('UNMARKED_GLOSSARY_TERM');

    // Nothing was relaxed for a term that is never introduced at all.
    await writeFile(entry, source('## Раздел', '', 'Совсем без разметки: спека.'));
    expect((await refused())?.code).toBe('UNMARKED_GLOSSARY_TERM');

    // An inflected form nobody declared stays outside the check: the package does not inflect words
    // itself, so it cannot know that this spelling belongs to the term.
    await writeFile(entry, source('## Раздел', '', 'Упомянуты спеки без разметки.'));
    await expect(buildReport({ input: workspace, output })).resolves.toMatchObject({
      format: 'single-file',
    });
  });

  it('finds the declared spellings of a glossary term and keeps the one the sentence used', async () => {
    const workspace = await trackedWorkspace('glossary-declared-forms');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const source = (definition: string, ...body: readonly string[]): string =>
      [
        '---',
        'contractVersion: 1',
        'title: Словарь',
        'language: ru',
        '---',
        '',
        definition,
        'Согласованное требование.',
        ':::',
        '',
        ...body,
      ].join('\n');
    const declared = ':::glossary{key="spec" term="спека" forms="спеки, спеке"}';
    const refused = async (): Promise<Diagnostic | undefined> =>
      await buildReport({ input: workspace, output }).then(
        () => undefined,
        (error: unknown) => (error as AgenticReportError).diagnostic,
      );

    // A declared form is now a first mention, and the proposed replacement keeps the spelling the
    // sentence used rather than the dictionary headword — the reader would otherwise find a word in
    // the wrong case inserted into their own text.
    await writeFile(entry, source(declared, '## Раздел', '', 'Упомянуты спеки без разметки.'));
    const inflected = await refused();
    expect(inflected?.code).toBe('UNMARKED_GLOSSARY_TERM');
    expect(inflected?.remediation).toContain(':term[спеки]{key="spec"}');

    // Same stem, not declared: the author decides what counts as a form, so `спектр` is prose.
    await writeFile(entry, source(declared, '## Раздел', '', 'Тут спектр и спекуляция.'));
    await expect(buildReport({ input: workspace, output })).resolves.toMatchObject({
      format: 'single-file',
    });

    // One spelling claimed by two definitions is refused: the product would otherwise decide
    // silently whose first mention an occurrence is.
    await writeFile(
      entry,
      [
        source(declared, '## Раздел', '', 'Текст без упоминаний.'),
        '',
        ':::glossary{key="other" term="другое" forms="спеки"}',
        'Другое определение.',
        ':::',
      ].join('\n'),
    );
    expect((await refused())?.code).toBe('DUPLICATE_GLOSSARY_DEFINITION');
  });

  it('answers with every independent rule of one element and stays silent below a refused one', async () => {
    const workspace = await trackedWorkspace('authored-rules');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const source = (...body: readonly string[]): string =>
      ['---', 'contractVersion: 1', 'title: Правила', 'language: ru', '---', '', ...body].join(
        '\n',
      );
    const refused = async (): Promise<Diagnostic | undefined> =>
      await buildReport({ input: workspace, output }).then(
        () => undefined,
        (error: unknown) => (error as AgenticReportError).diagnostic,
      );

    // Two independent rules over ONE element: the option count and the numeric bounds of the same
    // question. Neither answer needs the other, so both belong to one run. This is the case a phase
    // built on thrown failures cannot report, however finely its subjects are split.
    await writeFile(
      entry,
      source(
        '# Свод',
        '',
        '::::response{title="Форма" id="one"}',
        ':::question{id="a" kind="single" title="Первый" prompt="Выберите" min="1"}',
        '::option{id="only" label="A"}',
        ':::',
        '::::',
      ),
    );
    const independent = await refused();
    expect([independent?.message, ...(independent?.related ?? []).map((e) => e.message)]).toEqual([
      'single requires 2 to 20 options.',
      'Numeric bounds are supported only by number questions, not single.',
    ]);

    // The same holds for the directive node itself, not only for the subjects inside it: an unknown
    // attribute is an unknown attribute wherever the node sits, so placement and attributes answer
    // together. This is the part of the phase that stayed on thrown failures the longest.
    await writeFile(
      entry,
      source('# Свод', '', '::decision-option{id="ship" label="Ship" bogus="x"}'),
    );
    const node = await refused();
    expect([node?.code, ...(node?.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_DIRECTIVE_PLACEMENT',
      'UNKNOWN_DIRECTIVE_ATTRIBUTE',
    ]);

    // A label required by the directive is independent of its attributes in the same way.
    await writeFile(
      entry,
      source('# Свод', '', ':::actions', '::action{href="#a" bogus="x"}', ':::'),
    );
    const action = await refused();
    expect([action?.code, ...(action?.related ?? []).map((e) => e.code)]).toEqual([
      'UNKNOWN_DIRECTIVE_ATTRIBUTE',
      'DIRECTIVE_LABEL_REQUIRED',
    ]);

    // The reverse side: a rule whose declared dependency refused says nothing. The bucket set of
    // this question is wrong, so the reference an item makes into it is not an authored fact.
    await writeFile(
      entry,
      source(
        '# Свод',
        '',
        '::::response{title="Форма" id="one"}',
        ':::question{id="a" kind="bucket" title="Первый" prompt="Разложите"}',
        '::bucket{id="b1" label="Один"}',
        '::item{id="i1" label="Раз" note="Раз." meta="Один" href="#one" bucket="missing-one"}',
        ':::',
        '::::',
      ),
    );
    const dependent = await refused();
    expect([dependent?.message, ...(dependent?.related ?? []).map((e) => e.message)]).toEqual([
      'Bucket questions require 2 to 5 buckets.',
    ]);
  });

  it('builds a flow whose grouping is unfinished and says what is still missing', async () => {
    const workspace = await trackedWorkspace('incomplete-grouping');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const diagram = (...body: readonly string[]): string =>
      [
        '---',
        'contractVersion: 1',
        'title: Поток',
        'language: ru',
        '---',
        '',
        '# Поток',
        '',
        ...body,
      ].join('\n');
    const ungrouped = [
      ':::diagram{title="F" description="Ungrouped flow."}',
      '::node{id="a" label="Аккаунт"}',
      '::node{id="b" label="Бюджет"}',
      '::edge{from="a" to="b" label="n"}',
      ':::',
    ];
    const oneGroup = [
      ':::diagram{title="F" description="One group." direction="right"}',
      '::group{id="g1" label="Первая"}',
      '::node{id="a" label="Аккаунт" group="g1"}',
      '::node{id="b" label="Бюджет" group="g1"}',
      '::edge{from="a" to="b" label="n"}',
      ':::',
    ];
    const twoGroups = [
      ':::diagram{title="F" description="Two groups." direction="right"}',
      '::group{id="g1" label="Первая"}',
      '::group{id="g2" label="Вторая"}',
      '::node{id="a" label="Аккаунт" group="g1"}',
      '::node{id="b" label="Бюджет" group="g2"}',
      '::edge{from="a" to="b" label="n"}',
      ':::',
    ];

    // Three observations at once per case: the outcome, the presence or absence of the warning, and
    // the nodes in the built page. The outcome alone cannot tell an accepted-with-warning flow from
    // one accepted silently.
    for (const [label, body, expected] of [
      ['ungrouped', ungrouped, []],
      ['one group', oneGroup, ['INCOMPLETE_DIAGRAM_GROUPING']],
      ['two groups', twoGroups, []],
    ] as const) {
      await writeFile(entry, diagram(...body));
      const result = await buildReport({ input: workspace, output });
      expect(
        result.warnings.map((warning) => warning.code),
        label,
      ).toEqual(expected);
      const html = await readFile(output, 'utf8');
      expect(html, label).toContain('Аккаунт');
      expect(html, label).toContain('Бюджет');
    }

    await writeFile(entry, diagram(...oneGroup));
    const warned = (await buildReport({ input: workspace, output })).warnings[0];
    expect(warned?.level).toBe('warning');
    expect(warned?.source?.file).toBe(entry);
    expect(warned?.message).toContain('2 to 3 groups');

    // Unfinished grouping does not suspend the rules around it: the warning must not end the
    // check, or a one-group flow would stop being validated for membership at all.
    await writeFile(
      entry,
      diagram(
        ':::diagram{title="F" description="One group, stray node." direction="right"}',
        '::group{id="g1" label="Первая"}',
        '::node{id="a" label="Аккаунт" group="g1"}',
        '::node{id="b" label="Бюджет"}',
        '::edge{from="a" to="b" label="n"}',
        ':::',
      ),
    );
    await expect(buildReport({ input: workspace, output })).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_VISUALIZATION_DATA',
        message: 'Every node in a grouped flow requires a group.',
      },
    });
  });

  it('reports every independent authored violation of one run and drops the dependent ones', async () => {
    const workspace = await trackedWorkspace('violation-inventory');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const frontmatter = ['---', 'contractVersion: 1', 'title: Свод', 'language: ru', '---', ''];
    const diagnosticOf = async (): Promise<Diagnostic> => {
      try {
        await buildReport({ input: workspace, output });
      } catch (error) {
        return (error as AgenticReportError).diagnostic;
      }
      throw new Error('The source was expected to be refused.');
    };

    // One violated kind repeated: the case the single-diagnostic run could not report at all.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        'Раз :foo рядом.',
        '',
        'Два :bar рядом.',
        '',
        'Три :baz рядом.',
      ].join('\n'),
    );
    const homogeneous = await diagnosticOf();
    expect(homogeneous.code).toBe('UNSUPPORTED_DIRECTIVE');
    expect(homogeneous.related?.map((entry_) => entry_.code)).toEqual([
      'UNSUPPORTED_DIRECTIVE',
      'UNSUPPORTED_DIRECTIVE',
    ]);
    expect(homogeneous.related?.map((entry_) => entry_.source?.line)).toEqual([11, 13]);
    expect(homogeneous.source?.line).toBe(9);

    // A single violation keeps the previous shape exactly: no empty inventory appears.
    await writeFile(entry, [...frontmatter, '# Свод', '', 'Раз :foo рядом.'].join('\n'));
    expect((await diagnosticOf()).related).toBeUndefined();

    // Violated kinds found by different checks, with the earliest in the source reported first even
    // though its check runs last.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        'Тут спека без разметки в первом же упоминании.',
        '',
        'Дальше :foo рядом.',
      ].join('\n'),
    );
    const mixed = await diagnosticOf();
    expect([mixed.code, ...(mixed.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'UNMARKED_GLOSSARY_TERM',
      'UNSUPPORTED_DIRECTIVE',
    ]);

    // A node whose attributes were refused must not be read again by its container: a naive
    // inventory reports INTERNAL_ERROR with exit code 3 instead of the authored violations.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::diagram{title="Flow" description="A validated edge."}',
        '::node{id="a" label="A"}',
        '::node{id="b" label="B" kind="нет-такого"}',
        '::edge{from="a" to="b" label="next"}',
        ':::',
        '',
        'Дальше :foo рядом.',
      ].join('\n'),
    );
    const dependent = await diagnosticOf();
    expect([dependent.code, ...(dependent.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_DIRECTIVE_ATTRIBUTE',
      'UNSUPPORTED_DIRECTIVE',
    ]);
    expect(exitCodeForDiagnostic(dependent)).toBe(1);
  });

  it('reports every subject a single check refuses, not the first one it meets', async () => {
    const workspace = await trackedWorkspace('violation-inventory-subjects');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    const frontmatter = ['---', 'contractVersion: 1', 'title: Свод', 'language: ru', '---', ''];
    const diagnosticOf = async (): Promise<Diagnostic> => {
      try {
        await buildReport({ input: workspace, output });
      } catch (error) {
        return (error as AgenticReportError).diagnostic;
      }
      throw new Error('The source was expected to be refused.');
    };

    // Two pie charts, each carrying two series where the shape allows one. One check meets both,
    // and they are independent of each other: the second chart is not read through the first.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        '::::chart{type="pie" title="Первый" description="Two series in a pie chart."}',
        ':::series{label="Один"}',
        '::point{label="A" value="1"}',
        ':::',
        ':::series{label="Два"}',
        '::point{label="B" value="2"}',
        ':::',
        '::::',
        '',
        '::::chart{type="pie" title="Второй" description="Two series in a pie chart."}',
        ':::series{label="Три"}',
        '::point{label="C" value="3"}',
        ':::',
        ':::series{label="Четыре"}',
        '::point{label="D" value="4"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const charts = await diagnosticOf();
    expect([charts.code, ...(charts.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);
    expect([charts.source?.line, ...(charts.related ?? []).map((e) => e.source?.line)]).toEqual([
      9, 18,
    ]);

    // The same for a check that walks prose: three sections, each leaving the term unmarked at its
    // own first mention.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::section{title="Первый"}',
        'Тут спека без разметки.',
        ':::',
        '',
        ':::section{title="Второй"}',
        'И тут спека без разметки.',
        ':::',
        '',
        ':::section{title="Третий"}',
        'И здесь спека без разметки.',
        ':::',
      ].join('\n'),
    );
    const sections = await diagnosticOf();
    expect([sections.code, ...(sections.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'UNMARKED_GLOSSARY_TERM',
      'UNMARKED_GLOSSARY_TERM',
      'UNMARKED_GLOSSARY_TERM',
    ]);

    // A term already reported unmarked in a section is answered for: its later mentions in the same
    // section repeat that refusal and stay out of the inventory.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::section{title="Первый"}',
        'Тут спека без разметки.',
        '',
        'И снова спека в том же разделе.',
        ':::',
      ].join('\n'),
    );
    const repeated = await diagnosticOf();
    expect(repeated.code).toBe('UNMARKED_GLOSSARY_TERM');
    expect(repeated.related).toBeUndefined();

    // Independent facts inside one subject are all reported: two different unmarked terms in one
    // paragraph, two undefined keys on one code fence, two malformed leads in one section, and two
    // refused questions in one form.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::glossary{key="probe" term="проба"}',
        'Наблюдение, различающее состояния.',
        ':::',
        '',
        ':::section{title="Первый"}',
        'Тут спека и проба без разметки.',
        ':::',
      ].join('\n'),
    );
    const terms = await diagnosticOf();
    expect([terms.code, ...(terms.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'UNMARKED_GLOSSARY_TERM',
      'UNMARKED_GLOSSARY_TERM',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        '```text terms="missing-one,missing-two"',
        'первый',
        '```',
      ].join('\n'),
    );
    const keys = await diagnosticOf();
    expect([keys.code, ...(keys.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'UNKNOWN_GLOSSARY_TERM',
      'UNKNOWN_GLOSSARY_TERM',
    ]);
    expect((keys.related ?? []).length + 1).toBe(2);

    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::section{title="Первый"}',
        ':::lead',
        'Один.',
        '',
        'Два.',
        ':::',
        '',
        ':::lead',
        'Три.',
        ':::',
        ':::',
      ].join('\n'),
    );
    const leads = await diagnosticOf();
    expect([leads.code, ...(leads.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_DIRECTIVE_PLACEMENT',
      'INVALID_DIRECTIVE_PLACEMENT',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '::::response{title="Форма" id="one"}',
        ':::question{id="a" kind="single" title="Первый" prompt="Выберите"}',
        '::option{id="one" label="A"}',
        ':::',
        ':::question{id="b" kind="single" title="Второй" prompt="Выберите"}',
        '::option{id="two" label="B"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const questions = await diagnosticOf();
    expect([questions.code, ...(questions.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_RESPONSE_DATA',
      'INVALID_RESPONSE_DATA',
    ]);

    // The same test applied to the loops inside a visualization: three edges pointing at nodes that
    // do not exist, and two foreign children of one copyable block.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::diagram{title="Поток" description="Three edges to undeclared nodes." type="flow"}',
        '::node{id="a" label="A"}',
        '::node{id="b" label="B"}',
        '::node{id="c" label="C"}',
        '::edge{from="a" to="missing-one" label="one"}',
        '::edge{from="b" to="missing-two" label="two"}',
        '::edge{from="c" to="missing-three" label="three"}',
        ':::',
      ].join('\n'),
    );
    const edges = await diagnosticOf();
    expect([edges.code, ...(edges.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::copyable',
        'Один.',
        '',
        '```text',
        'код',
        '```',
        '',
        '```text',
        'ещё код',
        '```',
        ':::',
      ].join('\n'),
    );
    const foreign = await diagnosticOf();
    expect([foreign.code, ...(foreign.related ?? []).map((entry_) => entry_.code)]).toEqual([
      'INVALID_DIRECTIVE_PLACEMENT',
      'INVALID_DIRECTIVE_PLACEMENT',
    ]);

    // Two loops repaired earlier without an observation of their own: series of one chart and node
    // group assignments of one grouped flow.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        '::::chart{type="bar" title="Ряды" description="Two series with duplicate labels."}',
        ':::series{label="Один"}',
        '::point{label="A" value="1"}',
        '::point{label="A" value="2"}',
        ':::',
        ':::series{label="Два"}',
        '::point{label="B" value="3"}',
        '::point{label="B" value="4"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const series = await diagnosticOf();
    expect([series.code, ...(series.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::diagram{title="Поток" description="Nodes referencing unknown groups." type="flow" direction="right"}',
        '::group{id="one" label="Один"}',
        '::group{id="two" label="Два"}',
        '::node{id="a" label="A" group="one"}',
        '::node{id="b" label="B" group="missing-one"}',
        '::node{id="c" label="C" group="missing-two"}',
        '::edge{from="a" to="b" label="one"}',
        '::edge{from="b" to="c" label="two"}',
        ':::',
      ].join('\n'),
    );
    const assignments = await diagnosticOf();
    expect([assignments.code, ...(assignments.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);

    // The remaining places of the denominator: two sequence participants carrying a group, two
    // sequence messages without a label, two response items pointing at an undeclared bucket, and
    // two annotated code keys whose terms do not occur in the block.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::diagram{title="Обмен" description="Participants carrying a group." type="sequence"}',
        '::node{id="a" label="A" group="one"}',
        '::node{id="b" label="B" group="two"}',
        '::edge{from="a" to="b" label="one"}',
        ':::',
      ].join('\n'),
    );
    const participants = await diagnosticOf();
    expect([participants.code, ...(participants.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        ':::diagram{title="Обмен" description="Messages without labels." type="sequence"}',
        '::node{id="a" label="A"}',
        '::node{id="b" label="B"}',
        '::edge{from="a" to="b"}',
        '::edge{from="b" to="a"}',
        ':::',
      ].join('\n'),
    );
    const messages = await diagnosticOf();
    expect([messages.code, ...(messages.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_VISUALIZATION_DATA',
      'INVALID_VISUALIZATION_DATA',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        '::::response{title="Форма" id="one"}',
        ':::question{id="scope" kind="bucket" title="Куда" prompt="Разложите"}',
        '::bucket{id="now" label="Сейчас"}',
        '::bucket{id="later" label="Потом"}',
        '::item{id="one" label="Первый" note="Раз." meta="Один" href="https://example.com/1" bucket="missing-one"}',
        '::item{id="two" label="Второй" note="Два." meta="Два" href="https://example.com/2" bucket="missing-two"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const items = await diagnosticOf();
    expect([items.code, ...(items.related ?? []).map((e) => e.code)]).toEqual([
      'INVALID_RESPONSE_DATA',
      'INVALID_RESPONSE_DATA',
    ]);

    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::glossary{key="probe" term="проба"}',
        'Наблюдение.',
        ':::',
        '',
        ':::section{title="Раздел"}',
        'Тут :term[спека]{key="spec"} и :term[проба]{key="probe"}.',
        '',
        '```text terms="spec,probe"',
        'ни того ни другого тут нет',
        '```',
        ':::',
      ].join('\n'),
    );
    const codeKeys = await diagnosticOf();
    expect([codeKeys.code, ...(codeKeys.related ?? []).map((e) => e.code)]).toEqual([
      'CODE_TERM_NOT_FOUND',
      'CODE_TERM_NOT_FOUND',
    ]);

    // A reference to a key nothing ever defined is an independent fact: it joins the inventory
    // instead of ending the run before the remaining checks.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        'Раз :foo рядом.',
        '',
        'Тут :term[спека]{key="nope"} без определения.',
      ].join('\n'),
    );
    const unknownKey = await diagnosticOf();
    expect([unknownKey.code, ...(unknownKey.related ?? []).map((e) => e.code)]).toEqual([
      'UNSUPPORTED_DIRECTIVE',
      'UNKNOWN_GLOSSARY_TERM',
    ]);

    // The same reference no longer ends the run before the later checks: a bad action group after
    // it is reported in the same run.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        'Тут :term[спека]{key="nope"} без определения.',
        '',
        ':::actions',
        'Проза.',
        ':::',
      ].join('\n'),
    );
    const withLaterCheck = await diagnosticOf();
    expect([withLaterCheck.code, ...(withLaterCheck.related ?? []).map((e) => e.code)]).toEqual([
      'UNKNOWN_GLOSSARY_TERM',
      'INVALID_DIRECTIVE_PLACEMENT',
    ]);

    // Suppression keeps its declared meaning: a reference whose own definition was refused repeats
    // that refusal and stays out of the inventory. The definition here is refused for a missing
    // required attribute, so its key never reaches the accepted map and only the refused-key set
    // tells this reference apart from one nothing ever defined.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::section{title="Раздел"}',
        'Тут :term[спека]{key="spec"} рядом.',
        ':::',
      ].join('\n'),
    );
    const refusedDefinition = await diagnosticOf();
    expect([
      refusedDefinition.code,
      ...(refusedDefinition.related ?? []).map((e) => e.code),
    ]).toEqual(['DIRECTIVE_ATTRIBUTE_REQUIRED']);

    // The same rule holds for the other annotation pointing at a definition key: an annotated code
    // fence naming the refused key repeats that refusal and stays out, while the key beside it that
    // nothing ever defined is an independent fact and joins the inventory.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::section{title="Раздел"}',
        '```text terms="spec,ghost"',
        'спека и призрак рядом',
        '```',
        ':::',
      ].join('\n'),
    );
    const refusedCodeKey = await diagnosticOf();
    expect([refusedCodeKey.code, ...(refusedCodeKey.related ?? []).map((e) => e.code)]).toEqual([
      'DIRECTIVE_ATTRIBUTE_REQUIRED',
      'UNKNOWN_GLOSSARY_TERM',
    ]);

    // Suppression drops the record, not the reason to stop reading the block: a fence whose only key
    // was refused still has no definition to locate, so it must end quietly and leave the next fence
    // to answer for itself.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::section{title="Раздел"}',
        '```text terms="spec"',
        'спека рядом',
        '```',
        '',
        '```text terms="ghost"',
        'призрак рядом',
        '```',
        ':::',
      ].join('\n'),
    );
    const refusedThenUnknownFence = await diagnosticOf();
    expect([
      refusedThenUnknownFence.code,
      ...(refusedThenUnknownFence.related ?? []).map((e) => e.code),
    ]).toEqual(['DIRECTIVE_ATTRIBUTE_REQUIRED', 'UNKNOWN_GLOSSARY_TERM']);

    // The boundary of suppression, which the agent reference and the inventory record both state: a
    // definition inside a rejected container is never read, so its key becomes neither known nor
    // refused and a reference to it is still an unknown key beside the refusal of that container.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::section',
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        ':::',
        '',
        ':::section{title="Раздел"}',
        'Тут :term[спека]{key="spec"} рядом.',
        ':::',
      ].join('\n'),
    );
    const definitionLostWithContainer = await diagnosticOf();
    expect([
      definitionLostWithContainer.code,
      ...(definitionLostWithContainer.related ?? []).map((e) => e.code),
    ]).toEqual(['DIRECTIVE_ATTRIBUTE_REQUIRED', 'UNKNOWN_GLOSSARY_TERM']);

    // The dependency this unit introduced: overlap detection reads the ranges of every annotated
    // key, so a block with a key that never occurs reports only that key and not an overlap
    // computed from the ranges it just refused.
    await writeFile(
      entry,
      [
        ...frontmatter,
        ':::glossary{key="spec" term="спека"}',
        'Согласованное требование.',
        ':::',
        '',
        ':::glossary{key="probe" term="спека и проба"}',
        'Наблюдение.',
        ':::',
        '',
        ':::glossary{key="absent" term="отсутствующее"}',
        'Нет в блоке.',
        ':::',
        '',
        ':::section{title="Раздел"}',
        'Тут :term[спека]{key="spec"}, :term[спека и проба]{key="probe"} и :term[отсутствующее]{key="absent"}.',
        '',
        '```text terms="spec,probe,absent"',
        'спека и проба рядом',
        '```',
        ':::',
      ].join('\n'),
    );
    const refusedRanges = await diagnosticOf();
    expect([refusedRanges.code, ...(refusedRanges.related ?? []).map((e) => e.code)]).toEqual([
      'CODE_TERM_NOT_FOUND',
    ]);

    // Inside one refused subject nothing is read further: a pie chart that breaks two rules at once
    // — two series, and a second series without points — answers with one violation, not two.
    await writeFile(
      entry,
      [
        ...frontmatter,
        '# Свод',
        '',
        '::::chart{type="pie" title="Первый" description="Two series, one of them empty."}',
        ':::series{label="Один"}',
        '::point{label="A" value="1"}',
        ':::',
        ':::series{label="Два"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const refusedSubject = await diagnosticOf();
    expect(refusedSubject.code).toBe('INVALID_VISUALIZATION_DATA');
    expect(refusedSubject.related).toBeUndefined();

    // Every remaining check answers for both of its subjects too: a check left reporting only its
    // first one would keep the whole set green without this table.
    for (const [label, code, body] of [
      [
        'copyable prose',
        'INVALID_DIRECTIVE_PLACEMENT',
        [
          ':::copyable',
          'Один.',
          '',
          '```text',
          'код',
          '```',
          ':::',
          '',
          ':::copyable',
          'Два.',
          '',
          '```text',
          'код',
          '```',
          ':::',
        ],
      ],
      [
        'action groups',
        'INVALID_DIRECTIVE_PLACEMENT',
        [':::actions', 'Проза.', ':::', '', ':::actions', 'Проза.', ':::'],
      ],
      [
        'lead paragraphs',
        'INVALID_DIRECTIVE_PLACEMENT',
        [
          ':::section{title="Первый"}',
          ':::lead',
          'Один.',
          '',
          'Два.',
          ':::',
          ':::',
          '',
          ':::section{title="Второй"}',
          ':::lead',
          'Три.',
          '',
          'Четыре.',
          ':::',
          ':::',
        ],
      ],
      [
        'typed review components',
        'INVALID_DIRECTIVE_PLACEMENT',
        [
          ':::checklist{title="Первый" id="one"}',
          'Проза.',
          '::check-item{id="a" label="A"}',
          ':::',
          '',
          ':::checklist{title="Второй" id="two"}',
          'Проза.',
          '::check-item{id="b" label="B"}',
          ':::',
        ],
      ],
      [
        'response forms',
        'INVALID_RESPONSE_DATA',
        [
          '::::response{title="Первый" id="one"}',
          ':::question{id="dup" kind="single" title="Вопрос" prompt="Выберите"}',
          '::option{id="a" label="A"}',
          '::option{id="b" label="B"}',
          ':::',
          ':::question{id="dup" kind="single" title="Вопрос" prompt="Выберите"}',
          '::option{id="c" label="C"}',
          '::option{id="d" label="D"}',
          ':::',
          '::::',
          '',
          '::::response{title="Второй" id="two"}',
          ':::question{id="same" kind="single" title="Вопрос" prompt="Выберите"}',
          '::option{id="e" label="E"}',
          '::option{id="f" label="F"}',
          ':::',
          ':::question{id="same" kind="single" title="Вопрос" prompt="Выберите"}',
          '::option{id="g" label="G"}',
          '::option{id="h" label="H"}',
          ':::',
          '::::',
        ],
      ],
      [
        'code term blocks',
        'UNKNOWN_GLOSSARY_TERM',
        [
          '```text terms="missing-one"',
          'первый',
          '```',
          '',
          '```text terms="missing-two"',
          'второй',
          '```',
        ],
      ],
    ] as [string, string, readonly string[]][]) {
      await writeFile(entry, [...frontmatter, '# Свод', '', ...body].join('\n'));
      const reported = await diagnosticOf();
      expect(
        [reported.code, ...(reported.related ?? []).map((entry_) => entry_.code)],
        label,
      ).toEqual([code, code]);
    }
  });

  it('keeps ordinary colon prose as exact authored text while a spaced unknown alphabetic name still fails', async () => {
    const workspace = await trackedWorkspace('literal-colon-text');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    await writeFile(
      entry,
      [
        '---',
        'title: Отчёт за 9 июля (ночь до 05:24)',
        '---',
        '# Сводка',
        '',
        'Время 21:01.',
        '',
        'Диапазон 21:01 — 00:12.',
        '',
        'Длительность 1:30:05.',
      ].join('\n'),
    );

    await expect(buildReport({ input: workspace, output })).resolves.toMatchObject({
      format: 'single-file',
    });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('<title>Отчёт за 9 июля (ночь до 05:24)</title>');
    expect(html).toMatch(/<p[^>]*>Время 21:01\.<\/p>/u);
    expect(html).toMatch(/<p[^>]*>Диапазон 21:01 — 00:12\.<\/p>/u);
    expect(html).toMatch(/<p[^>]*>Длительность 1:30:05\.<\/p>/u);

    // One row per distinguishing feature of the rule, not per reported case: a digit opening the
    // name — which holds whatever precedes the colon — a colon written against the preceding word,
    // group counts outside the clock shape, and the escape that stays available where neither
    // feature applies.
    for (const [label, authored, rendered] of [
      ['digit opens the name', 'Работа arXiv:2607.05775 в списке.'],
      ['digit opens the name after a space', 'Пункт :2 списка.'],
      ['digit opens the name after a bracket', 'Сноска (:2) рядом.'],
      ['letter after a word-adjacent colon', 'Формат ключ:значение в конфиге.'],
      ['host and port', 'Адрес localhost:9000 открыт.'],
      ['alphanumeric tail', 'Версия v21:01alpha.'],
      ['two groups', 'Правило 3:1 и масштаб 1:100.'],
      ['three groups', 'Коэффициент 1:10:100.'],
      ['minute domain outside the clock shape', 'Неверное время 21:99.'],
      ['four numeric groups', 'Не длительность 1:20:30:40.'],
      ['left astral letter', 'Знак \u{10400}21:01 рядом.'],
      ['right astral letter', 'Знак 21:01\u{10400} рядом.'],
      ['left combining mark', 'Знак a\u{301}21:01 рядом.'],
      ['right combining mark', 'Знак 21:01\u{301}a рядом.'],
      ['escaped colon', 'Ссылка arXiv\\:2607.05775 здесь.', 'Ссылка arXiv:2607.05775 здесь.'],
    ] as [string, string, string?][]) {
      await writeFile(entry, `# Проверка\n\n${authored}\n`);
      await expect(buildReport({ input: workspace, output }), label).resolves.toMatchObject({
        format: 'single-file',
      });
      expect(await readFile(output, 'utf8'), label).toContain(rendered ?? authored);
    }

    // The restore is bounded to leaf text directives without attributes or children, so a
    // word-adjacent colon that carries attributes stays a directive and keeps its diagnostic, and
    // a digit-initial name written as a block-level form is never restored either.
    for (const authored of [
      'Текст :unknown рядом.',
      'Запись слово:unknown{ключ="1"} в прозе.',
      '::2',
    ]) {
      await writeFile(entry, `# Проверка\n\n${authored}\n`);
      await expect(buildReport({ input: workspace, output }), authored).rejects.toMatchObject({
        diagnostic: {
          code: 'UNSUPPORTED_DIRECTIVE',
          source: { file: entry, line: 3 },
          remediation: expect.stringContaining('Escape the colon as \\:'),
        },
      });
    }

    // A spaced registered name is not restored either, so it reaches its own directive rules rather
    // than the unsupported-name diagnostic: every registered text directive requires an attribute.
    await writeFile(entry, '# Проверка\n\nСмотри :term рядом.\n');
    await expect(buildReport({ input: workspace, output })).rejects.toMatchObject({
      diagnostic: { code: 'DIRECTIVE_ATTRIBUTE_REQUIRED', source: { file: entry, line: 3 } },
    });
  });

  it('renders copyable prose as a marked ordinary Markdown content owner', async () => {
    const workspace = await trackedWorkspace('copyable-prose');
    const entry = path.join(workspace, 'report.md');
    const output = path.join(workspace, 'report.html');
    await writeFile(
      entry,
      [
        '# Copyable prose',
        '',
        ':::copyable',
        'Deploy after **two checks**.',
        '',
        'Read the [rollback runbook](https://example.com/runbook).',
        ':::',
      ].join('\n'),
    );
    await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('class="semantic-copyable"');
    expect(html).toContain('data-copyable-prose=""');
    expect(html).toContain('data-copyable-content=""');
    expect(html).toContain('<strong>two checks</strong>');
    expect(html).toContain('href="https://example.com/runbook"');
    expect(html).not.toMatch(/<pre[^>]*>[\s\S]*Deploy after/u);

    for (const [label, child] of [
      ['block code', '```text\nnot prose\n```'],
      ['nested behavior', ':::demo\nnot prose\n:::'],
    ] as const) {
      await writeFile(entry, `# Invalid\n\n::::copyable\n${child}\n::::\n`);
      await expect(buildReport({ input: workspace, output }), label).rejects.toMatchObject({
        diagnostic: { code: 'INVALID_DIRECTIVE_PLACEMENT', source: { file: entry } },
      });
    }
  });

  it('rejects unknown directive attributes as agent input errors', async () => {
    const workspace = await trackedWorkspace('unknown-directive-attribute');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n:::demo{title="Counter" typo="value"}\nContent\n:::\n',
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE' } });
  });

  it('maps directive diagnostics inside expanded partials to the authored partial range', async () => {
    const workspace = await trackedWorkspace('partial-diagnostic-origin');
    await mkdir(path.join(workspace, 'partials'));
    const partialPath = path.join(workspace, 'partials', 'invalid.md');
    await writeFile(partialPath, 'Intro.\n:::unknown\nContent\n:::\n');
    await writeFile(
      path.join(workspace, 'report.md'),
      '# Report\n{{include: partials/invalid.md}}\n',
    );

    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'UNSUPPORTED_DIRECTIVE',
        source: {
          file: partialPath,
          line: 2,
          column: 1,
          endLine: expect.any(Number),
          endColumn: expect.any(Number),
        },
      },
    });
  });

  it('derives external runtime placement from directory format', async () => {
    const workspace = await fixtureWorkspace('directory-runtime');
    const output = path.join(workspace, 'artifact');

    await buildReport({ input: workspace, output, format: 'directory' });

    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    expect(html).toMatch(/<script src="assets\/runtime\.[a-f0-9]{12}\.js" defer=""><\/script>/);
    expect(html).toContain('assets/document.');
    expect(html).not.toContain('<script>');
  });

  it('produces identical directory trees in independent destinations', async () => {
    const workspace = await fixtureWorkspace('directory-deterministic');
    const firstOutput = path.join(workspace, 'artifact-a');
    const secondOutput = path.join(workspace, 'artifact-b');

    await buildReport({
      input: workspace,
      output: firstOutput,
      format: 'directory',
    });
    await buildReport({
      input: workspace,
      output: secondOutput,
      format: 'directory',
    });

    expect(await directorySnapshot(secondOutput)).toEqual(await directorySnapshot(firstOutput));
  });
});

async function fixtureWorkspace(prefix: string): Promise<string> {
  const workspace = await trackedWorkspace(prefix);
  await mkdir(path.join(workspace, 'partials'));
  await writeFile(
    path.join(workspace, 'pixel.png'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
  );
  await writeFile(
    path.join(workspace, 'partials', 'analysis.md'),
    '## Included analysis\nUseful detail.\n',
  );
  await writeFile(
    path.join(workspace, 'report.md'),
    [
      '---',
      `title: ${prefix} report`,
      'description: Compiler fixture',
      '---',
      '# Report',
      '{{include: partials/analysis.md}}',
      '![pixel](pixel.png)',
      '<script>alert("unsafe")</script>',
      '<img src="pixel.png" onerror="alert(1)">',
      '```ts',
      'const portable: boolean = true;',
      '```',
    ].join('\n'),
  );
  return workspace;
}

async function trackedWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  return workspace;
}

async function directorySnapshot(directory: string): Promise<Readonly<Record<string, string>>> {
  const snapshot: Record<string, string> = {};
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await directorySnapshot(entryPath);
      for (const [name, contents] of Object.entries(nested)) {
        snapshot[`${entry.name}/${name}`] = contents;
      }
    } else {
      snapshot[entry.name] = (await readFile(entryPath)).toString('base64');
    }
  }
  return snapshot;
}

function extractContentSecurityPolicy(html: string): readonly string[] {
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"\/>/u);
  if (match?.[1] === undefined) throw new Error('Missing Content-Security-Policy meta element');
  return match[1].replaceAll('&#x27;', "'").split('; ');
}

function extractInlineRuntime(html: string): string {
  const match = html.match(/<script>([\s\S]*)<\/script><\/body>/u);
  if (match?.[1] === undefined) throw new Error('Missing inline runtime');
  return match[1];
}

function extractInlineStyles(html: string): string {
  const match = html.match(/<style>([\s\S]*?)<\/style>/u);
  if (match?.[1] === undefined) throw new Error('Missing inline stylesheet');
  return match[1];
}

function isStagingPathFor(candidate: string, output: string): boolean {
  return (
    path.dirname(candidate) === path.dirname(output) &&
    path.basename(candidate).startsWith(`.${path.basename(output)}.agentic-report-`) &&
    candidate.endsWith('.tmp')
  );
}

function isDirectoryStagingPathFor(candidate: string, output: string): boolean {
  const relative = path.relative(path.dirname(output), candidate);
  const [stagingDirectory] = relative.split(path.sep);
  return stagingDirectory?.startsWith(`.${path.basename(output)}.agentic-report-`) ?? false;
}

function requireMatchingAsset(files: readonly string[], pattern: RegExp): string {
  const match = files.find((file) => pattern.test(file));
  if (match === undefined) throw new Error(`Missing asset matching ${pattern.source}`);
  return match;
}

async function expectContentAddressedAsset(directory: string, name: string): Promise<void> {
  const contents = await readFile(path.join(directory, name));
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  expect(name).toContain(`.${digest}.`);
}
