import { THEME_COLOR_TOKENS } from '../authoring/theme-tokens.js';
import {
  THEME_CONTROLS,
  THEME_DENSITY,
  THEME_ELEVATIONS,
  THEME_FONT_FAMILIES,
  THEME_GAPS,
  THEME_MOTION,
  THEME_RADIUS,
  THEME_WIDTH,
  type ResolvedTheme,
  type ThemeColors,
} from '../authoring/themes.js';

/**
 * Решённая тема становится двумя вещами: переменными CSS под её именем и атрибутами корня, которые
 * включают приёмы оболочки. Статическая таблица стилей пакета читает только их, поэтому весь облик
 * темы — её данные: изменённое поле темы меняет страницу без единой правки CSS.
 */

const COLOR_VARIABLES = THEME_COLOR_TOKENS;

const BACKDROPS: Readonly<
  Record<ResolvedTheme['backdrop'], { readonly image: string; readonly size: string }>
> = {
  none: { image: 'none', size: 'auto' },
  dots: {
    image: 'radial-gradient(circle at center, var(--texture-ink) 0.5px, transparent 0.7px)',
    size: '7px 7px',
  },
  grid: {
    image:
      'linear-gradient(color-mix(in srgb, var(--color-border) 45%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-border) 45%, transparent) 1px, transparent 1px)',
    size: '2rem 2rem, 2rem 2rem',
  },
  // Зерно рисует слой поверх фона (`document.css`, `data-theme-backdrop='grain'`): его краска — текст темы.
  grain: { image: 'none', size: 'auto' },
  tint: {
    image:
      'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent 36rem)',
    size: 'auto',
  },
};

/** Файл встроенной гарнитуры: каталог, имя файла, подмножество и насыщенность, которую он несёт. */
export interface ThemeFontFile {
  readonly directory: string;
  readonly file: string;
  readonly family: string;
  readonly unicodeRange: string;
  readonly weight: string;
}

