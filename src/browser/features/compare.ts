/*! agentic-report script: compare */
/** Before/after comparison (`:::compare`): the range, the pointer and a sideways finger move the border. */

import { provideFeature } from '../features.js';

/** Граница «до/после» стоит там, куда её поставил ползунок; указатель двигает тот же ползунок. */
function setComparePosition(range: HTMLInputElement, value: number): void {
  const position = Math.min(100, Math.max(0, Math.round(value)));
  range.value = String(position);
  range
    .closest<HTMLElement>('[data-compare]')
    ?.style.setProperty('--compare-position', `${position}%`);
}

function pointerDown(event: PointerEvent): void {
  // Касание ведут события касаний ниже: Safari на телефоне отменяет указатель, едва жест похож на
  // прокрутку страницы, и перетаскивание по картинке обрывалось.
  if (!(event.target instanceof Element) || event.button !== 0 || event.pointerType === 'touch')
    return;
  const stage = event.target.closest<HTMLElement>('[data-compare-stage]');
  const range = stage?.parentElement?.querySelector<HTMLInputElement>('[data-compare-range]');
  if (stage === undefined || stage === null || range === null || range === undefined) return;
  event.preventDefault();
  const follow = (moving: PointerEvent): void => {
    const box = stage.getBoundingClientRect();
    if (box.width <= 0) return;
    setComparePosition(range, ((moving.clientX - box.left) / box.width) * 100);
  };
  follow(event);
  // Захват указателя на телефоне может не состояться (Safari отказывает, если касание уже отдано
  // прокрутке), поэтому движение слушает окно, а не сцена: перетаскивание работает и без захвата.
  try {
    stage.setPointerCapture(event.pointerId);
  } catch {
    // Без захвата окно всё равно получает движение этого указателя.
  }
  const move = (moving: PointerEvent): void => {
    if (moving.pointerId === event.pointerId) follow(moving);
  };
  const stop = (ending: PointerEvent): void => {
    if (ending.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

/**
 * Перетаскивание границы сравнения пальцем. Жест, который начался вбок, принадлежит сравнению: его
 * движение не прокручивает страницу. Жест, начавшийся вверх или вниз, остаётся прокруткой.
 */
function touchStart(event: TouchEvent): void {
  if (!(event.target instanceof Element) || event.touches.length !== 1) return;
  const stage = event.target.closest<HTMLElement>('[data-compare-stage]');
  const range = stage?.parentElement?.querySelector<HTMLInputElement>('[data-compare-range]');
  const first = event.touches[0];
  if (stage === null || stage === undefined || range === null || range === undefined) return;
  if (first === undefined) return;
  const startX = first.clientX;
  const startY = first.clientY;
  let intent: 'undecided' | 'drag' | 'scroll' = 'undecided';
  const follow = (x: number): void => {
    const box = stage.getBoundingClientRect();
    if (box.width > 0) setComparePosition(range, ((x - box.left) / box.width) * 100);
  };
  const move = (moving: TouchEvent): void => {
    const touch = moving.touches[0];
    if (touch === undefined) return;
    if (intent === 'undecided') {
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx < 4 && dy < 4) return;
      intent = dx >= dy ? 'drag' : 'scroll';
    }
    if (intent !== 'drag') return;
    moving.preventDefault();
    follow(touch.clientX);
  };
  const end = (ending: TouchEvent): void => {
    if (intent === 'undecided') {
      const touch = ending.changedTouches[0];
      if (touch !== undefined) follow(touch.clientX);
    }
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', end);
    window.removeEventListener('touchcancel', end);
  };
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
}

provideFeature('compare', {
  input: (range) => setComparePosition(range, Number(range.value)),
  pointerDown,
  touchStart,
});
