#!/usr/bin/env node
// The hand-over gate, on the agent's side of the boundary: the compiler never runs it.
//
//   node scripts/handover.mjs <page-source> [--cli "<command>"] [--no-browser "<reason>"]
//                                           [--since <previous-edition>]
//
// Runs every check the skill has, in one go, and prints one verdict:
//   design-check      scripts/design-check.mjs: no advice and no rejected switch in the brief;
//   prose-check       scripts/prose-check.mjs: no blocking finding and no rejected switch;
//   snapshot-measure  `agentic-report snapshot --measure`: zero defects in every width, scheme and motion;
//   checklist         checklist.md beside the page: no open item.
// The first three write their result into the gate items of checklist.md, stamped with the fingerprint of
// the page source, so a gate closes only through this script and reopens when the page changes; then the
// checklist is checked. The page is handed over only when this script exits 0.
//
// `snapshot --measure` needs Playwright and its Chromium. Without them the gate fails and says how to
// install them. Where no browser can run, `--no-browser "<reason>"` skips the measure; the reason is written
// into the measure's gate item and the verdict, so the person receiving the page sees it was not measured.
//
// --cli names the agentic-report command for the design check and the measure, as for design-check.mjs.
// --since names the previous edition the reader saw; without it the `Previous edition:` line of brief.md
// is taken. The design check and the measure then read the page as the new edition, with its change
// layer — the strip, the marks and the ghosts of removed blocks are measured like the rest of the page —
// and the record carries `since`. A named edition that does not exist fails the design-check gate.
// Prints one JSON record { verdict: "pass" | "fail", checks: [{ name, passed, findings }] }; each finding has
// the shape { rule, id, message, hint }. Exits 1 unless every check passed.

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKLIST_FILE, checkChecklist, sourceFingerprint, stampGates } from './checklist.mjs';
import { commandFrom, editionSince, installedCommand, pinnedVersions } from './design-check.mjs';
import { checkPage } from './prose-check.mjs';
import { pageSource, readPageMarkdown, writePageMarkdown } from './source-files.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));

/** Runs a command and returns its exit code and output without throwing on a non-zero exit. */
function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code =
        error === null ? 0 : typeof error.code === 'number' ? error.code : error.code ? 127 : 1;
      resolve({
        code,
        stdout: String(stdout),
        stderr: String(stderr),
        missing: error?.code === 'ENOENT',
      });
    });
  });
}

function records(stdout) {
  return stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((record) => record !== undefined);
}

export async function runDesignCheck(source, cli, since) {
  const args = [
    path.join(scripts, 'design-check.mjs'),
    source,
    ...(cli === undefined ? [] : ['--cli', cli]),
    ...(since === undefined ? [] : ['--since', since]),
  ];
  const { code, stdout, stderr } = await run(process.execPath, args);
  if (code !== 0) {
    return {
      name: 'design-check',
      passed: false,
      findings: [
        {
          rule: 'design-check',
          id: 'design-check/failed',
          message: `design-check.mjs could not run: ${(stderr || stdout).trim().split('\n')[0]}`,
          hint: 'Fix the build first: node scripts/design-check.mjs reads the page through agentic-report inspect.',
        },
      ],
      summary: 'did not run',
    };
  }
  const result = JSON.parse(stdout);
  const findings = [
    ...result.advice,
    ...result.rejectedSwitches.map((entry) => ({
      rule: entry.rule,
      id: 'design-check/rejected-switch',
      message: `brief.md switches ${entry.rule} off, but ${entry.problem}.`,
      hint: 'Under «Checks switched off» write `- DR-RULE: reason` with a rule the check knows.',
    })),
  ];
  return {
    name: 'design-check',
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? `no advice${result.switchedOff.length > 0 ? `, ${result.switchedOff.length} switched off in brief.md` : ''}`
        : `${findings.length} advice`,
  };
}

export async function runProseCheck(source) {
  const result = await checkPage(source);
  const rejected = result.rejectedSwitches.map((entry) => ({
    rule: entry.rule,
    id: 'prose-check/rejected-switch',
    message: `brief.md switches ${entry.rule} off, but ${entry.problem}.`,
    hint: 'Under «Checks switched off» write `- PR-RULE: reason` or `- PR-RULE file.md:line: reason`.',
  }));
  const weak = result.findings.length - result.blocking;
  return {
    name: 'prose-check',
    passed: result.blocking === 0 && rejected.length === 0,
    findings: [...result.findings, ...rejected],
    summary:
      result.blocking === 0 && rejected.length === 0
        ? `0 blocking findings${weak > 0 ? `, ${weak} weak alone left` : ''}${result.switchedOff.length > 0 ? `, ${result.switchedOff.length} switched off in brief.md` : ''}`
        : `${result.blocking} blocking findings`,
  };
}

