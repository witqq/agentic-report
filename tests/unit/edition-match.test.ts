import { describe, expect, it } from 'vitest';

import {
  compareEditions,
  diffSequences,
  diffText,
  pairSimilarBlocks,
  wordSegmenter,
} from '../../src/edition/match.js';
import {
  normalizeEditionText,
  type EditionBlock,
  type EditionRecord,
  type EditionSection,
} from '../../src/edition/record.js';

/**
 * Сопоставление двух записей редакции — чистые функции, поэтому каждый случай собирается записью
 * руками. Комментарий у проверки называет дефект, который она ловит, и контрпример, на котором
 * она падает.
 */

function section(id: string, title: string, authoredId = true, order = 0): EditionSection {
  return { id, authoredId, title, order };
}

function record(
  sections: readonly EditionSection[],
  blocks: readonly EditionBlock[],
  edition = 1,
): EditionRecord {
  return {
    contractVersion: 1,
    locale: 'en',
    edition,
    reportRevision: `sha256:${'a'.repeat(64)}`,
    sections: sections.map((entry, order) => ({ ...entry, order })),
    blocks,
  };
}

function paragraph(sectionId: string, text: string): EditionBlock {
  return { section: sectionId, kind: 'markdown:paragraph', text };
}

const storage = section('storage', 'Storage');
const network = section('network', 'Network');

