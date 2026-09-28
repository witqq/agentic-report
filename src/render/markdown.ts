import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { Element, Root } from 'hast';
import { lookup as lookupMime } from 'mime-types';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import {
  bundledLanguages,
  createCssVariablesTheme,
  getSingletonHighlighter,
  isSpecialLang,
  type HighlighterGeneric,
  type LanguageRegistration,
} from 'shiki';
import { unified, type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  authoringRegistry,
  STILL_IMAGE_EXTENSIONS,
  type AuthoringRegistryDefinition,
  type DirectiveDefinition,
  type PageLocaleChoice,
} from '../authoring/registry.js';
import type {
  Diagnostic,
  OutputFormat,
  PageStructure,
  SourceDigest,
  SourceMapSegment,
} from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveLocalPath } from '../source/load-source.js';
import { rehypeFigureNumbers } from './figure-numbers.js';
import { rehypeHeadingFit } from './heading-fit.js';
import { rehypeLinkTargets } from './link-targets.js';
import { rehypeUiPrimitives } from './ui-primitives.js';
import { resolveSourceLocation } from '../source/source-map.js';
import type { ReviewTargetReference } from '../review/contract.js';
import { rehypeReviewTargets, remarkReviewTargets } from '../review/targets.js';
import {
  parseCodeTermMetadata,
  rehypeEnhanceDirectives,
  remarkSemanticDirectives,
} from './directives.js';
import type { NavigationItem } from './navigation.js';
import { rehypePageStructure, type PageStructureCollector } from './page-structure.js';
import {
  compatibilityRank,
  detectVideoCodec,
  formatClock,
  parseChapters,
  videoSourceType,
  type VideoChapter,
  type VideoCodec,
} from './video-media.js';
import { packageStrings } from '../localization.js';
import { remarkExtensionExpansions } from '../extensions/expand.js';
import { remarkPageData } from './page-data.js';
import type { PageData } from '../source/load-data.js';
import { createIslandCollector } from '../extensions/island.js';
import type { ProviderCache } from '../extensions/provider.js';
import {
  type EffectHostCount,
  rehypeCountEffectHosts,
  remarkCountEffectHosts,
} from '../extensions/targets.js';
import type { PageExtension } from '../extensions/types.js';
import { createPageVocabulary } from '../extensions/vocabulary.js';

export interface MarkdownRenderOptions {
  readonly language?: string;
  /** Компоновка страницы: презентация собирает титульный слайд из начала страницы. */
  readonly layout?: string;
  /** Уровень движения страницы из шапки: проверка секций сверяет с ним приёмы движения. */
  readonly motion?: string;
  readonly sourceRoot: string;
  readonly format: OutputFormat;
  readonly share?: boolean;
  readonly outputFilePath?: string;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly localeScope?: PageLocaleChoice;
  /** Расширения, которые объявила страница; без них словарь страницы — встроенный. */
  readonly extensions?: {
    readonly declared: readonly PageExtension[];
    readonly providerCache: ProviderCache;
  };
  /** Data files the page declared; without them the data phase does not run. */
  readonly data?: PageData;
}

/** Что расширения сделали в одном языковом варианте страницы. */
export interface MarkdownExtensionUsage {
  /** Использования составных блоков, поставщиков и островов по имени. */
  readonly uses: Readonly<Record<string, number>>;
  readonly effectHosts: Readonly<Record<string, EffectHostCount>>;
  /** Хеши скриптов документов островов: их разрешает CSP страницы. */
  readonly islandScriptHashes: readonly string[];
  readonly islandBytes: Readonly<Record<string, number>>;
}

export interface PreparedResourceFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
}

export interface MarkdownRenderResult {
  readonly html: string;
  readonly embeddedAssets: number;
  readonly externalAssets: number;
  readonly embeddedBytes: number;
  readonly fontCss: string;
  readonly warnings: readonly Diagnostic[];
  readonly resourceFiles: readonly PreparedResourceFile[];
  readonly sourceFiles: readonly string[];
  readonly resourceDigests: readonly SourceDigest[];
  readonly observedDirectives: readonly string[];
  readonly structure: Omit<PageStructure, 'layout' | 'motion'>;
  readonly neutralizedSourceLinks: number;
  readonly navigation: readonly NavigationItem[];
  readonly reviewTargets: readonly ReviewTargetReference[];
  readonly observedResources: {
    readonly images: number;
    readonly videos: number;
    readonly downloads: number;
    readonly fonts: number;
  };
  /** Есть, только когда страница объявила расширения. */
  readonly extensions?: MarkdownExtensionUsage;
}

interface AssetCollector {
  embeddedAssets: number;
  externalAssets: number;
  embeddedBytes: number;
  warnings: Diagnostic[];
  fontCss: string[];
  fontRoles: Set<string>;
  resourceFiles: Map<string, Buffer>;
  sourceFiles: Set<string>;
  resourceDigests: Map<string, string>;
  observedResources: { images: number; videos: number; downloads: number; fonts: number };
}

