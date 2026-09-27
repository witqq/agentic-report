/**
 * Контроллер островов на странице. Файл едет только на страницу, где стоит живой остров
 * (`kind: island`, `hydrate` не `none`), и дописывается к рантайму так же, как движок эффектов.
 *
 * Остров — `<figure class="semantic-island">` со статичным телом и документом острова в
 * `data-island-document`. Контроллер в нужный момент (`hydrate`: `load`, `idle`, `visible`) ставит
 * `<iframe sandbox="allow-scripts" srcdoc>`: у документа непрозрачный источник, доступа к странице нет,
 * сеть закрыта его собственной политикой. Разговор — сообщениями протокола `agentic-report-island`
 * версии 1: страница шлёт `init { tokens, scheme, language, reducedMotion }`, `theme { tokens, scheme }`,
 * `renderAt { t }` (часы страницы) и `resize { width, height }`; остров отвечает `ready` и `height { px }`.
 * Пока остров не ответил `ready`, читатель видит статичное тело; печать видит его всегда.
 */

import { THEME_TOKENS } from '../authoring/theme-tokens.js';
import { registerTimed } from './clock.js';
import { stillMotionQuery } from './motion-level.js';

const PROTOCOL = 'agentic-report-island';
const VERSION = 1;
const MAX_HEIGHT_PX = 20_000;

interface IslandMessage {
  readonly protocol?: unknown;
  readonly version?: unknown;
  readonly type?: unknown;
  readonly px?: unknown;
}

function tokens(host: Element): Record<string, string> {
  const style = getComputedStyle(host);
  const values: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const value = style.getPropertyValue(token.name).trim();
    if (value !== '') values[token.name] = value;
  }
  return values;
}

function scheme(): 'light' | 'dark' {
  const declared = document.documentElement.dataset.scheme;
  if (declared === 'light' || declared === 'dark') return declared;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Остров стоит, когда стоит страница: по просьбе читателя или по `motion: none` в шапке. */
function reducedMotion(): boolean {
  return stillMotionQuery(window.matchMedia('(prefers-reduced-motion: reduce)')).matches;
}

function hydrate(figure: HTMLElement): void {
  const srcdoc = figure.dataset.islandDocument;
  if (srcdoc === undefined || figure.dataset.islandState !== undefined) return;
  figure.dataset.islandState = 'loading';
  const frame = document.createElement('iframe');
  frame.className = 'semantic-island-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.title =
    figure.querySelector('figcaption')?.textContent?.trim() || figure.dataset.islandName || '';
  const fixedHeight = figure.dataset.islandHeight !== undefined;
  let ready = false;
  const send = (message: Record<string, unknown>): void => {
    if (!ready) return;
    frame.contentWindow?.postMessage({ protocol: PROTOCOL, version: VERSION, ...message }, '*');
  };
  let lastTheme = '';
  const sendTheme = (): void => {
    const payload = { tokens: tokens(figure), scheme: scheme() };
    const key = JSON.stringify(payload);
    if (key === lastTheme) return;
    lastTheme = key;
    send({ type: 'theme', ...payload });
  };
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data as IslandMessage | null;
    if (
      message === null ||
      typeof message !== 'object' ||
      message.protocol !== PROTOCOL ||
      message.version !== VERSION
    )
      return;
    if (message.type === 'ready') {
      ready = true;
      const payload = { tokens: tokens(figure), scheme: scheme() };
      lastTheme = JSON.stringify(payload);
      send({
        type: 'init',
        ...payload,
        language: document.documentElement.lang,
        reducedMotion: reducedMotion(),
      });
      figure.dataset.islandState = 'live';
      return;
    }
    if (message.type === 'height' && !fixedHeight) {
      const px = Number(message.px);
      if (Number.isFinite(px) && px > 0) frame.style.blockSize = `${Math.min(px, MAX_HEIGHT_PX)}px`;
    }
  });
  new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    send({
      type: 'resize',
      width: Math.round(entry.contentRect.width),
      height: Math.round(entry.contentRect.height),
    });
  }).observe(figure);
  new MutationObserver(sendTheme).observe(document.documentElement, { attributes: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sendTheme);
  registerTimed({ at: (t) => send({ type: 'renderAt', t }) });
  frame.srcdoc = srcdoc;
  figure.append(frame);
}

function schedule(figure: HTMLElement): void {
  if (figure.dataset.islandScheduled !== undefined) return;
  figure.dataset.islandScheduled = '';
  switch (figure.dataset.hydrate) {
    case 'load':
      hydrate(figure);
      return;
    case 'idle': {
      // Safari не знает `requestIdleCallback`: там остров ставится следующей задачей.
      const idle = (window as Partial<Pick<Window, 'requestIdleCallback'>>).requestIdleCallback;
      if (idle === undefined) window.setTimeout(() => hydrate(figure), 1);
      else idle.call(window, () => hydrate(figure));
      return;
    }
    case 'none':
      return;
    default: {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          hydrate(figure);
        },
        { rootMargin: '200px' },
      );
      observer.observe(figure);
    }
  }
}

function scan(root: ParentNode): void {
  for (const figure of root.querySelectorAll<HTMLElement>('figure[data-island-document]'))
    schedule(figure);
}

function start(): void {
  scan(document);
  // Смена языка вставляет разметку варианта заново: его острова тоже надо запустить.
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('figure[data-island-document]')) schedule(node);
        scan(node);
      }
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
