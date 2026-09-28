/**
 * Page data (`data` in the manifest): values and repeated blocks from confined JSON files, settled when
 * the page builds, and control values that fail the build at their line. Each test names the defect it
 * catches.
 */
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import { inspectReport, validateReport } from '../../src/core/analyze-report.js';
import type { Diagnostic } from '../../src/contracts.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

const RUN = {
  id: 96,
  status: 'done',
  title: 'Nightly <b>run</b> :::callout',
  findings: 0,
  empty: null,
  blocks: [
    { title: 'Plan', items: 3, status: 'accepted' },
    { title: 'Review', items: 9, status: 'returned' },
  ],
  tags: ['api', 'web'],
};

async function page(
  body: string,
  data: Readonly<Record<string, unknown>> = { 'data/run.json': RUN },
  frontmatter = 'data: [data/run.json]',
): Promise<string> {
  const workspace = await createTestWorkspace('page-data');
  workspaces.push(workspace);
  for (const [file, value] of Object.entries(data)) {
    await mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
    await writeFile(
      path.join(workspace, file),
      typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    );
  }
  await writeFile(
    path.join(workspace, 'report.md'),
    `---\ntitle: Data page\n${frontmatter}\n---\n\n${body}`,
  );
  return workspace;
}

async function html(workspace: string): Promise<string> {
  const output = path.join(workspace, 'out.html');
  await buildReport({ input: workspace, output });
  const text = await readFile(output, 'utf8');
  const start = text.indexOf('<main');
  return text.slice(start === -1 ? 0 : start);
}

async function failure(workspace: string): Promise<readonly Diagnostic[]> {
  try {
    await validateReport({ input: workspace });
  } catch (error) {
    if (error instanceof AgenticReportError)
      return [error.diagnostic, ...(error.diagnostic.related ?? [])];
    throw error;
  }
  throw new Error('The page validated.');
}

