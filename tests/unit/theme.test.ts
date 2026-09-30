import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  contrastRatio,
  THEME_CONTRAST_PAIRS,
  themeContrastProblems,
} from '../../src/authoring/theme-contrast.js';
import { THEME_COLOR_TOKENS } from '../../src/authoring/theme-tokens.js';
import {
  applyThemeInput,
  BASE_THEME,
  BUILT_IN_THEME_NAMES,
  BUILT_IN_THEMES,
  resolveBuiltInTheme,
  THEME_ACCENT_NAMES,
  THEME_CODE_FONT_NAMES,
  THEME_COLOR_ROLES,
} from '../../src/authoring/themes.js';
import {
  themeFontFiles,
  themeRootAttributes,
  themeStylesheet,
} from '../../src/render/theme-css.js';
import { loadSource } from '../../src/source/load-source.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';
import { readPackageStylesheet } from '../helpers/package-stylesheet.js';

const workspaces: string[] = [];

/** Тон и насыщенность цвета в OKLCH: индиго узнаётся по тону, как бы ни был записан код. */
function oklchHue(hex: string): { readonly chroma: number; readonly hue: number } {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { chroma: Math.hypot(a, bb), hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspaceWith(files: Readonly<Record<string, string>>): Promise<string> {
  const workspace = await createTestWorkspace('theme');
  workspaces.push(workspace);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(workspace, name), content);
  }
  return workspace;
}

