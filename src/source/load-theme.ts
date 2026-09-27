import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMap, isScalar, parseDocument, type Document } from 'yaml';
import type { ZodIssue } from 'zod';

import { themeInputSchema } from '../authoring/schemas.js';
import { themeContrastProblems, type ThemeContrastProblem } from '../authoring/theme-contrast.js';
import {
  applyThemeInput,
  BUILT_IN_THEME_NAMES,
  DEFAULT_THEME_NAME,
  isBuiltInThemeName,
  resolveBuiltInTheme,
  THEME_FIELDS,
  type ResolvedTheme,
  type ThemeInput,
} from '../authoring/themes.js';
import type { Diagnostic, SourceLocation } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { sourceLocationFromOffsets } from './source-map.js';

/**
 * Место, где объявлена тема страницы: YAML-текст (frontmatter или манифест проекта) и путь до поля
 * `theme` внутри него. Отсюда берутся строки диагностик для темы, написанной прямо во frontmatter.
 */
export interface ThemeDeclaration {
  readonly file: string;
  readonly text: string;
  readonly yamlStart: number;
  readonly yamlText: string;
  readonly path: readonly string[];
}

export interface LoadedTheme {
  readonly theme: ResolvedTheme;
  /** Прочитанные файлы тем: они входят в граф источника наравне с частями Markdown. */
  readonly files: readonly { readonly file: string; readonly text: string }[];
}

const THEME_FILE_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);
const MAX_EXTENDS_DEPTH = 8;

/** Где лежит тема и как находить строки её полей. */
interface ThemeText {
  readonly file: string;
  readonly text: string;
  readonly offset: number;
  readonly document: Document;
  readonly path: readonly string[];
}

type ResolveLocalPath = (sourceRoot: string, reference: string, code: string) => Promise<string>;

export async function loadTheme(
  value: string | Readonly<Record<string, unknown>>,
  declaration: ThemeDeclaration,
  sourceRoot: string,
  resolveLocalPath: ResolveLocalPath,
): Promise<LoadedTheme> {
  const declared = declarationText(declaration);
  const files: { file: string; text: string }[] = [];
  const theme = await resolveReference(value, declared, [], sourceRoot, resolveLocalPath, files);
  return { theme, files };
}

async function resolveReference(
  value: unknown,
  where: ThemeText,
  chain: readonly string[],
  sourceRoot: string,
  resolveLocalPath: ResolveLocalPath,
  files: { file: string; text: string }[],
): Promise<ResolvedTheme> {
  if (typeof value === 'string') {
    const reference = value.trim();
    if (isBuiltInThemeName(reference)) return resolveBuiltInTheme(reference);
    if (!THEME_FILE_EXTENSIONS.has(path.extname(reference).toLowerCase())) {
      throw themeError({
        code: 'THEME_UNKNOWN',
        message: `Theme "${reference}" is neither a built-in theme nor a theme file.`,
        remediation: `Use one of ${BUILT_IN_THEME_NAMES.join(', ')}, a relative path to a .yaml, .yml or .json theme file, or a theme object with extends.`,
        source: locate(where, []),
        details: { theme: reference, builtInThemes: BUILT_IN_THEME_NAMES },
      });
    }
    let file: string;
    try {
      file = await resolveLocalPath(sourceRoot, reference, 'THEME_OUTSIDE_SOURCE');
    } catch (error) {
      if (error instanceof AgenticReportError)
        throw new AgenticReportError(
          { ...error.diagnostic, source: locate(where, []), details: { theme: reference } },
          { cause: error },
        );
      throw error;
    }
    if (chain.includes(file) || chain.length >= MAX_EXTENDS_DEPTH) {
      throw themeError({
        code: 'THEME_EXTENDS_CYCLE',
        message: `Theme ${reference} extends itself through ${chain.length} theme files.`,
        remediation: 'Make the extends chain end at a built-in theme.',
        source: locate(where, []),
      });
    }
    const text = await readThemeFile(file, reference, where);
    files.push({ file, text });
    const document = parseDocument(text, { prettyErrors: false });
    const parseError = document.errors[0];
    if (parseError !== undefined) {
      const [start, end] = parseError.pos;
      throw themeError({
        code: 'THEME_READ_FAILED',
        message: `Theme file ${reference} is not valid YAML or JSON: ${parseError.message.split('\n')[0]}`,
        remediation: 'Fix the syntax of the theme file.',
        source: sourceLocationFromOffsets(file, text, start, Math.max(end, start + 1)),
      });
    }
    const themeText: ThemeText = { file, text, offset: 0, document, path: [] };
    const fallbackName = path
      .basename(file, path.extname(file))
      .toLowerCase()
      .replace(/[^a-z0-9-]+/gu, '-')
      .replace(/^[^a-z]+/u, '');
    return resolveInput(
      document.toJS() as unknown,
      themeText,
      [...chain, file],
      sourceRoot,
      resolveLocalPath,
      files,
      fallbackName === '' ? 'custom' : fallbackName,
    );
  }
  return resolveInput(value, where, chain, sourceRoot, resolveLocalPath, files, 'custom');
}

