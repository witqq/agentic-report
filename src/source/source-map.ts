import type { SourceLocation, SourceMapSegment } from '../contracts.js';

export function resolveSourceLocation(
  sourceMap: readonly SourceMapSegment[],
  generatedStart: number,
  generatedEnd = generatedStart,
): SourceLocation | undefined {
  const start = resolvePoint(sourceMap, generatedStart, 'start');
  if (start === undefined) {
    return undefined;
  }
  const end = resolvePoint(sourceMap, generatedEnd, 'end');
  return {
    file: start.file,
    line: start.line,
    column: start.column,
    ...(end === undefined || end.file !== start.file
      ? {}
      : { endLine: end.line, endColumn: end.column }),
  };
}

/**
 * The same span as {@link resolveSourceLocation}, as offsets into the authored text instead of line and
 * column. Offsets count UTF-16 code units, the unit a JavaScript string index uses, not bytes. A consumer
 * applying a computed replacement needs offsets; line and column would have to be translated back, and the
 * translation is exactly what this map already holds.
 *
 * Returns nothing when the two ends resolve into different authored files, because a replacement
 * spanning two files has no single range to apply.
 */
export function resolveSourceRange(
  sourceMap: readonly SourceMapSegment[],
  generatedStart: number,
  generatedEnd: number,
): { readonly file: string; readonly start: number; readonly end: number } | undefined {
  const start = resolvePoint(sourceMap, generatedStart, 'start');
  const end = resolvePoint(sourceMap, generatedEnd, 'end');
  if (start === undefined || end === undefined || start.file !== end.file) return undefined;
  if (end.offset < start.offset) return undefined;
  return { file: start.file, start: start.offset, end: end.offset };
}

export function sourceLocationFromOffsets(
  file: string,
  sourceText: string,
  start: number,
  end: number,
): SourceLocation {
  const startPoint = lineColumnAt(sourceText, start);
  const endPoint = lineColumnAt(sourceText, end);
  return {
    file,
    line: startPoint.line,
    column: startPoint.column,
    endLine: endPoint.line,
    endColumn: endPoint.column,
  };
}

function resolvePoint(
  sourceMap: readonly SourceMapSegment[],
  offset: number,
  edge: 'start' | 'end',
):
  | {
      readonly file: string;
      readonly line: number;
      readonly column: number;
      readonly offset: number;
    }
  | undefined {
  const segment = sourceMap.find((candidate, index) => {
    if (edge === 'start') {
      return (
        candidate.generatedStart <= offset &&
        (offset < candidate.generatedEnd ||
          (index === sourceMap.length - 1 && offset === candidate.generatedEnd))
      );
    }
    return candidate.generatedStart < offset && offset <= candidate.generatedEnd;
  });
  if (segment === undefined) {
    return undefined;
  }
  const sourceOffset = segment.sourceStart + (offset - segment.generatedStart);
  const point = lineColumnAt(segment.sourceText, sourceOffset);
  return { file: segment.sourceFile, ...point, offset: sourceOffset };
}

function lineColumnAt(
  sourceText: string,
  requestedOffset: number,
): { readonly line: number; readonly column: number } {
  const offset = Math.max(0, Math.min(requestedOffset, sourceText.length));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (sourceText.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}
