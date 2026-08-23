import { execFile } from 'node:child_process';
import { lstat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { stageSite, type StagedSiteResult } from './build-site.ts';

const execFileAsync = promisify(execFile);

export const prepareDeploymentSite = async (
  repositoryRoot = path.resolve('.'),
): Promise<StagedSiteResult> => {
  const root = await realpath(repositoryRoot);
  const status = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd: root },
  );
  if (status.stdout.trim() !== '') {
    throw new Error('Deployment preparation requires a clean Git checkout.');
  }

  const revisionResult = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
  const revision = revisionResult.stdout.trim();
  const output = path.join(root, 'site');
  try {
    const outputStat = await lstat(output);
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
      throw new Error('Generated deployment output must be a real directory.');
    }
    await rm(output, { recursive: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return stageSite({ repositoryRoot: root, output, revision });
};

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  prepareDeploymentSite()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown deployment preparation failure.';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
