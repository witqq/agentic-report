import type { FieldDefinition, ScalarFieldDefinition } from './registry.js';

/**
 * Тема страницы — данные, а не правила CSS. Пакет превращает решённую тему в переменные и
 * атрибуты корня, а статическая таблица стилей читает только их и никогда — имя темы. Поэтому
 * тема, унаследованная от встроенной, получает весь её облик, а своя тема агента устроена так же,
 * как встроенные: это тот же набор полей, частично переопределённый.
 */

/** Цвет темы: `#rgb`, `#rrggbb`, `#rrggbbaa` или `transparent`. */
export const THEME_COLOR_PATTERN =
  '^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent)$';

export const THEME_COLOR_ROLES = [
  ['background', 'Page background.'],
  ['surface', 'Surface of cards, panels and components.'],
  ['raised', 'Raised surface of controls and table headers.'],
  ['muted', 'Muted surface of secondary chips.'],
  ['heading', 'Headings and the fill of primary actions.'],
  ['text', 'Body text.'],
  ['textMuted', 'Secondary text: captions, labels, metadata.'],
  ['border', 'Ordinary borders and rules.'],
  ['borderStrong', 'Strong borders, lifelines and scrollbars.'],
  ['accent', 'Accent: rules, markers and the current item; drawn, not read as text.'],
  ['accentStrong', 'Strong accent: links and text in accent colour.'],
  ['accentSoft', 'Soft accent: selection and highlight backgrounds.'],
  ['accent2', 'Second accent: eyebrows, kickers and secondary markers.'],
  ['focus', 'Visible keyboard focus ring.'],
  ['chart1', 'First chart and diagram series colour.'],
  ['chart2', 'Second series colour; the default of statusDone.'],
  ['chart3', 'Third series colour; the default of statusReturned.'],
  ['chart4', 'Fourth series colour; the default of statusReview.'],
  ['chart5', 'Fifth series colour.'],
  ['chart6', 'Sixth series colour.'],
  [
    'statusDone',
    'Status «done»: success callouts, good cards, added diff lines, finished process steps; follows chart2 unless set.',
  ],
  [
    'statusReview',
    'Status «needs a look»: warning callouts, watched cards, major findings, steps in review; follows chart4 unless set.',
  ],
  [
    'statusReturned',
    'Status «returned or failed»: danger callouts, risky cards, blocking findings, removed diff lines, invalid fields; follows chart3 unless set.',
  ],
  ['marker', 'Editorial marker: eyebrow lines and error rules.'],
  ['shadow', 'Colour of raised shadows, usually translucent.'],
  ['mediaBacking', 'Paper behind transparent images on the page surface.'],
  ['codeBackground', 'Background of code blocks.'],
  ['codeText', 'Plain code text.'],
  ['codeKeyword', 'Keywords and operators in code.'],
  ['codeString', 'Strings in code.'],
  ['codeNumber', 'Numbers and constants in code.'],
  ['codeFunction', 'Function names in code.'],
  ['codeType', 'Types, parameters and attributes in code.'],
  ['codeComment', 'Comments in code.'],
  ['codePunctuation', 'Punctuation in code.'],
] as const;

export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number][0];
export type ThemeColors = Readonly<Record<ThemeColorRole, string>>;

/**
 * Роли статуса и серия графика, от которой каждая берёт цвет, пока тема не назовёт её сама. Статус —
 * общий смысл карточек, выносок, находок, строк сравнения и шагов процесса: сигнальный цвет стоит за одним
 * статусом во всех блоках страницы.
 */
export const THEME_STATUS_DEFAULTS = {
  statusDone: 'chart2',
  statusReview: 'chart4',
  statusReturned: 'chart3',
} as const satisfies Readonly<Record<string, ThemeColorRole>>;
type ThemeStatusRole = keyof typeof THEME_STATUS_DEFAULTS;

/** Палитра встроенной темы: роли статуса она берёт из своих серий. */
type PaletteColors = Readonly<Record<Exclude<ThemeColorRole, ThemeStatusRole>, string>>;

function withStatusRoles(colors: PaletteColors): ThemeColors {
  return {
    ...colors,
    statusDone: colors[THEME_STATUS_DEFAULTS.statusDone],
    statusReview: colors[THEME_STATUS_DEFAULTS.statusReview],
    statusReturned: colors[THEME_STATUS_DEFAULTS.statusReturned],
  };
}

/**
 * Статус, не названный темой, идёт за своей серией: тема, сменившая `chart2`, меняет и «готово». Названный
 * в той же теме статус остаётся её выбором.
 */
function resolveStatusRoles(
  base: ThemeColors,
  merged: ThemeColors,
  input: Partial<ThemeColors> | undefined,
): ThemeColors {
  const resolved: Record<ThemeColorRole, string> = { ...merged };
  for (const [role, series] of Object.entries(THEME_STATUS_DEFAULTS) as [
    ThemeStatusRole,
    ThemeColorRole,
  ][]) {
    if (input?.[role] !== undefined) continue;
    if (merged[series] !== base[series]) resolved[role] = merged[series];
  }
  return resolved;
}

/**
 * Именованные акценты: пара светлой и тёмной схем с проверенным контрастом. Сдержанные краски идут
 * первыми; индиго, бирюза и коралл остаются для страниц, где цвет оправдан предметом, но ни одна
 * встроенная тема не берёт индиго по умолчанию.
 */
export const THEME_ACCENTS = {
  graphite: {
    light: { accent: '#363b43', accentStrong: '#1f2329', accentSoft: '#e8e9eb', focus: '#363b43' },
    dark: { accent: '#c9ced6', accentStrong: '#e6e9ee', accentSoft: '#2a2e35', focus: '#d5d9e0' },
  },
  cobalt: {
    light: { accent: '#1f5bb8', accentStrong: '#174a96', accentSoft: '#e3ecfa', focus: '#1f5bb8' },
    dark: { accent: '#86b4f5', accentStrong: '#bcd5fb', accentSoft: '#172a47', focus: '#9dc3f8' },
  },
  rust: {
    light: { accent: '#a8431c', accentStrong: '#853413', accentSoft: '#f7e6dc', focus: '#a8431c' },
    dark: { accent: '#ef9a74', accentStrong: '#f6c1a8', accentSoft: '#42210f', focus: '#f3ab8a' },
  },
  moss: {
    light: { accent: '#4a6629', accentStrong: '#39501e', accentSoft: '#e7eddb', focus: '#4a6629' },
    dark: { accent: '#a9c983', accentStrong: '#cbe0b0', accentSoft: '#253119', focus: '#b8d496' },
  },
  ochre: {
    light: { accent: '#8a5c00', accentStrong: '#6d4800', accentSoft: '#f5ebd3', focus: '#8a5c00' },
    dark: { accent: '#e2b556', accentStrong: '#efd394', accentSoft: '#3b2d0c', focus: '#e8c26d' },
  },
  ink: {
    light: { accent: '#1d3a5f', accentStrong: '#132a46', accentSoft: '#e2e8f0', focus: '#1d3a5f' },
    dark: { accent: '#a2bbdb', accentStrong: '#c9d7ea', accentSoft: '#1b2839', focus: '#b3c8e3' },
  },
  indigo: {
    light: { accent: '#3856d8', accentStrong: '#243da7', accentSoft: '#e7ecff', focus: '#3856d8' },
    dark: { accent: '#91a9ff', accentStrong: '#c2ceff', accentSoft: '#202e5a', focus: '#a9bbff' },
  },
  teal: {
    light: { accent: '#087f75', accentStrong: '#075e57', accentSoft: '#dff7f3', focus: '#087f75' },
    dark: { accent: '#5ee0cf', accentStrong: '#a5f3e8', accentSoft: '#123d3a', focus: '#75eadb' },
  },
  coral: {
    light: { accent: '#c2415d', accentStrong: '#942f45', accentSoft: '#ffe7ec', focus: '#c2415d' },
    dark: { accent: '#ff91a7', accentStrong: '#ffc0cc', accentSoft: '#4b2130', focus: '#ffa6b8' },
  },
} as const satisfies Readonly<
  Record<
    string,
    Readonly<
      Record<
        'light' | 'dark',
        Readonly<Record<'accent' | 'accentStrong' | 'accentSoft' | 'focus', string>>
      >
    >
  >
>;
export type ThemeAccentName = keyof typeof THEME_ACCENTS;
export const THEME_ACCENT_NAMES = Object.keys(THEME_ACCENTS) as unknown as readonly [
  ThemeAccentName,
  ...ThemeAccentName[],
];

/**
 * Гарнитуры, которые тема назначает ролям текста. Встроенные — шрифты под OFL с латиницей и кириллицей
 * из пакетов Fontsource: пакет встраивает в страницу только те, что нужны её темам, поэтому у всех
 * читателей одна гарнитура. Вариативный шрифт лежит одним файлом на алфавит и описан диапазоном
 * насыщенности; статический — файлом на каждую насыщенность из списка. Системные стеки ничего не весят,
 * но набираются тем, что стоит у читателя.
 */
