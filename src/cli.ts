#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { formatInstalledExamples } from './cli-examples.js';
import {
  OutputFormatSchema,
  type BuildReportResult,
  type CreateBrandThemeResult,
  type Diagnostic,
  type InitProjectResult,
  type FixReportResult,
  type GenerateSitemapResult,
  type InspectReportResult,
  type InspectReviewResult,
  type MeasureReportResult,
  type OutputFormat,
  type SnapshotMotion,
  type SnapshotReportResult,
  type SnapshotScheme,
  type ValidateReportResult,
} from './contracts.js';
import { inspectReport, validateReport } from './core/analyze-report.js';
import { buildReport } from './core/compiler.js';
import { inspectReview } from './core/inspect-review.js';
import { fixReport } from './core/fix-report.js';
import { generateSitemap } from './core/site-index.js';
import {
  measureReport,
  SNAPSHOT_MOTIONS,
  SNAPSHOT_SCHEMES,
  snapshotReport,
} from './core/snapshot.js';
import { effectCheck, type EffectCheckResult } from './core/effect-check.js';
import {
  emitDiagnostic,
  emitResultRecord,
  emitWarnings,
  resolveOutputMode,
  type OutputMode,
} from './cli-output.js';
import {
  exitCodeForDiagnostic,
  sanitizeTransportPath,
  sanitizeTransportValue,
  toDiagnostic,
} from './diagnostics.js';
import { createBrandTheme } from './authoring/brand-theme.js';
import { initProject } from './authoring/init-project.js';
import { listReferenceExtensions } from './authoring/reference-extensions.js';
import {
  getAuthoringSchema,
  getSourceContract,
  listExamples,
  type SchemaScope,
} from './discovery.js';
import { getNodeCompatibilityDiagnostic } from './node-compatibility.js';
import { readInstalledPackageMetadata } from './package-metadata.js';

interface BuildCommandOptions {
  readonly output?: string;
  readonly format?: OutputFormat;
  readonly json?: boolean;
  readonly review?: string;
  readonly share?: boolean;
  readonly url?: string;
}

interface InitCommandOptions {
  readonly starter?: string;
  readonly json?: boolean;
}

interface ThemeCommandOptions {
  readonly colors: string;
  readonly extends?: string;
  readonly output?: string;
}

interface SnapshotCommandOptions {
  readonly out: string;
  readonly widths?: readonly number[];
  readonly schemes?: readonly SnapshotScheme[];
  readonly motion?: readonly SnapshotMotion[];
  readonly measure?: boolean;
}

interface AnalysisCommandOptions {
  readonly format?: OutputFormat;
  readonly json?: boolean;
  readonly review?: string;
  readonly url?: string;
}

const program = new Command();
const schemaScopes: readonly SchemaScope[] = ['manifest', 'directives', 'source', 'theme'];
const invocationRunId = randomUUID();
const outputMode: OutputMode = resolveOutputMode(process.argv.slice(2));
const packageMetadata = readInstalledPackageMetadata();
program.exitOverride();
program.configureOutput({
  writeErr: (value) => {
    if (outputMode === 'human') {
      process.stderr.write(value);
    }
  },
});
program
  .name('agentic-report')
  .description('Compile agent-friendly content sources into portable static HTML artifacts.')
  .version(packageMetadata.version);

