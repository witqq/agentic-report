import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface ExecutableSearchCheck {
  readonly path: string;
  readonly exists: boolean;
}

export async function inspectExecutableSearch(
  directories: readonly string[],
  executableNames: readonly string[],
): Promise<{
  readonly checks: readonly ExecutableSearchCheck[];
  readonly allAbsent: boolean;
}> {
  const checks = await Promise.all(
    directories.flatMap((directory) =>
      executableNames.map(async (name) => {
        const candidate = path.join(directory, name);
        return { path: candidate, exists: await pathExists(candidate) };
      }),
    ),
  );
  return { checks, allAbsent: checks.every(({ exists }) => !exists) };
}

/** Read an allowed tar member only when extraction produced that exact regular file. */
export async function readPackedRegularFile(
  extractedRoot: string,
  member: string,
): Promise<Buffer> {
  const segments = member.split('/');
  if (
    segments[0] !== 'package' ||
    segments.length < 2 ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'),
    )
  ) {
    throw new Error(`Packed npm tarball member has an unsafe path: ${member}`);
  }

  const file = path.join(await realpath(extractedRoot), ...segments);
  const [stats, resolved] = await Promise.all([lstat(file), realpath(file)]);
  if (!stats.isFile() || resolved !== file) {
    throw new Error(`Packed npm tarball member is not a confined regular file: ${member}`);
  }
  return readFile(file);
}

/** Keep the published-byte scan independent of how the archive was read. */
export function findPackedSensitiveContent(
  entries: readonly { readonly path: string; readonly text: string }[],
): string[] {
  const sensitivePatterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
    ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{20,}/u],
    ['OpenAI token', /sk-[A-Za-z0-9_-]{20,}/u],
    ['AWS access key', /AKIA[0-9A-Z]{16}/u],
    ['Google API key', /AIza[0-9A-Za-z_-]{30,}/u],
    ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/u],
    ['absolute local user path', /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\//u],
  ] as const;
  const findings: string[] = [];
  for (const { path: file, text } of entries) {
    for (const [label, pattern] of sensitivePatterns) {
      if (pattern.test(text)) findings.push(`${file}: ${label}`);
    }
  }
  return findings;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
