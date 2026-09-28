/**
 * Text settled at build time and the text blocks of stage 7: number agreement (`plural`), dates in a
 * declared zone (`time`), the source line (`source-line`), message mocks (`message`, `conversation`) and the
 * typographic roles (`eyebrow`, `muted`, `meta`). Each test names the defect it catches.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateReport } from '../../src/core/analyze-report.js';
import { buildReport } from '../../src/core/compiler.js';
import type { Diagnostic } from '../../src/contracts.js';
import { AgenticReportError } from '../../src/diagnostics.js';
import {
  formatMoment,
  momentInstant,
  parseMoment,
  pluralForm,
} from '../../src/blocks/number-and-time.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function page(body: string, language = 'en'): Promise<string> {
  const workspace = await createTestWorkspace('text-blocks');
  workspaces.push(workspace);
  await writeFile(
    path.join(workspace, 'report.md'),
    `---\ntitle: Text page\nlanguage: ${language}\n---\n\n${body}`,
  );
  return workspace;
}

async function html(body: string, language = 'en'): Promise<string> {
  const workspace = await page(body, language);
  const output = path.join(workspace, 'out.html');
  await buildReport({ input: workspace, output });
  const text = await readFile(output, 'utf8');
  return text.slice(text.indexOf('<main'), text.indexOf('</main>'));
}

async function failure(body: string, language = 'en'): Promise<readonly Diagnostic[]> {
  try {
    await validateReport({ input: await page(body, language) });
  } catch (error) {
    if (error instanceof AgenticReportError)
      return [error.diagnostic, ...(error.diagnostic.related ?? [])];
    throw error;
  }
  throw new Error('The page validated.');
}

describe('plural', () => {
  // Defect: one noun form for every number — «5 файла», «1 files».
  it('picks the form Intl.PluralRules gives for each language', () => {
    const ru = ['файл', 'файла', 'файлов'];
    expect([1, 2, 5, 11, 21, 22, 1.5, 0].map((value) => pluralForm(value, 'ru', ru))).toEqual([
      'файл',
      'файла',
      'файлов',
      'файлов',
      'файл',
      'файла',
      'файла',
      'файлов',
    ]);
    expect([1, 2, 0].map((value) => pluralForm(value, 'en', ['file', 'files']))).toEqual([
      'file',
      'files',
      'files',
    ]);
  });

  // Defect: the page carries the directive instead of final text, or loses the no-break space.
  it('writes the number and its noun as final text joined by a no-break space', async () => {
    const out = await html(
      'Found :plural[21]{forms="находку|находки|находок"} and :plural[12400]{forms="строку|строки|строк"}.\n',
      'ru',
    );
    const text = out.replace(/<[^>]+>/gu, '');
    expect(text).toContain('Found 21\u00a0находку and 12\u00a0400\u00a0строк.');
  });

  // Defect: a Russian page accepted with the two English forms, which picks wrong forms silently.
  it('asks for the forms the page language needs and for a plain number', async () => {
    const found = await failure(
      ':plural[5]{forms="file|files"} and :plural[five]{forms="файл|файла|файлов"}\n',
      'ru',
    );
    expect(found.map((diagnostic) => diagnostic.message).join('\n')).toMatch(
      /needs 3 noun forms[\s\S]*is not a plain number/u,
    );
  });
});

describe('time', () => {
  // Defect: a wall time read in the build machine's zone instead of the declared one.
  it('reads a wall time in the declared zone, across a daylight-saving change', () => {
    const moscow = parseMoment('2026-09-25T01:17');
    const newYork = parseMoment('2026-03-08T03:30');
    if (moscow === undefined || newYork === undefined) throw new Error('Parse failed.');
    expect(new Date(momentInstant(moscow, 'Europe/Moscow')).toISOString()).toBe(
      '2026-09-24T22:17:00.000Z',
    );
    // 03:30 on the day New York moves to summer time is EDT, UTC−4.
    expect(new Date(momentInstant(newYork, 'America/New_York')).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
    const offset = parseMoment('2026-09-25T01:17+03:00');
    if (offset === undefined) throw new Error('Parse failed.');
    expect(formatMoment(offset, 'UTC', 'datetime', 'en').datetime).toBe('2026-09-24T22:17:00Z');
  });

  // Defect: the time is shown without its zone, or in the other language's words.
  it('writes the moment in the page language with the zone named', async () => {
    const en = await html(':time[2026-09-25T01:17]{zone="Europe/Moscow"} :time[2026-09-24]\n');
    expect(en).toMatch(/<time [^>]*datetime="2026-09-24T22:17:00Z"/u);
    expect(en).toMatch(/September 25, 2026[^<]*01:17[^<]*GMT\+3/u);
    expect(en).toMatch(/<time [^>]*datetime="2026-09-24"/u);
    expect(en).toContain('September 24, 2026');
    const ru = await html(':time[2026-09-25T01:17]{zone="Europe/Moscow" show="time"}\n', 'ru');
    expect(ru).toMatch(/>01:17 GMT\+3</u);
  });

  // Defect: a time without a zone passes and is shown in whatever zone the build ran in.
  it('refuses a time without a zone, an unknown zone and an impossible date', async () => {
    const found = await failure(
      ':time[2026-09-25T01:17] :time[2026-09-25T01:17]{zone="Mars/Olympus"} :time[2026-02-30]\n',
    );
    expect(found.map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining('no zone says where'),
      expect.stringContaining('is not a time zone name'),
      expect.stringContaining('is not a date'),
    ]);
  });
});

describe('source', () => {
  // Defect: the source line is lost, lacks its label and date, or floats with nothing above it.
  it('writes a labelled source line with its date under the block before it', async () => {
    const out = await html(
      '| Stage | Items |\n| --- | --- |\n| Review | 9 |\n\n::source-line[Moira export of run 96, [212 records](https://example.com)]{date="2026-09-25T01:17" zone="Europe/Moscow"}\n',
    );
    expect(out).toMatch(
      /<p class="semantic-source-line" data-semantic="source-line"[^>]*><span class="semantic-source-line-label">Source:<\/span> Moira export of run 96, <a href="https:\/\/example.com"[^>]*>212 records<\/a> · <time datetime="2026-09-24T22:17:00Z">/u,
    );
    const ru = await html(
      '![Кадр](data:image/gif;base64,R0lGODlhAQABAAAAACw=)\n\n::source-line[Запись экрана]{date="2026-09-25"}\n',
      'ru',
    );
    expect(ru).toContain('Источник:');
    expect(ru).toContain('25 сентября 2026');
    const found = await failure('::source-line[Nothing above]\n');
    expect(found[0]?.code).toBe('SOURCE_LINE_WITHOUT_BLOCK');
  });
});

describe('message and conversation', () => {
  // Defect: a mock without sender and time, an invented number shown without the illustrative mark,
  // or messages that are not an ordered list for assistive technology.
  it('renders sender, time, status, side and the illustrative mark as accessible markup', async () => {
    const out = await html(
      [
        '::::conversation{title="Night run" illustrative="true"}',
        ':::message{from="Moira" time="01:17" status="delivered"}',
        'Review finished: **0 findings**.',
        ':::',
        ':::message{from="You" side="out"}',
        'Merge it.',
        ':::',
        '::::',
        '',
        ':::message{from="CI" time="09:41" status="failed"}',
        'Build 412 failed.',
        ':::',
        '',
      ].join('\n'),
    );
    expect(out).toMatch(/<figure class="semantic-conversation"[^>]*data-illustrative=""/u);
    expect(out).toContain(
      '<figcaption class="semantic-conversation-caption"><span class="semantic-conversation-title">Night run</span><span class="semantic-illustrative">Illustrative</span></figcaption>',
    );
    expect(out).toMatch(
      /<ol class="semantic-conversation-list"><li><article class="semantic-message"/u,
    );
    expect(out).toContain('aria-label="Message from Moira, 01:17"');
    expect(out).toContain(
      '<span class="semantic-message-from">Moira</span><span class="semantic-message-time">01:17</span>',
    );
    expect(out).toContain('<p class="semantic-message-status">delivered</p>');
    expect(out).toMatch(/data-side="out"/u);
    // The stand-alone notification is not illustrative: no mark.
    expect(out.match(/semantic-illustrative/gu)?.length).toBe(1);
  });

  // Defect: a conversation that accepts arbitrary content, losing the turn structure.
  it('accepts only messages inside a conversation', async () => {
    const found = await failure('::::conversation\nLoose text.\n::::\n');
    expect(found[0]?.code).toBe('INVALID_DIRECTIVE_CHILD');
  });
});

describe('typographic roles', () => {
  // Defect: an eyebrow written first in a section ends up under the section title.
  it('places an eyebrow above the section title and keeps muted and meta text as written', async () => {
    const out = await html(
      ':::section{title="Results"}\n::eyebrow[Stage 7 · data]\n\n**The run passed.** :muted[Two retries.] Taken from :meta[run 96].\n:::\n',
    );
    expect(out).toMatch(
      /<p class="semantic-eyebrow" data-semantic="eyebrow">Stage 7 · data<\/p><h2[^>]*class="semantic-section-title"/u,
    );
    expect(out).toContain('<span class="semantic-muted" data-semantic="muted">Two retries.</span>');
    expect(out).toContain('<span class="semantic-meta" data-semantic="meta">run 96</span>');
  });
});
