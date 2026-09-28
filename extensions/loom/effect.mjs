/**
 * loom — a strip of cloth woven beside a section while the reader goes through it. The loom is strung
 * from the start: its warp threads stand in the free space next to the section. As the section passes
 * through the window, weft rows are woven into them one by one, over and under, and the shuttle waits
 * at the last row; when the section has been read, the strip is finished cloth.
 *
 * `loom="selvedge"` weaves a narrow vertical strip in the margin beside the section, row by row from
 * top to bottom, in plain weave. `loom="band"` weaves a horizontal band across the section's column in
 * the first free gap under its heading, pick by pick from left to right, in a 2/2 twill. Where the
 * margin is too narrow for a selvedge, the section gets a band instead.
 *
 * Each host is its own loom driven by its own progress (`ctx.progress(host)`); nothing joins them. The
 * geometry comes from `ctx.obstacles()` and `ctx.measure`, the colours from theme tokens. `live` and
 * `static` weave with the reading; `still` shows every strip finished.
 */
import { defineEffect } from 'agentic-report/effect';

/** Elements the cloth never lies on, besides text. */
const SOLID =
  'img, video, picture, pre, table, iframe, [data-semantic="card"], [data-semantic="callout"], [data-semantic="chart"], [data-semantic="diagram"]';

const WIDE = {
  pitch: 4,
  bandPitch: 5,
  strip: 22,
  band: 22,
  gap: 14,
  pad: 10,
  thread: 1.6,
  shuttle: 5,
};
const NARROW = {
  pitch: 3,
  bandPitch: 4.5,
  strip: 12,
  band: 16,
  gap: 7,
  pad: 6,
  thread: 1.2,
  shuttle: 3.5,
};

/** The reading window a section weaves in: from a fifth of its passage to three quarters. */
const BEGIN = 0.2;
const FINISH = 0.75;

const overlaps = (a, b, pad) =>
  a.x < b.x + b.width + pad &&
  b.x < a.x + a.width + pad &&
  a.y < b.y + b.height + pad &&
  b.y < a.y + a.height + pad;

/** Whether warp `i` lies over weft `j`: plain weave or a 2/2 twill. */
const warpOver = (pattern, i, j) => (pattern === 'plain' ? (i + j) % 2 === 0 : (i + j) % 4 < 2);

