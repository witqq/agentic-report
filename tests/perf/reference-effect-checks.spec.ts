import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { effectCheck } from '../../dist/node/core/effect-check.js';
import { expect, test } from '../e2e/fixtures.js';

/**
 * The reference effects in `extensions/` pass all eleven `effect-check` checks, `loom` with either of its
 * examples as the checked page and `focus-frame` on its two unlike examples. The `performance` check among
 * them measures tasks against a 50 ms budget at 4× CPU slowdown, so these runs belong to the one-worker
 * `pnpm test:perf` suite and not to the parallel browser suite. A reference that regresses any check —
 * a timer of its own, a hard-coded colour, a slow frame — fails here with the id of that check.
 */

const EFFECTS = [
  { name: 'loom', states: ['weaving', 'woven'] },
  { name: 'focus-frame', states: undefined },
] as const;

/** A copy of the extension folder whose manifest checks the examples in the given order. */
async function copyWithOrder(name: string, reversed: boolean): Promise<string> {
  const root = path.resolve(
    'test-results/perf-reference-effects',
    `${name}-${reversed ? 'b' : 'a'}`,
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'source');
  await cp(path.resolve('extensions', name), source, { recursive: true });
  const manifest = path.join(source, 'extension.yaml');
  if (reversed) {
    const text = await readFile(manifest, 'utf8');
    await writeFile(
      manifest,
      text.replace(/examples: \[([^,\]]+), ([^\]]+)\]/u, 'examples: [$2, $1]'),
    );
  }
  return root;
}

test.describe.configure({ timeout: 240_000 });

for (const effect of EFFECTS)
  for (const reversed of effect.name === 'loom' ? [false, true] : [false])
    test(`${effect.name} passes all eleven checks with its ${reversed ? 'second' : 'first'} example checked`, async ({
      browserName,
    }) => {
      test.skip(browserName !== 'chromium');
      const root = await copyWithOrder(effect.name, reversed);
      const result = await effectCheck({
        manifest: path.join(root, 'source', 'extension.yaml'),
        output: path.join(root, 'out'),
      });
      expect(
        result.checks.filter((check) => !check.passed).map((check) => check.id),
        JSON.stringify(result.checks, null, 2),
      ).toEqual([]);
      expect(result.summary).toBe('11 of 11 checks passed');
      if (effect.states !== undefined) {
        const states = result.checks.find((check) => check.id === 'states')?.details ?? [];
        expect(states).toEqual([`states: ${effect.states.join(', ')}`]);
      }
    });
