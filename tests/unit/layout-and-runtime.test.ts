import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getAuthoringSchema, getSourceContract } from '../../src/discovery.js';
import type { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport } from '../../src/index.js';
import { PAGE_MOTION_POLICY } from '../../src/page-motion.js';
import { GEOMETRY_REBUILD_LIMIT, rebuildGate } from '../../src/browser/geometry-rebuild.js';
import { entranceSchedule } from '../../src/browser/opening-entrance.js';
import { thesisFill } from '../../src/browser/thesis-fill.js';
import {
  createTimeline,
  parseLineRanges,
  scrubFrame,
  smoothToward,
} from '../../src/browser/timeline.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Раскладка и рантайм движения на стороне сборки и чистые функции рантайма: уровень движения из шапки,
 * режим экранов, сцена со скрабом (не больше четырёх экранов), строки кода такта, поэтапный вход,
 * состояния страницы, вид полосы глав «ряд узлов», длительности по ролям и мини-таймлайн.
 */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function source(markdown: string, frontmatter = ''): Promise<string> {
  const root = await createTestWorkspace('layout-runtime');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Runtime\nlanguage: en\n${frontmatter}---\n\n${markdown}`,
  );
  const poster = await readFile(path.resolve('tests/fixtures/video/poster.png'));
  await writeFile(path.join(root, 'a.png'), poster);
  await writeFile(path.join(root, 'b.png'), poster);
  return root;
}

async function build(markdown: string, frontmatter = ''): Promise<string> {
  const root = await source(markdown, frontmatter);
  await buildReport({ input: root, output: path.join(root, 'page.html') });
  return readFile(path.join(root, 'page.html'), 'utf8');
}

async function failure(markdown: string, frontmatter = ''): Promise<AgenticReportError> {
  const root = await source(markdown, frontmatter);
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    return error as AgenticReportError;
  }
  throw new Error('Build unexpectedly succeeded.');
}

/** Все сообщения ошибки: первая и связанные с ней. */
function messages(error: AgenticReportError): string[] {
  return [error.diagnostic, ...(error.diagnostic.related ?? [])].map((entry) => entry.message);
}

const SCRUB = (beats: number): string =>
  [
    '# Page',
    '',
    '::::::section{title="Scene" id="scene" scene="scrub"}',
    '![One](a.png)',
    '![Two](b.png)',
    '',
    ...Array.from({ length: beats }, (_, index) => [
      `:::beat{title="Step ${index + 1}" state="step-${index + 1}"}`,
      `Beat ${index + 1}.`,
      ':::',
      '',
    ]).flat(),
    '::::::',
    '',
  ].join('\n');

describe('motion level', () => {
  it('is a manifest field with the brief’s three levels and no bound by default', () => {
    // Ловит: уровень движения остался советом скилла, а не полем шапки, которое читает сборка.
    const schema = getAuthoringSchema('manifest') as {
      readonly properties: Readonly<Record<string, { readonly enum?: readonly string[] }>>;
    };
    expect(schema.properties.motion?.enum).toEqual(['none', 'restrained', 'expressive']);
    expect(getSourceContract().page).toMatchObject({ defaultMotion: 'expressive' });
  });

  it('writes the level on the page root, where the runtime reads it', async () => {
    // Ловит: шапка приняла уровень, а рантайм его не видит и двигает страницу `motion: none`.
    const html = await build('# Page\n\nStill text.\n', 'motion: none\n');
    expect(html).toContain('data-motion-level="none"');
  });

  it('refuses any moving technique on a page that declares motion: none', async () => {
    // Ловит: `motion: none` принят вместе с появлением главы и досчётом — уровень ничего не ограничивает.
    const error = await failure(
      '# Page\n\n::::section{title="A" transition="reveal"}\nWe read :count[12] files.\n::::\n',
      'motion: none\n',
    );
    expect(error.diagnostic.code).toBe('MOTION_LEVEL_EXCEEDED');
    expect(messages(error).join('\n')).toMatch(/transition="reveal" moves/u);
    expect(messages(error).join('\n')).toMatch(/:count moves/u);
  });

  it('allows restrained one entrance and names the recipe that brings a second or a scene', async () => {
    // Ловит: второе появление или сцена `progress` на `restrained` проходят молча, а значение рецепта
    // не называет рецепт — автор ищет атрибут, которого не писал.
    const error = await failure(
      [
        '# Page',
        '',
        '::::section{title="One" transition="reveal"}\nText.\n::::',
        '',
        '::::section{title="Two" recipe="thesis"}\n:::lead\nClaim.\n:::\n::::',
        '',
        '::::section{title="Three" recipe="hero"}\n![A](a.png)\n::::',
        '',
      ].join('\n'),
      'motion: restrained\n',
    );
    const text = messages(error).join('\n');
    expect(text).toMatch(
      /allows one chapter entrance, and transition="reveal" \(brought by recipe="thesis"\)/u,
    );
    expect(text).toMatch(/scene="progress" \(brought by recipe="hero"\) is directed motion/u);
    await expect(
      build(
        '# Page\n\n::::section{title="One" transition="reveal"}\nText.\n::::\n',
        'motion: restrained\n',
      ),
    ).resolves.toContain('data-motion-level="restrained"');
  });

  it('counts every technique of the vocabulary, each at its level', async () => {
    // Ловит: пролёт, проигрываемая сцена, рост графика, замена и набор слова, пометка, лупа, шов петли
    // и печать лога проходят на `motion: none` — бюджет обещает больше, чем проверяет.
    const every = [
      '# Page',
      '',
      '::::::diagram{title="Service" description="A request reaches the API."}',
      '::node{id="client" label="Client"}',
      '::node{id="api" label="API"}',
      '::edge{from="client" to="api"}',
      ':::::zoom{node="api" title="Inside the API"}',
      '::node{id="router" label="Router"}',
      '::node{id="handler" label="Handler"}',
      '::edge{from="router" to="handler"}',
      ':::::',
      '::::::',
      '',
      '::::::demo{title="One deploy" play="scroll"}',
      '![Stage](a.png)',
      '',
      ':::beat{title="Build"}\nBuilt.\n:::',
      '',
      ':::beat{title="Ship"}\nShipped.\n:::',
      '::::::',
      '',
      '::::chart{title="Growth" description="Runs grew." count-up="true"}',
      ':::series{label="Runs"}\n::point{label="May" value="3"}\n::point{label="June" value="7"}\n:::',
      '::::',
      '',
      'It is :swap[faster]{words="calmer"}; type :typing[agentic-report build], :mark[three times].',
      '',
      ':::spotlight{title="The switch" x="50" y="50" zoom="2"}',
      '![Settings](a.png)',
      '',
      'The switch.',
      ':::',
      '',
      '::video{src="clip.webm" poster="a.png" caption="Run." seam="fade"}',
      '',
      '::::section{title="Log" transition="log"}\n```text\none\n```\n::::',
      '',
    ].join('\n');
    const clip = await readFile(path.resolve('tests/fixtures/video/playback.webm'));
    const failing = async (level: string): Promise<string> => {
      const root = await source(every, `motion: ${level}\n`);
      await writeFile(path.join(root, 'clip.webm'), clip);
      try {
        await buildReport({ input: root, output: path.join(root, 'page.html') });
      } catch (error) {
        return messages(error as AgenticReportError).join('\n');
      }
      return '';
    };
    const none = await failing('none');
    for (const written of [
      ':::zoom moves',
      'demo{play="scroll"} moves',
      'count-up="true" moves',
      ':swap moves',
      ':typing moves',
      ':mark moves',
      ':::spotlight moves',
      'video{seam="fade"} moves',
      'transition="log" moves',
    ])
      expect(none).toContain(written);
    const restrained = await failing('restrained');
    expect(restrained).toContain(':::zoom is directed motion');
    expect(restrained).toContain('demo{play="scroll"} is directed motion');
    for (const allowed of ['count-up', ':swap', ':typing', ':mark', 'spotlight', 'seam', 'log'])
      expect(restrained).not.toContain(allowed);
  });

  it('lets an expressive page use the whole vocabulary', async () => {
    // Ловит: проверка уровня срабатывает и без ограничения — ломает страницы без поля `motion`.
    await expect(build(SCRUB(3), 'motion: expressive\n')).resolves.toContain('scene-track');
  });
});

describe('screens mode', () => {
  it('makes every top-level section a screen and the page opening the first one', async () => {
    // Ловит: `layout: screens` принят, но секции не помечены экранами, и рантайму нечего листать.
    const html = await build(
      '# Screens\n\nIntro.\n\n::::section{title="A" id="a"}\nOne.\n::::\n\n::::section{title="B" id="b"}\nTwo.\n::::\n',
      'layout: screens\n',
    );
    expect(html).toMatch(/<section[^>]*data-screen-cover=""[^>]*data-screen="0"/u);
    expect(html).toMatch(/<section[^>]*id="a"[^>]*data-screen="1"|data-screen="1"[^>]*id="a"/u);
    expect(html).toMatch(/data-screen="2"/u);
    expect(html).toContain('data-layout="screens"');
  });
});

describe('scrub scene', () => {
  it('pins two to four beats, one screen each, and refuses a fifth (SPEC 8.1)', async () => {
    // Ловит: закреплённая сцена длиннее четырёх экранов — прежний предел в восемь тактов.
    const html = await build(SCRUB(4));
    expect(html).toContain('style="--scene-beats: 4"');
    expect(html).toMatch(/class="scene-track"><div class="scene-pin" data-scene-pin="">/u);
    const tooLong = await failure(SCRUB(5));
    expect(tooLong.diagnostic.message).toMatch(
      /scrub scene holds one screen per beat, from 2 to 4; this one has 5/u,
    );
    const tooShort = await failure(SCRUB(1));
    expect(tooShort.diagnostic.message).toMatch(/this one has 1/u);
  });

  it('carries the beat states to the page', async () => {
    // Ловит: `state` у такта не доходит до разметки, и состояние страницы нечем поставить.
    const html = await build(SCRUB(2));
    expect(html).toMatch(/data-state="step-2"/u);
  });
});

describe('code lines of a beat (SPEC 7.3)', () => {
  const CODE = [
    '# Page',
    '',
    '::::::section{title="Code" scene="steps"}',
    '```ts',
    'const a = 1;',
    'const b = a + 1;',
    '```',
    '',
    ':::beat{title="Declare" lines="1"}',
    'One.',
    ':::',
    '',
    ':::beat{title="Add" lines="2"}',
    'Two.',
    ':::',
    '::::::',
    '',
  ].join('\n');

  it('pins a code block as the scene and keeps the lines of each beat', async () => {
    // Ловит: блок кода не считается медиа сцены, и сцена со строками кода не собирается.
    const html = await build(CODE);
    expect(html).toMatch(/<div class="scene-stage" data-scene-stage=""><pre/u);
    expect(html).toContain('data-lines="2"');
  });

  it('refuses lines in a scene without code', async () => {
    // Ловит: такт называет строки, которых нет, и молча ничего не зажигает.
    const error = await failure(
      '# Page\n\n::::section{title="S" scene="steps"}\n![P](a.png)\n\n:::beat{lines="2"}\nOne.\n:::\n\n:::beat\nTwo.\n:::\n::::\n',
    );
    expect(error.diagnostic.message).toMatch(
      /beat lines names code lines, and the scene has no code block/u,
    );
  });
});

