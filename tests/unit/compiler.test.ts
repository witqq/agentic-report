import { createHash } from 'node:crypto';
import { link, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildReportOptions } from '../../src/contracts.js';
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

      const error = await buildReport({ input: workspace, output }).catch(
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
      const retry = await buildReport({ input: workspace, output });
      expect(retry.outputPath).toBe(output);
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
      buildReport({ input: workspace, output, format: 'directory' }),
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
    const retry = await buildReport({ input: workspace, output, format: 'directory' });
    await expect(readFile(retry.outputPath, 'utf8')).resolves.toContain('<!doctype html>');
  });

  it('restores an existing empty directory when publication rename fails', async () => {
    const workspace = await fixtureWorkspace('directory-rename-failure');
    const output = path.join(workspace, 'artifact');
    await mkdir(output);
    publicationControl.failRenameTo = output;

    await expect(
      buildReport({ input: workspace, output, format: 'directory' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_PUBLICATION_FAILED' } });
    expect(await readdir(output)).toEqual([]);
    expect((await readdir(workspace)).some((name) => name.includes('.agentic-report-'))).toBe(
      false,
    );

    publicationControl.failRenameTo = undefined;
    const retry = await buildReport({ input: workspace, output, format: 'directory' });
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

  it('keeps clock times, ranges, durations and frontmatter titles as exact authored text', async () => {
    const workspace = await trackedWorkspace('numeric-time-text');
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

    for (const [label, invalid] of [
      ['unknown alphabetic directive', 'Текст :unknown рядом.'],
      ['invalid minute domain', 'Неверное время 21:99.'],
      ['short subordinate field', 'Не время 1:2.'],
      ['four numeric groups', 'Не длительность 1:20:30:40.'],
      ['word-adjacent token', 'Версия v21:01alpha.'],
      ['left astral letter', '𐐀21:01'],
      ['right astral letter', '21:01𐐀'],
      ['left combining mark', 'á21:01'],
      ['right combining mark', '21:01́a'],
    ] as const) {
      await writeFile(entry, `# Проверка\n\n${invalid}\n`);
      await expect(buildReport({ input: workspace, output }), label).rejects.toMatchObject({
        diagnostic: {
          code: 'UNSUPPORTED_DIRECTIVE',
          source: { file: entry, line: 3 },
        },
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
