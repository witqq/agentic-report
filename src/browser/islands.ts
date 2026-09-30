/*! agentic-report script: islands */
/**
 * Контроллер островов на странице. Модуль входит только в скрипт страницы, где стоит живой остров
 * (`kind: island`, `hydrate` не `none`), и стартует после рантайма, как движок эффектов.
 *
 * Остров — `<figure class="semantic-island">` со статичным телом и документом острова в
 * `data-island-document`. Контроллер в нужный момент (`hydrate`: `load`, `idle`, `visible`) ставит
 * `<iframe sandbox="allow-scripts" srcdoc>`: у документа непрозрачный источник, доступа к странице нет,
 * сеть закрыта его собственной политикой. Разговор — сообщениями протокола `agentic-report-island`
 * версии 1: страница шлёт `init { tokens, scheme, language, reducedMotion }`, `theme { tokens, scheme }`,
 * `renderAt { t }` (часы страницы) и `resize { width, height }`; остров отвечает `ready`, `height { px }` и
 * `width { px, frame }` — ширину своей краски при данной ширине рамки. Рамка острова, содержимое
 * которого заметно уже рамки, облегает его (поиск ниже): пустой полосы внутри рамки справа нет; при смене
 * ширины рисунка рамка сначала снова получает всю ширину, и остров меряется заново.
 * Пока остров не ответил `ready`, читатель видит статичное тело; печать видит его всегда.
 */

import { THEME_TOKENS } from '../authoring/theme-tokens.js';
import { registerTimed } from './clock.js';
import { stillMotionQuery } from './motion-level.js';

const PROTOCOL = 'agentic-report-island';
const VERSION = 1;
const MAX_HEIGHT_PX = 20_000;
/** Рамка облегает содержимое острова, только если оно уже рамки больше чем на эту величину, px. */
const HUG_SLACK_PX = 48;
/** Поиск ширины, на которой раскладка острова не перестраивается, кончается на этом шаге, px. */
const HUG_STEP_PX = 16;

interface IslandMessage {
  readonly protocol?: unknown;
  readonly version?: unknown;
  readonly type?: unknown;
  readonly px?: unknown;
  readonly frame?: unknown;
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
  /*
   * Рамка облегает содержимое. Остров сообщает ширину своей краски (`width { px, frame }`) при каждой ширине
   * рамки. Если на всей ширине краска заметно уже рамки, рамка пробует ширину краски; раскладка острова,
   * которая на этой ширине перестроилась (краска стала уже — ряд перенёсся), значит, ей нужно больше, и
   * ширина ищется делением пополам между неудачной и удачной, пока шаг не станет меньше 16 px. Найденная
   * ширина держится до смены ширины рисунка. Ширина краски остаётся на рисунке (`data-island-ink`): её
   * читает замер `snapshot --measure`.
   */
  let hug: {
    state: 'open' | 'trying' | 'settled';
    ink: number;
    height: number;
    low: number;
    high: number;
    trying: number;
  } = { state: 'open', ink: 0, height: 0, low: 0, high: 0, trying: 0 };
  let reportedHeight = 0;
  const tryWidth = (width: number): void => {
    hug = { ...hug, state: 'trying', trying: width };
    frame.style.inlineSize = `${width}px`;
  };
  const settle = (width: number): void => {
    hug = { ...hug, state: 'settled' };
    if (width >= figure.clientWidth - 1) frame.style.removeProperty('inline-size');
    else frame.style.inlineSize = `${width}px`;
  };
  const hugReport = (px: number, across: number): void => {
    // До `init` остров ещё не построил содержимое: мерить нечего.
    if (!ready || !Number.isFinite(px) || px <= 0 || !Number.isFinite(across)) return;
    figure.dataset.islandInk = String(Math.round(px));
    const room = figure.clientWidth;
    if (hug.state === 'open') {
      if (Math.abs(across - room) > 1) return;
      if (px < room - HUG_SLACK_PX) {
        hug = { ...hug, ink: px, height: reportedHeight, low: 0, high: room };
        tryWidth(Math.ceil(px));
      } else hug = { ...hug, state: 'settled' };
      return;
    }
    if (hug.state !== 'trying' || Math.abs(across - hug.trying) > 1) return;
    // Раскладка не перестроилась: краска не уже и остров не выше, чем на всей ширине (перенос ряда делает его выше).
    if (px >= hug.ink - 4 && reportedHeight <= hug.height + 4) hug = { ...hug, high: hug.trying };
    else hug = { ...hug, low: hug.trying };
    if (hug.high - hug.low <= HUG_STEP_PX || (hug.low === 0 && hug.high === hug.trying))
      settle(hug.high);
    else tryWidth(Math.round((hug.low + hug.high) / 2));
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
    if (message.type === 'width') {
      hugReport(Number(message.px), Number(message.frame));
      return;
    }
    if (message.type === 'height') {
      const px = Number(message.px);
      if (Number.isFinite(px)) reportedHeight = px;
      if (fixedHeight) return;
      if (Number.isFinite(px) && px > 0) frame.style.blockSize = `${Math.min(px, MAX_HEIGHT_PX)}px`;
    }
  });
  let figureWidth = -1;
  new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const width = Math.round(entry.contentRect.width);
    // Новая ширина рисунка: рамка снова получает её целиком, и остров сообщает свою ширину заново.
    if (width !== figureWidth) {
      figureWidth = width;
      hug = { state: 'open', ink: 0, height: 0, low: 0, high: 0, trying: 0 };
      frame.style.removeProperty('inline-size');
    }
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
