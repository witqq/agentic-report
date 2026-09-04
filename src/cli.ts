#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { formatInstalledExamples } from './cli-examples.js';
import {
  OutputFormatSchema,
  type BuildReportResult,
  type Diagnostic,
  type InitProjectResult,
  type FixReportResult,
  type InspectReportResult,
  type InspectReviewResult,
  type OutputFormat,
  type ValidateReportResult,
} from './contracts.js';
import { inspectReport, validateReport } from './core/analyze-report.js';
import { buildReport } from './core/compiler.js';
import { inspectReview } from './core/inspect-review.js';
import { fixReport } from './core/fix-report.js';
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
import { initProject } from './authoring/init-project.js';
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
}

interface InitCommandOptions {
  readonly starter?: string;
  readonly json?: boolean;
}

interface AnalysisCommandOptions {
  readonly format?: OutputFormat;
  readonly json?: boolean;
  readonly review?: string;
}

const program = new Command();
const schemaScopes: readonly SchemaScope[] = ['manifest', 'directives', 'source'];
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
  .command('build')
  .description('Compile a Markdown file or source directory.')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('-o, --output <path>', 'Output HTML file or directory')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--review <path>', 'Confined prior review JSON sidecar')
  .option('--share', 'Neutralize workstation source links for distribution')
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: BuildCommandOptions) => {
    try {
      const result = await buildReport({
        input,
        ...(commandOptions.output === undefined ? {} : { output: commandOptions.output }),
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
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
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await validateReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
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
  .option('--json', 'Accepted; agent NDJSON is the default output')
  .option('--human', 'Emit the indented catalog for a human reader instead of agent NDJSON')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await inspectReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
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
  .description('Print manifest, directive, or complete source schema data.')
  .option('--scope <scope>', 'manifest, directives, or source', parseSchemaScope, 'manifest')
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
  .description('List source examples shipped with the installed package.')
  .option('--json', 'Accepted; compact agent JSON is the default output')
  .option('--human', 'Emit prose for a human reader instead of compact agent JSON')
  .action(() => {
    const examplesRoot = sanitizeTransportPath(
      fileURLToPath(new URL('../../examples/', import.meta.url)),
    );
    process.stdout.write(
      formatInstalledExamples(
        examplesRoot,
        getSourceContract().contractVersion,
        listExamples(),
        outputMode === 'agent',
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
    throw new InvalidArgumentError('Expected manifest, directives, or source.');
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

function writeInspectSuccess(result: InspectReportResult, runId: string, mode: OutputMode): void {
  emitWarnings(result.warnings, runId, mode);
  if (mode === 'agent') {
    emitResultRecord(result, runId);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
