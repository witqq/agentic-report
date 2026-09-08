import './document.css';

import { COPY_ICON_PATH } from '../iconography.js';
import { packageStrings, type PackageLocale } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import type { ReviewArtifact } from '../review/contract.js';
import { placeSurface, visualViewportBounds } from './overlay-position.js';
import {
  installResponseWorkspaces,
  type ResponseWorkspacesController,
} from './response-workspace.js';
import { installReviewWorkspace, type ReviewWorkspaceController } from './review-workspace.js';

const root = document.documentElement;
const localizedPage = createLocalizedPageController();
let strings = packageStrings(root.dataset.packageLocale);
root.style.setProperty(
  '--motion-reveal-duration',
  `${PAGE_MOTION_POLICY.sectionReveal.durationMs}ms`,
);
root.style.setProperty(
  '--motion-reveal-translation',
  `${PAGE_MOTION_POLICY.sectionReveal.translationPx}px`,
);
root.style.setProperty('--motion-stagger-step', `${PAGE_MOTION_POLICY.stagger.stepMs}ms`);
root.style.setProperty('--motion-choreography-step', `${PAGE_MOTION_POLICY.choreography.stepMs}ms`);
root.style.setProperty('--motion-depth', `${PAGE_MOTION_POLICY.pointer.depthPx}px`);
root.style.setProperty('--motion-tilt', `${PAGE_MOTION_POLICY.pointer.tiltDegrees}deg`);
root.style.setProperty('--motion-magnetic', `${PAGE_MOTION_POLICY.pointer.magneticPx}px`);
const modalOpeners = new WeakMap<HTMLDialogElement, HTMLButtonElement>();
const popoverPortals = new Map<
  HTMLElement,
  { readonly panel: HTMLElement; readonly placeholder: Comment }
>();
const popoverPortalOwners = new WeakMap<HTMLElement, HTMLElement>();
const pendingPopoverCloses = new Map<HTMLElement, number>();
let overlayHost: HTMLElement | undefined;
let popoverPositionAbort: AbortController | undefined;
let popoverPositionFrame: number | undefined;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let navigationController: NavigationController | undefined;
let motionController: MotionController | undefined;
let galleryController: GalleryController | undefined;
let responseController: ResponseWorkspacesController | undefined;
let reviewController: ReviewWorkspaceController | undefined;
const responseControllers = new Map<PackageLocale, ResponseWorkspacesController>();
const reviewStates = new Map<PackageLocale, ReviewArtifact>();
activateCurrentPage();

reducedMotion.addEventListener('change', () => motionController?.sync());
finePointer.addEventListener('change', () => motionController?.sync());

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.matches('[data-nav-dialog]')) {
    navigationController?.closeMobile(true);
    return;
  }
  closePopoversOutside(target);

  const themeToggle = target.closest<HTMLButtonElement>('[data-theme-toggle]');
  if (themeToggle !== null) {
    const current = root.dataset.theme;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = current === 'system' ? (systemDark ? 'dark' : 'light') : current;
    root.dataset.theme = resolved === 'dark' ? 'light' : 'dark';
    return;
  }

  const navToggle = target.closest<HTMLButtonElement>('[data-nav-toggle]');
  if (navToggle !== null) {
    navigationController?.toggle();
    return;
  }

  const navClose = target.closest<HTMLButtonElement>('[data-nav-close]');
  if (navClose !== null) {
    navigationController?.closeMobile(true);
    return;
  }

  const navLink = target.closest<HTMLAnchorElement>('[data-navigation] a');
  if (navLink !== null) {
    navigationController?.activate(navLink);
    return;
  }

  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab !== null) {
    activateTab(tab, false);
    return;
  }

  const modalOpen = target.closest<HTMLButtonElement>('[data-modal-open]');
  if (modalOpen !== null) {
    const dialog = document.getElementById(
      modalOpen.dataset.modalOpen ?? '',
    ) as HTMLDialogElement | null;
    if (dialog !== null) {
      modalOpeners.set(dialog, modalOpen);
      dialog.showModal();
    }
    return;
  }

  const modalClose = target.closest<HTMLButtonElement>('[data-modal-close]');
  if (modalClose !== null) {
    modalClose.closest<HTMLDialogElement>('dialog')?.close();
    return;
  }

  const popoverTrigger = target.closest<HTMLElement>('[data-popover-trigger]');
  if (popoverTrigger !== null) {
    const popover = popoverTrigger.closest<HTMLElement>('[data-popover]');
    const panel = popover === null ? null : popoverPanel(popover, popoverTrigger);
    if (popover !== null && panel !== null) {
      if (popover.matches('[data-glossary-reference]')) openPopover(popover);
      else if (panel.hidden) openPopover(popover);
      else closePopover(popover, false);
    }
    return;
  }

  const toggle = target.closest<HTMLButtonElement>('[data-toggle-control]');
  if (toggle !== null) {
    const panel = toggle
      .closest<HTMLElement>('[data-toggle]')
      ?.querySelector<HTMLElement>('[data-toggle-panel]');
    if (panel !== undefined && panel !== null) {
      const active = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(active));
      panel.hidden = !active;
    }
    return;
  }

  const increment = target.closest<HTMLButtonElement>('[data-demo-increment]');
  if (increment !== null) {
    const demo = increment.closest<HTMLElement>('[data-demo-counter]');
    const output = demo?.querySelector<HTMLOutputElement>('[data-demo-output]');
    if (demo !== null && demo !== undefined && output !== null && output !== undefined) {
      const value = Number(output.value || output.textContent || demo.dataset.start || '0');
      const next = value + Number(demo.dataset.step ?? '1');
      output.value = String(next);
      output.textContent = String(next);
    }
    return;
  }

  const copy = target.closest<HTMLButtonElement>('[data-copy-code], [data-copy-prose]');
  if (copy !== null) void copyContent(copy);
});

