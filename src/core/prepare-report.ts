import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePublicUrl, publicUrlProblem } from '../authoring/public-url.js';
import {
  OUTPUT_FORMATS,
  PUBLIC_PAGE_CONTRACT,
  runtimePlacementForFormat,
  type PageLocaleChoice,
  type RuntimePlacement,
} from '../authoring/registry.js';
import type {
  BuildManifestDefaults,
  Diagnostic,
  OutputFormat,
  SourceDocument,
  SourceVariantDocument,
} from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { bindReviewArtifact, type ResolvedReviewArtifact } from '../review/binding.js';
import {
  MAX_REVIEW_FILE_BYTES,
  parseReviewArtifact,
  ReviewContractError,
  type ReviewArtifact,
  type ReviewTargetManifest,
} from '../review/contract.js';
import { ReviewLocaleRoutingError, selectReviewLocaleVariant } from '../review/routing.js';
import { createReviewTargetManifest } from '../review/targets.js';
import { renderDocument, type DocumentPageVariantOptions } from '../render/document.js';
import {
  renderMarkdown,
  resolveLocalResource,
  type MarkdownRenderResult,
  type PreparedResourceFile,
} from '../render/markdown.js';
import { openGraphLocale, type PublicPageMetadata } from '../render/public-page.js';
import { shareRepeatedImages } from '../render/shared-images.js';
import { themeFontFaces, themeFontFiles, themeStylesheet } from '../render/theme-css.js';
import {
  BUILT_IN_THEME_NAMES,
  isBuiltInThemeName,
  resolveBuiltInTheme,
} from '../authoring/themes.js';
import { loadSource, resolveLocalPath } from '../source/load-source.js';
import { assembleExtensions } from '../extensions/assembly.js';
import { ISLAND_STYLES } from '../extensions/island.js';
import { createProviderCache, type ProviderCache } from '../extensions/provider.js';
import type { ExtensionBuildReport, PageExtension } from '../extensions/types.js';
import type { DocumentRuntime } from '../render/document.js';
import type { EditionChanges, ReportManifest } from '../contracts.js';
import type { EditionLayer, EditionPassOptions } from '../edition/decorate.js';
import {
  EDITION_RECORD_VERSION,
  MAX_EDITION_RECORD_BYTES,
  type EditionRecord,
} from '../edition/record.js';
import { readSinceEdition, type SinceEdition } from '../edition/read-since.js';
import { type PageFeatureId, resolvePageFeatures } from '../page-features.js';
import { bundlePageAssets } from './page-assets.js';
import { resolvePackageLocale } from '../localization.js';

export interface PrepareReportOptions {
  readonly input: string;
  readonly manifestDefaults?: BuildManifestDefaults;
  readonly format?: OutputFormat;
  readonly output?: string;
  readonly publication?: true;
  readonly review?: string;
  readonly share?: boolean;
  readonly url?: string;
  /** Прошлая редакция: собранная страница или её исходник. */
  readonly since?: string;
}

export interface PreparedPageVariant {
  readonly locale: PageLocaleChoice;
  readonly primary: boolean;
  readonly source: SourceVariantDocument;
  readonly markdown: MarkdownRenderResult;
  readonly reviewManifest: ReviewTargetManifest;
  readonly priorReview?: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
  /** Запись редакции этой языковой версии; есть у каждой, кроме публичной страницы с `url`. */
  readonly editionRecord: EditionRecord;
  /** Слой изменений относительно прошлой редакции; есть только с `since`. */
  readonly editionLayer?: EditionLayer;
}

export interface PreparedReport {
  readonly source: SourceDocument;
  readonly variants: readonly [PreparedPageVariant, ...PreparedPageVariant[]];
  readonly format: OutputFormat;
  readonly runtimePlacement: RuntimePlacement;
  readonly outputPath?: string;
  readonly html: string;
  readonly contentHash: string;
  readonly share: boolean;
  readonly neutralizedSourceLinks: number;
  readonly embeddedAssets: number;
  readonly externalAssets: number;
  readonly warnings: readonly Diagnostic[];
  readonly resourceFiles: readonly PreparedResourceFile[];
  readonly observedDirectives: readonly string[];
  readonly observedResources: MarkdownRenderResult['observedResources'];
  readonly resourceSourceFiles: readonly string[];
  readonly reviewManifest: ReviewTargetManifest;
  /** Возможности страницы, чьи скрипты и стили она несёт (`src/page-features.ts`), в порядке таблицы. */
  readonly pageFeatures: readonly PageFeatureId[];
  readonly priorReview?: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
  /** Отчёт о расширениях страницы; нет, когда страница их не объявила. */
  readonly extensions?: readonly ExtensionBuildReport[];
  /** Что изменилось с прошлой редакции (основная языковая версия); есть только с `since`. */
  readonly changes?: EditionChanges;
}

