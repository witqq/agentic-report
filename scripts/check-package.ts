/**
 * Проверка выпускного кандидата npm (`pnpm pack:check`, после `pnpm build`). Скрипт собирает тарбол через
 * `npm pack`, ставит его в чистого потребителя с изолированным поиском исполняемых файлов и доказывает, что
 * опубликованные байты работают у человека без этого репозитория: тесты репозитория ходят в `src/` и `dist/`
 * напрямую и не видят ни забытого в `files` каталога, ни шима, ни ресурса, который читается из рабочего
 * каталога. Каждая проверка бросает исключение на своём контрпримере; принятый кандидат описывается в
 * `candidate-evidence.json` рядом с тарболом и в `test-results/package/` (его читает docs/RELEASE.md).
 *
 * Классы проверок в порядке выполнения:
 * - опись тарбола равна белому списку выпуска, который выводится из исходников, скилла, расширений и
 *   манифеста примеров; в тарболе нет приватных и временных путей и шаблонов секретов;
 * - запись `npm pack --json` совпадает с байтами распакованного тарбола; у CLI есть шебанг Node;
 * - изоляция потребителя: поиск исполняемых файлов не выходит за каталог прогона и системные утилиты,
 *   и установленного где-то ещё продукта в нём нет;
 * - метаданные, лицензия, скилл и манифест примеров установленного пакета совпадают с договором выпуска;
 * - `npx --no-install` находит именно установленный шим, и версия CLI равна версии выпуска;
 * - договоры обнаружения `describe`, `schema`, ESM API и `examples`: модель страницы, темы, стартеры;
 * - каждый пример из манифеста собирается из установленного пакета в обоих форматах со своей раскладкой
 *   и подписью; каждое эталонное расширение собирает свои примеры;
 * - скопированные и правленные примеры Terminal и Cinematic пересобираются с правкой и своей темой;
 * - первое использование: init → правка → build; build отвергает битый источник без порчи вывода и без
 *   утечки учётных данных, validate и inspect не трогают вывод, CLI и ESM описывают проект одинаково;
 * - ревью: манифест целей, привязка `review.json`, прошлое ревью в validate, inspect и build;
 * - детерминизм: два независимых процесса дают одни байты single-file и одно дерево directory;
 * - Chromium: собранные кандидаты открываются через `file://` без ошибок, переключают схему и открывают
 *   рабочее место ревью;
 * - ресурсы браузера берутся из пакета, а не из рабочего каталога потребителя;
 * - договоры результата сборки, ссылки на исходники (сохраняются по умолчанию, `--share` их обезвреживает),
 *   directory-вывод с адресуемыми по содержимому ресурсами, ESM `buildReport`;
 * - отказы: неверный формат ESM без порчи соседних файлов, публичные типы под `tsc`, удалённая опция
 *   `--scripts`, диагностика отсутствующего входа;
 * - путь скилла вне репозитория: проверка оформления скриптом из пакета и снимки командой из SKILL.md.
 */

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

