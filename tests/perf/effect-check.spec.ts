import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { effectCheck, EFFECT_CHECKS } from '../../dist/node/core/effect-check.js';
import { expect, test } from '../e2e/fixtures.js';

/**
 * `effect-check` проходит на образцовом эффекте, а на эффекте с посаженным
 * дефектом падает именно та проверка, которая этот дефект ловит. Без второй половины зелёный итог
 * ничего не доказывал бы: проверка, которая не падает на своём контрпримере, — не свидетельство.
 */

const FIXTURE = path.resolve('tests/fixtures/effects/margin-mark');

async function checkVariant(
  name: string,
  defects?: string,
  plant?: (source: string) => Promise<void>,
) {
  const root = path.resolve('test-results/e2e-effect-check', name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'source');
  await cp(FIXTURE, source, { recursive: true });
  if (defects !== undefined)
    await writeFile(
      path.join(source, 'effect.mjs'),
      `import { defineEffect } from 'agentic-report/effect';\nimport { createMark } from './mark.mjs';\nexport default defineEffect(createMark(${defects}));\n`,
    );
  await plant?.(source);
  return effectCheck({
    manifest: path.join(source, 'extension.yaml'),
    output: path.join(root, 'out'),
  });
}

function failed(result: Awaited<ReturnType<typeof effectCheck>>): string[] {
  return result.checks.filter((check) => !check.passed).map((check) => check.id);
}

test.describe.configure({ timeout: 180_000 });