export async function prepareReport(options: PrepareReportOptions): Promise<PreparedReport> {
  const source = await loadSource(options.input, options.manifestDefaults);
  const format = options.format ?? source.manifest.output.format;
  const runtimePlacement = runtimePlacementForFormat(format);
  const outputPath =
    options.publication === true
      ? resolveOutputPath(
          options.output ?? (format === 'single-file' ? 'report.html' : 'report-artifact'),
        )
      : undefined;
  const collisionTargetPath =
    outputPath === undefined ? undefined : await resolveOutputTarget(outputPath);
  const outputFilePath = format === 'single-file' ? collisionTargetPath : undefined;
  if (collisionTargetPath !== undefined)
    await assertOutputDoesNotCollide(collisionTargetPath, source.sourceFiles);

  const sourceVariants: readonly {
    readonly locale: PageLocaleChoice;
    readonly primary: boolean;
    readonly source: SourceVariantDocument;
  }[] = [
    { locale: source.locale, primary: true, source },
    ...source.localizations.map((localized) => ({
      locale: localized.locale,
      primary: false,
      source: localized,
    })),
  ];
  const declaredExtensions = source.extensions?.extensions ?? [];
  const providerCache = createProviderCache();
  // Прошлая редакция читается до сборки и до записи новой страницы: путь может совпадать с `--output`.
  const since =
    options.since === undefined
      ? undefined
      : await readSinceEdition(options.since, source.sourceFiles, readSourceEditions);
  const editionWarnings: Diagnostic[] = [];
  const preparedVariants: readonly PreparedPageVariant[] = await Promise.all(
    sourceVariants.map(async (variant) => ({
      ...variant,
      ...(await preparePageVariant(
        variant.source,
        format,
        options.share === true,
        outputFilePath,
        sourceVariants.length > 1 ? variant.locale : undefined,
        declaredExtensions,
        providerCache,
        variant.locale,
        previousEditionFor(since, variant.locale, editionWarnings),
      )),
    })),
  );
  const variants = requirePreparedVariants(preparedVariants);

  const allResourceSourceFiles = unique(
    variants.flatMap((variant) => variant.markdown.sourceFiles),
  );
  const priorReviewFile =
    options.review === undefined
      ? undefined
      : await resolveLocalPath(source.sourceRoot, options.review, 'REVIEW_OUTSIDE_SOURCE');
  if (priorReviewFile !== undefined)
    await assertPriorReviewDoesNotCollide(priorReviewFile, [
      ...source.sourceFiles,
      ...allResourceSourceFiles,
    ]);
  const priorArtifact =
    priorReviewFile === undefined ? undefined : await readPriorReview(priorReviewFile);
  const routedVariants =
    priorArtifact === undefined ? variants : routePriorReview(priorArtifact, variants);
  const routedPrior = routedVariants.find((variant) => variant.priorReview)?.priorReview;
  assertTopbarControls(source.manifest, routedPrior !== undefined);

  const socialImage =
    source.manifest.image === undefined
      ? undefined
      : await resolveSocialImage(source.manifest.image, source.sourceRoot, format, outputFilePath);

  if (collisionTargetPath !== undefined)
    await assertOutputDoesNotCollide(collisionTargetPath, [
      ...source.sourceFiles,
      ...allResourceSourceFiles,
      ...(socialImage === undefined ? [] : [socialImage.sourcePath]),
      ...(priorReviewFile === undefined ? [] : [priorReviewFile]),
    ]);

  const extensionAssembly =
    source.extensions === undefined
      ? undefined
      : await assembleExtensions(
          declaredExtensions,
          routedVariants.map((variant) => variant.markdown.extensions),
        );
  // Движок эффектов едет только на страницу с эффектом расширения, а контроллер островов —
  // только туда, где стоит живой остров.
  const usesEffects = (extensionAssembly?.effects.length ?? 0) > 0;
  const usesIslands = extensionAssembly?.usesIslands === true;
  // Слой изменений едет только на страницу, собранную с `--since`, у которой он запечён.
  const usesEditionLayer = routedVariants.some(
    (variant) => variant.editionLayer !== undefined && variant.editionLayer.entries.length > 0,
  );
  // Рабочее место ревью есть только там, где оболочка выводит его кнопку: ревью включено и есть цели.
  const usesReview =
    (source.manifest.review || routedPrior !== undefined) &&
    routedVariants.some((variant) => variant.reviewManifest.targets.length > 0);
  const switchableThemes = source.manifest.themeSwitcher
    ? [
        ...BUILT_IN_THEME_NAMES.map(resolveBuiltInTheme),
        ...(isBuiltInThemeName(source.theme.name) ? [] : [source.theme]),
      ]
    : [];
  const pageThemes = switchableThemes.length > 0 ? switchableThemes : [source.theme];
  // A theme's own chrome ships only with a theme that uses it: every theme the reader may switch to counts.
  const themeFeatures = [
    ...(pageThemes.some((theme) => theme.ornaments.console === 'on') ? ['theme-console'] : []),
    ...(pageThemes.some(
      (theme) => theme.chrome.topbar === 'ledger' || theme.chrome.landing === 'ledger',
    )
      ? ['theme-ledger']
      : []),
  ];
  const pageFeatures = resolvePageFeatures([
    ...themeFeatures,
    ...routedVariants.flatMap((variant) => variant.markdown.features),
    ...(source.manifest.layout === 'slides' ? ['slides'] : []),
    ...(source.manifest.layout === 'screens' ? ['screens'] : []),
    ...(usesReview ? ['review'] : []),
    ...(usesEditionLayer ? ['edition'] : []),
    ...(usesIslands ? ['islands'] : []),
    ...(usesEffects ? ['effects'] : []),
  ]);
  const pageAssets = await bundlePageAssets(
    pageFeatures,
    routedVariants.map((variant) => resolvePackageLocale(variant.source.manifest.language)),
  );
  const runtime = pageAssets.script;
  const styles = pageAssets.styles;
  const inlineRuntime = escapeInlineScript(runtime);
  const effectScripts = prepareEffectScripts(
    extensionAssembly?.effects ?? [],
    runtimePlacementForFormat(format),
  );
  const fontCss = unique(routedVariants.map((variant) => variant.markdown.fontCss).filter(Boolean));
  const themeFonts = await prepareThemeFonts(pageThemes, format);
  const themeCss = themeStylesheet(pageThemes);
  const documentStyles = [
    styles,
    themeFonts.css,
    themeCss,
    ...fontCss,
    ...(usesIslands ? [ISLAND_STYLES] : []),
    ...(extensionAssembly === undefined || extensionAssembly.blockStyles === ''
      ? []
      : [extensionAssembly.blockStyles]),
  ].join('\n');
  const external =
    runtimePlacement === 'inline'
      ? { styleHref: undefined, scriptSrc: undefined, files: [] as PreparedResourceFile[] }
      : prepareBrowserAssets(runtime, documentStyles, themeFonts.files);
  const publicUrl = options.url ?? source.manifest.url;
  const publishedImage =
    socialImage !== undefined && publicUrl !== undefined && socialImage.file !== undefined
      ? socialImage
      : undefined;
  const publicPage: PublicPageMetadata | undefined =
    publicUrl === undefined
      ? undefined
      : publicPageMetadata(
          publicUrl,
          publishedImage === undefined ? undefined : new URL(publishedImage.url, publicUrl).href,
          routedVariants.map((variant) => variant.source.manifest.language),
        );
  // Публичную страницу по вопросам не пересобирают: её запись редакции была бы лишним текстом для
  // поисковика, поэтому с `url` она не встраивается.
  const embedEditionRecord = publicUrl === undefined;
  const editionRecordJson = new Map<PageLocaleChoice, string>();
  if (embedEditionRecord)
    for (const variant of routedVariants) {
      const json = JSON.stringify(variant.editionRecord);
      if (Buffer.byteLength(json) > MAX_EDITION_RECORD_BYTES) {
        editionWarnings.push({
          level: 'warning',
          code: 'EDITION_RECORD_OMITTED',
          message: `The edition record of the ${variant.locale} page is ${Buffer.byteLength(json)} bytes, above the ${MAX_EDITION_RECORD_BYTES}-byte limit, so the page does not carry it.`,
          remediation:
            'Pass this page’s source instead of the page to --since when building the next edition.',
          details: { locale: variant.locale, bytes: Buffer.byteLength(json) },
        });
        continue;
      }
      editionRecordJson.set(variant.locale, json);
    }
  const documentVariants = routedVariants.map((variant) =>
    toDocumentVariant(variant, editionRecordJson.get(variant.locale)),
  );
  const [primaryDocument, ...localizedDocuments] = documentVariants;
  if (primaryDocument === undefined) throw new Error('Prepared report has no primary locale.');
  const renderedHtml = renderDocument({
    ...primaryDocument,
    page: {
      theme: source.theme,
      switchableThemes,
      scheme: source.manifest.scheme,
      layout: source.manifest.layout,
      progress: source.manifest.progress,
      motion: source.manifest.motion,
      opening: source.manifest.opening,
      attribution: source.manifest.attribution,
      // Приложенный артефакт прошлого ревью включает рабочее место сам: иначе флаг принимался бы
      // молча и не давал ничего.
      review: source.manifest.review || routedPrior !== undefined,
      schemeToggle: source.manifest.schemeToggle,
      topbar: source.manifest.topbar,
    },
    contentSecurityPolicy: createContentSecurityPolicy(runtimePlacement, inlineRuntime, [
      ...effectScripts.hashes,
      ...(extensionAssembly?.islandScriptHashes ?? []),
    ]),
    styles:
      format === 'single-file'
        ? { inline: documentStyles }
        : { href: requireAssetReference(external.styleHref, 'stylesheet') },
    runtime:
      runtimePlacement === 'inline'
        ? { inline: inlineRuntime }
        : { src: requireAssetReference(external.scriptSrc, 'runtime script') },
    ...(effectScripts.scripts.length === 0 ? {} : { extensionScripts: effectScripts.scripts }),
    ...(localizedDocuments.length === 0 ? {} : { localizations: localizedDocuments }),
    ...(publicPage === undefined ? {} : { publicPage }),
  });

  const shared =
    format === 'single-file'
      ? shareRepeatedImages(renderedHtml)
      : { html: renderedHtml, savedBytes: 0 };
  const html = shared.html;

  const warnings: Diagnostic[] = [
    ...(source.extensions?.warnings ?? []),
    ...routedVariants.flatMap((variant) => variant.markdown.warnings),
    ...editionWarnings,
    ...editionLayerWarnings(routedVariants, options.share === true),
  ];
  // Запись редакции и удалённый текст слоя изменений входят в бюджет веса одного файла.
  const editionBytes =
    [...editionRecordJson.values()].reduce((sum, json) => sum + Buffer.byteLength(json), 0) +
    routedVariants.reduce((sum, variant) => sum + (variant.editionLayer?.removedTextBytes ?? 0), 0);
  const bundledBytes =
    editionBytes -
    shared.savedBytes +
    routedVariants.reduce((sum, variant) => sum + variant.markdown.embeddedBytes, 0) +
    Buffer.byteLength(documentStyles) +
    (format === 'single-file' ? Buffer.byteLength(inlineRuntime) : 0) +
    effectScripts.inlineBytes;
  // Бюджет веса одного файла — отказ, а не совет: предупреждение о многомегабайтной странице агент
  // пропускал, и читатель получал файл, который долго открывается и не пересылается.
  if (format === 'single-file' && bundledBytes > source.manifest.output.maxInlineBytes)
    throw new AgenticReportError({
      level: 'error',
      code: 'INLINE_SIZE_BUDGET_EXCEEDED',
      message: `Embedded resources total ${bundledBytes} bytes, above the ${source.manifest.output.maxInlineBytes}-byte budget of one file.`,
      remediation:
        'Build with --format directory, shorten or compress the embedded media, or raise output.maxInlineBytes deliberately.',
      details: { bundledBytes, budget: source.manifest.output.maxInlineBytes },
    });

  const htmlBytes = Buffer.byteLength(html);
  if (publicUrl !== undefined && htmlBytes > PUBLIC_PAGE_CONTRACT.crawlerHtmlByteLimit)
    warnings.push({
      level: 'warning',
      code: 'PUBLIC_PAGE_OVER_CRAWLER_LIMIT',
      message: `The public page HTML is ${htmlBytes} bytes; search crawlers read only the first ${PUBLIC_PAGE_CONTRACT.crawlerHtmlByteLimit} bytes, so later content is not indexed.`,
      remediation:
        'Build the public page with directory output, which moves images, fonts, styles and the runtime into separate hashed files.',
      details: { htmlBytes, limit: PUBLIC_PAGE_CONTRACT.crawlerHtmlByteLimit },
    });
  if (socialImage !== undefined && publishedImage === undefined)
    warnings.push({
      level: 'warning',
      code: 'SOCIAL_IMAGE_NOT_PUBLISHED',
      message:
        publicUrl === undefined
          ? 'The social image needs a public URL to become an absolute og:image address.'
          : 'Single-file output has no public address for the social image, so og:image is omitted.',
      remediation:
        publicUrl === undefined
          ? 'Declare url in the manifest or pass --url together with directory output.'
          : 'Build the public page with directory output to publish the image as og:image.',
      details: {
        image: source.manifest.image,
        format,
        publicUrl: publicUrl !== undefined,
      },
    });

  const markdownResourceFiles = mergeResourceFiles([
    ...routedVariants.flatMap((variant) => variant.markdown.resourceFiles),
    ...(publishedImage?.file === undefined ? [] : [publishedImage.file]),
  ]);
  const primary = routedVariants[0];
  return {
    source,
    variants: routedVariants,
    format,
    runtimePlacement,
    ...(outputPath === undefined ? {} : { outputPath }),
    html,
    contentHash: createHash('sha256').update(html).digest('hex'),
    share: options.share === true,
    neutralizedSourceLinks: routedVariants.reduce(
      (sum, variant) => sum + variant.markdown.neutralizedSourceLinks,
      0,
    ),
    embeddedAssets:
      routedVariants.reduce((sum, variant) => sum + variant.markdown.embeddedAssets, 0) +
      (format === 'single-file' ? 2 : 0),
    externalAssets:
      format === 'directory' ? markdownResourceFiles.length + external.files.length : 0,
    warnings,
    resourceFiles: [...markdownResourceFiles, ...external.files, ...effectScripts.files],
    observedDirectives: unique(
      routedVariants.flatMap((variant) => variant.markdown.observedDirectives),
    ),
    observedResources: routedVariants.reduce(
      (totals, variant) => ({
        images: totals.images + variant.markdown.observedResources.images,
        videos: totals.videos + variant.markdown.observedResources.videos,
        downloads: totals.downloads + variant.markdown.observedResources.downloads,
        fonts: totals.fonts + variant.markdown.observedResources.fonts,
      }),
      { images: 0, videos: 0, downloads: 0, fonts: 0 },
    ),
    resourceSourceFiles:
      socialImage === undefined
        ? allResourceSourceFiles
        : unique([...allResourceSourceFiles, socialImage.sourcePath]),
    reviewManifest: primary.reviewManifest,
    pageFeatures,
    ...(routedPrior === undefined ? {} : { priorReview: routedPrior }),
    ...(extensionAssembly === undefined ? {} : { extensions: extensionAssembly.report }),
    ...(primary.editionLayer === undefined ? {} : { changes: primary.editionLayer.changes }),
  };
}

