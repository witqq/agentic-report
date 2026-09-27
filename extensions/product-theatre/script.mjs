// The `theatre-script` provider: reads a scenario of a product run from the page's data and writes Markdown
// made of built-in directives. `part="scene"` writes the diagram of the product's panels and one beat per
// event for a `scene="steps"` section; `part="script"` writes the whole run as a table in a disclosure,
// with the note on where the scenario comes from. The build parses, checks and sanitizes this Markdown
// like authored Markdown, so the provider can write only what an author could write by hand.
//
// The scenario is a data file the page declares in its `data` field, beside the page: the build reads it
// inside the source root and passes it parsed on standard input (`data`, by the file name without
// `.json`), so this provider reads no file itself. Errors go to standard error with exit code 1, and the
// build shows them at the author's directive.

import { readFileSync } from 'node:fs';

const MIN_EVENTS = 2;
// A steps scene holds from two to eight beats.
const MAX_EVENTS = 8;
const PANEL_KINDS = new Set(['neutral', 'accent', 'success', 'warning']);
const LINK_KINDS = new Set(['call', 'data', 'event', 'dependency']);
const LAYOUTS = new Set(['auto', 'down', 'right', 'orthogonal']);
const ID = /^[a-z][a-z0-9-]{0,31}$/u;

const STRINGS = {
  en: { script: 'The whole run, second by second', at: 'At', where: 'Where', what: 'What happens' },
  ru: { script: 'Весь сценарий по секундам', at: 'Время', where: 'Где', what: 'Что происходит' },
};

function fail(message) {
  process.stderr.write(`theatre-script: ${message}\n`);
  process.exit(1);
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    fail('the build did not pass a JSON request on standard input.');
  }
}

function readScenario(request, name) {
  const data = request.data ?? {};
  if (!Object.hasOwn(data, name))
    fail(
      `the page declares no data file named ${name}; add ${name}.json to data in the page frontmatter.`,
    );
  return data[name];
}

function text(value, where, max = 400) {
  if (typeof value !== 'string' || value.trim() === '')
    fail(`${where} must be a non-empty string.`);
  if (value.length > max) fail(`${where} is longer than ${max} characters.`);
  return value.trim();
}

function optionalText(value, where, max) {
  return value === undefined ? undefined : text(value, where, max);
}

function validate(scenario, file) {
  if (scenario === null || typeof scenario !== 'object' || Array.isArray(scenario))
    fail(`${file} must hold one JSON object.`);
  const title = text(scenario.title, 'title', 200);
  const description = text(scenario.description, 'description', 300);
  const origin = text(scenario.origin, 'origin', 500);
  const layout = scenario.layout ?? 'auto';
  if (!LAYOUTS.has(layout)) fail(`layout must be one of ${[...LAYOUTS].join(', ')}.`);
  if (!Array.isArray(scenario.panels) || scenario.panels.length < 2 || scenario.panels.length > 8)
    fail('panels must list from two to eight panels of the product.');
  const panels = scenario.panels.map((panel, index) => {
    const where = `panels[${index}]`;
    if (typeof panel?.id !== 'string' || !ID.test(panel.id))
      fail(`${where}.id must be a short lowercase id such as "terminal".`);
    const kind = panel.kind ?? 'neutral';
    if (!PANEL_KINDS.has(kind))
      fail(`${where}.kind must be one of ${[...PANEL_KINDS].join(', ')}.`);
    return {
      id: panel.id,
      label: text(panel.label, `${where}.label`, 80),
      detail: optionalText(panel.detail, `${where}.detail`, 120),
      kind,
      meaning: kind === 'neutral' ? undefined : text(panel.meaning, `${where}.meaning`, 120),
    };
  });
  const ids = new Set(panels.map((panel) => panel.id));
  if (ids.size !== panels.length) fail('two panels share one id.');
  const links = (scenario.links ?? []).map((link, index) => {
    const where = `links[${index}]`;
    for (const end of ['from', 'to'])
      if (!ids.has(link?.[end])) fail(`${where}.${end} names no panel.`);
    const kind = link.kind ?? 'call';
    if (!LINK_KINDS.has(kind)) fail(`${where}.kind must be one of ${[...LINK_KINDS].join(', ')}.`);
    return {
      from: link.from,
      to: link.to,
      label: optionalText(link.label, `${where}.label`, 120),
      kind,
    };
  });
  if (
    !Array.isArray(scenario.events) ||
    scenario.events.length < MIN_EVENTS ||
    scenario.events.length > MAX_EVENTS
  )
    fail(
      `events must list from ${MIN_EVENTS} to ${MAX_EVENTS} events; split a longer run into two scenes.`,
    );
  let previous = -1;
  const events = scenario.events.map((event, index) => {
    const where = `events[${index}]`;
    if (typeof event?.at !== 'number' || !Number.isFinite(event.at) || event.at < 0)
      fail(`${where}.at must be the second of the run, a number from 0.`);
    if (event.at < previous) fail(`${where}.at goes back in time; list events in order.`);
    previous = event.at;
    if (!Array.isArray(event.panels) || event.panels.length === 0)
      fail(`${where}.panels must name the panels the event touches.`);
    for (const id of event.panels)
      if (!ids.has(id)) fail(`${where}.panels names "${id}", which is no panel.`);
    return {
      at: event.at,
      title: text(event.title, `${where}.title`, 120),
      panels: event.panels,
      text: text(event.text, `${where}.text`, 1200),
      code: optionalText(event.code, `${where}.code`, 2000),
      language: optionalText(event.language, `${where}.language`, 20),
    };
  });
  return { title, description, origin, layout, panels, links, events };
}

