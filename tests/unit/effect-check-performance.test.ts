import { describe, expect, it } from 'vitest';

import {
  confirmedPerformanceFailures,
  type PerformanceSample,
} from '../../src/core/effect-check.js';

const sample = (
  effectCallMs: number,
  pageTaskMs: number,
  baselineTaskMs = 0,
): PerformanceSample => ({ effectCallMs, pageTaskMs, baselineTaskMs });

describe('effect-check performance evidence', () => {
  it('rejects a repeatable slow effect call while ignoring a single delayed call', () => {
    // A one-off runner stall must not be reported as a slow effect; a planted slow frame repeats.
    expect(confirmedPerformanceFailures(sample(53, 0), sample(12, 0))).toEqual({
      effectCall: false,
      pageTask: false,
    });
    expect(confirmedPerformanceFailures(sample(53, 0), sample(61, 0))).toEqual({
      effectCall: true,
      pageTask: false,
    });
  });

  it('attributes page tasks only when both independent effect-free passes stay within budget', () => {
    // A task unique to one run is noise; deferred work caused by the effect recurs without a baseline.
    expect(confirmedPerformanceFailures(sample(4, 64), sample(3, 0))).toEqual({
      effectCall: false,
      pageTask: false,
    });
    expect(confirmedPerformanceFailures(sample(4, 64), sample(3, 62, 55))).toEqual({
      effectCall: false,
      pageTask: false,
    });
    expect(confirmedPerformanceFailures(sample(4, 64), sample(3, 62))).toEqual({
      effectCall: false,
      pageTask: true,
    });
    expect(confirmedPerformanceFailures(sample(50, 50), sample(50, 50))).toEqual({
      effectCall: false,
      pageTask: false,
    });
  });
});
