import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import { inspectReport } from '../../src/core/analyze-report.js';
import { inspectReview } from '../../src/core/inspect-review.js';
import { serializeReviewArtifact } from '../../src/index.js';
import type { Diagnostic } from '../../src/contracts.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import { blockStyleViolations } from '../../src/authoring/style-rules.js';
import { escapeAttributeValue, escapeMarkdownText } from '../../src/extensions/template.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Упаковщик эффектов пишет другая часть пакета; здесь проверяется только то, что сборка страницы
 * делает с упакованным скриптом: зовёт упаковку лишь для эффекта с носителями и ставит скрипт после
 * рантайма с его хешем в CSP.
 */
const bundled = vi.hoisted(() => ({ calls: [] as string[], inputs: [] as string[] }));
vi.mock('../../src/extensions/effect-bundle.js', () => ({
  bundleEffect: async (extension: { readonly name: string }) => {
    bundled.calls.push(extension.name);
    const code = `/*effect ${extension.name}*/`;
    return { name: extension.name, code, bytes: Buffer.byteLength(code), inputs: bundled.inputs };
  },
}));

const workspaces: string[] = [];
const FIXTURES = path.resolve('tests/fixtures/extensions');

afterEach(async () => {
  bundled.calls.length = 0;
  bundled.inputs = [];
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspaceFrom(fixture: string, prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  await cp(path.join(FIXTURES, fixture), workspace, { recursive: true });
  return workspace;
}

async function emptyWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  return workspace;
}

async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), contents);
  }
}

async function buildFailure(input: string): Promise<Diagnostic> {
  try {
    await buildReport({ input, output: path.join(input, 'out.html') });
  } catch (error) {
    if (error instanceof AgenticReportError) return error.diagnostic;
    throw error;
  }
  throw new Error('The build was expected to fail.');
}

function page(extensions: readonly string[], body: string): string {
  return [
    '---',
    'title: Extensions',
    'language: en',
    'extensions:',
    ...extensions.map((extension) => `  - ${extension}`),
    '---',
    '',
    '# Extensions',
    '',
    body,
    '',
  ].join('\n');
}

const BLOCK_MANIFEST = [
  'kind: block',
  'name: metric-card',
  'description: One metric as a callout.',
  'staticEquivalent: A bordered notice with the metric.',
  'forms: [leaf, container]',
  'attributes:',
  '  title: { type: string, required: true }',
  '  value: { type: string, required: true }',
  'template: template.md',
].join('\n');

function contentSecurityPolicy(html: string): string {
  const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/u.exec(html)?.[1];
  if (policy === undefined) throw new Error('The page has no CSP.');
  return decodeAttribute(policy);
}

function decodeAttribute(value: string): string {
  const named: Readonly<Record<string, string>> = { amp: '&', quot: '"', lt: '<', gt: '>' };
  return value.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));/giu, (whole, hex, decimal, name) =>
    hex !== undefined
      ? String.fromCodePoint(Number.parseInt(hex, 16))
      : decimal !== undefined
        ? String.fromCodePoint(Number(decimal))
        : (named[name] ?? whole),
  );
}

function scriptHashes(policy: string): string[] {
  return [...policy.matchAll(/'(sha256-[^']+)'/gu)].map((match) => match[1] ?? '');
}

