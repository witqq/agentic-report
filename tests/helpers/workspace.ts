import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

export async function createTestWorkspace(prefix: string): Promise<string> {
  const root = path.resolve('test-results/workspaces');
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, `${prefix}-`));
}

export async function removeTestWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
}
