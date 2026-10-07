/*! agentic-report script: composition */
import {
  compositionFrame,
  compositionTime,
  compositionReference,
  type CompositionContent,
  type CompositionCue,
} from '../../composition.js';
import { pageClock } from '../clock.js';
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
      return { x: box.left - parent.left, y: box.top - parent.top, w: box.width, h: box.height };
    };
    const render = (time: number): void => {
      const staticFrame = still.matches || printing.matches;
      stage.style.transform = '';
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
      for (const edge of frame.connections) {
        const a = rect(edge.from),
          b = rect(edge.to);
        const horizontal = b.x >= a.x + a.w || a.x >= b.x + b.w;
        const forward = horizontal ? b.x >= a.x : b.y >= a.y;
        const x1 = horizontal ? a.x + (forward ? a.w : 0) : a.x + a.w / 2;
        const y1 = horizontal ? a.y + a.h / 2 : a.y + (forward ? a.h : 0);
        const x2 = horizontal ? b.x + (forward ? 0 : b.w) : b.x + b.w / 2;
        const y2 = horizontal ? b.y + b.h / 2 : b.y + (forward ? 0 : b.h);
        const blockers = [...objects.keys()]
          .filter((id) => id !== edge.from && id !== edge.to)
          .map(rect);
        const blocked = horizontal
          ? blockers.some(
              (r) =>
                r.x < Math.max(x1, x2) &&
                r.x + r.w > Math.min(x1, x2) &&
                r.y < Math.max(y1, y2) + 1 &&
                r.y + r.h > Math.min(y1, y2) - 1,
            )
          : blockers.some(
              (r) =>
                r.y < Math.max(y1, y2) &&
                r.y + r.h > Math.min(y1, y2) &&
                r.x < Math.max(x1, x2) + 1 &&
                r.x + r.w > Math.min(x1, x2) - 1,
            );
        const aisle = horizontal
          ? Math.min(a.y, b.y, ...blockers.map((r) => r.y)) - 20
          : Math.min(a.x, b.x, ...blockers.map((r) => r.x)) - 20;
        const sign = forward ? 1 : -1;
        const d = blocked
          ? horizontal
            ? `M${x1},${y1} L${x1 + sign * 12},${y1} L${x1 + sign * 12},${aisle} L${x2 - sign * 12},${aisle} L${x2 - sign * 12},${y2} L${x2},${y2}`
            : `M${x1},${y1} L${x1},${y1 + sign * 12} L${aisle},${y1 + sign * 12} L${aisle},${y2 - sign * 12} L${x2},${y2 - sign * 12} L${x2},${y2}`
          : horizontal
            ? `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
            : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
        const path = svg('path', {
          d,
          pathLength: '1',
          'stroke-dasharray': '1',
          'stroke-dashoffset': String(1 - edge.progress),
        });
        overlay.append(path);
        const point = path.getPointAtLength(path.getTotalLength() * edge.progress);
        const dot = svg('circle', { cx: String(point.x), cy: String(point.y), r: '4' });
        overlay.append(dot);
        if (edge.label) {
          const text = svg('text', {
            x: String((x1 + x2) / 2),
            y: String(blocked && horizontal ? aisle - 8 : (y1 + y2) / 2 - 10),
            'text-anchor': 'middle',
          });
          text.textContent = edge.label;
          overlay.append(text);
        }
      }
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
        node.style.left = `${a.x + (b.x - a.x) * q}px`;
        node.style.top = `${a.y + (b.y - a.y) * q - Math.sin(Math.PI * q) * 24}px`;
        node.style.width = `${a.w + (b.w - a.w) * q}px`;
        node.style.opacity = String(Math.sin(Math.PI * q));
        stage.append(node);
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
            Math.min(
              stage.clientWidth * 0.04,
              stage.clientWidth / 2 - b.x / ratio - b.w / ratio / 2,
            ),
          ) * p;
        const desiredY =
          Math.max(
            -stage.clientHeight * 0.04,
            Math.min(
              stage.clientHeight * 0.04,
              stage.clientHeight / 2 - b.y / ratio - b.h / ratio / 2,
            ),
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
