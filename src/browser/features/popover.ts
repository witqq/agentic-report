/*! agentic-report script: popover */
/**
 * Popovers and glossary explanations (`:::popover`, glossary references in prose and code): the panel is
 * portalled to `body` while open and placed against its trigger in the visual viewport; a glossary term
 * opens on hover and focus.
 */

import { pageClock } from '../clock.js';
import { provideFeature } from '../features.js';
import { placeSurface, visualViewportBounds } from '../overlay-position.js';

const clock = pageClock();
const popoverPortals = new Map<
  HTMLElement,
  { readonly panel: HTMLElement; readonly placeholder: Comment }
>();
const popoverPortalOwners = new WeakMap<HTMLElement, HTMLElement>();
const pendingPopoverCloses = new Map<HTMLElement, number>();
let overlayHost: HTMLElement | undefined;
let popoverPositionAbort: AbortController | undefined;
let popoverPositionFrame: number | undefined;

function closePopoversOutside(target: Element): void {
  for (const popover of document.querySelectorAll<HTMLElement>('[data-popover]')) {
    if (!popoverContains(popover, target)) closePopover(popover, false);
  }
}

function openPopover(popover: HTMLElement): void {
  cancelScheduledPopoverClose(popover);
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  const panel = popoverPanel(popover, trigger);
  if (trigger === null || panel === null || !panel.hidden) return;
  portalPopoverPanel(popover, panel);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  positionPopoverPortal(popover);
}

function closePopover(popover: HTMLElement, restoreFocus: boolean): void {
  cancelScheduledPopoverClose(popover);
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  const panel = popoverPanel(popover, trigger);
  if (trigger === null || panel === null || panel.hidden) return;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  restorePopoverPanel(popover);
  if (restoreFocus) trigger.focus();
}

function schedulePopoverClose(popover: HTMLElement): void {
  cancelScheduledPopoverClose(popover);
  const timeout = clock.later(() => {
    pendingPopoverCloses.delete(popover);
    const portal = popoverPortals.get(popover);
    if (
      popover.matches(':hover') ||
      portal?.panel.matches(':hover') === true ||
      popoverContains(popover, document.activeElement)
    ) {
      return;
    }
    closePopover(popover, false);
  }, 100);
  pendingPopoverCloses.set(popover, timeout);
}

function cancelScheduledPopoverClose(popover: HTMLElement): void {
  const timeout = pendingPopoverCloses.get(popover);
  if (timeout === undefined) return;
  clock.cancelLater(timeout);
  pendingPopoverCloses.delete(popover);
}

function popoverPanel(popover: HTMLElement, trigger: HTMLElement | null): HTMLElement | null {
  const controlled = trigger?.getAttribute('aria-controls');
  if (controlled !== null && controlled !== undefined) {
    const panel = document.getElementById(controlled);
    if (panel instanceof HTMLElement && panel.matches('[data-popover-panel]')) return panel;
  }
  return popover.querySelector<HTMLElement>('[data-popover-panel]');
}

function popoverOwner(target: Element): HTMLElement | null {
  const direct = target.closest<HTMLElement>('[data-popover]');
  if (direct !== null) return direct;
  const panel = target.closest<HTMLElement>('[data-popover-portal]');
  return panel === null ? null : (popoverPortalOwners.get(panel) ?? null);
}

function glossaryOwner(target: Element): HTMLElement | null {
  const direct = target.closest<HTMLElement>('[data-glossary-reference]');
  if (direct !== null) return direct;
  const panel = target.closest<HTMLElement>('[data-popover-portal]');
  const owner = panel === null ? undefined : popoverPortalOwners.get(panel);
  return owner?.matches('[data-glossary-reference]') === true ? owner : null;
}

function popoverContains(popover: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (popover.contains(target)) return true;
  return popoverPortals.get(popover)?.panel.contains(target) === true;
}

function portalPopoverPanel(popover: HTMLElement, panel: HTMLElement): void {
  if (popoverPortals.has(popover)) return;
  const placeholder = document.createComment('agentic-report popover portal');
  panel.replaceWith(placeholder);
  overlayHostElement().append(panel);
  panel.dataset.popoverPortal = '';
  if (popover.matches('[data-glossary-reference]')) panel.dataset.glossaryPortal = '';
  popoverPortals.set(popover, { panel, placeholder });
  popoverPortalOwners.set(panel, popover);
  if (popoverPortals.size === 1) startPopoverPositioning();
}

