#!/usr/bin/env node
// Knowledge at the point of decision, on the agent's side of the boundary: the compiler never runs it.
//
//   node scripts/craft.mjs                     lists the topics
//   node scripts/craft.mjs <topic>             the rules that decide it, e.g. `table`, `landing-first-screen`
//   node scripts/craft.mjs <directive>         where the directive fits and the rules that govern it
//   node scripts/craft.mjs DR-SURFACES         one design rule in full
//   node scripts/craft.mjs PR-DASH             one prose rule, from both language catalogues
//
// Prints Markdown taken from the references as they are now — design-rules.md, prose-ru.md, prose-en.md,
// vocabulary-use.md and catalog.md — so the text an agent reads here is the text of the knowledge base, not
// a copy of it. The topic index below only says which rules belong to which decision. Exits 1 on a topic,
// directive or rule it does not know, after listing what it knows.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKED_RULES as PROSE_CHECKED, catalogueRules } from './prose-check.mjs';
import { CHECKED_RULES as DESIGN_CHECKED } from './design-rules.mjs';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Which rules decide which choice, three to seven each, most costly first. Every `DR-…` rule of
 * design-rules.md belongs to at least one topic (tests/unit/skill-craft.test.ts holds this).
 */
export const TOPICS = {
  'landing-first-screen': {
    about: 'the first screen of a landing: title, product, navigation',
    rules: [
      'DR-OPENING-MEDIA',
      'DR-NAV-ABOVE-TITLE',
      'DR-MAIN-SCENE-SIZE',
      'DR-REAL-MATERIAL',
      'DR-HEADING-HIERARCHY',
      'DR-TIGHT-TRACKING',
    ],
  },
  landing: {
    about: 'a landing page as a whole',
    rules: [
      'DR-OPENING-MEDIA',
      'DR-LANDING-ORDER',
      'DR-SCENE-CARRIES',
      'DR-CARD-SAMENESS',
      'DR-ONE-EFFECT',
      'DR-PAGE-WEIGHT',
    ],
  },
  table: {
    about: 'a table of values or records',
    rules: [
      'DR-NUMBERS-UNITS',
      'DR-DATA-SLICE',
      'DR-EMPTY-STATE',
      'DR-LINE-LENGTH',
      'DR-CARD-SAMENESS',
    ],
    measures: ['tables.wide', 'tables.sparse', 'tables.deadSurface'],
  },
  numbers: {
    about: 'figures, counts and data taken from an export',
    rules: [
      'DR-NUMBERS-UNITS',
      'DR-DATA-SLICE',
      'DR-HEADING-COUNT',
      'DR-NAME-NOT-COUNT',
      'DR-PROCESS-FROM-DATA',
      'DR-EMPTY-STATE',
    ],
  },
  dashboard: {
    about: 'a dashboard of statuses and signals',
    rules: [
      'DR-SIGNAL-COLOUR',
      'DR-NUMBERS-UNITS',
      'DR-DATA-SLICE',
      'DR-NOT-YET',
      'DR-HEADING-HIERARCHY',
      'DR-CARD-SAMENESS',
    ],
  },
  diagram: {
    about: 'a diagram, a process drawing or a figure with labels',
    rules: [
      'DR-PROCESS-FROM-DATA',
      'DR-FIGURE-TEXT',
      'DR-ONE-COORDINATE-SPACE',
      'DR-MOTION-MEANING',
      'DR-CAPTIONS',
    ],
    measures: ['diagramLabels'],
  },
  media: {
    about: 'screenshots, pictures and clips',
    rules: ['DR-REAL-MATERIAL', 'DR-CAPTIONS', 'DR-PRIVACY', 'DR-FIGURE-TEXT', 'DR-PAGE-WEIGHT'],
    measures: ['offSchemeBlocks'],
  },
  colour: {
    about: 'colour, contrast and the theme',
    rules: [
      'DR-ONE-ACCENT',
      'DR-CONTRAST',
      'DR-BLOBS',
      'DR-SIGNAL-COLOUR',
      'DR-NOT-YET',
      'DR-TIGHT-TRACKING',
    ],
  },
  surface: {
    about: 'section surfaces, backdrops and layers over a canvas',
    rules: ['DR-SURFACES', 'DR-BLOBS', 'DR-CANVAS-LAYERS', 'DR-CONTRAST'],
  },
  motion: {
    about: 'transitions, scenes, pointer effects and moving elements',
    rules: [
      'DR-MOTION-MEANING',
      'DR-MOTION-ORIGIN',
      'DR-UNIFORM-ENTRANCE',
      'DR-ONE-EFFECT',
      'DR-BRIEF-MATCH',
      'DR-WEBGL-FALLBACK',
    ],
  },
  cards: {
    about: 'a group of cards',
    rules: [
      'DR-CARD-SAMENESS',
      'DR-HEADING-HIERARCHY',
      'DR-HEADING-EMOJI',
      'DR-NUMBERS-UNITS',
      'DR-SIGNAL-COLOUR',
      'DR-EMPTY-STATE',
    ],
  },
  typography: {
    about: 'type, headings and reading measure',
    rules: [
      'DR-LINE-LENGTH',
      'DR-HEADING-HIERARCHY',
      'DR-TIGHT-TRACKING',
      'DR-RU-TYPOGRAPHY',
      'DR-CONTRAST',
    ],
  },
  phone: {
    about: 'what a reader on a phone meets',
    rules: ['DR-MAIN-SCENE-SIZE', 'DR-FIGURE-TEXT', 'DR-LINE-LENGTH', 'DR-CANVAS-LAYERS'],
    measures: ['readingColumn', 'codeBreaks', 'tables.wide'],
  },
  effect: {
    about: 'an extension effect, WebGL or a canvas',
    rules: [
      'DR-ONE-EFFECT',
      'DR-WEBGL-FALLBACK',
      'DR-CANVAS-LAYERS',
      'DR-MOTION-MEANING',
      'DR-ONE-COORDINATE-SPACE',
      'DR-PAGE-WEIGHT',
    ],
  },
  claims: {
    about: 'what the page says about a product or a run',
    rules: [
      'DR-EXAMPLE-SCOPE',
      'DR-HEADING-COUNT',
      'DR-NAME-NOT-COUNT',
      'DR-DATA-SLICE',
      'DR-PRIVACY',
    ],
  },
  brief: {
    about: 'the brief and what the page decided',
    rules: ['DR-BRIEF', 'DR-BRIEF-MATCH', 'DR-PRIVACY', 'DR-HEADING-COUNT'],
  },
  headings: {
    about: 'page and chapter titles',
    rules: [
      'DR-HEADING-HIERARCHY',
      'DR-HEADING-COUNT',
      'DR-NAV-ABOVE-TITLE',
      'DR-HEADING-EMOJI',
      'PR-HEADING-ECHO',
      'PR-HEADING-STYLE',
    ],
  },
  'prose-ru': {
    about: 'Russian prose: the hard bans and the most frequent signs',
    rules: [
      'PR-NOT-X-BUT-Y',
      'PR-DASH',
      'PR-SIGNS',
      'PR-COPULA',
      'PR-MODEL-WORDS',
      'PR-SALES',
      'PR-NOMINAL',
    ],
  },
  'prose-en': {
    about: 'English prose: the patterns that survive a rewrite',
    rules: [
      'PR-NOT-X-BUT-Y',
      'PR-CLOSER',
      'PR-DASH',
      'PR-TRIAD',
      'PR-MODEL-WORDS',
      'PR-SALES',
      'PR-RIDER',
    ],
  },
};

