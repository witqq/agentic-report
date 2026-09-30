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

const LIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#fff"/></svg>';
const DARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#000"/></svg>';

/** A one-pixel PNG, a poster other than the fixture's. */
const DARK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** A page with a light and a dark picture, the video fixtures, and the given body. */
async function workspaceWith(body: string): Promise<string> {
  const workspace = await createTestWorkspace('image-variants');
  workspaces.push(workspace);
  await writeFile(path.join(workspace, 'light.svg'), LIGHT);
  await writeFile(path.join(workspace, 'dark.svg'), DARK);
  for (const file of ['playback.webm', 'poster.png'])
    await copyFile(path.resolve('tests/fixtures/video', file), path.join(workspace, file));
  await writeFile(path.join(workspace, 'poster-dark.png'), Buffer.from(DARK_PNG, 'base64'));
  await writeFile(
    path.join(workspace, 'report.md'),
    `---\ntitle: Variants\n---\n\n# Variants\n\n${body}\n`,
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

function base64(text: string): string {
  return Buffer.from(text).toString('base64');
}

describe('dark variant of an image', () => {
  it('embeds the dark file beside the light one and counts it in the budget', async () => {
    const plain = await workspaceWith('![Box](light.svg)');
    const withDark = await workspaceWith('![Box](light.svg){dark="dark.svg"} after');
    const plainResult = await buildReport({
      input: plain,
      output: path.join(plain, 'out.html'),
    });
    const result = await buildReport({ input: withDark, output: path.join(withDark, 'out.html') });
    const html = await readFile(path.join(withDark, 'out.html'), 'utf8');

    expect(html).toContain(
      `<img src="data:image/svg+xml;base64,${base64(LIGHT)}" alt="Box" data-dark-src="data:image/svg+xml;base64,${base64(DARK)}">`,
    );
    // The attribute block is consumed; the text after it stays.
    expect(html).not.toContain('{dark=');
    expect(html).toMatch(/> after<\/p>/u);
    expect(result.embeddedAssets).toBe(plainResult.embeddedAssets + 1);
  });

  it('copies the dark file into directory output', async () => {
    const workspace = await workspaceWith('![Box](light.svg){dark="dark.svg"}');
    const output = path.join(workspace, 'site');
    await buildReport({ input: workspace, output, format: 'directory' });
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const dark = (await readdir(path.join(output, 'assets'))).find((name) =>
      /^dark\.[0-9a-f]{12}\.svg$/u.test(name),
    );
    expect(dark).toBeDefined();
    expect(html).toContain(`data-dark-src="assets/${dark}"`);
  });

  it('keeps braces that are not attributes as text', async () => {
    const workspace = await workspaceWith('![Box](light.svg) {not attributes}');
    await buildReport({ input: workspace, output: path.join(workspace, 'out.html') });
    const html = await readFile(path.join(workspace, 'out.html'), 'utf8');
    expect(html).toContain('{not attributes}');
    expect(html).not.toMatch(/<img [^>]*data-dark-src/u);
  });

  it('fails when the dark file is missing', async () => {
    const error = await buildFailure(await workspaceWith('![Box](light.svg){dark="absent.svg"}'));
    expect(error.diagnostic.code).toBe('ASSET_READ_FAILED');
    expect(error.diagnostic.source?.line).toBe(7);
  });

  it('refuses another attribute, an empty dark, and a dark file that is not an image', async () => {
    const unknown = await buildFailure(
      await workspaceWith('![Box](light.svg){dark="dark.svg" width="20"}'),
    );
    expect(unknown.diagnostic.code).toBe('IMAGE_ATTRIBUTE_UNKNOWN');
    expect(unknown.diagnostic.source?.line).toBe(7);

    const empty = await buildFailure(await workspaceWith('![Box](light.svg){dark=""}'));
    expect(empty.diagnostic.code).toBe('IMAGE_DARK_VARIANT_EMPTY');

    const video = await buildFailure(
      await workspaceWith('![Box](light.svg){dark="playback.webm"}'),
    );
    expect(video.diagnostic.code).toBe('INVALID_IMAGE_DARK_VARIANT');

    const remote = await buildFailure(
      await workspaceWith('![Box](light.svg){dark="https://example.com/dark.svg"}'),
    );
    expect(remote.diagnostic.code).toBe('INVALID_IMAGE_DARK_VARIANT');
  });

  it('refuses a dark variant on a Markdown image of a recording', async () => {
    const error = await buildFailure(
      await workspaceWith('![Clip](playback.webm){dark="dark.svg"}'),
    );
    expect(error.diagnostic.code).toBe('INVALID_IMAGE_DARK_VARIANT');
  });
});

describe('dark variant of a video poster', () => {
  it('embeds dark-poster on the player and refuses it without a poster', async () => {
    const workspace = await workspaceWith(
      '::video{src="playback.webm" poster="poster.png" dark-poster="poster-dark.png" caption="Clip."}',
    );
    await buildReport({ input: workspace, output: path.join(workspace, 'out.html') });
    const html = await readFile(path.join(workspace, 'out.html'), 'utf8');
    expect(html).toMatch(/<video [^>]*data-dark-poster="data:image\/png;base64,/u);

    const error = await buildFailure(
      await workspaceWith(
        '::video{src="playback.webm" dark-poster="poster-dark.png" caption="Clip."}',
      ),
    );
    expect(error.diagnostic.code).toBe('INVALID_DIRECTIVE_ATTRIBUTE');
  });
});
