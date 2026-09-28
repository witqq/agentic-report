import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import type { PageSectionStructure, PageStructure } from '../../src/contracts.js';
import { buildReport, inspectReport, validateReport } from '../../src/index.js';
import {
  CHECKED_RULES,
  checkDesign,
  parseSwitchedOff,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/design-rules.mjs';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const run = promisify(execFile);
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(name: string): Promise<string> {
  const created = await createTestWorkspace(name);
  workspaces.push(created);
  return created;
}

interface Advice {
  readonly rule: string;
  readonly message: string;
  readonly fix: string;
}
interface CheckResult {
  readonly advice: readonly Advice[];
  readonly switchedOff: readonly { rule: string; reason: string }[];
  readonly rejectedSwitches: readonly { rule: string; problem: string }[];
}
const check = checkDesign as (input: {
  structure: PageStructure;
  starterRecipes?: readonly string[];
  isStarter?: boolean;
  brief: { present: boolean; text?: string };
}) => CheckResult;

const noMedia = { images: 0, videos: 0, diagrams: 0, charts: 0, timelines: 0, code: 0 };
function section(overrides: Partial<PageSectionStructure> = {}): PageSectionStructure {
  return {
    depth: 0,
    recipe: null,
    place: 'flow',
    surface: 'plain',
    transition: 'none',
    scene: 'none',
    interaction: 'none',
    choreography: 'none',
    media: noMedia,
    ...overrides,
  };
}
function page(overrides: Partial<PageStructure> = {}): PageStructure {
  return {
    layout: 'document',
    motion: 'expressive',
    beforeFirstSection: noMedia,
    sections: [section(), section(), section()],
    magneticActions: 0,
    movingElements: 0,
    cardGroups: [],
    ...overrides,
  };
}
const FILLED_BRIEF =
  '# Brief\n\n| Dimension | Question | Answer | Source |\n| --- | --- | --- | --- |\n| `audience` | Who reads it? | Field technicians. | asked |\n';
const clean = { structure: page(), brief: { present: true, text: FILLED_BRIEF } };
const starterRecipes = ['demo', 'hero', 'story', 'evidence', 'hero'];

/** Для каждого правила — строение, на котором оно срабатывает, и больше ни одно. */
const triggers: Record<string, Parameters<typeof check>[0]> = {
  'DR-OPENING-MEDIA': {
    ...clean,
    structure: page({ layout: 'landing', sections: [section({ recipe: 'hero' })] }),
  },
  'DR-LANDING-ORDER': {
    ...clean,
    starterRecipes,
    structure: page({
      layout: 'landing',
      beforeFirstSection: { ...noMedia, images: 1 },
      sections: starterRecipes.map((recipe) => section({ recipe })),
    }),
  },
  'DR-SURFACES': {
    ...clean,
    structure: page({
      sections: [
        section({ surface: 'tint' }),
        section({ surface: 'grain' }),
        section({ surface: 'grid' }),
      ],
    }),
  },
  'DR-UNIFORM-ENTRANCE': {
    ...clean,
    structure: page({ sections: [1, 2, 3].map(() => section({ transition: 'reveal' })) }),
  },
  'DR-ONE-EFFECT': {
    ...clean,
    structure: page({ sections: [section({ interaction: 'depth' })], magneticActions: 1 }),
  },
  'DR-CARD-SAMENESS': {
    ...clean,
    structure: page({ cardGroups: [{ cards: 8, shapes: 1, plain: 8, linked: 0 }] }),
  },
  'DR-BRIEF': { ...clean, brief: { present: false } },
  'DR-BRIEF-MATCH': {
    structure: page({ sections: [section({ transition: 'reveal' }), section(), section()] }),
    brief: {
      present: true,
      text: `${FILLED_BRIEF}| \`motion\` | How much motion? | None. | asked |\n`,
    },
  },
};

describe('design check', () => {
  it('implements exactly the rules marked checked in the knowledge base', async () => {
    const rules = await readFile('skills/agentic-report/references/design-rules.md', 'utf8');
    const marked = [...rules.matchAll(/^### (DR-[A-Z0-9-]+) — .*· checked$/gmu)].map(
      (match) => match[1],
    );
    expect([...CHECKED_RULES].sort()).toEqual(marked.sort());
    expect(Object.keys(triggers).sort()).toEqual([...CHECKED_RULES].sort());
    for (const rule of CHECKED_RULES as readonly string[]) {
      expect(rules, rule).toContain(`### ${rule} — `);
    }
  });

  it('gives no advice on a clean structure', () => {
    expect(check(clean).advice).toEqual([]);
  });

  for (const [rule, input] of Object.entries(triggers)) {
    it(`raises ${rule} with a fix, and a brief line with a reason switches it off`, () => {
      const raised = check(input);
      expect(raised.advice.map((entry) => entry.rule)).toEqual([rule]);
      expect(raised.advice[0]?.fix.length).toBeGreaterThan(20);

      const briefText = `${FILLED_BRIEF}\n## Checks switched off\n\n- ${rule}: the page does this on purpose.\n`;
      const off = check({ ...input, brief: { present: true, text: briefText } });
      if (rule === 'DR-BRIEF') {
        // Без брифа нечем и отключать: правило про сам бриф отключается только его появлением.
        expect(off.advice).toEqual([]);
      } else {
        expect(off.advice).toEqual([]);
        expect(off.switchedOff).toEqual([{ rule, reason: 'the page does this on purpose.' }]);
      }
    });
  }

  it('refuses a switch-off without a reason or for an unknown rule', () => {
    const parsed = parseSwitchedOff(
      '## Checks switched off\n\n- DR-SURFACES\n- DR-NOT-A-RULE: because\n- `DR-ONE-EFFECT`: the hero is the product.\n',
    ) as { switchedOff: unknown[]; rejected: unknown[] };
    expect(parsed.switchedOff).toEqual([
      { rule: 'DR-ONE-EFFECT', reason: 'the hero is the product.' },
    ]);
    expect(parsed.rejected).toEqual([
      { rule: 'DR-SURFACES', problem: 'no reason given' },
      { rule: 'DR-NOT-A-RULE', problem: 'not a checked rule' },
    ]);
    const input = triggers['DR-SURFACES'];
    if (input === undefined) throw new Error('missing trigger');
    const kept = check({
      ...input,
      brief: { present: true, text: `${FILLED_BRIEF}\n## Checks switched off\n\n- DR-SURFACES\n` },
    });
    expect(kept.advice.map((entry) => entry.rule)).toEqual(['DR-SURFACES']);
  });

  it('raises DR-BRIEF for a brief whose dimension rows are left empty', () => {
    const brief = [
      '| Dimension | Question | Answer | Source |',
      '| --- | --- | --- | --- |',
      '| `audience` | Who reads it? | Field technicians. | asked |',
      '| `motion` | How much motion? | | |',
      '| `language` | Which languages? | English. | guessed |',
    ].join('\n');
    const result = check({ ...clean, brief: { present: true, text: brief } });
    expect(result.advice.map((entry) => entry.rule)).toEqual(['DR-BRIEF']);
    expect(result.advice[0]?.message).toContain('motion, language');
  });

  it('raises DR-BRIEF for a brief with no dimension rows at all', () => {
    const result = check({ ...clean, brief: { present: true, text: '# Brief\n' } });
    expect(result.advice.map((entry) => entry.rule)).toEqual(['DR-BRIEF']);
    expect(result.advice[0]?.message).toContain('no dimension rows');
  });

  it('keeps DR-CARD-SAMENESS quiet for short groups, mixed forms and an index of links', () => {
    for (const group of [
      { cards: 7, shapes: 1, plain: 7, linked: 0 },
      { cards: 9, shapes: 2, plain: 8, linked: 0 },
      { cards: 9, shapes: 1, plain: 9, linked: 9 },
    ])
      expect(check({ ...clean, structure: page({ cardGroups: [group] }) }).advice).toEqual([]);
  });

  it('keeps DR-BRIEF-MATCH quiet when the page stops its motion or the brief allows it', () => {
    const input = triggers['DR-BRIEF-MATCH'];
    if (input === undefined) throw new Error('missing trigger');
    expect(check({ ...input, structure: { ...input.structure, motion: 'none' } }).advice).toEqual(
      [],
    );
    expect(check({ ...input, structure: page() }).advice).toEqual([]);
    const restrained = (input.brief.text ?? '').replace('None.', 'None beyond package defaults.');
    expect(check({ ...input, brief: { present: true, text: restrained } }).advice).toEqual([]);
  });

  it('counts moving elements outside the section roles against a brief that decides no motion', async () => {
    // Ловит: `:count`, проигрываемая сцена, прорисовка схемы, замена и набор слова проходят мимо
    // DR-BRIEF-MATCH — правило видит только роли секций и магнит.
    const input = triggers['DR-BRIEF-MATCH'];
    if (input === undefined) throw new Error('missing trigger');
    const still = page();
    expect(check({ ...input, structure: { ...still, movingElements: 1 } }).advice).toEqual([
      expect.objectContaining({ rule: 'DR-BRIEF-MATCH' }),
    ]);
    const root = await workspace('design-check-moving');
    await writeFile(
      path.join(root, 'report.md'),
      [
        '---',
        'title: Moving',
        '---',
        '',
        '# Moving',
        '',
        'We read :count[12] files; it is :swap[faster]{words="calmer"}; type :typing[agentic-report build].',
        '',
        '::::diagram{title="Path" description="Two steps." draw="scroll"}',
        '::node{id="a" label="A"}',
        '::node{id="b" label="B"}',
        '::edge{from="a" to="b"}',
        '::::',
        '',
      ].join('\n'),
    );
    const inspected = await inspectReport({ input: root });
    expect(inspected.structure.movingElements).toBe(4);
  });

  it('inspect counts card forms without reading the cards words', async () => {
    const root = await workspace('design-check-cards');
    const cards = (count: number, body: (index: number) => string) =>
      Array.from({ length: count }, (_, index) => index + 1)
        .map((index) => `:::card{title="Card ${index}"}\n${body(index)}\n:::`)
        .join('\n\n');
    await writeFile(
      path.join(root, 'report.md'),
      `---\ntitle: Cards\n---\n\n# Cards\n\n::::cards{title="Plain"}\n${cards(8, () => 'One sentence.')}\n::::\n\n::::cards{title="Facts"}\n${cards(3, (index) => (index === 1 ? '- a\n- b' : 'One sentence.\n\nAnother.'))}\n::::\n`,
    );
    const inspected = await inspectReport({ input: root });
    expect(inspected.structure.cardGroups).toEqual([
      { cards: 8, shapes: 1, plain: 8, linked: 0 },
      { cards: 3, shapes: 2, plain: 0, linked: 0 },
    ]);
    expect(inspected.structure.motion).toBe('expressive');
    expect(
      check({
        structure: inspected.structure,
        brief: { present: true, text: FILLED_BRIEF },
      }).advice.map((entry) => entry.rule),
    ).toEqual(['DR-CARD-SAMENESS']);
  });

  it('skips the starter order rule for the landing starter itself', () => {
    const input = triggers['DR-LANDING-ORDER'];
    if (input === undefined) throw new Error('missing trigger');
    expect(check({ ...input, isStarter: true }).advice).toEqual([]);
  });

  it('gives the same advice when the author text changes and the structure does not', async () => {
    const root = await workspace('design-check-invariance');
    const source = (words: readonly string[]) => `---
title: ${words[0]}
layout: landing
---

# ${words[0]}

${words[1]} ${words[2]}.

::::section{title="${words[3]}" id="one" recipe="hero" surface="tint"}
${words[4]} ${words[5]}.
::::

::::section{title="${words[6]}" id="two" recipe="evidence" surface="grain" interaction="tilt"}
${words[7]}.

![${words[8]}](shot.svg)
::::

::::section{title="${words[9]}" id="three" recipe="rail" surface="grid"}
${words[10]} ${words[11]}.
::::
`;
    await writeFile(
      path.join(root, 'shot.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><title>shot</title></svg>',
    );
    const first = 'Harbour Ledger Tide Anchor Rope Signal Beacon Keel Mast Sail Hull Deck'.split(
      ' ',
    );
    const second = 'Прилив Карта Ветер Компас Узел Маяк Буй Штурвал Якорь Трюм Мачта Порт'.split(
      ' ',
    );
    const results: CheckResult[] = [];
    for (const words of [first, second]) {
      await writeFile(path.join(root, 'report.md'), source(words));
      const inspected = await inspectReport({ input: root });
      results.push(
        check({ structure: inspected.structure, brief: { present: true, text: FILLED_BRIEF } }),
      );
    }
    expect(results[0]?.advice.map((entry) => entry.rule)).toEqual([
      'DR-OPENING-MEDIA',
      'DR-SURFACES',
    ]);
    expect(results[1]).toEqual(results[0]);
  });

  it('inspect reports the structure the check reads, without the author text', async () => {
    const inspected = await inspectReport({ input: path.resolve('examples/landing') });
    const structure = inspected.structure;
    expect(structure.layout).toBe('landing');
    expect(structure.sections[0]).toMatchObject({
      depth: 0,
      recipe: 'demo',
      place: 'opening',
      media: { code: 1 },
    });
    expect(structure.magneticActions).toBeGreaterThan(0);
    const serialized = JSON.stringify(structure);
    for (const authored of ['Source and result', 'workflow', 'Markdown', 'demo-title']) {
      expect(serialized).not.toContain(authored);
    }
  });

  it('runs end to end through inspect and reads the brief beside the entry', async () => {
    const root = await workspace('design-check-script');
    await writeFile(
      path.join(root, 'report.md'),
      '---\ntitle: Plain\n---\n\n# Plain\n\n::::section{title="A" id="a" surface="tint"}\nText.\n::::\n\n::::section{title="B" id="b" surface="grain"}\nText.\n::::\n\n::::section{title="C" id="c" surface="grid"}\nText.\n::::\n',
    );
    const script = path.resolve('skills/agentic-report/scripts/design-check.mjs');
    const cli = path.resolve('dist/node/cli.js');
    const first = JSON.parse(
      (await run(process.execPath, [script, root, '--cli', cli])).stdout,
    ) as CheckResult & { brief: string | null };
    expect(first.brief).toBeNull();
    expect(first.advice.map((entry) => entry.rule)).toEqual(['DR-SURFACES', 'DR-BRIEF']);

    await writeFile(
      path.join(root, 'brief.md'),
      `${FILLED_BRIEF}\n## Checks switched off\n\n- DR-SURFACES: a catalog of surfaces.\n`,
    );
    const second = JSON.parse(
      (await run(process.execPath, [script, root, '--cli', cli])).stdout,
    ) as CheckResult;
    expect(second.advice).toEqual([]);
  });

  it('uses the agentic-report installed for the page and accepts a CLI path with spaces', async () => {
    const root = await workspace('design-check local cli');
    const page = path.join(root, 'site pages', 'plain');
    await mkdir(page, { recursive: true });
    await writeFile(path.join(page, 'report.md'), '---\ntitle: Plain\n---\n\n# Plain\n\nText.\n');
    // Установленный для проекта пакет: node_modules/.bin/agentic-report выше страницы — это и есть
    // локальная сборка, которой проверка обязана пользоваться вместо опубликованной через npx.
    const bin = path.join(root, 'node_modules', '.bin');
    await mkdir(bin, { recursive: true });
    const marker = path.join(root, 'local-cli-used');
    await writeFile(
      path.join(bin, 'agentic-report'),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.resolve('dist/node/cli.js'))} "$@"\n`,
      { mode: 0o755 },
    );
    const script = path.resolve('skills/agentic-report/scripts/design-check.mjs');
    const local = JSON.parse((await run(process.execPath, [script, page])).stdout) as CheckResult;
    expect(local.advice.map((entry) => entry.rule)).toContain('DR-BRIEF');
    expect(await readFile(marker, 'utf8')).toBe('');

    // Явный путь с пробелом — один путь, а не две части команды.
    const spaced = path.join(root, 'cli copy', 'cli.js');
    await mkdir(path.dirname(spaced), { recursive: true });
    await symlink(path.resolve('dist/node/cli.js'), spaced);
    const explicit = JSON.parse(
      (await run(process.execPath, [script, page, '--cli', spaced])).stdout,
    ) as CheckResult;
    expect(explicit.advice.map((entry) => entry.rule)).toContain('DR-BRIEF');
  });

  it('stays outside the compiler: build and validate never produce design advice', async () => {
    const sources = await readdir('src', { recursive: true });
    for (const file of sources.filter((name) => name.endsWith('.ts'))) {
      const text = await readFile(path.join('src', file), 'utf8');
      // Шаблон брифа называет форму строки отключения (`DR-RULE`), но не правило и не проверку.
      expect(text, file).not.toMatch(/design-check|design-rules/u);
      for (const rule of CHECKED_RULES as readonly string[]) expect(text, file).not.toContain(rule);
    }
    const input = triggers['DR-SURFACES'];
    if (input === undefined) throw new Error('missing trigger');
    const root = await workspace('design-check-boundary');
    await writeFile(
      path.join(root, 'report.md'),
      '---\ntitle: Boundary\n---\n\n# Boundary\n\n::::section{title="A" id="a" surface="tint" transition="reveal"}\nText.\n::::\n\n::::section{title="B" id="b" surface="grain" transition="reveal"}\nText.\n::::\n\n::::section{title="C" id="c" surface="grid" transition="reveal"}\nText.\n::::\n',
    );
    const built = await buildReport({ input: root, output: path.join(root, 'page.html') });
    const validated = await validateReport({ input: root });
    for (const warnings of [built.warnings, validated.warnings]) {
      expect(JSON.stringify(warnings)).not.toMatch(/DR-[A-Z]/u);
    }
  });
});