/**
 * The review workspace and the theme selector open only from the top bar: on a page without it they
 * would be switched on and unreachable, so the build refuses the combination instead of dropping one.
 */
function assertTopbarControls(
  manifest: Pick<ReportManifest, 'topbar' | 'review' | 'themeSwitcher'>,
  priorReview: boolean,
): void {
  if (manifest.topbar) return;
  const controls = [
    ...(manifest.review || priorReview ? ['review'] : []),
    ...(manifest.themeSwitcher ? ['themeSwitcher'] : []),
  ];
  if (controls.length === 0) return;
  throw new AgenticReportError({
    level: 'error',
    code: 'INVALID_MANIFEST',
    message: `topbar: false removes the bar that ${controls.join(' and ')} open${controls.length === 1 ? 's' : ''} from.`,
    remediation:
      'A page filmed as a scene keeps topbar: false without review and themeSwitcher; a page for readers keeps the top bar.',
    details: { controls },
  });
}

/** Записи редакции прошлого исходника: он собирается в памяти текущей версией пакета. */
async function readSourceEditions(
  input: string,
): Promise<ReadonlyMap<PageLocaleChoice, EditionRecord>> {
  const prepared = await prepareReport({ input });
  return new Map(prepared.variants.map((variant) => [variant.locale, variant.editionRecord]));
}

