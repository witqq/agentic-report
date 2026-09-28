import { describe, expect, it } from 'vitest';

import { buildField } from '../../extensions/wall-thread/field.mjs';
import { buildRoute } from '../../extensions/wall-thread/route.mjs';

describe('wall-thread route diagnostics', () => {
  it('records real waypoint, search and pull work without changing the route', () => {
    // A straight synthetic route would leave search/pull at zero and fail to exercise the new probes.
    const field = buildField({
      width: 640,
      height: 1800,
      cell: 12,
      edge: 14,
      rects: [
        { x: 120, y: 290, width: 400, height: 150, pad: 12 },
        { x: 80, y: 890, width: 420, height: 130, pad: 12 },
      ],
    });
    const hosts = [
      {
        role: 'start',
        box: { x: 220, y: 90, width: 220, height: 90 },
        heading: { x: 220, y: 90, width: 160, height: 28 },
      },
      {
        role: 'pass',
        box: { x: 170, y: 600, width: 240, height: 90 },
        heading: { x: 170, y: 600, width: 170, height: 28 },
      },
      {
        role: 'tangle',
        box: { x: 240, y: 1160, width: 220, height: 90 },
        heading: { x: 240, y: 1160, width: 160, height: 28 },
      },
      {
        role: 'end',
        box: { x: 210, y: 1630, width: 220, height: 90 },
        heading: { x: 210, y: 1630, width: 160, height: 28 },
      },
    ];
    const options = {
      clear: 6,
      prefer: 40,
      near: 3,
      climb: 1.2,
      rMin: 18,
      rMax: 46,
      fillEvery: 1.5,
      greed: 1.4,
      nailTurn: 0.35,
      nailGap: 56,
      loop: 30,
      sag: 0.07,
      sagMax: 42,
    };
    const input = { field, hosts, svh: 900, options, random: () => 0.5 };
    const expected = buildRoute(input);
    const timing = { waypointsMs: 0, searchMs: 0, pullMs: 0, lineMs: 0, otherMs: 0 };
    const measured = buildRoute({ ...input, timing });
    expect(measured).toEqual(expected);
    expect(expected.line.length).toBeGreaterThan(20);
    expect(timing.waypointsMs).toBeGreaterThan(0);
    expect(timing.searchMs).toBeGreaterThan(0);
    expect(timing.pullMs).toBeGreaterThan(0);
    expect(timing.lineMs).toBeGreaterThan(0);
    expect(Object.values(timing).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
});
