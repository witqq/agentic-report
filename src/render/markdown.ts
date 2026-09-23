import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import rehypeShiki from '@shikijs/rehype';
import type { Element, Root } from 'hast';
import { lookup as lookupMime } from 'mime-types';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  authoringRegistry,
  type AuthoringRegistryDefinition,
  type DirectiveDefinition,
  type PageLocaleChoice,
} from '../authoring/registry.js';
import type { Diagnostic, OutputFormat, SourceDigest, SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveLocalPath } from '../source/load-source.js';
import { resolveSourceLocation } from '../source/source-map.js';
import type { ReviewTargetReference } from '../review/contract.js';
import { rehypeReviewTargets, remarkReviewTargets } from '../review/targets.js';
import {
  parseCodeTermMetadata,
  rehypeEnhanceDirectives,
  remarkSemanticDirectives,
} from './directives.js';
import type { NavigationItem } from './navigation.js';

export interface MarkdownRenderOptions {
  readonly language?: string;
  readonly sourceRoot: string;
  readonly format: OutputFormat;
  readonly share?: boolean;
  readonly outputFilePath?: string;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly localeScope?: PageLocaleChoice;
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
  readonly neutralizedSourceLinks: number;
  readonly navigation: readonly NavigationItem[];
  readonly reviewTargets: readonly ReviewTargetReference[];
  readonly observedResources: {
    readonly images: number;
    readonly videos: number;
    readonly downloads: number;
    readonly fonts: number;
  };
}

interface AssetCollector {
  embeddedAssets: number;
  externalAssets: number;
  embeddedBytes: number;
  warnings: Diagnostic[];
  fontCss: string[];
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
  return { ...defaultSchema, tagNames, attributes };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Видео, которое браузеры играют сами, и тип, который объявляет `<source>`. */
const VIDEO_TYPES: Readonly<Record<string, string>> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.ogv': 'video/ogg',
};

const POSTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

function videoType(reference: string): string | undefined {
  const withoutQuery = reference.split(/[?#]/, 1)[0] ?? '';
  return VIDEO_TYPES[path.extname(withoutQuery).toLowerCase()];
}

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
    resourceFiles: new Map(),
    sourceFiles: new Set(),
    resourceDigests: new Map(),
    observedResources: { images: 0, videos: 0, downloads: 0, fonts: 0 },
  };
  const observedDirectives = new Set<string>();
  const shareTransform = { neutralizedSourceLinks: 0 };
  const navigationTransform = { items: [] as NavigationItem[] };
  const reviewTargets: ReviewTargetReference[] = [];
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkSemanticDirectives, {
      sourceMap: options.sourceMap,
      markdown,
      observedDirectives,
      warnings: collector.warnings,
    })
    .use(remarkReviewTargets, {
      sourceRoot: options.sourceRoot,
      sourceMap: options.sourceMap,
      targets: reviewTargets,
    })
    .use(remarkRehype)
    .use(rehypeSanitize, semanticSanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeShiki, {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      parseMetaString: (metaString) => {
        const metadata = parseCodeTermMetadata(metaString);
        return metadata.kind === 'valid' ? { dataCodeTerms: metadata.keys.join(',') } : undefined;
      },
    })
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
    })
    .use(rehypeAssets, { ...options, collector })
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
    neutralizedSourceLinks: shareTransform.neutralizedSourceLinks,
    navigation: navigationTransform.items,
    reviewTargets,
    observedResources: collector.observedResources,
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
  const activateFont = options.collector.fontCss.length === 0;
  const fontFamily =
    options.localeScope === undefined ? family : `${family}--agentic-${options.localeScope}`;
  const activationSelector =
    options.localeScope === undefined
      ? ':root'
      : `[data-localized-page-variant="${options.localeScope}"]`;
  options.collector.fontCss.push(
    `@font-face{font-family:${JSON.stringify(fontFamily)};src:url(${JSON.stringify(cssUrl)})${format === undefined ? '' : ` format(${JSON.stringify(format)})`};font-display:swap}${activateFont ? `${activationSelector}{--agentic-font:${JSON.stringify(fontFamily)}}` : ''}`,
  );
  delete target.node.properties.dataFontSource;
  delete target.node.properties.dataFontFamily;
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
  if (/^https?:\/\//i.test(source)) {
    throw new AgenticReportError({
      level: 'error',
      code: 'REMOTE_ASSET_BLOCKED',
      message: `Remote asset fetching is disabled: ${source}`,
      remediation: 'Download the video into the report source directory and use a relative path.',
    });
  }
  const type = videoType(source);
  if (type === undefined) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_VIDEO_SOURCE',
      message: `A video must be a .webm, .mp4, .m4v, or .ogv file: ${source}`,
      remediation:
        'Convert the recording to WebM or MP4 (Playwright recordVideo writes WebM) and point src at it.',
    });
  }
  const video = await materializeLocalAsset(source, options);
  countEmbedded(video, options);
  const poster = node.properties.dataVideoPoster;
  let posterUrl: string | undefined;
  if (typeof poster === 'string') {
    const extension = path.extname(poster.split(/[?#]/, 1)[0] ?? '').toLowerCase();
    if (!POSTER_EXTENSIONS.has(extension)) {
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
  }
  options.collector.observedResources.videos += 1;

  const caption =
    node.tagName === 'img'
      ? typeof node.properties.alt === 'string' && node.properties.alt.trim() !== ''
        ? node.properties.alt.trim()
        : undefined
      : typeof node.properties.dataVideoCaption === 'string'
        ? node.properties.dataVideoCaption
        : undefined;
  const player: Element = {
    type: 'element',
    tagName: 'video',
    properties: {
      className: ['semantic-video-player'],
      controls: true,
      muted: true,
      loop: true,
      playsInline: true,
      preload: posterUrl === undefined ? 'metadata' : 'none',
      dataVideoAutoplay: '',
      ...(posterUrl === undefined ? {} : { poster: posterUrl }),
      ...(caption === undefined ? {} : { ariaLabel: caption }),
    },
    children: [
      {
        type: 'element',
        tagName: 'source',
        properties: { src: video.url, type },
        children: [],
      },
    ],
  };
  if (node.tagName === 'img') {
    node.tagName = 'video';
    node.properties = player.properties;
    node.children = player.children;
    return;
  }
  node.properties = { className: ['semantic-video'] };
  node.children = [
    player,
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
): Promise<{
  readonly url: string;
  readonly extension: string;
  readonly sourcePath: string;
  readonly sha256: string;
}> {
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

  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const fileName = `${path.basename(assetPath, extension)}.${digest}${extension}`;
  options.collector.resourceFiles.set(`assets/${fileName}`, bytes);
  options.collector.externalAssets += 1;
  return { url: `assets/${fileName}`, extension, sourcePath: assetPath, sha256 };
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
