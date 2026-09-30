/*! agentic-report script: contents */
/** The sticky numbered contents of a landing (`:::contents{sticky}`): the current chapter is marked. */

import { type Cleanup, provideFeature } from '../features.js';
import { currentChapter, watchScroll } from '../technique-timing.js';

function installStickyContents(nav: HTMLElement): Cleanup {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const sections = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((section): section is HTMLElement => section !== null);
  if (sections.length < 2) return () => undefined;
  nav.setAttribute('data-sticky-live', '');
  const article = nav.closest('article');
  const stop = watchScroll(() => {
    // Колонка оглавления стоит у левого края статьи, в поле, которое стиль статьи для неё освобождает.
    if (article !== null)
      nav.style.setProperty('--sticky-contents-left', `${article.getBoundingClientRect().left}px`);
    const current = currentChapter(sections);
    for (const [index, link] of links.entries()) {
      if (index === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  });
  return () => {
    stop();
    nav.removeAttribute('data-sticky-live');
    nav.style.removeProperty('--sticky-contents-left');
    for (const link of links) link.removeAttribute('aria-current');
  };
}

provideFeature('stickyContents', installStickyContents);
