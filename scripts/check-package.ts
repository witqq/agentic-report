import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

import { inspectExecutableSearch } from './package-provenance.ts';

const execFileAsync = promisify(execFile);
const executableDirectory = path.dirname(process.execPath);
const npmExecutable = path.join(
  executableDirectory,
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
);
const npxExecutable = path.join(
  executableDirectory,
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
);
const { stdout: npmVersionOutput } = await execFileAsync(npmExecutable, ['--version']);
const { stdout: npxVersionOutput } = await execFileAsync(npxExecutable, ['--version']);
const sourcePackage = requireRecord(
  JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as unknown,
  'source package metadata',
);
if (typeof sourcePackage.version !== 'string') {
  throw new Error('Source package metadata does not declare a version.');
}
const releaseVersion = sourcePackage.version;
const packageDirectory = path.resolve('test-results/package');
await mkdir(packageDirectory, { recursive: true });
const packageRunDirectory = await mkdtemp(path.join(packageDirectory, 'candidate-'));
const npmPackCacheDirectory = path.join(packageRunDirectory, '.npm-cache');
const npmPackEnvironment: NodeJS.ProcessEnv = {
  PATH: [executableDirectory, '/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter),
  CI: 'true',
  NO_COLOR: '1',
  npm_config_cache: npmPackCacheDirectory,
  npm_config_update_notifier: 'false',
};
const npmPackArgv = [
  'pack',
  '--json',
  '--ignore-scripts',
  '--pack-destination',
  packageRunDirectory,
] as const;
const npmPackOutcome = await execFileAsync(npmExecutable, npmPackArgv, {
  maxBuffer: 10 * 1024 * 1024,
  env: npmPackEnvironment,
});
const npmPackRecords: unknown = JSON.parse(npmPackOutcome.stdout);
if (!Array.isArray(npmPackRecords) || npmPackRecords.length !== 1) {
  throw new Error('npm pack --json did not return exactly one package record.');
}
const npmPackRecord = requireRecord(npmPackRecords[0], 'npm pack record');
const tarballFilename = requireString(npmPackRecord.filename, 'npm pack filename');
const tarballPath = path.join(packageRunDirectory, tarballFilename);
const { stdout: listing } = await execFileAsync('tar', ['-tf', tarballPath]);
const packedFiles = listing.trim().split('\n').sort();
const expectedPackedFiles = await expectedTarballFiles();
const missingPackedFiles = expectedPackedFiles.filter((file) => !packedFiles.includes(file));
const unexpectedPackedFiles = packedFiles.filter((file) => !expectedPackedFiles.includes(file));
if (missingPackedFiles.length > 0 || unexpectedPackedFiles.length > 0) {
  throw new Error(
    [
      'Packed npm tarball inventory differs from the release allowlist.',
      ...(missingPackedFiles.length === 0 ? [] : [`Missing:\n${missingPackedFiles.join('\n')}`]),
      ...(unexpectedPackedFiles.length === 0
        ? []
        : [`Unexpected:\n${unexpectedPackedFiles.join('\n')}`]),
    ].join('\n'),
  );
}
await assertPackedContentIsPublishSafe(tarballPath, packedFiles);
const tarballBytes = await readFile(tarballPath);
const tarballSha256 = createHash('sha256').update(tarballBytes).digest('hex');
const tarballShasum = createHash('sha1').update(tarballBytes).digest('hex');
const tarballIntegrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`;
const tarballSize = (await lstat(tarballPath)).size;
const extractedDirectory = path.join(packageRunDirectory, 'extracted');
await mkdir(extractedDirectory);
await execFileAsync('tar', ['-xf', tarballPath, '-C', extractedDirectory]);
const packedInventory = await Promise.all(
  packedFiles.map(async (file) => {
    const bytes = await readFile(path.join(extractedDirectory, ...file.split('/')));
    return {
      path: file,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }),
);
assertNpmPackRecord(npmPackRecord, {
  tarballFilename,
  tarballShasum,
  tarballIntegrity,
  tarballSize,
  packedInventory,
});
const cli = await readFile(path.resolve('dist/node/cli.js'), 'utf8');
if (!cli.startsWith('#!/usr/bin/env node')) {
  throw new Error('CLI build is missing its Node shebang.');
}

const consumersDirectory = path.resolve('test-results/package-consumers');
await mkdir(consumersDirectory, { recursive: true });
const consumerDirectory = await mkdtemp(path.join(consumersDirectory, 'consumer-'));
const npmCacheDirectory = path.join(consumerDirectory, '.npm-cache');
const candidateExecutableSearchDirectories = [
  ...new Set(
    process.platform === 'win32'
      ? [
          executableDirectory,
          ...(process.env.PATH ?? '').split(path.delimiter).filter((value) => value !== ''),
        ]
      : [executableDirectory, '/usr/local/bin', '/usr/bin', '/bin'],
  ),
];
const candidateExecutableNames =
  process.platform === 'win32'
    ? ([
        'agentic-report.cmd',
        'agentic-report.exe',
        'agentic-report.bat',
        'agentic-report',
      ] as const)
    : (['agentic-report'] as const);
const { checks: globalExecutableChecks, allAbsent: globalExecutableAbsent } =
  await inspectExecutableSearch(candidateExecutableSearchDirectories, candidateExecutableNames);
const candidateInstallEnvironment: NodeJS.ProcessEnv = {
  PATH: candidateExecutableSearchDirectories.join(path.delimiter),
  CI: 'true',
  NO_COLOR: '1',
  npm_config_cache: npmCacheDirectory,
  npm_config_update_notifier: 'false',
  ...(process.platform === 'win32' && process.env.SystemRoot !== undefined
    ? { SystemRoot: process.env.SystemRoot }
    : {}),
  ...(process.platform === 'win32' && process.env.ComSpec !== undefined
    ? { ComSpec: process.env.ComSpec }
    : {}),
  ...(process.platform === 'win32' && process.env.PATHEXT !== undefined
    ? { PATHEXT: process.env.PATHEXT }
    : {}),
};
const candidateNpxEnvironment: NodeJS.ProcessEnv = {
  ...candidateInstallEnvironment,
  npm_config_offline: 'true',
};
if (
  (await pathExists(path.join(consumerDirectory, 'node_modules'))) ||
  !globalExecutableAbsent ||
  (await pathExists(npmCacheDirectory))
) {
  throw new Error(
    'Clean consumer preflight found a checkout link, global executable, or reused cache.',
  );
}
await writeFile(
  path.join(consumerDirectory, 'package.json'),
  JSON.stringify({ name: 'agentic-report-package-consumer', private: true }),
);
const installArgv = [
  'install',
  '--ignore-scripts',
  '--package-lock=false',
  '--no-audit',
  '--no-fund',
  '--no-update-notifier',
  '--loglevel=error',
  '--cache',
  npmCacheDirectory,
  tarballPath,
] as const;
const installOutcome = await execFileAsync(npmExecutable, installArgv, {
  cwd: consumerDirectory,
  timeout: 120_000,
  env: candidateInstallEnvironment,
});
const installedExampleManifest = requireRecord(
  JSON.parse(
    await readFile(
      path.join(consumerDirectory, 'node_modules', 'agentic-report', 'examples', 'manifest.json'),
      'utf8',
    ),
  ),
  'installed example manifest',
);
const installedPackage = requireRecord(
  JSON.parse(
    await readFile(
      path.join(consumerDirectory, 'node_modules', 'agentic-report', 'package.json'),
      'utf8',
    ),
  ),
  'installed package metadata',
);
const installedEngines = requireRecord(installedPackage.engines, 'installed package engines');
const installedBin = requireRecord(installedPackage.bin, 'installed package bin');
const installedExports = requireRecord(installedPackage.exports, 'installed package exports');
const installedRootExport = requireRecord(installedExports['.'], 'installed root export');
if (
  installedPackage.name !== 'agentic-report' ||
  installedPackage.version !== releaseVersion ||
  installedPackage.description !==
    'Local declarative page builder for agent-authored interactive HTML artifacts.' ||
  installedPackage.license !== 'MIT' ||
  JSON.stringify(installedPackage.repository) !==
    JSON.stringify({ type: 'git', url: 'git+https://github.com/witqq/agentic-report.git' }) ||
  installedPackage.homepage !== 'https://agentic-report.witqq.dev/' ||
  JSON.stringify(installedPackage.bugs) !==
    JSON.stringify({ url: 'https://github.com/witqq/agentic-report/issues' }) ||
  JSON.stringify(installedPackage.publishConfig) !== JSON.stringify({ access: 'public' }) ||
  installedPackage.types !== './dist/node/index.d.ts' ||
  installedEngines.node !== '>=24.18.0' ||
  installedBin['agentic-report'] !== './dist/node/cli.js' ||
  installedRootExport.types !== './dist/node/index.d.ts' ||
  installedRootExport.import !== './dist/node/index.js'
) {
  throw new Error('Installed package metadata differs from the release contract.');
}
if (
  (await readFile(
    path.join(consumerDirectory, 'node_modules', 'agentic-report', 'LICENSE'),
    'utf8',
  )) !== (await readFile(path.resolve('LICENSE'), 'utf8'))
) {
  throw new Error('Installed package license differs from the repository license.');
}
if (
  !(
    await readFile(
      path.join(
        consumerDirectory,
        'node_modules',
        'agentic-report',
        'skills',
        'agentic-report',
        'SKILL.md',
      ),
    )
  ).equals(await readFile(path.resolve('skills/agentic-report/SKILL.md')))
) {
  throw new Error('Installed canonical skill bytes differ from the repository skill.');
}
if (
  installedExampleManifest.status !== 'complete' ||
  JSON.stringify(installedExampleManifest.missingShowcaseClasses) !== JSON.stringify([])
) {
  throw new Error('Installed example manifest reports incomplete showcase coverage.');
}

const binary = path.join(
  consumerDirectory,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'agentic-report.cmd' : 'agentic-report',
);
const installedBinaryTarget = path.join(
  consumerDirectory,
  'node_modules',
  'agentic-report',
  'dist',
  'node',
  'cli.js',
);
const binaryIdentity = {
  localShim: binary,
  localShimRealpath: await realpath(binary),
  packageBinTarget: installedBinaryTarget,
};
if (
  !(await pathExists(installedBinaryTarget)) ||
  (process.platform !== 'win32' && binaryIdentity.localShimRealpath !== installedBinaryTarget)
) {
  throw new Error('Installed local CLI shim does not resolve to the declared package bin target.');
}
const resolutionCommand =
  process.platform === 'win32' ? 'where agentic-report' : 'command -v agentic-report';
const resolutionArgv = ['--no-install', '--call', resolutionCommand] as const;
const resolutionOutcome = await runCommand(
  npxExecutable,
  resolutionArgv,
  consumerDirectory,
  candidateNpxEnvironment,
);
const resolvedExecutableCandidates = resolutionOutcome.stdout.trim().split(/\r?\n/u);
if (
  resolutionOutcome.exitCode !== 0 ||
  resolutionOutcome.stderr !== '' ||
  resolvedExecutableCandidates[0] !== binary
) {
  throw new Error('Local-only npx did not resolve agentic-report to the installed consumer shim.');
}
const candidateNpxEvidence: {
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly resolvedExecutable: typeof binaryIdentity;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}[] = [];
const runCandidateNpx = async (
  arguments_: readonly string[],
  cwd: string,
): Promise<{
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> => {
  const argv = ['--no-install', 'agentic-report', ...arguments_];
  const outcome = await runCommand(npxExecutable, argv, cwd, candidateNpxEnvironment);
  candidateNpxEvidence.push({ cwd, argv, resolvedExecutable: binaryIdentity, ...outcome });
  return outcome;
};
const candidateNpxVersionOutcome = await runCandidateNpx(['--version'], consumerDirectory);
if (
  candidateNpxVersionOutcome.exitCode !== 0 ||
  candidateNpxVersionOutcome.stderr !== '' ||
  candidateNpxVersionOutcome.stdout.trim() !== releaseVersion
) {
  throw new Error(
    'Tarball-installed candidate did not run through local-only npx without warnings.',
  );
}
const { stdout: installedVersion } = await execFileAsync(binary, ['--version'], {
  cwd: consumerDirectory,
});
if (installedVersion.trim() !== releaseVersion) {
  throw new Error('Installed CLI version differs from the package/runtime release identity.');
}
const { stdout: descriptionOutput } = await execFileAsync(binary, ['describe', '--json'], {
  cwd: consumerDirectory,
});
const description: unknown = JSON.parse(descriptionOutput);
if (
  typeof description !== 'object' ||
  description === null ||
  !('directives' in description) ||
  typeof description.directives !== 'object' ||
  description.directives === null ||
  !('demo' in description.directives)
) {
  throw new Error('Installed CLI did not return its machine-readable discovery contract.');
}
const installedDescription = requireRecord(description, 'installed discovery contract');
const installedOutputs = requireRecord(installedDescription.outputs, 'installed output contract');
const installedPage = requireRecord(installedDescription.page, 'installed page contract');
const installedCommands = requireRecord(
  installedDescription.commands,
  'installed command discovery contract',
);
assertExactKeys(installedOutputs, ['default', 'formats', 'runtimePlacement'], 'output contract');
if (
  installedOutputs.default !== 'single-file' ||
  JSON.stringify(installedOutputs.formats) !== JSON.stringify(['single-file', 'directory']) ||
  JSON.stringify(installedOutputs.runtimePlacement) !==
    JSON.stringify({ 'single-file': 'inline', directory: 'external' })
) {
  throw new Error('Installed discovery contract does not expose the two format-derived runtimes.');
}
if (
  installedPage.defaultLayout !== 'document' ||
  JSON.stringify(installedPage.layouts) !==
    JSON.stringify(['document', 'dashboard', 'landing', 'mixed']) ||
  installedPage.defaultTheme !== 'system' ||
  JSON.stringify(installedPage.themes) !== JSON.stringify(['system', 'light', 'dark']) ||
  !Array.isArray(installedPage.tokens) ||
  installedPage.tokens.length !== 5
) {
  throw new Error('Installed discovery contract does not expose the complete page model.');
}
for (const command of ['init', 'validate', 'inspect', 'build']) {
  if (typeof installedCommands[command] !== 'string') {
    throw new Error(`Installed discovery contract is missing the ${command} command.`);
  }
}

const { stdout: schemaOutput } = await execFileAsync(binary, ['schema', '--scope', 'source'], {
  cwd: consumerDirectory,
});
const sourceSchema: unknown = JSON.parse(schemaOutput);
if (
  typeof sourceSchema !== 'object' ||
  sourceSchema === null ||
  !('$id' in sourceSchema) ||
  sourceSchema.$id !== 'urn:agentic-report:schema:source:1' ||
  !('properties' in sourceSchema) ||
  typeof sourceSchema.properties !== 'object' ||
  sourceSchema.properties === null
) {
  throw new Error('Installed CLI did not return the truthful complete source schema contract.');
}
if (JSON.stringify(sourceSchema).includes('"scripts"')) {
  throw new Error('Installed source schema still exposes the retired script-policy surface.');
}
const sourceProperties = requireRecord(
  requireRecord(sourceSchema, 'installed source schema').properties,
  'installed source properties',
);
const manifestProperties = requireRecord(
  requireRecord(sourceProperties.manifest, 'installed manifest schema').properties,
  'installed manifest properties',
);
const outputProperties = requireRecord(
  requireRecord(manifestProperties.output, 'installed output schema').properties,
  'installed output schema properties',
);
assertExactKeys(outputProperties, ['format', 'maxInlineBytes'], 'manifest output schema');
const { stdout: apiContractOutput } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {getAuthoringSchema,getSourceContract,listExamples} from 'agentic-report'; const source=getSourceContract(); console.log(JSON.stringify({schema:getAuthoringSchema('manifest'),page:source.page,demo:source.directives.demo,examples:listExamples()}))",
  ],
  { cwd: consumerDirectory },
);
const apiContract: unknown = JSON.parse(apiContractOutput);
if (
  typeof apiContract !== 'object' ||
  apiContract === null ||
  !('schema' in apiContract) ||
  typeof apiContract.schema !== 'object' ||
  apiContract.schema === null ||
  !('page' in apiContract) ||
  !('demo' in apiContract) ||
  typeof apiContract.demo !== 'object' ||
  apiContract.demo === null ||
  !('attributes' in apiContract.demo) ||
  !('examples' in apiContract) ||
  !Array.isArray(apiContract.examples) ||
  JSON.stringify(requireRecord(apiContract.page, 'installed ESM page contract')) !==
    JSON.stringify(installedPage)
) {
  throw new Error('Installed ESM API did not expose the source discovery and manifest contracts.');
}

const { stdout: examplesOutput } = await execFileAsync(binary, ['examples', '--json'], {
  cwd: consumerDirectory,
});
const examplesContract: unknown = JSON.parse(examplesOutput);
if (
  typeof examplesContract !== 'object' ||
  examplesContract === null ||
  !('examples' in examplesContract) ||
  !Array.isArray(examplesContract.examples) ||
  typeof examplesContract.examples[0] !== 'object' ||
  examplesContract.examples[0] === null ||
  !('entry' in examplesContract.examples[0]) ||
  typeof examplesContract.examples[0].entry !== 'string'
) {
  throw new Error('Installed CLI did not return its machine-readable examples contract.');
}
const expectedLayoutExamples = [
  { id: 'basic', layout: 'document' },
  { id: 'research', layout: 'mixed' },
  { id: 'architecture', layout: 'document' },
  { id: 'tutorial', layout: 'document' },
  { id: 'dashboard', layout: 'dashboard' },
  { id: 'landing', layout: 'landing' },
  { id: 'layout-document', layout: 'document' },
  { id: 'layout-dashboard', layout: 'dashboard' },
  { id: 'layout-landing', layout: 'landing' },
  { id: 'layout-mixed', layout: 'mixed' },
  { id: 'interactive-catalog', layout: 'mixed' },
  { id: 'response-workspace', layout: 'document' },
  { id: 'visualization-catalog', layout: 'dashboard' },
  { id: 'incident-review', layout: 'mixed' },
  { id: 'vendor-decision', layout: 'document' },
  { id: 'launch-readiness', layout: 'landing' },
] as const;
const installedExamples = examplesContract.examples.map((example) =>
  requireRecord(example, 'installed example'),
);
const installedStarters = installedExamples.filter((example) => example.starter !== undefined);
if (
  JSON.stringify(installedStarters.map((example) => example.id)) !==
  JSON.stringify(['basic', 'research', 'architecture', 'tutorial', 'dashboard', 'landing'])
) {
  throw new Error('Installed examples contract does not expose the six starter identities.');
}
const defaultStarter = installedStarters.find(
  (example) => requireRecord(example.starter, 'installed starter metadata').default,
);
if (
  defaultStarter?.id !== 'basic' ||
  JSON.stringify(requireRecord(defaultStarter.starter, 'default starter metadata').aliases) !==
    JSON.stringify(['report'])
) {
  throw new Error('Installed starter catalog lost its default or report compatibility alias.');
}
for (const expected of expectedLayoutExamples) {
  const installedExample = installedExamples.find((example) => example.id === expected.id);
  if (installedExample === undefined || typeof installedExample.entry !== 'string') {
    throw new Error(`Installed examples contract is missing ${expected.id}.`);
  }
  await readFile(installedExample.entry, 'utf8');
  for (const format of ['single-file', 'directory'] as const) {
    const output = path.join(consumerDirectory, `${expected.id}-${format}`);
    const arguments_ = ['build', installedExample.entry, '--output', output];
    if (format === 'directory') {
      arguments_.push('--format', 'directory');
    }
    await execFileAsync(binary, arguments_, { cwd: consumerDirectory });
    const htmlPath = format === 'directory' ? path.join(output, 'index.html') : output;
    const html = await readFile(htmlPath, 'utf8');
    if (!html.includes(`data-layout="${expected.layout}"`)) {
      throw new Error(
        `Installed ${expected.id} ${format} artifact did not preserve its page layout.`,
      );
    }
    if (expected.id === 'landing') {
      const inFlowContents = /<nav class="semantic-contents"[\s\S]*?<\/nav>/u.exec(html)?.[0];
      if (
        inFlowContents === undefined ||
        !inFlowContents.includes('data-in-flow-contents=""') ||
        !inFlowContents.includes('>Start with the work, not the framework</a>') ||
        inFlowContents.includes('>Workflow</a>')
      ) {
        throw new Error(
          `Installed landing ${format} artifact did not derive exact in-flow section contents.`,
        );
      }
    }
  }
}

const firstUseProject = path.join(consumerDirectory, 'token=path-sentinel');
const transportedFirstUseProject = redactCredentialPath(firstUseProject);
const initialized = await runCandidateNpx(
  ['init', firstUseProject, '--starter', 'report', '--json'],
  consumerDirectory,
);
const initializedRecord = requireSingleNdjsonRecord(initialized, 'installed init result');
if (
  initialized.exitCode !== 0 ||
  initialized.stderr !== '' ||
  initializedRecord.type !== 'result' ||
  initializedRecord.starterId !== 'basic' ||
  initializedRecord.projectPath !== transportedFirstUseProject ||
  initializedRecord.entryPath !== path.join(transportedFirstUseProject, 'report.md') ||
  initialized.stdout.includes('path-sentinel')
) {
  throw new Error('Installed CLI did not initialize the first-use project.');
}
const firstUseEntry = path.join(firstUseProject, 'report.md');
const editedSource = `${await readFile(firstUseEntry, 'utf8')}\nAgent-authored edit.\n`;
const credentialBearingSource = `${editedSource}\n![Broken](https://alice:secret@local.test/image.png?token=private&X-Amz-Credential=credential-sentinel&X-Amz-Signature=signature-sentinel&X-Amz-Security-Token=security-token-sentinel)\n`;
await writeFile(firstUseEntry, credentialBearingSource);

const analysisSingleSentinel = path.join(firstUseProject, 'report.html');
const analysisDirectorySentinel = path.join(firstUseProject, 'report-artifact', 'sentinel.txt');
await writeFile(analysisSingleSentinel, 'preserve single analysis sentinel');
await mkdir(path.dirname(analysisDirectorySentinel));
await writeFile(analysisDirectorySentinel, 'preserve directory analysis sentinel');

for (const command of ['validate', 'inspect']) {
  const broken = await runCommand(binary, [command, firstUseProject, '--json'], consumerDirectory);
  const diagnostic = requireSingleNdjsonRecord(broken, `installed broken ${command} diagnostic`);
  if (
    broken.exitCode !== 1 ||
    broken.stderr !== '' ||
    diagnostic.type !== 'diagnostic' ||
    diagnostic.code !== 'REMOTE_ASSET_BLOCKED' ||
    /alice|secret|private|path-sentinel|credential-sentinel|signature-sentinel|security-token-sentinel/u.test(
      broken.stdout,
    ) ||
    !broken.stdout.includes('[REDACTED]')
  ) {
    throw new Error(
      `Installed ${command} did not return the expected redacted broken-source diagnostic.`,
    );
  }
}
if (
  (await readFile(analysisSingleSentinel, 'utf8')) !== 'preserve single analysis sentinel' ||
  (await readFile(analysisDirectorySentinel, 'utf8')) !== 'preserve directory analysis sentinel'
) {
  throw new Error('Installed analysis commands mutated author output.');
}

await writeFile(firstUseEntry, editedSource);
const validated = await runCandidateNpx(['validate', firstUseProject, '--json'], consumerDirectory);
const validatedRecord = requireSingleNdjsonRecord(validated, 'installed validate result');
assertExactKeys(
  validatedRecord,
  [
    'type',
    'runId',
    'contractVersion',
    'projectPath',
    'entryPath',
    'format',
    'runtimePlacement',
    'warnings',
  ],
  'installed validate result',
);
if (
  validated.exitCode !== 0 ||
  validated.stderr !== '' ||
  validatedRecord.type !== 'result' ||
  validatedRecord.projectPath !== transportedFirstUseProject ||
  validatedRecord.entryPath !== path.join(transportedFirstUseProject, 'report.md') ||
  validated.stdout.includes('path-sentinel') ||
  validatedRecord.format !== 'single-file' ||
  validatedRecord.runtimePlacement !== 'inline'
) {
  throw new Error('Installed validate did not accept the fixed first-use project.');
}

const inspected = await runCandidateNpx(
  ['inspect', firstUseProject, '--format', 'directory', '--json'],
  consumerDirectory,
);
const inspectedRecord = requireSingleNdjsonRecord(inspected, 'installed inspect result');
assertExactKeys(
  inspectedRecord,
  [
    'type',
    'runId',
    'contractVersion',
    'projectPath',
    'entryPath',
    'output',
    'sourceFiles',
    'observed',
    'catalog',
    'warnings',
  ],
  'installed inspect result',
);
const inspectedOutput = requireRecord(inspectedRecord.output, 'installed inspected output');
const inspectedCatalog = requireRecord(inspectedRecord.catalog, 'installed inspected catalog');
const inspectedCatalogCommands = requireRecord(
  inspectedCatalog.commands,
  'installed inspected command catalog',
);
if (
  inspected.exitCode !== 0 ||
  inspected.stderr !== '' ||
  inspectedRecord.type !== 'result' ||
  inspectedRecord.projectPath !== transportedFirstUseProject ||
  inspectedRecord.entryPath !== path.join(transportedFirstUseProject, 'report.md') ||
  inspected.stdout.includes('path-sentinel') ||
  inspectedOutput.format !== 'directory' ||
  inspectedOutput.runtimePlacement !== 'external' ||
  !Array.isArray(inspectedRecord.sourceFiles) ||
  !inspectedRecord.sourceFiles.includes('report.md') ||
  typeof inspectedCatalogCommands.validate !== 'string' ||
  typeof inspectedCatalogCommands.inspect !== 'string'
) {
  throw new Error('Installed inspect did not return the fixed project and authoring catalog.');
}

const { stdout: esmAnalysisOutput } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {inspectReport,validateReport} from 'agentic-report'; const input=process.argv[1]; console.log(JSON.stringify({validate:await validateReport({input}),inspect:await inspectReport({input,format:'directory'})}));",
    firstUseProject,
  ],
  { cwd: consumerDirectory },
);
const installedAnalysis = requireRecord(
  JSON.parse(esmAnalysisOutput),
  'installed ESM analysis result',
);
const installedEsmValidate = requireRecord(
  installedAnalysis.validate,
  'installed ESM validate result',
);
const installedEsmInspect = requireRecord(
  installedAnalysis.inspect,
  'installed ESM inspect result',
);
if (
  installedEsmValidate.entryPath !== validatedRecord.entryPath ||
  JSON.stringify(installedEsmInspect.output) !== JSON.stringify(inspectedRecord.output) ||
  JSON.stringify(installedEsmInspect.sourceFiles) !== JSON.stringify(inspectedRecord.sourceFiles)
) {
  throw new Error('Installed ESM and CLI analysis routes do not describe the same project.');
}

