import { placeMark } from './place.mjs';

/** Длительность, за которую кольцо замыкается в живом режиме, секунд. */
const DRAW_SECONDS = 1.2;

/**
 * @param {{ ownTimer?: boolean, colour?: string, placement?: 'free' | 'on-heading', time?: 'at' | 'clock', slow?: boolean, diagnosticThrow?: boolean, doubleBadge?: boolean, mountOnce?: boolean, liveOnlyState?: boolean, printedLayer?: boolean }} defects
 */
export function createMark(defects) {
  let mounts = 0;
  return {
    mount(ctx) {
      mounts += 1;
      // Эффект помнит первые хосты и не переживает новую постановку после правки содержимого.
      if (defects.mountOnce && mounts > 1) throw new Error('The marks were placed once already.');
      const surface = ctx.canvas({ host: ctx.hosts[0], kind: '2d' });
      // Слой эффекта держит себя видимым и в печати: вместо текста хостов печатается декор.
      if (defects.printedLayer) {
        const layer = surface.element.closest('.effect-layer');
        if (layer instanceof HTMLElement) layer.style.display = 'block';
      }
      const paint = surface.context;
      const read = () => defects.colour ?? ctx.tokens.read('--color-accent');
      let accent = read();
      ctx.tokens.onChange(() => {
        accent = read();
      });
      let marks = [];
      let badges = [];
      const layout = () => {
        for (const badge of badges) badge.element.remove();
        marks = ctx.hosts.map((host, index) => placeMark(ctx, host, index, defects.placement));
        badges = [];
        for (const mark of marks) {
          if (mark === undefined) continue;
          const element = document.createElement('span');
          element.className = 'mark-badge';
          element.textContent = String(mark.index + 1);
          element.style.cssText =
            'position:absolute;display:grid;place-items:center;font:600 0.7rem/1 var(--font-mono);color:var(--color-accent)';
          surface.details.append(element);
          badges.push({ element, mark });
          if (defects.doubleBadge) {
            // Вторая метка на месте первой: детали эффекта наезжают друг на друга.
            const twin = element.cloneNode(true);
            surface.details.append(twin);
            badges.push({ element: twin, mark });
          }
        }
        for (const [index, host] of ctx.hosts.entries())
          ctx.state.set('placed', marks[index] !== undefined, host);
        // Состояние только в живом режиме: читатель без движения его не видит.
        if (defects.liveOnlyState && ctx.render === 'live')
          for (const host of ctx.hosts) ctx.state.set('glowing', true, host);
      };
      layout();
      for (const host of ctx.hosts) {
        ctx.state.set('mark', ctx.attribute(host, 'mark') ?? 'ring', host);
        ctx.events.on('reach', host, () => ctx.state.set('reached', true, host));
      }
      let spin = 0;
      if (defects.ownTimer) {
        const turn = () => {
          spin += 0.05;
          requestAnimationFrame(turn);
        };
        requestAnimationFrame(turn);
      }
      return {
        at(t) {
          if (defects.slow) {
            // Дорогой кадр: работа, которая при замедлении процессора вчетверо длится дольше 50 мс.
            let sum = 0;
            for (let index = 0; index < 20_000_000; index += 1) sum += Math.sqrt(index);
            paint.globalAlpha = sum > 0 ? 1 : 0;
          }
          const seconds = defects.time === 'clock' ? ctx.clock.now() : t;
          const sweep = Math.min(1, Math.max(0, seconds / DRAW_SECONDS));
          const ratio = surface.ratio;
          paint.setTransform(1, 0, 0, 1, 0, 0);
          paint.clearRect(0, 0, surface.element.width, surface.element.height);
          paint.setTransform(ratio, 0, 0, ratio, 0, 0);
          paint.strokeStyle = accent;
          paint.fillStyle = accent;
          paint.lineWidth = 3;
          for (const { element, mark } of badges) {
            const box = surface.toCanvas(mark.rect);
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const radius = box.width / 2 - 2;
            paint.beginPath();
            if (mark.kind === 'dot') {
              paint.globalAlpha = 0.35;
              paint.arc(cx, cy, radius * sweep, 0, Math.PI * 2);
              paint.fill();
              paint.globalAlpha = 1;
            } else {
              paint.arc(
                cx,
                cy,
                radius,
                -Math.PI / 2 + spin,
                -Math.PI / 2 + spin + Math.PI * 2 * sweep,
              );
              paint.stroke();
            }
            element.style.left = `${box.x}px`;
            element.style.top = `${box.y}px`;
            element.style.width = `${box.width}px`;
            element.style.height = `${box.height}px`;
          }
        },
        rebuild: defects.slow
          ? () => {
              const timings = Array.isArray(window.__agenticReportBuildTimings)
                ? window.__agenticReportBuildTimings
                : undefined;
              const started = timings === undefined ? 0 : performance.now();
              layout();
              if (timings !== undefined) {
                const durationMs = performance.now() - started;
                timings.push({
                  startMs: started,
                  durationMs,
                  width: document.documentElement.clientWidth,
                  measureMs: durationMs,
                  untrustedText: 'CANARY_AUTHOR_TEXT',
                });
                if (defects.diagnosticThrow && !Object.hasOwn(timings, 'slice'))
                  Object.defineProperty(timings, 'slice', {
                    get() {
                      throw new Error('CANARY_PRIVATE_ERROR');
                    },
                  });
              }
            }
          : layout,
        unmount() {
          for (const badge of badges) badge.element.remove();
        },
      };
    },
  };
}