describe('staged first-screen entrance', () => {
  it('belongs to the first screen only', async () => {
    // Ловит: поэтапный вход на главе в середине страницы, где нет заголовка страницы, который он ведёт.
    const error = await failure(
      '# Page\n\n::::section{title="A" transition="staged"}\nText.\n::::\n',
    );
    expect(error.diagnostic.message).toMatch(/transition="staged" brings in the first screen/u);
    await expect(
      build(
        '# Page\n\n::::section{title="A" place="opening" transition="staged"}\n![P](a.png)\n::::\n',
      ),
    ).resolves.toContain('data-transition="staged"');
  });

  it('starts each part after the previous one has travelled 60 % of its way, in reading order', () => {
    // Ловит: части первого экрана входят разом или не в порядке чтения.
    const roles = PAGE_MOTION_POLICY.roles;
    const schedule = entranceSchedule(2, new Set(['title', 'subtitle', 'actions', 'scene']));
    const title = roles.textMs + roles.textLineStepMs;
    expect([...schedule.starts.entries()]).toEqual([
      ['title', 0],
      ['subtitle', Math.round(title * 0.6)],
      ['actions', Math.round(title * 0.6 + roles.textMs * 0.6)],
      ['scene', Math.round(title * 0.6 + roles.textMs * 1.2)],
    ]);
    expect(schedule.end).toBe(Math.round(title * 0.6 + roles.textMs * 1.2 + roles.sceneMs));
  });
});

