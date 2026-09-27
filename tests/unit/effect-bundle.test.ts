import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { AgenticReportError } from '../../src/diagnostics.js';
import { bundleEffect, effectHostSelector } from '../../src/extensions/effect-bundle.js';
import type { EffectExtension } from '../../src/extensions/types.js';

const execFileAsync = promisify(execFile);
const fixture = path.resolve('tests/fixtures/effects/margin-mark');

function markExtension(overrides: Partial<EffectExtension> = {}): EffectExtension {
  return {
    kind: 'effect',
    name: 'margin-mark',
    description: 'A mark.',
    staticEquivalent: 'The sections.',
    manifestPath: path.join(fixture, 'extension.yaml'),
    examples: [path.join(fixture, 'example-essay.md'), path.join(fixture, 'example-landing.md')],
    licenses: [],
    module: path.join(fixture, 'effect.mjs'),
    targets: [{ directive: 'section', attribute: 'mark', values: ['ring', 'dot'] }],
    attributes: {},
    budgetBytes: 80_000,
    ownsScroll: false,
    ...overrides,
  };
}

async function diagnosticCode(action: Promise<unknown>): Promise<string | undefined> {
  try {
    await action;
    return undefined;
  } catch (error) {
    return error instanceof AgenticReportError ? error.diagnostic.code : String(error);
  }
}

