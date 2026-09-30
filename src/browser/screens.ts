/**
 * Режим экранов (`layout: screens`, W-SCREENS). Каждая секция верхнего уровня — экран высотой с окно
 * под верхней панелью, и один жест прокрутки переносит ровно на один экран. Касание и полосу прокрутки
 * ведёт прилипание браузера (`scroll-snap-type: y mandatory` с `scroll-snap-stop: always`); жест колеса
 * или тачпада — серию событий без паузы — рантайм превращает ровно в один экран, потому что прилипание
 * оставляет короткий жест на месте, а длинный с инерцией проносит через экраны. Рантайм добавляет
 * переключатель экранов, клавиши (стрелки, PageUp/PageDown, пробел, Home/End), текущий экран в адресе и
 * API `window.agenticScreens` для записи и проверки.
 *
 * При уменьшенном движении и `motion: none` прилипания нет — обычная прокрутка документа, переключатель
 * остаётся навигацией; в печати экраны — обычные главы. Экран, который не помещается в окно, не
 * обрезается: он прокручивается внутри своего места, а проверка `check()` называет его.
 */

import type { PackageStrings } from '../localization.js';
import { pageClock } from './clock.js';
import { type GeometryWatch, watchGeometry } from './geometry-rebuild.js';

export interface ScreenMeasure {
  /** Номер экрана, с единицы. */
  readonly screen: number;
  readonly id: string;
  /** Высота содержимого экрана, px. */
  readonly height: number;
  /** Высота окна под верхней панелью, px. */
  readonly available: number;
  /** Всё содержимое экрана видно без прокрутки внутри него: ничего не обрезано по сгибу. */
  readonly fits: boolean;
}

export interface ScreensApi {
  readonly count: number;
  /** Текущий экран, с единицы. */
  current(): number;
  goto(screen: number): void;
  next(): void;
  previous(): void;
  /** Замеры экранов на текущей ширине: что помещается, что обрезано. */
  check(): readonly ScreenMeasure[];
}

declare global {
  interface Window {
    agenticScreens?: ScreensApi;
  }
}

/** Пауза между событиями колеса, после которой следующее событие — новый жест. */
const WHEEL_GESTURE_GAP_MS = 180;

const EDITABLE =
  'input, textarea, select, [contenteditable], [role="tablist"], dialog[open], [data-gallery-scroller]';

