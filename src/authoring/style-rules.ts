/**
 * Правила литералов таблиц стилей: облик страницы приходит только из темы и шкал пакета, поэтому стиль
 * не называет числом ни цвета, ни гарнитуры, ни скругления, ни насыщенности, ни кегля. Одни и те же правила
 * проверяют `src/browser/document.css` (тест `tests/unit/theme-tokens.test.ts`, с поимённым списком
 * исключений пакета) и стили составного блока расширения (`styles` в манифесте `kind: block`, загрузчик
 * `src/extensions/load.ts`, без исключений и с правилами изоляции поверх — `blockStyleViolations`).
 */

import { THEME_TOKENS } from './theme-tokens.js';

export interface StyleDeclaration {
  readonly line: number;
  readonly selector: string;
  readonly property: string;
  readonly value: string;
}

export interface StyleViolation {
  readonly line: number;
  readonly message: string;
}

/** Поимённые исключения пакета: свойство, которое может нести литерал, и почему. */
export interface StyleAllowances {
  readonly properties: readonly { readonly property: string; readonly reason: string }[];
  readonly fontSizes: readonly {
    readonly selector: RegExp;
    readonly value: RegExp;
    readonly reason: string;
  }[];
}

/**
 * Исключения `document.css`: маска, где чёрный — это непрозрачность, а не краска, нейтральная фактура и
 * форма пилюли, объявленные токенами пакета; подписи внутри SVG-схем в пикселях и три прозаических
 * элемента. У стилей расширения исключений нет.
 */
export const DOCUMENT_STYLE_ALLOWANCES: StyleAllowances = {
  properties: [
    { property: '--texture-ink', reason: 'neutral texture ink declared once as a package token' },
    { property: '--radius-pill', reason: 'the pill shape, the same in every theme' },
    { property: 'mask-image', reason: 'an alpha mask: black means opaque, not a colour' },
  ],
  fontSizes: [
    {
      selector: /^\.visualization-[a-z-]+(, \.visualization-[a-z-]+)*$/u,
      value: /^[\d.]+px$/u,
      reason: 'SVG label in user units',
    },
    {
      selector: /^h3$/u,
      value: /^min\(1\.2rem, var\(--heading-fit, 100vw\)\)$/u,
      reason: 'prose sub-heading',
    },
    { selector: /^blockquote$/u, value: /^1\.12rem$/u, reason: 'prose pull quote' },
    { selector: /^code$/u, value: /^0\.88em$/u, reason: 'inline code follows its sentence' },
  ],
};

const NO_ALLOWANCES: StyleAllowances = { properties: [], fontSizes: [] };

/** Все именованные цвета CSS: любое из этих слов в значении — краска мимо темы. */
const NAMED_COLOURS =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen';

const COLOUR_LITERAL = new RegExp(
  `#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|\\b(?:${NAMED_COLOURS.replaceAll(' ', '|')})\\b`,
  'iu',
);

/**
 * Кегль — только из шкалы `--text-*`. Исключения по форме: дисплейные заголовки (их кегль масштабирует
 * тема и ограничивает длина слова) и текучий кегль на `clamp` в `rem` и `vw`.
 */
const FONT_SIZE_FORMS = [
  /^var\(--text-[a-z]+\)$/u,
  /^min\(var\(--text-[a-z]+\), var\(--heading-fit, 100vw\)\)$/u,
  /^min\(calc\(clamp\([\d.]+rem, [\d.]+vw, [\d.]+rem\) \* var\(--display-scale, 1\)\), var\(--heading-fit, 100vw\)\)$/u,
  /^clamp\([\d.]+rem, [\d.]+vw( \+ [\d.]+rem)?, [\d.]+rem\)$/u,
] as const;

const WEIGHT_FORM = /^(?:var\(--(?:weight-[a-z]+|heading-weight|display-weight)\)|inherit)$/u;
/** Цепочка токенов гарнитуры до трёх звеньев: шрифт автора, роль темы, запасная роль темы. */
const FAMILY_FORM =
  /^(?:var\(--font-[a-z-]+(?:,\s*var\(--font-[a-z-]+(?:,\s*var\(--font-[a-z-]+\))?\))?\)|inherit)$/u;
const RADIUS_FORM =
  /^(?:0|50%|inherit|var\(--radius-[a-z]+\)|calc\(var\(--radius-[a-z]+\) \* [\d.]+\)|var\(--radius-[a-z]+\) var\(--radius-[a-z]+\) 0 0|0 var\(--radius-[a-z]+\) var\(--radius-[a-z]+\) 0)$/u;

