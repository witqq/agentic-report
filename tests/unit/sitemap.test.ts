import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BuildReportOptions } from '../../src/contracts.js';
import { buildReport } from '../../src/core/compiler.js';
import { generateSitemap } from '../../src/core/site-index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(): Promise<string> {
  const root = await createTestWorkspace('sitemap');
  workspaces.push(root);
  return root;
}

/** Страница, собранная настоящим компилятором: индекс читает только то, что тот сам записал. */
async function page(
  root: string,
  name: string,
  output: string,
  options: Partial<BuildReportOptions> = {},
): Promise<void> {
  const source = path.join(root, 'sources', name);
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, 'report.md'),
    `---\ntitle: ${name}\nlanguage: en\n---\n\n# ${name}\n\nText.\n`,
  );
  await buildReport({ input: source, output: path.join(root, 'public', output), ...options });
}

/** Полное состояние дерева: отказ обязан оставить его ровно таким, каким он был. */
async function snapshot(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isSymbolicLink()) result[relative] = 'symlink';
      else result[relative] = (await readFile(absolute)).toString('base64');
    }
  };
  await walk(directory);
  return result;
}

async function publishedTree(): Promise<{ readonly root: string; readonly tree: string }> {
  const root = await workspace();
  await page(root, 'home', 'index.html', { url: 'https://example.com/' });
  await page(root, 'guide', 'guide', { url: 'https://example.com/guide/', format: 'directory' });
  await page(root, 'about', 'about.html', { url: 'https://example.com/about.html?tab=a&v=1' });
  await writeFile(
    path.join(root, 'public', 'foreign.html'),
    '<!doctype html><html><head><title>Other tool</title></head><body></body></html>',
  );
  return { root, tree: path.join(root, 'public') };
}

describe('sitemap generation', () => {
  it('indexes the canonical URL of every compiler-built page and names the absolute sitemap in robots.txt', async () => {
    const { tree } = await publishedTree();

    const result = await generateSitemap({ directory: tree });

    expect(await readFile(path.join(tree, 'sitemap.xml'), 'utf8')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://example.com/</loc></url>',
        '  <url><loc>https://example.com/about.html?tab=a&amp;v=1</loc></url>',
        '  <url><loc>https://example.com/guide/</loc></url>',
        '</urlset>',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(tree, 'robots.txt'), 'utf8')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    );
    expect(result).toMatchObject({
      urls: [
        'https://example.com/',
        'https://example.com/about.html?tab=a&v=1',
        'https://example.com/guide/',
      ],
      skipped: ['foreign.html'],
    });
  });

  it.each([
    [
      'an existing sitemap',
      'SITEMAP_TARGET_EXISTS',
      async (tree: string) => writeFile(path.join(tree, 'sitemap.xml'), 'kept'),
    ],
    [
      'an existing robots.txt',
      'SITEMAP_TARGET_EXISTS',
      async (tree: string) => writeFile(path.join(tree, 'robots.txt'), 'kept'),
    ],
    [
      'a page on another origin',
      'SITEMAP_ORIGIN_MISMATCH',
      async (tree: string) =>
        page(path.dirname(tree), 'elsewhere', 'elsewhere/index.html', {
          url: 'https://example.org/elsewhere/',
        }),
    ],
    [
      'a page whose URL is not its place in the tree',
      'SITEMAP_PATH_MISMATCH',
      async (tree: string) =>
        page(path.dirname(tree), 'misplaced', 'misplaced/index.html', {
          url: 'https://example.com/other/',
        }),
    ],
    [
      'a directory index URL without its trailing slash',
      'SITEMAP_PATH_MISMATCH',
      async (tree: string) =>
        page(path.dirname(tree), 'slashless', 'slashless/index.html', {
          url: 'https://example.com/slashless',
        }),
    ],
    [
      'a compiler-built page without a URL',
      'SITEMAP_PAGE_WITHOUT_URL',
      async (tree: string) => page(path.dirname(tree), 'private', 'private.html'),
    ],
    [
      'a symbolic link',
      'SITEMAP_SPECIAL_FILE',
      async (tree: string) => symlink(path.join(tree, 'about.html'), path.join(tree, 'link.html')),
    ],
  ])('refuses %s and leaves the tree unchanged', async (_label, code, arrange) => {
    const { tree } = await publishedTree();
    await arrange(tree);
    const before = await snapshot(tree);

    await expect(generateSitemap({ directory: tree })).rejects.toMatchObject({
      diagnostic: { code },
    });
    expect(await snapshot(tree)).toEqual(before);
  });

  it('refuses a tree with no compiler-built page and a path that is not a directory', async () => {
    const root = await workspace();
    const tree = path.join(root, 'public');
    await mkdir(tree);
    await writeFile(path.join(tree, 'foreign.html'), '<html><head></head></html>');

    await expect(generateSitemap({ directory: tree })).rejects.toMatchObject({
      diagnostic: { code: 'SITEMAP_NO_PAGES', details: { skipped: ['foreign.html'] } },
    });
    await expect(
      generateSitemap({ directory: path.join(tree, 'foreign.html') }),
    ).rejects.toMatchObject({ diagnostic: { code: 'SITEMAP_DIRECTORY_INVALID' } });
    expect(await readdir(tree)).toEqual(['foreign.html']);
  });
});
