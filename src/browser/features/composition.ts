/*! agentic-report script: composition */
import {
  compositionFrame,
  compositionTime,
  compositionReference,
  type CompositionContent,
  type CompositionCue,
} from '../../composition.js';
import { connectionRoute, overlaps, type SceneRect } from '../../composition-route.js';
import { pageClock } from '../clock.js';
import { hydrateSharedImages } from '../shared-media.js';
import { provideFeature, type Cleanup } from '../features.js';
import { timed, whenVisible } from '../technique-timing.js';

export interface ReportCompositionControl {
  bind(resolve: (anchor: string) => number, id?: string): void;
  anchors(): string[];
}
declare global {
  interface Window {
    __reportComposition?: ReportCompositionControl;
  }
}
const clock = pageClock();
const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}
function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Incomplete compiled composition.');
  return value;
}
function cuesOf(scope: HTMLElement): CompositionCue[] {
  return [...scope.querySelectorAll<HTMLElement>(':scope > [data-semantic="cue"]')].map((n) => ({
    at: required(n.dataset.at),
    action: n.dataset.action as CompositionCue['action'],
    target: required(n.dataset.target),
    duration: Number(n.dataset.duration ?? 0.6),
    ...(n.dataset.to === undefined ? {} : { to: n.dataset.to }),
    ...(n.dataset.value === undefined ? {} : { value: n.dataset.value }),
    ...(n.dataset.lines === undefined ? {} : { lines: n.dataset.lines }),
  }));
}
function scopedClone(fragment: DocumentFragment, prefix?: string): DocumentFragment {
  const clone = fragment.cloneNode(true) as DocumentFragment;
  hydrateSharedImages(clone);
  if (prefix === undefined) return clone;
  const ids = new Map([...clone.querySelectorAll('[id]')].map((n) => [n.id, `${prefix}-${n.id}`]));
  for (const node of clone.querySelectorAll('*')) {
    node.removeAttribute('data-review-target');
    for (const attribute of [...node.attributes]) {
      const value =
        attribute.name === 'id'
          ? (ids.get(attribute.value) ?? attribute.value)
          : ['aria-labelledby', 'aria-describedby', 'aria-controls'].includes(attribute.name)
            ? attribute.value
                .split(/\s+/u)
                .map((id) => ids.get(id) ?? id)
                .join(' ')
            : compositionReference(attribute.value, ids);
      node.setAttribute(attribute.name, value);
    }
  }
  return clone;
}
function installComposition(page: HTMLElement, still: MediaQueryList): Cleanup {
  const printing = window.matchMedia('print');
  const scenes = [
    ...page.querySelectorAll<HTMLElement>('[data-semantic="composition"][data-composition]'),
  ];
  const controllers = scenes.map((scene) => {
    const stage = required(scene.querySelector<HTMLElement>('[data-composition-stage]'));
    const objects = new Map(
      [...stage.querySelectorAll<HTMLElement>(':scope > [data-composition-object]')].map((n) => [
        required(n.dataset.compositionObject),
        n,
      ]),
    );
    const originals = new Map(
      [...objects].map(([id, node]) => [
        id,
        required(node.querySelector<HTMLTemplateElement>('template[data-composition-original]'))
          .content,
      ]),
    );
    const cues = cuesOf(scene);
    const keys = new Map<string, string>();
    const overlay = svg('svg', { class: 'composition-connections', 'aria-hidden': 'true' });
    stage.append(overlay);
    let resolve = (anchor: string) => compositionTime(anchor);
    let origin = 0;
    const content = (value: CompositionContent, owner: string): DocumentFragment => {
      if ('source' in value)
        return scopedClone(
          required(originals.get(value.source)),
          owner === value.source
            ? undefined
            : `composition-${scene.dataset.compositionId}-${owner}`,
        );
      const fragment = document.createDocumentFragment();
      if ('text' in value) {
        const p = document.createElement('p');
        p.textContent = value.text;
        fragment.append(p);
      }
      return fragment;
    };
    const rect = (id: string) => {
      const box = required(objects.get(id)).getBoundingClientRect(),
        parent = stage.getBoundingClientRect();
      // SVG and absolute travel positions use stage CSS pixels. Ancestor fitting
      // transforms change viewport rectangles, so convert both axes back once.
      const sx = parent.width / Math.max(1, stage.offsetWidth);
      const sy = parent.height / Math.max(1, stage.offsetHeight);
      return {
        x: (box.left - parent.left) / sx,
        y: (box.top - parent.top) / sy,
        w: box.width / sx,
        h: box.height / sy,
      };
    };
    const render = (time: number): void => {
      const staticFrame = still.matches || printing.matches;
      stage.style.transform = '';
      stage.style.paddingBottom = '';
      stage.style.columnGap = '';
      const frame = compositionFrame(
        [...objects.keys()],
        cues,
        staticFrame ? Number.POSITIVE_INFINITY : time,
        resolve,
      );
      const hasFocus = [...frame.objects.values()].some((o) => o.focus);
      for (const [id, state] of frame.objects) {
        const node = required(objects.get(id));
        const key = JSON.stringify(state.content);
        if (keys.get(id) !== key) {
          required(node.querySelector('[data-composition-content]')).replaceChildren(
            content(state.content, id),
          );
          keys.set(id, key);
        }
        node.style.opacity = String(
          state.visible
            ? (!staticFrame && hasFocus && !state.focus ? 0.55 : 1) * state.entrance
            : 0,
        );
        node.style.transform = staticFrame ? '' : `translateY(${(1 - state.entrance) * 16}px)`;
        node.toggleAttribute('data-composition-focus', state.focus);
        node.toggleAttribute('data-composition-hidden', !state.visible);
        node.toggleAttribute('data-composition-empty', 'empty' in state.content);
        const lines = new Set<number>();
        for (const part of (state.lines ?? '').split(',')) {
          if (part.trim() === '') continue;
          const [from, to] = part.split('-').map(Number);
          if (from !== undefined) for (let i = from; i <= (to ?? from); i++) lines.add(i);
        }
        for (const [i, line] of [...node.querySelectorAll<HTMLElement>('pre .line')].entries()) {
          line.toggleAttribute('data-composition-line', lines.has(i + 1));
          line.style.opacity = lines.size > 0 && !lines.has(i + 1) ? '0.35' : '';
        }
      }
      overlay.replaceChildren();
      overlay.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
      const columns = getComputedStyle(stage).gridTemplateColumns.split(' ').length;
      if (columns > 1 && frame.connections.some((edge) => edge.label)) {
        const probe = svg('text', {});
        overlay.append(probe);
        let gap = Number.parseFloat(getComputedStyle(stage).columnGap);
        for (const edge of frame.connections) {
          probe.textContent = edge.label ?? '';
          gap = Math.max(
            gap,
            Math.min(probe.getComputedTextLength() + 16, stage.clientWidth / (columns * 2)),
          );
        }
        probe.remove();
        stage.style.columnGap = `${gap}px`;
      }
      const visibleRects = [...objects.keys()]
        .filter((id) => frame.objects.get(id)?.visible)
        .map(rect);
      const labels: SceneRect[] = [];
      for (const edge of frame.connections) {
        const a = rect(edge.from),
          b = rect(edge.to);
        const blockers = [...objects.keys()]
          .filter((id) => id !== edge.from && id !== edge.to && frame.objects.get(id)?.visible)
          .map(rect);
        const d = connectionRoute(a, b, blockers);
        if (!d) continue;
        const path = svg('path', {
          d,
          pathLength: '1',
          'stroke-dasharray': '1',
          'stroke-dashoffset': String(1 - edge.progress),
        });
        overlay.append(path);
        const length = path.getTotalLength();
        const tip = path.getPointAtLength(length * edge.progress);
        const before = path.getPointAtLength(Math.max(0, length * edge.progress - 2));
        const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
        const backX = tip.x - Math.cos(angle) * 9,
          backY = tip.y - Math.sin(angle) * 9;
        overlay.append(
          svg('polygon', {
            points: `${tip.x},${tip.y} ${backX - Math.sin(angle) * 4},${backY + Math.cos(angle) * 4} ${backX + Math.sin(angle) * 4},${backY - Math.cos(angle) * 4}`,
            opacity: String(Math.min(1, edge.progress * 8)),
          }),
        );
        if (edge.label) {
          const text = svg('text', { 'text-anchor': 'middle' });
          text.textContent = edge.label;
          overlay.append(text);
          let placed = false;
          const horizontalGap = Math.max(b.x - a.x - a.w, a.x - b.x - b.w);
          const widths = [Number.POSITIVE_INFINITY];
          if (horizontalGap > 12) widths.push(horizontalGap - 12);
          for (const width of widths) {
            const lines: string[] = [];
            let line = '';
            for (const word of edge.label.split(/\s+/u)) {
              const candidate = line ? `${line} ${word}` : word;
              text.textContent = candidate;
              if (line && text.getComputedTextLength() > width) {
                lines.push(line);
                line = word;
              } else line = candidate;
            }
            lines.push(line);
            text.replaceChildren(
              ...lines.map((value, i) => {
                const span = svg('tspan', { x: '0', dy: i === 0 ? '0' : '1.2em' });
                span.textContent = value;
                return span;
              }),
            );
            const metrics = text.getBBox();
            for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
              const p = path.getPointAtLength(length * fraction);
              for (const [x, y] of [
                [p.x - metrics.width / 2, p.y - metrics.height - 10],
                [p.x - metrics.width / 2, p.y + 10],
                [p.x + 10, p.y - metrics.height / 2],
                [p.x - metrics.width - 10, p.y - metrics.height / 2],
              ] as const) {
                const bounds = { x: x - 3, y: y - 3, w: metrics.width + 6, h: metrics.height + 6 };
                if (
                  bounds.x < 0 ||
                  bounds.y < 0 ||
                  bounds.x + bounds.w > stage.clientWidth ||
                  bounds.y + bounds.h > stage.clientHeight ||
                  [...visibleRects, ...labels].some((r) => overlaps(bounds, r))
                )
                  continue;
                text.setAttribute('transform', `translate(${x - metrics.x},${y - metrics.y})`);
                labels.push(bounds);
                placed = true;
                break;
              }
              if (placed) break;
            }
            if (placed) break;
          }
          if (!placed) {
            // Reserve real stage space instead of letting successive labels climb
            // into the title. A routed leader keeps the label attached to its edge.
            const metrics = text.getBBox();
            const y =
              Math.max(...visibleRects.map((r) => r.y + r.h), ...labels.map((r) => r.y + r.h)) + 12;
            const x = (stage.clientWidth - metrics.width) / 2;
            const bounds = { x, y, w: metrics.width, h: metrics.height };
            const extra = y + metrics.height + 8 - stage.clientHeight;
            stage.style.paddingBottom = `${Number.parseFloat(getComputedStyle(stage).paddingBottom) + Math.max(0, extra)}px`;
            text.setAttribute('transform', `translate(${x - metrics.x},${y - metrics.y})`);
            const midpoint = path.getPointAtLength(length / 2);
            let leader = connectionRoute(
              bounds,
              { x: midpoint.x, y: midpoint.y, w: 0, h: 0 },
              visibleRects,
            );
            if (!leader) {
              // Two simple routes meet in a free gutter when a full-width code
              // row needs more bends than the main connector router.
              for (const obstacle of visibleRects) {
                for (const y of [obstacle.y - 12, obstacle.y + obstacle.h + 12]) {
                  const via = { x: midpoint.x, y, w: 0, h: 0 };
                  const first = connectionRoute(bounds, via, visibleRects);
                  const second = connectionRoute(
                    via,
                    { x: midpoint.x, y: midpoint.y, w: 0, h: 0 },
                    visibleRects,
                  );
                  if (first && second) {
                    leader = `${first} ${second}`;
                    break;
                  }
                }
                if (leader) break;
              }
            }
            if (leader)
              overlay.insertBefore(
                svg('path', { d: leader, 'stroke-dasharray': '3 4', opacity: '0.45' }),
                text,
              );
            labels.push(bounds);
          }
        }
      }
      overlay.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
      for (const previous of stage.querySelectorAll(':scope > .composition-travel'))
        previous.remove();
      for (const travel of frame.travels) {
        const a = rect(travel.from),
          b = rect(travel.to);
        const node = document.createElement('div');
        node.className = 'composition-travel';
        node.setAttribute('aria-hidden', 'true');
        node.append(content(travel.content, `travel-${travel.from}-${travel.to}`));
        const q = travel.progress;
        const blockers = [...objects.keys()]
          .filter((id) => id !== travel.from && id !== travel.to && frame.objects.get(id)?.visible)
          .map(rect);
        const route = connectionRoute(a, b, blockers);
        const trajectory = svg('path', {
          d: route
            ? route.replace(/^M/, `M${a.x + a.w / 2},${a.y + a.h / 2} L`) +
              ` L${b.x + b.w / 2},${b.y + b.h / 2}`
            : `M${a.x + a.w / 2},${a.y + a.h / 2} L${b.x + b.w / 2},${b.y + b.h / 2}`,
        });
        node.style.width = `${Math.min(280, a.w, b.w)}px`;
        node.style.opacity = String(Math.sin(Math.PI * q));
        stage.append(node);
        const position = trajectory.getPointAtLength(trajectory.getTotalLength() * q);
        node.style.left = `${position.x - node.offsetWidth / 2}px`;
        node.style.top = `${position.y - node.offsetHeight / 2}px`;
      }
      if (!staticFrame && frame.camera !== undefined) {
        const b = rect(frame.camera.target),
          p = frame.camera.progress;
        const bounds = stage.getBoundingClientRect();
        const ratio = bounds.width / Math.max(1, stage.clientWidth);
        const scale =
          1 +
          Math.max(
            0,
            Math.min(
              0.08,
              (innerWidth - 32) / bounds.width - 1,
              (innerHeight - 32) / bounds.height - 1,
            ),
          ) *
            p;
        const desiredX =
          Math.max(
            -stage.clientWidth * 0.04,
            Math.min(stage.clientWidth * 0.04, stage.clientWidth / 2 - b.x - b.w / 2),
          ) * p;
        const desiredY =
          Math.max(
            -stage.clientHeight * 0.04,
            Math.min(stage.clientHeight * 0.04, stage.clientHeight / 2 - b.y - b.h / 2),
          ) * p;
        const extraX = (bounds.width * (scale - 1)) / 2,
          extraY = (bounds.height * (scale - 1)) / 2;
        const dx = Math.max(
          (16 - bounds.left + extraX) / ratio,
          Math.min((innerWidth - 16 - bounds.right - extraX) / ratio, desiredX),
        );
        const dy = Math.max(
          (16 - bounds.top + extraY) / ratio,
          Math.min((innerHeight - 16 - bounds.bottom - extraY) / ratio, desiredY),
        );
        stage.style.transform = `translate(${dx}px,${dy}px) scale(${scale})`;
      }
    };
    const total = () => Math.max(0, ...cues.map((c) => resolve(c.at) + c.duration));
    const runner = timed((now) => {
      const t = (now - origin) / 1000;
      render(t);
      return !still.matches && t < total();
    });
    const visible = whenVisible(scene, () => {
      origin = clock.mode === 'real' ? clock.now() : 0;
      runner.start();
    });
    const resize = () => render((clock.now() - origin) / 1000);
    window.addEventListener('resize', resize);
    const reduced = () => runner.start();
    still.addEventListener('change', reduced);
    printing.addEventListener('change', reduced);
    render(clock.mode === 'real' ? Number.POSITIVE_INFINITY : 0);
    return {
      id: required(scene.dataset.compositionId),
      cues,
      bind(next: (anchor: string) => number) {
        resolve = next;
        origin = 0;
        runner.start();
      },
      destroy() {
        visible();
        runner.stop();
        window.removeEventListener('resize', resize);
        still.removeEventListener('change', reduced);
        printing.removeEventListener('change', reduced);
        overlay.remove();
        stage.style.paddingBottom = '';
        stage.style.columnGap = '';
        for (const n of objects.values()) {
          n.style.opacity = '';
          n.style.transform = '';
          n.removeAttribute('data-composition-hidden');
          n.removeAttribute('data-composition-focus');
        }
      },
    };
  });
  const control: ReportCompositionControl = {
    bind(resolve, id) {
      const selected = id === undefined ? controllers : controllers.filter((c) => c.id === id);
      if (selected.length === 0) throw new Error(`Unknown report composition: ${id}`);
      for (const controller of selected) controller.bind(resolve);
    },
    anchors: () => controllers.flatMap((c) => c.cues.map((cue) => cue.at)),
  };
  window.__reportComposition = control;
  return () => {
    for (const c of controllers) c.destroy();
    if (window.__reportComposition === control) delete window.__reportComposition;
  };
}
provideFeature('composition', installComposition);