export const THEME_FONT_FAMILIES = {
  onest: {
    family: 'Onest',
    files: 'onest',
    weights: { min: 100, max: 900 },
    stack: "'Onest', system-ui, sans-serif",
    advance: { mixed: 0.616, caps: 0.744 },
  },
  'golos-text': {
    family: 'Golos Text',
    files: 'golos-text',
    weights: { min: 400, max: 900 },
    stack: "'Golos Text', system-ui, sans-serif",
    advance: { mixed: 0.625, caps: 0.761 },
  },
  'ibm-plex-sans': {
    family: 'IBM Plex Sans',
    files: 'ibm-plex-sans',
    weights: { min: 100, max: 700 },
    stack: "'IBM Plex Sans', system-ui, sans-serif",
    advance: { mixed: 0.612, caps: 0.713 },
  },
  'exo-2': {
    family: 'Exo 2',
    files: 'exo-2',
    weights: { min: 100, max: 900 },
    stack: "'Exo 2', system-ui, sans-serif",
    advance: { mixed: 0.618, caps: 0.701 },
  },
  jost: {
    family: 'Jost',
    files: 'jost',
    weights: { min: 100, max: 900 },
    stack: "'Jost', system-ui, sans-serif",
    advance: { mixed: 0.607, caps: 0.772 },
  },
  commissioner: {
    family: 'Commissioner',
    files: 'commissioner',
    weights: { min: 100, max: 900 },
    stack: "'Commissioner', system-ui, sans-serif",
    advance: { mixed: 0.594, caps: 0.743 },
  },
  rubik: {
    family: 'Rubik',
    files: 'rubik',
    weights: { min: 300, max: 900 },
    stack: "'Rubik', system-ui, sans-serif",
    advance: { mixed: 0.66, caps: 0.77 },
  },
  'fira-sans': {
    family: 'Fira Sans',
    files: 'fira-sans',
    weights: [400, 500, 600, 700],
    stack: "'Fira Sans', system-ui, sans-serif",
    advance: { mixed: 0.592, caps: 0.653 },
  },
  geologica: {
    family: 'Geologica',
    files: 'geologica',
    weights: { min: 100, max: 900 },
    stack: "'Geologica', system-ui, sans-serif",
    advance: { mixed: 0.652, caps: 0.76 },
  },
  manrope: {
    family: 'Manrope',
    files: 'manrope',
    weights: { min: 200, max: 800 },
    stack: "'Manrope', system-ui, sans-serif",
    advance: { mixed: 0.623, caps: 0.713 },
  },
  raleway: {
    family: 'Raleway',
    files: 'raleway',
    weights: { min: 100, max: 900 },
    stack: "'Raleway', system-ui, sans-serif",
    advance: { mixed: 0.62, caps: 0.722 },
  },
  unbounded: {
    family: 'Unbounded',
    files: 'unbounded',
    weights: { min: 200, max: 900 },
    stack: "'Unbounded', system-ui, sans-serif",
    advance: { mixed: 0.854, caps: 0.963 },
  },
  oswald: {
    family: 'Oswald',
    files: 'oswald',
    weights: { min: 200, max: 700 },
    stack: "'Oswald', system-ui, sans-serif",
    advance: { mixed: 0.525, caps: 0.606 },
  },
  tektur: {
    family: 'Tektur',
    files: 'tektur',
    weights: { min: 400, max: 900 },
    stack: "'Tektur', system-ui, sans-serif",
    advance: { mixed: 0.646, caps: 0.684 },
  },
  geist: {
    family: 'Geist',
    files: 'geist',
    weights: { min: 100, max: 900 },
    stack: "'Geist', system-ui, sans-serif",
    advance: { mixed: 0.646, caps: 0.742 },
  },
  literata: {
    family: 'Literata',
    files: 'literata',
    weights: { min: 200, max: 900 },
    stack: "'Literata', Georgia, serif",
    advance: { mixed: 0.686, caps: 0.797 },
    opticalSize: { min: 7, max: 72 },
  },
  playfair: {
    family: 'Playfair',
    files: 'playfair',
    weights: { min: 300, max: 900 },
    stack: "'Playfair', Georgia, serif",
    advance: { mixed: 0.564, caps: 0.686 },
    opticalSize: { min: 5, max: 1200 },
  },
  'cormorant-garamond': {
    family: 'Cormorant Garamond',
    files: 'cormorant-garamond',
    weights: { min: 300, max: 700 },
    stack: "'Cormorant Garamond', Georgia, serif",
    advance: { mixed: 0.503, caps: 0.702 },
    displayOnly: true,
  },
  'jetbrains-mono': {
    family: 'JetBrains Mono',
    files: 'jetbrains-mono',
    weights: { min: 100, max: 800 },
    stack: "'JetBrains Mono', ui-monospace, monospace",
    advance: { mixed: 0.6, caps: 0.6 },
  },
  'martian-mono': {
    family: 'Martian Mono',
    files: 'martian-mono',
    weights: { min: 100, max: 800 },
    stack: "'Martian Mono', ui-monospace, monospace",
    advance: { mixed: 0.7, caps: 0.7 },
  },
  'geist-mono': {
    family: 'Geist Mono',
    files: 'geist-mono',
    weights: { min: 100, max: 900 },
    stack: "'Geist Mono', ui-monospace, monospace",
    advance: { mixed: 0.6, caps: 0.6 },
  },
  'victor-mono': {
    family: 'Victor Mono',
    files: 'victor-mono',
    weights: { min: 100, max: 700 },
    stack: "'Victor Mono', ui-monospace, monospace",
    advance: { mixed: 0.6, caps: 0.6 },
  },
  'pt-mono': {
    family: 'PT Mono',
    files: 'pt-mono',
    weights: [400],
    stack: "'PT Mono', ui-monospace, monospace",
    advance: { mixed: 0.6, caps: 0.6 },
  },
  'system-sans': {
    family: undefined,
    files: undefined,
    weights: undefined,
    stack: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    advance: { mixed: 0.66, caps: 0.78 },
  },
  'system-serif': {
    family: undefined,
    files: undefined,
    weights: undefined,
    stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif",
    advance: { mixed: 0.64, caps: 0.78 },
  },
  'system-mono': {
    family: undefined,
    files: undefined,
    weights: undefined,
    stack: "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    advance: { mixed: 0.62, caps: 0.62 },
  },
} as const satisfies Readonly<
  Record<
    string,
    {
      readonly family: string | undefined;
      readonly files: string | undefined;
      readonly weights:
        { readonly min: number; readonly max: number } | readonly number[] | undefined;
      readonly stack: string;
      /**
       * Самая широкая средняя ширина буквы длинных слов (латиница и кириллица) в em при насыщенности до
       * 800: строчными и прописными. Замерена по встроенным файлам гарнитуры; у гарнитуры с осью `opsz` —
       * наибольшая на кеглях от 16 до 100 px при автоматическом оптическом размере; для системных — с запасом.
       * По ней пакет ограничивает кегль заголовка так, чтобы самое длинное слово влезало в колонку.
       */
      readonly advance: { readonly mixed: number; readonly caps: number };
      /**
       * Диапазон оси оптического размера `opsz`, если гарнитура её несёт: тогда встраивается файл с осями
       * `opsz` и `wght` (`<files>-<подмножество>-opsz-normal.woff2`) вместо файла только с `wght`, и
       * браузер сам подбирает рисунок под кегль (`font-optical-sizing: auto`): мелкий текст — открытее и
       * контрастом ниже, крупный заголовок — тоньше и плотнее.
       */
      readonly opticalSize?: { readonly min: number; readonly max: number };
      /**
       * Гарнитура только для крупного кегля: её тонкие штрихи в мелких заголовках (`h3`, заголовки
       * событий ленты) слипаются, поэтому мелкие заголовки такой темы набираются текстовой гарнитурой.
       */
      readonly displayOnly?: boolean;
    }
  >
>;
export type ThemeFontFamilyName = keyof typeof THEME_FONT_FAMILIES;
export const THEME_FONT_FAMILY_NAMES = Object.keys(THEME_FONT_FAMILIES) as unknown as readonly [
  ThemeFontFamilyName,
  ...ThemeFontFamilyName[],
];

/**
 * Тройки гарнитур — дисплей заголовков, текст и код, подобранные вместе; каждая названа по встроенной
 * теме, которая её носит. Тройка задаёт все три роли; гарнитура роли, названная в той же теме, её
 * уточняет.
 */
export const THEME_FONT_PAIRS = {
  midnight: { heading: 'geologica', body: 'ibm-plex-sans', mono: 'jetbrains-mono' },
  'calm-paper': { heading: 'playfair', body: 'literata', mono: 'pt-mono' },
  synthwave: { heading: 'unbounded', body: 'exo-2', mono: 'jetbrains-mono' },
  noir: { heading: 'cormorant-garamond', body: 'jost', mono: 'pt-mono' },
  aurora: { heading: 'raleway', body: 'commissioner', mono: 'victor-mono' },
  daylight: { heading: 'onest', body: 'golos-text', mono: 'geist-mono' },
  ember: { heading: 'oswald', body: 'rubik', mono: 'jetbrains-mono' },
  blueprint: { heading: 'tektur', body: 'fira-sans', mono: 'martian-mono' },
  terminal: { heading: 'martian-mono', body: 'jetbrains-mono', mono: 'jetbrains-mono' },
  neutral: { heading: 'literata', body: 'onest', mono: 'martian-mono' },
  frost: { heading: 'onest', body: 'ibm-plex-sans', mono: 'geist-mono' },
  system: { heading: 'system-sans', body: 'system-sans', mono: 'system-mono' },
} as const satisfies Readonly<
  Record<string, Readonly<Record<'heading' | 'body' | 'mono', ThemeFontFamilyName>>>
>;
export type ThemeFontPairName = keyof typeof THEME_FONT_PAIRS;
export const THEME_FONT_PAIR_NAMES = Object.keys(THEME_FONT_PAIRS) as unknown as readonly [
  ThemeFontPairName,
  ...ThemeFontPairName[],
];

