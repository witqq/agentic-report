import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('generated in-flow contents', () => {
  it.each(['single-file', 'directory'] as const)(
    'uses exact final section headings while sidebar navigation stays short in %s output',
    async (format) => {
      const workspace = await trackedWorkspace(`contents-${format}`);
      const source = path.join(workspace, 'report.md');
      await writeFile(
        source,
        [
          '# Route map',
          '',
          '::contents',
          '',
          '## Long proof heading',
          '',
          'This legacy heading reserves the first generated slug but is not a primary item when explicit sections exist.',
          '',
          ':::section{title="Long proof heading" nav="Proof"}',
          '### Proof detail',
          'The generated section anchor must avoid the legacy heading collision.',
          ':::',
          '',
          ':::section{title="Second exact question with a deliberately long heading" nav="Next"}',
          'The second section keeps its full question in the in-flow map.',
          ':::',
          '',
          ':::glossary{key="appendix-definition" term="Appendix-only definition" placement="appendix"}',
          'A generated appendix heading is outside primary navigation.',
          ':::',
        ].join('\n'),
      );
      const output = path.join(
        workspace,
        format === 'single-file' ? 'report.html' : 'report-directory',
      );
      const result = await buildReport({ input: source, output, format });
      const html = await readFile(result.outputPath, 'utf8');
      const inFlow = requireRegion(html, /<nav class="semantic-contents"[\s\S]*?<\/nav>/u);
      const sidebar = requireRegion(html, /<nav[^>]*data-navigation="true"[\s\S]*?<\/nav>/u);

      expect(inFlow).toContain('aria-label="Content sections"');
      expect(inFlow).toContain('<a href="#long-proof-heading-2">Long proof heading</a>');
      expect(inFlow).toContain(
        '<a href="#second-exact-question-with-a-deliberately-long-heading">Second exact question with a deliberately long heading</a>',
      );
      expect(inFlow.indexOf('Long proof heading')).toBeLessThan(
        inFlow.indexOf('Second exact question with a deliberately long heading'),
      );
      expect(inFlow).not.toContain('Proof detail');
      expect(inFlow).not.toContain('Glossary');
      expect(sidebar).toContain(
        '<a href="#long-proof-heading-2" aria-current="location">Proof</a>',
      );
      expect(sidebar).toContain(
        '<a href="#second-exact-question-with-a-deliberately-long-heading">Next</a>',
      );
      expect(sidebar).not.toContain('Second exact question with a deliberately long heading');
    },
  );

  it.each([
    {
      name: 'initial order',
      sections: [
        { title: 'Alpha original question', nav: 'Alpha' },
        { title: 'Beta original question', nav: 'Beta' },
      ],
      first: 'Alpha original question',
      second: 'Beta original question',
      href: '#alpha-original-question',
    },
    {
      name: 'renamed and reordered',
      sections: [
        { title: 'Beta renamed question', nav: 'Beta' },
        { title: 'Alpha original question', nav: 'Alpha' },
      ],
      first: 'Beta renamed question',
      second: 'Alpha original question',
      href: '#beta-renamed-question',
    },
  ] as const)(
    'projects the current $name titles, order, and targets without an authored list',
    async ({ sections, first, second, href }) => {
      const workspace = await trackedWorkspace('contents-sync');
      const source = path.join(workspace, 'report.md');
      await writeFile(source, contentsSource(sections));
      const result = await buildReport({
        input: source,
        output: path.join(workspace, 'report.html'),
      });
      const html = await readFile(result.outputPath, 'utf8');
      const inFlow = requireRegion(html, /<nav class="semantic-contents"[\s\S]*?<\/nav>/u);
      expect(inFlow).toContain(`<a href="${href}">${first}</a>`);
      expect(inFlow.indexOf(first)).toBeLessThan(inFlow.indexOf(second));
    },
  );

  it('keeps zero and one-item maps in flow while sidebar chrome still requires two items', async () => {
    const workspace = await trackedWorkspace('contents-cardinality');
    const cases = [
      {
        name: 'empty',
        markdown: '# Empty map\n\n::contents\n',
        expectedLinks: 0,
        sidebar: false,
        excludedLabels: [],
      },
      {
        name: 'one',
        markdown:
          '# One section\n\n::contents\n\n:::section{title="Only exact section" nav="Only"}\nBody.\n:::\n',
        expectedLinks: 1,
        sidebar: false,
        excludedLabels: [],
      },
      {
        name: 'legacy',
        markdown:
          '# Legacy map\n\n::contents\n\n## First legacy\n\n### Legacy detail\n\nBody.\n\n## Second legacy\n\nBody.\n\n:::glossary{key="legacy-appendix" term="Legacy appendix definition" placement="appendix"}\nAppendix body.\n:::\n',
        expectedLinks: 2,
        sidebar: true,
        excludedLabels: ['Legacy detail', 'Glossary'],
      },
    ] as const;

    for (const fixture of cases) {
      const source = path.join(workspace, `${fixture.name}.md`);
      const output = path.join(workspace, `${fixture.name}.html`);
      await writeFile(source, fixture.markdown);
      const result = await buildReport({ input: source, output });
      const html = await readFile(result.outputPath, 'utf8');
      const inFlow = requireRegion(html, /<nav class="semantic-contents"[\s\S]*?<\/nav>/u);
      expect(inFlow.match(/<a href="#/gu) ?? []).toHaveLength(fixture.expectedLinks);
      expect(html.includes('data-navigation="true"')).toBe(fixture.sidebar);
      const sidebar = fixture.sidebar
        ? requireRegion(html, /<nav[^>]*data-navigation="true"[\s\S]*?<\/nav>/u)
        : '';
      for (const label of fixture.excludedLabels) {
        expect(inFlow).not.toContain(label);
        expect(sidebar).not.toContain(label);
      }
    }
  });

  it('projects the same final inventory into every authored contents declaration', async () => {
    const workspace = await trackedWorkspace('contents-multiple');
    const source = path.join(workspace, 'report.md');
    await writeFile(
      source,
      [
        '# Repeated route map',
        '',
        '::contents',
        '',
        ':::section{title="First exact section" nav="First"}',
        'Body.',
        ':::',
        '',
        '::contents',
        '',
        ':::section{title="Second exact section" nav="Second"}',
        'Body.',
        ':::',
      ].join('\n'),
    );
    const result = await buildReport({
      input: source,
      output: path.join(workspace, 'report.html'),
    });
    const html = await readFile(result.outputPath, 'utf8');
    const maps = html.match(/<nav class="semantic-contents"[\s\S]*?<\/nav>/gu) ?? [];

    expect(maps).toHaveLength(2);
    for (const map of maps) {
      expect(map).toContain('<a href="#first-exact-section">First exact section</a>');
      expect(map).toContain('<a href="#second-exact-section">Second exact section</a>');
    }
  });

  it.each([
    {
      name: 'container form',
      markdown: '# Invalid\n\n:::contents\n:::\n',
      code: 'INVALID_DIRECTIVE_FORM',
      column: 1,
    },
    {
      name: 'attribute',
      markdown: '# Invalid\n\n::contents{title="Manual"}\n',
      code: 'UNKNOWN_DIRECTIVE_ATTRIBUTE',
      column: 1,
    },
    {
      name: 'label',
      markdown: '# Invalid\n\n::contents[Manual list]\n',
      code: 'INVALID_DIRECTIVE_PLACEMENT',
      column: 1,
    },
    {
      name: 'nested placement',
      markdown: '# Invalid\n\n> ::contents\n',
      code: 'INVALID_DIRECTIVE_PLACEMENT',
      column: 3,
    },
  ] as const)(
    'rejects invalid $name with authored source evidence',
    async ({ markdown, code, column }) => {
      const workspace = await trackedWorkspace('contents-invalid');
      const source = path.join(workspace, 'report.md');
      await writeFile(source, markdown);
      await expect(
        buildReport({ input: source, output: path.join(workspace, 'report.html') }),
      ).rejects.toMatchObject({
        diagnostic: {
          code,
          source: { file: source, line: 3, column },
        },
      });
    },
  );
});

async function trackedWorkspace(name: string): Promise<string> {
  const workspace = await createTestWorkspace(name);
  workspaces.push(workspace);
  return workspace;
}

function requireRegion(html: string, pattern: RegExp): string {
  const match = pattern.exec(html)?.[0];
  if (match === undefined) throw new Error(`Missing expected HTML region: ${String(pattern)}`);
  return match;
}

function contentsSource(
  sections: readonly { readonly title: string; readonly nav: string }[],
): string {
  return [
    '# Mutable route map',
    '',
    '::contents',
    '',
    ...sections.flatMap((section) => [
      `:::section{title="${section.title}" nav="${section.nav}"}`,
      'Body.',
      ':::',
      '',
    ]),
  ].join('\n');
}
