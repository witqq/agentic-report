/**
 * Упаковка эффекта уровня 2: ES-модуль автора и всё, что он импортирует, становятся одним классическим
 * скриптом без импортов, который регистрирует эффект в очереди движка страницы
 * (`globalThis.__agenticReportEffects`). Упаковщик — esbuild; он грузится лениво, только когда страница
 * объявила эффект, и его отсутствие даёт диагностику, а не падение пакета.
 *
 * Импорт `agentic-report/effect` заменяется тождественной `defineEffect`: эффект не тянет в страницу
 * Node-часть пакета. Лицензионные комментарии кода сохраняются, тексты объявленных лицензий кладутся в
 * начало скрипта. Скрипт тяжелее `budgetBytes` отвергается.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AgenticReportError } from '../diagnostics.js';
import { EFFECT_QUEUE_GLOBAL } from './effect-registration.js';
import type { BundledEffect, EffectExtension } from './types.js';

const EFFECT_ENTRY = 'agentic-report/effect';
const EFFECT_NAMESPACE = 'agentic-report-effect';

/** То, чем упаковка пользуется из esbuild: пакет грузит его лениво. */
interface EsbuildMessage {
  readonly text: string;
  readonly location?: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  } | null;
}
interface EsbuildResult {
  readonly outputFiles?: readonly { readonly text: string }[];
  readonly metafile?: {
    readonly inputs: Readonly<Record<string, unknown>>;
    readonly outputs: Readonly<
      Record<
        string,
        { readonly imports: readonly { readonly path: string; readonly external?: boolean }[] }
      >
    >;
  };
}
interface EsbuildPluginBuild {
  onResolve(
    options: { readonly filter: RegExp },
    callback: (args: {
      readonly path: string;
    }) => { path: string; namespace: string } | { errors: { text: string }[] },
  ): void;
  onLoad(
    options: { readonly filter: RegExp; readonly namespace: string },
    callback: () => { contents: string; loader: 'js' },
  ): void;
}
interface Esbuild {
  build(options: Record<string, unknown>): Promise<EsbuildResult>;
}

/** Загрузчик упаковщика; модульные тесты подменяют его, чтобы увидеть отказ без двоичного файла. */
export type EsbuildLoader = () => Promise<Esbuild>;

const loadEsbuild: EsbuildLoader = async () => (await import('esbuild')) as unknown as Esbuild;

export interface BundleEffectOptions {
  readonly loader?: EsbuildLoader;
}

/** Селектор хостов эффекта: элементы с любым из атрибутов его целей. */
export function effectHostSelector(extension: Pick<EffectExtension, 'name' | 'targets'>): string {
  const attributes = [...new Set(extension.targets.map((target) => target.attribute))];
  return attributes.map((attribute) => `[data-effect-${extension.name}-${attribute}]`).join(',');
}

export async function bundleEffect(
  extension: EffectExtension,
  options: BundleEffectOptions = {},
): Promise<BundledEffect & { readonly inputs: readonly string[] }> {
  return bundleEffectDetailed(extension, options);
}

