/**
 * The page's own script and stylesheet: the core runtime and the core stylesheet together with only the
 * features the page needs (`src/page-features.ts`), bundled by esbuild from the modules the package ships
 * in `dist/browser/modules` (`scripts/build-browser.ts`).
 *
 * The entry is generated from the selection in table order: feature modules first, so their slots are
 * filled when the runtime starts, then the runtime, then the scripts that start after it (the edition
 * layer, islands, the effect engine). The stylesheet is the core followed by the features' stylesheets
 * in the same order. With fixed options the bundle depends only on the selection, so a rebuild is
 * byte-identical; one process bundles each selection once.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGE_LOCALES } from '../authoring/registry.js';
import { AgenticReportError } from '../diagnostics.js';
import type { PackageLocale } from '../localization.js';
import {
  BROWSER_TARGETS,
  CORE_SCRIPT,
  CORE_STYLES,
  PAGE_FEATURES,
  type PageFeatureDefinition,
  type PageFeatureId,
} from '../page-features.js';

export interface PageAssets {
  readonly features: readonly PageFeatureId[];
  readonly locales: readonly PackageLocale[];
  readonly script: string;
  readonly styles: string;
}

interface EsbuildOutput {
  readonly outputFiles?: readonly { readonly text: string }[];
}
interface Esbuild {
  build(options: Record<string, unknown>): Promise<EsbuildOutput>;
}
interface EsbuildPluginBuild {
  onResolve(
    options: { readonly filter: RegExp },
    callback: (args: {
      readonly path: string;
      readonly resolveDir: string;
    }) => { readonly path: string; readonly namespace: string } | undefined,
  ): void;
  onLoad(
    options: { readonly filter: RegExp; readonly namespace: string },
    callback: () => {
      readonly contents: string;
      readonly loader: 'js';
      readonly resolveDir: string;
    },
  ): void;
}

let bundler: Promise<Esbuild> | undefined;
const bundles = new Map<string, Promise<PageAssets>>();

/** The browser modules shipped beside the installed package, never the working directory's. */
export function browserModulesRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.dirname(moduleDirectory)) === 'node'
    ? path.resolve(moduleDirectory, '../../browser/modules')
    : path.resolve(moduleDirectory, '../../dist/browser/modules');
}

function moduleFile(source: string): string {
  return `./${source.replace(/\.tsx?$/u, '.js')}`;
}

/** The generated entries of a selection, exposed for checks. */
export function pageAssetEntries(features: readonly PageFeatureId[]): {
  readonly script: string;
  readonly styles: string;
} {
  const selected: readonly PageFeatureDefinition[] = PAGE_FEATURES.filter((definition) =>
    features.includes(definition.id),
  );
  const imports = (after: boolean): string[] =>
    selected.flatMap((definition) =>
      definition.script === undefined || (definition.scriptAfterRuntime === true) !== after
        ? []
        : [`import ${JSON.stringify(moduleFile(definition.script))};`],
    );
  return {
    script: [
      ...imports(false),
      `import ${JSON.stringify(moduleFile(CORE_SCRIPT))};`,
      ...imports(true),
      '',
    ].join('\n'),
    styles: [...CORE_STYLES, ...selected.flatMap((definition) => definition.styles ?? [])]
      .map((file) => `@import ${JSON.stringify(`./${file}`)};`)
      .concat('')
      .join('\n'),
  };
}

/**
 * The page's bundle. `locales` are the package locales of its language variants: the page script
 * carries the package strings of those locales only.
 */
export function bundlePageAssets(
  features: readonly PageFeatureId[],
  locales: readonly PackageLocale[],
): Promise<PageAssets> {
  const pageLocales = PAGE_LOCALES.filter((locale) => locales.includes(locale));
  const key = `${features.join(',')}|${pageLocales.join(',')}`;
  let bundle = bundles.get(key);
  if (bundle === undefined) {
    bundle = bundleSelection(features, pageLocales);
    bundles.set(key, bundle);
    // A failure is not remembered: the next build tries again.
    bundle.catch(() => bundles.delete(key));
  }
  return bundle;
}

