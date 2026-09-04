import { z } from 'zod';

import {
  reportManifestInputSchema,
  reportManifestSchema,
  type ReportManifest,
  type ReportManifestInput,
} from './authoring/schemas.js';
import { OUTPUT_FORMATS, type PAGE_CONTRACT } from './authoring/registry.js';
import type { ResolvedReviewThread } from './review/binding.js';

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

/**
 * A replacement the product computed exactly, addressed in the authored text so a consumer can apply
 * it without parsing prose. Present only where applying it preserves every authored construction the
 * range spans; a diagnostic whose repair would need a judgement carries none.
 */
export interface DiagnosticFix {
  readonly file: string;
  /**
   * Offset of the first replaced character, counted in UTF-16 code units of the file decoded as
   * UTF-8 — the unit a JavaScript string index uses. It is not a byte offset: a source with
   * non-ASCII text ahead of the range has more bytes than code units, and slicing the file buffer by
   * these numbers would cut mid-character.
   */
  readonly start: number;
  /** Offset just past the last replaced character, in the same units as `start`. */
  readonly end: number;
  readonly replacement: string;
}

export interface Diagnostic {
  readonly level: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly source?: SourceLocation;
  /**
   * The computed replacement for this violation, when one exists. Transport sanitization applies to
   * it like every other field; a replacement that sanitization would alter carries a credential in
   * authored bytes and is withheld rather than shipped redacted, because applying a redacted
   * replacement would destroy what it redacted.
   */
  readonly fix?: DiagnosticFix;
  readonly details?: Readonly<Record<string, unknown>>;
  /**
   * Further independent violations found in the same run, ordered by position in the source. Absent
   * when the run found exactly one.
   */
  readonly related?: readonly Diagnostic[];
}

export interface BuildReportOptions {
  readonly input: string;
  readonly output?: string;
  readonly format?: OutputFormat;
  readonly review?: string;
  readonly share?: boolean;
}

export interface BuildReportResult {
  readonly outputPath: string;
  readonly format: OutputFormat;
  readonly bytes: number;
  readonly embeddedAssets: number;
  readonly externalAssets: number;
  readonly contentHash: string;
  readonly share: boolean;
  readonly neutralizedSourceLinks: number;
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
  readonly review?: string;
}

export interface ValidateReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly format: OutputFormat;
  readonly runtimePlacement: 'inline' | 'external';
  readonly warnings: readonly Diagnostic[];
}

export interface FixReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
}

/** One replacement the run wrote, reported so the author can see what changed without a diff. */
export interface AppliedFix {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly replacement: string;
}

export interface FixReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  /** Empty when the source needed no applicable repair; the command is then a no-op by design. */
  readonly applied: readonly AppliedFix[];
  /**
   * Violations that remain after every applicable replacement was written. A repair the product
   * cannot derive from authored bytes stays here rather than being guessed.
   */
  readonly remaining: readonly Diagnostic[];
}

export interface InspectReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
  readonly review?: string;
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
  readonly threads: readonly ResolvedReviewThread[];
}
