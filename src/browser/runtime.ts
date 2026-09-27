import { asUiButton } from './ui.js';
import './document.css';

import { packageStrings, type PackageLocale } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import type { ReviewArtifact } from '../review/contract.js';
import { placeSurface, visualViewportBounds } from './overlay-position.js';
import { pageClock, progressOverride } from './clock.js';
import { browserIcon } from './icon.js';
import './diagram-motion.js';
import {
  installResponseWorkspaces,
  type ResponseWorkspacesController,
} from './response-workspace.js';
import { installReviewWorkspace, type ReviewWorkspaceController } from './review-workspace.js';
import { installVideoAutoplay } from './video-autoplay.js';
import { lightCodeLines, setBeatStates } from './scenes.js';
import { stillMotionQuery } from './motion-level.js';
import { installPageModules } from './page-modules.js';
import { switchWithTransition } from './view-transitions.js';
import './vocabulary-techniques.js';

const root = document.documentElement;
// Часы создаются первыми: всё, что дальше читает время или просит кадр, идёт через них.
const clock = pageClock();
hydrateSharedImages(document);
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
root.style.setProperty('--scene-parallax', `${PAGE_MOTION_POLICY.scene.parallaxPx}px`);
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
// «Страница стоит»: просьба читателя об уменьшенном движении или `motion: none` в шапке страницы.
const reducedMotion = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let navigationController: NavigationController | undefined;
let motionController: MotionController | undefined;
let galleryController: GalleryController | undefined;
let diagramFitController: { readonly destroy: () => void } | undefined;
let storyController: { readonly destroy: () => void } | undefined;
let slidesController: { readonly destroy: () => void } | undefined;
let pageModules: (() => void) | undefined;
let responseController: ResponseWorkspacesController | undefined;
let reviewController: ReviewWorkspaceController | undefined;
const responseControllers = new Map<PackageLocale, ResponseWorkspacesController>();
const reviewStates = new Map<PackageLocale, ReviewArtifact>();
activateCurrentPage();
installVideoAutoplay(reducedMotion, strings);

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
    const video = videoToggle.closest('figure')?.querySelector('video');
    if (video instanceof HTMLVideoElement) {
      if (video.paused) void video.play().catch(() => undefined);
      else video.pause();
    }
    return;
  }

  const seek = target.closest<HTMLButtonElement>('[data-video-seek]');
  if (seek !== null) {
    const video = seek.closest('figure')?.querySelector('video');
    if (video instanceof HTMLVideoElement) {
      video.currentTime = Number(seek.dataset.videoSeek ?? '0');
      void video.play().catch(() => undefined);
    }
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
    switchTab(tab, false);
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
      switchTab(next, true);
    }
    return;
  }
  if (event.key === 'Escape') {
    const popover = popoverOwner(target);
    if (popover !== null) closePopover(popover, true);
  }
});

document.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches('[data-compare-range]')) {
    setComparePosition(event.target, Number(event.target.value));
    return;
  }
  if (!event.target.matches('[data-filter-input]')) return;
  applyFilter(event.target);
});

/** Граница «до/после» стоит там, куда её поставил ползунок; указатель двигает тот же ползунок. */
function setComparePosition(range: HTMLInputElement, value: number): void {
  const position = Math.min(100, Math.max(0, Math.round(value)));
  range.value = String(position);
  range
    .closest<HTMLElement>('[data-compare]')
    ?.style.setProperty('--compare-position', `${position}%`);
}

