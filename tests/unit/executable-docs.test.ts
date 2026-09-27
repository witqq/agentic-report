/**
 * Catches documentation that teaches something the product refuses: a Markdown source block that no
 * longer validates, or a README command that no longer runs. Every `markdown` block of the public and
 * agent documentation is validated as a page; every `agentic-report` command in README shell blocks runs
 * against the built CLI in a scratch directory, in the order the block gives. A block or command that
 * cannot run as written is excluded by name with the reason. A run that executed nothing is red: a check
 * that found nothing to check has proved nothing.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Code } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { afterAll, describe, expect, it } from 'vitest';

import { AgenticReportError } from '../../src/diagnostics.js';
import { validateReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
afterAll(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(name: string): Promise<string> {
  const created = await createTestWorkspace(name);
  workspaces.push(created);
  return created;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.resolve(directory), { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.relative(process.cwd(), path.join(entry.parentPath, entry.name)))
    .sort();
}

async function documentationFiles(): Promise<string[]> {
  return [
    'README.md',
    'docs/AGENT-REFERENCE.md',
    'docs/product/source-contract.md',
    ...(await markdownFiles('skills/agentic-report')).filter(
      (file) => !file.endsWith('catalog.md'),
    ),
    ...(await markdownFiles('website/docs')),
    ...(await markdownFiles('extensions')).filter((file) => path.basename(file) === 'README.md'),
  ];
}

interface Block {
  readonly id: string;
  readonly lang: string;
  readonly value: string;
}

async function codeBlocks(file: string, langs: readonly string[]): Promise<Block[]> {
  const tree = unified()
    .use(remarkParse)
    .parse(await readFile(path.resolve(file), 'utf8'));
  const blocks: Block[] = [];
  visit(tree, 'code', (node: Code) => {
    const lang = node.lang ?? '';
    if (langs.includes(lang))
      blocks.push({ id: `${file}#${blocks.length + 1}`, lang, value: node.value });
  });
  return blocks;
}

/**
 * Blocks that show a fragment which cannot stand as a page, or an error on purpose. The key is
 * `<file>#<n>`, the n-th block of that language in the file.
 */
const SOURCE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'docs/product/source-contract.md#2':
    'shows one code fence whose terms are defined by a glossary elsewhere on the page',
  'website/docs/agent/index.md#1': 'a SKILL.md for a custom skill, not a page source',
};

/** Stand-in bytes for a local file a block names, so a block is judged on what it writes. */
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  '.md': 'Placeholder partial.\n',
  '.json': '{}\n',
  '.vtt': 'WEBVTT\n\n00:00.000 --> 00:01.000\nChapter\n',
  '.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>\n',
};

/**
 * A block that declares a reference extension (`extensions/<name>/…yaml`) gets the real folder from the
 * repository, so the block is checked against the extension as it ships, not against a stand-in.
 */