describe('effect bundling', () => {
  it('refuses a bundle above its budget and reports the bytes of one within it', async () => {
    // Дефект: бюджет веса эффекта — совет, и тяжёлый эффект молча уезжает на страницу.
    const fitting = await bundleEffect(markExtension());
    expect(fitting.bytes).toBe(Buffer.byteLength(fitting.code));
    expect(
      await diagnosticCode(bundleEffect(markExtension({ budgetBytes: fitting.bytes - 1 }))),
    ).toBe('EXTENSION_EFFECT_OVER_BUDGET');
    expect(
      await diagnosticCode(bundleEffect(markExtension({ budgetBytes: fitting.bytes }))),
    ).toBeUndefined();
  });

  it('produces one import-free classic script that registers the effect with its local imports inlined', async () => {
    // Дефект: в скрипте остаётся `import`/`export` или ссылка на модуль рядом — страница под политикой
    // безопасности не загрузит его, и эффект молча не встанет. Классический скрипт с `import` не
    // компилируется вне модуля, поэтому `vm.Script` на нём падает.
    const { code } = await bundleEffect(markExtension());
    expect(() => new vm.Script(code)).not.toThrow();
    expect(() => new vm.Script('import x from "./place.mjs";')).toThrow();
    const sandbox: { __agenticReportEffects?: unknown[] } = {};
    vm.runInNewContext(code, sandbox);
    const queue = sandbox.__agenticReportEffects;
    expect(queue).toHaveLength(1);
    const [registration] = queue as [
      { name: string; selector: string; ownsScroll: boolean; definition: { mount: unknown } },
    ];
    expect(registration.name).toBe('margin-mark');
    expect(registration.selector).toBe(effectHostSelector(markExtension()));
    expect(registration.selector).toBe('[data-effect-margin-mark-mark]');
    expect(registration.ownsScroll).toBe(false);
    expect(typeof registration.definition.mount).toBe('function');
    // `placeMark` из соседнего модуля вошёл в скрипт: его текст виден внутри.
    expect(code).toContain('on-heading');
  });

  it('keeps declared licence texts and legal comments in the script', async () => {
    // Дефект: лицензия встроенного стороннего кода теряется при минификации.
    const directory = await mkdtemp(path.join(os.tmpdir(), 'effect-licence-'));
    try {
      await writeFile(
        path.join(directory, 'LICENSE-lib.txt'),
        'MIT License\nCopyright (c) Example',
      );
      await writeFile(
        path.join(directory, 'lib.mjs'),
        '/*! @license lib 1.0 MIT */\nexport const tint = (value) => value * 2;\n',
      );
      await writeFile(
        path.join(directory, 'effect.mjs'),
        "import { defineEffect } from 'agentic-report/effect';\nimport { tint } from './lib.mjs';\nexport default defineEffect({ mount: () => ({ at: (t) => tint(t) }) });\n",
      );
      const { code } = await bundleEffect(
        markExtension({
          manifestPath: path.join(directory, 'extension.yaml'),
          module: path.join(directory, 'effect.mjs'),
          licenses: ['LICENSE-lib.txt'],
        }),
      );
      expect(code).toContain('Copyright (c) Example');
      expect(code).toContain('@license lib 1.0 MIT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses package imports other than the effect entry, and explains a missing bundler', async () => {
    // Дефекты: эффект тянет Node-часть пакета на страницу; отсутствие двоичного файла esbuild роняет
    // сборку внутренней ошибкой вместо диагностики.
    const directory = await mkdtemp(path.join(os.tmpdir(), 'effect-import-'));
    try {
      await writeFile(
        path.join(directory, 'effect.mjs'),
        "import { buildReport } from 'agentic-report';\nexport default { mount: () => ({ at: () => buildReport }) };\n",
      );
      expect(
        await diagnosticCode(
          bundleEffect(
            markExtension({
              manifestPath: path.join(directory, 'extension.yaml'),
              module: path.join(directory, 'effect.mjs'),
            }),
          ),
        ),
      ).toBe('EXTENSION_EFFECT_BUNDLE_FAILED');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(
      await diagnosticCode(
        bundleEffect(markExtension(), {
          loader: () =>
            Promise.reject(new Error('The package "@esbuild/linux-x64" could not be found')),
        }),
      ),
    ).toBe('EXTENSION_BUNDLER_UNAVAILABLE');
  });
});

describe('the agentic-report/effect types', () => {
  // Дефект: публичные типы договора эффекта не описывают контекст, и автор узнаёт об ошибке только в
  // браузере. Образцовый эффект компилируется строгим `tsc` через подпуть пакета, а эффект с ошибками
  // типов — нет: без второй половины первая прошла бы и при пустых типах.
  const good = `import { defineEffect, type EffectRect } from 'agentic-report/effect';

export default defineEffect({
  continuous: false,
  mount(ctx) {
    const surface = ctx.canvas({ host: ctx.hosts[0] as HTMLElement, kind: '2d' });
    const gl = ctx.canvas({ host: ctx.hosts[0] as HTMLElement, kind: 'webgl' });
    const colour: string = ctx.tokens.read('--color-accent');
    const [r, g, b, a] = ctx.tokens.rgba('--color-accent');
    const off: () => void = ctx.tokens.onChange(() => ctx.rebuild('theme'));
    const lines: readonly EffectRect[] = ctx.measure.lines(ctx.hosts[0] as HTMLElement);
    const free = ctx.obstacles().free;
    const size = ctx.pick({ wide: 40, narrow: 24 });
    const random = ctx.random('seed');
    ctx.events.on('reach', ctx.hosts[0] as HTMLElement, () => ctx.state.set('reached', true));
    const mode: 'live' | 'still' | 'static' = ctx.render;
    return {
      at(t: number, progress: number) {
        surface.context.fillStyle = colour;
        surface.context.fillRect(t, progress, size * random(), lines.length + free.length);
        gl?.context.clearColor(r, g, b, a);
        void mode;
        void ctx.layout.svh;
        void ctx.clock.now();
      },
      unmount: off,
    };
  },
});
`;
  const bad = `import { defineEffect } from 'agentic-report/effect';

export default defineEffect({
  mount(ctx) {
    ctx.tokens.read('color-accent');
    const mode: 'paused' = ctx.render;
    const gl = ctx.canvas({ host: ctx.hosts[0] as HTMLElement, kind: 'webgl' });
    gl.context.clearColor(0, 0, 0, 0);
    return { at(t: string) { void t; void mode; } };
  },
});
`;

  it('compile an effect written against them and reject one that misuses them', async () => {
    const directory = path.resolve('test-results/effect-types');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'good.ts'), good);
    await writeFile(path.join(directory, 'bad.ts'), bad);
    const compile = (file: string) =>
      execFileAsync(
        path.resolve('node_modules/.bin/tsc'),
        [
          '--ignoreConfig',
          '--pretty',
          'false',
          '--noEmit',
          '--strict',
          '--exactOptionalPropertyTypes',
          '--noUncheckedIndexedAccess',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '--target',
          'es2022',
          '--lib',
          'es2022,dom',
          '--types',
          '',
          '--skipLibCheck',
          path.join(directory, file),
        ],
        { cwd: path.resolve('.') },
      ).then(
        () => ({ ok: true, output: '' }),
        (error: { stdout?: string }) => ({ ok: false, output: error.stdout ?? '' }),
      );
    const goodResult = await compile('good.ts');
    expect(goodResult.output).toBe('');
    expect(goodResult.ok).toBe(true);
    const badResult = await compile('bad.ts');
    expect(badResult.ok).toBe(false);
    // Каждая из четырёх ошибок поймана типами.
    expect(badResult.output).toMatch(/color-accent/u);
    expect(badResult.output).toMatch(/"paused"/u);
    expect(badResult.output).toMatch(/possibly 'null'/u);
    expect(badResult.output).toMatch(/Types of property 'at' are incompatible/u);
  });
});