document.addEventListener('pointerdown', (event) => {
  // Касание ведут события касаний ниже: Safari на телефоне отменяет указатель, едва жест похож на
  // прокрутку страницы, и перетаскивание по картинке обрывалось.
  if (!(event.target instanceof Element) || event.button !== 0 || event.pointerType === 'touch')
    return;
  const stage = event.target.closest<HTMLElement>('[data-compare-stage]');
  const range = stage?.parentElement?.querySelector<HTMLInputElement>('[data-compare-range]');
  if (stage === undefined || stage === null || range === null || range === undefined) return;
  event.preventDefault();
  const follow = (moving: PointerEvent): void => {
    const box = stage.getBoundingClientRect();
    if (box.width <= 0) return;
    setComparePosition(range, ((moving.clientX - box.left) / box.width) * 100);
  };
  follow(event);
  // Захват указателя на телефоне может не состояться (Safari отказывает, если касание уже отдано
  // прокрутке), поэтому движение слушает окно, а не сцена: перетаскивание работает и без захвата.
  try {
    stage.setPointerCapture(event.pointerId);
  } catch {
    // Без захвата окно всё равно получает движение этого указателя.
  }
  const move = (moving: PointerEvent): void => {
    if (moving.pointerId === event.pointerId) follow(moving);
  };
  const stop = (ending: PointerEvent): void => {
    if (ending.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
});

/**
 * Перетаскивание границы сравнения пальцем. Жест, который начался вбок, принадлежит сравнению: его
 * движение не прокручивает страницу. Жест, начавшийся вверх или вниз, остаётся прокруткой.
 */
document.addEventListener(
  'touchstart',
  (event) => {
    if (!(event.target instanceof Element) || event.touches.length !== 1) return;
    const stage = event.target.closest<HTMLElement>('[data-compare-stage]');
    const range = stage?.parentElement?.querySelector<HTMLInputElement>('[data-compare-range]');
    const first = event.touches[0];
    if (stage === null || stage === undefined || range === null || range === undefined) return;
    if (first === undefined) return;
    const startX = first.clientX;
    const startY = first.clientY;
    let intent: 'undecided' | 'drag' | 'scroll' = 'undecided';
    const follow = (x: number): void => {
      const box = stage.getBoundingClientRect();
      if (box.width > 0) setComparePosition(range, ((x - box.left) / box.width) * 100);
    };
    const move = (moving: TouchEvent): void => {
      const touch = moving.touches[0];
      if (touch === undefined) return;
      if (intent === 'undecided') {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx < 4 && dy < 4) return;
        intent = dx >= dy ? 'drag' : 'scroll';
      }
      if (intent !== 'drag') return;
      moving.preventDefault();
      follow(touch.clientX);
    };
    const end = (ending: TouchEvent): void => {
      if (intent === 'undecided') {
        const touch = ending.changedTouches[0];
        if (touch !== undefined) follow(touch.clientX);
      }
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  },
  { passive: true },
);

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

let sharedImages: Readonly<Record<string, string>> | undefined;

/**
 * Картинка, встреченная в одном файле несколько раз, встроена один раз в общий блок данных; её появления
 * несут только ссылку `data-shared-src` (`src/render/shared-images.ts`). Здесь ссылка становится `src` —
 * при загрузке страницы и в каждой разметке, вставленной позже.
 */
function hydrateSharedImages(scope: ParentNode): void {
  const media = scope.querySelectorAll<HTMLElement>('[data-shared-src], [data-shared-poster]');
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
  pageModules?.();
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
  diagramFitController = createDiagramFitController(page);
  storyController = createStoryController(page, reducedMotion);
  slidesController = createSlidesController(page, reducedMotion);
  pageModules = installPageModules(page, reducedMotion, strings);
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

interface SlideState {
  readonly slide: number;
  readonly step: number;
}

/**
 * Презентация. Страница `layout: slides` показывается слайдами на весь экран: клавиатура, щелчок и
 * касание листают слайды и шаги, адрес `#/слайд/шаг` открывает любой из них, а API
 * `window.agenticSlides` делает то же для записи. Длительность каждого перехода фиксирована и
 * объявлена атрибутом корня; пока переход идёт, `data-slide-state` равен `moving`, по его окончании —
 * `settled`, и приходит событие `agentic-slides:settled`. Вид `?view=film` убирает оболочку, вид
 * `?view=presenter` показывает заметки докладчика. При уменьшенном движении шаги слайда открыты
 * сразу, а переходов нет.
 */
function createSlidesController(
  page: HTMLElement,
  motion: MediaQueryList,
): { readonly destroy: () => void } | undefined {
  if (root.dataset.layout !== 'slides') return undefined;
  const slides = [...page.querySelectorAll<HTMLElement>('article > section[data-slide]')];
  if (slides.length === 0) return undefined;
  const abort = new AbortController();
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'film' || view === 'presenter') root.dataset.view = view;
  root.setAttribute('data-slides-active', '');
  const pace = (): number => Number(getComputedStyle(root).getPropertyValue('--motion-pace')) || 1;
  const stepsOf = (index: number): number =>
    motion.matches ? 0 : Number(slides[index]?.dataset.slideSteps ?? '0');
  const transitionOf = (index: number): string => slides[index]?.dataset.slideTransition ?? 'fade';
  const durationOf = (index: number): number =>
    motion.matches ? 0 : Math.round((SLIDE_TRANSITION_MS[transitionOf(index)] ?? 0) * pace());

  const controls = document.createElement('nav');
  controls.className = 'slide-controls';
  controls.setAttribute('aria-label', strings.slides);
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'slide-control';
  asUiButton(previous, 'secondary', 'md', true);
  previous.setAttribute('aria-label', strings.previousSlide);
  previous.append(browserIcon('arrow-left'));
  const counter = document.createElement('span');
  counter.className = 'slide-counter ui-meta';
  counter.setAttribute('aria-live', 'polite');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'slide-control';
  asUiButton(next, 'secondary', 'md', true);
  next.setAttribute('aria-label', strings.nextSlide);
  next.append(browserIcon('arrow-right'));
  controls.append(previous, counter, next);
  document.body.append(controls);

  let state: SlideState = { slide: 0, step: 0 };
  let timer = 0;
  let settledWaiters: Array<() => void> = [];
  const settle = (): void => {
    timer = 0;
    for (const slide of slides) slide.removeAttribute('data-slide-leaving');
    root.dataset.slideState = 'settled';
    for (const resolve of settledWaiters) resolve();
    settledWaiters = [];
    document.dispatchEvent(
      new CustomEvent('agentic-slides:settled', {
        detail: { slide: state.slide + 1, step: state.step },
      }),
    );
  };
  const show = (target: SlideState, options: { readonly instant?: boolean } = {}): void => {
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
        changedSlide && index === previousSlide && !options.instant,
      );
      element.setAttribute('aria-hidden', String(index !== slide));
      if (index !== slide) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    }
    for (const appear of slides[slide]?.querySelectorAll<HTMLElement>('[data-step]') ?? []) {
      appear.toggleAttribute('data-shown', motion.matches || Number(appear.dataset.step) <= step);
    }
    const duration = options.instant
      ? 0
      : changedSlide
        ? durationOf(slide)
        : changedStep && !motion.matches
          ? Math.round(SLIDE_STEP_MS * pace())
          : 0;
    root.style.setProperty('--slide-duration', `${duration}ms`);
    root.dataset.slideDuration = String(duration);
    counter.textContent = strings.slideCounter(slide + 1, slides.length);
    previous.disabled = slide === 0 && step === 0;
    next.disabled = slide === slides.length - 1 && step === stepsOf(slide);
    const hash = `#/${slide + 1}/${step}`;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
    root.dataset.slideState = 'moving';
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
        target.closest('input, textarea, select, [contenteditable], [role="tablist"], dialog[open]')
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
  motion.addEventListener('change', () => show(state, { instant: true }), { signal: abort.signal });

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
      slide: state.slide + 1,
      step: state.step,
      steps: stepsOf(state.slide),
      duration: Number(root.dataset.slideDuration ?? '0'),
      settled: root.dataset.slideState === 'settled',
    }),
    goto: (slide: number, step = 0): void => show({ slide: slide - 1, step }),
    next: forward,
    previous: backward,
    durationOf: (slide: number): number => durationOf(slide - 1),
    settled: (): Promise<void> =>
      root.dataset.slideState === 'settled'
        ? Promise.resolve()
        : new Promise((resolve) => settledWaiters.push(resolve)),
  };
  Reflect.set(window, 'agenticSlides', api);
  fromHash(true);

  return {
    destroy: () => {
      abort.abort();
      if (timer !== 0) clock.cancelLater(timer);
      controls.remove();
      root.removeAttribute('data-slides-active');
      Reflect.deleteProperty(window, 'agenticSlides');
      for (const slide of slides) {
        slide.removeAttribute('data-slide-current');
        slide.removeAttribute('data-slide-leaving');
        slide.removeAttribute('aria-hidden');
        slide.removeAttribute('inert');
      }
    },
  };
}

