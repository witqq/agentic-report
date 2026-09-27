/**
 * Текущая строка без наведения. На устройстве без наведения (телефон, планшет) то, что на широком
 * экране отвечает на курсор — карточка-ссылка, строка шагов и хронологии, — получает `data-current`,
 * когда стоит у середины экрана: читатель видит, где он, не касаясь экрана. Отмечается одна строка —
 * ближайшая к середине. При уменьшенном движении отметка та же: это состояние, а не движение.
 */

import { pageClock } from './clock.js';

export const CURRENT_ROW_SELECTOR =
  '.semantic-card[data-linked-card], .semantic-steps > ol > li, .semantic-timeline > ol > li';

export function installCurrentRows(page: HTMLElement): () => void {
  const noHover = window.matchMedia('(hover: none)');
  const rows = [...page.querySelectorAll<HTMLElement>(CURRENT_ROW_SELECTOR)];
  if (rows.length === 0) return () => undefined;
  const clock = pageClock();
  const near = new Set<HTMLElement>();
  let observer: IntersectionObserver | undefined;
  let frame = 0;
  let marked: HTMLElement | undefined;

  const mark = (row: HTMLElement | undefined): void => {
    if (row === marked) return;
    marked?.removeAttribute('data-current');
    marked = row;
    marked?.setAttribute('data-current', '');
  };
  const choose = (): void => {
    frame = 0;
    // Середина видимой части окна — под верхней панелью, а не середина всего окна.
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const middle = (Math.max(0, top) + window.innerHeight) / 2;
    let best: HTMLElement | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const row of near) {
      const box = row.getBoundingClientRect();
      const gap =
        box.top <= middle && box.bottom >= middle
          ? 0
          : Math.min(Math.abs(box.top - middle), Math.abs(box.bottom - middle));
      if (gap < distance) {
        distance = gap;
        best = row;
      }
    }
    mark(best);
  };
  const schedule = (): void => {
    if (frame === 0) frame = clock.frame(choose);
  };
  const stop = (): void => {
    observer?.disconnect();
    observer = undefined;
    near.clear();
    window.removeEventListener('scroll', schedule);
    mark(undefined);
  };
  const start = (): void => {
    stop();
    if (!noHover.matches) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const row = entry.target as HTMLElement;
          if (entry.isIntersecting) near.add(row);
          else near.delete(row);
        }
        schedule();
      },
      { rootMargin: '-35% 0px -35% 0px', threshold: 0 },
    );
    for (const row of rows) observer.observe(row);
    window.addEventListener('scroll', schedule, { passive: true });
  };
  const unregister = clock.register({ at: choose });
  noHover.addEventListener('change', start);
  start();
  return () => {
    noHover.removeEventListener('change', start);
    unregister();
    if (frame !== 0) clock.cancelFrame(frame);
    stop();
  };
}
