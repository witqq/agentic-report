/**
 * Место чтения: куда встаёт цель перехода по якорю и где оказывается читатель после обновления страницы.
 *
 * - Переход по ссылке внутри страницы (оглавление, ссылка в тексте, сноска) и адрес с якорем раскрывают
 *   свёрнутые блоки и неактивные вкладки вокруг цели и ставят её под верхнюю панель: у главы — её
 *   заголовок, у любой другой цели — её верхний край с её `scroll-margin-top`. Точку считает рантайм, а не браузер: якорь главы —
 *   секция, и её отступ сверху зависит от плотности и темы, так что правило CSS «отступ секции наоборот»
 *   ставило заголовок то ниже линии, от которой оглавление отмечает текущую главу, то выше.
 * - Плавную прокрутку ведёт сам рантайм, по кадрам часов страницы: одна кривая от места читателя до цели,
 *   цель перемеряется на каждом кадре. Если высота над целью меняется в пути (раскрылся блок, ожил остров,
 *   догрузился шрифт), кривая перестраивается от текущего места с той же скоростью (`planTravel`), так что
 *   прокрутка не встаёт, не разворачивается и не дёргается. Нативный плавный `scrollTo` для этого не
 *   годится: браузер считает его конец один раз, а каждый новый вызов начинает разгон с нуля. После
 *   прихода цель держится ещё `HOLD_MS`. Любое действие читателя — колесо, касание, клавиша, нажатие —
 *   отпускает цель сразу.
 * - При уменьшенном движении (и при `motion: none`) переход мгновенный, в ту же точку.
 * - Обновление страницы и возврат по истории возвращают читателя к тому, что он читал: состояние блоков
 *   `<details>`, которые он раскрыл или свернул, и место чтения (блок у верхнего края и его отступ)
 *   записываются в `sessionStorage` вкладки при уходе со страницы и восстанавливаются до того, как
 *   браузер вернёт прокрутку. Новое открытие страницы начинается с состояния, которое задал автор.
 *
 * Режим экранов и презентация ведут свои якоря сами, поэтому здесь они не трогаются.
 */

import { pageClock } from './clock.js';
import { showTabPanel } from './tab-panels.js';

const HOLD_MS = 1000;
/** Длительность плавного перехода: растёт с расстоянием, но не выходит из этих пределов, мс. */
const TRAVEL_MIN_MS = 300;
const TRAVEL_MAX_MS = 900;
/** Перемеренная цель расходится с кривой больше чем на столько пикселей — кривая перестраивается. */
const REPLAN_PX = 1;
const STORAGE_PREFIX = 'agentic-report:reading:';
/** Блоки, за которые держится место чтения: от главы до абзаца внутри раскрытого блока. */
const READING_BLOCKS = 'article > *, article > section > *, details > :not(summary)';

const root = document.documentElement;
let initialHandled = false;

/**
 * Раскрыть всё, что прячет цель: свёрнутые блоки `<details>` вокруг неё и неактивные панели вкладок (у
 * панели выбирается её вкладка); `true`, если что-то раскрылось. Цель в строке-заголовке блока видна и в
 * свёрнутом блоке, его она не раскрывает.
 */
export function openAround(target: Element): boolean {
  let opened = false;
  for (
    let node = target.closest('details, [data-tab-panel]');
    node !== null;
    node = node.parentElement?.closest('details, [data-tab-panel]') ?? null
  ) {
    if (node instanceof HTMLDetailsElement) {
      if (node.open || node.querySelector(':scope > summary')?.contains(target) === true) continue;
      node.open = true;
      opened = true;
    } else if (showTabPanel(node)) opened = true;
  }
  return opened;
}

/** Длительность перехода на `distance` пикселей из покоя, мс. */
export function travelDuration(distance: number): number {
  return Math.min(TRAVEL_MAX_MS, Math.max(TRAVEL_MIN_MS, 200 + 8 * Math.sqrt(Math.abs(distance))));
}

