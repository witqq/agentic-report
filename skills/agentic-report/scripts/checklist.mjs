#!/usr/bin/env node
// The page's checklist, on the agent's side of the boundary: the compiler never reads it.
//
//   node scripts/checklist.mjs init <page-directory> [--since <previous-edition>]
//                                                       writes <page-directory>/checklist.md
//   node scripts/checklist.mjs check <page-directory> [--since <previous-edition>]
//                                                       exits 1 while any item is open
//
// `init` takes the items from the skill as it is at that moment: the steps of «The order of work» in
// SKILL.md, every dimension of the page's brief.md, every rule heading of references/design-rules.md, and
// the three gates of the hand-over. A rule switched off in the brief's «Checks switched off» starts closed
// as n/a with the brief's reason.
//
// A new edition — a page the person already saw, named by `--since` or by the `Previous edition:` line of
// brief.md — gets one more section: build with `--since` that edition, read the change list and tell the
// person what changed. The defect caught is a rebuilt page handed over without its change layer, so the
// reader has to find the answers to their questions by rereading the whole page.
//
// An item closes only with a reason after an arrow: `- [x] … → what shows it is done` or
// `- [n/a] … → why it does not apply`. The defect `check` catches is a page handed over with an item
// nobody looked at; a tick without a reason counts as open, and a checklist with no items is refused,
// because a check that found nothing to check has proved nothing.
//
// A gate item closes only with the stamp `scripts/handover.mjs` writes when its check passes: `handover.mjs`
// and the fingerprint of the page source at that moment. A stamp written by hand, or one left from before
// the source changed, counts as open — the defect caught is a page edited after its checks passed.
//
// The Look step closes only with the path of a snapshot frame taken after the last change of the page and
// what it shows (see lookProblem): a look reported without a frame stays open.

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSwitchedOff, previousEdition } from './design-rules.mjs';
import { confinedFile, pageSource, readPageMarkdown, writePageMarkdown } from './source-files.mjs';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CHECKLIST_FILE = 'checklist.md';

/** The gates of the hand-over, in the order `handover.mjs` runs them. */
export const GATES = [
  { name: 'design-check', label: '`design-check.mjs` reports no advice' },
  { name: 'prose-check', label: '`prose-check.mjs` reports no blocking finding' },
  { name: 'snapshot-measure', label: '`snapshot --measure` counts no defect' },
];
const GATES_HEADING = '## Gates — closed only by `node scripts/handover.mjs`';

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

export function gateLines() {
  return [GATES_HEADING, '', ...GATES.map((gate) => `- [ ] ${gate.label}`), ''];
}

const EDITION_BUILT = 'Built with';

/** The items of a new edition, when the page has a previous one. */
export function editionLines(previous) {
  if (previous === undefined) return [];
  return [
    `## Edition — the reader saw \`${previous}\``,
    '',
    `- [ ] ${EDITION_BUILT} \`--since ${previous}\`, the page the person saw last`,
    '- [ ] The change list read: `changes` of the build, one sentence per changed section told to the person',
    '- [ ] The change layer looked at in both schemes, at 390 and 1440, and with the toggle off',
    '',
  ];
}

export function renderChecklist({ skillText, rulesText, briefText, since }) {
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
    '`- [n/a] item → why it does not apply`. The gates close only when `node scripts/handover.mjs`',
    'passes; hand the page over when it does.',
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
    ...editionLines(since ?? previousEdition(briefText)),
    '## Design rules',
    '',
    ...rules.map(({ rule, statement }) =>
      switched.has(rule)
        ? `- [n/a] \`${rule}\` ${statement} → switched off in brief.md: ${switched.get(rule)}`
        : `- [ ] \`${rule}\` ${statement}`,
    ),
    '',
    ...gateLines(),
  ].join('\n');
}

const STAMP = /^handover\.mjs ([0-9a-f]{12})\b/u;