describe('theme data', () => {
  it('keeps every built-in theme readable in each scheme it draws', () => {
    for (const name of BUILT_IN_THEME_NAMES) {
      expect(themeContrastProblems(resolveBuiltInTheme(name)), name).toEqual([]);
    }
  });

  it('checks every code colour on every surface the stylesheet paints under a code line', async () => {
    // Catches a highlighted code line whose background the contrast check does not know: a diff or
    // edition line tinted by a status or the accent, or a scene line lit with the soft accent. Each rule
    // is read from the package stylesheet, so a changed tint share or a new tinted line fails here until the
    // check covers it, and the check then holds every built-in theme to 4.5:1 on that surface.
    const stylesheet = await readPackageStylesheet();
    const roleOf = (variable: string): string => {
      const entry = Object.entries(THEME_COLOR_TOKENS).find(([, token]) => token === variable);
      if (entry === undefined) throw new Error(`No colour role for ${variable}`);
      return entry[0];
    };
    const codeLineRules = [
      ".semantic-diff .line[data-diff='add']",
      ".semantic-diff .line[data-diff='remove']",
      ".semantic-diff .line:is([data-diff='hunk'], [data-diff='header'])",
      "[data-edition-layer='on'] .line[data-change='added']",
      '.line.edition-ghost-line',
      '.semantic-section[data-code-focus] .scene-stage pre code .line[data-lit]',
    ];
    const surfaces = codeLineRules.map((selector) => {
      const start = stylesheet.indexOf(`  ${selector} {\n`);
      expect(start, selector).toBeGreaterThan(-1);
      const body = stylesheet.slice(start, stylesheet.indexOf('}', start));
      const tint =
        /background: color-mix\(in srgb, var\((--[a-z0-9-]+)\) (\d+)%, transparent\);/u.exec(body);
      if (tint !== null) {
        return {
          selector,
          background: 'codeBackground',
          tint: { role: roleOf(tint[1] ?? ''), share: Number(tint[2]) / 100 },
        };
      }
      const opaque = /background: var\((--[a-z0-9-]+)\);/u.exec(body);
      if (opaque === null) throw new Error(`No background in ${selector}`);
      return { selector, background: roleOf(opaque[1] ?? ''), tint: undefined };
    });
    const codeRoles = Object.keys(THEME_COLOR_TOKENS).filter(
      (role) => role.startsWith('code') && role !== 'codeBackground',
    );
    expect(codeRoles).toHaveLength(8);
    for (const surface of surfaces) {
      for (const role of codeRoles) {
        expect(
          THEME_CONTRAST_PAIRS.some(
            (pair) =>
              pair.foreground === role &&
              pair.background === surface.background &&
              pair.minimum === 4.5 &&
              pair.backgroundTint?.role === surface.tint?.role &&
              pair.backgroundTint?.share === surface.tint?.share,
          ),
          `${role} under ${surface.selector}`,
        ).toBe(true);
      }
    }
    for (const name of BUILT_IN_THEME_NAMES) {
      const codeProblems = themeContrastProblems(resolveBuiltInTheme(name)).filter((problem) =>
        problem.foreground.startsWith('code'),
      );
      expect(codeProblems, name).toEqual([]);
    }
  });

  it('keeps the media backing of every built-in theme in the scheme it sits on', () => {
    // Catches a light paper behind transparent images on a dark page (and a dark one on a light page):
    // the backing is transparent, or its luminance is within 3:1 of the scheme's background.
    for (const name of BUILT_IN_THEME_NAMES) {
      const theme = resolveBuiltInTheme(name);
      for (const scheme of ['light', 'dark'] as const) {
        const colors = theme.colors[scheme];
        if (colors.mediaBacking === 'transparent') continue;
        expect(
          contrastRatio(colors, 'mediaBacking', 'background'),
          `${name} ${scheme}`,
        ).toBeLessThan(3);
      }
    }
    expect(
      contrastRatio(
        { ...resolveBuiltInTheme('midnight').colors.dark, mediaBacking: '#f7f6f2' },
        'mediaBacking',
        'background',
      ),
    ).toBeGreaterThan(3);
  });

  it('gives every built-in theme a description and a palette reason', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.description.length, theme.name).toBeGreaterThan(20);
      expect(theme.palette.length, theme.name).toBeGreaterThan(20);
    }
  });

  it('stores the look of a theme in data: the static stylesheet never selects a theme by name', async () => {
    const stylesheet = await readPackageStylesheet();
    // Имя темы стоит только в сгенерированных правилах; в статических — лишь её приёмы.
    expect(stylesheet).not.toMatch(/data-theme=/u);
    expect(stylesheet).not.toMatch(/data-preset/u);
    // Приёмы темы выбираются значениями приёма, а не именами тем.
    const treatmentValues = [...stylesheet.matchAll(/data-theme-[a-z-]+='([^']+)'/gu)].map(
      (match) => match[1],
    );
    expect(treatmentValues.length).toBeGreaterThan(10);
    for (const name of BUILT_IN_THEME_NAMES) expect(treatmentValues, name).not.toContain(name);
    // Палитра не записана в статическом CSS ни одним своим значением.
    const material = resolveBuiltInTheme('calm-paper').colors.light;
    for (const value of [material.background, material.surface, material.text]) {
      expect(stylesheet.toLowerCase(), value).not.toContain(value.toLowerCase());
    }
  });

  it('turns one changed data field into a changed rule without touching CSS', () => {
    const daylight = resolveBuiltInTheme('daylight');
    const before = themeStylesheet([daylight]);
    const after = themeStylesheet([
      {
        ...daylight,
        colors: { ...daylight.colors, light: { ...daylight.colors.light, surface: '#fafafa' } },
      },
    ]);
    expect(before).toContain('--color-surface: #ffffff');
    expect(after).toContain('--color-surface: #fafafa');
    // Тёмная схема несёт светлые цвета как `--inverse-*` для инверсной полосы — та же правка там.
    expect(after).toContain('--inverse-color-surface: #fafafa');
    expect(after.replaceAll('#fafafa', '#ffffff')).toBe(before);
  });

  it('exposes every structural treatment as a root attribute named after the treatment', () => {
    const terminal = themeRootAttributes(resolveBuiltInTheme('terminal'));
    expect(terminal).toMatchObject({
      'data-theme': 'terminal',
      'data-theme-heading-prefix': 'on',
      'data-theme-title-cursor': 'on',
      'data-theme-linked-card': 'edge',
    });
    const blueprint = themeRootAttributes(resolveBuiltInTheme('blueprint'));
    expect(blueprint).toMatchObject({
      'data-theme-topbar': 'ledger',
      'data-theme-navigation': 'numbered',
      'data-theme-landing': 'ledger',
    });
    expect(Object.keys(THEME_COLOR_ROLES)).toHaveLength(THEME_COLOR_ROLES.length);
  });
});

describe('heading word fit follows the typeface', () => {
  const advance = (css: string): number =>
    Number(/--display-advance: ([\d.]+)/u.exec(css)?.[1] ?? Number.NaN);

  it('gives an own theme with a wide heading face the width of that face, not of its base', () => {
    const calm = resolveBuiltInTheme('calm-paper');
    const wide = applyThemeInput(calm, { fonts: { pair: 'synthwave' } }, 'wide-notes');
    // Unbounded шире Playfair: своя тема получает её ширину без ручной поправки кегля.
    expect(advance(themeStylesheet([wide]))).toBeGreaterThan(
      advance(themeStylesheet([calm])) + 0.2,
    );
    expect(wide.typography.displayScale).toBe(1);
  });

  it('counts capitals and tracking of the theme in the letter width', () => {
    const noir = resolveBuiltInTheme('noir');
    const lower = applyThemeInput(noir, { typography: { displayCase: 'none' } }, 'noir-lower');
    expect(advance(themeStylesheet([noir]))).toBeGreaterThan(advance(themeStylesheet([lower])));
  });
});