/**
 * Режиссура движения страницы: сцены по шагам, заголовки по строкам и досчитывающие числа. Всё это
 * живёт только при обычном движении; при уменьшенном страница остаётся в конечном состоянии.
 */
function createStoryController(
  page: HTMLElement,
  motion: MediaQueryList,
): { readonly destroy: () => void } {
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
    for (const section of page.querySelectorAll<HTMLElement>('[data-scene="steps"]')) {
      // На слайде нет прокрутки страницы, которую сцена могла бы вести: там такты идут подряд.
      // На узком экране сцена стоит над текущим тактом (SPEC 7.3): медиа перед каждым шагом.
      cleanups.push(
        installStepScene(
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
    for (const count of page.querySelectorAll<HTMLElement>('.semantic-count')) {
      cleanups.push(installCount(count));
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

/** Текущий такт — тот, что пересекает середину экрана; ему принадлежат кадр сцены и фокус схемы. */
function installStepScene(section: HTMLElement, live: 'wide' | 'narrow' | undefined): () => void {
  const beats = [...section.querySelectorAll<HTMLElement>('.semantic-beat[data-beat]')];
  const frames = [...section.querySelectorAll<HTMLElement>('img[data-scene-frame]')];
  const clear = (): void => {
    section.removeAttribute('data-scene-live');
    section.removeAttribute('data-scene-narrow');
    section.removeAttribute('data-scene-focus');
    lightCodeLines(section, undefined);
    setBeatStates(section, beats, () => false);
    for (const beat of beats) beat.removeAttribute('data-current');
    for (const frame of frames) frame.removeAttribute('data-scene-active');
    for (const lit of section.querySelectorAll('[data-lit]')) lit.removeAttribute('data-lit');
  };
  clear();
  if (live === undefined || beats.length === 0) {
    // Без движения такты стоят подряд, и каждое их состояние страницы горит: конечная картина.
    setBeatStates(section, beats, () => true);
    return clear;
  }
  section.setAttribute(live === 'wide' ? 'data-scene-live' : 'data-scene-narrow', '');
  const select = (index: number): void => {
    for (const [position, beat] of beats.entries())
      beat.toggleAttribute('data-current', position === index);
    const frame = Math.min(index, frames.length - 1);
    for (const [position, image] of frames.entries())
      image.toggleAttribute('data-scene-active', position === frame);
    lightCodeLines(section, beats[index]);
    setBeatStates(section, beats, (position) => position === index);
    const focus = new Set(
      (beats[index]?.dataset.focus ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    section.toggleAttribute('data-scene-focus', focus.size > 0);
    for (const node of section.querySelectorAll<SVGElement>('[data-node-id]'))
      node.toggleAttribute('data-lit', focus.has(node.dataset.nodeId ?? ''));
    for (const edge of section.querySelectorAll<SVGElement>('[data-from][data-to]'))
      edge.toggleAttribute(
        'data-lit',
        focus.has(edge.dataset.edgeId ?? '') ||
          (focus.has(edge.dataset.from ?? '') && focus.has(edge.dataset.to ?? '')),
      );
  };
  select(0);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        select(beats.indexOf(entry.target as HTMLElement));
      }
    },
    { rootMargin: '-48% 0px -48% 0px', threshold: 0 },
  );
  for (const beat of beats) observer.observe(beat);
  return () => {
    observer.disconnect();
    clear();
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

/**
 * Число досчитывает от нуля до записанного значения, когда показывается. Записанное значение
 * остаётся источником: разделители групп и число знаков после запятой берутся из него, а в конце
 * возвращается ровно записанный текст.
 */
function installCount(element: HTMLElement): () => void {
  const final = element.dataset.countFinal ?? element.textContent ?? '';
  element.dataset.countFinal = final;
  const match = /\d[\d\s,.\u00a0\u202f]*\d|\d/u.exec(final);
  if (match === null) return () => undefined;
  const written = match[0];
  const separators = written.replace(/\d/gu, '');
  const lastSeparator = separators.at(-1);
  const tail =
    lastSeparator === undefined ? '' : written.slice(written.lastIndexOf(lastSeparator) + 1);
  const decimalMark =
    lastSeparator !== undefined &&
    (separators.length === 1 ? tail.length !== 3 : !separators.slice(0, -1).includes(lastSeparator))
      ? lastSeparator
      : undefined;
  const group = [...separators].find((mark) => mark !== decimalMark);
  const decimals = decimalMark === undefined ? 0 : tail.length;
  const value = Number(
    written
      .split(decimalMark ?? '\u0000')
      .map((part) => part.replace(/\D/gu, ''))
      .join('.'),
  );
  const format = (current: number): string => {
    const [whole = '0', fraction] = current.toFixed(decimals).split('.');
    const grouped = group === undefined ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/gu, group);
    return fraction === undefined ? grouped : `${grouped}${decimalMark}${fraction}`;
  };
  let frame = 0;
  let unregister = (): void => undefined;
  const run = (): void => {
    const pace = Number(getComputedStyle(root).getPropertyValue('--motion-pace')) || 1;
    const duration = 900 * pace;
    const start = clock.now();
    // Досчёт — функция времени часов: перемотка назад показывает то же число, что и первый проход.
    const render = (now: number): boolean => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - progress) ** 3;
      element.textContent = progress >= 1 ? final : final.replace(written, format(value * eased));
      return progress < 1;
    };
    const step = (now: number): void => {
      if (render(now)) frame = clock.frame(step);
    };
    unregister = clock.register({ at: (seconds) => render(seconds * 1000) });
    frame = clock.frame(step);
  };
  // Число с `when` считает, когда встаёт его состояние страницы, а не когда показывается.
  const stateObserver = new MutationObserver(() => {
    if (!element.hasAttribute('data-state-on')) return;
    stateObserver.disconnect();
    run();
  });
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    },
    { threshold: 0.6 },
  );
  if (element.dataset.when === undefined) observer.observe(element);
  else if (element.hasAttribute('data-state-on')) run();
  else stateObserver.observe(element, { attributes: true, attributeFilter: ['data-state-on'] });
  return () => {
    observer.disconnect();
    stateObserver.disconnect();
    unregister();
    if (frame !== 0) clock.cancelFrame(frame);
    element.textContent = final;
  };
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

/**
 * Page CSS never draws a diagram smaller than this share of its natural width; the rest scrolls. At this
 * scale the smallest diagram text, a 13px connection label, still renders at 12px.
 */
const DIAGRAM_MINIMUM_SCALE = 12 / 13;
/** Keys with which a reader selects a tab; other keys only pass through the tab list. */
const TAB_SELECTION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']);

/**
 * Shows, until the reader picks a view, a diagram view that fits its frame when the authored one would have
 * to scroll: a flow drawn left to right on a phone is replaced by its top-down view. The authored view stays
 * the one printed and one tab away; a reader's choice is never overridden. When no view fits, the frame
 * first opens scrolled to the start of the flow, so the first look is not its cut middle.
 */
function createDiagramFitController(
  page: HTMLElement,
): { readonly destroy: () => void } | undefined {
  const switchers = [...page.querySelectorAll<HTMLElement>('.visualization-layouts[data-tabs]')];
  if (switchers.length === 0) return undefined;
  const chosen = new WeakSet<HTMLElement>();
  const abort = new AbortController();
  const naturalWidth = (panel: HTMLElement): number =>
    Number(panel.querySelector('svg')?.getAttribute('width') ?? 0);
  const revealed = new WeakSet<HTMLElement>();
  const revealFlowStart = (switcher: HTMLElement): void => {
    const frame = switcher.querySelector<HTMLElement>(
      ':scope > [data-tab-panel]:not([hidden]) .visualization-frame',
    );
    if (frame === null || revealed.has(frame) || frame.scrollWidth <= frame.clientWidth + 1) return;
    // Начало потока — все узлы без входящей прямой связи, а не только первый слой: у потока с двумя
    // источниками второй может лежать в другом слое, и центр одного прятал другой за краем.
    const entered = new Set(
      [...frame.querySelectorAll<SVGElement>('[data-to]:not([data-draw-phase="backward"])')].map(
        (edge) => edge.dataset.to ?? '',
      ),
    );
    const starts = [...frame.querySelectorAll<SVGGElement>('[data-node-id]')]
      .filter((node) => !entered.has(node.dataset.nodeId ?? ''))
      .map((node) => node.getBoundingClientRect());
    if (starts.length === 0) return;
    revealed.add(frame);
    const left = Math.min(...starts.map((box) => box.left));
    const right = Math.max(...starts.map((box) => box.right));
    const frameLeft = frame.getBoundingClientRect().left;
    // Начало потока, которое шире рамки (несколько узлов первого слоя вида сверху вниз), открывается
    // с левого края: центр такого слоя прячет его первые узлы за краем.
    frame.scrollLeft +=
      right - left <= frame.clientWidth
        ? (left + right) / 2 - frameLeft - frame.clientWidth / 2
        : left - frameLeft - 8;
  };
  const fitView = (switcher: HTMLElement): void => {
    const available = switcher.clientWidth;
    if (chosen.has(switcher) || available <= 0) return;
    const panels = [...switcher.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.matches('[data-tab-panel]'),
    );
    const authored = panels.find((panel) => panel.hasAttribute('data-layout-default'));
    if (authored === undefined) return;
    const fits = (panel: HTMLElement): boolean =>
      naturalWidth(panel) * DIAGRAM_MINIMUM_SCALE <= available;
    const fitting = panels.filter(fits);
    const target = fits(authored)
      ? authored
      : (fitting.sort((left, right) => naturalWidth(right) - naturalWidth(left))[0] ??
        [...panels].sort((left, right) => naturalWidth(left) - naturalWidth(right))[0]);
    if (target?.hidden) {
      const control = switcher.querySelector<HTMLButtonElement>(
        `[data-tab][aria-controls="${CSS.escape(target.id)}"]`,
      );
      if (control !== null) activateTab(control, false);
    }
    revealFlowStart(switcher);
  };
  const markChosen = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-tab]') === null) return;
    if (event instanceof KeyboardEvent && !TAB_SELECTION_KEYS.has(event.key)) return;
    const switcher = target.closest<HTMLElement>('.visualization-layouts[data-tabs]');
    if (switcher === null) return;
    chosen.add(switcher);
    // The delegated tab handler shows the chosen view after this listener; reveal its start then.
    clock.frame(() => revealFlowStart(switcher));
  };
  for (const switcher of switchers) {
    switcher.addEventListener('click', markChosen, { signal: abort.signal });
    switcher.addEventListener('keydown', markChosen, { signal: abort.signal });
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) if (entry.target instanceof HTMLElement) fitView(entry.target);
  });
  for (const switcher of switchers) observer.observe(switcher);
  return {
    destroy: () => {
      abort.abort();
      observer.disconnect();
    },
  };
}

