import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../../src/index.js';
import {
  designRules,
  openItems,
  workSteps,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/checklist.mjs';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const run = promisify(execFile);
const script = path.resolve('skills/agentic-report/scripts/checklist.mjs');
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function exitCode(args: string[]): Promise<number> {
  try {
    await run(process.execPath, [script, ...args]);
    return 0;
  } catch (error) {
    return (error as { code?: number }).code ?? -1;
  }
}

describe('skill checklist', () => {
  it('takes every work step, brief dimension and design rule from the skill as it is now', async () => {
    const created = await createTestWorkspace('skill-checklist');
    workspaces.push(created);
    const page = path.join(created, 'page');
    await initProject({ destination: page, starter: 'landing' });
    const brief = await readFile(path.join(page, 'brief.md'), 'utf8');
    await writeFile(
      path.join(page, 'brief.md'),
      brief.replace(
        '## Checks switched off\n',
        '## Checks switched off\n\n- DR-SURFACES: the product is shown on two tinted stages.\n',
      ),
    );

    expect(await exitCode(['init', page])).toBe(0);
    const text = await readFile(path.join(page, 'checklist.md'), 'utf8');
    const skill = await readFile(path.resolve('skills/agentic-report/SKILL.md'), 'utf8');
    const rules = designRules(
      await readFile(path.resolve('skills/agentic-report/references/design-rules.md'), 'utf8'),
    ) as { rule: string }[];
    expect(workSteps(skill).length).toBeGreaterThan(5);
    expect(rules.length).toBeGreaterThan(20);
    for (const { rule } of rules) expect(text).toContain(`\`${rule}\``);
    expect(text).toContain('`first-screen` answered with its source');
    expect(text).toMatch(/- \[n\/a\] `DR-SURFACES` .+ → switched off in brief\.md: the product/u);

    // A fresh checklist is open, and init never overwrites one in progress.
    expect(await exitCode(['check', page])).toBe(1);
    expect(await exitCode(['init', page])).toBe(2);

    const closed = text.replace(/^- \[ \] (.+)$/gmu, '- [x] $1 → seen in the snapshot');
    await writeFile(path.join(page, 'checklist.md'), closed);
    expect(await exitCode(['check', page])).toBe(0);
  });

  it('counts a tick without evidence as open and refuses a checklist with no items', () => {
    const result = openItems('- [x] `DR-CONTRAST` contrast\n- [x] Build → 0 diagnostics\n') as {
      open: { label: string }[];
    };
    expect(result.open.map((item) => item.label)).toEqual(['`DR-CONTRAST` contrast']);
    expect(openItems('# Checklist\n\nNothing here.\n')).toMatchObject({ empty: true });
  });
});
