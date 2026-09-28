/**
 * The route of the thread: from the page geometry to one centre line through every marked host.
 *
 * 1. Each host becomes a waypoint: `start`, `tangle` and `end` a ball in the widest free place near the
 *    host, `pass` a nail beside the host's heading with a loop hanging from it.
 * 2. Long empty stretches between waypoints get a ball of their own where the page is emptiest.
 * 3. Consecutive waypoints are joined by an A* search on the distance field that never enters text and
 *    prefers to keep away from it; the grid path is pulled taut, and every turn left in it gets a nail.
 * 4. Between nails the thread sags like a rope, less where the sag would come near text.
 * 5. The line is resampled every few pixels; the braid and the drawing read the samples.
 *
 * Everything is a function of the layout and a seed, so two builds of the same page are identical.
 */

const TAU = Math.PI * 2;
/** Length of a vector; `Math.hypot` is several times slower in hot loops. */
const length2d = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Binary heap of grid indices keyed by cost. */
function heap() {
  const keys = [];
  const items = [];
  return {
    get size() {
      return items.length;
    },
    push(key, item) {
      let index = items.length;
      keys.push(key);
      items.push(item);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (keys[parent] <= key) break;
        keys[index] = keys[parent];
        items[index] = items[parent];
        index = parent;
      }
      keys[index] = key;
      items[index] = item;
    },
    pop() {
      const top = items[0];
      const lastKey = keys.pop();
      const lastItem = items.pop();
      if (items.length > 0) {
        let index = 0;
        for (;;) {
          let child = index * 2 + 1;
          if (child >= items.length) break;
          if (child + 1 < items.length && keys[child + 1] < keys[child]) child += 1;
          if (keys[child] >= lastKey) break;
          keys[index] = keys[child];
          items[index] = items[child];
          index = child;
        }
        keys[index] = lastKey;
        items[index] = lastItem;
      }
      return top;
    },
  };
}

/** The eight neighbours of a cell: column step, row step, length in cells. */
const STEP_C = [1, -1, 0, 0, 1, 1, -1, -1];
const STEP_R = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP_L = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

/**
 * Cheapest grid path from `from` to `to` inside the rows `[top, bottom)`: never through a cell closer
 * than `clear` to an obstacle, dearer near text (`prefer`) and when climbing.
 */
function search(field, from, to, top, bottom, options) {
  const { cols, cell, dist } = field;
  const r0 = clamp(Math.floor(top / cell), 0, field.rows - 1);
  const r1 = clamp(Math.ceil(bottom / cell), r0 + 1, field.rows);
  const size = (r1 - r0) * cols;
  const toLocal = (point) => {
    const c = clamp(Math.floor(point.x / cell), 0, cols - 1);
    const r = clamp(Math.floor(point.y / cell), r0, r1 - 1);
    return (r - r0) * cols + c;
  };
  const start = toLocal(from);
  const goal = toLocal(to);
  const cost = new Float32Array(size).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const goalC = goal % cols;
  const goalR = (goal - goalC) / cols;
  const weight = (local) => {
    const d = dist[r0 * cols + local];
    const near = d < options.prefer ? (options.prefer - d) / options.prefer : 0;
    return 1 + options.near * near * near;
  };
  const open = heap();
  cost[start] = 0;
  open.push(0, start);
  while (open.size > 0) {
    const current = open.pop();
    if (closed[current] === 1) continue;
    if (current === goal) break;
    closed[current] = 1;
    const c = current % cols;
    const r = (current - c) / cols;
    const here = weight(current);
    for (let step = 0; step < 8; step += 1) {
      const dr = STEP_R[step];
      const nc = c + STEP_C[step];
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= r1 - r0) continue;
      const next = nr * cols + nc;
      if (closed[next] === 1) continue;
      if (next !== goal && dist[r0 * cols + next] < options.clear) continue;
      const total =
        cost[current] +
        STEP_L[step] * cell * (here + weight(next)) * 0.5 +
        (dr < 0 ? options.climb * cell : 0);
      if (total >= cost[next]) continue;
      cost[next] = total;
      came[next] = current;
      open.push(total + length2d(nc - goalC, nr - goalR) * cell * options.greed, next);
    }
  }
  if (came[goal] === -1 && goal !== start) return undefined;
  const cells = [];
  for (let index = goal; index !== -1; index = came[index]) {
    const c = index % cols;
    cells.push({ x: (c + 0.5) * cell, y: ((index - c) / cols + r0 + 0.5) * cell });
    if (index === start) break;
  }
  cells.reverse();
  cells[0] = { x: from.x, y: from.y };
  cells[cells.length - 1] = { x: to.x, y: to.y };
  return cells;
}

