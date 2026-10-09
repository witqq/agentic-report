import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  compositionFrame,
  compositionLineLabel,
  type CompositionCue,
} from '../../src/composition.js';
import { renderMarkdown } from '../../src/render/markdown.js';
const source = `::::composition{id="annotated" kind="diagram-code"}
:::object{id="result" title="Local value"}
A stable receiving value.
:::
:::object{id="code" role="code" notes="beside" lineStart="41" title="Example method"}
\`\`\`ts
const before = original;
const after = patch(before);
return after;
\`\`\`
:::
::cue{at="b2" until="b2.end" action="annotate" target="code" lines="2" to="result" value="The operation creates the local value."}
::cue{at="b3" action="annotate" target="code" lines="3" value="The caller receives the result."}
::cue{at="b3" action="connect" target="code" to="result" relation="data" value="return value"}
::::`;
const render = (text: string) =>
  renderMarkdown(text, {
    sourceMap: [
      {
        generatedStart: 0,
        generatedEnd: text.length,
        sourceFile: path.resolve('test-results/annotations.md'),
        sourceStart: 0,
        sourceText: text,
      },
    ],
    sourceRoot: process.cwd(),
    format: 'single-file',
    outputFilePath: path.resolve('test-results/annotations.html'),
  });
describe('code presentation annotations', () => {
  it('uses measured start/end anchors and retains precise line labels while code is unchanged', () => {
    const cues: CompositionCue[] = [
      {
        at: 'b2',
        until: 'b2.end',
        action: 'annotate',
        target: 'code',
        to: 'result',
        lines: '2',
        value: 'Creates the local value',
        duration: 0.6,
      },
    ];
    const resolve = (a: string) => ({ b2: 7, 'b2.end': 14 })[a] ?? Number(a);
    expect(compositionFrame(['code', 'result'], cues, 6, resolve).annotations.size).toBe(0);
    expect(
      compositionFrame(['code', 'result'], cues, 8, resolve).annotations.get('code'),
    ).toMatchObject({ text: 'Creates the local value', lines: '2', to: 'result', progress: 1 });
    expect(compositionFrame(['code', 'result'], cues, 14, resolve).annotations.size).toBe(0);
    expect(
      compositionFrame(['code', 'result'], cues, 8, resolve).objects.get('code')?.content,
    ).toEqual({ source: 'code' });
    expect(compositionLineLabel('2-4,7', 41)).toBe('L42–44, 47');
    expect(() =>
      compositionFrame(
        ['code'],
        [
          {
            at: '7',
            until: '6',
            action: 'annotate',
            target: 'code',
            value: 'No valid interval',
            duration: 0.6,
          },
        ],
        8,
        resolve,
      ),
    ).toThrow(/follow/u);
  });
  it('keeps every explanatory note and the original code in a static artifact', async () => {
    const result = await render(source);
    expect(result.html.replace(/<[^>]+>/gu, '')).toContain('const after = patch(before);');
    expect(result.html).toContain('The operation creates the local value.');
    expect(result.html).toContain('The caller receives the result.');
    expect(result.html).toContain('L42');
    expect(result.html).toContain('#composition-annotated-result');
  });
  it('refuses annotations of a non-code owner or a missing related object', async () => {
    await expect(
      render(source.replace('target="code" lines="2"', 'target="result" lines="2"')),
    ).rejects.toThrow(/code object/u);
    await expect(
      render(source.replace('lines="2" to="result"', 'lines="2" to="missing"')),
    ).rejects.toThrow(/named object/u);
  });
});