document.addEventListener('change', (event) => {
  const select =
    event.target instanceof HTMLSelectElement && event.target.matches('[data-language-select]')
      ? event.target
      : undefined;
  if (select === undefined || (select.value !== 'en' && select.value !== 'ru')) return;
  switchPageLocale(select.value);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const gallery = target.closest<HTMLElement>('[data-gallery-scroller]');
  if (gallery === target && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    gallery.scrollBy({ left: direction * Math.max(40, gallery.clientWidth * 0.8) });
    return;
  }
  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab !== null && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
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
      activateTab(next, true);
    }
    return;
  }
  if (event.key === 'Escape') {
    const popover = popoverOwner(target);
    if (popover !== null) closePopover(popover, true);
  }
});

document.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-filter-input]')) {
    return;
  }
  applyFilter(event.target);
});

document.addEventListener('pointerover', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = glossaryOwner(event.target);
  if (glossary !== null) {
    cancelScheduledPopoverClose(glossary);
    openPopover(glossary);
  }
});

document.addEventListener('pointerout', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = glossaryOwner(event.target);
  if (
    glossary !== null &&
    !popoverContains(glossary, event.relatedTarget) &&
    !popoverContains(glossary, document.activeElement)
  ) {
    schedulePopoverClose(glossary);
  }
});

document.addEventListener('focusin', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = glossaryOwner(event.target);
  if (glossary !== null) {
    cancelScheduledPopoverClose(glossary);
    openPopover(glossary);
  }
});

document.addEventListener('focusout', (event) => {
  if (!(event.target instanceof Element)) return;
  const glossary = glossaryOwner(event.target);
  if (
    glossary !== null &&
    !popoverContains(glossary, event.relatedTarget) &&
    !glossary.matches(':hover')
  ) {
    schedulePopoverClose(glossary);
  }
});

document.addEventListener(
  'close',
  (event) => {
    if (event.target instanceof HTMLDialogElement) modalOpeners.get(event.target)?.focus();
  },
  true,
);

interface LocalizedPageController {
  readonly locale: () => PackageLocale;
  readonly page: () => HTMLElement;
  readonly activate: (locale: PackageLocale) => HTMLElement;
}

function createLocalizedPageController(): LocalizedPageController {
  const host = document.querySelector<HTMLElement>('[data-localized-page-host]');
  const initial = host?.querySelector<HTMLElement>('[data-localized-page-variant]');
  if (host === null || initial === undefined || initial === null)
    throw new Error('Localized page host is incomplete.');
  const templates = new Map<PackageLocale, HTMLTemplateElement>();
  for (const template of document.querySelectorAll<HTMLTemplateElement>(
    'template[data-localized-page]',
  )) {
    const locale = template.dataset.localizedPage;
    if (locale === 'en' || locale === 'ru') templates.set(locale, template);
  }
  const primary = pageLocale(initial);
  const available = new Set<PackageLocale>([primary, ...templates.keys()]);
  const saved = new Map<PackageLocale, DocumentFragment>();
  let currentLocale = primary;
  let currentPage = initial;

  const updateDocument = (): void => {
    root.lang = currentPage.dataset.pageLanguage ?? currentLocale;
    root.dataset.packageLocale = currentPage.dataset.pagePackageLocale ?? currentLocale;
    root.dataset.activeLocale = currentLocale;
    document.title = currentPage.dataset.pageTitle ?? document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description !== null)
      description.content = currentPage.dataset.pageDescription ?? document.title;
  };

  const activate = (locale: PackageLocale): HTMLElement => {
    if (!available.has(locale) || locale === currentLocale) {
      updateDocument();
      return currentPage;
    }
    const previous = document.createDocumentFragment();
    previous.append(...host.childNodes);
    saved.set(currentLocale, previous);
    const next = saved.get(locale) ?? templates.get(locale)?.content.cloneNode(true);
    if (!(next instanceof DocumentFragment)) throw new Error(`Missing page locale: ${locale}.`);
    saved.delete(locale);
    host.replaceChildren(next);
    const page = host.querySelector<HTMLElement>('[data-localized-page-variant]');
    if (page === null || pageLocale(page) !== locale)
      throw new Error(`Localized page ${locale} is incomplete.`);
    currentLocale = locale;
    currentPage = page;
    const languageSelect = currentPage.querySelector<HTMLSelectElement>('[data-language-select]');
    if (languageSelect !== null) languageSelect.value = locale;
    updateDocument();
    return page;
  };

  const preferred = preferredPageLocale(available, primary);
  if (preferred !== primary) activate(preferred);
  else updateDocument();
  return { locale: () => currentLocale, page: () => currentPage, activate };
}

