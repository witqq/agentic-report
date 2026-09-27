/**
 * Refuses personal paths and credentials in the tracked files of this public repository.
 *
 * The defect it catches: a maintainer's home directory (`/Users/<name>/…`, `/home/<name>/…`) or a token
 * pasted into a runbook, a test or a generated file and then published. A passing run is evidence only
 * because the same scan fails on the planted counterexamples in `tests/unit/check-history.test.ts`.
 *
 * Fixture home directories that tests use on purpose to prove redaction are allowed by name.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Home-directory names that tests use deliberately to prove that paths are redacted. */
export const FIXTURE_HOMES = ['alice', 'fixture', 'packed-consumer', 'runner'] as const;

export interface HistoryFinding {
  readonly file: string;
  readonly line: number;
  readonly kind: 'personal-path' | 'credential';
  readonly excerpt: string;
}

const PERSONAL_PATH = /(?:^|[^\w.-])\/(?:Users|home)\/([A-Za-z][\w.-]*)\//gu;
const CREDENTIALS: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/u,
  /\bnpm_[A-Za-z0-9]{36}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/u,
];

/** Scans one file's text; returns every personal path and credential it contains. */
export function scanText(file: string, text: string): HistoryFinding[] {
  const findings: HistoryFinding[] = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(PERSONAL_PATH)) {
      const home = match[1] ?? '';
      if ((FIXTURE_HOMES as readonly string[]).includes(home)) continue;
      findings.push({ file, line: index + 1, kind: 'personal-path', excerpt: match[0].trim() });
    }
    for (const pattern of CREDENTIALS) {
      const match = pattern.exec(line);
      if (match !== null)
        findings.push({
          file,
          line: index + 1,
          kind: 'credential',
          excerpt: `${match[0].slice(0, 8)}…`,
        });
    }
  }
  return findings;
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

export function scanTrackedFiles(): HistoryFinding[] {
  const findings: HistoryFinding[] = [];
  for (const file of trackedFiles()) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      continue;
    }
    if (isBinary(bytes)) continue;
    findings.push(...scanText(file, bytes.toString('utf8')));
  }
  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const findings = scanTrackedFiles();
  for (const finding of findings)
    process.stderr.write(`${finding.file}:${finding.line}: ${finding.kind} ${finding.excerpt}\n`);
  if (findings.length > 0) {
    process.stderr.write(
      `${findings.length} personal path or credential finding(s); remove them before publishing.\n`,
    );
    process.exit(1);
  }
  process.stdout.write('No personal paths or credentials in tracked files.\n');
}
