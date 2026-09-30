/**
 * Движение схем и графиков по часам страницы:
 *
 * - прорисовка схемы `draw="scroll"` без временной шкалы прокрутки (Firefox, Safari) и под записью:
 *   связи рисуются по прогрессу, который сценарий считает по положению схемы на экране или берёт у
 *   атрибута `data-clock-progress` фигуры (0 — ничего не нарисовано, 1 — всё); маркер едет по связи,
 *   которая рисуется сейчас;
 * - импульсы по маршруту `pulse`: точка проходит маршрут три раза, когда схема показалась;
 * - пролёт внутрь узла: камера — `viewBox` закреплённой картинки — летит к узлу по прогрессу
 *   прохождения сцены, подписи вложенного потока проявляются, когда становятся крупнее читаемого;
 * - `chart{count-up}`: столбцы, линии и доли растут от нуля до значений, проценты долей досчитывают.
 *
 * Время — только часы страницы (`pageClock`): перемотка `__clock.seek(t)` ставит всё это в положение
 * момента `t`. При уменьшенном движении и на странице `motion: none` сценарий ничего не трогает: разметка уже в конечном
 * состоянии, пролёт показан двумя фигурами рядом.
 */

import { type CameraBox as Box, cameraAt } from './camera.js';
import { pageClock, progressOverride } from './clock.js';
import { stillMotionQuery } from './motion-level.js';

const clock = pageClock();
// Страница стоит и при `motion: none`, а не только по просьбе читателя.
const reducedMotion = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pace(): number {
  return Number(getComputedStyle(document.documentElement).getPropertyValue('--motion-pace')) || 1;
}

/** Доля пути фигуры через окно, как у `view-timeline` с диапазоном `cover`. */
function coverProgress(element: Element): number {
  const rect = element.getBoundingClientRect();
  const span = innerHeight + rect.height;
  return span <= 0 ? 0 : clamp((innerHeight - rect.top) / span);
}

function pointOn(path: SVGGeometryElement, share: number): DOMPoint | undefined {
  try {
    const length = path.getTotalLength();
    return path.getPointAtLength(clamp(share) * length);
  } catch {
    // Путь в скрытом виде раскладки не имеет геометрии.
    return undefined;
  }
}

/* Прорисовка схемы ------------------------------------------------------------------------------ */

const timelineSupported = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');

/**
 * Прогресс прорисовки: выставленный записью или по положению на экране — в том же диапазоне
 * `cover 12%…50%`, что у таблицы стилей.
 */
function drawProgress(figure: Element): number {
  const written = progressOverride(figure);
  if (written !== undefined) return written;
  return clamp((coverProgress(figure) - 0.12) / 0.38);
}

function paintDrawing(figure: HTMLElement): void {
  const progress = drawProgress(figure);
  const driven = !timelineSupported || progressOverride(figure) !== undefined;
  figure.toggleAttribute('data-draw-driven', driven);
  for (const svg of figure.querySelectorAll<SVGSVGElement>('svg')) {
    const parts = [...svg.querySelectorAll<SVGElement>('[data-draw-from]')];
    if (parts.length === 0) continue;
    // Маркер едет по связи, начатой позже всех: в конце он стоит в конце последней связи.
    let riding: { path: SVGGeometryElement; share: number; from: number } | undefined;
    for (const part of parts) {
      const from = Number(part.dataset.drawFrom);
      const to = Number(part.dataset.drawTo);
      const share = clamp((progress - from) / Math.max(0.0001, to - from));
      if (driven) {
        if (part.hasAttribute('pathLength')) {
          part.style.strokeDasharray = '1';
          part.style.strokeDashoffset = String(1 - share);
        } else {
          part.style.opacity = String(share);
        }
      } else {
        part.style.removeProperty('stroke-dasharray');
        part.style.removeProperty('stroke-dashoffset');
        part.style.removeProperty('opacity');
      }
      if (part instanceof SVGPathElement && part.dataset.from !== undefined) {
        if (progress >= from && (riding === undefined || from >= riding.from)) {
          riding = { path: part, share, from };
        }
      }
    }
    const marker = svg.querySelector<SVGCircleElement>('[data-draw-marker]');
    if (marker === null || riding === undefined) continue;
    const point = pointOn(riding.path, riding.share);
    if (point === undefined) continue;
    marker.setAttribute('cx', point.x.toFixed(2));
    marker.setAttribute('cy', point.y.toFixed(2));
  }
}

