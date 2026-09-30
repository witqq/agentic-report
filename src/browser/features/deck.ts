/*! agentic-report script: deck */
/** Slide decks inside a page (`deck`): each deck pages its own slides and opens on the whole screen. */

import { ARROW_LEFT_ICON, ARROW_RIGHT_ICON, SCREEN_FULL_ICON, X_ICON } from '../../iconography.js';
import type { PackageStrings } from '../../localization.js';
import { createDeckController, type DeckController } from '../deck-controller.js';
import { type Destroyable, provideFeature } from '../features.js';
import { browserIcon } from '../icon.js';
import { asUiButton } from '../ui.js';

function controlButton(label: string, icon: Parameters<typeof browserIcon>[0]): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'deck-control';
  asUiButton(button, 'secondary', 'sm', true);
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(browserIcon(icon));
  return button;
}

/** What Tab may reach inside the deck while it covers the screen. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.closest('[inert]') === null && element.getClientRects().length > 0);
}

/**
 * One deck. The stage shows the current slide; under it the previous and next buttons, the counter and
 * the full-screen button. Keys page the deck while focus is inside it; on the whole screen the space bar,
 * Enter, Backspace and a click on the slide do too. The whole screen is the Fullscreen API; where a page
 * cannot take it (a phone browser), the deck covers the window itself (`data-deck-expanded`). Either way
 * Escape leaves it, Tab stays inside, and focus returns to the full-screen button. `#deck-id/3` opens the
 * third slide.
 */