function preferredPageLocale(
  available: ReadonlySet<PackageLocale>,
  fallback: PackageLocale,
): PackageLocale {
  const preferences = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const preference of preferences) {
    const primary = preference.trim().toLowerCase().split('-')[0];
    if ((primary === 'en' || primary === 'ru') && available.has(primary)) return primary;
  }
  return fallback;
}

function pageLocale(page: HTMLElement): PackageLocale {
  return page.dataset.localizedPageVariant === 'ru' ? 'ru' : 'en';
}

function switchPageLocale(locale: PackageLocale): void {
  if (locale === localizedPage.locale()) return;
  const currentLocale = localizedPage.locale();
  if (reviewController !== undefined) reviewStates.set(currentLocale, reviewController.snapshot());
  reviewController?.destroy();
  navigationController?.destroy();
  motionController?.destroy();
  galleryController?.destroy();
  for (const popover of document.querySelectorAll<HTMLElement>('[data-popover]'))
    closePopover(popover, false);
  localizedPage.activate(locale);
  strings = packageStrings(root.dataset.packageLocale);
  activateCurrentPage();
  localizedPage.page().querySelector<HTMLSelectElement>('[data-language-select]')?.focus();
}

function activateCurrentPage(): void {
  const page = localizedPage.page();
  strings = packageStrings(page.dataset.pagePackageLocale);
  navigationController = createNavigationController();
  motionController = createMotionController(reducedMotion);
  galleryController = createGalleryController(page);
  responseController = responseControllers.get(localizedPage.locale());
  if (responseController === undefined) {
    responseController = installResponseWorkspaces(page);
    responseControllers.set(localizedPage.locale(), responseController);
  }
  reviewController = installReviewWorkspace(page, reviewStates.get(localizedPage.locale()));
  for (const input of page.querySelectorAll<HTMLInputElement>('[data-filter-input]'))
    applyFilter(input);
  for (const block of page.querySelectorAll<HTMLElement>('pre'))
    if (block.querySelector(':scope > [data-copy-code]') === null)
      block.append(createCopyButton('code'));
  for (const block of page.querySelectorAll<HTMLElement>('[data-copyable-prose]'))
    if (block.querySelector(':scope > [data-copy-prose]') === null)
      block.append(createCopyButton('prose'));
}

interface GalleryController {
  readonly destroy: () => void;
}

function createGalleryController(page: HTMLElement): GalleryController | undefined {
  const rails = [...page.querySelectorAll<HTMLElement>('[data-gallery-rail]')];
  if (rails.length === 0) return undefined;
  let active = true;
  const sync = (): void => {
    if (!active) return;
    for (const rail of rails) {
      const scrollable = rail.scrollWidth > rail.clientWidth + 1;
      rail.toggleAttribute('data-gallery-scroller', scrollable);
      if (scrollable) {
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', strings.scrollableGallery);
        rail.tabIndex = 0;
      } else {
        rail.removeAttribute('role');
        rail.removeAttribute('aria-label');
        rail.removeAttribute('tabindex');
        rail.scrollLeft = 0;
      }
    }
  };
  const observer = new ResizeObserver(sync);
  for (const rail of rails) observer.observe(rail);
  sync();
  void document.fonts.ready.then(sync);
  return {
    destroy: () => {
      active = false;
      observer.disconnect();
      for (const rail of rails) {
        rail.removeAttribute('data-gallery-scroller');
        rail.removeAttribute('role');
        rail.removeAttribute('aria-label');
        rail.removeAttribute('tabindex');
      }
    },
  };
}

function createCopyButton(kind: 'code' | 'prose'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = kind === 'code' ? 'copy-code' : 'copy-prose';
  if (kind === 'code') button.dataset.copyCode = '';
  else button.dataset.copyProse = '';
  const label = document.createElement('span');
  label.dataset.copyLabel = '';
  if (kind === 'code') label.dataset.copyCodeLabel = '';
  label.textContent = strings.copy;
  button.append(createCopyIcon(), label);
  return button;
}

function createCopyIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('package-icon');
  svg.dataset.packageIcon = 'copy';
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', COPY_ICON_PATH);
  svg.append(path);
  return svg;
}

interface NavigationController {
  readonly toggle: () => void;
  readonly closeMobile: (restoreFocus: boolean) => void;
  readonly activate: (link: HTMLAnchorElement) => void;
  readonly destroy: () => void;
}

interface NavigationOwner {
  readonly link: HTMLAnchorElement;
  readonly target: HTMLElement;
  readonly heading: HTMLElement;
}

