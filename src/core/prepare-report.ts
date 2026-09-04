import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTPUT_FORMATS,
  runtimePlacementForFormat,
  type RuntimePlacement,
} from '../authoring/registry.js';
import type { Diagnostic, OutputFormat, SourceDocument } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import {
  MAX_REVIEW_FILE_BYTES,
  parseReviewArtifact,
  ReviewContractError,
  type ReviewArtifact,
  type ReviewTargetManifest,
} from '../review/contract.js';
import { bindReviewArtifact, type ResolvedReviewArtifact } from '../review/binding.js';
import { createReviewTargetManifest } from '../review/targets.js';
import { renderDocument } from '../render/document.js';
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

export interface PreparedReport {
  readonly source: SourceDocument;
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

  const [runtime, styles] = await Promise.all([
    readBrowserAsset('runtime.js'),
    readBrowserAsset('document.css'),
  ]);
  const inlineRuntime = escapeInlineScript(runtime);
  const markdown = await renderMarkdown(source.markdown, {
    language: source.manifest.language,
    sourceRoot: source.sourceRoot,
    sourceMap: source.sourceMap,
    format,
    share: options.share === true,
    ...(outputFilePath === undefined ? {} : { outputFilePath }),
  });
  const documentStyles = markdown.fontCss.length === 0 ? styles : `${styles}\n${markdown.fontCss}`;
  const reviewManifest = await createReviewTargetManifest(
    source.sourceRoot,
    [...source.sourceDigests, ...markdown.resourceDigests],
    markdown.reviewTargets,
  );
  const priorReviewFile =
    options.review === undefined
      ? undefined
      : await resolveLocalPath(source.sourceRoot, options.review, 'REVIEW_OUTSIDE_SOURCE');
  if (priorReviewFile !== undefined) {
    await assertPriorReviewDoesNotCollide(priorReviewFile, [
      ...source.sourceFiles,
      ...markdown.sourceFiles,
    ]);
  }
  const priorReviewInput =
    priorReviewFile === undefined
      ? undefined
      : await loadPriorReview(priorReviewFile, reviewManifest);
  const priorReview = priorReviewInput?.payload;
  if (collisionTargetPath !== undefined) {
    await assertOutputDoesNotCollide(collisionTargetPath, [
      ...source.sourceFiles,
      ...markdown.sourceFiles,
      ...(priorReviewInput === undefined ? [] : [priorReviewInput.file]),
    ]);
  }
  const warnings: Diagnostic[] = [...markdown.warnings];
  const bundledBytes =
    markdown.embeddedBytes +
    Buffer.byteLength(documentStyles) +
    (format === 'single-file' ? Buffer.byteLength(inlineRuntime) : 0);
  if (format === 'single-file' && bundledBytes > source.manifest.output.maxInlineBytes) {
    warnings.push({
      level: 'warning',
      code: 'INLINE_SIZE_THRESHOLD_EXCEEDED',
      message: `Embedded resources total ${bundledBytes} bytes, above the configured ${source.manifest.output.maxInlineBytes}-byte threshold.`,
      remediation:
        'Use directory output or raise output.maxInlineBytes after reviewing portability needs.',
      details: { bundledBytes, threshold: source.manifest.output.maxInlineBytes },
    });
  }

  const external =
    runtimePlacement === 'inline'
      ? { styleHref: undefined, scriptSrc: undefined, files: [] as PreparedResourceFile[] }
      : prepareBrowserAssets(runtime, documentStyles);
  const html = renderDocument({
    title: source.manifest.title ?? path.basename(source.entryPath, path.extname(source.entryPath)),
    language: source.manifest.language,
    ...(source.manifest.description === undefined
      ? {}
      : { description: source.manifest.description }),
    page: {
      preset: source.manifest.preset,
      theme: source.manifest.theme,
      layout: source.manifest.layout,
      tokens: source.manifest.tokens,
      scrollProgress: source.manifest.scrollProgress,
      attribution: source.manifest.attribution,
    },
    contentHtml: markdown.html,
    navigation: markdown.navigation,
    contentSecurityPolicy: createContentSecurityPolicy(runtimePlacement, inlineRuntime),
    styles:
      format === 'single-file'
        ? { inline: documentStyles }
        : { href: requireAssetReference(external.styleHref, 'stylesheet') },
    runtime:
      runtimePlacement === 'inline'
        ? { inline: inlineRuntime }
        : { src: requireAssetReference(external.scriptSrc, 'runtime script') },
    reviewManifest,
    ...(priorReview === undefined ? {} : { priorReview }),
  });

  return {
    source,
    format,
    runtimePlacement,
    ...(outputPath === undefined ? {} : { outputPath }),
    html,
    contentHash: createHash('sha256').update(html).digest('hex'),
    share: options.share === true,
    neutralizedSourceLinks: markdown.neutralizedSourceLinks,
    embeddedAssets: markdown.embeddedAssets + (format === 'single-file' ? 2 : 0),
    externalAssets: markdown.externalAssets + external.files.length,
    warnings,
    resourceFiles: [...markdown.resourceFiles, ...external.files],
    observedDirectives: markdown.observedDirectives,
    observedResources: markdown.observedResources,
    resourceSourceFiles: markdown.sourceFiles,
    reviewManifest,
    ...(priorReview === undefined ? {} : { priorReview }),
  };
}

async function loadPriorReview(
  file: string,
  manifest: ReviewTargetManifest,
): Promise<{
  readonly file: string;
  readonly payload: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
}> {
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_REVIEW_FILE_BYTES)
    throw new AgenticReportError({
      level: 'error',
      code: 'REVIEW_ARTIFACT_INVALID',
      message: 'Prior review must be an ordinary bounded JSON file.',
      remediation: `Use a review file no larger than ${MAX_REVIEW_FILE_BYTES} bytes.`,
    });
  try {
    const artifact = parseReviewArtifact(JSON.parse(await readFile(file, 'utf8')) as unknown);
    return { file, payload: { artifact, resolved: bindReviewArtifact(artifact, manifest) } };
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
        'Use a version-3 review exported by Agentic Report; legacy version 2 is also accepted.',
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
    ) {
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
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return path.resolve(outputPath);
    }
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
    if (sourceStat.dev === outputIdentity.dev && sourceStat.ino === outputIdentity.ino) {
      throw outputCollisionError(outputPath, candidate);
    }
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
  if (reference === undefined) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INTERNAL_ASSET_REFERENCE_MISSING',
      message: `The ${label} reference was not produced for directory output.`,
      remediation: 'Rebuild the package and retry with the same source.',
    });
  }
  return reference;
}
