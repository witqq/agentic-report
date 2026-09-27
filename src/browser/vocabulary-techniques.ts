/**
 * Приёмы словаря в браузере: проигрываемая сцена `demo`, замена слова `:swap`, набор строки `:typing`,
 * пометка от руки `:mark`, лупа `spotlight`, построчная печать лога (`transition="log"`), начало и мягкий
 * стык петли видео, кнопка «Развернуть» у клипа, вертикальные вкладки, липкое нумерованное оглавление
 * лендинга и моноширинные подписи по краям экрана (`chrome.edges: mono`).
 *
 * Всё, что движется, идёт по часам страницы: время — `clock.now()`, кадры — `clock.frame`, а перемотка
 * `__clock.seek(t)` приводит каждый приём к моменту `t` через `clock.register`. Состояние от прокрутки
 * выставляется записью через `data-clock-progress`. Когда страница стоит (уменьшенное движение или
 * `motion: none`), приёмы не ставятся вовсе: разметка сама по себе — их конечный кадр.
 *
 * Модуль ставит приёмы на текущую языковую версию страницы и переставляет их, когда страница меняет язык
 * или читатель меняет просьбу о движении.
 */

import { packageStrings } from '../localization.js';
import { pageClock, progressOverride } from './clock.js';
import { stillMotionQuery } from './motion-level.js';
import { asUiButton } from './ui.js';

type Cleanup = () => void;

const clock = pageClock();
const root = document.documentElement;
const still = stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)'));
const wide = window.matchMedia('(min-width: 57rem)');

/** Темп темы умножает длительности всех приёмов. */
function pace(): number {
  return Number(getComputedStyle(root).getPropertyValue('--motion-pace')) || 1;
}