async function resolveInput(
  value: unknown,
  where: ThemeText,
  chain: readonly string[],
  sourceRoot: string,
  resolveLocalPath: ResolveLocalPath,
  files: { file: string; text: string }[],
  fallbackName: string,
): Promise<ResolvedTheme> {
  const parsed = themeInputSchema.safeParse(value ?? {});
  if (!parsed.success) throw themeFieldError(parsed.error.issues, where);
  const input = parsed.data as ThemeInput;
  const parent = await resolveReference(
    input.extends ?? DEFAULT_THEME_NAME,
    input.extends === undefined ? where : { ...where, path: [...where.path, 'extends'] },
    chain,
    sourceRoot,
    resolveLocalPath,
    files,
  );
  const name = input.name ?? fallbackName;
  if (isBuiltInThemeName(name)) {
    throw themeError({
      code: 'THEME_NAME_TAKEN',
      message: `Theme name "${name}" belongs to a built-in theme.`,
      remediation: `Give the theme its own name, or use "${name}" directly without redefining it.`,
      source: locate(where, input.name === undefined ? [] : ['name']),
    });
  }
  const theme = applyThemeInput(parent, input, name);
  const problems = themeContrastProblems(theme);
  if (problems.length > 0) throw themeContrastError(problems, input, where);
  return theme;
}

async function readThemeFile(file: string, reference: string, where: ThemeText): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'THEME_READ_FAILED',
        message: `Could not read theme file: ${reference}`,
        remediation: 'Add the theme file under the source directory or fix its path.',
        source: locate(where, []),
        details: { theme: reference, target: file },
      },
      { cause: error },
    );
  }
}

function themeFieldError(issues: readonly ZodIssue[], where: ThemeText): AgenticReportError {
  const diagnostics = issues.map((issue) => fieldDiagnostic(issue, where));
  const [first, ...related] = diagnostics;
  if (first === undefined) throw new Error('A refused theme carries no issue.');
  return new AgenticReportError({ ...first, ...(related.length === 0 ? {} : { related }) });
}

function fieldDiagnostic(issue: ZodIssue, where: ThemeText): Diagnostic {
  const fieldPath = issue.path.map(String);
  if (issue.code === 'unrecognized_keys') {
    const key = String(issue.keys[0]);
    const allowed = fieldsAt(fieldPath).map((field) => field.name);
    return {
      level: 'error',
      code: 'THEME_INVALID',
      message: `Theme has an unknown field: ${[...fieldPath, key].join('.')}.`,
      remediation:
        allowed.length === 0
          ? 'Remove the field; run `agentic-report schema --scope theme` for the theme fields.'
          : `Use one of ${allowed.join(', ')} here, or run \`agentic-report schema --scope theme\`.`,
      source: locate(where, [...fieldPath, key]),
      details: { field: [...fieldPath, key].join('.'), allowed },
    };
  }
  const field = fieldAt(fieldPath) as
    | {
        readonly description?: string;
        readonly constraint?: {
          readonly kind: string;
          readonly values?: readonly string[];
          readonly pattern?: string;
          readonly minimum?: number;
          readonly maximum?: number;
        };
      }
    | undefined;
  const constraint = field?.constraint;
  const expected =
    constraint?.kind === 'enum'
      ? `one of ${(constraint.values ?? []).join(', ')}`
      : constraint?.kind === 'string' && constraint.pattern?.includes('#[0-9a-fA-F]') === true
        ? 'a colour written as #rgb, #rrggbb, #rrggbbaa or transparent'
        : constraint?.kind === 'number' || constraint?.kind === 'integer'
          ? `a number from ${constraint.minimum} to ${constraint.maximum}`
          : field?.description === undefined
            ? undefined
            : `a valid value — ${field.description.charAt(0).toLowerCase()}${field.description.slice(1)}`;
  return {
    level: 'error',
    code: 'THEME_INVALID',
    message: `Theme field ${fieldPath.join('.') || '(theme)'} has an invalid value.`,
    remediation: `Set ${fieldPath.join('.') || 'the theme'} to ${expected ?? 'a value the theme schema accepts'}.`,
    source: locate(where, fieldPath),
    details: { field: fieldPath.join('.'), ...(expected === undefined ? {} : { expected }) },
  };
}