const firstUseOutput = path.join(firstUseProject, 'built.html');
const firstUseBuild = await runCandidateNpx(
  ['build', firstUseProject, '--output', firstUseOutput, '--json'],
  consumerDirectory,
);
const firstUseBuildRecord = requireSingleNdjsonRecord(
  firstUseBuild,
  'installed first-use build result',
);
if (
  firstUseBuild.exitCode !== 0 ||
  firstUseBuild.stderr !== '' ||
  firstUseBuildRecord.type !== 'result' ||
  firstUseBuildRecord.outputPath !== redactCredentialPath(firstUseOutput) ||
  firstUseBuild.stdout.includes('path-sentinel') ||
  !(await readFile(firstUseOutput, 'utf8')).includes('Agent-authored edit.')
) {
  throw new Error('Installed CLI did not build the fixed first-use project.');
}
const firstUseHtml = await readFile(firstUseOutput, 'utf8');
const encodedReviewManifest = /<template data-review-manifest="true">([\s\S]*?)<\/template>/u.exec(
  firstUseHtml,
)?.[1];
if (encodedReviewManifest === undefined) {
  throw new Error('Installed build did not embed the review target manifest.');
}
const reviewManifest = requireRecord(
  JSON.parse(
    encodedReviewManifest
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  ),
  'installed review target manifest',
);
if (!Array.isArray(reviewManifest.targets)) {
  throw new Error('Installed review target manifest did not contain targets.');
}
const reviewTarget = reviewManifest.targets.find(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'markdown:paragraph',
);
if (reviewTarget === undefined || typeof reviewManifest.reportRevision !== 'string') {
  throw new Error('Installed review target manifest did not expose a paragraph target.');
}
const installedReviewPath = path.join(firstUseProject, 'review.json');
await writeFile(
  installedReviewPath,
  `${JSON.stringify({
    contractVersion: 2,
    report: { revision: reviewManifest.reportRevision },
    threads: [
      {
        id: 'thread-a',
        segments: [
          {
            id: 'segment-a',
            reportRevision: reviewManifest.reportRevision,
            target: reviewTarget,
            resolved: false,
            messages: [
              {
                id: 'message-a',
                author: 'user',
                message: 'token=installed-private-value',
              },
            ],
          },
        ],
      },
    ],
  })}\n`,
);
const installedReview = await runCommand(
  binary,
  ['review', 'review.json', firstUseProject, '--json'],
  consumerDirectory,
);
const installedReviewRecord = requireSingleNdjsonRecord(
  installedReview,
  'installed review binding result',
);
if (
  installedReview.exitCode !== 0 ||
  installedReview.stderr !== '' ||
  installedReviewRecord.type !== 'result' ||
  installedReviewRecord.reportStatus !== 'exact' ||
  !Array.isArray(installedReviewRecord.threads) ||
  installedReviewRecord.threads.length !== 1 ||
  installedReview.stdout.includes('installed-private-value') ||
  !installedReview.stdout.includes('token=[REDACTED]')
) {
  throw new Error('Installed CLI did not resolve and sanitize the review artifact.');
}
for (const command of ['validate', 'inspect'] as const) {
  const result = await runCandidateNpx(
    [command, firstUseProject, '--review', 'review.json', '--json'],
    consumerDirectory,
  );
  const record = requireSingleNdjsonRecord(result, `installed ${command} prior-review result`);
  if (result.exitCode !== 0 || result.stderr !== '' || record.type !== 'result') {
    throw new Error(`Installed CLI did not forward prior review through ${command}.`);
  }
}
const { stdout: installedPriorEsmOutput } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {inspectReport,validateReport} from 'agentic-report'; const input=process.argv[1]; console.log(JSON.stringify({validate:await validateReport({input,review:'review.json'}),inspect:await inspectReport({input,review:'review.json'})}));",
    firstUseProject,
  ],
  { cwd: consumerDirectory },
);
const installedPriorEsm = requireRecord(
  JSON.parse(installedPriorEsmOutput),
  'installed ESM prior-review result',
);
requireRecord(installedPriorEsm.validate, 'installed ESM prior validate result');
requireRecord(installedPriorEsm.inspect, 'installed ESM prior inspect result');