describe('page states', () => {
  it('renders section states and the blocks they light', async () => {
    // Ловит: `state` и `when` приняты грамматикой, но не доходят до разметки, которую читает рантайм.
    const html = await build(
      [
        '# Page',
        '',
        '::::::section{title="Stations" id="stations" state="stations"}',
        '::::cards{title="Line"}',
        ':::card{title="Arrive" when="stations"}\nHere.\n:::',
        '::::',
        '',
        'Read :count[42]{when="stations"} files.',
        '::::::',
        '',
      ].join('\n'),
    );
    expect(html).toMatch(/<section[^>]*data-state="stations"/u);
    expect(html).toMatch(
      /<article[^>]*class="semantic-card"[^>]*data-when="stations"|data-when="stations"[^>]*class="semantic-card"/u,
    );
    expect(html).toMatch(
      /class="semantic-count"[^>]*data-when="stations"|data-when="stations"[^>]*class="semantic-count"/u,
    );
  });

  it('refuses a state name the effect engine would refuse', async () => {
    // Ловит: имя, которое не может стать атрибутом `data-state-*`, доходит до браузера.
    const error = await failure('# Page\n\n::::section{title="A" state="Bad Name"}\nText.\n::::\n');
    expect(error.diagnostic.code).toBe('INVALID_DIRECTIVE_ATTRIBUTE');
  });
});