/** The straight segment keeps `clear` from obstacles along its length (its ends are exempt). */
function visible(field, a, b, clear) {
  const length = length2d(b.x - a.x, b.y - a.y);
  const count = Math.ceil(length / (field.cell * 0.5));
  for (let index = 1; index < count; index += 1) {
    const u = index / count;
    if (field.at(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u) < clear) return false;
  }
  return true;
}

/** Pull a grid path taut: from each kept vertex, go on as far as the straight line stays clear. */
function pull(field, points, clear) {
  const taut = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let reach = anchor + 1;
    while (reach + 1 < points.length && visible(field, points[anchor], points[reach + 1], clear))
      reach += 1;
    taut.push(points[reach]);
    anchor = reach;
  }
  return taut;
}

function turn(a, b, c) {
  const first = Math.atan2(b.y - a.y, b.x - a.x);
  const second = Math.atan2(c.y - b.y, c.x - b.x);
  let delta = Math.abs(second - first);
  if (delta > Math.PI) delta = TAU - delta;
  return delta;
}

/** The best free place for a ball in the rows `[top, bottom]`, scored by size and nearness to `near`. */
function ballPlace(field, top, bottom, near, options, balls) {
  const { cols, cell, dist } = field;
  const r0 = clamp(Math.floor(top / cell), 0, field.rows - 1);
  const r1 = clamp(Math.ceil(bottom / cell), r0, field.rows - 1);
  let best;
  for (let r = r0; r <= r1; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const d = dist[r * cols + c];
      const radius = Math.min(options.rMax, (d - options.clear) / 1.5);
      if (radius < options.rMin) continue;
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      if (balls.some((ball) => length2d(ball.x - x, ball.y - y) < ball.r + radius + 48)) continue;
      const score = radius * 3 - length2d((x - near.x) * 0.25, y - near.y) * 0.12;
      if (best === undefined || score > best.score) best = { x, y, r: radius, score };
    }
  return best;
}

/** The nail beside a heading: the free cell nearest the heading's edge with room for the loop below. */
function nailPlace(field, heading, side, options) {
  const { cols, cell, dist } = field;
  const y = heading.y + Math.min(heading.height / 2, 24);
  const r0 = clamp(Math.floor((y - 28) / cell), 0, field.rows - 1);
  const r1 = clamp(Math.ceil((y + 28) / cell), r0, field.rows - 1);
  let best;
  for (let r = r0; r <= r1; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) * cell;
      const cy = (r + 0.5) * cell;
      if (side === 'left' ? x > heading.x : x < heading.x + heading.width) continue;
      if (dist[r * cols + c] < options.clear + 4) continue;
      const loop = field.at(x, cy + options.loop * 0.55);
      const hangs = loop >= options.loop * 0.6 + options.clear;
      const edge = side === 'left' ? heading.x - x : x - heading.x - heading.width;
      const score = edge + Math.abs(cy - y) * 0.5 + (hangs ? 0 : 400);
      if (best === undefined || score < best.score) best = { x, y: cy, hangs, score };
    }
  return best;
}

