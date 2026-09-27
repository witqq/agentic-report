import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { SECTION_RECIPES } from '../../src/authoring/registry.js';
import type { AgenticReportError } from '../../src/diagnostics.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function build(markdown: string, frontmatter = ''): Promise<string> {
  const root = await createTestWorkspace('first-screen');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: First screen\nlanguage: en\nlayout: landing\n${frontmatter}---\n\n${markdown}`,
  );
  const poster = await readFile(path.resolve('tests/fixtures/video/poster.png'));
  await writeFile(path.join(root, 'a.png'), poster);
  await writeFile(path.join(root, 'b.png'), poster);
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  return readFile(output, 'utf8');
}

async function failure(markdown: string): Promise<AgenticReportError> {
  try {
    await build(markdown);
  } catch (error) {
    return error as AgenticReportError;
  }
  throw new Error('Build unexpectedly succeeded.');
}

const DEMO = '::::section{title="Result" recipe="demo"}\nThe result.\n::::';

describe('first screen', () => {
  it('puts the title, introduction and a demo section into one first-screen frame in reading order', async () => {
    const html = await build(
      [
        '# Product',
        'Introduction.',
        ':::actions',
        '::action[Try]{href="#product"}',
        ':::',
        DEMO,
      ].join('\n\n'),
    );
    const opening = /<div class="page-opening" data-page-opening="">(.*?)<\/section><\/div>/su.exec(
      html,
    )?.[1];
    expect(opening).toBeDefined();
    const order = ['<h1', 'Introduction.', 'semantic-actions', 'data-place="opening"'].map((mark) =>
      opening?.indexOf(mark),
    );
    expect(order.every((index) => index !== undefined && index >= 0)).toBe(true);
    expect([...order].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(order);
    expect(html).toMatch(/<div class="page-opening-copy"><h1/u);
  });

  it('leaves a page without a first-screen section unwrapped', async () => {
    const html = await build(
      '# Product\n\nIntroduction.\n\n::::section{title="Later"}\nText.\n::::',
    );
    // The runtime script names the `[data-page-opening]` selector, so the markup is checked by attribute.
    expect(html).not.toContain('data-page-opening=""');
  });

  it('refuses a first-screen section that is not first or has no page title', async () => {
    const later = await failure(
      `# Product\n\n::::section{title="First"}\nText.\n::::\n\n${DEMO}\n`,
    );
    expect(later.diagnostic.code).toBe('INVALID_DIRECTIVE_PLACEMENT');
    expect(later.diagnostic.message).toMatch(/Only the first section/u);
    const untitled = await failure(`Intro.\n\n${DEMO}\n`);
    expect(untitled.diagnostic.message).toMatch(/no # title/u);
  });

  it('writes the opening alignment and the progress element on the root', async () => {
    const html = await build('# Product\n\nIntro.\n', 'opening: start\nprogress: chapters\n');
    expect(html).toMatch(/<html[^>]*data-progress="chapters"[^>]*data-opening="start"/u);
    const plain = await build('# Product\n\nIntro.\n');
    expect(plain).toMatch(/<html[^>]*data-opening="center"/u);
    expect(plain).not.toMatch(/<html[^>]*data-progress=/u);
  });
});

describe('dramaturgy recipes', () => {
  it('names six forms and never defaults to the same entrance for every child', () => {
    expect(SECTION_RECIPES.map((recipe) => recipe.name)).toEqual(
      expect.arrayContaining(['thesis', 'statement', 'story', 'blueprint', 'demo']),
    );
    for (const recipe of SECTION_RECIPES) {
      const attributes = recipe.attributes as Readonly<Record<string, string>>;
      expect(attributes.transition, recipe.name).not.toBe('stagger');
      expect(attributes.choreography, recipe.name).toBeUndefined();
      expect(['mesh', 'glow']).not.toContain(attributes.surface);
    }
  });
});

describe('before and after', () => {
  it('lays the after image over the before image with a labelled range', async () => {
    const html = await build(
      '# Product\n\n:::compare{before="Draft"}\n![Draft page](a.png)\n![Built page](b.png)\n:::\n',
    );
    expect(html).toMatch(/<figure class="semantic-compare"[^>]*data-compare=""/u);
    expect(html).toContain('<div class="compare-after"><img');
    expect(html).toMatch(
      /<input type="range" min="0" max="100" step="1" value="50" class="compare-range ui-range" aria-label="Divider between Draft and After"/u,
    );
    expect(html).toContain('alt="Draft page"');
    expect(html).toContain('alt="Built page"');
  });

  it('refuses anything but exactly two images', async () => {
    for (const body of ['![One](a.png)', '![One](a.png)\n![Two](b.png)\n\nA caption.']) {
      const refused = await failure(`# Product\n\n:::compare\n${body}\n:::\n`);
      expect(refused.diagnostic.message, body).toMatch(/exactly two Markdown images/u);
    }
  });
});