const installedPriorSingle = path.join(firstUseProject, 'built-prior.html');
await execFileAsync(
  binary,
  ['build', firstUseProject, '--output', installedPriorSingle, '--review', 'review.json'],
  { cwd: consumerDirectory },
);
const installedPriorDirectory = path.join(firstUseProject, 'built-prior-directory');
await execFileAsync(
  binary,
  [
    'build',
    firstUseProject,
    '--format',
    'directory',
    '--output',
    installedPriorDirectory,
    '--review',
    'review.json',
  ],
  { cwd: consumerDirectory },
);
for (const output of [installedPriorSingle, path.join(installedPriorDirectory, 'index.html')]) {
  const html = await readFile(output, 'utf8');
  if (
    !html.includes('data-prior-review="true"') ||
    !html.includes('&quot;reportStatus&quot;:&quot;exact&quot;')
  ) {
    throw new Error('Installed package build did not embed exact prior-review state.');
  }
}
const repeatedFirstUseOutput = path.join(firstUseProject, 'built-again.html');
await execFileAsync(binary, ['build', firstUseProject, '--output', repeatedFirstUseOutput], {
  cwd: consumerDirectory,
});
if (!(await readFile(repeatedFirstUseOutput)).equals(await readFile(firstUseOutput))) {
  throw new Error('Independent installed CLI processes produced different single-file bytes.');
}