/** The nearest free cell to a point, within `reach` pixels. */
function freeNear(field, point, clear, reach) {
  const { cols, cell, dist } = field;
  const span = Math.ceil(reach / cell);
  const pc = Math.floor(point.x / cell);
  const pr = Math.floor(point.y / cell);
  let best;
  for (let r = Math.max(0, pr - span); r <= Math.min(field.rows - 1, pr + span); r += 1)
    for (let c = Math.max(0, pc - span); c <= Math.min(cols - 1, pc + span); c += 1) {
      if (dist[r * cols + c] < clear) continue;
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      const score = length2d(x - point.x, y - point.y);
      if (best === undefined || score < best.score) best = { x, y, score };
    }
  return best;
}

/** A spiral inside a ball from angle `from` to angle `to`, `turns` extra turns, radius by `radius(u)`. */
function spiral(ball, from, to, turns, radius, spin) {
  let sweep = ((to - from) * spin) % TAU;
  if (sweep < 0) sweep += TAU;
  sweep += turns * TAU;
  const count = Math.max(12, Math.ceil((sweep * ball.r) / 4));
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const u = index / count;
    const angle = from + spin * sweep * u;
    const r = ball.r * radius(u);
    points.push({ x: ball.x + Math.cos(angle) * r, y: ball.y + Math.sin(angle) * r });
  }
  return points;
}

/** A loop hanging from a nail: down one side, round the bottom, up to the nail again. */
function loopFrom(nail, depth, lean) {
  const points = [];
  const count = 28;
  for (let index = 0; index <= count; index += 1) {
    const u = index / count;
    points.push({
      x: nail.x + Math.sin(u * TAU) * depth * 0.42 * lean,
      y: nail.y + ((1 - Math.cos(u * TAU)) / 2) * depth,
    });
  }
  return points;
}

/** A rope between two fixed points: a sag proportional to the level span, reduced near text. */
function sag(field, a, b, options) {
  const span = Math.abs(b.x - a.x);
  const length = length2d(b.x - a.x, b.y - a.y);
  const count = Math.max(2, Math.ceil(length / 6));
  let depth = Math.min(options.sagMax, span * options.sag);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const points = [];
    let clear = true;
    for (let index = 1; index <= count; index += 1) {
      const u = index / count;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u + depth * 4 * u * (1 - u);
      if (index < count && depth > 0 && field.at(x, y) < options.clear) clear = false;
      points.push({ x, y });
    }
    if (clear || depth === 0) return points;
    depth = attempt === 3 ? 0 : depth * 0.5;
  }
  return [b];
}

/**
 * @param {{ field: ReturnType<typeof import('./field.mjs').buildField>, hosts: Array<{ role: string,
 *   box: { x: number, y: number, width: number, height: number }, heading: { x: number, y: number,
 *   width: number, height: number } }>, svh: number, options: Record<string, number>,
 *   timing?: { waypointsMs: number, searchMs: number, pullMs: number, lineMs: number, otherMs: number } }} input
 */
