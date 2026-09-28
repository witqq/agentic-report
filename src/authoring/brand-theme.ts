import { lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringify } from 'yaml';

import type {
  BrandThemeRole,
  CreateBrandThemeOptions,
  CreateBrandThemeResult,
} from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { hexToOklch, hueDistance, OPAQUE_HEX_PATTERN, oklchToHex, type Oklch } from './oklch.js';
import { contrastRatio, THEME_CONTRAST_PAIRS, themeContrastProblems } from './theme-contrast.js';
import {
  applyThemeInput,
  BUILT_IN_THEME_NAMES,
  DEFAULT_THEME_NAME,
  isBuiltInThemeName,
  resolveBuiltInTheme,
  type ResolvedTheme,
  type ThemeColorRole,
  type ThemeColors,
  type ThemeInput,
} from './themes.js';

/**
 * Тема из цветов бренда. Первый цвет становится семейством акцента — метками (`accent`), ссылками
 * (`accentStrong`), мягким фоном акцентных секций (`accentSoft`), кольцом фокуса (`focus`) и первой серией
 * графиков (`chart1`); второй — вторым акцентом (`accent2`) для подводок. Остальные серии графиков не
 * трогаются: у `chart2`–`chart4` есть смысл статусов (успех, опасность, внимание), и цвет бренда там
 * соврал бы. Светлота каждого цвета сдвигается в OKLCH при неизменном тоне, пока все пары контраста, в
 * которые роль входит, не пройдут в каждой схеме темы, — той же функцией, которой их проверяет сборка.
 */

const DEFAULT_OUTPUT = 'brand-theme.yaml';
const THEME_FILE_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);
const MAX_BRAND_COLORS = 2;

type Scheme = 'light' | 'dark';

/** Мягкий фон акцента: почти страница с оттенком бренда — как у именованных семейств акцента. */
const SOFT_SEED: Readonly<Record<Scheme, { readonly l: number; readonly c: number }>> = {
  light: { l: 0.95, c: 0.04 },
  dark: { l: 0.28, c: 0.06 },
};

export async function createBrandTheme(
  options: CreateBrandThemeOptions,
): Promise<CreateBrandThemeResult> {
  const colors = parseBrandColors(options.colors);
  const parentName = options.extends?.trim() ?? DEFAULT_THEME_NAME;
  if (!isBuiltInThemeName(parentName)) {
    throw new AgenticReportError({
      level: 'error',
      code: 'THEME_EXTENDS_UNKNOWN',
      message: `Theme "${parentName}" is not a built-in theme.`,
      remediation: `Pass --extends with one of ${BUILT_IN_THEME_NAMES.join(', ')}.`,
      details: { extends: parentName, builtInThemes: BUILT_IN_THEME_NAMES },
    });
  }
  const requested = path.resolve(options.output ?? DEFAULT_OUTPUT);
  const extension = path.extname(requested).toLowerCase();
  if (!THEME_FILE_EXTENSIONS.has(extension) || requested.includes('\0')) {
    throw new AgenticReportError({
      level: 'error',
      code: 'THEME_OUTPUT_INVALID',
      message: 'The theme file must be written as .yaml, .yml or .json.',
      remediation: 'Pass --output with a path ending in .yaml, .yml or .json.',
      details: { extension },
    });
  }
  const themePath = await resolveThroughParent(requested);
  await requireAbsent(themePath);

  const name = themeNameFor(themePath);
  const composed = composeBrandTheme(colors, resolveBuiltInTheme(parentName), parentName, name);
  const text =
    extension === '.json'
      ? `${JSON.stringify(composed.input, null, 2)}\n`
      : `# Written by \`agentic-report theme\`: brand colours, lightness shifted until every contrast pair passes.\n${stringify(composed.input, { lineWidth: 0 })}`;
  try {
    await writeFile(themePath, text, { flag: 'wx' });
  } catch (error) {
    if (isFileSystemError(error, 'EEXIST')) throw outputExistsError(themePath);
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'THEME_OUTPUT_FAILED',
        message: 'The theme file could not be written.',
        remediation: 'Choose an absent path in an existing directory this process can write to.',
      },
      { cause: error },
    );
  }
  return {
    themePath,
    name,
    extends: parentName,
    schemes: composed.schemes,
    roles: composed.roles,
  };
}