function previousEditionFor(
  since: SinceEdition | undefined,
  locale: PageLocaleChoice,
  warnings: Diagnostic[],
): EditionPassOptions['previous'] {
  if (since === undefined) return undefined;
  const record = since.records.get(locale);
  if (record !== undefined) return { record };
  const [first] = [...since.records.values()];
  warnings.push({
    level: 'warning',
    code: 'EDITION_LOCALE_ADDED',
    message: `The previous edition has no ${locale} version, so the whole ${locale} page is marked new.`,
    remediation: 'Nothing to fix when the language is new; the next edition compares it normally.',
    details: { locale },
  });
  return {
    localeAdded: true,
    edition: first?.edition ?? 1,
    reportRevision: first?.reportRevision ?? `sha256:${'0'.repeat(64)}`,
  };
}

function editionLayerWarnings(
  variants: readonly PreparedPageVariant[],
  share: boolean,
): Diagnostic[] {
  const warnings: Diagnostic[] = [];
  const layers = variants.flatMap((variant) =>
    variant.editionLayer === undefined
      ? []
      : [{ locale: variant.locale, layer: variant.editionLayer }],
  );
  for (const { locale, layer } of layers) {
    if (layer.unchanged)
      warnings.push({
        level: 'warning',
        code: 'EDITION_UNCHANGED',
        message: `Nothing the reader sees changed since edition ${layer.edition} of the ${locale} page, so it carries no change layer.`,
        remediation:
          'Nothing to fix when the rebuild changed no text; otherwise check that --since names the page the reader saw.',
        details: { locale, edition: layer.edition },
      });
  }
  const removedBlocks = layers.reduce((sum, { layer }) => sum + layer.removedBlocks, 0);
  if (share && removedBlocks > 0)
    warnings.push({
      level: 'warning',
      code: 'EDITION_REMOVED_TEXT_SHARED',
      message: `The shared page shows ${removedBlocks} removed block${removedBlocks === 1 ? '' : 's'} as ghosts: their old text travels with the page.`,
      remediation:
        'Build without --since when text was removed for privacy or because it was wrong.',
      details: { removedBlocks },
    });
  return warnings;
}

