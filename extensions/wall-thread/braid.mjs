/**
 * The braid and the balls as fibres. Three strands twist round the centre line, each made of a few
 * fibres; where the page leaves room the strands part a little, near text, nails and balls they close.
 * Every strand knows, per sample, whether it lies in front of the others or behind them, so the drawing
 * lays the back halves first, as whole strands, and the front halves over them fibre by fibre. A ball is a heap of elliptic fibres wound from
 * the core outwards. Positions are computed once per build; drawing only strokes them.
 */

const TAU = Math.PI * 2;
/** Length of a vector; `Math.hypot` is several times slower in hot loops. */
const length2d = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * @param {ReturnType<typeof import('./route.mjs').sampleLine>} samples
 * @param {{ at(x: number, y: number): number }} field
 * @param {Array<{ x: number, y: number, r: number }>} balls
 * @param {Array<{ x: number, y: number }>} nails
 * @param {Record<string, number>} options
 * @param {() => number} random
 */
export function buildBraid(samples, field, balls, nails, options, random) {
  const { count, x, y, nx, ny } = samples;
  const room = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    let value = clamp((field.at(x[index], y[index]) - options.clear) * 0.4, 0, options.spread);
    for (const nail of nails) {
      const d = length2d(nail.x - x[index], nail.y - y[index]);
      if (d < 22) value *= 0.35 + (0.65 * d) / 22;
    }
    for (const ball of balls) {
      const d = length2d(ball.x - x[index], ball.y - y[index]);
      if (d < ball.r * 1.2) value *= 0.4;
    }
    room[index] = value;
  }
  // The strands part and close slowly: a running minimum, then a running mean.
  const spread = new Float32Array(count);
  const reach = 10;
  const low = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    let value = options.spread;
    for (let k = Math.max(0, index - reach); k <= Math.min(count - 1, index + reach); k += 1)
      value = Math.min(value, room[k]);
    low[index] = value;
  }
  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, index - reach); k <= Math.min(count - 1, index + reach); k += 1) {
      sum += low[k];
      n += 1;
    }
    spread[index] = Math.max(options.spread * 0.3, sum / n);
  }

  // Positions are filled per range of samples when the drawing first needs them: a build does not pay
  // for the parts of a long page that are never on screen.
  const fibres = [];
  const strands = [];
  for (let strand = 0; strand < 3; strand += 1) {
    const front = new Uint8Array(count);
    strands.push({
      strand,
      x: new Float32Array(count),
      y: new Float32Array(count),
      front,
      fray: 0,
    });
    for (let fibre = 0; fibre < options.fibres; fibre += 1)
      fibres.push({
        strand,
        lane: (fibre - (options.fibres - 1) / 2) * options.fibreGap,
        wave: random() * TAU,
        rate: 0.05 + random() * 0.05,
        x: new Float32Array(count),
        y: new Float32Array(count),
        front,
        fray: Math.floor(random() * 5),
      });
  }
  const fill = (start, end) => {
    for (const line of strands) {
      const shift = (line.strand * TAU) / 3;
      for (let index = start; index < end; index += 1) {
        const phase = (index * options.step * TAU) / options.twist + shift;
        const offset = spread[index] * Math.sin(phase);
        line.front[index] = Math.cos(phase) > 0 ? 1 : 0;
        line.x[index] = x[index] + nx[index] * offset;
        line.y[index] = y[index] + ny[index] * offset;
      }
    }
    for (const fibre of fibres) {
      const line = strands[fibre.strand];
      for (let index = start; index < end; index += 1) {
        const offset =
          fibre.lane + Math.sin(index * fibre.rate + fibre.wave) * options.fibreGap * 0.35;
        fibre.x[index] = line.x[index] + nx[index] * offset;
        fibre.y[index] = line.y[index] + ny[index] * offset;
      }
    }
  };
  return { fibres, strands, spread, fill };
}

/** Fibres of a ball, core first; `wound` fibres of them are drawn. */
export function buildBall(ball, options, random) {
  const count = Math.round(clamp(ball.r * options.ballDensity, 18, 80));
  const fibres = [];
  for (let index = 0; index < count; index += 1) {
    const depth = (index + 1) / count;
    const rx = ball.r * (0.35 + 0.63 * Math.sqrt(depth)) * (0.9 + random() * 0.1);
    fibres.push({
      cx: ball.x + (random() - 0.5) * ball.r * 0.12,
      cy: ball.y + (random() - 0.5) * ball.r * 0.12,
      rx,
      ry: rx * (0.3 + random() * 0.7),
      rotation: random() * Math.PI,
      start: random() * TAU,
      span: Math.PI * (1.2 + random() * 0.8),
      strand: index % 3,
      alpha: 0.55 + random() * 0.45,
    });
  }
  return fibres;
}