/**
 * Every item with its state; an item ticked without evidence is open. A gate item is open unless its
 * evidence is a hand-over stamp for `fingerprint` (when a fingerprint is given).
 */
export function readChecklist(text, fingerprint) {
  return [...text.matchAll(/^\s*[-*] \[( |x|X|n\/a)\] (.+)$/gmu)].map((match) => {
    const [label, evidence = ''] = match[2].split(/\s+→\s+/u, 2);
    const mark = match[1].toLowerCase();
    const gate = GATES.find((entry) => entry.label === label.trim())?.name;
    let closed = mark !== ' ' && evidence.trim().length > 0;
    if (gate !== undefined) {
      const stamp = STAMP.exec(evidence.trim())?.[1];
      closed =
        mark === 'x' && stamp !== undefined && (fingerprint === undefined || stamp === fingerprint);
    }
    return { label: label.trim(), mark, evidence: evidence.trim(), closed, gate };
  });
}

export function openItems(text, fingerprint) {
  const items = readChecklist(text, fingerprint);
  if (items.length === 0) return { items, open: [], empty: true, gatesMissing: false };
  const gatesMissing = GATES.some((gate) => !items.some((item) => item.gate === gate.name));
  return { items, open: items.filter((item) => !item.closed), empty: false, gatesMissing };
}

/** Writes the result of each gate into its item; appends the gates section when it is missing. */
export function stampGates(text, fingerprint, results) {
  let next = text;
  if (!GATES.some((gate) => next.includes(gate.label)))
    next = `${next.replace(/\s*$/u, '\n\n')}${gateLines().join('\n')}`;
  for (const gate of GATES) {
    const result = results[gate.name];
    if (result === undefined) continue;
    const line = `- [${result.passed ? 'x' : ' '}] ${gate.label} → handover.mjs ${fingerprint}: ${result.summary}`;
    const pattern = new RegExp(
      `^[ \\t]*[-*] \\[(?: |x|X|n\\/a)\\] ${gate.label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:[ \\t]+→.*)?$`,
      'mu',
    );
    next = pattern.test(next)
      ? next.replace(pattern, () => line)
      : `${next.replace(/\s*$/u, '\n')}${line}\n`;
  }
  return next;
}

/** Files that make the page: its text, data and media, not its outputs or its checklist. */
function sourceFile(relative) {
  const parts = relative.split('/');
  if (parts.some((part) => part.startsWith('.') || part === 'node_modules')) return false;
  if (relative === CHECKLIST_FILE) return false;
  if (['assets', 'media', 'data', 'partials', 'extensions'].includes(parts[0])) return true;
  // Outside those folders only top-level source files count, so a snapshot folder inside the page does not.
  return parts.length === 1 && /\.(?:md|json|ya?ml|vtt)$/u.test(relative);
}

