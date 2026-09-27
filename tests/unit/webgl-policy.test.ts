import { describe, expect, it } from 'vitest';

import {
  fragmentPrecision,
  nextFrameBudget,
  WEBGL_POLICY,
  webglPixelRatio,
} from '../../src/browser/webgl-policy.js';

describe('WebGL drawing policy', () => {
  it('draws no denser than 1.5 on a phone or under a coarse pointer, and no denser than 2 elsewhere', () => {
    expect(webglPixelRatio(3, true, 412)).toBe(1.5);
    expect(webglPixelRatio(3, false, 390)).toBe(1.5);
    expect(webglPixelRatio(3, false, 1440)).toBe(2);
    expect(webglPixelRatio(1, true, 412)).toBe(1);
  });

  it('lowers the density on a slow frame and gives up after three slow frames at the lowest density', () => {
    let budget = { ratio: 2, slowFrames: 0, giveUp: false };
    const ratios: number[] = [];
    while (!budget.giveUp && ratios.length < 20) {
      budget = nextFrameBudget(budget, WEBGL_POLICY.slowFrameMs + 10);
      ratios.push(Number(budget.ratio.toFixed(3)));
    }
    expect(ratios).toEqual([1.5, 1.125, 1, 1, 1, 1]);
    expect(budget.giveUp).toBe(true);
    expect(nextFrameBudget({ ratio: 1, slowFrames: 2, giveUp: false }, 8)).toEqual({
      ratio: 1,
      slowFrames: 0,
      giveUp: false,
    });
  });

  it('asks for high precision when the GPU has it', () => {
    expect(fragmentPrecision(23)).toBe('highp');
    expect(fragmentPrecision(0)).toBe('mediump');
  });
});
