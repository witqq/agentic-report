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
} from '../authoring/registry.js';
import type { Diagnostic, OutputFormat, SourceDigest, SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveLocalPath } from '../source/load-source.js';
import { resolveSourceLocation } from '../source/source-map.js';
import type { ReviewTargetReference } from '../review/contract.js';
import { rehypeReviewTargets, remarkReviewTargets } from '../review/targets.js';
import { rehypeEnhanceDirectives, remarkSemanticDirectives } from './directives.js';

export interface MarkdownRenderOptions {
  readonly sourceRoot: string;
  readonly format: OutputFormat;
  readonly outputFilePath?: string;
  readonly sourceMap: readonly SourceMapSegment[];
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
  readonly reviewTargets: readonly ReviewTargetReference[];
  readonly observedResources: {
    readonly images: number;
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
  observedResources: { images: number; downloads: number; fonts: number };
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

const rehypeAssets: Plugin<[AssetPluginOptions], Root> = (options) => async (tree) => {
  const targets: Array<{ readonly node: Element; readonly kind: 'image' | 'asset' | 'font' }> = [];
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'img' && typeof node.properties.src === 'string') {
      targets.push({ node, kind: 'image' });
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
    observedResources: { images: 0, downloads: 0, fonts: 0 },
  };
  const observedDirectives = new Set<string>();
  const reviewTargets: ReviewTargetReference[] = [];
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkSemanticDirectives, {
      sourceMap: options.sourceMap,
      markdown,
      observedDirectives,
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
    })
    .use(rehypeReviewTargets, {
      sourceRoot: options.sourceRoot,
      sourceMap: options.sourceMap,
      targets: reviewTargets,
    })
    .use(rehypeEnhanceDirectives, { sourceMap: options.sourceMap })
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
    reviewTargets,
    observedResources: collector.observedResources,
  };
}

async function processAssetTarget(
  target: { readonly node: Element; readonly kind: 'image' | 'asset' | 'font' },
  options: AssetPluginOptions,
): Promise<void> {
  const source = assetSource(target);
  if (typeof source !== 'string') {
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
  options.collector.fontCss.push(
    `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(cssUrl)})${format === undefined ? '' : ` format(${JSON.stringify(format)})`};font-display:swap}${activateFont ? `:root{--agentic-font:${JSON.stringify(family)}}` : ''}`,
  );
  delete target.node.properties.dataFontSource;
  delete target.node.properties.dataFontFamily;
}

function assetSource(target: {
  readonly node: Element;
  readonly kind: 'image' | 'asset' | 'font';
}): string | undefined {
  const source =
    target.kind === 'image'
      ? target.node.properties.src
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