/** Подмножества каждой встроенной гарнитуры: латиница и кириллица в отдельных файлах. */
export const FONT_SUBSETS = [
  {
    name: 'cyrillic',
    unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  },
  {
    name: 'latin',
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
] as const;

/**
 * Файлы гарнитур, которые нужны темам страницы: встраиваются только они. Вариативная гарнитура —
 * файл на подмножество с диапазоном насыщенности, статическая — файл на подмножество и насыщенность.
 * У гарнитуры с осью оптического размера файл несёт оси `opsz` и `wght` вместе и заменяет файл только с
 * `wght`, а не лежит рядом: второй файл той же гарнитуры удвоил бы её вес в странице.
 */
export function themeFontFiles(themes: readonly ResolvedTheme[]): readonly ThemeFontFile[] {
  const names = new Set<keyof typeof THEME_FONT_FAMILIES>();
  for (const theme of themes) {
    for (const role of ['heading', 'body', 'mono'] as const) names.add(theme.fonts[role]);
  }
  const files: ThemeFontFile[] = [];
  for (const name of [...names].sort()) {
    const font = THEME_FONT_FAMILIES[name];
    if (font.family === undefined || font.files === undefined || font.weights === undefined) {
      continue;
    }
    for (const subset of FONT_SUBSETS) {
      if ('min' in font.weights) {
        files.push({
          directory: font.files,
          file: `${font.files}-${subset.name}-${'opticalSize' in font ? 'opsz' : 'wght'}-normal.woff2`,
          family: font.family,
          unicodeRange: subset.unicodeRange,
          weight: `${font.weights.min} ${font.weights.max}`,
        });
        continue;
      }
      for (const weight of font.weights) {
        files.push({
          directory: font.files,
          file: `${font.files}-${subset.name}-${weight}-normal.woff2`,
          family: font.family,
          unicodeRange: subset.unicodeRange,
          weight: String(weight),
        });
      }
    }
  }
  return files;
}

/**
 * `@font-face` встроенных гарнитур. Адрес файла даёт вызывающий: в одном файле это data URL, в
 * каталоге — имя файла рядом со стилями.
 */
export function themeFontFaces(
  files: readonly ThemeFontFile[],
  url: (file: ThemeFontFile) => string,
): string {
  return files
    .map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};font-style:normal;font-weight:${font.weight};font-display:swap;src:url(${JSON.stringify(url(font))}) format("woff2");unicode-range:${font.unicodeRange}}`,
    )
    .join('\n');
}

export function themeRootAttributes(theme: ResolvedTheme): Readonly<Record<string, string>> {
  return {
    'data-theme': theme.name,
    'data-theme-topbar': theme.chrome.topbar,
    'data-theme-navigation': theme.chrome.navigation,
    'data-theme-section-title': theme.chrome.sectionTitle,
    'data-theme-cards': theme.chrome.cards,
    'data-theme-components': theme.chrome.components,
    'data-theme-landing': theme.chrome.landing,
    'data-theme-edges': theme.chrome.edges,
    'data-theme-controls': theme.controls,
    'data-theme-hero': theme.ornaments.heroEmphasis,
    'data-theme-media': theme.ornaments.mediaTreatment,
    'data-theme-linked-card': theme.ornaments.linkedCard,
    'data-theme-heading-prefix': theme.ornaments.headingPrefix === '' ? 'none' : 'on',
    'data-theme-title-cursor': theme.ornaments.titleCursor ? 'on' : 'none',
    'data-theme-console': theme.ornaments.console,
    'data-theme-scanlines': theme.ornaments.scanlines,
    'data-theme-glow': theme.ornaments.glow,
    'data-theme-schemes': theme.scheme,
    'data-theme-backdrop': theme.backdrop,
    'data-theme-captions': theme.typography.captions,
  };
}

/**
 * Инверсная полоса (`tone="contrast"`) — это противоположная схема той же темы целиком: каждая
 * цветовая роль внутри полосы берётся из `--inverse-*`, которые схема объявляет рядом со своими. Так
 * на полосе действуют те же проверенные пары контраста, что и в другой схеме: акцент, фокус, маркер,
 * серии графиков и подсветка кода читаются без отдельных правил. У консоли своя полоса без инверсии.
 */
const INVERSE_BAND = block(
  ":root:not([data-theme-console='on']) .semantic-section[data-tone='contrast']",
  [
    'color-scheme: var(--inverse-color-scheme)',
    ...Object.values(COLOR_VARIABLES).map((name) => `${name}: var(${inverseName(name)})`),
  ],
);

export function themeStylesheet(themes: readonly ResolvedTheme[]): string {
  return [...themes.map(themeRules), INVERSE_BAND].join('\n');
}

function themeRules(theme: ResolvedTheme): string {
  const root = `:root[data-theme='${theme.name}']`;
  const darkDefault = theme.scheme === 'dark';
  const lightColors = darkDefault ? theme.colors.dark : theme.colors.light;
  const darkColors = theme.colors.dark;
  const declarations = [
    ...layoutDeclarations(theme),
    ...colorDeclarations(lightColors),
    `--inverse-color-scheme: ${darkDefault ? 'light' : 'dark'}`,
    ...inverseDeclarations(darkDefault ? theme.colors.light : darkColors),
  ];
  // Тёмная схема объявляет и `color-scheme`: иначе поля ввода и полосы прокрутки браузер рисует светлыми.
  const dark = [
    'color-scheme: dark',
    ...colorDeclarations(darkColors),
    '--inverse-color-scheme: light',
    ...inverseDeclarations(theme.colors.light),
  ];
  return [
    block(root, declarations),
    ...(theme.scheme === 'dark'
      ? []
      : [block(`${root}[data-scheme='light']`, ['color-scheme: light'])]),
    block(`${root}[data-scheme='dark']`, dark),
    `@media (prefers-color-scheme: dark) {\n${block(`${root}[data-scheme='system']`, dark)}\n}`,
  ].join('\n');
}

function layoutDeclarations(theme: ResolvedTheme): readonly string[] {
  const width = THEME_WIDTH[theme.width];
  const radius = THEME_RADIUS[theme.radius];
  const controls = THEME_CONTROLS[theme.controls];
  const backdrop = BACKDROPS[theme.backdrop];
  return [
    `color-scheme: ${theme.scheme === 'dark' ? 'dark' : 'light dark'}`,
    `--font-body: ${THEME_FONT_FAMILIES[theme.fonts.body].stack}`,
    `--font-heading: ${THEME_FONT_FAMILIES[theme.fonts.heading].stack}`,
    `--font-mono: ${THEME_FONT_FAMILIES[theme.fonts.mono].stack}`,
    `--font-heading-small: ${smallHeadingStack(theme)}`,
    `--heading-weight: ${theme.typography.headingWeight}`,
    `--display-weight: ${theme.typography.displayWeight}`,
    `--display-weight-cyrillic: ${Math.min(theme.typography.displayWeight, CYRILLIC_DISPLAY_WEIGHT)}`,
    `--heading-tracking: ${theme.typography.headingTracking}em`,
    `--display-case: ${theme.typography.displayCase}`,
    `--display-scale: ${theme.typography.displayScale}`,
    // Без меры темы переменная объявлена как `initial` — пустое значение, при котором `var()` берёт запасную
    // меру: у каждого заголовка остаётся мера пакета для его раскладки, а переменная всё равно в словаре.
    `--heading-measure: ${theme.typography.headingMeasure === undefined ? 'initial' : `${theme.typography.headingMeasure}ch`}`,
    `--display-advance: ${displayAdvance(theme)}`,
    `--display-advance-small: ${smallHeadingAdvance(theme)}`,
    `--body-leading: ${theme.typography.bodyLeading}`,
    `--body-tracking: ${theme.typography.bodyTracking}em`,
    `--space-factor: ${THEME_DENSITY[theme.spacing.density]}`,
    `--section-rhythm: calc(${theme.spacing.rhythm}rem * var(--space-factor))`,
    `--card-minimum: ${theme.spacing.cardMinimum}rem`,
    `--shell-gap: ${THEME_GAPS[theme.spacing.gap]}`,
    `--content-width: ${width.content}`,
    `--reading-measure: ${width.measure}`,
    `--radius-small: ${radius.small}`,
    `--radius-medium: ${radius.medium}`,
    `--radius-large: ${radius.large}`,
    `--radius-control: ${radiusStep(theme.radii.control)}`,
    `--radius-card: ${radiusStep(theme.radii.card)}`,
    `--radius-media: ${radiusStep(theme.radii.media)}`,
    `--control-md: ${controls.height}`,
    `--control-sm: ${controls.small}`,
    `--control-pad-x: ${controls.inlinePadding}`,
    `--control-gap: ${controls.iconGap}`,
    `--shadow-geometry: ${THEME_ELEVATIONS[theme.elevation]}`,
    `--motion-ease: ${THEME_MOTION.easing[theme.motion.easing]}`,
    `--motion-pace: ${THEME_MOTION.pace[theme.motion.pace]}`,
    `--page-backdrop: ${backdrop.image}`,
    `--page-backdrop-size: ${backdrop.size}`,
    `--heading-prefix: ${cssString(theme.ornaments.headingPrefix)}`,
  ];
}

/**
 * Кириллица в крупном кегле темнеет сильнее латиницы: у неё больше вертикалей и уже просветы. Тяжелее
 * 720 крупный русский заголовок читается пятном, поэтому для русского текста вес дисплея не выше этого,
 * какой бы вес ни назвала тема, — своя тема агента защищена так же, как встроенная.
 */
const CYRILLIC_DISPLAY_WEIGHT = 720;

/** Мелкие заголовки: гарнитура заголовков, если она годится в мелком кегле, иначе текстовая. */
function smallHeadingStack(theme: ResolvedTheme): string {
  const heading: { readonly stack: string; readonly displayOnly?: boolean } =
    THEME_FONT_FAMILIES[theme.fonts.heading];
  return heading.displayOnly === true ? THEME_FONT_FAMILIES[theme.fonts.body].stack : heading.stack;
}

function colorDeclarations(colors: ThemeColors): readonly string[] {
  return (Object.keys(COLOR_VARIABLES) as (keyof ThemeColors)[]).map(
    (role) => `${COLOR_VARIABLES[role]}: ${colors[role]}`,
  );
}

/**
 * Ширина буквы заголовка в em — метрика самой гарнитуры заголовков с регистром и разрядкой темы. По ней
 * стили ограничивают кегль так, чтобы самое длинное слово влезало в колонку: своя тема с широкой
 * гарнитурой защищена так же, как встроенная, без ручной поправки. Кириллица не плотнее -0,025em, поэтому
 * отрицательная разрядка учитывается не сильнее этого; запас 3 % покрывает неровность замера.
 */
function displayAdvance(theme: ResolvedTheme): string {
  const metrics = THEME_FONT_FAMILIES[theme.fonts.heading].advance;
  const letter = theme.typography.displayCase === 'uppercase' ? metrics.caps : metrics.mixed;
  const tracking = Math.max(theme.typography.headingTracking, -0.025);
  return String(Math.round((letter + tracking) * 1.03 * 1000) / 1000);
}

/** Ширина буквы мелких заголовков — по той гарнитуре, которой они набраны, строчными. */
function smallHeadingAdvance(theme: ResolvedTheme): string {
  const heading: { readonly advance: { readonly mixed: number }; readonly displayOnly?: boolean } =
    THEME_FONT_FAMILIES[theme.fonts.heading];
  const face = heading.displayOnly === true ? THEME_FONT_FAMILIES[theme.fonts.body] : heading;
  const tracking = Math.max(theme.typography.headingTracking, -0.025);
  return String(Math.round((face.advance.mixed + tracking) * 1.03 * 1000) / 1000);
}

function inverseDeclarations(colors: ThemeColors): readonly string[] {
  return (Object.keys(COLOR_VARIABLES) as (keyof ThemeColors)[]).map(
    (role) => `${inverseName(COLOR_VARIABLES[role])}: ${colors[role]}`,
  );
}

function inverseName(variable: string): string {
  return `--inverse-${variable.slice(2)}`;
}

function block(selector: string, declarations: readonly string[]): string {
  return `${selector} {\n${declarations.map((declaration) => `  ${declaration};`).join('\n')}\n}`;
}

function radiusStep(step: ResolvedTheme['radii']['control']): string {
  return step === 'none' ? '0' : `var(--radius-${step})`;
}

/** Префикс уже ограничен тремя символами без пробелов, кавычек, `<` и обратной косой черты. */
function cssString(value: string): string {
  return `'${value}'`;
}
