/**
 * Единый дифф директивы `diff`: заголовки файлов, затем ханки `@@ -a,b +c,d @@`. Разбор один и для
 * проверки источника, и для разметки строк, поэтому номера строк на странице всегда те, что
 * проверены при сборке.
 */

export type DiffLineKind = 'header' | 'hunk' | 'context' | 'add' | 'remove' | 'note';

export interface DiffLine {
  readonly kind: DiffLineKind;
  /** Номер строки в старой версии файла; есть у строк контекста и удалённых. */
  readonly old?: number;
  /** Номер строки в новой версии файла; есть у строк контекста и добавленных. */
  readonly new?: number;
}

export type UnifiedDiffResult =
  | { readonly kind: 'valid'; readonly lines: readonly DiffLine[] }
  | { readonly kind: 'invalid'; readonly message: string; readonly remediation: string };

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const FILE_HEADER =
  /^(?:diff |index |--- |\+\+\+ |new file mode |deleted file mode |similarity |rename )/u;

export function parseUnifiedDiff(text: string): UnifiedDiffResult {
  const source = text.endsWith('\n') ? text.slice(0, -1) : text;
  const rows = source.split('\n');
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let hunks = 0;
  // Заголовки файла допустимы до первого ханка и после строки `diff`, открывающей следующий файл.
  let fileHeader = true;
  const unbalanced = (): UnifiedDiffResult => ({
    kind: 'invalid',
    message: `Diff hunk ${hunks} does not contain the line counts its @@ header declares.`,
    remediation:
      'Make each hunk hold exactly the old and new line counts of its @@ header, or copy the diff from git diff unchanged.',
  });
  for (const [index, row] of rows.entries()) {
    const header = HUNK_HEADER.exec(row);
    if (header !== null) {
      if (oldLeft !== 0 || newLeft !== 0) return unbalanced();
      hunks += 1;
      fileHeader = false;
      oldLine = Number(header[1]);
      oldLeft = header[2] === undefined ? 1 : Number(header[2]);
      newLine = Number(header[3]);
      newLeft = header[4] === undefined ? 1 : Number(header[4]);
      lines.push({ kind: 'hunk' });
      continue;
    }
    if (hunks === 0 || (oldLeft === 0 && newLeft === 0)) {
      if (FILE_HEADER.test(row) && (fileHeader || row.startsWith('diff '))) {
        if (row.startsWith('diff ')) fileHeader = true;
        lines.push({ kind: 'header' });
        continue;
      }
      if (row.startsWith('\\') && hunks > 0) {
        lines.push({ kind: 'note' });
        continue;
      }
      // Строка ханка после исчерпанного ханка — ханк длиннее своего заголовка.
      if (hunks > 0 && /^[ +-]/u.test(row)) return unbalanced();
      return {
        kind: 'invalid',
        message:
          hunks === 0
            ? `Diff line ${index + 1} appears before the first @@ hunk header.`
            : `Diff line ${index + 1} lies outside every hunk.`,
        remediation:
          'Start each hunk with an @@ -old,count +new,count @@ header; only file headers may come before it.',
      };
    }
    const marker = row[0];
    if (marker === '+') {
      if (newLeft === 0) return unbalanced();
      lines.push({ kind: 'add', new: newLine });
      newLine += 1;
      newLeft -= 1;
    } else if (marker === '-') {
      if (oldLeft === 0) return unbalanced();
      lines.push({ kind: 'remove', old: oldLine });
      oldLine += 1;
      oldLeft -= 1;
    } else if (marker === ' ' || row === '') {
      if (oldLeft === 0 || newLeft === 0) return unbalanced();
      lines.push({ kind: 'context', old: oldLine, new: newLine });
      oldLine += 1;
      newLine += 1;
      oldLeft -= 1;
      newLeft -= 1;
    } else if (marker === '\\') {
      lines.push({ kind: 'note' });
    } else {
      return {
        kind: 'invalid',
        message: `Diff line ${index + 1} starts with neither +, - nor a space.`,
        remediation: 'Prefix every hunk line with + (added), - (removed) or a space (unchanged).',
      };
    }
  }
  if (hunks === 0) {
    return {
      kind: 'invalid',
      message: 'A diff needs at least one @@ hunk.',
      remediation: 'Paste the unified diff of the change, as git diff prints it.',
    };
  }
  if (oldLeft !== 0 || newLeft !== 0) return unbalanced();
  return { kind: 'valid', lines };
}
