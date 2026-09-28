import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveBuiltInTheme } from '../../src/authoring/themes.js';
import { markPath, markSeed } from '../../src/blocks/typography.js';
import type { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport } from '../../src/index.js';
import { themeRootAttributes } from '../../src/render/theme-css.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Приёмы словаря на стороне сборки: разметка сцены `demo`, `:swap`, `:typing`, `:mark`, `spotlight`,
 * рамки браузера, печати лога, начала и стыка петли видео, «Развернуть», вертикальных вкладок, липкого
 * оглавления и подписей по краям — и отказы там, где приём ставят не по его условиям. Каждая проверка
 * называет дефект, который ловит.
 */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function source(markdown: string, frontmatter = ''): Promise<string> {
  const root = await createTestWorkspace('vocabulary-techniques');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Techniques\nlanguage: en\n${frontmatter}---\n\n# Techniques\n\n${markdown}`,
  );
  await copyFile(path.resolve('tests/fixtures/video/poster.png'), path.join(root, 'shot.png'));
  await copyFile(path.resolve('tests/fixtures/video/poster.png'), path.join(root, 'other.png'));
  await copyFile(path.resolve('tests/fixtures/video/playback.webm'), path.join(root, 'clip.webm'));
  return root;
}

async function html(markdown: string, frontmatter = ''): Promise<string> {
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

/** Все сообщения отказа: сборка собирает нарушения всего источника в один отказ. */
function messages(error: AgenticReportError): string {
  return [error.diagnostic, ...(error.diagnostic.related ?? [])]
    .map((diagnostic) => diagnostic.message)
    .join('\n');
}

const SCENE = (attributes: string, beats: number, stage = true) =>
  [
    `::::::demo{title="Run" ${attributes}}`,
    ...(stage
      ? [
          ':::::diagram{title="Flow" description="A then B."}',
          '::node{id="a" label="A"}',
          '::node{id="b" label="B"}',
          '::edge{from="a" to="b"}',
          ':::::',
          '',
        ]
      : []),
    ...Array.from({ length: beats }, (_, index) => [
      `:::beat{title="Step ${index + 1}" focus="${index % 2 === 0 ? 'a' : 'b'}"}`,
      `Moment ${index + 1}.`,
      ':::',
      '',
    ]).flat(),
    '::::::',
    '',
  ].join('\n');

describe('playable demo scene', () => {
  it('arranges the stage, the beats in order and hidden controls, and keeps the counter demo as it was', async () => {
    const page = await html(
      `${SCENE('play="time" seconds="2"', 3)}\n:::demo{title="Count" start="2"}\nPress.\n:::\n`,
    );
    // Ловит: сцена осталась счётчиком — такты и сцена не разложены, воспроизводить нечего.
    expect(page).toMatch(
      /<section(?=[^>]*data-demo-scene)(?=[^>]*data-play="time")(?=[^>]*data-seconds="2")[^>]*>/u,
    );
    expect(page).toContain('class="demo-stage"');
    expect([...page.matchAll(/data-demo-beat="(\d)"/gu)].map((match) => match[1])).toEqual([
      '0',
      '1',
      '2',
    ]);
    // Ловит: кнопки видны без рантайма, где они ничего не делают; конечный кадр — без них.
    expect(page).toMatch(/<div(?=[^>]*data-demo-controls)(?=[^>]*hidden)[^>]*>/u);
    expect(page).toContain('data-label-pause="Pause"');
    // Ловит: сцена сломала счётчик у демо без play.
    expect(page).toMatch(/data-demo-output[^>]*>2<\/output>/u);
    expect(page).not.toMatch(
      /data-demo-scene[^>]*data-demo-counter|data-demo-counter[^>]*data-demo-scene/u,
    );
  });

  it('refuses a scene without its conditions: beats without play, one beat, no stage, counter attributes, seconds on scroll, unknown focus', async () => {
    const cases: ReadonlyArray<readonly [string, RegExp]> = [
      [SCENE('', 2), /belong to a playable scene/u],
      [SCENE('play="time"', 1), /from 2 to 8 beats; this one has 1/u],
      [SCENE('play="time"', 2, false), /nothing before its beats/u],
      [SCENE('play="time" start="3"', 2), /start mean nothing here/u],
      [SCENE('play="scroll" seconds="2"', 2), /not play="time"/u],
      [SCENE('play="time"', 2).replace('focus="b"', 'focus="missing"'), /does not have: missing/u],
    ];
    for (const [markdown, expected] of cases)
      expect(messages(await failure(markdown)), String(expected)).toMatch(expected);
  });
});

describe('small typographic directives', () => {
  it('stacks the swap words with the written one first and the others hidden from assistive technology', async () => {
    const page = await html('Reviews become :swap[faster]{words="calmer, exact"} with a plan.\n');
    // Ловит: другие слова не в разметке (ширину не зарезервировать) или слышны чтецу.
    expect(page).toMatch(
      /<span class="swap-word" data-swap-word="0">faster<\/span><span class="swap-word" data-swap-word="1" aria-hidden="true">calmer<\/span><span class="swap-word" data-swap-word="2" aria-hidden="true">exact<\/span>/u,
    );
  });

  it('refuses a swap of too many or repeated words and a typed line that is long or holds markup', async () => {
    expect(messages(await failure(':swap[a]{words="b, c, d, e"}\n'))).toMatch(/lists 4/u);
    expect(messages(await failure(':swap[fast]{words="fast, calm"}\n'))).toMatch(/repeats a word/u);
    expect(messages(await failure(':swap[**fast**]{words="calm"}\n'))).toMatch(/holds markup/u);
    expect(messages(await failure(`:typing[${'x'.repeat(81)}]\n`))).toMatch(/81 characters/u);
    expect(messages(await failure(':typing[run *this*]\n'))).toMatch(/holds markup/u);
  });

  it('keeps the whole typed line in the page', async () => {
    const page = await html('Run :typing[agentic-report build page] now.\n');
    // Ловит: строка набирается вставкой символов, и до набора её нет ни в тексте, ни у чтеца.
    expect(page).toMatch(/class="semantic-typing"[^>]*>agentic-report build page<\/span>/u);
  });

  it('draws the same mark from the same seed and another from another seed', () => {
    // Ловит: дрожание случайное при каждой сборке (снимок меняется) или одинаковое у всех пометок.
    expect(markPath('circle', 7)).toBe(markPath('circle', 7));
    expect(markPath('circle', 7)).not.toBe(markPath('circle', 8));
    expect(markPath('underline', markSeed('word'))).toMatch(/^M-?[\d.]+ [\d.]+ Q/u);
  });

  it('draws a mark around the words and allows at most two marks in a section', async () => {
    const two = await html(
      '::::section{title="One"}\n:mark[a]{shape="circle"} and :mark[b]\n::::\n\n::::section{title="Two"}\n:mark[c]{shape="strike"} and :mark[d]\n::::\n',
    );
    expect(two).toMatch(
      /<span class="mark-text">a<\/span><svg class="mark-drawing"[^>]*aria-hidden="true"/u,
    );
    expect(two).toContain('pathLength="1"');
    // Ловит: третья пометка на одном экране проходит, и пометки становятся украшением.
    const error = await failure('::::section{title="One"}\n:mark[a] :mark[b] :mark[c]\n::::\n');
    expect(messages(error)).toMatch(/at most 2 hand-drawn marks/u);
  });
});

describe('spotlight', () => {
  it('shows a hidden copy of the picture in the loupe at the authored point', async () => {
    const page = await html(
      ':::spotlight{x="72" y="38" zoom="2.5" title="The switch"}\n![Settings](shot.png)\n\nThe switch turns the cache on.\n:::\n',
    );
    expect(page).toMatch(/style="--spot-x: 72; --spot-y: 38; --spot-zoom: 2.5"/u);
    // Ловит: копия в лупе называет картинку второй раз (чтец слышит её дважды).
    expect(page).toMatch(/<span class="spotlight-loupe" aria-hidden="true"><img[^>]*alt=""/u);
    expect(page).toMatch(/<figcaption class="spotlight-note">.*The switch turns the cache on/su);
  });

  it('refuses a spotlight with two pictures or without its explanation', async () => {
    expect(
      messages(
        await failure(':::spotlight{x="1" y="1"}\n![A](shot.png)\n\n![B](other.png)\n:::\n'),
      ),
    ).toMatch(/2 image/u);
    expect(messages(await failure(':::spotlight{x="1" y="1"}\n![A](shot.png)\n:::\n'))).toMatch(
      /no explanation/u,
    );
  });
});

describe('browser frame, log and video', () => {
  it('frames the first picture with its real address or the illustration label', async () => {
    const real = await html(
      '::::section{title="Live" frame="browser" address="https://example.com/pricing"}\n![Pricing](shot.png)\n::::\n',
    );
    expect(real).toMatch(
      /<div class="browser-frame" data-browser-frame="address"><div class="browser-frame-bar"><span class="browser-frame-address"[^>]*>https:\/\/example\.com\/pricing<\/span>/u,
    );
    const mock = await html(
      '::::section{title="Mock" frame="browser" illustration="true"}\n![A mock-up](shot.png)\n::::\n',
    );
    expect(mock).toMatch(/browser-frame-illustration[^>]*>Illustration<\/span>/u);
  });

  it('refuses a browser frame without a real address or the illustration label, and an address without the frame', async () => {
    // Ловит: выдуманный хром браузера без адреса — клише, которое продукт не должен собирать.
    expect(
      messages(
        await failure('::::section{title="Fake" frame="browser"}\n![Shot](shot.png)\n::::\n'),
      ),
    ).toMatch(/gives none/u);
    expect(
      messages(
        await failure(
          '::::section{title="Loose" address="https://example.com"}\n![Shot](shot.png)\n::::\n',
        ),
      ),
    ).toMatch(/frame other than browser/u);
    expect(
      messages(
        await failure(
          '::::section{title="Empty" frame="browser" illustration="true"}\nText.\n::::\n',
        ),
      ),
    ).toMatch(/no image or video/u);
  });

  it('accepts transition="log" and keeps the code text whole', async () => {
    const page = await html(
      '::::section{title="Log" transition="log"}\n```text\none\ntwo\n```\n::::\n',
    );
    expect(page).toMatch(/<section(?=[^>]*data-transition="log")[^>]*>/u);
    expect(page).toMatch(/one<\/span><\/span>\n<span class="line"><span[^>]*>two/u);
  });

  it('carries the loop start, the soft seam and the expand button to the clip player', async () => {
    const page = await html(
      '::video{src="clip.webm" poster="shot.png" caption="Run." start="1.5" seam="fade" expand="true"}\n',
    );
    // Ловит: начало и стык не доходят до плеера, и рантайму нечего исполнять.
    expect(page).toMatch(
      /<video(?=[^>]*data-video-start="1.5")(?=[^>]*data-video-seam="fade")[^>]*>/u,
    );
    expect(page).toMatch(/<button[^>]*data-video-expand[^>]*>Expand<\/button>/u);
    const plain = await html('::video{src="clip.webm" poster="shot.png"}\n');
    // Разметка, а не встроенный рантайм, который называет те же атрибуты в своём коде.
    expect(plain).not.toContain('data-video-expand=""');
    expect(plain).not.toContain('data-video-start="');
  });

  it('refuses start and seam on a manual video and expand on a background', async () => {
    expect(
      messages(
        await failure('::video{src="clip.webm" poster="shot.png" mode="manual" start="2"}\n'),
      ),
    ).toMatch(/manual video does not loop/u);
    expect(
      messages(
        await failure(
          '::video{src="clip.webm" poster="shot.png" mode="background" expand="true"}\n',
        ),
      ),
    ).toMatch(/background video does not take it/u);
  });
});

describe('tabs, contents and edges', () => {
  it('marks vertical tabs and leaves horizontal ones as they were', async () => {
    const vertical = await html(
      '::::tabs{title="Views" orientation="vertical"}\n:::tab{label="A"}\nA.\n:::\n:::tab{label="B"}\nB.\n:::\n::::\n',
    );
    expect(vertical).toMatch(/<section[^>]*data-orientation="vertical"/u);
    expect(vertical).toMatch(/<div role="tablist"[^>]*aria-orientation="vertical"/u);
    const horizontal = await html(
      '::::tabs{title="Views"}\n:::tab{label="A"}\nA.\n:::\n:::tab{label="B"}\nB.\n:::\n::::\n',
    );
    expect(horizontal).not.toMatch(/<section[^>]*data-orientation=/u);
  });

  it('makes the contents sticky on a landing and warns that it stays in the flow elsewhere', async () => {
    const body =
      '::contents{sticky="true"}\n\n::::section{title="A"}\nA.\n::::\n\n::::section{title="B"}\nB.\n::::\n';
    expect(await html(body, 'layout: landing\n')).toMatch(/<nav[^>]*data-sticky="true"/u);
    const root = await source(body, 'layout: document\n');
    const result = await buildReport({ input: root, output: path.join(root, 'page.html') });
    // Ловит: атрибут молча ничего не делает на отчёте, и агент не узнаёт, что приём не сработал.
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'STICKY_CONTENTS_OUTSIDE_LANDING',
    );
  });

  it('writes the edge captions choice of the theme on the root', () => {
    expect(themeRootAttributes(resolveBuiltInTheme('neutral'))['data-theme-edges']).toBe('none');
  });
});
