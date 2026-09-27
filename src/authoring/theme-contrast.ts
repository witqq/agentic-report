import type { ResolvedTheme, ThemeColorRole, ThemeColors } from './themes.js';

/**
 * Пары ролей, которые читатель видит как текст на фоне. Порог — WCAG 2.2 AA: 4,5 для текста, подписей
 * и кода, 3 для кольца фокуса и для акцента, который рисуется линией или меткой, а не читается. Тема,
 * где пара ниже порога, не собирается: читатель получил бы страницу, которую нельзя прочитать, а агент
 * узнал бы об этом только глазами.
 */
export const THEME_CONTRAST_PAIRS: readonly {
  readonly foreground: ThemeColorRole;
  readonly background: ThemeColorRole;
  readonly minimum: number;
  readonly use: string;
  /** Цвет, который стили смешивают из роли и фона (`color-mix` в sRGB): доля роли в смеси. */
  readonly foregroundShare?: number;
}[] = [
  { foreground: 'heading', background: 'background', minimum: 4.5, use: 'headings on the page' },
  { foreground: 'text', background: 'background', minimum: 4.5, use: 'body text on the page' },
  { foreground: 'text', background: 'surface', minimum: 4.5, use: 'text inside components' },
  { foreground: 'textMuted', background: 'background', minimum: 4.5, use: 'captions on the page' },
  { foreground: 'textMuted', background: 'surface', minimum: 4.5, use: 'captions in components' },
  { foreground: 'text', background: 'raised', minimum: 4.5, use: 'text on raised panels' },
  { foreground: 'textMuted', background: 'raised', minimum: 4.5, use: 'captions on raised panels' },
  { foreground: 'textMuted', background: 'muted', minimum: 4.5, use: 'captions on muted wells' },
  {
    foreground: 'heading',
    background: 'accentSoft',
    minimum: 4.5,
    use: 'titles in accent sections',
  },
  { foreground: 'text', background: 'accentSoft', minimum: 4.5, use: 'text in accent sections' },
  // Подпись в акцентной полосе — текст, растворённый в её фоне (`document.css`, тон `accent`).
  {
    foreground: 'text',
    background: 'accentSoft',
    minimum: 4.5,
    use: 'captions in accent sections',
    foregroundShare: 0.8,
  },
  { foreground: 'accentStrong', background: 'background', minimum: 4.5, use: 'links on the page' },
  { foreground: 'accentStrong', background: 'surface', minimum: 4.5, use: 'links in components' },
  { foreground: 'accent2', background: 'background', minimum: 4.5, use: 'eyebrows and kickers' },
  { foreground: 'accent', background: 'background', minimum: 3, use: 'accent rules and markers' },
  { foreground: 'background', background: 'heading', minimum: 4.5, use: 'primary action label' },
  { foreground: 'focus', background: 'background', minimum: 3, use: 'keyboard focus ring' },
  // Статус рисуется точкой, линией и скобкой рядом со словом статуса: порог графического знака.
  { foreground: 'statusDone', background: 'background', minimum: 3, use: 'status «done» marks' },
  { foreground: 'statusDone', background: 'surface', minimum: 3, use: 'status «done» in cards' },
  {
    foreground: 'statusReview',
    background: 'background',
    minimum: 3,
    use: 'status «review» marks',
  },
  {
    foreground: 'statusReview',
    background: 'surface',
    minimum: 3,
    use: 'status «review» in cards',
  },
  {
    foreground: 'statusReturned',
    background: 'background',
    minimum: 3,
    use: 'status «returned» marks',
  },
  {
    foreground: 'statusReturned',
    background: 'surface',
    minimum: 3,
    use: 'status «returned» in cards',
  },
  { foreground: 'focus', background: 'surface', minimum: 3, use: 'focus ring inside components' },
  { foreground: 'codeText', background: 'codeBackground', minimum: 4.5, use: 'code text' },
  { foreground: 'codeKeyword', background: 'codeBackground', minimum: 4.5, use: 'code keywords' },
  { foreground: 'codeString', background: 'codeBackground', minimum: 4.5, use: 'code strings' },
  { foreground: 'codeNumber', background: 'codeBackground', minimum: 4.5, use: 'code numbers' },
  { foreground: 'codeFunction', background: 'codeBackground', minimum: 4.5, use: 'code functions' },
  { foreground: 'codeType', background: 'codeBackground', minimum: 4.5, use: 'code types' },
  { foreground: 'codeComment', background: 'codeBackground', minimum: 4.5, use: 'code comments' },
];

export interface ThemeContrastProblem {
  readonly scheme: 'light' | 'dark';
  readonly foreground: ThemeColorRole;
  readonly background: ThemeColorRole;
  readonly ratio: number;
  readonly minimum: number;
  readonly use: string;
}

export function themeContrastProblems(theme: ResolvedTheme): readonly ThemeContrastProblem[] {
  const schemes: readonly ('light' | 'dark')[] =
    theme.scheme === 'dark' ? ['dark'] : ['light', 'dark'];
  const problems: ThemeContrastProblem[] = [];
  for (const scheme of schemes) {
    const colors = theme.colors[scheme];
    for (const pair of THEME_CONTRAST_PAIRS) {
      // Порог сравнивается с точным отношением: округлённое 4,495 выглядело бы как проходное 4,5.
      const ratio = contrastRatio(colors, pair.foreground, pair.background, pair.foregroundShare);
      if (ratio < pair.minimum)
        problems.push({
          scheme,
          foreground: pair.foreground,
          background: pair.background,
          minimum: pair.minimum,
          use: pair.use,
          ratio: Math.round(ratio * 100) / 100,
        });
    }
  }
  return problems;
}

/**
 * Контраст одной пары ролей в схеме, как его считает проверка темы: роль накладывается на фон, фон — на
 * страницу. Команда `theme` подбирает светлоту цветов бренда этой же функцией, чтобы подобранное и
 * проверенное при сборке не расходились.
 */
export function contrastRatio(
  colors: ThemeColors,
  foreground: ThemeColorRole,
  background: ThemeColorRole,
  share = 1,
): number {
  const page = parseColor(colors.background) ?? { r: 255, g: 255, b: 255, a: 1 };
  const back = composite(parseColor(colors[background]) ?? { ...page, a: 0 }, page);
  const pure = composite(parseColor(colors[foreground]) ?? { ...back, a: 0 }, back);
  const front = composite({ ...pure, a: share }, back);
  const lighter = Math.max(luminance(front), luminance(back));
  const darker = Math.min(luminance(front), luminance(back));
  return (lighter + 0.05) / (darker + 0.05);
}

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function parseColor(value: string): Rgba | undefined {
  if (value === 'transparent') return undefined;
  const hex = value.slice(1);
  const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
  const channel = (index: number): number => Number.parseInt(expanded.slice(index, index + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: expanded.length === 8 ? channel(6) / 255 : 1,
  };
}

function composite(color: Rgba, under: Rgba): Rgba {
  const blend = (top: number, bottom: number): number => top * color.a + bottom * (1 - color.a);
  return {
    r: blend(color.r, under.r),
    g: blend(color.g, under.g),
    b: blend(color.b, under.b),
    a: 1,
  };
}

function luminance(color: Rgba): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}
