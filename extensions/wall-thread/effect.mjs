/**
 * wall-thread — a braided thread that runs down the page from host to host. It starts in a ball, hangs
 * on nails beside the headings it passes, sags between them, winds through balls in the empty places of
 * the page and ends in a last ball. The reader's progress draws it: the head of the thread is where the
 * reading line is. Hosts are sections and cards with `thread="start|pass|tangle|end"`.
 *
 * One geometry serves every render mode: `live` and `static` draw the thread up to the reading line on a
 * 2D canvas, `still` draws all of it at once. Colours are theme tokens, re-read when the theme changes.
 */
import { defineEffect } from 'agentic-report/effect';
import { buildBall, buildBraid } from './braid.mjs';
import { buildField } from './field.mjs';
import { buildRoute, sampleLine } from './route.mjs';

const length2d = (dx, dy) => Math.sqrt(dx * dx + dy * dy);

/** Elements the thread goes round as a whole, besides text. */
const SOLID =
  'img, video, picture, svg, pre, table, iframe, canvas, [data-semantic="card"], [data-semantic="callout"], [data-semantic="chart"], [data-semantic="diagram"]';
/** Where page text lives: the content and the footer; the top bar and the contents are chrome. */
const CONTENT = 'main, body > footer, [data-localized-page-variant] > footer';
/** Chrome that closes its column when it is pinned and narrow: the contents column. */
const CHROME = 'header, nav, aside, [role="banner"], [role="navigation"]';

const WIDE = {
  cell: 12,
  edge: 14,
  pad: 12,
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
  step: 3,
  spread: 3.2,
  twist: 54,
  fibres: 2,
  fibreGap: 1.2,
  fibreWidth: 1.3,
  ballDensity: 1.5,
  nail: 3,
  narrow: false,
};
const NARROW = {
  ...WIDE,
  cell: 6,
  edge: 5,
  pad: 7,
  clear: 4,
  prefer: 14,
  rMin: 11,
  rMax: 26,
  fillEvery: 1.8,
  nailGap: 40,
  loop: 16,
  sagMax: 18,
  step: 2.5,
  spread: 1.8,
  twist: 36,
  fibres: 2,
  fibreGap: 0.8,
  fibreWidth: 0.9,
  ballDensity: 1.9,
  nail: 2.3,
  narrow: true,
};

/** Strand colours: the accent and its strong shade; the back of the braid falls into the strong one. */
const STRANDS = ['--color-accent', '--color-accent-strong', '--color-accent'];