/**
 * Кривая оставшегося пути: кубический сплайн Эрмита от `remaining` пикселей со скоростью окна `velocity`
 * (пикселей в мс, положительная — к цели при положительном остатке) до нуля с нулевой скоростью за
 * `duration` мс. Скорость в начале совпадает с переданной, поэтому перестройка кривой в пути не даёт
 * ни остановки, ни скачка скорости.
 */
export interface Travel {
  readonly start: number;
  readonly duration: number;
  readonly remaining: number;
  readonly velocity: number;
}

/**
 * Кривая от текущего состояния. Из покоя — плавный разгон и торможение за `travelDuration`. В движении к
 * цели — не дольше `2·остаток/скорость` (тогда скорость только убывает) и не дольше перехода из покоя;
 * длительность не больше `3·остаток/скорость`, иначе сплайн проскочил бы цель и вернулся.
 */
export function planTravel(now: number, remaining: number, velocity: number): Travel {
  const fresh = travelDuration(remaining);
  const toward = velocity * remaining > 0 ? Math.abs(velocity) : 0;
  const duration =
    toward === 0 ? fresh : Math.max(1, Math.min(fresh, (2 * Math.abs(remaining)) / toward));
  return { start: now, duration, remaining, velocity };
}

/** Остаток пути и скорость окна в момент `now`; `done` — кривая кончилась. */
export function travelAt(
  travel: Travel,
  now: number,
): { readonly remaining: number; readonly velocity: number; readonly done: boolean } {
  const s = Math.min(1, Math.max(0, (now - travel.start) / travel.duration));
  const slope = -travel.velocity * travel.duration;
  const remaining =
    (2 * s ** 3 - 3 * s ** 2 + 1) * travel.remaining + (s ** 3 - 2 * s ** 2 + s) * slope;
  const derivative = (6 * s ** 2 - 6 * s) * travel.remaining + (3 * s ** 2 - 4 * s + 1) * slope;
  return { remaining, velocity: -derivative / travel.duration, done: s >= 1 };
}

interface ReadingState {
  readonly disclosures: readonly boolean[];
  readonly blocks: number;
  readonly anchor?: { readonly index: number; readonly offset: number };
}

interface Landing {
  /** Цель перехода: якорь адреса или блок места чтения. */
  readonly target: HTMLElement;
  /** Элемент, чей верх ставится на линию. */
  readonly element: HTMLElement;
  /** Отступ линии от верха окна. */
  readonly line: () => number;
  /** Кривая плавного перехода, пока он идёт. */
  travel: Travel | undefined;
  /** Остаток пути, выставленный последним кадром: перемеренный остаток сверяется с ним. */
  applied: number;
  /** Время часов последнего кадра перехода. */
  appliedAt: number;
  /** Поправлять и события прокрутки не от читателя: браузер ещё может вернуть прокрутку сам. */
  readonly guardScroll: boolean;
  /** Прокрутка окна, которую поставил сам переход, и точка цели в тот момент (`NaN` — ещё не ставил). */
  placedAt: number;
  placedGoal: number;
}

function pageHash(hash: string): HTMLElement | undefined {
  if (!hash.startsWith('#') || hash.length === 1 || hash.startsWith('#/')) return undefined;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1))) ?? undefined;
  } catch {
    return undefined;
  }
}

function scrollPadding(): number {
  return Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
}

/**
 * Верх элемента в окне без вертикальных сдвигов `transform`/`translate` у него и его предков. Проявление главы
 * (`data-reveal-motion`) сдвигает её блоки вниз, пока они не показаны, и снимает сдвиг уже после прихода:
 * по коробке со сдвигом заголовок встал бы на линию, а после проявления уехал бы под верхнюю панель, и
 * оглавление, выбирая текущую главу по сдвинутому заголовку, отметило бы предыдущую. Поэтому и место
 * приземления, и текущая глава считаются по месту, где блок будет стоять в покое.
 */
export function restingTop(element: Element): number {
  let shift = 0;
  // Сдвиги проявления стоят на блоках статьи и их содержимом; выше статьи их нет, и обход там кончается.
  for (
    let node: Element | null = element;
    node !== null && node.localName !== 'article';
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (style.transform !== 'none') shift += new DOMMatrixReadOnly(style.transform).m42;
    const translateY = style.translate.split(' ')[1];
    if (translateY?.endsWith('px') === true) shift += Number.parseFloat(translateY) || 0;
  }
  return element.getBoundingClientRect().top - shift;
}