/** Цвета бренда из строки через запятую или списка: один или два, `#rgb` или `#rrggbb`. */
export function parseBrandColors(value: string | readonly string[]): readonly string[] {
  const items = (typeof value === 'string' ? value.split(',') : [...value]).map((item) =>
    typeof item === 'string' ? item.trim().toLowerCase() : '',
  );
  const invalid = items.filter((item) => !OPAQUE_HEX_PATTERN.test(item));
  if (items.length === 0 || items.length > MAX_BRAND_COLORS || invalid.length > 0) {
    throw new AgenticReportError({
      level: 'error',
      code: 'THEME_COLORS_INVALID',
      message:
        invalid.length > 0
          ? `Brand colour ${JSON.stringify(invalid[0])} is not written as #rgb or #rrggbb.`
          : `Pass one or two brand colours, not ${items.length}.`,
      remediation:
        'Pass --colors with one or two opaque colours such as "#0b5fff,#ff7a00": the first becomes the accent, the second the eyebrow accent.',
      details: { colors: items, expected: '#rgb or #rrggbb, one or two, comma-separated' },
    });
  }
  return items;
}

export interface ComposedBrandTheme {
  readonly input: ThemeInput;
  readonly schemes: readonly Scheme[];
  readonly roles: readonly BrandThemeRole[];
}

/**
 * Чистая часть команды: тема, которую она запишет, и отчёт о сдвигах. Родитель передаётся решённой темой,
 * поэтому невыполнимый случай проверяется на палитре, которой нет среди встроенных тем.
 */
export function composeBrandTheme(
  colors: readonly string[],
  parent: ResolvedTheme,
  parentName: string,
  name: string,
): ComposedBrandTheme {
  const [primary, secondary] = colors;
  if (primary === undefined) throw new Error('A brand theme needs a colour.');
  const schemes: readonly Scheme[] = parent.scheme === 'dark' ? ['dark'] : ['light', 'dark'];
  const roles: BrandThemeRole[] = [];
  const schemeColors: Partial<Record<Scheme, Partial<ThemeColors>>> = {};
  for (const scheme of schemes) {
    const current: Record<ThemeColorRole, string> = { ...parent.colors[scheme] };
    const set = (role: ThemeColorRole, from: string, seed: Oklch): Oklch => {
      const value = fitRole(current, role, seed, scheme);
      current[role] = value;
      roles.push(describeRole(scheme, role, from, value));
      return hexToOklch(value);
    };
    const brand = hexToOklch(primary);
    const accent = set('accent', primary, brand);
    set('accentStrong', primary, { ...brand, l: accent.l });
    set('accentSoft', primary, {
      l: SOFT_SEED[scheme].l,
      c: Math.min(brand.c, SOFT_SEED[scheme].c),
      h: brand.h,
    });
    set('focus', primary, { ...brand, l: accent.l });
    set('chart1', primary, { ...brand, l: accent.l });
    if (secondary !== undefined) set('accent2', secondary, hexToOklch(secondary));
    schemeColors[scheme] = Object.fromEntries(
      roles.filter((role) => role.scheme === scheme).map((role) => [role.role, role.value]),
    );
  }
  const input: ThemeInput = {
    name,
    extends: parentName,
    description: `Brand theme over ${parentName}: ${primary} leads as the accent${secondary === undefined ? '' : `, ${secondary} marks the eyebrows`}.`,
    palette: `Brand ${primary} as the accent family (rules, links, focus, accent sections, first chart series)${secondary === undefined ? '' : ` and ${secondary} as the second accent for eyebrows`} on the ${parentName} palette; lightness shifted per scheme until every contrast pair passes.`,
    colors: schemeColors,
  };
  const problems = themeContrastProblems(applyThemeInput(parent, input, name));
  const [problem] = problems;
  if (problem !== undefined) {
    throw contrastError(problem.scheme, problem.foreground, problem.background, problem.minimum, {
      use: problem.use,
      ratio: problem.ratio,
    });
  }
  return { input, schemes, roles };
}

