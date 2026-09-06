import './document.css';

import { COPY_ICON_PATH } from '../iconography.js';
import { packageStrings, type PackageLocale } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import type { ReviewArtifact } from '../review/contract.js';
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
const modalOpeners = new WeakMap<HTMLDialogElement, HTMLButtonElement>();
const glossaryPortals = new Map<
  HTMLElement,
  { readonly panel: HTMLElement; readonly placeholder: Comment }
>();
const glossaryPortalOwners = new WeakMap<HTMLElement, HTMLElement>();
const pendingPopoverCloses = new Map<HTMLElement, number>();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let navigationController: NavigationController | undefined;
let motionController: MotionController | undefined;
let responseController: ResponseWorkspacesController | undefined;
let reviewController: ReviewWorkspaceController | undefined;
const responseControllers = new Map<PackageLocale, ResponseWorkspacesController>();
const reviewStates = new Map<PackageLocale, ReviewArtifact>();
activateCurrentPage();

reducedMotion.addEventListener('change', () => motionController?.sync());

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
    const panel = popover?.querySelector<HTMLElement>('[data-popover-panel]');
    if (panel !== undefined && panel !== null) {
      if (popover?.matches('[data-glossary-reference]') === true) {
        openPopover(popover);
      } else {
        panel.hidden = !panel.hidden;
        popoverTrigger.setAttribute('aria-expanded', String(!panel.hidden));
      }
    }
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
    currentLabel === null
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
  const supportsScrollEnd = 'onscrollend' in window;
  let fallbackScrollTimer: number | undefined;
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
    (document.querySelector<HTMLElement>('.topbar')?.getBoundingClientRect().bottom ?? 0) + 16;

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
    if (!('IntersectionObserver' in window)) {
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
    setCurrent(ownerForTarget(initialTarget));
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
      cancelFallbackScrollSelection();
      bottomSentinel.remove();
      root.removeAttribute('data-nav-collapsed');
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
  let cleanupProgress: (() => void) | undefined;
  let cleanupReveal: (() => void) | undefined;
  const revealed = new WeakSet<HTMLElement>();

  const sync = (): void => {
    cleanupProgress?.();
    cleanupReveal?.();
    cleanupProgress = undefined;
    cleanupReveal = undefined;
    const targets = [
      ...document.querySelectorAll<HTMLElement>('[data-semantic="section"][data-reveal="true"]'),
    ];
    const reduceProgress = media.matches && PAGE_MOTION_POLICY.scrollProgress.normalMotionOnly;
    const reduceReveal = media.matches && PAGE_MOTION_POLICY.sectionReveal.normalMotionOnly;
    if (reduceProgress) {
      document.querySelector('[data-scroll-progress-indicator]')?.remove();
    } else {
      cleanupProgress = installScrollProgress();
    }
    if (reduceReveal) {
      for (const target of targets) {
        target.removeAttribute('data-reveal-pending');
        target.removeAttribute('data-reveal-motion');
        target.setAttribute('data-reveal-shown', '');
        revealed.add(target);
      }
      return;
    }
    cleanupReveal = installSectionReveal(targets, revealed);
  };

  sync();
  return {
    sync,
    destroy: () => {
      cleanupProgress?.();
      cleanupReveal?.();
    },
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

function installSectionReveal(
  targets: readonly HTMLElement[],
  revealed: WeakSet<HTMLElement>,
): (() => void) | undefined {
  if (!('IntersectionObserver' in window)) return undefined;
  const pending = targets.filter((target) => !revealed.has(target));
  if (pending.length === 0) return undefined;
  for (const target of pending) {
    target.setAttribute('data-reveal-pending', '');
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
  if (popover.matches('.semantic-code-term')) portalGlossaryPanel(popover, panel);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  positionGlossaryPortal(popover);
}

function closePopover(popover: HTMLElement, restoreFocus: boolean): void {
  cancelScheduledPopoverClose(popover);
  const trigger = popover.querySelector<HTMLElement>('[data-popover-trigger]');
  const panel = popoverPanel(popover, trigger);
  if (trigger === null || panel === null || panel.hidden) return;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  restoreGlossaryPanel(popover);
  if (restoreFocus) trigger.focus();
}

function schedulePopoverClose(popover: HTMLElement): void {
  cancelScheduledPopoverClose(popover);
  const timeout = window.setTimeout(() => {
    pendingPopoverCloses.delete(popover);
    const portal = glossaryPortals.get(popover);
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
  const panel = target.closest<HTMLElement>('[data-glossary-portal]');
  return panel === null ? null : (glossaryPortalOwners.get(panel) ?? null);
}

function glossaryOwner(target: Element): HTMLElement | null {
  const direct = target.closest<HTMLElement>('[data-glossary-reference]');
  if (direct !== null) return direct;
  const panel = target.closest<HTMLElement>('[data-glossary-portal]');
  return panel === null ? null : (glossaryPortalOwners.get(panel) ?? null);
}

function popoverContains(popover: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (popover.contains(target)) return true;
  return glossaryPortals.get(popover)?.panel.contains(target) === true;
}

function portalGlossaryPanel(popover: HTMLElement, panel: HTMLElement): void {
  if (glossaryPortals.has(popover)) return;
  const placeholder = document.createComment('agentic-report glossary portal');
  panel.replaceWith(placeholder);
  document.body.append(panel);
  panel.dataset.glossaryPortal = '';
  glossaryPortals.set(popover, { panel, placeholder });
  glossaryPortalOwners.set(panel, popover);
  if (glossaryPortals.size === 1) {
    window.addEventListener('resize', positionGlossaryPortals);
    document.addEventListener('scroll', positionGlossaryPortals, true);
  }
}

function restoreGlossaryPanel(popover: HTMLElement): void {
  const portal = glossaryPortals.get(popover);
  if (portal === undefined) return;
  portal.placeholder.replaceWith(portal.panel);
  portal.panel.removeAttribute('data-glossary-portal');
  portal.panel.style.removeProperty('inset');
  portal.panel.style.removeProperty('top');
  portal.panel.style.removeProperty('left');
  portal.panel.style.removeProperty('width');
  glossaryPortals.delete(popover);
  glossaryPortalOwners.delete(portal.panel);
  if (glossaryPortals.size === 0) {
    window.removeEventListener('resize', positionGlossaryPortals);
    document.removeEventListener('scroll', positionGlossaryPortals, true);
  }
}

function positionGlossaryPortals(): void {
  for (const popover of glossaryPortals.keys()) positionGlossaryPortal(popover);
}

function positionGlossaryPortal(popover: HTMLElement): void {
  const portal = glossaryPortals.get(popover);
  const trigger = popover.querySelector<HTMLElement>('[data-glossary-trigger]');
  if (portal === undefined || trigger === null || portal.panel.hidden) return;
  const margin = 16;
  const triggerRect = trigger.getBoundingClientRect();
  portal.panel.style.inset = 'auto';
  portal.panel.style.width = `${Math.min(448, window.innerWidth - margin * 2)}px`;
  const panelRect = portal.panel.getBoundingClientRect();
  const below = window.innerHeight - triggerRect.bottom;
  const placeBelow = below >= panelRect.height || below >= triggerRect.top;
  const top = placeBelow
    ? Math.min(triggerRect.bottom, window.innerHeight - panelRect.height - margin)
    : Math.max(margin, triggerRect.top - panelRect.height);
  const left = Math.min(
    Math.max(margin, triggerRect.left),
    window.innerWidth - panelRect.width - margin,
  );
  portal.panel.style.top = `${Math.max(margin, top)}px`;
  portal.panel.style.left = `${Math.max(margin, left)}px`;
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
