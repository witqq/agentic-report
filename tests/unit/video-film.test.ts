import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { readScreencastFilm } from '../../src/render/screencast-film.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * `::video{from="…"}`: a film written by `agentic-screencast web` expands into the sources, poster and
 * chapters an author would write by hand. The fixture film (`tests/fixtures/video/film`) carries a
 * version-1 manifest, real poster frames, WebVTT chapters and three real one-frame encodings (AV1 and
 * H.264 with AAC, VP9 with Opus) that carry the silent audio track agentic-screencast gives a film
 * without voice; `tests/fixtures/video/codecs/make.sh` regenerates them.
 */
const FILM = path.resolve('tests/fixtures/video/film');
const CODECS = path.resolve('tests/fixtures/video/codecs');
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(body: string): Promise<string> {
  const root = await createTestWorkspace('video-film');
  workspaces.push(root);
  await cp(FILM, path.join(root, 'film'), { recursive: true });
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Film\nlanguage: ru\n---\n\n# Film\n\n${body}\n`,
  );
  return root;
}

async function manifest(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, 'film', 'demo.web.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

async function rewriteManifest(
  root: string,
  change: (value: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  await writeFile(
    path.join(root, 'film', 'demo.web.json'),
    JSON.stringify(change(await manifest(root))),
  );
}

async function buildFails(root: string): Promise<{ code: string; message: string }> {
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    const diagnostic = (error as { diagnostic?: { code: string; message: string } }).diagnostic;
    if (diagnostic !== undefined) return diagnostic;
    throw error;
  }
  throw new Error('The build was expected to fail.');
}

describe('film manifest resolution', () => {
  it('keeps every encoding in the manifest order, not re-sorted by compatibility', async () => {
    const root = await workspace('');
    const film = await readScreencastFilm('film/demo.web.json', root);
    expect(film.sources).toEqual(['film/demo.av1.mp4', 'film/demo.vp9.webm', 'film/demo.h264.mp4']);
  });

  it('takes the WebP poster, the chapters and the film language from the manifest', async () => {
    const root = await workspace('');
    const film = await readScreencastFilm('film/demo.web.json', root);
    expect(film).toMatchObject({
      manifest: 'film/demo.web.json',
      poster: 'film/demo.poster.webp',
      chapters: 'film/demo.chapters.vtt',
      lang: 'en',
    });
  });

  it('falls back to the JPEG poster when the manifest has no WebP frame', async () => {
    const root = await workspace('');
    await rewriteManifest(root, (value) => ({ ...value, poster: { jpg: 'demo.poster.jpg' } }));
    expect((await readScreencastFilm('film', root)).poster).toBe('film/demo.poster.jpg');
  });

  it('finds the single manifest when from names the directory', async () => {
    const root = await workspace('');
    expect((await readScreencastFilm('film', root)).manifest).toBe('film/demo.web.json');
  });

  it('refuses a directory with two manifests instead of picking one silently', async () => {
    const root = await workspace('');
    await writeFile(path.join(root, 'film', 'other.web.json'), '{}');
    await expect(readScreencastFilm('film', root)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_VIDEO_MANIFEST',
        message: expect.stringContaining('2 film manifests'),
        remediation: expect.stringContaining('from="film/demo.web.json"'),
      },
    });
  });

  it('refuses a directory without a manifest', async () => {
    const root = await workspace('');
    await mkdir(path.join(root, 'empty'));
    await expect(readScreencastFilm('empty', root)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_VIDEO_MANIFEST',
        message: expect.stringContaining('no .web.json'),
      },
    });
  });

  it('refuses a manifest version it does not read', async () => {
    const root = await workspace('');
    await rewriteManifest(root, (value) => ({ ...value, version: 2 }));
    await expect(readScreencastFilm('film/demo.web.json', root)).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_VIDEO_MANIFEST', message: expect.stringContaining('version 2') },
    });
  });

  it('refuses a manifest path that leaves the source root', async () => {
    const root = await workspace('');
    await rewriteManifest(root, (value) => ({
      ...value,
      sources: [{ src: '../../outside.mp4' }],
    }));
    await expect(readScreencastFilm('film/demo.web.json', root)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_VIDEO_MANIFEST',
        message: expect.stringContaining('outside the report source directory'),
      },
    });
  });

  it('refuses a from path that leaves the source root', async () => {
    const root = await workspace('');
    await expect(readScreencastFilm('../film/demo.web.json', root)).rejects.toMatchObject({
      diagnostic: { code: 'ASSET_OUTSIDE_SOURCE' },
    });
  });

  it('names the missing encoding of a manifest copied without it', async () => {
    const root = await workspace('');
    await rm(path.join(root, 'film', 'demo.vp9.webm'));
    await expect(readScreencastFilm('film/demo.web.json', root)).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_VIDEO_MANIFEST',
        message: expect.stringContaining('film/demo.vp9.webm is missing'),
      },
    });
  });

  it('refuses a JSON file that is not a film manifest', async () => {
    const root = await workspace('');
    await rewriteManifest(root, () => ({ version: 1, sources: [] }));
    await expect(readScreencastFilm('film/demo.web.json', root)).rejects.toMatchObject({
      diagnostic: { code: 'INVALID_VIDEO_MANIFEST' },
    });
  });
});

