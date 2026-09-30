import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import { bundlePageAssets } from '../../src/core/page-assets.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import { PAGE_FEATURES } from '../../src/page-features.js';
import { codeParts } from '../../src/render/tables.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function build(body: string): Promise<string> {
  const workspace = await createTestWorkspace('tables');
  workspaces.push(workspace);
  await writeFile(
    path.join(workspace, 'report.md'),
    `---\ntitle: Tables\n---\n\n# Tables\n\n${body}\n`,
  );
  const output = path.join(workspace, 'out.html');
  await buildReport({ input: workspace, output });
  const html = await readFile(output, 'utf8');
  const start = html.indexOf('<article');
  return html.slice(start, html.indexOf('</article>', start));
}

async function buildFailure(body: string): Promise<AgenticReportError> {
  try {
    await build(body);
  } catch (error) {
    if (error instanceof AgenticReportError) return error;
    throw error;
  }
  throw new Error('The build was expected to fail.');
}

const THREE_COLUMNS = [
  '| Layer | Where | What it does |',
  '| --- | --- | --- |',
  '| Engine | `packages/anim/src/engine.ts` | Computes the value of a cell at a moment and reports when the object settles into place. |',
  '| Stage | `packages/btmodel/src/staging` | Holds the timeline, the steps, the loading window and the focus of the whole show. |',
].join('\n');

describe('generated label compatibility', () => {
  it('keeps visual content fallbacks in the final browser-targeted stylesheet', async () => {
    // Firefox 114 ignores the entire slash-alt declaration. The final CSS must still draw table labels,
    // chapter numbers and control signs through a plain declaration for the same selector and ancestor
    // conditions, with the modern alternative enabled only by its content support query.
    const { styles } = await bundlePageAssets(
      PAGE_FEATURES.map((feature) => feature.id),
      ['en'],
    );
    expect(missingVisualFallbacks(styles)).toEqual([]);
    expect(styles).toMatch(/content:attr\(data-label\)/u);
    expect(styles).toMatch(/@supports\s*\(content:\s*(?:""|'')\s*\/\s*(?:""|'')\)/u);
    expect(missingVisualFallbacks('.label::before{content:attr(data-label) / ""}')).toEqual([
      'attr(data-label)',
    ]);
    const base = '.label::before{content:attr(data-label)}';
    const modern = '@supports(content:""/""){.label::before{content:attr(data-label)/""}}';
    expect(missingVisualFallbacks(`${base}${modern}`)).toEqual([]);
    expect(missingVisualFallbacks(`${base}${modern.replace('.label', '.other')}`)).toEqual([
      'attr(data-label)',
    ]);
    expect(
      missingVisualFallbacks(`@container table-frame (width<20rem){${base}}${modern}`),
    ).toEqual(['attr(data-label)']);
    expect(missingVisualFallbacks(`${base}.label::before{content:attr(data-label)/""}`)).toEqual([
      'attr(data-label)',
    ]);
  });
});

function missingVisualFallbacks(styles: string): string[] {
  const missing: string[] = [];
  const earlier = new Set<string>();
  const stack: { header: string; start: number; hasChildren: boolean }[] = [];
  const contentSupport = /^@supports\s*\(\s*content\s*:\s*(?:""|'')\s*\/\s*(?:""|'')\s*\)$/u;
  let boundary = 0;
  // Quoted braces are content, not rule boundaries. Browser-targeted bundles have flat selectors inside
  // their at-rules, so each leaf's complete ancestor path distinguishes different layout conditions.
  for (const token of styles.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/gu)) {
    const marker = token[0];
    const index = token.index ?? 0;
    if (marker === '{') {
      const parent = stack.at(-1);
      if (parent !== undefined) parent.hasChildren = true;
      const prelude = styles.slice(boundary, index);
      const header = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
      stack.push({ header, start: index + 1, hasChildren: false });
      boundary = index + 1;
    } else if (marker === '}') {
      const rule = stack.pop();
      boundary = index + 1;
      if (rule === undefined || rule.hasChildren || rule.header.startsWith('@')) continue;
      const supported = stack.some(({ header }) => contentSupport.test(header));
      const ancestors = stack
        .filter(({ header }) => !contentSupport.test(header))
        .map(({ header }) => header);
      const scope = JSON.stringify([...ancestors, rule.header]);
      for (const content of styles
        .slice(rule.start, index)
        .matchAll(/(?:^|;)\s*content\s*:\s*([^;}]+)/gu)) {
        const value = (content[1] ?? '').trim();
        const alternate = /^(.*?)\s*\/\s*(?:""|'')$/u.exec(value);
        if (alternate === null && !supported) earlier.add(`${scope}:${value}`);
        else if (alternate !== null) {
          const visual = (alternate[1] ?? '').trim();
          if (!supported || !earlier.has(`${scope}:${visual}`)) missing.push(visual);
        }
      }
    }
  }
  return missing;
}