export default defineEffect({
  continuous: false,
  mount(ctx) {
    const surface = ctx.canvas({ host: ctx.hosts[0], kind: '2d' });
    const paint = surface.context;
    let colours;
    const readColours = () => {
      colours = {
        warp: ctx.tokens.read('--color-border-strong'),
        weft: ctx.tokens.read('--color-accent'),
        stripe: ctx.tokens.read('--color-accent-strong'),
        shuttle: ctx.tokens.read('--color-text-muted'),
        shadow: ctx.tokens.read('--shadow-color'),
      };
    };
    readColours();
    ctx.tokens.onChange(readColours);

    let looms = [];
    /** Fixed and sticky chrome: the drawing cuts it out, since it lies above the cloth. */
    let chrome = [];
    const states = new Map();

    /** A strip of cloth: rectangle, direction of weaving, pattern. */
    const place = (host, obstacles, size) => {
      const box = ctx.measure.rect(host);
      const heading = host.querySelector('h2, h3, h4');
      const lines = ctx.measure.lines(host);
      const blocked = [...obstacles.text, ...obstacles.solids];
      const width = document.documentElement.clientWidth;
      const clear = (rect) =>
        rect.x >= 4 &&
        rect.x + rect.width <= width - 4 &&
        !blocked.some((other) => overlaps(rect, other, size.pad)) &&
        !obstacles.columns.some(
          (column) => rect.x < column.right && rect.x + rect.width > column.left,
        );
      const kind = ctx.attribute(host, 'loom') ?? 'selvedge';
      if (kind === 'selvedge' && lines.length > 0) {
        const left = Math.min(...lines.map((line) => line.x));
        const right = Math.max(...lines.map((line) => line.x + line.width));
        const top = box.y;
        const height = box.height;
        const candidates = [
          { x: left - size.gap - size.strip, y: top, width: size.strip, height },
          { x: right + size.gap, y: top, width: size.strip, height },
        ];
        const rect = candidates.find(clear);
        if (rect !== undefined) return { rect, vertical: true, pattern: 'plain' };
      }
      // Band: the first free gap under the heading, across the section's column.
      const below = heading === null ? box.y : ctx.measure.rect(heading).y;
      const column = lines.length > 0 ? lines : [box];
      const x = Math.min(...column.map((line) => line.x));
      const bandWidth = Math.max(...column.map((line) => line.x + line.width)) - x;
      const rows = [...lines, { x, y: box.y + box.height, width: bandWidth, height: 0 }]
        .filter((line) => line.y >= below)
        .sort((a, b) => a.y - b.y);
      for (let index = 0; index + 1 < rows.length; index += 1) {
        const top = rows[index].y + rows[index].height;
        const space = rows[index + 1].y - top;
        if (space < size.band + size.pad * 2) continue;
        const rect = { x, y: top + (space - size.band) / 2, width: bandWidth, height: size.band };
        if (clear(rect)) return { rect, vertical: false, pattern: 'twill' };
      }
      return undefined;
    };

    const build = () => {
      const size = ctx.layout.narrow ? NARROW : WIDE;
      const found = ctx.obstacles();
      const width = document.documentElement.clientWidth;
      // Fixed or sticky chrome moves with the window; a narrow one (the contents column) closes its column.
      const columns = [];
      chrome = [];
      for (const element of document.body.querySelectorAll('header, nav, aside')) {
        const position = getComputedStyle(element).position;
        if (position !== 'sticky' && position !== 'fixed') continue;
        chrome.push(element);
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.width < width * 0.45)
          columns.push({ left: box.left - size.gap, right: box.right + size.gap });
      }
      const solids = [];
      for (const element of document.body.querySelectorAll(SOLID)) {
        if (element.closest('.effect-layer')) continue;
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) solids.push(ctx.measure.rect(element));
      }
      const text = found.text;
      looms = ctx.hosts.map((host, index) => {
        const placed = place(host, { text, solids, columns }, size);
        if (placed === undefined) return { host, placed: undefined };
        const { rect, vertical } = placed;
        const pitch = vertical ? size.pitch : size.bandPitch;
        const warps = Math.max(3, Math.floor((vertical ? rect.width : rect.height) / pitch));
        const picks = Math.max(1, Math.floor((vertical ? rect.height : rect.width) / pitch));
        const random = ctx.random(`loom:${index}`);
        // Each warp thread carries a small, fixed irregularity: cloth, not a ruled grid.
        const jitter = Array.from({ length: warps }, () => (random() - 0.5) * 0.6);
        return { host, placed, warps, picks, jitter, size, pitch };
      });
    };
    build();

    const woven = (host) => {
      if (ctx.render === 'still') return 1;
      const progress = ctx.progress(host);
      return Math.min(1, Math.max(0, (progress - BEGIN) / (FINISH - BEGIN)));
    };

    const setState = (host, name, value) => {
      const map = states.get(host) ?? new Map();
      states.set(host, map);
      if (map.get(name) === value) return;
      map.set(name, value);
      ctx.state.set(name, value, host);
    };

    /** Draw one loom: warps, the woven picks, the warps that lie over them, and the shuttle. */
    const drawLoom = (loom, done) => {
      const { placed, warps, picks, jitter, size, pitch } = loom;
      const { rect, vertical, pattern } = placed;
      const span = vertical ? rect.width : rect.height;
      const first = (span - (warps - 1) * pitch) / 2;
      const warpAt = (i) => first + i * pitch + jitter[i];
      const shown = Math.floor(picks * done);
      // Along the weaving direction `u` (0 at the start), across it `w`.
      const point = (u, w) => (vertical ? [rect.x + w, rect.y + u] : [rect.x + u, rect.y + w]);
      const line = (u0, w0, u1, w1) => {
        const [x0, y0] = point(u0, w0);
        const [x1, y1] = point(u1, w1);
        paint.moveTo(x0, y0);
        paint.lineTo(x1, y1);
      };
      const length = vertical ? rect.height : rect.width;

      // Shadow of the woven part on the wall.
      if (shown > 0) {
        paint.globalAlpha = 0.12;
        paint.fillStyle = colours.shadow;
        const [sx, sy] = point(0, first - size.thread);
        const along = shown * pitch;
        const across = (warps - 1) * pitch + size.thread * 2;
        paint.fillRect(sx + 1.5, sy + 2, vertical ? across : along, vertical ? along : across);
      }
      // Warp: strung over the whole length from the start.
      paint.globalAlpha = 0.85;
      paint.strokeStyle = colours.warp;
      paint.lineWidth = pitch * 0.5;
      paint.beginPath();
      for (let i = 0; i < warps; i += 1) line(0, warpAt(i), length, warpAt(i));
      paint.stroke();
      if (shown === 0) return;
      // Weft: the picks woven so far, in two tones by bands of six.
      paint.lineWidth = pitch * 0.72;
      paint.globalAlpha = 1;
      for (const [tone, colour] of [
        [0, colours.weft],
        [1, colours.stripe],
      ]) {
        paint.strokeStyle = colour;
        paint.beginPath();
        for (let j = 0; j < shown; j += 1)
          if (Math.floor(j / 6) % 2 === tone) {
            const u = (j + 0.5) * pitch;
            line(u, warpAt(0) - size.thread, u, warpAt(warps - 1) + size.thread);
          }
        paint.stroke();
      }
      // Where the warp lies over a pick, it is drawn again on top of it.
      paint.strokeStyle = colours.warp;
      paint.lineWidth = pitch * 0.5;
      paint.beginPath();
      for (let j = 0; j < shown; j += 1)
        for (let i = 0; i < warps; i += 1)
          if (warpOver(pattern, i, j))
            line(j * pitch + 0.4, warpAt(i), (j + 1) * pitch - 0.4, warpAt(i));
      paint.stroke();
      // The shuttle waits beside the last pick, on the side the next pick starts from.
      if (shown < picks) {
        const u = (shown - 0.5) * pitch;
        const side =
          shown % 2 === 0 ? warpAt(0) - size.shuttle * 1.6 : warpAt(warps - 1) + size.shuttle * 1.6;
        const [cx, cy] = point(u, side);
        paint.globalAlpha = 0.9;
        paint.fillStyle = colours.shuttle;
        paint.beginPath();
        paint.ellipse(
          cx,
          cy,
          vertical ? size.shuttle * 0.55 : size.shuttle * 1.6,
          vertical ? size.shuttle * 1.6 : size.shuttle * 0.55,
          0,
          0,
          Math.PI * 2,
        );
        paint.fill();
      }
    };

    return {
      at() {
        const ratio = surface.ratio;
        const origin = surface.toCanvas({ x: 0, y: 0, width: 0, height: 0 });
        paint.setTransform(1, 0, 0, 1, 0, 0);
        paint.globalAlpha = 1;
        paint.clearRect(0, 0, surface.element.width, surface.element.height);
        paint.setTransform(ratio, 0, 0, ratio, origin.x * ratio, origin.y * ratio);
        paint.lineCap = 'butt';
        paint.save();
        paint.beginPath();
        paint.rect(-origin.x, -origin.y, window.innerWidth, window.innerHeight);
        for (const element of chrome) {
          const box = element.getBoundingClientRect();
          if (box.width > 0 && box.height > 0)
            paint.rect(box.left - origin.x, box.top - origin.y, box.width, box.height);
        }
        paint.clip('evenodd');
        const top = -origin.y - 20;
        const bottom = -origin.y + window.innerHeight + 20;
        for (const loom of looms) {
          const done = woven(loom.host);
          setState(loom.host, 'woven', done >= 1);
          setState(loom.host, 'weaving', done > 0 && done < 1);
          if (loom.placed === undefined) continue;
          const { rect } = loom.placed;
          if (rect.y + rect.height < top || rect.y > bottom) continue;
          drawLoom(loom, done);
        }
        paint.restore();
        paint.globalAlpha = 1;
      },
      rebuild: build,
    };
  },
});
