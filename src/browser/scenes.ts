/**
 * Части закреплённых сцен, общие для сцены по шагам и сцены со скрабом: строки кода такта, состояния
 * страницы тактов и сама сцена со скрабом (`scene="scrub"`).
 *
 * Сцена со скрабом держит сцену и подписи закреплёнными, пока идут её экраны — такт на экран, не больше
 * четырёх. Положение прокрутки ведёт мини-таймлайн (`timeline.ts`): подпись такта меняется на трети его
 * отрезка и стоит в ячейке постоянной высоты (все подписи лежат в одной ячейке, видна одна), картинка,
 * узлы схемы и строки кода принадлежат достигнутому такту, отрезки полосы заполняются, а последний такт
 * держит их все. Всё показано прозрачностью, а не удалением, поэтому прокрутка назад восстанавливает
 * картину. Текст тактов догоняет прокрутку за 0,6 с; прогресс, выставленный записью в
 * `data-clock-progress`, показывается точно. На телефоне сцена стоит над подписью — своя вертикальная
 * режиссура; без движения и в печати сцена и такты идут подряд, всё горит.
 */

import type { PackageStrings } from '../localization.js';
import { pageClock, progressOverride } from './clock.js';
import { type GeometryWatch, watchGeometry } from './geometry-rebuild.js';
import { setPageState } from './page-states.js';
import { createTimeline, parseLineRanges, scrubFrame, smoothToward } from './timeline.js';
import { contentElements } from './features.js';

/** Зажечь строки кода сцены, которые называет такт; без строк погасших нет. */
export function lightCodeLines(section: HTMLElement, beat: HTMLElement | undefined): void {
  const lines = parseLineRanges(beat?.dataset.lines);
  const code = [...section.querySelectorAll<HTMLElement>('[data-scene-stage] pre code .line')];
  section.toggleAttribute('data-code-focus', lines.size > 0 && code.length > 0);
  for (const [index, line] of code.entries())
    line.toggleAttribute('data-lit', lines.has(index + 1));
}

/** Поставить состояния страницы тактов: `reached(index)` — стоит ли состояние такта. */
export function setBeatStates(
  section: HTMLElement,
  beats: readonly HTMLElement[],
  reached: (index: number) => boolean,
): void {
  for (const [index, beat] of beats.entries()) {
    const name = beat.dataset.state;
    if (name !== undefined && name !== '')
      setPageState(name, reached(index), `beat-${section.id}-${index}`);
  }
}