/** A value inside a quoted directive attribute: character references cannot close the value. */
function attribute(value) {
  return value.replace(/[&"'{}<>\r\n]/gu, (character) => `&#${character.codePointAt(0)};`);
}

/** Plain text inside Markdown: every ASCII punctuation character is escaped. */
function plain(value) {
  return value.replace(/\s+/gu, ' ').replace(/[!-/:-@[-`{-~]/gu, (character) => `\\${character}`);
}

/** The second of the run as the reader reads it: `0.6 s`, `18 s`, `2:05` (a comma in Russian). */
function clock(seconds, language) {
  if (seconds >= 60) {
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  const rounded = Math.round(seconds * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return language === 'ru' ? `${value.replace('.', ',')} с` : `${value} s`;
}

function fence(code, language) {
  const longest = Math.max(2, ...[...code.matchAll(/`+/gu)].map((match) => match[0].length));
  const marks = '`'.repeat(longest + 1);
  return `${marks}${language ?? ''}\n${code}\n${marks}`;
}

function scene(scenario, language) {
  const lines = [
    `:::diagram{title="${attribute(scenario.title)}" description="${attribute(scenario.description)}" layout="${scenario.layout}"}`,
  ];
  for (const panel of scenario.panels) {
    const detail = panel.detail === undefined ? '' : ` detail="${attribute(panel.detail)}"`;
    const kind = panel.kind === 'neutral' ? '' : ` kind="${panel.kind}"`;
    lines.push(`::node{id="${panel.id}" label="${attribute(panel.label)}"${detail}${kind}}`);
  }
  for (const link of scenario.links) {
    const label = link.label === undefined ? '' : ` label="${attribute(link.label)}"`;
    lines.push(`::edge{from="${link.from}" to="${link.to}"${label} kind="${link.kind}"}`);
  }
  const meanings = new Map();
  for (const panel of scenario.panels)
    if (panel.meaning !== undefined && !meanings.has(panel.kind))
      meanings.set(panel.kind, panel.meaning);
  for (const [kind, meaning] of meanings)
    lines.push(`::legend-item{node="${kind}" label="${attribute(meaning)}"}`);
  lines.push(':::', '');
  for (const event of scenario.events) {
    lines.push(
      `:::beat{title="${attribute(`${clock(event.at, language)} · ${event.title}`)}" focus="${event.panels.join(', ')}"}`,
    );
    if (event.code !== undefined) lines.push(fence(event.code, event.language), '');
    lines.push(event.text, ':::', '');
  }
  return lines.join('\n');
}

function script(scenario, language) {
  const strings = STRINGS[language] ?? STRINGS.en;
  const labels = new Map(scenario.panels.map((panel) => [panel.id, panel.label]));
  const cell = (value) => plain(value).replace(/\|/gu, '\\|');
  const rows = scenario.events.map(
    (event) =>
      `| ${clock(event.at, language)} | ${event.panels.map((id) => cell(labels.get(id))).join(', ')} | ${cell(event.title)} |`,
  );
  return [
    `:::disclosure{title="${attribute(strings.script)}"}`,
    `| ${strings.at} | ${strings.where} | ${strings.what} |`,
    '| --- | --- | --- |',
    ...rows,
    '',
    plain(scenario.origin),
    ':::',
    '',
  ].join('\n');
}

const request = readInput();
const { scenario: name, part } = request.attributes ?? {};
const scenario = validate(
  readScenario(request, text(name, 'the scenario attribute', 64)),
  `${name}.json`,
);
process.stdout.write(
  part === 'script' ? script(scenario, request.language) : scene(scenario, request.language),
);
