import { z } from 'zod';

import {
  reportManifestInputSchema,
  reportManifestSchema,
  type ReportManifest,
  type ReportManifestInput,
} from './authoring/schemas.js';
import { OUTPUT_FORMATS, type PAGE_CONTRACT } from './authoring/registry.js';
import type { ResolvedReviewResponse } from './review/binding.js';

export const OutputFormatSchema = z.enum(OUTPUT_FORMATS);
export const ReportManifestInputSchema = reportManifestInputSchema;
export const ReportManifestSchema = reportManifestSchema;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type { ReportManifest, ReportManifestInput };

export interface SourceDocument {
  readonly entryPath: string;
  readonly sourceRoot: string;
  readonly sourceFiles: readonly string[];
  readonly markdown: string;
  readonly manifest: ReportManifest;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly sourceDigests: readonly SourceDigest[];
}

export interface SourceDigest {
  readonly file: string;
  readonly sha256: string;
}

export interface SourceLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface SourceMapSegment {
  readonly generatedStart: number;
  readonly generatedEnd: number;
  readonly sourceFile: string;
  readonly sourceStart: number;
  readonly sourceText: string;
}

export interface Diagnostic {
  readonly level: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly source?: SourceLocation;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface BuildReportOptions {
  readonly input: string;
  readonly output?: string;
  readonly format?: OutputFormat;
}

export interface BuildReportResult {
  readonly outputPath: string;
  readonly format: OutputFormat;
  readonly bytes: number;
  readonly embeddedAssets: number;
  readonly externalAssets: number;
  readonly contentHash: string;
  readonly warnings: readonly Diagnostic[];
}

export interface InitProjectOptions {
  readonly destination: string;
  readonly starter?: string;
}

export interface InitProjectResult {
  readonly starterId: string;
  readonly starterTitle: string;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly files: readonly string[];
}

export interface ValidateReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
}

export interface ValidateReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly format: OutputFormat;
  readonly runtimePlacement: 'inline' | 'external';
  readonly warnings: readonly Diagnostic[];
}

export interface InspectReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
}

export interface InspectReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly output: {
    readonly format: OutputFormat;
    readonly runtimePlacement: 'inline' | 'external';
  };
  readonly sourceFiles: readonly string[];
  readonly observed: {
    readonly directives: readonly string[];
    readonly resources: {
      readonly images: number;
      readonly downloads: number;
      readonly fonts: number;
    };
  };
  readonly catalog: {
    readonly commands: Readonly<Record<string, string>>;
    readonly formats: readonly OutputFormat[];
    readonly starters: readonly {
      readonly id: string;
      readonly title: string;
      readonly default: boolean;
      readonly aliases: readonly string[];
    }[];
    readonly capabilities: Readonly<Record<string, string>>;
    readonly page: typeof PAGE_CONTRACT;
  };
  readonly warnings: readonly Diagnostic[];
}

export interface InspectReviewOptions {
  readonly input: string;
  readonly review: string;
}

export interface InspectReviewResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly reportRevision: string;
  readonly reviewedRevision: string;
  readonly reportStatus: 'exact' | 'stale';
  readonly responses: readonly ResolvedReviewResponse[];
}