function createNavigationController(): NavigationController | undefined {
  const abort = new AbortController();
  const navigation = document.querySelector<HTMLElement>('[data-navigation]');
  const desktopHost = document.querySelector<HTMLElement>('[data-nav-desktop-host]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-nav-dialog]');
  const dialogContent = dialog?.querySelector<HTMLElement>('[data-nav-dialog-content]');
  const close = dialog?.querySelector<HTMLButtonElement>('[data-nav-close]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const toggleLabel = toggle?.querySelector<HTMLElement>('[data-nav-toggle-label]');
  const currentLabel = document.querySelector<HTMLElement>('[data-topbar-current]');
  const topbar = document.querySelector<HTMLElement>('.topbar');
  if (
    navigation === null ||
    desktopHost === null ||
    dialog === null ||
    dialogContent === undefined ||
    dialogContent === null ||
    close === undefined ||
    close === null ||
    toggle === null ||
    toggleLabel === undefined ||
    toggleLabel === null ||
    currentLabel === null ||
    topbar === null
  ) {
    return undefined;
  }

  const owners = [...navigation.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
    .map((link): NavigationOwner | undefined => {
      const target = hashTarget(link.hash);
      if (target === undefined) return undefined;
      const heading = target.matches('section[data-semantic="section"]')
        ? target.querySelector<HTMLElement>(':scope > h2')
        : target;
      if (heading === null) return undefined;
      heading.tabIndex = -1;
      return { link, target, heading };
    })
    .filter((owner): owner is NavigationOwner => owner !== undefined);
  if (owners.length < 2) return undefined;

  const desktop = window.matchMedia('(min-width: 57rem)');
  const outside = [...document.querySelectorAll<HTMLElement>('[data-nav-outside]')];
  let desktopExpanded = true;
  let focusAfterClose: HTMLElement | undefined;
  let currentObserver: IntersectionObserver | undefined;
  let currentObserverSuspended = false;
  let pendingInitialHashOwner: NavigationOwner | undefined;
  const supportsScrollEnd = 'onscrollend' in window;
  let fallbackScrollTimer: number | undefined;
  const navigationOffset = 16;
  const hashOwnershipOverlap = 1;
  const syncTopbarClearance = (): void => {
    root.style.setProperty(
      '--topbar-clearance',
      `${Math.ceil(topbar.offsetHeight) + navigationOffset - hashOwnershipOverlap}px`,
    );
  };
  const topbarObserver = new ResizeObserver(syncTopbarClearance);
  topbarObserver.observe(topbar);
  syncTopbarClearance();
  const cancelFallbackScrollSelection = (): void => {
    if (fallbackScrollTimer === undefined) return;
    window.clearTimeout(fallbackScrollTimer);
    fallbackScrollTimer = undefined;
  };
  const bottomSentinel = document.createElement('span');
  bottomSentinel.dataset.navigationBottom = '';
  bottomSentinel.setAttribute('aria-hidden', 'true');
  document.body.append(bottomSentinel);

  const setCurrent = (owner: NavigationOwner): void => {
    for (const candidate of owners) {
      if (candidate === owner) candidate.link.setAttribute('aria-current', 'location');
      else candidate.link.removeAttribute('aria-current');
    }
    currentLabel.textContent =
      owner.link.textContent?.trim() || owner.heading.textContent?.trim() || '';
  };

  const ownerForTarget = (target: HTMLElement): NavigationOwner => {
    let preceding: NavigationOwner | undefined;
    for (const owner of owners) {
      if (owner.target === target || owner.target.contains(target)) return owner;
      if ((owner.target.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
        preceding = owner;
      }
    }
    return preceding ?? owners[0] ?? unreachableNavigationOwner();
  };

  const activationLine = (): number =>
    (document.querySelector<HTMLElement>('.topbar')?.getBoundingClientRect().bottom ?? 0) +
    navigationOffset;

  const atDocumentBottom = (): boolean =>
    Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1;

  const selectFromGeometry = (): void => {
    if (atDocumentBottom()) {
      setCurrent(owners.at(-1) ?? unreachableNavigationOwner());
      return;
    }
    const line = activationLine();
    let selected = owners[0] ?? unreachableNavigationOwner();
    for (const owner of owners) {
      if (owner.heading.getBoundingClientRect().top <= line) selected = owner;
    }
    setCurrent(selected);
  };

  const selectFromHash = (): void => {
    cancelFallbackScrollSelection();
    const target = hashTarget(window.location.hash);
    if (target !== undefined) {
      currentObserverSuspended = true;
      setCurrent(ownerForTarget(target));
    } else {
      currentObserverSuspended = false;
      selectFromGeometry();
    }
  };

  const alignPendingInitialHash = (): boolean => {
    const owner = pendingInitialHashOwner;
    if (owner === undefined) return false;
    pendingInitialHashOwner = undefined;
    window.scrollBy({
      top: owner.heading.getBoundingClientRect().top - activationLine() + hashOwnershipOverlap,
      behavior: 'instant',
    });
    currentObserverSuspended = true;
    setCurrent(owner);
    return true;
  };

  const setOutsideInert = (inert: boolean): void => {
    for (const element of outside) element.toggleAttribute('inert', inert);
  };

  const updateDesktopState = (): void => {
    navigation.hidden = !desktopExpanded;
    root.toggleAttribute('data-nav-collapsed', !desktopExpanded);
    toggle.setAttribute('aria-expanded', String(desktopExpanded));
    toggle.setAttribute(
      'aria-label',
      desktopExpanded ? strings.hideContents : strings.showContents,
    );
    toggle.title = desktopExpanded ? strings.hideContents : strings.showContents;
    toggleLabel.textContent = desktopExpanded ? strings.hideContents : strings.showContents;
  };

  const applyViewport = (): void => {
    if (desktop.matches) {
      if (dialog.open) {
        focusAfterClose = toggle;
        dialog.close();
      }
      desktopHost.append(navigation);
      toggle.setAttribute('aria-controls', navigation.id);
      setOutsideInert(false);
      updateDesktopState();
      return;
    }
    if (dialog.open) {
      focusAfterClose = toggle;
      dialog.close();
    }
    dialogContent.append(navigation);
    navigation.hidden = false;
    root.removeAttribute('data-nav-collapsed');
    toggle.setAttribute('aria-controls', dialog.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', strings.openContents);
    toggle.title = strings.openContents;
    toggleLabel.textContent = strings.contents;
  };

  const closeMobile = (restoreFocus: boolean): void => {
    if (!dialog.open) return;
    focusAfterClose = restoreFocus ? toggle : focusAfterClose;
    dialog.close();
  };

  const openMobile = (): void => {
    if (dialog.open) return;
    dialog.showModal();
    setOutsideInert(true);
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', strings.closeContents);
    close.focus();
  };

  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Tab' || !dialog.open) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    { signal: abort.signal },
  );

  const rebuildCurrentObserver = (): void => {
    currentObserver?.disconnect();
    currentObserver = undefined;
    if (!supportsIntersectionObserver()) {
      if (!currentObserverSuspended) selectFromGeometry();
      return;
    }
    const line = Math.max(0, Math.min(window.innerHeight - 1, Math.round(activationLine())));
    const lowerMargin = Math.max(0, window.innerHeight - line - 1);
    currentObserver = new IntersectionObserver(
      () => {
        if (!currentObserverSuspended) selectFromGeometry();
      },
      { rootMargin: `-${line}px 0px -${lowerMargin}px 0px`, threshold: 0 },
    );
    for (const owner of owners) currentObserver.observe(owner.heading);
    currentObserver.observe(bottomSentinel);
    if (!currentObserverSuspended) selectFromGeometry();
  };

  dialog.addEventListener(
    'close',
    () => {
      setOutsideInert(false);
      if (desktop.matches) {
        updateDesktopState();
      } else {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', strings.openContents);
      }
      const target = focusAfterClose ?? toggle;
      focusAfterClose = undefined;
      target.focus({ preventScroll: true });
    },
    { signal: abort.signal },
  );
  desktop.addEventListener('change', applyViewport, { signal: abort.signal });
  window.addEventListener('hashchange', selectFromHash, { signal: abort.signal });
  window.addEventListener(
    'resize',
    () => {
      cancelFallbackScrollSelection();
      currentObserverSuspended = false;
      rebuildCurrentObserver();
    },
    { signal: abort.signal },
  );
  if (supportsScrollEnd) {
    window.addEventListener(
      'scrollend',
      () => {
        if (alignPendingInitialHash()) return;
        currentObserverSuspended = false;
        selectFromGeometry();
      },
      { signal: abort.signal },
    );
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!supportsScrollEnd) {
        cancelFallbackScrollSelection();
        fallbackScrollTimer = window.setTimeout(() => {
          fallbackScrollTimer = undefined;
          if (alignPendingInitialHash()) return;
          currentObserverSuspended = false;
          selectFromGeometry();
        }, 80);
      }
      if (!currentObserverSuspended && atDocumentBottom()) {
        setCurrent(owners.at(-1) ?? unreachableNavigationOwner());
      }
    },
    { passive: true, signal: abort.signal },
  );

  applyViewport();
  const initialTarget = hashTarget(window.location.hash);
  if (initialTarget !== undefined) {
    currentObserverSuspended = true;
    const initialOwner = ownerForTarget(initialTarget);
    pendingInitialHashOwner = initialOwner;
    setCurrent(initialOwner);
    if (!supportsScrollEnd) requestAnimationFrame(() => alignPendingInitialHash());
  }
  rebuildCurrentObserver();

  return {
    toggle: () => {
      if (!desktop.matches) {
        if (dialog.open) closeMobile(true);
        else openMobile();
        return;
      }
      desktopExpanded = !desktopExpanded;
      updateDesktopState();
      toggle.focus();
    },
    closeMobile,
    activate: (link) => {
      const owner = owners.find((candidate) => candidate.link === link);
      if (owner === undefined) return;
      cancelFallbackScrollSelection();
      currentObserverSuspended = true;
      setCurrent(owner);
      if (!desktop.matches && dialog.open) {
        focusAfterClose = owner.heading;
        closeMobile(false);
      }
    },
    destroy: () => {
      abort.abort();
      currentObserver?.disconnect();
      topbarObserver.disconnect();
      pendingInitialHashOwner = undefined;
      cancelFallbackScrollSelection();
      bottomSentinel.remove();
      root.removeAttribute('data-nav-collapsed');
      root.style.removeProperty('--topbar-clearance');
    },
  };
}

function hashTarget(hash: string): HTMLElement | undefined {
  if (!hash.startsWith('#') || hash.length === 1) return undefined;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1))) ?? undefined;
  } catch {
    return undefined;
  }
}