/* Импульсы по маршруту ----------------------------------------------------------------------------- */

const PULSE_STEP_MS = 650;
const PULSE_PASSES = 3;

function installPulse(figure: HTMLElement): void {
  let start: number | undefined;
  const render = (now: number): boolean => {
    if (start === undefined) return false;
    let running = false;
    for (const svg of figure.querySelectorAll<SVGSVGElement>('svg')) {
      const route = [...svg.querySelectorAll<SVGGeometryElement>('[data-pulse-step]')].sort(
        (left, right) =>
          Number((left as SVGElement).dataset.pulseStep) -
          Number((right as SVGElement).dataset.pulseStep),
      );
      const dot = svg.querySelector<SVGCircleElement>('[data-pulse-dot]');
      if (route.length === 0 || dot === null) continue;
      const step = PULSE_STEP_MS * pace();
      const elapsed = Math.max(0, now - start);
      const total = route.length * step * PULSE_PASSES;
      if (elapsed >= total) continue;
      running = true;
      const within = elapsed % (route.length * step);
      const index = Math.min(route.length - 1, Math.floor(within / step));
      const path = route[index];
      const point = path === undefined ? undefined : pointOn(path, (within - index * step) / step);
      if (point === undefined) continue;
      dot.setAttribute('cx', point.x.toFixed(2));
      dot.setAttribute('cy', point.y.toFixed(2));
    }
    figure.toggleAttribute('data-pulse-live', running);
    return running;
  };
  let frame = 0;
  const step = (now: number): void => {
    frame = render(now) ? clock.frame(step) : 0;
  };
  clock.register({ at: (seconds) => render(seconds * 1000) });
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || reducedMotion.matches) return;
      observer.disconnect();
      start = clock.now();
      if (frame === 0) frame = clock.frame(step);
    },
    { threshold: 0.4 },
  );
  observer.observe(figure);
}

/* Пролёт внутрь узла ------------------------------------------------------------------------------- */

/** Кегль, мельче которого подпись не читается, и кегль, с которого она видна целиком, в пикселях. */
const UNREADABLE_PX = 7;
const READABLE_PX = 11;
/** Кегль подписи узла в единицах схемы. */
const NODE_LABEL_UNITS = 14;
/** Самый мелкий кегль внешнего рисунка — подпись связи — в единицах схемы. */
const EDGE_LABEL_UNITS = 13;

function readBox(value: string | undefined): Box | undefined {
  const numbers = (value ?? '').split(/\s+/u).map(Number);
  return numbers.length === 4 && numbers.every(Number.isFinite)
    ? (numbers as unknown as Box)
    : undefined;
}

/** Прогресс пролёта: выставленный записью или доля пути сцены, пока картинка закреплена. */
function zoomProgress(figure: HTMLElement): number {
  const written = progressOverride(figure);
  if (written !== undefined) return written;
  const track = figure.querySelector<HTMLElement>('.visualization-zoom');
  const stage = track?.querySelector<HTMLElement>('.visualization-zoom-stage');
  if (track === null || track === undefined || stage === null || stage === undefined) return 0;
  const rect = track.getBoundingClientRect();
  const pinned = Number.parseFloat(getComputedStyle(stage).top) || 0;
  const room = rect.height - stage.offsetHeight;
  return room <= 0 ? 0 : clamp((pinned - rect.top) / room);
}