test('a good effect passes all eleven checks', async ({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium');
  const result = await checkVariant('good');
  expect(result.total).toBe(EFFECT_CHECKS.length);
  expect(failed(result), JSON.stringify(result.checks, null, 2)).toEqual([]);
  expect(result.summary).toBe('11 of 11 checks passed');
});

for (const [name, defects, expected] of [
  // Свой `requestAnimationFrame`: время не от часов страницы, перемотка не повторяет кадр.
  ['own-timer', '{ ownTimer: true }', ['still', 'clock']],
  // Цвет, записанный в коде, а не взятый из темы.
  ['hard-colour', "{ colour: '#ff00aa' }", ['tokens']],
  // Метка поставлена на заголовок, а не в свободную область.
  ['over-text', "{ placement: 'on-heading' }", ['text']],
  // Без движения эффект продолжает жить во времени: итогового состояния нет.
  ['no-still', "{ time: 'clock' }", ['still']],
  // Дорогой кадр: при замедлении процессора вызов эффекта длится дольше 50 мс.
  ['slow-frame', '{ slow: true }', ['performance']],
  // Диагностический проход падает, но четыре обычных прохода уже доказали тот же медленный кадр.
  ['slow-diagnostic-throw', '{ slow: true, diagnosticThrow: true }', ['performance']],
  // Две метки на одном месте: детали эффекта наезжают друг на друга.
  ['overlapping-details', '{ doubleBadge: true }', ['widths']],
  // Эффект ставится один раз и падает, когда правка содержимого ставит его заново.
  ['mount-once', '{ mountOnce: true }', ['content']],
  // Состояние ставится только в живом режиме.
  ['live-only-state', '{ liveOnlyState: true }', ['states']],
  // Слой эффекта остаётся видимым в печати.
  ['printed-layer', '{ printedLayer: true }', ['print']],
] as const) {
  test(`a planted defect (${name}) fails exactly the check that catches it`, async ({
    browserName,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium');
    const result = await checkVariant(name, defects);
    expect(failed(result), JSON.stringify(result.checks, null, 2)).toEqual([...expected]);
    expect(result.summary).toBe(`${11 - expected.length} of 11 checks passed`);
    if (name === 'slow-frame') {
      // A confirmed slow effect gets an advisory profile; its four verdict passes stay unprofiled.
      const artifact = await readFile(
        path.resolve('test-results/e2e-effect-check/slow-frame/out/performance-diagnostics.json'),
        'utf8',
      );
      expect(artifact).not.toContain('CANARY_AUTHOR_TEXT');
      const diagnostics = JSON.parse(artifact) as {
        passes: Array<{
          role: string;
          phases: Array<{ name: string; builds: Array<Record<string, unknown>> }>;
          unassignedBuilds: Array<Record<string, unknown>>;
        }>;
      };
      expect(diagnostics.passes.map((pass) => pass.role)).toEqual([
        'effect',
        'baseline',
        'effect-confirmation',
        'baseline-confirmation',
        'effect-diagnostic',
      ]);
      for (const pass of diagnostics.passes.slice(0, 4))
        expect([...pass.unassignedBuilds, ...pass.phases.flatMap((phase) => phase.builds)]).toEqual(
          [],
        );
      const diagnostic = diagnostics.passes[4];
      const fields = ['durationMs', 'stages', 'startMs', 'width'];
      for (const [phaseName, width] of [
        ['resize-narrow', 768],
        ['resize-wide', 1280],
      ] as const) {
        const builds = diagnostic?.phases.find((phase) => phase.name === phaseName)?.builds ?? [];
        expect(builds.some((build) => build.width === width && Number(build.durationMs) > 0)).toBe(
          true,
        );
      }
      for (const build of [
        ...(diagnostic?.unassignedBuilds ?? []),
        ...(diagnostic?.phases.flatMap((phase) => phase.builds) ?? []),
      ]) {
        expect(Object.keys(build).sort()).toEqual(fields);
        // The fixture's own stage names survive; its text-valued and malformed stages do not.
        expect(Object.keys(build.stages as Record<string, unknown>).sort()).toEqual([
          'badge-paint',
          'layout',
        ]);
        expect(
          [
            build.startMs,
            build.durationMs,
            build.width,
            ...Object.values(build.stages as object),
          ].every((value) => typeof value === 'number' && Number.isFinite(value)),
        ).toBe(true);
      }
    }
    if (name === 'slow-diagnostic-throw') {
      // A hostile diagnostic value must not hide the independently confirmed performance failure.
      const artifact = await readFile(
        path.resolve(
          'test-results/e2e-effect-check/slow-diagnostic-throw/out/performance-diagnostics.json',
        ),
        'utf8',
      );
      expect(artifact).not.toContain('CANARY_PRIVATE_ERROR');
      expect(artifact).not.toContain('CANARY_AUTHOR_TEXT');
      const diagnostics = JSON.parse(artifact) as {
        diagnosticUnavailable?: boolean;
        passes: Array<{ role: string }>;
      };
      expect(diagnostics.diagnosticUnavailable).toBe(true);
      expect(diagnostics.passes.map((pass) => pass.role)).toEqual([
        'effect',
        'baseline',
        'effect-confirmation',
        'baseline-confirmation',
      ]);
    }
  });
}

test('planted defects of the declaration and the examples fail exactly their checks', async ({
  browserName,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium');
  // Код из пакета в сборке эффекта без файла лицензии в манифесте.
  const declaration = await checkVariant('third-party-without-licence', undefined, (source) =>
    writeFile(
      path.join(source, 'effect.mjs'),
      [
        "import { defineEffect } from 'agentic-report/effect';",
        "import { visit } from 'unist-util-visit';",
        "import { createMark } from './mark.mjs';",
        'const mark = createMark({});',
        'export default defineEffect({',
        '  mount(ctx) {',
        "    visit({ type: 'root', children: [] }, () => undefined);",
        '    return mark.mount(ctx);',
        '  },',
        '});',
        '',
      ].join('\n'),
    ),
  );
  expect(failed(declaration), JSON.stringify(declaration.checks, null, 2)).toEqual(['declaration']);
  expect(
    declaration.checks.find((check) => check.id === 'declaration')?.details.join('\n'),
  ).toMatch(
    /third-party code \([^)]*\bunist-util-visit\b[^)]*\) but licenses lists no licence file/u,
  );
  // Второй пример — тот же текст, что и первый: эффект подогнан под одну страницу.
  const examples = await checkVariant('same-examples', undefined, async (source) => {
    const essay = await readFile(path.join(source, 'example-essay.md'), 'utf8');
    await writeFile(path.join(source, 'example-landing.md'), essay);
  });
  expect(failed(examples), JSON.stringify(examples.checks, null, 2)).toEqual(['examples']);
});