/** Directive and word aliases: a directive name leads to the topic that governs it. */
const ALIASES = {
  prose: 'prose-en',
  'prose-russian': 'prose-ru',
  typography: 'typography',
  type: 'typography',
  'first-screen': 'landing-first-screen',
  hero: 'landing-first-screen',
  demo: 'landing-first-screen',
  numbers: 'numbers',
  data: 'numbers',
  each: 'numbers',
  expect: 'numbers',
  count: 'numbers',
  plural: 'numbers',
  'source-line': 'numbers',
  metrics: 'numbers',
  chart: 'dashboard',
  card: 'cards',
  statuses: 'dashboard',
  timeline: 'diagram',
  figure: 'diagram',
  image: 'media',
  video: 'media',
  compare: 'media',
  gallery: 'media',
  screenshot: 'media',
  color: 'colour',
  theme: 'colour',
  contrast: 'colour',
  backdrop: 'surface',
  section: 'surface',
  transition: 'motion',
  scene: 'motion',
  interaction: 'motion',
  choreography: 'motion',
  appear: 'motion',
  mobile: 'phone',
  webgl: 'effect',
  extension: 'effect',
  privacy: 'claims',
  facts: 'claims',
  heading: 'headings',
  title: 'headings',
};

// ---------------------------------------------------------------------------------------------------------
// Reading the references.
// ---------------------------------------------------------------------------------------------------------

