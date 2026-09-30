/**
 * The core runtime of every page. Feature modules (`features/*.ts`), bundled before this module only on
 * pages that need them, fill the slots of `features.ts`; this module calls them where their behaviour
 * belongs and skips a slot nobody filled.
 */

import { packageStrings, type PackageLocale } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import type { ReviewArtifact } from '../review/contract.js';
import { pageClock, progressOverride } from './clock.js';
import { type Destroyable, feature } from './features.js';
import { hashTarget } from './hash-target.js';
import type { ResponseWorkspacesController } from './response-workspace.js';
import type { ReviewWorkspaceController } from './review-workspace.js';
import { stillMotionQuery } from './motion-level.js';
import { installPageModules } from './page-modules.js';
import { restingTop } from './reading-position.js';
import { textWithoutEditionLayer } from './edition-text.js';
import './techniques.js';

const root = document.documentElement;
// Часы создаются первыми: всё, что дальше читает время или просит кадр, идёт через них.
const clock = pageClock();
hydrateSharedImages(document);
const localizedPage = createLocalizedPageController();
let strings = packageStrings(root.dataset.packageLocale);
const currentStrings = () => strings;
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
root.style.setProperty('--scene-parallax', `${PAGE_MOTION_POLICY.scene.parallaxPx}px`);
root.style.setProperty('--motion-tilt', `${PAGE_MOTION_POLICY.pointer.tiltDegrees}deg`);
root.style.setProperty('--motion-magnetic', `${PAGE_MOTION_POLICY.pointer.magneticPx}px`);
// «Страница стоит»: просьба читателя об уменьшенном движении или `motion: none` в шапке страницы.
const reducedMotion = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let navigationController: NavigationController | undefined;
let motionController: MotionController | undefined;
let galleryController: Destroyable | undefined;
let diagramFitController: Destroyable | undefined;
let storyController: Destroyable | undefined;
let slidesController: Destroyable | undefined;
let decksController: Destroyable | undefined;
let pageModules: (() => void) | undefined;
let responseController: ResponseWorkspacesController | undefined;
let reviewController: ReviewWorkspaceController | undefined;
const responseControllers = new Map<PackageLocale, ResponseWorkspacesController>();
const reviewStates = new Map<PackageLocale, ReviewArtifact>();
activateCurrentPage();
feature('video')?.autoplay(reducedMotion, strings);

reducedMotion.addEventListener('change', () => motionController?.sync());
finePointer.addEventListener('change', () => motionController?.sync());

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.matches('[data-nav-dialog]')) {
    navigationController?.closeMobile(true);
    return;
  }
  feature('popover')?.closeOutside(target);

  const schemeToggle = target.closest<HTMLButtonElement>('[data-scheme-toggle]');
  if (schemeToggle !== null) {
    const current = root.dataset.scheme;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = current === 'system' ? (systemDark ? 'dark' : 'light') : current;
    root.dataset.scheme = resolved === 'dark' ? 'light' : 'dark';
    return;
  }

  const videoToggle = target.closest<HTMLButtonElement>('[data-video-toggle]');
  if (videoToggle !== null) {
    feature('video')?.toggle(videoToggle);
    return;
  }

  const seek = target.closest<HTMLButtonElement>('[data-video-seek]');
  if (seek !== null) {
    feature('video')?.seek(seek);
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
    feature('tabs')?.select(tab, false);
    return;
  }

  const modalOpen = target.closest<HTMLButtonElement>('[data-modal-open]');
  if (modalOpen !== null) {
    feature('modal')?.open(modalOpen);
    return;
  }

  const modalClose = target.closest<HTMLButtonElement>('[data-modal-close]');
  if (modalClose !== null) {
    feature('modal')?.close(modalClose);
    return;
  }

  const popoverTrigger = target.closest<HTMLElement>('[data-popover-trigger]');
  if (popoverTrigger !== null) {
    feature('popover')?.trigger(popoverTrigger);
    return;
  }

  const toggle = target.closest<HTMLButtonElement>('[data-toggle-control]');
  if (toggle !== null) {
    feature('toggle')?.(toggle);
    return;
  }

  const increment = target.closest<HTMLButtonElement>('[data-demo-increment]');
  if (increment !== null) {
    feature('demo')?.increment(increment);
    return;
  }

  const copy = target.closest<HTMLButtonElement>('[data-copy-code], [data-copy-prose]');
  if (copy !== null) void feature('copy')?.run(copy, currentStrings);
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.matches('[data-theme-select]')) {
    applyTheme(target.value);
    return;
  }
  if (!target.matches('[data-language-select]')) return;
  if (target.value !== 'en' && target.value !== 'ru') return;
  switchPageLocale(target.value);
});

