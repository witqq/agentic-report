import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditCanonicalUnitResults, canonicalUnitDirectory } from '../../test-collection.config.ts';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('canonical unit-test collection', () => {
  it('collects the full baseline naming contract and rejects hidden or partial inventories', async () => {
    const workspace = await createTestWorkspace('test-collection');
    workspaces.push(workspace);
    const canonicalRoot = path.join(workspace, canonicalUnitDirectory);
    const canonicalSpec = path.join(canonicalRoot, 'canonical.spec.ts');
    const canonicalModuleTest = path.join(canonicalRoot, 'nested', 'canonical.test.mtsx');
    const outsideTest = path.join(workspace, 'copied-project', 'tests', 'unit', 'outside.spec.ts');
    const excludedTests = [
      '.git',
      '.pnpm-store',
      'agent_temp_files_local',
      'coverage',
      'dist',
      'moira-ws',
      'node_modules',
      'playwright-report',
      'site',
      'test-results',
    ].map((directory) => path.join(canonicalRoot, 'nested', directory, 'copy', 'hidden.spec.ts'));

    await Promise.all(
      [canonicalSpec, canonicalModuleTest, outsideTest, ...excludedTests].map(async (file) => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, 'export {};\n');
      }),
    );

    expect(
      await auditCanonicalUnitResults([canonicalSpec, canonicalModuleTest], workspace),
    ).toBeUndefined();
    expect(await auditCanonicalUnitResults([canonicalSpec], workspace)).toContain('missing:');
    for (const excludedTest of excludedTests) {
      expect(
        await auditCanonicalUnitResults(
          [canonicalSpec, canonicalModuleTest, excludedTest],
          workspace,
        ),
      ).toContain('unexpected:');
    }
    expect(
      await auditCanonicalUnitResults([canonicalSpec, canonicalModuleTest, outsideTest], workspace),
    ).toContain('unexpected:');
  });
});
