import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../src/render/markdown.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function renderDiagram(body: readonly string[]): Promise<string> {
  const workspace = await createTestWorkspace('diagram-layout');
  workspaces.push(workspace);
  const markdown = `# Diagram\n${body.join('\n')}\n`;
  const sourceFile = path.join(workspace, 'report.md');
  const rendered = await renderMarkdown(markdown, {
    sourceRoot: workspace,
    format: 'single-file',
    outputFilePath: path.join(workspace, 'artifact.html'),
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: markdown.length,
        sourceFile,
        sourceStart: 0,
        sourceText: markdown,
      },
    ],
  });
  return rendered.html;
}

function nodeBox(html: string, id: string): { readonly width: number; readonly height: number } {
  const group = new RegExp(`<g data-node-id="${id}"[^>]*>(.*?)</g>`, 'su').exec(html)?.[1];
  if (group === undefined) throw new Error(`Missing node ${id}.`);
  const width = Number(/width="([0-9.]+)"/u.exec(group)?.[1] ?? '0');
  const height = Number(/height="([0-9.]+)"/u.exec(group)?.[1] ?? '0');
  return { width, height };
}

function viewBoxWidth(html: string): number {
  return Number(/viewBox="0 0 ([0-9.]+) [0-9.]+"/u.exec(html)?.[1] ?? '0');
}

function edgeRoutes(html: string): string[] {
  return [...html.matchAll(/data-from="[^"]+" data-to="[^"]+" data-route="([a-z]+)"/gu)].map(
    (match) => match[1] ?? '',
  );
}

describe('flow diagram layout', () => {
  it('sizes a node box from its own label instead of a fixed rectangle', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Sizing" description="Box follows the label."}',
      '::node{id="short" label="A"}',
      '::node{id="long" label="Stage: advance, back, goTo, onEvent, preview"}',
      ':::',
    ]);
    const short = nodeBox(html, 'short');
    const long = nodeBox(html, 'long');
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.height).toBeGreaterThan(short.height);
    // Длинная подпись переносится на несколько строк, а не обрезается до одной.
    const longGroup = /<g data-node-id="long".*?<\/g>/su.exec(html)?.[0] ?? '';
    expect(longGroup.match(/class="visualization-node-label"/gu)?.length ?? 0).toBeGreaterThan(1);
  });

  it('keeps every edge between two adjacent groups out of the bottom lane', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Pair" description="Two edges between the same groups."}',
      '::group{id="left" label="Left"}',
      '::group{id="right" label="Right"}',
      '::node{id="a" label="First" group="left"}',
      '::node{id="b" label="Second" group="left"}',
      '::node{id="c" label="Third" group="right"}',
      '::node{id="d" label="Fourth" group="right"}',
      '::edge{from="a" to="c" label="first"}',
      '::edge{from="b" to="d" label="second"}',
      ':::',
    ]);
    expect(html).not.toContain('visualization-group-outer-edge');
    expect(html.match(/visualization-group-gap-edge/gu)).toBeNull();
  });

  it('sends a backward edge under the diagram and honours an explicit route', async () => {
    const backward = await renderDiagram([
      ':::diagram{title="Backward" description="A reverse edge."}',
      '::group{id="left" label="Left"}',
      '::group{id="right" label="Right"}',
      '::node{id="a" label="First" group="left"}',
      '::node{id="b" label="Second" group="right"}',
      '::edge{from="b" to="a" label="back"}',
      ':::',
    ]);
    expect(backward).toContain('visualization-group-outer-edge');

    const forced = await renderDiagram([
      ':::diagram{title="Forced" description="An explicit detour."}',
      '::group{id="left" label="Left"}',
      '::group{id="right" label="Right"}',
      '::node{id="a" label="First" group="left"}',
      '::node{id="b" label="Second" group="right"}',
      '::edge{from="a" to="b" label="around" route="around"}',
      ':::',
    ]);
    expect(forced).toContain('visualization-group-outer-edge');
    expect(edgeRoutes(forced)).toEqual(['around']);
  });

  it('lines up nodes of different groups when the author names the same row', async () => {
    const html = await renderDiagram([
      ':::diagram{title="Rows" description="Named rows line up."}',
      '::group{id="left" label="Left"}',
      '::group{id="right" label="Right"}',
      '::node{id="a" label="First" group="left" row="2"}',
      '::node{id="b" label="Second" group="right" row="2"}',
      '::edge{from="a" to="b" label="level"}',
      ':::',
    ]);
    const positions = [...html.matchAll(/<g data-node-id="(a|b)"[^>]*>.*?y="([0-9.]+)"/gsu)].map(
      (match) => Number(match[2]),
    );
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBe(positions[1]);
    expect(html).not.toContain('visualization-group-gap-edge');
  });

  it('follows the requested spacing without changing what is drawn', async () => {
    const body = (spacing: string): readonly string[] => [
      `:::diagram{title="Spacing" description="Breathing room." spacing="${spacing}"}`,
      '::node{id="a" label="First"}',
      '::node{id="b" label="Second"}',
      '::edge{from="a" to="b" label="next"}',
      ':::',
    ];
    const compact = await renderDiagram(body('compact'));
    const spacious = await renderDiagram(body('spacious'));
    expect(viewBoxWidth(compact)).toBeLessThan(viewBoxWidth(spacious));
    expect(nodeBox(compact, 'a')).toEqual(nodeBox(spacious, 'a'));
  });
});
