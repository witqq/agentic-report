import type { ThemeColorRole } from './themes.js';

/** Ключ схемы темы (`schema --scope theme`) со словарём токенов по группам. */
export const THEME_TOKENS_KEYWORD = 'x-agentic-report-tokens';

/**
 * Публичный словарь токенов темы: CSS-переменные, которые решённая тема объявляет на корне страницы, по
 * группам и с полем темы, из которого каждая берётся. Это договор для всего, что рисует страницу, — стилей
 * пакета, рантайма, шейдеров и расширений: облик читается только отсюда, своих цветов и гарнитур никто не
 * вводит. Новый смысловой цвет становится ролью темы и попадает под проверку контраста.
 */
export const THEME_TOKEN_GROUPS = [
  'colour',
  'status',
  'series',
  'code',
  'type',
  'space',
  'width',
  'radius',
  'control',
  'elevation',
  'motion',
  'backdrop',
  'ornament',
] as const;
export type ThemeTokenGroup = (typeof THEME_TOKEN_GROUPS)[number];

export interface ThemeToken {
  readonly name: `--${string}`;
  readonly group: ThemeTokenGroup;
  /** Поле темы, из которого берётся значение. */
  readonly field: string;
}

/** Переменная каждой цветовой роли темы. */
export const THEME_COLOR_TOKENS: Readonly<Record<ThemeColorRole, `--${string}`>> = {
  background: '--color-bg',
  surface: '--color-surface',
  raised: '--color-surface-raised',
  muted: '--color-surface-muted',
  heading: '--color-heading',
  text: '--color-text',
  textMuted: '--color-text-muted',
  border: '--color-border',
  borderStrong: '--color-border-strong',
  accent: '--color-accent',
  accentStrong: '--color-accent-strong',
  accentSoft: '--color-accent-soft',
  accent2: '--color-accent-2',
  focus: '--color-focus',
  chart1: '--visual-1',
  chart2: '--visual-2',
  chart3: '--visual-3',
  chart4: '--visual-4',
  chart5: '--visual-5',
  chart6: '--visual-6',
  statusDone: '--status-done',
  statusReview: '--status-review',
  statusReturned: '--status-returned',
  marker: '--color-marker',
  shadow: '--shadow-color',
  mediaBacking: '--media-backing',
  // Подсветка кода: Shiki собирает блоки темой css-variables, и её токены читают эти переменные.
  codeBackground: '--shiki-background',
  codeText: '--shiki-foreground',
  codeKeyword: '--shiki-token-keyword',
  codeString: '--shiki-token-string',
  codeNumber: '--shiki-token-constant',
  codeFunction: '--shiki-token-function',
  codeType: '--shiki-token-parameter',
  codeComment: '--shiki-token-comment',
  codePunctuation: '--shiki-token-punctuation',
};

function colourGroup(role: ThemeColorRole): ThemeTokenGroup {
  if (role.startsWith('status')) return 'status';
  if (role.startsWith('chart')) return 'series';
  if (role.startsWith('code')) return 'code';
  return 'colour';
}

const LAYOUT_TOKENS: readonly ThemeToken[] = [
  { name: '--font-body', group: 'type', field: 'fonts.body' },
  { name: '--font-heading', group: 'type', field: 'fonts.heading' },
  { name: '--font-mono', group: 'type', field: 'fonts.mono' },
  { name: '--font-heading-small', group: 'type', field: 'fonts.heading' },
  { name: '--heading-weight', group: 'type', field: 'typography.headingWeight' },
  { name: '--display-weight', group: 'type', field: 'typography.displayWeight' },
  { name: '--display-weight-cyrillic', group: 'type', field: 'typography.displayWeight' },
  { name: '--heading-tracking', group: 'type', field: 'typography.headingTracking' },
  { name: '--display-case', group: 'type', field: 'typography.displayCase' },
  { name: '--display-scale', group: 'type', field: 'typography.displayScale' },
  { name: '--heading-measure', group: 'type', field: 'typography.headingMeasure' },
  { name: '--display-advance', group: 'type', field: 'fonts.heading' },
  { name: '--display-advance-small', group: 'type', field: 'fonts.heading' },
  { name: '--heading-measure', group: 'type', field: 'typography.headingMeasure' },
  { name: '--body-leading', group: 'type', field: 'typography.bodyLeading' },
  { name: '--body-tracking', group: 'type', field: 'typography.bodyTracking' },
  { name: '--space-factor', group: 'space', field: 'spacing.density' },
  { name: '--section-rhythm', group: 'space', field: 'spacing.rhythm' },
  { name: '--card-minimum', group: 'space', field: 'spacing.cardMinimum' },
  { name: '--shell-gap', group: 'space', field: 'spacing.gap' },
  { name: '--content-width', group: 'width', field: 'width' },
  { name: '--reading-measure', group: 'width', field: 'width' },
  { name: '--radius-small', group: 'radius', field: 'radius' },
  { name: '--radius-medium', group: 'radius', field: 'radius' },
  { name: '--radius-large', group: 'radius', field: 'radius' },
  { name: '--radius-control', group: 'radius', field: 'radii.control' },
  { name: '--radius-card', group: 'radius', field: 'radii.card' },
  { name: '--radius-media', group: 'radius', field: 'radii.media' },
  { name: '--control-md', group: 'control', field: 'controls' },
  { name: '--control-sm', group: 'control', field: 'controls' },
  { name: '--control-pad-x', group: 'control', field: 'controls' },
  { name: '--control-gap', group: 'control', field: 'controls' },
  { name: '--shadow-geometry', group: 'elevation', field: 'elevation' },
  { name: '--motion-ease', group: 'motion', field: 'motion.easing' },
  { name: '--motion-pace', group: 'motion', field: 'motion.pace' },
  { name: '--page-backdrop', group: 'backdrop', field: 'backdrop' },
  { name: '--page-backdrop-size', group: 'backdrop', field: 'backdrop' },
  { name: '--heading-prefix', group: 'ornament', field: 'ornaments.headingPrefix' },
];

export const THEME_TOKENS: readonly ThemeToken[] = [
  ...(Object.entries(THEME_COLOR_TOKENS) as [ThemeColorRole, `--${string}`][]).map(
    ([role, name]) => ({ name, group: colourGroup(role), field: `colors.<scheme>.${role}` }),
  ),
  ...LAYOUT_TOKENS,
];