describe('chapter progress as a row of nodes (SPEC 7.7)', () => {
  it('is a value of progress written on the root', async () => {
    // Ловит: вид «ряд узлов» есть в рантайме, но шапка его не принимает.
    const html = await build(
      '# Page\n\n::::section{title="A" id="a"}\nOne.\n::::\n',
      'progress: nodes\n',
    );
    expect(html).toContain('data-progress="nodes"');
  });
});

describe('role durations', () => {
  it('declares next to the easing curves the same durations the runtime writes from the policy', async () => {
    // Ловит: длительность роли в CSS разошлась с политикой, по которой рантайм считает вход.
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    const roles = PAGE_MOTION_POLICY.roles;
    const declared = (name: string): string | undefined =>
      new RegExp(`${name}: ([^;]+);`, 'u').exec(css)?.[1];
    expect(declared('--duration-text')).toBe(`${roles.textMs}ms`);
    expect(declared('--duration-text-step')).toBe(`${roles.textLineStepMs}ms`);
    expect(declared('--duration-scene')).toBe(`${roles.sceneMs}ms`);
    expect(declared('--duration-back')).toBe(`${roles.backMs}ms`);
    expect(declared('--text-rise')).toBe(`${roles.textRisePercent}%`);
    expect(roles.backMs).toBeLessThan(roles.textMs);
    // Кривые и длительности — соседи: длительности объявлены сразу после кривой сцены.
    expect(css.indexOf('--duration-text:')).toBeGreaterThan(css.indexOf('--ease-scene:'));
    expect(css.indexOf('--duration-text:') - css.indexOf('--ease-scene:')).toBeLessThan(600);
  });
});