interface AssetPluginOptions extends MarkdownRenderOptions {
  readonly collector: AssetCollector;
}

const semanticSanitizeSchema = projectSemanticSanitizeSchema(authoringRegistry);

export function projectSemanticSanitizeSchema(
  registry: AuthoringRegistryDefinition,
): SanitizeSchema {
  const tagNames = [...(defaultSchema.tagNames ?? [])];
  const attributes: NonNullable<SanitizeSchema['attributes']> = {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'dataReviewTarget'],
  };
  const directivesByTag = new Map<string, DirectiveDefinition[]>();
  for (const directive of registry.directives) {
    const existing = directivesByTag.get(directive.sanitizer.tagName) ?? [];
    existing.push(directive);
    directivesByTag.set(directive.sanitizer.tagName, existing);
  }
  for (const [tagName, directives] of directivesByTag) {
    if (!tagNames.includes(tagName)) tagNames.push(tagName);
    const classPattern = new RegExp(
      `^(?:${directives.map((directive) => escapeRegExp(directive.sanitizer.className)).join('|')})$`,
      'u',
    );
    const semanticProperties = [
      ...new Set(directives.flatMap((directive) => directive.sanitizer.properties)),
    ];
    const baseAttributes = defaultSchema.attributes?.[tagName] ?? [];
    const baseClassValues = baseAttributes.flatMap((definition) =>
      Array.isArray(definition) && definition[0] === 'className' ? definition.slice(1) : [],
    );
    attributes[tagName] = [
      ...baseAttributes.filter(
        (definition) => !(Array.isArray(definition) && definition[0] === 'className'),
      ),
      ['className', ...baseClassValues, classPattern],
      ...semanticProperties,
    ];
  }
  // Телефон и SMS разрешены и в обычной ссылке текста — по тем же правилам номера, что у действий
  // (проверяет `rehypeLinkTargets`).
  const protocols = {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'tel', 'sms'],
  };
  return { ...defaultSchema, tagNames, attributes, protocols };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Ширина буквы шрифта заголовков, который принёс автор: пакет его не мерил, поэтому берёт ширину самой
 * широкой встроенной гарнитуры прописными — длинное слово такого заголовка не вылезет за колонку.
 */
const AUTHOR_HEADING_ADVANCE = 1;

/** Видео, которое браузеры играют сами, и тип, который объявляет `<source>`. */
const VIDEO_TYPES: Readonly<Record<string, string>> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.ogv': 'video/ogg',
};

function videoType(reference: string): string | undefined {
  const withoutQuery = reference.split(/[?#]/, 1)[0] ?? '';
  return VIDEO_TYPES[path.extname(withoutQuery).toLowerCase()];
}

/**
 * Подсветка кода красится темой страницы: токены получают не цвета, а переменные `--shiki-token-*`,
 * которые тема задаёт для каждой схемы (`src/render/theme-css.ts`). Поэтому код меняет палитру вместе
 * с темой и схемой, а собранный HTML от них не зависит.
 */
const CODE_THEME = createCssVariablesTheme({
  name: 'agentic-report',
  variablePrefix: '--shiki-',
  fontStyle: true,
});

/**
 * Подсветчик один на процесс и стартует без грамматик: компиляция всех встроенных грамматик Shiki
 * стоит секунды на каждый процесс, а отчёту нужны только грамматики его собственных блоков кода.
 */
let codeHighlighter: Promise<HighlighterGeneric<string, string>> | undefined;
const grammarLoads = new Map<string, Promise<void>>();

function sharedCodeHighlighter(): Promise<HighlighterGeneric<string, string>> {
  codeHighlighter ??= getSingletonHighlighter({
    themes: [CODE_THEME],
    langs: [],
  }) as Promise<HighlighterGeneric<string, string>>;
  return codeHighlighter;
}

interface GrammarIndex {
  /** Всякое имя, под которым полный набор регистрировал язык: id, псевдоним, имя грамматики. */
  readonly byName: ReadonlyMap<string, readonly LanguageRegistration[]>;
  /** Грамматика по своей области: так на неё ссылаются `include` других грамматик. */
  readonly byScope: ReadonlyMap<string, LanguageRegistration>;
  /** Грамматики-инъекции по области, в которую они встраивают свои правила. */
  readonly injectionsByScope: ReadonlyMap<string, readonly LanguageRegistration[]>;
}

let grammarIndex: Promise<GrammarIndex> | undefined;

/**
 * Метаданные всех встроенных грамматик без их компиляции. Импорт модулей дёшев; дорого только то,
 * что делает `loadLanguage`, и оно достаётся лишь грамматикам, которые нужны документу.
 */
function sharedGrammarIndex(): Promise<GrammarIndex> {
  grammarIndex ??= (async () => {
    const byName = new Map<string, LanguageRegistration[]>();
    const byScope = new Map<string, LanguageRegistration>();
    const injectionsByScope = new Map<string, LanguageRegistration[]>();
    const seen = new Set<LanguageRegistration>();
    const register = (name: string, grammars: readonly LanguageRegistration[]): void => {
      if (!byName.has(name)) byName.set(name, [...grammars]);
    };
    for (const [id, load] of Object.entries(bundledLanguages)) {
      const grammars = (await load()).default;
      register(id, grammars);
      for (const grammar of grammars) {
        if (seen.has(grammar)) continue;
        seen.add(grammar);
        register(grammar.name, [grammar]);
        if (!byScope.has(grammar.scopeName)) byScope.set(grammar.scopeName, grammar);
        for (const alias of grammar.aliases ?? []) register(alias, [grammar]);
        for (const scope of grammar.injectTo ?? []) {
          injectionsByScope.set(scope, [...(injectionsByScope.get(scope) ?? []), grammar]);
        }
      }
    }
    return { byName, byScope, injectionsByScope };
  })();
  return grammarIndex;
}

const includedScopeCache = new WeakMap<LanguageRegistration, readonly string[]>();

/** Внешние области, на которые правила грамматики ссылаются через `include`: `source.css#rule`. */
function includedScopes(grammar: LanguageRegistration): readonly string[] {
  const cached = includedScopeCache.get(grammar);
  if (cached !== undefined) return cached;
  const scopes = new Set<string>();
  const pending: unknown[] = [grammar];
  for (let value = pending.pop(); value !== undefined; value = pending.pop()) {
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        if (key === 'include' && typeof nested === 'string') {
          const scope = nested.split('#', 1)[0] ?? '';
          if (scope !== '' && !scope.startsWith('$')) scopes.add(scope);
        } else {
          pending.push(nested);
        }
      }
    }
  }
  const result = [...scopes];
  includedScopeCache.set(grammar, result);
  return result;
}