export function buildRoute({ field, hosts, svh, options, random, timing }) {
  const started = timing === undefined ? 0 : performance.now();
  const balls = [];
  const notes = [];
  /** @type {Array<{ kind: 'ball' | 'nail' | 'point', x: number, y: number, r?: number, hangs?: boolean, host?: number, role?: string }>} */
  const waypoints = [];
  let side = 'left';
  hosts.forEach((host, index) => {
    const role = host.role;
    if (role === 'start' || role === 'tangle' || role === 'end') {
      const top = host.box.y - svh * 0.25;
      const bottom = host.box.y + Math.max(host.box.height, svh * 0.4);
      const near = { x: host.heading.x, y: host.heading.y + host.heading.height / 2 };
      const place = ballPlace(field, top, bottom, near, options, balls);
      if (place !== undefined) {
        const ball = { x: place.x, y: place.y, r: place.r };
        balls.push(ball);
        waypoints.push({ kind: 'ball', ...ball, host: index, role });
        return;
      }
      notes.push(`no room for a ball at host ${index + 1}`);
    }
    const nail = nailPlace(field, host.heading, side, options) ??
      nailPlace(field, host.heading, side === 'left' ? 'right' : 'left', options) ?? {
        ...(freeNear(
          field,
          { x: host.heading.x - 16, y: host.heading.y },
          options.clear,
          svh * 0.3,
        ) ?? { x: options.clear, y: host.heading.y }),
        hangs: false,
      };
    side = nail.x < host.heading.x ? 'right' : 'left';
    waypoints.push({ kind: 'nail', x: nail.x, y: nail.y, hangs: nail.hangs, host: index, role });
  });

  // Balls in long empty stretches between waypoints.
  for (let index = 0; index + 1 < waypoints.length; index += 1) {
    const a = waypoints[index];
    const b = waypoints[index + 1];
    if (b.y - a.y < svh * options.fillEvery) continue;
    const top = a.y + (a.r ?? 0) + svh * 0.3;
    const bottom = b.y - (b.r ?? 0) - svh * 0.3;
    if (bottom <= top) continue;
    const place = ballPlace(
      field,
      top,
      bottom,
      { x: (a.x + b.x) / 2, y: (top + bottom) / 2 },
      options,
      balls,
    );
    if (place === undefined) continue;
    const ball = { x: place.x, y: place.y, r: place.r };
    balls.push(ball);
    waypoints.splice(index + 1, 0, { kind: 'ball', ...ball, role: 'fill' });
  }
  if (timing !== undefined) timing.waypointsMs = performance.now() - started;

  /** The route as ordered pieces: `shape` keeps its form, `line` sags between its ends. */
  const pieces = [];
  const nails = [];
  const stations = [];
  let cursor;
  const spin = 1;
  waypoints.forEach((point, index) => {
    const next = waypoints[index + 1];
    const previous = waypoints[index - 1];
    // Where the thread must arrive for this waypoint.
    let arrive = { x: point.x, y: point.y };
    if (point.kind === 'ball' && previous !== undefined) {
      const angle = Math.atan2(previous.y - point.y, previous.x - point.x);
      arrive = {
        x: point.x + Math.cos(angle) * point.r * 0.92,
        y: point.y + Math.sin(angle) * point.r * 0.92,
      };
    }
    if (cursor !== undefined) {
      const top = Math.min(cursor.y, arrive.y) - svh * 0.3;
      const bottom = Math.max(cursor.y, arrive.y) + svh * 0.3;
      const searchStart = timing === undefined ? 0 : performance.now();
      const path =
        search(field, cursor, arrive, top, bottom, options) ??
        search(field, cursor, arrive, 0, field.height, options);
      if (timing !== undefined) timing.searchMs += performance.now() - searchStart;
      if (path === undefined) notes.push(`no free path to waypoint ${index + 1}; drawn straight`);
      const pullStart = timing === undefined ? 0 : performance.now();
      const taut = path === undefined ? [cursor, arrive] : pull(field, path, options.clear);
      if (timing !== undefined) timing.pullMs += performance.now() - pullStart;
      for (let vertex = 1; vertex < taut.length; vertex += 1) {
        const a = taut[vertex - 1];
        const b = taut[vertex];
        pieces.push({ kind: 'line', a, b });
        const c = taut[vertex + 1];
        if (c !== undefined && turn(a, b, c) > options.nailTurn) nails.push({ x: b.x, y: b.y });
      }
    }
    stations.push({ host: point.host, piece: pieces.length });
    if (point.kind === 'ball') {
      const leave =
        next === undefined
          ? Math.atan2(point.y - (previous?.y ?? point.y - 1), point.x - (previous?.x ?? point.x))
          : Math.atan2(next.y - point.y, next.x - point.x);
      const enter =
        previous === undefined
          ? leave + Math.PI * 0.8
          : Math.atan2(arrive.y - point.y, arrive.x - point.x);
      let radius;
      if (previous === undefined) radius = (u) => 0.18 + 0.74 * u;
      else if (next === undefined) radius = (u) => 0.92 - 0.74 * u;
      else radius = (u) => 0.42 + 0.5 * Math.abs(2 * u - 1) ** 1.4;
      const points = spiral(point, enter, leave, next === undefined ? 1.5 : 1.25, radius, spin);
      pieces.push({ kind: 'shape', points, ball: point });
      cursor = points[points.length - 1];
      if (next === undefined) return;
      cursor = {
        x: point.x + Math.cos(leave) * point.r * 0.92,
        y: point.y + Math.sin(leave) * point.r * 0.92,
      };
      return;
    }
    nails.push({ x: point.x, y: point.y, host: point.host });
    if (point.hangs) {
      const lean = random() < 0.5 ? -1 : 1;
      pieces.push({ kind: 'shape', points: loopFrom(point, options.loop, lean) });
    }
    cursor = { x: point.x, y: point.y };
  });

  // Nails closer than `nailGap` to one another or inside a ball collapse into one.
  const kept = [];
  for (const nail of nails) {
    if (balls.some((ball) => length2d(ball.x - nail.x, ball.y - nail.y) < ball.r * 1.3)) continue;
    const near = kept.find(
      (other) => length2d(other.x - nail.x, other.y - nail.y) < options.nailGap,
    );
    if (near === undefined) kept.push(nail);
    else if (nail.host !== undefined) Object.assign(near, nail);
  }

  // Centre line: shapes as they are, lines sagging between their ends.
  const lineStart = timing === undefined ? 0 : performance.now();
  const line = [];
  const pieceStart = [];
  for (const piece of pieces) {
    pieceStart.push(line.length);
    if (piece.kind === 'shape') {
      for (const point of piece.points) line.push(point);
      continue;
    }
    if (line.length === 0) line.push(piece.a);
    for (const point of sag(field, piece.a, piece.b, options)) line.push(point);
  }
  pieceStart.push(line.length);
  if (line.length === 0 && waypoints[0] !== undefined)
    line.push({ x: waypoints[0].x, y: waypoints[0].y });
  if (timing !== undefined) {
    timing.lineMs = performance.now() - lineStart;
    timing.otherMs = Math.max(
      0,
      performance.now() -
        started -
        timing.waypointsMs -
        timing.searchMs -
        timing.pullMs -
        timing.lineMs,
    );
  }

  return { line, pieceStart, stations, nails: kept, balls, notes };
}

