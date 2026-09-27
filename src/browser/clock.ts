/**
 * Часы страницы: единственный источник времени для всего, что на странице движется.
 *
 * Рантайм, WebGL-приёмы и (позже) контроллеры расширений читают время, просят кадр и ставят отложенный
 * вызов только через эти часы. Часы бывают трёх видов:
 *
 * - `real` — обычный просмотр: часы отдают настоящие `performance.now`, `requestAnimationFrame` и
 *   `setTimeout`, поведение страницы то же, что без них;
 * - `manual` — запись и проверка: страницу открыли с `window.__agenticReportClock = 'manual'`, выставленным
 *   до её скрипта (например, `addInitScript`). Часы подменяют `performance.now`, `Date` и
 *   `requestAnimationFrame`/`cancelAnimationFrame`, время само не идёт, а `window.__clock.seek(t)` приводит
 *   страницу к моменту `t` секунд: срабатывают наступившие отложенные вызовы, зарегистрированные
 *   подсистемы получают `at(t)`, выполняются запрошенные кадры, а Web Animations (CSS-анимации и переходы) и
 *   SVG SMIL встают в положение момента `t`;
 * - `external` — страницу открыл agentic-screencast, и его часы (`window.__clock`) уже стоят до документа.
 *   Время и кадры подменил он; эти часы только подключаются к его `renderAt(t)`, чтобы подсистемы страницы
 *   и отложенные вызовы шли по его перемотке.
 *
 * Договор `window.__clock` — `seek(t)`, `now()`, `realNow()` — тот же, что у agentic-screencast, поэтому
 * страница report становится сценой ролика без отдельного моста.
 */

import { MANUAL_CLOCK_GLOBAL, PROGRESS_OVERRIDE_ATTRIBUTE } from '../page-clock.js';

export { MANUAL_CLOCK_GLOBAL, PROGRESS_OVERRIDE_ATTRIBUTE };

/** Подсистема, чьё состояние — функция времени: часы зовут её при каждой перемотке. */
export interface Timed {
  /** Привести состояние к моменту `seconds` секунд от начала отсчёта часов. */
  readonly at: (seconds: number) => void;
}

/** Управление часами снаружи страницы — договор agentic-screencast. */
export interface ClockControl {
  /** Выставить время кадра в секундах и привести страницу в состояние этого момента. */
  seek(seconds: number): void;
  /** Текущее время часов, мс. */
  now(): number;
  /** Настоящее время браузера, мс: для замеров, которые не должны зависеть от перемотки. */
  realNow(): number;
}

export type ClockMode = 'real' | 'manual' | 'external';

declare global {
  interface Window {
    __clock?: ClockControl;
    __agenticReportClock?: 'manual';
    renderAt?: (seconds: number) => void;
  }
}

/** То, чем часы пользуются от окна; в браузере это само `window`, в модульных тестах — подделка. */
export interface ClockHost {
  performance: { now(): number };
  Date: DateConstructor;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(handle: number): void;
  __clock?: ClockControl;
  __agenticReportClock?: 'manual';
  renderAt?: (seconds: number) => void;
}

/**
 * Положение анимаций документа. `mark(time)` запоминает, что ещё не виденные анимации начались в момент
 * `time` часов, и останавливает их в начале: время часов между перемотками стоит, и анимация не должна
 * идти по настоящему. `position(time, seconds)` ставит все виденные анимации в положение этого момента.
 */
export interface ClockMedia {
  mark(time: number): void;
  position(time: number, seconds: number): void;
}

export interface PageClock {
  readonly mode: ClockMode;
  /** Время часов, мс. */
  now(): number;
  frame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
  /** Отложенный вызов, видимый глазу (задержка закрытия, возврат подписи): при перемотке — по часам. */
  later(callback: () => void, milliseconds: number): number;
  cancelLater(handle: number): void;
  /** Подписать подсистему на перемотку; возвращает отписку. */
  register(timed: Timed): () => void;
}

