/**
 * Тезис, заполняемый цветом по мере чтения (SPEC 7.1). Вступление секции `recipe="thesis"` набрано
 * приглушённым цветом текста темы, и цвет заголовков заливает его сверху вниз, строка за строкой, пока
 * читатель проходит тезис; прокрутка назад возвращает заливку. Один раз на странице — у тезиса, не у
 * обычного текста (`vocabulary-use.md`: никакой раскраски прозы по словам). Текст не трогается: заливка —
 * фон, обрезанный по буквам. Без движения, при `motion: none` и в печати тезис залит сразу.
 */

import { pageClock, progressOverride } from './clock.js';
import { contentElements } from './features.js';

/** Доля заливки по положению тезиса: начинается, когда его верх на 85 % высоты окна, кончается у 45 %. */
export function thesisFill(top: number, height: number, viewport: number): number {
  const start = viewport * 0.85;
  const end = viewport * 0.45 - height;
  const span = Math.max(1, start - end);
  return Math.min(1, Math.max(0, (start - top) / span));
}

export function installThesisFill(page: HTMLElement, still: MediaQueryList): () => void {
  const leads = contentElements<HTMLElement>(
    page,
    'section[data-semantic="section"][data-recipe="thesis"] > .semantic-lead',
  );
  if (leads.length === 0 || still.matches) return () => undefined;
  const clock = pageClock();
  let frame = 0;
  const paint = (): void => {
    frame = 0;
    for (const lead of leads) {
      const section = lead.parentElement;
      const override = section === null ? undefined : progressOverride(section);
      const box = lead.getBoundingClientRect();
      const fill = override ?? thesisFill(box.top, box.height, window.innerHeight);
      lead.style.setProperty('--thesis-fill', fill.toFixed(4));
    }
  };
  const schedule = (): void => {
    if (frame === 0) frame = clock.frame(paint);
  };
  for (const lead of leads) lead.setAttribute('data-thesis-fill', '');
  const unregister = clock.register({ at: paint });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  paint();
  return () => {
    unregister();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
    for (const lead of leads) {
      lead.removeAttribute('data-thesis-fill');
      lead.style.removeProperty('--thesis-fill');
    }
  };
}