const directoryJourneyProject = path.join(consumerDirectory, 'directory-first-use');
const directoryInit = await runCommand(
  binary,
  ['init', directoryJourneyProject, '--starter', 'tutorial', '--json'],
  consumerDirectory,
);
const directoryInitRecord = requireSingleNdjsonRecord(
  directoryInit,
  'installed directory-journey init result',
);
if (
  directoryInit.exitCode !== 0 ||
  directoryInitRecord.type !== 'result' ||
  directoryInitRecord.starterId !== 'tutorial'
) {
  throw new Error('Installed CLI did not initialize the directory first-use journey.');
}
const directoryJourneyEntry = path.join(directoryJourneyProject, 'report.md');
await writeFile(
  directoryJourneyEntry,
  `${await readFile(directoryJourneyEntry, 'utf8')}\nDirectory journey agent edit.\n`,
);
for (const command of ['validate', 'inspect'] as const) {
  const arguments_ = [command, directoryJourneyProject, '--format', 'directory', '--json'];
  const result = await runCommand(binary, arguments_, consumerDirectory);
  const record = requireSingleNdjsonRecord(result, `installed directory ${command} result`);
  if (result.exitCode !== 0 || result.stderr !== '' || record.type !== 'result') {
    throw new Error(`Installed directory first-use ${command} journey failed.`);
  }
}
const directoryJourneyOutput = path.join(directoryJourneyProject, 'built-directory');
const directoryJourneyBuild = await runCommand(
  binary,
  [
    'build',
    directoryJourneyProject,
    '--format',
    'directory',
    '--output',
    directoryJourneyOutput,
    '--json',
  ],
  consumerDirectory,
);
const directoryJourneyBuildRecord = requireSingleNdjsonRecord(
  directoryJourneyBuild,
  'installed directory first-use build result',
);
const directoryJourneyHtml = await readFile(
  path.join(directoryJourneyOutput, 'index.html'),
  'utf8',
);
if (
  directoryJourneyBuild.exitCode !== 0 ||
  directoryJourneyBuildRecord.type !== 'result' ||
  directoryJourneyBuildRecord.format !== 'directory' ||
  !directoryJourneyHtml.includes('Directory journey agent edit.')
) {
  throw new Error('Installed CLI did not complete the directory first-use build journey.');
}
const repeatedDirectoryJourneyOutput = path.join(directoryJourneyProject, 'built-directory-again');
await execFileAsync(
  binary,
  [
    'build',
    directoryJourneyProject,
    '--format',
    'directory',
    '--output',
    repeatedDirectoryJourneyOutput,
  ],
  { cwd: consumerDirectory },
);
if (
  JSON.stringify(await directoryByteSnapshot(repeatedDirectoryJourneyOutput)) !==
  JSON.stringify(await directoryByteSnapshot(directoryJourneyOutput))
) {
  throw new Error('Independent installed CLI processes produced different directory trees.');
}
const candidateBrowserEvidence = await inspectCandidateArtifacts([
  { format: 'single-file', path: installedPriorSingle, expectReviewThreads: true },
  {
    format: 'directory',
    path: path.join(installedPriorDirectory, 'index.html'),
    expectReviewThreads: true,
  },
]);