interface PendingTimer {
  readonly due: number;
  readonly order: number;
  readonly callback: () => void;
}

/** Предел срабатываний отложенных вызовов за одну перемотку: вызов, ставящий сам себя с нулём, не зациклит её. */
const TIMER_LIMIT = 10_000;

export function createClock(host: ClockHost, media?: ClockMedia): PageClock {
  const mode: ClockMode =
    host.__clock !== undefined
      ? 'external'
      : host[MANUAL_CLOCK_GLOBAL] === 'manual'
        ? 'manual'
        : 'real';
  const subscribers = new Set<Timed>();
  const timers = new Map<number, PendingTimer>();
  let timerHandle = 0;
  let current = 0;

  const now = (): number => host.performance.now();
  const runTimers = (until: number, onFire?: (due: number) => void): void => {
    for (let fired = 0; fired < TIMER_LIMIT; fired += 1) {
      let next: [number, PendingTimer] | undefined;
      for (const entry of timers) {
        if (entry[1].due > until) continue;
        if (
          next === undefined ||
          entry[1].due < next[1].due ||
          (entry[1].due === next[1].due && entry[1].order < next[1].order)
        )
          next = entry;
      }
      if (next === undefined) return;
      timers.delete(next[0]);
      onFire?.(next[1].due);
      next[1].callback();
    }
  };
  const notify = (seconds: number): void => {
    for (const timed of [...subscribers]) timed.at(seconds);
  };

  if (mode === 'manual') {
    const realNow = host.performance.now.bind(host.performance);
    const realFrame = host.requestAnimationFrame.bind(host);
    const frames = new Map<number, FrameRequestCallback>();
    let frameHandle = 0;
    host.performance.now = () => current;
    const RealDate = host.Date;
    // Подмена глобального Date обходит систему типов: наследник не повторяет вызов `Date()` без `new`,
    // который возвращает строку. Нужна именно подмена времени, как в часах agentic-screencast.
    host.Date = class extends RealDate {
      constructor(...values: unknown[]) {
        super(...((values.length > 0 ? values : [current]) as []));
      }
      static override now(): number {
        return current;
      }
    } as DateConstructor;
    host.requestAnimationFrame = (callback) => {
      frameHandle += 1;
      frames.set(frameHandle, callback);
      return frameHandle;
    };
    host.cancelAnimationFrame = (handle) => {
      frames.delete(handle);
    };
    host.__clock = {
      seek(seconds: number): void {
        const target = seconds * 1000;
        // Анимации, начатые с прошлой перемотки, начались в тот момент часов: время между перемотками стоит.
        media?.mark(current);
        runTimers(target, (due) => {
          current = Math.max(current, due);
        });
        current = target;
        media?.mark(current);
        notify(seconds);
        host.renderAt?.(seconds);
        // Кадры, запрошенные до перемотки, выполняются один раз; запрошенные ими — со следующей.
        const batch = [...frames.values()];
        frames.clear();
        for (const callback of batch) callback(current);
        media?.mark(current);
        media?.position(current, seconds);
      },
      now: () => current,
      realNow,
    };
    // Анимации, начатые между перемотками (появление секции по наблюдателю, стиль по наведению),
    // останавливаются в первый же настоящий кадр: иначе они шли бы и кончались по настоящему времени,
    // и снимок зависел бы от того, сколько его прошло.
    if (media !== undefined) {
      const watch = (): void => {
        media.mark(current);
        realFrame(watch);
      };
      watch();
    }
  } else if (mode === 'external') {
    // Сцена ролика вызывает `renderAt` сама и может обернуть его после загрузки страницы.
    const previous = host.renderAt;
    host.renderAt = (seconds: number): void => {
      previous?.(seconds);
      runTimers(seconds * 1000);
      notify(seconds);
    };
  }

  return {
    mode,
    now,
    frame: (callback) => host.requestAnimationFrame(callback),
    cancelFrame: (handle) => host.cancelAnimationFrame(handle),
    later(callback, milliseconds) {
      if (mode === 'real') return host.setTimeout(callback, milliseconds);
      timerHandle += 1;
      timers.set(timerHandle, { due: now() + milliseconds, order: timerHandle, callback });
      return timerHandle;
    },
    cancelLater(handle) {
      if (mode === 'real') host.clearTimeout(handle);
      else timers.delete(handle);
    },
    register(timed) {
      subscribers.add(timed);
      return () => {
        subscribers.delete(timed);
      };
    },
  };
}