/**
 * Тема меняется целиком: её имя включает её переменные, а атрибуты — её приёмы оболочки. Цветовую
 * схему она не трогает — светлый или тёмный режим остаётся там, куда его поставил читатель.
 */
function applyTheme(name: string): void {
  const template = document.querySelector<HTMLTemplateElement>('template[data-theme-catalog]');
  if (template === null) return;
  let catalog: Record<string, Record<string, string>>;
  try {
    catalog = JSON.parse(template.content.textContent ?? '{}') as Record<
      string,
      Record<string, string>
    >;
  } catch {
    return;
  }
  const attributes = catalog[name];
  if (attributes === undefined) return;
  const root = document.documentElement;
  for (const [attribute, value] of Object.entries(attributes)) {
    if (attribute.startsWith('data-theme')) root.setAttribute(attribute, value);
  }
  for (const select of document.querySelectorAll<HTMLSelectElement>('[data-theme-select]')) {
    select.value = name;
  }
}

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (feature('gallery')?.keydown(event, target) === true) return;
  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab !== null && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    feature('tabs')?.key(event, tab);
    return;
  }
  if (event.key === 'Escape') feature('popover')?.escape(target);
});

document.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches('[data-compare-range]')) {
    feature('compare')?.input(event.target);
    return;
  }
  if (!event.target.matches('[data-filter-input]')) return;
  feature('filter')?.(event.target, strings);
});

const compare = feature('compare');
if (compare !== undefined) {
  document.addEventListener('pointerdown', compare.pointerDown);
  // Перетаскивание границы сравнения пальцем (`features/compare.ts`).
  document.addEventListener('touchstart', compare.touchStart, { passive: true });
}

const popover = feature('popover');
if (popover !== undefined) {
  document.addEventListener('pointerover', (event) => {
    if (event.target instanceof Element) popover.pointerOver(event.target);
  });
  document.addEventListener('pointerout', (event) => {
    if (event.target instanceof Element) popover.pointerOut(event.target, event.relatedTarget);
  });
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Element) popover.focusIn(event.target);
  });
  document.addEventListener('focusout', (event) => {
    if (event.target instanceof Element) popover.focusOut(event.target, event.relatedTarget);
  });
}

const modal = feature('modal');
if (modal !== undefined)
  document.addEventListener(
    'close',
    (event) => {
      if (event.target instanceof HTMLDialogElement) modal.closed(event.target);
    },
    true,
  );

let sharedImages: Readonly<Record<string, string>> | undefined;

/**
 * Картинка, встреченная в одном файле несколько раз, встроена один раз в общий блок данных; её появления
 * несут только ссылку `data-shared-src` (`src/render/shared-images.ts`). Здесь ссылка становится `src` —
 * при загрузке страницы и в каждой разметке, вставленной позже.
 */