export const THEME_DENSITY = { compact: 0.78, comfortable: 1, spacious: 1.28 } as const;
export const THEME_WIDTH = {
  narrow: { content: '82rem', measure: '62ch' },
  standard: { content: '108rem', measure: '72ch' },
  wide: { content: '132rem', measure: '78ch' },
} as const;
export const THEME_RADIUS = {
  sharp: { small: '0.15rem', medium: '0.25rem', large: '0.4rem' },
  soft: { small: '0.45rem', medium: '0.9rem', large: '1.35rem' },
  round: { small: '0.8rem', medium: '1.35rem', large: '2rem' },
} as const;
/**
 * Размер элементов управления темы: обычная и компактная высота кнопок, полей и вкладок. Система
 * интерфейса (`document.css`, слой `primitives`) берёт из них `--control-md` и `--control-sm`; при
 * касании любой примитив всё равно не ниже 44 px.
 */
/** Шаги шкалы скругления, которые роль может взять; `none` — прямой угол. */
export const THEME_RADIUS_STEPS = ['none', 'small', 'medium', 'large'] as const;
export type ThemeRadiusStep = (typeof THEME_RADIUS_STEPS)[number];

export const THEME_CONTROLS = {
  regular: { height: '2.25rem', small: '2rem', inlinePadding: '0.75rem', iconGap: '0.4rem' },
  compact: { height: '2rem', small: '1.75rem', inlinePadding: '0.625rem', iconGap: '0.375rem' },
} as const;
export const THEME_GAPS = {
  regular: 'clamp(1rem, 4vw, 3rem)',
  tight: 'clamp(0.75rem, 2vw, 1.5rem)',
} as const;
export const THEME_ELEVATIONS = {
  lifted: '0 1.25rem 3.5rem',
  close: '0 0.9rem 2.5rem',
  flat: '0 0 0',
} as const;

/**
 * Фон страницы. Каждое значение — готовый рисунок из цветов самой темы, поэтому своя тема получает
 * фон в своей палитре, не задавая градиентов. Размытых цветных пятен среди них нет: такой фон
 * читается как шаблон ИИ-сайта и ничего не сообщает.
 */
export const THEME_BACKDROPS = ['none', 'dots', 'grid', 'tint', 'grain'] as const;

/**
 * Характер движения темы — именованные кривые и темп. Кривая задаёт, как элемент приходит на место;
 * темп умножает длительности пакета: появление, раскрытие строк заголовка, счёт чисел, прорисовку
 * схемы. Числовые длительности автор не пишет: тема говорит «быстро» или «спокойно».
 */
export const THEME_MOTION = {
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    gentle: 'cubic-bezier(0.4, 0, 0.2, 1)',
    decisive: 'cubic-bezier(0.7, 0, 0.2, 1)',
  },
  pace: { brisk: 0.7, calm: 1, slow: 1.4 },
} as const;

/** Приёмы оболочки и компонентов: каждое поле — закрытый выбор, который тема может сочетать с любыми. */
export const THEME_CHROME = {
  topbar: ['glass', 'ledger'],
  navigation: ['plain', 'numbered'],
  sectionTitle: ['plain', 'rule', 'bar'],
  cards: ['raised', 'ruled'],
  components: ['soft', 'flat', 'edged'],
  landing: ['centered', 'ledger'],
  edges: ['none', 'mono'],
} as const;
export const THEME_ORNAMENTS = {
  heroEmphasis: ['none', 'rule', 'shadow'],
  mediaTreatment: ['plain', 'vivid'],
  linkedCard: ['raised', 'edge'],
  console: ['none', 'on'],
  scanlines: ['none', 'on'],
  glow: ['none', 'on'],
} as const;

export type ThemeChrome = {
  readonly [Key in keyof typeof THEME_CHROME]: (typeof THEME_CHROME)[Key][number];
};
export type ThemeOrnaments = {
  readonly [Key in keyof typeof THEME_ORNAMENTS]: (typeof THEME_ORNAMENTS)[Key][number];
} & { readonly headingPrefix: string; readonly titleCursor: boolean };

/** Полностью решённая тема: все поля известны, ни одно не наследуется дальше. */
export interface ResolvedTheme {
  readonly name: string;
  readonly description: string;
  readonly palette: string;
  readonly scheme: 'both' | 'dark';
  readonly accent: ThemeAccentName;
  readonly fonts: Readonly<Record<'heading' | 'body' | 'mono', ThemeFontFamilyName>>;
  readonly typography: {
    readonly headingWeight: number;
    readonly displayWeight: number;
    readonly headingTracking: number;
    readonly displayCase: 'none' | 'uppercase';
    readonly displayScale: number;
    /**
     * Наибольшая длина строки заголовка страницы и заголовков секций-заявлений, в `ch`. Не задана — у
     * каждого такого заголовка своя мера пакета: у заголовка отчёта мера чтения, у лендинга, первого
     * экрана и секций-заявлений — от 10 до 17ch по раскладке и ширине экрана.
     */
    readonly headingMeasure?: number;
    readonly bodyLeading: number;
    readonly bodyTracking: number;
    /**
     * Figure captions and source lines: `plain` in the text face, or `italic` in the heading face —
     * the serif italic caption of an editorial page when the heading face is a serif.
     */
    readonly captions: 'plain' | 'italic';
  };
  readonly spacing: {
    readonly density: keyof typeof THEME_DENSITY;
    readonly rhythm: number;
    readonly cardMinimum: number;
    readonly gap: keyof typeof THEME_GAPS;
  };
  readonly width: keyof typeof THEME_WIDTH;
  readonly radius: keyof typeof THEME_RADIUS;
  readonly radii: {
    readonly control: ThemeRadiusStep;
    readonly card: ThemeRadiusStep;
    readonly media: ThemeRadiusStep;
  };
  readonly controls: keyof typeof THEME_CONTROLS;
  readonly backdrop: (typeof THEME_BACKDROPS)[number];
  readonly elevation: keyof typeof THEME_ELEVATIONS;
  readonly motion: {
    readonly easing: keyof typeof THEME_MOTION.easing;
    readonly pace: keyof typeof THEME_MOTION.pace;
  };
  readonly colors: { readonly light: ThemeColors; readonly dark: ThemeColors };
  readonly chrome: ThemeChrome;
  readonly ornaments: ThemeOrnaments;
}

/** Необязательная, частично заданная тема — то, что пишет автор и что лежит в реестре. */
export type ThemeInput = {
  readonly name?: string;
  readonly extends?: string;
  readonly description?: string;
  readonly palette?: string;
  readonly scheme?: ResolvedTheme['scheme'];
  readonly accent?: ThemeAccentName;
  readonly fonts?: Partial<ResolvedTheme['fonts']> & { readonly pair?: ThemeFontPairName };
  readonly typography?: Partial<ResolvedTheme['typography']>;
  readonly spacing?: Partial<ResolvedTheme['spacing']>;
  readonly width?: ResolvedTheme['width'];
  readonly radius?: ResolvedTheme['radius'];
  readonly radii?: Partial<ResolvedTheme['radii']>;
  readonly controls?: ResolvedTheme['controls'];
  readonly backdrop?: ResolvedTheme['backdrop'];
  readonly elevation?: ResolvedTheme['elevation'];
  readonly motion?: Partial<ResolvedTheme['motion']>;
  readonly colors?: {
    readonly light?: Partial<ThemeColors>;
    readonly dark?: Partial<ThemeColors>;
  };
  readonly chrome?: Partial<ThemeChrome>;
  readonly ornaments?: Partial<ThemeOrnaments>;
};

const colorConstraint = {
  kind: 'string',
  normalization: 'trim',
  minLength: 1,
  maxLength: 11,
  pattern: THEME_COLOR_PATTERN,
} as const;

function enumField(
  name: string,
  description: string,
  values: readonly [string, ...string[]],
): ScalarFieldDefinition {
  return { name, description, required: false, constraint: { kind: 'enum', values } };
}

function numberField(
  name: string,
  description: string,
  minimum: number,
  maximum: number,
): ScalarFieldDefinition {
  return { name, description, required: false, constraint: { kind: 'number', minimum, maximum } };
}

function colorFields(scheme: 'light' | 'dark'): readonly [FieldDefinition, ...FieldDefinition[]] {
  return THEME_COLOR_ROLES.map(([name, description]) => ({
    name,
    description: `${description} (${scheme} scheme)`,
    required: false,
    constraint: colorConstraint,
  })) as unknown as readonly [FieldDefinition, ...FieldDefinition[]];
}

/**
 * Поля темы — один договор для файла темы, темы во frontmatter и встроенных тем. Каждое поле
 * необязательно: чего тема не называет, то она берёт у темы из `extends`.
 */