describe('edition matching', () => {
  it('keeps the original score and tie ordering with packed similarity candidates', () => {
    // A lower score must never displace a higher one, and equal scores still prefer new then old index.
    const cases = [
      [
        ['cache frame alpha', 'cache frame beta'],
        ['cache frame gamma', 'cache frame delta'],
      ],
      [
        ['cache cache alpha', 'cache beta gamma'],
        ['cache beta delta', 'cache cache epsilon'],
      ],
      [
        ['old-only', 'alpha beta'],
        ['new-only', 'alpha gamma'],
      ],
      [
        ['alpha beta gamma', 'beta gamma delta', 'other'],
        ['beta gamma epsilon', 'alpha beta zeta'],
      ],
    ] as const;
    for (const [before, after] of cases) {
      const oldBlocks = before.map((text) => paragraph('storage', text));
      const newBlocks = after.map((text) => paragraph('storage', text));
      const oldIndexes = oldBlocks.map((_block, index) => index).reverse();
      const newIndexes = newBlocks.map((_block, index) => index).reverse();
      expect(pairSimilarBlocks(oldBlocks, newBlocks, oldIndexes, newIndexes).pairs).toEqual(
        referenceSimilarityPairs(oldBlocks, newBlocks),
      );
    }
    const oldBlocks = [
      paragraph('storage', 'shared words'),
      { ...paragraph('storage', 'shared words'), kind: 'markdown:heading' },
    ];
    const newBlocks = [
      { ...paragraph('storage', 'shared words'), kind: 'markdown:heading' },
      paragraph('storage', 'shared words'),
    ];
    expect(pairSimilarBlocks(oldBlocks, newBlocks, [0, 1], [0, 1]).pairs).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('tokenizes each block once and stores dense candidates as packed numbers', () => {
    // Dense boilerplate used to allocate one object and tokenize two texts for every candidate pair.
    const count = 64;
    const before = Array.from({ length: count }, (_, index) =>
      paragraph('storage', `shared boilerplate words old${index}`),
    );
    const after = Array.from({ length: count }, (_, index) =>
      paragraph('storage', `shared boilerplate words new${index}`),
    );
    const indexes = Array.from({ length: count }, (_, index) => index);
    let textReads = 0;
    for (const block of [...before, ...after]) {
      const text = block.text;
      Object.defineProperty(block, 'text', {
        get: () => {
          textReads += 1;
          return text;
        },
      });
    }
    const result = pairSimilarBlocks(before, after, indexes, indexes);
    expect(textReads).toBe(count * 2);
    expect(result.statistics).toEqual({
      wordBags: count * 2,
      candidates: count * count,
      candidateCapacity: count * count,
    });
    expect(result.pairs).toEqual(indexes.map((index) => [index, index]));
  });

  it('keeps exact equal boundaries around a fully disjoint sequence replacement', () => {
    // The no-common-key path must replace only the middle, preserving prefix/suffix anchors.
    const before = [
      'prefix',
      ...Array.from({ length: 2000 }, (_, index) => `old${index}`),
      'suffix',
    ];
    const after = [
      'prefix',
      ...Array.from({ length: 2000 }, (_, index) => `new${index}`),
      'suffix',
    ];
    expect(diffSequences(before, after)).toEqual([
      { kind: 'equal', oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 },
      { kind: 'change', oldStart: 1, oldEnd: 2001, newStart: 1, newEnd: 2001 },
      { kind: 'equal', oldStart: 2001, oldEnd: 2002, newStart: 2001, newEnd: 2002 },
    ]);
  });

  it('pairs an edited paragraph after an inserted one instead of calling it removed and added', () => {
    // Дефект: сопоставление по строке исходника, как у привязки ревью. Вставленный сверху абзац сдвигает
    // строки, и поправленный на одно слово абзац становится «удалён + добавлен».
    const previous = record(
      [storage],
      [
        paragraph('storage', 'The cache keeps frames in memory.'),
        paragraph('storage', 'Eviction starts when memory runs low.'),
      ],
    );
    const next = record(
      [storage],
      [
        paragraph('storage', 'A new paragraph about decoding.'),
        paragraph('storage', 'The cache keeps decoded frames in memory.'),
        paragraph('storage', 'Eviction starts when memory runs low.'),
      ],
    );
    const result = compareEditions(previous, next);
    expect(result.blocks.map((block) => block.status)).toEqual(['added', 'changed', 'unchanged']);
    expect(result.removed).toEqual([]);
    const hunks = result.blocks[1]?.inner?.text?.hunks ?? [];
    expect(hunks).toHaveLength(1);
    expect(next.blocks[1]?.text?.slice(hunks[0]?.newStart, hunks[0]?.newEnd)).toBe('decoded');
    expect(result.blocks[1]?.inner?.text?.words).toEqual({ added: 1, removed: 0 });
  });

  it('keeps a renamed and reordered section with an authored id as one section', () => {
    // Дефект: пары разделов по заголовку — переименованный раздел стал бы «удалён» и «новый», а все его
    // блоки — удалёнными и добавленными.
    const previous = record(
      [storage, network],
      [
        paragraph('storage', 'Frames live in memory.'),
        paragraph('network', 'Requests are batched.'),
      ],
    );
    const next = record(
      [section('network', 'Networking'), storage],
      [
        paragraph('network', 'Requests are batched.'),
        paragraph('storage', 'Frames live in memory.'),
      ],
    );
    const result = compareEditions(previous, next);
    expect(result.blocks.every((block) => block.status === 'unchanged')).toBe(true);
    const renamed = result.sections.find((entry) => entry.id === 'network');
    expect(renamed).toMatchObject({ status: 'changed', renamedFrom: 'Network' });
    expect(result.sections.some((entry) => entry.moved)).toBe(true);
    expect(result.removedSections).toEqual([]);
  });

  it('pairs a renamed section without an authored id by its shared blocks', () => {
    // Дефект: сгенерированный `id` меняется вместе с заголовком; без пары по общим блокам раздел стал бы
    // «удалён и новый».
    const previous = record(
      [section('overview', 'Overview', false)],
      [paragraph('overview', 'First.'), paragraph('overview', 'Second.')],
    );
    const next = record(
      [section('summary', 'Summary', false)],
      [paragraph('summary', 'First.'), paragraph('summary', 'Second.')],
    );
    const result = compareEditions(previous, next);
    expect(result.sections[0]).toMatchObject({ status: 'changed', renamedFrom: 'Overview' });
    expect(result.blocks.map((block) => block.status)).toEqual(['unchanged', 'unchanged']);
  });

  it('marks a paragraph carried to another section as moved', () => {
    // Дефект: без поиска перемещений абзац стал бы удалённым в одном разделе и новым в другом.
    const previous = record(
      [storage, network],
      [paragraph('storage', 'Stays.'), paragraph('network', 'Travels between sections.')],
    );
    const next = record(
      [storage, network],
      [paragraph('storage', 'Stays.'), paragraph('storage', 'Travels between sections.')],
    );
    const result = compareEditions(previous, next);
    expect(result.blocks[1]).toMatchObject({ status: 'moved', movedFrom: 'network' });
    expect(result.removed).toEqual([expect.objectContaining({ previous: 1, movedTo: 1 })]);
    expect(result.totals).toMatchObject({ moved: 1, removed: 0, added: 0 });
  });

  it('removes exactly one of two equal paragraphs whatever their order', () => {
    // Дефект: угадывание перемещения или удаления обоих одинаковых абзацев; результат зависел бы от порядка.
    const twin = 'Identical paragraph.';
    const previous = record(
      [storage],
      [paragraph('storage', twin), paragraph('storage', 'Between.'), paragraph('storage', twin)],
    );
    const nextA = record([storage], [paragraph('storage', twin), paragraph('storage', 'Between.')]);
    const nextB = record([storage], [paragraph('storage', 'Between.'), paragraph('storage', twin)]);
    for (const next of [nextA, nextB]) {
      const result = compareEditions(previous, next);
      expect(result.totals.removed).toBe(1);
      expect(result.totals.moved).toBe(0);
      expect(result.blocks.every((block) => block.status === 'unchanged')).toBe(true);
    }
  });

  it('sees a value that changed only in page data as a changed cell', () => {
    // Дефект: сравнение отпечатков исходника. Значение из JSON данных не меняет исходник блока, и таблица
    // осталась бы неизменной; запись хранит отрисованные ячейки.
    const table = (value: string): EditionBlock => ({
      section: 'storage',
      kind: 'markdown:table',
      rows: [
        ['Name', 'Size'],
        ['alpha', value],
      ],
    });
    const result = compareEditions(
      record([storage], [table('12')]),
      record([storage], [table('15')]),
    );
    expect(result.blocks[0]?.status).toBe('changed');
    const row = result.blocks[0]?.inner?.rows?.next[1];
    expect(row?.status).toBe('changed');
    expect(row?.inner?.[1]?.hunks[0]?.removed).toBe('12');
  });

  it('sees new image bytes under the same path as a changed block', () => {
    // Дефект: сравнение по пути картинки; новые байты под тем же именем прошли бы как неизменные.
    const image = (digest: string): EditionBlock => ({
      section: 'storage',
      kind: 'markdown:paragraph',
      media: [{ digest, alt: 'Diagram' }],
    });
    const result = compareEditions(
      record([storage], [image(`sha256:${'1'.repeat(64)}`)]),
      record([storage], [image(`sha256:${'2'.repeat(64)}`)]),
    );
    expect(result.blocks[0]).toMatchObject({ status: 'changed', inner: { media: true } });
  });

  it('ignores a difference only in kinds of spaces', () => {
    // Дефект: сравнение сырого текста; неразрывный пробел вместо обычного дал бы пометку «изменено».
    // Нормализация записи сводит любые пробелы к одному обычному, поэтому записи совпадают.
    const plain = normalizeEditionText('Ten frames per second.');
    const narrow = normalizeEditionText('Ten\u00a0frames\u202fper  second.');
    expect(narrow).toBe(plain);
    const result = compareEditions(
      record([storage], [paragraph('storage', plain)]),
      record([storage], [paragraph('storage', narrow)]),
    );
    expect(result.unchanged).toBe(true);
  });

  it('shows a paragraph rewritten by more than 60 % of its words as replaced, not word by word', () => {
    // Дефект: пословная каша на переписанном абзаце; флаг переписанного включает призрак вместо правок.
    const segmenter = wordSegmenter('en');
    const rewritten = diffText(
      'The player seeks quickly because frames stay in memory.',
      'Decoding happens lazily on a worker and results are streamed to the canvas.',
      segmenter,
    );
    expect(rewritten?.rewritten).toBe(true);
    const edited = diffText(
      'The player seeks quickly because frames stay in memory.',
      'The player seeks quickly because decoded frames stay in memory.',
      segmenter,
    );
    expect(edited?.rewritten).toBe(false);
  });

  it('compares diagrams by node id and edges by their ends', () => {
    // Дефект: сравнение схемы как текста подписи; переименованный узел и удалённая связь не были бы видны.
    const diagram = (label: string, withEdge: boolean): EditionBlock => ({
      section: 'storage',
      kind: 'directive:diagram',
      text: 'Map',
      nodes: [
        { id: 'api', label: 'API' },
        { id: 'cache', label },
      ],
      edges: withEdge ? [{ from: 'api', to: 'cache', label: 'reads' }] : [],
    });
    const result = compareEditions(
      record([storage], [diagram('Cache', true)]),
      record([storage], [diagram('Frame cache', false)]),
    );
    const inner = result.blocks[0]?.inner?.diagram;
    expect(inner?.nodes).toEqual([{ id: 'cache', status: 'changed' }]);
    expect(inner?.removedEdges).toEqual([{ from: 'API', to: 'Cache' }]);
  });

  it('diffs code by lines and lists by items', () => {
    // Дефект: пословный дифф кода и списка; строка кода и пункт — единицы, которые читатель сравнивает.
    const code = (lines: string[]): EditionBlock => ({
      section: 'storage',
      kind: 'markdown:code',
      lines,
    });
    const lines = compareEditions(
      record([storage], [code(['const a = 1;', 'const b = 2;', 'log(a + b);'])]),
      record([storage], [code(['const a = 1;', 'const b = 3;', 'log(a + b);'])]),
    ).blocks[0]?.inner?.lines;
    expect(lines?.next.map((line) => line.status)).toEqual(['same', 'added', 'same']);
    expect(lines?.removed).toEqual([{ previous: 1, before: 1 }]);

    const list = (items: string[]): EditionBlock => ({
      section: 'storage',
      kind: 'markdown:list',
      items,
    });
    const items = compareEditions(
      record([storage], [list(['one item', 'two item', 'three item'])]),
      record([storage], [list(['one item', 'three item', 'four item'])]),
    ).blocks[0]?.inner?.items;
    expect(items?.next.map((item) => item.status)).toEqual(['same', 'same', 'added']);
    expect(items?.removed).toEqual([{ previous: 1, before: 1 }]);
  });
});

/** Independent oracle: the original object-candidate scoring and greedy tie rules. */
function referenceSimilarityPairs(
  previous: readonly EditionBlock[],
  next: readonly EditionBlock[],
): readonly (readonly [number, number])[] {
  const bag = (text: string): Map<string, number> => {
    const result = new Map<string, number>();
    for (const word of text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
      result.set(word, (result.get(word) ?? 0) + 1);
    return result;
  };
  const candidates: { old: number; new: number; score: number }[] = [];
  previous.forEach((oldBlock, oldIndex) => {
    next.forEach((newBlock, newIndex) => {
      if (oldBlock.kind !== newBlock.kind) return;
      const oldWords = bag(oldBlock.text ?? '');
      const newWords = bag(newBlock.text ?? '');
      const total = [...oldWords.values(), ...newWords.values()].reduce(
        (sum, count) => sum + count,
        0,
      );
      const shared = [...newWords].reduce(
        (sum, [word, count]) => sum + Math.min(count, oldWords.get(word) ?? 0),
        0,
      );
      const score = total === 0 ? 1 : (2 * shared) / total;
      if (score >= 0.5) candidates.push({ old: oldIndex, new: newIndex, score });
    });
  });
  candidates.sort(
    (left, right) => right.score - left.score || left.new - right.new || left.old - right.old,
  );
  const oldUsed = new Set<number>();
  const newUsed = new Set<number>();
  const pairs: (readonly [number, number])[] = [];
  for (const candidate of candidates) {
    if (oldUsed.has(candidate.old) || newUsed.has(candidate.new)) continue;
    oldUsed.add(candidate.old);
    newUsed.add(candidate.new);
    pairs.push([candidate.old, candidate.new]);
  }
  return pairs;
}
