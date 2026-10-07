import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { renderMarkdown } from '../../src/render/markdown.js';
import { COMPOSITIONS } from '../../src/composition.js';
import {
  compositionFrame,
  compositionTime,
  compositionReference,
  type CompositionCue,
} from '../../src/composition.js';
const cue = (
  action: CompositionCue['action'],
  at: string,
  rest: Partial<CompositionCue> = {},
): CompositionCue => ({ action, at, target: 'source', duration: 0.6, ...rest });
describe('directed compositions', () => {
  it('distinguishes copying from transferring and reconstructs an earlier state', () => {
    const ids = ['source', 'result'];
    const copy = [cue('copy', '1', { to: 'result' })];
    expect(compositionFrame(ids, copy, 2).objects.get('source')?.content).toEqual({
      source: 'source',
    });
    expect(compositionFrame(ids, copy, 2).objects.get('result')?.content).toEqual({
      source: 'source',
    });
    const transfer = [cue('transfer', '1', { to: 'result' })];
    expect(compositionFrame(ids, transfer, 2).objects.get('source')?.content).toEqual({
      empty: true,
    });
    expect(compositionFrame(ids, transfer, 0).objects.get('source')?.content).toEqual({
      source: 'source',
    });
    expect(compositionFrame(ids, transfer, 0).objects.get('result')?.content).toEqual({
      source: 'result',
    });
    expect(compositionFrame(ids, transfer, 1.3).travels[0]?.progress).toBeCloseTo(0.5);
  });
  it('uses measured speech starts, end and offsets instead of a guessed interval', () => {
    expect(compositionTime('b2', [0, 7, 11], 19)).toBe(7);
    expect(compositionTime('b2.end+0.2', [0, 7, 11], 19)).toBe(11.2);
    expect(compositionTime('b3.end', [0, 7, 11], 19)).toBe(19);
    expect(() => compositionTime('b4', [0, 7, 11], 19)).toThrow();
    const cues = [cue('replace', 'b2', { value: 'changed' })];
    const resolve = (a: string) => compositionTime(a, [0, 7, 11], 19);
    expect(compositionFrame(['source'], cues, 5, resolve).objects.get('source')?.content).toEqual({
      source: 'source',
    });
    expect(compositionFrame(['source'], cues, 8, resolve).objects.get('source')?.content).toEqual({
      text: 'changed',
    });
  });
  it('reveals objects, draws connections, compares and focuses code, then frames detail', () => {
    const cues = [
      cue('reveal', '1'),
      cue('connect', '2', { to: 'result', value: 'data' }),
      cue('compare', '3', { to: 'result' }),
      cue('focus', '4', { lines: '2-4' }),
      cue('camera', '5', { target: 'result' }),
    ];
    expect(compositionFrame(['source', 'result'], cues, 0).objects.get('source')?.visible).toBe(
      false,
    );
    const pair = compositionFrame(['source', 'result'], cues, 3.9);
    expect([...pair.objects.values()].every((o) => o.focus)).toBe(true);
    const final = compositionFrame(['source', 'result'], cues, Infinity);
    expect(final.objects.get('source')?.lines).toBe('2-4');
    expect(final.objects.get('result')?.focus).toBe(false);
    expect(final.connections[0]).toEqual({
      from: 'source',
      to: 'result',
      label: 'data',
      progress: 1,
    });
    expect(final.camera).toEqual({ target: 'result', progress: 1 });
  });
});

const render = (source: string) =>
  renderMarkdown(source, {
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: source.length,
        sourceFile: path.resolve('test-results/composition.md'),
        sourceStart: 0,
        sourceText: source,
      },
    ],
    sourceRoot: process.cwd(),
    format: 'single-file',
    outputFilePath: path.resolve('test-results/composition-test.html'),
  });
describe('composition grammar', () => {
  const source = (kind: string, cue: string) => `::::composition{id="example" kind="${kind}"}
:::object{id="source" title="Source" role="source"}
Original value
:::
:::object{id="result" title="Result" role="result"}
Destination
:::
${cue}
::::
`;
  it('compiles every composition with package layout and final state', async () => {
    for (const kind of COMPOSITIONS) {
      const result = await render(
        source(kind, '::cue{at="1" action="replace" target="result" value="Final"}'),
      );
      expect(result.html).toContain(`data-composition="${kind}"`);
      expect(result.html).toContain('Final');
      expect(result.html).toContain('Original value');
    }
  });
  it('refuses direct prose rather than silently dropping it', async () => {
    await expect(
      render(
        source('ownership', 'Lost explanation\n\n::cue{at="1" action="focus" target="source"}'),
      ),
    ).rejects.toThrow(/directly holds/u);
  });
  it('remaps local SVG references without changing external links', () => {
    const ids = new Map([['arrow', 'copy-arrow']]);
    expect(compositionReference('url(#arrow)', ids)).toBe('url(#copy-arrow)');
    expect(compositionReference('url("#arrow")', ids)).toBe('url("#copy-arrow")');
    expect(compositionReference('#arrow', ids)).toBe('#copy-arrow');
    expect(compositionReference('https://example.org/#arrow', ids)).toBe(
      'https://example.org/#arrow',
    );
  });
  it('rejects foreign targets and incompatible action fields', async () => {
    await expect(
      render(source('ownership', '::cue{at="1" action="copy" target="source" to="missing"}')),
    ).rejects.toThrow(/destination/u);
    await expect(
      render(source('ownership', '::cue{at="1" action="replace" target="result"}')),
    ).rejects.toThrow(/plain-text/u);
    await expect(
      render(
        source('ownership', '::cue{at="1" action="focus" target="result" lines="1-99999999"}'),
      ),
    ).rejects.toThrow();
  });
});
