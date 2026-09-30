/*! agentic-report script: tabs */
/**
 * Tabs (`:::tabs` and the view switcher of a diagram): selection by click and keys with a view
 * transition, and the vertical tab list of a wide screen.
 */

import { provideFeature } from '../features.js';
import { stillMotionQuery } from '../motion-level.js';
import { activateTab, tabControls } from '../tab-panels.js';
import { switchWithTransition } from '../view-transitions.js';

const reducedMotion = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
const wide = window.matchMedia('(min-width: 57rem)');

/** Выбор читателя меняет вкладку переходом вида; смена вида раскладкой схемы идёт мгновенно. */
function switchTab(control: HTMLButtonElement, moveFocus: boolean): void {
  const from = control
    .closest<HTMLElement>('[data-tabs]')
    ?.querySelector<HTMLElement>(':scope > [data-tab-panel]:not([hidden])');
  const to = document.getElementById(control.getAttribute('aria-controls') ?? '');
  switchWithTransition(from, to, reducedMotion, () => activateTab(control, moveFocus));
}

function tabKey(event: KeyboardEvent, tab: HTMLButtonElement): void {
  const controls = tabControls(tab);
  const current = controls.indexOf(tab);
  const next =
    event.key === 'ArrowRight'
      ? controls[(current + 1) % controls.length]
      : event.key === 'ArrowLeft'
        ? controls[(current - 1 + controls.length) % controls.length]
        : event.key === 'Home'
          ? controls[0]
          : controls.at(-1);
  if (next !== undefined) {
    event.preventDefault();
    switchTab(next, true);
  }
}

// ——— Вертикальные вкладки ———

function syncTabOrientation(page: ParentNode): void {
  for (const list of page.querySelectorAll<HTMLElement>(
    '[data-tabs][data-orientation="vertical"] > [role="tablist"]',
  )) {
    if (wide.matches) list.setAttribute('aria-orientation', 'vertical');
    else list.removeAttribute('aria-orientation');
  }
}

function onVerticalTabKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  const list = tab?.closest<HTMLElement>('[role="tablist"]');
  if (tab === null || tab === undefined || list?.getAttribute('aria-orientation') !== 'vertical')
    return;
  const controls = [...list.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const current = controls.indexOf(tab);
  const next =
    controls[(current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length];
  if (next === undefined) return;
  event.preventDefault();
  next.click();
  next.focus();
}

provideFeature('tabs', {
  select: switchTab,
  key: tabKey,
  orientation: syncTabOrientation,
  verticalKey: onVerticalTabKey,
});