export const THEME_FIELDS = [
  {
    name: 'name',
    description:
      'Theme identity shown in the theme selector; a theme file defaults to its file name, an inline theme to custom.',
    required: false,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-z][a-z0-9-]{0,63}$',
    },
  },
  {
    name: 'extends',
    description:
      'Built-in theme name or relative path to another theme file this theme starts from; defaults to the default theme.',
    required: false,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
  },
  {
    name: 'description',
    description: 'One sentence saying what kind of page the theme is for.',
    required: false,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
  },
  {
    name: 'palette',
    description:
      'Why the palette looks the way it does, in words: the named colours and the reason for them.',
    required: false,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 600 },
  },
  enumField('scheme', 'Colour schemes the theme draws: both light and dark, or dark only.', [
    'both',
    'dark',
  ]),
  enumField(
    'accent',
    'Named accent family for both schemes; explicit accent colours override it.',
    THEME_ACCENT_NAMES,
  ),
  {
    name: 'fonts',
    description:
      'Type pair for the three text roles, or a family per role; the embedded families carry Latin and Cyrillic.',
    required: false,
    fields: [
      enumField(
        'pair',
        'Coordinated heading, body and code families; a family named for a role in the same theme refines it.',
        THEME_FONT_PAIR_NAMES,
      ),
      enumField('heading', 'Headings and section titles.', THEME_FONT_FAMILY_NAMES),
      enumField('body', 'Body text and controls.', THEME_FONT_FAMILY_NAMES),
      enumField('mono', 'Code, commands and metadata.', THEME_FONT_FAMILY_NAMES),
    ],
  },
  {
    name: 'typography',
    description: 'Weight, tracking and leading of the type.',
    required: false,
    fields: [
      {
        name: 'headingWeight',
        description: 'Weight of headings, 300 to 900.',
        required: false,
        constraint: { kind: 'integer', minimum: 300, maximum: 900 },
      },
      {
        name: 'displayWeight',
        description: 'Weight of display-size titles, 300 to 900.',
        required: false,
        constraint: { kind: 'integer', minimum: 300, maximum: 900 },
      },
      numberField(
        'headingTracking',
        'Letter spacing of large headings in Latin text, in em; Cyrillic text never goes tighter than -0.025em.',
        -0.1,
        0.15,
      ),
      enumField(
        'displayCase',
        'Letter case of display headings: as written, or capitals that want positive tracking.',
        ['none', 'uppercase'],
      ),
      numberField(
        'displayScale',
        'Size of display headings against the package scale; wide faces usually look better below 1. Word fit on phones is automatic from the face metrics.',
        0.6,
        1.2,
      ),
      numberField(
        'headingMeasure',
        'Longest line of the page title and of display and editorial section titles, in ch; unset keeps the package measure of each: the reading measure for a report title, 10 to 17ch for landing, first-screen and display titles.',
        8,
        40,
      ),
      numberField('bodyLeading', 'Line height of body text.', 1.2, 2),
      numberField('bodyTracking', 'Letter spacing of body text, in em.', -0.05, 0.05),
      enumField(
        'captions',
        'Figure captions and source lines: plain in the text face, or italic in the heading face, the serif italic caption of an editorial page when the heading face is a serif.',
        ['plain', 'italic'],
      ),
    ],
  },
  {
    name: 'spacing',
    description: 'Density and rhythm of the page.',
    required: false,
    fields: [
      enumField('density', 'Shared spacing scale and control padding.', [
        'compact',
        'comfortable',
        'spacious',
      ]),
      numberField('rhythm', 'Gap between sections, in rem before density.', 2, 6),
      numberField('cardMinimum', 'Narrowest card column, in rem.', 10, 24),
      enumField('gap', 'Gap between the navigation column and the content.', ['regular', 'tight']),
    ],
  },
  enumField('width', 'Maximum shell width and reading measure.', ['narrow', 'standard', 'wide']),
  enumField('radius', 'Corner treatment of surfaces and controls.', ['sharp', 'soft', 'round']),
  {
    name: 'radii',
    description:
      'Which step of the radius scale each role takes: sharp controls with soft cards, square media in a round theme.',
    required: false,
    fields: [
      enumField('control', 'Buttons, fields and toolbars; default small.', [...THEME_RADIUS_STEPS]),
      enumField('card', 'Cards, panels, dialogs, popovers and stages; default medium.', [
        ...THEME_RADIUS_STEPS,
      ]),
      enumField('media', 'Images and video on the page; default medium.', [...THEME_RADIUS_STEPS]),
    ],
  },
  enumField('controls', 'Size of buttons, inputs and actions.', ['regular', 'compact']),
  enumField('backdrop', 'Package-drawn page background in the theme colours.', THEME_BACKDROPS),
  enumField('elevation', 'Geometry of raised shadows.', ['lifted', 'close', 'flat']),
  {
    name: 'motion',
    description: 'Character of the package motion: a named curve and a pace for every duration.',
    required: false,
    fields: [
      enumField(
        'easing',
        'How moving things arrive: standard settles quickly, gentle eases in and out, decisive starts late and lands hard.',
        ['standard', 'gentle', 'decisive'],
      ),
      enumField(
        'pace',
        'Multiplier of every package duration: brisk, calm (the package timing), or slow.',
        ['brisk', 'calm', 'slow'],
      ),
    ],
  },
  {
    name: 'colors',
    description: 'Colour roles of each scheme; any role left out comes from the extended theme.',
    required: false,
    fields: [
      {
        name: 'light',
        description: 'Light scheme colour roles.',
        required: false,
        fields: colorFields('light'),
      },
      {
        name: 'dark',
        description: 'Dark scheme colour roles.',
        required: false,
        fields: colorFields('dark'),
      },
    ],
  },
  {
    name: 'chrome',
    description: 'How the package draws the shell and shared components.',
    required: false,
    fields: [
      enumField(
        'topbar',
        'Glass bar with the page title, or a ledger bar with the current section.',
        [...THEME_CHROME.topbar],
      ),
      enumField('navigation', 'Plain section list, or numbered chapters.', [
        ...THEME_CHROME.navigation,
      ]),
      enumField('sectionTitle', 'Section title without a rule, underlined, or with a side bar.', [
        ...THEME_CHROME.sectionTitle,
      ]),
      enumField('cards', 'Raised cards, or cards ruled by an accent line.', [
        ...THEME_CHROME.cards,
      ]),
      enumField(
        'components',
        'Soft components, flat framed components, or components with a signal edge.',
        [...THEME_CHROME.components],
      ),
      enumField(
        'landing',
        'Landing opening centred, or a ledger with a side rail and an eyebrow.',
        [...THEME_CHROME.landing],
      ),
      enumField(
        'edges',
        'Nothing at the screen edges, or small monospace captions along them on a wide screen: the page title on the left, the current chapter and its number on the right — for a technical product.',
        [...THEME_CHROME.edges],
      ),
    ],
  },
  {
    name: 'ornaments',
    description: 'Small signature details of the theme.',
    required: false,
    fields: [
      {
        name: 'headingPrefix',
        description:
          'Up to three characters drawn before the page heading in the accent colour, such as > or §; no spaces, quotes, backslash or <; empty for none.',
        required: false,
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: 0,
          maxLength: 3,
          pattern: '^[^\\s<"\'\\\\]{0,3}$',
        },
      },
      {
        name: 'titleCursor',
        description:
          'Cursor after the page heading: blinks six times, then stays lit; still under reduced motion.',
        required: false,
        constraint: { kind: 'boolean' },
      },
      enumField(
        'heroEmphasis',
        'Hero and story sections unmarked, marked by a thin accent rule, or lifted by a shadow.',
        [...THEME_ORNAMENTS.heroEmphasis],
      ),
      enumField(
        'mediaTreatment',
        'Plain images, or images with depth and slightly richer colour.',
        [...THEME_ORNAMENTS.mediaTreatment],
      ),
      enumField(
        'console',
        'Console details: bracketed labels, dashed rules and a prompt mark at the current contents item.',
        [...THEME_ORNAMENTS.console],
      ),
      enumField(
        'scanlines',
        'Faint scanlines over the whole page; off by default, because a texture over the text reads as a generated-site cliché.',
        [...THEME_ORNAMENTS.scanlines],
      ),
      enumField(
        'glow',
        'Phosphor glow on headings and the primary action; off by default for the same reason.',
        [...THEME_ORNAMENTS.glow],
      ),
      enumField('linkedCard', 'Linked cards raised on hover, or marked by an accent edge.', [
        ...THEME_ORNAMENTS.linkedCard,
      ]),
    ],
  },
] as const satisfies readonly [FieldDefinition, ...FieldDefinition[]];

/**
 * Палитры встроенных тем, обе схемы каждой. Цвета перенесены из тем agentic-screencast; вторая схема
 * темы, которой в ролике нет, подобрана к той же паре акцентов и проверена на контраст.
 */
const MIDNIGHT_LIGHT: PaletteColors = {
  background: '#f5f7fb',
  surface: '#ffffff',
  raised: '#eef2f8',
  muted: '#e4e9f2',
  heading: '#0b0e14',
  text: '#2a3446',
  textMuted: '#56627a',
  border: '#dfe5ef',
  borderStrong: '#b3bdcf',
  accent: '#2f5bd3',
  accentStrong: '#2447a8',
  accentSoft: '#e6edfc',
  accent2: '#4a5f74',
  focus: '#2f5bd3',
  chart1: '#2f5bd3',
  chart2: '#1f7a4d',
  chart3: '#c2304a',
  chart4: '#8a5c00',
  chart5: '#0f7f76',
  chart6: '#7048b8',
  marker: '#4a5f74',
  shadow: '#0b0e141f',
  mediaBacking: 'transparent',
  codeBackground: '#f6f8fa',
  codeText: '#1f2328',
  codeKeyword: '#cf222e',
  codeString: '#0a3069',
  codeNumber: '#0550ae',
  codeFunction: '#8250df',
  codeType: '#953800',
  codeComment: '#5f6873',
  codePunctuation: '#24292f',
};

