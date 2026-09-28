/**
 * The `theme` command: brand colours become an author theme whose every contrast pair passes. Each test
 * names the defect it catches.
 */
import { spawn } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { composeBrandTheme, parseBrandColors } from '../../src/authoring/brand-theme.js';
import { hexToOklch, hueDistance, oklchToHex } from '../../src/authoring/oklch.js';
import {
  contrastRatio,
  THEME_CONTRAST_PAIRS,
  themeContrastProblems,
} from '../../src/authoring/theme-contrast.js';
import {
  applyThemeInput,
  BASE_THEME,
  resolveBuiltInTheme,
  type ThemeInput,
} from '../../src/authoring/themes.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport, createBrandTheme } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
afterAll(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function workspace(name: string): Promise<string> {
  const created = await createTestWorkspace(name);
  workspaces.push(created);
  return created;
}

async function refusal(run: () => unknown): Promise<AgenticReportError['diagnostic']> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AgenticReportError) return error.diagnostic;
    throw error;
  }
  throw new Error('Expected a refusal.');
}

function resolved(input: ThemeInput) {
  return applyThemeInput(resolveBuiltInTheme('neutral'), input, input.name ?? 'brand');
}

describe('OKLCH conversion', () => {
  it('round-trips sRGB colours exactly', () => {
    // Catches a wrong matrix or transfer function: the colour written back would differ from the brand.
    for (const hex of [
      '#0b5fff',
      '#ff7a00',
      '#ffee00',
      '#00c2ff',
      '#151514',
      '#f5f5f3',
      '#808080',
    ]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
    expect(hexToOklch('#fff').l).toBeCloseTo(1, 4);
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 4);
  });

  it('keeps the hue when chroma does not fit sRGB at the new lightness', () => {
    // Catches channel clipping: clipping an out-of-gamut yellow shifts its hue toward green or orange.
    const yellow = hexToOklch('#ffee00');
    const dark = hexToOklch(oklchToHex({ ...yellow, l: 0.45 }));
    expect(dark.l).toBeCloseTo(0.45, 2);
    expect(hueDistance(dark.h, yellow.h)).toBeLessThan(3);
  });
});

describe('composing a brand theme', () => {
  it('passes every contrast pair in both schemes', () => {
    // Catches a composed theme the build would refuse: every pair is measured with the compiler's own
    // contrast function on the resolved theme.
    const composed = composeBrandTheme(
      ['#0b5fff', '#ff7a00'],
      resolveBuiltInTheme('neutral'),
      'neutral',
      'brand',
    );
    const theme = resolved(composed.input);
    expect(themeContrastProblems(theme)).toEqual([]);
    for (const scheme of ['light', 'dark'] as const) {
      for (const pair of THEME_CONTRAST_PAIRS) {
        expect(
          contrastRatio(
            theme.colors[scheme],
            pair.foreground,
            pair.background,
            pair.foregroundShare,
          ),
        ).toBeGreaterThanOrEqual(pair.minimum);
      }
    }
    expect(composed.schemes).toEqual(['light', 'dark']);
    expect(Object.keys(composed.input.colors?.light ?? {}).sort()).toEqual(
      ['accent', 'accent2', 'accentSoft', 'accentStrong', 'chart1', 'focus'].sort(),
    );
  });

  it('shifts a colour that fails as given, keeps its hue, and moves it no further than needed', () => {
    // The counterexample first: yellow placed in the accent roles as given is refused by the build.
    const naive = resolved({
      extends: 'neutral',
      colors: {
        light: { accent: '#ffee00', accentStrong: '#ffee00', focus: '#ffee00' },
      },
    });
    expect(themeContrastProblems(naive).length).toBeGreaterThan(0);

    const composed = composeBrandTheme(
      ['#ffee00', '#00c2ff'],
      resolveBuiltInTheme('neutral'),
      'neutral',
      'brand',
    );
    // Catches a solver that returns the brand colour unchanged, or one that changes the hue.
    expect(themeContrastProblems(resolved(composed.input))).toEqual([]);
    const lightAccent = composed.roles.find(
      (role) => role.scheme === 'light' && role.role === 'accent',
    );
    expect(lightAccent?.value).not.toBe('#ffee00');
    expect(lightAccent?.lightnessShift).toBeLessThan(0);
    expect(composed.roles.filter((role) => role.hueShift > 3)).toEqual([]);
    // Catches a solver that jumps to black: a little less shift than it chose no longer passes.
    const accent = hexToOklch(lightAccent?.value ?? '');
    const lighter = oklchToHex({ ...hexToOklch('#ffee00'), l: accent.l + 0.01 });
    const colors = { ...resolveBuiltInTheme('neutral').colors.light, accent: lighter };
    expect(contrastRatio(colors, 'accent', 'background')).toBeLessThan(3);
  });

  it('keeps a brand colour that already passes', () => {
    // Catches a solver that moves every colour: cobalt on the dark graphite already reaches 3:1.
    const composed = composeBrandTheme(
      ['#0b5fff'],
      resolveBuiltInTheme('neutral'),
      'neutral',
      'brand',
    );
    const darkAccent = composed.roles.find(
      (role) => role.scheme === 'dark' && role.role === 'accent',
    );
    expect(darkAccent).toMatchObject({ value: '#0b5fff', lightnessShift: 0, hueShift: 0 });
    expect(composed.input.colors?.light).not.toHaveProperty('accent2');
  });

  it('draws only the dark scheme over a dark-only theme', () => {
    // Catches light colours written for `terminal`, whose light scheme is never drawn.
    const composed = composeBrandTheme(
      ['#0b5fff'],
      resolveBuiltInTheme('terminal'),
      'terminal',
      'brand',
    );
    expect(composed.schemes).toEqual(['dark']);
    expect(composed.input.colors?.light).toBeUndefined();
  });

  it('names the pair when no lightness can pass', () => {
    // Catches a silent best effort: links must read on a white page and on black surfaces at once,
    // which no single colour does, and the refusal names that pair.
    const impossible = applyThemeInput(
      BASE_THEME,
      { colors: { light: { background: '#ffffff', surface: '#000000' } } },
      'impossible',
    );
    const diagnostic = (() => {
      try {
        composeBrandTheme(['#0b5fff'], impossible, 'neutral', 'brand');
      } catch (error) {
        if (error instanceof AgenticReportError) return error.diagnostic;
        throw error;
      }
      throw new Error('Expected a refusal.');
    })();
    expect(diagnostic).toMatchObject({
      code: 'THEME_BRAND_CONTRAST',
      details: { scheme: 'light', foreground: 'accentStrong', minimum: 4.5 },
    });
    expect(diagnostic.message).toContain('accentStrong on');
  });
});

