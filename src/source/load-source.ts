import { createHash } from 'node:crypto';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import { parse as parseYaml } from 'yaml';
import type { ZodIssue } from 'zod';

import { normalizePackageRelativePosixReference } from '../authoring/local-reference.js';
import {
  ReportManifestSchema,
  type SourceDocument,
  type SourceLocation,
  type SourceMapSegment,
} from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { sourceLocationFromOffsets } from './source-map.js';

interface MetadataOrigin {
  readonly file: string;
  readonly text: string;
}

interface ManifestDocument {
  readonly data: Record<string, unknown>;
  readonly origin?: MetadataOrigin;
}

const ENTRY_CANDIDATES = ['report.md', 'index.md'] as const;
const MANIFEST_CANDIDATES = [
  'agentic-report.yaml',
  'agentic-report.yml',
  'agentic-report.json',
] as const;
const INCLUDE_PATTERN = /\{\{include:\s*([^}\n]+?)\s*\}\}/g;

export async function loadSource(input: string): Promise<SourceDocument> {
  const resolvedInput = path.resolve(input);
  const inputStat = await statOrInputError(resolvedInput);
  const entryPath = inputStat.isDirectory()
    ? await resolveLocalPath(
        resolvedInput,
        path.basename(
          await findRequiredFile(resolvedInput, ENTRY_CANDIDATES, 'SOURCE_ENTRY_NOT_FOUND'),
        ),
        'SOURCE_ENTRY_OUTSIDE_SOURCE',
      )
    : await realpath(resolvedInput);
  const sourceRoot = path.dirname(entryPath);
  const raw = await readFile(entryPath, 'utf8');
  const parsed = parseFrontmatter(raw, entryPath);
  const manifestDocument = await readOptionalManifest(sourceRoot);
  const frontmatterOrigin: MetadataOrigin = { file: entryPath, text: raw };
  const frontmatterData = requireMetadataRecord(parsed.data, frontmatterOrigin, 'frontmatter');
  const merged = mergeManifestData(manifestDocument.data, frontmatterData);
  const headingTitle = /^#\s+(.+)$/m.exec(parsed.content)?.[1]?.trim();
  const withDerivedTitle =
    merged.title === undefined && headingTitle !== undefined
      ? { ...merged, title: headingTitle }
      : merged;
  const manifestResult = ReportManifestSchema.safeParse(withDerivedTitle);

  if (!manifestResult.success) {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_MANIFEST',
      message: 'Invalid report metadata.',
      remediation: 'Run `agentic-report schema` and update the manifest or frontmatter.',
      source: metadataIssueLocation(
        manifestResult.error.issues[0],
        manifestDocument,
        frontmatterData,
        frontmatterOrigin,
      ),
      details: { issues: manifestResult.error.issues },
    });
  }

  const expanded = await expandPartials(
    parsed.content,
    sourceRoot,
    new Set([entryPath]),
    0,
    entryPath,
    raw,
    raw.length - parsed.content.length,
  );
  return {
    entryPath,
    sourceRoot,
    sourceFiles: [
      ...new Set([
        entryPath,
        ...(manifestDocument.origin === undefined ? [] : [manifestDocument.origin.file]),
        ...expanded.sourceFiles,
      ]),
    ],
    markdown: expanded.markdown,
    manifest: manifestResult.data,
    sourceMap: expanded.sourceMap,
    sourceDigests: sourceDigests(entryPath, raw, manifestDocument.origin, expanded.sourceMap),
  };
}

function sourceDigests(
  entryPath: string,
  entryText: string,
  manifestOrigin: MetadataOrigin | undefined,
  sourceMap: readonly SourceMapSegment[],
): readonly { readonly file: string; readonly sha256: string }[] {
  const sources = new Map<string, string>([[entryPath, entryText]]);
  if (manifestOrigin !== undefined) sources.set(manifestOrigin.file, manifestOrigin.text);
  for (const segment of sourceMap) sources.set(segment.sourceFile, segment.sourceText);
  return [...sources].map(([file, text]) => ({
    file,
    sha256: createHash('sha256').update(text).digest('hex'),
  }));
}

async function statOrInputError(input: string): Promise<Awaited<ReturnType<typeof stat>>> {
  try {
    return await stat(input);
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'INPUT_NOT_FOUND',
        message: `Input does not exist: ${input}`,
        remediation:
          'Pass an existing Markdown file or a directory containing report.md or index.md.',
        source: { file: input },
      },
      { cause: error },
    );
  }
}

