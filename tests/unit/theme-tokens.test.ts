import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_STYLE_ALLOWANCES,
  styleDeclarations,
  styleViolations,
} from '../../src/authoring/style-rules.js';
import { THEME_TOKENS } from '../../src/authoring/theme-tokens.js';
import { BUILT_IN_THEME_NAMES, resolveBuiltInTheme } from '../../src/authoring/themes.js';
import { themeStylesheet } from '../../src/render/theme-css.js';

/**
 * Облик страницы целиком приходит из темы и шкал пакета: статические стили не называют числом ни
 * цвета, ни гарнитуры, ни скругления, ни цвета тени, ни насыщенности, ни кегля. Правила живут в
 * `src/authoring/style-rules.ts` — те же проверяют стили составных блоков расширений при сборке; здесь
 * они читают каждое объявление `document.css` с поимённым списком исключений пакета.
 */
const ALLOWED = DOCUMENT_STYLE_ALLOWANCES.properties;
const FONT_SIZE_ALLOWED = DOCUMENT_STYLE_ALLOWANCES.fontSizes;
const declarations = styleDeclarations;

function violations(css: string): readonly string[] {
  return styleViolations(css, DOCUMENT_STYLE_ALLOWANCES).map(
    (violation) => `${violation.line}: ${violation.message}`,
  );
}

describe('theme tokens own the look', () => {
  it('keeps colour, typeface, weight and size literals out of the static stylesheet', async () => {
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    expect(violations(css)).toEqual([]);
  });

  it('catches a colour, a typeface, a coloured shadow, a radius, a weight and a size written by hand', () => {
    const planted = [
      '.a { color: #1b1a17; }',
      '.b { font-family: Inter, sans-serif; }',
      '.c { box-shadow: 0 1px 2px rgb(0 0 0 / 20%); }',
      '.d { border-color: white; }',
      '.e { border-radius: 6px; }',
      '.f { color: var(--color-heading); font-family: var(--font-author-mono, var(--font-mono)); }',
      '.g { color: teal; background: color(srgb 1 0 0); }',
      '.h { font: 700 1rem var(--font-body), Arial; }',
      '.i { font-weight: 800; font-size: 13px }',
      '.visualization-axis-label { font-size: 12px; font-weight: var(--weight-strong); }',
    ].join('\n');
    expect(violations(planted)).toEqual([
      '1: color: colour literal in #1b1a17',
      '2: font-family names a typeface: Inter, sans-serif',
      '3: box-shadow: colour literal in 0 1px 2px rgb(0 0 0 / 20%)',
      '4: border-color: colour literal in white',
      '5: border-radius is not a theme radius: 6px',
      '7: color: colour literal in teal',
      '7: background: colour literal in color(srgb 1 0 0)',
      '8: font shorthand sets type by hand: 700 1rem var(--font-body), Arial',
      '9: font-weight is not a weight token: 800',
      '9: font-size is off the type scale: 13px',
    ]);
  });
});

/**
 * Договор токенов с двух сторон. Каждая переменная, которую читают стили пакета, кем-то объявлена: темой
 * (публичный словарь), самими стилями или рантаймом. Каждый токен словаря кто-то читает — иначе поле
 * темы ничего не меняет на странице. И тема объявляет ровно словарь: переменная мимо него — краска, о
 * которой расширение не узнает.
 */
async function sourceFiles(): Promise<readonly { file: string; text: string }[]> {
  const { execFileSync } = await import('node:child_process');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src'], {
    encoding: 'utf8',
  })
    .split('\n')
    // Удалённый, но ещё отслеживаемый файл в рабочем дереве не читается.
    .filter((file) => /\.(?:ts|tsx)$/u.test(file) && existsSync(path.resolve(file)));
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.resolve(file), 'utf8') })),
  );
}

/** Токены, которые читает не таблица стилей, а чужой код; устаревшая запись роняет проверку. */
const READ_ELSEWHERE = [
  { prefix: '--shiki-', reason: 'Shiki css-variables theme writes var(--shiki-*) into code spans' },
] as const;

/** Файлы, где литерал цвета — не краска страницы. */
const COLOUR_FILES_ALLOWED = [
  { file: 'src/authoring/themes.ts', reason: 'the theme palettes are the source of every colour' },
  {
    file: 'src/authoring/brand-theme.ts',
    reason: 'brand colours given by the author and their examples',
  },
  { file: 'src/core/snapshot.ts', reason: 'the contact sheet is a tool page, not the report' },
  {
    file: 'src/core/effect-check.ts',
    reason: 'the checker resets a probe canvas to a sentinel colour before parsing a sampled one',
  },
  {
    file: 'src/core/snapshot-measure.ts',
    reason:
      'the measurement resets a probe canvas to a sentinel colour before parsing a computed one',
  },
] as const;

