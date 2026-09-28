import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import type { AgenticReportError } from '../../src/diagnostics.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Словарь движения на стороне сборки: предел роста рантайма, код движка только на страницах
 * с эффектами расширений, детерминизм сборки и отказы в неверной разметке сцены и счётчика.
 */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function source(markdown: string): Promise<string> {
  const root = await createTestWorkspace('motion');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Motion\nlanguage: en\n---\n\n${markdown}`,
  );
  const poster = await readFile(path.resolve('tests/fixtures/video/poster.png'));
  await writeFile(path.join(root, 'a.png'), poster);
  await writeFile(path.join(root, 'b.png'), poster);
  return root;
}

async function failure(markdown: string): Promise<AgenticReportError> {
  const root = await source(markdown);
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    return error as AgenticReportError;
  }
  throw new Error('Build unexpectedly succeeded.');
}

const DIAGRAM = [
  ':::diagram{title="Flow" description="A to C and back." layout="right" draw="scroll"}',
  '::node{id="a" label="A"}',
  '::node{id="b" label="B"}',
  '::node{id="c" label="C"}',
  '::edge{from="a" to="b"}',
  '::edge{from="b" to="c" kind="data"}',
  '::edge{from="c" to="a" kind="event"}',
  ':::',
].join('\n');

describe('motion vocabulary build', () => {
  it('keeps the shared runtime within 15 KB of compressed growth over the unit-6 baseline', async () => {
    // Сжатый рантайм перед единицей 6 — 29 650 байт; движение и сцены добавляют не больше 15 КБ, раскладка
    // и рантайм движения этапа 7 (режим экранов, сцена со скрабом, состояния страницы, кнопка паузы,
    // поэтапный вход, переходы вида, помощник геометрии) — ещё не больше 9 КБ.
    const runtime = await readFile(path.resolve('dist/browser/runtime.js'));
    expect(gzipSync(runtime, { level: 9 }).length).toBeLessThanOrEqual(29_650 + (15 + 9) * 1024);
  });

  it('ships the effect engine only on a page with an effect extension, in both formats', async () => {
    const plain = await source('# Motion\n\n![Plane](a.png)\n');
    await buildReport({ input: plain, output: path.join(plain, 'page.html') });
    expect(await readFile(path.join(plain, 'page.html'), 'utf8')).not.toContain(
      '__agenticReportEffectEngine',
    );

    const effect = path.resolve('tests/fixtures/extensions/effect');
    const output = path.join(plain, 'effect.html');
    await buildReport({ input: effect, output });
    expect(await readFile(output, 'utf8')).toContain('__agenticReportEffectEngine');

    await buildReport({ input: effect, output: path.join(plain, 'site'), format: 'directory' });
    const assets = await readdir(path.join(plain, 'site', 'assets'));
    const runtime = assets.find((name) => name.startsWith('runtime.'));
    expect(runtime).toBeDefined();
    expect(await readFile(path.join(plain, 'site', 'assets', runtime ?? ''), 'utf8')).toContain(
      '__agenticReportEffectEngine',
    );
    expect(await readFile(path.join(plain, 'site', 'index.html'), 'utf8')).not.toContain(
      'data-webgl',
    );
  });

  it('rejects the removed section media effect instead of silently accepting it', async () => {
    const refused = await failure(
      '# Motion\n\n::::section{title="Picture" media-effect="threads"}\n![Plane](a.png)\n::::\n',
    );
    expect(refused.diagnostic.code).toBe('UNKNOWN_DIRECTIVE_ATTRIBUTE');
    expect(refused.diagnostic.message).toContain('media-effect');
  });

  it('builds a page with every motion technique byte-identically twice', async () => {
    const root = await source(
      `# Motion\n\n::::section{title="Steps" scene="steps" transition="lines"}\n${DIAGRAM}\n\n:::beat{focus="a, b"}\nOne.\n:::\n\n:::beat{focus="b, c"}\nTwo :count[1,284].\n:::\n::::\n`,
    );
    await buildReport({ input: root, output: path.join(root, 'one.html') });
    await buildReport({ input: root, output: path.join(root, 'two.html') });
    const one = await readFile(path.join(root, 'one.html'));
    expect(one.equals(await readFile(path.join(root, 'two.html')))).toBe(true);
    const html = one.toString('utf8');
    expect(html).toContain('class="scene-stage" data-scene-stage=""');
    expect(html).toMatch(/data-beat="1"[^>]*|data-beat="1"/u);
    expect(html).toContain('<span class="semantic-count" data-semantic="count">1,284</span>');
  });

  it('orders drawn connections along the flow with backward connections as a later phase', async () => {
    const root = await source(`# Motion\n\n${DIAGRAM}\n`);
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    const right = html.slice(html.indexOf('data-layout-view="right"'));
    const edges = [
      ...right.matchAll(
        /<path[^>]*data-from="([a-z])"[^>]*data-draw-phase="(\w+)"[^>]*style="([^"]*)"/gu,
      ),
    ]
      .slice(0, 3)
      .map((match) => ({
        from: match[1],
        phase: match[2],
        start: /--draw-start: (\d+)%/u.exec(match[3] ?? '')?.[1],
      }));
    const backward = edges.find((edge) => edge.phase === 'backward');
    expect(backward?.from).toBe('c');
    expect(Number(backward?.start)).toBeGreaterThan(
      Math.max(
        ...edges.filter((edge) => edge.phase === 'forward').map((edge) => Number(edge.start)),
      ),
    );
    // Пунктирные виды проявляются, а не прорисовываются: нормированная длина растянула бы пунктир.
    expect(right).toMatch(
      /<path[^>]*data-edge-kind="call"[^>]*pathLength="1"|<path[^>]*pathLength="1"[^>]*data-edge-kind="call"/u,
    );
    expect(right).not.toMatch(/<path[^>]*data-edge-kind="data"[^>]*pathLength/u);
  });

  it('refuses beats outside a steps scene, a scene without media or beats, and unknown focus', async () => {
    const outside = await failure(
      '# M\n\n::::section{title="S"}\n![P](a.png)\n\n:::beat\nOne.\n:::\n::::\n',
    );
    expect(outside.diagnostic.message).toMatch(/scene="steps"/u);
    const single = await failure(
      '# M\n\n::::section{title="S" scene="steps"}\n![P](a.png)\n\n:::beat\nOne.\n:::\n::::\n',
    );
    expect(single.diagnostic.message).toMatch(/from 2 to 8 beats/u);
    const bare = await failure(
      '# M\n\n::::section{title="S" scene="steps"}\n:::beat\nOne.\n:::\n\n:::beat\nTwo.\n:::\n::::\n',
    );
    expect(bare.diagnostic.message).toMatch(/has none/u);
    const unknown = await failure(
      `# M\n\n::::section{title="S" scene="steps"}\n${DIAGRAM}\n\n:::beat{focus="a, z"}\nOne.\n:::\n\n:::beat\nTwo.\n:::\n::::\n`,
    );
    expect(unknown.diagnostic.message).toMatch(/does not have: z/u);
  });

  it('refuses a count without a number', async () => {
    const refused = await failure('# M\n\nWe read :count[many] frames.\n');
    expect(refused.diagnostic.message).toMatch(/no digits/u);
  });

  it('writes the theme motion character as variables', async () => {
    const root = await source('# M\n');
    await writeFile(
      path.join(root, 'report.md'),
      '---\ntitle: M\nlanguage: en\ntheme:\n  extends: calm-paper\n  name: slow-ink\n  motion:\n    easing: gentle\n    pace: slow\n---\n\n# M\n',
    );
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html).toContain('--motion-ease: cubic-bezier(0.4, 0, 0.2, 1)');
    expect(html).toContain('--motion-pace: 1.4');
  });
});

describe('motion amplitudes follow the landing research', () => {
  it('keeps pointer depth within 5–15 px and an entrance within 16 px, and keeps parallax separate', async () => {
    const { PAGE_MOTION_POLICY } = await import('../../src/page-motion.js');
    expect(PAGE_MOTION_POLICY.pointer.depthPx).toBeGreaterThanOrEqual(5);
    expect(PAGE_MOTION_POLICY.pointer.depthPx).toBeLessThanOrEqual(15);
    expect(PAGE_MOTION_POLICY.sectionReveal.translationPx).toBeLessThanOrEqual(16);
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    // Параллакс сцены читает свою величину: уменьшение глубины указателя его не меняет.
    const progressRule =
      /\(var\(--scene-progress, 0\.5\) - 0\.5\) \* -1 \* var\((--[a-z-]+)\)/u.exec(css);
    expect(progressRule?.[1]).toBe('--scene-parallax');
  });
});