/**
 * Грамматики блоков вместе со всем, от чего зависит их подсветка: встроенными сразу и лениво
 * языками, областями из `include` и инъекциями в любую уже взятую область. Полный набор давал это
 * неявно; без замыкания блок `markdown` теряет YAML во frontmatter, `typescript` — CSS и HTML в
 * теговых шаблонах, а `jinja-html` — сами конструкции Jinja.
 */
function grammarClosure(index: GrammarIndex, languages: Iterable<string>): LanguageRegistration[] {
  const selected = new Map<string, LanguageRegistration>();
  const pending = [...languages].flatMap((language) => index.byName.get(language) ?? []);
  for (let grammar = pending.pop(); grammar !== undefined; grammar = pending.pop()) {
    if (selected.has(grammar.name)) continue;
    selected.set(grammar.name, grammar);
    for (const embedded of [
      ...(grammar.embeddedLangs ?? []),
      ...(grammar.embeddedLangsLazy ?? []),
    ]) {
      pending.push(...(index.byName.get(embedded) ?? []));
    }
    for (const scope of includedScopes(grammar)) {
      const included = index.byScope.get(scope);
      if (included !== undefined) pending.push(included);
    }
    // Shiki применяет к грамматике инъекции в каждый точечный префикс её области: `source.js.jsx`
    // получает и то, что встраивается в `source.js`.
    const scopeParts = grammar.scopeName.split('.');
    for (let length = 1; length <= scopeParts.length; length += 1) {
      const scope = scopeParts.slice(0, length).join('.');
      pending.push(...(index.injectionsByScope.get(scope) ?? []));
    }
  }
  return [...selected.values()];
}

/** Одна загрузка на грамматику для всех параллельных сборок; неудачная не остаётся в кеше. */
async function loadGrammars(
  highlighter: HighlighterGeneric<string, string>,
  grammars: readonly LanguageRegistration[],
): Promise<void> {
  const loaded = new Set(highlighter.getLoadedLanguages());
  const missing = grammars.filter(
    (grammar) => !loaded.has(grammar.name) && !grammarLoads.has(grammar.name),
  );
  if (missing.length > 0) {
    const load = highlighter.loadLanguage(...missing);
    for (const grammar of missing) grammarLoads.set(grammar.name, load);
    load.catch(() => {
      for (const grammar of missing) {
        if (grammarLoads.get(grammar.name) === load) grammarLoads.delete(grammar.name);
      }
    });
  }
  await Promise.all(grammars.map((grammar) => grammarLoads.get(grammar.name)));
}

/** Язык блока так же, как его читает `@shikijs/rehype`: класс `language-*` первого `code` в `pre`. */
function fenceLanguage(node: Element): string | undefined {
  const head = node.children[0];
  if (head?.type !== 'element' || head.tagName !== 'code') return undefined;
  const classes = head.properties.className;
  const languageClass = Array.isArray(classes)
    ? classes.find((value) => typeof value === 'string' && value.startsWith('language-'))
    : undefined;
  return typeof languageClass === 'string' ? languageClass.slice('language-'.length) : undefined;
}

/**
 * Догружает грамматики, нужные блокам документа, и подсвечивает без ленивого режима: блок с
 * неизвестным языком остаётся простым кодом, как и при полном наборе грамматик, а не роняет сборку.
 */
