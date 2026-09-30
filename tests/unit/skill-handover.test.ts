/**
 * Catches a hand-over gate that lets a page through while one of its checks fails: the design check, the
 * prose check, the measure, a missing browser, or an open checklist item. The measure is played by a fake
 * `agentic-report` that answers `snapshot` from a file and passes every other command to the built CLI, so
 * each part can be made to fail on its own while the rest of the page stays clean.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initProject } from '../../src/index.js';
// @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
import { handover } from '../../skills/agentic-report/scripts/handover.mjs';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const run = promisify(execFile);
const script = path.resolve('skills/agentic-report/scripts/handover.mjs');
const checklistScript = path.resolve('skills/agentic-report/scripts/checklist.mjs');

interface Check {
  readonly name: string;
  readonly passed: boolean;
  readonly skipped?: string;
  readonly findings: readonly { rule: string; id: string; message: string; hint: string }[];
}
interface Verdict {
  readonly verdict: 'pass' | 'fail';
  readonly checks: readonly Check[];
}
const gate = handover as (
  source: string,
  options?: { cli?: string; noBrowser?: string; since?: string },
) => Promise<Verdict & { since?: string }>;

let root: string;
let page: string;
let cli: string;
let clean: { report: string; brief: string; checklist: string };

async function measure(config: { defects?: number; browserMissing?: boolean }): Promise<void> {
  await writeFile(path.join(root, 'measure.json'), JSON.stringify(config));
}
async function restore(): Promise<void> {
  await writeFile(path.join(page, 'report.md'), clean.report);
  await writeFile(path.join(page, 'brief.md'), clean.brief);
  await writeFile(path.join(page, 'checklist.md'), clean.checklist);
  // The frame the Look item names is taken after the page was last written.
  await mkdir(path.join(page, 'shots'), { recursive: true });
  await writeFile(path.join(page, 'shots', '390.png'), 'frame');
  await measure({ defects: 0 });
}
const failed = (result: Verdict): string[] =>
  result.checks.filter((check) => !check.passed).map((check) => check.name);

beforeAll(async () => {
  root = await createTestWorkspace('skill-handover');
  page = path.join(root, 'page');
  await initProject({ destination: page, starter: 'document' });
  // A single-language page: the gate reads every Markdown file of the page.
  await rm(path.join(page, 'report.ru.md'));
  const report = (await readFile(path.join(page, 'report.md'), 'utf8')).replace(
    /\nlocalizations:[\s\S]*?(?=\n[a-z]|\n---)/u,
    '',
  );
  await writeFile(path.join(page, 'report.md'), report);
  const template = await readFile(path.join(page, 'brief.md'), 'utf8');
  const brief = template.replace(
    /^(\| `[a-z-]+` \| .+?) \| +\| +\|$/gmu,
    '$1 | Decided. | inferred |',
  );
  await writeFile(path.join(page, 'brief.md'), brief);
  await run(process.execPath, [checklistScript, 'init', page]);
  const checklist = (await readFile(path.join(page, 'checklist.md'), 'utf8'))
    .replace(
      /^- \[ \] (?!`(?:design-check\.mjs|prose-check\.mjs|snapshot --measure)`)(.+)$/gmu,
      '- [x] $1 → done',
    )
    .replace('- [x] Look → done', '- [x] Look → shots/390.png: the title and every table fit');
  clean = { report, brief, checklist };

  cli = path.join(root, 'fake-cli.mjs');
  await writeFile(
    cli,
    [
      "import { spawnSync } from 'node:child_process';",
      "import { readFileSync } from 'node:fs';",
      'const [command, ...rest] = process.argv.slice(2);',
      "if (command === 'snapshot') {",
      `  (await import('node:fs')).writeFileSync(${JSON.stringify(path.join(root, 'snapshot-args.json'))}, JSON.stringify(rest));`,
      `  const config = JSON.parse(readFileSync(${JSON.stringify(path.join(root, 'measure.json'))}, 'utf8'));`,
      '  if (config.browserMissing) {',
      "    console.log(JSON.stringify({ type: 'diagnostic', level: 'error', code: 'SNAPSHOT_BROWSER_MISSING', message: 'Snapshots need Playwright next to agentic-report, and none was found.', remediation: 'Install playwright.' }));",
      '    process.exit(1);',
      '  }',
      "  for (const width of [390, 1440]) console.log(JSON.stringify({ type: 'measure', width, scheme: 'light', motion: 'normal', pageHeight: 900, lowContrast: { count: config.defects, samples: [] }, defects: config.defects }));",
      "  console.log(JSON.stringify({ type: 'result' }));",
      '  process.exit(0);',
      '}',
      `const result = spawnSync(process.execPath, [${JSON.stringify(path.resolve('dist/node/cli.js'))}, command, ...rest], { stdio: 'inherit' });`,
      'process.exit(result.status ?? 1);',
    ].join('\n'),
  );
  await restore();
}, 60_000);

afterAll(async () => {
  await removeTestWorkspace(root);
});

describe('hand-over gate', () => {
  it('passes a clean page, stamps its gates, and exits 0', async () => {
    await restore();
    const { stdout } = await run(process.execPath, [script, page, '--cli', cli]);
    const result = JSON.parse(stdout) as Verdict;
    expect(result.verdict).toBe('pass');
    expect(result.checks.map((check) => [check.name, check.passed])).toEqual([
      ['design-check', true],
      ['prose-check', true],
      ['snapshot-measure', true],
      ['checklist', true],
    ]);
    const checklist = await readFile(path.join(page, 'checklist.md'), 'utf8');
    expect(checklist).toMatch(
      /- \[x\] `snapshot --measure` counts no defect → handover\.mjs [0-9a-f]{12}: 0 defects in 2 shots/u,
    );
    // Editing the page after the gate reopens its stamps.
    await writeFile(path.join(page, 'report.md'), `${clean.report}\nOne more sentence.\n`);
    await expect(run(process.execPath, [checklistScript, 'check', page])).rejects.toMatchObject({
      code: 1,
    });
  }, 60_000);

  it('reads a new edition with --since the page the brief names, and fails when it is missing', async () => {
    // Ловит: пересобранная страница проходит сдачу без слоя изменений — проверка дизайна и замер читают
    // её как первую редакцию, хотя бриф называет предыдущую, или молча пропускают несуществующую.
    await restore();
    const previous = path.join(root, 'v1.html');
    await run(process.execPath, [
      path.resolve('dist/node/cli.js'),
      'build',
      page,
      '--output',
      previous,
    ]);
    await writeFile(path.join(page, 'report.md'), `${clean.report}\nA new paragraph.\n`);
    await writeFile(path.join(page, 'brief.md'), `${clean.brief}\nPrevious edition: ../v1.html\n`);
    const withoutItems = await gate(page, { cli });
    // The design check and the measure ran against the edition; the checklist lacks its items.
    expect(withoutItems.since).toBe(previous);
    expect(failed(withoutItems)).toEqual(['checklist']);
    expect(
      JSON.stringify(withoutItems.checks.find((check) => check.name === 'checklist')?.findings),
    ).toContain('previous edition ../v1.html');
    const args = JSON.parse(
      await readFile(path.join(root, 'snapshot-args.json'), 'utf8'),
    ) as string[];
    expect(args.slice(args.indexOf('--since'))).toEqual(['--since', previous]);

    const edition = [
      '## Edition — the reader saw `../v1.html`',
      '',
      '- [x] Built with `--since ../v1.html`, the page the person saw last → build result, 1 added',
      '- [x] The change list read: `changes` of the build, one sentence per changed section told to the person → told',
      '- [x] The change layer looked at in both schemes, at 390 and 1440, and with the toggle off → shots/390.png',
      '',
    ].join('\n');
    await writeFile(path.join(page, 'checklist.md'), `${clean.checklist}\n${edition}`);
    await writeFile(path.join(page, 'shots', '390.png'), 'frame');
    expect((await gate(page, { cli })).verdict).toBe('pass');

    await writeFile(path.join(page, 'brief.md'), `${clean.brief}\nPrevious edition: ../v0.html\n`);
    const missing = await gate(page, { cli });
    expect(missing.checks.find((check) => check.name === 'design-check')?.findings).toEqual([
      expect.objectContaining({ id: 'handover/edition-missing' }),
    ]);
    // --since names the edition instead of the brief.
    expect((await gate(page, { cli, since: previous })).since).toBe(previous);
    // Ловит: `--since` без строки брифа и без пунктов редакции в чек-листе проходит сдачу.
    await writeFile(path.join(page, 'brief.md'), clean.brief);
    await writeFile(path.join(page, 'checklist.md'), clean.checklist);
    const sinceOnly = await gate(page, { cli, since: previous });
    expect(sinceOnly.since).toBe(previous);
    expect(failed(sinceOnly)).toEqual(['checklist']);
    expect(
      JSON.stringify(sinceOnly.checks.find((check) => check.name === 'checklist')?.findings),
    ).toContain(`--since names the previous edition ${previous}`);
    await restore();
  }, 60_000);

  it('fails on a blocking prose finding and exits 1', async () => {
    await restore();
    await writeFile(
      path.join(page, 'report.md'),
      `${clean.report}\nThis is not just a report, it is a handoff.\n`,
    );
    await expect(run(process.execPath, [script, page, '--cli', cli])).rejects.toMatchObject({
      code: 1,
    });
    const result = await gate(page, { cli });
    expect(failed(result)).toEqual(['prose-check', 'checklist']);
    const prose = result.checks.find((check) => check.name === 'prose-check');
    expect(prose?.findings.map((finding) => finding.rule)).toContain('PR-NOT-X-BUT-Y');
  }, 60_000);

  it('fails on design advice', async () => {
    await restore();
    await writeFile(
      path.join(page, 'brief.md'),
      clean.brief.replace('| Decided. | inferred |', '| | |'),
    );
    const result = await gate(page, { cli });
    expect(result.verdict).toBe('fail');
    expect(failed(result)).toEqual(['design-check', 'checklist']);
    expect(result.checks[0]?.findings.map((finding) => finding.rule)).toEqual(['DR-BRIEF']);
  }, 60_000);

  it('fails on measured defects, naming the field', async () => {
    await restore();
    await measure({ defects: 2 });
    const result = await gate(page, { cli });
    expect(failed(result)).toEqual(['snapshot-measure', 'checklist']);
    expect(result.checks[2]?.findings.map((finding) => finding.rule)).toEqual([
      'measure:lowContrast',
      'measure:lowContrast',
    ]);
  }, 60_000);

  it('fails without a browser unless a reason is given, and records the reason', async () => {
    await restore();
    await measure({ browserMissing: true });
    const missing = await gate(page, { cli });
    expect(failed(missing)).toEqual(['snapshot-measure', 'checklist']);
    expect(missing.checks[2]?.findings[0]?.hint).toContain('--no-browser');

    const skipped = await gate(page, { cli, noBrowser: 'the sandbox has no display' });
    expect(skipped.verdict).toBe('pass');
    expect(skipped.checks[2]?.skipped).toBe('the sandbox has no display');
    expect(await readFile(path.join(page, 'checklist.md'), 'utf8')).toContain(
      'not measured, no browser: the sandbox has no display',
    );
  }, 60_000);

  it('fails when the look names no frame of the current page', async () => {
    await restore();
    await writeFile(
      path.join(page, 'checklist.md'),
      clean.checklist.replace(/- \[x\] Look → .+/u, '- [x] Look → frames read, all fine'),
    );
    const result = await gate(page, { cli });
    expect(failed(result)).toEqual(['checklist']);
    expect(result.checks[3]?.findings[0]?.message).toContain('name a snapshot frame');
  }, 60_000);

  it('fails while a checklist item is open', async () => {
    await restore();
    await writeFile(
      path.join(page, 'checklist.md'),
      clean.checklist.replace(/- \[x\] Look → .+/u, '- [ ] Look'),
    );
    const result = await gate(page, { cli });
    expect(failed(result)).toEqual(['checklist']);
    expect(result.checks[3]?.findings.map((finding) => finding.message)).toEqual(['Open: Look']);
  }, 60_000);

  it('refuses an external checklist alias before reading its items or stamping its target', async () => {
    // The default checklist is source-derived: stamping it must never follow a link outside the page.
    await restore();
    const outside = path.join(root, 'private-checklist.md');
    const privateText = '# Checklist\n\n- [ ] PRIVATE_HANDOVER_CHECKLIST_CANARY\n';
    await writeFile(outside, privateText);
    await rm(path.join(page, 'checklist.md'));
    await symlink(outside, path.join(page, 'checklist.md'));
    try {
      await expect(gate(page, { cli })).rejects.toThrow(/through a symbolic link/u);
      const failure = await run(process.execPath, [script, page, '--cli', cli]).catch(
        (error: { code: number; stdout: string; stderr: string }) => error,
      );
      expect('code' in failure ? failure.code : 0).toBe(2);
      expect(failure.stdout).toBe('');
      expect(failure.stderr).not.toContain('PRIVATE_HANDOVER_CHECKLIST_CANARY');
      expect(await readFile(outside, 'utf8')).toBe(privateText);
    } finally {
      await rm(path.join(page, 'checklist.md'));
      await restore();
    }
  }, 60_000);
});
