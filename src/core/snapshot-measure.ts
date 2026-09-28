/**
 * Замеры собранной страницы в браузере — числа вместо кадров (`snapshot --measure`). Функция
 * `measureInPage` исполняется внутри страницы: её текст передаётся в `page.evaluate`, поэтому она не
 * обращается ни к чему вне себя. Каждый замер назван по дефекту, который он ловит; образцы — описания
 * элементов (тег, id, два класса), без текста страницы.
 */

import type { MeasuredContrast, MeasuredFinding, SnapshotPageMeasures } from '../contracts.js';

/** Порог кегля на экране, px: мельче читатель не читает (DR-FIGURE-TEXT). */
export const MEASURE_MINIMUM_TEXT_PX = 11;
/** Пустая полоса — не меньше этой доли высоты окна без текста, картинки или рамки. */
export const MEASURE_EMPTY_BAND_SHARE = 0.5;

/**
 * Исполняется в странице. Порядок важен: сначала всё, что меряется в верхнем положении (первый экран,
 * контраст, кегль, переполнение, заголовки, пустоты), затем проход прокруткой для текста под
 * фиксированными элементами, затем возврат наверх.
 */
export async function measureInPage(options: {
  readonly minimumTextPx: number;
  readonly emptyBandShare: number;
}): Promise<SnapshotPageMeasures> {
  const SAMPLES = 8;
  const root = document.documentElement;
  const viewportWidth = root.clientWidth;
  const viewportHeight = window.innerHeight;
  window.scrollTo({ top: 0, behavior: 'instant' });

  const describe = (element: Element): string => {
    const id = element.id === '' ? '' : `#${element.id}`;
    const classes = [...element.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('');
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  };
  const finding = (elements: readonly Element[]): MeasuredFinding => ({
    count: elements.length,
    samples: elements.slice(0, SAMPLES).map(describe),
  });

  // Любой цвет CSS (oklch, color-mix, системный) приводится к sRGB через холст.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const colours = new Map<string, readonly [number, number, number, number]>();
  const rgba = (value: string): readonly [number, number, number, number] => {
    const known = colours.get(value);
    if (known !== undefined) return known;
    let result: readonly [number, number, number, number] = [0, 0, 0, 0];
    if (paint !== null) {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = '#000000';
      paint.fillStyle = value;
      paint.fillRect(0, 0, 1, 1);
      const data = paint.getImageData(0, 0, 1, 1).data;
      result = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, (data[3] ?? 0) / 255];
    }
    colours.set(value, result);
    return result;
  };
  const over = (
    top: readonly [number, number, number, number],
    under: readonly [number, number, number, number],
    alpha = top[3],
  ): readonly [number, number, number, number] => [
    top[0] * alpha + under[0] * (1 - alpha),
    top[1] * alpha + under[1] * (1 - alpha),
    top[2] * alpha + under[2] * (1 - alpha),
    1,
  ];
  const luminance = (colour: readonly number[]): number => {
    const linear = (channel: number): number => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * linear(colour[0] ?? 0) +
      0.7152 * linear(colour[1] ?? 0) +
      0.0722 * linear(colour[2] ?? 0)
    );
  };

  const visible = (element: Element): boolean => {
    if (element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none') return false;
    const box = element.getBoundingClientRect();
    // Текст только для чтения с экрана (`visually-hidden`) — рамка в один пиксель.
    return box.width > 1 && box.height > 1;
  };
  const opacityOf = (element: Element): number => {
    let opacity = 1;
    for (let current: Element | null = element; current !== null; current = current.parentElement)
      opacity *= Number.parseFloat(getComputedStyle(current).opacity) || 0;
    return opacity;
  };
  const clipsInline = (element: Element): boolean => {
    const overflow = getComputedStyle(element).overflowX;
    return overflow !== 'visible';
  };

  const ownsText = (element: Element): boolean =>
    [...element.childNodes].some(
      (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
    );
  const all = [...document.body.querySelectorAll('*')].filter(
    (element) => !element.closest('script, style, noscript, template, .effect-layer'),
  );
  const svgText = all.filter(
    (element) =>
      element instanceof SVGElement && (element.tagName === 'text' || element.tagName === 'tspan'),
  );
  const htmlText = all.filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.closest('svg') &&
      ownsText(element) &&
      visible(element) &&
      opacityOf(element) > 0.01,
  ) as HTMLElement[];

  // Кегль мельче порога: текст HTML по вычисленному размеру, текст SVG — по размеру на экране.
  const small: Element[] = [];
  for (const element of htmlText)
    if (Number.parseFloat(getComputedStyle(element).fontSize) < options.minimumTextPx)
      small.push(element);
  for (const element of svgText) {
    if (!ownsText(element) || !visible(element)) continue;
    const matrix = (element as SVGGraphicsElement).getScreenCTM?.();
    const scale = matrix === null || matrix === undefined ? 1 : Math.hypot(matrix.a, matrix.b);
    if (Number.parseFloat(getComputedStyle(element).fontSize) * scale < options.minimumTextPx)
      small.push(element);
  }

  // Контраст отрисованного текста: цвет текста с непрозрачностью предков поверх сведённого фона.
  const lowContrast: MeasuredContrast[] = [];
  let lowCount = 0;
  let unmeasured = 0;
  for (const element of htmlText) {
    if (element.closest(':disabled, [aria-disabled="true"]')) continue;
    const style = getComputedStyle(element);
    if (style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') {
      unmeasured += 1;
      continue;
    }
    const layers: Array<readonly [number, number, number, number]> = [];
    let unknown = false;
    let opaque = false;
    for (let current: Element | null = element; current !== null; current = current.parentElement) {
      const own = getComputedStyle(current);
      const background = rgba(own.backgroundColor);
      // Картинка или градиент над прозрачным фоном — фон под текстом не свести к цвету. Над сплошным
      // цветом это узор или тень края (прокрутка кода вбок): меряется цвет.
      if (own.backgroundImage !== 'none' && background[3] < 0.99) {
        unknown = true;
        break;
      }
      if (background[3] > 0) layers.push(background);
      if (background[3] >= 0.99) {
        opaque = true;
        break;
      }
    }
    if (unknown) {
      unmeasured += 1;
      continue;
    }
    let background: readonly [number, number, number, number] = opaque
      ? (layers.pop() ?? [255, 255, 255, 1])
      : [255, 255, 255, 1];
    for (const layer of layers.reverse()) background = over(layer, background);
    const colour = rgba(style.color);
    const opacity = opacityOf(element);
    const text = over(colour, background, colour[3] * opacity);
    const lighter = Math.max(luminance(text), luminance(background));
    const darker = Math.min(luminance(text), luminance(background));
    const ratio = (lighter + 0.05) / (darker + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
    const minimum = large ? 3 : 4.5;
    if (ratio < minimum) {
      lowCount += 1;
      if (lowContrast.length < SAMPLES)
        lowContrast.push({
          element: describe(element),
          ratio: Math.round(ratio * 100) / 100,
          minimum,
          opacity: Math.round(opacity * 100) / 100,
        });
    }
  }

  // Прокрутка вбок: элементы за правым или левым краем окна, которые не обрезает ни один предок.
  const overflowing: Element[] = [];
  for (const element of all) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || (box.right <= viewportWidth + 1 && box.left >= -1)) continue;
    if (getComputedStyle(element).position === 'fixed') continue;
    let clipped = false;
    for (
      let parent = element.parentElement;
      parent !== null && parent !== document.body;
      parent = parent.parentElement
    )
      if (clipsInline(parent)) {
        clipped = true;
        break;
      }
    if (clipped) continue;
    // Называется самый внешний выходящий элемент, а не каждый его потомок.
    if (overflowing.some((outer) => outer.contains(element))) continue;
    overflowing.push(element);
  }

  // Обрезанные заголовки: текст шире своей рамки при обрезке, строки под многоточием, выход за окно.
  const clipped: Element[] = [];
  for (const heading of document.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, [role="heading"], .semantic-title',
  )) {
    if (!visible(heading)) continue;
    const style = getComputedStyle(heading);
    const box = heading.getBoundingClientRect();
    const wide = heading.scrollWidth > heading.clientWidth + 1;
    if (
      (style.overflowX !== 'visible' && wide) ||
      (style.textOverflow === 'ellipsis' && wide) ||
      (style.webkitLineClamp !== 'none' && heading.scrollHeight > heading.clientHeight + 1) ||
      box.right > viewportWidth + 1 ||
      box.left < -1
    )
      clipped.push(heading);
  }

  // Пустые полосы документа: промежутки по высоте, где нет ни текста, ни картинки, ни рамки, ни фона.
  const layout = root.dataset.layout ?? 'document';
  const bands: Array<{ top: number; height: number }> = [];
  if (layout !== 'screens' && layout !== 'slides') {
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    const ink: Array<[number, number]> = [];
    const add = (box: DOMRect): void => {
      if (box.height > 0 && box.width > 0)
        ink.push([box.top + window.scrollY, box.bottom + window.scrollY]);
    };
    for (const element of htmlText) for (const box of element.getClientRects()) add(box);
    for (const element of all) {
      if (element.parentElement?.closest('[data-scene-live] .scene-track')) continue;
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || !visible(element)) continue;
      const replaced = element.matches(
        'img, svg, canvas, video, iframe, picture, input, select, textarea, button, hr, table, .scene-track',
      );
      const filled =
        rgba(style.backgroundColor)[3] > 0.05 && style.backgroundColor !== pageBackground;
      const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) =>
          Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
          rgba(style.getPropertyValue(`border-${side.toLowerCase()}-color`))[3] > 0.05,
      );
      const box = element.getBoundingClientRect();
      // Обёртка выше полутора окон со своим фоном — поле страницы, а не содержимое: иначе она закрыла
      // бы собой любую пустоту внутри.
      const decorated =
        filled || bordered || style.boxShadow !== 'none' || style.backgroundImage !== 'none';
      if (replaced || (decorated && box.height <= viewportHeight * 1.5)) add(box);
    }
    ink.sort((a, b) => a[0] - b[0]);
    const threshold = viewportHeight * options.emptyBandShare;
    let reached = 0;
    for (const [top, bottom] of ink) {
      if (top - reached >= threshold)
        bands.push({ top: Math.round(reached), height: Math.round(top - reached) });
      reached = Math.max(reached, bottom);
    }
  }

  // Первый экран: заголовок, главное действие и доля главной сцены — самого крупного изображения окна.
  const inFirstScreen = (element: Element): boolean => {
    if (!visible(element)) return false;
    const box = element.getBoundingClientRect();
    return box.top < viewportHeight && box.bottom > 0 && box.left < viewportWidth && box.right > 0;
  };
  const heading = document.querySelector('main h1, article h1, h1');
  const actions = [...document.querySelectorAll('.semantic-action, [data-primary-action]')];
  const action = actions.find(inFirstScreen);
  let mainSceneShare = 0;
  let mainScene: Element | undefined;
  for (const element of document.querySelectorAll(
    'img, video, canvas, picture, pre, .visualization-frame, [data-scene] .scene-stage, main svg',
  )) {
    if (element.closest('.effect-layer, .topbar, header, nav') || !inFirstScreen(element)) continue;
    const box = element.getBoundingClientRect();
    const width = Math.min(box.right, viewportWidth) - Math.max(box.left, 0);
    const height = Math.min(box.bottom, viewportHeight) - Math.max(box.top, 0);
    const share = (Math.max(0, width) * Math.max(0, height)) / (viewportWidth * viewportHeight);
    if (share > mainSceneShare) {
      mainSceneShare = share;
      mainScene = element;
    }
  }

  // Заглушки в тексте страницы (вне кода): lorem ipsum, TODO, TBD.
  let placeholders = 0;
  for (const element of htmlText) {
    if (element.closest('pre, code')) continue;
    for (const child of element.childNodes)
      if (child.nodeType === Node.TEXT_NODE)
        placeholders +=
          (child.textContent ?? '').match(/\b(?:lorem ipsum|TODO|TBD|FIXME)\b/giu)?.length ?? 0;
  }
  const failedFonts = [
    ...new Set(
      [...document.fonts].filter((face) => face.status === 'error').map((face) => face.family),
    ),
  ];

  // Текст под фиксированным или липким элементом: проход прокруткой по странице, в каждом положении —
  // какой элемент на самом деле сверху в точке строки текста. Верхняя панель во всю ширину не в счёт:
  // под неё текст уходит при обычной прокрутке.
  const coverers = all.filter((element) => {
    const position = getComputedStyle(element).position;
    return (position === 'fixed' || position === 'sticky') && visible(element);
  });
  const covered = new Map<string, Element>();
  if (coverers.length > 0) {
    const step = Math.max(200, Math.floor(viewportHeight * 0.8));
    const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));
    for (let top = 0; top < root.scrollHeight; top += step) {
      window.scrollTo({ top, behavior: 'instant' });
      await pause();
      for (const coverer of coverers) {
        const cover = coverer.getBoundingClientRect();
        if (cover.width === 0 || cover.height === 0) continue;
        if (cover.width >= viewportWidth * 0.9 && cover.top <= 1) continue;
        for (const element of htmlText) {
          if (coverer.contains(element) || element.contains(coverer)) continue;
          for (const line of element.getClientRects()) {
            const left = Math.max(line.left, cover.left);
            const right = Math.min(line.right, cover.right);
            const upper = Math.max(line.top, cover.top);
            const lower = Math.min(line.bottom, cover.bottom);
            if (right - left < 2 || lower - upper < 2) continue;
            const x = (left + right) / 2;
            const y = (upper + lower) / 2;
            if (x < 0 || y < 0 || x >= viewportWidth || y >= viewportHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit !== null && coverer.contains(hit) && !element.contains(hit))
              covered.set(`${describe(element)} under ${describe(coverer)}`, element);
          }
        }
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await pause();
  }

  return {
    pageHeight: Math.ceil(root.scrollHeight),
    horizontalOverflow: Math.max(0, root.scrollWidth - viewportWidth),
    overflowing: overflowing.slice(0, SAMPLES).map(describe),
    smallText: finding(small),
    lowContrast: { count: lowCount, samples: lowContrast },
    unmeasuredContrast: unmeasured,
    coveredText: { count: covered.size, samples: [...covered.keys()].slice(0, SAMPLES) },
    emptyBands: bands,
    clippedHeadings: finding(clipped),
    firstScreen: {
      heading: heading !== null && inFirstScreen(heading),
      action: action !== undefined,
      actionOnPage: actions.length > 0,
      mainSceneShare: Math.round(mainSceneShare * 100) / 100,
      ...(mainScene === undefined ? {} : { mainScene: describe(mainScene) }),
    },
    placeholders,
    failedFonts,
  };
}