const rehypeHighlightCode: Plugin<[], Root> = () => async (tree, file) => {
  const languages = new Set<string>();
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'pre') return;
    const language = fenceLanguage(node);
    if (language !== undefined && !isSpecialLang(language)) languages.add(language);
  });
  const highlighter = await sharedCodeHighlighter();
  if (languages.size > 0) {
    await loadGrammars(highlighter, grammarClosure(await sharedGrammarIndex(), languages));
  }
  const highlight = rehypeShikiFromHighlighter(highlighter, {
    theme: CODE_THEME.name ?? 'agentic-report',
    parseMetaString: (metaString) => {
      const metadata = parseCodeTermMetadata(metaString);
      return metadata.kind === 'valid' ? { dataCodeTerms: metadata.keys.join(',') } : undefined;
    },
  });
  await highlight(tree, file, () => undefined);
};

type AssetTargetKind = 'image' | 'video' | 'asset' | 'font';

const rehypeAssets: Plugin<[AssetPluginOptions], Root> = (options) => async (tree) => {
  const targets: Array<{ readonly node: Element; readonly kind: AssetTargetKind }> = [];
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'img' && typeof node.properties.src === 'string') {
      // Картинка Markdown с видеофайлом становится плеером: `<img>` видео не показывает.
      targets.push({
        node,
        kind: videoType(node.properties.src) === undefined ? 'image' : 'video',
      });
      return;
    }
    if (node.tagName === 'figure' && typeof node.properties.dataVideoSource === 'string') {
      targets.push({ node, kind: 'video' });
      return;
    }
    if (node.tagName === 'a' && typeof node.properties.dataLocalAsset === 'string') {
      targets.push({ node, kind: 'asset' });
      return;
    }
    if (node.tagName === 'span' && typeof node.properties.dataFontSource === 'string') {
      targets.push({ node, kind: 'font' });
    }
  });
  for (const target of targets) {
    try {
      await processAssetTarget(target, options);
    } catch (error) {
      if (
        error instanceof AgenticReportError &&
        target.node.position?.start.offset !== undefined &&
        target.node.position.end.offset !== undefined
      ) {
        const source = resolveSourceLocation(
          options.sourceMap,
          target.node.position.start.offset,
          target.node.position.end.offset,
        );
        if (source !== undefined) {
          throw new AgenticReportError(
            {
              ...error.diagnostic,
              source,
              details: {
                ...error.diagnostic.details,
                reference: assetSource(target),
                ...(error.diagnostic.source?.file === undefined
                  ? {}
                  : { target: error.diagnostic.source.file }),
              },
            },
            { cause: error },
          );
        }
      }
      throw error;
    }
  }
};

