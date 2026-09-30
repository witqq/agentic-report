/*! agentic-report script: typography */
/** Text techniques: the word swap (`:swap`), typed line (`:typing`) and hand-drawn mark (`:mark`). */

import { pageClock } from '../clock.js';
import { type Cleanup, provideFeature } from '../features.js';
import { pace, timed, whenVisible } from '../technique-timing.js';
import { installPending } from '../technique-pending.js';

const clock = pageClock();

// ——— :swap ———

/** Слово держится такт и сменяется; после последнего слова возвращается написанное, и замена стоит. */
export const SWAP_BEAT_MS = 1200;

export function installSwap(element: HTMLElement): Cleanup {
  const words = [...element.querySelectorAll<HTMLElement>('[data-swap-word]')];
  if (words.length < 2) return () => undefined;
  element.setAttribute('data-swap-live', '');
  let start: number | undefined;
  const show = (index: number): void => {
    for (const [at, word] of words.entries()) word.toggleAttribute('data-current', at === index);
  };
  const run = timed((now) => {
    if (start === undefined) {
      show(0);
      return false;
    }
    const beat = Math.floor(Math.max(0, now - start) / (SWAP_BEAT_MS * pace()));
    show(beat >= words.length ? 0 : beat);
    return beat < words.length;
  });
  show(0);
  const unwatch = whenVisible(element, () => {
    start = clock.now();
    run.start();
  });
  return () => {
    unwatch();
    run.stop();
    element.removeAttribute('data-swap-live');
    for (const word of words) word.removeAttribute('data-current');
  };
}

// ——— :typing ———

/** Набор строки длится не дольше полутора секунд: короткая строка — не повод ждать. */
export const TYPING_CHAR_MS = 45;
export const TYPING_LIMIT_MS = 1500;

export function installTyping(element: HTMLElement): Cleanup {
  const text = element.firstChild;
  if (element.childNodes.length !== 1 || !(text instanceof Text)) return () => undefined;
  const length = text.data.length;
  let widths: number[] = [];
  let start: number | undefined;
  let active = true;
  const measure = (): boolean => {
    const range = document.createRange();
    range.selectNodeContents(text);
    // Строка, перенесённая на две, набиралась бы с разрывом: такая остаётся целой.
    if (range.getClientRects().length > 1) return false;
    const left = element.getBoundingClientRect().left;
    widths = Array.from({ length: length + 1 }, (_, index) => {
      if (index === 0) return 0;
      range.setStart(text, 0);
      range.setEnd(text, index);
      return range.getBoundingClientRect().right - left;
    });
    return true;
  };
  if (!measure()) return () => undefined;
  // `waiting` — строка ждёт показа, `typing` — набор начался; перемотка видит, с какого момента он идёт.
  element.dataset.typingLive = 'waiting';
  const charMs = (): number => Math.min(TYPING_CHAR_MS, TYPING_LIMIT_MS / Math.max(1, length));
  const render = (now: number): boolean => {
    const typed =
      start === undefined
        ? 0
        : Math.min(length, Math.floor(Math.max(0, now - start) / (charMs() * pace())));
    element.style.setProperty('--typing-shown', `${widths[typed] ?? 0}px`);
    element.toggleAttribute('data-typing-done', typed >= length);
    return typed < length;
  };
  const run = timed(render);
  render(clock.now());
  const remeasure = (): void => {
    if (!active) return;
    const state = element.dataset.typingLive ?? 'waiting';
    element.removeAttribute('data-typing-live');
    if (measure()) element.dataset.typingLive = state;
    render(clock.now());
  };
  void document.fonts.ready.then(remeasure);
  window.addEventListener('resize', remeasure);
  // Показ меряется по абзацу строки: обрезанная до нуля строка для наблюдателя пересечений не видна.
  const unwatch = whenVisible(
    element.parentElement ?? element,
    () => {
      start = clock.now();
      if (element.hasAttribute('data-typing-live')) element.dataset.typingLive = 'typing';
      run.start();
    },
    0.5,
  );
  return () => {
    active = false;
    unwatch();
    run.stop();
    window.removeEventListener('resize', remeasure);
    element.removeAttribute('data-typing-live');
    element.removeAttribute('data-typing-done');
    element.style.removeProperty('--typing-shown');
  };
}

provideFeature('swap', installSwap);
provideFeature('typing', installTyping);
provideFeature('mark', (element) => installPending(element, 'data-mark-pending', 1));
