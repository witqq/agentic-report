/**
 * Прошлая редакция для `--since`: собранная страница, из которой читается встроенная запись, или
 * исходник, который собирается в памяти текущей версией пакета. Путь — аргумент командной строки, как
 * `input` и `--output`, поэтому корнем исходника он не ограничен; но он не может быть файлом
 * исходника новой страницы и читается до того, как новая страница будет записана, поэтому может
 * совпадать с `--output`.
 */

import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { PageLocaleChoice } from '../authoring/registry.js';
import { AgenticReportError } from '../diagnostics.js';
import { EditionContractError, parseEditionRecord, type EditionRecord } from './record.js';

/** Прошлая страница бывает большой: одиночный файл с видео. */
export const MAX_SINCE_PAGE_BYTES = 64 * 1024 * 1024;

export interface SinceEdition {
  readonly kind: 'page' | 'source';
  readonly records: ReadonlyMap<PageLocaleChoice, EditionRecord>;
}

/** Собирает прошлый исходник в памяти и отдаёт записи его языковых версий. */
export type SourceEditionReader = (
  input: string,
) => Promise<ReadonlyMap<PageLocaleChoice, EditionRecord>>;

export async function readSinceEdition(
  since: string,
  sourceFiles: readonly string[],
  readSource: SourceEditionReader,
): Promise<SinceEdition> {
  const resolved = path.resolve(since);
  const target = await classify(resolved);
  await assertSinceDoesNotCollide(target.file ?? resolved, sourceFiles);
  if (target.kind === 'source') return { kind: 'source', records: await readSource(resolved) };
  const html = await readBounded(target.file ?? resolved);
  return { kind: 'page', records: extractEditionRecords(html) };
}

async function classify(
  resolved: string,
): Promise<{ readonly kind: 'page' | 'source'; readonly file?: string }> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(resolved);
  } catch {
    throw unreadable(resolved, 'The previous edition does not exist.');
  }
  if (info.isDirectory()) {
    const entries = new Set(await readdir(resolved));
    if (entries.has('index.html')) return { kind: 'page', file: path.join(resolved, 'index.html') };
    if (entries.has('report.md') || entries.has('index.md')) return { kind: 'source' };
    throw unreadable(
      resolved,
      'The previous edition directory holds neither a built index.html nor a report.md or index.md source.',
    );
  }
  if (!info.isFile()) throw unreadable(resolved, 'The previous edition is not an ordinary file.');
  const extension = path.extname(resolved).toLowerCase();
  if (extension === '.html' || extension === '.htm') return { kind: 'page', file: resolved };
  if (extension === '.md' || extension === '.markdown') return { kind: 'source', file: resolved };
  throw unreadable(
    resolved,
    'The previous edition must be a built .html page or a Markdown source.',
  );
}

async function readBounded(file: string): Promise<string> {
  const handle = await open(file, 'r').catch(() => {
    throw unreadable(file, 'The previous edition cannot be opened.');
  });
  try {
    const info = await handle.stat();
    if (info.size > MAX_SINCE_PAGE_BYTES)
      throw unreadable(
        file,
        `The previous edition is ${info.size} bytes, above the ${MAX_SINCE_PAGE_BYTES}-byte limit.`,
      );
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Записи всех языковых версий страницы. Запись ищется по элементу `template`, без разбора всего HTML:
 * её JSON — текст шаблона, экранированный так, как экранирует сериализация страницы.
 */
export function extractEditionRecords(html: string): Map<PageLocaleChoice, EditionRecord> {
  const records = new Map<PageLocaleChoice, EditionRecord>();
  const pattern = /<template data-edition-record(?:="[^"]*")?>([^<]*)<\/template>/gu;
  let found = false;
  for (const match of html.matchAll(pattern)) {
    found = true;
    let value: unknown;
    try {
      value = JSON.parse(unescapeHtml(match[1] ?? ''));
    } catch {
      throw invalid(['/: not JSON']);
    }
    let record: EditionRecord;
    try {
      record = parseEditionRecord(value);
    } catch (error) {
      if (error instanceof EditionContractError && error.unsupportedVersion)
        throw new AgenticReportError({
          level: 'error',
          code: 'EDITION_VERSION_UNSUPPORTED',
          message: error.message,
          remediation:
            'Pass the previous source instead of the page, or rebuild the previous edition with this package version.',
        });
      throw invalid(error instanceof EditionContractError ? error.issues : ['/']);
    }
    records.set(record.locale, record);
  }
  if (!found)
    throw new AgenticReportError({
      level: 'error',
      code: 'EDITION_RECORD_MISSING',
      message:
        'The previous page carries no edition record: it was built before editions existed, built with --url, or is not an agentic-report page.',
      remediation:
        'Pass the source the previous page was built from (its .md file or source directory) to --since instead.',
    });
  return records;
}

function unescapeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#x27|#39);/gu, (entity) => {
    switch (entity) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      default:
        return "'";
    }
  });
}

async function assertSinceDoesNotCollide(
  since: string,
  sourceFiles: readonly string[],
): Promise<void> {
  const sinceStat = await stat(since, { bigint: true });
  for (const sourceFile of sourceFiles) {
    const sourceStat = await stat(sourceFile, { bigint: true }).catch(() => undefined);
    if (
      sourceFile === since ||
      (sourceStat !== undefined &&
        sourceStat.dev === sinceStat.dev &&
        sourceStat.ino === sinceStat.ino)
    )
      throw new AgenticReportError({
        level: 'error',
        code: 'EDITION_SINCE_COLLIDES',
        message: `The previous edition is a file of the current source: ${sourceFile}`,
        remediation:
          'Pass the page the reader saw last, or a copy of the previous source kept outside the current one.',
        details: { since, source: sourceFile },
      });
  }
}

function unreadable(file: string, message: string): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'EDITION_SINCE_UNREADABLE',
    message,
    remediation:
      'Pass the previous page (.html or a directory with index.html) or its source (.md or a source directory).',
    details: { since: file, limitBytes: MAX_SINCE_PAGE_BYTES },
  });
}

function invalid(issues: readonly string[]): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'EDITION_RECORD_INVALID',
    message: 'The edition record of the previous page does not match contract version 1.',
    remediation: 'Pass the source the previous page was built from to --since instead.',
    details: { issues },
  });
}