function hydrateSharedImages(scope: ParentNode): void {
  const media = scope.querySelectorAll<HTMLElement>(
    '[data-shared-src], [data-shared-poster], [data-shared-dark-src], [data-shared-dark-poster]',
  );
  if (media.length === 0) return;
  sharedImages ??= JSON.parse(
    document.getElementById('agentic-shared-images')?.textContent ?? '{}',
  ) as Record<string, string>;
  const reload = new Set<HTMLMediaElement>();
  for (const element of media) {
    const src = sharedImages[element.dataset.sharedSrc ?? ''];
    if (src !== undefined) {
      element.setAttribute('src', src);
      delete element.dataset.sharedSrc;
      // Источник ролика выбирается при загрузке: после подстановки ролик выбирает заново.
      const video = element.closest('video, audio');
      if (video instanceof HTMLMediaElement && element.tagName === 'SOURCE') reload.add(video);
    }
    const poster = sharedImages[element.dataset.sharedPoster ?? ''];
    if (poster !== undefined) {
      element.setAttribute('poster', poster);
      delete element.dataset.sharedPoster;
    }
    // Dark variants (`scheme-media.ts`) are shared the same way.
    const darkSrc = sharedImages[element.dataset.sharedDarkSrc ?? ''];
    if (darkSrc !== undefined) {
      element.dataset.darkSrc = darkSrc;
      delete element.dataset.sharedDarkSrc;
    }
    const darkPoster = sharedImages[element.dataset.sharedDarkPoster ?? ''];
    if (darkPoster !== undefined) {
      element.dataset.darkPoster = darkPoster;
      delete element.dataset.sharedDarkPoster;
    }
  }
  for (const video of reload) video.load();
}

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
    hydrateSharedImages(next);
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
  diagramFitController?.destroy();
  storyController?.destroy();
  slidesController?.destroy();
  decksController?.destroy();
  pageModules?.();
  feature('popover')?.closeAll();
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
  galleryController = feature('gallery')?.create(page, currentStrings);
  diagramFitController = feature('diagramFit')?.(page);
  storyController = createStoryController(page, reducedMotion);
  slidesController = feature('slides')?.(page, reducedMotion, currentStrings);
  decksController = feature('decks')?.(page, reducedMotion, currentStrings);
  pageModules = installPageModules(page, reducedMotion, strings);
  const installResponse = feature('response');
  if (installResponse !== undefined) {
    responseController = responseControllers.get(localizedPage.locale());
    if (responseController === undefined) {
      responseController = installResponse(page);
      responseControllers.set(localizedPage.locale(), responseController);
    }
  }
  reviewController = feature('review')?.(page, reviewStates.get(localizedPage.locale()));
  const filter = feature('filter');
  if (filter !== undefined)
    for (const input of page.querySelectorAll<HTMLInputElement>('[data-filter-input]'))
      filter(input, strings);
  feature('code')?.(page, strings);
  feature('copyable')?.(page, strings);
}

/**
 * Режиссура движения страницы: сцены по шагам, заголовки по строкам и досчитывающие числа. Всё это
 * живёт только при обычном движении; при уменьшенном страница остаётся в конечном состоянии.
 */
function createStoryController(page: HTMLElement, motion: MediaQueryList): Destroyable {
  let cleanups: Array<() => void> = [];
  const wide = window.matchMedia('(min-width: 57rem)');
  let installedFor: string | undefined;
  const install = (): void => {
    // Chromium присылает `change` и без смены ответа запроса — при снимке всей страницы. Переустановка
    // вернула бы заголовки и числа в начало, поэтому она идёт только при настоящей смене.
    const conditions = `${wide.matches} ${motion.matches}`;
    if (conditions === installedFor) return;
    installedFor = conditions;
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    const stepScene = feature('stepScene');
    if (stepScene !== undefined)
      for (const section of page.querySelectorAll<HTMLElement>('[data-scene="steps"]')) {
        // На слайде нет прокрутки страницы, которую сцена могла бы вести: там такты идут подряд.
        // На узком экране сцена стоит над текущим тактом (SPEC 7.3): медиа перед каждым шагом.
        cleanups.push(
          stepScene(
            section,
            motion.matches || root.dataset.layout === 'slides'
              ? undefined
              : wide.matches
                ? 'wide'
                : 'narrow',
          ),
        );
      }
    if (motion.matches) return;
    for (const section of page.querySelectorAll<HTMLElement>('[data-transition="lines"]')) {
      cleanups.push(installTitleLines(section));
    }
    const count = feature('count');
    if (count !== undefined)
      for (const element of page.querySelectorAll<HTMLElement>('.semantic-count')) {
        cleanups.push(count(element));
      }
  };
  install();
  wide.addEventListener('change', install);
  motion.addEventListener('change', install);
  return {
    destroy: () => {
      wide.removeEventListener('change', install);
      motion.removeEventListener('change', install);
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
    },
  };
}