export default defineEffect({
  continuous: false,
  mount(ctx) {
    const surface = ctx.canvas({ host: ctx.hosts[0], kind: '2d' });
    const paint = surface.context;
    let colours;
    const readColours = () => {
      colours = {
        strands: STRANDS.map((token) => ctx.tokens.read(token)),
        back: ctx.tokens.read('--color-accent-strong'),
        shadow: ctx.tokens.read('--shadow-color'),
        nail: ctx.tokens.read('--color-text-muted'),
        shine: ctx.tokens.read('--color-surface-raised'),
        shelf: ctx.tokens.read('--color-border-strong'),
      };
    };
    readColours();
    ctx.tokens.onChange(readColours);

    let built;
    let measuredGeometry;
    let measuredHeight = 0;
    /** What the canvas shows now: the build, colours, head, scroll and canvas size it was drawn with. */
    let drawn;
    const reached = new Map();

    const build = () => {
      // effect-check creates this optional numeric sink after mount, before its measured actions.
      const timings = Array.isArray(window.__agenticReportBuildTimings)
        ? window.__agenticReportBuildTimings
        : undefined;
      const ticks = timings === undefined ? undefined : [performance.now()];
      const options = ctx.pick({ wide: WIDE, narrow: NARROW });
      const svh = ctx.layout.svh;
      const root = document.documentElement;
      const width = root.clientWidth;
      const height = root.scrollHeight;
      measuredHeight = height;
      // Fixed and sticky elements move with the window: the engine keeps their text out of the measured
      // lines and hands them over as the `pinned` layer. The drawing cuts them out, and a narrow pinned
      // column (the contents) closes its whole column, so the route does not depend on the scroll.
      const pinned = ctx.obstacles().pinned;
      const chrome = pinned.map(({ element }) => element);
      const rects = [];
      const roots = [...document.body.querySelectorAll(CONTENT)];
      for (const root of roots.length > 0 ? roots : [document.body]) {
        if (root.closest('.effect-layer') || chrome.some((element) => element.contains(root)))
          continue;
        for (const rect of ctx.measure.lines(root)) rects.push({ ...rect, pad: options.pad });
      }
      for (const { element, rect } of pinned)
        if (
          rect.width < width * 0.45 &&
          (element.matches(CHROME) || element.querySelector(CHROME) !== null)
        )
          rects.push({
            x: rect.x + window.scrollX,
            y: 0,
            width: rect.width,
            height,
            pad: options.pad,
          });
      for (const element of document.body.querySelectorAll(SOLID)) {
        if (element.closest('.effect-layer, header, dialog')) continue;
        if (chrome.some((outer) => outer.contains(element))) continue;
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        rects.push({ ...ctx.measure.rect(element), pad: options.pad * 0.6 });
      }
      const hosts = ctx.hosts.map((host) => {
        const heading = host.querySelector('h2, h3, h4, [data-card-title], strong') ?? host;
        return {
          role: ctx.attribute(host, 'thread') ?? 'pass',
          box: ctx.measure.rect(host),
          heading: ctx.measure.rect(heading),
        };
      });
      // Font and resize notifications can arrive in consecutive frames for the same layout. Keep the
      // measured geometry and element identities: a replacement host or pinned element needs fresh
      // state targets and clipping even when its rectangle is unchanged.
      const geometry = JSON.stringify([width, height, svh, options.narrow, rects, hosts]);
      ticks?.push(performance.now());
      if (
        built !== undefined &&
        geometry === measuredGeometry &&
        chrome.length === built.chrome.length &&
        chrome.every((element, index) => element === built.chrome[index]) &&
        ctx.hosts.length === built.hostElements.length &&
        ctx.hosts.every((element, index) => element === built.hostElements[index])
      )
        return;
      const field = buildField({ width, height, cell: options.cell, edge: options.edge, rects });
      ticks?.push(performance.now());
      const random = ctx.random(`wall-thread:${width}`);
      const routeTiming =
        ticks === undefined
          ? undefined
          : { waypointsMs: 0, searchMs: 0, pullMs: 0, lineMs: 0, otherMs: 0 };
      const route = buildRoute({ field, hosts, svh, options, random, timing: routeTiming });
      ticks?.push(performance.now());
      const samples = sampleLine(route.line, options.step);
      ticks?.push(performance.now());
      const braid = buildBraid(samples, field, route.balls, route.nails, options, random);
      ticks?.push(performance.now());
      const nearest = (point) => {
        let best = 0;
        let distance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < samples.count; index += 1) {
          const d = length2d(samples.x[index] - point.x, samples.y[index] - point.y);
          if (d < distance) {
            distance = d;
            best = index;
          }
        }
        return best;
      };
      const firstSampleOf = (lineIndex) => {
        for (let index = 0; index < samples.count; index += 1)
          if (samples.origin[index] >= lineIndex) return index;
        return Math.max(0, samples.count - 1);
      };
      const stations = route.stations
        .filter((station) => station.host !== undefined)
        .map((station) => ({
          host: ctx.hosts[station.host],
          sample: firstSampleOf(route.pieceStart[station.piece] ?? 0),
        }));
      ticks?.push(performance.now());
      const balls = route.balls.map((ball, index) => {
        const inside = [];
        for (let sample = 0; sample < samples.count; sample += 1)
          if (length2d(samples.x[sample] - ball.x, samples.y[sample] - ball.y) < ball.r)
            inside.push(sample);
        return {
          ...ball,
          enter: inside[0] ?? 0,
          leave: inside[inside.length - 1] ?? 0,
          source: index === 0 && inside[0] === 0,
          fibres: buildBall(ball, options, random),
        };
      });
      ticks?.push(performance.now());
      const nails = route.nails.map((nail) => ({ ...nail, sample: nearest(nail) }));
      ticks?.push(performance.now());
      // Chunks of samples with their vertical extent: a frame strokes only those on screen.
      const chunk = 48;
      const chunks = [];
      for (let start = 0; start < samples.count; start += chunk) {
        const end = Math.min(samples.count, start + chunk + 1);
        let top = Number.POSITIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        for (let index = start; index < end; index += 1) {
          top = Math.min(top, samples.y[index]);
          bottom = Math.max(bottom, samples.y[index]);
        }
        chunks.push({ start, end, top: top - 12, bottom: bottom + 12, filled: false });
      }
      built = {
        options,
        samples,
        braid,
        balls,
        nails,
        stations,
        chunks,
        chrome,
        hostElements: [...ctx.hosts],
        notes: route.notes,
      };
      measuredGeometry = geometry;
      if (ticks !== undefined && timings !== undefined) {
        const ended = performance.now();
        timings.push({
          startMs: ticks[0],
          durationMs: ended - ticks[0],
          width,
          measureMs: ticks[1] - ticks[0],
          fieldMs: ticks[2] - ticks[1],
          routeMs: ticks[3] - ticks[2],
          routeWaypointsMs: routeTiming.waypointsMs,
          routeSearchMs: routeTiming.searchMs,
          routePullMs: routeTiming.pullMs,
          routeLineMs: routeTiming.lineMs,
          routeOtherMs: routeTiming.otherMs,
          sampleMs: ticks[4] - ticks[3],
          braidMs: ticks[5] - ticks[4],
          stationsMs: ticks[6] - ticks[5],
          ballsMs: ticks[7] - ticks[6],
          nailsMs: ticks[8] - ticks[7],
          chunksMs: ended - ticks[8],
        });
      }
    };
    build();

    // A change of the page height without a change of width (a disclosure opened) also moves the hosts.
    // The engine rebuilds on width, fonts and entrances; this asks it for a rebuild too, and the engine
    // draws the rebuilt thread in the next frame.
    const observer = new ResizeObserver(() => {
      if (Math.abs(document.documentElement.scrollHeight - measuredHeight) > 2)
        ctx.rebuild('height');
    });
    observer.observe(document.body);

    const headAt = (progress) => {
      const { samples } = built;
      if (ctx.render === 'still' || samples.count === 0) return samples.count - 1;
      const line = window.scrollY + window.innerHeight * (0.55 + 0.45 * progress);
      let low = 0;
      let high = samples.count - 1;
      if (samples.deepest[0] > line) return 0;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (samples.deepest[middle] <= line) low = middle;
        else high = middle - 1;
      }
      return low;
    };

    /**
     * Stroke the fibres lying behind (or in front of) the others, up to the head. Fibres of one colour
     * go into one path, so a frame is a handful of strokes however many fibres there are.
     */
    const strokeFibres = (visible, head, front) => {
      const { braid, options, samples } = built;
      paint.lineWidth = front
        ? options.fibreWidth
        : options.fibreWidth + options.fibreGap * options.fibres;
      paint.globalAlpha = front ? 0.95 : 0.5;
      const lines = front ? braid.fibres : braid.strands;
      const groups = new Map();
      for (const fibre of lines) {
        const colour = front ? colours.strands[fibre.strand] : colours.back;
        groups.set(colour, [...(groups.get(colour) ?? []), fibre]);
      }
      for (const [colour, fibres] of groups) {
        paint.strokeStyle = colour;
        paint.beginPath();
        for (const fibre of fibres) {
          const last = Math.min(head - fibre.fray, samples.count - 1);
          for (const part of visible) {
            const end = Math.min(part.end, last + 1);
            let pen = false;
            for (let index = part.start; index < end; index += 1) {
              if ((fibre.front[index] === 1) !== front) {
                pen = false;
                continue;
              }
              if (!pen) {
                const from = Math.max(0, index - 1);
                paint.moveTo(fibre.x[from], fibre.y[from]);
                pen = true;
              }
              paint.lineTo(fibre.x[index], fibre.y[index]);
            }
          }
        }
        paint.stroke();
      }
    };

    const drawBall = (ball, head) => {
      const { options } = built;
      const wound =
        ctx.render === 'still' || ball.source
          ? 1
          : Math.min(1, Math.max(0, (head - ball.enter) / Math.max(1, ball.leave - ball.enter)));
      if (wound <= 0) return;
      const shown = Math.ceil(ball.fibres.length * wound);
      // Shelf under the ball, then its shadow on the wall, then the fibres core first.
      paint.globalAlpha = 0.9;
      paint.fillStyle = colours.shelf;
      const shelfY = ball.y + ball.r * 1.04;
      paint.fillRect(ball.x - ball.r * 1.1, shelfY, ball.r * 2.2, options.narrow ? 2 : 3);
      paint.fillRect(ball.x - ball.r * 0.8, shelfY, 2, ball.r * 0.28);
      paint.fillRect(ball.x + ball.r * 0.8 - 2, shelfY, 2, ball.r * 0.28);
      paint.globalAlpha = 0.14 * wound;
      paint.fillStyle = colours.shadow;
      paint.beginPath();
      paint.ellipse(
        ball.x + ball.r * 0.1,
        ball.y + ball.r * 0.14,
        ball.r * 0.98,
        ball.r * 0.9,
        0,
        0,
        Math.PI * 2,
      );
      paint.fill();
      paint.lineWidth = options.fibreWidth * 1.1;
      for (let index = 0; index < shown; index += 1) {
        const fibre = ball.fibres[index];
        paint.globalAlpha = fibre.alpha;
        paint.strokeStyle = colours.strands[fibre.strand];
        paint.beginPath();
        paint.ellipse(
          fibre.cx,
          fibre.cy,
          fibre.rx,
          fibre.ry,
          fibre.rotation,
          fibre.start,
          fibre.start + fibre.span,
        );
        paint.stroke();
      }
    };

    const drawNail = (nail) => {
      const size = built.options.nail;
      paint.globalAlpha = 0.3;
      paint.fillStyle = colours.shadow;
      paint.beginPath();
      paint.arc(nail.x + size * 0.4, nail.y + size * 0.6, size, 0, Math.PI * 2);
      paint.fill();
      paint.globalAlpha = 1;
      paint.fillStyle = colours.nail;
      paint.beginPath();
      paint.arc(nail.x, nail.y, size, 0, Math.PI * 2);
      paint.fill();
      paint.globalAlpha = 0.7;
      paint.fillStyle = colours.shine;
      paint.beginPath();
      paint.arc(nail.x - size * 0.3, nail.y - size * 0.3, size * 0.35, 0, Math.PI * 2);
      paint.fill();
    };

    return {
      at(_t, progress) {
        const { samples, chunks, stations, balls, nails, chrome, options } = built;
        const ratio = surface.ratio;
        const origin = surface.toCanvas({ x: 0, y: 0, width: 0, height: 0 });
        const head = headAt(progress);

        for (const station of stations) {
          const now = head >= station.sample;
          if (reached.get(station.host) !== now) {
            reached.set(station.host, now);
            ctx.state.set('reached', now, station.host);
          }
        }
        // The same picture as the last frame (a clock seek, a redraw right after a rebuild): the canvas
        // still holds it unless the engine resized it, so nothing is stroked again.
        const key = [
          built,
          colours,
          head,
          origin.x,
          origin.y,
          surface.element.width,
          surface.element.height,
        ];
        if (drawn !== undefined && key.every((value, index) => value === drawn[index])) return;
        drawn = key;
        paint.setTransform(1, 0, 0, 1, 0, 0);
        paint.globalAlpha = 1;
        paint.clearRect(0, 0, surface.element.width, surface.element.height);
        if (samples.count < 2) return;

        paint.setTransform(ratio, 0, 0, ratio, origin.x * ratio, origin.y * ratio);
        paint.save();
        // Fixed and sticky chrome (the top bar, the contents) lies above the thread: cut it out.
        paint.beginPath();
        paint.rect(-origin.x, -origin.y, window.innerWidth, window.innerHeight);
        for (const element of chrome) {
          const box = element.getBoundingClientRect();
          if (box.width > 0 && box.height > 0)
            paint.rect(box.left - origin.x, box.top - origin.y, box.width, box.height);
        }
        paint.clip('evenodd');
        paint.lineCap = 'round';
        paint.lineJoin = 'round';

        const top = -origin.y - 40;
        const bottom = -origin.y + window.innerHeight + 40;
        const visible = chunks.filter(
          (part) => part.start <= head && part.bottom >= top && part.top <= bottom,
        );
        for (const part of visible)
          if (!part.filled) {
            built.braid.fill(Math.max(0, part.start - 1), part.end);
            part.filled = true;
          }

        // Shadow of the thread on the wall.
        paint.globalAlpha = 0.16;
        paint.strokeStyle = colours.shadow;
        paint.lineWidth = options.spread * 2 + 1.5;
        paint.beginPath();
        for (const part of visible) {
          const end = Math.min(part.end, head + 1);
          paint.moveTo(samples.x[part.start] + 1.5, samples.y[part.start] + 2.5);
          for (let index = part.start + 1; index < end; index += 1)
            paint.lineTo(samples.x[index] + 1.5, samples.y[index] + 2.5);
        }
        paint.stroke();

        strokeFibres(visible, head, false);
        strokeFibres(visible, head, true);

        for (const ball of balls)
          if (ball.y + ball.r * 1.4 >= top && ball.y - ball.r <= bottom) drawBall(ball, head);
        for (const nail of nails)
          if (nail.sample <= head && nail.y >= top && nail.y <= bottom) drawNail(nail);
        paint.restore();
        paint.globalAlpha = 1;
      },
      rebuild: build,
      unmount() {
        observer.disconnect();
      },
    };
  },
});
