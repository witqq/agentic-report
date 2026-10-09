/**
 * Замеры собранной страницы в браузере — числа вместо кадров (`snapshot --measure`). Функция
 * `measureInPage` исполняется внутри страницы: её текст передаётся в `page.evaluate`, поэтому она не
 * обращается ни к чему вне себя. Каждый замер назван по дефекту, который он ловит; образцы — описания
 * элементов (тег, id, два класса), без текста страницы.
 */

import type {
  MeasuredBlock,
  MeasuredContrast,
  MeasuredFinding,
  MeasuredTable,
  SnapshotPageMeasures,
} from '../contracts.js';

/** Порог кегля на экране, px: мельче читатель не читает (DR-FIGURE-TEXT). */
export const MEASURE_MINIMUM_TEXT_PX = 11;
/**
 * Порог кегля текста страницы на телефоне, px: метка мельче 12 px с руки не читается. Подписи внутри
 * рисунка SVG меряются общим порогом: их кегль уменьшает масштаб рисунка, и у схемы есть полноэкранный
 * просмотр.
 */
export const MEASURE_PHONE_MINIMUM_TEXT_PX = 12;
/** Пустая полоса — не меньше этой доли высоты окна без текста, картинки или рамки. */
export const MEASURE_EMPTY_BAND_SHARE = 0.5;
/**
 * Таблица шире экрана больше чем в 1,25 раза — читатель листает её вбок дальше, чем видит: на телефоне
 * это три-четыре экрана вбок на каждую строку. До 1,25 прокрутка — подсказка края, а не дефект.
 */
export const MEASURE_TABLE_OVERFLOW_RATIO = 1.25;
/**
 * Доля пустой площади ячеек (содержательная рамка ячейки минус рамки строк её текста), выше которой
 * таблица — редкие слова в широких пустых клетках. Порог выведен замером таблиц примеров пакета на 390
 * и 1440 px: у плотных таблиц пустота 0,31–0,68 (строки короче колонки, ячейки ниже соседей в ряду); у
 * таблиц, где одна колонка сжата в столбик слов рядом с пустыми клетками или таблица раздута на телефоне
 * до трёх экранов, — 0,74–0,89.
 */
export const MEASURE_TABLE_EMPTY_SHARE = 0.7;
/** Окно не шире этого — телефон: колонка чтения обязана занимать его почти целиком. */
export const MEASURE_PHONE_WIDTH = 480;
/**
 * Минимальная доля ширины окна под колонкой чтения на телефоне. 0,88 оставляет по 23 px полей на 390 и
 * по 19 px на 320 — обычное поле телефона 16–20 px; двойное поле (35 px с каждой стороны, 82 %)
 * отнимает у строки пятую часть и дефектом считается.
 */
export const MEASURE_READING_COLUMN_SHARE = 0.88;
/**
 * Блок чужой схемы: отношение яркостей блока и фона страницы, как у контраста текста, не меньше 7 (AAA
 * для текста). Блок, отличающийся от страницы так же сильно, как текст от фона, читается дырой в
 * странице: светлый снимок на тёмной странице или тёмная плита на светлой. Меньше 120×80 — значок или
 * кнопка, не блок.
 */
export const MEASURE_OFF_SCHEME_RATIO = 7;
/**
 * Доля площади блока, которую занимают такие пиксели, начиная с которой блок — чужой схемы. Светлый
 * снимок страницы на тёмном лендинге целиком светел (доля 0,7–0,8); снимок с тёмной шапкой и светлой
 * панелью несёт светлую плиту в четверть кадра (0,24) — владелец видит её как светлый блок. Пятая часть
 * ловит оба, а тёмные тени фотографии на светлой странице обычно меньше.
 */
export const MEASURE_OFF_SCHEME_SHARE = 0.2;
/**
 * Картинка чужой схемы — это плоская площадь: бумага схемы, фон интерфейса, панель, у которых соседние
 * пиксели совпадают. Фотография с тёмным небом или светлой пустыней не дефект схемы: её тёмное и светлое
 * — содержание, и оно фактурно. Пиксель считается, только если все четыре соседа при выборке 64×64
 * ближайшим пикселем (без сглаживания, так шум и фактура снимка сохраняются) отличаются от него не больше
 * чем на единицу по каждому каналу. По примерам пакета: у снимков страниц и схем плоская далёкая площадь
 * 0,42–0,82 (градиент фона рисунка идёт шагом в единицу), у фотографий, включая ночную Москву с чёрным
 * космосом, — не больше 0,02.
 */
export const MEASURE_FLAT_TOLERANCE = 1;
export const MEASURE_BLOCK_MIN_WIDTH = 120;
/**
 * Заливка таблицы шире её содержимого больше чем на эту долю дорожки — мёртвая поверхность: короткая
 * таблица в три колонки на панели во всю ширину экрана, две трети которой пусты.
 */
export const MEASURE_DEAD_SURFACE_SHARE = 0.25;
/** Текст крайней ячейки ближе этого к краю заливки таблицы, px — текст без отступа от края поверхности. */
export const MEASURE_FLUSH_TEXT_PX = 4;
export const MEASURE_BLOCK_MIN_HEIGHT = 80;
/** Окно шире этого — не телефон: блоки раздела стоят на одной оси, а не выходят к краям экрана (48rem). */
export const MEASURE_COLUMN_MIN_VIEWPORT = 768;
/** Левый край блока раздела дальше этого от левого края его колонки прозы, px, — блок не на оси колонки. */
export const MEASURE_COLUMN_EDGE_PX = 2;
/**
 * Текстовый блок раздела (заголовок, суть, абзац, список, раскрытие) выходит за правый край колонки прозы
 * дальше этого, px: строки или линии соседних блоков одного раздела разной длины.
 */
