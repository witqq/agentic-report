import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

/** Каталог отчёта с записью проигрывания, постером и заданным текстом страницы. */
async function videoWorkspace(body: string, manifest = ''): Promise<string> {
  const workspace = await createTestWorkspace('video');
  workspaces.push(workspace);
  for (const file of ['playback.webm', 'poster.png']) {
    await copyFile(path.resolve('tests/fixtures/video', file), path.join(workspace, file));
  }
  await writeFile(
    path.join(workspace, 'report.md'),
    `---\ntitle: Video\n${manifest}---\n\n# Video\n\n${body}\n`,
  );
  return workspace;
}

async function buildFailure(workspace: string): Promise<AgenticReportError> {
  try {
    await buildReport({ input: workspace, output: path.join(workspace, 'out.html') });
  } catch (error) {
    if (error instanceof AgenticReportError) return error;
    throw error;
  }
  throw new Error('The build was expected to fail.');
}

describe('embedded video', () => {
  it('turns a Markdown image of a video file into a muted looping player', async () => {
    const workspace = await videoWorkspace('![Square moving right](playback.webm)');
    const output = path.join(workspace, 'out.html');
    const result = await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');

    expect(html).not.toContain('<img src="data:video');
    expect(html).toMatch(
      /<video class="semantic-video-player" playsinline muted loop preload="metadata" data-video-autoplay="" controls aria-label="Square moving right"><source src="data:video\/webm;base64,[A-Za-z0-9+/=]+" type="video\/webm; codecs=&#x22;vp8&#x22;"><\/video>/u,
    );
    expect(result.warnings).toEqual([]);
  });

  it('draws the video directive as a captioned figure with a poster and allows media in the policy', async () => {
    const workspace = await videoWorkspace(
      '::video{src="playback.webm" poster="poster.png" caption="The square slides across."}',
    );
    const output = path.join(workspace, 'out.html');
    await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');

    expect(html).toMatch(
      /<figure class="semantic-video" data-mode="clip"><video class="semantic-video-player" playsinline muted loop preload="none" data-video-autoplay="" controls poster="data:image\/png;base64,[^"]+" aria-label="The square slides across\."><source src="data:video\/webm;base64,[^"]+" type="video\/webm; codecs=&#x22;vp8&#x22;"><\/video><figcaption class="semantic-video-caption">The square slides across\.<\/figcaption><\/figure>/u,
    );
    expect(html).toMatch(/media-src data:[;"]/u);
  });

  it('writes the video and poster as content-addressed files in directory output', async () => {
    const workspace = await videoWorkspace(
      '::video{src="playback.webm" poster="poster.png" caption="Directory copy."}',
    );
    const output = path.join(workspace, 'site');
    await buildReport({ input: workspace, output, format: 'directory' });
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const assets = await readdir(path.join(output, 'assets'));

    const video = assets.find((name) => /^playback\.[0-9a-f]{12}\.webm$/u.test(name));
    const poster = assets.find((name) => /^poster\.[0-9a-f]{12}\.png$/u.test(name));
    expect(video).toBeDefined();
    expect(poster).toBeDefined();
    expect(html).toContain(
      `<source src="assets/${video}" type="video/webm; codecs=&#x22;vp8&#x22;">`,
    );
    expect(html).toContain(`poster="assets/${poster}"`);
    expect(html).toContain('media-src data: &#x27;self&#x27;');
  });

  it('counts the embedded video against the size budget of one file', async () => {
    // Порог выводится из веса самой страницы с коротким видео: рост стилей и рантайма пакета не должен
    // ронять проверку, а сорокакратное видео обязано выйти за него. Системная пара не встраивает шрифтов.
    const measure = await videoWorkspace(
      '::video{src="playback.webm"}',
      'theme:\n  fonts:\n    pair: system\n',
    );
    await buildReport({ input: measure, output: path.join(measure, 'size.html') });
    const budget = (await stat(path.join(measure, 'size.html'))).size + 32_768;
    const workspace = await videoWorkspace(
      '::video{src="playback.webm"}',
      `output:\n  maxInlineBytes: ${budget}\ntheme:\n  fonts:\n    pair: system\n`,
    );
    const result = await buildReport({ input: workspace, output: path.join(workspace, 'a.html') });
    expect(result.warnings).toEqual([]);

    const video = await readFile(path.join(workspace, 'playback.webm'));
    expect(video.length * 40).toBeGreaterThan(budget);
    await writeFile(path.join(workspace, 'playback.webm'), Buffer.concat(Array(40).fill(video)));
    await expect(
      buildReport({ input: workspace, output: path.join(workspace, 'b.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'INLINE_SIZE_BUDGET_EXCEEDED' } });
  });

  it('rejects a video or poster of an unplayable type with a remediation', async () => {
    const badVideo = await videoWorkspace('::video{src="poster.png"}');
    const videoError = await buildFailure(badVideo);
    expect(videoError.diagnostic).toMatchObject({
      code: 'INVALID_VIDEO_SOURCE',
      remediation: expect.stringContaining('WebM or MP4'),
      source: expect.objectContaining({ line: 7 }),
    });

    const badPoster = await videoWorkspace('::video{src="playback.webm" poster="playback.webm"}');
    const posterError = await buildFailure(badPoster);
    expect(posterError.diagnostic).toMatchObject({
      code: 'INVALID_VIDEO_SOURCE',
      message: expect.stringContaining('poster'),
    });
  });
});