describe('extension manifests', () => {
  // Catches a loader that accepts unknown fields silently: a typo in a manifest must name its field
  // and line, not be ignored.
  it('refuses an unknown field with the manifest file and the field line', async () => {
    const root = await emptyWorkspace('ext-unknown-field');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" value="1"}'),
      'card/extension.yaml': `${BLOCK_MANIFEST}\ncolour: red\n`,
      'card/template.md': '**{{value}}**\n',
    });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_INVALID');
    expect(diagnostic.message).toContain('colour');
    expect(diagnostic.source?.file).toBe(path.join(root, 'card/extension.yaml'));
    expect(diagnostic.source?.line).toBe(10);
  });

  // Catches a missing required field located nowhere: the diagnostic points at the manifest.
  it('refuses a manifest without its template and locates the manifest', async () => {
    const root = await emptyWorkspace('ext-missing-field');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], 'Text.'),
      'card/extension.yaml': BLOCK_MANIFEST.replace('template: template.md', ''),
    });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_INVALID');
    expect(diagnostic.message).toContain('template');
    expect(diagnostic.source?.file).toBe(path.join(root, 'card/extension.yaml'));
  });

  // Catches an extension that shadows a built-in directive: callout would silently change meaning.
  it('refuses a name that belongs to a built-in directive', async () => {
    const root = await emptyWorkspace('ext-clash');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], 'Text.'),
      'card/extension.yaml': BLOCK_MANIFEST.replace('name: metric-card', 'name: callout'),
      'card/template.md': '**{{value}}**\n',
    });
    expect((await buildFailure(root)).code).toBe('EXTENSION_NAME_CLASH');
  });

  // Catches a manifest path that escapes the source root, like a partial would be refused.
  it('confines the manifest path to the source root and locates the declaration', async () => {
    const root = await emptyWorkspace('ext-outside');
    await writeFiles(root, { 'report.md': page(['../outside.yaml'], 'Text.') });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('INVALID_MANIFEST');
    const inner = await emptyWorkspace('ext-outside-link');
    await writeFiles(inner, {
      'report.md': page(['card/extension.yaml'], 'Text.'),
      'card/extension.yaml': BLOCK_MANIFEST.replace('template.md', '../../template.md'),
    });
    const escaped = await buildFailure(inner);
    expect(escaped.code).toBe('EXTENSION_PATH_OUTSIDE');
    expect(escaped.source?.file).toBe(path.join(inner, 'card/extension.yaml'));
    expect(escaped.source?.line).toBe(9);
  });

  // Catches a template whose placeholder could not be escaped: outside quotes it would let a value
  // add attributes.
  it('refuses an unquoted placeholder in directive attributes and names the template line', async () => {
    const root = await emptyWorkspace('ext-template');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" value="1"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': 'Intro.\n\n:::callout{title={{title}}}\n{{value}}\n:::\n',
    });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_TEMPLATE_INVALID');
    expect(diagnostic.source).toEqual({ file: path.join(root, 'card/template.md'), line: 3 });
  });

  // Catches the decision "a page may use an extension without examples" turning into a refusal,
  // and a silent build that never tells the author the extension cannot be checked yet.
  it('builds with an extension that has no examples and warns once', async () => {
    const root = await emptyWorkspace('ext-examples');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" value="1"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': '**{{value}}**\n',
    });
    const result = await buildReport({ input: root, output: path.join(root, 'out.html') });
    expect(result.warnings.map((warning) => warning.code)).toEqual(['EXTENSION_EXAMPLES_MISSING']);
  });
});