/** Упаковка с входными файлами — `effect-check` ищет среди них сторонний код без лицензии. */
export async function bundleEffectDetailed(
  extension: EffectExtension,
  options: BundleEffectOptions = {},
): Promise<BundledEffect & { readonly inputs: readonly string[] }> {
  const esbuild = await requireEsbuild(options.loader ?? loadEsbuild, extension);
  const registration = [
    `import definition from ${JSON.stringify(extension.module)};`,
    `(globalThis.${EFFECT_QUEUE_GLOBAL} ??= []).push({`,
    `  name: ${JSON.stringify(extension.name)},`,
    `  selector: ${JSON.stringify(effectHostSelector(extension))},`,
    `  ownsScroll: ${extension.ownsScroll ? 'true' : 'definition?.ownsScroll === true'},`,
    '  definition,',
    '});',
  ].join('\n');
  const banner = await licenceBanner(extension);
  let result: EsbuildResult;
  try {
    result = await esbuild.build({
      stdin: {
        contents: registration,
        resolveDir: path.dirname(extension.module),
        sourcefile: `${extension.name}.effect-entry.js`,
        loader: 'js',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: ['es2022'],
      minify: true,
      legalComments: 'inline',
      charset: 'utf8',
      metafile: true,
      logLevel: 'silent',
      ...(banner === '' ? {} : { banner: { js: banner } }),
      plugins: [
        {
          name: 'agentic-report-effect',
          setup(build: EsbuildPluginBuild) {
            // Фильтры esbuild — регулярные выражения Go: флаг `u` они не принимают.
            build.onResolve({ filter: /^agentic-report(\/.*)?$/ }, (args) =>
              args.path === EFFECT_ENTRY
                ? { path: EFFECT_ENTRY, namespace: EFFECT_NAMESPACE }
                : {
                    errors: [
                      {
                        text: `An effect may import only "${EFFECT_ENTRY}" from the package, not "${args.path}".`,
                      },
                    ],
                  },
            );
            build.onLoad({ filter: /.*/, namespace: EFFECT_NAMESPACE }, () => ({
              contents: 'export function defineEffect(definition) { return definition; }',
              loader: 'js',
            }));
          },
        },
      ],
    });
  } catch (error) {
    const messages = (error as { errors?: readonly EsbuildMessage[] }).errors ?? [];
    const first = messages[0];
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_EFFECT_BUNDLE_FAILED',
      message: `Effect "${extension.name}" could not be bundled: ${first?.text ?? (error instanceof Error ? error.message : String(error))}`,
      remediation:
        'Fix the module so that it and every file it imports resolve locally; an effect may import only relative files, installed browser packages and "agentic-report/effect".',
      source:
        first?.location === undefined || first.location === null
          ? { file: extension.manifestPath }
          : {
              file: path.resolve(path.dirname(extension.module), first.location.file),
              line: first.location.line,
              column: first.location.column + 1,
            },
      details: { effect: extension.name, errors: messages.map((message) => message.text) },
    });
  }
  const code = result.outputFiles?.[0]?.text ?? '';
  const external = Object.values(result.metafile?.outputs ?? {})
    .flatMap((output) => output.imports)
    .filter((entry) => entry.external === true)
    .map((entry) => entry.path);
  if (external.length > 0)
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_EFFECT_BUNDLE_FAILED',
      message: `Effect "${extension.name}" keeps imports the page cannot load: ${external.join(', ')}.`,
      remediation:
        'Import modules statically with literal paths so they are bundled; a page runs offline under a content security policy and loads nothing at run time.',
      source: { file: extension.manifestPath },
      details: { effect: extension.name, external },
    });
  const bytes = Buffer.byteLength(code);
  if (bytes > extension.budgetBytes)
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_EFFECT_OVER_BUDGET',
      message: `Effect "${extension.name}" bundles to ${bytes} bytes, above its budget of ${extension.budgetBytes} bytes.`,
      remediation:
        'Drop dependencies the effect does not need, or raise budgetBytes in the extension manifest deliberately.',
      source: { file: extension.manifestPath },
      details: { effect: extension.name, bytes, budgetBytes: extension.budgetBytes },
    });
  return { name: extension.name, code, bytes, inputs: Object.keys(result.metafile?.inputs ?? {}) };
}

async function requireEsbuild(loader: EsbuildLoader, extension: EffectExtension): Promise<Esbuild> {
  try {
    const esbuild = await loader();
    if (typeof esbuild.build !== 'function') throw new Error('esbuild has no build function');
    return esbuild;
  } catch (error) {
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_BUNDLER_UNAVAILABLE',
      message: `Effect "${extension.name}" needs the esbuild bundler, and it could not be loaded: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      remediation:
        'Reinstall agentic-report so that esbuild fetches the binary for this platform (for example `npm install agentic-report --force`), or build the page without the effect.',
      source: { file: extension.manifestPath },
      details: { effect: extension.name },
    });
  }
}

/** Тексты объявленных лицензий — комментарием в начале скрипта. */
async function licenceBanner(extension: EffectExtension): Promise<string> {
  const texts = await Promise.all(
    extension.licenses.map(async (licence) => {
      const file = path.isAbsolute(licence)
        ? licence
        : path.resolve(path.dirname(extension.manifestPath), licence);
      return (await readFile(file, 'utf8')).trim();
    }),
  );
  return texts.map((text) => `/*! ${text.replaceAll('*/', '* /')} */`).join('\n');
}