const MIDNIGHT_DARK: PaletteColors = {
  background: '#0b0e14',
  surface: '#121826',
  raised: '#141c2c',
  muted: '#1a2335',
  heading: '#f2f5fb',
  text: '#c7cfdd',
  textMuted: '#8b97ad',
  border: '#2a3446',
  borderStrong: '#34405a',
  accent: '#7aa2ff',
  accentStrong: '#a9c3ff',
  accentSoft: '#16203a',
  accent2: '#9fb2c8',
  focus: '#7aa2ff',
  chart1: '#7aa2ff',
  chart2: '#7ee0a7',
  chart3: '#ff8a9b',
  chart4: '#ffd166',
  chart5: '#4fd1c5',
  chart6: '#c8a6ff',
  marker: '#9fb2c8',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#0d1117',
  codeText: '#e6edf3',
  codeKeyword: '#ff7b72',
  codeString: '#a5d6ff',
  codeNumber: '#79c0ff',
  codeFunction: '#d2a8ff',
  codeType: '#ffa657',
  codeComment: '#8b949e',
  codePunctuation: '#c9d1d9',
};

const CALM_PAPER_LIGHT: PaletteColors = {
  background: '#f4f1ea',
  surface: '#fbf9f4',
  raised: '#efeadf',
  muted: '#e8e2d5',
  heading: '#1b1a17',
  text: '#3c3a34',
  textMuted: '#67624f',
  border: '#ded7c8',
  borderStrong: '#b7ad98',
  accent: '#c2643f',
  accentStrong: '#9c4a2a',
  accentSoft: '#f5e3d8',
  accent2: '#3f6b5d',
  focus: '#c2643f',
  chart1: '#b0552f',
  chart2: '#3f7a57',
  chart3: '#a8452f',
  chart4: '#8a5a00',
  chart5: '#4b7a6a',
  chart6: '#2f5f8a',
  marker: '#4b7a6a',
  shadow: '#1b1a171f',
  mediaBacking: 'transparent',
  codeBackground: '#fbf9f4',
  codeText: '#1f2328',
  codeKeyword: '#9c3d1f',
  codeString: '#3f6b4f',
  codeNumber: '#2f5f8a',
  codeFunction: '#7a4b8c',
  codeType: '#8a5a00',
  codeComment: '#67624f',
  codePunctuation: '#3c3a34',
};

const CALM_PAPER_DARK: PaletteColors = {
  background: '#1b1a17',
  surface: '#23211d',
  raised: '#2a2823',
  muted: '#312e28',
  heading: '#f4f1ea',
  text: '#d8d2c4',
  textMuted: '#a39d8c',
  border: '#3a362e',
  borderStrong: '#57513f',
  accent: '#e08a64',
  accentStrong: '#efae8f',
  accentSoft: '#3a2619',
  accent2: '#8fbfae',
  focus: '#e08a64',
  chart1: '#e08a64',
  chart2: '#8fcfa6',
  chart3: '#f09a84',
  chart4: '#e2b556',
  chart5: '#8fbfae',
  chart6: '#8fb4de',
  marker: '#8fbfae',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#151411',
  codeText: '#f4f1ea',
  codeKeyword: '#efae8f',
  codeString: '#a8d4b4',
  codeNumber: '#9cc0e4',
  codeFunction: '#cdb0e0',
  codeType: '#e8c27a',
  codeComment: '#a39d8c',
  codePunctuation: '#d8d2c4',
};

const SYNTHWAVE_LIGHT: PaletteColors = {
  background: '#fbf6ff',
  surface: '#ffffff',
  raised: '#f3eafc',
  muted: '#ebdff8',
  heading: '#1d0f33',
  text: '#3a2a55',
  textMuted: '#655485',
  border: '#e6d9f5',
  borderStrong: '#b9a3d8',
  accent: '#c01aa0',
  accentStrong: '#9c1583',
  accentSoft: '#fbe3f6',
  accent2: '#0a7390',
  focus: '#0a7390',
  chart1: '#c01aa0',
  chart2: '#127a55',
  chart3: '#c2304a',
  chart4: '#9a5b00',
  chart5: '#0a7390',
  chart6: '#6a3fc0',
  marker: '#0a7390',
  shadow: '#1d0f331f',
  mediaBacking: 'transparent',
  codeBackground: '#faf5ff',
  codeText: '#1d0f33',
  codeKeyword: '#b0198f',
  codeString: '#127a55',
  codeNumber: '#0a6f8a',
  codeFunction: '#6a3fc0',
  codeType: '#9a5b00',
  codeComment: '#655485',
  codePunctuation: '#3a2a55',
};

const SYNTHWAVE_DARK: PaletteColors = {
  background: '#140b27',
  surface: '#1d1036',
  raised: '#241443',
  muted: '#2b1850',
  heading: '#fdf4ff',
  text: '#d9c8f0',
  textMuted: '#a08bc9',
  border: '#3e2a63',
  borderStrong: '#5a3597',
  accent: '#ff4fd8',
  accentStrong: '#ff8ae5',
  accentSoft: '#3c1266',
  accent2: '#37e0ff',
  focus: '#37e0ff',
  chart1: '#ff4fd8',
  chart2: '#6cf0c2',
  chart3: '#ff6b8a',
  chart4: '#ffb86b',
  chart5: '#37e0ff',
  chart6: '#c8a6ff',
  marker: '#37e0ff',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#0a0418',
  codeText: '#fdf4ff',
  codeKeyword: '#ff4fd8',
  codeString: '#6cf0c2',
  codeNumber: '#37e0ff',
  codeFunction: '#c8a6ff',
  codeType: '#ffb86b',
  codeComment: '#a08bc9',
  codePunctuation: '#d9c8f0',
};

const NOIR_LIGHT: PaletteColors = {
  background: '#f5f3ef',
  surface: '#fbfaf8',
  raised: '#efece6',
  muted: '#e6e2da',
  heading: '#0a0a0b',
  text: '#2e2e33',
  textMuted: '#5c5c65',
  border: '#dedad2',
  borderStrong: '#a9a59c',
  accent: '#9a6420',
  accentStrong: '#7d4f15',
  accentSoft: '#f3e7d6',
  accent2: '#4a5f74',
  focus: '#9a6420',
  chart1: '#9a6420',
  chart2: '#3f6e48',
  chart3: '#a8453d',
  chart4: '#7d5a1e',
  chart5: '#4a5f74',
  chart6: '#6a5a95',
  marker: '#4a5f74',
  shadow: '#0a0a0b1f',
  mediaBacking: 'transparent',
  codeBackground: '#f3f1ec',
  codeText: '#1a1a1d',
  codeKeyword: '#8a5410',
  codeString: '#3f6e48',
  codeNumber: '#3f5670',
  codeFunction: '#7a5a20',
  codeType: '#a8453d',
  codeComment: '#5c5c65',
  codePunctuation: '#2e2e33',
};

const NOIR_DARK: PaletteColors = {
  background: '#0a0a0b',
  surface: '#121316',
  raised: '#141518',
  muted: '#1b1c20',
  heading: '#f4f4f5',
  text: '#bcbcc2',
  textMuted: '#8a8a93',
  border: '#26272c',
  borderStrong: '#45464e',
  accent: '#e0a458',
  accentStrong: '#ecc08a',
  accentSoft: '#221a10',
  accent2: '#9fb2c8',
  focus: '#e0a458',
  chart1: '#e0a458',
  chart2: '#8fb996',
  chart3: '#d4726a',
  chart4: '#e8c79a',
  chart5: '#9fb2c8',
  chart6: '#b3a6d6',
  marker: '#9fb2c8',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#000000',
  codeText: '#f4f4f5',
  codeKeyword: '#e0a458',
  codeString: '#8fb996',
  codeNumber: '#9fb2c8',
  codeFunction: '#e8c79a',
  codeType: '#d4726a',
  codeComment: '#8a8a93',
  codePunctuation: '#bcbcc2',
};

const AURORA_LIGHT: PaletteColors = {
  background: '#f2f8f7',
  surface: '#ffffff',
  raised: '#e8f2f1',
  muted: '#dcebe9',
  heading: '#06141a',
  text: '#23393d',
  textMuted: '#4f6469',
  border: '#d3e4e2',
  borderStrong: '#9dbcb9',
  accent: '#0f8577',
  accentStrong: '#0b6b60',
  accentSoft: '#d9f3ef',
  accent2: '#7a5a20',
  focus: '#0f8577',
  chart1: '#0f8577',
  chart2: '#1f7a45',
  chart3: '#be3455',
  chart4: '#946200',
  chart5: '#7a5a20',
  chart6: '#1f6fa0',
  marker: '#7a5a20',
  shadow: '#06141a1f',
  mediaBacking: 'transparent',
  codeBackground: '#eef6f5',
  codeText: '#06141a',
  codeKeyword: '#0b6b60',
  codeString: '#1f7a45',
  codeNumber: '#5b40b5',
  codeFunction: '#1a6690',
  codeType: '#b03050',
  codeComment: '#4f6469',
  codePunctuation: '#23393d',
};

const AURORA_DARK: PaletteColors = {
  background: '#070b16',
  surface: '#0c1622',
  raised: '#0f1c2a',
  muted: '#13223a',
  heading: '#eefaf7',
  text: '#c0d7d6',
  textMuted: '#819ea7',
  border: '#1d3340',
  borderStrong: '#26445a',
  accent: '#6fd6c4',
  accentStrong: '#a8ebe0',
  accentSoft: '#0f2a3a',
  accent2: '#d9c7a0',
  focus: '#6fd6c4',
  chart1: '#6fd6c4',
  chart2: '#8fcfa6',
  chart3: '#f0907a',
  chart4: '#e2c46d',
  chart5: '#d9c7a0',
  chart6: '#8fb4de',
  marker: '#d9c7a0',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#05080f',
  codeText: '#eefaf7',
  codeKeyword: '#6fd6c4',
  codeString: '#8fcfa6',
  codeNumber: '#d9c7a0',
  codeFunction: '#8fb4de',
  codeType: '#f0a08a',
  codeComment: '#819ea7',
  codePunctuation: '#c0d7d6',
};