export async function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions,
): Promise<MarkdownRenderResult> {
  const collector: AssetCollector = {
    embeddedAssets: 0,
    externalAssets: 0,
    embeddedBytes: 0,
    warnings: [],
    fontCss: [],
    fontRoles: new Set<string>(),
    resourceFiles: new Map(),
    sourceFiles: new Set(),
    resourceDigests: new Map(),
    observedResources: { images: 0, videos: 0, downloads: 0, fonts: 0 },
  };
  const observedDirectives = new Set<string>();
  const shareTransform = { neutralizedSourceLinks: 0 };
  const navigationTransform = { items: [] as NavigationItem[] };
  const reviewTargets: ReviewTargetReference[] = [];
  const structureCollector: PageStructureCollector = {};
  const declared = options.extensions?.declared ?? [];
  const islands = createIslandCollector();
  const vocabulary = declared.length === 0 ? undefined : createPageVocabulary(declared, islands);
  const earlierViolations: AgenticReportError[] = [];
  const expansionUses = new Map<string, number>();
  const effectHosts = new Map<string, EffectHostCount>();
  const effectHostOptions = { bindings: vocabulary?.effectTargets ?? [], counts: effectHosts };
  const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
  if (options.data !== undefined)
    pipeline.use(remarkPageData, {
      data: options.data,
      sourceMap: options.sourceMap,
      // One list for the phases before the directive phase, which reports them with its own.
      violations: earlierViolations,
      observedDirectives,
    });
  if (vocabulary !== undefined && options.extensions !== undefined)
    pipeline.use(remarkExtensionExpansions, {
      expansions: vocabulary.expansions,
      markdown,
      sourceMap: options.sourceMap,
      sourceRoot: options.sourceRoot,
      language: options.language,
      providerCache: options.extensions.providerCache,
      violations: earlierViolations,
      uses: expansionUses,
      ...(options.data === undefined ? {} : { data: options.data }),
    });
  const result = await pipeline
    .use(remarkSemanticDirectives, {
      sourceMap: options.sourceMap,
      markdown,
      observedDirectives,
      warnings: collector.warnings,
      page: { layout: options.layout, motion: options.motion, language: options.language },
      priorViolations: earlierViolations,
      ...(vocabulary === undefined ? {} : { vocabulary }),
    })
    .use(remarkCountEffectHosts, effectHostOptions)
    .use(remarkReviewTargets, {
      sourceRoot: options.sourceRoot,
      sourceMap: options.sourceMap,
      targets: reviewTargets,
    })
    .use(remarkRehype)
    .use(rehypeSanitize, vocabulary?.sanitizeSchema ?? semanticSanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeHighlightCode)
    .use(rehypeReviewTargets, {
      sourceRoot: options.sourceRoot,
      sourceMap: options.sourceMap,
      targets: reviewTargets,
    })
    .use(rehypeEnhanceDirectives, {
      sourceMap: options.sourceMap,
      share: options.share === true,
      shareTransform,
      navigationTransform,
      ...(options.language === undefined ? {} : { language: options.language }),
      ...(options.layout === undefined ? {} : { layout: options.layout }),
      ...(vocabulary === undefined ? {} : { vocabulary }),
    })
    .use(rehypePageStructure, structureCollector)
    .use(rehypeAssets, { ...options, collector })
    .use(rehypeUiPrimitives)
    .use(rehypeHeadingFit)
    .use(rehypeFigureNumbers)
    .use(rehypeLinkTargets, { sourceMap: options.sourceMap })
    .use(rehypeCountEffectHosts, effectHostOptions)
    .use(rehypeStringify)
    .process(markdown);

  return {
    html: String(result),
    embeddedAssets: collector.embeddedAssets,
    externalAssets: collector.externalAssets,
    embeddedBytes: collector.embeddedBytes,
    fontCss: collector.fontCss.join('\n'),
    warnings: collector.warnings,
    resourceFiles: [...collector.resourceFiles].map(([relativePath, bytes]) => ({
      relativePath,
      bytes,
    })),
    sourceFiles: [...collector.sourceFiles].sort(compareNames),
    resourceDigests: [...collector.resourceDigests]
      .map(([file, sha256]) => ({ file, sha256 }))
      .sort((left, right) => compareNames(left.file, right.file)),
    observedDirectives: [...observedDirectives].sort(compareNames),
    structure: structureCollector.structure ?? {
      beforeFirstSection: { images: 0, videos: 0, diagrams: 0, charts: 0, timelines: 0, code: 0 },
      sections: [],
      magneticActions: 0,
      movingElements: 0,
      cardGroups: [],
    },
    neutralizedSourceLinks: shareTransform.neutralizedSourceLinks,
    navigation: navigationTransform.items,
    reviewTargets,
    observedResources: collector.observedResources,
    ...(vocabulary === undefined
      ? {}
      : {
          extensions: {
            uses: Object.fromEntries([...expansionUses, ...islands.uses]),
            effectHosts: Object.fromEntries(effectHosts),
            islandScriptHashes: [...islands.scriptHashes].sort(compareNames),
            islandBytes: Object.fromEntries(islands.bytes),
          },
        }),
  };
}

async function processAssetTarget(
  target: { readonly node: Element; readonly kind: AssetTargetKind },
  options: AssetPluginOptions,
): Promise<void> {
  const source = assetSource(target);
  if (typeof source !== 'string') {
    return;
  }
  if (target.kind === 'video') {
    await processVideoTarget(target.node, source, options);
    return;
  }
  if (/^https?:\/\//i.test(source)) {
    throw new AgenticReportError({
      level: 'error',
      code: 'REMOTE_ASSET_BLOCKED',
      message: `Remote asset fetching is disabled: ${source}`,
      remediation: 'Download the asset into the report source directory and use a relative path.',
    });
  }
  if (isNonLocalReference(source)) {
    return;
  }
  const reference = await materializeLocalAsset(source, options);
  options.collector.sourceFiles.add(reference.sourcePath);
  options.collector.resourceDigests.set(reference.sourcePath, reference.sha256);
  if (options.format === 'single-file') {
    options.collector.embeddedAssets += 1;
    if (target.kind !== 'font') {
      options.collector.embeddedBytes += Buffer.byteLength(reference.url);
    }
  }
  if (target.kind === 'image') options.collector.observedResources.images += 1;
  else if (target.kind === 'asset') options.collector.observedResources.downloads += 1;
  else options.collector.observedResources.fonts += 1;
  if (target.kind === 'image') {
    target.node.properties.src = reference.url;
    return;
  }
  if (target.kind === 'asset') {
    target.node.properties.href = reference.url;
    delete target.node.properties.dataLocalAsset;
    return;
  }
  const family = target.node.properties.dataFontFamily;
  if (typeof family !== 'string') {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_FONT_DIRECTIVE',
      message: 'A font directive is missing its validated family.',
      remediation: 'Run `agentic-report schema` and fix the font directive.',
    });
  }
  const format = fontFormat(reference.extension);
  const cssUrl =
    options.format === 'directory' ? `./${path.basename(reference.url)}` : reference.url;
  const role = target.node.properties.dataFontRole;
  const fontRole = role === 'heading' || role === 'mono' ? role : 'body';
  // Первое объявление роли заменяет шрифт темы для этой роли; следующие только регистрируют шрифт.
  const activateFont = !options.collector.fontRoles.has(fontRole);
  options.collector.fontRoles.add(fontRole);
  const fontFamily =
    options.localeScope === undefined ? family : `${family}--agentic-${options.localeScope}`;
  const activationSelector =
    options.localeScope === undefined
      ? ':root'
      : `[data-localized-page-variant="${options.localeScope}"]`;
  options.collector.fontCss.push(
    `@font-face{font-family:${JSON.stringify(fontFamily)};src:url(${JSON.stringify(cssUrl)})${format === undefined ? '' : ` format(${JSON.stringify(format)})`};font-display:swap}${activateFont ? `${activationSelector}{--font-author-${fontRole}:${JSON.stringify(fontFamily)}${fontRole === 'heading' ? `;--display-advance-author:${AUTHOR_HEADING_ADVANCE}` : ''}}` : ''}`,
  );
  delete target.node.properties.dataFontSource;
  delete target.node.properties.dataFontFamily;
  delete target.node.properties.dataFontRole;
}

