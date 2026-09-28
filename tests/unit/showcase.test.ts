import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { authoringRegistry } from '../../src/authoring/registry.js';
import type { PageStructure } from '../../src/contracts.js';
import { inspectReport } from '../../src/index.js';
import {
  checkDesign,
  unfilledDimensions,
  // @ts-expect-error — модуль скилла написан на JavaScript без объявлений типов.
} from '../../skills/agentic-report/scripts/design-rules.mjs';

interface Exemplar {
  readonly category: string;
  readonly subvariant: string;
  readonly example: string;
}
interface Advice {
  readonly rule: string;
  readonly message: string;
}
const check = checkDesign as (input: {
  structure: PageStructure;
  starterRecipes?: readonly string[];
  isStarter?: boolean;
  brief: { present: boolean; text?: string };
}) => { advice: Advice[]; switchedOff: { rule: string }[]; rejectedSwitches: unknown[] };
const unfilled = unfilledDimensions as (text: string) => string[];

const examplesRoot = path.resolve('examples');
const siteLanding = path.resolve('website/landing');
const MEDIA_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|mp4|m4v|webm|ogv|vtt)$/iu;
const ORIGINS = new Set([
  'build-screenshot',
  'screencast',
  'diagram',
  'photo',
  'drawn',
  'placeholder',
  'generated',
]);

async function exemplars(): Promise<Exemplar[]> {
  const playbook = await readFile('skills/agentic-report/references/playbook.md', 'utf8');
  const json = /```json\n([\s\S]*?)\n```/u.exec(
    playbook.slice(playbook.indexOf('## Exemplars')),
  )?.[1];
  return (JSON.parse(json ?? '{}') as { exemplars: Exemplar[] }).exemplars;
}

/** Каталоги всех страниц витрины: каждый пример пакета и главная сайта. */
function showcasePages(): { readonly id: string; readonly root: string }[] {
  return [
    ...authoringRegistry.examples.map((example) => ({
      id: example.id,
      root: path.join(examplesRoot, example.path),
    })),
    { id: 'site-landing', root: siteLanding },
  ];
}

async function mediaFiles(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await mediaFiles(root, child)));
    else if (MEDIA_FILE.test(entry.name)) found.push(child);
  }
  return found.sort();
}