/** Объявления таблицы стилей: строка, селектор блока, свойство и значение в одну строку. */
export function styleDeclarations(css: string): readonly StyleDeclaration[] {
  const withoutComments = stripComments(css);
  const found: StyleDeclaration[] = [];
  // Объявление заканчивается точкой с запятой или закрывающей скобкой блока: последнее в блоке тоже
  // читается. Начало текста считается границей: стили блока могут начинаться с объявления.
  const pattern = /(^|[{};])(\s*)([a-z-]+)\s*:\s*([^;{}]+?)\s*(?=[;}]|$)/giu;
  for (const match of withoutComments.matchAll(pattern)) {
    const start = (match.index ?? 0) + (match[1] ?? '').length + (match[2] ?? '').length;
    const before = withoutComments.slice(0, start);
    const open = before.lastIndexOf('{');
    const selectorStart =
      Math.max(before.lastIndexOf('}', open), before.lastIndexOf(';', open)) + 1;
    found.push({
      line: before.split('\n').length,
      selector: open < 0 ? '' : before.slice(selectorStart, open).replace(/\s+/gu, ' ').trim(),
      property: (match[3] ?? '').toLowerCase(),
      // Форматер переносит длинное значение по строкам: сравнивается его однострочная запись.
      value: (match[4] ?? '')
        .replace(/\s+/gu, ' ')
        .replace(/\( /gu, '(')
        .replace(/ \)/gu, ')')
        .trim(),
    });
  }
  return found;
}

/** Литералы облика: цвет, гарнитура, насыщенность, кегль мимо шкалы, скругление мимо темы. */
export function styleViolations(
  css: string,
  allowances: StyleAllowances = NO_ALLOWANCES,
): readonly StyleViolation[] {
  const out: StyleViolation[] = [];
  for (const declaration of styleDeclarations(css)) {
    if (allowances.properties.some((allowed) => allowed.property === declaration.property))
      continue;
    const { line, property } = declaration;
    const value = declaration.value.replace(/'[^']*'|"[^"]*"/gu, '');
    if (COLOUR_LITERAL.test(value))
      out.push({ line, message: `${property}: colour literal in ${value}` });
    if (property === 'font-family' && !FAMILY_FORM.test(value))
      out.push({ line, message: `font-family names a typeface: ${value}` });
    if (property === 'font' && value !== 'inherit')
      out.push({ line, message: `font shorthand sets type by hand: ${value}` });
    if (property === 'font-weight' && !WEIGHT_FORM.test(value))
      out.push({ line, message: `font-weight is not a weight token: ${value}` });
    if (
      property === 'font-size' &&
      !FONT_SIZE_FORMS.some((form) => form.test(value)) &&
      !allowances.fontSizes.some(
        (allowed) => allowed.selector.test(declaration.selector) && allowed.value.test(value),
      )
    )
      out.push({ line, message: `font-size is off the type scale: ${value}` });
    if (/radius$/u.test(property) && !RADIUS_FORM.test(value))
      out.push({ line, message: `${property} is not a theme radius: ${value}` });
  }
  return out;
}

/** Переменные, которые могут читать стили блока: публичный словарь темы и шкалы кегля и насыщенности. */
const BLOCK_VARIABLES = new Set<string>([
  ...THEME_TOKENS.map((token) => token.name),
  '--text-label',
  '--text-xs',
  '--text-sm',
  '--text-md',
  '--text-lg',
  '--weight-regular',
  '--weight-medium',
  '--weight-strong',
  '--heading-fit',
]);

/** Предел стилей одного блока, байт: блоку нужна горсть правил, а не тема. */
export const MAX_BLOCK_STYLE_BYTES = 8_192;

/**
 * Стили составного блока: правила литералов без исключений плюс изоляция. Стили вкладываются в селектор
 * элемента блока, поэтому им нельзя закрывать чужой блок (скобки сбалансированы; скобки внутри строк и
 * комментариев не считаются, незакрытая строка или комментарий — отказ), выбирать соседей блока
 * (комбинаторы `~` и `+` после `&` или в начале вложенного селектора, где `&` подразумевается), называть
 * корень документа (`:root`, `html`, `body`), подключать внешнее (`@import`, `url()`, `image-set()`),
 * объявлять свои переменные, читать переменные мимо словаря и нести директивы, кроме `@media` и
 * `@container`. Экранирование `\` и `<` запрещены: первое прячет литерал от проверки, второе может
 * закрыть `<style>` страницы.
 */
