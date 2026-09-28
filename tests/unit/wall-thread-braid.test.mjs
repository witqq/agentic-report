import { describe, expect, it } from 'vitest';

import { smoothSpread } from '../../extensions/wall-thread/braid.mjs';

/** Independent window scan: an off-by-one in the running mean changes endpoints and interior samples. */
function referenceSpread(room, maxSpread, reach) {
  const low = room.map((_, index) => {
    let value = maxSpread;
    for (let k = Math.max(0, index - reach); k <= Math.min(room.length - 1, index + reach); k++)
      value = Math.min(value, room[k]);
    return value;
  });
  return low.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, index - reach); k <= Math.min(low.length - 1, index + reach); k++) {
      sum += low[k];
      count++;
    }
    return Math.max(maxSpread * 0.3, sum / count);
  });
}

describe('wall-thread braid smoothing', () => {
  it.each([
    { room: [7], reach: 10 },
    { room: [8, 8, 4, 8, 7], reach: 1 },
    { room: Array.from({ length: 41 }, (_, index) => 3.5 + index * 0.15), reach: 10 },
    { room: Array.from({ length: 35 }, (_, index) => 8 - (index % 13) * 0.3), reach: 3 },
  ])(
    'matches the centred minimum and mean at every edge and interior sample',
    ({ room, reach }) => {
      const maxSpread = 10;
      const expected = referenceSpread(room, maxSpread, reach);
      const actual = smoothSpread(Float32Array.from(room), maxSpread, reach);
      expect(actual).toHaveLength(expected.length);
      for (let index = 0; index < actual.length; index++)
        expect(actual[index]).toBeCloseTo(expected[index], 5);
    },
  );
});