export const MEASURE_COLUMN_OVERRUN_PX = 24;
/** Колонка прозы уже этой доли дорожки раздела — большая часть экрана рядом с текстом пуста. */
export const MEASURE_COLUMN_TRACK_SHARE = 0.6;
/**
 * Широкий блок с рамкой или заливкой пуст справа, если его краска кончается дальше чем в 48 px и дальше
 * четверти его ширины от правого края: рамка во весь шаг вокруг содержимого в его левой половине.
 */
export const MEASURE_HOLLOW_PX = 48;
export const MEASURE_HOLLOW_SHARE = 0.25;
/**
 * Колонка дальше этого от пристыкованного оглавления, px, — плавает в остатке окна, оторванная от него.
 * Зазор оболочки (`--shell-gap`) не больше 48 px; вдвое больше — уже пустое поле между оглавлением и текстом.
 */
export const MEASURE_TOC_GAP_PX = 96;

/** Пороги замера одной записью: так их получают и команда, и проверки. */
export const MEASURE_OPTIONS = {
  minimumTextPx: MEASURE_MINIMUM_TEXT_PX,
  phoneMinimumTextPx: MEASURE_PHONE_MINIMUM_TEXT_PX,
  emptyBandShare: MEASURE_EMPTY_BAND_SHARE,
  tableOverflowRatio: MEASURE_TABLE_OVERFLOW_RATIO,
  tableEmptyShare: MEASURE_TABLE_EMPTY_SHARE,
  phoneWidth: MEASURE_PHONE_WIDTH,
  readingColumnShare: MEASURE_READING_COLUMN_SHARE,
  offSchemeRatio: MEASURE_OFF_SCHEME_RATIO,
  offSchemeShare: MEASURE_OFF_SCHEME_SHARE,
  flatTolerance: MEASURE_FLAT_TOLERANCE,
  blockMinWidth: MEASURE_BLOCK_MIN_WIDTH,
  blockMinHeight: MEASURE_BLOCK_MIN_HEIGHT,
  deadSurfaceShare: MEASURE_DEAD_SURFACE_SHARE,
  flushTextPx: MEASURE_FLUSH_TEXT_PX,
  columnMinViewport: MEASURE_COLUMN_MIN_VIEWPORT,
  columnEdgePx: MEASURE_COLUMN_EDGE_PX,
  columnOverrunPx: MEASURE_COLUMN_OVERRUN_PX,
  columnTrackShare: MEASURE_COLUMN_TRACK_SHARE,
  hollowPx: MEASURE_HOLLOW_PX,
  hollowShare: MEASURE_HOLLOW_SHARE,
  tocGapPx: MEASURE_TOC_GAP_PX,
} as const;

/**
 * Исполняется в странице. Порядок важен: сначала всё, что меряется в верхнем положении (первый экран,
 * контраст, кегль, переполнение, заголовки, пустоты), затем проход прокруткой для текста под
 * фиксированными элементами, затем возврат наверх.
 */
