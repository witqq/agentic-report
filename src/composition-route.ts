/** Routes use current stage rectangles, including entrances and replaced content. */
export interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Point {
  x: number;
  y: number;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Incomplete connection route.');
  return value;
}
const clearance = 12;
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
function ports(r: SceneRect): Array<{ at: Point; outside: Point }> {
  return [
    {
      at: { x: r.x + r.w, y: r.y + r.h / 2 },
      outside: { x: r.x + r.w + clearance, y: r.y + r.h / 2 },
    },
    { at: { x: r.x, y: r.y + r.h / 2 }, outside: { x: r.x - clearance, y: r.y + r.h / 2 } },
    {
      at: { x: r.x + r.w / 2, y: r.y + r.h },
      outside: { x: r.x + r.w / 2, y: r.y + r.h + clearance },
    },
    { at: { x: r.x + r.w / 2, y: r.y }, outside: { x: r.x + r.w / 2, y: r.y - clearance } },
  ];
}
function crosses(a: Point, b: Point, r: SceneRect): boolean {
  if (Math.abs(a.y - b.y) < 0.01)
    return (
      a.y > r.y + 0.1 &&
      a.y < r.y + r.h - 0.1 &&
      Math.max(a.x, b.x) > r.x + 0.1 &&
      Math.min(a.x, b.x) < r.x + r.w - 0.1
    );
  return (
    a.x > r.x + 0.1 &&
    a.x < r.x + r.w - 0.1 &&
    Math.max(a.y, b.y) > r.y + 0.1 &&
    Math.min(a.y, b.y) < r.y + r.h - 0.1
  );
}
function simplified(points: Point[]): Point[] {
  const unique = points.filter((p, i) => i === 0 || !same(p, required(points[i - 1])));
  return unique.filter((p, i) => {
    const a = unique[i - 1],
      b = unique[i + 1];
    return !a || !b || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}
function rounded(points: Point[]): string {
  let d = `M${required(points[0]).x},${required(points[0]).y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = required(points[i - 1]),
      p = required(points[i]),
      b = required(points[i + 1]);
    const incoming = Math.hypot(p.x - a.x, p.y - a.y),
      outgoing = Math.hypot(b.x - p.x, b.y - p.y);
    const radius = Math.min(7, incoming / 2, outgoing / 2);
    const before = {
      x: p.x + ((a.x - p.x) * radius) / incoming,
      y: p.y + ((a.y - p.y) * radius) / incoming,
    };
    const after = {
      x: p.x + ((b.x - p.x) * radius) / outgoing,
      y: p.y + ((b.y - p.y) * radius) / outgoing,
    };
    d += ` L${before.x},${before.y} Q${p.x},${p.y} ${after.x},${after.y}`;
  }
  const end = required(points.at(-1));
  return `${d} L${end.x},${end.y}`;
}
export function connectionRoute(a: SceneRect, b: SceneRect, obstacles: SceneRect[]): string {
  const all = [a, b, ...obstacles];
  const xs = all.flatMap((r) => [r.x - clearance, r.x + r.w + clearance]);
  const ys = all.flatMap((r) => [r.y - clearance, r.y + r.h + clearance]);
  const horizontal = b.x >= a.x + a.w || a.x >= b.x + b.w;
  const preferredA = horizontal ? (b.x >= a.x ? 0 : 1) : b.y >= a.y ? 2 : 3;
  const preferredB = horizontal ? (b.x >= a.x ? 1 : 0) : b.y >= a.y ? 3 : 2;
  let best: Point[] | undefined,
    score = Infinity;
  for (const [i, from] of ports(a).entries())
    for (const [j, to] of ports(b).entries()) {
      const p = from.outside,
        q = to.outside;
      const middles = [
        [p, { x: q.x, y: p.y }, q],
        [p, { x: p.x, y: q.y }, q],
        ...xs.map((x) => [p, { x, y: p.y }, { x, y: q.y }, q]),
        ...ys.map((y) => [p, { x: p.x, y }, { x: q.x, y }, q]),
      ];
      for (const middle of middles) {
        const points = simplified([from.at, ...middle, to.at]);
        if (
          points.some(
            (point, k) => k > 0 && all.some((r) => crosses(required(points[k - 1]), point, r)),
          )
        )
          continue;
        const length = points.reduce(
          (sum, p, k) =>
            k
              ? sum + Math.hypot(p.x - required(points[k - 1]).x, p.y - required(points[k - 1]).y)
              : 0,
          0,
        );
        const cost =
          length +
          (points.length - 2) * 14 +
          (i === preferredA ? 0 : 20) +
          (j === preferredB ? 0 : 20);
        if (cost < score) {
          best = points;
          score = cost;
        }
      }
    }
  // Overlapping objects have no unambiguous external route; no misleading wire.
  return best ? rounded(best) : '';
}
export function overlaps(a: SceneRect, b: SceneRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
