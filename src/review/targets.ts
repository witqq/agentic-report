import { createHash } from 'node:crypto';
import path from 'node:path';

import type { Element, Root as HastRoot } from 'hast';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import type { SourceDigest, SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveSourceLocation } from '../source/source-map.js';
import { SOURCE_CONTRACT_MAJOR } from '../authoring/registry.js';
import {
  MAX_REVIEW_TARGETS,
  MAX_REVIEW_MANIFEST_BYTES,
  REVIEW_CONTRACT_VERSION,
  type ReviewTargetManifest,
  type ReviewTargetReference,
} from './contract.js';

interface ReviewTargetPluginOptions {
  readonly sourceRoot: string;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly targets: ReviewTargetReference[];
}

type PositionedNode = {
  readonly type: string;
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, string | null>>;
  data?: {
    hName?: string;
    hProperties?: Readonly<Record<string, unknown>>;
    [key: string]: unknown;
  };
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
};

const REVIEWABLE_MARKDOWN_BLOCKS = new Set([
  'blockquote',
  'code',
  'heading',
  'list',
  'paragraph',
  'table',
  'thematicBreak',
]);
const REVIEW_TARGET_ALGORITHM_VERSION = 1;

export const remarkReviewTargets: Plugin<[ReviewTargetPluginOptions], Root> =
  (options) => (tree) => {
    const occurrences = new Map<string, number>();
    const stableKeys = new Set<string>();
    visit(tree, (candidate, _index, parent) => {
      const node = candidate as unknown as PositionedNode;
      const kind = reviewableKind(node);
      if (kind === 'markdown:paragraph' && parent?.type === 'listItem') return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (kind === undefined || start === undefined || end === undefined || end <= start) return;
      const segment = sourceSegment(options.sourceMap, start, end);
      const source = resolveSourceLocation(options.sourceMap, start, end);
      if (
        segment === undefined ||
        source === undefined ||
        source.endLine === undefined ||
        source.endColumn === undefined
      ) {
        return;
      }
      const relativeFile = relativeSourcePath(options.sourceRoot, source.file);
      const sourceStart = segment.sourceStart + (start - segment.generatedStart);
      const sourceEnd = segment.sourceStart + (end - segment.generatedStart);
      const fingerprint = sha256(segment.sourceText.slice(sourceStart, sourceEnd));
      const explicitId = directiveExplicitId(node);
      const stableKey = explicitId === undefined ? undefined : `${kind}:${explicitId}`;
      if (stableKey !== undefined && stableKeys.has(stableKey)) {
        throw reviewTargetError(
          'REVIEW_TARGET_DUPLICATE',
          `Review target identity is defined more than once: ${stableKey}.`,
          'Use a unique explicit id for every reviewable semantic target.',
          source,
        );
      }
      if (stableKey !== undefined) stableKeys.add(stableKey);
      const occurrenceKey = `${relativeFile}\0${kind}\0${fingerprint}`;
      const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
      occurrences.set(occurrenceKey, occurrence);
      const id = targetId(stableKey ?? `${occurrenceKey}\0${occurrence}`);
      const target: ReviewTargetReference = {
        id,
        kind,
        fingerprint,
        ...(stableKey === undefined ? {} : { stableKey }),
        source: {
          file: relativeFile,
          line: source.line ?? 1,
          column: source.column ?? 1,
          endLine: source.endLine,
          endColumn: source.endColumn,
        },
      };
      options.targets.push(target);
      if (options.targets.length > MAX_REVIEW_TARGETS) {
        throw reviewTargetError(
          'REVIEW_TARGET_LIMIT_EXCEEDED',
          `Report contains more than ${MAX_REVIEW_TARGETS} reviewable targets.`,
          'Split the report into smaller artifacts or reduce reviewable block count.',
          source,
        );
      }
      const data = node.data ?? {};
      node.data = {
        ...data,
        hProperties: { ...data.hProperties, dataReviewTarget: id },
      };
    });
  };

export const rehypeReviewTargets: Plugin<[ReviewTargetPluginOptions], HastRoot> =
  (options) => (tree) => {
    const projected = new Set<string>();
    const codeTargets = options.targets.filter((target) => target.kind === 'markdown:code');
    let codeIndex = 0;
    const targetsByRange = new Map(
      options.targets.map((target) => [sourceRangeKey(target.source), target]),
    );
    visit(tree, 'element', (node: Element) => {
      const existing = node.properties.dataReviewTarget;
      if (typeof existing === 'string') {
        projected.add(existing);
        return;
      }
      if (node.tagName === 'pre') {
        const target = codeTargets[codeIndex];
        codeIndex += 1;
        if (target !== undefined) {
          node.properties.dataReviewTarget = target.id;
          projected.add(target.id);
        }
        return;
      }
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined || reviewableElementKind(node) === undefined)
        return;
      const source = resolveSourceLocation(options.sourceMap, start, end);
      if (
        source === undefined ||
        source.line === undefined ||
        source.column === undefined ||
        source.endLine === undefined ||
        source.endColumn === undefined
      ) {
        return;
      }
      const target = targetsByRange.get(
        sourceRangeKey({
          file: relativeSourcePath(options.sourceRoot, source.file),
          line: source.line,
          column: source.column,
          endLine: source.endLine,
          endColumn: source.endColumn,
        }),
      );
      if (target === undefined || target.kind !== reviewableElementKind(node)) return;
      node.properties.dataReviewTarget = target.id;
      projected.add(target.id);
    });
    const missing = options.targets.filter((target) => !projected.has(target.id));
    if (missing.length > 0) {
      throw new AgenticReportError({
        level: 'error',
        code: 'REVIEW_TARGET_PROJECTION_FAILED',
        message: `Review targets did not produce DOM owners: ${missing.map((target) => target.id).join(', ')}.`,
        remediation:
          'Report the source and package version; do not publish an incomplete review manifest.',
        details: { targets: missing.map((target) => ({ id: target.id, kind: target.kind })) },
      });
    }
  };