function mediaRows(
  brief: string,
): Map<string, { origin: string; source: string; licence: string }> {
  const section = brief.slice(
    brief.indexOf('## Media'),
    brief.indexOf('\n## ', brief.indexOf('## Media') + 1),
  );
  const rows = new Map<string, { origin: string; source: string; licence: string }>();
  for (const line of section.split('\n')) {
    const cells = line.split(/(?<!\\)\|/u).map((cell) => cell.trim());
    const file = /^`([^`]+)`$/u.exec(cells[1] ?? '')?.[1];
    if (file === undefined) continue;
    rows.set(file, { origin: cells[2] ?? '', source: cells[3] ?? '', licence: cells[4] ?? '' });
  }
  return rows;
}

async function structureOf(root: string): Promise<{ structure: PageStructure; entryPath: string }> {
  const inspected = await inspectReport({ input: root });
  return { structure: inspected.structure, entryPath: inspected.entryPath };
}

describe('showcase', () => {
  it('has a buildable example with a filled brief for every exemplar the playbook lists', async () => {
    const listed = await exemplars();
    for (const exemplar of listed) {
      const example = authoringRegistry.examples.find((entry) => entry.id === exemplar.example);
      expect(example, exemplar.example).toBeDefined();
      expect(example?.category, exemplar.example).toBe(exemplar.category);
      expect(example?.subvariant, exemplar.example).toBe(exemplar.subvariant);
      const brief = await readFile(
        path.join(examplesRoot, example?.path ?? '', 'brief.md'),
        'utf8',
      );
      expect(unfilled(brief), exemplar.example).toEqual([]);
      expect(brief).toContain(`Category: \`${exemplar.category}\``);
    }
  });

  it('gives no design advice on any example or the main page, and every switch-off has a reason', async () => {
    const starter = authoringRegistry.examples.find((entry) => entry.id === 'landing');
    const starterInspection = await structureOf(path.join(examplesRoot, starter?.path ?? ''));
    const starterRecipes = starterInspection.structure.sections
      .filter((section) => section.depth === 0)
      .map((section) => section.recipe ?? 'none');
    for (const page of showcasePages()) {
      const { structure, entryPath } = await structureOf(page.root);
      const brief = await readFile(path.join(page.root, 'brief.md'), 'utf8');
      const result = check({
        structure,
        starterRecipes,
        isStarter: entryPath === starterInspection.entryPath,
        brief: { present: true, text: brief },
      });
      expect(
        result.advice.map((entry) => `${entry.rule}: ${entry.message}`),
        page.id,
      ).toEqual([]);
      expect(result.rejectedSwitches, page.id).toEqual([]);
    }
    // Каждая страница витрины проходит полную подготовку сборки (схемы, подсветка, разметка), около
    // 0,1 с на страницу: на загруженном параллельном прогоне общий бюджет в 5 с слишком тесен.
  }, 20_000);

  it('records where every picture, clip, and track of the showcase came from', async () => {
    for (const page of showcasePages()) {
      const brief = await readFile(path.join(page.root, 'brief.md'), 'utf8');
      const rows = mediaRows(brief);
      const files = await mediaFiles(page.root);
      expect([...rows.keys()].sort(), page.id).toEqual(files);
      let generated = 0;
      for (const [file, row] of rows) {
        expect(ORIGINS.has(row.origin), `${page.id} ${file}: ${row.origin}`).toBe(true);
        expect(row.source.length, `${page.id} ${file}`).toBeGreaterThan(10);
        expect(row.licence.length, `${page.id} ${file}`).toBeGreaterThan(0);
        await expect(stat(path.join(page.root, file))).resolves.toBeTruthy();
        if (row.origin === 'generated') {
          generated += 1;
          expect(row.source, `${page.id} ${file}`).toMatch(/^reason: /u);
        }
      }
      expect(generated, page.id).toBeLessThanOrEqual(1);
    }
  });

  it('shows three art directions whose recipe orders differ pairwise', async () => {
    const pages = ['cinematic-story', 'executive-brief', 'terminal-portfolio'];
    const directions = await Promise.all(
      pages.map(async (id) => {
        const source = await readFile(path.join(examplesRoot, id, 'report.md'), 'utf8');
        const theme = /^theme:\s*(\S+)/mu.exec(source)?.[1];
        const { structure } = await structureOf(path.join(examplesRoot, id));
        const order = structure.sections
          .filter((section) => section.depth === 0)
          .map((section) => section.recipe ?? 'none')
          .join(',');
        return { id, theme, order };
      }),
    );
    expect(new Set(directions.map((direction) => direction.theme)).size).toBe(3);
    expect(new Set(directions.map((direction) => direction.order)).size).toBe(3);
  });

  it('opens the main page with its product: Markdown source beside what it builds', async () => {
    const { structure } = await structureOf(siteLanding);
    const first = structure.sections[0];
    expect(first).toMatchObject({ recipe: 'demo', place: 'opening' });
    expect(first?.media.images).toBeGreaterThan(0);
    const example = await readFile('examples/incident-review/report.md', 'utf8');
    expect(example).toContain('**18.4% peak failures**');
    for (const entry of ['report.md', 'report.ru.md']) {
      const source = await readFile(path.join(siteLanding, entry), 'utf8');
      const demo = source.slice(
        source.indexOf('id="demo"'),
        source.indexOf('::::::\n', source.indexOf('id="demo"')),
      );
      expect(demo).toContain(
        entry === 'report.md' ? '18.4% peak failures' : '18,4% ошибок на пике',
      );
      expect(demo).toContain('incident-impact-card');
      expect(demo).toContain('examples/incident-review/index.html');
    }
  });

  it('keeps a presentation, a filmed clip, and a showcase with image-led steps', async () => {
    const presentation = await structureOf(path.join(examplesRoot, 'presentation'));
    expect(presentation.structure.layout).toBe('slides');
    const brief = await readFile(path.join(examplesRoot, 'presentation', 'brief.md'), 'utf8');
    expect(mediaRows(brief).get('assets/demo.h264.mp4')?.origin).toBe('screencast');
    const motion = await structureOf(path.join(examplesRoot, 'motion-showcase'));
    expect(
      motion.structure.sections.some(
        (section) => section.scene === 'steps' && section.media.images > 0,
      ),
    ).toBe(true);
  });
});
