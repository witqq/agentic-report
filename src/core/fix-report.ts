import { readFile, writeFile } from 'node:fs/promises';

import { authoringRegistry } from '../authoring/registry.js';
import type {
  AppliedFix,
  Diagnostic,
  DiagnosticFix,
  FixReportOptions,
  FixReportResult,
} from '../contracts.js';
import {
  AgenticReportError,
  sanitizeTransportPath,
  sanitizeTransportValue,
} from '../diagnostics.js';
import { loadSource } from '../source/load-source.js';
import { validateReport } from './analyze-report.js';

/**
 * The number of validate-and-apply rounds one call may take. Repairing an occurrence can reveal the
 * next one — a later section's first mention only becomes a violation once the earlier one is
 * marked — so one pass is not enough; an unbounded loop, on the other hand, would hide a repair that
 * fails to converge. The bound turns that case into a reported remainder instead of a hang.
 */
const MAX_ROUNDS = 16;

/**
 * Applies every replacement the product computed exactly, and nothing else. This is the only
 * operation in the package that writes to an authored source: `validate`, `inspect`, `build` and
 * `review` never do, and that rule is unchanged.
 */
export async function fixReport(options: FixReportOptions): Promise<FixReportResult> {
  const applied: AppliedFix[] = [];
  let remaining: readonly Diagnostic[] = [];
  let projectPath = '';
  let entryPath = '';

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let violations: readonly Diagnostic[] = [];
    try {
      const result = await validateReport(options);
      projectPath = result.projectPath;
      entryPath = result.entryPath;
      remaining = [];
      break;
    } catch (error) {
      if (!(error instanceof AgenticReportError)) throw error;
      violations = [error.diagnostic, ...(error.diagnostic.related ?? [])];
    }

    const applicable = violations.filter(
      (violation): violation is Diagnostic & { readonly fix: DiagnosticFix } =>
        violation.fix !== undefined,
    );
    remaining = violations.filter((violation) => violation.fix === undefined);
    if (applicable.length === 0) break;

    const written = await applyFixes(applicable);
    if (written.length === 0) break;
    applied.push(...written);
  }

  if (projectPath === '') {
    // Every round refused, so no validation result named the project. The identities still have to be
    // the real ones: `path.resolve` of the input would report a directory where the entry belongs and
    // an unresolved path where a link was followed.
    const source = await loadSource(options.input);
    projectPath = sanitizeTransportPath(source.sourceRoot);
    entryPath = sanitizeTransportPath(source.entryPath);
  }

  return sanitizeTransportValue({
    contractVersion: authoringRegistry.contract.major,
    projectPath,
    entryPath,
    applied,
    remaining,
  });
}

/**
 * Writes the replacements of one round, file by file, latest range first so an earlier replacement
 * never shifts the offsets of one still to be written. Overlapping ranges are left for the next
 * round rather than merged: two replacements over the same bytes cannot both be what the product
 * computed.
 */
async function applyFixes(
  violations: readonly (Diagnostic & { readonly fix: DiagnosticFix })[],
): Promise<readonly AppliedFix[]> {
  const byFile = new Map<string, (Diagnostic & { readonly fix: DiagnosticFix })[]>();
  for (const violation of violations) {
    const file = violation.fix.file;
    const bucket = byFile.get(file);
    if (bucket === undefined) byFile.set(file, [violation]);
    else bucket.push(violation);
  }

  const applied: AppliedFix[] = [];
  for (const [file, fileViolations] of byFile) {
    const original = await readFile(file, 'utf8');
    const ordered = [...fileViolations].sort((left, right) => right.fix.start - left.fix.start);
    let text = original;
    let previousStart = Number.POSITIVE_INFINITY;
    for (const violation of ordered) {
      const { start, end, replacement } = violation.fix;
      if (start < 0 || end > text.length || end < start) continue;
      if (end > previousStart) continue;
      text = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
      previousStart = start;
      applied.push({
        file,
        line: violation.source?.line ?? 0,
        column: violation.source?.column ?? 0,
        code: violation.code,
        replacement,
      });
    }
    if (text !== original) await writeFile(file, text);
  }
  return applied;
}