describe('page data', () => {
  // Defect: values never reach the page, or reach it only in text and not in attributes and code.
  it('substitutes values into text, directive attributes, code and link targets', async () => {
    const body = [
      'Run {{run.id}} is {{run.status}}; `id={{run.id}}`.',
      '',
      ':::callout{title="Run {{run.id}}"}',
      'Findings: {{ run.findings }}. First tag: {{run.tags.0}}.',
      ':::',
      '',
      '[Open run {{run.id}}](https://example.com/runs/{{run.id}})',
      '',
    ].join('\n');
    const out = await html(await page(body));
    expect(out).toContain('Run 96 is done; <code>id=96</code>.');
    expect(out).toContain('Run 96</p>');
    expect(out).toContain('Findings: 0. First tag: api.');
    expect(out).toContain('href="https://example.com/runs/96"');
    expect(out).not.toContain('{{');
  });

  // Defect: a value is parsed as Markdown, so data could open a directive or insert HTML.
  it('places a value as text: markup in the data stays literal and cannot inject', async () => {
    const out = await html(
      await page('Title: {{run.title}}\n\n:::callout{title="{{run.title}}"}\nBody.\n:::\n'),
    );
    expect(out).toContain('Title: Nightly &#x3C;b>run&#x3C;/b> :::callout');
    expect(out).not.toContain('<b>run</b>');
    // The only callout on the page is the authored one, carrying the value as its title text.
    expect(out.match(/semantic-callout/gu)?.length).toBe(1);
  });

  // Defect: each repeats nothing, repeats outside the list, or breaks the table into pieces.
  it('repeats a body per item, keeping one list and one table whole', async () => {
    const body = [
      ':::each{in="run.blocks" as="block"}',
      '1. **{{block.title}}**: {{block.items}} items',
      ':::',
      '',
      ':::each{in="run.blocks" as="block"}',
      '| Stage | Status |',
      '| --- | --- |',
      '| {{block.title}} | {{block.status}} |',
      ':::',
      '',
      ':::each{in="run.tags" as="tag"}',
      'Tag {{tag}}.',
      ':::',
      '',
    ].join('\n');
    const out = await html(await page(body));
    expect(out.match(/<ol[\s>]/gu)?.length).toBe(1);
    expect(out).toContain('<strong>Plan</strong>: 3 items');
    expect(out).toContain('<strong>Review</strong>: 9 items');
    expect(out.match(/<table/gu)?.length).toBe(1);
    expect(out.match(/<tr/gu)?.length).toBe(3);
    expect(out).toContain('<td>returned</td>');
    expect(out).toContain('Tag api.');
    expect(out).toContain('Tag web.');
    expect(out).not.toContain('semantic-each');
  });

  // Defect: an expectation that never fails, or fails somewhere other than its own line.
  it('fails the build at the expectation when the data diverge, and passes when they agree', async () => {
    const agreeing = await page(
      '::expect{data="run.blocks" count="2"}\n::expect{data="run.status" equals="done"}\n::expect{data="run.tags" min="1"}\n::expect{data="run.findings" max="0"}\n\nText.\n',
    );
    await expect(validateReport({ input: agreeing })).resolves.toBeDefined();
    const diverging = await page(
      'Text.\n\n::expect{data="run.blocks" count="7"}\n\n::expect{data="run.status" equals="running"}\n',
    );
    const found = await failure(diverging);
    expect(found.map((diagnostic) => diagnostic.code)).toEqual([
      'DATA_EXPECTATION_FAILED',
      'DATA_EXPECTATION_FAILED',
    ]);
    expect(found[0]?.message).toContain('has 2 items; the page expects 7');
    expect(found[0]?.source?.line).toBe(8);
    expect(found[1]?.source?.line).toBe(10);
  });

  // Defect: a typo in a path or a missing field prints the placeholder or an empty string.
  it('refuses unknown names, missing fields, values without text and lists that are not lists', async () => {
    const found = await failure(
      await page(
        '{{rn.id}} {{run.nothing}} {{run.empty}} {{run.blocks}}\n\n:::each{in="run.status" as="x"}\nX\n:::\n',
      ),
    );
    expect(found.map((diagnostic) => diagnostic.code).sort()).toEqual([
      'DATA_NOT_A_LIST',
      'DATA_PATH_MISSING',
      'DATA_PATH_UNKNOWN',
      'DATA_VALUE_NOT_TEXT',
      'DATA_VALUE_NOT_TEXT',
    ]);
  });

  // Defect: code that shows the template syntax of another tool is rewritten or refused.
  it('leaves an unknown name in code as written', async () => {
    const out = await html(
      await page('```yaml\nimage: {{ .Values.image }}\nrun: {{run.id}}\n```\n'),
    );
    // The highlighter splits the line into spans; the braces and the name survive between them.
    expect(out).toMatch(/\{\{ <\/span><span[^>]*>\.Values\.image<\/span><span[^>]*> \}\}/u);
    expect(out).toMatch(/> 96</u);
  });

  // Defect: data read from outside the source root, or a file the page cannot address by name.
  it('confines data files to the source root and names them by their file name', async () => {
    const outside = await page('Text.\n', {}, 'data: [../run.json]');
    expect((await failure(outside))[0]?.code).toBe('INVALID_MANIFEST');
    const workspace = await page('Text.\n', { 'data/run.json': RUN });
    await symlink('/etc/hosts', path.join(workspace, 'data', 'link.json'));
    await writeFile(
      path.join(workspace, 'report.md'),
      '---\ntitle: Data page\ndata: [data/link.json]\n---\n\nText.\n',
    );
    expect((await failure(workspace))[0]?.code).toBe('DATA_OUTSIDE_SOURCE');
    const badName = await page('Text.\n', { 'data/Run_1.json': RUN }, 'data: [data/Run_1.json]');
    expect((await failure(badName))[0]?.code).toBe('DATA_FILE_INVALID');
    const invalid = await page('Text.\n', { 'data/run.json': '{"a": }' });
    const [broken] = await failure(invalid);
    expect(broken?.code).toBe('DATA_JSON_INVALID');
    expect(broken?.source?.file).toContain('run.json');
  });

  // Defect: each or expect silently render nothing on a page that forgot to declare its data.
  it('refuses each and expect on a page without data', async () => {
    const found = await failure(
      await page('::expect{data="run.blocks" count="2"}\n', {}, 'language: en'),
    );
    expect(found[0]?.code).toBe('DATA_NOT_DECLARED');
  });

  // Defect: a data file outside the source graph — its change would not change the report revision,
  // and a build could overwrite it as output.
  it('counts data files in the source graph', async () => {
    const workspace = await page('Run {{run.id}}.\n');
    const inspected = await inspectReport({ input: workspace });
    expect(JSON.stringify(inspected.sourceFiles)).toContain('data/run.json');
  });
});