describe('mini timeline', () => {
  it('switches the caption at a third of the step’s segment, not at its border', () => {
    // Ловит: подпись меняется на самой границе отрезка и мигает от лёгкого движения колеса.
    const steps = 3;
    const at = (position: number): number => scrubFrame(position / steps, steps).caption;
    expect(at(0)).toBe(0);
    expect(at(1.2)).toBe(0);
    expect(at(1.34)).toBe(1);
    expect(at(2.3)).toBe(1);
    expect(at(2.34)).toBe(2);
  });

  it('holds every segment at the last step and restores the picture on the way back', () => {
    // Ловит: последний такт гасит прежние отрезки; прокрутка назад не возвращает прежнюю картину.
    expect(scrubFrame(1, 4).segments).toEqual([1, 1, 1, 1]);
    expect(scrubFrame(1, 4).caption).toBe(3);
    const forward = scrubFrame(0.4, 4);
    scrubFrame(0.9, 4);
    expect(scrubFrame(0.4, 4)).toEqual(forward);
  });

  it('smooths text progress over about 0.6 s and settles exactly', () => {
    // Ловит: текст шагов прыгает за прокруткой без сглаживания или так и не доходит до цели.
    const half = smoothToward(0, 1, PAGE_MOTION_POLICY.scrub.smoothingMs / 3);
    expect(half).toBeGreaterThan(0.5);
    expect(half).toBeLessThan(0.75);
    let shown = 0;
    for (let frame = 0; frame < 120; frame += 1) shown = smoothToward(shown, 1, 16);
    expect(shown).toBe(1);
    expect(smoothToward(0.3, 0.8, 0)).toBe(0.3);
  });

  it('renders each track at its local progress', () => {
    // Ловит: дорожка таймлайна получает общее положение вместо своего прогресса 0–1.
    const seen: number[] = [];
    createTimeline([
      { start: 0, end: 1, render: (local) => seen.push(local) },
      { start: 1, end: 2, render: (local) => seen.push(local) },
    ]).render(1.5);
    expect(seen).toEqual([1, 0.5]);
  });

  it('reads code line ranges', () => {
    // Ловит: диапазон строк такта читается только одним числом.
    expect([...parseLineRanges('1, 3-5')]).toEqual([1, 3, 4, 5]);
    expect(parseLineRanges(undefined).size).toBe(0);
  });
});

describe('geometry rebuild helper', () => {
  it('admits six rebuilds a second and makes the next one wait for the window to end', () => {
    // Ловит: пересборка, которая зовёт пересборку, крутится без предела или теряется насовсем.
    const gate = rebuildGate();
    const verdicts = Array.from({ length: GEOMETRY_REBUILD_LIMIT + 1 }, (_, index) =>
      gate.admit(100 + index * 10),
    );
    expect(verdicts.slice(0, GEOMETRY_REBUILD_LIMIT).every((verdict) => verdict.admitted)).toBe(
      true,
    );
    const refused = verdicts.at(-1);
    expect(refused?.admitted).toBe(false);
    expect(refused?.waitMs).toBe(1000 - GEOMETRY_REBUILD_LIMIT * 10 + 1);
    expect(gate.admit(1101).admitted).toBe(true);
  });
});

describe('thesis fill (SPEC 7.1)', () => {
  it('fills as the thesis rises through the window and goes back when it falls', () => {
    // Ловит: заливка стоит на месте или идёт не в ту сторону прокрутки.
    const viewport = 900;
    const below = thesisFill(900, 120, viewport);
    const middle = thesisFill(450, 120, viewport);
    const above = thesisFill(200, 120, viewport);
    expect(below).toBe(0);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(above).toBe(1);
  });
});