/** Design rules of design-rules.md: statement, kind, reason, fix and the whole section. */
export function designRuleSections(text) {
  const rules = new Map();
  const parts = text.split(/^### /mu).slice(1);
  for (const part of parts) {
    const [heading, ...body] = part.split('\n');
    const match = /^(DR-[A-Z0-9-]+) — (.+?)(?: · ([a-z ]+))?$/u.exec(heading);
    if (match === null) continue;
    const bodyText = body.join('\n').split(/^## /mu)[0].trim();
    const paragraphs = bodyText.split(/\n(?=Counterexample: |A second counterexample: |Fix: )/u);
    const fix = paragraphs.find((paragraph) => paragraph.startsWith('Fix: ')) ?? '';
    rules.set(match[1], {
      statement: match[2],
      kind: match[3] ?? 'judgement',
      reason: paragraphs[0]?.replace(/\n/gu, ' ') ?? '',
      fix: fix.replace(/\n/gu, ' '),
      section: `### ${heading}\n${bodyText}`,
    });
  }
  return rules;
}

/** The one-line description of each directive in catalog.md. */
export function catalogDirectives(text) {
  const directives = new Map();
  for (const match of text.matchAll(/^### `([a-z][a-z0-9-]*)`\n\n(.+)$/gmu))
    directives.set(match[1], match[2]);
  return directives;
}

/** Table rows of vocabulary-use.md that name the directive in code, with their header row. */
export function vocabularyRows(text, name) {
  const found = [];
  let header;
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('|')) {
      header = undefined;
      continue;
    }
    if (header === undefined) {
      header = line;
      continue;
    }
    if (/^\s*\|[\s:|-]+\|\s*$/u.test(line)) continue;
    const named = new RegExp(`\`${name}(?:[\\s=\`{]|$)`, 'u');
    if (named.test(line)) found.push({ header, row: line });
  }
  return found;
}

/** A section of vocabulary-use.md whose heading names the directive, such as «Choose a table layout». */
export function vocabularySection(text, name) {
  const sections = text.split(/^(?=## )/mu);
  const section = sections.find((part) =>
    new RegExp(`^## .*\\b${name}\\b`, 'iu').test(part.split('\n')[0]),
  );
  if (section === undefined) return undefined;
  // Up to the end of its first table: the choice, not every detail after it.
  const lines = section.trim().split('\n');
  const first = lines.findIndex((line) => line.startsWith('|'));
  if (first === -1) return lines.slice(0, 12).join('\n');
  let end = first;
  while (end < lines.length && lines[end].startsWith('|')) end += 1;
  return lines.slice(0, end).join('\n');
}

/** The bullet of process.md that explains one measure field of `snapshot --measure`. */
export function measureBullet(text, field) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`- \`${field}\``));
  if (start === -1) return undefined;
  const bullet = [lines[start]];
  for (let index = start + 1; index < lines.length && /^\s{2}\S/u.test(lines[index]); index += 1)
    bullet.push(lines[index].trim());
  return bullet.join(' ').replace(/^- /u, '');
}

export async function loadKnowledge() {
  const read = (name) => readFile(path.join(skillRoot, 'references', name), 'utf8');
  const [design, ru, en, vocabulary, catalog, processText] = await Promise.all([
    read('design-rules.md'),
    read('prose-ru.md'),
    read('prose-en.md'),
    read('vocabulary-use.md'),
    read('catalog.md'),
    read('process.md'),
  ]);
  return {
    design: designRuleSections(design),
    prose: catalogueRules(ru, en),
    vocabulary,
    directives: catalogDirectives(catalog),
    processText,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------------------------------------

function designCheckState(id) {
  return DESIGN_CHECKED.includes(id) ? 'found by design-check.mjs' : undefined;
}

function proseState(id) {
  const languages = ['ru', 'en'].filter((language) => PROSE_CHECKED[language].includes(id));
  return languages.length === 0
    ? 'judgement: prose-check.mjs does not find it, read for it'
    : `found by prose-check.mjs in ${languages.join(' and ')}`;
}

function short(knowledge, id) {
  const design = knowledge.design.get(id);
  if (design !== undefined) {
    const state = designCheckState(id);
    return `- \`${id}\` — ${design.statement} (${design.kind}${state === undefined ? '' : `; ${state}`}). ${design.fix}`;
  }
  const prose = knowledge.prose.get(id);
  if (prose !== undefined) {
    const entry = (prose.en ?? prose.ru ?? '').replace(/^(?:[-*]|\d+\.)\s+`PR-[A-Z-]+`\s*/u, '');
    return `- \`${id}\` — ${entry} (${proseState(id)})`;
  }
  return `- \`${id}\` — not in the references`;
}

export function renderRule(knowledge, id) {
  const design = knowledge.design.get(id);
  if (design !== undefined) {
    const state = designCheckState(id);
    return [
      design.section,
      '',
      state === undefined
        ? 'No script finds this rule: judge it on the page and in the snapshots.'
        : `The check: ${state}; switch it off only in brief.md with the reason.`,
      `Source: references/design-rules.md.`,
    ].join('\n');
  }
  const prose = knowledge.prose.get(id);
  if (prose !== undefined) {
    const lines = [`## ${id}`, ''];
    if (prose.ru !== undefined) lines.push(`Russian (references/prose-ru.md): ${prose.ru}`, '');
    if (prose.en !== undefined) lines.push(`English (references/prose-en.md): ${prose.en}`, '');
    lines.push(
      `The check: ${proseState(id)}. A deliberate use is recorded in brief.md under «Checks switched off»: \`- ${id} <file>:<line>: reason\`.`,
    );
    return lines.join('\n');
  }
  return undefined;
}

export function renderTopic(knowledge, name) {
  const topic = TOPICS[name];
  const lines = [`## ${name} — ${topic.about}`, ''];
  lines.push(...topic.rules.map((id) => short(knowledge, id)));
  for (const field of topic.measures ?? []) {
    const bullet = measureBullet(knowledge.processText, field);
    if (bullet !== undefined) lines.push(`- \`snapshot --measure\` ${bullet}`);
  }
  lines.push('', `A rule in full: node scripts/craft.mjs <rule-id>.`);
  return lines.join('\n');
}

export function renderDirective(knowledge, name) {
  const description = knowledge.directives.get(name);
  const rows = vocabularyRows(knowledge.vocabulary, name);
  const section = vocabularySection(knowledge.vocabulary, name);
  if (description === undefined && rows.length === 0 && section === undefined) return undefined;
  const lines = [`## \`${name}\``, ''];
  if (description !== undefined) lines.push(description, '');
  if (section !== undefined)
    lines.push(`From references/vocabulary-use.md:`, '', section.replace(/^## /u, '### '), '');
  if (rows.length > 0) {
    lines.push('Where it fits (references/vocabulary-use.md):', '');
    let lastHeader;
    for (const { header, row } of rows.slice(0, 6)) {
      if (header !== lastHeader) lines.push(header);
      lastHeader = header;
      lines.push(row);
    }
    lines.push('');
  }
  const topic = ALIASES[name] ?? (TOPICS[name] === undefined ? undefined : name);
  if (topic !== undefined) lines.push(renderTopic(knowledge, topic));
  else lines.push('Attributes and values: references/catalog.md.');
  return lines.join('\n');
}

export function renderIndex() {
  return [
    'Topics:',
    '',
    ...Object.entries(TOPICS).map(([name, topic]) => `- ${name} — ${topic.about}`),
    '',
    'Also a directive name (table, chart, diagram, video, card, section …), a DR-… or a PR-… rule id.',
  ].join('\n');
}

export function craft(knowledge, query) {
  const key = query.trim();
  if (/^(?:DR|PR)-[A-Z0-9-]+$/u.test(key)) return renderRule(knowledge, key);
  const lower = key.toLowerCase();
  if (TOPICS[lower] !== undefined) {
    // A topic that is also a directive shows where the directive fits first.
    return knowledge.directives.has(lower)
      ? renderDirective(knowledge, lower)
      : renderTopic(knowledge, lower);
  }
  const direct = renderDirective(knowledge, lower);
  if (direct !== undefined) return direct;
  if (ALIASES[lower] !== undefined) return renderTopic(knowledge, ALIASES[lower]);
  return undefined;
}

async function main([query]) {
  if (query === undefined) {
    process.stdout.write(`${renderIndex()}\n`);
    return;
  }
  const text = craft(await loadKnowledge(), query);
  if (text === undefined) {
    process.stderr.write(
      `craft.mjs knows no topic, directive or rule «${query}».\n\n${renderIndex()}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${text}\n`);
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