async function materializeExtensions(directory: string, source: string): Promise<void> {
  for (const match of source.matchAll(
    /(?:^|[\s[,"'])extensions\/([a-z][a-z0-9-]*)\/[\w.-]+\.ya?ml/gmu,
  )) {
    const name = match[1] ?? '';
    await cp(path.resolve('extensions', name), path.join(directory, 'extensions', name), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * A block that declares page data (`data/<name>.json`) gets the export of the shipped `run-report` example,
 * so a documented placeholder or expectation is checked against real data rather than an empty object.
 */
async function materializeData(directory: string, source: string): Promise<void> {
  for (const match of source.matchAll(/(?:^|[\s"'[,-])(data\/([a-z][a-z0-9-]*)\.json)/gmu)) {
    const relative = match[1] ?? '';
    await mkdir(path.join(directory, 'data'), { recursive: true });
    await cp(path.resolve('examples/run-report', relative), path.join(directory, relative), {
      force: true,
    });
  }
}

async function materializeReferences(directory: string, source: string): Promise<void> {
  await materializeExtensions(directory, source);
  await materializeData(directory, source);
  for (const match of source.matchAll(
    /(?:^|[\s"'(])((?:partials|assets|media)\/[\w./-]+\.(\w+))/gmu,
  )) {
    const relative = match[1] ?? '';
    const extension = path.extname(relative);
    const target = path.join(directory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, PLACEHOLDERS[extension] ?? '', { flag: 'w' });
  }
}

/** Commands, without the `agentic-report` prefix, that need material outside a scratch directory. */
const COMMAND_EXCEPTIONS: Readonly<Record<string, string>> = {
  'build ./report-source --output report.html': 'names a placeholder source directory',
  'build ./site-source --format directory --url https://example.com/guide/ --output ./public/guide':
    'names a placeholder source directory',
  'review ./review.json ./my-report --json': 'needs a review exported from a page',
  'sitemap ./public': 'needs a published tree of pages',
};

async function validatesAsPage(block: Block): Promise<unknown> {
  const directory = await workspace('docs-source');
  await materializeReferences(directory, block.value);
  // A localized entry named by the manifest is the same page in the other language; the primary entry
  // owns the rest of the metadata.
  const [, frontmatter = '', body = ''] =
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(block.value) ?? [];
  for (const match of frontmatter.matchAll(/^ {2}ru: ([\w./-]+\.md)$/gmu)) {
    const own = frontmatter.split('\n').filter((line) => /^(?:title|description):/u.test(line));
    await writeFile(
      path.join(directory, match[1] ?? ''),
      ['---', ...own, 'language: ru', '---', body].join('\n'),
    );
  }
  const standsAlone = /^(?:---\n|# )/u.test(block.value);
  await writeFile(
    path.join(directory, 'report.md'),
    standsAlone ? block.value : `# Example\n\n${block.value}\n`,
  );
  try {
    await validateReport({ input: directory });
    return [];
  } catch (error) {
    if (error instanceof AgenticReportError) return [error.diagnostic];
    throw error;
  }
}

const CLI_PREFIX =
  /^(?:npx (?:--yes )?agentic-report(?:@[\w.-]+)?|agentic-report|node dist\/node\/cli\.js) /u;

function commandLines(block: Block): string[] {
  return block.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => CLI_PREFIX.test(line))
    .map((line) => line.replace(CLI_PREFIX, ''));
}

function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

async function runCli(
  arguments_: readonly string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('dist/node/cli.js'), ...arguments_], {
      cwd,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

describe('executable documentation', () => {
  it('validates every Markdown source block of the public and agent documentation', async () => {
    let executed = 0;
    const failures: Record<string, unknown> = {};
    for (const file of await documentationFiles()) {
      for (const block of await codeBlocks(file, ['markdown', 'md'])) {
        if (block.id in SOURCE_EXCEPTIONS) continue;
        executed += 1;
        const errors = (await validatesAsPage(block)) as readonly {
          code: string;
          message: string;
        }[];
        if (errors.length > 0)
          failures[block.id] = errors.map((error) => `${error.code}: ${error.message}`);
      }
    }
    expect(executed).toBeGreaterThan(10);
    expect(failures).toEqual({});
  }, 120_000);

  it('runs every agentic-report command in README shell blocks', async () => {
    let executed = 0;
    const failures: Record<string, string> = {};
    for (const block of await codeBlocks('README.md', ['sh', 'bash'])) {
      const lines = commandLines(block).filter((line) => !(line in COMMAND_EXCEPTIONS));
      if (lines.length === 0) continue;
      // `..` in a command must stay inside the scratch area, so the commands run one level down.
      const root = await workspace('docs-commands');
      const cwd = path.join(root, 'work');
      await mkdir(cwd);
      await symlink(path.resolve('examples'), path.join(cwd, 'examples'));
      await symlink(path.resolve('website'), path.join(cwd, 'website'));
      for (const line of lines) {
        executed += 1;
        const result = await runCli(words(line), cwd);
        if (result.code !== 0) failures[`${block.id}: ${line}`] = result.stdout.slice(-400);
      }
    }
    expect(executed).toBeGreaterThan(10);
    expect(failures).toEqual({});
  }, 300_000);

  it('turns red on a block that does not validate', async () => {
    const errors = await validatesAsPage({
      id: 'planted',
      lang: 'markdown',
      value: ':::nonsense\n:::',
    });
    expect(errors).not.toEqual([]);
  });
});
