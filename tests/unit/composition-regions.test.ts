import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { connectionRoute } from '../../src/composition-route.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import { compositionFrame, type CompositionCue } from '../../src/composition.js';
const source = `::::::composition{id="stable" layout="row"}
:::::scene-group{id="owners" title="Two independent owners" layout="row"}
::::object{id="left" title="Source"}
Stable responsibility: retains the original.
:::slot{id="value" title="Example value"}
Original
:::
::::
::::object{id="right" title="Destination"}
Stable responsibility: owns its local value.
:::slot{id="value" title="Example value"}
Waiting
:::
::::
:::::
::cue{at="1" action="copy" target="left" slot="value" to="right" toSlot="value"}
::cue{at="2" action="replace" target="right" slot="value" value="Independent result"}
::::::`;
const render = (text: string) =>
  renderMarkdown(text, {
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: text.length,
        sourceFile: path.resolve('test-results/regions.md'),
        sourceStart: 0,
        sourceText: text,
      },
    ],
    sourceRoot: process.cwd(),
    format: 'single-file',
    outputFilePath: path.resolve('test-results/regions.html'),
  });
describe('stable scene regions', () => {
  it('routes a label leader through a reversal without a zero-length rounded corner', () => {
    const route = connectionRoute({ x: 0, y: 220, w: 200, h: 30 }, { x: 0, y: 0, w: 0, h: 0 }, [
      { x: 0, y: 0, w: 200, h: 200 },
    ]);
    expect(route).not.toBe('');
    expect(route).not.toMatch(/NaN|Infinity/u);
    expect(route).toMatch(/L0,0$/u);
  });
  it('changes a value without reinterpreting its owner, and reconstructs before arrival', () => {
    const ids = ['left', 'right', 'left:value', 'right:value'];
    const cues: CompositionCue[] = [
      {
        at: '1',
        action: 'copy',
        target: 'left',
        slot: 'value',
        to: 'right',
        toSlot: 'value',
        duration: 0.6,
      },
      {
        at: '2',
        action: 'replace',
        target: 'right',
        slot: 'value',
        value: 'Independent result',
        duration: 0.6,
      },
    ];
    const final = compositionFrame(ids, cues, 3);
    expect(final.objects.get('left')?.content).toEqual({ source: 'left' });
    expect(final.objects.get('right')?.content).toEqual({ source: 'right' });
    expect(final.objects.get('left:value')?.content).toEqual({ source: 'left:value' });
    expect(final.objects.get('right:value')?.content).toEqual({ text: 'Independent result' });
    expect(compositionFrame(ids, cues, 0).objects.get('right:value')?.content).toEqual({
      source: 'right:value',
    });
    expect(compositionFrame(ids, cues, 1.3).travels[0]).toMatchObject({
      from: 'left:value',
      to: 'right:value',
    });
  });
  it('compiles independent final slot values, stable prose and semantic groups', async () => {
    const result = await render(source);
    expect(result.html).toContain('data-composition-slot="right:value"');
    expect(result.html).toContain('Independent result');
    expect(result.html).toContain('Stable responsibility: retains the original.');
    expect(result.html).toContain('Stable responsibility: owns its local value.');
    expect(result.html).toContain('semantic-scene-group');
  });
  it('rejects missing regions and destructive whole-owner edits, preserving valid local copies', async () => {
    await expect(
      render(
        source.replace('slot="value" value="Independent', 'slot="unknown" value="Independent'),
      ),
    ).rejects.toThrow(/slot/u);
    await expect(
      render(source.replace('target="right" slot="value" value=', 'target="right" value=')),
    ).rejects.toThrow(/stable object/u);
    await expect(render(source.replace('toSlot="value"', 'toSlot="unknown"'))).rejects.toThrow(
      /slot/u,
    );
    await expect(render(source.replace('id="right"', 'id="left"'))).rejects.toThrow(/unique/u);
  });
});