/** Прогресс эффекта от прокрутки, выставленный записью, если он выставлен и лежит в 0–1. */
export function progressOverride(element: Element): number | undefined {
  const written = element.getAttribute(PROGRESS_OVERRIDE_ATTRIBUTE);
  if (written === null || written.trim() === '') return undefined;
  const value = Number(written);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

/** Все корни, где живут анимации: документ и теневые деревья. */
function animationRoots(): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [document];
  const walk = (start: Node): void => {
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const shadow = (node as Element).shadowRoot;
      if (shadow !== null) {
        roots.push(shadow);
        walk(shadow);
      }
    }
  };
  walk(document);
  return roots;
}

/**
 * Web Animations и SVG SMIL документа. Анимация встаёт в положение «время часов минус момент её начала по
 * часам», поэтому переход, начатый при появлении секции, показывается с его собственного начала, а не с
 * начала страницы. Анимации по прокрутке (`animation-timeline: view()`) идут по своей шкале и не трогаются.
 *
 * Виденные анимации часы держат у себя: анимация, поставленная за свой конец, перестаёт возвращаться из
 * `getAnimations()`, а перемотка назад должна снова её показать. Забываются только отменённые анимации
 * (переход, вытесненный новым, или снятая CSS-анимация) и анимации элементов, ушедших из документа.
 */
function documentMedia(): ClockMedia {
  const starts = new Map<Animation, number>();
  return {
    mark(time) {
      for (const root of animationRoots())
        for (const animation of root.getAnimations()) {
          if (animation.timeline !== document.timeline || starts.has(animation)) continue;
          starts.set(animation, time);
          try {
            animation.pause();
            animation.currentTime = 0;
          } catch {
            // Анимация могла уйти из документа между сбором и паузой.
          }
        }
    },
    position(time, seconds) {
      for (const [animation, start] of starts) {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        if (animation.playState === 'idle' || (target !== null && !target.isConnected)) {
          starts.delete(animation);
          continue;
        }
        try {
          animation.pause();
          animation.currentTime = Math.max(0, time - start);
        } catch {
          // Анимация могла закончиться и уйти из документа между сбором и паузой.
        }
      }
      for (const svg of document.querySelectorAll('svg')) {
        try {
          svg.pauseAnimations();
          svg.setCurrentTime(seconds);
        } catch {
          // Не у каждого svg есть шкала SMIL.
        }
      }
    },
  };
}

const PAGE_CLOCK = Symbol.for('agentic-report.clock');

/**
 * Часы этой страницы. Рантайм и WebGL-приёмы собраны отдельными файлами, поэтому часы живут на окне под
 * общим символом: кто спросил первым (рантайм, в самом начале), тот их и создал.
 */
export function pageClock(): PageClock {
  const holder = window as unknown as Record<symbol, PageClock | undefined>;
  const existing = holder[PAGE_CLOCK];
  if (existing !== undefined) return existing;
  const created = createClock(window as unknown as ClockHost, documentMedia());
  holder[PAGE_CLOCK] = created;
  return created;
}

/** Подписать подсистему страницы (а позже — контроллер расширения) на перемотку часов. */
export function registerTimed(timed: Timed): () => void {
  return pageClock().register(timed);
}
