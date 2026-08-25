import { spawn } from 'node:child_process';
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getAuthoringSchema,
  getSourceContract,
  initProject,
  listExamples,
  serializeReviewArtifact,
} from '../../src/index.js';
import { formatInstalledExamples } from '../../src/cli-examples.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('CLI transport', () => {
  it('rejects a below-floor runtime through human and JSON CLI transports', async () => {
    const human = await runCliAsNodeVersion(['--version'], '22.18.0');
    expect(human).toEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        'NODE_VERSION_UNSUPPORTED: Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.\n' +
        'Install Node.js 24.18.0 or newer, then rerun the same command.\n',
    });

    const machine = await runCliAsNodeVersion(['--version', '--json'], '22.18.0');
    expect(machine).toMatchObject({ exitCode: 1, stderr: '' });
    expect(JSON.parse(machine.stdout)).toEqual({
      type: 'diagnostic',
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      level: 'error',
      code: 'NODE_VERSION_UNSUPPORTED',
      message: 'Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.',
      remediation: 'Install Node.js 24.18.0 or newer, then rerun the same command.',
      details: { currentVersion: '22.18.0', requiredEngine: '>=24.18.0' },
    });
  });

  it('resolves a confined review artifact through bounded sanitized NDJSON', async () => {
    const workspace = await createTestWorkspace('cli-review');
    workspaces.push(workspace);
    await writeFile(path.join(workspace, 'report.md'), '# Review source\n\nTarget paragraph.\n');
    await writeFile(
      path.join(workspace, 'review.json'),
      serializeReviewArtifact({
        contractVersion: 1,
        report: { revision: `sha256:${'a'.repeat(64)}` },
        responses: [
          {
            id: 'response-a',
            kind: 'comment',
            target: {
              id: 'rt-prior',
              kind: 'markdown:paragraph',
              fingerprint: `sha256:${'b'.repeat(64)}`,
              source: { file: 'report.md', line: 3, column: 1, endLine: 3, endColumn: 18 },
            },
            message: 'token=private-value',
          },
        ],
      }),
    );

    const result = await runCli(['review', 'review.json', workspace, '--json']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'result',
      contractVersion: 1,
      reportStatus: 'stale',
      responses: [{ binding: 'changed', response: { message: 'token=[REDACTED]' } }],
    });
    expect(result.stdout).not.toContain('private-value');
  });

  it('forwards prior-review input through the build CLI command', async () => {
    const workspace = await createPriorReviewCliWorkspace('cli-build-prior-review');
    const output = path.join(workspace, 'report.html');
    const build = await runCli([
      'build',
      workspace,
      '--output',
      output,
      '--review',
      'prior.json',
      '--json',
    ]);
    expect(build).toMatchObject({ exitCode: 0, stderr: '' });
    expect(await readFile(output, 'utf8')).toContain('data-prior-review="true"');
  });

  it('forwards malformed prior-review input through the validate CLI command', async () => {
    const workspace = await createPriorReviewCliWorkspace('cli-validate-prior-review');
    await writeFile(path.join(workspace, 'broken.json'), '{broken');
    const validate = await runCli(['validate', workspace, '--review', 'broken.json', '--json']);
    expect(validate).toMatchObject({ exitCode: 1, stderr: '' });
    expect(JSON.parse(validate.stdout)).toMatchObject({
      type: 'diagnostic',
      code: 'REVIEW_ARTIFACT_INVALID',
    });
  });

  it('forwards escaped prior-review input through the inspect CLI command', async () => {
    const workspace = await createPriorReviewCliWorkspace('cli-inspect-prior-review');
    const inspect = await runCli(['inspect', workspace, '--review', '../outside.json', '--json']);
    expect(inspect).toMatchObject({ exitCode: 1, stderr: '' });
    expect(JSON.parse(inspect.stdout)).toMatchObject({
      type: 'diagnostic',
      code: 'REVIEW_OUTSIDE_SOURCE',
    });
  });

  it('prints only a bounded human review summary', async () => {
    const workspace = await createTestWorkspace('cli-review-human');
    workspaces.push(workspace);
    await writeFile(path.join(workspace, 'report.md'), '# Review source\n\nTarget paragraph.\n');
    await writeFile(
      path.join(workspace, 'review.json'),
      serializeReviewArtifact({
        contractVersion: 1,
        report: { revision: `sha256:${'a'.repeat(64)}` },
        responses: [
          {
            id: 'response-a',
            kind: 'comment',
            target: {
              id: 'rt-prior',
              kind: 'markdown:paragraph',
              fingerprint: `sha256:${'b'.repeat(64)}`,
              source: { file: 'report.md', line: 3, column: 1, endLine: 3, endColumn: 18 },
            },
            message: 'token=human-private-value',
          },
        ],
      }),
    );

    const result = await runCli(['review', 'review.json', workspace]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Review stale: 0 exact, 1 changed, 0 missing, 0 ambiguous\n',
      stderr: '',
    });
    expect(result.stdout).not.toMatch(/human-private-value|Target paragraph/u);
  });

  it('serializes injected registry examples through the complete adapter used by the CLI action', async () => {
    const examplesRoot = path.join(path.sep, 'installed package', 'examples');
    const example = {
      id: 'special',
      path: 'nested #/100%',
      entry: 'entries/custom #1%.markdown',
      title: 'Special entry',
      description: 'Composition fixture.',
      classes: ['fixture'],
      starter: { default: true },
    } as const;
    const expectedEntry = path.join(
      examplesRoot,
      'nested #',
      '100%',
      'entries',
      'custom #1%.markdown',
    );

    expect(JSON.parse(formatInstalledExamples(examplesRoot, 7, [example], true))).toEqual({
      contractVersion: 7,
      examples: [{ ...example, entry: expectedEntry }],
    });
    expect(formatInstalledExamples(examplesRoot, 7, [example], false)).toBe(
      `special: ${expectedEntry}\n`,
    );

    const cliSource = await readFile(path.resolve('src/cli.ts'), 'utf8');
    const actionStart = cliSource.indexOf(".command('examples')");
    const actionEnd = cliSource.indexOf('\nconst compatibilityDiagnostic', actionStart);
    const actionSource = cliSource.slice(actionStart, actionEnd);
    expect(actionStart).toBeGreaterThanOrEqual(0);
    expect(actionEnd).toBeGreaterThan(actionStart);
    expect(actionSource).toContain('formatInstalledExamples(');
    expect(actionSource).not.toContain('.map(');
    expect(actionSource).not.toContain('example.entry');

    const inwardSource = await readFile(path.resolve('src/authoring/example-path.ts'), 'utf8');
    const outwardSource = await readFile(path.resolve('src/cli-examples.ts'), 'utf8');
    expect(inwardSource).not.toMatch(/discovery|JSON\.stringify|formatInstalledExamples/u);
    expect(outwardSource).toContain("from './discovery.js'");
    expect(outwardSource).toContain('export function formatInstalledExamples(');
  });

  it('keeps describe/discover, all schema scopes and examples equal to the ESM API', async () => {
    for (const command of ['describe', 'discover']) {
      const compact = await runCli([command, '--json']);
      const pretty = await runCli([command]);
      expect(compact).toMatchObject({ exitCode: 0, stderr: '' });
      expect(pretty).toMatchObject({ exitCode: 0, stderr: '' });
      expect(JSON.parse(compact.stdout)).toEqual(getSourceContract());
      expect(JSON.parse(pretty.stdout)).toEqual(getSourceContract());
      expect(compact.stdout.split('\n')).toHaveLength(2);
      expect(pretty.stdout.split('\n').length).toBeGreaterThan(2);
    }

    for (const scope of ['manifest', 'directives', 'source'] as const) {
      const result = await runCli(['schema', '--scope', scope]);
      expect(result).toMatchObject({ exitCode: 0, stderr: '' });
      expect(JSON.parse(result.stdout)).toEqual(getAuthoringSchema(scope));
    }

    const examples = await runCli(['examples', '--json']);
    const value = JSON.parse(examples.stdout) as {
      readonly examples: readonly { readonly id: string; readonly entry: string }[];
    };
    expect(examples).toMatchObject({ exitCode: 0, stderr: '' });
    expect(value.examples.map(({ entry: _entry, ...example }) => example)).toEqual(
      listExamples().map(({ entry: _entry, ...example }) => example),
    );
    for (const [index, example] of listExamples().entries()) {
      expect(
        value.examples[index]?.entry.endsWith(
          path.join('examples', ...example.path.split('/'), ...example.entry.split('/')),
        ),
      ).toBe(true);
    }
  });

  it('initializes through the CLI with exact human and machine results matching the ESM API', async () => {
    const workspace = await createTestWorkspace('cli-init');
    workspaces.push(workspace);
    const esmDestination = path.join(workspace, 'esm-project');
    const jsonDestination = path.join(workspace, 'json-project');
    const humanDestination = path.join(workspace, 'human-project');
    const esm = await initProject({ destination: esmDestination });

    const machine = await runCli(['init', jsonDestination, '--starter', 'basic', '--json']);
    expect(machine).toMatchObject({ exitCode: 0, stderr: '' });
    const record = JSON.parse(machine.stdout) as Record<string, unknown>;
    expect(Object.keys(record)).toEqual([
      'type',
      'runId',
      'starterId',
      'starterTitle',
      'projectPath',
      'entryPath',
      'files',
    ]);
    expect(record).toEqual({
      type: 'result',
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      starterId: esm.starterId,
      starterTitle: esm.starterTitle,
      projectPath: jsonDestination,
      entryPath: path.join(jsonDestination, 'report.md'),
      files: esm.files,
    });
    expect(machine.stdout.split('\n')).toHaveLength(2);

    const human = await runCli(['init', humanDestination]);
    expect(human).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `Created ${humanDestination} from starter basic (3 files)\n`,
    });
  });

  it('routes init destination and publication failures through the common transport', async () => {
    const workspace = await createTestWorkspace('cli-init-failures');
    workspaces.push(workspace);
    const existing = path.join(workspace, 'existing');
    await mkdir(existing);

    const machine = await runCli(['init', existing, '--json']);
    expect(machine).toMatchObject({ exitCode: 1, stderr: '' });
    expect(JSON.parse(machine.stdout)).toMatchObject({
      type: 'diagnostic',
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      level: 'error',
      code: 'INIT_DESTINATION_EXISTS',
    });

    const unwritableParent = path.join(workspace, 'unwritable');
    await mkdir(unwritableParent);
    await chmod(unwritableParent, 0o500);
    try {
      const human = await runCli(['init', path.join(unwritableParent, 'project')]);
      expect(human.exitCode).toBe(1);
      expect(human.stdout).toBe('');
      expect(human.stderr).toContain('INIT_PUBLICATION_FAILED:');
      expect(human.stderr).toContain('Inspect the destination state');
    } finally {
      await chmod(unwritableParent, 0o700);
    }
  });

  it('builds and reads the packaged starter discovered through the workspace CLI', async () => {
    const workspace = await createTestWorkspace('cli-basic-starter');
    workspaces.push(workspace);
    const examples = await runCli(['examples', '--json']);
    const inventory = JSON.parse(examples.stdout) as {
      readonly examples: readonly { readonly id: string; readonly entry: string }[];
    };
    const basic = inventory.examples.find((example) => example.id === 'basic');
    if (basic === undefined) throw new Error('Missing basic starter from workspace CLI');
    const output = path.join(workspace, 'basic.html');
    const build = await runCli(['build', basic.entry, '--output', output, '--json']);
    expect(build).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(build.stdout)).toMatchObject({ type: 'result', outputPath: output });
    const html = await readFile(output, 'utf8');
    expect(html).toMatch(
      /<h1[^>]*id="release-decision-report"[^>]*>Release decision report<\/h1>/u,
    );
    expect(html).toContain('>Recommendation</p>');
    expect(html).toContain('>Download the evidence map</a>');
    expect(html).toContain('data-start="1"');
  });

  it('forwards a valid directory format through the CLI', async () => {
    const workspace = await createTestWorkspace('cli-directory');
    workspaces.push(workspace);
    const output = path.join(workspace, 'artifact');
    const build = await runCli([
      'build',
      path.resolve('examples/basic'),
      '--output',
      output,
      '--format',
      'directory',
      '--json',
    ]);

    expect(build).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(build.stdout)).toMatchObject({
      type: 'result',
      outputPath: path.join(output, 'index.html'),
      format: 'directory',
    });
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    expect(html).toMatch(/<script src="assets\/runtime\.[a-f0-9]{12}\.js" defer=""><\/script>/u);
    expect(html).toMatch(/<link rel="stylesheet" href="assets\/document\.[a-f0-9]{12}\.css"\/>/u);
    expect(html).not.toContain('<script>');
  });

  it('serializes validate state without output mutation', async () => {
    const { workspace, singleSentinel, directorySentinel } =
      await createAnalysisWorkspace('cli-validate');
    const source = path.resolve('tests/fixtures/analysis/parity');

    const validate = await runCli(['validate', source, '--json'], workspace);
    expect(validate).toMatchObject({ exitCode: 0, stderr: '' });
    const validateRecord = JSON.parse(validate.stdout) as Record<string, unknown>;
    const { type: validateType, runId: validateRunId, ...validateResult } = validateRecord;
    expect(validateType).toBe('result');
    expect(validateRunId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(validateResult).toStrictEqual({
      contractVersion: 1,
      projectPath: source,
      entryPath: path.join(source, 'report.md'),
      format: 'single-file',
      runtimePlacement: 'inline',
      warnings: [],
    });
    await expect(readFile(singleSentinel, 'utf8')).resolves.toBe('keep single');
    await expect(readFile(directorySentinel, 'utf8')).resolves.toBe('keep directory');
  });

  it('serializes inspect state without output mutation', async () => {
    const { workspace, singleSentinel, directorySentinel } =
      await createAnalysisWorkspace('cli-inspect');
    const source = path.resolve('tests/fixtures/analysis/parity');
    const inspect = await runCli(['inspect', source, '--format', 'directory', '--json'], workspace);
    expect(inspect).toMatchObject({ exitCode: 0, stderr: '' });
    const inspectRecord = JSON.parse(inspect.stdout) as Record<string, unknown>;
    const { type: inspectType, runId: inspectRunId, ...inspectResult } = inspectRecord;
    expect(inspectType).toBe('result');
    expect(inspectRunId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(inspectResult).toMatchObject({
      contractVersion: 1,
      projectPath: source,
      entryPath: path.join(source, 'report.md'),
      output: { format: 'directory', runtimePlacement: 'external' },
      sourceFiles: expect.arrayContaining(['report.md', 'assets/diagram.svg']),
      observed: {
        directives: ['asset', 'callout', 'demo', 'font'],
        resources: { images: 2, downloads: 1, fonts: 1 },
      },
      catalog: {
        commands: expect.objectContaining({
          validate: expect.any(String),
          inspect: expect.any(String),
          build: expect.any(String),
        }),
      },
      warnings: [],
    });

    await expect(readFile(singleSentinel, 'utf8')).resolves.toBe('keep single');
    await expect(readFile(directorySentinel, 'utf8')).resolves.toBe('keep directory');
  });

  it('prints a useful human validate result', async () => {
    const workspace = await createTestWorkspace('cli-validate-human');
    workspaces.push(workspace);
    const source = path.resolve('tests/fixtures/analysis/parity');

    const humanValidate = await runCli(['validate', source], workspace);
    expect(humanValidate).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `Validated ${path.join(source, 'report.md')} (single-file, inline runtime)\n`,
    });
  });

  it('prints a useful human inspect result', async () => {
    const workspace = await createTestWorkspace('cli-inspect-human');
    workspaces.push(workspace);
    const source = path.resolve('tests/fixtures/analysis/parity');
    const humanInspect = await runCli(['inspect', source], workspace);
    expect(humanInspect).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(humanInspect.stdout)).toMatchObject({
      entryPath: path.join(source, 'report.md'),
      output: { format: 'single-file', runtimePlacement: 'inline' },
      warnings: [],
    });
  });

  it('redacts signed URLs and source paths from a human analysis failure', async () => {
    const { workspace, source } = await createCredentialAnalysisSource(true);
    const brokenHuman = await runCli(['validate', source], workspace);
    for (const output of [brokenHuman.stdout, brokenHuman.stderr]) {
      expect(output).not.toMatch(
        /alice|password|path-sentinel|credential-sentinel|signature-sentinel|security-token-sentinel/u,
      );
    }
    expect(brokenHuman).toMatchObject({ exitCode: 1, stdout: '' });
    expect(brokenHuman.stderr).toContain('[REDACTED]');
  });

  it('redacts signed URLs and source paths from an NDJSON analysis failure', async () => {
    const { workspace, source } = await createCredentialAnalysisSource(true);
    const brokenJson = await runCli(['validate', source, '--json'], workspace);
    expect(brokenJson.stdout).not.toMatch(
      /alice|password|path-sentinel|credential-sentinel|signature-sentinel|security-token-sentinel/u,
    );
    expect(brokenJson).toMatchObject({ exitCode: 1, stderr: '' });
    expect(brokenJson.stdout).toContain('[REDACTED]');
  });

  it('redacts a successful credential-bearing path from human analysis output', async () => {
    const { workspace, source } = await createCredentialAnalysisSource(false);
    const fixedHuman = await runCli(['validate', source], workspace);
    const expectedEntry = path.join(workspace, 'token=[REDACTED]', 'report.md');
    expect(fixedHuman).toEqual({
      exitCode: 0,
      stdout: `Validated ${expectedEntry} (single-file, inline runtime)\n`,
      stderr: '',
    });
  });

  it('redacts a successful credential-bearing path from NDJSON analysis output', async () => {
    const { workspace, source } = await createCredentialAnalysisSource(false);
    const fixedJson = await runCli(['validate', source, '--json'], workspace);
    const expectedEntry = path.join(workspace, 'token=[REDACTED]', 'report.md');
    expect(fixedJson).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(fixedJson.stdout)).toMatchObject({
      type: 'result',
      projectPath: path.dirname(expectedEntry),
      entryPath: expectedEntry,
    });
    expect(fixedJson.stdout).not.toContain('path-sentinel');
  });

  it('emits an analysis warning before the NDJSON result and retains it in the result', async () => {
    const workspace = await createTestWorkspace('cli-analysis-warning');
    workspaces.push(workspace);
    const source = path.join(workspace, 'source');
    await cp(path.resolve('tests/fixtures/analysis/parity'), source, { recursive: true });
    await writeFile(
      path.join(source, 'agentic-report.yaml'),
      'title: Warning fixture\noutput:\n  maxInlineBytes: 1\n',
    );

    const outcome = await runCli(['validate', source, '--json'], workspace);
    expect(outcome).toMatchObject({ exitCode: 0, stderr: '' });
    const records = outcome.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: 'diagnostic',
      level: 'warning',
      code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
      details: { bundledBytes: expect.any(Number), threshold: 1 },
    });
    expect(records[1]).toMatchObject({
      type: 'result',
      format: 'single-file',
      runtimePlacement: 'inline',
      warnings: [
        {
          level: 'warning',
          code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
          details: { bundledBytes: expect.any(Number), threshold: 1 },
        },
      ],
    });
    expect(records[0]?.runId).toBe(records[1]?.runId);
  });

  it('emits NDJSON with correlation context for an invalid option value', async () => {
    const result = await runCli(['build', 'examples/basic', '--format', 'wrong', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'diagnostic',
      level: 'error',
      code: 'CLI_ARGUMENT_INVALID',
      remediation: 'Run `agentic-report --help` and correct the command or option value.',
    });
    expect(JSON.parse(result.stdout).runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects the retired scripts option instead of preserving a compatibility branch', async () => {
    const result = await runCli(['build', 'examples/basic', '--scripts', 'none', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'diagnostic',
      level: 'error',
      code: 'CLI_ARGUMENT_INVALID',
    });
  });

  it('classifies a missing partial as an actionable input failure', async () => {
    const workspace = await createTestWorkspace('cli-missing-partial');
    workspaces.push(workspace);
    await writeFile(path.join(workspace, 'report.md'), '# Report\n{{include: missing.md}}\n');
    const result = await runCli(['build', workspace, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'diagnostic',
      code: 'PARTIAL_READ_FAILED',
      source: {
        file: path.join(workspace, 'report.md'),
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: expect.any(Number),
      },
      details: { reference: 'missing.md', target: path.join(workspace, 'missing.md') },
    });
  });

  it('reports an external manifest field at its authored range', async () => {
    const workspace = await createTestWorkspace('cli-invalid-manifest');
    workspaces.push(workspace);
    const manifestPath = path.join(workspace, 'agentic-report.yaml');
    await writeFile(path.join(workspace, 'report.md'), '# Report\n');
    await writeFile(manifestPath, 'theme: ultraviolet\n');
    const result = await runCli(['build', workspace, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'diagnostic',
      code: 'INVALID_MANIFEST',
      source: {
        file: manifestPath,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: expect.any(Number),
      },
    });
  });
});

