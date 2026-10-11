import { execFile } from 'node:child_process';
import { symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const scripts = path.resolve('skills/agentic-report/scripts');
const commands = ['prose-check', 'design-check', 'checklist', 'handover', 'craft'] as const;
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

function invoke(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    // Testfold forces color while the host disables it; Node otherwise emits a PID-bearing warning.
    // These scripts emit plain JSON/Markdown, so exercise their output without conflicting runner flags.
    const environment = { ...process.env };
    delete environment.NO_COLOR;
    delete environment.FORCE_COLOR;
    execFile(process.execPath, args, { env: environment }, (error, stdout, stderr) => {
      resolve({
        code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
        stdout,
        stderr,
      });
    });
  });
}

describe('skill CLI entry through symbolic links', () => {
  it('runs every guarded command through a linked installation and a linked script, preserving its result', async () => {
    const root = await createTestWorkspace('skill-cli-entry');
    workspaces.push(root);
    const installed = path.join(root, 'installed-skill');
    await symlink(path.dirname(scripts), installed, 'dir');
    const source = path.join(root, 'report.md');
    await writeFile(source, '---\ntitle: Probe\nlanguage: en\n---\n\nWe leverage the pipeline.\n');
    const argumentsFor = (name: (typeof commands)[number]): string[] => {
      if (name === 'prose-check') return [source];
      if (name === 'design-check')
        return [path.join(root, 'absent-source'), '--cli', process.execPath];
      if (name === 'checklist') return ['unknown-command', root];
      if (name === 'craft') return ['unknown-topic'];
      return [];
    };
    for (const name of commands) {
      const canonical = path.join(scripts, `${name}.mjs`);
      const fileLink = path.join(root, `${name}-linked.mjs`);
      await symlink(canonical, fileLink, 'file');
      const args = argumentsFor(name);
      const direct = await invoke([canonical, ...args]);
      // Catches the silent exit-0/no-output state: each command must execute its check or usage error.
      expect(direct.code, name).toBeGreaterThan(0);
      expect(direct.stdout + direct.stderr, name).not.toBe('');
      for (const linked of [path.join(installed, 'scripts', `${name}.mjs`), fileLink])
        expect(await invoke([linked, ...args]), linked).toEqual(direct);
      if (name === 'prose-check') {
        expect(direct.code).toBe(1);
        expect(JSON.parse(direct.stdout)).toMatchObject({
          verdict: 'fail',
          blocking: 1,
          findings: [expect.objectContaining({ rule: 'PR-MODEL-WORDS' })],
        });
      }
    }
    // A successful check must also print a result; replacing failure with a no-op cannot satisfy this.
    await writeFile(
      source,
      '---\ntitle: Probe\nlanguage: en\n---\n\nThe compiler reads the source.\n',
    );
    const clean = await invoke([path.join(installed, 'scripts/prose-check.mjs'), source]);
    expect(clean.code).toBe(0);
    expect(JSON.parse(clean.stdout)).toMatchObject({ verdict: 'pass', blocking: 0 });
  });

  it('keeps command modules inert when imported by another entry point', async () => {
    const imports = commands
      .map(
        (name) =>
          `await import(${JSON.stringify(pathToFileURL(path.join(scripts, `${name}.mjs`)).href)});`,
      )
      .join('\n');
    // Catches a guard removed entirely: imported commands would run their CLI or fail with usage errors.
    expect(
      await invoke([
        '--input-type=module',
        '--eval',
        `${imports}\nprocess.stdout.write('imports only');`,
      ]),
    ).toEqual({ code: 0, stdout: 'imports only', stderr: '' });
  });
});