/**
 * Встраивает локальное видео как `<video>`: картинку Markdown с видеофайлом — плеером на её месте,
 * директиву `video` — плеером с подписью. Плеер беззвучный и зацикленный, с элементами управления;
 * запуск при появлении на экране и остановку по «меньше движения» делает runtime пакета по
 * `data-video-autoplay`, без скрипта видео запускают кнопкой.
 */
async function processVideoTarget(
  node: Element,
  source: string,
  options: AssetPluginOptions,
): Promise<void> {
  const authored = [
    ...(typeof node.properties.dataVideoSources === 'string'
      ? node.properties.dataVideoSources
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : []),
    source,
  ];
  // Источники — по порядку предпочтения автора, а `src` — последним, запасным.
  const candidates = await Promise.all(authored.map((reference) => probeVideo(reference, options)));
  const mode = node.tagName === 'img' ? 'clip' : String(node.properties.dataMode ?? 'clip');
  const chosen =
    options.format === 'single-file'
      ? [
          [...candidates].sort(
            (left, right) => compatibilityRank(left.codec) - compatibilityRank(right.codec),
          )[0] as VideoCandidate,
        ]
      : candidates;
  if (options.format === 'single-file' && candidates.length > 1) {
    const kept = chosen[0]?.reference ?? source;
    options.collector.warnings.push({
      level: 'warning',
      code: 'VIDEO_SOURCES_SINGLE_FILE',
      message: `One file embeds a single video source, ${kept}; the other ${candidates.length - 1} encoding(s) are left out.`,
      remediation:
        'Build with --format directory to let the browser choose among all sources, or keep only the most compatible one in the source.',
      details: {
        kept,
        dropped: candidates
          .filter((candidate) => candidate.reference !== kept)
          .map((candidate) => candidate.reference),
      },
    });
  }
  const sources: Element[] = [];
  for (const candidate of chosen) {
    const video = await materializeLocalAsset(candidate.reference, options);
    countEmbedded(video, options);
    sources.push({
      type: 'element',
      tagName: 'source',
      properties: { src: video.url, type: videoSourceType(candidate.baseType, candidate.codec) },
      children: [],
    });
  }
  const poster = node.properties.dataVideoPoster;
  let posterUrl: string | undefined;
  if (typeof poster === 'string') {
    const extension = path.extname(poster.split(/[?#]/, 1)[0] ?? '').toLowerCase();
    if (!STILL_IMAGE_EXTENSIONS.has(extension)) {
      throw new AgenticReportError({
        level: 'error',
        code: 'INVALID_VIDEO_SOURCE',
        message: `A video poster must be a .png, .jpg, .jpeg, .webp, .gif, or .avif image: ${poster}`,
        remediation: 'Export one frame of the recording as PNG or JPEG and point poster at it.',
      });
    }
    const posterReference = await materializeLocalAsset(poster, options);
    countEmbedded(posterReference, options);
    options.collector.observedResources.images += 1;
    posterUrl = posterReference.url;
  } else if (mode === 'background') {
    throw new AgenticReportError({
      level: 'error',
      code: 'VIDEO_POSTER_REQUIRED',
      message: `A background video needs a poster: ${source}`,
      remediation:
        'Add poster="…" with a still frame; it is what readers who prefer less motion, print, and slow connections see.',
    });
  }
  options.collector.observedResources.videos += 1;

  const strings = packageStrings(options.language);
  const caption =
    node.tagName === 'img'
      ? typeof node.properties.alt === 'string' && node.properties.alt.trim() !== ''
        ? node.properties.alt.trim()
        : undefined
      : typeof node.properties.dataVideoCaption === 'string'
        ? node.properties.dataVideoCaption
        : undefined;
  const chapters = await prepareChapters(node.properties.dataVideoChapters, options);
  // Начало петли и мягкий стык ведёт рантайм пакета: он возвращает ролик к началу петли сам.
  const loopStart = Number(node.properties.dataVideoStart ?? '0');
  const loopShape =
    mode === 'manual'
      ? {}
      : {
          ...(loopStart > 0 ? { dataVideoStart: String(loopStart) } : {}),
          ...(node.properties.dataSeam === 'fade' ? { dataVideoSeam: 'fade' } : {}),
        };
  const expandable = mode === 'clip' && node.properties.dataExpand === 'true';
  const tracks: Element[] =
    chapters === undefined
      ? []
      : [
          {
            type: 'element',
            tagName: 'track',
            properties: {
              kind: 'chapters',
              src: chapters.url,
              label: strings.videoChapters,
              default: true,
              ...(options.language === undefined ? {} : { srcLang: options.language }),
            },
            children: [],
          },
        ];
  const player: Element = {
    type: 'element',
    tagName: 'video',
    properties: {
      className: ['semantic-video-player'],
      playsInline: true,
      ...(mode === 'manual'
        ? { controls: true, preload: 'metadata' }
        : {
            muted: true,
            loop: true,
            preload: posterUrl === undefined ? 'metadata' : 'none',
            dataVideoAutoplay: '',
            ...(mode === 'clip' ? { controls: true } : { dataVideoBackground: '' }),
            ...loopShape,
          }),
      ...(posterUrl === undefined ? {} : { poster: posterUrl }),
      ...(caption === undefined ? {} : { ariaLabel: caption }),
    },
    children: [...sources, ...tracks],
  };
  if (node.tagName === 'img') {
    node.tagName = 'video';
    node.properties = player.properties;
    node.children = player.children;
    return;
  }
  const toggle: Element[] =
    mode === 'background'
      ? [
          {
            type: 'element',
            tagName: 'button',
            properties: {
              type: 'button',
              className: ['video-toggle'],
              dataVideoToggle: '',
              ariaPressed: 'false',
              ariaLabel: strings.pauseVideo,
            },
            children: [{ type: 'text', value: strings.pauseVideo }],
          },
        ]
      : [];
  const chapterList: Element[] =
    chapters === undefined
      ? []
      : [
          {
            type: 'element',
            tagName: 'ol',
            properties: { className: ['video-chapters'], ariaLabel: strings.videoChapters },
            children: chapters.list.map((chapter): Element => ({
              type: 'element',
              tagName: 'li',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'button',
                  properties: {
                    type: 'button',
                    className: ['video-chapter'],
                    dataVideoSeek: String(chapter.start),
                  },
                  children: [
                    {
                      type: 'element',
                      tagName: 'time',
                      properties: { dateTime: `PT${chapter.start}S` },
                      children: [{ type: 'text', value: formatClock(chapter.start) }],
                    },
                    { type: 'text', value: ` ${chapter.title}` },
                  ],
                },
              ],
            })),
          },
        ];
  const expand: Element[] = expandable
    ? [
        {
          type: 'element',
          tagName: 'button',
          properties: {
            type: 'button',
            className: ['video-expand', 'ui-button'],
            dataUiVariant: 'secondary',
            dataUiSize: 'sm',
            dataVideoExpand: '',
            ariaHasPopup: 'dialog',
          },
          children: [{ type: 'text', value: strings.expandVideo }],
        },
      ]
    : [];
  node.properties = { className: ['semantic-video'], dataMode: mode };
  node.children = [
    player,
    ...toggle,
    ...expand,
    ...chapterList,
    ...(caption === undefined
      ? []
      : [
          {
            type: 'element' as const,
            tagName: 'figcaption',
            properties: { className: ['semantic-video-caption'] },
            children: [{ type: 'text' as const, value: caption }],
          },
        ]),
  ];
}

interface VideoCandidate {
  readonly reference: string;
  readonly baseType: string;
  readonly codec: VideoCodec;
}

async function probeVideo(reference: string, options: AssetPluginOptions): Promise<VideoCandidate> {
  if (/^https?:\/\//i.test(reference)) {
    throw new AgenticReportError({
      level: 'error',
      code: 'REMOTE_ASSET_BLOCKED',
      message: `Remote asset fetching is disabled: ${reference}`,
      remediation: 'Download the video into the report source directory and use a relative path.',
    });
  }
  const baseType = videoType(reference);
  if (baseType === undefined) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_VIDEO_SOURCE',
      message: `A video must be a .webm, .mp4, .m4v, or .ogv file: ${reference}`,
      remediation:
        'Convert the recording to WebM or MP4 (Playwright recordVideo writes WebM) and point src at it.',
    });
  }
  const resource = await resolveLocalResource(reference, { ...options, format: 'directory' });
  const codec = detectVideoCodec(await readFile(resource.sourcePath), baseType);
  return { reference, baseType, codec };
}