describe('built-in look without generated-site clichés', () => {
  it('keeps every named accent readable on every built-in theme', () => {
    for (const name of BUILT_IN_THEME_NAMES) {
      for (const accent of THEME_ACCENT_NAMES) {
        const theme = applyThemeInput(resolveBuiltInTheme(name), { accent }, `${name}-${accent}`);
        // Тема со своими цветами акцента (терминал) уточняет их поверх имени: проверяется результат.
        expect(themeContrastProblems(theme), `${name}/${accent}`).toEqual([]);
      }
    }
  });

  it('never defaults to indigo and records why each palette looks the way it does', () => {
    expect(BASE_THEME.accent).not.toBe('indigo');
    for (const name of BUILT_IN_THEME_NAMES) {
      const theme = resolveBuiltInTheme(name);
      expect(theme.accent, name).not.toBe('indigo');
      // Индиго ловится по тону, а не по коду: indigo-500 Tailwind и соседние оттенки тоже индиго.
      for (const scheme of ['light', 'dark'] as const) {
        for (const role of ['accent', 'accentStrong', 'focus'] as const) {
          const { chroma, hue } = oklchHue(theme.colors[scheme][role]);
          const indigo = chroma > 0.08 && hue >= 268 && hue <= 300;
          expect(indigo, `${name}/${scheme}/${role} ${theme.colors[scheme][role]}`).toBe(false);
        }
      }
      expect(theme.description, name).not.toMatch(/compatibility identity/iu);
      expect(theme.palette, name).toMatch(/#[0-9a-f]{6}/iu);
    }
  });

  it('recognises Tailwind indigo by hue, so a renamed copy of it cannot pass', () => {
    for (const hex of ['#4f46e5', '#6366f1', '#818cf8', '#4338ca', '#3856d8']) {
      const { chroma, hue } = oklchHue(hex);
      expect(chroma > 0.08 && hue >= 268 && hue <= 300, hex).toBe(true);
    }
  });

  it('keeps scanlines and glow off unless a theme turns them on, and caps Cyrillic display weight', () => {
    for (const name of BUILT_IN_THEME_NAMES) {
      const theme = resolveBuiltInTheme(name);
      expect(themeRootAttributes(theme)['data-theme-scanlines'], name).toBe('none');
      expect(themeRootAttributes(theme)['data-theme-glow'], name).toBe('none');
      const cyrillic = Number(
        /--display-weight-cyrillic: (\d+)/u.exec(themeStylesheet([theme]))?.[1] ?? Number.NaN,
      );
      expect(cyrillic, name).toBeLessThanOrEqual(720);
    }
    const heavy = applyThemeInput(BASE_THEME, { typography: { displayWeight: 900 } }, 'heavy');
    expect(themeStylesheet([heavy])).toContain('--display-weight-cyrillic: 720');
    expect(themeStylesheet([heavy])).toContain('--display-weight: 900');
  });

  it('draws no coloured blob or glow behind any built-in page', () => {
    for (const name of BUILT_IN_THEME_NAMES) {
      const css = themeStylesheet([resolveBuiltInTheme(name)]);
      expect(css, name).not.toMatch(/--page-backdrop: [^;]*radial-gradient\(circle at (?!center)/u);
      expect(css, name).not.toMatch(/blur\(/u);
      expect(resolveBuiltInTheme(name).elevation, name).not.toBe('glow');
    }
  });

  it('resolves a type pair and lets a named role refine it', () => {
    const theme = applyThemeInput(
      BASE_THEME,
      { fonts: { pair: 'noir', heading: 'geologica' } },
      'pair-check',
    );
    expect(theme.fonts).toEqual({
      heading: 'geologica',
      body: 'jost',
      mono: 'pt-mono',
      code: 'jetbrains-mono',
    });
  });

  // Catches a theme that sets its code in a display or stylised mono (Martian Mono, Victor Mono, PT Mono):
  // the code face is a separate role, and only a text-grade programming mono may fill it.
  it('sets code in a text-grade programming mono in every built-in theme', () => {
    const textGrade = ['jetbrains-mono', 'geist-mono', 'system-mono'];
    for (const name of BUILT_IN_THEME_NAMES) {
      const theme = resolveBuiltInTheme(name);
      expect(textGrade, name).toContain(theme.fonts.code);
      const stylesheet = themeStylesheet([theme]);
      const family = theme.fonts.code === 'system-mono' ? 'ui-monospace' : theme.fonts.code;
      expect(
        /--font-code: ([^;]+);/u.exec(stylesheet)?.[1]?.toLowerCase().replace(/ /gu, '-'),
        name,
      ).toContain(family);
    }
    expect(THEME_CODE_FONT_NAMES).toEqual(textGrade);
  });

  // Бюджет поднят с 300 КБ и 1,3 МБ, когда Literata и Playfair стали встраиваться с осью оптического
  // размера: файл `opsz`+`wght` вдвое тяжелее файла `wght`, а `calm-paper` несёт обе гарнитуры (386 КБ).
  it('keeps the embedded fonts of a page within 400 KB and of the theme selector within 1.45 MB', async () => {
    const weight = async (themes: Parameters<typeof themeFontFiles>[0]): Promise<number> => {
      let bytes = 0;
      for (const font of themeFontFiles(themes)) {
        bytes += (await stat(path.resolve('src/fonts', font.directory, font.file))).size;
      }
      return bytes;
    };
    for (const name of BUILT_IN_THEME_NAMES) {
      expect(await weight([resolveBuiltInTheme(name)]), name).toBeLessThanOrEqual(400_000);
    }
    // Переключатель тем несёт гарнитуры всех встроенных тем: у каждой своя тройка, поэтому страница с
    // переключателем тяжелее обычной примерно на мегабайт.
    expect(await weight(BUILT_IN_THEME_NAMES.map(resolveBuiltInTheme))).toBeLessThanOrEqual(
      1_450_000,
    );
  });
});

describe('page theme loading', () => {
  it('inherits a built-in theme from a theme file and changes only what the file names', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntheme: brand.theme.yaml\n---\n# Report\n',
      'brand.theme.yaml':
        'extends: terminal\naccent: coral\ncolors:\n  dark:\n    accent: "#ff8f70"\n',
    });
    const source = await loadSource(workspace);
    const terminal = resolveBuiltInTheme('terminal');
    expect(source.theme.name).toBe('brand-theme');
    expect(source.theme.colors.dark.accent).toBe('#ff8f70');
    expect(source.theme.colors.dark.accentSoft).not.toBe(terminal.colors.dark.accentSoft);
    expect(source.theme.ornaments).toEqual(terminal.ornaments);
    expect(source.theme.fonts).toEqual(terminal.fonts);
    expect(source.sourceFiles).toContain(path.join(workspace, 'brand.theme.yaml'));
  });

  it('accepts a theme object in the frontmatter and chains theme files', async () => {
    const workspace = await workspaceWith({
      'report.md':
        '---\ntheme:\n  extends: child.yaml\n  name: page-look\n  width: narrow\n---\n# Report\n',
      'child.yaml': 'extends: parent.json\nradius: round\n',
      'parent.json': '{ "extends": "blueprint", "backdrop": "none" }\n',
    });
    const source = await loadSource(workspace);
    expect(source.theme).toMatchObject({
      name: 'page-look',
      width: 'narrow',
      radius: 'round',
      backdrop: 'none',
      chrome: resolveBuiltInTheme('blueprint').chrome,
    });
  });

  it('reports an unknown nested field at its line in the theme file', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntheme: look.yaml\n---\n# Report\n',
      'look.yaml': 'extends: calm-paper\ncolors:\n  light:\n    backgroud: "#ffffff"\n',
    });
    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'THEME_INVALID',
        message: expect.stringContaining('colors.light.backgroud'),
        source: { file: path.join(workspace, 'look.yaml'), line: 4, column: 5 },
      },
    });
  });

  it('lets an own theme use the > prompt and names what a heading prefix may not contain', async () => {
    const prompt = await workspaceWith({
      'report.md': "---\ntheme:\n  ornaments:\n    headingPrefix: '>'\n---\n# Report\n",
    });
    expect((await loadSource(prompt)).theme.ornaments.headingPrefix).toBe('>');

    const quoted = await workspaceWith({
      'report.md': "---\ntheme:\n  ornaments:\n    headingPrefix: '\"'\n---\n# Report\n",
    });
    await expect(loadSource(quoted)).rejects.toMatchObject({
      diagnostic: {
        code: 'THEME_INVALID',
        remediation: expect.stringMatching(
          /^Set ornaments\.headingPrefix to a valid value — up to three characters.*no spaces, quotes, backslash or </u,
        ),
      },
    });
  });

  it('reports every invalid field of an inline theme at its frontmatter line', async () => {
    const workspace = await workspaceWith({
      'report.md':
        '---\ntitle: Look\ntheme:\n  accent: purple\n  colors:\n    light:\n      text: navy\n---\n# Report\n',
    });
    const failure = await loadSource(workspace).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      diagnostic: {
        code: 'THEME_INVALID',
        remediation: expect.stringContaining('indigo, teal, coral'),
        source: { file: path.join(workspace, 'report.md'), line: 4 },
        related: [
          {
            code: 'THEME_INVALID',
            remediation: expect.stringContaining('#rrggbb'),
            source: { line: 7 },
          },
        ],
      },
    });
  });

  it('refuses an unreadable palette with the failing pair and its ratio', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntheme: pale.yaml\n---\n# Report\n',
      'pale.yaml': 'extends: calm-paper\ncolors:\n  light:\n    text: "#d8d2c8"\n',
    });
    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'THEME_CONTRAST',
        message: expect.stringMatching(/light scheme puts text on background at [\d.]+:1/u),
        source: { file: path.join(workspace, 'pale.yaml'), line: 4 },
      },
    });
  });

  it('confines a theme file to the source root', async () => {
    const workspace = await workspaceWith({
      'report.md': '---\ntheme: ../outside.yaml\n---\n# Report\n',
    });
    await expect(loadSource(workspace)).rejects.toMatchObject({
      diagnostic: {
        code: 'THEME_OUTSIDE_SOURCE',
        source: { file: path.join(workspace, 'report.md'), line: 2 },
      },
    });
  });

  it('refuses an unknown theme name, a cycle, and a stolen built-in name', async () => {
    const unknown = await workspaceWith({ 'report.md': '---\ntheme: neon\n---\n# Report\n' });
    await expect(loadSource(unknown)).rejects.toMatchObject({
      diagnostic: { code: 'THEME_UNKNOWN', details: { builtInThemes: [...BUILT_IN_THEME_NAMES] } },
    });
    const cycle = await workspaceWith({
      'report.md': '---\ntheme: a.yaml\n---\n# Report\n',
      'a.yaml': 'extends: b.yaml\n',
      'b.yaml': 'extends: a.yaml\n',
    });
    await expect(loadSource(cycle)).rejects.toMatchObject({
      diagnostic: { code: 'THEME_EXTENDS_CYCLE' },
    });
    const stolen = await workspaceWith({
      'report.md': '---\ntheme:\n  name: blueprint\n  accent: coral\n---\n# Report\n',
    });
    await expect(loadSource(stolen)).rejects.toMatchObject({
      diagnostic: { code: 'THEME_NAME_TAKEN', source: { line: 3 } },
    });
  });
});

