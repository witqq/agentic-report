/*! agentic-report script: slides */
/** The slide deck of `layout: slides` and the steps of its `appear` blocks. */

import { ARROW_LEFT_ICON, ARROW_RIGHT_ICON } from '../../iconography.js';
import type { PackageStrings } from '../../localization.js';
import { createDeckController } from '../deck-controller.js';
import { type Destroyable, provideFeature } from '../features.js';
import { hashTarget } from '../hash-target.js';
import { browserIcon } from '../icon.js';
import { asUiButton } from '../ui.js';

const root = document.documentElement;

/**
 * Презентация. Страница `layout: slides` показывается слайдами на весь экран: клавиатура, щелчок и
 * касание листают слайды и шаги, адрес `#/слайд/шаг` открывает любой из них, а API
 * `window.agenticSlides` делает то же для записи. Длительность каждого перехода фиксирована и
 * объявлена атрибутом корня; пока переход идёт, `data-slide-state` равен `moving`, по его окончании —
 * `settled`, и приходит событие `agentic-slides:settled`. Вид `?view=film` убирает оболочку, вид
 * `?view=presenter` показывает заметки докладчика. При уменьшенном движении шаги слайда открыты
 * сразу, а переходов нет. Смену слайдов ведёт общий контроллер колоды (`../deck-controller.ts`);
 * колоды внутри страницы (`deck`) листаются своими клавишами, и эти события презентация пропускает.
 */
function createSlidesController(
  page: HTMLElement,
  motion: MediaQueryList,
  strings: () => PackageStrings,
): Destroyable | undefined {
  if (root.dataset.layout !== 'slides') return undefined;
  const slides = [...page.querySelectorAll<HTMLElement>('article > section[data-slide]')];
  if (slides.length === 0) return undefined;
  const abort = new AbortController();
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'film' || view === 'presenter') root.dataset.view = view;
  root.setAttribute('data-slides-active', '');

  const controls = document.createElement('nav');
  controls.className = 'slide-controls';
  controls.setAttribute('aria-label', strings().slides);
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'slide-control';
  asUiButton(previous, 'secondary', 'md', true);
  previous.setAttribute('aria-label', strings().previousSlide);
  previous.append(browserIcon(ARROW_LEFT_ICON));
  const counter = document.createElement('span');
  counter.className = 'slide-counter ui-meta';
  counter.setAttribute('aria-live', 'polite');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'slide-control';
  asUiButton(next, 'secondary', 'md', true);
  next.setAttribute('aria-label', strings().nextSlide);
  next.append(browserIcon(ARROW_RIGHT_ICON));
  controls.append(previous, counter, next);
  document.body.append(controls);

  const deck = createDeckController({
    host: root,
    slides,
    motion,
    onShow: ({ slide, step }) => {
      counter.textContent = strings().slideCounter(slide + 1, slides.length);
      previous.disabled = slide === 0 && step === 0;
      next.disabled = slide === slides.length - 1 && step === deck.stepsOf(slide);
      const hash = `#/${slide + 1}/${step}`;
      if (window.location.hash !== hash) history.replaceState(null, '', hash);
    },
    onSettle: ({ slide, step }) =>
      document.dispatchEvent(
        new CustomEvent('agentic-slides:settled', { detail: { slide: slide + 1, step } }),
      ),
  });
  const { show, forward, backward, stepsOf } = deck;
  const fromHash = (instant: boolean): void => {
    const match = /^#\/(\d+)(?:\/(\d+))?$/u.exec(window.location.hash);
    if (match !== null) {
      show({ slide: Number(match[1]) - 1, step: Number(match[2] ?? '0') }, { instant });
      return;
    }
    const target = hashTarget(window.location.hash);
    const owner = target === undefined ? -1 : slides.findIndex((slide) => slide.contains(target));
    show({ slide: owner < 0 ? 0 : owner, step: 0 }, { instant });
  };

  previous.addEventListener('click', backward, { signal: abort.signal });
  next.addEventListener('click', forward, { signal: abort.signal });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable], [role="tablist"], dialog[open], [data-deck]',
        )
      )
        return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(event.key)) {
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          target instanceof Element &&
          target.closest('button, a, summary')
        )
          return;
        event.preventDefault();
        forward();
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(event.key)) {
        event.preventDefault();
        backward();
      } else if (event.key === 'Home') {
        event.preventDefault();
        show({ slide: 0, step: 0 });
      } else if (event.key === 'End') {
        event.preventDefault();
        show({ slide: slides.length - 1, step: stepsOf(slides.length - 1) });
      }
    },
    { signal: abort.signal },
  );
  page.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-slide]') === null) return;
      if (target.closest('[data-deck]') !== null) return;
      if (
        target.closest(
          'a, button, input, textarea, select, label, summary, details, video, [data-compare-stage], [data-review-highlight-marker], [role="tab"]',
        )
      )
        return;
      if ((window.getSelection()?.toString() ?? '') !== '') return;
      forward();
    },
    { signal: abort.signal },
  );
  let touchStart: { readonly x: number; readonly y: number } | undefined;
  page.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
    },
    { signal: abort.signal },
  );
  page.addEventListener(
    'pointerup',
    (event) => {
      if (touchStart === undefined || event.pointerType !== 'touch') return;
      // A deck inside the slide takes its own swipes.
      if (event.target instanceof Element && event.target.closest('[data-deck]') !== null) {
        touchStart = undefined;
        return;
      }
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = undefined;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) forward();
      else backward();
    },
    { signal: abort.signal },
  );
  window.addEventListener('hashchange', () => fromHash(false), { signal: abort.signal });
  motion.addEventListener('change', () => show(deck.state(), { instant: true }), {
    signal: abort.signal,
  });

  const api = {
    get count(): number {
      return slides.length;
    },
    state: (): {
      slide: number;
      step: number;
      steps: number;
      duration: number;
      settled: boolean;
    } => ({
      slide: deck.state().slide + 1,
      step: deck.state().step,
      steps: stepsOf(deck.state().slide),
      duration: deck.duration(),
      settled: deck.isSettled(),
    }),
    goto: (slide: number, step = 0): void => show({ slide: slide - 1, step }),
    next: forward,
    previous: backward,
    durationOf: (slide: number): number => deck.durationOf(slide - 1),
    settled: deck.settled,
  };
  Reflect.set(window, 'agenticSlides', api);
  fromHash(true);

  return {
    destroy: () => {
      abort.abort();
      deck.destroy();
      controls.remove();
      root.removeAttribute('data-slides-active');
      Reflect.deleteProperty(window, 'agenticSlides');
    },
  };
}

provideFeature('slides', createSlidesController);