export async function createReviewTargetManifest(
  sourceRoot: string,
  sourceDigests: readonly SourceDigest[],
  targets: readonly ReviewTargetReference[],
): Promise<ReviewTargetManifest> {
  const canonicalTargets = [...targets].sort((left, right) => compare(left.id, right.id));
  const reportRevision = createReportRevision(sourceRoot, sourceDigests, canonicalTargets);
  const manifest: ReviewTargetManifest = {
    contractVersion: REVIEW_CONTRACT_VERSION,
    reportRevision,
    targets: canonicalTargets,
  };
  const serializedBytes = Buffer.byteLength(JSON.stringify(manifest));
  if (serializedBytes > MAX_REVIEW_MANIFEST_BYTES) {
    throw new AgenticReportError({
      level: 'error',
      code: 'REVIEW_MANIFEST_SIZE_EXCEEDED',
      message: `Review target manifest is ${serializedBytes} bytes, above the ${MAX_REVIEW_MANIFEST_BYTES}-byte limit.`,
      remediation:
        'Split the report into smaller review artifacts or shorten source-relative paths.',
      details: { serializedBytes, maximumBytes: MAX_REVIEW_MANIFEST_BYTES },
    });
  }
  return manifest;
}

export function createReportRevision(
  sourceRoot: string,
  sourceDigests: readonly SourceDigest[],
  targets: readonly ReviewTargetReference[],
): string {
  const unique = new Map<string, { readonly file: string; readonly sha256: string }>();
  for (const source of sourceDigests) unique.set(source.file, source);
  const inputs = [...unique.values()].map((source) => ({
    ...source,
    relative: relativeSourcePath(sourceRoot, source.file),
  }));
  inputs.sort((left, right) => compare(left.relative, right.relative));
  const hash = createHash('sha256');
  hash.update(
    `agentic-report-review\0${REVIEW_CONTRACT_VERSION}\0${SOURCE_CONTRACT_MAJOR}\0${REVIEW_TARGET_ALGORITHM_VERSION}\0`,
  );
  for (const item of inputs) {
    hash.update(item.relative);
    hash.update('\0');
    hash.update(item.sha256);
    hash.update('\0');
  }
  hash.update(JSON.stringify(targets));
  return `sha256:${hash.digest('hex')}`;
}

function reviewableKind(node: PositionedNode): string | undefined {
  if (node.type === 'containerDirective' && typeof node.name === 'string') {
    return `directive:${node.name}`;
  }
  return REVIEWABLE_MARKDOWN_BLOCKS.has(node.type) ? `markdown:${node.type}` : undefined;
}

function reviewableElementKind(node: Element): string | undefined {
  const semantic = node.properties.dataSemantic;
  if (typeof semantic === 'string') return `directive:${semantic}`;
  if (/^h[1-6]$/u.test(node.tagName)) return 'markdown:heading';
  return (
    {
      blockquote: 'markdown:blockquote',
      hr: 'markdown:thematicBreak',
      ol: 'markdown:list',
      p: 'markdown:paragraph',
      pre: 'markdown:code',
      table: 'markdown:table',
      ul: 'markdown:list',
    } as Readonly<Record<string, string>>
  )[node.tagName];
}

function directiveExplicitId(node: PositionedNode): string | undefined {
  const value = node.type === 'containerDirective' ? node.attributes?.id : undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sourceSegment(
  sourceMap: readonly SourceMapSegment[],
  start: number,
  end: number,
): SourceMapSegment | undefined {
  return sourceMap.find(
    (segment) => segment.generatedStart <= start && end <= segment.generatedEnd,
  );
}

function relativeSourcePath(sourceRoot: string, file: string): string {
  const relative = path.relative(sourceRoot, file);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AgenticReportError({
      level: 'error',
      code: 'REVIEW_SOURCE_OUTSIDE_SOURCE',
      message: `Review source identity leaves the report source root: ${file}`,
      remediation: 'Keep every reviewable source and resource under the report source directory.',
      source: { file },
    });
  }
  return relative.split(path.sep).join('/');
}

function sourceRangeKey(source: {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}): string {
  return `${source.file}\0${source.line}\0${source.column}\0${source.endLine}\0${source.endColumn}`;
}

function targetId(value: string): string {
  return `rt-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function reviewTargetError(
  code: string,
  message: string,
  remediation: string,
  source: {
    readonly file: string;
    readonly line?: number;
    readonly column?: number;
    readonly endLine?: number;
    readonly endColumn?: number;
  },
): AgenticReportError {
  return new AgenticReportError({ level: 'error', code, message, remediation, source });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