export function blockStyleViolations(css: string): readonly StyleViolation[] {
  const out: StyleViolation[] = [...styleViolations(css)];
  const text = stripComments(css);
  const code = blankStringsAndComments(css);
  const lineAt = (offset: number): number => code.slice(0, offset).split('\n').length;
  let depth = 0;
  for (const [offset, character] of [...code].entries()) {
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth < 0) {
        out.push({ line: lineAt(offset), message: 'a closing brace without its opening one' });
        depth = 0;
      }
    }
  }
  if (depth > 0) out.push({ line: lineAt(code.length), message: 'a block is not closed' });
  const refuse = (
    source: string,
    pattern: RegExp,
    message: (match: RegExpMatchArray) => string,
  ): void => {
    for (const match of source.matchAll(pattern))
      out.push({ line: lineAt(match.index ?? 0), message: message(match) });
  };
  refuse(text, /[\\<]/gu, (match) => `the character ${match[0]} is not allowed in block styles`);
  refuse(code, /["']/gu, () => 'a string is not closed on its line');
  refuse(code, /\/\*/gu, () => 'a comment is not closed');
  refuse(
    code,
    /@(?!media\b|container\b)[a-z-]+/giu,
    (match) => `${match[0]} is not allowed; block styles may use @media and @container only`,
  );
  refuse(
    code,
    /\b(?:url|image-set|image|element|expression|src)\s*\(/giu,
    (match) => `${match[0].replace(/\s+/gu, '')} loads or computes outside the theme`,
  );
  refuse(code, /var\(\s*(--[A-Za-z0-9_-]+)/gu, (match) =>
    BLOCK_VARIABLES.has(match[1] ?? '')
      ? ''
      : `var(${match[1] ?? ''}) is not a public theme token or a package scale`,
  );
  for (const prelude of code.matchAll(/[^{};]+(?=\{)/gu)) {
    const selector = prelude[0];
    if (selector.trim().startsWith('@')) continue;
    const line = lineAt((prelude.index ?? 0) + (selector.length - selector.trimStart().length));
    if (/(?:^|[\s>+~,(])(?:html|body)(?![\w-])|:root(?![\w-])/iu.test(selector))
      out.push({
        line,
        message: `${selector.trim()} names the document root; block styles select inside the block`,
      });
    if (selectsSiblingOfBlock(selector))
      out.push({
        line,
        message: `${selector.trim()} selects a sibling of the block; block styles select inside the block`,
      });
  }
  for (const declaration of styleDeclarations(css))
    if (declaration.property.startsWith('--'))
      out.push({
        line: declaration.line,
        message: `${declaration.property} declares a variable; block styles read theme tokens only`,
      });
  return out
    .filter((violation) => violation.message !== '')
    .sort((a, b) => a.line - b.line || a.message.localeCompare(b.message));
}

/**
 * Выбирает ли селектор соседа блока: комбинатор `~` или `+`, слева от которого составной селектор с `&`
 * или ничего (во вложенном правиле пустое начало значит `&`). Аргументы `:nth-*()` с их `+` не читаются.
 */
function selectsSiblingOfBlock(selector: string): boolean {
  const text = selector.replace(/(nth-[a-z-]+)\([^)]*\)/giu, '$1()');
  for (const [index, character] of [...text].entries()) {
    if (character !== '~' && character !== '+') continue;
    let start = index - 1;
    while (start >= 0 && /\s/u.test(text[start] ?? '')) start -= 1;
    const end = start + 1;
    let depth = 0;
    for (; start >= 0; start -= 1) {
      const previous = text[start] ?? '';
      if (previous === ')') depth += 1;
      else if (previous === '(') {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && /[\s>+~,]/u.test(previous)) break;
    }
    const compound = text.slice(start + 1, end);
    if (compound.includes('&')) return true;
    const boundary = start < 0 ? '' : (text[start] ?? '');
    if (compound === '' && (boundary === '' || boundary === ',')) return true;
  }
  return false;
}

/** Атрибут элемента, который несёт стили блока: его ставит развёртка на верхние узлы шаблона. */
export const BLOCK_STYLE_ATTRIBUTE = 'data-extension-block';
/** То же как свойство hast. */
export const BLOCK_STYLE_PROPERTY = 'dataExtensionBlock';

/** Стили блока, вложенные в селектор его элементов: вне блока они ничего не задевают. */
export function scopeBlockStyles(name: string, css: string): string {
  return `[${BLOCK_STYLE_ATTRIBUTE}="${name}"] {\n${stripComments(css).trim()}\n}\n`;
}

/** Строки CSS и комментарии: закрытая строка не переходит через перевод строки (`\` в стилях блока запрещён). */
const STRING_OR_COMMENT = /\/\*[\s\S]*?\*\/|"[^"\n]*"|'[^'\n]*'/gu;

/** Комментарии заменены пробелами с сохранением строк; строки CSS не трогаются, `/*` в них не комментарий. */
function stripComments(css: string): string {
  return css.replace(STRING_OR_COMMENT, (token) =>
    token.startsWith('/*') ? token.replace(/[^\n]/gu, ' ') : token,
  );
}

/** Комментарии и строки заменены пробелами: скобки и слова в них не читаются как код. */
function blankStringsAndComments(css: string): string {
  return css.replace(STRING_OR_COMMENT, (token) =>
    token.startsWith('/*') ? token.replace(/[^\n]/gu, ' ') : ' '.repeat(token.length),
  );
}
