#!/usr/bin/env node
// Design advice for a page source, on the agent's side of the boundary: the compiler never runs it.
//
//   node scripts/design-check.mjs <page-source> [--cli "<command>"] [--since <previous-edition>]
//
// <page-source> is what `build` accepts: a Markdown file or a directory with report.md or index.md.
// The structure comes from `agentic-report inspect`; the brief is brief.md beside the entry file.
// --cli names the agentic-report command: a path (spaces allowed; a .js or .mjs file runs with node) or a
// command line with quoted parts. Without it the check uses the agentic-report installed for the page —
// the nearest node_modules/.bin above the page source — and only then the npx release pinned in SKILL.md,
// so a project that builds with a local version is checked with the same version. Prints one JSON
// document whose `advice` lists findings as { rule, id, message, hint }; exits 0 whether or not there is
// advice — the hand-over gate (scripts/handover.mjs) is what fails on it.
// --since names the previous edition the reader saw (see editionSince); without it the check takes the
// `Previous edition:` line of brief.md. It is passed to `inspect --since`, so the page is read as the new
// edition with its change layer, and the document gains `edition`: the path, the edition number and the
// totals of changed, added, removed and moved blocks — what to tell the person.

import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkDesign, previousEdition } from './design-rules.mjs';
import { pageSource, readPageMarkdown } from './source-files.mjs';

const run = promisify(execFile);
const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The release and the Playwright version pinned in SKILL.md. */
export async function pinnedVersions() {
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const version = /^\s+version:\s*'?(\d+\.\d+\.\d+)'?\s*$/mu.exec(skill)?.[1];
  if (version === undefined) throw new Error('SKILL.md does not pin a release version.');
  const playwright = /\bplaywright@(\d+\.\d+\.\d+)/u.exec(skill)?.[1];
  return { version, playwright };
}

async function pinnedCommand() {
  const { version } = await pinnedVersions();
  return ['npx', '--yes', `agentic-report@${version}`];
}

/** The agentic-report installed for the page: the nearest node_modules/.bin above its source. */
export async function installedCommand(source) {
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

export async function commandFrom(value) {
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

/** The folder of a page source: the source itself when it is a folder, else the folder of the file. */
export async function pageDirectory(source) {
  return (await pageSource(source)).directory;
}

/**
 * The previous edition to build against: `--since` when given (relative to the working folder, as every
 * CLI path), else the `Previous edition:` line of brief.md (relative to the page folder), else none. A
 * named edition that does not exist is an error, not a silent first edition: the reader would get a page
 * without the changes they were promised.
 */
export async function editionSince(source, since) {
  const directory = await pageDirectory(source);
  const briefText = await readPageMarkdown(path.join(directory, 'brief.md'), directory, {
    optional: true,
  });
  const fromBrief = previousEdition(briefText);
  const target =
    since !== undefined
      ? path.resolve(since)
      : fromBrief === undefined
        ? undefined
        : path.resolve(directory, fromBrief);
  if (target === undefined) return undefined;
  if (
    !(await access(target)
      .then(() => true)
      .catch(() => false))
  )
    throw new Error(
      `The previous edition ${since !== undefined ? 'passed with --since' : 'named in brief.md'} does not exist: ${target}.`,
    );
  return target;
}

/** The value after an option, and the arguments without the option and its value. */
export function takeOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return { value: undefined, rest: argv };
  return {
    value: argv[index + 1] ?? '',
    rest: argv.filter((_, position) => position !== index && position !== index + 1),
  };
}

async function main(argv) {
  const cliOption = takeOption(argv, '--cli');
  const sinceOption = takeOption(cliOption.rest, '--since');
  const source = sinceOption.rest[0] ?? '.';
  const command =
    cliOption.value !== undefined
      ? await commandFrom(cliOption.value)
      : ((await installedCommand(source)) ?? (await pinnedCommand()));
  const since = await editionSince(source, sinceOption.value);

  const inspected = resultRecord(
    await agenticReport(command, [
      'inspect',
      source,
      ...(since === undefined ? [] : ['--since', since]),
    ]),
  );
  const structure = inspected.structure;
  const starter = structure.layout === 'landing' ? await starterOf(command, 'landing') : undefined;
  const directory = await pageDirectory(inspected.entryPath);
  const briefPath = path.join(directory, 'brief.md');
  const briefText = await readPageMarkdown(briefPath, directory, { optional: true });
  const edition =
    since === undefined
      ? null
      : {
          since,
          edition: inspected.changes?.edition ?? null,
          unchanged: inspected.changes?.unchanged ?? null,
          totals: inspected.changes?.totals ?? null,
        };

  const result = checkDesign({
    structure,
    starterRecipes: starter?.recipes,
    isStarter: starter !== undefined && starter.entryPath === inspected.entryPath,
    brief: { present: briefText !== undefined, text: briefText },
  });
  process.stdout.write(
    `${JSON.stringify({ page: inspected.entryPath, brief: briefText === undefined ? null : briefPath, edition, ...result }, null, 2)}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