function unreachableNavigationOwner(): never {
  throw new Error('Navigation requires at least two valid owners.');
}

interface MotionController {
  readonly sync: () => void;
  readonly destroy: () => void;
}

function createMotionController(media: MediaQueryList): MotionController {
  let cleanups: Array<() => void> = [];
  const revealed = new WeakSet<HTMLElement>();

  const sync = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-semantic="section"][data-reveal="true"], [data-semantic="section"][data-transition="reveal"], [data-semantic="section"][data-transition="stagger"]',
      ),
    ];
    const reduceProgress = media.matches && PAGE_MOTION_POLICY.scrollProgress.normalMotionOnly;
    const reduceReveal = media.matches && PAGE_MOTION_POLICY.sectionReveal.normalMotionOnly;
    if (reduceProgress) {
      document.querySelector('[data-scroll-progress-indicator]')?.remove();
    } else {
      const cleanup = installScrollProgress();
      if (cleanup) cleanups.push(cleanup);
    }
    if (reduceReveal) {
      for (const target of targets) {
        target.removeAttribute('data-reveal-pending');
        target.removeAttribute('data-reveal-motion');
        target.setAttribute('data-reveal-shown', '');
        revealed.add(target);
      }
    } else {
      const cleanup = installSectionReveal(targets, revealed);
      if (cleanup) cleanups.push(cleanup);
    }
    cleanups.push(installActionPlacement());
    const allowScenes = !media.matches || !PAGE_MOTION_POLICY.scene.normalMotionOnly;
    const allowChoreography = !media.matches || !PAGE_MOTION_POLICY.choreography.normalMotionOnly;
    if (allowScenes || allowChoreography) {
      const sceneCleanup = installSceneAndChoreography({
        scenes: allowScenes,
        choreography: allowChoreography,
      });
      if (sceneCleanup) cleanups.push(sceneCleanup);
    }
    const allowPointerMotion =
      (!media.matches || !PAGE_MOTION_POLICY.pointer.normalMotionOnly) &&
      (finePointer.matches || !PAGE_MOTION_POLICY.pointer.finePointerOnly);
    if (allowPointerMotion) {
      const pointerCleanup = installPointerEffects();
      if (pointerCleanup) cleanups.push(pointerCleanup);
    }
  };

  sync();
  return {
    sync,
    destroy: () => {
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
    },
  };
}