/**
 * Ближайшая к исходной светлота, при которой роль проходит все свои пары контраста. Проходит исходная —
 * цвет остаётся как есть; иначе светлота идёт к чёрному или к белому, в ту сторону, где сдвиг меньше.
 * Предикат считается на итоговом шестнадцатеричном коде, поэтому возвращённый цвет прошёл проверку сам, а
 * не его неокруглённый прообраз.
 */
function fitRole(
  colors: Readonly<Record<ThemeColorRole, string>>,
  role: ThemeColorRole,
  seed: Oklch,
  scheme: Scheme,
): string {
  const pairs = THEME_CONTRAST_PAIRS.filter(
    (pair) => pair.foreground === role || pair.background === role,
  );
  const failing = (l: number): { hex: string; failing: typeof pairs } => {
    const hex = oklchToHex({ ...seed, l });
    const trial = { ...colors, [role]: hex };
    return {
      hex,
      failing: pairs.filter(
        (pair) =>
          contrastRatio(trial, pair.foreground, pair.background, pair.foregroundShare) <
          pair.minimum,
      ),
    };
  };
  const start = failing(seed.l);
  if (start.failing.length === 0) return start.hex;
  const fits: { hex: string; distance: number }[] = [];
  for (const extreme of [0, 1]) {
    if (failing(extreme).failing.length > 0) continue;
    let fail = seed.l;
    let pass = extreme;
    for (let step = 0; step < 40; step += 1) {
      const middle = (fail + pass) / 2;
      if (failing(middle).failing.length === 0) pass = middle;
      else fail = middle;
    }
    fits.push({ hex: failing(pass).hex, distance: Math.abs(pass - seed.l) });
  }
  fits.sort((left, right) => left.distance - right.distance);
  const [best] = fits;
  if (best !== undefined) return best.hex;
  const [pair] = start.failing;
  if (pair === undefined) throw new Error('A refused role carries no pair.');
  throw contrastError(scheme, pair.foreground, pair.background, pair.minimum, { use: pair.use });
}

function describeRole(
  scheme: Scheme,
  role: ThemeColorRole,
  from: string,
  value: string,
): BrandThemeRole {
  const source = hexToOklch(from);
  const result = hexToOklch(value);
  // У серого тона нет: сравнивать тон имеет смысл, только когда оба цвета окрашены.
  const hueShift = source.c < 0.02 || result.c < 0.02 ? 0 : hueDistance(source.h, result.h);
  return {
    scheme,
    role,
    from,
    value,
    lightnessShift: Math.round((result.l - source.l) * 1000) / 1000,
    hueShift: Math.round(hueShift * 10) / 10,
  };
}

function contrastError(
  scheme: Scheme,
  foreground: ThemeColorRole,
  background: ThemeColorRole,
  minimum: number,
  extra: { readonly use: string; readonly ratio?: number },
): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'THEME_BRAND_CONTRAST',
    message: `No lightness of the brand colour lets ${foreground} on ${background} reach ${minimum}:1 in the ${scheme} scheme (${extra.use}).`,
    remediation:
      'Extend a built-in theme whose backgrounds leave room for the colour, or pass a different brand colour.',
    details: { scheme, foreground, background, minimum, ...extra },
  });
}

/** Имя темы из имени файла, как его выводит загрузчик темы; имя встроенной темы занято. */
function themeNameFor(file: string): string {
  const name = path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^[^a-z]+/u, '')
    .slice(0, 64);
  return name === '' || isBuiltInThemeName(name) ? 'brand' : name;
}

async function resolveThroughParent(file: string): Promise<string> {
  try {
    return path.join(await realpath(path.dirname(file)), path.basename(file));
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'THEME_OUTPUT_FAILED',
        message: 'The directory of the theme file does not exist or cannot be read.',
        remediation: 'Create the directory first, or choose a path in an existing directory.',
      },
      { cause: error },
    );
  }
}

async function requireAbsent(file: string): Promise<void> {
  try {
    await lstat(file);
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) return;
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'THEME_OUTPUT_FAILED',
        message: 'The theme file path could not be inspected safely.',
        remediation: 'Choose an absent path in a directory this process can read.',
      },
      { cause: error },
    );
  }
  throw outputExistsError(file);
}

function outputExistsError(file: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'THEME_OUTPUT_EXISTS',
    message: 'The theme file already exists.',
    remediation: 'Choose a new path with --output; an existing file is never overwritten.',
    details: { themePath: file },
  });
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