async function prepareChapters(
  reference: unknown,
  options: AssetPluginOptions,
): Promise<{ readonly url: string; readonly list: readonly VideoChapter[] } | undefined> {
  if (typeof reference !== 'string') return undefined;
  if (path.extname(reference.split(/[?#]/, 1)[0] ?? '').toLowerCase() !== '.vtt') {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_VIDEO_CHAPTERS',
      message: `Video chapters must be a WebVTT .vtt file: ${reference}`,
      remediation:
        'Point chapters at the .chapters.vtt file agentic-screencast web writes next to the video.',
    });
  }
  const probe = await resolveLocalResource(reference, { ...options, format: 'directory' });
  const list = parseChapters(await readFile(probe.sourcePath, 'utf8'));
  if (list === undefined) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_VIDEO_CHAPTERS',
      message: `The chapters file is not WebVTT with a titled cue per chapter: ${reference}`,
      remediation: 'Start the file with WEBVTT and give every cue a start time and a title line.',
    });
  }
  // Дорожка из соседнего файла на `file://` для браузера чужая и не загружается: главы — несколько
  // строк текста, поэтому они всегда встроены данными.
  const resource = await materializeLocalAsset(reference, { ...options, format: 'single-file' });
  countEmbedded(resource, options);
  return { url: resource.url, list };
}

