/**
 * Общий помощник пересборки геометрии: всё, что меряет текст и раскладку (сцены, заголовки по строкам,
 * режим экранов, эффекты расширений), пересобирается по одним и тем же поводам и по одним правилам:
 *
 * - повод — смена ширины окна (изменение одной высоты, как у панели адреса телефона и `svh`, геометрию
 *   текста не меняет и пересборки не зовёт), загрузка шрифтов, конец входа первого экрана и глав
 *   (`announceGeometryChange('entrance')`), возвращение на вкладку;
 * - поводы одного кадра сливаются в одну пересборку;
 * - защита от цикла: больше `GEOMETRY_REBUILD_LIMIT` пересборок за секунду часов — цикл, следующие ждут
 *   конца секунды, а в консоль уходит одно предупреждение;
 * - прокрутка сохраняется: пересборка, которая меняет высоту того, что выше экрана (смена пропорций
 *   сцены), не сдвигает то, что читатель видит, — позиция держится за элемент у верхнего края экрана.
 *
 * Модуль собирается и в рантайм, и в файл эффектов: у каждого свои подписчики, а повод «вход закончен»
 * доходит до обоих событием документа.
 */

import { pageClock } from './clock.js';

export const GEOMETRY_EVENT = 'agentic-report:geometry';
export const GEOMETRY_REBUILD_LIMIT = 6;

export type GeometryReason = 'resize' | 'fonts' | 'entrance' | 'visibility' | 'content' | 'aspect';

export interface GeometryWatchOptions {
  /** Имя подписчика для предупреждения о цикле. */
  readonly name: string;
  /** Держать то, что видит читатель, на месте, пока идёт пересборка. */
  readonly keepScroll?: boolean;
}

export interface GeometryWatch {
  /** Попросить пересборку по своему поводу (например, сцена сменила пропорции). */
  readonly request: (reason: GeometryReason) => void;
  readonly stop: () => void;
  /** Сколько раз защита от цикла отложила пересборку. */
  readonly loopGuard: () => number;
}

/** Сообщить всем подписчикам документа, что геометрия изменилась (например, вход первого экрана закончен). */
export function announceGeometryChange(reason: GeometryReason): void {
  document.dispatchEvent(new CustomEvent(GEOMETRY_EVENT, { detail: { reason } }));
}

/**
 * Сохранить прокрутку вокруг изменения раскладки: запоминается первый элемент под верхним краем экрана
 * и его отступ, после изменения окно сдвигается так, чтобы отступ остался прежним.
 */
export function keepScrollAround(change: () => void): void {
  const anchor = scrollAnchor();
  const before = anchor?.getBoundingClientRect().top;
  change();
  if (anchor === undefined || before === undefined || !anchor.isConnected) return;
  const delta = anchor.getBoundingClientRect().top - before;
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: 'instant' });
}

function scrollAnchor(): Element | undefined {
  if (window.scrollY <= 0) return undefined;
  const candidates = document.querySelectorAll('article > *, article > section > *');
  for (const candidate of candidates) {
    const box = candidate.getBoundingClientRect();
    if (box.bottom > 0 && box.height > 0) return candidate;
  }
  return undefined;
}

/**
 * Защита от цикла: пропускает не больше `limit` пересборок за секунду часов. `admit(now)` отвечает, можно
 * ли пересобрать сейчас, и если нельзя — через сколько миллисекунд откроется следующее окно.
 */
export function rebuildGate(limit = GEOMETRY_REBUILD_LIMIT): {
  readonly admit: (now: number) => { readonly admitted: boolean; readonly waitMs: number };
} {
  let windowStart = Number.NEGATIVE_INFINITY;
  let count = 0;
  return {
    admit: (now) => {
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      return count <= limit
        ? { admitted: true, waitMs: 0 }
        : { admitted: false, waitMs: Math.max(0, 1000 - (now - windowStart)) + 1 };
    },
  };
}

export function watchGeometry(
  rebuild: (reason: GeometryReason) => void,
  options: GeometryWatchOptions,
): GeometryWatch {
  const clock = pageClock();
  const abort = new AbortController();
  let width = document.documentElement.clientWidth;
  let pending: GeometryReason | undefined;
  let frame = 0;
  const gate = rebuildGate();
  let guarded = 0;
  let deferred = 0;
  let stopped = false;

  const run = (): void => {
    frame = 0;
    const reason = pending;
    pending = undefined;
    if (reason === undefined || stopped) return;
    const verdict = gate.admit(clock.now());
    if (!verdict.admitted) {
      guarded += 1;
      if (guarded === 1)
        console.warn(
          `[agentic-report] ${options.name} rebuilt its geometry more than ${GEOMETRY_REBUILD_LIMIT} times in a second (${reason}); the next rebuild waits.`,
        );
      // Отложенная пересборка — одна на конец окна защиты: цикл не крутится, а последняя правка не теряется.
      if (deferred === 0)
        deferred = clock.later(() => {
          deferred = 0;
          request(reason);
        }, verdict.waitMs);
      return;
    }
    if (options.keepScroll === true) keepScrollAround(() => rebuild(reason));
    else rebuild(reason);
  };
  const request = (reason: GeometryReason): void => {
    if (stopped) return;
    pending ??= reason;
    if (frame === 0) frame = clock.frame(run);
  };

  window.addEventListener(
    'resize',
    () => {
      const next = document.documentElement.clientWidth;
      if (next === width) return;
      width = next;
      request('resize');
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    GEOMETRY_EVENT,
    (event) => {
      const reason = (event as CustomEvent<{ readonly reason?: GeometryReason }>).detail?.reason;
      request(reason ?? 'content');
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') request('visibility');
    },
    { signal: abort.signal },
  );
  document.fonts.addEventListener('loadingdone', () => request('fonts'), {
    signal: abort.signal,
  });
  void document.fonts.ready.then(() => request('fonts'));

  return {
    request,
    stop: () => {
      stopped = true;
      abort.abort();
      if (frame !== 0) clock.cancelFrame(frame);
      if (deferred !== 0) clock.cancelLater(deferred);
    },
    loopGuard: () => guarded,
  };
}
