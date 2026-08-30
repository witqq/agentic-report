import { createHash } from 'node:crypto';
import { cp, link, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  InspectReportOptions,
  InspectReviewOptions,
  OutputFormat,
  ValidateReportOptions,
} from '../../src/contracts.js';
import {
  buildReport,
  inspectReport,
  inspectReview,
  serializeReviewArtifact,
  type ReviewTargetManifest,
  validateReport,
} from '../../src/index.js';
import { MAX_REVIEW_FILE_BYTES } from '../../src/review/contract.js';
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
          review: 'Resolve a confined review artifact without changing report sources.',
          build: 'Compile a source into a default or share-safe static artifact.',
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
          review: 'Resolve a versioned review artifact to current Markdown source locations.',
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

  it('embeds format-identical review targets and resolves exact partial feedback after resource changes', async () => {
    const workspace = await reviewWorkspace('analysis-review-binding');
    const singleOutput = path.join(workspace, 'report.html');
    const directoryOutput = path.join(workspace, 'artifact');
    await Promise.all([
      buildReport({ input: workspace, output: singleOutput }),
      buildReport({ input: workspace, output: directoryOutput, format: 'directory' }),
    ]);
    const singleManifest = await embeddedManifest(singleOutput);
    const singleHtml = await readFile(singleOutput, 'utf8');
    const renderedTargetIds = [...singleHtml.matchAll(/\bdata-review-target="([^"]+)"/gu)]
      .map((match) => match[1] ?? '')
      .sort();
    expect(renderedTargetIds).toEqual(singleManifest.targets.map((target) => target.id).sort());
    const serializedManifest = JSON.stringify(singleManifest);
    expect(serializedManifest).not.toContain(workspace);
    expect(serializedManifest).not.toMatch(/Entry secret context|Equal evidence/u);
    expect(singleManifest).toStrictEqual(
      await embeddedManifest(path.join(directoryOutput, 'index.html')),
    );
    const partialTarget = singleManifest.targets.find(
      (target) =>
        target.kind === 'markdown:paragraph' && target.source.file === 'partials/evidence.md',
    );
    if (partialTarget === undefined) throw new Error('Missing partial review target');
    expect(singleManifest.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'directive:section',
          stableKey: 'directive:section:launch',
        }),
      ]),
    );
    await writeFile(
      path.join(workspace, 'review.json'),
      serializeReviewArtifact({
        contractVersion: 2,
        report: { revision: singleManifest.reportRevision },
        threads: [
          {
            id: 'thread-a',
            segments: [
              {
                id: 'segment-a',
                reportRevision: singleManifest.reportRevision,
                target: partialTarget,
                resolved: false,
                messages: [{ id: 'message-a', author: 'user', message: 'token=private-value' }],
              },
            ],
          },
        ],
      }),
    );

    const exact = await inspectReview({ input: workspace, review: 'review.json' });
    expect(exact).toMatchObject({
      reportStatus: 'exact',
      threads: [
        {
          binding: 'exact',
          thread: { segments: [{ messages: [{ message: 'token=[REDACTED]' }] }] },
          currentTarget: { source: { file: 'partials/evidence.md', line: 1 } },
        },
      ],
    });
    expect(JSON.stringify(exact)).not.toMatch(/private-value|Entry secret context/u);

    const entryPath = path.join(workspace, 'report.md');
    await writeFile(entryPath, `${await readFile(entryPath, 'utf8')}\nUnrelated entry update.\n`);
    const sourceStale = await inspectReview({ input: workspace, review: 'review.json' });
    expect(sourceStale.reportRevision).not.toBe(singleManifest.reportRevision);
    expect(sourceStale).toMatchObject({
      reportStatus: 'stale',
      threads: [{ binding: 'exact', currentTarget: { source: { file: 'partials/evidence.md' } } }],
    });

    await writeFile(path.join(workspace, 'asset.txt'), 'changed local resource\n');
    const resourceStale = await inspectReview({ input: workspace, review: 'review.json' });
    expect(resourceStale.reportRevision).not.toBe(sourceStale.reportRevision);
    expect(resourceStale.threads[0]?.binding).toBe('exact');

    await writeFile(path.join(workspace, 'partials/evidence.md'), 'Changed evidence.\n');
    const targetStale = await inspectReview({ input: workspace, review: 'review.json' });
    expect(targetStale.reportRevision).not.toBe(resourceStale.reportRevision);
    expect(targetStale.threads[0]).toMatchObject({
      binding: 'changed',
      currentTarget: { source: { file: 'partials/evidence.md', line: 1 } },
    });
  });

  it('keeps visualization review manifests limited to final DOM owners', async () => {
    const workspace = await createTestWorkspace('analysis-review-visualization');
    workspaces.push(workspace);
    await writeFile(
      path.join(workspace, 'report.md'),
      [
        '---',
        'title: Reviewable visualization',
        'language: en',
        '---',
        '# Reviewable visualization',
        '::::chart{title="Result" description="One result." type="bar"}',
        ':::series{label="Series"}',
        '::point{label="A" value="1"}',
        ':::',
        '::::',
      ].join('\n'),
    );
    const output = path.join(workspace, 'report.html');
    await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');
    const manifest = await embeddedManifest(output);
    const owners = [...html.matchAll(/\bdata-review-target="([^"]+)"/gu)]
      .map((match) => match[1] ?? '')
      .sort();

    expect(manifest.targets.some((target) => target.kind === 'directive:chart')).toBe(true);
    expect(manifest.targets.some((target) => target.kind === 'directive:series')).toBe(false);
    expect(owners).toEqual(manifest.targets.map((target) => target.id).sort());
  });

  it('confines review files lexically and canonically before reading', async () => {
    const workspace = await reviewWorkspace('analysis-review-confinement');
    const outside = await createTestWorkspace('analysis-review-outside');
    workspaces.push(outside);
    const outsideReview = path.join(outside, 'review.json');
    await writeFile(outsideReview, '{}');
    await expect(
      inspectReview({ input: workspace, review: '../outside/review.json' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_OUTSIDE_SOURCE' } });
    await symlink(outsideReview, path.join(workspace, 'review.json'));
    await expect(inspectReview({ input: workspace, review: 'review.json' })).rejects.toMatchObject({
      diagnostic: { code: 'REVIEW_OUTSIDE_SOURCE' },
    });
  });

  it('keeps typed decision and checklist directives as static review targets without approval requirements', async () => {
    const workspace = await reviewWorkspace('analysis-typed-review');
    const output = path.join(workspace, 'report.html');
    await buildReport({ input: workspace, output });
    const manifest = await embeddedManifest(output);
    expect(JSON.stringify(manifest)).not.toContain('requirements');
    const decisionTarget = manifest.targets.find((target) => target.kind === 'directive:decision');
    const checklistTarget = manifest.targets.find(
      (target) => target.kind === 'directive:checklist',
    );
    if (decisionTarget === undefined || checklistTarget === undefined)
      throw new Error('Missing typed targets');
    await writeFile(
      path.join(workspace, 'review.json'),
      serializeReviewArtifact({
        contractVersion: 2,
        report: { revision: manifest.reportRevision },
        threads: [
          {
            id: 'thread-decision',
            segments: [
              {
                id: 'segment-decision',
                reportRevision: manifest.reportRevision,
                target: decisionTarget,
                resolved: false,
                messages: [
                  { id: 'message-decision', author: 'user', message: 'Discuss this decision.' },
                ],
              },
            ],
          },
          {
            id: 'thread-checklist',
            segments: [
              {
                id: 'segment-checklist',
                reportRevision: manifest.reportRevision,
                target: checklistTarget,
                resolved: true,
                messages: [
                  {
                    id: 'message-checklist',
                    author: 'agent',
                    message: 'Checklist remains document content.',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const entry = path.join(workspace, 'report.md');
    await writeFile(
      entry,
      `${await readFile(entry, 'utf8')}\n:::decision{title="New gate" id="new-gate" required=true}\n::decision-option{id="continue" label="Continue"}\n:::\n`,
    );
    await expect(inspectReview({ input: workspace, review: 'review.json' })).resolves.toMatchObject(
      {
        reportStatus: 'stale',
      },
    );
  });

  it('prepares a confined prior review for exact and stale repeat-review builds', async () => {
    const workspace = await reviewWorkspace('analysis-prior-review');
    const first = path.join(workspace, 'first.html');
    await buildReport({ input: workspace, output: first });
    const manifest = await embeddedManifest(first);
    const target = manifest.targets.find((candidate) => candidate.kind === 'markdown:paragraph');
    if (target === undefined) throw new Error('Missing prior-review target');
    await writeFile(
      path.join(workspace, 'prior.json'),
      serializeReviewArtifact({
        contractVersion: 2,
        report: { revision: manifest.reportRevision },
        threads: [
          {
            id: 'thread-a',
            segments: [
              {
                id: 'segment-a',
                reportRevision: manifest.reportRevision,
                target,
                resolved: false,
                messages: [{ id: 'message-a', author: 'user', message: 'Revisit this.' }],
              },
            ],
          },
        ],
      }),
    );
    const exact = path.join(workspace, 'exact.html');
    await buildReport({ input: workspace, output: exact, review: 'prior.json' });
    expect(await readFile(exact, 'utf8')).toContain('data-prior-review="true"');
    const entry = path.join(workspace, 'report.md');
    await writeFile(entry, `${await readFile(entry, 'utf8')}\nChanged after review.\n`);
    await expect(validateReport({ input: workspace, review: 'prior.json' })).resolves.toMatchObject(
      {
        format: 'single-file',
      },
    );
    const stale = path.join(workspace, 'stale.html');
    await buildReport({ input: workspace, output: stale, review: 'prior.json' });
    expect(await readFile(stale, 'utf8')).toContain('&quot;reportStatus&quot;:&quot;stale&quot;');
    const currentManifest = await embeddedManifest(stale);
    const currentTarget = currentManifest.targets.find(
      (candidate) => candidate.kind === 'markdown:paragraph',
    );
    if (currentTarget === undefined) throw new Error('Missing current-revision target');
    await writeFile(
      path.join(workspace, 'next.json'),
      serializeReviewArtifact({
        contractVersion: 2,
        report: { revision: currentManifest.reportRevision },
        threads: [
          {
            id: 'thread-next',
            segments: [
              {
                id: 'segment-next',
                reportRevision: currentManifest.reportRevision,
                target: currentTarget,
                resolved: false,
                messages: [
                  { id: 'message-next', author: 'user', message: 'Current revision is ready.' },
                ],
              },
            ],
          },
        ],
      }),
    );
    const nextA = path.join(workspace, 'next-a.html');
    const nextB = path.join(workspace, 'next-b.html');
    await buildReport({ input: workspace, output: nextA, review: 'next.json' });
    await buildReport({ input: workspace, output: nextB, review: 'next.json' });
    expect(await readFile(nextA)).toEqual(await readFile(nextB));
    expect(await readFile(nextA, 'utf8')).toContain('&quot;reportStatus&quot;:&quot;exact&quot;');
    const sentinel = path.join(workspace, 'sentinel.html');
    await writeFile(sentinel, 'preserve authoritative output');
    await writeFile(path.join(workspace, 'broken.json'), '{broken');
    await expect(
      buildReport({ input: workspace, output: sentinel, review: 'broken.json' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_ARTIFACT_INVALID' } });
    expect(await readFile(sentinel, 'utf8')).toBe('preserve authoritative output');
    await expect(
      buildReport({ input: workspace, output: sentinel, review: 'prior.json' }),
    ).resolves.toMatchObject({
      outputPath: sentinel,
    });
    await expect(
      validateReport({ input: workspace, review: '../outside.json' }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'REVIEW_OUTSIDE_SOURCE' },
    });
    const outside = await createTestWorkspace('prior-outside');
    workspaces.push(outside);
    const outsideReview = path.join(outside, 'outside.json');
    await writeFile(outsideReview, await readFile(path.join(workspace, 'prior.json')));
    await symlink(outsideReview, path.join(workspace, 'prior-link.json'));
    await expect(
      inspectReport({ input: workspace, review: 'prior-link.json' }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'REVIEW_OUTSIDE_SOURCE' },
    });
    const priorPath = path.join(workspace, 'prior.json');
    const priorBytes = await readFile(priorPath);
    await expect(
      buildReport({ input: workspace, output: priorPath, review: 'prior.json' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'OUTPUT_COLLIDES_WITH_SOURCE' } });
    expect(await readFile(priorPath)).toEqual(priorBytes);

    const partialPath = path.join(workspace, 'partials/evidence.md');
    const partialBytes = await readFile(partialPath);
    const markdownReviewBytes = Buffer.concat([Buffer.from('    '), priorBytes]);
    await writeFile(partialPath, markdownReviewBytes);
    await expect(
      buildReport({ input: workspace, output: sentinel, review: 'partials/evidence.md' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_COLLIDES_WITH_SOURCE' } });
    expect(await readFile(partialPath)).toEqual(markdownReviewBytes);
    await writeFile(partialPath, partialBytes);

    const assetPath = path.join(workspace, 'asset.txt');
    await writeFile(assetPath, priorBytes);
    await link(assetPath, path.join(workspace, 'asset-review.json'));
    await expect(
      inspectReport({ input: workspace, review: 'asset-review.json' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_COLLIDES_WITH_SOURCE' } });
    expect(await readFile(assetPath)).toEqual(priorBytes);

    const entryAliasWorkspace = await createTestWorkspace('prior-entry-alias');
    workspaces.push(entryAliasWorkspace);
    await writeFile(path.join(entryAliasWorkspace, 'report.md'), markdownReviewBytes);
    await expect(
      validateReport({ input: entryAliasWorkspace, review: 'report.md' }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_COLLIDES_WITH_SOURCE' } });

    const directoryOwner = await createTestWorkspace('prior-directory-output');
    workspaces.push(directoryOwner);
    const directoryOutput = path.join(directoryOwner, 'artifact');
    await buildReport({
      input: workspace,
      output: directoryOutput,
      format: 'directory',
      review: 'prior.json',
    });
    const directoryBeforeFailure = await hashTree(directoryOutput);
    await writeFile(path.join(workspace, 'oversized.json'), 'x'.repeat(MAX_REVIEW_FILE_BYTES + 1));
    await expect(
      buildReport({
        input: workspace,
        output: directoryOutput,
        format: 'directory',
        review: 'oversized.json',
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_ARTIFACT_INVALID' } });
    expect(await hashTree(directoryOutput)).toStrictEqual(directoryBeforeFailure);
    const directoryRetry = path.join(directoryOwner, 'retry-artifact');
    await expect(
      buildReport({
        input: workspace,
        output: directoryRetry,
        format: 'directory',
        review: 'prior.json',
      }),
    ).resolves.toMatchObject({ outputPath: path.join(directoryRetry, 'index.html') });
  });

  it('classifies malformed, invalid, oversized, missing, and hostile-option review inputs without mutation', async () => {
    const workspace = await reviewWorkspace('analysis-review-failures');
    const sentinel = path.join(workspace, 'report.html');
    const reviewPath = path.join(workspace, 'review.json');
    await writeFile(sentinel, 'preserve output');

    await writeFile(reviewPath, '{not json');
    await expect(inspectReview({ input: workspace, review: 'review.json' })).rejects.toMatchObject({
      diagnostic: {
        code: 'REVIEW_ARTIFACT_INVALID',
        message: 'Review artifact is not valid JSON.',
      },
    });

    await writeFile(reviewPath, JSON.stringify({ contractVersion: 2 }));
    await expect(inspectReview({ input: workspace, review: 'review.json' })).rejects.toMatchObject({
      diagnostic: {
        code: 'REVIEW_ARTIFACT_INVALID',
        details: { issues: expect.any(Array) },
      },
    });

    await writeFile(reviewPath, 'x'.repeat(3_000_001));
    await expect(inspectReview({ input: workspace, review: 'review.json' })).rejects.toMatchObject({
      diagnostic: {
        code: 'REVIEW_ARTIFACT_INVALID',
        details: { maximumBytes: 3_000_000 },
      },
    });

    await expect(inspectReview({ input: workspace, review: 'missing.json' })).rejects.toMatchObject(
      {
        diagnostic: { code: 'REVIEW_READ_FAILED' },
      },
    );
    await expect(inspectReview(null as unknown as InspectReviewOptions)).rejects.toMatchObject({
      diagnostic: { code: 'REVIEW_OPTIONS_INVALID' },
    });
    const accessorOptions = { review: 'review.json' } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, 'input', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute');
      },
    });
    await expect(
      inspectReview(accessorOptions as unknown as InspectReviewOptions),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_OPTIONS_INVALID' } });
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('preserve output');
  });

  it('rejects a report whose finite review target inventory exceeds the public bound', async () => {
    const workspace = await createTestWorkspace('analysis-review-target-limit');
    workspaces.push(workspace);
    await writeFile(
      path.join(workspace, 'report.md'),
      ['# Target limit', ...Array.from({ length: 500 }, (_, index) => `Paragraph ${index}.`)].join(
        '\n\n',
      ),
    );
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'report.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'REVIEW_TARGET_LIMIT_EXCEEDED' } });
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
      readonly share: false;
      readonly neutralizedSourceLinks: 0;
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
      readonly share: false;
      readonly neutralizedSourceLinks: 0;
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

async function reviewWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  await mkdir(path.join(workspace, 'partials'));
  await writeFile(
    path.join(workspace, 'report.md'),
    [
      '---',
      'title: Review protocol',
      '---',
      '# Review protocol',
      '',
      'Entry secret context.',
      '',
      'Equal evidence.',
      '',
      '{{include: partials/evidence.md}}',
      '',
      ':asset[Evidence]{src="asset.txt"}',
      '',
      '```ts',
      "const handoff = 'review.json';",
      '```',
      '',
      ':::section{title="Launch" id="launch"}',
      'Stable section body.',
      ':::',
      '',
      ':::decision{title="Release" id="release" required=true}',
      '::decision-option{id="ship" label="Ship"}',
      '::decision-option{id="hold" label="Hold"}',
      ':::',
      '',
      ':::checklist{title="Gates" id="gates"}',
      '::check-item{id="owner" label="Owner" required=true}',
      ':::',
      '',
    ].join('\n'),
  );
  await writeFile(path.join(workspace, 'partials/evidence.md'), 'Equal evidence.\n');
  await writeFile(path.join(workspace, 'asset.txt'), 'local resource\n');
  return workspace;
}

async function embeddedManifest(output: string): Promise<ReviewTargetManifest> {
  const html = await readFile(output, 'utf8');
  const encoded = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(html)?.[1];
  if (encoded === undefined) throw new Error('Missing embedded review manifest');
  return JSON.parse(
    encoded
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ) as ReviewTargetManifest;
}