function focusOf(beat: HTMLElement | undefined): string[] {
  return (beat?.dataset.focus ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function installScrubScenes(
  page: HTMLElement,
  still: MediaQueryList,
  strings: PackageStrings,
): () => void {
  const sections = contentElements<HTMLElement>(page, 'section[data-scene="scrub"]');
  if (sections.length === 0) return () => undefined;
  let cleanups: Array<() => void> = [];
  const install = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups = sections.map((section) => installScrub(section, !still.matches, strings));
  };
  install();
  still.addEventListener('change', install);
  return () => {
    still.removeEventListener('change', install);
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
  };
}

function installScrub(section: HTMLElement, live: boolean, strings: PackageStrings): () => void {
  const clock = pageClock();
  const beats = [...section.querySelectorAll<HTMLElement>('.semantic-beat[data-beat]')];
  const frames = [...section.querySelectorAll<HTMLElement>('img[data-scene-frame]')];
  const track = section.querySelector<HTMLElement>(':scope > .scene-track');
  const pin = track?.querySelector<HTMLElement>(':scope > .scene-pin');
  const lit = (): void => {
    for (const node of section.querySelectorAll('[data-lit]')) node.removeAttribute('data-lit');
  };
  if (!live || beats.length === 0 || track === null || pin === undefined || pin === null) {
    // Конечное состояние — последний такт: все отрезки, все состояния, вся схема.
    setBeatStates(section, beats, () => true);
    return () => setBeatStates(section, beats, () => false);
  }
  section.setAttribute('data-scene-live', '');
  const segments = document.createElement('ol');
  segments.className = 'scene-segments';
  segments.setAttribute('aria-hidden', 'true');
  const bars = beats.map(() => {
    const item = document.createElement('li');
    segments.append(item);
    return item;
  });
  const position = document.createElement('p');
  position.className = 'scene-position ui-meta';
  position.setAttribute('aria-live', 'polite');
  pin.append(segments, position);

  let shownCaption = -1;
  let shownArrived = false;
  const timeline = createTimeline(
    bars.map((bar, index) => ({
      start: index,
      end: index + 1,
      render: (local: number) => {
        bar.style.setProperty('--segment-fill', local.toFixed(4));
        bar.toggleAttribute('data-passed', local >= 1);
      },
    })),
  );
  const paint = (progress: number): void => {
    const frame = scrubFrame(progress, beats.length);
    timeline.render(Math.min(1, Math.max(0, progress)) * beats.length);
    const caption = frame.caption;
    const arrived = reached();
    if (caption === shownCaption && arrived === shownArrived) return;
    shownCaption = caption;
    shownArrived = arrived;
    for (const [index, beat] of beats.entries())
      beat.toggleAttribute('data-current', index === caption);
    const shownFrame = Math.min(caption, frames.length - 1);
    for (const [index, image] of frames.entries())
      image.toggleAttribute('data-scene-active', index === shownFrame);
    // Статус такта появляется, когда такт достигнут, и остаётся: последний такт держит всё.
    const focus = new Set(beats.slice(0, caption + 1).flatMap(focusOf));
    section.toggleAttribute('data-scene-focus', focus.size > 0);
    for (const node of section.querySelectorAll<SVGElement>('[data-node-id]'))
      node.toggleAttribute('data-lit', focus.has(node.dataset.nodeId ?? ''));
    for (const edge of section.querySelectorAll<SVGElement>('[data-from][data-to]'))
      edge.toggleAttribute(
        'data-lit',
        focus.has(edge.dataset.edgeId ?? '') ||
          (focus.has(edge.dataset.from ?? '') && focus.has(edge.dataset.to ?? '')),
      );
    lightCodeLines(section, beats[caption]);
    // Состояния тактов встают, только когда сцена достигнута: до неё первый такт ещё не прочитан.
    setBeatStates(section, beats, (index) => arrived && index <= caption);
    position.textContent = strings.sceneStep(caption + 1, beats.length);
  };

  /** Сцена достигнута: её рама встала под верхнюю панель (или запись выставила прогресс). */
  const reached = (): boolean => {
    const override = progressOverride(section);
    if (override !== undefined) return true;
    const top = Number.parseFloat(getComputedStyle(pin).top) || 0;
    return track.getBoundingClientRect().top <= top + 1;
  };
  const target = (): number => {
    const override = progressOverride(section);
    if (override !== undefined) return override;
    const box = track.getBoundingClientRect();
    const top = Number.parseFloat(getComputedStyle(pin).top) || 0;
    const range = box.height - pin.offsetHeight;
    return range <= 0 ? 0 : Math.min(1, Math.max(0, (top - box.top) / range));
  };
  let shown = target();
  let last = clock.now();
  let frame = 0;
  const step = (): void => {
    frame = 0;
    const now = clock.now();
    const goal = target();
    shown = progressOverride(section) !== undefined ? goal : smoothToward(shown, goal, now - last);
    last = now;
    paint(shown);
    if (shown !== goal) frame = clock.frame(step);
  };
  const schedule = (): void => {
    if (frame === 0) {
      last = clock.now();
      frame = clock.frame(step);
    }
  };
  // Перемотка часов ставит картину положения сразу: запись не ждёт сглаживания.
  const unregister = clock.register({
    at: () => {
      shown = target();
      last = clock.now();
      paint(shown);
    },
  });
  // Высота заголовка сцены: рама стоит под ним и занимает остаток окна.
  const title = section.querySelector<HTMLElement>(':scope > .semantic-section-title');
  // Заголовок отпускается вместе с рамой: его нижнее поле длиннее на высоту рамы, дорожка поднята на
  // столько же, и липкий заголовок уходит вверх в тот же миг, что рама, а не лежит поверх неё.
  let release = 0;
  const measureTitle = (): void => {
    if (title === null) return;
    const style = getComputedStyle(title);
    const margin = (Number.parseFloat(style.marginBottom) || 0) - release;
    const height = title.offsetHeight + margin;
    section.style.setProperty('--scene-title', `${Math.ceil(height)}px`);
    release = pin?.offsetHeight ?? 0;
    section.style.setProperty('--scene-release', `${release}px`);
    section.style.setProperty('--scene-title-gap', `${margin}px`);
  };
  measureTitle();
  const geometry: GeometryWatch = watchGeometry(
    () => {
      measureTitle();
      schedule();
    },
    {
      name: 'scrub scene',
      keepScroll: true,
    },
  );
  window.addEventListener('scroll', schedule, { passive: true });
  paint(shown);

  return () => {
    unregister();
    geometry.stop();
    window.removeEventListener('scroll', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
    segments.remove();
    position.remove();
    section.removeAttribute('data-scene-live');
    section.removeAttribute('data-scene-focus');
    // Поля заголовка и дорожки читаются только живой сценой (`data-scene-live`), снимать их не нужно.
    section.style.removeProperty('--scene-title');
    section.removeAttribute('data-code-focus');
    for (const beat of beats) beat.removeAttribute('data-current');
    for (const image of frames) image.removeAttribute('data-scene-active');
    lit();
    setBeatStates(section, beats, () => false);
  };
}