describe('composite blocks', () => {
  it('escapes values for Markdown text and for quoted directive attributes', () => {
    expect(escapeMarkdownText(':::callout\n<b>x</b>')).toBe('\\:\\:\\:callout \\<b\\>x\\<\\/b\\>');
    expect(escapeAttributeValue('a"} :::x\n')).toBe('a&#34;&#125; :::x&#10;');
  });

  // Catches template expansion that pastes values raw: `"}` would close the attribute block and
  // `:::` would open a directive of the author's choosing.
  it('cannot inject a directive through an attribute value', async () => {
    const root = await emptyWorkspace('ext-injection');
    const hostile = '&quot;} :::callout{title=&quot;Injected&quot;} [x](javascript:alert(1))';
    await writeFiles(root, {
      'report.md': page(
        ['card/extension.yaml'],
        `:::metric-card{title="${hostile}" value="${hostile}"}\nBody text.\n:::`,
      ),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': ':::callout{title="{{title}}"}\n{{value}}\n\n{{content}}\n:::\n',
    });
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html.match(/class="semantic-callout"/gu)).toHaveLength(1);
    expect(html).not.toContain('href="javascript');
    expect(html).toContain(':::callout{title="Injected"}');
    expect(html).toContain('Body text.');
  });

  // Catches a placeholder in a link destination turning a value into a script link: the Markdown
  // escape keeps `javascript\:` a valid destination after unescaping, so the sanitizer must drop it.
  it('cannot make a script link through a placeholder in a link destination', async () => {
    const root = await emptyWorkspace('ext-link-destination');
    await writeFiles(root, {
      'report.md': page(
        ['card/extension.yaml'],
        '::metric-card{title="javascript:alert(1)" value="1"}',
      ),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': '[Open the metric]({{title}}) **{{value}}**\n',
    });
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('Open the metric');
    expect(html).not.toMatch(/href="\s*javascript/iu);
  });

  // Catches a template that uses its own directive many times: within the depth limit it grows as a
  // power (1300 calls on eight levels), so the page budget must refuse it instead of hanging. The
  // budget is crossed on the eighth level, before the depth limit is reached.
  it('refuses expansions above the page node budget', async () => {
    const root = await emptyWorkspace('ext-fanout');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" value="1"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': `${Array.from({ length: 1300 }, () => '::metric-card{title="{{title}}" value="{{value}}"}').join('\n\n')}\n`,
    });
    const started = Date.now();
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_EXPANSION_TOO_LARGE');
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);

  // Catches a diagnostic inside an expansion that points at the template file the author did not
  // write, or loses which template line produced it.
  it('locates a violation inside the expansion at the author directive and names the line', async () => {
    const root = await emptyWorkspace('ext-location');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], 'Before.\n\n::metric-card{title="A" value="1"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': '**{{value}}**\n\n::unknown-part{title="{{title}}"}\n',
    });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('UNSUPPORTED_DIRECTIVE');
    expect(diagnostic.source?.file).toBe(path.join(root, 'report.md'));
    expect(diagnostic.source?.line).toBe(12);
    expect(diagnostic.details).toMatchObject({
      extension: 'metric-card',
      template: 'card/template.md',
      templateLine: 3,
    });
  });

  // Catches attributes of an extension directive being read by a looser rule than the built-ins.
  it('reads the author directive with the declared attributes', async () => {
    const root = await emptyWorkspace('ext-attributes');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" colour="red"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': '**{{value}}**\n',
    });
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('UNKNOWN_DIRECTIVE_ATTRIBUTE');
    expect(diagnostic.source?.line).toBe(10);
  });

  // Catches a review revision computed without the extension files: a changed template changes the
  // page, and a review bound to the old template must not read as exact.
  it('changes the review revision when a template of the page changes', async () => {
    const root = await emptyWorkspace('ext-revision');
    await writeFiles(root, {
      'report.md': page(['card/extension.yaml'], '::metric-card{title="A" value="1"}'),
      'card/extension.yaml': BLOCK_MANIFEST,
      'card/template.md': '**{{value}}**\n',
      'review.json': serializeReviewArtifact({
        contractVersion: 3,
        report: { revision: `sha256:${'0'.repeat(64)}` },
        threads: [],
      }),
    });
    const before = await inspectReview({ input: root, review: 'review.json' });
    await writeFile(path.join(root, 'card/template.md'), '_{{value}}_\n');
    const after = await inspectReview({ input: root, review: 'review.json' });
    expect(after.reportRevision).not.toBe(before.reportRevision);
  });

  it('renders the fixture page and reports every extension it uses', async () => {
    const root = await workspaceFrom('page', 'ext-page');
    const result = await buildReport({ input: root, output: path.join(root, 'out.html') });
    expect(result.warnings).toEqual([]);
    expect(result.extensions).toEqual([
      { name: 'metric-card', kind: 'block', uses: 2, notes: [] },
      { name: 'price-table', kind: 'provider', uses: 1, notes: [] },
      { name: 'counter', kind: 'island', uses: 1, bytes: expect.any(Number), notes: [] },
    ]);
    const inspected = await inspectReport({ input: root });
    expect(inspected.extensions?.map((extension) => [extension.name, extension.uses])).toEqual([
      ['metric-card', 2],
      ['price-table', 1],
      ['counter', 1],
    ]);
    expect(inspected.sourceFiles).toContain('extensions/metric-card/template.md');
  });
});