/** Fields of one measure record that count, as findings. */
function measureFindings(record) {
  const shot = `${record.width}px ${record.scheme} ${record.motion}`;
  const found = [];
  const add = (field, detail) =>
    found.push({
      rule: `measure:${field}`,
      id: `snapshot-measure/${field}`,
      message: `${shot}: ${field} ${detail}`,
      hint: 'What the field means and how to fix it: references/process.md «Look at the result»; node scripts/craft.mjs phone.',
    });
  for (const [field, value] of Object.entries(record)) {
    if (['type', 'runId', 'width', 'scheme', 'motion', 'pageHeight', 'defects'].includes(field))
      continue;
    if (field === 'unmeasuredContrast') continue;
    if (typeof value === 'number' && value > 0) add(field, `= ${value}`);
    else if (Array.isArray(value) && value.length > 0) {
      if (field === 'stops') {
        const cut = value.filter((stop) => stop.fits === false).length;
        if (cut > 0) add(field, `${cut} stops do not fit`);
      } else add(field, `${value.length} found`);
    } else if (value !== null && typeof value === 'object') {
      if (typeof value.count === 'number' && value.count > 0 && field !== 'tables')
        add(field, `${value.count} found`);
      if (field === 'tables')
        for (const kind of ['wide', 'sparse', 'deadSurface', 'flushText'])
          if ((value[kind]?.count ?? 0) > 0) add(`tables.${kind}`, `${value[kind].count} found`);
      if (field === 'readingColumn' && value.narrow === true)
        add(field, `narrow: ${Math.round((value.share ?? 0) * 100)}% of the window`);
      if (field === 'diagramLabels' && ((value.small ?? 0) > 0 || (value.clipped ?? 0) > 0))
        add(field, `${value.small ?? 0} small, ${value.clipped ?? 0} clipped`);
      if (field === 'firstScreen') {
        if (value.heading === false) add(field, 'the title is not on the first screen');
        if (value.actionOnPage === true && value.action === false)
          add(field, 'the primary action is not on the first screen');
      }
    }
  }
  if (found.length === 0 && record.defects > 0) add('defects', `= ${record.defects}`);
  return found;
}

async function snapshotCommand(source, cli) {
  if (cli !== undefined) return commandFrom(cli);
  const installed = await installedCommand(source);
  if (installed !== undefined) return installed;
  const { version, playwright } = await pinnedVersions();
  return [
    'npx',
    '--yes',
    '-p',
    `agentic-report@${version}`,
    '-p',
    `playwright@${playwright ?? 'latest'}`,
    'agentic-report',
  ];
}

