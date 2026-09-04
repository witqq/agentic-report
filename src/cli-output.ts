import type { Diagnostic } from './contracts.js';
import { sanitizeDiagnostic, sanitizeTransportValue } from './diagnostics.js';

/**
 * How one diagnostic model is presented. The mode selects a projection; it never selects which
 * facts the projection may drop.
 */
export type OutputMode = 'agent' | 'human';

/** Streams the projections write to, injectable so tests can observe rendering without a process. */
export interface OutputStreams {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

const processStreams: OutputStreams = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

/**
 * Agent output is the default because the package is consumed by agents; `--human` opts into prose.
 * `--json` stays accepted and names what already happens.
 */
export function resolveOutputMode(argv: readonly string[]): OutputMode {
  return argv.includes('--human') ? 'human' : 'agent';
}

/** Renders one violation and every independent violation it carries, in source order. */
export function formatDiagnosticText(diagnostic: Diagnostic): string {
  const entries = [diagnostic, ...(diagnostic.related ?? [])];
  const rendered = entries.map((entry) => formatDiagnosticEntry(entry)).join('\n');
  return entries.length === 1 ? `${rendered}\n` : `${rendered}\n\n${entries.length} violations\n`;
}

/** Renders one warning; warnings carry no inventory of their own. */
export function formatWarningText(warning: Diagnostic): string {
  return `${formatDiagnosticEntry(warning, 'warning ')}\n`;
}

/**
 * The single point that decides what a diagnostic becomes for the consumer. Both projections are
 * built from the same sanitized record, so neither can show a fact the other hides.
 */
export function emitDiagnostic(
  diagnostic: Diagnostic,
  runId: string,
  mode: OutputMode,
  streams: OutputStreams = processStreams,
): void {
  const sanitized = sanitizeDiagnostic(diagnostic);
  if (mode === 'agent') {
    streams.stdout(`${JSON.stringify({ type: 'diagnostic', runId, ...sanitized })}\n`);
    return;
  }
  streams.stderr(formatDiagnosticText(sanitized));
}

/** Emits every warning of a run; the count a consumer sees does not depend on the mode. */
export function emitWarnings(
  warnings: readonly Diagnostic[],
  runId: string,
  mode: OutputMode,
  streams: OutputStreams = processStreams,
): void {
  for (const warning of warnings) {
    const sanitized = sanitizeDiagnostic(warning);
    if (mode === 'agent') {
      streams.stdout(`${JSON.stringify({ type: 'diagnostic', runId, ...sanitized })}\n`);
      continue;
    }
    streams.stderr(formatWarningText(sanitized));
  }
}

/** Emits the machine result record; prose summaries are the caller's own human projection. */
export function emitResultRecord(
  result: object,
  runId: string,
  streams: OutputStreams = processStreams,
): void {
  streams.stdout(
    `${JSON.stringify({ type: 'result', runId, ...sanitizeTransportValue(result) })}\n`,
  );
}

function formatDiagnosticEntry(entry: Diagnostic, prefix = ''): string {
  const location = formatLocation(entry);
  const head =
    location === undefined ? `${prefix}${entry.code}` : `${location}  ${prefix}${entry.code}`;
  return `${head}\n  ${entry.message}\n  → ${entry.remediation}`;
}

/**
 * `file:line:column` is the form editors and terminals turn into a jump target, so a reader can
 * open the place instead of searching for it.
 */
function formatLocation(entry: Diagnostic): string | undefined {
  if (entry.source === undefined) return undefined;
  return `${entry.source.file}:${entry.source.line}:${entry.source.column}`;
}
