import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
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
      /<video class="semantic-video-player" controls muted loop playsinline preload="metadata" data-video-autoplay="" aria-label="Square moving right"><source src="data:video\/webm;base64,[A-Za-z0-9+/=]+" type="video\/webm"><\/video>/u,
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
      /<figure class="semantic-video"><video class="semantic-video-player" controls muted loop playsinline preload="none" data-video-autoplay="" poster="data:image\/png;base64,[^"]+" aria-label="The square slides across\."><source src="data:video\/webm;base64,[^"]+" type="video\/webm"><\/video><figcaption class="semantic-video-caption">The square slides across\.<\/figcaption><\/figure>/u,
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
    expect(html).toContain(`<source src="assets/${video}" type="video/webm">`);
    expect(html).toContain(`poster="assets/${poster}"`);
    expect(html).toContain('media-src data: &#x27;self&#x27;');
  });

  it('counts the embedded video against the inline size threshold', async () => {
    const workspace = await videoWorkspace(
      '::video{src="playback.webm"}',
      'output:\n  maxInlineBytes: 200000\n',
    );
    const result = await buildReport({ input: workspace, output: path.join(workspace, 'a.html') });
    expect(result.warnings).toEqual([]);

    const video = await readFile(path.join(workspace, 'playback.webm'));
    await writeFile(path.join(workspace, 'playback.webm'), Buffer.concat(Array(40).fill(video)));
    const heavier = await buildReport({
      input: workspace,
      output: path.join(workspace, 'b.html'),
    });
    expect(heavier.warnings).toContainEqual(
      expect.objectContaining({ code: 'INLINE_SIZE_THRESHOLD_EXCEEDED' }),
    );
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
