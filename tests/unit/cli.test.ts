import { spawn } from 'node:child_process';
import { chmod, cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  fixReport,
  getAuthoringSchema,
  getSourceContract,
  initProject,
  inspectReport,
  listExamples,
  serializeReviewArtifact,
  validateReport,
  type AgenticReportError,
  type Diagnostic,
} from '../../src/index.js';
import { formatInstalledExamples } from '../../src/cli-examples.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

function glossarySource(...body: readonly string[]): string {
  return [
    '---',
    'contractVersion: 1',
    'title: Fix probe',
    'language: en',
    '---',
    '',
    '# Fix probe',
    '',
    ':::glossary{key="spec" term="spec"}',
    'A written contract.',
    ':::',
    '',
    ...body,
  ].join('\n');
}

async function refusedDiagnostic(source: string): Promise<Diagnostic> {
  return await validateReport({ input: source }).then(
    () => {
      throw new Error('The source was expected to be refused.');
    },
    (error: unknown) => (error as AgenticReportError).diagnostic,
  );
}

describe('CLI transport', () => {
  it('rejects a below-floor runtime through human and JSON CLI transports', async () => {
    const human = await runCliAsNodeVersion(['--version', '--human'], '22.18.0');
    expect(human).toEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        'NODE_VERSION_UNSUPPORTED\n' +
        '  Node.js 22.18.0 is unsupported; agentic-report requires Node.js 24.18.0 or newer.\n' +
        '  \u2192 Install Node.js 24.18.0 or newer, then rerun the same command.\n',
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
        contractVersion: 2,
        report: { revision: `sha256:${'a'.repeat(64)}` },
        threads: [
          {
            id: 'thread-a',
            segments: [
              {
                id: 'segment-a',
                reportRevision: `sha256:${'a'.repeat(64)}`,
                target: {
                  id: 'rt-prior',
                  kind: 'markdown:paragraph',
                  fingerprint: `sha256:${'b'.repeat(64)}`,
                  source: { file: 'report.md', line: 3, column: 1, endLine: 3, endColumn: 18 },
                },
                resolved: false,
                messages: [{ id: 'message-a', author: 'user', message: 'token=private-value' }],
              },
            ],
          },
        ],
      }),
    );

    const result = await runCli(['review', 'review.json', workspace, '--json']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'result',
      contractVersion: 2,
      reportStatus: 'stale',
      threads: [
        {
          binding: 'changed',
          thread: { segments: [{ messages: [{ message: 'token=[REDACTED]' }] }] },
        },
      ],
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
        contractVersion: 2,
        report: { revision: `sha256:${'a'.repeat(64)}` },
        threads: [
          {
            id: 'thread-a',
            segments: [
              {
                id: 'segment-a',
                reportRevision: `sha256:${'a'.repeat(64)}`,
                target: {
                  id: 'rt-prior',
                  kind: 'markdown:paragraph',
                  fingerprint: `sha256:${'b'.repeat(64)}`,
                  source: { file: 'report.md', line: 3, column: 1, endLine: 3, endColumn: 18 },
                },
                resolved: false,
                messages: [
                  { id: 'message-a', author: 'user', message: 'token=human-private-value' },
                ],
              },
            ],
          },
        ],
      }),
    );

    const result = await runCli(['review', 'review.json', workspace, '--human']);

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
      const pretty = await runCli([command, '--human']);
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

  it('describes the human projection each command actually produces', async () => {
    // The distributed documents divide the commands into the ones whose human projection is prose
    // and the ones that answer with an indented document. A flag description that promises prose
    // from a command that emits a document makes those documents false, and the promise is what a
    // reader acts on — so the division is observed against the help text of every command below, and
    // the two lists together must name every command the CLI registers.
    const prose = ['init', 'build', 'validate', 'fix', 'review', 'examples'];
    const indented = ['inspect', 'schema', 'describe'];

    // The two lists are checked against the CLI itself, not against a number written here: a command
    // added later would otherwise keep its promise unobserved, which is exactly how `fix` first
    // slipped through while every other place claimed the rule was universal.
    const rootHelp = await runCli(['--help']);
    const commandSection = rootHelp.stdout.slice(rootHelp.stdout.indexOf('Commands:'));
    const registered = [...commandSection.matchAll(/^ {2}([a-z][a-z-]*)[ |]/gmu)]
      .map(([, name]) => name)
      // `help` is commander's own, not a product command, and answers no report.
      .filter((name) => name !== 'help');
    expect(registered.length).toBeGreaterThan(0);
    expect([...registered].sort()).toEqual([...prose, ...indented].sort());

    for (const command of [...prose, ...indented]) {
      const help = await runCli([command, '--help']);
      expect(help).toMatchObject({ exitCode: 0, stderr: '' });
      const promisesProse = / --human +Emit prose /u.test(help.stdout.replace(/\s+/gu, ' '));
      expect({ command, promisesProse }).toEqual({
        command,
        promisesProse: prose.includes(command),
      });
    }
  });

  it('lists every registered command in the machine-readable catalog', async () => {
    // The catalog is what an agent reads: the machine route is the default, so a command missing
    // from it does not exist for the consumer the product is written for. Registration and catalog
    // live in different files, and nothing sliced them together before — which is how `fix` reached
    // the distributed contract unlisted. Sets are compared in both directions, so the next command
    // added on one side alone fails here rather than at a later reading of the contract.
    const rootHelp = await runCli(['--help']);
    const commandSection = rootHelp.stdout.slice(rootHelp.stdout.indexOf('Commands:'));
    const registered = [...commandSection.matchAll(/^ {2}([a-z][a-z-]*)[ |]/gmu)]
      .map(([, name]) => name)
      // `help` is commander's own, not a product command.
      .filter((name) => name !== 'help');
    expect(registered.length).toBeGreaterThan(0);

    const described = await runCli(['describe']);
    expect(described).toMatchObject({ exitCode: 0, stderr: '' });
    const catalog = Object.keys(
      (JSON.parse(described.stdout) as { readonly commands: Record<string, string> }).commands,
    );

    expect([...catalog].sort()).toEqual([...registered].sort());
    expect(getSourceContract().commands).toEqual(
      (JSON.parse(described.stdout) as { readonly commands: Record<string, string> }).commands,
    );
  });

  it('applies the output rule to every command the agent reference lists', async () => {
    // The rule is stated as a property of the CLI, so it is observed on every command rather than
    // on the ones that were convenient to change: a command that rejects the flags, or answers the
    // same way with and without them, breaks the statement the distributed documents make.
    for (const command of ['schema', 'describe', 'examples']) {
      const agent = await runCli([command]);
      const accepted = await runCli([command, '--json']);
      const human = await runCli([command, '--human']);
      expect(agent).toMatchObject({ exitCode: 0, stderr: '' });
      expect(accepted).toMatchObject({ exitCode: 0, stderr: '' });
      expect(human).toMatchObject({ exitCode: 0, stderr: '' });
      // `--json` names the default rather than selecting a second shape.
      expect(accepted.stdout).toBe(agent.stdout);
      // The agent projection is one compact record; the human projection is not that same line.
      expect(agent.stdout.trimEnd()).not.toContain('\n');
      expect(human.stdout).not.toBe(agent.stdout);
    }

    // Reference data stays reference data: the human projection of a schema is the same document,
    // only indented, so an agent that reads either form gets equal facts.
    const compactSchema = await runCli(['schema']);
    const indentedSchema = await runCli(['schema', '--human']);
    expect(JSON.parse(indentedSchema.stdout)).toEqual(JSON.parse(compactSchema.stdout));
    expect(indentedSchema.stdout.split('\n').length).toBeGreaterThan(2);
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

    const human = await runCli(['init', humanDestination, '--human']);
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
      const human = await runCli(['init', path.join(unwritableParent, 'project'), '--human']);
      expect(human.exitCode).toBe(1);
      expect(human.stdout).toBe('');
      expect(human.stderr).toContain('INIT_PUBLICATION_FAILED');
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

  it('reports an explicit share-safe build count in JSON and human output', async () => {
    const workspace = await createTestWorkspace('cli-share');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');
    const href = 'http://127.0.0.1:7789/open?path=%2FUsers%2Ffixture%2Fprivate%2Fsource.ts&line=42';
    await writeFile(source, `# Share\nOpen :source-link{label="source.ts:42" href="${href}"}.\n`);
    const plainSource = path.join(workspace, 'plain.md');
    await writeFile(plainSource, '# Share without workstation links\n');
    const jsonOutput = path.join(workspace, 'share.json.html');
    const humanOutput = path.join(workspace, 'share.human.html');
    const [json, human] = await Promise.all([
      runCli(['build', source, '--share', '--output', jsonOutput, '--json']),
      runCli(['build', plainSource, '--share', '--output', humanOutput, '--human']),
    ]);
    expect(json).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(json.stdout)).toMatchObject({
      type: 'result',
      share: true,
      neutralizedSourceLinks: 1,
    });
    expect(await readFile(jsonOutput, 'utf8')).not.toContain('%2FUsers%2Ffixture%2Fprivate');
    expect(human).toMatchObject({ exitCode: 0, stderr: '' });
    expect(human.stdout).toMatch(/; neutralized 0 source links\n$/u);
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

  it('shows every violation with its place in both projections and defaults to the agent one', async () => {
    const workspace = await createTestWorkspace('cli-inventory-projection');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');
    await writeFile(
      source,
      ['# Inventory', '', ':unknown-one', '', ':unknown-two', '', ':unknown-three', ''].join('\n'),
    );

    // Without any flag the consumer is an agent: the run answers in NDJSON.
    const machine = await runCli(['validate', source], workspace);
    expect(machine).toMatchObject({ exitCode: 1, stderr: '' });
    const record = JSON.parse(machine.stdout) as {
      readonly code: string;
      readonly related?: readonly { readonly code: string }[];
    };
    expect([record.code, ...(record.related ?? []).map((entry) => entry.code)]).toEqual([
      'UNSUPPORTED_DIRECTIVE',
      'UNSUPPORTED_DIRECTIVE',
      'UNSUPPORTED_DIRECTIVE',
    ]);

    // The human projection shows the same three facts, each with a place a terminal can open, and
    // says how many there are; it is a projection of one model, not a shorter second report.
    const human = await runCli(['validate', source, '--human'], workspace);
    expect(human).toMatchObject({ exitCode: 1, stdout: '' });
    expect(human.stderr.match(/UNSUPPORTED_DIRECTIVE/gu)).toHaveLength(3);
    expect(human.stderr).toContain(`${source}:3:1`);
    expect(human.stderr).toContain(`${source}:5:1`);
    expect(human.stderr).toContain(`${source}:7:1`);
    expect(human.stderr.trimEnd().endsWith('3 violations')).toBe(true);
  });

  it('carries a computed replacement as data and withholds unsafe replacements', async () => {
    const workspace = await createTestWorkspace('cli-fix-data');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');

    await writeFile(source, glossarySource('The spec explains it.', ''));
    const violation = await refusedDiagnostic(source);
    expect(violation.fix).toMatchObject({ replacement: ':term[spec]{key="spec"}' });

    // The replacement is data, so a consumer applies it without parsing prose: these bytes at these
    // offsets must produce a source that validates.
    const authored = await readFile(source, 'utf8');
    const fix = violation.fix;
    if (fix === undefined) throw new Error('The violation carried no applicable fix.');
    await writeFile(
      source,
      `${authored.slice(0, fix.start)}${fix.replacement}${authored.slice(fix.end)}`,
    );
    await expect(validateReport({ input: source })).resolves.toMatchObject({
      format: 'single-file',
    });

    // An occurrence inside a link carries no fix at all. Applying one would have to replace the
    // whole link — the envelope the term sits in — and the author's URL would be gone; a green
    // validate afterwards would not notice, because the loss happens inside the replaced range.
    //
    // Both link shapes are exercised because they fail differently. When the label is longer than
    // the term, the visible span grows too, so a check written in visible coordinates already sees
    // the expansion. When the label is exactly the term, the visible span does not move at all while
    // the authored span covers `[spec](url)`, and only a check in authored coordinates notices.
    for (const authored of [
      'Read the [spec guide](https://example.com/s).',
      'Read the [spec](https://example.com/s).',
      'Read the [spec][handle].\n\n[handle]: https://example.com/s',
    ]) {
      await writeFile(source, glossarySource(authored, ''));
      const linked = await refusedDiagnostic(source);
      expect(linked.code).toBe('UNMARKED_GLOSSARY_TERM');
      expect(linked.fix).toBeUndefined();
    }

    // A replacement sanitization would alter is withheld: applying it would write `[REDACTED]` over
    // the author's own bytes. The prose remediation still answers, redacted as every other field is.
    await writeFile(
      source,
      [
        '---',
        'contractVersion: 1',
        'title: Fix probe',
        'language: en',
        '---',
        '',
        '# Fix probe',
        '',
        ':::glossary{key="creds" term="token=abc123"}',
        'A credential-shaped term.',
        ':::',
        '',
        'We write token=abc123 in prose.',
        '',
      ].join('\n'),
    );
    const credentialed = await refusedDiagnostic(source);
    expect(credentialed.code).toBe('UNMARKED_GLOSSARY_TERM');
    expect(credentialed.fix).toBeUndefined();
    expect(credentialed.remediation).toContain('[REDACTED]');
  });

  it('applies computed fixes exactly and remains idempotent', async () => {
    const workspace = await createTestWorkspace('cli-fix-apply');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');
    // `fix` writes those replacements and nothing else: every other byte is untouched, which a green
    // validate alone would not distinguish from a reformatted file. Three violations in one file are
    // the point — every replacement is addressed in the bytes of the file as it was read, so a run
    // that writes one after another without accounting for the shift corrupts the later ones. A
    // single-violation source cannot tell that implementation from this one.
    const beforeFix = glossarySource(
      ':::section{title="First"}',
      'The spec appears here.',
      ':::',
      '',
      ':::section{title="Second"}',
      'The spec appears again.',
      ':::',
      '',
      ':::section{title="Third"}',
      'The spec appears once more.',
      ':::',
      '',
      '<!-- a comment kept verbatim -->',
      '',
    );
    await writeFile(source, beforeFix);
    const applied = await runCli(['fix', source], workspace);
    expect(applied).toMatchObject({ exitCode: 0, stderr: '' });
    const afterFix = await readFile(source, 'utf8');
    expect(afterFix).toBe(beforeFix.replaceAll('The spec', 'The :term[spec]{key="spec"}'));
    await expect(validateReport({ input: source })).resolves.toMatchObject({
      format: 'single-file',
    });

    // Running it again changes nothing: repairs do not accumulate.
    await expect(fixReport({ input: source })).resolves.toMatchObject({ applied: [] });
    expect(await readFile(source, 'utf8')).toBe(afterFix);
  });

  it('keeps checking commands read-only and identifies an unrepairable source', async () => {
    const workspace = await createTestWorkspace('cli-fix-read-only');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');
    const beforeFix = glossarySource(
      ':::section{title="First"}',
      'The spec appears here.',
      ':::',
      '',
      ':::section{title="Second"}',
      'The spec appears again.',
      ':::',
      '',
      ':::section{title="Third"}',
      'The spec appears once more.',
      ':::',
      '',
      '<!-- a comment kept verbatim -->',
      '',
    );
    // The commands that check never write, and that rule is what `fix` exists to keep intact.
    await writeFile(source, beforeFix);
    await validateReport({ input: source }).catch(() => undefined);
    await inspectReport({ input: source }).catch(() => undefined);
    expect(await readFile(source, 'utf8')).toBe(beforeFix);

    // A source whose only violation has no applicable repair still gets its identities named: the
    // command answers about the project it read, not about the argument it was handed. A directory
    // argument would otherwise be reported where the entry file belongs.
    await writeFile(source, glossarySource('Read the [spec](https://example.com/s).', ''));
    const unrepairable = await fixReport({ input: workspace });
    expect(unrepairable).toMatchObject({
      applied: [],
      projectPath: await realpath(workspace),
      entryPath: path.join(await realpath(workspace), 'report.md'),
    });
    expect(unrepairable.remaining).toHaveLength(1);

    expect(await readFile(source, 'utf8')).toBe(
      glossarySource('Read the [spec](https://example.com/s).', ''),
    );
  });

  it('names the unknown manifest key and proposes a replacement only when one is close', async () => {
    const workspace = await createTestWorkspace('cli-manifest-key');
    workspaces.push(workspace);
    const source = path.join(workspace, 'report.md');

    // A key the closeness measure actually accepts: `layuot` is two edits from `layout`, and a
    // six-character key tolerates two. The refusal names the key and the field to use instead of
    // sending the author to read the whole schema. Asserting the proposal itself matters: the
    // accepted-key list contains every field name, so a substring check on a field name stays green
    // even when the proposal branch is gone.
    await writeFile(
      source,
      ['---', 'title: Probe', 'layuot: Probe', '---', '', '# Probe', ''].join('\n'),
    );
    const near = await runCli(['validate', source], workspace);
    expect(near).toMatchObject({ exitCode: 1, stderr: '' });
    const nearRecord = JSON.parse(near.stdout) as {
      readonly code: string;
      readonly message: string;
      readonly remediation: string;
    };
    expect(nearRecord.code).toBe('INVALID_MANIFEST');
    expect(nearRecord.message).toContain('layuot');
    expect(nearRecord.remediation).toMatch(/^Use layout instead of layuot\b/u);

    // A key resembling nothing gets the accepted set, not an invented suggestion. `kind` is real
    // elsewhere in the product — it is a callout attribute — and still resembles no manifest field:
    // four characters tolerate one edit, and the nearest field is four away.
    for (const distantKey of ['kind', 'фывапролдж']) {
      await writeFile(
        source,
        ['---', 'title: Probe', `${distantKey}: Probe`, '---', '', '# Probe', ''].join('\n'),
      );
      const far = await runCli(['validate', source], workspace);
      const farRecord = JSON.parse(far.stdout) as {
        readonly message: string;
        readonly remediation: string;
      };
      expect(farRecord.message).toContain(distantKey);
      expect(farRecord.remediation).toContain('Accepted keys are');
      expect(farRecord.remediation).not.toMatch(/Use \w+ instead/u);
    }
  });

  it('prints a useful human validate result', async () => {
    const workspace = await createTestWorkspace('cli-validate-human');
    workspaces.push(workspace);
    const source = path.resolve('tests/fixtures/analysis/parity');

    const humanValidate = await runCli(['validate', source, '--human'], workspace);
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
    const humanInspect = await runCli(['inspect', source, '--human'], workspace);
    expect(humanInspect).toMatchObject({ exitCode: 0, stderr: '' });
    expect(JSON.parse(humanInspect.stdout)).toMatchObject({
      entryPath: path.join(source, 'report.md'),
      output: { format: 'single-file', runtimePlacement: 'inline' },
      warnings: [],
    });
  });

  it('redacts signed URLs and source paths from a human analysis failure', async () => {
    const { workspace, source } = await createCredentialAnalysisSource(true);
    const brokenHuman = await runCli(['validate', source, '--human'], workspace);
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
    const fixedHuman = await runCli(['validate', source, '--human'], workspace);
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
      contractVersion: 2,
      report: { revision: `sha256:${'a'.repeat(64)}` },
      threads: [],
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
