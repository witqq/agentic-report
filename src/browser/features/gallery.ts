/*! agentic-report script: gallery */
/**
 * Gallery rails of a gallery section: a rail that really scrolls becomes a focusable group that the
 * arrow keys move; one that fits keeps no scroll semantics.
 */

import type { PackageStrings } from '../../localization.js';
import { type Destroyable, provideFeature } from '../features.js';

function createGalleryController(
  page: HTMLElement,
  strings: () => PackageStrings,
): Destroyable | undefined {
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
        rail.setAttribute('aria-label', strings().scrollableGallery);
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

provideFeature('gallery', {
  create: createGalleryController,
  keydown: (event, target) => {
    const gallery = target.closest<HTMLElement>('[data-gallery-scroller]');
    if (gallery !== target || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight'))
      return false;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    gallery.scrollBy({ left: direction * Math.max(40, gallery.clientWidth * 0.8) });
    return true;
  },
});