/** A short hash of the page source; it changes whenever the page, its brief or its material does. */
export async function sourceFingerprint(directory) {
  directory = (await pageSource(directory)).directory;
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .filter(sourceFile)
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`);
    const canonical = await confinedFile(path.join(directory, ...file.split('/')), directory);
    if (canonical === undefined) throw new Error('Page source material is missing.');
    hash.update(await readFile(canonical));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** The step whose evidence must name a frame of the current page. */
export const LOOK_STEP = 'Look';

/** Page files the frames must be newer than: the source and its material, not the brief or checklist. */
async function newestSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  let newest = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const relative = path.relative(directory, full).split(path.sep).join('/');
    if (!sourceFile(relative) || relative === 'brief.md') continue;
    newest = Math.max(newest, (await stat(full)).mtimeMs);
  }
  return newest;
}

/**
 * The Look item closes only with evidence a reader of the frames can write: the path of at least one
 * snapshot frame (`.png`) that exists and was taken after the last change of the page source, with what it
 * shows. The defect caught is a look reported from memory — «frames read» with no frame, or a frame of
 * an earlier version of the page.
 */
export async function lookProblem(directory, evidence) {
  const paths = [...evidence.matchAll(/(?:^|[\s`(])([^\s`()]+\.png)\b/gu)].map((match) => match[1]);
  if (paths.length === 0)
    return 'name a snapshot frame you opened (its .png path) and what it shows';
  const newest = await newestSource(directory);
  const fresh = [];
  for (const frame of paths) {
    const info = await stat(path.resolve(directory, frame)).catch(() => undefined);
    if (info?.isFile() && info.mtimeMs >= newest) fresh.push(frame);
  }
  if (fresh.length === 0)
    return `none of ${paths.join(', ')} is a frame taken after the last change of the page`;
  return undefined;
}

/**
 * `since` is the previous edition passed with `--since` (to `check` or to `handover.mjs`); without it the
 * brief's `Previous edition:` line names the edition. Either way a new edition needs the edition items.
 */
export async function checkChecklist(directory, { since } = {}) {
  const root = (await pageSource(directory)).directory;
  const target = path.join(root, CHECKLIST_FILE);
  const text = await readPageMarkdown(target, root);
  const fingerprint = await sourceFingerprint(root);
  const { items, open, empty, gatesMissing } = openItems(text, fingerprint);
  const look = items.find((item) => item.label === LOOK_STEP && item.closed && item.mark === 'x');
  const lookIssue = look === undefined ? undefined : await lookProblem(root, look.evidence);
  const labels = open.map((item) =>
    item.gate === undefined ? item.label : `${item.label} (run node scripts/handover.mjs)`,
  );
  if (lookIssue !== undefined) labels.push(`${LOOK_STEP} (${lookIssue})`);
  // A page that became a new edition after the checklist was written still needs the edition items,
  // whether `--since` or the brief names the edition.
  const previous =
    since ??
    previousEdition(await readPageMarkdown(path.join(root, 'brief.md'), root, { optional: true }));
  if (previous !== undefined && !items.some((item) => item.label.startsWith(EDITION_BUILT)))
    labels.push(
      `Edition (${since === undefined ? 'brief.md' : '--since'} names the previous edition ${previous}; add the edition items: ${editionLines(
        previous,
      )
        .filter((line) => line.startsWith('- [ ] '))
        .map((line) => line.slice(6))
        .join('; ')})`,
    );
  return {
    checklist: target,
    items: items.length,
    open: labels,
    empty,
    gatesMissing,
    passed: !empty && !gatesMissing && labels.length === 0,
  };
}

async function main(argv) {
  const sinceIndex = argv.indexOf('--since');
  const since = sinceIndex === -1 ? undefined : argv[sinceIndex + 1];
  if (sinceIndex !== -1 && (since === undefined || since.length === 0))
    throw new Error('--since needs the path of the previous edition.');
  const [command, directory = '.'] = argv.filter(
    (_, index) => sinceIndex === -1 || (index !== sinceIndex && index !== sinceIndex + 1),
  );
  const root = (await pageSource(directory)).directory;
  const target = path.join(root, CHECKLIST_FILE);
  if (command === 'init') {
    const [skillText, rulesText, briefText] = await Promise.all([
      readFile(path.join(skillRoot, 'SKILL.md'), 'utf8'),
      readFile(path.join(skillRoot, 'references', 'design-rules.md'), 'utf8'),
      readPageMarkdown(path.join(root, 'brief.md'), root, { optional: true }),
    ]);
    await writePageMarkdown(
      target,
      root,
      renderChecklist({ skillText, rulesText, briefText, since }),
      {
        flag: 'wx',
      },
    );
    process.stdout.write(`${JSON.stringify({ checklist: target })}\n`);
    return;
  }
  if (command === 'check') {
    const { passed, ...result } = await checkChecklist(directory, { since });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
    return;
  }
  throw new Error('Usage: checklist.mjs init|check <page-directory> [--since <previous-edition>]');
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
