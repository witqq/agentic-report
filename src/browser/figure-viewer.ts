/**
 * Просмотр во весь экран. Схема, график и широкая таблица получают кнопку «Открыть»: диалог поверх
 * страницы показывает копию того же рисунка — SVG перерисовывается под каждый масштаб и остаётся чётким,
 * — которую двигают перетаскиванием, стрелками и прокруткой, а масштабируют щипком, прокруткой с Ctrl
 * (так приходит щипок трекпада), двойным щелчком или касанием и кнопками «+», «−» и «вписать». Esc
 * закрывает диалог, фокус заперт в нём и возвращается на кнопку. Масштаб меняется сразу, без анимации,
 * поэтому уменьшенное движение ничего не теряет; в печати ни кнопок, ни диалога нет.
 *
 * Модуль один для всех видов фигур: страница называет, что показать, через `viewerSources`.
 */

import { DASH_ICON, PLUS_ICON, SCREEN_FULL_ICON, X_ICON } from '../iconography.js';
import type { PackageStrings } from '../localization.js';
import { browserIcon } from './icon.js';
import { asUiButton } from './ui.js';
import { contentElements } from './features.js';

/** Самый крупный масштаб просмотра. */
const MAX_SCALE = 8;
/** Масштаб, с которым просмотр открывается, не крупнее этого: маленькая схема не раздувается. */
const MAX_FIT_SCALE = 3;
/** Шаг кнопок и клавиш масштаба. */
const ZOOM_STEP = 1.4;
/** Шаг стрелок в пикселях экрана. */
const PAN_STEP = 48;
/** Столько пикселей рисунка остаётся в окне, как бы далеко его ни утащили. */
const KEEP_VISIBLE = 48;
/** Два касания в пределах этого времени и расстояния — двойное касание. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 28;
/** Промежуток между фигурами, стоящими в просмотре друг под другом, в пикселях при масштабе 1. */
const STACK_GAP = 24;

const FIGURES = 'figure[data-visualization="diagram"], figure[data-visualization="chart"]';

interface Item {
  readonly element: HTMLElement | SVGSVGElement;
  readonly width: number;
  readonly height: number;
}

/** Рисунки фигуры, которые показывает просмотр: то, что читатель видит сейчас, целиком. */
export function viewerSources(figure: HTMLElement): readonly Element[] {
  const zoomStills = [...figure.querySelectorAll('svg.visualization-zoom-still')];
  if (zoomStills.length > 0) return zoomStills;
  const panel = figure.querySelector('[data-tab-panel]:not([hidden])');
  if (panel !== null) {
    // Узкий вид — представление для колонки телефона; просмотр показывает полный рисунок вида.
    const full = panel.querySelector('svg.visualization-diagram:not([data-diagram-compact])');
    return full === null ? [] : [full];
  }
  const chart = figure.querySelector('svg.visualization-svg-wide');
  if (chart !== null) return [chart];
  const drawing = figure.querySelector('svg.visualization-svg');
  return drawing === null ? [] : [drawing];
}

function viewBoxSize(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal;
  if (box !== null && box.width > 0 && box.height > 0)
    return { width: box.width, height: box.height };
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1, height: rect.height || 1 };
}

/** Копия рисунка без идентификаторов, состояния движения и точек сценария. */
function cloneDrawing(source: Element): SVGSVGElement | HTMLElement {
  const clone = source.cloneNode(true) as SVGSVGElement | HTMLElement;
  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    element.removeAttribute('id');
    element.removeAttribute('aria-labelledby');
    element.removeAttribute('aria-describedby');
    element.removeAttribute('hidden');
  }
  // Прорисовка по прокрутке могла оставить связь недорисованной: в просмотре схема целиком.
  for (const part of clone.querySelectorAll<SVGElement>('[data-draw-from]')) {
    part.style.removeProperty('stroke-dasharray');
    part.style.removeProperty('stroke-dashoffset');
    part.style.removeProperty('opacity');
  }
  for (const dot of clone.querySelectorAll('[data-pulse-dot], [data-draw-marker]')) dot.remove();
  return clone;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];
}

function controlButton(
  label: string,
  icon: Parameters<typeof browserIcon>[0] | undefined,
  text?: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  asUiButton(button, 'secondary', 'sm', text === undefined);
  button.setAttribute('aria-label', label);
  button.title = label;
  if (icon !== undefined) button.append(browserIcon(icon));
  if (text !== undefined) {
    const span = document.createElement('span');
    span.textContent = text;
    button.append(span);
  }
  return button;
}