describe('providers', () => {
  async function providerPage(prefix: string, script: string, timeoutMs = 5000): Promise<string> {
    const root = await emptyWorkspace(prefix);
    await writeFiles(root, {
      'report.md': page(['data/extension.yaml'], 'Before.\n\n::data-table{rows="2"}'),
      'data/extension.yaml': [
        'kind: provider',
        'name: data-table',
        'description: Rows from a data file.',
        'staticEquivalent: A table.',
        'forms: [leaf]',
        'attributes:',
        '  rows: { type: number, minimum: 1 }',
        `command: [${JSON.stringify(process.execPath)}, provider.mjs]`,
        `timeoutMs: ${timeoutMs}`,
      ].join('\n'),
      'data/provider.mjs': script,
    });
    return root;
  }

  // Catches a provider receiving the wrong request or its output bypassing the Markdown path.
  it('passes the request on stdin and renders the Markdown it writes', async () => {
    const root = await providerPage(
      'ext-provider',
      [
        "let input = '';",
        "process.stdin.on('data', (chunk) => { input += chunk; });",
        "process.stdin.on('end', () => {",
        '  const request = JSON.parse(input);',
        "  const secret = Object.keys(process.env).includes('AGENTIC_SECRET');",
        "  process.stdout.write('Rows: **' + request.attributes.rows + '**, file ' + request.source.file + ':' + request.source.line + ', env ' + secret + '.');",
        '});',
      ].join('\n'),
    );
    process.env.AGENTIC_SECRET = 'must-not-leak';
    try {
      const output = path.join(root, 'out.html');
      await buildReport({ input: root, output });
      const html = await readFile(output, 'utf8');
      expect(html).toContain('Rows: <strong>2</strong>, file report.md:12, env false.');
    } finally {
      delete process.env.AGENTIC_SECRET;
    }
  });

  // Catches a provider that could put markup on the page an author could not write.
  it('sanitizes raw HTML in the provider output like authored Markdown', async () => {
    const root = await providerPage(
      'ext-provider-html',
      'process.stdout.write(\'<script>alert(1)</script><b onclick="steal()">bold</b> text\');',
    );
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('steal()');
  });

  // Catches a hanging provider holding the build forever.
  it('stops a provider at its timeout', async () => {
    const root = await providerPage('ext-provider-timeout', 'setTimeout(() => {}, 60_000);', 300);
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_PROVIDER_TIMEOUT');
    expect(diagnostic.source?.line).toBe(12);
  });

  // Catches a timeout that kills only the direct child: a grandchild (as under `sh -c` or `npm run`)
  // keeps stdout open, and a build that waits for 'close' hangs until the grandchild exits.
  it('stops a provider whose grandchild holds its output open', async () => {
    const root = await providerPage(
      'ext-provider-grandchild',
      [
        "import { spawn } from 'node:child_process';",
        "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { stdio: 'inherit' });",
        'setTimeout(() => {}, 60_000);',
      ].join('\n'),
      300,
    );
    const started = Date.now();
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_PROVIDER_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(4000);
  }, 10_000);

  // Catches a failing provider reported without the reason it printed.
  it('reports a non-zero exit with the tail of its error output', async () => {
    const root = await providerPage(
      'ext-provider-exit',
      "process.stderr.write('database is offline'); process.exit(3);",
    );
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_PROVIDER_FAILED');
    expect(diagnostic.message).toContain('code 3');
    expect(diagnostic.details).toMatchObject({
      stderr: 'database is offline',
      manifest: 'data/extension.yaml',
    });
  });

  // Catches an unbounded provider output turning into a multi-megabyte page.
  it('refuses output above one megabyte', async () => {
    const root = await providerPage(
      'ext-provider-oversize',
      "process.stdout.write('x'.repeat(1_100_000));",
    );
    expect((await buildFailure(root)).code).toBe('EXTENSION_PROVIDER_OUTPUT_TOO_LARGE');
  });

  // Catches a cache keyed so coarsely that different attributes share one result, or not at all.
  it('runs a provider once per distinct input within a build', async () => {
    const root = await providerPage(
      'ext-provider-cache',
      [
        "import { appendFileSync } from 'node:fs';",
        "let input = '';",
        "process.stdin.on('data', (chunk) => { input += chunk; });",
        "process.stdin.on('end', () => { appendFileSync('calls.log', 'x'); process.stdout.write('Rows ' + JSON.parse(input).attributes.rows + '.'); });",
      ].join('\n'),
    );
    await writeFile(
      path.join(root, 'report.md'),
      page(
        ['data/extension.yaml'],
        '::data-table{rows="2"}\n\n::data-table{rows="2"}\n\n::data-table{rows="3"}',
      ),
    );
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    expect(await readFile(path.join(root, 'data/calls.log'), 'utf8')).toBe('xx');
    // Запись редакции повторяет текст страницы; считаются вхождения в самой странице.
    const html = (await readFile(output, 'utf8')).replace(
      /<template data-edition-record[^>]*>[^<]*<\/template>/gu,
      '',
    );
    expect(html.match(/Rows 2\./gu)).toHaveLength(2);
    expect(html).toContain('Rows 3.');
  });
});

