import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { detectVideoCodec, parseChapters } from '../../src/render/video-media.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Видео продукта: несколько кодировок одного ролика (как их пишет agentic-screencast web), режимы
 * клипа, фона и ручного запуска, главы WebVTT. Кодек читается из файла, а не из имени.
 */
const ASSETS = path.resolve('examples/presentation/assets');
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(body: string): Promise<string> {
  const root = await createTestWorkspace('video-sources');
  workspaces.push(root);
  for (const file of await readdir(ASSETS))
    await copyFile(path.join(ASSETS, file), path.join(root, file));
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Clip\nlanguage: en\n---\n\n# Clip\n\n${body}\n`,
  );
  return root;
}

const ALL =
  '::video{src="demo.h264.mp4" sources="demo.av1.mp4, demo.vp9.webm" poster="demo.poster.jpg" chapters="demo.chapters.vtt" caption="Demo."}';

describe('video sources', () => {
  it('reads the codec of each encoding from the file itself', async () => {
    expect(detectVideoCodec(await readFile(path.join(ASSETS, 'demo.av1.mp4')), 'video/mp4')).toBe(
      'av1',
    );
    expect(detectVideoCodec(await readFile(path.join(ASSETS, 'demo.vp9.webm')), 'video/webm')).toBe(
      'vp9',
    );
    expect(detectVideoCodec(await readFile(path.join(ASSETS, 'demo.h264.mp4')), 'video/mp4')).toBe(
      'h264',
    );
  });

  it('offers every encoding in directory output, preferred first and the compatible one last', async () => {
    const root = await workspace(ALL);
    const result = await buildReport({
      input: root,
      output: path.join(root, 'site'),
      format: 'directory',
    });
    expect(result.warnings).toEqual([]);
    const html = await readFile(path.join(root, 'site', 'index.html'), 'utf8');
    const types = [
      ...html.matchAll(
        /<source src="assets\/demo\.(\w+)\.[0-9a-f]{12}\.(?:mp4|webm)" type="([^"]+)"/gu,
      ),
    ].map((match) => [match[1], match[2]?.replaceAll('&#x22;', '"')]);
    expect(types).toEqual([
      ['av1', 'video/mp4; codecs="av01.0.05M.08"'],
      ['vp9', 'video/webm; codecs="vp9"'],
      ['h264', 'video/mp4; codecs="avc1.640028"'],
    ]);
  });

  it('embeds only the most compatible encoding in one file and says so', async () => {
    const root = await workspace(ALL);
    const result = await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html.match(/<source /gu)).toHaveLength(1);
    expect(html).toContain('type="video/mp4; codecs=&#x22;avc1.640028&#x22;"');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'VIDEO_SOURCES_SINGLE_FILE',
        details: { kept: 'demo.h264.mp4', dropped: ['demo.av1.mp4', 'demo.vp9.webm'] },
      }),
    );
  });

  it('draws the chapters as buttons that jump to their start', async () => {
    const root = await workspace(ALL);
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html).toMatch(
      /<track kind="chapters" src="data:text\/vtt;base64,[^"]+" label="Chapters" default srclang="en">/u,
    );
    expect(html).toContain(
      '<button type="button" class="video-chapter ui-row" data-video-seek="0" data-ui-size="md"><time datetime="PT0S">0:00</time> One Markdown source</button>',
    );
    expect(
      parseChapters(
        'WEBVTT\n\n00:01.500 --> 00:04.000\nIntro\n\n1:02:03.000 --> 1:02:05.000\nEnd\n',
      ),
    ).toEqual([
      { start: 1.5, title: 'Intro' },
      { start: 3723, title: 'End' },
    ]);
    expect(parseChapters('not vtt')).toBeUndefined();
  });

  it('renders a background video without controls behind a pause button, and requires its poster', async () => {
    const root = await workspace(
      '::video{src="demo.h264.mp4" poster="demo.poster.jpg" mode="background"}',
    );
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html).toMatch(
      /<video class="semantic-video-player" playsinline muted loop preload="none" data-video-autoplay="" data-video-background="" poster=/u,
    );
    expect(html).toContain(
      '<button type="button" class="video-toggle ui-button" data-video-toggle="" aria-pressed="false" aria-label="Pause video" data-ui-variant="secondary" data-ui-size="sm">Pause video</button>',
    );

    const bare = await workspace('::video{src="demo.h264.mp4" mode="background"}');
    await expect(
      buildReport({ input: bare, output: path.join(bare, 'page.html') }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'VIDEO_POSTER_REQUIRED' },
    });
  });

  it('starts a manual video only by the reader, with sound', async () => {
    const root = await workspace(
      '::video{src="demo.h264.mp4" mode="manual" caption="Walkthrough."}',
    );
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    const video = /<video[^>]*>/u.exec(html)?.[0] ?? '';
    expect(video).toContain('controls');
    expect(video).not.toContain('muted');
    expect(video).not.toContain('data-video-autoplay');
  });

  it('refuses chapters that are not WebVTT', async () => {
    const root = await workspace('::video{src="demo.h264.mp4" chapters="demo.poster.jpg"}');
    await expect(
      buildReport({ input: root, output: path.join(root, 'page.html') }),
    ).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_VIDEO_CHAPTERS' },
    });
  });
});