const DAYLIGHT_LIGHT: PaletteColors = {
  background: '#f7f8fa',
  surface: '#ffffff',
  raised: '#f0f2f5',
  muted: '#e7eaef',
  heading: '#121620',
  text: '#313846',
  textMuted: '#555d6c',
  border: '#e2e5ea',
  borderStrong: '#b7bdc8',
  accent: '#1f5bb8',
  accentStrong: '#174a96',
  accentSoft: '#e3ecfa',
  accent2: '#0e6f82',
  focus: '#1f5bb8',
  chart1: '#1f5bb8',
  chart2: '#2f7a4f',
  chart3: '#b8362f',
  chart4: '#8a5c00',
  chart5: '#0e6f82',
  chart6: '#6b4a8c',
  marker: '#0e6f82',
  shadow: '#1216201f',
  mediaBacking: 'transparent',
  codeBackground: '#f3f5f8',
  codeText: '#1c2029',
  codeKeyword: '#a2352a',
  codeString: '#2f6b4f',
  codeNumber: '#1f5bb8',
  codeFunction: '#6b4a8c',
  codeType: '#8a5c00',
  codeComment: '#5a6170',
  codePunctuation: '#2a303b',
};

const DAYLIGHT_DARK: PaletteColors = {
  background: '#111418',
  surface: '#171b21',
  raised: '#1c2128',
  muted: '#232933',
  heading: '#eef1f5',
  text: '#cfd5de',
  textMuted: '#98a1ae',
  border: '#2a313c',
  borderStrong: '#404a58',
  accent: '#86b4f5',
  accentStrong: '#bcd5fb',
  accentSoft: '#172a47',
  accent2: '#6fc3d3',
  focus: '#9dc3f8',
  chart1: '#86b4f5',
  chart2: '#8fcfa6',
  chart3: '#f0907a',
  chart4: '#e2b556',
  chart5: '#6fc3d3',
  chart6: '#c0aee0',
  marker: '#6fc3d3',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#0c0f13',
  codeText: '#e6e9ee',
  codeKeyword: '#f0a08a',
  codeString: '#a8d4b4',
  codeNumber: '#9cc0e4',
  codeFunction: '#cdb0e0',
  codeType: '#e8c27a',
  codeComment: '#98a1ae',
  codePunctuation: '#cfd5de',
};

const EMBER_LIGHT: PaletteColors = {
  background: '#fbf6f1',
  surface: '#ffffff',
  raised: '#f5ece4',
  muted: '#efe2d6',
  heading: '#1c0f08',
  text: '#3d2a1f',
  textMuted: '#6a5242',
  border: '#ecdccf',
  borderStrong: '#c4a58f',
  accent: '#c2410c',
  accentStrong: '#9a3412',
  accentSoft: '#fde5d6',
  accent2: '#855a00',
  focus: '#c2410c',
  chart1: '#c2410c',
  chart2: '#3f7a2e',
  chart3: '#b91c1c',
  chart4: '#855a00',
  chart5: '#9a5b3a',
  chart6: '#2f5f8a',
  marker: '#855a00',
  shadow: '#1c0f081f',
  mediaBacking: 'transparent',
  codeBackground: '#faf3ec',
  codeText: '#1c0f08',
  codeKeyword: '#b23a0a',
  codeString: '#3f7a2e',
  codeNumber: '#855a00',
  codeFunction: '#7a4b2a',
  codeType: '#b91c1c',
  codeComment: '#6a5242',
  codePunctuation: '#3d2a1f',
};

const EMBER_DARK: PaletteColors = {
  background: '#0e0907',
  surface: '#170f0b',
  raised: '#1c120d',
  muted: '#24170f',
  heading: '#fff4ec',
  text: '#e3cdbf',
  textMuted: '#ad907f',
  border: '#3a2419',
  borderStrong: '#5e3a28',
  accent: '#ff7a3d',
  accentStrong: '#ffa577',
  accentSoft: '#2a120a',
  accent2: '#c9b8a8',
  focus: '#ff7a3d',
  chart1: '#ff7a3d',
  chart2: '#9be38b',
  chart3: '#ff6b6b',
  chart4: '#ffc15e',
  chart5: '#ffd9b3',
  chart6: '#8fb4de',
  marker: '#c9b8a8',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#070403',
  codeText: '#fff4ec',
  codeKeyword: '#ff7a3d',
  codeString: '#9be38b',
  codeNumber: '#ffc15e',
  codeFunction: '#ffd9b3',
  codeType: '#ff6b6b',
  codeComment: '#ad907f',
  codePunctuation: '#e3cdbf',
};

const BLUEPRINT_LIGHT: PaletteColors = {
  background: '#eef3fa',
  surface: '#f8fbff',
  raised: '#e4ecf7',
  muted: '#d9e4f2',
  heading: '#0a1a33',
  text: '#1f3656',
  textMuted: '#48607f',
  border: '#cfdced',
  borderStrong: '#8fa9ca',
  accent: '#0b6f99',
  accentStrong: '#085a7d',
  accentSoft: '#d6ecf7',
  accent2: '#7f5a00',
  focus: '#0b6f99',
  chart1: '#0b6f99',
  chart2: '#1f7a45',
  chart3: '#b8324d',
  chart4: '#7f5a00',
  chart5: '#2f5f9a',
  chart6: '#6a4fc4',
  marker: '#7f5a00',
  shadow: '#0a1a331f',
  mediaBacking: 'transparent',
  codeBackground: '#e9f0f9',
  codeText: '#0a1a33',
  codeKeyword: '#0b6f99',
  codeString: '#1f7a45',
  codeNumber: '#7f5a00',
  codeFunction: '#2f5f9a',
  codeType: '#b8324d',
  codeComment: '#48607f',
  codePunctuation: '#1f3656',
};

const BLUEPRINT_DARK: PaletteColors = {
  background: '#0a1a33',
  surface: '#0d2140',
  raised: '#0f2548',
  muted: '#13305a',
  heading: '#eaf4ff',
  text: '#b9d0ea',
  textMuted: '#8ca8ca',
  border: '#1f3f6b',
  borderStrong: '#2c5690',
  accent: '#4cc9f0',
  accentStrong: '#8fdcf5',
  accentSoft: '#0f2d57',
  accent2: '#f9c74f',
  focus: '#f9c74f',
  chart1: '#4cc9f0',
  chart2: '#80ed99',
  chart3: '#ff8fa3',
  chart4: '#f9c74f',
  chart5: '#a5d8ff',
  chart6: '#c8a6ff',
  marker: '#f9c74f',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#06101f',
  codeText: '#eaf4ff',
  codeKeyword: '#4cc9f0',
  codeString: '#80ed99',
  codeNumber: '#f9c74f',
  codeFunction: '#a5d8ff',
  codeType: '#ff8fa3',
  codeComment: '#8ca8ca',
  codePunctuation: '#b9d0ea',
};

const TERMINAL_LIGHT: PaletteColors = {
  background: '#0c0e0d',
  surface: '#121513',
  raised: '#161a17',
  muted: '#1b201c',
  heading: '#eef3ef',
  text: '#c9d4cc',
  textMuted: '#8e9b92',
  border: '#253029',
  borderStrong: '#3a4a3f',
  accent: '#5ccf8a',
  accentStrong: '#8fe0ad',
  accentSoft: '#15291c',
  accent2: '#e0a84a',
  focus: '#e0a84a',
  chart1: '#5ccf8a',
  chart2: '#8fe0ad',
  chart3: '#f0907a',
  chart4: '#e0a84a',
  chart5: '#8fb4de',
  chart6: '#b3a6d6',
  marker: '#e0a84a',
  shadow: '#00000099',
  mediaBacking: '#f7f6f2',
  codeBackground: '#080a09',
  codeText: '#c9d4cc',
  codeKeyword: '#5ccf8a',
  codeString: '#e0a84a',
  codeNumber: '#8fb4de',
  codeFunction: '#eef3ef',
  codeType: '#8fe0ad',
  codeComment: '#8e9b92',
  codePunctuation: '#a9b6ad',
};

const TERMINAL_DARK: PaletteColors = {
  background: '#0c0e0d',
  surface: '#121513',
  raised: '#161a17',
  muted: '#1b201c',
  heading: '#eef3ef',
  text: '#c9d4cc',
  textMuted: '#8e9b92',
  border: '#253029',
  borderStrong: '#3a4a3f',
  accent: '#5ccf8a',
  accentStrong: '#8fe0ad',
  accentSoft: '#15291c',
  accent2: '#e0a84a',
  focus: '#e0a84a',
  chart1: '#5ccf8a',
  chart2: '#8fe0ad',
  chart3: '#f0907a',
  chart4: '#e0a84a',
  chart5: '#8fb4de',
  chart6: '#b3a6d6',
  marker: '#e0a84a',
  shadow: '#00000099',
  mediaBacking: '#f7f6f2',
  codeBackground: '#080a09',
  codeText: '#c9d4cc',
  codeKeyword: '#5ccf8a',
  codeString: '#e0a84a',
  codeNumber: '#8fb4de',
  codeFunction: '#eef3ef',
  codeType: '#8fe0ad',
  codeComment: '#8e9b92',
  codePunctuation: '#a9b6ad',
};

/**
 * Нейтральная бумага: серая, а не кремовая, тушь и один тёплый акцент; тёмная схема — тёплый графит, а не
 * ночной синий. Голос ей дают антиква в заголовках, острые углы и карточки с линейкой, а не цвет.
 */