import { EXTENSION_KINDS } from '../src/extensions/types.ts';
import {
  findPackedSensitiveContent,
  inspectExecutableSearch,
  readPackedRegularFile,
} from './package-provenance.ts';

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
// Ожидания по составу берутся из реестров репозитория, а не из чисел в этом файле: тарбол, где нет
// примера, стартера или темы из реестра, должен провалить проверку, а новый пример — попасть под неё сам.
const sourceExampleManifest = requireRecord(
  JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8')) as unknown,
  'source example manifest',
);
if (!Array.isArray(sourceExampleManifest.examples)) {
  throw new Error('Source example manifest must contain an examples array.');
}
const sourceExamples = sourceExampleManifest.examples.map((value) =>
  requireRecord(value, 'source example manifest entry'),
);
const sourceContract = requireRecord(
  JSON.parse(
    await readFile(path.resolve('docs/generated/source-contract.json'), 'utf8'),
  ) as unknown,
  'generated source contract',
);
const sourceThemeNames = requireArray(
  requireRecord(sourceContract.page, 'generated page contract').themes,
  'generated theme list',
).map((theme) => requireRecord(theme, 'generated theme').name);
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
// Ловит несколько тарболов или пустой ответ `npm pack`: дальше проверяется ровно один кандидат.
if (!Array.isArray(npmPackRecords) || npmPackRecords.length !== 1) {
  throw new Error('npm pack --json did not return exactly one package record.');
}
const npmPackRecord = requireRecord(npmPackRecords[0], 'npm pack record');
const tarballFilename = requireString(npmPackRecord.filename, 'npm pack filename');
const tarballPath = path.join(packageRunDirectory, tarballFilename);
const { stdout: listing } = await execFileAsync('tar', ['-tf', tarballPath]);
const packedFiles = listing.trim().split('\n').sort();
// Ловит файл, забытый в `files` или в сборке (его нет у потребителя), и лишний файл, попавший в выпуск.
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
assertPackedPathsArePublishSafe(packedFiles);
const tarballBytes = await readFile(tarballPath);
const tarballSha256 = createHash('sha256').update(tarballBytes).digest('hex');
const tarballShasum = createHash('sha1').update(tarballBytes).digest('hex');
const tarballIntegrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`;
const tarballSize = (await lstat(tarballPath)).size;
const extractedDirectory = path.join(packageRunDirectory, 'extracted');
await mkdir(extractedDirectory);
await execFileAsync('tar', ['-xf', tarballPath, '-C', extractedDirectory]);
const packedEntries = await Promise.all(
  packedFiles.map(async (file) => {
    const bytes = await readPackedRegularFile(extractedDirectory, file);
    return {
      path: file,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      text: bytes.toString('utf8'),
    };
  }),
);
assertPackedContentIsPublishSafe(packedEntries);
const packedInventory = packedEntries.map(({ path: file, size, sha256 }) => ({
  path: file,
  size,
  sha256,
}));
assertNpmPackRecord(npmPackRecord, {
  tarballFilename,
  tarballShasum,
  tarballIntegrity,
  tarballSize,
  packedInventory,
});
// Ловит CLI без шебанга: у потребителя шим `bin` запустил бы его не через Node.
const cli = await readFile(path.resolve('dist/node/cli.js'), 'utf8');
if (!cli.startsWith('#!/usr/bin/env node')) {
  throw new Error('CLI build is missing its Node shebang.');
}

const consumersDirectory = path.resolve('test-results/package-consumers');
await mkdir(consumersDirectory, { recursive: true });
const consumerDirectory = await mkdtemp(path.join(consumersDirectory, 'consumer-'));
const npmCacheDirectory = path.join(consumerDirectory, '.npm-cache');
// The run owns its toolchain directory and its global prefix instead of demanding a clean machine:
// only the interpreters it links are reachable, so a globally installed product cannot serve the
// consumer even when the developer works through `npm link`.
const runtimeDirectory = path.join(consumerDirectory, '.toolchain');
const runtimeBinDirectory = path.join(runtimeDirectory, 'bin');
const globalPrefixDirectory = path.join(consumerDirectory, '.npm-global');
await mkdir(runtimeBinDirectory, { recursive: true });
await mkdir(path.join(globalPrefixDirectory, 'bin'), { recursive: true });
const linkedToolchainExecutables =
  process.platform === 'win32'
    ? (['node.exe', 'npm.cmd', 'npx.cmd'] as const)
    : (['node', 'npm', 'npx'] as const);
for (const executable of linkedToolchainExecutables) {
  const machinePath = path.join(executableDirectory, executable);
  if (!(await pathExists(machinePath))) continue;
  await symlink(machinePath, path.join(runtimeBinDirectory, executable));
}
// System utility directories stay reachable because npm and npx shell out; the directories that can
// carry an installed product — the interpreter directory and /usr/local/bin — are replaced by the
// run's own toolchain and global prefix.
const candidateExecutableSearchDirectories = [
  ...new Set(
    process.platform === 'win32'
      ? [
          runtimeBinDirectory,
          path.join(globalPrefixDirectory, 'bin'),
          ...(process.env.SystemRoot === undefined
            ? []
            : [path.join(process.env.SystemRoot, 'System32')]),
        ]
      : [runtimeBinDirectory, path.join(globalPrefixDirectory, 'bin'), '/usr/bin', '/bin'],
  ),
];
// The isolation invariant is asserted rather than assumed: a search directory that is neither owned by
// this run nor a system utility directory would let a machine-installed product serve the consumer, and
// that mistake must fail everywhere, not only on a machine that happens to have one installed.
const systemUtilityDirectories =
  process.platform === 'win32'
    ? process.env.SystemRoot === undefined
      ? []
      : [path.join(process.env.SystemRoot, 'System32')]
    : ['/usr/bin', '/bin'];
for (const directory of candidateExecutableSearchDirectories) {
  const ownedByRun = directory.startsWith(`${consumerDirectory}${path.sep}`);
  if (!ownedByRun && !systemUtilityDirectories.includes(directory)) {
    throw new Error(
      `Consumer executable search escapes the run: ${directory} is neither inside ${consumerDirectory} nor a system utility directory.`,
    );
  }
}
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
  npm_config_prefix: globalPrefixDirectory,
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
// Ловит исполняемый файл продукта, достижимый в окружении прогона: тогда потребителя обслужил бы он, а не
// тарбол. Проверки `node_modules` и кэша здесь не могут сработать: оба пути лежат в только что созданном
// mkdtemp-каталоге.
if (
  (await pathExists(path.join(consumerDirectory, 'node_modules'))) ||
  !globalExecutableAbsent ||
  (await pathExists(npmCacheDirectory))
) {
  throw new Error(
    'Clean consumer preflight found a checkout link, a product executable inside the run environment, or a reused cache.',
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
// Ловит расхождение опубликованного package.json с договором выпуска: чужую версию, потерянные типы,
// экспорт, bin, движок Node или ссылки на репозиторий.
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
// Ловит устаревшую или отсутствующую лицензию в тарболе.
if (
  (await readFile(
    path.join(consumerDirectory, 'node_modules', 'agentic-report', 'LICENSE'),
    'utf8',
  )) !== (await readFile(path.resolve('LICENSE'), 'utf8'))
) {
  throw new Error('Installed package license differs from the repository license.');
}
// Ловит скилл в пакете, отставший от репозитория: агент потребителя учился бы по старой редакции.
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
// Ловит выпуск с манифестом примеров, который сам признаёт непокрытые классы витрины.
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
// Ловит шим `node_modules/.bin`, ведущий не в объявленный `bin` пакета (или объявленный файл без шима).
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
// Ловит `npx`, который первым находит не установленный шим потребителя, а другой `agentic-report`.
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
// Ловит кандидата, который через `npx --no-install` не запускается, печатает предупреждения в stderr или
// сообщает чужую версию; следующий блок ловит то же для прямого вызова шима.
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
// Ловит `describe --json`, который не отдаёт машинно-читаемый каталог директив.
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
// Ловит потерю формата вывода, смену формата по умолчанию или размещения рантайма.
assertExactKeys(installedOutputs, ['default', 'formats', 'runtimePlacement'], 'output contract');
if (
  installedOutputs.default !== 'single-file' ||
  JSON.stringify(installedOutputs.formats) !== JSON.stringify(['single-file', 'directory']) ||
  JSON.stringify(installedOutputs.runtimePlacement) !==
    JSON.stringify({ 'single-file': 'inline', directory: 'external' })
) {
  throw new Error('Installed discovery contract does not expose the two format-derived runtimes.');
}
// Ловит неполную модель страницы у потребителя: потерянную раскладку, категорию, схему, умолчание или
// тему. Темы сверяются по именам с реестром репозитория (docs/generated/source-contract.json), так что
// тарбол без встроенной темы падает, а новая тема не требует править этот файл.
if (
  installedPage.defaultLayout !== 'document' ||
  JSON.stringify(installedPage.layouts) !==
    JSON.stringify(['document', 'dashboard', 'landing', 'mixed', 'slides', 'screens']) ||
  !Array.isArray(installedPage.categories) ||
  JSON.stringify(
    (installedPage.categories as readonly { readonly id?: unknown }[]).map(
      (category) => category.id,
    ),
  ) !== JSON.stringify(['landing', 'document', 'dashboard', 'presentation', 'answer']) ||
  installedPage.defaultScheme !== 'system' ||
  JSON.stringify(installedPage.schemes) !== JSON.stringify(['system', 'light', 'dark']) ||
  installedPage.defaultTheme !== 'neutral' ||
  !Array.isArray(installedPage.themes) ||
  JSON.stringify(
    (installedPage.themes as readonly { readonly name?: unknown }[]).map((theme) => theme.name),
  ) !== JSON.stringify(sourceThemeNames) ||
  installedPage.defaultAttribution !== true ||
  typeof installedPage.theme !== 'object' ||
  installedPage.theme === null ||
  !Array.isArray((installedPage.theme as { readonly fields?: unknown }).fields)
) {
  throw new Error('Installed discovery contract does not expose the complete page model.');
}
// Ловит каталог команд, в котором агент не найдёт основной путь init → validate → inspect → build.
for (const command of ['init', 'validate', 'inspect', 'build']) {
  if (typeof installedCommands[command] !== 'string') {
    throw new Error(`Installed discovery contract is missing the ${command} command.`);
  }
}

const { stdout: schemaOutput } = await execFileAsync(binary, ['schema', '--scope', 'source'], {
  cwd: consumerDirectory,
});
const sourceSchema: unknown = JSON.parse(schemaOutput);
// Ловит `schema`, который отдаёт не схему источника или схему без свойств.
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
// Ловит возврат удалённой политики скриптов в опубликованную схему.
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
// Ловит лишнее или потерянное поле `output` в схеме манифеста и смену умолчания подписи страницы.
assertExactKeys(outputProperties, ['format', 'maxInlineBytes'], 'manifest output schema');
if (
  requireRecord(manifestProperties.attribution, 'installed attribution schema').default !== true
) {
  throw new Error('Installed manifest schema lost the default attribution contract.');
}
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
// Ловит ESM-экспорт, который не отдаёт схему, директивы и примеры или описывает страницу иначе, чем CLI.
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
// Ловит `examples --json` без списка примеров или без путей к их источникам.
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
const installedExamples = examplesContract.examples.map((example) =>
  requireRecord(example, 'installed example'),
);
// Ловит каталог примеров у потребителя, разошедшийся с манифестом репозитория: потерянный, лишний или
// переставленный пример.
if (
  JSON.stringify(installedExamples.map((example) => example.id)) !==
  JSON.stringify(sourceExamples.map((example) => example.id))
) {
  throw new Error('Installed examples contract differs from the source example manifest.');
}
// Ловит стартер, выпавший из каталога или потерявший пометку `starter`, и смену стартера по умолчанию.
// Ожидание — стартеры манифеста репозитория в его порядке; по умолчанию — `document`.
const installedStarters = installedExamples.filter((example) => example.starter !== undefined);
if (
  JSON.stringify(installedStarters.map((example) => example.id)) !==
  JSON.stringify(
    sourceExamples.filter((example) => example.starter !== undefined).map((example) => example.id),
  )
) {
  throw new Error('Installed examples contract does not expose the category starters.');
}
const defaultStarter = installedStarters.find(
  (example) => requireRecord(example.starter, 'installed starter metadata').default,
);
if (defaultStarter?.id !== 'document') {
  throw new Error('Installed starter catalog lost its document default.');
}
// Ловит эталонные расширения, выпавшие из тарбола или из `examples`: агент находит их только там, и каждое
// должно собираться из установленной папки — поставщик запускается из неё, остров читается из неё. Уровни
// берутся из договора расширений (`EXTENSION_KINDS`), так что новый уровень без эталона провалит проверку.
if (!('extensions' in examplesContract) || !Array.isArray(examplesContract.extensions)) {
  throw new Error('Installed examples contract does not list the reference extensions.');
}
const installedExtensions = examplesContract.extensions.map((extension) =>
  requireRecord(extension, 'installed reference extension'),
);
if (
  !EXTENSION_KINDS.every((kind) => installedExtensions.some((extension) => extension.kind === kind))
) {
  throw new Error('Installed reference extensions do not cover every level of the extension API.');
}
// Ловит эталон без README, без двух примеров или с примером, который не собирается у потребителя.
const builtExtensionExamples = new Set<string>();
for (const extension of installedExtensions) {
  await readFile(requireString(extension.readme, 'reference extension README'), 'utf8');
  if (!Array.isArray(extension.examples) || extension.examples.length < 2) {
    throw new Error(`Installed reference extension ${String(extension.name)} lacks two examples.`);
  }
  for (const example of extension.examples) {
    const entry = requireString(example, 'reference extension example');
    if (builtExtensionExamples.has(entry)) continue;
    builtExtensionExamples.add(entry);
    const output = path.join(
      consumerDirectory,
      `extension-${String(extension.name)}-${builtExtensionExamples.size}.html`,
    );
    await execFileAsync(binary, ['build', entry, '--output', output], { cwd: consumerDirectory });
    await readFile(output, 'utf8');
  }
}
// Ловит пример, который не собирается из установленного пакета в одном из форматов, теряет раскладку,
// объявленную в его frontmatter (без объявления — раскладку по умолчанию), или подпись страницы. Список
// примеров — весь манифест репозитория, поэтому новый пример попадает под проверку без правки этого файла.
if (typeof installedPage.defaultLayout !== 'string') {
  throw new Error('Installed page contract does not declare a default layout.');
}
const defaultLayout = installedPage.defaultLayout;
for (const sourceExample of sourceExamples) {
  const installedExample = installedExamples.find((example) => example.id === sourceExample.id);
  if (installedExample === undefined || typeof installedExample.entry !== 'string') {
    throw new Error(`Installed examples contract is missing ${String(sourceExample.id)}.`);
  }
  const expected = {
    id: String(sourceExample.id),
    layout: declaredLayout(await readFile(installedExample.entry, 'utf8')) ?? defaultLayout,
  };
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
    if (
      !html.includes('data-report-attribution="true"') ||
      !html.includes('<a href="https://agentic-report.witqq.dev/">Made with Agentic Report</a>')
    ) {
      throw new Error(`Installed ${expected.id} ${format} artifact lost default attribution.`);
    }
    // Ловит лендинг, у которого оглавление в потоке собрано не из заголовков разделов, а лид и
    // приложение-глоссарий раздела потеряли своё место.
    if (expected.id === 'landing') {
      const inFlowContents = /<nav class="semantic-contents"[\s\S]*?<\/nav>/u.exec(html)?.[0];
      const workflowStart = /<section[^>]*id="workflow"/u.exec(html)?.index;
      const journeyStart = /<section[^>]*id="journey"/u.exec(html)?.index;
      const workflowSection =
        workflowStart !== undefined && journeyStart !== undefined && journeyStart > workflowStart
          ? html.slice(workflowStart, journeyStart)
          : undefined;
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
      if (
        workflowSection === undefined ||
        !workflowSection.includes('class="semantic-lead"') ||
        !workflowSection.includes('data-semantic="lead"') ||
        workflowSection.includes('id="glossary-portable-boundary"') ||
        !html.includes('href="#glossary-portable-boundary"') ||
        !html.includes('id="glossary-portable-boundary"') ||
        !html.includes('data-glossary-appendix=""')
      ) {
        throw new Error(
          `Installed landing ${format} artifact did not preserve lead and section-local appendix behavior.`,
        );
      }
    }
  }
}

// Ловит пример, который нельзя скопировать из пакета и править как свой проект: копия не собирается, не
// несёт правку автора или теряет тему примера.
for (const editable of [
  {
    id: 'terminal-portfolio',
    format: 'single-file',
    theme: 'terminal',
    marker: 'Installed Terminal source edit.',
  },
  {
    id: 'cinematic-story',
    format: 'directory',
    theme: 'noir',
    marker: 'Installed Cinematic source edit.',
  },
] as const) {
  const installedExample = installedExamples.find((example) => example.id === editable.id);
  if (installedExample === undefined || typeof installedExample.entry !== 'string') {
    throw new Error(`Installed examples contract is missing editable ${editable.id} source.`);
  }
  const editedProject = path.join(consumerDirectory, `edited-${editable.id}`);
  await cp(path.dirname(installedExample.entry), editedProject, { recursive: true });
  const editedEntry = path.join(editedProject, path.basename(installedExample.entry));
  await writeFile(editedEntry, `${await readFile(editedEntry, 'utf8')}\n${editable.marker}\n`);
  const editedOutput = path.join(consumerDirectory, `edited-${editable.id}-output`);
  const arguments_ = ['build', editedProject, '--output', editedOutput];
  if (editable.format === 'directory') arguments_.push('--format', 'directory');
  await execFileAsync(binary, arguments_, { cwd: consumerDirectory });
  const htmlPath =
    editable.format === 'directory' ? path.join(editedOutput, 'index.html') : editedOutput;
  const html = await readFile(htmlPath, 'utf8');
  if (!html.includes(editable.marker) || !html.includes(`data-theme="${editable.theme}"`)) {
    throw new Error(
      `Installed edited ${editable.id} source did not produce its expected artifact.`,
    );
  }
}

const firstUseProject = path.join(consumerDirectory, 'token=path-sentinel');
const transportedFirstUseProject = redactCredentialPath(firstUseProject);
const initialized = await runCandidateNpx(
  ['init', firstUseProject, '--starter', 'document', '--json'],
  consumerDirectory,
);
const initializedRecord = requireSingleNdjsonRecord(initialized, 'installed init result');
// Ловит init, который не создаёт стартер, пишет в stderr или печатает путь с учётными данными
// (`token=…` в имени каталога) без редактирования.
if (
  initialized.exitCode !== 0 ||
  initialized.stderr !== '' ||
  initializedRecord.type !== 'result' ||
  initializedRecord.starterId !== 'document' ||
  initializedRecord.projectPath !== transportedFirstUseProject ||
  initializedRecord.entryPath !== path.join(transportedFirstUseProject, 'report.md') ||
  initialized.stdout.includes('path-sentinel')
) {
  throw new Error('Installed CLI did not initialize the first-use project.');
}
const firstUseEntry = path.join(firstUseProject, 'report.md');
// Рабочее место ревью выключено по умолчанию, а этот прогон проверяет именно его протокол,
// поэтому страница заказывает режим явно, как это делает автор.
const starterSource = (await readFile(firstUseEntry, 'utf8')).replace(
  /^---\n/u,
  '---\nreview: true\n',
);
const editedSource = `${starterSource}\nAgent-authored edit.\n`;
const credentialBearingSource = `${editedSource}\n![Broken](https://alice:secret@local.test/image.png?token=private&X-Amz-Credential=credential-sentinel&X-Amz-Signature=signature-sentinel&X-Amz-Security-Token=security-token-sentinel)\n`;
await writeFile(firstUseEntry, credentialBearingSource);
// Любое из этих слов в выводе CLI означает, что учётные данные из источника или пути ушли наружу без
// редактирования.
const credentialSentinels =
  /alice|secret|private|path-sentinel|credential-sentinel|signature-sentinel|security-token-sentinel/u;

const firstUseOutput = path.join(firstUseProject, 'built.html');
await writeFile(firstUseOutput, 'preserve first-use output sentinel');
const rejectedFirstUseBuild = await runCandidateNpx(
  ['build', firstUseProject, '--output', firstUseOutput, '--json'],
  consumerDirectory,
);
const rejectedFirstUseDiagnostic = requireSingleNdjsonRecord(
  rejectedFirstUseBuild,
  'installed direct first-use build diagnostic',
);
// Ловит build, который публикует битый источник (удалённый ресурс) поверх готового вывода, не
// диагностирует его как REMOTE_ASSET_BLOCKED или печатает учётные данные из URL и пути.
if (
  rejectedFirstUseBuild.exitCode !== 1 ||
  rejectedFirstUseBuild.stderr !== '' ||
  rejectedFirstUseDiagnostic.type !== 'diagnostic' ||
  rejectedFirstUseDiagnostic.code !== 'REMOTE_ASSET_BLOCKED' ||
  credentialSentinels.test(rejectedFirstUseBuild.stdout) ||
  !rejectedFirstUseBuild.stdout.includes('[REDACTED]') ||
  (await readFile(firstUseOutput, 'utf8')) !== 'preserve first-use output sentinel'
) {
  throw new Error(
    'Installed direct first-use build did not validate the source before preserving its output.',
  );
}

await writeFile(firstUseEntry, editedSource);
const firstUseBuild = await runCandidateNpx(
  ['build', firstUseProject, '--output', firstUseOutput, '--json'],
  consumerDirectory,
);
const firstUseBuildRecord = requireSingleNdjsonRecord(
  firstUseBuild,
  'installed first-use build result',
);
// Ловит build, который после исправления источника не публикует страницу с правкой автора прямым
// вызовом, без validate и inspect перед ним.
if (
  firstUseBuild.exitCode !== 0 ||
  firstUseBuild.stderr !== '' ||
  firstUseBuildRecord.type !== 'result' ||
  firstUseBuildRecord.outputPath !== redactCredentialPath(firstUseOutput) ||
  firstUseBuild.stdout.includes('path-sentinel') ||
  !(await readFile(firstUseOutput, 'utf8')).includes('Agent-authored edit.')
) {
  throw new Error('Installed CLI did not complete the direct first-use build.');
}
const firstUseBytes = await readFile(firstUseOutput);

const analysisSingleSentinel = path.join(firstUseProject, 'report.html');
const analysisDirectorySentinel = path.join(firstUseProject, 'report-artifact', 'sentinel.txt');
await writeFile(analysisSingleSentinel, 'preserve single analysis sentinel');
await mkdir(path.dirname(analysisDirectorySentinel));
await writeFile(analysisDirectorySentinel, 'preserve directory analysis sentinel');
await writeFile(firstUseEntry, credentialBearingSource);

// Ловит validate и inspect, которые на битом источнике не отказывают с отредактированной диагностикой;
// следующий блок ловит их запись в вывод автора (свои report.html, report-artifact/ и прошлую сборку).
for (const command of ['validate', 'inspect']) {
  const broken = await runCommand(binary, [command, firstUseProject, '--json'], consumerDirectory);
  const diagnostic = requireSingleNdjsonRecord(broken, `installed broken ${command} diagnostic`);
  if (
    broken.exitCode !== 1 ||
    broken.stderr !== '' ||
    diagnostic.type !== 'diagnostic' ||
    diagnostic.code !== 'REMOTE_ASSET_BLOCKED' ||
    credentialSentinels.test(broken.stdout) ||
    !broken.stdout.includes('[REDACTED]')
  ) {
    throw new Error(
      `Installed ${command} did not return the expected redacted broken-source diagnostic.`,
    );
  }
}
if (
  (await readFile(analysisSingleSentinel, 'utf8')) !== 'preserve single analysis sentinel' ||
  (await readFile(analysisDirectorySentinel, 'utf8')) !== 'preserve directory analysis sentinel' ||
  !(await readFile(firstUseOutput)).equals(firstUseBytes)
) {
  throw new Error('Installed analysis commands mutated author output.');
}

await writeFile(firstUseEntry, editedSource);
const validated = await runCandidateNpx(['validate', firstUseProject, '--json'], consumerDirectory);
const validatedRecord = requireSingleNdjsonRecord(validated, 'installed validate result');
// Ловит validate, который отвергает исправленный проект, меняет форму записи результата, печатает путь с
// учётными данными или выбирает не single-file по умолчанию.
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
// Ловит inspect, который меняет форму записи, не учитывает `--format directory`, теряет файлы источника
// или каталог команд.
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
    'structure',
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
// Ловит расхождение ESM `validateReport`/`inspectReport` с CLI на одном и том же проекте.
if (
  installedEsmValidate.entryPath !== validatedRecord.entryPath ||
  JSON.stringify(installedEsmInspect.output) !== JSON.stringify(inspectedRecord.output) ||
  JSON.stringify(installedEsmInspect.sourceFiles) !== JSON.stringify(inspectedRecord.sourceFiles)
) {
  throw new Error('Installed ESM and CLI analysis routes do not describe the same project.');
}

// Ловит сборку с `review: true`, в которую не встроен манифест целей ревью или в нём нет цели-абзаца.
const firstUseHtml = firstUseBytes.toString('utf8');
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
// Ловит `review`, который не привязывает ответ к точной редакции страницы, теряет нить или печатает
// значение `token=` из сообщения без редактирования.
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
// Ловит validate, inspect (CLI и ESM) и build, которые не принимают прошлое ревью `--review`; сборка
// обязана встроить его состояние `exact` в оба формата.
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
// Ловит недетерминированную сборку: второй независимый процесс даёт другие байты single-file.
const repeatedFirstUseOutput = path.join(firstUseProject, 'built-again.html');
await execFileAsync(binary, ['build', firstUseProject, '--output', repeatedFirstUseOutput], {
  cwd: consumerDirectory,
});
if (!(await readFile(repeatedFirstUseOutput)).equals(await readFile(firstUseOutput))) {
  throw new Error('Independent installed CLI processes produced different single-file bytes.');
}

// Второй путь первого использования — через directory. Ловит init, build в каталог, validate и inspect с
// `--format directory`, которые не проходят у потребителя, и недетерминированное дерево каталога.
const directoryJourneyProject = path.join(consumerDirectory, 'directory-first-use');
const directoryInit = await runCommand(
  binary,
  ['init', directoryJourneyProject, '--starter', 'answer', '--json'],
  consumerDirectory,
);
const directoryInitRecord = requireSingleNdjsonRecord(
  directoryInit,
  'installed directory-journey init result',
);
if (
  directoryInit.exitCode !== 0 ||
  directoryInitRecord.type !== 'result' ||
  directoryInitRecord.starterId !== 'answer'
) {
  throw new Error('Installed CLI did not initialize the directory first-use journey.');
}
const directoryJourneyEntry = path.join(directoryJourneyProject, 'report.md');
await writeFile(
  directoryJourneyEntry,
  `${(await readFile(directoryJourneyEntry, 'utf8')).replace(/^---\n/u, '---\nreview: true\n')}\nDirectory journey agent edit.\n`,
);
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
for (const command of ['validate', 'inspect'] as const) {
  const arguments_ = [command, directoryJourneyProject, '--format', 'directory', '--json'];
  const result = await runCommand(binary, arguments_, consumerDirectory);
  const record = requireSingleNdjsonRecord(
    result,
    `installed optional directory ${command} result`,
  );
  if (result.exitCode !== 0 || result.stderr !== '' || record.type !== 'result') {
    throw new Error(`Installed optional directory ${command} check failed.`);
  }
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
// Ловит собранные у потребителя страницы, которые в Chromium падают, переполняются или теряют
// переключатель схемы и рабочее место ревью (подробности — у inspectCandidateArtifacts).
const candidateBrowserEvidence = await inspectCandidateArtifacts([
  { format: 'single-file', path: firstUseOutput },
  { format: 'directory', path: path.join(directoryJourneyOutput, 'index.html') },
  { format: 'single-file', path: installedPriorSingle, expectReviewThreads: true },
  {
    format: 'directory',
    path: path.join(installedPriorDirectory, 'index.html'),
    expectReviewThreads: true,
  },
]);

// Ловит CLI, который читает рантайм и стили из `dist/browser` рабочего каталога, а не из своего пакета:
// подложенные туда файлы не должны попасть в страницу.
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

// Договор результата сборки: CLI добавляет к результату ESM `buildReport` поля записи NDJSON `type` и
// `runId`. Ловит лишнее или потерянное поле результата.
const cliBuildResultKeys = [
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
] as const;
// Ловит сборку по умолчанию, которая выбирает не single-file, не строит страницу из источника или
// обезвреживает ссылки на исходники без `--share`.
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
assertExactKeys(cliResult, cliBuildResultKeys, 'installed CLI result');
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

// Ловит `--share`, который оставляет путь рабочей станции в ссылке на исходник или в её подписи.
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

// Ловит directory-сборку, которая встраивает рантайм вместо внешних ресурсов с хэшем в имени, меняет
// договор результата или без `--share` теряет ссылки на исходники.
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
assertExactKeys(directoryRecord, cliBuildResultKeys, 'installed directory CLI result');
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

// Ловит ESM `buildReport`, который в directory с `share: true` меняет договор результата или оставляет
// путь рабочей станции.
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
  cliBuildResultKeys.filter((key) => key !== 'type' && key !== 'runId'),
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

// Ловит ESM `buildReport`, который принимает неизвестный формат или, отказывая, создаёт вывод либо
// трогает соседний каталог `assets`.
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

// Ловит опубликованные типы, которые не компилируются у потребителя под strict NodeNext, потеряли
// экспортируемый тип или снова допускают удалённое поле `scripts` (тогда `@ts-expect-error` не нужен и
// `tsc` падает).
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

// Ловит CLI, который принимает удалённую опцию `--scripts` или отвергает её не как ошибку аргумента.
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

// Ловит отказ без кода выхода 1, с выводом в stderr или без диагностики INPUT_NOT_FOUND с подсказкой.
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

// Путь скилла от установленного тарбола во временном каталоге вне репозитория: стартер, проверка
// оформления скриптом из пакета и снимки ровно той командой, что описана в SKILL.md, — с Playwright,
// поставленным рядом через `npx -p`, потому что пакет браузера не везёт.
const skillJourneyRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-skill-journey-'));
// Ловит прогон внутри репозитория, где скилл мог бы опереться на его файлы, а не на пакет.
if (skillJourneyRoot.startsWith(`${path.resolve('.')}${path.sep}`)) {
  throw new Error(`Skill journey must run outside the repository: ${skillJourneyRoot}`);
}
const skillJourneyEnvironment: NodeJS.ProcessEnv = {
  ...candidateInstallEnvironment,
  ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH === undefined
    ? {}
    : { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }),
};
const playwrightVersion = requireString(
  requireRecord(sourcePackage.devDependencies, 'source devDependencies')['@playwright/test'],
  '@playwright/test version',
);
// Ловит SKILL.md, где команда снимков не закрепляет Playwright или закрепляет не ту версию, что у проекта.
const skillSourceText = await readFile(path.resolve('skills/agentic-report/SKILL.md'), 'utf8');
const pinnedPlaywright = [...skillSourceText.matchAll(/\bplaywright@(\S+)/gu)].map(
  (match) => match[1],
);
if (
  pinnedPlaywright.length === 0 ||
  pinnedPlaywright.some((version) => version !== playwrightVersion)
) {
  throw new Error(
    `SKILL.md must pin playwright@${playwrightVersion} for snapshots; found ${pinnedPlaywright.join(', ')}.`,
  );
}
const journeyPage = path.join(skillJourneyRoot, 'page');
await execFileAsync(binary, ['init', journeyPage, '--starter', 'landing'], {
  cwd: skillJourneyRoot,
  env: skillJourneyEnvironment,
});
const installedSkill = path.join(
  consumerDirectory,
  'node_modules',
  'agentic-report',
  'skills',
  'agentic-report',
);
// Ловит скрипт проверки оформления, который не запускается из установленного скилла против установленного
// CLI или не отдаёт список советов.
const designCheckOutcome = await execFileAsync(
  process.execPath,
  [path.join(installedSkill, 'scripts', 'design-check.mjs'), journeyPage, '--cli', binary],
  { cwd: skillJourneyRoot, env: skillJourneyEnvironment },
);
const designCheck = requireRecord(JSON.parse(designCheckOutcome.stdout), 'design check result');
if (!Array.isArray(designCheck.advice)) throw new Error('Design check returned no advice list.');
// Ловит команду снимков из SKILL.md, которая с тарболом и закреплённым Playwright не снимает все сочетания
// ширин, схем и движения (2 × 2 × 2) или не собирает PNG-лист.
const snapshotArgv = [
  '--yes',
  '-p',
  tarballPath,
  '-p',
  `playwright@${playwrightVersion}`,
  'agentic-report',
  'snapshot',
  journeyPage,
  '--out',
  path.join(skillJourneyRoot, 'snapshots'),
  '--widths',
  '390,1440',
] as const;
const snapshotOutcome = await execFileAsync(npxExecutable, snapshotArgv, {
  cwd: skillJourneyRoot,
  env: skillJourneyEnvironment,
  timeout: 300_000,
  maxBuffer: 16 * 1024 * 1024,
});
const snapshotResult = requireSingleNdjsonRecord(snapshotOutcome, 'snapshot');
const snapshotShots = snapshotResult.shots;
if (!Array.isArray(snapshotShots) || snapshotShots.length !== 8) {
  throw new Error(
    'Snapshot from the installed tarball did not take 2 widths × 2 schemes × 2 motions.',
  );
}
const contactSheet = requireRecord(snapshotResult.contactSheet, 'snapshot contact sheet');
const contactSheetBytes = await readFile(requireString(contactSheet.image, 'contact sheet image'));
if (contactSheetBytes.subarray(1, 4).toString('latin1') !== 'PNG') {
  throw new Error('Snapshot contact sheet is not a PNG image.');
}
await rm(skillJourneyRoot, { recursive: true, force: true });

// Запись о кандидате пишется только после всех проверок: на стабильном пути
// test-results/package/candidate-evidence.json не должен остаться принятым кандидат, проваливший путь скилла.
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
      isolation: {
        runtimeBinDirectory,
        globalPrefixDirectory,
        path: candidateInstallEnvironment.PATH,
        insideConsumerDirectory:
          runtimeBinDirectory.startsWith(consumerDirectory) &&
          globalPrefixDirectory.startsWith(consumerDirectory),
      },
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

/**
 * Ловит запись `npm pack --json`, разошедшуюся с тарболом, который реально лёг на диск: чужое имя или
 * версию, другие суммы и размер, другую опись файлов. Релиз публикует именно эти байты, а суммы из записи
 * попадают в свидетельство кандидата.
 */
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

/**
 * Белый список выпуска. Он выводится из того, что обязано лежать в пакете: исходники `src/` дают
 * `dist/node` с картами и типами, скилл, эталонные расширения и гарнитуры едут целиком, примеры — по
 * своему манифесту. Документы из `docs/` перечислены явно: в пакет идёт только их отобранная часть.
 */
async function expectedTarballFiles(): Promise<string[]> {
  const expected = new Set([
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/THIRD_PARTY_NOTICES.md',
    'package/dist/browser/document.css',
    'package/dist/browser/runtime.js',
    'package/dist/browser/effects.js',
    'package/dist/browser/islands.js',
    ...[
      'AGENT-REFERENCE.md',
      'ARCHITECTURE.md',
      'generated/directives.schema.json',
      'generated/extension-proposal.schema.json',
      'generated/extension-proposal.template.json',
      'generated/manifest.schema.json',
      'generated/source-contract.json',
      'generated/source.schema.json',
      'generated/theme.schema.json',
      'product/code-glossary-extension.json',
      'product/copyable-prose-extension.json',
      'product/diagram-extension.json',
      'product/in-flow-contents-extension.json',
      'product/review-workspace-extension.json',
      'product/response-workspace-extension.json',
      'product/section-prose-extension.json',
      'product/share-safe-build-extension.json',
      'product/time-text-extension.json',
      'product/source-link-extension.json',
      'product/violation-inventory-extension.json',
      'product/source-contract.md',
    ].map((file) => `package/docs/${file}`),
  ]);
  // Скилл едет целиком: SKILL.md, справочники базы знаний и скрипт проверки оформления.
  for (const file of await recursiveRelativeFiles(path.resolve('skills/agentic-report'))) {
    expected.add(`package/skills/agentic-report/${file}`);
  }

  // Эталонные расширения едут целиком: манифесты, исходники, README и примеры страниц.
  for (const file of await recursiveRelativeFiles(path.resolve('extensions'))) {
    expected.add(`package/extensions/${file}`);
  }

  // Встроенные гарнитуры едут в пакет целиком: файлы подмножеств, лицензия OFL и происхождение.
  for (const font of await recursiveRelativeFiles(path.resolve('src/fonts'))) {
    expected.add(`package/dist/browser/fonts/${font}`);
  }

  for (const source of await recursiveRelativeFiles(path.resolve('src'))) {
    if (
      source.startsWith('browser/') ||
      source.startsWith('fonts/') ||
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

  expected.add('package/examples/manifest.json');
  expected.add('package/examples/showcase-contract.json');
  for (const example of sourceExamples) {
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

/**
 * Ловит выпуск, который унёс бы приватное: файлы окружения, ключи, логи и временные каталоги агента по
 * пути, а по содержимому — приватные ключи, распространённые токены и абсолютные домашние пути машины
 * сборки.
 */
function assertPackedPathsArePublishSafe(packedFiles: readonly string[]): void {
  const forbiddenPath =
    /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.gitconfig|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|log|tmp|bak)|moira-ws|agent_temp_files_local|test-results)(?:\/|$)/u;
  const forbiddenPaths = packedFiles.filter((file) => forbiddenPath.test(file));
  if (forbiddenPaths.length > 0) {
    throw new Error(
      `Packed npm tarball contains private or temporary paths:\n${forbiddenPaths.join('\n')}`,
    );
  }
}

function assertPackedContentIsPublishSafe(
  packedEntries: readonly { readonly path: string; readonly text: string }[],
): void {
  const findings = findPackedSensitiveContent(packedEntries);
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

/**
 * Открывает собранные у потребителя страницы в Chromium через `file://` и ловит: ошибки страницы и консоли,
 * пустой заголовок, горизонтальное переполнение, переключатель схемы, который не меняет схему, отсутствие
 * рабочего места ревью или его диалога, элементы `[data-review-target-control]` на блоках, выделение
 * текста без действия и всплывающего окна, сдвиг макета при открытии ревью, потерю встроенных нитей
 * прошлого ревью и модальность диалога не по формату (модальный — только в directory).
 */
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
      const themeToggle = page.locator('[data-scheme-toggle]');
      const themeBefore = await page.locator('html').getAttribute('data-scheme');
      if ((await themeToggle.count()) !== 1) {
        throw new Error(`Installed ${artifact.format} candidate is missing its scheme control.`);
      }
      await themeToggle.click();
      const themeAfter = await page.locator('html').getAttribute('data-scheme');
      const reviewToggle = page.locator('[data-review-toggle]');
      if ((await reviewToggle.count()) !== 1) {
        throw new Error(`Installed ${artifact.format} candidate is missing Review Workspace.`);
      }
      const shellBefore = await page.locator('.report-shell').boundingBox();
      await reviewToggle.click();
      const reviewDialog = page.locator('[data-review-dialog]');
      const reviewOpen = await reviewDialog.getAttribute('open');
      const shellAfter = await page.locator('.report-shell').boundingBox();
      const reviewOwners = await page.locator('[data-review-target]').count();
      const blockControls = await page.locator('[data-review-target-control]').count();
      const reviewThreads = await page
        .locator('[data-review-current-list] [data-review-thread-open]')
        .count();
      const reviewModal = await reviewDialog.evaluate((element) => element.matches(':modal'));
      await page.locator('[data-review-close]').click();
      const selectionAction = await page
        .locator('[data-review-target]')
        .filter({ hasText: /\S/u })
        .first()
        .evaluate((owner) => {
          const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
          for (
            let candidate = walker.nextNode();
            candidate !== null;
            candidate = walker.nextNode()
          ) {
            if (!(candidate instanceof Text) || candidate.data.trim().length === 0) continue;
            const start = candidate.data.search(/\S/u);
            const range = document.createRange();
            range.setStart(candidate, start);
            range.setEnd(candidate, Math.min(start + 4, candidate.data.length));
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
            return true;
          }
          return false;
        });
      if (selectionAction) await page.locator('[data-review-selection-action]').click();
      const popoverOpen = await page.locator('[data-review-popover]').isVisible();
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
        reviewOwners === 0 ||
        blockControls !== 0 ||
        !selectionAction ||
        !popoverOpen ||
        JSON.stringify(shellBefore) !== JSON.stringify(shellAfter) ||
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
        reviewOwners,
        blockControls,
        reviewResponses: reviewThreads,
        reviewModal,
        popoverOpen,
        ...observed,
      });
    }
    return evidence;
  } finally {
    await browser.close();
  }
}

/**
 * Раскладка, которую объявляет frontmatter источника примера, или `undefined`, если он её не объявляет
 * (тогда действует раскладка по умолчанию).
 */
function declaredLayout(source: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source)?.[1];
  if (frontmatter === undefined) return undefined;
  return /^layout:\s*['"]?([a-z-]+)['"]?\s*$/mu.exec(frontmatter)?.[1];
}

/** Состояние исходников для свидетельства: коммит или хэш незакоммиченных изменений поверх него. */
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

/** Ловит команду `--json`, которая печатает больше или меньше одной записи NDJSON. */
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

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
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

/** Путь, каким CLI обязан его напечатать: значение `token=` в имени каталога заменено на `[REDACTED]`. */
function redactCredentialPath(value: string): string {
  return value.replace('token=path-sentinel', 'token=[REDACTED]');
}

/** Ловит лишнее или потерянное поле в записи машинного договора. */
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