function installActionPlacement(): () => void {
  const mobile = window.matchMedia('(max-width: 56.99rem)');
  const groups = [...document.querySelectorAll<HTMLElement>('[data-semantic="actions"]')];
  const apply = (): void => {
    for (const group of groups) {
      const authored = group.dataset.placement ?? 'auto';
      group.dataset.placementResolved =
        authored === 'auto' ? (mobile.matches ? 'bottom' : 'edge') : authored;
    }
  };
  mobile.addEventListener('change', apply);
  apply();
  return () => {
    mobile.removeEventListener('change', apply);
    for (const group of groups) delete group.dataset.placementResolved;
  };
}

function installSceneAndChoreography(capabilities: {
  readonly scenes: boolean;
  readonly choreography: boolean;
}): (() => void) | undefined {
  if (!supportsIntersectionObserver()) return undefined;
  const scenes = capabilities.scenes
    ? [...document.querySelectorAll<HTMLElement>('[data-scene]:not([data-scene="none"])')]
    : [];
  const choreographed = capabilities.choreography
    ? [...document.querySelectorAll<HTMLElement>('[data-choreography="cascade"]')]
    : [];
  if (scenes.length === 0 && choreographed.length === 0) return undefined;
  const abort = new AbortController();
  const activeScenes = new Set<HTMLElement>();
  let frame = 0;
  const update = (): void => {
    frame = 0;
    for (const scene of activeScenes) {
      const rect = scene.getBoundingClientRect();
      const span = rect.height + innerHeight;
      const progress = span <= 0 ? 0 : Math.min(1, Math.max(0, (innerHeight - rect.top) / span));
      scene.style.setProperty('--scene-progress', progress.toFixed(4));
    }
  };
  const schedule = (): void => {
    if (activeScenes.size > 0 && frame === 0) frame = requestAnimationFrame(update);
  };
  for (const owner of choreographed) {
    const items = [
      ...owner.querySelectorAll<HTMLElement>(
        '.semantic-card, .semantic-chart .semantic-point, .semantic-timeline > ol > li',
      ),
    ].slice(0, PAGE_MOTION_POLICY.choreography.maximumItems);
    items.forEach((item, index) => {
      item.style.setProperty('--choreography-index', String(index));
    });
    owner.setAttribute('data-choreography-motion', '');
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const owner = entry.target as HTMLElement;
      if (scenes.includes(owner)) {
        owner.toggleAttribute('data-scene-active', entry.isIntersecting);
        if (entry.isIntersecting) activeScenes.add(owner);
        else activeScenes.delete(owner);
      }
      if (entry.isIntersecting && choreographed.includes(owner)) {
        owner.setAttribute('data-choreography-active', '');
        observer.unobserve(owner);
      }
    }
    schedule();
  });
  for (const owner of new Set([...scenes, ...choreographed])) observer.observe(owner);
  document.addEventListener('scroll', schedule, { passive: true, signal: abort.signal });
  window.addEventListener('resize', schedule, { signal: abort.signal });
  return () => {
    abort.abort();
    observer.disconnect();
    activeScenes.clear();
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const scene of scenes) {
      scene.style.removeProperty('--scene-progress');
      scene.removeAttribute('data-scene-active');
    }
    for (const owner of choreographed) {
      owner.removeAttribute('data-choreography-active');
      owner.removeAttribute('data-choreography-motion');
      for (const item of owner.querySelectorAll<HTMLElement>('[style*="--choreography-index"]'))
        item.style.removeProperty('--choreography-index');
    }
  };
}