/** Открывает просмотр рисунков `sources`; по закрытии фокус возвращается на `opener`. */
export function openFigureViewer(
  sources: readonly Element[],
  title: string,
  opener: HTMLElement,
  strings: PackageStrings,
): HTMLDialogElement | undefined {
  if (sources.length === 0) return undefined;
  const words = strings.figureViewer;
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-viewer';
  dialog.dataset.figureViewer = '';
  dialog.setAttribute('aria-label', words.dialog(title));
  const language = opener.closest('[lang]')?.getAttribute('lang');
  if (language) dialog.lang = language;

  const bar = document.createElement('div');
  bar.className = 'figure-viewer-bar-top';
  const heading = document.createElement('p');
  heading.className = 'figure-viewer-title';
  heading.textContent = title;
  const zoomOut = controlButton(words.zoomOut, DASH_ICON);
  zoomOut.dataset.viewerZoomOut = '';
  const zoomIn = controlButton(words.zoomIn, PLUS_ICON);
  zoomIn.dataset.viewerZoomIn = '';
  const fit = controlButton(words.fit, SCREEN_FULL_ICON);
  fit.dataset.viewerFit = '';
  const close = controlButton(strings.close, X_ICON);
  close.dataset.viewerClose = '';
  const controls = document.createElement('div');
  controls.className = 'figure-viewer-controls';
  controls.append(zoomOut, zoomIn, fit, close);
  bar.append(heading, controls);

  const viewport = document.createElement('div');
  viewport.className = 'figure-viewer-viewport';
  viewport.dataset.viewerViewport = '';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', `${title}. ${words.hint}`);
  const stage = document.createElement('div');
  stage.className = 'figure-viewer-stage';
  stage.dataset.viewerStage = '';
  viewport.append(stage);
  const hint = document.createElement('p');
  hint.className = 'figure-viewer-hint';
  hint.textContent = words.hint;
  dialog.append(bar, viewport, hint);
  document.body.append(dialog);

  const items: Item[] = sources.map((source) => {
    const clone = cloneDrawing(source);
    if (clone instanceof SVGSVGElement) {
      stage.append(clone);
      return { element: clone, ...viewBoxSize(source as SVGSVGElement) };
    }
    const holder = document.createElement('div');
    holder.className = 'figure-viewer-html';
    holder.append(clone);
    stage.append(holder);
    return { element: holder, width: 1, height: 1 };
  });
  dialog.showModal();
  // Размер HTML-копии (таблицы) известен только после вставки в открытый диалог.
  const measured = items.map((item) => {
    if (item.element instanceof SVGSVGElement) return item;
    const box = item.element.getBoundingClientRect();
    return { ...item, width: Math.max(1, box.width), height: Math.max(1, box.height) };
  });
  const natural = {
    width: Math.max(...measured.map((item) => item.width)),
    height:
      measured.reduce((sum, item) => sum + item.height, 0) + STACK_GAP * (measured.length - 1),
  };

  let scale = 1;
  let x = 0;
  let y = 0;
  const bounds = (): DOMRect => viewport.getBoundingClientRect();
  const fitScale = (): number => {
    const rect = bounds();
    return Math.max(
      0.05,
      Math.min((rect.width * 0.94) / natural.width, (rect.height * 0.94) / natural.height),
    );
  };
  const minScale = (): number => Math.min(fitScale(), 1) * 0.5;
  const clampPosition = (): void => {
    const rect = bounds();
    const width = natural.width * scale;
    const height = natural.height * scale;
    x = Math.min(rect.width - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - width, x));
    y = Math.min(rect.height - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - height, y));
  };
  const apply = (): void => {
    clampPosition();
    let top = 0;
    for (const item of measured) {
      const width = item.width * scale;
      const height = item.height * scale;
      if (item.element instanceof SVGSVGElement) {
        // Размер, а не преобразование: SVG рисуется заново под масштаб и не мылится.
        item.element.style.width = `${width.toFixed(2)}px`;
        item.element.style.height = `${height.toFixed(2)}px`;
      } else {
        item.element.style.transform = `scale(${scale.toFixed(4)})`;
      }
      item.element.style.left = `${((natural.width - item.width) / 2) * scale}px`;
      item.element.style.top = `${top}px`;
      top += height + STACK_GAP * scale;
    }
    stage.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    dialog.dataset.viewerScale = scale.toFixed(4);
    zoomOut.disabled = scale <= minScale() + 1e-6;
    zoomIn.disabled = scale >= MAX_SCALE - 1e-6;
  };
  /** Масштаб `next` вокруг точки окна `(px, py)`: точка рисунка под ней остаётся на месте. */
  const zoomAt = (next: number, px: number, py: number): void => {
    const target = Math.min(MAX_SCALE, Math.max(minScale(), next));
    x = px - ((px - x) * target) / scale;
    y = py - ((py - y) * target) / scale;
    scale = target;
    apply();
  };
  const centre = (): { x: number; y: number } => {
    const rect = bounds();
    return { x: rect.width / 2, y: rect.height / 2 };
  };
  const fitToScreen = (): void => {
    const rect = bounds();
    scale = Math.min(MAX_FIT_SCALE, fitScale());
    x = (rect.width - natural.width * scale) / 2;
    y = (rect.height - natural.height * scale) / 2;
    apply();
  };
  const local = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = bounds();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  fitToScreen();
  viewport.focus();

  zoomIn.addEventListener('click', () => zoomAt(scale * ZOOM_STEP, centre().x, centre().y));
  zoomOut.addEventListener('click', () => zoomAt(scale / ZOOM_STEP, centre().x, centre().y));
  fit.addEventListener('click', fitToScreen);
  close.addEventListener('click', () => dialog.close());

  // Перетаскивание и щипок одними событиями указателя: мышь, перо и пальцы.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; scale: number; mid: { x: number; y: number } } | undefined;
  let lastTap: { time: number; x: number; y: number } | undefined;
  let lastPointerType = 'mouse';
  const pinchState = (): typeof pinch => {
    const [first, second] = [...pointers.values()];
    if (first === undefined || second === undefined) return undefined;
    return {
      distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
      scale,
      mid: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  };
  viewport.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType;
    if (event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    pinch = pointers.size >= 2 ? pinchState() : undefined;
    viewport.dataset.viewerDragging = '';
  });
  viewport.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;
    const point = local(event);
    pointers.set(event.pointerId, point);
    if (pinch !== undefined && pointers.size >= 2) {
      const now = pinchState();
      if (now === undefined) return;
      // Середина между пальцами ведёт рисунок, расстояние между ними — масштаб.
      x += now.mid.x - pinch.mid.x;
      y += now.mid.y - pinch.mid.y;
      const target = pinch.scale * (now.distance / pinch.distance);
      pinch = { ...pinch, mid: now.mid };
      zoomAt(target, now.mid.x, now.mid.y);
      return;
    }
    x += point.x - previous.x;
    y += point.y - previous.y;
    apply();
  });
  const release = (event: PointerEvent): void => {
    const start = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    pinch = pointers.size >= 2 ? pinchState() : undefined;
    if (pointers.size === 0) delete viewport.dataset.viewerDragging;
    if (event.type !== 'pointerup' || event.pointerType !== 'touch' || start === undefined) return;
    const point = local(event);
    const now = event.timeStamp;
    if (
      lastTap !== undefined &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < DOUBLE_TAP_PX
    ) {
      lastTap = undefined;
      doubleZoom(point);
      return;
    }
    lastTap = { time: now, ...point };
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  const doubleZoom = (point: { x: number; y: number }): void => {
    if (scale * ZOOM_STEP * ZOOM_STEP > MAX_SCALE) fitToScreen();
    else zoomAt(scale * ZOOM_STEP * ZOOM_STEP, point.x, point.y);
  };
  viewport.addEventListener('dblclick', (event) => {
    // На касании двойное касание уже узнано по указателю.
    if (lastPointerType === 'touch') return;
    event.preventDefault();
    doubleZoom(local(event));
  });
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds().height : 1;
      if (event.ctrlKey || event.metaKey) {
        const point = local(event);
        zoomAt(scale * Math.exp((-event.deltaY * unit) / 240), point.x, point.y);
        return;
      }
      x -= event.deltaX * unit;
      y -= event.deltaY * unit;
      apply();
    },
    { passive: false },
  );

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      // Фокус заперт в диалоге: с последнего элемента на первый и обратно.
      const list = focusables(dialog);
      const first = list[0];
      const last = list.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      x += move[0];
      y += move[1];
      apply();
      return;
    }
    const point = centre();
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(scale * ZOOM_STEP, point.x, point.y);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomAt(scale / ZOOM_STEP, point.x, point.y);
    } else if (event.key === '0') {
      event.preventDefault();
      fitToScreen();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  const resize = new ResizeObserver(() => apply());
  resize.observe(viewport);
  dialog.addEventListener('close', () => {
    resize.disconnect();
    dialog.remove();
    opener.focus();
  });
  return dialog;
}