function paintZoom(figure: HTMLElement): void {
  const camera = figure.querySelector<SVGSVGElement>('.visualization-zoom-camera');
  if (camera === null) return;
  const from = readBox(camera.dataset.zoomFrom);
  const to = readBox(camera.dataset.zoomTo);
  const scale = Number(camera.dataset.zoomScale) || 0;
  if (from === undefined || to === undefined) return;
  const share = zoomProgress(figure);
  const frame = cameraAt(from, to, share);
  camera.setAttribute('viewBox', frame.map((value) => value.toFixed(2)).join(' '));
  const pixels = camera.clientWidth / frame[2];
  const size = NODE_LABEL_UNITS * scale * pixels;
  const text = clamp((size - UNREADABLE_PX) / (READABLE_PX - UNREADABLE_PX));
  // Вложенный поток проступает от кегля в начале пролёта, а не от абсолютного: крупная камера показывает
  // его крупнее уже в начале, и подпись узла гасла бы до того, как камера тронулась.
  const floor = Math.max(
    UNREADABLE_PX / 2,
    NODE_LABEL_UNITS * scale * (camera.clientWidth / from[2]),
  );
  const shape = clamp((size - floor) / (UNREADABLE_PX / 2));
  camera.style.setProperty('--zoom-inner-text', text.toFixed(3));
  camera.style.setProperty('--zoom-inner-shape', shape.toFixed(3));
  figure.dataset.zoomProgress = share.toFixed(3);
}

/**
 * Становятся ли подписи вложенного потока читаемыми к концу пролёта в кадре такой ширины. Нет —
 * пролёт на этой дорожке ничего не покажет, и фигура остаётся двумя неподвижными рисунками друг под
 * другом, каждый не мельче читаемого и открываемый во весь экран.
 */
function zoomReadable(figure: HTMLElement): boolean {
  const camera = figure.querySelector<SVGSVGElement>('.visualization-zoom-camera');
  const from = readBox(camera?.dataset.zoomFrom);
  const to = readBox(camera?.dataset.zoomTo);
  const scale = Number(camera?.dataset.zoomScale) || 0;
  if (camera === null || from === undefined || to === undefined) return false;
  figure.setAttribute('data-zoom-live', '');
  const width = camera.clientWidth;
  // И внешний рисунок в начале пролёта: на узкой дорожке камера сжимает его подписи связей мельче
  // читаемого раньше, чем полетит внутрь.
  return (
    NODE_LABEL_UNITS * scale * (width / to[2]) >= READABLE_PX &&
    EDGE_LABEL_UNITS * (width / from[2]) >= READABLE_PX
  );
}

/** Ставит пролёт там, где он дойдёт до читаемых подписей, и снимает там, где не дойдёт. */
function placeZoom(figure: HTMLElement): void {
  const readable = zoomReadable(figure);
  figure.toggleAttribute('data-zoom-live', readable);
  figure.toggleAttribute('data-zoom-unreadable', !readable);
}

/* Рост графика от нуля ---------------------------------------------------------------------------- */

const COUNT_UP_MS = 900;

interface Mark {
  readonly apply: (share: number) => void;
}

function numberForm(written: string): ((value: number) => string) | undefined {
  const match = /(\d+)(?:([.,])(\d+))?/u.exec(written);
  if (match === null) return undefined;
  const decimals = match[3]?.length ?? 0;
  const mark = match[2] ?? '.';
  const final = Number(`${match[1]}.${match[3] ?? '0'}`);
  return (share) => written.replace(match[0], (final * share).toFixed(decimals).replace('.', mark));
}