describe('::video{from}', () => {
  it('offers every manifest encoding in manifest order with the poster and a chapters track in directory output', async () => {
    const root = await workspace('::video{from="film/demo.web.json" caption="The run."}');
    const result = await buildReport({
      input: root,
      output: path.join(root, 'site'),
      format: 'directory',
    });
    expect(result.warnings).toEqual([]);
    const html = await readFile(path.join(root, 'site', 'index.html'), 'utf8');
    const sources = [
      ...html.matchAll(/<source src="assets\/demo\.(\w+)\.[0-9a-f]{12}\.(?:mp4|webm)"/gu),
    ].map((match) => match[1]);
    expect(sources).toEqual(['av1', 'vp9', 'h264']);
    expect(html).toMatch(/<video [^>]*poster="assets\/demo\.poster\.[0-9a-f]{12}\.webp"/u);
    // The track is named by the film's language (en), not the page's (ru).
    expect(html).toMatch(
      /<track kind="chapters" src="data:text\/vtt;base64,[^"]+" [^>]*srclang="en">/u,
    );
    expect(html).toContain('The merged page</button>');
  });

  it('embeds exactly one source, the most compatible, in one file without a warning', async () => {
    const root = await workspace('::video{from="film"}');
    const result = await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html.match(/<source /gu)).toHaveLength(1);
    expect(html).toContain('type="video/mp4; codecs=&#x22;avc1.64000a, mp4a.40.2&#x22;"');
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      'VIDEO_SOURCES_SINGLE_FILE',
    );
  });

  it('lets the attributes written by the author override the manifest', async () => {
    const root = await workspace(
      '::video{from="film" sources="film/demo.h264.mp4" poster="film/demo.poster.jpg" chapters="own.vtt"}',
    );
    await writeFile(path.join(root, 'own.vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nMine\n');
    await buildReport({ input: root, output: path.join(root, 'site'), format: 'directory' });
    const html = await readFile(path.join(root, 'site', 'index.html'), 'utf8');
    expect(html.match(/<source /gu)).toHaveLength(1);
    expect(html).toMatch(/<source src="assets\/demo\.h264\./u);
    expect(html).toMatch(/poster="assets\/demo\.poster\.[0-9a-f]{12}\.jpg"/u);
    expect(html).toContain('Mine</button>');
    // Chapters of the author are in the page language.
    expect(html).toMatch(/<track [^>]*srclang="ru">/u);
  });

  it("keeps the manifest's type as written when it names what the file holds", async () => {
    const root = await workspace('::video{from="film"}');
    await rewriteManifest(root, (value) => ({
      ...value,
      sources: (value.sources as { src: string; type: string }[]).map((source) => ({
        ...source,
        type: source.type.replace('avc1.64000a', 'avc1.64000A'),
      })),
    }));
    const result = await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html).toContain('type="video/mp4; codecs=&#x22;avc1.64000A, mp4a.40.2&#x22;"');
    expect(result.warnings.map((warning) => warning.code)).not.toContain('VIDEO_MANIFEST_MISMATCH');
  });

  it('writes the type the file holds and warns when the manifest disagrees', async () => {
    const root = await workspace('::video{from="film"}');
    // What agentic-screencast wrote before reading the level and the audio codec from its output.
    await rewriteManifest(root, (value) => ({
      ...value,
      audio: false,
      sources: [
        { src: 'demo.av1.mp4', type: 'video/mp4; codecs="av01.0.08M.08"' },
        { src: 'demo.vp9.webm', type: 'video/webm; codecs="vp9, opus"' },
        { src: 'demo.h264.mp4', type: 'video/mp4; codecs="avc1.640028"' },
      ],
    }));
    const result = await buildReport({
      input: root,
      output: path.join(root, 'site'),
      format: 'directory',
    });
    const html = await readFile(path.join(root, 'site', 'index.html'), 'utf8');
    const types = [...html.matchAll(/<source [^>]*type="([^"]+)"/gu)].map((match) =>
      match[1]?.replaceAll('&#x22;', '"'),
    );
    expect(types).toEqual([
      'video/mp4; codecs="av01.0.00M.08, mp4a.40.2"',
      'video/webm; codecs="vp9, opus"',
      'video/mp4; codecs="avc1.64000a, mp4a.40.2"',
    ]);
    const mismatches = result.warnings.filter(
      (warning) => warning.code === 'VIDEO_MANIFEST_MISMATCH',
    );
    expect(mismatches.map((warning) => warning.details)).toEqual([
      {
        film: 'film/demo.web.json',
        source: 'film/demo.av1.mp4',
        field: 'type',
        manifest: 'video/mp4; codecs="av01.0.08M.08"',
        file: 'video/mp4; codecs="av01.0.00M.08, mp4a.40.2"',
      },
      {
        film: 'film/demo.web.json',
        source: 'film/demo.av1.mp4',
        field: 'audio',
        manifest: false,
        file: true,
      },
      expect.objectContaining({ source: 'film/demo.vp9.webm', field: 'audio' }),
      expect.objectContaining({
        source: 'film/demo.h264.mp4',
        field: 'type',
        manifest: 'video/mp4; codecs="avc1.640028"',
      }),
      expect.objectContaining({ source: 'film/demo.h264.mp4', field: 'audio' }),
    ]);
    expect(mismatches[0]).toMatchObject({ level: 'warning' });
  });

  it("follows the manifest when a file's tracks cannot be read", async () => {
    const root = await workspace('::video{from="film"}');
    await writeFile(path.join(root, 'film', 'demo.h264.mp4'), 'not an mp4');
    const result = await buildReport({
      input: root,
      output: path.join(root, 'site'),
      format: 'directory',
    });
    const html = await readFile(path.join(root, 'site', 'index.html'), 'utf8');
    expect(html).toMatch(
      /<source src="assets\/demo\.h264\.[0-9a-f]{12}\.mp4" type="video\/mp4; codecs=&#x22;avc1\.64000a, mp4a\.40\.2&#x22;">/u,
    );
    expect(result.warnings.map((warning) => warning.code)).not.toContain('VIDEO_MANIFEST_MISMATCH');
  });

  it('plays a film without voice as a muted clip, though its silent track is audio', async () => {
    const root = await workspace('::video{from="film"}');
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const video = /<video[^>]*>/u.exec(await readFile(path.join(root, 'page.html'), 'utf8'))?.[0];
    expect(video).toContain('muted loop');
    expect(video).toContain('data-video-autoplay');
  });

  it('plays a film with voice manually, with sound, unless the author chose a mode', async () => {
    const voiced = async (attributes: string): Promise<string> => {
      const root = await workspace(`::video{from="film"${attributes}}`);
      await cp(path.join(CODECS, 'h264-aac.mp4'), path.join(root, 'film', 'demo.h264.mp4'));
      await buildReport({ input: root, output: path.join(root, 'page.html') });
      return /<video[^>]*>/u.exec(await readFile(path.join(root, 'page.html'), 'utf8'))?.[0] ?? '';
    };
    const manual = await voiced('');
    expect(manual).toContain(' controls');
    expect(manual).not.toContain('muted');
    expect(manual).not.toContain('data-video-autoplay');
    const clip = await voiced(' mode="clip"');
    expect(clip).toContain('muted loop');
    expect(clip).toContain('data-video-autoplay');
  });

  it('refuses from together with src', async () => {
    const root = await workspace('::video{from="film" src="film/demo.h264.mp4"}');
    expect(await buildFails(root)).toMatchObject({
      code: 'INVALID_DIRECTIVE_ATTRIBUTE',
      message: expect.stringContaining('src and from both name the recording'),
    });
  });

  it('refuses a video with neither src nor from', async () => {
    const root = await workspace('::video{caption="Nothing."}');
    expect(await buildFails(root)).toMatchObject({
      code: 'INVALID_DIRECTIVE_ATTRIBUTE',
      message: expect.stringContaining('A video needs its recording'),
    });
  });

  it('reports a broken film at the directive in the page', async () => {
    const root = await workspace('::video{from="film"}');
    await rewriteManifest(root, (value) => ({ ...value, version: 7 }));
    expect(await buildFails(root)).toMatchObject({ code: 'INVALID_VIDEO_MANIFEST' });
  });
});