export async function measureInPage(options: {
  readonly [Key in keyof typeof MEASURE_OPTIONS]: number;
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
  // Элемент без id называется вместе с ближайшим предком с id: «table» из девяти таблиц ни на что не
  // указывает, «section#map table» — указывает.
  const locate = (element: Element): string => {
    const anchor = element.id === '' ? element.parentElement?.closest('[id]') : null;
    return anchor === null || anchor === undefined || anchor === document.body
      ? describe(element)
      : `${describe(anchor)} ${describe(element)}`;
  };
  const located = (elements: readonly Element[]): MeasuredFinding => ({
    count: elements.length,
    samples: elements.slice(0, SAMPLES).map(locate),
  });
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

  // Кегль мельче порога: текст HTML по вычисленному размеру (на телефоне порог выше), текст SVG — по
  // размеру на экране.
  const htmlMinimum =
    viewportWidth <= options.phoneWidth ? options.phoneMinimumTextPx : options.minimumTextPx;
  const small: Element[] = [];
  for (const element of htmlText)
    if (Number.parseFloat(getComputedStyle(element).fontSize) < htmlMinimum) small.push(element);
  for (const element of svgText) {
    // Как и текст HTML, прозрачный текст SVG (изнанка узла под `zoom` до пролёта камеры) не читается.
    if (!ownsText(element) || !visible(element) || opacityOf(element) <= 0.01) continue;
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
  // Заголовок за краем окна внутри ленты, которая прокручивается вбок (карточки карусели), не обрезан:
  // читатель доходит до него прокруткой ленты.
  const inSideScroller = (element: Element): boolean => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'auto' || overflow === 'scroll')
        return parent.scrollWidth > parent.clientWidth + 1;
    }
    return false;
  };
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
      ((box.right > viewportWidth + 1 || box.left < -1) && !inSideScroller(heading))
    )
      clipped.push(heading);
  }

  // Пустые полосы документа: промежутки по высоте, где нет ни текста, ни картинки, ни рамки, ни фона.
  const layout = root.dataset.layout ?? 'document';
  const bands: Array<{ top: number; height: number; next?: string }> = [];
  if (layout !== 'screens' && layout !== 'slides') {
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    // Каждая полоса краски помнит свой элемент: полоса пустоты называет элемент, на котором она кончается.
    const ink: Array<[number, number, Element]> = [];
    const add = (box: DOMRect, element: Element): void => {
      if (box.height > 0 && box.width > 0)
        ink.push([box.top + window.scrollY, box.bottom + window.scrollY, element]);
    };
    for (const element of htmlText) for (const box of element.getClientRects()) add(box, element);
    for (const element of all) {
      // Дорожка закреплённой сцены и пролёт камеры `zoom` — длина прокрутки, а не пустота: сама дорожка
      // считается краской, её закреплённое содержимое не меряется по месту в документе.
      if (
        element.parentElement?.closest(
          '[data-scene-live] .scene-track, [data-zoom-live] > .visualization-zoom',
        )
      )
        continue;
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || !visible(element)) continue;
      const replaced = element.matches(
        'img, svg, canvas, video, iframe, picture, input, select, textarea, button, hr, table, .scene-track, [data-zoom-live] > .visualization-zoom',
      );
      const filled =
        rgba(style.backgroundColor)[3] > 0.05 && style.backgroundColor !== pageBackground;
      const border = (side: string): number =>
        rgba(style.getPropertyValue(`border-${side}-color`))[3] > 0.05
          ? Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0
          : 0;
      const box = element.getBoundingClientRect();
      // Обёртка выше полутора окон со своим фоном — поле страницы, а не содержимое: иначе она закрыла
      // бы собой любую пустоту внутри.
      const surface = filled || style.boxShadow !== 'none' || style.backgroundImage !== 'none';
      if (replaced || (surface && box.height <= viewportHeight * 1.5)) {
        add(box, element);
        continue;
      }
      // Рамка без фона красит только свои линии: верхняя линия раздела не закрывает пустоту под ней.
      // Боковая линия видна по всей высоте и закрывает её, как поверхность.
      if (box.height > viewportHeight * 1.5) continue;
      if (border('left') > 0 || border('right') > 0) add(box, element);
      else {
        const top = border('top');
        const bottom = border('bottom');
        if (top > 0) add(new DOMRect(box.left, box.top, box.width, top), element);
        if (bottom > 0) add(new DOMRect(box.left, box.bottom - bottom, box.width, bottom), element);
      }
    }
    ink.sort((a, b) => a[0] - b[0]);
    const threshold = viewportHeight * options.emptyBandShare;
    let reached = 0;
    for (const [top, bottom, element] of ink) {
      if (top - reached >= threshold)
        bands.push({
          top: Math.round(reached),
          height: Math.round(top - reached),
          next: describe(element),
        });
      reached = Math.max(reached, bottom);
    }
    // Пустота под последним содержимым до конца документа — тоже полоса: её читатель пролистывает.
    const end = root.scrollHeight;
    if (ink.length > 0 && end - reached >= threshold)
      bands.push({ top: Math.round(reached), height: Math.round(end - reached) });
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

  // Таблицы: ширина содержимого против контейнера и окна, прокрутка вбок и доля пустой площади ячеек.
  // Таблица с `data-table-layout="scroll"` объявлена прокручиваемой: её ширина дефектом не считается.
  const scrollBox = (element: Element): Element | undefined => {
    for (let current: Element | null = element; current !== null; current = current.parentElement) {
      if (current === document.body) return undefined;
      const overflow = getComputedStyle(current).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return current;
    }
    return undefined;
  };
  const textArea = (
    cell: Element,
    frame: { l: number; r: number; t: number; b: number },
  ): number => {
    let area = 0;
    const range = document.createRange();
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const clip = (box: DOMRect): number =>
      Math.max(0, Math.min(box.right, frame.r) - Math.max(box.left, frame.l)) *
      Math.max(0, Math.min(box.bottom, frame.b) - Math.max(box.top, frame.t));
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '') continue;
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) area += clip(box);
    }
    for (const picture of cell.querySelectorAll('img, svg, canvas, video, input, select, button'))
      area += clip(picture.getBoundingClientRect());
    return area;
  };
  // Поверхность таблицы: сама таблица или её рамка со своей заливкой, отличной от того, что под ней.
  const underColour = (element: Element): readonly [number, number, number, number] => {
    let colour: readonly [number, number, number, number] = [255, 255, 255, 1];
    const layers: Array<readonly [number, number, number, number]> = [];
    for (let current = element.parentElement; current !== null; current = current.parentElement) {
      const own = rgba(getComputedStyle(current).backgroundColor);
      if (own[3] > 0) layers.push(own);
      if (own[3] >= 0.99) break;
    }
    for (const layer of layers.reverse()) colour = over(layer, colour);
    return colour;
  };
  const surfaceOf = (table: Element): Element | undefined => {
    for (const candidate of [table, table.parentElement]) {
      if (candidate === null || candidate === document.body) return undefined;
      const own = rgba(getComputedStyle(candidate).backgroundColor);
      if (own[3] <= 0.05) continue;
      const under = underColour(candidate);
      const painted = over(own, under);
      if (
        Math.abs(painted[0] - under[0]) +
          Math.abs(painted[1] - under[1]) +
          Math.abs(painted[2] - under[2]) >
        3
      )
        return candidate;
    }
    return undefined;
  };
  const textBoxes = (cell: Element): DOMRect[] => {
    const boxes: DOMRect[] = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '') continue;
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) if (box.width > 0) boxes.push(box);
    }
    return boxes;
  };
  const tables: MeasuredTable[] = [];
  const wideTables: Element[] = [];
  const sparseTables: Element[] = [];
  const deadSurfaces: Element[] = [];
  const flushTables: Element[] = [];
  for (const table of document.querySelectorAll('table')) {
    if (!visible(table) || table.closest('.effect-layer')) continue;
    const box = table.getBoundingClientRect();
    // Таблица, показанная карточками: строка во всю ширину с коротким значением — не пустая клетка.
    const firstRow = table.querySelector('tr');
    const cards = firstRow !== null && getComputedStyle(firstRow).display !== 'table-row';
    const scroller = scrollBox(table);
    const width = Math.max(
      box.width,
      table.scrollWidth,
      ...[...table.children].map((part) => part.getBoundingClientRect().width),
    );
    const container = scroller ?? table.parentElement ?? table;
    const scrolls = scroller !== undefined && scroller.scrollWidth > scroller.clientWidth + 1;
    let cellArea = 0;
    let inkArea = 0;
    for (const cell of table.querySelectorAll('td, th')) {
      const style = getComputedStyle(cell);
      const edge = (side: string): number =>
        Number.parseFloat(style.getPropertyValue(`padding-${side}`)) +
        Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
      const outer = cell.getBoundingClientRect();
      const frame = {
        l: outer.left + edge('left'),
        r: outer.right - edge('right'),
        t: outer.top + edge('top'),
        b: outer.bottom - edge('bottom'),
      };
      const area = Math.max(0, frame.r - frame.l) * Math.max(0, frame.b - frame.t);
      if (area === 0) continue;
      cellArea += area;
      inkArea += Math.min(area, textArea(cell, frame));
    }
    const emptyShare = cellArea === 0 ? 0 : 1 - inkArea / cellArea;
    const scrollLayout = table.closest('[data-table-layout="scroll"]') !== null;
    if (!scrollLayout && width > viewportWidth * options.tableOverflowRatio) wideTables.push(table);
    if (!cards && emptyShare > options.tableEmptyShare) sparseTables.push(table);
    const surface = surfaceOf(table);
    if (surface !== undefined) {
      const area = surface.getBoundingClientRect();
      const cells = [...table.querySelectorAll('td, th')].filter(visible);
      const left = Math.min(...cells.map((cell) => cell.getBoundingClientRect().left));
      const right = Math.max(...cells.map((cell) => cell.getBoundingClientRect().right));
      // Мёртвая поверхность: заливка шире содержимого таблицы больше чем на четверть дорожки.
      const track = surface.parentElement?.clientWidth ?? viewportWidth;
      if (cells.length > 0 && area.width - (right - left) > track * options.deadSurfaceShare)
        deadSurfaces.push(table);
      // Текст вплотную к краю заливки: крайние ячейки строк без отступа от её левого или правого края.
      const flush = [...table.querySelectorAll('tr')].some((row) => {
        const rowCells = [...row.children].filter(visible);
        const first = rowCells.at(0);
        const last = rowCells.at(-1);
        const starts = first === undefined ? [] : textBoxes(first).map((line) => line.left);
        const ends = last === undefined ? [] : textBoxes(last).map((line) => line.right);
        return (
          starts.some(
            (start) => start >= area.left - 1 && start - area.left < options.flushTextPx,
          ) || ends.some((end) => end <= area.right + 1 && area.right - end < options.flushTextPx)
        );
      });
      if (flush) flushTables.push(table);
    }
    tables.push({
      element: locate(table),
      width: Math.round(width),
      containerWidth: Math.round(container.clientWidth),
      viewportShare: Math.round((width / viewportWidth) * 100) / 100,
      scrolls,
      emptyShare: Math.round(emptyShare * 100) / 100,
      scrollLayout,
    });
  }
  // Образцы — сначала таблицы с дефектом, затем самые широкие.
  const tableSamples = [...tables]
    .sort(
      (a, b) =>
        Number(b.viewportShare > options.tableOverflowRatio && !b.scrollLayout) -
          Number(a.viewportShare > options.tableOverflowRatio && !a.scrollLayout) ||
        Number(b.emptyShare > options.tableEmptyShare) -
          Number(a.emptyShare > options.tableEmptyShare) ||
        b.viewportShare - a.viewportShare,
    )
    .slice(0, SAMPLES);

  // Колонка чтения: ширина, которую делят больше всего абзацев прозы (вне таблиц, списков, карточек,
  // рисунков, полей и пунктов — статьи внутри статьи, как пункт формы ответа), и её доля окна. На
  // телефоне узкая колонка — двойное поле, дефект.
  const columnWidths = new Map<number, { count: number; element: Element }>();
  for (const paragraph of document.querySelectorAll('main p, article p')) {
    if (
      paragraph.closest(
        'table, li, figure, aside, nav, header, footer, blockquote, details > summary, dialog, [class*="card"], article article, .effect-layer, .edition-ghost',
      ) !== null ||
      !visible(paragraph) ||
      (paragraph.textContent ?? '').trim().length < 40
    )
      continue;
    const width = Math.round(paragraph.getBoundingClientRect().width);
    const known = columnWidths.get(width);
    columnWidths.set(width, {
      count: (known?.count ?? 0) + 1,
      element: known?.element ?? paragraph,
    });
  }
  let column: { width: number; count: number; element?: Element } = { width: 0, count: 0 };
  for (const [width, entry] of columnWidths)
    if (entry.count > column.count || (entry.count === column.count && width > column.width))
      column = { width, count: entry.count, element: entry.element };
  const columnShare = column.width / viewportWidth;
  const narrowColumn =
    column.width > 0 &&
    viewportWidth <= options.phoneWidth &&
    columnShare < options.readingColumnShare;

  // Композиция раздела на широком окне: колонка прозы раздела — ширина, которую делят больше всего его
  // прямых абзацев. Каждый блок раздела начинается на её левом краю или стоит по её центру, а блок шире
  // колонки — только по центру, выступая поровну в обе стороны; текстовый
  // блок не уходит строками (раскрытие — линиями) за её правый край; колонка не оставляет большую часть
  // дорожки раздела пустой. Разделы с другой композицией (split, stage, story) и центрованные не в счёт.
  const columnFindings: Array<{
    element: Element;
    kind:
      'misaligned' | 'overrun' | 'empty-track' | 'code-width' | 'hollow' | 'head-wide' | 'toc-gap';
    column: number;
    value: number;
  }> = [];
  const bodyBackground = getComputedStyle(document.body).backgroundColor;
  // Правый край краски блока: строки текста, картинки, холсты, поля; у рамки острова — ширина, которую
  // сообщил сам остров (`data-island-ink`), иначе вся рамка.
  const inkRight = (element: Element): number => {
    // Строки текста по текстовым узлам: диапазон по содержимому элемента вернул бы и рамки его детей.
    let right = -Infinity;
    const lines = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '') continue;
      lines.selectNodeContents(node);
      for (const box of lines.getClientRects())
        if (box.width > 0) right = Math.max(right, box.right);
    }
    for (const picture of element.querySelectorAll(
      'img, svg, video, canvas, input, select, textarea, button, iframe',
    )) {
      if (picture.parentElement?.closest('svg') !== null && picture.tagName !== 'svg') continue;
      const box = picture.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const reported = Number(
        picture.closest<HTMLElement>('[data-island-ink]')?.dataset.islandInk ?? Number.NaN,
      );
      right = Math.max(
        right,
        picture.tagName === 'IFRAME' && Number.isFinite(reported) ? box.left + reported : box.right,
      );
    }
    return right;
  };
  const paintsSurface = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const fill = rgba(style.backgroundColor);
    const sides = ['left', 'right'].every(
      (side) =>
        rgba(style.getPropertyValue(`border-${side}-color`))[3] > 0.05 &&
        (Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0) > 0,
    );
    return (fill[3] > 0.05 && style.backgroundColor !== bodyBackground) || sides;
  };
  const textRight = (element: Element): number => {
    const range = document.createRange();
    range.selectNodeContents(element);
    let right = -Infinity;
    for (const box of range.getClientRects()) if (box.width > 0) right = Math.max(right, box.right);
    return right;
  };
  // Экраны и слайды — кадры, а не колонка документа: их раскладка своя, как и у пустых полос.
  const flowPage = layout !== 'screens' && layout !== 'slides';
  // Одну центральную ось пакет строит в документе; у лендинга и других раскладок широкий блок может стоять
  // у края текста.
  const axis = layout === 'document' || layout === 'mixed';
  if (viewportWidth > options.columnMinViewport && flowPage)
    // В документе статья — тоже колонка: её собственные блоки между разделами (страница из одного Markdown
    // без разделов целиком такая) подчиняются той же оси.
    for (const section of [
      ...[axis ? document.querySelector('main article, .report-content article') : null].filter(
        (element): element is Element => element !== null,
      ),
      ...document.querySelectorAll('.semantic-section'),
    ]) {
      if (!visible(section) || section.closest('.effect-layer, dialog') !== null) continue;
      const composition = section.getAttribute('data-composition');
      if (
        (composition !== null && composition !== 'flow') ||
        section.matches('[data-align="center"]')
      )
        continue;
      // Блоки раздела — его прямые дети и дети открытых раскрытий: соседние блоки кода в раскрытии стоят в той
      // же системе ширин, что и вне его.
      const children = [...section.children]
        .filter((child) => !child.matches('.semantic-section'))
        .flatMap((child) =>
          child.matches('details[open]') ? [child, ...child.children] : [child],
        );
      const blocks = children.filter((child) => {
        if (child.matches('details > summary')) return false;
        if (!visible(child)) return false;
        const style = getComputedStyle(child);
        return (
          style.float === 'none' && (style.position === 'static' || style.position === 'relative')
        );
      });
      const widths = new Map<number, { count: number; left: number }>();
      for (const child of blocks) {
        // Вступление набрано крупнее прозы и уже её колонки: колонкой раздела оно не бывает.
        if (
          child.tagName !== 'P' ||
          child.matches('.semantic-lead') ||
          child.closest('.edition-ghost') !== null ||
          (child.textContent ?? '').trim().length < 40
        )
          continue;
        const box = child.getBoundingClientRect();
        const width = Math.round(box.width);
        const known = widths.get(width);
        widths.set(width, { count: (known?.count ?? 0) + 1, left: known?.left ?? box.left });
      }
      let prose: { width: number; count: number; left: number } = { width: 0, count: 0, left: 0 };
      for (const [width, entry] of widths)
        if (entry.count > prose.count || (entry.count === prose.count && width > prose.width))
          prose = { width, ...entry };
      if (prose.count === 0) continue;
      const right = prose.left + prose.width;
      const bleed = section.matches('[data-media="bleed"]');
      // Ширина, которую занимает хоть один блок раздела: текст — своими строками, остальное — рамкой.
      let used = 0;
      for (const child of blocks) {
        const box = child.getBoundingClientRect();
        // Одна ось — центр колонки прозы: блок на ней либо начинается у левого края прозы, либо стоит по её
        // центру; блок шире прозы выступает поровну в обе стороны, иначе правый край рвётся ступенькой.
        const centred =
          Math.abs(box.left + box.width / 2 - (prose.left + prose.width / 2)) <=
          options.columnEdgePx;
        const wide = box.width > prose.width + options.columnEdgePx;
        // Картинка раздела `media="bleed"` выходит к краю раздела по замыслу автора.
        const bled =
          bleed &&
          (child.textContent ?? '').trim() === '' &&
          child.querySelector('img, picture, video') !== null;
        const offset = Math.round(box.left - prose.left);
        const textual = child.matches(
          'h2, h3, h4, h5, h6, p, ul, ol, dl, blockquote, .semantic-lead',
        );
        used = Math.max(
          used,
          textual && child.querySelector('img, svg, video, canvas, table, pre') === null
            ? textRight(child) - box.left
            : box.width,
        );
        // Текст читается от левого края своих строк: текстовый блок начинается у края прозы, где бы ни стояла
        // его рамка; его правый край проверяет выход строк за колонку ниже. Абзац с картинкой — картинка.
        const lines =
          textual && child.querySelector('img, svg, video, canvas, table, pre') === null;
        const off = lines
          ? Math.abs(offset) > options.columnEdgePx
          : !centred && ((axis && wide) || Math.abs(offset) > options.columnEdgePx);
        if (off && !bled)
          columnFindings.push({
            element: child,
            kind: 'misaligned',
            column: prose.width,
            value: offset,
          });
        const text = child.matches(
          'h2, h3, h4, h5, h6, p, ul, ol, dl, blockquote, .semantic-lead, details',
        );
        // Раскрытие меряется своими линиями, что бы в нём ни лежало; текстовый блок с картинкой, таблицей или
        // кодом — не строка текста.
        const disclosure = child.matches('details');
        if (
          !text ||
          (!disclosure && child.querySelector('img, svg, video, canvas, table, pre') !== null)
        )
          continue;
        const end = disclosure ? box.right : textRight(child);
        if (end - right > options.columnOverrunPx)
          columnFindings.push({
            element: child,
            kind: 'overrun',
            column: prose.width,
            value: Math.round(end - right),
          });
      }
      const own = getComputedStyle(section);
      const track =
        section.clientWidth -
        (Number.parseFloat(own.paddingLeft) || 0) -
        (Number.parseFloat(own.paddingRight) || 0);
      // Блок кода берёт одну из двух ширин — колонку прозы или дорожку раздела; иная ширина — третья, и
      // соседние блоки кода расходятся. Широкий блок с рамкой или заливкой, краска которого кончается
      // далеко от его правого края, — пустой прямоугольник внутри рамки.
      for (const child of blocks) {
        const box = child.getBoundingClientRect();
        if (child.matches('pre:not([data-diff-block])')) {
          const width = Math.round(box.width);
          if (
            Math.abs(width - prose.width) > options.columnEdgePx &&
            Math.abs(width - track) > options.columnEdgePx
          )
            columnFindings.push({
              element: child,
              kind: 'code-width',
              column: prose.width,
              value: width,
            });
        }
        if (box.width <= prose.width + options.columnOverrunPx) continue;
        // Рамка — сам блок, если он красит поверхность, иначе рамка острова внутри него.
        const island = child.querySelector('iframe');
        const surface = paintsSurface(child);
        if (!surface && island === null) continue;
        const frame = surface || island === null ? box : island.getBoundingClientRect();
        const ink = inkRight(child);
        // Поверхность без краски вовсе — полоса или разделитель, а не рамка вокруг содержимого.
        if (!Number.isFinite(ink)) continue;
        const gap = frame.right - ink;
        if (gap > Math.max(options.hollowPx, frame.width * options.hollowShare))
          columnFindings.push({
            element: child,
            kind: 'hollow',
            column: prose.width,
            value: Math.round(gap),
          });
      }
      if (prose.width < track * options.columnTrackShare && used < track * options.columnTrackShare)
        columnFindings.push({
          element: section,
          kind: 'empty-track',
          column: prose.width,
          value: Math.round(track),
        });
    }

  // Колонка и оглавление: статья стоит у пристыкованного оглавления на зазоре оболочки, а не плавает в
  // остатке окна (`toc-gap`); шапка страницы — заголовок и блоки над первым разделом — не шире колонки
  // разделов (`head-wide`).
  const article = document.querySelector('main article, .report-content article');
  if (viewportWidth > options.columnMinViewport && flowPage && article !== null) {
    const top = [...article.children].filter(visible);
    const sections = top.filter(
      (child) =>
        child.matches('.semantic-section') &&
        (child.getAttribute('data-composition') ?? 'flow') === 'flow',
    );
    const columnRight = Math.max(
      ...sections.map((section) => section.getBoundingClientRect().right),
    );
    const columnLeft = Math.min(...top.map((child) => child.getBoundingClientRect().left));
    const firstSection = top.findIndex((child) => child.matches('.semantic-section'));
    const head = firstSection === -1 ? [] : top.slice(0, firstSection);
    if (Number.isFinite(columnRight))
      for (const child of head) {
        const right = child.getBoundingClientRect().right;
        if (right - columnRight > options.columnEdgePx)
          columnFindings.push({
            element: child,
            kind: 'head-wide',
            column: Math.round(columnRight - columnLeft),
            value: Math.round(right - columnRight),
          });
      }
    // Одна ось документа: заголовок раздела другой композиции (split, stage, story…) начинается там же, где
    // заголовок страницы; разделы flow сверяются со своей прозой выше, центрованный раздел не в счёт.
    const pageTitle = article.querySelector(':scope > h1');
    if (axis && pageTitle !== null && visible(pageTitle)) {
      const edge = pageTitle.getBoundingClientRect().left;
      for (const section of sections.length > 0
        ? top.filter((child) =>
            child.matches(
              '.semantic-section:not([data-align="center"]):not([data-composition="flow"])',
            ),
          )
        : []) {
        const title = section.querySelector('.semantic-section-title');
        if (title === null || !visible(title)) continue;
        const offset = Math.round(title.getBoundingClientRect().left - edge);
        if (Math.abs(offset) > options.columnEdgePx)
          columnFindings.push({ element: title, kind: 'misaligned', column: 0, value: offset });
      }
    }
    const contents = document.querySelector('.sidebar');
    // Колонка — дорожка статьи, а не её текст: текст стоит на оси дорожки и отходит от оглавления на выступ
    // широких блоков.
    const trackLeft = axis ? article.getBoundingClientRect().left : columnLeft;
    if (contents !== null && visible(contents) && Number.isFinite(trackLeft)) {
      const gap = trackLeft - contents.getBoundingClientRect().right;
      if (gap > options.tocGapPx)
        columnFindings.push({
          element: article,
          kind: 'toc-gap',
          column: Math.round(
            (Number.isFinite(columnRight) ? columnRight : columnLeft) - columnLeft,
          ),
          value: Math.round(gap),
        });
    }
  }

  // Разрывы строчного кода внутри слова: строка переносится между двумя символами, ни один из которых
  // не пробел и первый из которых не разделитель пути, имени или вызова (`/ . _ - : ( ,`), и между ними нет
  // возможности переноса `<wbr>`, которую поставил компилятор (перед горбом длинного camelCase-слова).
  const breakable = /[\s/._\-:(,\u00AD\u200B]/u;
  const codeBreaks: Element[] = [];
  const charRange = document.createRange();
  for (const code of document.querySelectorAll('code')) {
    if (code.closest('pre, .effect-layer') !== null || code.getClientRects().length < 2) continue;
    if (!visible(code)) continue;
    let previous: { char: string; top: number; height: number } | undefined;
    let broken = false;
    let opportunity = false;
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node !== null && !broken; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if ((node as Element).tagName === 'WBR') opportunity = true;
        continue;
      }
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index] ?? '';
        charRange.setStart(node, index);
        charRange.setEnd(node, index + 1);
        const rect = charRange.getClientRects()[0];
        if (rect === undefined || rect.height === 0) continue;
        if (
          previous !== undefined &&
          rect.top > previous.top + previous.height / 2 &&
          !opportunity &&
          !breakable.test(previous.char) &&
          !/\s/u.test(char)
        ) {
          broken = true;
          break;
        }
        previous = { char, top: rect.top, height: rect.height };
        opportunity = false;
      }
    }
    if (broken) codeBreaks.push(code);
  }

  // Подписи схем: текст SVG внутри рисунка мельче порога на экране или вне видимой области — за краем
  // окна по ширине или за рамкой предка, который обрезает (рамка схемы с прокруткой, сам SVG). Подпись,
  // которую прячет только прокрутка схемы вбок, когда у рисунка есть кнопка полноэкранного просмотра,
  // достижима: она `scrolled`, сведение, а не дефект. Обрезанная без такого пути — дефект.
  const diagramSmall: Element[] = [];
  const diagramClipped: Element[] = [];
  const diagramScrolled: Element[] = [];
  const hasViewer = (element: Element): boolean => {
    const button = element
      .closest('figure, .semantic-diagram, .semantic-chart')
      ?.querySelector('[data-figure-open]');
    return button !== null && button !== undefined && visible(button);
  };
  const diagramFound = new Set<Element>();
  for (const label of svgText) {
    if (label.tagName !== 'text' || !visible(label) || opacityOf(label) <= 0.01) continue;
    const svg = label.closest('svg');
    if (svg === null || svg.closest('figure, .visualization-frame, [class*="diagram"]') === null)
      continue;
    const matrix = (label as SVGGraphicsElement).getScreenCTM?.();
    const scale = matrix === null || matrix === undefined ? 1 : Math.hypot(matrix.a, matrix.b);
    if (Number.parseFloat(getComputedStyle(label).fontSize) * scale < options.minimumTextPx)
      diagramSmall.push(label);
    const box = label.getBoundingClientRect();
    // Всё, что обрезает подпись, — окно и предки с обрезкой; отдельно — ближайшая рамка, прокручиваемая
    // вбок, обрезки под ней (сам SVG) и над ней (окно и внешние рамки).
    const cut = { left: 0, right: viewportWidth, top: -Infinity, bottom: Infinity };
    const inner = { left: -Infinity, right: Infinity };
    const outer = { left: 0, right: viewportWidth };
    let scroller: Element | undefined;
    for (
      let current: Element | null = label.parentElement;
      current !== null && current !== document.body;
      current = current.parentElement
    ) {
      const style = getComputedStyle(current);
      const frame = current.getBoundingClientRect();
      if (style.overflowX !== 'visible') {
        cut.left = Math.max(cut.left, frame.left);
        cut.right = Math.min(cut.right, frame.right);
        const scrolls =
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          current.scrollWidth > current.clientWidth + 1;
        if (scroller === undefined && scrolls) scroller = current;
        else {
          const side = scroller === undefined ? inner : outer;
          side.left = Math.max(side.left, frame.left);
          side.right = Math.min(side.right, frame.right);
        }
      }
      if (style.overflowY !== 'visible') {
        cut.top = Math.max(cut.top, frame.top);
        cut.bottom = Math.min(cut.bottom, frame.bottom);
      }
    }
    const outside = (
      rect: { left: number; right: number },
      frame: { left: number; right: number },
    ): boolean => rect.left < frame.left - 1 || rect.right > frame.right + 1;
    const vertical = box.top >= cut.top - 1 && box.bottom <= cut.bottom + 1;
    if (!outside(box, cut) && vertical) continue;
    // Достижима только подпись, которую прячет прокрутка рамки, сама видимая целиком, у рисунка с
    // просмотром; вертикальная обрезка, обрезка самим SVG или окном без прокрутки — дефект.
    if (
      scroller !== undefined &&
      vertical &&
      !outside(box, inner) &&
      !outside(scroller.getBoundingClientRect(), outer) &&
      hasViewer(label)
    )
      diagramScrolled.push(label);
    else diagramClipped.push(label);
  }
  for (const label of [...diagramSmall, ...diagramClipped]) diagramFound.add(label);
  // Образец подписи — её схема: у `text` нет ни id, ни класса, а текст страницы в замер не попадает.
  const diagramSamples = [
    ...new Set(
      [...diagramFound].map((label) => {
        const svg = label.closest('svg');
        return `${svg === null ? describe(label) : locate(svg)} text`;
      }),
    ),
  ].slice(0, SAMPLES);

  // Блоки чужой схемы: крупные картинки и поверхности, средняя яркость которых отличается от фона
  // страницы так же сильно, как текст от фона. Не в счёт: главное действие (кнопка обязана выделяться)
  // и полоса `tone="contrast"` с её содержимым (она инверсна намеренно).
  const pageColour = (): readonly [number, number, number, number] => {
    let colour: readonly [number, number, number, number] = [255, 255, 255, 1];
    for (const element of [root, document.body]) {
      const own = rgba(getComputedStyle(element).backgroundColor);
      if (own[3] > 0) colour = over(own, colour);
    }
    return colour;
  };
  const page = pageColour();
  const pageLuminance = luminance(page);
  const ratioTo = (value: number): number =>
    (Math.max(value, pageLuminance) + 0.05) / (Math.min(value, pageLuminance) + 0.05);
  const SIDE = 64;
  const sampler = document.createElement('canvas');
  sampler.width = SIDE;
  sampler.height = SIDE;
  const sample = sampler.getContext('2d', { willReadFrequently: true });
  // Картинка меряется по пикселям: средняя яркость и доля плоских пикселей, далёких от фона страницы
  // (`MEASURE_FLAT_TOLERANCE`): бумага и фон интерфейса, а не фактура фотографии.
  const imageTone = (image: HTMLImageElement): { mean: number; share: number } | undefined => {
    if (sample === null || !image.complete || image.naturalWidth === 0) return undefined;
    try {
      sample.clearRect(0, 0, SIDE, SIDE);
      sample.imageSmoothingEnabled = false;
      sample.drawImage(image, 0, 0, SIDE, SIDE);
      const data = sample.getImageData(0, 0, SIDE, SIDE).data;
      const flat = (x: number, y: number): boolean => {
        const at = (y * SIDE + x) * 4;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIDE || ny >= SIDE) continue;
          const next = (ny * SIDE + nx) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            if (
              Math.abs((data[at + channel] ?? 0) - (data[next + channel] ?? 0)) >
              options.flatTolerance
            )
              return false;
        }
        return true;
      };
      let total = 0;
      let far = 0;
      for (let y = 0; y < SIDE; y += 1)
        for (let x = 0; x < SIDE; x += 1) {
          const index = (y * SIDE + x) * 4;
          const alpha = (data[index + 3] ?? 0) / 255;
          const value = luminance(
            over([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, alpha], page),
          );
          total += value;
          if (ratioTo(value) >= options.offSchemeRatio && flat(x, y)) far += 1;
        }
      const pixels = SIDE * SIDE;
      return { mean: total / pixels, share: far / pixels };
    } catch {
      // Картинка с чужого источника закрывает пиксели холсту: её яркость не измерить.
      return undefined;
    }
  };
  const offScheme: Array<{ element: Element; luminance: number; share: number }> = [];
  const pageBackgroundValue = getComputedStyle(document.body).backgroundColor;
  for (const element of all) {
    if (
      element.closest(
        '.semantic-action, [data-primary-action], [data-tone="contrast"], button, dialog:not([open])',
      ) !== null
    )
      continue;
    if (offScheme.some((outer) => outer.element.contains(element))) continue;
    const box = element.getBoundingClientRect();
    if (box.width < options.blockMinWidth || box.height < options.blockMinHeight) continue;
    if (!visible(element) || opacityOf(element) < 0.5) continue;
    let tone: { mean: number; share: number } | undefined;
    if (element instanceof HTMLImageElement) tone = imageTone(element);
    else if (!(element instanceof SVGElement)) {
      const style = getComputedStyle(element);
      const own = rgba(style.backgroundColor);
      if (own[3] >= 0.5 && style.backgroundColor !== pageBackgroundValue) {
        const mean = luminance(over(own, page));
        tone = { mean, share: ratioTo(mean) >= options.offSchemeRatio ? 1 : 0 };
      }
    }
    // Дефект — заметная доля блока чужой яркости, и сама эта площадь не меньше минимального блока.
    if (
      tone !== undefined &&
      tone.share >= options.offSchemeShare &&
      tone.share * box.width * box.height >= options.blockMinWidth * options.blockMinHeight
    )
      offScheme.push({ element, luminance: tone.mean, share: tone.share });
  }
  const offSchemeSamples: MeasuredBlock[] = offScheme.slice(0, SAMPLES).map((entry) => ({
    element: locate(entry.element),
    luminance: Math.round(entry.luminance * 100) / 100,
    pageLuminance: Math.round(pageLuminance * 100) / 100,
    share: Math.round(entry.share * 100) / 100,
  }));

  // Текст под фиксированным или липким элементом: проход прокруткой по странице, в каждом положении —
  // какой элемент на самом деле сверху в точке строки текста. Верхняя панель во всю ширину не в счёт:
  // под неё текст уходит при обычной прокрутке.
  const coverers = all.filter((element) => {
    const position = getComputedStyle(element).position;
    return (position === 'fixed' || position === 'sticky') && visible(element);
  });
  const covered = new Map<string, Element>();
  const stacked = (element: Element, coverer: Element): boolean => {
    for (let node = element.parentElement; node !== null; node = node.parentElement)
      if (node.parentElement === coverer.parentElement)
        return node !== coverer && getComputedStyle(node).position === 'sticky';
    return false;
  };
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
          // Стопка: липкие карточки одного ряда наезжают друг на друга по замыслу, прочитанная уходит под
          // следующую.
          if (coverer.parentElement?.contains(element) === true && stacked(element, coverer))
            continue;
          // Строки самого текста, а не рамка элемента: абзац уже своей рамки не лежит под соседом справа.
          const lines = [...element.childNodes]
            .filter(
              (child) =>
                child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
            )
            .flatMap((child) => {
              const range = document.createRange();
              range.selectNodeContents(child);
              return [...range.getClientRects()];
            });
          for (const line of lines) {
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
    tables: {
      count: tables.length,
      wide: located(wideTables),
      sparse: located(sparseTables),
      deadSurface: located(deadSurfaces),
      flushText: located(flushTables),
      samples: tableSamples,
    },
    readingColumn: {
      width: column.width,
      share: Math.round(columnShare * 100) / 100,
      narrow: narrowColumn,
      ...(column.element === undefined ? {} : { element: describe(column.element) }),
    },
    codeBreaks: located(codeBreaks),
    diagramLabels: {
      count: diagramFound.size,
      small: diagramSmall.length,
      clipped: diagramClipped.length,
      scrolled: diagramScrolled.length,
      samples: diagramSamples,
    },
    offSchemeBlocks: { count: offScheme.length, samples: offSchemeSamples },
    sectionColumns: {
      count: columnFindings.length,
      misaligned: columnFindings.filter((entry) => entry.kind === 'misaligned').length,
      overrun: columnFindings.filter((entry) => entry.kind === 'overrun').length,
      emptyTrack: columnFindings.filter((entry) => entry.kind === 'empty-track').length,
      codeWidth: columnFindings.filter((entry) => entry.kind === 'code-width').length,
      hollow: columnFindings.filter((entry) => entry.kind === 'hollow').length,
      headWide: columnFindings.filter((entry) => entry.kind === 'head-wide').length,
      tocGap: columnFindings.filter((entry) => entry.kind === 'toc-gap').length,
      samples: columnFindings.slice(0, SAMPLES).map((entry) => ({
        element: locate(entry.element),
        kind: entry.kind,
        column: entry.column,
        value: entry.value,
      })),
    },
  };
}