function chartMarks(figure: HTMLElement): Mark[] {
  const marks: Mark[] = [];
  for (const svg of figure.querySelectorAll<SVGSVGElement>('svg')) {
    const axis = svg.querySelector<SVGLineElement>('.visualization-axis');
    const zero = Number(axis?.getAttribute('y1') ?? Number.NaN);
    for (const bar of svg.querySelectorAll<SVGRectElement>('.visualization-bar')) {
      const y = Number(bar.getAttribute('y'));
      const height = Number(bar.getAttribute('height'));
      if (!Number.isFinite(zero)) continue;
      marks.push({
        apply: (share) => {
          const top = zero + (y - zero) * share;
          const bottom = zero + (y + height - zero) * share;
          bar.setAttribute('y', Math.min(top, bottom).toFixed(2));
          bar.setAttribute('height', Math.abs(bottom - top).toFixed(2));
        },
      });
    }
    for (const point of svg.querySelectorAll<SVGCircleElement>('.visualization-point')) {
      const cy = Number(point.getAttribute('cy'));
      if (!Number.isFinite(zero)) continue;
      marks.push({
        apply: (share) => point.setAttribute('cy', (zero + (cy - zero) * share).toFixed(2)),
      });
    }
    for (const line of svg.querySelectorAll<SVGPolylineElement>('.visualization-line')) {
      const points = (line.getAttribute('points') ?? '')
        .split(' ')
        .map((pair) => pair.split(',').map(Number) as [number, number]);
      if (!Number.isFinite(zero)) continue;
      marks.push({
        apply: (share) =>
          line.setAttribute(
            'points',
            points.map(([x, y]) => `${x},${(zero + (y - zero) * share).toFixed(2)}`).join(' '),
          ),
      });
    }
    const centre = (svg.dataset.pieCentre ?? '').split(' ').map(Number);
    for (const slice of svg.querySelectorAll<SVGPathElement>('.visualization-slice')) {
      const [cx, cy] = centre;
      if (cx === undefined || cy === undefined || !Number.isFinite(cx)) continue;
      marks.push({
        apply: (share) =>
          share >= 1
            ? slice.removeAttribute('transform')
            : slice.setAttribute(
                'transform',
                `translate(${cx} ${cy}) scale(${share.toFixed(4)}) translate(${-cx} ${-cy})`,
              ),
      });
    }
    for (const label of svg.querySelectorAll<SVGTextElement>('.visualization-pie-label')) {
      const written = label.textContent ?? '';
      const form = numberForm(written);
      if (form === undefined) continue;
      marks.push({
        apply: (share) => {
          label.textContent = share >= 1 ? written : form(share);
        },
      });
    }
  }
  return marks;
}

function installCountUp(figure: HTMLElement): void {
  const marks = chartMarks(figure);
  let start: number | undefined;
  const render = (now: number): boolean => {
    const share = start === undefined ? 0 : clamp((now - start) / (COUNT_UP_MS * pace()));
    const eased = 1 - (1 - share) ** 3;
    for (const mark of marks) mark.apply(share >= 1 ? 1 : eased);
    return share < 1;
  };
  render(clock.now());
  figure.setAttribute('data-count-up-live', '');
  let frame = 0;
  const step = (now: number): void => {
    frame = render(now) ? clock.frame(step) : 0;
  };
  clock.register({ at: (seconds) => render(seconds * 1000) });
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      start = clock.now();
      if (frame === 0) frame = clock.frame(step);
    },
    { threshold: 0.5 },
  );
  observer.observe(figure);
}

/* Установка --------------------------------------------------------------------------------------- */

function installDiagramMotion(): void {
  if (reducedMotion.matches || typeof IntersectionObserver !== 'function') return;
  const drawn = [...document.querySelectorAll<HTMLElement>('figure[data-draw="scroll"]')];
  const zooms = [...document.querySelectorAll<HTMLElement>('figure[data-zoom]')];
  for (const figure of zooms) placeZoom(figure);
  for (const figure of document.querySelectorAll<HTMLElement>('figure[data-pulse]'))
    installPulse(figure);
  for (const figure of document.querySelectorAll<HTMLElement>('figure[data-count-up]'))
    installCountUp(figure);
  if (drawn.length === 0 && zooms.length === 0) return;
  let frame = 0;
  const visibleOrOverridden = (figure: HTMLElement): boolean => {
    if (progressOverride(figure) !== undefined) return true;
    const box = figure.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  };
  const paint = (visibleOnly: boolean): void => {
    frame = 0;
    for (const figure of drawn)
      if (!visibleOnly || visibleOrOverridden(figure)) paintDrawing(figure);
    for (const figure of zooms)
      if (figure.hasAttribute('data-zoom-live') && (!visibleOnly || visibleOrOverridden(figure)))
        paintZoom(figure);
  };
  const schedule = (): void => {
    // The initial pass and a clock seek still set every figure. Real scrolling updates only what can
    // be seen; offscreen SVG path measurements and writes cannot affect the current frame.
    if (frame === 0) frame = clock.frame(() => paint(true));
  };
  paint(false);
  // Перемотка часов ставит прорисовку и камеру сразу: по положению на экране или по прогрессу записи.
  clock.register({ at: () => paint(false) });
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => {
    for (const figure of zooms) placeZoom(figure);
    schedule();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installDiagramMotion, { once: true });
} else {
  installDiagramMotion();
}
