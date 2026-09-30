import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyThemeInput,
  BUILT_IN_THEME_NAMES,
  resolveBuiltInTheme,
  THEME_FONT_FAMILIES,
  THEME_FONT_FAMILY_NAMES,
  type ThemeFontFamilyName,
} from '../../src/authoring/themes.js';
import { buildReport } from '../../src/index.js';
import { themeFontFiles, themeStylesheet } from '../../src/render/theme-css.js';
import { loadSource } from '../../src/source/load-source.js';
import { woff2Axes } from '../helpers/woff2.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';
import { readPackageStylesheet } from '../helpers/package-stylesheet.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspaceWith(files: Readonly<Record<string, string>>): Promise<string> {
  const workspace = await createTestWorkspace('theme-typography');
  workspaces.push(workspace);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(workspace, name), content);
  }
  return workspace;
}

/** Файлы, которые пакет встраивает для одной гарнитуры, — как у темы, где она во всех трёх ролях. */
function filesOf(name: ThemeFontFamilyName) {
  const theme = applyThemeInput(
    resolveBuiltInTheme('neutral'),
    { fonts: { heading: name, body: name, mono: name } },
    'probe',
  );
  return themeFontFiles([theme]).filter(
    (file) => file.directory === THEME_FONT_FAMILIES[name].files,
  );
}

describe('embedded variable faces', () => {
  // Ловит файл не с теми осями: гарнитуру с `opsz`, встроенную файлом только с `wght` (оптический размер
  // молча пропадает), объявленный диапазон насыщенности мимо файла и потерянное подмножество.
  it('embeds for each family a Latin and a Cyrillic file whose axes match its registry entry', async () => {
    for (const name of THEME_FONT_FAMILY_NAMES) {
      const font: {
        readonly files: string | undefined;
        readonly weights:
          { readonly min: number; readonly max: number } | readonly number[] | undefined;
        readonly opticalSize?: { readonly min: number; readonly max: number };
      } = THEME_FONT_FAMILIES[name];
      if (font.files === undefined || font.weights === undefined) continue;
      const files = filesOf(name);
      expect(
        files.map((file) => (file.unicodeRange.includes('U+0400') ? 'cyrillic' : 'latin')).sort(),
        name,
      ).toEqual(
        'min' in font.weights
          ? ['cyrillic', 'latin']
          : font.weights.flatMap(() => ['cyrillic', 'latin']).sort(),
      );
      for (const file of files) {
        const axes = woff2Axes(
          await readFile(path.resolve('src/fonts', file.directory, file.file)),
        );
        if (!('min' in font.weights)) {
          expect(axes, file.file).toEqual([]);
          continue;
        }
        const expected = [
          { tag: 'wght', min: font.weights.min, max: font.weights.max },
          ...(font.opticalSize === undefined ? [] : [{ tag: 'opsz', ...font.opticalSize }]),
        ];
        expect(
          [...axes].sort((a, b) => a.tag.localeCompare(b.tag)),
          file.file,
        ).toEqual(expected.sort((a, b) => a.tag.localeCompare(b.tag)));
      }
    }
  });

  // Ловит оптический размер, который есть в реестре, но не доезжает до страницы: собранный файл несёт
  // старый шрифт только с `wght`, или стили отключают `font-optical-sizing`.
  it('puts the optical-size axis of Literata into a built page and lets the browser use it', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntitle: Optical\ntheme: neutral\n---\n# Optical size\n\nText.\n',
    });
    const output = path.join(workspace, 'page.html');
    await buildReport({ input: workspace, output });
    const html = await readFile(output, 'utf8');
    const faces = [
      ...html.matchAll(
        /@font-face\{font-family:"Literata";[^}]*?src:url\("data:font\/woff2;base64,([A-Za-z0-9+/=]+)"\)/gu,
      ),
    ];
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      const tags = woff2Axes(Buffer.from(face[1] ?? '', 'base64')).map((axis) => axis.tag);
      expect(tags).toContain('opsz');
      expect(tags).toContain('wght');
    }
    expect(html).toMatch(/font-optical-sizing:\s*auto/u);
    expect(html).not.toMatch(/font-optical-sizing:\s*none/u);
  });
});