describe('provider data beside the page', () => {
  const ECHO_DATA = [
    "let input = '';",
    "process.stdin.on('data', (chunk) => { input += chunk; });",
    "process.stdin.on('end', () => {",
    '  const request = JSON.parse(input);',
    '  const facts = request.data.facts;',
    "  process.stdout.write('Keys ' + Object.keys(request.data).join('+') + ', count ' + (facts === undefined ? 'none' : facts.count) + '.');",
    '});',
  ].join('\n');

  async function dataPage(prefix: string, declared: boolean, count = 7): Promise<string> {
    const root = await emptyWorkspace(prefix);
    await writeFiles(root, {
      'report.md': [
        '---',
        'title: Data',
        'language: en',
        'extensions: [tool/extension.yaml]',
        ...(declared ? ['data: [facts.json]'] : []),
        '---',
        '',
        '# Data',
        '',
        '::from-data',
        '',
      ].join('\n'),
      'facts.json': JSON.stringify({ count }),
      'tool/extension.yaml': [
        'kind: provider',
        'name: from-data',
        'description: Writes a sentence from the page data.',
        'staticEquivalent: A sentence.',
        'forms: [leaf]',
        `command: [${JSON.stringify(process.execPath)}, provider.mjs]`,
      ].join('\n'),
      'tool/provider.mjs': ECHO_DATA,
    });
    return root;
  }

  // Catches a provider that cannot reach data kept beside the page: it runs in its own folder, so the
  // page's declared data file must arrive parsed in the request, under its name without `.json`.
  it('passes the declared data files of the page parsed by name', async () => {
    const root = await dataPage('ext-provider-data', true);
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    expect(await readFile(output, 'utf8')).toContain('Keys facts, count 7.');
  });

  // Catches the compiler handing the provider files the page did not declare: the same file beside the
  // page without a `data` declaration does not reach the provider.
  it('passes nothing the page did not declare', async () => {
    const root = await dataPage('ext-provider-no-data', false);
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    expect(await readFile(output, 'utf8')).toContain('Keys , count none.');
  });

  // Catches a cached provider output that outlives a change of the data it was built from.
  it('reruns the provider when the data changes', async () => {
    const root = await dataPage('ext-provider-data-change', true, 7);
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    await writeFile(path.join(root, 'facts.json'), JSON.stringify({ count: 8 }));
    await buildReport({ input: root, output });
    expect(await readFile(output, 'utf8')).toContain('Keys facts, count 8.');
  });
});

