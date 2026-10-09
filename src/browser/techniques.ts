/**
 * Приёмы словаря в браузере. Ядро держит их жизненный цикл: ставит приёмы на текущую языковую версию
 * страницы и переставляет, когда страница меняет язык или читатель меняет просьбу о движении. Сами приёмы
 * — проигрываемая сцена `demo`, замена слова `:swap`, набор строки `:typing`, пометка от руки `:mark`, лупа
 * `spotlight`, построчная печать лога (`transition="log"`), начало и мягкий стык петли видео, кнопка
 * «Развернуть» у клипа, вертикальные вкладки, липкое нумерованное оглавление лендинга — живут в модулях
 * своих возможностей (`features/*.ts`) и приходят сюда через их слоты; моноширинные подписи по краям
 * экрана (`chrome.edges: mono`) — приём оформления темы, он в ядре.
 *
 * Всё, что движется, идёт по часам страницы: время — `clock.now()`, кадры — `clock.frame`, а перемотка
 * `__clock.seek(t)` приводит каждый приём к моменту `t` через `clock.register`. Состояние от прокрутки
 * выставляется записью через `data-clock-progress`. Когда страница стоит (уменьшенное движение или
 * `motion: none`), приёмы не ставятся вовсе: разметка сама по себе — их конечный кадр.
 */

import { contentElements, type Cleanup, feature } from './features.js';
import { stillMotionQuery } from './motion-level.js';
import { currentChapter, watchScroll } from './technique-timing.js';

const root = document.documentElement;
const still = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
const wide = window.matchMedia('(min-width: 57rem)');

export function installEdgeCaptions(page: HTMLElement): Cleanup {
  if (root.dataset.themeEdges !== 'mono' || root.dataset.layout === 'slides')
    return () => undefined;
  const sections = [
    ...page.querySelectorAll<HTMLElement>('article > section[data-semantic="section"][id]'),
  ];
  const caption = (edge: 'start' | 'end'): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'edge-caption';
    element.dataset.edgeCaption = edge;
    element.setAttribute('aria-hidden', 'true');
    document.body.append(element);
    return element;
  };
  const start = caption('start');
  const end = caption('end');
  start.textContent =
    page.querySelector('article h1')?.textContent?.trim() || document.title.trim();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stop = watchScroll(() => {
    if (sections.length === 0) {
      end.textContent = '';
      return;
    }
    const index = currentChapter(sections);
    const title = sections[index]?.querySelector(':scope > h2')?.textContent?.trim() ?? '';
    end.textContent = `${pad(index + 1)} / ${pad(sections.length)} · ${title}`;
  });
  return () => {
    stop();
    start.remove();
    end.remove();
  };
}

// ——— Установка ———

function install(page: HTMLElement): Cleanup {
  const cleanups: Cleanup[] = [];
  const moving = !still.matches;
  if (moving) {
    const demo = feature('demo');
    if (demo !== undefined)
      for (const element of contentElements<HTMLElement>(page, '[data-demo-scene]'))
        cleanups.push(demo.scene(element));
    const swap = feature('swap');
    if (swap !== undefined)
      for (const element of contentElements<HTMLElement>(page, '.semantic-swap[data-swap]'))
        cleanups.push(swap(element));
    const typing = feature('typing');
    if (typing !== undefined)
      for (const element of contentElements<HTMLElement>(page, '.semantic-typing'))
        cleanups.push(typing(element));
    const mark = feature('mark');
    if (mark !== undefined)
      for (const element of contentElements<HTMLElement>(page, '.semantic-mark[data-mark]'))
        cleanups.push(mark(element));
    const spotlight = feature('spotlight');
    if (spotlight !== undefined)
      for (const element of contentElements<HTMLElement>(page, '[data-spotlight]'))
        cleanups.push(spotlight(element));
    const log = feature('log');
    if (log !== undefined)
      for (const pre of contentElements<HTMLElement>(
        page,
        '.semantic-section[data-transition="log"] pre',
      ))
        cleanups.push(log(pre));
  }
  const video = feature('video');
  if (video !== undefined)
    for (const element of contentElements<HTMLVideoElement>(
      page,
      'video[data-video-start], video[data-video-seam]',
    ))
      cleanups.push(video.loop(element));
  const sticky = feature('stickyContents');
  if (sticky !== undefined)
    for (const nav of contentElements<HTMLElement>(page, 'nav[data-sticky="true"]'))
      cleanups.push(sticky(nav));
  if (page.matches('[data-localized-page-variant]')) cleanups.push(installEdgeCaptions(page));
  feature('tabs')?.orientation(page);
  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}

/** Shared content lifecycle, including detached/reused scene bodies. */
export function installContentTechniques(page: HTMLElement): Cleanup {
  let uninstall = install(page);
  const reinstall = (): void => {
    uninstall();
    uninstall = install(page);
  };
  const orientation = (): void => feature('tabs')?.orientation(page);
  still.addEventListener('change', reinstall);
  wide.addEventListener('change', orientation);
  return () => {
    still.removeEventListener('change', reinstall);
    wide.removeEventListener('change', orientation);
    uninstall();
  };
}
const tabs = feature('tabs');
if (tabs !== undefined) document.addEventListener('keydown', tabs.verticalKey);
const video = feature('video');
if (video !== undefined)
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const expand = target.closest<HTMLButtonElement>('[data-video-expand]');
    if (expand !== null) video.expand(expand);
  });