async function findRequiredFile(
  directory: string,
  candidates: readonly string[],
  code: string,
): Promise<string> {
  for (const candidate of candidates) {
    const candidatePath = path.join(directory, candidate);
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      // Continue through the bounded candidate list.
    }
  }

  throw new AgenticReportError({
    level: 'error',
    code,
    message: `No report entry found in ${directory}.`,
    remediation: `Create one of: ${candidates.join(', ')}.`,
    source: { file: directory },
  });
}

async function readOptionalManifest(sourceRoot: string): Promise<ManifestDocument> {
  for (const candidate of MANIFEST_CANDIDATES) {
    const manifestPath = path.join(sourceRoot, candidate);
    try {
      const confinedManifestPath = await resolveLocalPath(
        sourceRoot,
        candidate,
        'MANIFEST_OUTSIDE_SOURCE',
      );
      const contents = await readFile(confinedManifestPath, 'utf8');
      const parsed: unknown = candidate.endsWith('.json')
        ? JSON.parse(contents)
        : parseYaml(contents);
      const origin = { file: confinedManifestPath, text: contents };
      return { data: requireMetadataRecord(parsed, origin, 'manifest'), origin };
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      if (error instanceof AgenticReportError) {
        throw error;
      }
      throw new AgenticReportError(
        {
          level: 'error',
          code: 'MANIFEST_READ_FAILED',
          message: `Could not read manifest ${manifestPath}.`,
          remediation: 'Fix its JSON/YAML syntax or remove the invalid manifest.',
          source: metadataParseErrorLocation(error, manifestPath, await readText(manifestPath)),
        },
        { cause: error },
      );
    }
  }
  return { data: {} };
}

function mergeManifestData(
  baseValue: Record<string, unknown>,
  overrideValue: Record<string, unknown>,
): Record<string, unknown> {
  const baseOutput = requireOutputRecord(baseValue, 'manifest');
  const overrideOutput = requireOutputRecord(overrideValue, 'frontmatter');
  return {
    ...baseValue,
    ...overrideValue,
    output: {
      ...baseOutput,
      ...overrideOutput,
    },
  };
}

function requireMetadataRecord(
  value: unknown,
  origin: MetadataOrigin,
  label: string,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    requireOutputRecord(record, label, origin);
    return record;
  }
  throw new AgenticReportError({
    level: 'error',
    code: 'INVALID_MANIFEST',
    message: `Report ${label} must be an object.`,
    remediation: 'Run `agentic-report schema` and use key-value metadata.',
    source: firstContentLocation(origin),
  });
}

function requireOutputRecord(
  value: Record<string, unknown>,
  label: string,
  origin?: MetadataOrigin,
): Record<string, unknown> {
  if (!Object.hasOwn(value, 'output')) {
    return {};
  }
  const output = value.output;
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  throw new AgenticReportError({
    level: 'error',
    code: 'INVALID_MANIFEST',
    message: `Report ${label} output must be an object.`,
    remediation: 'Run `agentic-report schema` and use output key-value fields.',
    ...(origin === undefined ? {} : { source: metadataPathLocation(origin, ['output']) }),
  });
}

function metadataIssueLocation(
  issue: ZodIssue | undefined,
  manifest: ManifestDocument,
  frontmatter: Record<string, unknown>,
  frontmatterOrigin: MetadataOrigin,
): SourceLocation {
  const path = (issue?.path ?? []).map(String);
  if (issue?.code === 'unrecognized_keys' && issue.keys[0] !== undefined) {
    path.push(issue.keys[0]);
  }
  const origin = metadataPathComesFrom(frontmatter, path)
    ? frontmatterOrigin
    : (manifest.origin ?? frontmatterOrigin);
  return path.length === 0 ? firstContentLocation(origin) : metadataPathLocation(origin, path);
}

function metadataPathComesFrom(
  frontmatter: Record<string, unknown>,
  path: readonly string[],
): boolean {
  const [first, second] = path;
  if (first === undefined) {
    return Object.keys(frontmatter).length > 0;
  }
  if (first !== 'output' || second === undefined) {
    return Object.hasOwn(frontmatter, first);
  }
  const output = frontmatter.output;
  return (
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output) &&
    Object.hasOwn(output, second)
  );
}

