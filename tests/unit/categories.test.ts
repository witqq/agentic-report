import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport, getSourceContract, initProject } from '../../src/index.js';
import { BRIEF_FILE, briefDimensionIds, renderBriefTemplate } from '../../src/authoring/brief.js';
import { PAGE_CATEGORIES } from '../../src/authoring/registry.js';
import { parseUnifiedDiff } from '../../src/render/unified-diff.js';
import type { AgenticReportError } from '../../src/diagnostics.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(name: string): Promise<string> {
  const created = await createTestWorkspace(name);
  workspaces.push(created);
  return created;
}

async function buildSource(root: string, markdown: string): Promise<string> {
  await writeFile(path.join(root, 'report.md'), markdown);
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  return readFile(output, 'utf8');
}

async function buildFailure(root: string, markdown: string): Promise<AgenticReportError> {
  await writeFile(path.join(root, 'report.md'), markdown);
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    return error as AgenticReportError;
  }
  throw new Error('Build unexpectedly succeeded.');
}

const page = (layout: string, body: string): string =>
  ['---', 'title: Category probe', 'language: en', `layout: ${layout}`, '---', '', body].join('\n');

const DIFF = [
  ':::diff{file="src/a.ts"}',
  '```diff',
  '@@ -10,3 +10,4 @@ export function a() {',
  ' const x = 1;',
  '-const y = 2;',
  '+const y = 3;',
  '+const z = 4;',
  ' return x;',
  '```',
  ':::',
].join('\n');

const FINDINGS = [
  '::::findings{title="Findings"}',
  ':::finding{severity="minor" title="Name" location="src/a.ts:12"}',
  'Rename it.',
  ':::',
  ':::finding{severity="blocking" title="Key" location="src/a.ts:11"}',
  'The key changes on every retry.',
  ':::',
  ':::finding{severity="minor" title="Log"}',
  'Log the id.',
  ':::',
  '::::',
].join('\n');

const RESPONSE = [
  ':::::response{title="Answer" id="answer"}',
  '::::question{id="choice" kind="single" title="Which option?"}',
  '::option{id="a" label="A"}',
  '::option{id="b" label="B"}',
  '::::',
  ':::::',
].join('\n');

describe('page categories', () => {
  it('names one starter per category and publishes the categories through describe', () => {
    const contract = getSourceContract();
    expect(contract.page.categories.map((category) => category.id)).toEqual([
      'landing',
      'document',
      'dashboard',
      'presentation',
      'answer',
    ]);
    for (const category of contract.page.categories) {
      expect(category.subvariants.length).toBeGreaterThan(0);
      expect(category.dimensions.map((dimension) => dimension.id)).toContain('subvariant');
    }
    expect(PAGE_CATEGORIES.find((category) => category.id === 'document')?.subvariants).toContain(
      'code-review',
    );
    expect(PAGE_CATEGORIES.find((category) => category.id === 'answer')?.subvariants).toEqual([
      'choice',
      'questions',
      'survey',
      'brief',
    ]);
  });

  it('initializes every category starter as a buildable project with its own brief', async () => {
    const root = await workspace('category-starters');
    for (const category of PAGE_CATEGORIES) {
      const destination = path.join(root, category.id);
      const result = await initProject({ destination, starter: category.id });
      expect(result.starterId).toBe(category.id);
      expect(result.files).toContain(BRIEF_FILE);
      const brief = await readFile(path.join(destination, BRIEF_FILE), 'utf8');
      // Проект получает чистую заготовку, а не заполненный бриф образца из каталога стартера.
      expect(brief).toBe(renderBriefTemplate(category.id));
      expect(brief).toContain(`Category: \`${category.id}\``);
      expect(briefDimensionIds(brief), category.id).toEqual(
        category.dimensions.map((dimension) => dimension.id),
      );
      const output = path.join(root, `${category.id}.html`);
      await expect(buildReport({ input: destination, output })).resolves.toMatchObject({
        outputPath: output,
      });
      // Бриф — рабочий файл автора, а не часть страницы.
      expect(await readFile(output, 'utf8')).not.toContain('Checks switched off');
    }
  }, 20_000);

  it('lets a landing page use answer and review tools and a document use landing recipes', async () => {
    const landing = await buildSource(
      await workspace('landing-with-answer'),
      page(
        'landing',
        [
          '# Landing with a form',
          '::::::section{title="Try it" recipe="hero"}',
          'Opening.',
          '::::::',
          RESPONSE,
          DIFF,
          FINDINGS,
        ].join('\n\n'),
      ),
    );
    expect(landing).toContain('data-semantic="response"');
    expect(landing).toContain('data-semantic="diff"');
    expect(landing).toContain('data-semantic="findings"');

    const document = await buildSource(
      await workspace('document-with-landing'),
      page(
        'document',
        [
          '# Document with a hero',
          '::::::section{title="Stage" recipe="hero"}',
          ':::actions',
          '::action[Start]{href="#stage"}',
          ':::',
          '::::::',
          '::::cards',
          ':::card{title="Build" status="good"}',
          'Green.',
          ':::',
          '::::',
        ].join('\n\n'),
      ),
    );
    expect(document).toContain('data-recipe="hero"');
    expect(document).toContain('data-semantic="action"');
    expect(document).toContain('data-status="good"');
  });
});