function figureTitle(figure: HTMLElement, strings: PackageStrings): string {
  return (
    figure.querySelector('.visualization-title')?.textContent?.trim() ||
    figure.querySelector('figcaption')?.textContent?.trim() ||
    strings.diagram
  );
}

function openButton(title: string, strings: PackageStrings): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'figure-viewer-open';
  button.dataset.figureOpen = '';
  asUiButton(button, 'quiet', 'sm');
  button.setAttribute('aria-label', strings.figureViewer.openLabel(title));
  const label = document.createElement('span');
  label.textContent = strings.figureViewer.open;
  button.append(browserIcon(SCREEN_FULL_ICON), label);
  return button;
}

/** Таблица шире своей дорожки: её прокручивает она сама или её обёртка. */
function overflows(table: HTMLElement): boolean {
  const scroller = table.parentElement;
  return (
    table.scrollWidth > table.clientWidth + 1 ||
    (scroller !== null && scroller.scrollWidth > scroller.clientWidth + 1)
  );
}

function tableTitle(table: HTMLElement, strings: PackageStrings): string {
  return table.querySelector('caption')?.textContent?.trim() || strings.figureViewer.table;
}

/**
 * Ставит кнопки просмотра на схемы и графики страницы и на её таблицы, пока они шире своей дорожки.
 * Возвращает снятие всего поставленного.
 */