export async function runMeasure(source, { cli, noBrowser, since }) {
  if (noBrowser !== undefined) {
    return {
      name: 'snapshot-measure',
      passed: true,
      findings: [],
      skipped: noBrowser,
      summary: `not measured, no browser: ${noBrowser}`,
    };
  }
  const out = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-measure-'));
  try {
    const [file, ...prefix] = await snapshotCommand(source, cli);
    const { code, stdout, stderr, missing } = await run(file, [
      ...prefix,
      'snapshot',
      source,
      '--measure',
      '--out',
      path.join(out, 'measure'),
      ...(since === undefined ? [] : ['--since', since]),
    ]);
    const all = records(stdout);
    const diagnostics = all.filter(
      (record) => record.type === 'diagnostic' && record.level === 'error',
    );
    if (code !== 0 || missing) {
      const browser = diagnostics.find((record) => record.code === 'SNAPSHOT_BROWSER_MISSING');
      return {
        name: 'snapshot-measure',
        passed: false,
        findings: [
          browser === undefined
            ? {
                rule: 'measure:run',
                id: 'snapshot-measure/failed',
                message: `snapshot --measure failed: ${diagnostics.map((record) => `${record.code}: ${record.message}`).join('; ') || (stderr || stdout).trim().split('\n')[0] || `exit ${code}`}`,
                hint: 'Fix what the diagnostics name, then run the gate again.',
              }
            : {
                rule: 'measure:browser',
                id: 'snapshot-measure/browser-missing',
                message: browser.message,
                hint: `${browser.remediation ?? 'Install Playwright and its Chromium.'} Where no browser can run, pass --no-browser "<reason>"; the reason goes into the checklist and the verdict.`,
              },
        ],
        summary: browser === undefined ? 'the measure failed' : 'no browser to measure with',
      };
    }
    const measures = all.filter((record) => record.type === 'measure');
    const defects = measures.reduce((sum, record) => sum + (record.defects ?? 0), 0);
    const findings = measures
      .filter((record) => (record.defects ?? 0) > 0)
      .flatMap(measureFindings);
    return {
      name: 'snapshot-measure',
      passed: measures.length > 0 && defects === 0,
      findings:
        measures.length === 0
          ? [
              {
                rule: 'measure:run',
                id: 'snapshot-measure/empty',
                message: 'snapshot --measure returned no measure.',
                hint: 'Run the snapshot command by hand and read its output.',
              },
            ]
          : findings,
      summary:
        defects === 0
          ? `0 defects in ${measures.length} shots`
          : `${defects} defects in ${measures.length} shots`,
    };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** The design-check gate when the previous edition cannot be found: nothing is checked against it. */
function missingEdition(error) {
  return {
    name: 'design-check',
    passed: false,
    findings: [
      {
        rule: 'edition',
        id: 'handover/edition-missing',
        message: error instanceof Error ? error.message : String(error),
        hint: 'Pass the page the person saw last with --since, or correct the `Previous edition:` line of brief.md; remove the line for a first edition.',
      },
    ],
    summary: 'the previous edition is missing',
  };
}

export async function handover(source, { cli, noBrowser, since: sinceOption } = {}) {
  const { directory } = await pageSource(source);
  const checklistPath = path.join(directory, CHECKLIST_FILE);
  let since;
  let editionError;
  try {
    since = await editionSince(source, sinceOption);
  } catch (error) {
    editionError = error;
  }
  const [design, prose, measure] = await Promise.all([
    editionError === undefined
      ? runDesignCheck(source, cli, since)
      : Promise.resolve(missingEdition(editionError)),
    runProseCheck(source),
    runMeasure(source, { cli, noBrowser, since }),
  ]);
  const gates = [design, prose, measure];

  let checklist;
  const text = await readPageMarkdown(checklistPath, directory, { optional: true });
  if (text === undefined) {
    checklist = {
      name: 'checklist',
      passed: false,
      findings: [
        {
          rule: 'checklist',
          id: 'checklist/missing',
          message: `There is no ${CHECKLIST_FILE} beside the page.`,
          hint: 'Start it at the first step: node scripts/checklist.mjs init <page-directory>.',
        },
      ],
    };
  } else {
    const fingerprint = await sourceFingerprint(directory);
    const results = Object.fromEntries(gates.map((gate) => [gate.name, gate]));
    await writePageMarkdown(checklistPath, directory, stampGates(text, fingerprint, results));
    const state = await checkChecklist(directory, { since: sinceOption });
    checklist = {
      name: 'checklist',
      passed: state.passed,
      findings: [
        ...(state.empty
          ? [
              {
                rule: 'checklist',
                id: 'checklist/empty',
                message: 'checklist.md has no items.',
                hint: 'Write it with node scripts/checklist.mjs init.',
              },
            ]
          : []),
        ...state.open.map((label) => ({
          rule: 'checklist',
          id: 'checklist/open',
          message: `Open: ${label}`,
          hint: 'Close it with its evidence after an arrow: `- [x] item → evidence`, or `- [n/a] item → reason`.',
        })),
      ],
    };
  }
  const checks = [...gates, checklist].map(({ name, passed, findings, skipped }) => ({
    name,
    passed,
    ...(skipped === undefined ? {} : { skipped }),
    findings,
  }));
  return {
    verdict: checks.every((check) => check.passed) ? 'pass' : 'fail',
    ...(since === undefined ? {} : { since }),
    checks,
  };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : (argv[index + 1] ?? '');
}

async function main(argv) {
  const cli = option(argv, '--cli');
  const noBrowser = option(argv, '--no-browser');
  const since = option(argv, '--since');
  if (noBrowser !== undefined && noBrowser.trim().length === 0)
    throw new Error('--no-browser needs the reason no browser can run here, in quotes.');
  const values = new Set(
    ['--cli', '--no-browser', '--since'].flatMap((name) => {
      const index = argv.indexOf(name);
      return index === -1 ? [] : [index, index + 1];
    }),
  );
  const source = argv.find((_, index) => !values.has(index));
  if (source === undefined)
    throw new Error(
      'Usage: handover.mjs <page-source> [--cli "<command>"] [--no-browser "<reason>"] [--since <previous-edition>]',
    );
  const result = await handover(source, { cli, noBrowser: noBrowser?.trim(), since });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.verdict !== 'pass') process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