/** Один раз, когда элемент показался на экране хотя бы на долю `threshold`. */
function whenVisible(element: Element, callback: () => void, threshold = 0.6): Cleanup {
  if (typeof window.IntersectionObserver !== 'function') {
    callback();
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { threshold },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Приём как функция времени: `render(now)` рисует состояние момента и отвечает, идёт ли он ещё. Кадры
 * запрашиваются, пока приём идёт; перемотка часов рисует тот же момент заново.
 */
function timed(render: (now: number) => boolean): { readonly start: () => void; stop: Cleanup } {
  let frame = 0;
  const step = (now: number): void => {
    frame = 0;
    if (render(now)) frame = clock.frame(step);
  };
  const unregister = clock.register({ at: (seconds) => void render(seconds * 1000) });
  return {
    // Первый кадр рисуется сразу: в ручных часах кадры идут только по перемотке.
    start: () => {
      if (render(clock.now()) && frame === 0) frame = clock.frame(step);
    },
    stop: () => {
      unregister();
      if (frame !== 0) clock.cancelFrame(frame);
      frame = 0;
    },
  };
}

// ——— Проигрываемая сцена demo ———

function lightFocus(scope: HTMLElement, ids: ReadonlySet<string>): void {
  scope.toggleAttribute('data-demo-focus', ids.size > 0);
  for (const node of scope.querySelectorAll<SVGElement>('[data-node-id]'))
    node.toggleAttribute('data-lit', ids.has(node.dataset.nodeId ?? ''));
  for (const edge of scope.querySelectorAll<SVGElement>('[data-from][data-to]'))
    edge.toggleAttribute(
      'data-lit',
      ids.has(edge.dataset.edgeId ?? '') ||
        (ids.has(edge.dataset.from ?? '') && ids.has(edge.dataset.to ?? '')),
    );
}

/**
 * Сцена по времени играет такты по очереди, по `seconds` на такт, и останавливается на конечном кадре;
 * запускается, когда показалась, встаёт на паузу, когда ушла с экрана, и начинается заново, когда её
 * вкладку открыли снова. Сцена по прокрутке закреплена, пока читатель проходит её такты: текущий такт —
 * доля пройденного пути.
 */
export function installDemoScene(demo: HTMLElement): Cleanup {
  const beats = [...demo.querySelectorAll<HTMLElement>('[data-demo-beat]')];
  const stage = demo.querySelector<HTMLElement>('[data-demo-stage]');
  const frameElement = demo.querySelector<HTMLElement>('[data-demo-frame]');
  const controls = demo.querySelector<HTMLElement>('[data-demo-controls]');
  const toggle = demo.querySelector<HTMLButtonElement>('[data-demo-toggle]');
  const position = demo.querySelector<HTMLElement>('[data-demo-position]');
  const count = beats.length;
  const clear = (): void => {
    demo.removeAttribute('data-demo-live');
    demo.removeAttribute('data-demo-state');
    demo.removeAttribute('data-demo-index');
    for (const beat of beats) {
      beat.removeAttribute('data-demo-state');
      beat.removeAttribute('data-current');
    }
    if (stage !== null) lightFocus(stage, new Set());
    if (controls !== null) controls.hidden = true;
    if (position !== null) position.textContent = `${count} / ${count}`;
  };
  if (count === 0 || stage === null || frameElement === null) return clear;
  demo.setAttribute('data-demo-live', '');

  const select = (index: number): void => {
    demo.dataset.demoIndex = String(index);
    for (const [at, beat] of beats.entries()) {
      beat.dataset.demoState = at < index ? 'passed' : at === index ? 'current' : 'next';
      beat.toggleAttribute('data-current', at === index);
    }
    lightFocus(
      stage,
      new Set(
        (beats[index]?.dataset.focus ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    );
    if (position !== null) position.textContent = `${index + 1} / ${count}`;
  };

  if (demo.dataset.play === 'scroll') {
    const paint = (): void => {
      const box = demo.getBoundingClientRect();
      const line = Number.parseFloat(getComputedStyle(root).getPropertyValue('--topbar-clearance'));
      const travel = Math.max(1, box.height - frameElement.getBoundingClientRect().height);
      const progress =
        progressOverride(demo) ??
        Math.min(1, Math.max(0, ((Number.isFinite(line) ? line : 72) - box.top) / travel));
      demo.style.setProperty('--demo-progress', progress.toFixed(4));
      select(Math.min(count - 1, Math.floor(progress * count)));
    };
    let frame = 0;
    const schedule = (): void => {
      if (frame === 0)
        frame = clock.frame(() => {
          frame = 0;
          paint();
        });
    };
    const unregister = clock.register({ at: paint });
    document.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    paint();
    return () => {
      unregister();
      document.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) clock.cancelFrame(frame);
      demo.style.removeProperty('--demo-progress');
      clear();
    };
  }

  // По времени.
  const beatMs = (): number => Number(demo.dataset.seconds ?? '3') * 1000 * pace();
  let state: 'waiting' | 'playing' | 'paused' | 'ended' = 'waiting';
  let startedAt = 0;
  let offset = 0;
  let pausedByReader = false;
  const label = (): void => {
    if (toggle === null) return;
    const text =
      state === 'playing'
        ? demo.dataset.labelPause
        : state === 'ended'
          ? demo.dataset.labelReplay
          : demo.dataset.labelPlay;
    // Кнопка называет то, что сделает: у переключателя с меняющейся подписью нет состояния «нажата».
    toggle.textContent = text ?? '';
  };
  const render = (now: number): boolean => {
    const total = beatMs() * count;
    let elapsed = state === 'playing' ? now - startedAt : offset;
    if (state === 'playing' && elapsed >= total) {
      state = 'ended';
      offset = total;
      elapsed = total;
    }
    select(Math.min(count - 1, Math.floor(Math.max(0, elapsed) / beatMs())));
    demo.dataset.demoState = state;
    label();
    return state === 'playing';
  };
  const run = timed(render);
  const play = (): void => {
    if (state === 'ended') offset = 0;
    startedAt = clock.now() - offset;
    state = 'playing';
    render(clock.now());
    run.start();
  };
  const pause = (): void => {
    if (state !== 'playing') return;
    offset = clock.now() - startedAt;
    state = 'paused';
    render(clock.now());
  };
  const reset = (): void => {
    state = 'waiting';
    offset = 0;
    render(clock.now());
  };
  const onToggle = (): void => {
    if (state === 'playing') {
      pausedByReader = true;
      pause();
    } else {
      pausedByReader = false;
      play();
    }
  };
  toggle?.addEventListener('click', onToggle);
  if (controls !== null) controls.hidden = false;
  render(clock.now());
  let observer: IntersectionObserver | undefined;
  if (typeof window.IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (state === 'waiting' || (state === 'paused' && !pausedByReader)) play();
          } else if (demo.closest('[hidden]') !== null) {
            // Вкладку сценария закрыли: открытая снова, она играет с начала.
            pausedByReader = false;
            reset();
          } else pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(demo);
  }
  return () => {
    observer?.disconnect();
    toggle?.removeEventListener('click', onToggle);
    run.stop();
    if (toggle !== null) {
      toggle.textContent = demo.dataset.labelPlay ?? '';
    }
    clear();
  };
}

// ——— :swap ———

/** Слово держится такт и сменяется; после последнего слова возвращается написанное, и замена стоит. */
export const SWAP_BEAT_MS = 1200;

export function installSwap(element: HTMLElement): Cleanup {
  const words = [...element.querySelectorAll<HTMLElement>('[data-swap-word]')];
  if (words.length < 2) return () => undefined;
  element.setAttribute('data-swap-live', '');
  let start: number | undefined;
  const show = (index: number): void => {
    for (const [at, word] of words.entries()) word.toggleAttribute('data-current', at === index);
  };
  const run = timed((now) => {
    if (start === undefined) {
      show(0);
      return false;
    }
    const beat = Math.floor(Math.max(0, now - start) / (SWAP_BEAT_MS * pace()));
    show(beat >= words.length ? 0 : beat);
    return beat < words.length;
  });
  show(0);
  const unwatch = whenVisible(element, () => {
    start = clock.now();
    run.start();
  });
  return () => {
    unwatch();
    run.stop();
    element.removeAttribute('data-swap-live');
    for (const word of words) word.removeAttribute('data-current');
  };
}

// ——— :typing ———

/** Набор строки длится не дольше полутора секунд: короткая строка — не повод ждать. */
export const TYPING_CHAR_MS = 45;
export const TYPING_LIMIT_MS = 1500;

export function installTyping(element: HTMLElement): Cleanup {
  const text = element.firstChild;
  if (element.childNodes.length !== 1 || !(text instanceof Text)) return () => undefined;
  const length = text.data.length;
  let widths: number[] = [];
  let start: number | undefined;
  let active = true;
  const measure = (): boolean => {
    const range = document.createRange();
    range.selectNodeContents(text);
    // Строка, перенесённая на две, набиралась бы с разрывом: такая остаётся целой.
    if (range.getClientRects().length > 1) return false;
    const left = element.getBoundingClientRect().left;
    widths = Array.from({ length: length + 1 }, (_, index) => {
      if (index === 0) return 0;
      range.setStart(text, 0);
      range.setEnd(text, index);
      return range.getBoundingClientRect().right - left;
    });
    return true;
  };
  if (!measure()) return () => undefined;
  // `waiting` — строка ждёт показа, `typing` — набор начался; перемотка видит, с какого момента он идёт.
  element.dataset.typingLive = 'waiting';
  const charMs = (): number => Math.min(TYPING_CHAR_MS, TYPING_LIMIT_MS / Math.max(1, length));
  const render = (now: number): boolean => {
    const typed =
      start === undefined
        ? 0
        : Math.min(length, Math.floor(Math.max(0, now - start) / (charMs() * pace())));
    element.style.setProperty('--typing-shown', `${widths[typed] ?? 0}px`);
    element.toggleAttribute('data-typing-done', typed >= length);
    return typed < length;
  };
  const run = timed(render);
  render(clock.now());
  const remeasure = (): void => {
    if (!active) return;
    const state = element.dataset.typingLive ?? 'waiting';
    element.removeAttribute('data-typing-live');
    if (measure()) element.dataset.typingLive = state;
    render(clock.now());
  };
  void document.fonts.ready.then(remeasure);
  window.addEventListener('resize', remeasure);
  // Показ меряется по абзацу строки: обрезанная до нуля строка для наблюдателя пересечений не видна.
  const unwatch = whenVisible(
    element.parentElement ?? element,
    () => {
      start = clock.now();
      if (element.hasAttribute('data-typing-live')) element.dataset.typingLive = 'typing';
      run.start();
    },
    0.5,
  );
  return () => {
    active = false;
    unwatch();
    run.stop();
    window.removeEventListener('resize', remeasure);
    element.removeAttribute('data-typing-live');
    element.removeAttribute('data-typing-done');
    element.style.removeProperty('--typing-shown');
  };
}

// ——— :mark и spotlight: конечное состояние по умолчанию, ожидание — только при живом движении ———

function installPending(element: HTMLElement, attribute: string, threshold: number): Cleanup {
  element.setAttribute(attribute, '');
  const unwatch = whenVisible(element, () => element.removeAttribute(attribute), threshold);
  return () => {
    unwatch();
    element.removeAttribute(attribute);
  };
}

// ——— transition="log" ———

/** Лог печатается не дольше 2,4 секунды целиком: длинный — быстрее построчно. */
export const LOG_LINE_MS = 140;
export const LOG_LIMIT_MS = 2400;

export function installLog(pre: HTMLElement): Cleanup {
  const code = pre.querySelector<HTMLElement>('code');
  if (code === null) return () => undefined;
  const lines = (code.textContent ?? '').replace(/\n+$/u, '').split('\n').length;
  if (lines < 2) return () => undefined;
  pre.setAttribute('data-log-live', '');
  let start: number | undefined;
  const lineMs = (): number => Math.min(LOG_LINE_MS, LOG_LIMIT_MS / lines) * pace();
  const run = timed((now) => {
    const shown =
      start === undefined
        ? 0
        : Math.min(lines, 1 + Math.floor(Math.max(0, now - start) / lineMs()));
    pre.style.setProperty('--log-shown', String(shown));
    pre.toggleAttribute('data-log-done', shown >= lines);
    return shown < lines;
  });
  pre.style.setProperty('--log-shown', '0');
  const unwatch = whenVisible(
    pre,
    () => {
      start = clock.now();
      run.start();
    },
    0.4,
  );
  return () => {
    unwatch();
    run.stop();
    pre.removeAttribute('data-log-live');
    pre.removeAttribute('data-log-done');
    pre.style.removeProperty('--log-shown');
  };
}

// ——— Видео: начало петли, мягкий стык ———

/** Стык гасит последние полсекунды петли и проявляет первые. */
export const VIDEO_SEAM_SECONDS = 0.5;

export function installVideoLoop(video: HTMLVideoElement): Cleanup {
  const start = Number(video.dataset.videoStart ?? '0') || 0;
  const fade = video.dataset.videoSeam === 'fade';
  const looping = video.loop;
  // Петлю ведёт этот модуль: встроенная вернула бы ролик к нулю, а не к началу петли.
  video.loop = false;
  const toStart = (): void => {
    if (start > 0 && start < (video.duration || Number.POSITIVE_INFINITY))
      video.currentTime = start;
  };
  const onMetadata = (): void => {
    if (video.currentTime < start) toStart();
  };
  const onEnded = (): void => {
    if (!looping) return;
    toStart();
    if (start <= 0) video.currentTime = 0;
    video.removeAttribute('data-video-seam-out');
    void video.play().catch(() => undefined);
  };
  const onTime = (): void => {
    if (!fade || !Number.isFinite(video.duration)) return;
    video.toggleAttribute(
      'data-video-seam-out',
      video.duration - video.currentTime <= VIDEO_SEAM_SECONDS,
    );
  };
  if (video.readyState >= 1) onMetadata();
  video.addEventListener('loadedmetadata', onMetadata);
  video.addEventListener('ended', onEnded);
  video.addEventListener('timeupdate', onTime);
  return () => {
    video.loop = looping;
    video.removeAttribute('data-video-seam-out');
    video.removeEventListener('loadedmetadata', onMetadata);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('timeupdate', onTime);
  };
}

/** Клип во весь экран: копия плеера в диалоге, с полными контролами и звуком, с той же секунды. */
function expandClip(button: HTMLButtonElement): void {
  const figure = button.closest('figure');
  const source = figure?.querySelector<HTMLVideoElement>('video');
  if (figure === null || figure === undefined || source === null || source === undefined) return;
  const strings = packageStrings(root.dataset.packageLocale);
  const dialog = document.createElement('dialog');
  dialog.className = 'video-expand-dialog';
  dialog.dataset.videoExpandDialog = '';
  dialog.setAttribute(
    'aria-label',
    figure.querySelector('figcaption')?.textContent?.trim() || strings.expandVideo,
  );
  const player = source.cloneNode(true) as HTMLVideoElement;
  for (const attribute of [
    'data-video-autoplay',
    'data-video-background',
    'data-video-start',
    'data-video-seam',
    'data-video-seam-out',
    'loop',
    'muted',
  ])
    player.removeAttribute(attribute);
  player.controls = true;
  player.muted = false;
  player.className = 'video-expand-player';
  const at = source.currentTime;
  player.addEventListener('loadedmetadata', () => {
    player.currentTime = at;
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'video-expand-close';
  close.textContent = strings.close;
  asUiButton(close, 'secondary', 'sm');
  dialog.append(close, player);
  document.body.append(dialog);
  source.pause();
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    player.pause();
    dialog.remove();
    button.focus();
  });
  dialog.showModal();
  void player.play().catch(() => undefined);
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

// ——— Липкое оглавление и подписи по краям ———

/** Текущая глава — последняя, чей заголовок поднялся выше трети экрана. */
function currentChapter(sections: readonly HTMLElement[]): number {
  const line = window.innerHeight * 0.35;
  let current = 0;
  for (const [index, section] of sections.entries())
    if (section.getBoundingClientRect().top <= line) current = index;
  return current;
}

function watchScroll(update: () => void): Cleanup {
  let frame = 0;
  const schedule = (): void => {
    if (frame === 0)
      frame = clock.frame(() => {
        frame = 0;
        update();
      });
  };
  const unregister = clock.register({ at: update });
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    unregister();
    document.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
  };
}

export function installStickyContents(nav: HTMLElement): Cleanup {
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

function currentPage(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(
      '[data-localized-page-host] [data-localized-page-variant]',
    ) ?? document.body
  );
}

function install(page: HTMLElement): Cleanup {
  const cleanups: Cleanup[] = [];
  const moving = !still.matches;
  if (moving) {
    for (const demo of page.querySelectorAll<HTMLElement>('[data-demo-scene]'))
      cleanups.push(installDemoScene(demo));
    for (const element of page.querySelectorAll<HTMLElement>('.semantic-swap[data-swap]'))
      cleanups.push(installSwap(element));
    for (const element of page.querySelectorAll<HTMLElement>('.semantic-typing'))
      cleanups.push(installTyping(element));
    for (const element of page.querySelectorAll<HTMLElement>('.semantic-mark[data-mark]'))
      cleanups.push(installPending(element, 'data-mark-pending', 1));
    for (const element of page.querySelectorAll<HTMLElement>('[data-spotlight]'))
      cleanups.push(installPending(element, 'data-spotlight-pending', 0.5));
    for (const pre of page.querySelectorAll<HTMLElement>(
      '.semantic-section[data-transition="log"] pre',
    ))
      cleanups.push(installLog(pre));
  }
  for (const video of page.querySelectorAll<HTMLVideoElement>(
    'video[data-video-start], video[data-video-seam]',
  ))
    cleanups.push(installVideoLoop(video));
  for (const nav of page.querySelectorAll<HTMLElement>('nav[data-sticky="true"]'))
    cleanups.push(installStickyContents(nav));
  cleanups.push(installEdgeCaptions(page));
  syncTabOrientation(page);
  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}

let uninstall = install(currentPage());
const reinstall = (): void => {
  uninstall();
  uninstall = install(currentPage());
};
still.addEventListener('change', reinstall);
wide.addEventListener('change', () => syncTabOrientation(currentPage()));
const host = document.querySelector('[data-localized-page-host]');
if (host !== null) new MutationObserver(reinstall).observe(host, { childList: true });
document.addEventListener('keydown', onVerticalTabKey);
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const expand = target.closest<HTMLButtonElement>('[data-video-expand]');
  if (expand !== null) expandClip(expand);
});