async function bundleSelection(
  features: readonly PageFeatureId[],
  locales: readonly PackageLocale[],
): Promise<PageAssets> {
  const esbuild = await loadBundler();
  const root = browserModulesRoot();
  try {
    await access(path.join(root, moduleFile(CORE_SCRIPT)));
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'PACKAGE_ASSET_MISSING',
        message: `Bundled browser modules are missing: ${root}`,
        remediation: 'Reinstall agentic-report or rebuild the package before running the CLI.',
      },
      { cause: error },
    );
  }
  const entries = pageAssetEntries(features);
  const common = {
    bundle: true,
    write: false,
    minify: true,
    target: [...BROWSER_TARGETS],
    charset: 'utf8',
    legalComments: 'inline',
    absWorkingDir: root,
    logLevel: 'silent',
  };
  const [script, styles] = await Promise.all([
    esbuild.build({
      ...common,
      stdin: { contents: entries.script, resolveDir: root, sourcefile: 'page.js', loader: 'js' },
      format: 'iife',
      platform: 'browser',
      plugins: [pageStrings(root, locales)],
    }),
    esbuild.build({
      ...common,
      stdin: { contents: entries.styles, resolveDir: root, sourcefile: 'page.css', loader: 'css' },
    }),
  ]);
  return {
    features,
    locales,
    script: onlyOutput(script),
    styles: onlyOutput(styles),
  };
}

const STRINGS_NAMESPACE = 'agentic-report-page-strings';
const LOCALE_MODULES: Readonly<
  Record<PackageLocale, { readonly file: string; readonly name: string }>
> = {
  en: { file: './localization/en.js', name: 'EN_STRINGS' },
  ru: { file: './localization/ru.js', name: 'RU_STRINGS' },
};

/**
 * The browser modules read package strings through `localization.js`, which holds every locale. In a
 * page bundle that module is replaced by one holding the page's locales; a locale the page does not
 * carry falls back to the first one it does, since every locale the runtime asks for is one of the
 * page's variants.
 */
function pageStrings(root: string, locales: readonly PackageLocale[]) {
  const facade = path.join(root, 'localization.js');
  const carried = locales.length === 0 ? (['en'] as const) : locales;
  const contents = [
    "import { resolvePackageLocale } from './localization/locale.js';",
    ...carried.map(
      (locale) =>
        `import { ${LOCALE_MODULES[locale].name} } from ${JSON.stringify(LOCALE_MODULES[locale].file)};`,
    ),
    `const strings = { ${carried.map((locale) => `${locale}: ${LOCALE_MODULES[locale].name}`).join(', ')} };`,
    `export function packageStrings(language) { return strings[resolvePackageLocale(language)] ?? ${LOCALE_MODULES[carried[0] ?? 'en'].name}; }`,
    '',
  ].join('\n');
  return {
    name: 'agentic-report-page-strings',
    setup(build: EsbuildPluginBuild): void {
      // Фильтры esbuild — регулярные выражения Go: флаг `u` они не принимают.
      build.onResolve({ filter: /(^|\/)localization\.js$/ }, (args) =>
        path.resolve(args.resolveDir, args.path) === facade
          ? { path: facade, namespace: STRINGS_NAMESPACE }
          : undefined,
      );
      build.onLoad({ filter: /.*/, namespace: STRINGS_NAMESPACE }, () => ({
        contents,
        loader: 'js',
        resolveDir: root,
      }));
    },
  };
}

function onlyOutput(result: EsbuildOutput): string {
  const [output, ...rest] = result.outputFiles ?? [];
  if (output === undefined || rest.length > 0)
    throw new Error('The page bundle did not produce exactly one output.');
  return output.text;
}

function loadBundler(): Promise<Esbuild> {
  bundler ??= (async () => {
    try {
      return (await import('esbuild')) as unknown as Esbuild;
    } catch (error) {
      bundler = undefined;
      throw new AgenticReportError(
        {
          level: 'error',
          code: 'PACKAGE_ASSET_MISSING',
          message: `The esbuild bundler that assembles page scripts and styles could not be loaded: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`,
          remediation:
            'Reinstall agentic-report so that its esbuild dependency and platform binary are present.',
        },
        { cause: error },
      );
    }
  })();
  return bundler;
}