describe('composite block styles', () => {
  async function styledPage(prefix: string, css: string, body: string): Promise<string> {
    const root = await emptyWorkspace(prefix);
    await writeFiles(root, {
      'report.md': page(['block/extension.yaml'], body),
      'block/extension.yaml': `${BLOCK_MANIFEST}\nstyles: block.css`,
      'block/template.md': ':::callout{title="{{title}}"}\n**{{value}}**\n:::\n',
      'block/block.css': css,
    });
    return root;
  }
  const CLEAN = [
    '& > p:first-of-type {',
    '  color: var(--color-heading);',
    '  font-size: clamp(1.75rem, 2vw + 1rem, 2.5rem);',
    '  font-weight: var(--display-weight);',
    '}',
  ].join('\n');

  // Catches styles that escape their block or reach a page without it: the rules must be nested in the
  // block's own attribute, that attribute must survive the directive phase and sanitizing, and a page
  // that declares the block without using it must not carry its styles.
  it('scopes the styles to the block element and ships them only where the block is used', async () => {
    const root = await styledPage(
      'ext-block-styles',
      CLEAN,
      '::metric-card{title="Latency" value="120 ms"}',
    );
    const output = path.join(root, 'out.html');
    const result = await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('[data-extension-block="metric-card"] {\n& > p:first-of-type {');
    expect(html).toMatch(/<aside[^>]*data-extension-block="metric-card"/u);
    expect(result.extensions?.[0]).toMatchObject({ name: 'metric-card', uses: 1 });
    expect(result.extensions?.[0]?.bytes).toBeGreaterThan(0);

    await writeFile(path.join(root, 'report.md'), page(['block/extension.yaml'], 'No block here.'));
    await buildReport({ input: root, output });
    expect(await readFile(output, 'utf8')).not.toContain('data-extension-block');
  });

  // Catches a hand-written colour in block styles reaching the page: the build refuses it with the file
  // and the line, as the unit test refuses it in the package stylesheet.
  it('refuses a planted colour literal with the styles file and line', async () => {
    const root = await styledPage(
      'ext-block-styles-literal',
      `${CLEAN}\n& strong { color: #ff0000; }\n`,
      '::metric-card{title="Latency" value="120 ms"}',
    );
    const diagnostic = await buildFailure(root);
    expect(diagnostic.code).toBe('EXTENSION_STYLES_INVALID');
    expect(diagnostic.source?.file).toBe(path.join(root, 'block/block.css'));
    expect(diagnostic.source?.line).toBe(6);
    expect(diagnostic.message).toContain('colour literal in #ff0000');
  });

  // Catches block styles that escape the nesting or bring their own look: a closing brace that ends the
  // scope early, a variable outside the theme vocabulary, a loaded resource, a typeface and an at-rule.
  it('refuses styles that leave the block or the theme', () => {
    const lines = (css: string): string[] =>
      blockStyleViolations(css).map((violation) => `${violation.line}: ${violation.message}`);
    expect(lines(CLEAN)).toEqual([]);
    expect(
      lines(
        [
          '} body { color: var(--color-text); }',
          '& { background: url(x.png); }',
          '& { color: var(--my-ink); }',
          '& { font-family: Inter; }',
          '@import "x.css";',
          '& { --ink: var(--color-text); }',
        ].join('\n'),
      ),
    ).toEqual([
      '1: a closing brace without its opening one',
      '1: body names the document root; block styles select inside the block',
      '2: url( loads or computes outside the theme',
      '3: var(--my-ink) is not a public theme token or a package scale',
      '4: font-family names a typeface: Inter',
      '5: @import is not allowed; block styles may use @media and @container only',
      '6: --ink declares a variable; block styles read theme tokens only',
    ]);
  });

  // Catches the scope escapes the brace rule alone misses: a sibling combinator after `&` (or at the
  // start of a nested rule, where `&` is implied), a selector naming the document root, and braces
  // hidden in a string or an unclosed string/comment that the browser reads differently from a counter.
  it('refuses selectors that reach outside the block and braces hidden in strings', () => {
    const messages = (css: string): string[] =>
      blockStyleViolations(css).map((violation) => violation.message);
    expect(messages('& > li + li { color: var(--color-text); }')).toEqual([]);
    expect(messages('& li:nth-child(2n+1) { color: var(--color-text); }')).toEqual([]);
    expect(messages('& p::before { content: "{"; }')).toEqual([]);
    for (const sibling of [
      '& ~ * { color: var(--color-text); }',
      '& + section { color: var(--color-text); }',
      '&~p { color: var(--color-text); }',
      ':is(&) + p { color: var(--color-text); }',
      '+ p { color: var(--color-text); }',
      '& p, ~ p { color: var(--color-text); }',
    ])
      expect(messages(sibling).join('\n')).toContain('selects a sibling of the block');
    for (const root of [
      ':root & { color: var(--color-text); }',
      'body & { color: var(--color-text); }',
      '& html { color: var(--color-text); }',
    ])
      expect(messages(root).join('\n')).toContain('names the document root');
    expect(
      messages('& p::before { content: "}"; } } body { color: var(--color-text); }'),
    ).toContain('a closing brace without its opening one');
    expect(messages('& p { content: "{\n} } x { color: var(--color-text); }')).toContain(
      'a string is not closed on its line',
    );
    expect(messages('& p { color: var(--color-text); } /* x')).toContain('a comment is not closed');
  });

  // Catches the reference block drifting off the rules it demonstrates.
  it('keeps the styles of extensions/key-figure within the rules', async () => {
    const css = await readFile(path.resolve('extensions/key-figure/block.css'), 'utf8');
    expect(blockStyleViolations(css)).toEqual([]);
  });
});