const NEUTRAL_LIGHT: PaletteColors = {
  background: '#f5f5f3',
  surface: '#fbfbfa',
  raised: '#eeeeeb',
  muted: '#e6e6e2',
  heading: '#16171a',
  text: '#2d2f33',
  textMuted: '#5b5e65',
  border: '#dededa',
  borderStrong: '#aeafaa',
  accent: '#8a5c00',
  accentStrong: '#6d4800',
  accentSoft: '#f3ead6',
  accent2: '#4a5561',
  focus: '#8a5c00',
  chart1: '#2f5f8a',
  chart2: '#3f7a4f',
  chart3: '#b3402a',
  chart4: '#a8520c',
  chart5: '#5a6b7a',
  chart6: '#6b5a8e',
  marker: '#4a5561',
  shadow: '#16171a1f',
  mediaBacking: 'transparent',
  codeBackground: '#f0f0ed',
  codeText: '#1f2126',
  codeKeyword: '#6d4800',
  codeString: '#3f6b4f',
  codeNumber: '#2f5f8a',
  codeFunction: '#6b4a8c',
  codeType: '#8a4a2a',
  codeComment: '#5b5e65',
  codePunctuation: '#2d2f33',
};

const NEUTRAL_DARK: PaletteColors = {
  background: '#151514',
  surface: '#1c1c1a',
  raised: '#222220',
  muted: '#292926',
  heading: '#f2f1ed',
  text: '#d3d1cb',
  textMuted: '#9d9b94',
  border: '#32312e',
  borderStrong: '#4d4b46',
  accent: '#e2b556',
  accentStrong: '#efd394',
  accentSoft: '#3b2d0c',
  accent2: '#aab3bd',
  focus: '#e8c26d',
  chart1: '#8fb4de',
  chart2: '#8fcfa6',
  chart3: '#f0907a',
  chart4: '#f0a35a',
  chart5: '#a9b6c2',
  chart6: '#c0aee0',
  marker: '#aab3bd',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#10100f',
  codeText: '#f2f1ed',
  codeKeyword: '#efd394',
  codeString: '#a8d4b4',
  codeNumber: '#9cc0e4',
  codeFunction: '#cdb0e0',
  codeType: '#e8c27a',
  codeComment: '#9d9b94',
  codePunctuation: '#d3d1cb',
};

/**
 * Две краски и один материал: холодный серый камень и графит. Цвета нет ни у акцента, ни у меток — цвет
 * остаётся только статусам (успех, риск, внимание), поэтому он читается как сигнал, а не как украшение.
 */
const FROST_LIGHT: PaletteColors = {
  background: '#eef0f3',
  surface: '#f7f8fa',
  raised: '#e6e9ed',
  muted: '#dde1e7',
  heading: '#262b37',
  text: '#383e4e',
  textMuted: '#565d6e',
  border: '#d6dae1',
  borderStrong: '#a3a9b6',
  accent: '#383e4e',
  accentStrong: '#262b37',
  accentSoft: '#dfe3ea',
  accent2: '#565d6e',
  focus: '#383e4e',
  chart1: '#383e4e',
  chart2: '#2f7250',
  chart3: '#b2362f',
  chart4: '#8a5c00',
  chart5: '#6b7385',
  chart6: '#4a5f74',
  marker: '#565d6e',
  shadow: '#262b371f',
  mediaBacking: 'transparent',
  codeBackground: '#e8ebef',
  codeText: '#262b37',
  codeKeyword: '#8a3a2f',
  codeString: '#2f6b4f',
  codeNumber: '#3f5670',
  codeFunction: '#5a4a7a',
  codeType: '#7a5200',
  codeComment: '#565d6e',
  codePunctuation: '#383e4e',
};

const FROST_DARK: PaletteColors = {
  background: '#1b1e25',
  surface: '#22262e',
  raised: '#272b34',
  muted: '#2e333d',
  heading: '#eceef2',
  text: '#c9ccd4',
  textMuted: '#a3a8b3',
  border: '#343944',
  borderStrong: '#4b515e',
  accent: '#b6bac5',
  accentStrong: '#dfe1e6',
  accentSoft: '#2c313b',
  accent2: '#a3a8b3',
  focus: '#dfe1e6',
  chart1: '#b6bac5',
  chart2: '#8fcfa6',
  chart3: '#f0907a',
  chart4: '#e2b556',
  chart5: '#8e95a3',
  chart6: '#9fb2c8',
  marker: '#a3a8b3',
  shadow: '#00000073',
  mediaBacking: '#f7f6f2',
  codeBackground: '#15181e',
  codeText: '#eceef2',
  codeKeyword: '#f0a08a',
  codeString: '#a8d4b4',
  codeNumber: '#9fb2c8',
  codeFunction: '#c9b8e0',
  codeType: '#e2c46d',
  codeComment: '#a3a8b3',
  codePunctuation: '#c9ccd4',
};

/** Основа всех встроенных тем: каждое поле задано, встроенные темы только переопределяют. */
export const BASE_THEME: ResolvedTheme = {
  name: 'base',
  description: 'Package base values every built-in theme starts from.',
  palette: 'Grey paper (#f5f5f3) with ink and one ochre accent (#8a5c00), as in neutral.',
  scheme: 'both',
  accent: 'ochre',
  fonts: THEME_FONT_PAIRS.neutral,
  typography: {
    headingWeight: 600,
    displayWeight: 600,
    headingTracking: -0.02,
    displayCase: 'none',
    displayScale: 1,
    bodyLeading: 1.62,
    bodyTracking: 0,
    captions: 'plain',
  },
  spacing: { density: 'comfortable', rhythm: 4, cardMinimum: 15, gap: 'regular' },
  width: 'standard',
  radius: 'soft',
  radii: { control: 'small', card: 'medium', media: 'medium' },
  controls: 'compact',
  backdrop: 'none',
  elevation: 'close',
  motion: { easing: 'standard', pace: 'calm' },
  colors: { light: withStatusRoles(NEUTRAL_LIGHT), dark: withStatusRoles(NEUTRAL_DARK) },
  chrome: {
    topbar: 'glass',
    navigation: 'plain',
    sectionTitle: 'plain',
    cards: 'raised',
    components: 'flat',
    landing: 'centered',
    edges: 'none',
  },
  ornaments: {
    headingPrefix: '',
    titleCursor: false,
    heroEmphasis: 'none',
    mediaTreatment: 'plain',
    linkedCard: 'raised',
    console: 'none',
    scanlines: 'none',
    glow: 'none',
  },
};

/**
 * Встроенные темы в порядке переключателя; каждая — частичная тема поверх основы. Нейтральная `neutral`
 * и двухцветная `frost` заведены по исследованию лендинга как темы без модных клише. Восемь тем
 * перенесены из agentic-screencast: палитра, пара акцентов, тройка гарнитур с насыщенностью, трекингом и
 * регистром дисплея и цвета кода. У тем, которые в ролике только тёмные или только светлые, вторая
 * схема подобрана к ним с проверенным контрастом.
 */
