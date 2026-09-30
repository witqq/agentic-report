/**
 * Media that follow the colour scheme. An image with a dark variant carries it in `data-dark-src`
 * (`![alt](shot.png){dark="shot-dark.png"}`), a video poster in `data-dark-poster`
 * (`::video{poster dark-poster}`); the light source stays in `src` and `poster`, so a page without the
 * runtime shows the light one.
 *
 * The scheme is read from the element, not from the root: its used `color-scheme` is `dark` on a dark
 * page, on `scheme: system` while the system is dark, and inside a contrast band of a light page, where
 * the band takes the opposite scheme of the theme. A value that still allows both schemes (`light dark`,
 * the root of `system`) follows `prefers-color-scheme`. The swap follows the scheme toggle, the theme
 * switcher, the system setting and markup inserted later (a language switch, an opened viewer). Print
 * shows the light variant: the printed page is paper.
 */

const DARK_SRC = 'darkSrc';
const LIGHT_SRC = 'lightSrc';
const DARK_POSTER = 'darkPoster';
const LIGHT_POSTER = 'lightPoster';
const SELECTOR = 'img[data-dark-src], video[data-dark-poster]';

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const print = window.matchMedia('print');
let printing = false;

function isDark(element: Element): boolean {
  if (printing || print.matches) return false;
  const used = getComputedStyle(element).colorScheme.split(/\s+/u);
  const dark = used.includes('dark');
  const light = used.includes('light');
  if (dark && !light) return true;
  if (light && !dark) return false;
  return systemDark.matches;
}

function swap(
  element: HTMLElement,
  attribute: 'src' | 'poster',
  darkKey: string,
  lightKey: string,
): void {
  const dark = element.dataset[darkKey];
  if (dark === undefined) return;
  const current = element.getAttribute(attribute);
  if (element.dataset[lightKey] === undefined) {
    // The light source may still wait for the shared-image block; it is remembered once it is there.
    if (current === null) return;
    element.dataset[lightKey] = current;
  }
  const wanted = isDark(element) ? dark : element.dataset[lightKey];
  if (wanted !== undefined && wanted !== current) element.setAttribute(attribute, wanted);
}

function sync(): void {
  for (const element of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    if (element instanceof HTMLImageElement) swap(element, 'src', DARK_SRC, LIGHT_SRC);
    else swap(element, 'poster', DARK_POSTER, LIGHT_POSTER);
  }
}

function concernsMedia(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') return true;
  for (const node of mutation.addedNodes) {
    if (!(node instanceof Element)) continue;
    if (node.matches(SELECTOR) || node.querySelector(SELECTOR) !== null) return true;
  }
  return false;
}

function install(): void {
  if (document.querySelector(SELECTOR) === null && document.querySelector('template') === null)
    return;
  sync();
  new MutationObserver((mutations) => {
    if (mutations.some(concernsMedia)) sync();
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-scheme', 'data-theme', 'data-dark-src', 'data-dark-poster'],
  });
  systemDark.addEventListener('change', sync);
  print.addEventListener('change', sync);
  window.addEventListener('beforeprint', () => {
    printing = true;
    sync();
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    sync();
  });
}

// The runtime puts shared images in place synchronously after its imports; the first sync waits for it.
queueMicrotask(install);
