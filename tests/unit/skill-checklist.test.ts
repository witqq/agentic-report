import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../../src/index.js';
import {
  designRules,
  openItems,
  sourceFingerprint,
  stampGates,
  workSteps,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/checklist.mjs';
// @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
import { previousEdition } from '../../skills/agentic-report/scripts/design-rules.mjs';
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
    // The gates are ticked by hand here, so they stay open: only the hand-over stamp closes them.
    expect(await exitCode(['check', page])).toBe(1);

    const fingerprint = (await sourceFingerprint(page)) as string;
    const passed = { passed: true, summary: 'passed' };
    const stamped = stampGates(closed, fingerprint, {
      'design-check': passed,
      'prose-check': passed,
      'snapshot-measure': passed,
    }) as string;
    expect(stamped).toContain(`→ handover.mjs ${fingerprint}: passed`);
    await writeFile(path.join(page, 'checklist.md'), stamped);
    // «seen in the snapshot» names no frame: the look stays open until a frame of this page is named.
    expect(await exitCode(['check', page])).toBe(1);
    const withFrame = stamped.replace(
      '- [x] Look → seen in the snapshot',
      '- [x] Look → shots/390-light-normal-full.png: the title and the first table fit',
    );
    await writeFile(path.join(page, 'checklist.md'), withFrame);
    expect(await exitCode(['check', page])).toBe(1);
    await mkdir(path.join(page, 'shots'));
    await writeFile(path.join(page, 'shots', '390-light-normal-full.png'), 'frame');
    expect(await exitCode(['check', page])).toBe(0);

    // A stamp for another fingerprint — written by hand, or left from before an edit — is open.
    await writeFile(
      path.join(page, 'checklist.md'),
      stamped.replaceAll(fingerprint, '0123456789ab'),
    );
    expect(await exitCode(['check', page])).toBe(1);
    await writeFile(path.join(page, 'checklist.md'), withFrame);
    await writeFile(
      path.join(page, 'report.md'),
      `${await readFile(path.join(page, 'report.md'), 'utf8')}\nEdited.\n`,
    );
    expect(await exitCode(['check', page])).toBe(1);
  });

  it('adds the edition items for a page the brief or --since names as a new edition', async () => {
    // Ловит: пересобранная страница без пунктов редакции — сборка без `--since`, список изменений не
    // прочитан; и бриф, ставший новой редакцией после того, как чек-лист уже был написан.
    const created = await createTestWorkspace('skill-checklist-edition');
    workspaces.push(created);
    const page = path.join(created, 'page');
    await initProject({ destination: page, starter: 'document' });
    const brief = await readFile(path.join(page, 'brief.md'), 'utf8');

    expect(await exitCode(['init', page])).toBe(0);
    const first = await readFile(path.join(page, 'checklist.md'), 'utf8');
    expect(first).not.toContain('## Edition');
    // The brief becomes a new edition after the checklist exists: check keeps an item open for it.
    await writeFile(path.join(page, 'brief.md'), `${brief}\nPrevious edition: ../page.html\n`);
    const closed = first.replace(/^- \[ \] (.+)$/gmu, '- [x] $1 → done');
    await writeFile(path.join(page, 'checklist.md'), closed);
    const { stdout } = await run(process.execPath, [script, 'check', page]).catch(
      (error: { stdout: string }) => error,
    );
    expect(stdout).toContain('Edition (brief.md names the previous edition ../page.html');

    await rm(path.join(page, 'checklist.md'));
    expect(await exitCode(['init', page])).toBe(0);
    const fromBrief = await readFile(path.join(page, 'checklist.md'), 'utf8');
    expect(fromBrief).toContain('## Edition — the reader saw `../page.html`');
    expect(fromBrief).toContain(
      '- [ ] Built with `--since ../page.html`, the page the person saw last',
    );

    await writeFile(path.join(page, 'brief.md'), `${brief}\nPrevious edition: none\n`);
    // Ловит: `--since` без строки брифа не требует пунктов редакции — сдача проходит без слоя изменений.
    await writeFile(path.join(page, 'checklist.md'), closed);
    const checkOutput = async (args: string[]): Promise<string> =>
      (
        await run(process.execPath, [script, 'check', page, ...args]).catch(
          (error: { stdout: string }) => error,
        )
      ).stdout;
    expect(await checkOutput([])).not.toContain('Edition (');
    expect(await checkOutput(['--since', 'old/index.html'])).toContain(
      'Edition (--since names the previous edition old/index.html',
    );
    await rm(path.join(page, 'checklist.md'));
    expect(await exitCode(['init', page, '--since', 'old/index.html'])).toBe(0);
    expect(await readFile(path.join(page, 'checklist.md'), 'utf8')).toContain(
      '- [ ] Built with `--since old/index.html`',
    );
    expect(previousEdition(`${brief}\nPrevious edition: none\n`)).toBeUndefined();
    expect(previousEdition('- **Предыдущая редакция:** `../v1.html`')).toBe('../v1.html');
  });

  it('adds the gates to a checklist written before they existed', () => {
    const old = '# Checklist\n\n## Steps\n\n- [x] Brief → filled\n';
    const result = openItems(old) as { gatesMissing: boolean };
    expect(result.gatesMissing).toBe(true);
    const stamped = stampGates(old, 'abcdefabcdef', {
      'prose-check': { passed: false, summary: '2 blocking findings' },
    }) as string;
    expect(stamped).toContain('## Gates');
    expect(stamped).toContain(
      '- [ ] `prose-check.mjs` reports no blocking finding → handover.mjs abcdefabcdef: 2 blocking findings',
    );
    expect((openItems(stamped, 'abcdefabcdef') as { gatesMissing: boolean }).gatesMissing).toBe(
      false,
    );
  });

  it('refuses an outside brief before init copies private reasons or check prints its edition', async () => {
    const root = await createTestWorkspace('checklist-private-brief');
    workspaces.push(root);
    const source = path.join(root, 'page');
    await mkdir(source);
    await writeFile(path.join(source, 'report.md'), '# Page\n');
    const privateText =
      '## Checks switched off\n\n- DR-SURFACES: PRIVATE_CHECKLIST_BRIEF_CANARY\n\nPrevious edition: PRIVATE_CHECKLIST_BRIEF_CANARY\n';
    await writeFile(path.join(root, 'private.md'), privateText);
    await symlink(path.join(root, 'private.md'), path.join(source, 'brief.md'));
    for (const command of ['init', 'check']) {
      if (command === 'check')
        await writeFile(path.join(source, 'checklist.md'), '# Checklist\n\n- [ ] Build\n');
      const failure = await run(process.execPath, [script, command, source]).catch(
        (error: { code: number; stdout: string; stderr: string }) => error,
      );
      expect('code' in failure ? failure.code : 0).toBe(2);
      expect(failure.stdout).toBe('');
      expect(failure.stderr).toContain('through a symbolic link');
      expect(failure.stderr).not.toContain('PRIVATE_CHECKLIST_BRIEF_CANARY');
      if (command === 'init')
        await expect(access(path.join(source, 'checklist.md'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
    }
    expect(await readFile(path.join(root, 'private.md'), 'utf8')).toBe(privateText);
  });

  it('refuses a source-derived checklist symlink without reading or overwriting its external target', async () => {
    const root = await createTestWorkspace('checklist-private-status');
    workspaces.push(root);
    const source = path.join(root, 'page');
    await mkdir(source);
    const outside = path.join(root, 'private.md');
    const privateText = '# Checklist\n\n- [ ] PRIVATE_CHECKLIST_STATUS_CANARY\n';
    await writeFile(outside, privateText);
    await symlink(outside, path.join(source, 'checklist.md'));
    for (const command of ['init', 'check']) {
      const failure = await run(process.execPath, [script, command, source]).catch(
        (error: { code: number; stdout: string; stderr: string }) => error,
      );
      expect('code' in failure ? failure.code : 0).toBe(2);
      expect(failure.stdout).toBe('');
      expect(failure.stderr).not.toContain('PRIVATE_CHECKLIST_STATUS_CANARY');
      expect(await readFile(outside, 'utf8')).toBe(privateText);
    }
  });

  it('does not create an external file through a dangling default checklist alias', async () => {
    // An absent realpath is not proof of an absent directory entry: init must reject this write alias.
    const root = await createTestWorkspace('checklist-dangling-status');
    workspaces.push(root);
    const source = path.join(root, 'page');
    await mkdir(source);
    const outside = path.join(root, 'absent-private.md');
    await symlink(outside, path.join(source, 'checklist.md'));
    expect(await exitCode(['init', source])).toBe(2);
    await expect(access(outside)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps nested local brief and checklist aliases readable without replacing their contents', async () => {
    const root = await createTestWorkspace('checklist-local-aliases');
    workspaces.push(root);
    const source = path.join(root, 'page');
    await mkdir(path.join(source, 'notes'), { recursive: true });
    await writeFile(
      path.join(source, 'notes', 'brief-copy.md'),
      '## Checks switched off\n\n- DR-SURFACES: local reason\n',
    );
    await symlink(path.join(source, 'notes', 'brief-copy.md'), path.join(source, 'brief.md'));
    expect(await exitCode(['init', source])).toBe(0);
    const checklist = await readFile(path.join(source, 'checklist.md'), 'utf8');
    expect(checklist).toContain('switched off in brief.md: local reason');
    await rm(path.join(source, 'checklist.md'));
    await writeFile(path.join(source, 'notes', 'checklist-copy.md'), checklist);
    await symlink(
      path.join(source, 'notes', 'checklist-copy.md'),
      path.join(source, 'checklist.md'),
    );
    expect(await exitCode(['check', source])).toBe(1);
    expect(await exitCode(['init', source])).toBe(2);
    expect(await readFile(path.join(source, 'notes', 'checklist-copy.md'), 'utf8')).toBe(checklist);
  });

  it('counts a tick without evidence as open and refuses a checklist with no items', () => {
    const result = openItems('- [x] `DR-CONTRAST` contrast\n- [x] Build → 0 diagnostics\n') as {
      open: { label: string }[];
    };
    expect(result.open.map((item) => item.label)).toEqual(['`DR-CONTRAST` contrast']);
    expect(openItems('# Checklist\n\nNothing here.\n')).toMatchObject({ empty: true });
  });
});