program
  .command('init')
  .description('Initialize a packaged declarative starter.')
  .argument('<destination>', 'Absent destination directory to create')
  .option('--starter <id>', 'Packaged starter ID')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (destination: string, commandOptions: InitCommandOptions) => {
    try {
      const result = await initProject({
        destination,
        ...(commandOptions.starter === undefined ? {} : { starter: commandOptions.starter }),
      });
      writeInitSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('theme')
  .description(
    'Write a theme file from brand colours, their lightness shifted until every contrast pair passes. A logo cannot be read: the package carries no image decoder, so pass its colours.',
  )
  .requiredOption(
    '--colors <list>',
    'One or two brand colours, #rgb or #rrggbb, comma-separated: the accent, then the eyebrow accent',
  )
  .option('--extends <theme>', 'Built-in theme the new theme extends; the default theme if absent')
  .option('-o, --output <path>', 'Absent .yaml, .yml or .json file to write', 'brand-theme.yaml')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (commandOptions: ThemeCommandOptions) => {
    try {
      const result = await createBrandTheme({
        colors: commandOptions.colors,
        ...(commandOptions.extends === undefined ? {} : { extends: commandOptions.extends }),
        ...(commandOptions.output === undefined ? {} : { output: commandOptions.output }),
      });
      writeThemeSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('build')
  .description('Compile a Markdown file or source directory.')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('-o, --output <path>', 'Output HTML file or directory')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--review <path>', 'Confined prior review JSON sidecar')
  .option('--share', 'Neutralize workstation source links for distribution')
  .option('--url <url>', 'Absolute public URL of the page; overrides the manifest url')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: BuildCommandOptions) => {
    try {
      const result = await buildReport({
        input,
        ...(commandOptions.output === undefined ? {} : { output: commandOptions.output }),
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
        ...(commandOptions.url === undefined ? {} : { url: commandOptions.url }),
        share: commandOptions.share === true,
      });
      writeSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('validate')
  .description(
    'Validate a source through the production preparation pipeline without writing output.',
  )
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--review <path>', 'Confined prior review JSON sidecar')
  .option('--url <url>', 'Absolute public URL of the page; overrides the manifest url')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await validateReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
        ...(commandOptions.url === undefined ? {} : { url: commandOptions.url }),
      });
      writeValidateSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('inspect')
  .description('Inspect source usage and the available authoring catalog without writing output.')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--review <path>', 'Confined prior review JSON sidecar')
  .option('--url <url>', 'Absolute public URL of the page; overrides the manifest url')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit the indented catalog for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await inspectReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
        ...(commandOptions.url === undefined ? {} : { url: commandOptions.url }),
      });
      writeInspectSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('fix')
  .description('Apply the replacements the product computed exactly, and nothing else.')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await fixReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
      });
      writeFixSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('sitemap')
  .description('Write sitemap.xml and robots.txt for a published tree of public pages.')
  .argument('<directory>', 'Root directory of the published static tree')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (directory: string) => {
    try {
      const result = await generateSitemap({ directory });
      writeSitemapSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('snapshot')
  .description(
    'Build a page and photograph it at several widths, in both schemes, with and without motion.',
  )
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .requiredOption('--out <directory>', 'Absent or empty directory for the page and its snapshots')
  .option('--widths <list>', 'Comma-separated viewport widths in pixels', parseWidths)
  .option('--schemes <list>', 'Comma-separated colour schemes: light, dark', (value: string) =>
    parseChoices(value, SNAPSHOT_SCHEMES, '--schemes'),
  )
  .option('--motion <list>', 'Comma-separated motion settings: normal, reduce', (value: string) =>
    parseChoices(value, SNAPSHOT_MOTIONS, '--motion'),
  )
  .option(
    '--measure',
    'Measure instead of photographing: sideways overflow, small text, contrast, covered text, empty bands, clipped headings, first screen and stops, one record per width, scheme and motion',
  )
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: SnapshotCommandOptions) => {
    try {
      const options = {
        input,
        output: commandOptions.out,
        ...(commandOptions.widths === undefined ? {} : { widths: commandOptions.widths }),
        ...(commandOptions.schemes === undefined ? {} : { schemes: commandOptions.schemes }),
        ...(commandOptions.motion === undefined ? {} : { motions: commandOptions.motion }),
      };
      if (commandOptions.measure === true) {
        writeMeasureSuccess(await measureReport(options), invocationRunId, outputMode);
        return;
      }
      const result = await snapshotReport(options);
      writeSnapshotSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('effect-check')
  .description(
    'Build the examples of an effect extension and run the eleven effect checks in Chromium; prints N of M checks passed.',
  )
  .argument('<manifest>', 'Extension manifest with kind: effect')
  .requiredOption(
    '--out <directory>',
    'Absent or empty directory for the built examples and frames',
  )
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (manifest: string, commandOptions: { readonly out: string }) => {
    try {
      const result = await effectCheck({ manifest, output: commandOptions.out });
      writeEffectCheckSuccess(result, invocationRunId, outputMode);
      if (result.passed < result.total) process.exitCode = 1;
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('review')
  .description('Resolve a versioned review artifact against its current Markdown source.')
  .argument('<review>', 'Confined relative review JSON path')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (review: string, input: string) => {
    try {
      const result = await inspectReview({ input, review });
      writeReviewSuccess(result, invocationRunId, outputMode);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('schema')
  .description('Print manifest, directive, complete source, or theme schema data.')
  .option('--scope <scope>', 'manifest, directives, source, or theme', parseSchemaScope, 'manifest')
  .option('--json', 'Accepted; compact agent JSON is the default output')
  .option('--human', 'Emit indented JSON for a human reader instead of compact agent JSON')
  .action((options: { readonly scope: SchemaScope }) => {
    const schema = getAuthoringSchema(options.scope);
    process.stdout.write(
      outputMode === 'agent'
        ? `${JSON.stringify(schema)}\n`
        : `${JSON.stringify(schema, null, 2)}\n`,
    );
  });

program
  .command('describe')
  .alias('discover')
  .description('Describe supported source and output abstractions for agents.')
  .option('--json', 'Accepted; compact agent JSON is the default output')
  .option('--human', 'Emit indented JSON for a human reader instead of compact agent JSON')
  .action(() => {
    process.stdout.write(
      outputMode === 'agent'
        ? `${JSON.stringify(getSourceContract())}\n`
        : `${JSON.stringify(getSourceContract(), null, 2)}\n`,
    );
  });

program
  .command('examples')
  .description('List source examples and reference extensions shipped with the installed package.')
  .option('--json', 'Accepted; compact agent JSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of compact agent JSON')
  .action(async () => {
    const examplesRoot = sanitizeTransportPath(
      fileURLToPath(new URL('../../examples/', import.meta.url)),
    );
    const extensions = (
      await listReferenceExtensions(fileURLToPath(new URL('../../extensions/', import.meta.url)))
    ).map((extension) => ({
      ...extension,
      manifest: sanitizeTransportPath(extension.manifest),
      readme: sanitizeTransportPath(extension.readme),
      examples: extension.examples.map(sanitizeTransportPath),
    }));
    process.stdout.write(
      formatInstalledExamples(
        examplesRoot,
        getSourceContract().contractVersion,
        listExamples(),
        outputMode === 'agent',
        extensions,
      ),
    );
  });

const compatibilityDiagnostic = getNodeCompatibilityDiagnostic(
  process.versions.node,
  packageMetadata.nodeEngine,
);
if (compatibilityDiagnostic !== undefined) {
  emitDiagnostic(compatibilityDiagnostic, invocationRunId, outputMode);
  process.exitCode = exitCodeForDiagnostic(compatibilityDiagnostic);
} else {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (!(error instanceof CommanderError && error.exitCode === 0)) {
      const diagnostic: Diagnostic =
        error instanceof CommanderError
          ? {
              level: 'error',
              code: 'CLI_ARGUMENT_INVALID',
              message: error.message,
              remediation: 'Run `agentic-report --help` and correct the command or option value.',
            }
          : toDiagnostic(error);
      emitDiagnostic(diagnostic, invocationRunId, outputMode);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  }
}

function parseFormat(value: string): OutputFormat {
  const result = OutputFormatSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidArgumentError('Expected single-file or directory.');
  }
  return result.data;
}

function parseSchemaScope(value: string): SchemaScope {
  if (!schemaScopes.includes(value as SchemaScope)) {
    throw new InvalidArgumentError('Expected manifest, directives, source, or theme.');
  }
  return value as SchemaScope;
}

function writeSuccess(result: BuildReportResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  emitWarnings(sanitized.warnings, runId, mode);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    sanitized.share
      ? `Created ${sanitized.outputPath} (${sanitized.bytes} bytes, sha256 ${sanitized.contentHash}); neutralized ${sanitized.neutralizedSourceLinks} source link${sanitized.neutralizedSourceLinks === 1 ? '' : 's'}\n`
      : `Created ${sanitized.outputPath} (${sanitized.bytes} bytes, sha256 ${sanitized.contentHash})\n`,
  );
}

function writeInitSuccess(result: InitProjectResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    `Created ${sanitized.projectPath} from starter ${sanitized.starterId} (${sanitized.files.length} files)\n`,
  );
}

function writeThemeSuccess(result: CreateBrandThemeResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  const lines = sanitized.roles.map(
    (role) =>
      `  ${role.scheme} ${role.role} ${role.value} from ${role.from} (lightness ${role.lightnessShift > 0 ? '+' : ''}${role.lightnessShift}, hue ${role.hueShift}°)\n`,
  );
  process.stdout.write(
    `Created ${sanitized.themePath} (theme ${sanitized.name}, extends ${sanitized.extends})\n${lines.join('')}`,
  );
}

function writeValidateSuccess(result: ValidateReportResult, runId: string, mode: OutputMode): void {
  emitWarnings(result.warnings, runId, mode);
  if (mode === 'agent') {
    emitResultRecord(result, runId);
    return;
  }
  process.stdout.write(
    `Validated ${result.entryPath} (${result.format}, ${result.runtimePlacement} runtime)\n`,
  );
}

function writeFixSuccess(result: FixReportResult, runId: string, mode: OutputMode): void {
  if (mode === 'agent') {
    emitResultRecord(result, runId);
    return;
  }
  if (result.applied.length === 0) {
    process.stdout.write(`No applicable repair in ${result.entryPath}\n`);
  }
  for (const fix of result.applied) {
    process.stdout.write(
      `${fix.file}:${fix.line}:${fix.column}  ${fix.code} → ${fix.replacement}\n`,
    );
  }
  if (result.remaining.length > 0) {
    process.stdout.write(`${result.remaining.length} violations need an author decision\n`);
  }
}

function writeSitemapSuccess(result: GenerateSitemapResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    `Indexed ${sanitized.urls.length} page${sanitized.urls.length === 1 ? '' : 's'} in ${sanitized.sitemap} and wrote ${sanitized.robots}${sanitized.skipped.length === 0 ? '' : `; skipped ${sanitized.skipped.length} HTML file${sanitized.skipped.length === 1 ? '' : 's'} not built by agentic-report`}\n`,
  );
}

function writeInspectSuccess(result: InspectReportResult, runId: string, mode: OutputMode): void {
  emitWarnings(result.warnings, runId, mode);
  if (mode === 'agent') {
    emitResultRecord(result, runId);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function writeSnapshotSuccess(result: SnapshotReportResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  emitWarnings(sanitized.warnings, runId, mode);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    `Took ${sanitized.shots.length} snapshot${sanitized.shots.length === 1 ? '' : 's'} of ${sanitized.page}; contact sheet ${sanitized.contactSheet.image}\n`,
  );
}

/** Агенту — запись `measure` на каждое сочетание и итоговая; человеку — таблица, строка на сочетание. */
function writeMeasureSuccess(result: MeasureReportResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  emitWarnings(sanitized.warnings, runId, mode);
  if (mode === 'agent') {
    for (const measurement of sanitized.measurements)
      process.stdout.write(`${JSON.stringify({ type: 'measure', runId, ...measurement })}\n`);
    emitResultRecord(sanitized, runId);
    return;
  }
  const header = [
    'width',
    'scheme',
    'motion',
    'sideways',
    'small',
    'contrast',
    'covered',
    'bands',
    'clipped',
    'title',
    'action',
    'scene',
    'cut',
    'errors',
    'defects',
  ];
  const rows = sanitized.measurements.map((measurement) => [
    String(measurement.width),
    measurement.scheme,
    measurement.motion,
    `${measurement.horizontalOverflow}px`,
    String(measurement.smallText.count),
    String(measurement.lowContrast.count),
    String(measurement.coveredText.count),
    String(measurement.emptyBands.length),
    String(measurement.clippedHeadings.count),
    measurement.firstScreen.heading ? 'yes' : 'no',
    measurement.firstScreen.action ? 'yes' : 'no',
    `${Math.round(measurement.firstScreen.mainSceneShare * 100)}%`,
    String(measurement.stops.filter((stop) => !stop.fits).length),
    String(measurement.pageErrors.length + measurement.failedFonts.length),
    String(measurement.defects),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    `${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ')}\n`;
  process.stdout.write(`Measured ${sanitized.page}\n${line(header)}${rows.map(line).join('')}`);
}

/** Агенту — одна запись на проверку и итоговая; человеку — строка на проверку и «N of M». */
function writeEffectCheckSuccess(result: EffectCheckResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  emitWarnings(sanitized.warnings, runId, mode);
  if (mode === 'agent') {
    for (const check of sanitized.checks)
      process.stdout.write(
        `${JSON.stringify({ type: 'check', runId, effect: sanitized.effect, ...check })}\n`,
      );
    emitResultRecord(sanitized, runId);
    return;
  }
  const lines = sanitized.checks.map(
    (check) =>
      `${check.passed ? '  ok    ' : '  FAILED'}  ${check.title}${check.details.length === 0 ? '' : `\n            ${check.details.join('\n            ')}`}\n`,
  );
  process.stdout.write(
    `Effect ${sanitized.effect}\n${lines.join('')}\n${sanitized.summary}; frames in ${sanitized.outputDirectory}\n`,
  );
}

function parseWidths(value: string): readonly number[] {
  const widths = value.split(',').map((item) => Number(item.trim()));
  if (
    widths.length === 0 ||
    widths.some((width) => !Number.isInteger(width) || width < 240 || width > 3840)
  ) {
    throw new InvalidArgumentError(
      'Widths are whole pixel values from 240 to 3840, separated by commas.',
    );
  }
  return [...new Set(widths)];
}

function parseChoices<const Choice extends string>(
  value: string,
  choices: readonly Choice[],
  option: string,
): readonly Choice[] {
  const items = value.split(',').map((item) => item.trim());
  const accepted = items.filter((item): item is Choice =>
    (choices as readonly string[]).includes(item),
  );
  if (accepted.length === 0 || accepted.length !== items.length) {
    throw new InvalidArgumentError(`${option} accepts ${choices.join(', ')}, separated by commas.`);
  }
  return [...new Set(accepted)];
}

function writeReviewSuccess(result: InspectReviewResult, runId: string, mode: OutputMode): void {
  const sanitized = sanitizeTransportValue(result);
  if (mode === 'agent') {
    emitResultRecord(sanitized, runId);
    return;
  }
  const counts = Object.fromEntries(
    ['exact', 'changed', 'missing', 'ambiguous'].map((binding) => [
      binding,
      sanitized.threads.filter((thread) => thread.binding === binding).length,
    ]),
  );
  process.stdout.write(
    `Review ${sanitized.reportStatus}: ${counts.exact} exact, ${counts.changed} changed, ${counts.missing} missing, ${counts.ambiguous} ambiguous\n`,
  );
}
