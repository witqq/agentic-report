import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_THEME_NAMES,
  resolveBuiltInTheme,
  type ThemeColorRole,
} from '../../src/authoring/themes.js';

const SHARED_FILE = path.resolve('src/authoring/shared-palettes.json');

/**
 * The same file, byte for byte, lives in agentic-screencast: the page and the film of one theme share these
 * colours. A change here must be sent there in the same form, and then this digest is updated in both
 * repositories. Catches an edit of the shared palettes made on one side only.
 */
const SHARED_FILE_SHA256 = '2bd98051d0ed727c3eec0ae887b35f99a6fbac3a27dbf746a7daa2b168da49ce';

/**
 * The role of a theme for each role name of the shared file (agentic-screencast `docs/theme-tokens.md`).
 * Written out here rather than imported, so a wrong mapping in the package fails the comparison below.
 */
const ROLES = {
  bg: 'background',
  surface: 'surface',
  'surface-raised': 'raised',
  heading: 'heading',
  text: 'text',
  'text-muted': 'textMuted',
  border: 'border',
  'border-strong': 'borderStrong',
  accent: 'accent',
  'accent-2': 'accent2',
  'accent-soft': 'accentSoft',
  'status-done': 'statusDone',
  'status-returned': 'statusReturned',
} as const satisfies Readonly<Record<string, ThemeColorRole>>;

type SharedScheme = Readonly<Record<string, unknown>>;
interface SharedFile {
  readonly version: number;
  readonly themes: Readonly<Record<string, Readonly<Record<'light' | 'dark', SharedScheme>>>>;
}

async function sharedFile(): Promise<{ readonly bytes: Buffer; readonly data: SharedFile }> {
  const bytes = await readFile(SHARED_FILE);
  return { bytes, data: JSON.parse(bytes.toString('utf8')) as SharedFile };
}

describe('palettes shared with agentic-screencast', () => {
  it('keeps the shared file identical to the copy in agentic-screencast', async () => {
    const { bytes, data } = await sharedFile();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHARED_FILE_SHA256);
    expect(data.version).toBe(1);
  });

  it('names exactly the built-in themes, each with both schemes and the thirteen shared roles', async () => {
    // Catches a theme added on one side only, and a role the page would silently not take.
    const { data } = await sharedFile();
    expect(Object.keys(data.themes).sort()).toEqual([...BUILT_IN_THEME_NAMES].sort());
    const keys = Object.keys(ROLES).sort();
    for (const [name, schemes] of Object.entries(data.themes))
      for (const scheme of ['light', 'dark'] as const)
        expect(
          Object.keys(schemes[scheme])
            .filter((key) => !key.startsWith('_'))
            .sort(),
          `${name}/${scheme}`,
        ).toEqual(keys);
  });

  it('draws every shared role of every built-in theme and scheme from the shared file', async () => {
    // Catches a built-in theme, a named accent or the role mapping overriding a shared colour, so the page
    // and the film of one theme drift apart.
    const { data } = await sharedFile();
    const drift: string[] = [];
    for (const name of BUILT_IN_THEME_NAMES) {
      const theme = resolveBuiltInTheme(name);
      expect(theme.scheme, name).toBe('both');
      for (const scheme of ['light', 'dark'] as const)
        for (const [key, role] of Object.entries(ROLES) as [
          string,
          (typeof ROLES)[keyof typeof ROLES],
        ][]) {
          const expected = data.themes[name]?.[scheme][key];
          const actual = theme.colors[scheme][role];
          if (actual !== expected)
            drift.push(`${name}/${scheme}/${role}: ${actual} instead of ${String(expected)}`);
        }
    }
    expect(drift).toEqual([]);
  });
});