function themeContrastError(
  problems: readonly ThemeContrastProblem[],
  input: ThemeInput,
  where: ThemeText,
): AgenticReportError {
  const [first] = problems;
  if (first === undefined) throw new Error('No contrast problem to report.');
  const authored = (role: string): boolean =>
    input.colors?.[first.scheme] !== undefined && role in (input.colors[first.scheme] ?? {});
  const fieldPath = authored(first.foreground)
    ? ['colors', first.scheme, first.foreground]
    : authored(first.background)
      ? ['colors', first.scheme, first.background]
      : input.accent !== undefined
        ? ['accent']
        : input.extends !== undefined
          ? ['extends']
          : [];
  return new AgenticReportError({
    level: 'error',
    code: 'THEME_CONTRAST',
    message: `Theme ${first.scheme} scheme puts ${first.foreground} on ${first.background} at ${first.ratio}:1, below ${first.minimum}:1 for ${first.use}.`,
    remediation: `Darken or lighten ${first.foreground} or ${first.background} in colors.${first.scheme} until the pair reaches ${first.minimum}:1.`,
    source: locate(where, fieldPath),
    details: {
      problems: problems.map((problem) => ({
        scheme: problem.scheme,
        foreground: problem.foreground,
        background: problem.background,
        ratio: problem.ratio,
        minimum: problem.minimum,
      })),
    },
  });
}

function themeError(diagnostic: Omit<Diagnostic, 'level'>): AgenticReportError {
  return new AgenticReportError({ level: 'error', ...diagnostic });
}

type ThemeField =
  (typeof THEME_FIELDS)[number] | { readonly name: string; readonly fields?: unknown };

function fieldsAt(fieldPath: readonly string[]): readonly { readonly name: string }[] {
  if (fieldPath.length === 0) return THEME_FIELDS;
  const field = fieldAt(fieldPath);
  return field !== undefined && 'fields' in field && Array.isArray(field.fields)
    ? (field.fields as readonly { readonly name: string }[])
    : [];
}

function fieldAt(fieldPath: readonly string[]): ThemeField | undefined {
  let fields: readonly ThemeField[] = THEME_FIELDS;
  let found: ThemeField | undefined;
  for (const segment of fieldPath) {
    found = fields.find((candidate) => candidate.name === segment);
    if (found === undefined) return undefined;
    fields = 'fields' in found && Array.isArray(found.fields) ? (found.fields as ThemeField[]) : [];
  }
  return found;
}

function declarationText(declaration: ThemeDeclaration): ThemeText {
  return {
    file: declaration.file,
    text: declaration.text,
    offset: declaration.yamlStart,
    document: parseDocument(declaration.yamlText, { prettyErrors: false }),
    path: declaration.path,
  };
}

/** Строка поля темы: ближайший существующий ключ по пути, иначе само объявление темы. */
function locate(where: ThemeText, fieldPath: readonly string[]): SourceLocation {
  const segments = [...where.path, ...fieldPath];
  let node: unknown = where.document.contents;
  let range: readonly [number, number] | undefined;
  for (const segment of segments) {
    if (!isMap(node)) break;
    const pair = node.items.find(
      (item) => isScalar(item.key) && String(item.key.value) === segment,
    );
    if (pair === undefined) break;
    const keyRange = isScalar(pair.key) ? (pair.key.range ?? undefined) : undefined;
    const valueRange =
      pair.value !== null && typeof pair.value === 'object' && 'range' in pair.value
        ? (pair.value.range as readonly [number, number, number] | undefined)
        : undefined;
    if (keyRange !== undefined)
      range = [
        keyRange[0],
        isScalar(pair.value) && valueRange !== undefined ? valueRange[1] : keyRange[1],
      ];
    node = pair.value;
  }
  if (range === undefined) {
    const start = where.text.slice(where.offset).search(/\S/u);
    const safe = where.offset + Math.max(0, start);
    const lineEnd = where.text.indexOf('\n', safe);
    return sourceLocationFromOffsets(
      where.file,
      where.text,
      safe,
      lineEnd < 0 ? where.text.length : lineEnd,
    );
  }
  return sourceLocationFromOffsets(
    where.file,
    where.text,
    where.offset + range[0],
    where.offset + range[1],
  );
}