function installPointerEffects(): (() => void) | undefined {
  if (!supportsIntersectionObserver()) return undefined;
  const owners = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-interaction="depth"], [data-interaction="tilt"], .semantic-action[data-effect="magnetic"]',
    ),
  ];
  if (owners.length === 0) return undefined;
  const abort = new AbortController();
  const active = new Set<HTMLElement>();
  const pending = new Map<HTMLElement, { readonly clientX: number; readonly clientY: number }>();
  let frame = 0;
  const isInViewport = (owner: HTMLElement): boolean => {
    const rect = owner.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  };
  const reset = (owner: HTMLElement): void => {
    pending.delete(owner);
    owner.style.removeProperty('--pointer-x');
    owner.style.removeProperty('--pointer-y');
    owner.removeAttribute('data-pointer-active');
  };
  const flush = (): void => {
    frame = 0;
    for (const [owner, point] of pending) {
      if (!active.has(owner)) continue;
      const rect = owner.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const x = Math.min(1, Math.max(-1, ((point.clientX - rect.left) / rect.width - 0.5) * 2));
      const y = Math.min(1, Math.max(-1, ((point.clientY - rect.top) / rect.height - 0.5) * 2));
      owner.style.setProperty('--pointer-x', x.toFixed(4));
      owner.style.setProperty('--pointer-y', y.toFixed(4));
      owner.setAttribute('data-pointer-active', '');
    }
    pending.clear();
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(flush);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const owner = entry.target as HTMLElement;
      if (entry.isIntersecting) active.add(owner);
      else {
        active.delete(owner);
        reset(owner);
      }
    }
  });
  for (const owner of owners) {
    if (isInViewport(owner)) active.add(owner);
    observer.observe(owner);
    owner.addEventListener(
      'pointermove',
      (event) => {
        if (!active.has(owner)) {
          if (!isInViewport(owner)) return;
          active.add(owner);
        }
        pending.set(owner, { clientX: event.clientX, clientY: event.clientY });
        schedule();
      },
      { signal: abort.signal },
    );
    owner.addEventListener('pointerleave', () => reset(owner), { signal: abort.signal });
  }
  return () => {
    abort.abort();
    observer.disconnect();
    active.clear();
    pending.clear();
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const owner of owners) reset(owner);
  };
}

function installScrollProgress(): (() => void) | undefined {
  if (root.dataset.scrollProgress !== 'true') return undefined;
  const indicator = document.createElement('div');
  indicator.className = 'scroll-progress';
  indicator.dataset.scrollProgressIndicator = '';
  indicator.setAttribute('aria-hidden', 'true');
  document.body.append(indicator);
  let frame = 0;
  const update = (): void => {
    frame = 0;
    const maximum = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const progress = maximum <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / maximum));
    indicator.hidden = maximum <= 0;
    indicator.style.transform = `scaleX(${progress})`;
  };
  const schedule = (): void => {
    if (frame === 0) frame = window.requestAnimationFrame(update);
  };
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    document.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) window.cancelAnimationFrame(frame);
    indicator.remove();
  };
}

function supportsIntersectionObserver(): boolean {
  return typeof window.IntersectionObserver === 'function';
}

