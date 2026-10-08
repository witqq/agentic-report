import { describe, expect, it } from 'vitest';
import { compositionFrame, type CompositionCue } from '../../src/composition.js';
const cues: CompositionCue[] = [
  { at: '1', action: 'focus', target: 'source', duration: 1 },
  { at: '2', action: 'focus', target: 'result', duration: 1, emphasis: 'halo' },
  { at: '3', action: 'trace', target: 'source', to: 'result', duration: 1, effect: 'beam' },
  { at: '4', action: 'focus', target: 'result', duration: 1, emphasis: 'underline' },
  { at: '5', action: 'focus', target: 'source', duration: 1, emphasis: 'none' },
];
describe('directed attention', () => {
  it('hands attention over continuously without assuming that the context should dim', () => {
    const frame = compositionFrame(['source', 'result'], cues, 2.5);
    expect(frame.dim).toBe(false);
    expect(frame.objects.get('source')?.focusAmount).toBeCloseTo(0.5);
    expect(frame.objects.get('result')?.focusAmount).toBeCloseTo(0.5);
    expect(frame.objects.get('result')?.emphasis).toBe('halo');
    expect(
      compositionFrame(['source', 'result'], cues, 4.5).objects.get('result')?.focusAmount,
    ).toBe(1);
    expect(compositionFrame(['source', 'result'], cues, 6).objects.get('result')?.focusAmount).toBe(
      0,
    );
  });
  it('keeps a trace transient, directional and reproducible by a direct or backward seek', () => {
    expect(compositionFrame(['source', 'result'], cues, 3.5).traces).toEqual([
      { from: 'source', to: 'result', progress: 0.5, effect: 'beam' },
    ]);
    expect(compositionFrame(['source', 'result'], cues, 4).traces).toEqual([]);
    expect(compositionFrame(['source', 'result'], cues, Infinity).traces).toEqual([]);
    expect(compositionFrame(['source', 'result'], cues, 0).traces).toEqual([]);
    expect(compositionFrame(['source', 'result'], cues, 3.5).traces[0]?.progress).toBe(0.5);
  });
});
