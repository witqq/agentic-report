import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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
await execFileAsync('pnpm', ['pack', '--pack-destination', packageDirectory]);
const tarballs = (await readdir(packageDirectory)).filter((file) => file.endsWith('.tgz')).sort();
const tarball = tarballs.at(-1);
if (tarball === undefined) {
  throw new Error('pnpm pack did not create a tarball.');
}
const tarballPath = path.join(packageDirectory, tarball);
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
const tarballSha256 = createHash('sha256')
  .update(await readFile(tarballPath))
  .digest('hex');
const cli = await readFile(path.resolve('dist/node/cli.js'), 'utf8');
if (!cli.startsWith('#!/usr/bin/env node')) {
  throw new Error('CLI build is missing its Node shebang.');
}

const consumersDirectory = path.resolve('test-results/package-consumers');
await mkdir(consumersDirectory, { recursive: true });
const consumerDirectory = await mkdtemp(path.join(consumersDirectory, 'consumer-'));
const npmCacheDirectory = path.join(consumerDirectory, '.npm-cache');
await writeFile(
  path.join(consumerDirectory, 'package.json'),
  JSON.stringify({ name: 'agentic-report-package-consumer', private: true }),
);
await execFileAsync(
  'npm',
  [
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
  ],
  { cwd: consumerDirectory, timeout: 120_000 },
);
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
  installedPackage.homepage !== 'https://github.com/witqq/agentic-report#readme' ||
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
  }
}

const firstUseProject = path.join(consumerDirectory, 'token=path-sentinel');
const transportedFirstUseProject = redactCredentialPath(firstUseProject);
const initialized = await runCommand(
  binary,
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
const validated = await runCommand(
  binary,
  ['validate', firstUseProject, '--json'],
  consumerDirectory,
);
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

const inspected = await runCommand(
  binary,
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
const firstUseBuild = await runCommand(
  binary,
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
await writeFile(reportPath, '# Packed CLI report\n\nBuilt from a clean npm consumer.\n');
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
    'warnings',
  ],
  'installed CLI result',
);
if (cliResult.format !== 'single-file') {
  throw new Error('Installed CLI default build did not select single-file output.');
}
const installedHtml = await readFile(outputPath, 'utf8');
if (!installedHtml.includes('<h1 id="packed-cli-report">Packed CLI report</h1>')) {
  throw new Error('Installed CLI did not build the expected self-contained HTML artifact.');
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

const esmOutput = path.join(consumerDirectory, 'esm-directory');
const { stdout: esmBuildOutput } = await execFileAsync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {buildReport} from 'agentic-report'; const result=await buildReport({input:process.argv[1],output:process.argv[2],format:'directory'}); console.log(JSON.stringify(result));",
    reportPath,
    esmOutput,
  ],
  { cwd: consumerDirectory },
);
const esmResult = requireRecord(JSON.parse(esmBuildOutput), 'installed ESM build result');
assertExactKeys(
  esmResult,
  ['outputPath', 'format', 'bytes', 'embeddedAssets', 'externalAssets', 'contentHash', 'warnings'],
  'installed ESM build result',
);
if (
  esmResult.format !== 'directory' ||
  esmResult.outputPath !== path.join(esmOutput, 'index.html')
) {
  throw new Error('Installed ESM buildReport did not produce directory output.');
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
    "import type { BuildReportOptions, BuildReportResult, InspectReportOptions, InspectReportResult, ValidateReportOptions, ValidateReportResult } from 'agentic-report';",
    "const supported: BuildReportOptions = { input: 'report.md', format: 'directory' };",
    "const validate: ValidateReportOptions = { input: 'report.md' };",
    "const inspect: InspectReportOptions = { input: 'report.md', format: 'directory' };",
    'declare const validateResult: ValidateReportResult;',
    'declare const inspectResult: InspectReportResult;',
    '// @ts-expect-error scripts is a retired option and must not reappear',
    "const retired: BuildReportOptions = { input: 'report.md', scripts: 'none' };",
    'declare const result: BuildReportResult;',
    '// @ts-expect-error scripts is a retired result member and must not reappear',
    'result.scripts;',
    'void supported;',
    'void validate;',
    'void inspect;',
    'void validateResult;',
    'void inspectResult;',
    'void retired;',
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

console.log(
  `Package and clean npm consumer verified: ${tarballPath} (sha256 ${tarballSha256}, ${packedFiles.length} files)`,
);

async function expectedTarballFiles(): Promise<string[]> {
  const expected = new Set([
    'package/package.json',
    'package/README.md',
    'package/PRODUCT-REQUIREMENTS.md',
    'package/LICENSE',
    'package/dist/browser/document.css',
    'package/dist/browser/runtime.js',
    ...[
      'AGENT-REFERENCE.md',
      'ARCHITECTURE.md',
      'DEVELOPMENT.md',
      'PROJECT_CHECKLIST.md',
      'TESTING.md',
      'generated/directives.schema.json',
      'generated/extension-proposal.schema.json',
      'generated/extension-proposal.template.json',
      'generated/manifest.schema.json',
      'generated/source-contract.json',
      'generated/source.schema.json',
      'product/source-contract.md',
    ].map((file) => `package/docs/${file}`),
  ]);

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
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd });
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
