import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { authoringRegistry } from '../../src/authoring/registry.js';
import { getSourceContract } from '../../src/discovery.js';

const referencePath = path.resolve('skills/agentic-report/references/cli.md');
const execFileAsync = promisify(execFile);

function tableBetween(markdown: string, start: string, end: string): string {
  const afterStart = markdown.split(`## ${start}\n`)[1];
  if (afterStart === undefined) throw new Error(`Missing ${start} section`);
  const beforeEnd = afterStart.split(`## ${end}\n`)[0];
  if (beforeEnd === undefined) throw new Error(`Missing ${end} section`);
  return beforeEnd;
}

function documentedFields(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1] ?? '');
}

async function interfaceFields(file: string, name: string): Promise<string[]> {
  const source = await readFile(path.resolve(file), 'utf8');
  const declaration = new RegExp(`export interface ${name}(?: extends [A-Za-z]+)? \\{`, 'u').exec(
    source,
  );
  const start = declaration?.index ?? -1;
  if (start < 0) throw new Error(`Missing ${name} in ${file}`);
  const end = source.indexOf('\n}', start);
  if (end < 0) throw new Error(`Unclosed ${name} in ${file}`);
  return [
    ...source.slice(start, end).matchAll(/^ {2}readonly ([A-Za-z][A-Za-z0-9]*)(?:\?)?:/gmu),
  ].map((match) => match[1] ?? '');
}

describe('skill CLI reference', () => {
  it('routes agents to every registered command', async () => {
    const reference = await readFile(referencePath, 'utf8');
    const commands = tableBetween(
      reference,
      'Commands and options',
      'Agent output and diagnostics',
    );
    const documented = [...commands.matchAll(/^\|\s*`([a-z][a-z-]*)`\s*\|/gmu)].map(
      (match) => match[1] ?? '',
    );
    expect(documented.length).toBeGreaterThan(0);
    expect(documented.sort()).toEqual(
      authoringRegistry.commands.map((command) => command.id).sort(),
    );
  });

  it('places every installed CLI option on its actual command', async () => {
    const reference = await readFile(referencePath, 'utf8');
    const commands = tableBetween(
      reference,
      'Commands and options',
      'Agent output and diagnostics',
    );
    const rows = [...commands.matchAll(/^\|\s*`([a-z][a-z-]*)`\s*\|\s*([^|]+)\|/gmu)];
    const common = new Set(['--json', '--human', '--help']);
    const comparisons = await Promise.all(
      rows.map(async (row) => {
        const command = row[1] ?? '';
        const { stdout } = await execFileAsync(process.execPath, [
          path.resolve('dist/node/cli.js'),
          command,
          '--help',
        ]);
        const installed = [...stdout.matchAll(/^ {2}(?:-\w, )?(--[a-z-]+)/gmu)]
          .map((match) => match[1] ?? '')
          .filter((flag) => !common.has(flag))
          .sort();
        const documented = [...(row[2] ?? '').matchAll(/--[a-z-]+/gu)]
          .map((match) => match[0])
          .sort();
        return { command, documented, installed };
      }),
    );
    for (const { command, documented, installed } of comparisons) {
      expect(documented, command).toEqual(installed);
    }
  }, 20_000);

  it('documents every top-level field of each run-result interface', async () => {
    // A field added to a machine result without teaching the skill breaks an agent consumer even when
    // the CLI tests stay green. Read the TypeScript declarations rather than duplicating a field list.
    const reference = await readFile(referencePath, 'utf8');
    const results = reference.split('## Result fields\n')[1];
    if (results === undefined) throw new Error('Missing result fields section');
    const rows = [
      ...results.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([A-Za-z]+Result)`\s*\|\s*([^|]+)\|$/gmu),
    ];
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      const command = row[1] ?? '';
      const resultName = row[2] ?? '';
      const declared = await interfaceFields(
        resultName === 'EffectCheckResult' ? 'src/core/effect-check.ts' : 'src/contracts.ts',
        resultName,
      );
      const documented = documentedFields(row[3] ?? '');
      expect(documented.sort(), command).toEqual(declared.sort());
    }
  });

  it('documents nested result records that agents parse', async () => {
    const reference = await readFile(referencePath, 'utf8');
    const nested = reference.split('These are the nested records an agent needs to parse.')[1];
    if (nested === undefined) throw new Error('Missing nested result records');
    const table = nested.split('`SnapshotPageMeasures.firstScreen`')[0] ?? '';
    const rows = [...table.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([A-Za-z]+)`\s*\|\s*([^|]+)\|$/gmu)];
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      const record = row[2] ?? '';
      const file =
        record === 'ExtensionBuildReport'
          ? 'src/extensions/types.ts'
          : record === 'EffectCheckItem'
            ? 'src/core/effect-check.ts'
            : record.startsWith('ResolvedReview')
              ? 'src/review/binding.ts'
              : 'src/contracts.ts';
      const declared = await interfaceFields(file, record);
      expect(documentedFields(row[3] ?? '').sort(), record).toEqual(declared.sort());
    }
  });

  it('names every field in the unwrapped source-contract document', async () => {
    const reference = await readFile(referencePath, 'utf8');
    const row = /^\|\s*`describe`\s*\|\s*([^|]+)\|$/mu.exec(reference);
    expect(row).not.toBeNull();
    expect(documentedFields(row?.[1] ?? '').sort()).toEqual(
      Object.keys(getSourceContract()).sort(),
    );
  });
});
