/*! agentic-report script: edition */
/**
 * Слой изменений с прошлой редакции (`build --since`). Пометки, вставки, удаления и призраки запечены в
 * страницу на сборке; этот файл только управляет ими: переключатель «Показывать изменения» (включён при
 * открытии, состояние живёт в разметке открытой страницы и не пишется ни в хранилище, ни в адрес),
 * кнопки «Предыдущее» и «Следующее» и список изменений — неблокирующая панель на компьютере, нижний
 * лист на телефоне. Переход к изменению раскрывает свёрнутые блоки вокруг него, ставит на него фокус и
 * с обычным движением на секунду подсвечивает его по часам страницы; при уменьшенном движении прокрутка
 * мгновенная и подсветки нет.
 *
 * Модуль — возможность страницы `edition` (`src/page-features.ts`): он входит только в скрипт страницы со
 * слоем изменений и стартует после общего рантайма, как движок эффектов и контроллер островов. События ловятся на документе и
 * относятся к языковой версии, в которой случились, поэтому смена языка не требует переустановки.
 */

import { pageClock } from './clock.js';
import { stillMotionQuery } from './motion-level.js';
import { openAround } from './reading-position.js';

const INSTALLED = Symbol.for('agentic-report.edition-layer');
const FLASH_MS = 1000;

interface PageState {
  current: number;
  opener?: HTMLElement;
  flash?: { readonly element: HTMLElement; readonly handle: number } | undefined;
}

function installEditionLayer(): void {
  const holder = window as unknown as Record<symbol, boolean | undefined>;
  if (holder[INSTALLED] === true) return;
  holder[INSTALLED] = true;
  const clock = pageClock();
  const mobileList = window.matchMedia('(max-width: 56.99rem)');
  const still = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
  const states = new WeakMap<HTMLElement, PageState>();

  const stateOf = (page: HTMLElement): PageState => {
    let state = states.get(page);
    if (state === undefined) {
      state = { current: -1 };
      states.set(page, state);
    }
    return state;
  };
  const dialogOf = (page: HTMLElement): HTMLDialogElement | null =>
    page.querySelector<HTMLDialogElement>('[data-edition-dialog]');
  const entries = (page: HTMLElement): HTMLAnchorElement[] => [
    ...(dialogOf(page)?.querySelectorAll<HTMLAnchorElement>('[data-edition-jump]') ?? []),
  ];
  const syncExpanded = (page: HTMLElement): void => {
    page
      .querySelector('[data-edition-list-toggle]')
      ?.setAttribute('aria-expanded', String(dialogOf(page)?.open === true));
  };
  const apply = (page: HTMLElement, on: boolean): void => {
    page.dataset.editionLayer = on ? 'on' : 'off';
    page.querySelector('[data-edition-layer-toggle]')?.setAttribute('aria-checked', String(on));
  };

  const openList = (page: HTMLElement, from: HTMLElement): void => {
    const dialog = dialogOf(page);
    if (dialog === null) return;
    const state = stateOf(page);
    state.opener = from;
    if (!dialog.open) {
      if (mobileList.matches) dialog.showModal();
      else dialog.show();
    }
    syncExpanded(page);
    const active = state.current >= 0 ? entries(page)[state.current] : undefined;
    (active ?? dialog.querySelector<HTMLElement>('[data-edition-close]'))?.focus({
      preventScroll: true,
    });
  };

  const closeList = (page: HTMLElement, restoreFocus: boolean): void => {
    const dialog = dialogOf(page);
    if (dialog?.open !== true) return;
    dialog.close();
    syncExpanded(page);
    if (restoreFocus) stateOf(page).opener?.focus({ preventScroll: true });
  };

  const jump = (page: HTMLElement, index: number): void => {
    const link = entries(page)[index];
    if (link === undefined) return;
    const state = stateOf(page);
    state.current = index;
    const href = link.getAttribute('href') ?? '';
    closeList(page, false);
    // Слайд открывается своим адресом: презентация сама показывает нужный слайд и шаг.
    if (href.startsWith('#/')) {
      window.location.hash = href;
      return;
    }
    const target = document.getElementById(href.slice(1));
    if (target === null || !page.contains(target)) return;
    if (target.closest('[data-edition-removed]') !== null && page.dataset.editionLayer === 'off')
      apply(page, true);
    openAround(target);
    target.scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' });
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    if (state.flash !== undefined) {
      clock.cancelLater(state.flash.handle);
      delete state.flash.element.dataset.editionFlash;
      state.flash = undefined;
    }
    if (still.matches) return;
    target.dataset.editionFlash = '';
    state.flash = {
      element: target,
      handle: clock.later(() => {
        delete target.dataset.editionFlash;
        state.flash = undefined;
      }, FLASH_MS),
    };
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const page = target.closest<HTMLElement>('[data-localized-page-variant]');
    if (page === null) return;
    if (target.closest('[data-edition-layer-toggle]') !== null) {
      apply(page, page.dataset.editionLayer === 'off');
      return;
    }
    const step = target.closest<HTMLElement>('[data-edition-step]');
    if (step !== null) {
      const count = entries(page).length;
      if (count === 0) return;
      const current = stateOf(page).current;
      const forward = step.dataset.editionStep !== 'previous';
      jump(
        page,
        forward ? (current + 1) % count : current < 0 ? count - 1 : (current - 1 + count) % count,
      );
      return;
    }
    const open = target.closest<HTMLElement>(
      '[data-edition-open-list], [data-edition-list-toggle]',
    );
    if (open !== null) {
      if (dialogOf(page)?.open === true && open.matches('[data-edition-list-toggle]'))
        closeList(page, true);
      else openList(page, open);
      return;
    }
    if (target.closest('[data-edition-close]') !== null) {
      closeList(page, true);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('[data-edition-jump]');
    if (link !== null) {
      event.preventDefault();
      jump(page, entries(page).indexOf(link));
    }
  });
  // Список закрылся сам (Escape у листа на телефоне): кнопка панели узнаёт об этом.
  document.addEventListener(
    'close',
    (event) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || !dialog.matches('[data-edition-dialog]'))
        return;
      const page = dialog.closest<HTMLElement>('[data-localized-page-variant]');
      if (page !== null) syncExpanded(page);
    },
    true,
  );
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || mobileList.matches) return;
    const dialog = document.querySelector<HTMLDialogElement>('[data-edition-dialog][open]');
    const page = dialog?.closest<HTMLElement>('[data-localized-page-variant]');
    if (page !== null && page !== undefined) closeList(page, true);
  });
}

installEditionLayer();
