import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const workspaces: string[] = [];
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'report-atlas-'));
  workspaces.push(root);
  const skill = path.join(root, 'standalone skill');
  await cp(path.resolve('skills/agentic-report'), skill, { recursive: true });
  const project = path.join(root, 'consumer');
  const pkg = path.join(project, 'node_modules/agentic-report');
  await mkdir(path.join(pkg, 'dist/node/authoring'), { recursive: true });
  await mkdir(path.join(pkg, 'examples/document'), { recursive: true });
  await writeFile(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: 'agentic-report', type: 'module' }),
  );
  const entry = path.join(pkg, 'examples/document/report.md');
  await writeFile(entry, '---\ntitle: Installed fixture\n---\nActual installed source.\n');
  const example = {
    id: 'document',
    title: 'Document',
    description: 'Installed fixture',
    path: 'document',
    entry: 'report.md',
    starter: 'document',
  };
  await writeFile(
    path.join(pkg, 'dist/node/discovery.js'),
    `export const listExamples=()=>${JSON.stringify([example])};`,
  );
  await writeFile(
    path.join(pkg, 'dist/node/authoring/reference-extensions.js'),
    'export const listReferenceExtensions=async()=>[];',
  );
  await writeFile(
    path.join(pkg, 'dist/node/index.js'),
    'import {readFile,writeFile} from "node:fs/promises"; export async function buildReport({input,output}){await writeFile(output, await readFile(input,"utf8"));}',
  );
  const cli = path.join(pkg, 'dist/node/cli.js');
  await writeFile(
    cli,
    `#!/usr/bin/env node\nif(process.argv.slice(2).join(' ')!=='examples --json')throw Error('Wrong discovery command'); console.log(${JSON.stringify(JSON.stringify({ examples: [{ ...example, entry }] }))});`,
  );
  await chmod(cli, 0o755);
  const bin = path.join(project, 'node_modules/.bin');
  await mkdir(bin, { recursive: true });
  await cp(cli, path.join(bin, 'agentic-report'));
  const script = path.join(skill, 'scripts/build-atlas.mjs');
  const out = path.join(root, 'gallery');
  return { root, project, cli, script, out };
}

describe('standalone installed skill atlas', () => {
  // A skill-only directory has no dist/examples. Resolving its parent as the package fails this case.
  it('uses the consumer-installed compiler to find actual package sources', async () => {
    const f = await fixture();
    await run(process.execPath, [f.script, '--out', f.out], { cwd: f.project });
    expect(await readFile(path.join(f.out, 'document.html'), 'utf8')).toContain(
      'Actual installed source.',
    );
    expect(await readFile(path.join(f.out, 'index.html'), 'utf8')).toContain('document.html');
  });

  // An explicit checkout can differ from the skill location and contain spaces in its path.
  it('honors an explicit compiler path outside the installed skill', async () => {
    const f = await fixture();
    await run(process.execPath, [f.script, '--out', f.out, '--cli', f.cli], { cwd: f.root });
    expect(await readFile(path.join(f.out, 'document.html'), 'utf8')).toContain(
      'Actual installed source.',
    );
  });

  // A bad CLI must never run or write into an already occupied output directory.
  it('refuses occupied output before compiler discovery without changing its bytes', async () => {
    const f = await fixture();
    await mkdir(f.out);
    const existing = path.join(f.out, 'keep.txt');
    await writeFile(existing, 'preserved');
    await expect(
      run(process.execPath, [f.script, '--out', f.out, '--cli', path.join(f.root, 'missing.js')], {
        cwd: f.root,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Atlas output must be absent or empty.'),
    });
    expect(await readFile(existing, 'utf8')).toBe('preserved');
  });
});
