/**
 * Distance field of the page: a grid over the page where every cell knows how far it is, in CSS pixels,
 * from the nearest cell the thread may not enter (text with its padding, solid elements, the page edges).
 * The route, the nails, the sag and the balls all read it. Exact Euclidean distance transform
 * (Felzenszwalb–Huttenlocher, two linear passes).
 */

const FAR = 1e20;

/** One-dimensional squared distance transform of `f` into `d` (length `n`). */
function transform1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * @param {{ width: number, height: number, cell: number, edge: number,
 *   rects: ReadonlyArray<{ x: number, y: number, width: number, height: number, pad: number }> }} input
 */
export function buildField({ width, height, cell, edge, rects }) {
  const cols = Math.max(2, Math.ceil(width / cell));
  const rows = Math.max(2, Math.ceil(height / cell));
  const grid = new Float64Array(cols * rows).fill(FAR);
  const block = (x0, x1, y0, y1) => {
    const c0 = Math.max(0, Math.ceil(x0 / cell - 0.5));
    const c1 = Math.min(cols - 1, Math.floor(x1 / cell - 0.5));
    const r0 = Math.max(0, Math.ceil(y0 / cell - 0.5));
    const r1 = Math.min(rows - 1, Math.floor(y1 / cell - 0.5));
    for (let r = r0; r <= r1; r += 1) grid.fill(0, r * cols + c0, r * cols + c1 + 1);
  };
  for (const rect of rects)
    block(
      rect.x - rect.pad,
      rect.x + rect.width + rect.pad,
      rect.y - rect.pad,
      rect.y + rect.height + rect.pad,
    );
  block(-cell, edge, -cell, height + cell);
  block(width - edge, width + cell, -cell, height + cell);

  const longest = Math.max(cols, rows);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) f[r] = grid[r * cols + c];
    transform1d(f, rows, d, v, z);
    for (let r = 0; r < rows; r += 1) grid[r * cols + c] = d[r];
  }
  const dist = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    const row = r * cols;
    for (let c = 0; c < cols; c += 1) f[c] = grid[row + c];
    transform1d(f, cols, d, v, z);
    for (let c = 0; c < cols; c += 1) dist[row + c] = Math.min(4000, Math.sqrt(d[c]) * cell);
  }

  /** Distance at a page point (nearest cell). */
  const at = (x, y) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
    return dist[r * cols + c];
  };
  return { cols, rows, cell, dist, at, width, height };
}