function installDeck(
  deck: HTMLElement,
  motion: MediaQueryList,
  strings: () => PackageStrings,
): Destroyable | undefined {
  const stage = deck.querySelector<HTMLElement>(':scope > [data-deck-stage]');
  const slides = [...(stage?.querySelectorAll<HTMLElement>(':scope > [data-slide]') ?? [])];
  if (stage === null || slides.length === 0) return undefined;
  const abort = new AbortController();
  const signal = abort.signal;

  const bar = document.createElement('div');
  bar.className = 'deck-controls';
  const previous = controlButton(strings().previousSlide, ARROW_LEFT_ICON);
  const counter = document.createElement('span');
  counter.className = 'deck-counter ui-meta';
  counter.setAttribute('aria-live', 'polite');
  const next = controlButton(strings().nextSlide, ARROW_RIGHT_ICON);
  const full = controlButton(strings().enterFullScreen, SCREEN_FULL_ICON);
  full.dataset.deckFullScreen = '';
  bar.append(previous, counter, next, full);
  deck.append(bar);
  stage.tabIndex = 0;
  stage.setAttribute('role', 'group');
  const titled = deck.getAttribute('aria-labelledby');
  if (titled === null) stage.setAttribute('aria-label', strings().slides);
  else stage.setAttribute('aria-labelledby', titled);

  const controller: DeckController = createDeckController({
    host: deck,
    slides,
    motion,
    onShow: ({ slide, step }) => {
      counter.textContent = strings().slideCounter(slide + 1, slides.length);
      const focused = document.activeElement;
      previous.disabled = slide === 0 && step === 0;
      next.disabled = slide === slides.length - 1 && step === controller.stepsOf(slide);
      // A button that has just become disabled drops its focus to the page; the stage keeps it in the deck.
      if (focused instanceof HTMLButtonElement && focused.disabled) stage.focus();
    },
  });
  deck.setAttribute('data-deck-active', '');

  const covering = (): boolean =>
    document.fullscreenElement === deck || deck.hasAttribute('data-deck-expanded');
  const setCovering = (on: boolean): void => {
    deck.toggleAttribute('data-deck-covering', on);
    full.setAttribute('aria-label', on ? strings().exitFullScreen : strings().enterFullScreen);
    full.title = full.getAttribute('aria-label') ?? '';
    full.replaceChildren(browserIcon(on ? X_ICON : SCREEN_FULL_ICON));
    full.setAttribute('aria-pressed', String(on));
  };
  const leave = (returnFocus = true): void => {
    if (document.fullscreenElement === deck) void document.exitFullscreen();
    else if (deck.hasAttribute('data-deck-expanded')) {
      if (deck.hasAttribute('popover')) {
        deck.hidePopover();
        deck.removeAttribute('popover');
      }
      deck.removeAttribute('data-deck-expanded');
      document.documentElement.removeAttribute('data-deck-expanded');
      setCovering(false);
      if (returnFocus) full.focus();
    }
  };
  const enter = (): void => {
    if (typeof deck.requestFullscreen === 'function' && document.fullscreenEnabled) {
      deck.requestFullscreen().then(
        () => stage.focus(),
        () => expand(),
      );
    } else expand();
  };
  // The top layer puts the deck above the top bar whatever stacking context its section makes; a browser
  // without popovers gets the fixed position alone.
  const expand = (): void => {
    if (typeof deck.showPopover === 'function') {
      deck.setAttribute('popover', 'manual');
      deck.showPopover();
    }
    deck.setAttribute('data-deck-expanded', '');
    document.documentElement.setAttribute('data-deck-expanded', '');
    setCovering(true);
    stage.focus();
  };

  previous.addEventListener('click', () => controller.backward(), { signal });
  next.addEventListener('click', () => controller.forward(), { signal });
  full.addEventListener('click', () => (covering() ? leave() : enter()), { signal });
  document.addEventListener(
    'fullscreenchange',
    () => {
      const on = document.fullscreenElement === deck;
      if (on === deck.hasAttribute('data-deck-covering')) return;
      setCovering(on);
      if (!on) full.focus();
    },
    { signal },
  );
  deck.addEventListener(
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      // The browser leaves its full screen on Escape itself; a page event still arrives where it does not.
      if (event.key === 'Escape' && covering()) {
        event.preventDefault();
        leave();
        return;
      }
      if (event.key === 'Tab' && covering()) {
        const list = focusables(deck);
        const first = list[0];
        const last = list.at(-1);
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable], [role="tablist"]')
      )
        return;
      const onControl = target instanceof Element && target.closest('button, a, summary') !== null;
      if (['ArrowRight', 'PageDown'].includes(event.key)) {
        event.preventDefault();
        controller.forward();
      } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        controller.backward();
      } else if (covering() && !onControl && [' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        controller.forward();
      } else if (covering() && event.key === 'Backspace') {
        event.preventDefault();
        controller.backward();
      } else if (event.key === 'Home') {
        event.preventDefault();
        controller.show({ slide: 0, step: 0 });
      } else if (event.key === 'End') {
        event.preventDefault();
        controller.show({ slide: slides.length - 1, step: controller.stepsOf(slides.length - 1) });
      }
    },
    { signal },
  );
  stage.addEventListener(
    'click',
    (event) => {
      if (!covering()) return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(
          'a, button, input, textarea, select, label, summary, details, video, iframe, [role="tab"]',
        )
      )
        return;
      if ((window.getSelection()?.toString() ?? '') !== '') return;
      controller.forward();
    },
    { signal },
  );
  let touchStart: { readonly x: number; readonly y: number } | undefined;
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
    },
    { signal },
  );
  stage.addEventListener(
    'pointerup',
    (event) => {
      if (touchStart === undefined || event.pointerType !== 'touch') return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = undefined;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) controller.forward();
      else controller.backward();
    },
    { signal },
  );
  motion.addEventListener('change', () => controller.show(controller.state(), { instant: true }), {
    signal,
  });

  // `#deck-id/3` opens the third slide of that deck; `#deck-id` alone keeps its first.
  const fromHash = (): void => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const match = /^(.+)\/(\d+)$/u.exec(hash);
    if (match === null || match[1] !== deck.id) return;
    controller.show({ slide: Number(match[2]) - 1, step: 0 }, { instant: true });
    deck.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', fromHash, { signal });
  controller.show({ slide: 0, step: 0 }, { instant: true });
  fromHash();

  return {
    destroy: () => {
      abort.abort();
      leave(false);
      controller.destroy();
      bar.remove();
      stage.removeAttribute('tabindex');
      stage.removeAttribute('role');
      stage.removeAttribute('aria-label');
      stage.removeAttribute('aria-labelledby');
      deck.removeAttribute('data-deck-active');
      deck.removeAttribute('data-deck-covering');
    },
  };
}

function installDecks(
  page: HTMLElement,
  motion: MediaQueryList,
  strings: () => PackageStrings,
): Destroyable | undefined {
  const decks = [...page.querySelectorAll<HTMLElement>('[data-deck]')]
    .map((deck) => installDeck(deck, motion, strings))
    .filter((deck): deck is Destroyable => deck !== undefined);
  if (decks.length === 0) return undefined;
  return {
    destroy: () => {
      for (const deck of decks) deck.destroy();
    },
  };
}

provideFeature('decks', installDecks);