function countEmbedded(
  reference: { readonly url: string; readonly sourcePath: string; readonly sha256: string },
  options: AssetPluginOptions,
): void {
  options.collector.sourceFiles.add(reference.sourcePath);
  options.collector.resourceDigests.set(reference.sourcePath, reference.sha256);
  if (options.format === 'single-file') {
    options.collector.embeddedAssets += 1;
    options.collector.embeddedBytes += Buffer.byteLength(reference.url);
  }
}

function assetSource(target: {
  readonly node: Element;
  readonly kind: AssetTargetKind;
}): string | undefined {
  const source =
    target.kind === 'image' || (target.kind === 'video' && target.node.tagName === 'img')
      ? target.node.properties.src
      : target.kind === 'video'
        ? target.node.properties.dataVideoSource
        : target.kind === 'asset'
          ? target.node.properties.dataLocalAsset
          : target.node.properties.dataFontSource;
  return typeof source === 'string' ? source : undefined;
}

async function materializeLocalAsset(
  source: string,
  options: AssetPluginOptions,
): Promise<LocalResource> {
  const resource = await resolveLocalResource(source, options);
  if (resource.file !== undefined) {
    options.collector.resourceFiles.set(resource.file.relativePath, resource.file.bytes);
    options.collector.externalAssets += 1;
  }
  return resource;
}

export interface LocalResource {
  /** `data:` URL в single-file и относительный путь `assets/<имя>.<12 hex><расширение>` в directory. */
  readonly url: string;
  readonly extension: string;
  readonly sourcePath: string;
  readonly sha256: string;
  /** Файл, который directory-вывод положит рядом со страницей; в single-file его нет. */
  readonly file?: PreparedResourceFile;
}

/**
 * Одна дорога локального ресурса для содержимого и для метаданных страницы: ограничение корнем
 * источника, защита вывода от перезаписи источника, чтение, тип и имя с хешем содержимого.
 */
export async function resolveLocalResource(
  source: string,
  options: Pick<MarkdownRenderOptions, 'sourceRoot' | 'format' | 'outputFilePath'>,
): Promise<LocalResource> {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  if (withoutQuery === undefined || withoutQuery.length === 0) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_ASSET_REFERENCE',
      message: 'A local asset reference cannot be empty.',
      remediation: 'Provide a relative path to a file under the report source directory.',
    });
  }
  const assetPath = await resolveLocalPath(
    options.sourceRoot,
    withoutQuery,
    'ASSET_OUTSIDE_SOURCE',
  );
  if (options.outputFilePath === assetPath) {
    throw new AgenticReportError({
      level: 'error',
      code: 'OUTPUT_COLLIDES_WITH_SOURCE',
      message: `Output would overwrite a local report asset: ${assetPath}`,
      remediation: 'Choose an output path that is not an entry, manifest, partial, or local asset.',
      source: { file: assetPath },
      details: { output: options.outputFilePath },
    });
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(assetPath);
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'ASSET_READ_FAILED',
        message: `Could not read local asset: ${source}`,
        remediation: 'Fix the asset path or add the missing file under the source directory.',
        source: { file: assetPath },
      },
      { cause: error },
    );
  }
  const mime = lookupMime(assetPath) || 'application/octet-stream';
  const extension = path.extname(assetPath).toLowerCase();
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (options.format === 'single-file') {
    const url = `data:${mime};base64,${bytes.toString('base64')}`;
    return { url, extension, sourcePath: assetPath, sha256 };
  }

  const fileName = `${path.basename(assetPath, extension)}.${sha256.slice(0, 12)}${extension}`;
  const relativePath = `assets/${fileName}`;
  return {
    url: relativePath,
    extension,
    sourcePath: assetPath,
    sha256,
    file: { relativePath, bytes },
  };
}

function isNonLocalReference(reference: string): boolean {
  return /^(?:data:|#)/i.test(reference);
}

function fontFormat(extension: string): string | undefined {
  return (
    {
      '.woff2': 'woff2',
      '.woff': 'woff',
      '.ttf': 'truetype',
      '.otf': 'opentype',
    } as Readonly<Record<string, string>>
  )[extension];
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