export function installScreens(
  page: HTMLElement,
  still: MediaQueryList,
  strings: PackageStrings,
): (() => void) | undefined {
  const root = document.documentElement;
  if (root.dataset.layout !== 'screens') return undefined;
  const screens = [...page.querySelectorAll<HTMLElement>('article > section[data-screen]')];
  if (screens.length === 0) return undefined;
  const clock = pageClock();
  const abort = new AbortController();
  const topbar = document.querySelector<HTMLElement>('.topbar');
  for (const [index, screen] of screens.entries())
    if (screen.id === '') screen.id = `screen-${index + 1}`;

  const titleOf = (screen: HTMLElement): string =>
    screen.querySelector(':scope > h2, :scope h1')?.textContent?.trim() ||
    screen.getAttribute('aria-label') ||
    screen.id;
  const switcher = document.createElement('nav');
  switcher.className = 'screen-switcher';
  switcher.dataset.screenSwitcher = '';
  switcher.setAttribute('aria-label', strings.screens);
  const list = document.createElement('ol');
  const links = screens.map((screen, index) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'screen-switcher-link';
    link.href = `#${screen.id}`;
    link.setAttribute(
      'aria-label',
      strings.screenLabel(index + 1, screens.length, titleOf(screen)),
    );
    link.title = titleOf(screen);
    item.append(link);
    list.append(item);
    return link;
  });
  switcher.append(list);
  document.body.append(switcher);
  root.setAttribute('data-screens-active', '');

  const offset = (): number => Math.ceil(topbar?.getBoundingClientRect().height ?? 0);
  const syncMode = (): void => {
    root.toggleAttribute('data-screens-still', still.matches);
    root.style.setProperty('--screen-offset', `${offset()}px`);
  };
  syncMode();

  let current = 0;
  const currentFromScroll = (): number => {
    const line = offset() + 2;
    let index = 0;
    for (const [position, screen] of screens.entries())
      if (screen.getBoundingClientRect().top <= line + window.innerHeight * 0.4) index = position;
    // Конец документа — последний экран, даже если он короче окна.
    if (Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 1)
      index = screens.length - 1;
    return index;
  };
  const mark = (index: number): void => {
    current = index;
    for (const [position, screen] of screens.entries())
      screen.toggleAttribute('data-screen-current', position === index);
    for (const [position, link] of links.entries()) {
      if (position === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
  };
  let frame = 0;
  const sync = (): void => {
    frame = 0;
    mark(currentFromScroll());
  };
  const schedule = (): void => {
    if (frame === 0) frame = clock.frame(sync);
  };
  const settle = (): void => {
    sync();
    const id = screens[current]?.id;
    if (id !== undefined && window.location.hash !== `#${id}`)
      history.replaceState(null, '', `#${id}`);
  };

  /**
   * Экран, к которому идёт плавная прокрутка, пока она не кончилась. Пока прокрутка идёт, события колеса —
   * хвост того же жеста: на загруженной машине события приходят реже, и пауза между ними сама по себе не
   * отличает хвост инерции от нового жеста, а прокрутка ещё не довела страницу до экрана.
   */
  let travelling: HTMLElement | undefined;
  const arrived = (): void => {
    travelling = undefined;
  };
  const goto = (index: number): void => {
    const target = screens[Math.min(screens.length - 1, Math.max(0, index))];
    if (target === undefined) return;
    const smooth = !still.matches;
    // Прокрутка, которой некуда идти, не пришлёт `scrollend`: ждать её нечего.
    travelling =
      smooth &&
      'onscrollend' in window &&
      Math.abs(target.getBoundingClientRect().top - offset()) > 1
        ? target
        : undefined;
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'instant' });
    mark(screens.indexOf(target));
  };
  /**
   * Экран выше окна прокручивается внутри своего места: клавиша и колесо сначала доводят его до конца. Экран,
   * который помещается в окно, листается сразу, где бы он ни стоял: пока страница ещё доводит его до места
   * (прокрутка к экрану после загрузки, хвост прошлой прокрутки), его край может быть на пару пикселей за
   * окном, и жест иначе ушёл бы в обычную прокрутку.
   */
  const fitsWindow = (screen: HTMLElement): boolean =>
    screen.getBoundingClientRect().height <= window.innerHeight - offset() + 2;
  const screenEndVisible = (): boolean => {
    const screen = screens[current];
    return (
      screen === undefined ||
      fitsWindow(screen) ||
      screen.getBoundingClientRect().bottom <= window.innerHeight + 2
    );
  };
  const screenStartVisible = (): boolean => {
    const screen = screens[current];
    return (
      screen === undefined ||
      fitsWindow(screen) ||
      screen.getBoundingClientRect().top >= offset() - 2
    );
  };

  document.addEventListener(
    'keydown',
    (event) => {
      if (still.matches || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return;
      const target = event.target;
      if (target instanceof Element && target.closest(EDITABLE)) return;
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        target instanceof Element &&
        target.closest('button, a, summary')
      )
        return;
      const forward =
        event.key === 'ArrowDown' ||
        event.key === 'PageDown' ||
        (event.key === ' ' && !event.shiftKey);
      const backward =
        event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
      current = currentFromScroll();
      if (forward && screenEndVisible()) {
        event.preventDefault();
        goto(current + 1);
      } else if (backward && screenStartVisible()) {
        event.preventDefault();
        goto(current - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goto(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goto(screens.length - 1);
      }
    },
    { signal: abort.signal },
  );
  // Жест колеса или тачпада — серия событий без паузы — переносит ровно на один экран: прилипание
  // браузера оставляет короткий жест на месте, а длинный с инерцией проносит через экраны. Внутри экрана
  // выше окна колесо прокручивает его как обычно, пока не покажется его край.
  let gestureUntil = 0;
  window.addEventListener(
    'wheel',
    (event) => {
      if (still.matches || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return;
      const target = event.target;
      if (target instanceof Element && target.closest(`${EDITABLE}, .visualization-frame, pre`))
        return;
      // Время события — настоящее: часы страницы при записи стоят, а жест идёт в реальном времени.
      const now = event.timeStamp;
      const inGesture = now < gestureUntil || travelling !== undefined;
      gestureUntil = now + WHEEL_GESTURE_GAP_MS;
      if (travelling === undefined) current = currentFromScroll();
      const forward = event.deltaY > 0;
      if (!inGesture && (forward ? !screenEndVisible() : !screenStartVisible())) return;
      event.preventDefault();
      if (inGesture) return;
      goto(current + (forward ? 1 : -1));
    },
    { passive: false, signal: abort.signal },
  );
  window.addEventListener('scroll', schedule, { passive: true, signal: abort.signal });
  // Якорь ведёт к своему экрану: к экрану целиком, а не к месту цели внутри него.
  window.addEventListener(
    'hashchange',
    () => {
      const owner = ownerOf(window.location.hash);
      if (owner >= 0 && owner !== currentFromScroll()) goto(owner);
    },
    { signal: abort.signal },
  );
  if ('onscrollend' in window)
    window.addEventListener(
      'scrollend',
      () => {
        arrived();
        settle();
      },
      { signal: abort.signal },
    );
  still.addEventListener('change', syncMode, { signal: abort.signal });
  const geometry: GeometryWatch = watchGeometry(
    () => {
      syncMode();
      sync();
    },
    { name: 'screens' },
  );
  const unregister = clock.register({ at: sync });

  const measure = (): ScreenMeasure[] => {
    const available = window.innerHeight - offset();
    return screens.map((screen, index) => {
      // Закреплённая сцена со скрабом длиннее окна нарочно: читатель видит её раму, а не дорожку.
      const track = screen.querySelector<HTMLElement>(':scope > .scene-track');
      const pin = track?.querySelector<HTMLElement>(':scope > .scene-pin');
      const pinned =
        track !== null &&
        track !== undefined &&
        pin !== null &&
        pin !== undefined &&
        screen.hasAttribute('data-scene-live')
          ? track.offsetHeight - pin.offsetHeight
          : 0;
      const height = Math.ceil(screen.scrollHeight - pinned);
      return { screen: index + 1, id: screen.id, height, available, fits: height <= available + 1 };
    });
  };
  const api: ScreensApi = {
    count: screens.length,
    current: () => current + 1,
    goto: (screen) => goto(screen - 1),
    next: () => goto(currentFromScroll() + 1),
    previous: () => goto(currentFromScroll() - 1),
    check: measure,
  };
  window.agenticScreens = api;
  function ownerOf(hash: string): number {
    if (hash.length <= 1) return -1;
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return -1;
    }
    return target === null ? -1 : screens.findIndex((screen) => screen.contains(target));
  }
  // Якорь в адресе открывает свой экран сразу, без прокрутки от начала.
  const owner = ownerOf(window.location.hash);
  if (owner >= 0) {
    screens[owner]?.scrollIntoView({ block: 'start', behavior: 'instant' });
    mark(owner);
  } else sync();

  return () => {
    abort.abort();
    geometry.stop();
    unregister();
    if (frame !== 0) clock.cancelFrame(frame);
    switcher.remove();
    root.removeAttribute('data-screens-active');
    root.removeAttribute('data-screens-still');
    root.style.removeProperty('--screen-offset');
    delete window.agenticScreens;
    for (const screen of screens) screen.removeAttribute('data-screen-current');
  };
}