const shadowDirectory = path.join(consumerDirectory, 'cwd-shadow');
await mkdir(path.join(shadowDirectory, 'dist', 'browser'), { recursive: true });
await writeFile(path.join(shadowDirectory, 'report.md'), '# Package-owned assets\n');
await writeFile(
  path.join(shadowDirectory, 'dist', 'browser', 'runtime.js'),
  "document.documentElement.dataset.injectedFromConsumerCwd = 'true';\n",
);
await writeFile(
  path.join(shadowDirectory, 'dist', 'browser', 'document.css'),
  ':root { --injected-from-consumer-cwd: true; }\n',
);
await execFileAsync(binary, ['build', 'report.md', '--output', 'shadow.html'], {
  cwd: shadowDirectory,
});
const shadowHtml = await readFile(path.join(shadowDirectory, 'shadow.html'), 'utf8');
if (
  shadowHtml.includes('injectedFromConsumerCwd') ||
  shadowHtml.includes('injected-from-consumer-cwd')
) {
  throw new Error('Installed CLI loaded browser assets from the consumer working directory.');
}

const reportPath = path.join(consumerDirectory, 'report.md');
const outputPath = path.join(consumerDirectory, 'report.html');
const installedSourcePath = '/tmp/%2FUsers%2Fpacked-consumer%2Fprivate%2Fsource.ts';
const installedSourcePathEncoded = encodeURIComponent(installedSourcePath);
await writeFile(
  reportPath,
  [
    '# Packed CLI report',
    '',
    'Built from a clean npm consumer.',
    `Inspect :source-link{label="/Users/packed-consumer/private/source.ts:42" href="http://127.0.0.1:7789/open?path=${installedSourcePathEncoded}&line=42"}.`,
  ].join('\n'),
);
const { stdout: buildOutput } = await execFileAsync(
  binary,
  ['build', reportPath, '--output', outputPath, '--json'],
  { cwd: consumerDirectory },
);
const records = buildOutput
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as { readonly type?: string });
if (!records.some((record) => record.type === 'result')) {
  throw new Error('Installed CLI did not emit an NDJSON result record.');
}
const cliResult = requireRecord(
  records.find((record) => record.type === 'result'),
  'installed CLI result',
);
assertExactKeys(
  cliResult,
  [
    'type',
    'runId',
    'outputPath',
    'format',
    'bytes',
    'embeddedAssets',
    'externalAssets',
    'contentHash',
    'share',
    'neutralizedSourceLinks',
    'warnings',
  ],
  'installed CLI result',
);
if (cliResult.format !== 'single-file') {
  throw new Error('Installed CLI default build did not select single-file output.');
}
const installedHtml = await readFile(outputPath, 'utf8');
if (!/<h1[^>]*id="packed-cli-report"[^>]*>Packed CLI report<\/h1>/u.test(installedHtml)) {
  throw new Error('Installed CLI did not build the expected self-contained HTML artifact.');
}
if (
  cliResult.share !== false ||
  cliResult.neutralizedSourceLinks !== 0 ||
  !installedHtml.includes(installedSourcePathEncoded)
) {
  throw new Error('Installed CLI default build did not preserve workstation source links.');
}