export function installReadingPosition(page: HTMLElement, still: MediaQueryList): () => void {
  const clock = pageClock();
  const abort = new AbortController();
  const { signal } = abort;
  const storageKey = `${STORAGE_PREFIX}${window.location.pathname}:${page.dataset.localizedPageVariant ?? ''}`;
  const ownAnchors = (): boolean =>
    root.dataset.layout === 'slides' || root.hasAttribute('data-screens-active');
  const disclosures = (): HTMLDetailsElement[] => [
    ...page.querySelectorAll<HTMLDetailsElement>('details'),
  ];
  const blocks = (): HTMLElement[] => [...page.querySelectorAll<HTMLElement>(READING_BLOCKS)];

  let landing: Landing | undefined;
  let hold = 0;
  let frame = 0;
  let loaded = document.readyState === 'complete';

  const setTravelling = (on: boolean): void => {
    root.toggleAttribute('data-reading-travel', on);
  };

  /** Слушатели, нужные только пока цель ведётся или держится: страница в покое их не несёт. */
  let watching: AbortController | undefined;
  const content = new ResizeObserver(() => schedule());

  const release = (): void => {
    landing = undefined;
    watching?.abort();
    watching = undefined;
    content.disconnect();
    setTravelling(false);
    if (hold !== 0) clock.cancelLater(hold);
    if (frame !== 0) clock.cancelFrame(frame);
    hold = frame = 0;
  };

  const desiredTop = (current: Landing): number => {
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    const top = window.scrollY + restingTop(current.element) - current.line();
    return Math.min(max, Math.max(0, top));
  };

  const holdFor = (): void => {
    if (hold !== 0) clock.cancelLater(hold);
    hold = clock.later(() => {
      hold = 0;
      // Пока страница грузится, браузер ещё может вернуть прокрутку сам: держать до конца загрузки.
      if (landing?.guardScroll === true && !loaded) holdFor();
      else release();
    }, HOLD_MS);
  };

  /** Держать пришедшую цель: окно сразу встаёт в точку цели. */
  const correct = (): void => {
    const current = landing;
    if (current === undefined || current.travel !== undefined) return;
    if (!current.element.isConnected) {
      release();
      return;
    }
    const top = desiredTop(current);
    if (Math.abs(top - window.scrollY) >= 1) window.scrollTo({ top, behavior: 'instant' });
    placed(current, top);
  };

  const placed = (current: Landing, goal: number): void => {
    current.placedAt = window.scrollY;
    current.placedGoal = goal;
  };

  /**
   * Прокрутка, которую не ставил переход, которую не объясняет сдвиг цели (раскладка над ней) и которая
   * уводит окно от цели, — чужая: полоса прокрутки, скрипт страницы, поиск по странице. Она отпускает цель,
   * как колесо или клавиша. Сдвиг самой цели (раскрылся блок, привязка прокрутки браузера) переход ведёт
   * дальше. Шаг к цели не чужой: это последний такт плавной прокрутки браузера к якорю, который
   * композитор успевает сделать после её остановки, и с него переход просто продолжается.
   */
  const foreignScroll = (current: Landing): boolean => {
    if (Number.isNaN(current.placedAt) || Math.abs(window.scrollY - current.placedAt) < 1)
      return false;
    const goal = desiredTop(current);
    if (Math.abs(goal - current.placedGoal) >= 1) return false;
    return Math.abs(goal - window.scrollY) >= Math.abs(current.placedGoal - current.placedAt) + 1;
  };

  /** Кадр перехода: перемерить цель, при расхождении перестроить кривую, поставить окно на кривую. */
  const step = (time: number): void => {
    frame = 0;
    const current = landing;
    const travel = current?.travel;
    if (current === undefined || travel === undefined) return;
    if (!current.element.isConnected) {
      release();
      return;
    }
    // Время кадра, а не момент вызова: окно встаёт туда, где кривая в момент показа кадра.
    const now = time;
    const goal = desiredTop(current);
    const measured = goal - window.scrollY;
    // Кривая начинается с первого кадра, а не с нажатия: кадр после нажатия бывает долгим, и отсчёт от
    // нажатия начал бы путь скачком.
    let curve = Number.isNaN(travel.start) ? planTravel(now, measured, 0) : travel;
    if (curve !== travel) {
      current.travel = curve;
      current.applied = measured;
      current.appliedAt = now;
    }
    if (Math.abs(measured - current.applied) >= REPLAN_PX) {
      // Высота изменилась между кадрами: кривая перестраивается от прошлого кадра, с его остатком по новой
      // раскладке и его скоростью, так что этот кадр уже продолжает движение, а не стоит на месте.
      const at = current.appliedAt;
      curve = planTravel(at, measured, travelAt(travel, at).velocity);
      current.travel = curve;
    }
    const point = travelAt(curve, now);
    const remaining = point.done ? 0 : point.remaining;
    window.scrollTo({ top: goal - remaining, behavior: 'instant' });
    current.applied = goal - window.scrollY;
    current.appliedAt = now;
    placed(current, goal);
    if (point.done) {
      current.travel = undefined;
      setTravelling(false);
      holdFor();
      return;
    }
    frame = clock.frame(step);
  };

  const schedule = (): void => {
    if (landing === undefined || landing.travel !== undefined || frame !== 0) return;
    frame = clock.frame(() => {
      frame = 0;
      correct();
      if (landing !== undefined) holdFor();
    });
  };

  const land = (
    target: HTMLElement,
    element: HTMLElement,
    line: () => number,
    options: { readonly smooth: boolean; readonly guardScroll: boolean },
  ): void => {
    release();
    const next: Landing = {
      target,
      element,
      line,
      travel: undefined,
      applied: 0,
      appliedAt: 0,
      guardScroll: options.guardScroll,
      placedAt: Number.NaN,
      placedGoal: Number.NaN,
    };
    landing = next;
    watching = new AbortController();
    window.addEventListener('resize', schedule, { signal: watching.signal });
    content.observe(document.body);
    const top = desiredTop(next);
    const remaining = top - window.scrollY;
    if (!options.smooth || Math.abs(remaining) < 1) {
      window.scrollTo({ top, behavior: 'instant' });
      placed(next, top);
      holdFor();
      return;
    }
    // Мгновенная прокрутка на место останавливает плавную прокрутку браузера к якорю (`location.hash` при
    // `scroll-behavior: smooth`), и с этого места всякая прокрутка — либо кадр перехода, либо чужая.
    window.scrollTo({ top: window.scrollY, behavior: 'instant' });
    placed(next, top);
    next.travel = { ...planTravel(0, remaining, 0), start: Number.NaN };
    next.applied = remaining;
    setTravelling(true);
    frame = clock.frame(step);
  };

  /** Цель якоря: заголовок главы или сама цель, и линия под панелью с её собственным отступом. */
  const landOnTarget = (target: HTMLElement, smooth: boolean, guardScroll: boolean): void => {
    openAround(target);
    // У цели без коробки (закрытое окно `<dialog>`, скрытая панель) нет места на странице: браузер к ней не
    // прокручивает, и рантайм тоже не трогает окно, а идущий переход доходит до своей цели.
    if (target.getClientRects().length === 0) return;
    const heading = target.matches('section[data-semantic="section"]')
      ? target.querySelector<HTMLElement>(':scope > h2')
      : null;
    if (heading !== null) {
      land(target, heading, scrollPadding, { smooth, guardScroll });
      return;
    }
    land(
      target,
      target,
      () => scrollPadding() + (Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0),
      { smooth, guardScroll },
    );
  };

  const save = (): void => {
    if (ownAnchors()) return;
    const line = scrollPadding();
    const list = blocks();
    let anchor: HTMLElement | undefined;
    if (window.scrollY > 0) {
      // Самый глубокий блок, который пересекает линию под панелью: глава, в ней абзац, в раскрытом блоке — его абзац.
      for (const block of list) {
        if (anchor !== undefined && !anchor.contains(block)) {
          if (block.getBoundingClientRect().top > line) break;
          continue;
        }
        const box = block.getBoundingClientRect();
        if (box.height > 0 && box.bottom > line) anchor = block;
      }
    }
    const state: ReadingState = {
      disclosures: disclosures().map((details) => details.open),
      blocks: list.length,
      ...(anchor === undefined
        ? {}
        : {
            anchor: {
              index: list.indexOf(anchor),
              offset: anchor.getBoundingClientRect().top - line,
            },
          }),
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Хранилище закрыто (приватный режим, политика): обновление вернёт страницу как браузер.
    }
  };

  const restore = (): boolean => {
    let state: ReadingState | undefined;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      state = raw === null ? undefined : (JSON.parse(raw) as ReadingState);
    } catch {
      return false;
    }
    const list = disclosures();
    if (state === undefined || !Array.isArray(state.disclosures)) return false;
    // Страницу пересобрали с другим числом блоков: чужое состояние не накладывается.
    if (state.disclosures.length !== list.length) return false;
    for (const [index, details] of list.entries()) details.open = state.disclosures[index] === true;
    const anchor = state.anchor;
    const all = blocks();
    const element = anchor === undefined ? undefined : all[anchor.index];
    if (anchor === undefined || element === undefined || state.blocks !== all.length) return true;
    land(element, element, () => scrollPadding() + anchor.offset, {
      smooth: false,
      guardScroll: true,
    });
    return true;
  };

  // Первое открытие документа: вернуть читателя к прочитанному или привести к якорю адреса.
  if (!initialHandled && !ownAnchors()) {
    initialHandled = true;
    const entry = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const returning = entry?.type === 'reload' || entry?.type === 'back_forward';
    if (!(returning && restore())) {
      const target = pageHash(window.location.hash);
      if (target !== undefined) landOnTarget(target, false, true);
    }
  }
  initialHandled = true;

  window.addEventListener(
    'click',
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        ownAnchors()
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute('href') ?? '';
      if (link.target !== '' && link.target !== '_self') return;
      const target = pageHash(href);
      if (target === undefined || !page.contains(target)) return;
      openAround(target);
      if (target.getClientRects().length === 0) return;
      event.preventDefault();
      // Адрес получает якорь новой записью истории, как у обычной ссылки, но без прокрутки браузера: смена
      // `location.hash` начала бы его собственную плавную прокрутку, и первый кадр перехода дёрнулся бы.
      // Начало последовательной навигации клавиатурой переносится на цель, как при обычном переходе.
      if (window.location.hash !== href) history.pushState(history.state, '', href);
      if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      landOnTarget(target, !still.matches, false);
    },
    { signal },
  );
  // Смена якоря не по ссылке — адрес, `location.hash`, возврат по истории (браузер при нём сам идёт к якорю,
  // а не к прежней прокрутке) — ведёт к цели так же, как ссылка.
  window.addEventListener(
    'hashchange',
    () => {
      if (ownAnchors()) return;
      const target = pageHash(window.location.hash);
      if (target === undefined || landing?.target === target) return;
      landOnTarget(target, !still.matches, false);
    },
    { signal },
  );

  window.addEventListener(
    'scroll',
    () => {
      const current = landing;
      if (current === undefined) return;
      // До конца загрузки браузер может сам вернуть прокрутку или дойти до якоря — это поправляется. После
      // неё (и всегда в пути) чужая прокрутка значит, что окно повёл кто-то другой.
      if (current.travel === undefined && current.guardScroll && !loaded) schedule();
      else if (foreignScroll(current)) release();
      else if (current.travel === undefined && current.guardScroll) schedule();
    },
    { passive: true, signal },
  );
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const)
    window.addEventListener(type, release, { passive: true, capture: true, signal });
  window.addEventListener(
    'load',
    () => {
      loaded = true;
      schedule();
    },
    { signal },
  );
  window.addEventListener('pagehide', save, { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') save();
    },
    { signal },
  );

  return () => {
    abort.abort();
    content.disconnect();
    release();
  };
}