/**
 * Resample the centre line every `step` pixels: positions, arc length, unit normals and the running
 * maximum of depth (the head follows it, so loops and spirals do not make the head jump back).
 */
export function sampleLine(line, step) {
  const xs = [];
  const ys = [];
  const origin = [];
  if (line.length === 0)
    return { x: new Float32Array(0), y: new Float32Array(0), count: 0, origin };
  xs.push(line[0].x);
  ys.push(line[0].y);
  origin.push(0);
  let carry = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    const length = length2d(b.x - a.x, b.y - a.y);
    let at = step - carry;
    while (at <= length) {
      const u = at / length;
      xs.push(a.x + (b.x - a.x) * u);
      ys.push(a.y + (b.y - a.y) * u);
      origin.push(index);
      at += step;
    }
    carry = length - (at - step);
  }
  const count = xs.length;
  const x = Float32Array.from(xs);
  const y = Float32Array.from(ys);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const deepest = new Float32Array(count);
  let depth = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const a = Math.max(0, index - 1);
    const b = Math.min(count - 1, index + 1);
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const length = length2d(dx, dy) || 1;
    nx[index] = -dy / length;
    ny[index] = dx / length;
    depth = Math.max(depth, y[index]);
    deepest[index] = depth;
  }
  return { x, y, nx, ny, deepest, count, origin };
}
