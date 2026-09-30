import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function render(body: readonly string[], language?: string): Promise<string> {
  const workspace = await createTestWorkspace('diagram-phone-forms');
  workspaces.push(workspace);
  const markdown = `# Diagram\n${body.join('\n')}\n`;
  const rendered = await renderMarkdown(markdown, {
    ...(language === undefined ? {} : { language }),
    sourceRoot: workspace,
    format: 'single-file',
    outputFilePath: path.join(workspace, 'artifact.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile: path.join(workspace, 'report.md'),
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
  });
  return rendered.html;
}

function sequenceList(html: string): string {
  return (
    /<div class="visualization-sequence-list"[^>]*>[\s\S]*?<\/ol><\/div>/u.exec(html)?.[0] ?? ''
  );
}

function text(fragment: string): string[] {
  return [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gu)].map((match) =>
    (match[1] ?? '').replace(/<[^>]+>/gu, ''),
  );
}

describe('a sequence as a list of steps', () => {
  const SEQUENCE = [
    ':::diagram{title="Calls" description="Three parties." type="sequence"}',
    '::node{id="app" label="App"}',
    '::node{id="api" label="API" detail="Go"}',
    '::node{id="db" label="Store"}',
    '::edge{from="app" to="api" label="GET /orders" kind="call"}',
    '::edge{from="api" to="api" label="check the token"}',
    '::edge{from="api" to="db" label="select rows" kind="data"}',
    ':::',
  ];

  it('is compiled from the same data: participants and every message from → to in order', async () => {
    const list = sequenceList(await render(SEQUENCE));
    // Ловит: списка нет в разметке — рантайму телефона нечего показать вместо картинки.
    expect(list).toContain('data-sequence-list');
    // Скрыт по умолчанию: без рантайма и в печати читатель видит рисунок.
    expect(list).toMatch(/<div class="visualization-sequence-list" data-sequence-list="" hidden>/u);
    const ul = /<ul[^>]*>[\s\S]*?<\/ul>/u.exec(list)?.[0] ?? '';
    const ol = /<ol[^>]*>[\s\S]*?<\/ol>/u.exec(list)?.[0] ?? '';
    expect(text(ul)).toEqual(['App', 'API — Go', 'Store']);
    // Виды связей схема здесь не различает легендой (смешаны два), поэтому они названы словами.
    expect(text(ol)).toEqual([
      'App → API: GET /orders (call)',
      'API, inside itself: check the token (call)',
      'API → Store: select rows (data or values)',
    ]);
  });

  it('speaks the page language', async () => {
    const list = sequenceList(await render(SEQUENCE, 'ru'));
    expect(list).toContain('Участники');
    expect(list).toContain('Сообщения по порядку');
    expect(text(/<ol[^>]*>[\s\S]*?<\/ol>/u.exec(list)?.[0] ?? '')[1]).toBe(
      'API, внутри себя: check the token (вызов)',
    );
  });
});

describe('a flow on a narrow track', () => {
  it('carries a narrow top-down view inside its top-down panel when that view is wider than a phone', async () => {
    const html = await render([
      ':::diagram{title="Fan in" description="Four sources feed one checker." layout="right"}',
      '::node{id="a" label="Schema file"}',
      '::node{id="b" label="Orders export"}',
      '::node{id="c" label="Pricing service"}',
      '::node{id="d" label="Stock ledger"}',
      '::node{id="checker" label="Row checker"}',
      '::edge{from="a" to="checker" label="rules"}',
      '::edge{from="b" to="checker" label="rows"}',
      '::edge{from="c" to="checker" label="prices"}',
      '::edge{from="d" to="checker" label="stock"}',
      ':::',
    ]);
    const down =
      /<div id="[^"]*" role="tabpanel"[^>]*data-layout-view="down"[^>]*>[\s\S]*?<\/svg><\/div><\/div>/u.exec(
        html,
      )?.[0] ?? '';
    const widths = [...down.matchAll(/<svg viewBox="0 0 [0-9.]+ [0-9.]+" width="([0-9.]+)"/gu)].map(
      (match) => Number(match[1]),
    );
    // Ловит: узкого вида нет, или он не уже обычного вида сверху вниз.
    expect(widths).toHaveLength(2);
    expect(down).toMatch(/visualization-diagram-compact" data-diagram-compact="" hidden/u);
    expect(widths[1]).toBeLessThan(widths[0] ?? 0);
    // Тот же граф: те же узлы в обоих рисунках.
    expect(down.match(/data-node-id="checker"/gu)).toHaveLength(2);
  });

  it('carries no narrow view when the top-down view already fits a phone', async () => {
    const html = await render([
      ':::diagram{title="Chain" description="Two steps." layout="down"}',
      '::node{id="a" label="Parse"}',
      '::node{id="b" label="Render"}',
      '::edge{from="a" to="b"}',
      ':::',
    ]);
    expect(html).not.toContain('data-diagram-compact');
  });
});
