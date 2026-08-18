import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  InspectReportOptions,
  OutputFormat,
  ValidateReportOptions,
} from '../../src/contracts.js';
import { buildReport, inspectReport, validateReport } from '../../src/index.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import { authoringRegistry } from '../../src/authoring/registry.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
const paritySource = path.resolve('tests/fixtures/analysis/parity');

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('report analysis', () => {
  it('keeps build bytes stable while validate and inspect share its production preparation', async () => {
    const workspace = await createTestWorkspace('analysis-parity');
    workspaces.push(workspace);
    const oracle = JSON.parse(
      await readFile(path.resolve('tests/fixtures/analysis/parity-oracle.json'), 'utf8'),
    ) as ParityOracle;

    const singlePath = path.join(workspace, 'single.html');
    const directoryPath = path.join(workspace, 'directory');
    const [single, validated, inspected, directory, validatedDirectory, inspectedDirectory] =
      await Promise.all([
        buildReport({ input: paritySource, output: singlePath }),
        validateReport({ input: paritySource }),
        inspectReport({ input: paritySource }),
        buildReport({ input: paritySource, output: directoryPath, format: 'directory' }),
        validateReport({ input: paritySource, format: 'directory' }),
        inspectReport({ input: paritySource, format: 'directory' }),
      ]);
    expect({ ...single, outputPath: '<single>' }).toStrictEqual(oracle.single.result);
    expect(
      createHash('sha256')
        .update(await readFile(singlePath))
        .digest('hex'),
    ).toBe(oracle.single.sha256);

    expect(validated).toStrictEqual({
      contractVersion: 1,
      projectPath: paritySource,
      entryPath: path.join(paritySource, 'report.md'),
      format: 'single-file',
      runtimePlacement: 'inline',
      warnings: [],
    });

    expect(inspected).toStrictEqual({
      contractVersion: 1,
      projectPath: paritySource,
      entryPath: path.join(paritySource, 'report.md'),
      output: { format: 'single-file', runtimePlacement: 'inline' },
      sourceFiles: [
        'agentic-report.yaml',
        'assets/data.json',
        'assets/diagram.svg',
        'assets/report.woff2',
        'inner.md',
        'partials/outer.md',
        'report.md',
      ],
      observed: {
        directives: ['asset', 'callout', 'demo', 'font'],
        resources: { images: 2, downloads: 1, fonts: 1 },
      },
      catalog: {
        commands: {
          init: 'Initialize a packaged declarative starter without overwriting user content.',
          validate: 'Validate a project without writing an output artifact.',
          inspect:
            'Inspect source usage and the available authoring catalog without writing output.',
          build: 'Compile a source into a static artifact.',
          describe: 'Return the complete source contract.',
          schema: 'Return manifest, directive, or complete source JSON Schema.',
          examples: 'List packaged buildable examples.',
        },
        formats: ['single-file', 'directory'],
        starters: [
          { id: 'basic', title: 'Report starter', default: true, aliases: ['report'] },
          { id: 'research', title: 'Research starter', default: false, aliases: [] },
          { id: 'architecture', title: 'Architecture starter', default: false, aliases: [] },
          { id: 'tutorial', title: 'Tutorial starter', default: false, aliases: [] },
          { id: 'dashboard', title: 'Dashboard starter', default: false, aliases: [] },
          { id: 'landing', title: 'Landing page starter', default: false, aliases: [] },
        ],
        capabilities: {
          init: 'Initialize a packaged declarative starter without overwriting user content.',
          validate: 'Validate a project through the production preparation pipeline.',
          inspect: 'Inspect a valid project through the production preparation pipeline.',
        },
        page: authoringRegistry.page,
      },
      warnings: [],
    });

    expect({
      ...directory,
      outputPath: directory.outputPath.replace(directoryPath, '<directory>'),
    }).toStrictEqual(oracle.directory.result);
    expect(await hashTree(directoryPath)).toStrictEqual(oracle.directory.tree);

    expect(validatedDirectory).toMatchObject({
      format: 'directory',
      runtimePlacement: 'external',
    });
    expect(inspectedDirectory).toMatchObject({
      output: { format: 'directory', runtimePlacement: 'external' },
      observed: inspected.observed,
      sourceFiles: inspected.sourceFiles,
    });
  });

  it('never publishes output and rejects an invalid format before source discovery', async () => {
    const workspace = await createTestWorkspace('analysis-no-output');
    workspaces.push(workspace);
    const source = path.join(workspace, 'source');
    await cp(paritySource, source, { recursive: true });

    const singleSentinel = path.join(workspace, 'report.html');
    const directorySentinel = path.join(workspace, 'report-artifact', 'sentinel.txt');
    await writeFile(singleSentinel, 'keep single');
    await mkdir(path.dirname(directorySentinel));
    await writeFile(directorySentinel, 'keep directory');

    await validateReport({ input: source });
    await inspectReport({ input: source, format: 'directory' });

    await expect(readFile(singleSentinel, 'utf8')).resolves.toBe('keep single');
    await expect(readFile(directorySentinel, 'utf8')).resolves.toBe('keep directory');
    await expect(
      validateReport({
        input: path.join(workspace, 'missing'),
        format: 'bogus' as OutputFormat,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'OUTPUT_FORMAT_INVALID' },
    });
    await expect(validateReport(null as unknown as ValidateReportOptions)).rejects.toMatchObject({
      diagnostic: { code: 'ANALYSIS_OPTIONS_INVALID' },
    });
    await expect(
      inspectReport({ input: source, unexpected: true } as unknown as InspectReportOptions),
    ).rejects.toMatchObject({ diagnostic: { code: 'ANALYSIS_OPTIONS_INVALID' } });
    await expect(readdir(workspace)).resolves.toEqual(
      expect.arrayContaining(['report.html', 'report-artifact', 'source']),
    );
  });

  it('returns authored, redacted diagnostics for invalid source through both analysis APIs', async () => {
    const workspace = await createTestWorkspace('analysis-diagnostic');
    workspaces.push(workspace);
    const report = path.join(workspace, 'report.md');
    await writeFile(
      report,
      '# Broken source\n\n![Remote](https://alice:password@local.test/image.png?token=private&X-Amz-Credential=credential-sentinel&X-Amz-Signature=signature-sentinel&X-Amz-Security-Token=security-token-sentinel)\n',
    );

    for (const analyze of [validateReport, inspectReport]) {
      const error = await analyze({ input: report }).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(AgenticReportError);
      if (!(error instanceof AgenticReportError)) {
        throw new Error('Analysis API did not reject with AgenticReportError.');
      }
      expect(error).toMatchObject({
        diagnostic: {
          code: 'REMOTE_ASSET_BLOCKED',
          source: { file: report, line: 3 },
        },
      });
      expect(JSON.stringify(error.diagnostic)).not.toMatch(
        /alice|password|private|credential-sentinel|signature-sentinel|security-token-sentinel/u,
      );
      expect(JSON.stringify(error.diagnostic)).toContain('[REDACTED]');
    }
  });

  it('redacts credential-bearing paths from successful analysis results', async () => {
    const workspace = await createTestWorkspace('analysis-success-redaction');
    workspaces.push(workspace);
    const source = path.join(workspace, 'token=path-sentinel');
    await cp(paritySource, source, { recursive: true });
    const expectedProjectPath = path.join(workspace, 'token=[REDACTED]');

    const validated = await validateReport({ input: source });
    const inspected = await inspectReport({ input: source });
    expect(validated).toMatchObject({
      projectPath: expectedProjectPath,
      entryPath: path.join(expectedProjectPath, 'report.md'),
    });
    expect(inspected).toMatchObject({
      projectPath: expectedProjectPath,
      entryPath: path.join(expectedProjectPath, 'report.md'),
    });
    expect(JSON.stringify({ validated, inspected })).not.toContain('path-sentinel');
  });

  it('returns preparation warnings through both analysis APIs', async () => {
    const workspace = await createTestWorkspace('analysis-warning');
    workspaces.push(workspace);
    const source = path.join(workspace, 'source');
    await cp(paritySource, source, { recursive: true });
    await writeFile(
      path.join(source, 'agentic-report.yaml'),
      'title: Warning fixture\noutput:\n  maxInlineBytes: 1\n',
    );

    const validated = await validateReport({ input: source });
    const inspected = await inspectReport({ input: source });
    for (const warnings of [validated.warnings, inspected.warnings]) {
      expect(warnings).toEqual([
        {
          level: 'warning',
          code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
          message: expect.stringContaining('above the configured 1-byte threshold'),
          remediation:
            'Use directory output or raise output.maxInlineBytes after reviewing portability needs.',
          details: { bundledBytes: expect.any(Number), threshold: 1 },
        },
      ]);
      expect((warnings[0]?.details?.bundledBytes as number) > 1).toBe(true);
    }
  });
});

interface ParityOracle {
  readonly single: {
    readonly result: {
      readonly outputPath: '<single>';
      readonly format: 'single-file';
      readonly bytes: number;
      readonly embeddedAssets: number;
      readonly externalAssets: number;
      readonly contentHash: string;
      readonly warnings: readonly unknown[];
    };
    readonly sha256: string;
  };
  readonly directory: {
    readonly result: {
      readonly outputPath: '<directory>/index.html';
      readonly format: 'directory';
      readonly bytes: number;
      readonly embeddedAssets: number;
      readonly externalAssets: number;
      readonly contentHash: string;
      readonly warnings: readonly unknown[];
    };
    readonly tree: Readonly<Record<string, string>>;
  };
}

async function hashTree(root: string): Promise<Readonly<Record<string, string>>> {
  const hashes: Record<string, string> = {};
  await visit(root, '');
  return hashes;

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareNames(left.name, right.name))) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        hashes[relativePath] = createHash('sha256')
          .update(await readFile(absolutePath))
          .digest('hex');
      } else {
        throw new Error(`Unexpected output entry: ${absolutePath}`);
      }
    }
  }
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