const shareOutputPath = path.join(consumerDirectory, 'report-share.html');
const { stdout: shareBuildOutput } = await execFileAsync(
  binary,
  ['build', reportPath, '--output', shareOutputPath, '--share', '--json'],
  { cwd: consumerDirectory },
);
const shareRecord = requireRecord(
  shareBuildOutput
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
    .find((record) => requireRecord(record, 'share CLI record').type === 'result'),
  'installed share CLI result',
);
const installedShareHtml = await readFile(shareOutputPath, 'utf8');
if (
  shareRecord.share !== true ||
  shareRecord.neutralizedSourceLinks !== 1 ||
  installedShareHtml.includes(installedSourcePathEncoded) ||
  !installedShareHtml.includes('data-source-link-neutralized=""') ||
  !installedShareHtml.includes('>source:42</span>') ||
  installedShareHtml.includes('/Users/packed-consumer/private')
) {
  throw new Error('Installed CLI share build did not neutralize the exact source-link path.');
}

const directoryOutput = path.join(consumerDirectory, 'directory-artifact');
const { stdout: directoryBuildOutput } = await execFileAsync(
  binary,
  ['build', reportPath, '--output', directoryOutput, '--format', 'directory', '--json'],
  { cwd: consumerDirectory },
);
const directoryRecord = requireRecord(
  directoryBuildOutput
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
    .find((record) => requireRecord(record, 'directory CLI record').type === 'result'),
  'installed directory CLI result',
);
if (
  directoryRecord.format !== 'directory' ||
  directoryRecord.outputPath !== path.join(directoryOutput, 'index.html')
) {
  throw new Error('Installed CLI did not return the expected directory result contract.');
}
assertExactKeys(
  directoryRecord,
  [
    'type',
    'runId',
    'outputPath',
    'format',
    'bytes',
    'embeddedAssets',
    'externalAssets',
    'contentHash',
    'share',
    'neutralizedSourceLinks',
    'warnings',
  ],
  'installed directory CLI result',
);
const directoryHtml = await readFile(path.join(directoryOutput, 'index.html'), 'utf8');
if (
  !/<script src="assets\/runtime\.[a-f0-9]{12}\.js" defer=""><\/script>/u.test(directoryHtml) ||
  !/<link rel="stylesheet" href="assets\/document\.[a-f0-9]{12}\.css"\/>/u.test(directoryHtml)
) {
  throw new Error(
    'Installed CLI directory build did not use external content-addressed runtime assets.',
  );
}
if (!directoryHtml.includes(installedSourcePathEncoded)) {
  throw new Error('Installed CLI default directory build did not preserve source links.');
}

const esmOutput = path.join(consumerDirectory, 'esm-directory');
const { stdout: esmBuildOutput } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {buildReport} from 'agentic-report'; const result=await buildReport({input:process.argv[1],output:process.argv[2],format:'directory',share:true}); console.log(JSON.stringify(result));",
    reportPath,
    esmOutput,
  ],
  { cwd: consumerDirectory },
);
const esmResult = requireRecord(JSON.parse(esmBuildOutput), 'installed ESM build result');
assertExactKeys(
  esmResult,
  [
    'outputPath',
    'format',
    'bytes',
    'embeddedAssets',
    'externalAssets',
    'contentHash',
    'share',
    'neutralizedSourceLinks',
    'warnings',
  ],
  'installed ESM build result',
);
if (
  esmResult.format !== 'directory' ||
  esmResult.outputPath !== path.join(esmOutput, 'index.html') ||
  esmResult.share !== true ||
  esmResult.neutralizedSourceLinks !== 1
) {
  throw new Error('Installed ESM buildReport did not produce share-safe directory output.');
}
const esmShareHtml = await readFile(path.join(esmOutput, 'index.html'), 'utf8');
if (
  esmShareHtml.includes(installedSourcePathEncoded) ||
  esmShareHtml.includes('/Users/packed-consumer/private') ||
  !esmShareHtml.includes('>source:42</span>')
) {
  throw new Error('Installed ESM share-safe directory output retained its source-link path.');
}

const invalidEsmParent = path.join(consumerDirectory, 'invalid-esm-format');
const invalidEsmAssets = path.join(invalidEsmParent, 'assets');
const invalidEsmSentinel = path.join(invalidEsmAssets, 'sentinel.txt');
const invalidEsmOutput = path.join(invalidEsmParent, 'result');
await mkdir(invalidEsmAssets, { recursive: true });
await writeFile(invalidEsmSentinel, 'preserve me');
const { stdout: invalidEsmOutputRecord } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {buildReport} from 'agentic-report'; const outcome=await buildReport({input:process.argv[1],output:process.argv[2],format:'bogus'}).then(()=>({accepted:true}),error=>({accepted:false,diagnostic:error?.diagnostic})); console.log(JSON.stringify(outcome));",
    reportPath,
    invalidEsmOutput,
  ],
  { cwd: consumerDirectory },
);
const invalidEsmResult = requireRecord(
  JSON.parse(invalidEsmOutputRecord),
  'installed ESM invalid-format result',
);
const invalidEsmDiagnostic = requireRecord(
  invalidEsmResult.diagnostic,
  'installed ESM invalid-format diagnostic',
);
if (invalidEsmResult.accepted !== false || invalidEsmDiagnostic.code !== 'OUTPUT_FORMAT_INVALID') {
  throw new Error('Installed ESM buildReport accepted or misclassified an invalid runtime format.');
}
if (
  JSON.stringify((await readdir(invalidEsmParent)).sort()) !== JSON.stringify(['assets']) ||
  JSON.stringify((await readdir(invalidEsmAssets)).sort()) !== JSON.stringify(['sentinel.txt']) ||
  (await readFile(invalidEsmSentinel, 'utf8')) !== 'preserve me'
) {
  throw new Error('Installed ESM invalid-format rejection mutated its output or adjacent assets.');
}

await writeFile(
  path.join(consumerDirectory, 'contract.ts'),
  [
    "import type { BuildReportOptions, BuildReportResult, InspectReportOptions, InspectReportResult, InspectReviewOptions, InspectReviewResult, ReviewArtifact, ReviewTargetManifest, ValidateReportOptions, ValidateReportResult } from 'agentic-report';",
    "const supported: BuildReportOptions = { input: 'report.md', format: 'directory', share: true };",
    "const validate: ValidateReportOptions = { input: 'report.md' };",
    "const inspect: InspectReportOptions = { input: 'report.md', format: 'directory' };",
    "const review: InspectReviewOptions = { input: '.', review: 'review.json' };",
    'declare const validateResult: ValidateReportResult;',
    'declare const inspectResult: InspectReportResult;',
    'declare const reviewResult: InspectReviewResult;',
    'declare const reviewArtifact: ReviewArtifact;',
    'declare const reviewManifest: ReviewTargetManifest;',
    '// @ts-expect-error scripts is a retired option and must not reappear',
    "const retired: BuildReportOptions = { input: 'report.md', scripts: 'none' };",
    'declare const result: BuildReportResult;',
    'const neutralized: number = result.neutralizedSourceLinks;',
    'const share: boolean = result.share;',
    '// @ts-expect-error scripts is a retired result member and must not reappear',
    'result.scripts;',
    'void supported;',
    'void validate;',
    'void inspect;',
    'void review;',
    'void validateResult;',
    'void inspectResult;',
    'void reviewResult;',
    'void reviewArtifact;',
    'void reviewManifest;',
    'void retired;',
    'void neutralized;',
    'void share;',
  ].join('\n'),
);
await writeFile(
  path.join(consumerDirectory, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      skipLibCheck: true,
    },
    include: ['contract.ts'],
  }),
);
await execFileAsync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc')], {
  cwd: consumerDirectory,
});