function installSectionReveal(
  targets: readonly HTMLElement[],
  revealed: WeakSet<HTMLElement>,
): (() => void) | undefined {
  if (!supportsIntersectionObserver()) return undefined;
  const pending = targets.filter((target) => !revealed.has(target));
  if (pending.length === 0) return undefined;
  for (const target of pending) {
    target.setAttribute('data-reveal-pending', '');
    if (target.dataset.transition === 'stagger') {
      [...target.children]
        .slice(0, PAGE_MOTION_POLICY.stagger.maximumItems)
        .forEach((child, index) => {
          (child as HTMLElement).style.setProperty('--stagger-index', String(index));
        });
    }
  }
  document.body.getBoundingClientRect();
  for (const target of pending) target.setAttribute('data-reveal-motion', '');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        const target = entry.target;
        revealed.add(target);
        target.removeAttribute('data-reveal-pending');
        target.setAttribute('data-reveal-shown', '');
        observer.unobserve(target);
      }
    },
    { threshold: 0.18 },
  );
  for (const target of pending) observer.observe(target);
  return () => {
    observer.disconnect();
    for (const target of pending) {
      target.removeAttribute('data-reveal-pending');
      target.removeAttribute('data-reveal-motion');
    }
  };
}

function activateTab(control: HTMLButtonElement, moveFocus: boolean): void {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  if (tabs === null) return;
  const controls = tabControls(control);
  const panels = [...tabs.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.matches('[data-tab-panel]'),
  );
  for (const candidate of controls) {
    const selected = candidate === control;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = panels.find((item) => item.id === candidate.getAttribute('aria-controls'));
    if (panel !== undefined) panel.hidden = !selected;
  }
  if (moveFocus) control.focus();
}

function tabControls(control: HTMLButtonElement): HTMLButtonElement[] {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  const tabList = tabs?.querySelector<HTMLElement>(':scope > [role="tablist"]');
  return tabList === undefined || tabList === null
    ? []
    : [...tabList.querySelectorAll<HTMLButtonElement>('[data-tab]')];
}

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
  const timeout = window.setTimeout(() => {
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
  window.clearTimeout(timeout);
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
  if (popoverPositionFrame !== undefined) window.cancelAnimationFrame(popoverPositionFrame);
  popoverPositionFrame = undefined;
  overlayHost?.removeAttribute('data-overlay-host');
  overlayHost = undefined;
}

function schedulePopoverPositioning(): void {
  if (popoverPositionFrame !== undefined) return;
  popoverPositionFrame = window.requestAnimationFrame(() => {
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

function applyFilter(input: HTMLInputElement): void {
  const filter = input.closest<HTMLElement>('[data-filter]');
  if (filter === null) return;
  const output = filter.querySelector<HTMLOutputElement>('[data-filter-count]');
  const items = [...filter.querySelectorAll<HTMLLIElement>(':scope > ul > li, :scope > ol > li')];
  const query = input.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const item of items) {
    item.hidden = !item.textContent?.toLocaleLowerCase().includes(query);
    if (!item.hidden) visible += 1;
  }
  if (output !== null) output.textContent = strings.items(visible);
}

async function copyContent(button: HTMLButtonElement): Promise<void> {
  let text: string;
  if (button.matches('[data-copy-prose]')) {
    const prose = button
      .closest<HTMLElement>('[data-copyable-prose]')
      ?.querySelector<HTMLElement>('[data-copyable-content]');
    text = prose === undefined || prose === null ? '' : renderedProseText(prose);
  } else {
    const code = button.closest('pre')?.querySelector('code');
    const copy = code?.cloneNode(true);
    if (copy instanceof HTMLElement) {
      for (const panel of copy.querySelectorAll('[data-glossary-panel]')) panel.remove();
    }
    text = copy?.textContent ?? '';
  }
  const label = button.querySelector<HTMLElement>('[data-copy-label]') ?? button;
  try {
    await navigator.clipboard.writeText(text);
    label.textContent = strings.copied;
  } catch {
    label.textContent = strings.copyUnavailable;
  }
  window.setTimeout(() => {
    label.textContent = strings.copy;
  }, 1200);
}

function renderedProseText(content: HTMLElement): string {
  const copy = content.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return '';
  for (const reference of copy.querySelectorAll<HTMLElement>('[data-glossary-reference]')) {
    const label =
      reference.querySelector<HTMLElement>('[data-glossary-trigger]')?.textContent ?? '';
    reference.replaceWith(document.createTextNode(label));
  }
  for (const generated of copy.querySelectorAll(
    '[hidden], [aria-hidden="true"], button, input, select, textarea, output, [role="dialog"]',
  ))
    generated.remove();
  copy.style.position = 'fixed';
  copy.style.top = '0';
  copy.style.left = '-10000px';
  copy.style.width = `${content.getBoundingClientRect().width}px`;
  copy.style.pointerEvents = 'none';
  copy.setAttribute('aria-hidden', 'true');
  document.body.append(copy);
  const text = copy.innerText.replace(/\r\n?/gu, '\n').trim();
  copy.remove();
  return text;
}
