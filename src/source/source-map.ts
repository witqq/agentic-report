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
): { readonly file: string; readonly line: number; readonly column: number } | undefined {
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
  return { file: segment.sourceFile, ...point };
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
