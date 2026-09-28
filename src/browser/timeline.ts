/**
 * Мини-таймлайн закреплённых сцен — свой, без GSAP (его лицензия запрещает конструкторы анимаций без
 * кода). Сцена — отрезок прокрутки из N тактов; положение `position` бежит от 0 до N. Всё здесь — чистые
 * функции положения: одно положение всегда даёт одну картину, поэтому прокрутка назад восстанавливает
 * её, а перемотка часов записи детерминирована.
 */

import { PAGE_MOTION_POLICY } from '../page-motion.js';

export interface ScrubFrame {
  /** Такт, чья подпись показана: он же — последний достигнутый такт. */
  readonly caption: number;
  /** Заполнение отрезка каждого такта, 0–1: пройденные полны, текущий — по прокрутке. */
  readonly segments: readonly number[];
}

/**
 * Кадр сцены по прогрессу 0–1. Подпись такта `k` (кроме первого) появляется, когда прокручена треть его
 * отрезка, — не на самой границе, где лёгкое движение колеса мигало бы подписью. Последний такт держит
 * все отрезки заполненными.
 */
export function scrubFrame(
  progress: number,
  steps: number,
  switchAt: number = PAGE_MOTION_POLICY.scrub.captionSwitchAt,
): ScrubFrame {
  const count = Math.max(1, Math.floor(steps));
  const position = Math.min(1, Math.max(0, progress)) * count;
  const caption = Math.min(count - 1, Math.max(0, Math.floor(position - switchAt)));
  const segments = Array.from({ length: count }, (_, index) =>
    Math.min(1, Math.max(0, position - index)),
  );
  return { caption, segments };
}

/**
 * Сглаживание прогресса для текстовых тактов: показанное значение догоняет прокрутку за `durationMs`
 * (экспонента с постоянной в треть длительности — к концу длительности пройдено 95 %). Быстрая
 * прокрутка не мелькает подписями, медленная идёт вровень.
 */
export function smoothToward(
  shown: number,
  target: number,
  elapsedMs: number,
  durationMs: number = PAGE_MOTION_POLICY.scrub.smoothingMs,
): number {
  if (durationMs <= 0 || elapsedMs <= 0) return elapsedMs <= 0 ? shown : target;
  const next = shown + (target - shown) * (1 - Math.exp((-3 * elapsedMs) / durationMs));
  return Math.abs(target - next) < 0.0005 ? target : next;
}

/** Дорожка таймлайна: что рисует отрезок `[start, end)` положения при локальном прогрессе 0–1. */
export interface TimelineTrack {
  readonly start: number;
  readonly end: number;
  readonly render: (local: number) => void;
}

/** Таймлайн из дорожек: `render(position)` ставит каждую дорожку в её локальный прогресс. */
export function createTimeline(tracks: readonly TimelineTrack[]): {
  readonly render: (position: number) => void;
} {
  return {
    render: (position) => {
      for (const track of tracks) {
        const span = Math.max(1e-6, track.end - track.start);
        track.render(Math.min(1, Math.max(0, (position - track.start) / span)));
      }
    },
  };
}

/** Строки кода такта: `3`, `2-4`, `1,5-7` → номера строк с единицы. */
export function parseLineRanges(value: string | undefined): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const part of (value ?? '').split(',')) {
    const match = /^\s*(\d+)(?:-(\d+))?\s*$/u.exec(part);
    if (match === null) continue;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    for (
      let line = Math.min(from, to);
      line <= Math.max(from, to) && line - from < 10_000;
      line += 1
    )
      lines.add(line);
  }
  return lines;
}
