import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTPUT_FORMATS,
  runtimePlacementForFormat,
  type PageLocaleChoice,
  type RuntimePlacement,
} from '../authoring/registry.js';
import type {
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
  type MarkdownRenderResult,
  type PreparedResourceFile,
} from '../render/markdown.js';
import { loadSource, resolveLocalPath } from '../source/load-source.js';

export interface PrepareReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
  readonly output?: string;
  readonly publication?: true;
  readonly review?: string;
  readonly share?: boolean;
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
  readonly priorReview?: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
}

export async function prepareReport(options: PrepareReportOptions): Promise<PreparedReport> {
  const source = await loadSource(options.input);
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
  const preparedVariants: readonly PreparedPageVariant[] = await Promise.all(
    sourceVariants.map(async (variant) => ({
      ...variant,
      ...(await preparePageVariant(
        variant.source,
        format,
        options.share === true,
        outputFilePath,
        sourceVariants.length > 1 ? variant.locale : undefined,
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

  if (collisionTargetPath !== undefined)
    await assertOutputDoesNotCollide(collisionTargetPath, [
      ...source.sourceFiles,
      ...allResourceSourceFiles,
      ...(priorReviewFile === undefined ? [] : [priorReviewFile]),
    ]);

  const [runtime, styles] = await Promise.all([
    readBrowserAsset('runtime.js'),
    readBrowserAsset('document.css'),
  ]);
  const inlineRuntime = escapeInlineScript(runtime);
  const fontCss = unique(routedVariants.map((variant) => variant.markdown.fontCss).filter(Boolean));
  const documentStyles = fontCss.length === 0 ? styles : `${styles}\n${fontCss.join('\n')}`;
  const external =
    runtimePlacement === 'inline'
      ? { styleHref: undefined, scriptSrc: undefined, files: [] as PreparedResourceFile[] }
      : prepareBrowserAssets(runtime, documentStyles);
  const documentVariants = routedVariants.map(toDocumentVariant);
  const [primaryDocument, ...localizedDocuments] = documentVariants;
  if (primaryDocument === undefined) throw new Error('Prepared report has no primary locale.');
  const html = renderDocument({
    ...primaryDocument,
    page: {
      preset: source.manifest.preset,
      theme: source.manifest.theme,
      layout: source.manifest.layout,
      tokens: source.manifest.tokens,
      scrollProgress: source.manifest.scrollProgress,
      attribution: source.manifest.attribution,
    },
    contentSecurityPolicy: createContentSecurityPolicy(runtimePlacement, inlineRuntime),
    styles:
      format === 'single-file'
        ? { inline: documentStyles }
        : { href: requireAssetReference(external.styleHref, 'stylesheet') },
    runtime:
      runtimePlacement === 'inline'
        ? { inline: inlineRuntime }
        : { src: requireAssetReference(external.scriptSrc, 'runtime script') },
    ...(localizedDocuments.length === 0 ? {} : { localizations: localizedDocuments }),
  });

  const warnings: Diagnostic[] = routedVariants.flatMap((variant) => variant.markdown.warnings);
  const bundledBytes =
    routedVariants.reduce((sum, variant) => sum + variant.markdown.embeddedBytes, 0) +
    Buffer.byteLength(documentStyles) +
    (format === 'single-file' ? Buffer.byteLength(inlineRuntime) : 0);
  if (format === 'single-file' && bundledBytes > source.manifest.output.maxInlineBytes)
    warnings.push({
      level: 'warning',
      code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
      message: `Embedded resources total ${bundledBytes} bytes, above the configured ${source.manifest.output.maxInlineBytes}-byte threshold.`,
      remediation:
        'Use directory output or raise output.maxInlineBytes after reviewing portability needs.',
      details: { bundledBytes, threshold: source.manifest.output.maxInlineBytes },
    });

  const markdownResourceFiles = mergeResourceFiles(
    routedVariants.flatMap((variant) => variant.markdown.resourceFiles),
  );
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
    resourceFiles: [...markdownResourceFiles, ...external.files],
    observedDirectives: unique(
      routedVariants.flatMap((variant) => variant.markdown.observedDirectives),
    ),
    observedResources: routedVariants.reduce(
      (totals, variant) => ({
        images: totals.images + variant.markdown.observedResources.images,
        downloads: totals.downloads + variant.markdown.observedResources.downloads,
        fonts: totals.fonts + variant.markdown.observedResources.fonts,
      }),
      { images: 0, downloads: 0, fonts: 0 },
    ),
    resourceSourceFiles: allResourceSourceFiles,
    reviewManifest: primary.reviewManifest,
    ...(routedPrior === undefined ? {} : { priorReview: routedPrior }),
  };
}

async function preparePageVariant(
  source: SourceVariantDocument,
  format: OutputFormat,
  share: boolean,
  outputFilePath: string | undefined,
  localeScope: PageLocaleChoice | undefined,
): Promise<{
  readonly markdown: MarkdownRenderResult;
  readonly reviewManifest: ReviewTargetManifest;
}> {
  const markdown = await renderMarkdown(source.markdown, {
    language: source.manifest.language,
    sourceRoot: source.sourceRoot,
    sourceMap: source.sourceMap,
    format,
    share,
    ...(outputFilePath === undefined ? {} : { outputFilePath }),
    ...(localeScope === undefined ? {} : { localeScope }),
  });
  return {
    markdown,
    reviewManifest: await createReviewTargetManifest(
      source.sourceRoot,
      [...source.sourceDigests, ...markdown.resourceDigests],
      markdown.reviewTargets,
    ),
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

function toDocumentVariant(variant: PreparedPageVariant): DocumentPageVariantOptions {
  return {
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

async function readBrowserAsset(fileName: string): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const assetPath =
    path.basename(path.dirname(moduleDirectory)) === 'node'
      ? path.resolve(moduleDirectory, '../../browser', fileName)
      : path.resolve(moduleDirectory, '../../dist/browser', fileName);
  try {
    return await readFile(assetPath, 'utf8');
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

function createContentSecurityPolicy(placement: RuntimePlacement, runtime: string): string {
  const scriptSource =
    placement === 'external'
      ? "'self'"
      : `'sha256-${createHash('sha256').update(runtime).digest('base64')}'`;
  const localSource = placement === 'external' ? " 'self'" : '';
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `img-src data:${localSource}`,
    `font-src data:${localSource}`,
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