function metadataPathLocation(origin: MetadataOrigin, path: readonly string[]): SourceLocation {
  const key = path.at(-1);
  if (key === undefined) {
    return firstContentLocation(origin);
  }
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^[\\t ]*["']?${escapedKey}["']?[\\t ]*:.*$`, 'm').exec(origin.text);
  if (match?.index === undefined) {
    return firstContentLocation(origin);
  }
  return sourceLocationFromOffsets(
    origin.file,
    origin.text,
    match.index,
    match.index + match[0].length,
  );
}

function firstContentLocation(origin: MetadataOrigin): SourceLocation {
  const start = origin.text.search(/\S/);
  const safeStart = start < 0 ? 0 : start;
  const lineEnd = origin.text.indexOf('\n', safeStart);
  return sourceLocationFromOffsets(
    origin.file,
    origin.text,
    safeStart,
    lineEnd < 0 ? origin.text.length : lineEnd,
  );
}

function metadataParseErrorLocation(error: unknown, file: string, text: string): SourceLocation {
  const origin = { file, text };
  if (typeof error === 'object' && error !== null && 'linePos' in error) {
    const linePos = error.linePos;
    if (Array.isArray(linePos)) {
      const first = linePos[0] as { readonly line?: unknown; readonly col?: unknown } | undefined;
      if (typeof first?.line === 'number' && typeof first.col === 'number') {
        return {
          file,
          line: first.line,
          column: first.col,
          endLine: first.line,
          endColumn: first.col + 1,
        };
      }
    }
  }
  if (typeof error === 'object' && error !== null && 'mark' in error) {
    const mark = error.mark as { readonly line?: unknown; readonly column?: unknown } | undefined;
    if (typeof mark?.line === 'number' && typeof mark.column === 'number') {
      return {
        file,
        line: mark.line + 1,
        column: mark.column + 1,
        endLine: mark.line + 1,
        endColumn: mark.column + 2,
      };
    }
  }
  const position = /position\s+(\d+)/i.exec(error instanceof Error ? error.message : '')?.[1];
  if (position !== undefined) {
    const start = Number(position);
    return sourceLocationFromOffsets(file, text, start, Math.min(start + 1, text.length));
  }
  return firstContentLocation(origin);
}

function parseFrontmatter(raw: string, entryPath: string): ReturnType<typeof matter> {
  try {
    return matter(raw);
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'FRONTMATTER_READ_FAILED',
        message: `Could not parse frontmatter in ${entryPath}.`,
        remediation: 'Fix its YAML syntax or remove the invalid frontmatter.',
        source: metadataParseErrorLocation(error, entryPath, raw),
      },
      { cause: error },
    );
  }
}

async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function expandPartials(
  markdown: string,
  sourceRoot: string,
  ancestry: ReadonlySet<string>,
  depth: number,
  originFile: string,
  originText: string,
  originStart: number,
): Promise<{
  readonly markdown: string;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly sourceFiles: readonly string[];
}> {
  if (depth > 10) {
    throw new AgenticReportError({
      level: 'error',
      code: 'PARTIAL_DEPTH_EXCEEDED',
      message: 'Markdown partial nesting exceeds the limit of 10.',
      remediation: 'Flatten the partial hierarchy or remove a recursive include.',
    });
  }

  const matches = [...markdown.matchAll(INCLUDE_PATTERN)];
  let expanded = '';
  const sourceMap: SourceMapSegment[] = [];
  const sourceFiles = new Set([originFile]);
  let cursor = 0;
  for (const match of matches) {
    const reference = match[1]?.trim();
    const token = match[0];
    const matchStart = match.index;
    if (reference === undefined || matchStart === undefined) {
      continue;
    }
    appendOriginal(matchStart);
    const includeLocation = sourceLocationFromOffsets(
      originFile,
      originText,
      originStart + matchStart,
      originStart + matchStart + token.length,
    );
    let partialPath: string;
    try {
      partialPath = await resolveLocalPath(sourceRoot, reference, 'PARTIAL_OUTSIDE_SOURCE');
    } catch (error) {
      throw withAuthoredSource(error, includeLocation, reference);
    }
    if (!partialPath.endsWith('.md')) {
      throw new AgenticReportError({
        level: 'error',
        code: 'UNSUPPORTED_PARTIAL_TYPE',
        message: `Only Markdown partials are supported: ${reference}`,
        remediation: 'Use a .md partial containing declarative report content.',
        source: includeLocation,
        details: { reference, target: partialPath },
      });
    }
    if (ancestry.has(partialPath)) {
      throw new AgenticReportError({
        level: 'error',
        code: 'PARTIAL_CYCLE',
        message: `Recursive partial include detected: ${reference}`,
        remediation: 'Remove the cycle from the partial include graph.',
        source: includeLocation,
        details: { reference, target: partialPath },
      });
    }
    let partial: string;
    try {
      partial = await readFile(partialPath, 'utf8');
    } catch (error) {
      throw new AgenticReportError(
        {
          level: 'error',
          code: 'PARTIAL_READ_FAILED',
          message: `Could not read Markdown partial: ${reference}`,
          remediation:
            'Fix the partial path or add the missing .md file under the source directory.',
          source: includeLocation,
          details: { reference, target: partialPath },
        },
        { cause: error },
      );
    }
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(partialPath);
    if (depth >= 10) {
      throw new AgenticReportError({
        level: 'error',
        code: 'PARTIAL_DEPTH_EXCEEDED',
        message: 'Markdown partial nesting exceeds the limit of 10.',
        remediation: 'Flatten the partial hierarchy or remove a recursive include.',
        source: includeLocation,
        details: { reference, target: partialPath },
      });
    }
    const nested = await expandPartials(
      partial,
      sourceRoot,
      nextAncestry,
      depth + 1,
      partialPath,
      partial,
      0,
    );
    const nestedStart = expanded.length;
    expanded += nested.markdown;
    sourceMap.push(
      ...nested.sourceMap.map((segment) => ({
        ...segment,
        generatedStart: segment.generatedStart + nestedStart,
        generatedEnd: segment.generatedEnd + nestedStart,
      })),
    );
    for (const sourceFile of nested.sourceFiles) {
      sourceFiles.add(sourceFile);
    }
    cursor = matchStart + token.length;
  }
  appendOriginal(markdown.length);
  return { markdown: expanded, sourceMap, sourceFiles: [...sourceFiles] };

  function appendOriginal(end: number): void {
    if (end <= cursor) {
      return;
    }
    const generatedStart = expanded.length;
    const chunk = markdown.slice(cursor, end);
    expanded += chunk;
    sourceMap.push({
      generatedStart,
      generatedEnd: generatedStart + chunk.length,
      sourceFile: originFile,
      sourceStart: originStart + cursor,
      sourceText: originText,
    });
    cursor = end;
  }
}

