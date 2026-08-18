import path from 'node:path';

import { authoringRegistry, OUTPUT_FORMATS } from '../authoring/registry.js';
import type {
  InspectReportOptions,
  InspectReportResult,
  OutputFormat,
  ValidateReportOptions,
  ValidateReportResult,
} from '../contracts.js';
import { AgenticReportError, sanitizeDiagnostic, sanitizeTransportValue } from '../diagnostics.js';
import { prepareReport, validateRequestedFormat, type PreparedReport } from './prepare-report.js';

export async function validateReport(
  options: ValidateReportOptions,
): Promise<ValidateReportResult> {
  const prepared = await prepareAnalysis(options);
  return sanitizeTransportValue({
    contractVersion: authoringRegistry.contract.major,
    projectPath: prepared.source.sourceRoot,
    entryPath: prepared.source.entryPath,
    format: prepared.format,
    runtimePlacement: prepared.runtimePlacement,
    warnings: prepared.warnings.map(sanitizeDiagnostic),
  });
}

export async function inspectReport(options: InspectReportOptions): Promise<InspectReportResult> {
  const prepared = await prepareAnalysis(options);
  return sanitizeTransportValue({
    contractVersion: authoringRegistry.contract.major,
    projectPath: prepared.source.sourceRoot,
    entryPath: prepared.source.entryPath,
    output: {
      format: prepared.format,
      runtimePlacement: prepared.runtimePlacement,
    },
    sourceFiles: sourceInventory(prepared),
    observed: {
      directives: [...prepared.observedDirectives],
      resources: { ...prepared.observedResources },
    },
    catalog: {
      commands: Object.fromEntries(
        authoringRegistry.commands.map((command) => [command.id, command.description]),
      ),
      formats: [...authoringRegistry.output.formats],
      starters: authoringRegistry.examples
        .filter((example) => 'starter' in example)
        .map((example) => ({
          id: example.id,
          title: example.title,
          default: 'starter' in example && example.starter.default === true,
          aliases: 'starter' in example ? [...(example.starter.aliases ?? [])] : [],
        })),
      capabilities: Object.fromEntries(
        authoringRegistry.capabilities.map((capability) => [capability.id, capability.description]),
      ),
      page: structuredClone(authoringRegistry.page),
    },
    warnings: prepared.warnings.map(sanitizeDiagnostic),
  });
}

async function prepareAnalysis(options: ValidateReportOptions | InspectReportOptions) {
  const parsed = validateAnalysisOptions(options);
  return await prepareReport(parsed);
}

function validateAnalysisOptions(options: ValidateReportOptions | InspectReportOptions): {
  readonly input: string;
  readonly format?: OutputFormat;
} {
  const value: unknown = options;
  if (!isRecord(value)) throw analysisOptionsError();
  try {
    const keys = Reflect.ownKeys(value);
    if (!Object.hasOwn(value, 'input') || keys.some((key) => key !== 'input' && key !== 'format')) {
      throw analysisOptionsError();
    }
    const inputDescriptor = Object.getOwnPropertyDescriptor(value, 'input');
    const formatDescriptor = Object.getOwnPropertyDescriptor(value, 'format');
    if (
      inputDescriptor === undefined ||
      !('value' in inputDescriptor) ||
      (formatDescriptor !== undefined && !('value' in formatDescriptor))
    ) {
      throw analysisOptionsError();
    }
    const input: unknown = inputDescriptor.value;
    if (typeof input !== 'string' || input.trim().length === 0 || input.includes('\0')) {
      throw analysisOptionsError();
    }
    const format = validateRequestedFormat(formatDescriptor?.value);
    return format === undefined ? { input } : { input, format };
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw analysisOptionsError();
  }
}

function analysisOptionsError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'ANALYSIS_OPTIONS_INVALID',
    message: 'Analysis options must contain an input and an optional supported format.',
    remediation: 'Pass { input: string, format?: "single-file" | "directory" }.',
    details: { supportedFormats: OUTPUT_FORMATS },
  });
}

function sourceInventory(prepared: PreparedReport): string[] {
  return [
    ...new Set(
      [...prepared.source.sourceFiles, ...prepared.resourceSourceFiles].map((file) =>
        path.relative(prepared.source.sourceRoot, file).split(path.sep).join('/'),
      ),
    ),
  ].sort(compareNames);
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