describe('islands', () => {
  // Catches an island without a static equivalent: print and no-script readers would see nothing.
  it('refuses an island without a Markdown body', async () => {
    const root = await workspaceFrom('page', 'ext-island-empty');
    await writeFile(
      path.join(root, 'report.md'),
      page(['extensions/counter/extension.yaml'], ':::island{name="counter"}\n:::'),
    );
    expect((await buildFailure(root)).code).toBe('EXTENSION_ISLAND_STATIC_REQUIRED');
  });

  // Catches an island document that reaches the network or a page CSP that forgets its scripts.
  it('renders the static body, a sandboxable document and allows exactly its scripts', async () => {
    const root = await workspaceFrom('page', 'ext-island');
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html).toContain('<div class="semantic-island-static" data-island-static="">');
    expect(html).toContain('The counter starts at <strong>0</strong>');
    const document = /data-island-document="([^"]*)"/u.exec(html)?.[1] ?? '';
    const decoded = decodeAttribute(document);
    expect(decoded).toContain("default-src 'none'");
    expect(decoded).not.toContain('src="app.js"');
    expect(decoded).toContain('<style>');
    const policy = contentSecurityPolicy(html);
    const islandScripts = [...decoded.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map(
      (match) =>
        `sha256-${createHash('sha256')
          .update(match[1] ?? '')
          .digest('base64')}`,
    );
    expect(islandScripts).toHaveLength(2);
    for (const hash of islandScripts) expect(scriptHashes(policy)).toContain(hash);
  });

  // Catches reference rewriting that runs over inlined code: a `src="…"` inside a string of the island
  // script or an inline script is code, not a reference, and must neither fail the build nor change.
  it('leaves references inside island scripts and styles untouched', async () => {
    const root = await workspaceFrom('page', 'ext-island-code-strings');
    const code = `document.body.innerHTML += '<img src="a.png">'; const src = "x"; const t = ' href="b.css"';`;
    await writeFile(path.join(root, 'extensions/counter/app.js'), code);
    await writeFile(
      path.join(root, 'extensions/counter/index.html'),
      `<!doctype html><html><head><link rel="stylesheet" href="style.css"><style>i::after { content: ' src="c.png"'; }</style></head><body><script src="app.js"></script><script>const inline = '<img src="d.png">';</script></body></html>`,
    );
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const decoded = decodeAttribute(
      /data-island-document="([^"]*)"/u.exec(await readFile(output, 'utf8'))?.[1] ?? '',
    );
    expect(decoded).toContain(`<script>${code}</script>`);
    expect(decoded).toContain(`<script>const inline = '<img src="d.png">';</script>`);
    expect(decoded).toContain(`content: ' src="c.png"'`);
  });

  // Catches the island allowance leaking into pages that do not run an island.
  it('adds nothing to the CSP of a page whose island never starts', async () => {
    const root = await workspaceFrom('page', 'ext-island-none');
    await writeFile(
      path.join(root, 'report.md'),
      page(
        ['extensions/counter/extension.yaml'],
        ':::island{name="counter" hydrate="none"}\nZero.\n:::',
      ),
    );
    const output = path.join(root, 'out.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(scriptHashes(contentSecurityPolicy(html))).toHaveLength(1);
    expect(html).not.toContain('data-island-document');
    expect(html).not.toContain('agentic-report-island');
  });

  // Catches an undeclared or remote reference in the entry: the island has no network.
  it('refuses a reference that is not a declared asset', async () => {
    const root = await workspaceFrom('page', 'ext-island-remote');
    await writeFile(
      path.join(root, 'extensions/counter/index.html'),
      '<!doctype html><html><head><script src="https://cdn.example.com/lib.js"></script></head><body></body></html>',
    );
    expect((await buildFailure(root)).code).toBe('EXTENSION_ISLAND_REFERENCE');
  });
});

