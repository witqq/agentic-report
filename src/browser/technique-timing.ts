/**
 * Время и показ приёмов словаря: темп темы, «один раз, когда показался», приём как функция времени часов
 * страницы и слежение за прокруткой. Модуль без побочных действий: им пользуются ядро и модули
 * возможностей.
 */

import { pageClock } from './clock.js';
import type { Cleanup } from './features.js';

const clock = pageClock();
const root = document.documentElement;

/** Темп темы умножает длительности всех приёмов. */
export function pace(): number {
  return Number(getComputedStyle(root).getPropertyValue('--motion-pace')) || 1;
}

/** Один раз, когда элемент показался на экране хотя бы на долю `threshold`. */
export function whenVisible(element: Element, callback: () => void, threshold = 0.6): Cleanup {
  if (typeof window.IntersectionObserver !== 'function') {
    callback();
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { threshold },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Приём как функция времени: `render(now)` рисует состояние момента и отвечает, идёт ли он ещё. Кадры
 * запрашиваются, пока приём идёт; перемотка часов рисует тот же момент заново.
 */
export function timed(render: (now: number) => boolean): {
  readonly start: () => void;
  stop: Cleanup;
} {
  let frame = 0;
  const step = (now: number): void => {
    frame = 0;
    if (render(now)) frame = clock.frame(step);
  };
  const unregister = clock.register({ at: (seconds) => void render(seconds * 1000) });
  return {
    // Первый кадр рисуется сразу: в ручных часах кадры идут только по перемотке.
    start: () => {
      if (render(clock.now()) && frame === 0) frame = clock.frame(step);
    },
    stop: () => {
      unregister();
      if (frame !== 0) clock.cancelFrame(frame);
      frame = 0;
    },
  };
}

// ——— Липкое оглавление и подписи по краям ———

/** Текущая глава — последняя, чей заголовок поднялся выше трети экрана. */
export function currentChapter(sections: readonly HTMLElement[]): number {
  const line = window.innerHeight * 0.35;
  let current = 0;
  for (const [index, section] of sections.entries())
    if (section.getBoundingClientRect().top <= line) current = index;
  return current;
}

export function watchScroll(update: () => void): Cleanup {
  let frame = 0;
  const schedule = (): void => {
    if (frame === 0)
      frame = clock.frame(() => {
        frame = 0;
        update();
      });
  };
  const unregister = clock.register({ at: update });
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    unregister();
    document.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
  };
}