/**
 * Заголовок раскрывается по строкам: число строк меряется после загрузки шрифтов и заново при смене
 * ширины. Текст заголовка не трогается — строки открывает маска, — поэтому заметки ревью и
 * копирование видят тот же текст, что в разметке.
 */
function installTitleLines(section: HTMLElement): () => void {
  const title = section.querySelector<HTMLElement>(':scope > .semantic-section-title');
  if (title === null) return () => undefined;
  let active = true;
  const measure = (): void => {
    if (!active) return;
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    const lines = Math.max(
      1,
      Math.round(title.getBoundingClientRect().height / (lineHeight > 0 ? lineHeight : 1)),
    );
    section.style.setProperty('--title-line-count', String(lines));
  };
  measure();
  void document.fonts.ready.then(measure);
  const resize = new ResizeObserver(measure);
  resize.observe(title);
  section.dataset.titleLines = 'pending';
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      section.dataset.titleLines = 'shown';
      observer.disconnect();
    },
    { threshold: 0.2 },
  );
  observer.observe(title);
  return () => {
    active = false;
    observer.disconnect();
    resize.disconnect();
    delete section.dataset.titleLines;
    section.style.removeProperty('--title-line-count');
  };
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
  // Страница без верхней панели (`topbar: false`) не несёт ни кнопки оглавления, ни строки текущего
  // раздела: оглавление сбоку и выбор текущего раздела работают без них, а отступ якоря — от края.
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]') ?? undefined;
  const toggleLabel = toggle?.querySelector<HTMLElement>('[data-nav-toggle-label]') ?? undefined;
  const currentLabel = document.querySelector<HTMLElement>('[data-topbar-current]') ?? undefined;
  const topbar = document.querySelector<HTMLElement>('.topbar') ?? undefined;
  if (
    navigation === null ||
    desktopHost === null ||
    dialog === null ||
    dialogContent === undefined ||
    dialogContent === null ||
    close === undefined ||
    close === null ||
    (topbar !== undefined &&
      (toggle === undefined || toggleLabel === undefined || currentLabel === undefined))
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

  const wide = window.matchMedia('(min-width: 57rem)');
  // На лендинге оглавление открывается из верхней панели при любой ширине: рамка навигации не стоит над
  // первым экраном. Исключение — оформление с боковой колонкой, где оглавление стоит сбоку, а не сверху.
  const desktop = {
    get matches(): boolean {
      return (
        wide.matches &&
        root.dataset.layout !== 'slides' &&
        root.dataset.layout !== 'screens' &&
        (root.dataset.layout !== 'landing' || root.dataset.themeLanding === 'ledger')
      );
    },
  };
  const outside = [...document.querySelectorAll<HTMLElement>('[data-nav-outside]')];
  let desktopExpanded = true;
  let focusAfterClose: HTMLElement | undefined;
  let currentObserver: IntersectionObserver | undefined;
  let currentObserverSuspended = false;
  const supportsScrollEnd = 'onscrollend' in window;
  let fallbackScrollTimer: number | undefined;
  const navigationOffset = 16;
  const hashOwnershipOverlap = 1;
  const syncTopbarClearance = (): void => {
    root.style.setProperty(
      '--topbar-clearance',
      `${Math.ceil(topbar?.offsetHeight ?? 0) + navigationOffset - hashOwnershipOverlap}px`,
    );
  };
  const topbarObserver = new ResizeObserver(syncTopbarClearance);
  if (topbar !== undefined) topbarObserver.observe(topbar);
  syncTopbarClearance();
  const cancelFallbackScrollSelection = (): void => {
    if (fallbackScrollTimer === undefined) return;
    clock.cancelLater(fallbackScrollTimer);
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
    if (currentLabel !== undefined)
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
      if (restingTop(owner.heading) <= line) selected = owner;
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
    if (toggle === undefined || toggleLabel === undefined) return;
    toggle.setAttribute('aria-expanded', String(desktopExpanded));
    toggle.setAttribute(
      'aria-label',
      desktopExpanded ? strings.hideContents : strings.showContents,
    );
    toggle.title = desktopExpanded ? strings.hideContents : strings.showContents;
    toggleLabel.textContent = desktopExpanded ? strings.hideContents : strings.showContents;
  };

  const applyViewport = (): void => {
    root.dataset.navMode = desktop.matches ? 'sidebar' : 'dialog';
    if (desktop.matches) {
      if (dialog.open) {
        focusAfterClose = toggle;
        dialog.close();
      }
      desktopHost.append(navigation);
      toggle?.setAttribute('aria-controls', navigation.id);
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
    if (toggle === undefined || toggleLabel === undefined) return;
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
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-label', strings.closeContents);
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
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', strings.openContents);
      }
      const target = focusAfterClose ?? toggle;
      focusAfterClose = undefined;
      target?.focus({ preventScroll: true });
    },
    { signal: abort.signal },
  );
  wide.addEventListener('change', applyViewport, { signal: abort.signal });
  // Переключатель темы меняет приёмы оболочки, а с ними и место оглавления.
  const themeObserver = new MutationObserver(applyViewport);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme-landing'] });
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
        // Переход по якорю ведёт рантайм покадрово (`reading-position.ts`): каждый его кадр — отдельная
        // мгновенная прокрутка, и текущая глава выбирается, когда переход кончился, а не на каждом кадре.
        if (root.hasAttribute('data-reading-travel')) return;
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
        fallbackScrollTimer = clock.later(() => {
          fallbackScrollTimer = undefined;
          if (root.hasAttribute('data-reading-travel')) return;
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
  // Место якоря адреса ставит модуль места чтения (`reading-position.ts`); здесь — только текущая глава.
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
      root.toggleAttribute('data-nav-toggled', true);
      updateDesktopState();
      toggle?.focus();
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
      themeObserver.disconnect();
      delete root.dataset.navMode;
      cancelFallbackScrollSelection();
      bottomSentinel.remove();
      root.removeAttribute('data-nav-collapsed');
      root.removeAttribute('data-nav-toggled');
      root.style.removeProperty('--topbar-clearance');
    },
  };
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
        '[data-semantic="section"][data-reveal="true"], [data-semantic="section"][data-transition="reveal"], [data-semantic="section"][data-transition="stagger"], [data-semantic="section"][data-transition="clip"]',
      ),
    ];
    const reducePageProgress = media.matches && PAGE_MOTION_POLICY.progress.pageNormalMotionOnly;
    const reduceReveal = media.matches && PAGE_MOTION_POLICY.sectionReveal.normalMotionOnly;
    const progress =
      root.dataset.progress === 'chapters' || root.dataset.progress === 'nodes'
        ? installChapterProgress()
        : root.dataset.progress === 'page' && !reducePageProgress
          ? installScrollProgress()
          : undefined;
    if (progress) cleanups.push(progress);
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
  // Смещение сцены `progress` рисует шкала прокрутки браузера (`animation-timeline: view()`); прогресс
  // здесь — запасной путь без неё, путь записи по часам и опубликованная переменная `--scene-progress`.
  // Сначала читаются все коробки, потом пишутся все переменные: чтение после записи заставило бы браузер
  // пересчитывать стиль и раскладку страницы на каждую сцену кадра.
  const paint = (painted: Iterable<HTMLElement>): void => {
    const progress = [...painted].map((scene): [HTMLElement, number] => {
      const override = progressOverride(scene);
      if (override !== undefined) return [scene, override];
      const rect = scene.getBoundingClientRect();
      const span = rect.height + innerHeight;
      return [scene, span <= 0 ? 0 : Math.min(1, Math.max(0, (innerHeight - rect.top) / span))];
    });
    for (const [scene, value] of progress)
      scene.style.setProperty('--scene-progress', value.toFixed(4));
  };
  const update = (): void => {
    frame = 0;
    paint(activeScenes);
  };
  // Перемотка часов ставит прогресс сразу: по положению на экране или по выставленному записью.
  const unregister = clock.register({
    at: () => {
      paint(
        scenes.filter((scene) => activeScenes.has(scene) || progressOverride(scene) !== undefined),
      );
    },
  });
  const schedule = (): void => {
    if (activeScenes.size > 0 && frame === 0) frame = clock.frame(update);
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
    unregister();
    observer.disconnect();
    activeScenes.clear();
    if (frame !== 0) clock.cancelFrame(frame);
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
    if (frame === 0) frame = clock.frame(flush);
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
    if (frame !== 0) clock.cancelFrame(frame);
    for (const owner of owners) reset(owner);
  };
}

