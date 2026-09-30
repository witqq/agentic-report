/**
 * Catches knowledge an agent cannot reach at the point of decision: a design rule no topic of
 * `craft.mjs` leads to, a topic that names a rule the references do not define, a rule id or directive
 * the script cannot print. The last test plants an unknown rule in a topic and proves the coverage check
 * turns red on it.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  TOPICS,
  craft,
  loadKnowledge,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/craft.mjs';

const run = promisify(execFile);
const script = path.resolve('skills/agentic-report/scripts/craft.mjs');

interface Knowledge {
  readonly design: Map<string, unknown>;
  readonly prose: Map<string, unknown>;
}
type Topics = Record<string, { rules: string[] }>;
const topics = TOPICS as Topics;

/** Rules a topic names that the references do not define. */
function undefinedRules(index: Topics, knowledge: Knowledge): string[] {
  return Object.values(index)
    .flatMap((topic) => topic.rules)
    .filter((id) => !knowledge.design.has(id) && !knowledge.prose.has(id));
}

describe('craft', () => {
  it('leads to every design rule from some topic, and names only rules the references define', async () => {
    const knowledge = (await loadKnowledge()) as Knowledge;
    const rules = await readFile('skills/agentic-report/references/design-rules.md', 'utf8');
    const all = [...rules.matchAll(/^### (DR-[A-Z0-9-]+) — /gmu)].map((match) => match[1]);
    expect(all.length).toBeGreaterThan(30);
    const reached = new Set(Object.values(topics).flatMap((topic) => topic.rules));
    expect(all.filter((id) => !reached.has(id ?? ''))).toEqual([]);
    expect(undefinedRules(topics, knowledge)).toEqual([]);
    for (const [name, topic] of Object.entries(topics)) {
      expect(topic.rules.length, name).toBeGreaterThanOrEqual(3);
      expect(topic.rules.length, name).toBeLessThanOrEqual(7);
    }
  });

  it('prints a rule, a topic and a directive from the references', async () => {
    const knowledge = await loadKnowledge();
    const surfaces = craft(knowledge, 'DR-SURFACES') as string;
    expect(surfaces).toContain('### DR-SURFACES — at most two chapters');
    expect(surfaces).toContain('Counterexample:');
    expect(surfaces).toContain('found by design-check.mjs');
    const dash = craft(knowledge, 'PR-DASH') as string;
    expect(dash).toContain('prose-ru.md');
    expect(dash).toContain('prose-en.md');
    expect(dash).toContain('found by prose-check.mjs in ru and en');
    expect(craft(knowledge, 'PR-SKELETON')).toContain('judgement');
    const table = craft(knowledge, 'table') as string;
    expect(table).toContain('Choose a table layout');
    expect(table).toContain('`DR-NUMBERS-UNITS`');
    expect(table).toContain('tables.wide');
    expect(craft(knowledge, 'landing-first-screen')).toContain('`DR-OPENING-MEDIA`');
    expect(craft(knowledge, 'chart')).toContain('Responsive bar, line, or pie chart');
    expect(craft(knowledge, 'nonsense-topic')).toBeUndefined();
  });

  it('exits 1 and lists the topics for a query it does not know', async () => {
    const listed = await run(process.execPath, [script]);
    expect(listed.stdout).toContain('landing-first-screen');
    await expect(run(process.execPath, [script, 'nonsense-topic'])).rejects.toMatchObject({
      code: 1,
    });
    const known = await run(process.execPath, [script, 'DR-BLOBS']);
    expect(known.stdout).toContain('### DR-BLOBS');
  });

  it('turns red on a planted topic that names a rule nobody defined', async () => {
    const knowledge = (await loadKnowledge()) as Knowledge;
    const planted = { ...topics, planted: { rules: ['DR-SURFACES', 'DR-PLANTED'] } };
    expect(undefinedRules(planted, knowledge)).toEqual(['DR-PLANTED']);
  });
});
