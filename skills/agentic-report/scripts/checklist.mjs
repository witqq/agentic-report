#!/usr/bin/env node
// The page's checklist, on the agent's side of the boundary: the compiler never reads it.
//
//   node scripts/checklist.mjs init <page-directory>    writes <page-directory>/checklist.md
//   node scripts/checklist.mjs check <page-directory>   exits 1 while any item is open
//
// `init` takes the items from the skill as it is at that moment: the steps of «The order of work» in
// SKILL.md, every dimension of the page's brief.md, and every rule heading of references/design-rules.md.
// A rule switched off in the brief's «Checks switched off» starts closed as n/a with the brief's reason.
//
// An item closes only with a reason after an arrow: `- [x] … → what shows it is done` or
// `- [n/a] … → why it does not apply`. The defect `check` catches is a page handed over with an item
// nobody looked at; a tick without a reason counts as open, and a checklist with no items is refused,
// because a check that found nothing to check has proved nothing.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSwitchedOff } from './design-rules.mjs';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CHECKLIST_FILE = 'checklist.md';

/** The bold titles of the numbered steps under «The order of work». */
export function workSteps(skillText) {
  const section = /^## The order of work\n([\s\S]*?)(?=^## )/mu.exec(skillText)?.[1] ?? '';
  return [...section.matchAll(/^\d+\.\s+\*\*([^*]+?)\.?\*\*/gmu)].map((match) => match[1]);
}

/** Dimension ids of the brief table, in row order. */
export function briefDimensions(briefText) {
  return [...briefText.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gmu)].map((match) => match[1]);
}

/** `DR-…` rules with their one-line statements, in the order of design-rules.md. */
export function designRules(rulesText) {
  return [...rulesText.matchAll(/^### (DR-[A-Z0-9-]+) — (.+?)(?: · [a-z ]+)?$/gmu)].map(
    (match) => ({ rule: match[1], statement: match[2] }),
  );
}

export function renderChecklist({ skillText, rulesText, briefText }) {
  const switched = new Map(
    parseSwitchedOff(briefText).switchedOff.map((entry) => [entry.rule, entry.reason]),
  );
  const steps = workSteps(skillText);
  const dimensions = briefText === undefined ? [] : briefDimensions(briefText);
  const rules = designRules(rulesText);
  if (steps.length === 0 || rules.length === 0)
    throw new Error('The skill has no work steps or no design rules to take items from.');
  return [
    '# Checklist',
    '',
    'Close an item with its evidence after an arrow: `- [x] item → what shows it is done`, or',
    '`- [n/a] item → why it does not apply`. Hand the page over when `node scripts/checklist.mjs check`',
    'reports no open items.',
    '',
    '## Steps',
    '',
    ...steps.map((step) => `- [ ] ${step}`),
    '',
    '## Brief',
    '',
    ...(dimensions.length === 0
      ? ['- [ ] brief.md exists and answers every dimension of the category']
      : dimensions.map((id) => `- [ ] \`${id}\` answered with its source`)),
    '',
    '## Design rules',
    '',
    ...rules.map(({ rule, statement }) =>
      switched.has(rule)
        ? `- [n/a] \`${rule}\` ${statement} → switched off in brief.md: ${switched.get(rule)}`
        : `- [ ] \`${rule}\` ${statement}`,
    ),
    '',
  ].join('\n');
}

/** Every item with its state; an item ticked without evidence is open. */
export function readChecklist(text) {
  return [...text.matchAll(/^\s*[-*] \[( |x|X|n\/a)\] (.+)$/gmu)].map((match) => {
    const [label, evidence = ''] = match[2].split(/\s+→\s+/u, 2);
    const mark = match[1].toLowerCase();
    const closed = mark !== ' ' && evidence.trim().length > 0;
    return { label: label.trim(), mark, evidence: evidence.trim(), closed };
  });
}

export function openItems(text) {
  const items = readChecklist(text);
  if (items.length === 0) return { items, open: [], empty: true };
  return { items, open: items.filter((item) => !item.closed), empty: false };
}

async function main([command, directory = '.']) {
  const target = path.join(path.resolve(directory), CHECKLIST_FILE);
  if (command === 'init') {
    const [skillText, rulesText, briefText] = await Promise.all([
      readFile(path.join(skillRoot, 'SKILL.md'), 'utf8'),
      readFile(path.join(skillRoot, 'references', 'design-rules.md'), 'utf8'),
      readFile(path.join(path.resolve(directory), 'brief.md'), 'utf8').catch(() => undefined),
    ]);
    await writeFile(target, renderChecklist({ skillText, rulesText, briefText }), { flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ checklist: target })}\n`);
    return;
  }
  if (command === 'check') {
    const { items, open, empty } = openItems(await readFile(target, 'utf8'));
    process.stdout.write(
      `${JSON.stringify({ checklist: target, items: items.length, open: open.map((item) => item.label), empty }, null, 2)}\n`,
    );
    if (empty || open.length > 0) process.exitCode = 1;
    return;
  }
  throw new Error('Usage: checklist.mjs init|check <page-directory>');
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
