/**
 * Сервис замеров движка эффектов: прямоугольники элементов и строк текста в координатах страницы и
 * препятствия для декора. Замер не учитывает анимации появления: сдвиг элемента, который ещё ждёт
 * появления или въезжает, вычитается, поэтому декор ставится туда, где текст окажется, а не туда, где он
 * мелькнул. Стили страницы на время замера не меняются — иначе снятие правила само запускало бы переход.
 *
 * Закреплённые элементы (`position: fixed` или `sticky`) движутся с окном, а не со страницей: их место в
 * координатах страницы зависит от прокрутки в момент замера. Поэтому строки текста внутри них в замер
 * содержимого не входят, а `obstacles()` отдаёт их отдельным слоем `pinned` в координатах окна — иначе
 * маршрут декора, снятый в двух пересборках при разной прокрутке, расходился бы.
 */

import type { EffectObstacles, EffectPinned, EffectRect } from '../../effect.js';

/** Элементы, чей сдвиг — появление: ждут его или въезжают. */
const ENTRANCE_SELECTOR =
  '[data-reveal-pending], [data-reveal-pending] > *, [data-reveal-motion], [data-reveal-motion] > *';

/** Слой эффектов: его содержимое — декор, а не препятствие. */
export const EFFECT_LAYER_CLASS = 'effect-layer';

/** Сдвиг элемента его собственным `transform` (только перенос), если сдвиг — анимация или появление. */
function entranceShift(element: Element): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const moving = node.matches(ENTRANCE_SELECTOR) || node.getAnimations().length > 0;
    if (!moving) continue;
    const transform = getComputedStyle(node).transform;
    if (transform === 'none' || transform === '') continue;
    const matrix = new DOMMatrixReadOnly(transform);
    x += matrix.m41;
    y += matrix.m42;
  }
  return { x, y };
}

function toPage(rect: DOMRect, shift: { x: number; y: number }): EffectRect {
  return {
    x: rect.left + window.scrollX - shift.x,
    y: rect.top + window.scrollY - shift.y,
    width: rect.width,
    height: rect.height,
  };
}

export function measureRect(element: Element): EffectRect {
  return toPage(element.getBoundingClientRect(), entranceShift(element));
}

/**
 * Внешние закреплённые элементы внутри `scope` (сам `scope` не входит): `fixed` и `sticky` вне слоя
 * эффектов; вложенный в уже найденный не считается отдельно. Порядок — документа, поэтому предок стоит
 * перед всеми своими потомками, и достаточно сверить элемент с последним найденным.
 */
export function pinnedElements(scope: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const element of scope.querySelectorAll<HTMLElement>('*')) {
    const last = found[found.length - 1];
    if (last?.contains(element) === true) continue;
    if (element.classList.contains(EFFECT_LAYER_CLASS) || element.closest(`.${EFFECT_LAYER_CLASS}`))
      continue;
    const position = getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') found.push(element);
  }
  return found;
}

/**
 * Строки текста: прямоугольники фрагментов текста, слитые по вертикальному перекрытию. Текст внутри
 * закреплённых потомков элемента не входит: его место на странице зависит от прокрутки.
 */
export function measureLines(element: Element): EffectRect[] {
  const fragments: EffectRect[] = [];
  const pinned = pinnedElements(element);
  const isPinned = (node: Element): boolean => pinned.some((outer) => outer.contains(node));
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').trim() === '') continue;
    const parent = node.parentElement;
    if (parent === null || parent.closest(`.${EFFECT_LAYER_CLASS}, script, style, template`))
      continue;
    if (isPinned(parent)) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    range.selectNodeContents(node);
    const shift = entranceShift(parent);
    for (const rect of range.getClientRects())
      if (rect.width > 0 && rect.height > 0) fragments.push(toPage(rect, shift));
  }
  // Сгенерированный текст (`::before`/`::after` с содержимым — номер главы, метка) в текстовых узлах не
  // виден: препятствием становится весь блок элемента, который его несёт.
  for (const holder of [element, ...element.querySelectorAll('*')]) {
    if (holder.closest(`.${EFFECT_LAYER_CLASS}`) || isPinned(holder) || !generatesText(holder))
      continue;
    const rect = holder.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) fragments.push(measureRect(holder));
  }
  return mergeLines(fragments);
}

