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
  type InspectReportResult,
  type InspectReviewResult,
  type OutputFormat,
  type ValidateReportResult,
} from './contracts.js';
import { inspectReport, validateReport } from './core/analyze-report.js';
import { buildReport } from './core/compiler.js';
import { inspectReview } from './core/inspect-review.js';
import {
  exitCodeForDiagnostic,
  sanitizeDiagnostic,
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

interface ReviewCommandOptions {
  readonly json?: boolean;
}

const program = new Command();
const schemaScopes: readonly SchemaScope[] = ['manifest', 'directives', 'source'];
const invocationRunId = randomUUID();
const jsonRequested = process.argv.slice(2).includes('--json');
const packageMetadata = readInstalledPackageMetadata();
program.exitOverride();
program.configureOutput({
  writeErr: (value) => {
    if (!jsonRequested) {
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
  .option('--json', 'Emit NDJSON suitable for agents')
  .action(async (destination: string, commandOptions: InitCommandOptions) => {
    try {
      const result = await initProject({
        destination,
        ...(commandOptions.starter === undefined ? {} : { starter: commandOptions.starter }),
      });
      writeInitSuccess(result, invocationRunId, commandOptions.json === true);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      writeFailure(diagnostic, invocationRunId, commandOptions.json === true);
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
  .option('--json', 'Emit NDJSON suitable for agents')
  .action(async (input: string, commandOptions: BuildCommandOptions) => {
    try {
      const result = await buildReport({
        input,
        ...(commandOptions.output === undefined ? {} : { output: commandOptions.output }),
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
        share: commandOptions.share === true,
      });
      writeSuccess(result, invocationRunId, commandOptions.json === true);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      writeFailure(diagnostic, invocationRunId, commandOptions.json === true);
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
  .option('--json', 'Emit NDJSON suitable for agents')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await validateReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
      });
      writeValidateSuccess(result, invocationRunId, commandOptions.json === true);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      writeFailure(diagnostic, invocationRunId, commandOptions.json === true);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('inspect')
  .description('Inspect source usage and the available authoring catalog without writing output.')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--format <format>', 'single-file or directory', parseFormat)
  .option('--review <path>', 'Confined prior review JSON sidecar')
  .option('--json', 'Emit NDJSON suitable for agents')
  .action(async (input: string, commandOptions: AnalysisCommandOptions) => {
    try {
      const result = await inspectReport({
        input,
        ...(commandOptions.format === undefined ? {} : { format: commandOptions.format }),
        ...(commandOptions.review === undefined ? {} : { review: commandOptions.review }),
      });
      writeInspectSuccess(result, invocationRunId, commandOptions.json === true);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      writeFailure(diagnostic, invocationRunId, commandOptions.json === true);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('review')
  .description('Resolve a versioned review artifact against its current Markdown source.')
  .argument('<review>', 'Confined relative review JSON path')
  .argument('[input]', 'Markdown file or directory containing report.md/index.md', '.')
  .option('--json', 'Emit NDJSON suitable for agents')
  .action(async (review: string, input: string, commandOptions: ReviewCommandOptions) => {
    try {
      const result = await inspectReview({ input, review });
      writeReviewSuccess(result, invocationRunId, commandOptions.json === true);
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      writeFailure(diagnostic, invocationRunId, commandOptions.json === true);
      process.exitCode = exitCodeForDiagnostic(diagnostic);
    }
  });

program
  .command('schema')
  .description('Print manifest, directive, or complete source schema data.')
  .option('--scope <scope>', 'manifest, directives, or source', parseSchemaScope, 'manifest')
  .action((options: { readonly scope: SchemaScope }) => {
    process.stdout.write(`${JSON.stringify(getAuthoringSchema(options.scope), null, 2)}\n`);
  });

program
  .command('describe')
  .alias('discover')
  .description('Describe supported source and output abstractions for agents.')
  .option('--json', 'Emit JSON')
  .action((options: { readonly json?: boolean }) => {
    process.stdout.write(
      options.json === true
        ? `${JSON.stringify(getSourceContract())}\n`
        : `${JSON.stringify(getSourceContract(), null, 2)}\n`,
    );
  });

program
  .command('examples')
  .description('List source examples shipped with the installed package.')
  .option('--json', 'Emit JSON')
  .action((options: { readonly json?: boolean }) => {
    const examplesRoot = sanitizeTransportPath(
      fileURLToPath(new URL('../../examples/', import.meta.url)),
    );
    process.stdout.write(
      formatInstalledExamples(
        examplesRoot,
        getSourceContract().contractVersion,
        listExamples(),
        options.json === true,
      ),
    );
  });

const compatibilityDiagnostic = getNodeCompatibilityDiagnostic(
  process.versions.node,
  packageMetadata.nodeEngine,
);
if (compatibilityDiagnostic !== undefined) {
  writeFailure(compatibilityDiagnostic, invocationRunId, jsonRequested);
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
      writeFailure(diagnostic, invocationRunId, jsonRequested);
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

function writeSuccess(result: BuildReportResult, runId: string, json: boolean): void {
  const sanitized = sanitizeTransportValue(result);
  writeWarnings(sanitized.warnings, runId, json);
  if (json) {
    writeResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    sanitized.share
      ? `Created ${sanitized.outputPath} (${sanitized.bytes} bytes, sha256 ${sanitized.contentHash}); neutralized ${sanitized.neutralizedSourceLinks} source link${sanitized.neutralizedSourceLinks === 1 ? '' : 's'}\n`
      : `Created ${sanitized.outputPath} (${sanitized.bytes} bytes, sha256 ${sanitized.contentHash})\n`,
  );
}

function writeInitSuccess(result: InitProjectResult, runId: string, json: boolean): void {
  const sanitized = sanitizeTransportValue(result);
  if (json) {
    writeResultRecord(sanitized, runId);
    return;
  }
  process.stdout.write(
    `Created ${sanitized.projectPath} from starter ${sanitized.starterId} (${sanitized.files.length} files)\n`,
  );
}

function writeValidateSuccess(result: ValidateReportResult, runId: string, json: boolean): void {
  writeWarnings(result.warnings, runId, json);
  if (json) {
    writeResultRecord(result, runId);
    return;
  }
  process.stdout.write(
    `Validated ${result.entryPath} (${result.format}, ${result.runtimePlacement} runtime)\n`,
  );
}

function writeInspectSuccess(result: InspectReportResult, runId: string, json: boolean): void {
  writeWarnings(result.warnings, runId, json);
  if (json) {
    writeResultRecord(result, runId);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function writeReviewSuccess(result: InspectReviewResult, runId: string, json: boolean): void {
  const sanitized = sanitizeTransportValue(result);
  if (json) {
    writeResultRecord(sanitized, runId);
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

function writeWarnings(warnings: readonly Diagnostic[], runId: string, json: boolean): void {
  for (const warning of warnings) {
    const sanitized = sanitizeDiagnostic(warning);
    if (json) {
      process.stdout.write(`${JSON.stringify({ type: 'diagnostic', runId, ...sanitized })}\n`);
    } else {
      process.stderr.write(`warning ${sanitized.code}: ${sanitized.message}\n`);
    }
  }
}

function writeResultRecord(result: object, runId: string): void {
  process.stdout.write(
    `${JSON.stringify({ type: 'result', runId, ...sanitizeTransportValue(result) })}\n`,
  );
}

function writeFailure(diagnostic: Diagnostic, runId: string, json: boolean): void {
  const sanitized = sanitizeDiagnostic(diagnostic);
  if (json) {
    process.stdout.write(`${JSON.stringify({ type: 'diagnostic', runId, ...sanitized })}\n`);
    return;
  }
  process.stderr.write(`${sanitized.code}: ${sanitized.message}\n${sanitized.remediation}\n`);
}