async function preparePageVariant(
  source: SourceVariantDocument,
  format: OutputFormat,
  share: boolean,
  outputFilePath: string | undefined,
  localeScope: PageLocaleChoice | undefined,
  extensions: readonly PageExtension[],
  providerCache: ProviderCache,
  locale: PageLocaleChoice,
  previous: EditionPassOptions['previous'],
): Promise<{
  readonly markdown: MarkdownRenderResult;
  readonly reviewManifest: ReviewTargetManifest;
  readonly editionRecord: EditionRecord;
  readonly editionLayer?: EditionLayer;
}> {
  const markdown = await renderMarkdown(source.markdown, {
    edition: { locale, ...(previous === undefined ? {} : { previous }) },
    language: source.manifest.language,
    layout: source.manifest.layout,
    motion: source.manifest.motion,
    sourceRoot: source.sourceRoot,
    sourceMap: source.sourceMap,
    format,
    share,
    ...(outputFilePath === undefined ? {} : { outputFilePath }),
    ...(localeScope === undefined ? {} : { localeScope }),
    ...(extensions.length === 0 ? {} : { extensions: { declared: extensions, providerCache } }),
    ...(source.data === undefined ? {} : { data: source.data }),
  });
  const reviewManifest = await createReviewTargetManifest(
    source.sourceRoot,
    [...source.sourceDigests, ...markdown.resourceDigests],
    markdown.reviewTargets,
  );
  const layer = markdown.edition?.layer;
  const editionRecord: EditionRecord = {
    contractVersion: EDITION_RECORD_VERSION,
    locale,
    edition: layer?.edition ?? 1,
    reportRevision: reviewManifest.reportRevision,
    sections: markdown.edition?.body?.sections ?? [],
    blocks: markdown.edition?.body?.blocks ?? [],
  };
  return {
    markdown,
    reviewManifest,
    editionRecord,
    ...(layer === undefined ? {} : { editionLayer: layer }),
  };
}

