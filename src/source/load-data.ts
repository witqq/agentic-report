/**
 * Data files of a page (`data` in the manifest or frontmatter): confined JSON files the page reads at
 * build time. Each path is relative and stays inside the source root like a partial; the file is
 * addressed in the Markdown by its name without `.json` (`data/run-96.json` → `{{run-96.…}}`). The
 * loader reads and parses every file once for all language variants, and the files join the source
 * graph and its digests, so a change of data changes the report revision like a change of text.
 * Substitution itself happens in the Markdown phase (`src/render/page-data.ts`).
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { SourceLocation } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { sourceLocationFromOffsets } from './source-map.js';

/** A data file above this size is refused: a page shows a slice of data, not a dump. */
export const MAX_DATA_FILE_BYTES = 1_048_576;
/** Name of a data file without `.json`; it is the first segment of every path into the file. */
export const DATA_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;

export interface PageDataFile {
  readonly name: string;
  /** Canonical absolute path. */
  readonly file: string;
  readonly text: string;
  readonly value: unknown;
}

/** The data a page declared, by name. */
export interface PageData {
  readonly files: readonly PageDataFile[];
}

export async function loadPageData(
  references: readonly string[],
  sourceRoot: string,
  declaration: SourceLocation,
  resolveLocalPath: (root: string, reference: string, code: string) => Promise<string>,
): Promise<PageData> {
  const files: PageDataFile[] = [];
  const names = new Map<string, string>();
  for (const reference of references) {
    const refuse = (code: string, message: string, remediation: string, source = declaration) =>
      new AgenticReportError({
        level: 'error',
        code,
        message,
        remediation,
        source,
        details: { reference },
      });
    if (path.extname(reference).toLowerCase() !== '.json')
      throw refuse(
        'DATA_FILE_INVALID',
        `A data file must be a .json file: ${reference}`,
        'Declare JSON files only; derive other formats into JSON before the build.',
      );
    const name = path.basename(reference, path.extname(reference));
    if (!DATA_NAME_PATTERN.test(name))
      throw refuse(
        'DATA_FILE_INVALID',
        `The data file name ${name} cannot be addressed from the page.`,
        'Name the file in lowercase letters, digits and hyphens, starting with a letter, such as run-96.json.',
      );
    const previous = names.get(name);
    if (previous !== undefined)
      throw refuse(
        'DATA_FILE_INVALID',
        `Two data files share the name ${name}: ${previous} and ${reference}.`,
        'Rename one of them; a page addresses each data file by its name without .json.',
      );
    names.set(name, reference);
    let file: string;
    try {
      file = await resolveLocalPath(sourceRoot, reference, 'DATA_OUTSIDE_SOURCE');
    } catch (error) {
      if (!(error instanceof AgenticReportError)) throw error;
      throw new AgenticReportError(
        {
          ...error.diagnostic,
          source: declaration,
          details: { ...error.diagnostic.details, reference },
        },
        { cause: error },
      );
    }
    const info = await stat(file).catch(() => undefined);
    if (info === undefined || !info.isFile())
      throw refuse(
        'DATA_READ_FAILED',
        `Could not read the data file: ${reference}`,
        'Add the JSON file under the source directory or fix the path in data.',
      );
    if (info.size > MAX_DATA_FILE_BYTES)
      throw refuse(
        'DATA_FILE_TOO_LARGE',
        `The data file ${reference} is larger than ${MAX_DATA_FILE_BYTES} bytes.`,
        'Keep only the slice the page shows, or let a provider summarize the data.',
      );
    const text = await readFile(file, 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      const position = /position (\d+)/u.exec(error instanceof Error ? error.message : '');
      const offset = position?.[1] === undefined ? 0 : Number(position[1]);
      throw refuse(
        'DATA_JSON_INVALID',
        `The data file ${reference} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        'Fix the JSON syntax at the reported place.',
        sourceLocationFromOffsets(file, text, offset, Math.min(text.length, offset + 1)),
      );
    }
    files.push({ name, file, text, value });
  }
  return { files };
}
