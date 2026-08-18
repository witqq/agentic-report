import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import { AgenticReportError } from '../diagnostics.js';

export async function resolveConfinedStarterRoot(
  examplesRoot: string,
  starterPath: string,
): Promise<string> {
  const starterRoot = path.resolve(examplesRoot, ...starterPath.split('/'));
  assertPathBelow(examplesRoot, starterRoot);

  try {
    const [examplesStat, starterStat, canonicalExamplesRoot, canonicalStarterRoot] =
      await Promise.all([
        lstat(examplesRoot),
        lstat(starterRoot),
        realpath(examplesRoot),
        realpath(starterRoot),
      ]);
    if (
      examplesStat.isSymbolicLink() ||
      !examplesStat.isDirectory() ||
      starterStat.isSymbolicLink() ||
      !starterStat.isDirectory()
    ) {
      throw packageStarterError('Packaged starter root is not a confined ordinary directory.');
    }
    const expectedCanonicalStarter = path.resolve(canonicalExamplesRoot, ...starterPath.split('/'));
    if (canonicalStarterRoot !== expectedCanonicalStarter) {
      throw packageStarterError(
        'Packaged starter path contains a symbolic link or escapes the package examples root.',
      );
    }
    assertPathBelow(canonicalExamplesRoot, canonicalStarterRoot);
    return starterRoot;
  } catch (error) {
    if (error instanceof AgenticReportError) throw error;
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'PACKAGE_STARTER_INVALID',
        message: 'The packaged starter tree could not be read.',
        remediation: 'Reinstall agentic-report and retry initialization.',
      },
      { cause: error },
    );
  }
}

export function packageStarterError(message: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'PACKAGE_STARTER_INVALID',
    message,
    remediation: 'Reinstall agentic-report and retry initialization.',
  });
}

function assertPathBelow(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw packageStarterError('Packaged starter path escapes the package examples root.');
  }
}