function createCopyButton(kind: 'code' | 'prose'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = kind === 'code' ? 'copy-code' : 'copy-prose';
  asUiButton(button, kind === 'code' ? 'quiet' : 'secondary', 'sm');
  if (kind === 'code') button.dataset.copyCode = '';
  else button.dataset.copyProse = '';
  const label = document.createElement('span');
  label.dataset.copyLabel = '';
  if (kind === 'code') label.dataset.copyCodeLabel = '';
  label.textContent = strings.copy;
  button.append(browserIcon('copy'), label);
  return button;
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
    root.dataset.navMode = desktop.matches ? 'sidebar' : 'dialog';
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
        fallbackScrollTimer = clock.later(() => {
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
    if (!supportsScrollEnd) clock.frame(() => alignPendingInitialHash());
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
      themeObserver.disconnect();
      delete root.dataset.navMode;
      pendingInitialHashOwner = undefined;
      cancelFallbackScrollSelection();
      bottomSentinel.remove();
      root.removeAttribute('data-nav-collapsed');
      root.removeAttribute('data-nav-toggled');
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
  const paint = (scene: HTMLElement): void => {
    // Смещение сцены `progress` рисует шкала прокрутки браузера (`animation-timeline: view()`); прогресс
    // здесь — запасной путь без неё, путь записи по часам и опубликованная переменная `--scene-progress`.
    const rect = scene.getBoundingClientRect();
    const span = rect.height + innerHeight;
    const progress =
      progressOverride(scene) ??
      (span <= 0 ? 0 : Math.min(1, Math.max(0, (innerHeight - rect.top) / span)));
    scene.style.setProperty('--scene-progress', progress.toFixed(4));
  };
  const update = (): void => {
    frame = 0;
    for (const scene of activeScenes) paint(scene);
  };
  // Перемотка часов ставит прогресс сразу: по положению на экране или по выставленному записью.
  const unregister = clock.register({
    at: () => {
      for (const scene of scenes)
        if (activeScenes.has(scene) || progressOverride(scene) !== undefined) paint(scene);
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
    segment.title = chapter.querySelector(':scope > h2')?.textContent?.trim() ?? chapter.id;
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
    let current = -1;
    for (const [index, chapter] of chapters.entries()) {
      const box = chapter.getBoundingClientRect();
      const fill = atEnd ? 1 : Math.min(1, Math.max(0, (line - box.top) / Math.max(1, box.height)));
      const segment = segments[index];
      if (segment === undefined) continue;
      segment.style.setProperty('--chapter-fill', fill.toFixed(3));
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

/** Выбор читателя меняет вкладку переходом вида; смена вида раскладкой схемы идёт мгновенно. */
function switchTab(control: HTMLButtonElement, moveFocus: boolean): void {
  const from = control
    .closest<HTMLElement>('[data-tabs]')
    ?.querySelector<HTMLElement>(':scope > [data-tab-panel]:not([hidden])');
  const to = document.getElementById(control.getAttribute('aria-controls') ?? '');
  switchWithTransition(from, to, reducedMotion, () => activateTab(control, moveFocus));
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
  clock.later(() => {
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