const retiredOption = await runCommand(
  binary,
  ['build', reportPath, '--scripts', 'none', '--json'],
  consumerDirectory,
);
const retiredDiagnostic = requireRecord(
  JSON.parse(retiredOption.stdout.trim()),
  'retired installed CLI option diagnostic',
);
if (
  retiredOption.exitCode !== 1 ||
  retiredOption.stderr !== '' ||
  retiredDiagnostic.type !== 'diagnostic' ||
  retiredDiagnostic.code !== 'CLI_ARGUMENT_INVALID'
) {
  throw new Error('Installed CLI accepted or misclassified the retired --scripts option.');
}

const failedBuild = await runCommand(binary, ['build', 'missing.md', '--json'], consumerDirectory);
if (failedBuild.exitCode !== 1 || failedBuild.stderr !== '') {
  throw new Error(
    'Installed CLI did not use the validation exit code and stdout-only NDJSON contract.',
  );
}
const failureRecord: unknown = JSON.parse(failedBuild.stdout.trim());
if (
  typeof failureRecord !== 'object' ||
  failureRecord === null ||
  !('type' in failureRecord) ||
  failureRecord.type !== 'diagnostic' ||
  !('code' in failureRecord) ||
  failureRecord.code !== 'INPUT_NOT_FOUND' ||
  !('remediation' in failureRecord) ||
  typeof failureRecord.remediation !== 'string'
) {
  throw new Error('Installed CLI did not emit the expected actionable validation diagnostic.');
}

const candidateEvidenceBytes = `${JSON.stringify(
  {
    evidenceKind: 'local-packed-candidate',
    registryCandidateClaim: false,
    sourceState: await readSourceState(),
    runtime: { executable: process.execPath, version: process.versions.node },
    npm: { executable: npmExecutable, version: npmVersionOutput.trim() },
    npx: { executable: npxExecutable, version: npxVersionOutput.trim() },
    npmPack: {
      cwd: path.resolve('.'),
      argv: npmPackArgv,
      cacheDirectory: npmPackCacheDirectory,
      environment: npmPackEnvironment,
      exitCode: 0,
      stdout: npmPackOutcome.stdout,
      stderr: npmPackOutcome.stderr,
    },
    preflight: {
      consumerDirectory,
      npmCacheDirectory,
      checkoutLinkAbsent: true,
      executableSearchDirectories: candidateExecutableSearchDirectories,
      globalExecutableChecks,
      globalExecutableAbsent,
      reusedCacheAbsent: true,
      sanitizedEnvironment: candidateNpxEnvironment,
    },
    tarball: {
      path: tarballPath,
      sha256: tarballSha256,
      integrity: tarballIntegrity,
      shasum: tarballShasum,
      size: tarballSize,
      unpackedSize: packedInventory.reduce((total, file) => total + file.size, 0),
      files: packedFiles.length,
      inventory: packedInventory,
      packageVersion: releaseVersion,
    },
    install: {
      cwd: consumerDirectory,
      argv: installArgv,
      exitCode: 0,
      stdout: installOutcome.stdout,
      stderr: installOutcome.stderr,
    },
    installed: {
      packagePath: path.join(consumerDirectory, 'node_modules', 'agentic-report'),
      binary,
      binaryIdentity,
      version: installedVersion.trim(),
    },
    localOnlyNpxResolution: {
      cwd: consumerDirectory,
      argv: resolutionArgv,
      ...resolutionOutcome,
    },
    localOnlyNpxCommands: candidateNpxEvidence,
    chromium: candidateBrowserEvidence,
  },
  null,
  2,
)}\n`;
await writeFile(path.join(packageRunDirectory, 'candidate-evidence.json'), candidateEvidenceBytes);
await writeFile(path.join(packageDirectory, 'candidate-evidence.json'), candidateEvidenceBytes);

console.log(
  `Package and clean npm consumer verified: ${tarballPath} (sha256 ${tarballSha256}, integrity ${tarballIntegrity}, shasum ${tarballShasum}, ${tarballSize} bytes, ${packedFiles.length} files)`,
);

function assertNpmPackRecord(
  record: Readonly<Record<string, unknown>>,
  expected: {
    readonly tarballFilename: string;
    readonly tarballShasum: string;
    readonly tarballIntegrity: string;
    readonly tarballSize: number;
    readonly packedInventory: readonly {
      readonly path: string;
      readonly size: number;
      readonly sha256: string;
    }[];
  },
): void {
  const npmFiles = record.files;
  if (!Array.isArray(npmFiles)) {
    throw new Error('npm pack record does not contain a files array.');
  }
  const npmInventory = npmFiles
    .map((value) => {
      const file = requireRecord(value, 'npm pack file');
      return {
        path: `package/${requireString(file.path, 'npm pack file path')}`,
        size: requireNumber(file.size, 'npm pack file size'),
      };
    })
    .sort(compareInventoryPaths);
  const expectedInventory = expected.packedInventory
    .map(({ path: file, size }) => ({ path: file, size }))
    .sort(compareInventoryPaths);
  const unpackedSize = expected.packedInventory.reduce((total, file) => total + file.size, 0);
  const mismatches = [
    ['id', record.id, `agentic-report@${releaseVersion}`],
    ['name', record.name, 'agentic-report'],
    ['version', record.version, releaseVersion],
    ['filename', record.filename, expected.tarballFilename],
    ['shasum', record.shasum, expected.tarballShasum],
    ['integrity', record.integrity, expected.tarballIntegrity],
    ['size', record.size, expected.tarballSize],
    ['unpackedSize', record.unpackedSize, unpackedSize],
    ['entryCount', record.entryCount, expected.packedInventory.length],
    ['files', npmInventory, expectedInventory],
  ].filter(([, actual, wanted]) => JSON.stringify(actual) !== JSON.stringify(wanted));
  if (mismatches.length > 0) {
    throw new Error(
      `npm pack metadata differs from the extracted tarball bytes: ${mismatches
        .map(
          ([field, actual, wanted]) =>
            `${String(field)}=${JSON.stringify(actual)} expected ${JSON.stringify(wanted)}`,
        )
        .join('; ')}`,
    );
  }
}

function compareInventoryPaths(
  left: { readonly path: string },
  right: { readonly path: string },
): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