describe('refused input', () => {
  it('accepts only one or two opaque #rgb or #rrggbb colours', async () => {
    // Catches a colour the theme schema would take but the brand maths cannot (translucent, named),
    // and a third colour that no role would receive.
    expect(parseBrandColors(' #0B5FFF , #f70 ')).toEqual(['#0b5fff', '#f70']);
    for (const value of ['red', '#12345', '#0b5fff80', 'transparent', '', '#111,#222,#333']) {
      expect(await refusal(() => parseBrandColors(value))).toMatchObject({
        code: 'THEME_COLORS_INVALID',
      });
    }
  });

  it('refuses an unknown parent theme, a foreign extension and an existing file', async () => {
    // Catches an overwritten file: the existing bytes stay as they were.
    const directory = await workspace('brand-theme-refusals');
    expect(
      await refusal(() => createBrandTheme({ colors: '#0b5fff', extends: 'bogus' })),
    ).toMatchObject({ code: 'THEME_EXTENDS_UNKNOWN' });
    expect(
      await refusal(() =>
        createBrandTheme({ colors: '#0b5fff', output: path.join(directory, 'theme.css') }),
      ),
    ).toMatchObject({ code: 'THEME_OUTPUT_INVALID' });
    const existing = path.join(directory, 'brand.yaml');
    await writeFile(existing, 'keep: me\n');
    expect(
      await refusal(() => createBrandTheme({ colors: '#0b5fff', output: existing })),
    ).toMatchObject({ code: 'THEME_OUTPUT_EXISTS' });
    expect(await readFile(existing, 'utf8')).toBe('keep: me\n');
  });
});

describe('the written theme', () => {
  it('builds the document example', async () => {
    // Catches a file the loader refuses (a field, a name, a contrast pair) even though the
    // composition passed in memory: the real build reads the real file.
    const directory = await workspace('brand-theme-build');
    const source = path.join(directory, 'document');
    await cp(path.resolve('examples/document'), source, { recursive: true });
    const result = await createBrandTheme({
      colors: '#ffee00,#00c2ff',
      output: path.join(source, 'brand-theme.yaml'),
    });
    const written = parse(await readFile(result.themePath, 'utf8')) as ThemeInput;
    expect(written).toMatchObject({ name: 'brand-theme', extends: 'neutral' });
    const report = path.join(source, 'report.md');
    const text = await readFile(report, 'utf8');
    const themed = text.replace(/^theme:\n(?: {2}.*\n)+/mu, 'theme: brand-theme.yaml\n');
    expect(themed).not.toBe(text);
    await writeFile(report, themed);
    const built = await buildReport({ input: source, output: path.join(directory, 'page.html') });
    const html = await readFile(built.outputPath, 'utf8');
    const accent = written.colors?.light?.accent ?? '';
    expect(accent).toMatch(/^#[0-9a-f]{6}$/u);
    expect(html).toContain(accent);
  }, 60_000);

  it('answers the CLI with one result record, and with prose under --human', async () => {
    // Catches a command the CLI does not route or whose record drops the roles.
    const directory = await workspace('brand-theme-cli');
    const machine = await runCli([
      'theme',
      '--colors',
      '#0b5fff,#ff7a00',
      '--extends',
      'frost',
      '--output',
      path.join(directory, 'acme.yaml'),
    ]);
    expect(machine).toMatchObject({ exitCode: 0, stderr: '' });
    const record = JSON.parse(machine.stdout) as {
      type: string;
      name: string;
      extends: string;
      roles: unknown[];
    };
    expect(record).toMatchObject({ type: 'result', name: 'acme', extends: 'frost' });
    expect(record.roles.length).toBe(12);

    const human = await runCli([
      'theme',
      '--colors',
      '#0b5fff',
      '--output',
      path.join(directory, 'human.yaml'),
      '--human',
    ]);
    expect(human).toMatchObject({ exitCode: 0, stderr: '' });
    expect(human.stdout).toMatch(/^Created .*human\.yaml \(theme human, extends neutral\)\n/u);

    const refused = await runCli(['theme', '--colors', 'blue', '--output', 'x.yaml']);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      type: 'diagnostic',
      code: 'THEME_COLORS_INVALID',
    });
  }, 30_000);
});

async function runCli(
  arguments_: readonly string[],
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment.NO_COLOR;
    delete environment.FORCE_COLOR;
    const child = spawn(process.execPath, [path.resolve('dist/node/cli.js'), ...arguments_], {
      env: environment,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
