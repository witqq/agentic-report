#!/usr/bin/env node
// Design advice for a page source, on the agent's side of the boundary: the compiler never runs it.
//
//   node scripts/design-check.mjs <page-source> [--cli "<command>"]
//
// <page-source> is what `build` accepts: a Markdown file or a directory with report.md or index.md.
// The structure comes from `agentic-report inspect`; the brief is brief.md beside the entry file.
// --cli names the agentic-report command: a path (spaces allowed; a .js or .mjs file runs with node) or a
// command line with quoted parts. Without it the check uses the agentic-report installed for the page —
// the nearest node_modules/.bin above the page source — and only then the npx release pinned in SKILL.md,
// so a project that builds with a local version is checked with the same version. Prints one JSON
// document; exits 0 whether or not there is advice.

import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkDesign } from './design-rules.mjs';

const run = promisify(execFile);
const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function pinnedCommand() {
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const version = /^\s+version:\s*'?(\d+\.\d+\.\d+)'?\s*$/mu.exec(skill)?.[1];
  if (version === undefined) throw new Error('SKILL.md does not pin a release version.');
  return ['npx', '--yes', `agentic-report@${version}`];
}

/** The agentic-report installed for the page: the nearest node_modules/.bin above its source. */
async function installedCommand(source) {
  let directory = path.resolve(source);
  if (
    !(await stat(directory)
      .then((entry) => entry.isDirectory())
      .catch(() => false))
  )
    directory = path.dirname(directory);
  for (;;) {
    const candidate = path.join(directory, 'node_modules', '.bin', 'agentic-report');
    if (
      await access(candidate)
        .then(() => true)
        .catch(() => false)
    )
      return [candidate];
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

async function commandFrom(value) {
  // An existing file is one path even when it contains spaces.
  if (
    await stat(value)
      .then((entry) => entry.isFile())
      .catch(() => false)
  )
    return value.endsWith('.js') || value.endsWith('.mjs') ? [process.execPath, value] : [value];
  // Otherwise a command line: whitespace separates parts, quotes keep a part with spaces together.
  return [...value.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

async function agenticReport(command, args) {
  const [file, ...prefix] = command;
  const { stdout } = await run(file, [...prefix, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

function resultRecord(stdout) {
  const records = stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const result = records.find((record) => record.type === 'result');
  if (result === undefined) throw new Error('inspect returned no result record.');
  return result;
}

async function starterOf(command, category) {
  const catalog = JSON.parse(await agenticReport(command, ['examples', '--json']));
  const starter = catalog.examples.find(
    (example) => example.id === category && example.starter !== undefined,
  );
  if (starter === undefined) return undefined;
  const inspected = resultRecord(await agenticReport(command, ['inspect', starter.entry]));
  return {
    entryPath: inspected.entryPath,
    recipes: inspected.structure.sections
      .filter((section) => section.depth === 0)
      .map((section) => section.recipe ?? 'none'),
  };
}

async function main(argv) {
  const cliIndex = argv.indexOf('--cli');
  const positional = argv.filter(
    (_, index) => cliIndex === -1 || (index !== cliIndex && index !== cliIndex + 1),
  );
  const source = positional[0] ?? '.';
  const command =
    cliIndex !== -1
      ? await commandFrom(argv[cliIndex + 1] ?? '')
      : ((await installedCommand(source)) ?? (await pinnedCommand()));

  const inspected = resultRecord(await agenticReport(command, ['inspect', source]));
  const structure = inspected.structure;
  const starter = structure.layout === 'landing' ? await starterOf(command, 'landing') : undefined;
  const briefPath = path.join(path.dirname(inspected.entryPath), 'brief.md');
  const briefText = await readFile(briefPath, 'utf8').catch(() => undefined);

  const result = checkDesign({
    structure,
    starterRecipes: starter?.recipes,
    isStarter: starter !== undefined && starter.entryPath === inspected.entryPath,
    brief: { present: briefText !== undefined, text: briefText },
  });
  process.stdout.write(
    `${JSON.stringify({ page: inspected.entryPath, brief: briefText === undefined ? null : briefPath, ...result }, null, 2)}\n`,
  );
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
