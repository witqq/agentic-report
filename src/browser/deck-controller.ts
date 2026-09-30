/**
 * The slide machine shared by the presentation page (`layout: slides`) and a deck inside a document: which
 * slide and step are shown, the transition between them and when it settles. It writes its state on its
 * host — the page root for a presentation, the deck element for a deck — so several decks on one page run
 * independently. Controls, keys, the address and a global API belong to the caller.
 */

import { pageClock } from './clock.js';

const clock = pageClock();

/** Длительность перехода каждого вида при темпе темы «спокойно»; темп темы умножает её. */
const SLIDE_TRANSITION_MS: Readonly<Record<string, number>> = {
  fade: 420,
  push: 520,
  wipe: 520,
  zoom: 460,
  none: 0,
};
/** Длительность появления шага слайда при темпе «спокойно». */
const SLIDE_STEP_MS = 320;

export interface SlideState {
  readonly slide: number;
  readonly step: number;
}

export interface DeckController {
  readonly show: (target: SlideState, options?: { readonly instant?: boolean }) => void;
  readonly forward: () => void;
  readonly backward: () => void;
  readonly state: () => SlideState;
  readonly stepsOf: (index: number) => number;
  readonly durationOf: (index: number) => number;
  readonly duration: () => number;
  readonly isSettled: () => boolean;
  readonly settled: () => Promise<void>;
  readonly destroy: () => void;
}

/**
 * Shows one slide of `slides` at a time on `host`. Each change declares its fixed duration on the host
 * (`--slide-duration`, `data-slide-duration`); while it runs `data-slide-state` is `moving`, then
 * `settled`. Under reduced motion every step is open and nothing moves.
 */
export function createDeckController(options: {
  readonly host: HTMLElement;
  readonly slides: readonly HTMLElement[];
  readonly motion: MediaQueryList;
  readonly onShow?: (state: SlideState) => void;
  readonly onSettle?: (state: SlideState) => void;
}): DeckController {
  const { host, slides, motion } = options;
  const pace = (): number =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--motion-pace')) || 1;
  const stepsOf = (index: number): number =>
    motion.matches ? 0 : Number(slides[index]?.dataset.slideSteps ?? '0');
  const transitionOf = (index: number): string => slides[index]?.dataset.slideTransition ?? 'fade';
  const durationOf = (index: number): number =>
    motion.matches ? 0 : Math.round((SLIDE_TRANSITION_MS[transitionOf(index)] ?? 0) * pace());

  let state: SlideState = { slide: 0, step: 0 };
  let timer = 0;
  let settledWaiters: Array<() => void> = [];
  const settle = (): void => {
    timer = 0;
    for (const slide of slides) slide.removeAttribute('data-slide-leaving');
    host.dataset.slideState = 'settled';
    for (const resolve of settledWaiters) resolve();
    settledWaiters = [];
    options.onSettle?.(state);
  };
  const show = (target: SlideState, showOptions: { readonly instant?: boolean } = {}): void => {
    const slide = Math.min(slides.length - 1, Math.max(0, target.slide));
    const step = Math.min(stepsOf(slide), Math.max(0, target.step));
    const changedSlide = slide !== state.slide;
    const changedStep = step !== state.step;
    const previousSlide = state.slide;
    state = { slide, step };
    if (timer !== 0) clock.cancelLater(timer);
    for (const [index, element] of slides.entries()) {
      element.toggleAttribute('data-slide-current', index === slide);
      element.toggleAttribute(
        'data-slide-leaving',
        changedSlide && index === previousSlide && !showOptions.instant,
      );
      element.setAttribute('aria-hidden', String(index !== slide));
      if (index !== slide) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    }
    const current = slides[slide];
    for (const appear of current?.querySelectorAll<HTMLElement>('[data-step]') ?? []) {
      // A step of a deck inside this slide belongs to that deck.
      if (appear.closest('[data-slide]') !== current) continue;
      appear.toggleAttribute('data-shown', motion.matches || Number(appear.dataset.step) <= step);
    }
    const duration = showOptions.instant
      ? 0
      : changedSlide
        ? durationOf(slide)
        : changedStep && !motion.matches
          ? Math.round(SLIDE_STEP_MS * pace())
          : 0;
    host.style.setProperty('--slide-duration', `${duration}ms`);
    host.dataset.slideDuration = String(duration);
    options.onShow?.(state);
    host.dataset.slideState = 'moving';
    if (duration === 0) settle();
    else timer = clock.later(settle, duration);
  };
  const forward = (): void => {
    if (state.step < stepsOf(state.slide)) show({ slide: state.slide, step: state.step + 1 });
    else if (state.slide < slides.length - 1) show({ slide: state.slide + 1, step: 0 });
  };
  const backward = (): void => {
    if (state.step > 0) show({ slide: state.slide, step: state.step - 1 });
    else if (state.slide > 0) show({ slide: state.slide - 1, step: stepsOf(state.slide - 1) });
  };
  return {
    show,
    forward,
    backward,
    state: () => state,
    stepsOf,
    durationOf,
    duration: () => Number(host.dataset.slideDuration ?? '0'),
    isSettled: () => host.dataset.slideState === 'settled',
    settled: () =>
      host.dataset.slideState === 'settled'
        ? Promise.resolve()
        : new Promise((resolve) => settledWaiters.push(resolve)),
    destroy: () => {
      if (timer !== 0) clock.cancelLater(timer);
      host.removeAttribute('data-slide-state');
      host.removeAttribute('data-slide-duration');
      host.style.removeProperty('--slide-duration');
      for (const slide of slides) {
        slide.removeAttribute('data-slide-current');
        slide.removeAttribute('data-slide-leaving');
        slide.removeAttribute('aria-hidden');
        slide.removeAttribute('inert');
      }
    },
  };
}