describe('unified diff', () => {
  it('numbers old and new lines from the hunk header', () => {
    const parsed = parseUnifiedDiff(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -10,3 +10,4 @@',
        ' keep',
        '-old',
        '+new',
        '+added',
        ' keep',
        '\\ No newline at end of file',
      ].join('\n'),
    );
    expect(parsed).toEqual({
      kind: 'valid',
      lines: [
        { kind: 'header' },
        { kind: 'header' },
        { kind: 'header' },
        { kind: 'hunk' },
        { kind: 'context', old: 10, new: 10 },
        { kind: 'remove', old: 11 },
        { kind: 'add', new: 11 },
        { kind: 'add', new: 12 },
        { kind: 'context', old: 12, new: 13 },
        { kind: 'note' },
      ],
    });
    expect(parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n')).toMatchObject({ kind: 'valid' });
    // Дифф нескольких файлов: заголовки следующего файла идут после строки `diff`.
    expect(
      parseUnifiedDiff(
        'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/c b/c\n--- a/c\n+++ b/c\n@@ -1 +1 @@\n-c\n+d\n',
      ),
    ).toMatchObject({ kind: 'valid' });
  });

  it('refuses a diff whose hunks do not match their headers or that has no hunk', () => {
    for (const [source, message] of [
      ['@@ -1,2 +1,2 @@\n-a\n+b\n', /line counts/u],
      ['@@ -1 +1 @@\n-a\n+b\n+c\n', /line counts/u],
      ['just text\n', /before the first @@/u],
      ['--- a\n+++ b\n', /at least one @@ hunk/u],
      ['@@ -1 +1 @@\n*a\n', /neither \+, - nor a space/u],
    ] as const) {
      const parsed = parseUnifiedDiff(source);
      expect(parsed.kind, source).toBe('invalid');
      if (parsed.kind === 'invalid') expect(parsed.message, source).toMatch(message);
    }
  });

  it('renders line kinds and numbers so copying the block yields the diff text', async () => {
    const html = await buildSource(
      await workspace('diff-render'),
      page('document', ['# Diff', DIFF].join('\n\n')),
    );
    // The path breaks only at its separators (`src/render/tables.ts`).
    expect(html).toContain('<code class="semantic-diff-file">src/<wbr>a.<wbr>ts</code>');
    expect(html).toContain('2 lines added, 1 removed');
    expect(html).toMatch(/data-diff="remove" data-old="11" data-gutter="11 {3}"/u);
    expect(html).toMatch(/data-diff="add" data-new="12" data-gutter=" {3}12"/u);
    expect(html).toMatch(/data-diff="context" data-old="12" data-new="13" data-gutter="12 13"/u);
  });

  it('reports a diff that is not one fenced block of hunks at its source line', async () => {
    const root = await workspace('diff-invalid');
    const prose = await buildFailure(
      root,
      page('document', '# Diff\n\n:::diff\nJust prose.\n:::\n'),
    );
    expect(prose.diagnostic).toMatchObject({ code: 'INVALID_DIFF', source: { line: 9 } });
    const language = await buildFailure(
      root,
      page('document', '# Diff\n\n:::diff\n```ts\n@@ -1 +1 @@\n-a\n+b\n```\n:::\n'),
    );
    expect(language.diagnostic.message).toMatch(/marked as ts/u);
    const counts = await buildFailure(
      root,
      page('document', '# Diff\n\n:::diff\n```diff\n@@ -1,3 +1 @@\n-a\n+b\n```\n:::\n'),
    );
    expect(counts.diagnostic.message).toMatch(/line counts/u);
  });
});

describe('findings and card status', () => {
  it('summarizes findings by severity in severity order and labels each one in words', async () => {
    const html = await buildSource(
      await workspace('findings-render'),
      page('document', ['# Review', FINDINGS].join('\n\n')),
    );
    const summary = /<ul class="semantic-findings-summary"[^>]*>(.*?)<\/ul>/u.exec(html)?.[1];
    expect(summary).toBe(
      '<li class="semantic-severity ui-label" data-severity="blocking">Blocking <span class="semantic-severity-count">1</span></li>' +
        '<li class="semantic-severity ui-label" data-severity="minor">Minor <span class="semantic-severity-count">2</span></li>',
    );
    // Порядок находок — авторский; под заголовком группы заголовки находок на уровень ниже.
    expect(
      [...html.matchAll(/<h4 class="semantic-title ui-item-title">([^<]+)<\/h4>/gu)].map(
        (m) => m[1],
      ),
    ).toEqual(['Name', 'Key', 'Log']);
    expect(html).toContain(
      '<code class="semantic-finding-location ui-meta">src/<wbr>a.<wbr>ts:<wbr>11</code>',
    );
  });

  it('refuses a finding outside findings and a severity outside the closed set', async () => {
    const root = await workspace('findings-invalid');
    const orphan = await buildFailure(
      root,
      page('document', '# Review\n\n:::finding{severity="minor" title="Alone"}\nText.\n:::\n'),
    );
    expect(orphan.diagnostic.code).toBe('INVALID_DIRECTIVE_PLACEMENT');
    const severity = await buildFailure(
      root,
      page(
        'document',
        '# Review\n\n::::findings\n:::finding{severity="critical" title="Bad"}\nText.\n:::\n::::\n',
      ),
    );
    expect(severity.diagnostic.code).toBe('INVALID_DIRECTIVE_ATTRIBUTE');
  });

  it('shows a card status as a localized word and nothing for the default', async () => {
    const markdown = [
      '# Status',
      '::::cards',
      ':::card{title="Build" status="watch"}',
      'Pending.',
      ':::',
      ':::card{title="Plain"}',
      'No status.',
      ':::',
      '::::',
    ].join('\n\n');
    const english = await buildSource(await workspace('status-en'), page('dashboard', markdown));
    expect(english).toContain('<p class="semantic-status ui-label">Watch</p>');
    expect(english.match(/class="semantic-status ui-label"/gu)).toHaveLength(1);
    const russian = await buildSource(
      await workspace('status-ru'),
      page('dashboard', markdown).replace('language: en', 'language: ru'),
    );
    expect(russian).toContain('<p class="semantic-status ui-label">Под наблюдением</p>');
  });
});