function routePriorReview(
  artifact: ReviewArtifact,
  variants: readonly [PreparedPageVariant, ...PreparedPageVariant[]],
): readonly [PreparedPageVariant, ...PreparedPageVariant[]] {
  try {
    const selected = selectReviewLocaleVariant(
      artifact,
      variants.map((variant) => ({
        locale: variant.locale,
        primary: variant.primary,
        manifest: variant.reviewManifest,
        variant,
      })),
    );
    return requirePreparedVariants(
      variants.map((variant) =>
        variant === selected.variant
          ? {
              ...variant,
              priorReview: {
                artifact,
                resolved: bindReviewArtifact(artifact, variant.reviewManifest),
              },
            }
          : variant,
      ),
    );
  } catch (error) {
    if (!(error instanceof ReviewLocaleRoutingError)) throw error;
    throw new AgenticReportError({
      level: 'error',
      code:
        error.reason === 'unsupported-locale'
          ? 'REVIEW_LOCALE_UNSUPPORTED'
          : 'REVIEW_LOCALE_AMBIGUOUS',
      message: error.message,
      remediation:
        error.reason === 'unsupported-locale'
          ? 'Use a review exported from one of this report’s declared locales.'
          : 'Use a version-4 multilingual review carrying an explicit locale.',
    });
  }
}

/** Тип и наличие файла уже проверил загрузчик у своего поля; здесь превью только разрешается. */
async function resolveSocialImage(
  image: string,
  sourceRoot: string,
  format: OutputFormat,
  outputFilePath: string | undefined,
) {
  return await resolveLocalResource(image, {
    sourceRoot,
    format,
    ...(outputFilePath === undefined ? {} : { outputFilePath }),
  });
}

function publicPageMetadata(
  url: string,
  image: string | undefined,
  languages: readonly string[],
): PublicPageMetadata {
  const [primaryLanguage, ...alternateLanguages] = languages;
  const locale = primaryLanguage === undefined ? undefined : openGraphLocale(primaryLanguage);
  const alternateLocales = unique(
    alternateLanguages
      .map(openGraphLocale)
      .filter((value): value is string => value !== undefined && value !== locale),
  );
  return {
    url,
    ...(image === undefined ? {} : { image }),
    ...(locale === undefined ? {} : { locale }),
    alternateLocales,
    languages:
      languages.length > 1 ? unique(languages.filter((language) => language !== 'und')) : [],
  };
}

export function validateRequestedUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const normalized =
    typeof value === 'string'
      ? normalizePublicUrl(value)
      : ({ ok: false, reason: 'not-absolute' } as const);
  if (normalized.ok) return normalized.value;
  throw new AgenticReportError({
    level: 'error',
    code: 'PUBLIC_URL_INVALID',
    message: publicUrlProblem(normalized.reason),
    remediation: 'Pass the absolute public http(s) address the page will be served from.',
  });
}

function toDocumentVariant(
  variant: PreparedPageVariant,
  editionRecordJson: string | undefined,
): DocumentPageVariantOptions {
  return {
    ...(editionRecordJson === undefined ? {} : { editionRecordJson }),
    ...(variant.editionLayer === undefined ? {} : { editionLayer: variant.editionLayer }),
    locale: variant.locale,
    title:
      variant.source.manifest.title ??
      path.basename(variant.source.entryPath, path.extname(variant.source.entryPath)),
    ...(variant.source.manifest.description === undefined
      ? {}
      : { description: variant.source.manifest.description }),
    language: variant.source.manifest.language,
    contentHtml: variant.markdown.html,
    navigation: variant.markdown.navigation,
    reviewManifest: variant.reviewManifest,
    ...(variant.priorReview === undefined ? {} : { priorReview: variant.priorReview }),
  };
}