function colourLines(file: string, text: string): string[] {
  return text
    .split('\n')
    .flatMap((line, index) =>
      !/^\s*(?:\/\/|\*)/u.test(line) &&
      /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/iu.test(line)
        ? [`${file}:${index + 1}`]
        : [],
    );
}

const VAR_READ = /var\((--[a-z][a-z0-9-]*)/gu;

describe('the theme token contract', () => {
  it('declares exactly the public vocabulary on the page root', () => {
    const declared = new Set<string>();
    for (const name of BUILT_IN_THEME_NAMES) {
      const css = themeStylesheet([resolveBuiltInTheme(name)]);
      for (const match of css.matchAll(/^\s+(--[a-z][a-z0-9-]*):/gmu))
        if (!(match[1] ?? '').startsWith('--inverse-')) declared.add(match[1] ?? '');
    }
    const vocabulary = new Set<string>(THEME_TOKENS.map((token) => token.name));
    expect([...declared].filter((name) => !vocabulary.has(name))).toEqual([]);
    expect([...vocabulary].filter((name) => !declared.has(name))).toEqual([]);
  });

  it('reads every token of the vocabulary somewhere', async () => {
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    const code = (await sourceFiles())
      .filter(({ file }) => !/theme-(?:tokens|css)\.ts$/u.test(file))
      .map(({ text }) => text)
      .join('\n');
    const readInCss = new Set([...css.matchAll(VAR_READ)].map((match) => match[1]));
    const unread = THEME_TOKENS.map((token) => token.name).filter(
      (name) =>
        !readInCss.has(name) &&
        !code.includes(`'${name}'`) &&
        !code.includes(`var(${name}`) &&
        !READ_ELSEWHERE.some((entry) => name.startsWith(entry.prefix)),
    );
    expect(unread).toEqual([]);
    for (const entry of READ_ELSEWHERE) expect(code, entry.reason).toContain(entry.prefix);
  });

  it('reads no variable that nobody declares', async () => {
    const css = await readFile(path.resolve('src/browser/document.css'), 'utf8');
    const code = (await sourceFiles()).map(({ text }) => text).join('\n');
    const known = new Set<string>(THEME_TOKENS.map((token) => token.name));
    for (const match of css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gu)) known.add(match[1] ?? '');
    const unknown = [...new Set([...css.matchAll(VAR_READ)].map((match) => match[1] ?? ''))].filter(
      (name) =>
        !known.has(name) &&
        !name.startsWith('--inverse-') &&
        !name.startsWith('--font-author-') &&
        !code.includes(`${name}:`) &&
        !code.includes(`'${name}`) &&
        !code.includes(`"${name}`) &&
        !code.includes(`\`${name}`),
    );
    expect(unknown).toEqual([]);
  });

  it('keeps colour literals out of the code that renders the page', async () => {
    const files = await sourceFiles();
    const found = files
      .filter(({ file }) => !COLOUR_FILES_ALLOWED.some((entry) => entry.file === file))
      .flatMap(({ file, text }) => colourLines(file, text));
    expect(found).toEqual([]);
    // Устаревшее исключение роняет проверку: файл есть и в нём действительно есть литерал.
    for (const entry of COLOUR_FILES_ALLOWED) {
      const file = files.find((candidate) => candidate.file === entry.file);
      expect(file, entry.file).toBeDefined();
      expect(colourLines(entry.file, file?.text ?? ''), entry.reason).not.toEqual([]);
    }
    expect(
      colourLines(
        'planted.ts',
        "const ink = '#1b1a17';\n// '#ffffff' in a comment\nconst css = `rgb(' + channel + ')`;\nconst glow = 'rgb(255 0 0)';",
      ),
    ).toEqual(['planted.ts:1', 'planted.ts:4']);
  });

  it('drops a stylesheet exception that no declaration needs any more', async () => {
    const found = declarations(await readFile(path.resolve('src/browser/document.css'), 'utf8'));
    for (const allowed of ALLOWED)
      expect(
        found.some((declaration) => declaration.property === allowed.property),
        allowed.reason,
      ).toBe(true);
    for (const allowed of FONT_SIZE_ALLOWED)
      expect(
        found.some(
          (declaration) =>
            declaration.property === 'font-size' &&
            allowed.selector.test(declaration.selector) &&
            allowed.value.test(declaration.value),
        ),
        allowed.reason,
      ).toBe(true);
  });
});