/**
 * Сквозной элемент страницы: по отрезку на главу вдоль нижнего края верхней панели. Отрезок
 * заполняется, пока читатель идёт по главе, текущая глава выделена, щелчок переносит к главе. Для
 * чтения с клавиатуры и экранного чтеца то же даёт оглавление, поэтому полоса скрыта от них.
 */
function installChapterProgress(): (() => void) | undefined {
  const topbar = document.querySelector<HTMLElement>('.topbar');
  const chapters = [
    ...document.querySelectorAll<HTMLElement>('article > section[data-semantic="section"][id]'),
  ].filter((section) => section.closest('[hidden]') === null);
  if (topbar === null || chapters.length < 2) return undefined;
  const bar = document.createElement('div');
  bar.className = 'chapter-progress';
  bar.dataset.chapterProgress = '';
  // Вид «ряд узлов» (SPEC 7.7): узел на главу, пройденные залиты, текущий обведён.
  if (root.dataset.progress === 'nodes') bar.dataset.variant = 'nodes';
  bar.setAttribute('aria-hidden', 'true');
  const segments = chapters.map((chapter) => {
    const segment = document.createElement('a');
    segment.className = 'chapter-progress-segment';
    segment.href = `#${chapter.id}`;
    segment.tabIndex = -1;
    const heading = chapter.querySelector(':scope > h2');
    segment.title = heading === null ? chapter.id : textWithoutEditionLayer(heading).trim();
    bar.append(segment);
    return segment;
  });
  topbar.append(bar);
  let frame = 0;
  const update = (): void => {
    frame = 0;
    const line = topbar.getBoundingClientRect().bottom + window.innerHeight * 0.3;
    const atEnd =
      Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1;
    // Сначала все коробки глав, потом все записи в полосу: запись между чтениями заставила бы браузер
    // пересчитывать стиль и раскладку страницы на каждую главу каждого кадра прокрутки.
    const boxes = chapters.map((chapter) => chapter.getBoundingClientRect());
    let current = -1;
    for (const [index, box] of boxes.entries()) {
      const fill = atEnd ? 1 : Math.min(1, Math.max(0, (line - box.top) / Math.max(1, box.height)));
      const segment = segments[index];
      if (segment === undefined) continue;
      const value = fill.toFixed(3);
      if (segment.style.getPropertyValue('--chapter-fill') !== value)
        segment.style.setProperty('--chapter-fill', value);
      segment.toggleAttribute('data-passed', fill >= 1);
      if (box.top <= line) current = index;
    }
    for (const [index, segment] of segments.entries()) {
      segment.toggleAttribute('data-current', index === current);
    }
  };
  const schedule = (): void => {
    if (frame === 0) frame = clock.frame(update);
  };
  const unregister = clock.register({
    at: () => {
      if (frame !== 0) clock.cancelFrame(frame);
      update();
    },
  });
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    unregister();
    document.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
    bar.remove();
  };
}

function installScrollProgress(): (() => void) | undefined {
  const topbar = document.querySelector<HTMLElement>('.topbar');
  if (topbar === null) return undefined;
  const indicator = document.createElement('div');
  indicator.className = 'scroll-progress';
  indicator.dataset.scrollProgressIndicator = '';
  indicator.setAttribute('aria-hidden', 'true');
  topbar.append(indicator);
  let frame = 0;
  const update = (): void => {
    frame = 0;
    const maximum = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const progress = maximum <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / maximum));
    indicator.hidden = maximum <= 0;
    indicator.style.transform = `scaleX(${progress})`;
  };
  const schedule = (): void => {
    if (frame === 0) frame = clock.frame(update);
  };
  const unregister = clock.register({
    at: () => {
      if (frame !== 0) clock.cancelFrame(frame);
      update();
    },
  });
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    unregister();
    document.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
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
    // A section can be taller than the viewport; no fraction of its total height is required.
    { threshold: 0 },
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