function requirePreparedVariants<T>(values: readonly T[]): readonly [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('Prepared report has no locale variants.');
  return [first, ...rest];
}

function mergeResourceFiles(files: readonly PreparedResourceFile[]): PreparedResourceFile[] {
  const merged = new Map<string, PreparedResourceFile>();
  for (const file of files) {
    const existing = merged.get(file.relativePath);
    if (existing !== undefined && !existing.bytes.equals(file.bytes))
      throw new AgenticReportError({
        level: 'error',
        code: 'LOCALIZED_RESOURCE_COLLISION',
        message: `Localized resources produced conflicting bytes for ${file.relativePath}.`,
        remediation: 'Use distinct resource contents or paths for each localized asset.',
      });
    if (existing === undefined) merged.set(file.relativePath, file);
  }
  return [...merged.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function readPriorReview(file: string): Promise<ReviewArtifact> {
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_REVIEW_FILE_BYTES)
    throw new AgenticReportError({
      level: 'error',
      code: 'REVIEW_ARTIFACT_INVALID',
      message: 'Prior review must be an ordinary bounded JSON file.',
      remediation: `Use a review file no larger than ${MAX_REVIEW_FILE_BYTES} bytes.`,
    });
  try {
    return parseReviewArtifact(JSON.parse(await readFile(file, 'utf8')) as unknown);
  } catch (error) {
    throw new AgenticReportError({
      level: 'error',
      code:
        error instanceof ReviewContractError && error.unsupportedVersion
          ? 'REVIEW_VERSION_UNSUPPORTED'
          : 'REVIEW_ARTIFACT_INVALID',
      message:
        error instanceof ReviewContractError
          ? error.message
          : 'Prior review is not valid versioned review JSON.',
      remediation:
        'Use a version-3 single-language or version-4 multilingual review; legacy version 2 is also accepted.',
      details: { cause: error instanceof Error ? error.name : 'unknown' },
    });
  }
}

async function assertPriorReviewDoesNotCollide(
  priorReviewFile: string,
  sourceFiles: readonly string[],
): Promise<void> {
  const priorStat = await stat(priorReviewFile, { bigint: true });
  for (const sourceFile of sourceFiles) {
    const sourceStat = await stat(sourceFile, { bigint: true });
    if (
      sourceFile === priorReviewFile ||
      (sourceStat.dev === priorStat.dev && sourceStat.ino === priorStat.ino)
    )
      throw new AgenticReportError({
        level: 'error',
        code: 'REVIEW_COLLIDES_WITH_SOURCE',
        message: `Prior review aliases a report source file: ${sourceFile}`,
        remediation:
          'Use a dedicated review JSON sidecar that is not an entry, manifest, partial, or local asset.',
        details: { review: priorReviewFile, source: sourceFile },
      });
  }
}

export function validateRequestedFormat(value: unknown): OutputFormat | undefined {
  if (value === undefined) return undefined;
  if (isOutputFormat(value)) return value;
  throw new AgenticReportError({
    level: 'error',
    code: 'OUTPUT_FORMAT_INVALID',
    message: 'Output format must be one of the supported format values.',
    remediation: `Use one of: ${OUTPUT_FORMATS.join(', ')}.`,
    details: { supportedFormats: OUTPUT_FORMATS },
  });
}

function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === 'string' && OUTPUT_FORMATS.some((format) => format === value);
}

function resolveOutputPath(output: string): string {
  return path.resolve(output);
}

async function resolveOutputTarget(outputPath: string): Promise<string> {
  try {
    return await realpath(outputPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return path.resolve(outputPath);
    throw error;
  }
}

async function assertOutputDoesNotCollide(
  outputPath: string,
  sourceFiles: readonly string[],
): Promise<void> {
  const sourcePath = sourceFiles.find((candidate) => candidate === outputPath);
  if (sourcePath !== undefined) throw outputCollisionError(outputPath, sourcePath);
  let outputIdentity: { readonly dev: number | bigint; readonly ino: number | bigint };
  try {
    const outputStat = await stat(outputPath, { bigint: true });
    outputIdentity = { dev: outputStat.dev, ino: outputStat.ino };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  for (const candidate of sourceFiles) {
    const sourceStat = await stat(candidate, { bigint: true });
    if (sourceStat.dev === outputIdentity.dev && sourceStat.ino === outputIdentity.ino)
      throw outputCollisionError(outputPath, candidate);
  }
}

function outputCollisionError(outputPath: string, sourcePath: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'OUTPUT_COLLIDES_WITH_SOURCE',
    message: `Output would overwrite a report source file: ${sourcePath}`,
    remediation: 'Choose an output path that is not an entry, manifest, partial, or local asset.',
    details: { output: outputPath, source: sourcePath },
  });
}

/**
 * Встроенные гарнитуры тем страницы. В одном файле они едут data URL внутри стилей, в каталоге —
 * отдельными файлами с хешем в имени рядом с таблицей стилей.
 */
