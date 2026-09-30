import { link, mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport, inspectReport, validateReport } from '../../src/index.js';
import { extractEditionRecords } from '../../src/edition/read-since.js';
import { EditionContractError, parseEditionRecord } from '../../src/edition/record.js';

/**
 * Запись редакции и контракт `--since`: сборка встраивает запись, следующая сборка читает её, и
 * результат несёт сводку без текста блоков. Каждая проверка называет дефект, который ловит.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'edition-'));
  roots.push(root);
  return root;
}

function page(body: readonly string[], language = 'en', extra: readonly string[] = []): string {
  return [
    '---',
    'title: Editions',
    `language: ${language}`,
    ...extra,
    '---',
    '',
    '# Editions',
    '',
    ...body,
    '',
  ].join('\n');
}

const FIRST = [
  '::::section{title="Storage" id="storage"}',
  '',
  'The cache keeps frames in memory.',
  '',
  'PRIVATE-MARKER-7f3a paragraph that will be removed.',
  '',
  '::::',
];

const SECOND = [
  '::::section{title="Storage" id="storage"}',
  '',
  'The cache keeps decoded frames in memory.',
  '',
  '::::',
];

async function source(root: string, name: string, body: readonly string[]): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'report.md'), page(body));
  return directory;
}

const validRecord = {
  contractVersion: 1,
  locale: 'en',
  edition: 1,
  reportRevision: `sha256:${'a'.repeat(64)}`,
  sections: [{ id: 'storage', authoredId: true, title: 'Storage', order: 0 }],
  blocks: [{ section: 'storage', kind: 'markdown:paragraph', text: 'Hello.' }],
};

describe('edition record contract', () => {
  it('rejects an unknown field, a foreign version and an oversized record with issues', () => {
    // Дефект: нестрогий разбор — чужая или испорченная запись молча сравнивалась бы как пустая.
    expect(parseEditionRecord(validRecord)).toEqual(validRecord);
    expect(() => parseEditionRecord({ ...validRecord, extra: true })).toThrow(EditionContractError);
    try {
      parseEditionRecord({
        ...validRecord,
        blocks: [{ ...validRecord.blocks[0], colour: 'red' }],
      });
    } catch (error) {
      expect((error as EditionContractError).issues).toContain('/blocks/0/colour: unknown field');
    }
    try {
      parseEditionRecord({ ...validRecord, contractVersion: 2 });
      expect.unreachable();
    } catch (error) {
      expect((error as EditionContractError).unsupportedVersion).toBe(true);
    }
    try {
      parseEditionRecord({
        ...validRecord,
        blocks: [{ section: 'storage', kind: 'markdown:paragraph', text: 'x'.repeat(2_000_001) }],
      });
      expect.unreachable();
    } catch (error) {
      expect((error as EditionContractError).issues[0]).toMatch(/larger than/u);
    }
  });

  it('embeds a record in every page and reads it back from the built HTML', async () => {
    // Дефект: запись, которую следующая сборка не может прочитать (экранирование шаблона), — `--since`
    // по странице отказывал бы всегда.
    const root = await workspace();
    const first = await source(root, 'first', FIRST);
    const output = path.join(root, 'first.html');
    await buildReport({ input: first, output });
    const records = extractEditionRecords(await readFile(output, 'utf8'));
    const record = records.get('en');
    expect(record?.edition).toBe(1);
    expect(record?.blocks.map((block) => block.text)).toEqual([
      'Editions',
      'The cache keeps frames in memory.',
      'PRIVATE-MARKER-7f3a paragraph that will be removed.',
    ]);
  });

  it('refuses a page without a record and accepts the previous source instead', async () => {
    // Дефект: страница без записи сравнивалась бы как пустая — вся новая страница помечена новой.
    const root = await workspace();
    const first = await source(root, 'first', FIRST);
    const second = await source(root, 'second', SECOND);
    const foreign = path.join(root, 'foreign.html');
    await writeFile(foreign, '<!doctype html><title>Not ours</title>');
    await expect(
      buildReport({ input: second, output: path.join(root, 'a.html'), since: foreign }),
    ).rejects.toMatchObject({ diagnostic: { code: 'EDITION_RECORD_MISSING' } });
    const result = await buildReport({
      input: second,
      output: path.join(root, 'b.html'),
      since: path.join(first, 'report.md'),
    });
    expect(result.changes?.totals).toMatchObject({ changed: 1, removed: 1 });
  });

  it('reads the previous page before writing the new one to the same path', async () => {
    // Дефект: чтение прошлой страницы после публикации — сборка сравнивала бы страницу саму с собой.
    const root = await workspace();
    const output = path.join(root, 'page.html');
    await buildReport({ input: await source(root, 'first', FIRST), output });
    const result = await buildReport({
      input: await source(root, 'second', SECOND),
      output,
      since: output,
    });
    expect(result.changes).toMatchObject({ edition: 2, since: { edition: 1 } });
    expect(extractEditionRecords(await readFile(output, 'utf8')).get('en')?.edition).toBe(2);
  });

  it('refuses a previous edition that is a hard link to a source file', async () => {
    // Дефект: `--since`, указывающий на сам исходник, сравнивал бы исходник с ним же.
    const root = await workspace();
    const second = await source(root, 'second', SECOND);
    const alias = path.join(root, 'alias.md');
    await link(path.join(second, 'report.md'), alias);
    await expect(
      buildReport({ input: second, output: path.join(root, 'out.html'), since: alias }),
    ).rejects.toMatchObject({ diagnostic: { code: 'EDITION_SINCE_COLLIDES' } });
  });

  it('warns and adds no marks when nothing changed, and builds the same bytes twice', async () => {
    // Дефект: слой изменений на неизменной странице, или время и пути в записи — байты разошлись бы.
    const root = await workspace();
    const first = await source(root, 'first', FIRST);
    const previous = path.join(root, 'previous.html');
    await buildReport({ input: first, output: previous });
    const a = path.join(root, 'a.html');
    const b = path.join(root, 'b.html');
    const result = await buildReport({ input: first, output: a, since: previous });
    await buildReport({ input: first, output: b, since: previous });
    expect(result.warnings.map((warning) => warning.code)).toContain('EDITION_UNCHANGED');
    const html = await readFile(a, 'utf8');
    expect(html).not.toMatch(/ data-change="/u);
    expect(html).toBe(await readFile(b, 'utf8'));
    const again = path.join(root, 'again.html');
    await buildReport({ input: first, output: again });
    expect(await readFile(again, 'utf8')).toBe(await readFile(previous, 'utf8'));
  });

  it('never puts the text of a removed block into build, inspect or validate results', async () => {
    // Дефект: тело блока в сводке — CLI вывел бы содержимое файла, которое по канону в NDJSON не попадает.
    const root = await workspace();
    const previous = path.join(root, 'previous.html');
    await buildReport({ input: await source(root, 'first', FIRST), output: previous });
    const second = await source(root, 'second', SECOND);
    const build = await buildReport({
      input: second,
      output: path.join(root, 'next.html'),
      since: previous,
      share: true,
    });
    const inspect = await inspectReport({ input: second, since: previous });
    const validate = await validateReport({ input: second, since: previous });
    expect(build.warnings.map((warning) => warning.code)).toContain('EDITION_REMOVED_TEXT_SHARED');
    expect(inspect.changes?.totals.removed).toBe(1);
    for (const value of [build, inspect, validate])
      expect(JSON.stringify(value)).not.toContain('PRIVATE-MARKER-7f3a');
    // Сам удалённый текст остаётся на странице призраком — поэтому и нужно предупреждение `--share`.
    expect(await readFile(path.join(root, 'next.html'), 'utf8')).toContain('PRIVATE-MARKER-7f3a');
  });

  it('ships the change layer controller only on a page built with --since, in both formats', async () => {
    // Дефект: код слоя изменений в общем рантайме — каждая страница платила бы за него весом, хотя
    // слой есть только у страницы, собранной с `--since`.
    const marker = 'agentic-report.edition-layer';
    const root = await workspace();
    const first = await source(root, 'first', FIRST);
    const second = await source(root, 'second', SECOND);
    const previous = path.join(root, 'previous.html');
    await buildReport({ input: first, output: previous });
    expect(await readFile(previous, 'utf8')).not.toContain(marker);
    const changed = path.join(root, 'changed.html');
    await buildReport({ input: second, output: changed, since: previous });
    expect(await readFile(changed, 'utf8')).toContain(marker);

    const runtimeOf = async (directory: string): Promise<string> => {
      const assets = await readdir(path.join(directory, 'assets'));
      const runtime = assets.find((name) => name.startsWith('runtime.'));
      expect(runtime).toBeDefined();
      return readFile(path.join(directory, 'assets', runtime ?? ''), 'utf8');
    };
    const plainSite = path.join(root, 'plain-site');
    await buildReport({ input: second, output: plainSite, format: 'directory' });
    expect(await runtimeOf(plainSite)).not.toContain(marker);
    const changedSite = path.join(root, 'changed-site');
    await buildReport({ input: second, output: changedSite, format: 'directory', since: previous });
    expect(await runtimeOf(changedSite)).toContain(marker);
  });

  it('gives each language its own record and layer', async () => {
    // Дефект: одна запись на страницу — правка русского текста пометила бы английскую версию.
    const root = await workspace();
    const write = async (name: string, russian: string): Promise<string> => {
      const directory = path.join(root, name);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'report.md'),
        page(['English paragraph stays.'], 'en', ['localizations:', '  ru: report.ru.md']),
      );
      await writeFile(path.join(directory, 'report.ru.md'), page([russian], 'ru'));
      return directory;
    };
    const previous = path.join(root, 'previous.html');
    await buildReport({ input: await write('first', 'Русский абзац.'), output: previous });
    const output = path.join(root, 'next.html');
    const result = await buildReport({
      input: await write('second', 'Русский абзац поправлен.'),
      output,
      since: previous,
    });
    expect(result.changes?.locale).toBe('en');
    expect(result.changes?.unchanged).toBe(true);
    const records = extractEditionRecords(await readFile(output, 'utf8'));
    expect(records.get('en')?.edition).toBe(1);
    expect(records.get('ru')?.edition).toBe(2);
  });
});