export const BUILT_IN_THEMES = [
  {
    name: 'calm-paper',
    description:
      'Long reading: warm paper, a Playfair display over Literata text, and one clay accent.',
    palette:
      'Warm paper (#f4f1ea) and dark ink (#1b1a17) for text that reads like print; clay (#c2643f) marks rules and the current place, sage (#4b7a6a) the eyebrows.',
    fonts: { pair: 'calm-paper' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: 0,
      bodyLeading: 1.68,
    },
    spacing: { density: 'comfortable', rhythm: 4, cardMinimum: 15 },
    width: 'wide',
    radius: 'soft',
    colors: { light: CALM_PAPER_LIGHT, dark: CALM_PAPER_DARK },
    chrome: { navigation: 'numbered', cards: 'ruled' },
  },
  {
    name: 'neutral',
    description:
      'Neutral reading and product pages: grey paper, a Literata display over Onest, Martian Mono, one ochre accent.',
    palette:
      'Grey paper (#f5f5f3) and ink (#16171a) with one warm ochre accent (#8a5c00); the dark scheme is warm graphite (#151514), not night blue. No cream, no terracotta.',
    accent: 'ochre',
    fonts: { pair: 'neutral' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: -0.01,
      bodyLeading: 1.6,
    },
    width: 'wide',
    radius: 'sharp',
    elevation: 'flat',
    colors: { light: NEUTRAL_LIGHT, dark: NEUTRAL_DARK },
    chrome: { topbar: 'ledger', navigation: 'numbered', cards: 'ruled', components: 'flat' },
  },
  {
    name: 'frost',
    description:
      'Two colours and one material: stone grey and graphite, an Onest display over IBM Plex Sans; colour is left to statuses.',
    palette:
      'Stone (#eef0f3) and graphite (#383e4e) in the light scheme, graphite night (#1b1e25) and stone (#b6bac5) in the dark; the accent is graphite itself, so green, red and ochre appear only as statuses.',
    accent: 'graphite',
    fonts: { pair: 'frost' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: -0.015,
    },
    width: 'wide',
    radius: 'sharp',
    elevation: 'flat',
    motion: { easing: 'gentle' },
    colors: { light: FROST_LIGHT, dark: FROST_DARK },
    chrome: { cards: 'ruled', components: 'edged' },
  },
  {
    name: 'daylight',
    description:
      'Product documentation: a bright page, an Onest display over Golos Text, and Geist Mono.',
    palette:
      'Cool white (#f7f8fa) and graphite ink (#121620); cobalt (#1f5bb8) marks the current place and petrol (#0e6f82) the eyebrows. No default framework palette.',
    fonts: { pair: 'daylight' },
    typography: { headingWeight: 640, displayWeight: 680, headingTracking: -0.02 },
    spacing: { density: 'comfortable', rhythm: 3.75, cardMinimum: 15 },
    width: 'wide',
    radius: 'soft',
    colors: { light: DAYLIGHT_LIGHT, dark: DAYLIGHT_DARK },
  },
  {
    name: 'midnight',
    description:
      'Engineering story at night: a Geologica display over IBM Plex Sans, one blue signal and steel for the eyebrows.',
    palette:
      'Night ink (#0b0e14) with one blue signal (#7aa2ff) and steel (#9fb2c8) for eyebrows; teal stays a chart series only. The light scheme keeps the pair on cool paper.',
    fonts: { pair: 'midnight' },
    typography: { headingWeight: 620, displayWeight: 680, headingTracking: -0.02 },
    spacing: { density: 'spacious', rhythm: 4.5, cardMinimum: 17 },
    width: 'wide',
    radius: 'soft',
    colors: { light: MIDNIGHT_LIGHT, dark: MIDNIGHT_DARK },
    chrome: { cards: 'ruled' },
    ornaments: { heroEmphasis: 'rule' },
  },
  {
    name: 'noir',
    description:
      'Cinematic and editorial: spaced Cormorant Garamond capitals over Jost, amber on black.',
    palette:
      'Black (#0a0a0b) and bone (#f4f4f5) with amber (#e0a458) and steel (#9fb2c8); the light scheme is ivory with darker amber.',
    fonts: { pair: 'noir' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: 0.08,
      displayCase: 'uppercase',
      displayScale: 0.8,
    },
    spacing: { density: 'spacious', rhythm: 5, cardMinimum: 18 },
    width: 'wide',
    radius: 'sharp',
    elevation: 'flat',
    motion: { easing: 'gentle', pace: 'slow' },
    colors: { light: NOIR_LIGHT, dark: NOIR_DARK },
    ornaments: { heroEmphasis: 'shadow', mediaTreatment: 'vivid' },
  },
  {
    name: 'aurora',
    description:
      'Calm research and science: a light Raleway display over Commissioner, one mint signal on deep blue.',
    palette:
      'Deep blue night (#070b16) with one mint signal (#6fd6c4) and sand (#d9c7a0) for eyebrows; the light scheme is pale sea-green paper with ochre eyebrows.',
    fonts: { pair: 'aurora' },
    typography: { headingWeight: 500, displayWeight: 400, headingTracking: -0.01 },
    spacing: { density: 'spacious', rhythm: 4.5, cardMinimum: 16 },
    width: 'wide',
    radius: 'soft',
    motion: { easing: 'gentle' },
    colors: { light: AURORA_LIGHT, dark: AURORA_DARK },
  },
  {
    name: 'blueprint',
    description:
      'Dense technical evidence: a Tektur display over Fira Sans, Martian Mono labels, cyan and yellow on drafting blue.',
    palette:
      'Drafting blue (#0a1a33) with cyan (#4cc9f0) and signal yellow (#f9c74f) and a faint grid; the light scheme is blueprint paper.',
    fonts: { pair: 'blueprint' },
    typography: {
      headingWeight: 650,
      displayWeight: 700,
      headingTracking: -0.02,
      bodyLeading: 1.55,
    },
    spacing: { density: 'compact', rhythm: 3, cardMinimum: 13, gap: 'tight' },
    width: 'wide',
    radius: 'sharp',
    backdrop: 'grid',
    motion: { pace: 'brisk' },
    colors: { light: BLUEPRINT_LIGHT, dark: BLUEPRINT_DARK },
    chrome: { topbar: 'ledger', navigation: 'numbered', components: 'edged', landing: 'ledger' },
  },
  {
    name: 'ember',
    description:
      'Launches and announcements: a condensed Oswald capital page title over Rubik, orange on dark embers.',
    palette:
      'Ember black (#0e0907) and warm white (#fff4ec) with one orange signal (#ff7a3d) and warm grey (#c9b8a8) for eyebrows; the light scheme is warm paper with burnt orange.',
    fonts: { pair: 'ember' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: 0.03,
      displayCase: 'uppercase',
    },
    spacing: { density: 'comfortable', rhythm: 4, cardMinimum: 16 },
    width: 'wide',
    radius: 'soft',
    motion: { easing: 'decisive' },
    colors: { light: EMBER_LIGHT, dark: EMBER_DARK },
  },
  {
    name: 'synthwave',
    description:
      'Games and music only: a wide Unbounded display over Exo 2, magenta and cyan on violet night; not for a product landing.',
    palette:
      'Violet night (#140b27) with magenta (#ff4fd8) and cyan (#37e0ff), for pages whose subject is play or music; the light scheme is lilac paper.',
    fonts: { pair: 'synthwave' },
    typography: {
      headingWeight: 650,
      displayWeight: 700,
      headingTracking: -0.03,
      displayScale: 0.78,
    },
    spacing: { density: 'comfortable', rhythm: 4, cardMinimum: 16 },
    width: 'wide',
    radius: 'soft',
    colors: { light: SYNTHWAVE_LIGHT, dark: SYNTHWAVE_DARK },
  },
  {
    name: 'terminal',
    description:
      'Developer console: Martian Mono and JetBrains Mono on graphite, a green prompt, amber labels and a cursor at the page heading.',
    palette:
      'Console graphite (#0c0e0d) with light grey text (#c9d4cc); one muted green (#5ccf8a) for the prompt and markers, amber (#e0a84a) for labels and focus. Dark scheme only; scanlines and glow are off unless the author turns them on.',
    scheme: 'dark',
    fonts: { pair: 'terminal' },
    typography: {
      headingWeight: 600,
      displayWeight: 600,
      headingTracking: -0.02,
      displayScale: 0.78,
    },
    spacing: { density: 'compact' },
    width: 'wide',
    radius: 'sharp',
    motion: { easing: 'decisive', pace: 'brisk' },
    colors: { light: TERMINAL_LIGHT, dark: TERMINAL_DARK },
    ornaments: {
      headingPrefix: '>',
      titleCursor: true,
      linkedCard: 'edge',
      console: 'on',
      scanlines: 'none',
      glow: 'none',
    },
  },
] as const satisfies readonly (ThemeInput & {
  readonly name: string;
  readonly description: string;
  readonly palette: string;
})[];

export type BuiltInThemeName = (typeof BUILT_IN_THEMES)[number]['name'];
export const BUILT_IN_THEME_NAMES = BUILT_IN_THEMES.map(
  (theme) => theme.name,
) as unknown as readonly [BuiltInThemeName, ...BuiltInThemeName[]];
/**
 * Тема по умолчанию — нейтральная: крем, антиква и терракота `calm-paper` исследование лендинга назвало
 * модным клише 2026 года, и страница без явной темы не должна его повторять (решение владельца 2026-09-27).
 */
export const DEFAULT_THEME_NAME: BuiltInThemeName = 'neutral';

export function isBuiltInThemeName(value: string): value is BuiltInThemeName {
  return (BUILT_IN_THEME_NAMES as readonly string[]).includes(value);
}

/**
 * Накладывает частичную тему на решённую. Акцент по имени подставляется раньше явных цветов той же
 * темы: тема может выбрать семейство и поправить в нём один оттенок.
 */
export function applyThemeInput(
  base: ResolvedTheme,
  input: ThemeInput,
  name: string,
): ResolvedTheme {
  const accent = input.accent ?? base.accent;
  const accentColors = input.accent === undefined ? undefined : THEME_ACCENTS[input.accent];
  return {
    name,
    description: input.description ?? base.description,
    palette: input.palette ?? base.palette,
    scheme: input.scheme ?? base.scheme,
    accent,
    fonts: resolveFonts(base.fonts, input.fonts),
    typography: { ...base.typography, ...input.typography },
    spacing: { ...base.spacing, ...input.spacing },
    width: input.width ?? base.width,
    radius: input.radius ?? base.radius,
    radii: { ...base.radii, ...input.radii },
    controls: input.controls ?? base.controls,
    backdrop: input.backdrop ?? base.backdrop,
    elevation: input.elevation ?? base.elevation,
    motion: { ...base.motion, ...input.motion },
    colors: {
      light: resolveStatusRoles(
        base.colors.light,
        { ...base.colors.light, ...accentColors?.light, ...input.colors?.light },
        input.colors?.light,
      ),
      dark: resolveStatusRoles(
        base.colors.dark,
        { ...base.colors.dark, ...accentColors?.dark, ...input.colors?.dark },
        input.colors?.dark,
      ),
    },
    chrome: { ...base.chrome, ...input.chrome },
    ornaments: { ...base.ornaments, ...input.ornaments },
  };
}

/** Пара задаёт все три роли; роль, названная в той же теме, уточняет пару. */
function resolveFonts(
  base: ResolvedTheme['fonts'],
  input: ThemeInput['fonts'],
): ResolvedTheme['fonts'] {
  if (input === undefined) return base;
  const { pair, ...roles } = input;
  return { ...base, ...(pair === undefined ? {} : THEME_FONT_PAIRS[pair]), ...roles };
}

const resolvedBuiltIns = new Map<string, ResolvedTheme>(
  BUILT_IN_THEMES.map((theme) => [theme.name, applyThemeInput(BASE_THEME, theme, theme.name)]),
);

export function resolveBuiltInTheme(name: BuiltInThemeName): ResolvedTheme {
  const theme = resolvedBuiltIns.get(name);
  if (theme === undefined) throw new Error(`Unknown built-in theme: ${name}`);
  return theme;
}