export function installFigureViewer(page: HTMLElement, strings: PackageStrings): () => void {
  const added: HTMLElement[] = [];
  const hosts: HTMLElement[] = [];
  for (const figure of contentElements<HTMLElement>(page, FIGURES)) {
    const caption = figure.querySelector<HTMLElement>(':scope > .visualization-caption');
    if (caption === null || caption.querySelector(':scope > [data-figure-open]') !== null) continue;
    const button = openButton(figureTitle(figure, strings), strings);
    caption.append(button);
    // Подпись с кнопкой раскладывается в две колонки по этому признаку, а не по `:has()`: правило
    // `.visualization-caption:has(…) > :not(…)` заставляло браузер при каждом кадре анимации картинки на
    // странице пересчитывать стиль всего документа (на витрине движения — 11 060 элементов за 3 000 px
    // прокрутки вместо 1 830), и прокрутка при замедленном процессоре теряла кадры.
    caption.setAttribute('data-figure-open-host', '');
    hosts.push(caption);
    added.push(button);
  }
  const tables = contentElements<HTMLTableElement>(page, 'table').filter(
    (table) => table.closest('[data-figure-viewer], .review-panel, .response-workspace') === null,
  );
  const bars = new Map<HTMLTableElement, HTMLElement>();
  for (const table of tables) {
    const bar = document.createElement('div');
    bar.className = 'figure-viewer-bar';
    bar.hidden = true;
    bar.append(openButton(tableTitle(table, strings), strings));
    const anchor =
      table.parentElement !== null && table.parentElement.children.length === 1
        ? table.parentElement
        : table;
    anchor.before(bar);
    bars.set(table, bar);
    added.push(bar);
  }
  const sync = (): void => {
    for (const [table, bar] of bars) bar.hidden = !overflows(table);
  };
  const observer = new ResizeObserver(sync);
  for (const table of tables) observer.observe(table);
  sync();
  const abort = new AbortController();
  page.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        '[data-figure-open]',
      );
      if (button === null || button === undefined || !page.contains(button)) return;
      if (
        page.hasAttribute('data-content-scope') &&
        button.closest('[data-content-scope]') !== page
      )
        return;
      const figure = button.closest<HTMLElement>(FIGURES);
      if (figure !== null) {
        openFigureViewer(viewerSources(figure), figureTitle(figure, strings), button, strings);
        return;
      }
      const bar = button.closest<HTMLElement>('.figure-viewer-bar');
      const table = [...bars].find(([, candidate]) => candidate === bar)?.[0];
      if (table !== undefined)
        openFigureViewer([table], tableTitle(table, strings), button, strings);
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    observer.disconnect();
    for (const element of added) element.remove();
    for (const host of hosts) host.removeAttribute('data-figure-open-host');
  };
}