/** Несёт ли элемент видимый сгенерированный текст. */
export function generatesText(element: Element): boolean {
  return (['::before', '::after'] as const).some((pseudo) => {
    const style = getComputedStyle(element, pseudo);
    const content = style.content;
    return (
      content !== 'none' &&
      content !== 'normal' &&
      content !== '""' &&
      content !== "''" &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

/** Слить фрагменты одной строки: общий вертикальный интервал больше половины меньшей высоты. */
export function mergeLines(fragments: readonly EffectRect[]): EffectRect[] {
  const sorted = [...fragments].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: EffectRect[] = [];
  for (const fragment of sorted) {
    const line = lines.find((candidate) => {
      const overlap =
        Math.min(candidate.y + candidate.height, fragment.y + fragment.height) -
        Math.max(candidate.y, fragment.y);
      const gap =
        Math.max(candidate.x, fragment.x) -
        Math.min(candidate.x + candidate.width, fragment.x + fragment.width);
      return overlap > Math.min(candidate.height, fragment.height) / 2 && gap < 24;
    });
    if (line === undefined) {
      lines.push({ ...fragment });
      continue;
    }
    const left = Math.min(line.x, fragment.x);
    const top = Math.min(line.y, fragment.y);
    const right = Math.max(line.x + line.width, fragment.x + fragment.width);
    const bottom = Math.max(line.y + line.height, fragment.y + fragment.height);
    Object.assign(line, { x: left, y: top, width: right - left, height: bottom - top });
  }
  return lines;
}

const CHROME_SELECTOR =
  'header, nav, [role="banner"], [role="navigation"], [role="toolbar"], button, select, input, [data-scheme-toggle]';

/**
 * Препятствия страницы для декора. Слои считаются при первом чтении и запоминаются в этом объекте:
 * эффекту, которому нужен один слой, не приходится платить за остальные (свободные области режут всю
 * страницу на полосы).
 */
export function obstacles(): EffectObstacles {
  let pinned: HTMLElement[] | undefined;
  let text: EffectRect[] | undefined;
  let chrome: EffectRect[] | undefined;
  let free: EffectRect[] | undefined;
  let pinnedLayer: EffectPinned[] | undefined;
  const pinnedList = (): HTMLElement[] => {
    pinned ??= pinnedElements(document.body);
    return pinned;
  };
  const lines = (): EffectRect[] => {
    text ??= measureLines(document.body);
    return text;
  };
  return {
    get text() {
      return lines();
    },
    get chrome() {
      if (chrome !== undefined) return chrome;
      const outer = pinnedList();
      chrome = [];
      for (const element of document.querySelectorAll(CHROME_SELECTOR)) {
        if (element.closest(`.${EFFECT_LAYER_CLASS}`)) continue;
        if (outer.some((holder) => holder.contains(element))) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) chrome.push(measureRect(element));
      }
      return chrome;
    },
    get free() {
      free ??= freeRegions(lines());
      return free;
    },
    get pinned() {
      if (pinnedLayer !== undefined) return pinnedLayer;
      pinnedLayer = [];
      for (const element of pinnedList()) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
          pinnedLayer.push({
            element,
            rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          });
      }
      return pinnedLayer;
    },
  };
}

/** Высота полосы, которой режется страница при поиске свободных областей, px. */
const ROW = 8;
/** Поле вокруг строки текста, которое декор не занимает, px. */
const TEXT_PADDING = 8;
/** Меньшая сторона свободной области, px: в меньшую декор не поместится. */
const MINIMUM_SIDE = 24;

/**
 * Свободные области: прямоугольники без строк текста (с полем 8 px). Страница режется на полосы по 8 px, в
 * каждой полосе находятся свободные промежутки, и промежутки соседних полос сливаются в прямоугольник,
 * пока следующий промежуток его вмещает; промежуток шире продолжающихся областей открывает ещё одну,
 * поэтому находятся и поля сбоку колонки, и просветы между абзацами. Области меньше 24 px отбрасываются.
 */
export function freeRegions(
  text: readonly EffectRect[],
  pageWidth = document.documentElement.scrollWidth,
  pageHeight = document.documentElement.scrollHeight,
): EffectRect[] {
  const closed: EffectRect[] = [];
  let open: EffectRect[] = [];
  const lines = [...text].sort((a, b) => a.y - b.y);
  for (let top = 0; top < pageHeight; top += ROW) {
    const bottom = Math.min(pageHeight, top + ROW);
    const busy = lines
      .filter((line) => line.y - TEXT_PADDING < bottom && line.y + line.height + TEXT_PADDING > top)
      .map((line) => [line.x - TEXT_PADDING, line.x + line.width + TEXT_PADDING] as const)
      .sort((a, b) => a[0] - b[0]);
    const gaps: Array<readonly [number, number]> = [];
    let cursor = 0;
    for (const [start, end] of busy) {
      if (start - cursor >= MINIMUM_SIDE) gaps.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (pageWidth - cursor >= MINIMUM_SIDE) gaps.push([cursor, pageWidth]);
    const next: EffectRect[] = [];
    for (const rect of open) {
      const holds = gaps.some(([start, end]) => start <= rect.x && end >= rect.x + rect.width);
      if (holds) next.push({ ...rect, height: bottom - rect.y });
      else closed.push(rect);
    }
    for (const [start, end] of gaps) {
      const inside = next.filter((rect) => rect.x >= start && rect.x + rect.width <= end);
      const covered = inside.reduce((sum, rect) => sum + rect.width, 0);
      if (end - start - covered >= MINIMUM_SIDE)
        next.push({ x: start, y: top, width: end - start, height: bottom - top });
    }
    open = next;
  }
  closed.push(...open);
  return closed.filter((rect) => rect.width >= MINIMUM_SIDE && rect.height >= MINIMUM_SIDE);
}
