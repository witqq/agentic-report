import path from 'node:path';

import { authoringRegistry, OUTPUT_FORMATS } from '../authoring/registry.js';
import type {
  InspectedExtension,
  InspectReportOptions,
  InspectReportResult,
  OutputFormat,
  ValidateReportOptions,
  ValidateReportResult,
} from '../contracts.js';
import { AgenticReportError, sanitizeDiagnostic, sanitizeTransportValue } from '../diagnostics.js';
import {
  prepareReport,
  validateRequestedFormat,
  validateRequestedUrl,
  type PreparedReport,
} from './prepare-report.js';
import { DEFAULT_MOTION_LEVEL } from '../page-motion.js';

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
    structure: {
      layout: prepared.source.manifest.layout,
      motion: prepared.source.manifest.motion ?? DEFAULT_MOTION_LEVEL,
      ...prepared.variants[0].markdown.structure,
    },
    observed: {
      directives: [...prepared.observedDirectives],
      resources: { ...prepared.observedResources },
    },
    ...(prepared.source.extensions === undefined
      ? {}
      : { extensions: inspectedExtensions(prepared) }),
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
  readonly review?: string;
  readonly url?: string;
} {
  const value: unknown = options;
  if (!isRecord(value)) throw analysisOptionsError();
  try {
    const keys = Reflect.ownKeys(value);
    if (
      !Object.hasOwn(value, 'input') ||
      keys.some((key) => !['input', 'format', 'review', 'url'].includes(String(key)))
    ) {
      throw analysisOptionsError();
    }
    const inputDescriptor = Object.getOwnPropertyDescriptor(value, 'input');
    const formatDescriptor = Object.getOwnPropertyDescriptor(value, 'format');
    const reviewDescriptor = Object.getOwnPropertyDescriptor(value, 'review');
    const urlDescriptor = Object.getOwnPropertyDescriptor(value, 'url');
    if (
      inputDescriptor === undefined ||
      !('value' in inputDescriptor) ||
      (formatDescriptor !== undefined && !('value' in formatDescriptor)) ||
      (reviewDescriptor !== undefined && !('value' in reviewDescriptor)) ||
      (urlDescriptor !== undefined && !('value' in urlDescriptor))
    ) {
      throw analysisOptionsError();
    }
    const input: unknown = inputDescriptor.value;
    const review: unknown = reviewDescriptor?.value;
    if (typeof input !== 'string' || input.trim().length === 0 || input.includes('\0')) {
      throw analysisOptionsError();
    }
    const format = validateRequestedFormat(formatDescriptor?.value);
    const url = validateRequestedUrl(urlDescriptor?.value);
    if (review !== undefined && (typeof review !== 'string' || review.length === 0))
      throw analysisOptionsError();
    return {
      input,
      ...(format === undefined ? {} : { format }),
      ...(review === undefined ? {} : { review }),
      ...(url === undefined ? {} : { url }),
    };
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw analysisOptionsError();
  }
}

function analysisOptionsError(): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'ANALYSIS_OPTIONS_INVALID',
    message: 'Analysis options must contain an input and optional format, review and url values.',
    remediation:
      'Pass { input: string, format?: "single-file" | "directory", review?: string, url?: string }.',
    details: { supportedFormats: OUTPUT_FORMATS },
  });
}

/** Расширения страницы глазами автора: что объявлено, где лежит, что принимает и сколько раз стоит. */
function inspectedExtensions(prepared: PreparedReport): InspectedExtension[] {
  const uses = new Map((prepared.extensions ?? []).map((entry) => [entry.name, entry.uses]));
  return (prepared.source.extensions?.extensions ?? []).map((extension) => ({
    name: extension.name,
    kind: extension.kind,
    manifest: path
      .relative(prepared.source.sourceRoot, extension.manifestPath)
      .split(path.sep)
      .join('/'),
    description: extension.description,
    uses: uses.get(extension.name) ?? 0,
    ...(extension.kind === 'block' || extension.kind === 'provider'
      ? { attributes: Object.keys(extension.attributes) }
      : {}),
    ...(extension.kind === 'effect'
      ? {
          targets: extension.targets.map(
            (target) => `${target.directive}.${target.attribute}=${target.values.join('|')}`,
          ),
        }
      : {}),
  }));
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