async function prepareThemeFonts(
  themes: Parameters<typeof themeFontFiles>[0],
  format: OutputFormat,
): Promise<{ readonly css: string; readonly files: readonly PreparedResourceFile[] }> {
  const fonts = themeFontFiles(themes);
  const bytes = new Map<string, Buffer>();
  for (const font of fonts) {
    bytes.set(font.file, await readBrowserBinary(`fonts/${font.directory}/${font.file}`));
  }
  const files: PreparedResourceFile[] = [];
  const css = themeFontFaces(fonts, ({ file }) => {
    const content = bytes.get(file);
    if (content === undefined) throw new Error(`Missing bundled font ${file}`);
    if (format === 'single-file') return `data:font/woff2;base64,${content.toString('base64')}`;
    const name = `${file.replace(/\.woff2$/u, '')}.${createHash('sha256').update(content).digest('hex').slice(0, 12)}.woff2`;
    files.push({ relativePath: `assets/${name}`, bytes: content });
    return `./${name}`;
  });
  return { css, files };
}

async function readBrowserBinary(fileName: string): Promise<Buffer> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const assetPath =
    path.basename(path.dirname(moduleDirectory)) === 'node'
      ? path.resolve(moduleDirectory, '../../browser', fileName)
      : path.resolve(moduleDirectory, '../../dist/browser', fileName);
  try {
    return await readFile(assetPath);
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'PACKAGE_ASSET_MISSING',
        message: `Bundled browser asset is missing: ${assetPath}`,
        remediation: 'Reinstall agentic-report or rebuild the package before running the CLI.',
      },
      { cause: error },
    );
  }
}

function prepareBrowserAssets(
  runtime: string,
  styles: string,
  fontFiles: readonly PreparedResourceFile[],
): {
  readonly styleHref: string;
  readonly scriptSrc: string;
  readonly files: readonly PreparedResourceFile[];
} {
  const styleName = hashedName('document', 'css', styles);
  const runtimeName = hashedName('runtime', 'js', runtime);
  return {
    styleHref: `assets/${styleName}`,
    scriptSrc: `assets/${runtimeName}`,
    files: [
      { relativePath: `assets/${styleName}`, bytes: Buffer.from(styles) },
      { relativePath: `assets/${runtimeName}`, bytes: Buffer.from(runtime) },
      ...fontFiles,
    ],
  };
}

function hashedName(base: string, extension: string, contents: string): string {
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  return `${base}.${digest}.${extension}`;
}

function escapeInlineScript(runtime: string): string {
  return runtime.replace(/<(\/script|!--)/giu, '\\x3C$1');
}

/**
 * Скрипты эффектов расширений, каждый своим элементом после рантайма: в одном файле — встроенным, с
 * хешем в CSP, в каталоге — файлом с хешем в имени (его разрешает `'self'`).
 */
function prepareEffectScripts(
  effects: readonly { readonly name: string; readonly code: string }[],
  placement: RuntimePlacement,
): {
  readonly scripts: readonly DocumentRuntime[];
  readonly hashes: readonly string[];
  readonly files: readonly PreparedResourceFile[];
  readonly inlineBytes: number;
} {
  const scripts: DocumentRuntime[] = [];
  const hashes: string[] = [];
  const files: PreparedResourceFile[] = [];
  let inlineBytes = 0;
  for (const effect of effects) {
    if (placement === 'inline') {
      const inline = escapeInlineScript(effect.code);
      scripts.push({ inline });
      hashes.push(`sha256-${createHash('sha256').update(inline).digest('base64')}`);
      inlineBytes += Buffer.byteLength(inline);
      continue;
    }
    const relativePath = `assets/${hashedName(`effect-${effect.name}`, 'js', effect.code)}`;
    files.push({ relativePath, bytes: Buffer.from(effect.code) });
    scripts.push({ src: relativePath });
  }
  return { scripts, hashes, files, inlineBytes };
}

function createContentSecurityPolicy(
  placement: RuntimePlacement,
  runtime: string,
  extraScriptHashes: readonly string[] = [],
): string {
  const scriptSource = [
    placement === 'external'
      ? "'self'"
      : `'sha256-${createHash('sha256').update(runtime).digest('base64')}'`,
    ...extraScriptHashes.map((hash) => `'${hash}'`),
  ].join(' ');
  const localSource = placement === 'external' ? " 'self'" : '';
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `img-src data:${localSource}`,
    `font-src data:${localSource}`,
    `media-src data:${localSource}`,
    `style-src 'unsafe-inline'${localSource}`,
    `script-src ${scriptSource}`,
  ].join('; ');
}

function requireAssetReference(reference: string | undefined, label: string): string {
  if (reference === undefined)
    throw new AgenticReportError({
      level: 'error',
      code: 'INTERNAL_ASSET_REFERENCE_MISSING',
      message: `The ${label} reference was not produced for directory output.`,
      remediation: 'Rebuild the package and retry with the same source.',
    });
  return reference;
}