describe('text Geist', () => {
  // Ловит незарегистрированную гарнитуру: схема темы отказывает `geist`, и автор не может её назвать.
  it('is a family an own theme can name for any role', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntheme:\n  fonts:\n    body: geist\n    heading: geist\n---\n# Report\n',
    });
    const source = await loadSource(workspace);
    expect(source.theme.fonts).toMatchObject({ body: 'geist', heading: 'geist' });
    expect(themeStylesheet([source.theme])).toContain(
      "--font-body: 'Geist', system-ui, sans-serif",
    );
    expect(themeFontFiles([source.theme]).map((file) => file.file)).toEqual(
      expect.arrayContaining(['geist-cyrillic-wght-normal.woff2', 'geist-latin-wght-normal.woff2']),
    );
  });

  // Ловит подмену гарнитуры встроенной темы: добавление семейства не должно менять ни одну тройку.
  it('is not the face of any built-in theme', () => {
    for (const name of BUILT_IN_THEME_NAMES) {
      expect(Object.values(resolveBuiltInTheme(name).fonts), name).not.toContain('geist');
    }
  });
});

describe('heading measure from the theme', () => {
  // Ловит поле, которое схема принимает, а страница не видит: переменная не выходит в стили темы.
  it('emits the measure a theme sets and leaves the package measure otherwise', () => {
    const neutral = resolveBuiltInTheme('neutral');
    const wide = applyThemeInput(neutral, { typography: { headingMeasure: 24 } }, 'wide-titles');
    expect(themeStylesheet([wide])).toContain('--heading-measure: 24ch;');
    // `initial` — пустое значение: `var(--heading-measure, 17ch)` берёт меру пакета, как до поля.
    expect(themeStylesheet([neutral])).toContain('--heading-measure: initial;');
  });

  // Ловит поле без границ: мера в 2ch или 200ch ломает заголовок, и схема обязана её отказать.
  it('refuses a measure outside 8 to 40 ch at its line', async () => {
    for (const value of [7, 41]) {
      const workspace = await workspaceWith({
        'report.md': `---\ntheme:\n  typography:\n    headingMeasure: ${value}\n---\n# Report\n`,
      });
      await expect(loadSource(workspace), String(value)).rejects.toMatchObject({
        diagnostic: { code: 'THEME_INVALID', source: { line: 4 } },
      });
    }
    const accepted = await workspaceWith({
      'report.md': '---\ntheme:\n  typography:\n    headingMeasure: 22.5\n---\n# Report\n',
    });
    expect((await loadSource(accepted)).theme.typography.headingMeasure).toBe(22.5);
  });

  // Ловит заголовок страницы или секции-заявления, чья мера в `ch` записана мимо переменной темы: такой
  // заголовок не слушается `typography.headingMeasure`.
  it('lets the variable govern every ch measure of the page title and display section titles', async () => {
    const css = (await readPackageStylesheet()).replace(/\/\*[\s\S]*?\*\//gu, '');
    const governed: string[] = [];
    const bypassing: string[] = [];
    for (const match of css.matchAll(/([^{};]+)\{([^{}]*)\}/gu)) {
      const selectors = (match[1] ?? '').split(',').map((selector) => selector.trim());
      const isTitle = selectors.every(
        (selector) =>
          /(?:^|[\s>])h1$/u.test(selector) ||
          /\[data-type='(?:display|editorial)'\] > \.semantic-section-title$/u.test(selector),
      );
      if (!isTitle) continue;
      const width = /max-width:\s*([^;]+);/u.exec(match[2] ?? '')?.[1]?.trim();
      if (width === undefined || !width.includes('ch')) continue;
      (/^var\(--heading-measure, \d+ch\)$/u.test(width) ? governed : bypassing).push(
        `${match[1]?.trim()} → ${width}`,
      );
    }
    expect(bypassing).toEqual([]);
    expect(governed.length).toBeGreaterThanOrEqual(12);
  });
});
