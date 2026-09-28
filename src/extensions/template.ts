/**
 * Шаблон составного блока (`kind: block`): Markdown из существующих директив с подстановками
 * `{{атрибут}}` и `{{content}}`. Здесь шаблон разбирается на куски и места подстановок, у каждого места
 * определяется контекст — текст Markdown или значение атрибута директивы в кавычках, — и значение
 * экранируется для своего контекста. Экранирование — граница: значение, которое написал автор страницы,
 * не может открыть директиву, закрыть атрибут или вставить HTML, что бы в нём ни было.
 */

export const CONTENT_PLACEHOLDER = 'content';

export type PlaceholderContext = 'text' | 'attribute' | 'content';

export interface TemplatePlaceholder {
  readonly name: string;
  readonly context: PlaceholderContext;
  /** Строка шаблона, 1 — первая. */
  readonly line: number;
}

export type TemplatePart = string | TemplatePlaceholder;

export interface CompiledTemplate {
  readonly parts: readonly TemplatePart[];
}

export interface TemplateProblem {
  readonly line: number;
  readonly message: string;
}

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9-]*)\s*\}\}/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
/** Начало блока атрибутов директивы: `:имя{`, `:имя[метка]{`, `::имя{`, `:::имя{`. */
const ATTRIBUTE_BLOCK_START = /:[a-z][a-z0-9-]*(?:\[[^\]\n]*\])?\{/gu;

/**
 * Разбирает шаблон. `attributes` — объявленные имена; `acceptsContent` — может ли блок нести тело
 * (форма `container`). Все найденные нарушения возвращаются вместе, а не первое.
 */
export function compileTemplate(
  text: string,
  attributes: ReadonlySet<string>,
  acceptsContent: boolean,
): { readonly template: CompiledTemplate; readonly problems: readonly TemplateProblem[] } {
  const parts: TemplatePart[] = [];
  const problems: TemplateProblem[] = [];
  const lines = text.split('\n');
  let fence: string | undefined;
  let contentSlots = 0;
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const suffix = index < lines.length - 1 ? '\n' : '';
    const fenceMatch = FENCE.exec(line);
    if (fence !== undefined) {
      if (fenceMatch?.[1]?.startsWith(fence) === true) fence = undefined;
      if ([...line.matchAll(PLACEHOLDER)].length > 0)
        problems.push({
          line: lineNumber,
          message: 'A placeholder inside a code block is inserted verbatim and cannot be escaped.',
        });
      parts.push(line + suffix);
      return;
    }
    if (fenceMatch?.[1] !== undefined) {
      fence = fenceMatch[1].slice(0, 3);
      parts.push(line + suffix);
      return;
    }
    const attributeRanges = attributeValueRanges(line);
    let cursor = 0;
    for (const match of line.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? '';
      const start = match.index;
      parts.push(line.slice(cursor, start));
      cursor = start + match[0].length;
      if (name === CONTENT_PLACEHOLDER) {
        contentSlots += 1;
        if (!acceptsContent)
          problems.push({
            line: lineNumber,
            message: '{{content}} needs the container form: add container to forms.',
          });
        if (line.trim() !== match[0])
          problems.push({
            line: lineNumber,
            message: '{{content}} must stand alone on its own line.',
          });
        parts.push({ name, context: 'content', line: lineNumber });
        continue;
      }
      if (!attributes.has(name))
        problems.push({
          line: lineNumber,
          message: `{{${name}}} names no declared attribute.`,
        });
      const inside = attributeRanges.find((range) => start >= range.start && start < range.end);
      if (inside?.quoted === false)
        problems.push({
          line: lineNumber,
          message: `{{${name}}} inside directive attributes must be a quoted value: key="{{${name}}}".`,
        });
      if (inside === undefined && backticksBefore(line, start) % 2 === 1)
        problems.push({
          line: lineNumber,
          message: 'A placeholder inside inline code is inserted verbatim and cannot be escaped.',
        });
      parts.push({
        name,
        context: inside === undefined ? 'text' : 'attribute',
        line: lineNumber,
      });
    }
    parts.push(line.slice(cursor) + suffix);
  });
  if (contentSlots > 1) problems.push({ line: 1, message: '{{content}} may appear at most once.' });
  return { template: { parts: parts.filter((part) => part !== '') }, problems };
}

/**
 * Промежутки блоков атрибутов директив в строке; `quoted` — внутри значения в кавычках.
 * Возвращаются промежутки кавычек и промежутки вне кавычек отдельно, чтобы подстановка знала, где стоит.
 */
function attributeValueRanges(
  line: string,
): readonly { readonly start: number; readonly end: number; readonly quoted: boolean }[] {
  const ranges: { start: number; end: number; quoted: boolean }[] = [];
  for (const match of line.matchAll(ATTRIBUTE_BLOCK_START)) {
    let index = match.index + match[0].length;
    let segmentStart = index;
    let quote: string | undefined;
    for (; index < line.length; index += 1) {
      const character = line[index];
      if (quote !== undefined) {
        if (character === quote) {
          ranges.push({ start: segmentStart, end: index, quoted: true });
          quote = undefined;
          segmentStart = index + 1;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        ranges.push({ start: segmentStart, end: index, quoted: false });
        quote = character;
        segmentStart = index + 1;
        continue;
      }
      if (character === '}') break;
    }
    ranges.push({ start: segmentStart, end: index, quoted: quote !== undefined });
  }
  return ranges;
}

function backticksBefore(line: string, end: number): number {
  let count = 0;
  for (let index = 0; index < end; index += 1) if (line[index] === '`') count += 1;
  return count;
}

/** Любой знак ASCII-пунктуации, который CommonMark разрешает экранировать обратной косой чертой. */
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/gu;

/**
 * Значение в тексте Markdown: пробельные символы сводятся к одному пробелу (Markdown всё равно не
 * показывает их иначе, а перевод строки мог бы начать новый блок), каждый знак пунктуации экранируется.
 * Так значение остаётся текстом: ни `:::`, ни `<`, ни `[ссылка]`, ни `*` не становятся разметкой.
 */
export function escapeMarkdownText(value: string): string {
  return value.replace(/\s+/gu, ' ').replace(ASCII_PUNCTUATION, (character) => `\\${character}`);
}

/**
 * Значение атрибута директивы в кавычках: парсер директив раскрывает ссылки на символы, поэтому
 * кавычки, фигурные скобки, амперсанд, угловые скобки и переводы строк записываются ссылками и не
 * могут закрыть значение или блок атрибутов.
 */
export function escapeAttributeValue(value: string): string {
  return value.replace(/[&"'{}<>\r\n]/gu, (character) => `&#${character.codePointAt(0)};`);
}

/** Шаблон с подставленными значениями; место `{{content}}` получает строку-метку `contentMarker`. */
export function expandTemplate(
  template: CompiledTemplate,
  values: Readonly<Record<string, string>>,
  contentMarker: string,
): string {
  return template.parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part.context === 'content') return contentMarker;
      const value = values[part.name] ?? '';
      return part.context === 'attribute' ? escapeAttributeValue(value) : escapeMarkdownText(value);
    })
    .join('');
}
