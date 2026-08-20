import { lstat } from 'node:fs/promises';
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