describe('status roles, radius roles and grain', () => {
  // Ловит статус, отвязанный от смысла: тема сменила серию, а «готово» осталось прежним цветом.
  it('lets a status follow its series unless the same theme names it', () => {
    const base = resolveBuiltInTheme('neutral');
    expect(base.colors.light.statusDone).toBe(base.colors.light.chart2);
    const moved = applyThemeInput(base, { colors: { light: { chart2: '#1f7a3a' } } }, 'moved');
    expect(moved.colors.light.statusDone).toBe('#1f7a3a');
    const named = applyThemeInput(
      base,
      { colors: { light: { chart2: '#1f7a3a', statusDone: '#0a6b2c' } } },
      'named',
    );
    expect(named.colors.light.statusDone).toBe('#0a6b2c');
    expect(themeStylesheet([named])).toContain('--status-done: #0a6b2c');
  });

  // Ловит статус, который не виден: бледный «на проверке» на светлой бумаге не собирается.
  it('refuses a status mark below the contrast of a graphic sign', () => {
    const pale = applyThemeInput(
      resolveBuiltInTheme('neutral'),
      { colors: { light: { statusReview: '#f3e6b0' } } },
      'pale',
    );
    expect(
      themeContrastProblems(pale).map((problem) => `${problem.scheme} ${problem.foreground}`),
    ).toContain('light statusReview');
  });

  // Ловит роль скругления, которая не доходит до страницы.
  it('gives each radius role the step the theme names', () => {
    const theme = applyThemeInput(
      resolveBuiltInTheme('neutral'),
      { radius: 'round', radii: { control: 'none', media: 'large' } },
      'roles',
    );
    const css = themeStylesheet([theme]);
    expect(css).toContain('--radius-control: 0');
    expect(css).toContain('--radius-card: var(--radius-medium)');
    expect(css).toContain('--radius-media: var(--radius-large)');
  });

  it('marks the grain backdrop on the root so the stylesheet draws it', () => {
    const grain = applyThemeInput(resolveBuiltInTheme('neutral'), { backdrop: 'grain' }, 'grain');
    expect(themeRootAttributes(grain)['data-theme-backdrop']).toBe('grain');
  });
});