function restorePopoverPanel(popover: HTMLElement): void {
  const portal = popoverPortals.get(popover);
  if (portal === undefined) return;
  portal.placeholder.replaceWith(portal.panel);
  portal.panel.removeAttribute('data-popover-portal');
  portal.panel.removeAttribute('data-glossary-portal');
  portal.panel.style.removeProperty('inset');
  portal.panel.style.removeProperty('top');
  portal.panel.style.removeProperty('left');
  portal.panel.style.removeProperty('width');
  portal.panel.style.removeProperty('max-height');
  popoverPortals.delete(popover);
  popoverPortalOwners.delete(portal.panel);
  if (popoverPortals.size === 0) stopPopoverPositioning();
}

function overlayHostElement(): HTMLElement {
  if (overlayHost !== undefined) return overlayHost;
  overlayHost = document.body;
  overlayHost.dataset.overlayHost = '';
  return overlayHost;
}

function startPopoverPositioning(): void {
  popoverPositionAbort = new AbortController();
  const signal = popoverPositionAbort.signal;
  window.addEventListener('resize', schedulePopoverPositioning, { signal });
  window.visualViewport?.addEventListener('resize', schedulePopoverPositioning, { signal });
  window.visualViewport?.addEventListener('scroll', schedulePopoverPositioning, { signal });
  document.addEventListener('scroll', schedulePopoverPositioning, { capture: true, signal });
}

function stopPopoverPositioning(): void {
  popoverPositionAbort?.abort();
  popoverPositionAbort = undefined;
  if (popoverPositionFrame !== undefined) clock.cancelFrame(popoverPositionFrame);
  popoverPositionFrame = undefined;
  overlayHost?.removeAttribute('data-overlay-host');
  overlayHost = undefined;
}

function schedulePopoverPositioning(): void {
  if (popoverPositionFrame !== undefined) return;
  popoverPositionFrame = clock.frame(() => {
    popoverPositionFrame = undefined;
    for (const popover of popoverPortals.keys()) positionPopoverPortal(popover);
  });
}

function positionPopoverPortal(popover: HTMLElement): void {
  const portal = popoverPortals.get(popover);
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  if (portal === undefined || trigger === null || portal.panel.hidden) return;
  const viewport = visualViewportBounds();
  const gutter = 16;
  const gap = popover.matches('.semantic-code-term') ? 0 : 8;
  const triggerRect = trigger.getBoundingClientRect();
  portal.panel.style.inset = 'auto';
  portal.panel.style.width = `${Math.max(0, Math.min(448, viewport.right - viewport.left - gutter * 2))}px`;
  portal.panel.style.maxHeight = `${Math.max(0, viewport.bottom - viewport.top - gutter * 2)}px`;
  const panelRect = portal.panel.getBoundingClientRect();
  const position = placeSurface({
    anchor: triggerRect,
    surface: { width: panelRect.width, height: panelRect.height },
    viewport,
    gutter,
    gap,
    preference: 'block',
  });
  portal.panel.style.left = `${position.left}px`;
  portal.panel.style.top = `${position.top}px`;
}

provideFeature('popover', {
  closeOutside: closePopoversOutside,
  closeAll: () => {
    for (const popover of document.querySelectorAll<HTMLElement>('[data-popover]'))
      closePopover(popover, false);
  },
  trigger: (popoverTrigger) => {
    const popover = popoverTrigger.closest<HTMLElement>('[data-popover]');
    const panel = popover === null ? null : popoverPanel(popover, popoverTrigger);
    if (popover !== null && panel !== null) {
      if (popover.matches('[data-glossary-reference]')) openPopover(popover);
      else if (panel.hidden) openPopover(popover);
      else closePopover(popover, false);
    }
  },
  escape: (target) => {
    const popover = popoverOwner(target);
    if (popover !== null) closePopover(popover, true);
  },
  pointerOver: (target) => {
    const glossary = glossaryOwner(target);
    if (glossary !== null) {
      cancelScheduledPopoverClose(glossary);
      openPopover(glossary);
    }
  },
  pointerOut: (target, related) => {
    const glossary = glossaryOwner(target);
    if (
      glossary !== null &&
      !popoverContains(glossary, related) &&
      !popoverContains(glossary, document.activeElement)
    ) {
      schedulePopoverClose(glossary);
    }
  },
  focusIn: (target) => {
    const glossary = glossaryOwner(target);
    if (glossary !== null) {
      cancelScheduledPopoverClose(glossary);
      openPopover(glossary);
    }
  },
  focusOut: (target, related) => {
    const glossary = glossaryOwner(target);
    if (glossary !== null && !popoverContains(glossary, related) && !glossary.matches(':hover')) {
      schedulePopoverClose(glossary);
    }
  },
});