describe('effect targets', () => {
  // Catches the target attribute being accepted without the declaration, or dropped on the way to
  // the element, and an effect script shipped without its hash.
  it('carries the target to the element and ships the script only where it is used', async () => {
    const root = await workspaceFrom('effect', 'ext-effect');
    const output = path.join(root, 'out.html');
    const result = await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(html.match(/data-effect-glow-glow="soft"/gu)).toHaveLength(1);
    expect(bundled.calls).toEqual(['glow']);
    expect(result.extensions).toEqual([
      { name: 'glow', kind: 'effect', uses: 1, bytes: expect.any(Number), notes: [] },
    ]);
    const script = '/*effect glow*/';
    expect(html).toContain(`<script>${script}</script></body>`);
    expect(scriptHashes(contentSecurityPolicy(html))).toContain(
      `sha256-${createHash('sha256').update(script).digest('base64')}`,
    );

    await writeFile(
      path.join(root, 'report.md'),
      page(['extensions/glow/extension.yaml'], '::::section{title="Plain"}\nText.\n::::'),
    );
    bundled.calls.length = 0;
    const unused = await buildReport({ input: root, output: path.join(root, 'unused.html') });
    expect(bundled.calls).toEqual([]);
    expect(unused.extensions?.[0]?.uses).toBe(0);
  });

  // Catches bundle inputs from outside the source root passing unmentioned: the bundler follows
  // imports into node_modules, and the build report must name those files as the author's code.
  it('names bundle inputs from outside the extension folder in the build notes', async () => {
    const root = await workspaceFrom('effect', 'ext-effect-inputs');
    const folder = path.join(root, 'extensions/glow');
    bundled.inputs = [
      '<stdin>',
      'agentic-report-effect:agentic-report/effect',
      path.relative(process.cwd(), path.join(folder, 'glow.js')),
      path.relative(process.cwd(), path.join(root, 'node_modules/lib/index.js')),
    ];
    const result = await buildReport({ input: root, output: path.join(root, 'out.html') });
    expect(result.extensions?.[0]?.notes).toEqual([
      "The bundle includes 1 file(s) from outside the extension folder, shipped as the author's code: ../../node_modules/lib/index.js.",
    ]);
  });

  it('writes the effect script as a hashed file in directory output', async () => {
    const root = await workspaceFrom('effect', 'ext-effect-directory');
    const output = path.join(root, 'site');
    await buildReport({ input: root, output, format: 'directory' });
    const files = await readdir(path.join(output, 'assets'));
    const effect = files.find((file) => /^effect-glow\.[0-9a-f]{12}\.js$/u.test(file));
    expect(effect).toBeDefined();
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    expect(html).toContain(`<script src="assets/${effect}" defer=""></script>`);
  });

  // Catches an effect attribute accepted on a page that never declared the effect.
  it('refuses the target attribute on a page without the effect', async () => {
    const root = await emptyWorkspace('ext-effect-undeclared');
    await writeFiles(root, {
      'report.md':
        '---\ntitle: No effect\n---\n\n# No effect\n\n::::section{title="Lit" glow="soft"}\nText.\n::::\n',
    });
    expect((await buildFailure(root)).code).toBe('UNKNOWN_DIRECTIVE_ATTRIBUTE');
  });
});

describe('pages without extensions', () => {
  // Catches extension machinery leaking into ordinary pages: the build result, the CSP and the
  // runtime must stay what they were. The byte-for-byte comparison against the previous release was
  // made by hand for examples/document; this pins the parts that would change first.
  it('build examples/document with one runtime hash and no extension traces', async () => {
    const root = await emptyWorkspace('ext-none');
    const output = path.join(root, 'document.html');
    const result = await buildReport({ input: path.resolve('examples/document'), output });
    const html = await readFile(output, 'utf8');
    expect(result).not.toHaveProperty('extensions');
    expect(scriptHashes(contentSecurityPolicy(html))).toHaveLength(1);
    expect(html).not.toContain('agentic-report-island');
    expect(html).not.toContain('semantic-island');
    expect(html).not.toContain('data-effect-');
  });
});