async function expectedTarballFiles(): Promise<string[]> {
  const expected = new Set([
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/THIRD_PARTY_NOTICES.md',
    'package/dist/browser/document.css',
    'package/dist/browser/runtime.js',
    ...[
      'AGENT-REFERENCE.md',
      'ARCHITECTURE.md',
      'generated/directives.schema.json',
      'generated/extension-proposal.schema.json',
      'generated/extension-proposal.template.json',
      'generated/manifest.schema.json',
      'generated/source-contract.json',
      'generated/source.schema.json',
      'product/code-glossary-extension.json',
      'product/copyable-prose-extension.json',
      'product/diagram-extension.json',
      'product/in-flow-contents-extension.json',
      'product/review-workspace-extension.json',
      'product/response-workspace-extension.json',
      'product/share-safe-build-extension.json',
      'product/time-text-extension.json',
      'product/source-link-extension.json',
      'product/source-contract.md',
    ].map((file) => `package/docs/${file}`),
  ]);
  expected.add('package/skills/agentic-report/SKILL.md');

  for (const source of await recursiveRelativeFiles(path.resolve('src'))) {
    if (
      source.startsWith('browser/') ||
      source.endsWith('.d.ts') ||
      (!source.endsWith('.ts') && !source.endsWith('.tsx'))
    ) {
      continue;
    }
    const stem = source.replace(/\.tsx?$/u, '');
    for (const suffix of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
      expected.add(`package/dist/node/${stem}${suffix}`);
    }
  }

  const exampleManifest = requireRecord(
    JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8')),
    'source example manifest',
  );
  if (!Array.isArray(exampleManifest.examples)) {
    throw new Error('Source example manifest must contain an examples array.');
  }
  expected.add('package/examples/manifest.json');
  expected.add('package/examples/showcase-contract.json');
  for (const value of exampleManifest.examples) {
    const example = requireRecord(value, 'source example manifest entry');
    if (typeof example.path !== 'string' || !Array.isArray(example.files)) {
      throw new Error('Source example manifest entry has an invalid path or files value.');
    }
    for (const fileValue of example.files) {
      const file = requireRecord(fileValue, 'source example manifest file');
      if (typeof file.path !== 'string') {
        throw new Error('Source example manifest file has an invalid path.');
      }
      expected.add(`package/examples/${example.path}/${file.path}`);
    }
  }
  return [...expected].sort();
}

async function assertPackedContentIsPublishSafe(
  tarballPath: string,
  packedFiles: readonly string[],
): Promise<void> {
  const forbiddenPath =
    /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.gitconfig|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|log|tmp|bak)|moira-ws|agent_temp_files_local|test-results)(?:\/|$)/u;
  const forbiddenPaths = packedFiles.filter((file) => forbiddenPath.test(file));
  if (forbiddenPaths.length > 0) {
    throw new Error(
      `Packed npm tarball contains private or temporary paths:\n${forbiddenPaths.join('\n')}`,
    );
  }

  const sensitivePatterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
    ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{20,}/u],
    ['OpenAI token', /sk-[A-Za-z0-9_-]{20,}/u],
    ['AWS access key', /AKIA[0-9A-Z]{16}/u],
    ['Google API key', /AIza[0-9A-Za-z_-]{30,}/u],
    ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/u],
    ['absolute local user path', /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\//u],
  ] as const;
  const findings: string[] = [];
  for (const file of packedFiles) {
    const { stdout } = await execFileAsync('tar', ['-xOf', tarballPath, file], {
      maxBuffer: 10 * 1024 * 1024,
    });
    for (const [label, pattern] of sensitivePatterns) {
      if (pattern.test(stdout)) findings.push(`${file}: ${label}`);
    }
  }
  if (findings.length > 0) {
    throw new Error(
      `Packed npm tarball failed the sensitive-content scan:\n${findings.join('\n')}`,
    );
  }
}

async function recursiveRelativeFiles(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .map(async (entry) => {
        const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
        return entry.isDirectory() ? await recursiveRelativeFiles(root, child) : [child];
      }),
  );
  return files.flat();
}

async function directoryByteSnapshot(root: string): Promise<Readonly<Record<string, string>>> {
  const snapshot: Record<string, string> = {};
  for (const file of await recursiveRelativeFiles(root)) {
    snapshot[file] = (await readFile(path.join(root, ...file.split('/')))).toString('base64');
  }
  return snapshot;
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      ...(environment === undefined ? {} : { env: environment }),
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function inspectCandidateArtifacts(
  artifacts: readonly {
    readonly format: 'single-file' | 'directory';
    readonly path: string;
    readonly expectReviewThreads?: boolean;
  }[],
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const browser = await chromium.launch();
  try {
    const evidence: Readonly<Record<string, unknown>>[] = [];
    for (const artifact of artifacts) {
      const context = await browser.newContext({
        viewport:
          artifact.format === 'single-file'
            ? { width: 1440, height: 1000 }
            : { width: 390, height: 844 },
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      await page.goto(pathToFileURL(artifact.path).href);
      const themeToggle = page.locator('[data-theme-toggle]');
      const themeBefore = await page.locator('html').getAttribute('data-theme');
      if ((await themeToggle.count()) !== 1) {
        throw new Error(`Installed ${artifact.format} candidate is missing its theme control.`);
      }
      await themeToggle.click();
      const themeAfter = await page.locator('html').getAttribute('data-theme');
      const reviewToggle = page.locator('[data-review-toggle]');
      if ((await reviewToggle.count()) !== 1) {
        throw new Error(`Installed ${artifact.format} candidate is missing Review Workspace.`);
      }
      await reviewToggle.click();
      const reviewDialog = page.locator('[data-review-dialog]');
      if ((await reviewDialog.getAttribute('open')) === null) await reviewToggle.click();
      const reviewOpen = await reviewDialog.getAttribute('open');
      const reviewTargets = await page.locator('[data-review-target-control]:visible').count();
      const reviewThreads = await page
        .locator('[data-review-thread-state="open"], [data-review-thread-state="resolved"]')
        .count();
      const reviewModal = await reviewDialog.evaluate((element) => element.matches(':modal'));
      await page.locator('[data-review-exit]').click();
      const observed = await page.evaluate(() => ({
        title: document.title,
        heading: document.querySelector('h1')?.textContent ?? '',
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      await context.close();
      if (
        errors.length > 0 ||
        observed.heading === '' ||
        observed.horizontalOverflow ||
        themeBefore === themeAfter ||
        reviewOpen === null ||
        reviewTargets === 0 ||
        (artifact.expectReviewThreads === true && reviewThreads === 0) ||
        reviewModal !== (artifact.format === 'directory')
      ) {
        throw new Error(
          `Installed ${artifact.format} candidate failed Chromium inspection: ${JSON.stringify({ errors, observed })}`,
        );
      }
      evidence.push({
        format: artifact.format,
        path: artifact.path,
        errors,
        themeBefore,
        themeAfter,
        reviewTargets,
        reviewResponses: reviewThreads,
        reviewModal,
        ...observed,
      });
    }
    return evidence;
  } finally {
    await browser.close();
  }
}

async function readSourceState(): Promise<Readonly<Record<string, unknown>>> {
  const [{ stdout: revisionOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD']),
    execFileAsync('git', ['status', '--porcelain=v1', '-uall', '-z']),
  ]);
  const entries = statusOutput.split('\0').filter(Boolean);
  if (entries.length === 0) {
    return { kind: 'committed', revision: revisionOutput.trim() };
  }
  const hash = createHash('sha256');
  for (const entry of entries) {
    const status = entry.slice(0, 2);
    const file = entry.slice(3);
    hash.update(status);
    hash.update('\0');
    hash.update(file);
    hash.update('\0');
    if ((await pathExists(file)) && (await lstat(file)).isFile()) {
      hash.update(await readFile(file));
    }
    hash.update('\0');
  }
  return {
    kind: 'working-tree-candidate',
    baseRevision: revisionOutput.trim(),
    changedFiles: entries.length,
    statusSha256: hash.digest('hex'),
  };
}

function requireSingleNdjsonRecord(
  outcome: { readonly stdout: string },
  label: string,
): Readonly<Record<string, unknown>> {
  const lines = outcome.stdout.trim().split('\n');
  if (lines.length !== 1 || lines[0] === undefined) {
    throw new Error(`${label} must contain exactly one NDJSON record.`);
  }
  return requireRecord(JSON.parse(lines[0]) as unknown, label);
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function redactCredentialPath(value: string): string {
  return value.replace('token=path-sentinel', 'token=[REDACTED]');
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} keys differ: expected ${wanted.join(', ')}, received ${actual.join(', ')}.`,
    );
  }
}