function withAuthoredSource(
  error: unknown,
  source: SourceLocation,
  reference: string,
): AgenticReportError {
  if (error instanceof AgenticReportError) {
    return new AgenticReportError(
      {
        ...error.diagnostic,
        source,
        details: {
          ...error.diagnostic.details,
          reference,
          ...(error.diagnostic.source?.file === undefined
            ? {}
            : { target: error.diagnostic.source.file }),
        },
      },
      { cause: error },
    );
  }
  throw error;
}

export async function resolveLocalPath(
  sourceRoot: string,
  reference: string,
  code: string,
): Promise<string> {
  const normalized = normalizePackageRelativePosixReference(reference);
  if (!normalized.ok && normalized.reason === 'invalid-uri') {
    throw new AgenticReportError({
      level: 'error',
      code: 'INVALID_LOCAL_REFERENCE',
      message: `Local reference is not valid URI text: ${reference}`,
      remediation: 'Use a valid relative path and percent-encode literal percent characters.',
    });
  }
  if (!normalized.ok) {
    throw new AgenticReportError({
      level: 'error',
      code,
      message: `Local reference leaves the source directory: ${reference}`,
      remediation: 'Use a relative POSIX path without root, drive, dot, or parent segments.',
    });
  }
  const decodedReference = normalized.value;
  const resolved = path.resolve(sourceRoot, decodedReference);
  const relative = path.relative(sourceRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AgenticReportError({
      level: 'error',
      code,
      message: `Local reference leaves the source directory: ${reference}`,
      remediation: 'Move the referenced file under the report source directory.',
      source: { file: resolved },
    });
  }

  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(resolved);
  } catch (error) {
    if (isMissingFileError(error)) {
      return resolved;
    }
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'LOCAL_REFERENCE_RESOLUTION_FAILED',
        message: `Could not resolve local reference: ${reference}`,
        remediation: 'Fix inaccessible path components under the report source directory.',
        source: { file: resolved },
      },
      { cause: error },
    );
  }
  const canonicalRoot = await realpath(sourceRoot);
  const canonicalRelative = path.relative(canonicalRoot, canonicalTarget);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
    throw new AgenticReportError({
      level: 'error',
      code,
      message: `Local reference leaves the source directory through a symbolic link: ${reference}`,
      remediation:
        'Replace the symbolic link with a file located under the report source directory.',
      source: { file: canonicalTarget },
    });
  }
  return canonicalTarget;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
