import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { briefDimensionIds } from '../../src/authoring/brief.js';
import { authoringRegistry, PAGE_CATEGORIES } from '../../src/authoring/registry.js';

const skillRoot = path.resolve('skills/agentic-report');
const readSkillFile = (relative: string) => readFile(path.join(skillRoot, relative), 'utf8');

/** Строки Markdown вне огороженных блоков кода. */
function outsideCodeFences(markdown: string): string[] {
  const lines: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker.startsWith(fence)) fence = undefined;
      continue;
    }
    if (fence === undefined) lines.push(line);
  }
  return lines;
}

/** Первая ячейка каждой строки таблиц документа: значения в обратных кавычках. */
function firstColumnEntries(markdown: string): Set<string> {
  const entries = new Set<string>();
  for (const line of outsideCodeFences(markdown)) {
    const cell = /^\|\s*`([^`]+)`\s*\|/u.exec(line)?.[1];
    if (cell !== undefined) entries.add(cell);
  }
  return entries;
}

function enumValues(directive: string, attribute: string): string[] {
  const definition = authoringRegistry.directives.find((entry) => entry.name === directive);
  const constraint = definition?.attributes.find((entry) => entry.name === attribute)?.constraint;
  if (constraint?.kind !== 'enum') throw new Error(`${directive}.${attribute} is not an enum.`);
  return [...constraint.values];
}

const withoutNone = (values: readonly string[]) => values.filter((value) => value !== 'none');

describe('skill knowledge base', () => {
  it('says where every recipe, motion technique, video mode, review tool, and presentation capability fits', async () => {
    const vocabulary = await readSkillFile('references/vocabulary-use.md');
    const entries = firstColumnEntries(vocabulary);
    const pageContract = authoringRegistry.page;
    const expected = [
      ...withoutNone(enumValues('section', 'recipe')),
      ...withoutNone(enumValues('section', 'transition')).map((value) => `transition="${value}"`),
      ...withoutNone(enumValues('section', 'scene')).map((value) => `scene="${value}"`),
      ...withoutNone(enumValues('section', 'interaction')).map((value) => `interaction="${value}"`),
      ...withoutNone(enumValues('section', 'choreography')).map(
        (value) => `choreography="${value}"`,
      ),
      ...withoutNone(enumValues('diagram', 'draw')).map((value) => `draw="${value}"`),
      ':count[…]',
      ...withoutNone(pageContract.progress).map((value) => `progress: ${value}`),
      ...enumValues('video', 'mode').map((value) => `mode="${value}"`),
      'sources',
      'chapters',
      'diff',
      'findings',
      'finding',
      'card status',
      'layout: slides',
      'appear',
      'notes',
      'slide-transition',
      '?view=film',
      '?view=presenter',
    ];
    expect(expected.filter((entry) => !entries.has(entry))).toEqual([]);

    // WebGL remains extension guidance, while the removed built-in is absent from author advice.
    const webglSection = vocabulary.slice(
      vocabulary.indexOf('## WebGL'),
      vocabulary.indexOf('## Video'),
    );
    expect(webglSection).toContain('declared `kind: effect` extension');
    expect(webglSection).toContain('still equivalent');
    expect(webglSection).not.toContain('media-effect="threads"');
  });

  it('gives every design rule an identifier and a counterexample', async () => {
    const rules = await readSkillFile('references/design-rules.md');
    const sections = rules.split(/^### /mu).slice(1);
    expect(sections.length).toBeGreaterThan(10);
    for (const section of sections) {
      const heading = section.split('\n')[0] ?? '';
      expect(heading).toMatch(/^DR-[A-Z0-9-]+ — /u);
      expect(section, heading).toMatch(/^Counterexample: /mu);
      expect(section, heading).toMatch(/^Fix: /mu);
    }
  });

  it('covers every category and subvariant in the playbook, with exemplars as data', async () => {
    const playbook = await readSkillFile('references/playbook.md');
    for (const category of PAGE_CATEGORIES) {
      const heading = playbook
        .split('\n')
        .find((line) => line.startsWith(`## ${category.title} — `));
      expect(heading, category.id).toBeDefined();
      for (const subvariant of category.subvariants) expect(heading).toContain(`\`${subvariant}\``);
    }
    const json = /```json\n([\s\S]*?)\n```/u.exec(
      playbook.slice(playbook.indexOf('## Exemplars')),
    )?.[1];
    const exemplars = (
      JSON.parse(json ?? '{}') as {
        exemplars: { category: string; subvariant: string; example: string }[];
      }
    ).exemplars;
    for (const category of PAGE_CATEGORIES) {
      expect(exemplars.some((entry) => entry.category === category.id)).toBe(true);
    }
    for (const subvariant of [
      'code-review',
      'incident',
      'guide',
      'questions',
      'survey',
      'portfolio',
    ]) {
      expect(
        exemplars.some((entry) => entry.subvariant === subvariant),
        subvariant,
      ).toBe(true);
    }
  });

  it('keeps SKILL.md links inside the skill folder', async () => {
    const skill = await readSkillFile('SKILL.md');
    const links = outsideCodeFences(skill)
      .join('\n')
      .matchAll(/\]\(([^)\s]+)\)/gu);
    const targets = [...links].map((match) => match[1] ?? '');
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target, target).not.toMatch(/^[a-z]+:/iu);
      const resolved = path.resolve(skillRoot, target.split('#')[0] ?? '');
      expect(resolved.startsWith(`${skillRoot}${path.sep}`), target).toBe(true);
      await expect(readFile(resolved)).resolves.toBeDefined();
    }
  });

  it('lists in the process reference exactly the dimensions of every starter brief', async () => {
    const processReference = await readSkillFile('references/process.md');
    const table = new Map<string, { categories: string; question: string }>();
    for (const line of outsideCodeFences(processReference)) {
      const match = /^\s*\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(all|[a-z]+)\s*\|\s*(.+?)\s*\|\s*$/u.exec(
        line,
      );
      if (match?.[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
        table.set(match[1], { categories: match[2], question: match[3] });
      }
    }
    const examples = authoringRegistry.examples.filter((example) => 'starter' in example);
    for (const category of PAGE_CATEGORIES) {
      const starter = examples.find((example) => example.id === category.id);
      expect(starter, category.id).toBeDefined();
      const brief = await readFile(
        path.resolve('examples', starter?.path ?? '', 'brief.md'),
        'utf8',
      );
      const fromSkill = [...table]
        .filter(([, row]) => row.categories === 'all' || row.categories === category.id)
        .map(([id]) => id);
      expect(fromSkill, category.id).toEqual(briefDimensionIds(brief));
      for (const dimension of category.dimensions) {
        expect(table.get(dimension.id)?.question, dimension.id).toBe(dimension.question);
      }
    }
  });

  it('ships every reference the skill names, and names every reference it ships', async () => {
    const skill = await readSkillFile('SKILL.md');
    const shipped = (await readdir(path.join(skillRoot, 'references'))).sort();
    const named = [
      ...new Set([...skill.matchAll(/references\/([a-z0-9-]+\.md)/gu)].map((match) => match[1])),
    ].sort();
    expect(named).toEqual(shipped);
  });
});