describe('code break opportunities', () => {
  it('breaks after path and identifier separators and keeps flags, schemes and decimals whole', () => {
    // The counterexample is a split mid-word: every part must end on a separator.
    expect(codeParts('packages/btkit/src/anim/canvasStage.ts')).toEqual([
      'packages/',
      'btkit/',
      'src/',
      'anim/',
      'canvasStage.',
      'ts',
    ]);
    expect(codeParts('fn(first,second)')).toEqual(['fn(', 'first,', 'second)']);
    expect(codeParts('--flag')).toEqual(['--flag']);
    expect(codeParts('https://example.org')).toEqual(['https://example.', 'org']);
    expect(codeParts('1.5')).toEqual(['1.5']);
    expect(codeParts('dispose()')).toEqual(['dispose()']);
    expect(codeParts('resolveBoardConnectorGeometryAnchorPoint')).toEqual([
      'resolve',
      'Board',
      'Connector',
      'Geometry',
      'Anchor',
      'Point',
    ]);
    expect(codeParts('clearShowGeometry')).toEqual(['clearShowGeometry']);
  });

  it('puts <wbr> into inline code only, so the text of the code stays what was written', async () => {
    const article = await build(
      'Open `apps/board/src/index.ts` now.\n\n```ts\nconst path = "apps/board/src/index.ts";\n```',
    );
    expect(article).toContain('<code>apps/<wbr>board/<wbr>src/<wbr>index.<wbr>ts</code>');
    expect(article).not.toMatch(/<pre[\s\S]*<wbr>[\s\S]*<\/pre>/u);
    const inline = /<code>(apps[\s\S]*?)<\/code>/u.exec(article)?.[1] ?? '';
    expect(inline.replaceAll('<wbr>', '')).toBe('apps/board/src/index.ts');
  });
});

describe('code joined by a separator', () => {
  it('lets two code values joined by a bare separator wrap between them, and only there', async () => {
    // Counterexample: `a`/`b` is one unbreakable run for the browser and splits mid-word on a phone.
    const article = await build(
      'The pair (`applyShowGeometry`/`clearShowGeometry` with `x` and `y`) and `a` / `b`.',
    );
    expect(article).toContain(
      '(<code>applyShowGeometry</code>/<wbr><code>clearShowGeometry</code> with',
    );
    // A separator with spaces already breaks; prose between code values is left alone.
    expect(article).toContain('<code>a</code> / <code>b</code>');
    expect(article).toContain('<code>x</code> and <code>y</code>');
  });
});

describe('table shaping', () => {
  it('frames a plain table with layout auto, roles, header labels and the measured widths', async () => {
    const article = await build(THREE_COLUMNS);
    const frame = /<div class="table-frame"([^>]*)>/u.exec(article)?.[1] ?? '';
    expect(frame).toContain('data-table-layout="auto"');
    // Three columns with a path and a prose column do not read on a phone (22rem): the fit is wider.
    const fit = Number(/data-table-fit="(\d+)"/u.exec(frame)?.[1]);
    expect(fit).toBeGreaterThan(22);
    expect(frame).toMatch(/data-table-code="\d+"/u);
    expect(article).toMatch(/<table[^>]* role="table"/u);
    expect(article).toContain('<thead role="rowgroup">');
    expect(article).toMatch(/<th[^>]* role="columnheader"[^>]*>Layer<\/th>/u);
    expect(article).toMatch(/<td[^>]* role="cell" data-label="Layer"[^>]*>Engine<\/td>/u);
    expect(article).toMatch(/<td[^>]* role="cell" data-label="What it does" data-column="prose"/u);
  });

  it('caps a prose column at its typical cell when one cell is far longer, and keeps short values whole', async () => {
    const rows = [
      'Preset preview before adding it',
      'Preview the whole reaction at once',
      'Respect the reduced-motion setting',
      'Transitions between the slides',
      'A group as the target of a show',
    ];
    const long =
      'Presentation show mode: forward, back, Esc, the next step in the middle of a step, poses and showcases on click';
    const table = [
      '| What | Task |',
      '| --- | --- |',
      `| ${long} | OPS-20076 |`,
      ...rows.map((row, index) => `| ${row} | OPS-2042${index} |`),
    ].join('\n');
    const article = await build(table);
    // Ловит: одна длинная строка задаёт ширину колонки прозы — колонка без предела на всю дорожку.
    const caps = [...article.matchAll(/data-column="prose" data-column-cap="(\d+)"/gu)].map(
      (match) => Number(match[1]),
    );
    expect(caps).toHaveLength(rows.length + 2);
    expect(new Set(caps)).toEqual(new Set([24]));
    // Ловит: короткое значение («OPS-20076») переносится по дефису в узкой колонке.
    expect(article).toMatch(/<td[^>]*data-column="short"[^>]*>OPS-20076<\/td>/u);
    // Ловит: колонка ровных по длине ячеек тоже получает предел и переносится раньше дорожки.
    expect(await build(THREE_COLUMNS)).not.toContain('data-column-cap');
  });

  it('keeps a narrow two-column table a table on a phone', async () => {
    const article = await build('| Key | Value |\n| --- | --- |\n| mode | on |\n| size | 12 |');
    expect(Number(/data-table-fit="(\d+)"/u.exec(article)?.[1])).toBe(20);
  });

  it('carries the layout chosen with the table directive', async () => {
    for (const layout of ['stack', 'scroll'] as const) {
      const article = await build(`:::table{layout="${layout}"}\n${THREE_COLUMNS}\n\n:::`);
      expect(article).toContain(`data-table-layout="${layout}"`);
      expect(article.match(/class="[^"]*table-frame"/gu)).toHaveLength(1);
      expect(article).not.toContain('data-layout=');
    }
  });

  it('refuses a table directive that holds anything but one table', async () => {
    const error = await buildFailure(
      `:::table{layout="stack"}\nA sentence.\n\n${THREE_COLUMNS}\n\n:::`,
    );
    expect(JSON.stringify(error.diagnostic)).toContain('INVALID_DIRECTIVE_CHILD');
  });

  it('refuses an unknown layout', async () => {
    const error = await buildFailure(`:::table{layout="grid"}\n${THREE_COLUMNS}\n\n:::`);
    expect(JSON.stringify(error.diagnostic)).toContain('INVALID_DIRECTIVE_ATTRIBUTE');
  });
});