describe('ESM entry compatibility', () => {
  it('throws the public diagnostic before exposing the API below the Node floor', async () => {
    const entryUrl = pathToFileURL(path.resolve('dist/node/index.js')).href;
    const outcome = await runNodeBootstrap(`
      Object.defineProperty(process.versions, 'node', { value: '22.18.0' });
      try {
        await import(${JSON.stringify(entryUrl)});
        console.error('ESM entry unexpectedly loaded below the Node floor.');
        process.exitCode = 97;
      } catch (error) {
        console.log(JSON.stringify({
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : undefined,
          diagnostic: typeof error === 'object' && error !== null && 'diagnostic' in error
            ? error.diagnostic
            : undefined,
        }));
      }
    `);

    expect(outcome).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(outcome.stdout)).toEqual({
      name: 'AgenticReportError',
      message: 'Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.',
      diagnostic: {
        level: 'error',
        code: 'NODE_VERSION_UNSUPPORTED',
        message:
          'Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.',
        remediation: 'Install Node.js 24.18.0 or newer, then rerun the same command.',
        details: { currentVersion: '22.18.0', requiredEngine: '>=24.18.0' },
      },
    });
  });
});

async function runCli(
  arguments_: readonly string[],
  cwd?: string,
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment.NO_COLOR;
    delete environment.FORCE_COLOR;
    const child = spawn(process.execPath, [path.resolve('dist/node/cli.js'), ...arguments_], {
      env: environment,
      ...(cwd === undefined ? {} : { cwd }),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function runCliAsNodeVersion(
  arguments_: readonly string[],
  nodeVersion: string,
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  const cliPath = path.resolve('dist/node/cli.js');
  return await runNodeBootstrap(`
    Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(nodeVersion)} });
    process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ...${JSON.stringify(arguments_)}];
    await import(${JSON.stringify(pathToFileURL(cliPath).href)});
  `);
}

async function runNodeBootstrap(
  source: string,
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      env: { PATH: process.env.PATH, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function createAnalysisWorkspace(prefix: string): Promise<{
  readonly workspace: string;
  readonly singleSentinel: string;
  readonly directorySentinel: string;
}> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  const singleSentinel = path.join(workspace, 'report.html');
  const directorySentinel = path.join(workspace, 'report-artifact', 'sentinel.txt');
  await writeFile(singleSentinel, 'keep single');
  await mkdir(path.dirname(directorySentinel));
  await writeFile(directorySentinel, 'keep directory');
  return { workspace, singleSentinel, directorySentinel };
}

async function createPriorReviewCliWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  await writeFile(path.join(workspace, 'report.md'), '# Review source\n\nTarget paragraph.\n');
  await writeFile(
    path.join(workspace, 'prior.json'),
    serializeReviewArtifact({
      contractVersion: 1,
      report: { revision: `sha256:${'a'.repeat(64)}` },
      responses: [],
    }),
  );
  return workspace;
}

async function createCredentialAnalysisSource(
  broken: boolean,
): Promise<{ readonly workspace: string; readonly source: string }> {
  const workspace = await createTestWorkspace('cli-transport-redaction');
  workspaces.push(workspace);
  const source = path.join(workspace, 'token=path-sentinel');
  await mkdir(source);
  await writeFile(
    path.join(source, 'report.md'),
    broken
      ? '# Broken\n\n![Remote](https://alice:password@local.test/image.png?X-Amz-Credential=credential-sentinel&X-Amz-Signature=signature-sentinel&X-Amz-Security-Token=security-token-sentinel)\n'
      : '# Fixed\n',
  );
  return { workspace, source };
}
