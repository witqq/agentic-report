import { describe, expect, it } from 'vitest';

import {
  BUILD_TIMING_LIMITS,
  boundedDiagnostic,
  confirmedPerformanceFailures,
  partitionMeasuredEntries,
  type PerformanceSample,
  sanitizeBuildTimings,
} from '../../src/core/effect-check.js';

const sample = (
  effectCallMs: number,
  pageTaskMs: number,
  baselineTaskMs = 0,
): PerformanceSample => ({ effectCallMs, pageTaskMs, baselineTaskMs });

describe('effect-check performance evidence', () => {
  it('attributes tasks by start time and excludes browser work outside the measured actions', () => {
    const phases = [
      { startMs: 100, endMs: 200 },
      { startMs: 300, endMs: 400 },
    ];
    const partition = partitionMeasuredEntries(
      [
        { startMs: 99, durationMs: 92 },
        { startMs: 100, durationMs: 53 },
        { startMs: 200, durationMs: 101 },
        { startMs: 300, durationMs: 57 },
        { startMs: 400, durationMs: 88 },
      ],
      phases,
    );
    expect(partition.byPhase.map((items) => items.map((item) => item.durationMs))).toEqual([
      [53],
      [57],
    ]);
    expect(partition.unassigned.map((item) => item.durationMs)).toEqual([92, 101, 88]);

    const housekeepingOnly = partitionMeasuredEntries([{ startMs: 99, durationMs: 92 }], phases);
    const maxMeasured = (items: typeof housekeepingOnly.byPhase): number =>
      Math.max(0, ...items.flatMap((phase) => phase.map((item) => item.durationMs)));
    // The counterexample is a 92 ms task in Playwright/setup time with no measured page task.
    expect(
      confirmedPerformanceFailures(
        sample(0, maxMeasured(housekeepingOnly.byPhase)),
        sample(0, maxMeasured(housekeepingOnly.byPhase)),
      ),
    ).toEqual({ effectCall: false, pageTask: false });
    expect(
      confirmedPerformanceFailures(
        sample(0, maxMeasured(partition.byPhase)),
        sample(0, maxMeasured(partition.byPhase)),
      ),
    ).toEqual({ effectCall: false, pageTask: true });
  });

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

  it('bounds advisory profiling and cancels it without surfacing its private error', async () => {
    // A diagnostic rejection or a nonsettling browser call must not replace a confirmed verdict.
    let cancellations = 0;
    const cancel = async (): Promise<void> => {
      await Promise.resolve();
      cancellations += 1;
    };
    expect(
      await boundedDiagnostic(Promise.reject(new Error('CANARY_PRIVATE_ERROR')), cancel, 100),
    ).toEqual({ available: false });
    expect(await boundedDiagnostic(new Promise<never>(() => undefined), cancel, 10)).toEqual({
      available: false,
    });
    expect(cancellations).toBe(2);
  });

  it('keeps the author stage names and drops junk from the build trace', () => {
    // An effect names its stages freely; text, bad names, non-numbers and floods never reach the file.
    const manyStages = Object.fromEntries(
      Array.from({ length: BUILD_TIMING_LIMITS.stages + 5 }, (_, index) => [
        `stage${index}`,
        index,
      ]),
    );
    const builds = sanitizeBuildTimings([
      {
        startMs: 10,
        durationMs: 4,
        width: 768,
        stages: {
          measure: 1.5,
          'route-search': 2,
          'has space': 1,
          '9starts-with-digit': 1,
          ['x'.repeat(33)]: 1,
          text: 'CANARY_AUTHOR_TEXT',
          negative: -1,
          infinite: Number.POSITIVE_INFINITY,
          nested: { deep: 1 },
        },
        untrustedText: 'CANARY_AUTHOR_TEXT',
      },
      { startMs: 20, durationMs: 1, width: 'wide', stages: manyStages },
      { startMs: 'soon', durationMs: 1 },
      { startMs: 1, durationMs: Number.NaN },
      'CANARY_AUTHOR_TEXT',
      null,
    ]);
    expect(builds).toEqual([
      { startMs: 10, durationMs: 4, width: 768, stages: { measure: 1.5, 'route-search': 2 } },
      {
        startMs: 20,
        durationMs: 1,
        width: 0,
        stages: Object.fromEntries(Object.entries(manyStages).slice(0, BUILD_TIMING_LIMITS.stages)),
      },
    ]);
    expect(JSON.stringify(builds)).not.toContain('CANARY_AUTHOR_TEXT');
    expect(
      sanitizeBuildTimings(
        Array.from({ length: BUILD_TIMING_LIMITS.builds + 1 }, () => ({
          startMs: 0,
          durationMs: 1,
        })),
      ),
    ).toHaveLength(BUILD_TIMING_LIMITS.builds);
    expect(sanitizeBuildTimings('CANARY_AUTHOR_TEXT')).toEqual([]);
  });
});
