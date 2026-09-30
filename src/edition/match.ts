/**
 * Сопоставление двух записей редакции: чистые функции без DOM и файлов.
 *
 * Разделы сначала спариваются по авторскому `id`, затем по доле общих блоков, затем по похожести
 * заголовка. Внутри пары разделов опоры — наибольшая общая подпоследовательность блоков с одинаковым
 * содержимым; между опорами блоки одного вида спариваются по похожести слов (коэффициент Дайса не
 * меньше 0,5), блок с `stableKey` — по ключу раньше всех. Удалённый и добавленный блоки с одинаковым
 * содержимым, если такая пара единственна, становятся перемещением. Внутри изменённого блока проза
 * сравнивается пословно (`Intl.Segmenter`, дифф Майерса), код — построчно, таблица — по строкам,
 * список — по пунктам, схема — по `id` узлов и связям, график — по серии и подписи точки.
 *
 * Сравнение механическое: оно не оценивает, важна ли правка.
 */

import type { EditionBlock, EditionRecord, EditionSection } from './record.js';

export type BlockStatus = 'unchanged' | 'changed' | 'added' | 'moved';
export type SectionStatus = 'unchanged' | 'changed' | 'added' | 'removed';

/** Правка прозы в символах нормализованных текстов: старый отрезок заменён новым. */
export interface TextHunk {
  readonly oldStart: number;
  readonly oldEnd: number;
  readonly newStart: number;
  readonly newEnd: number;
  /** Удалённый текст, как его видел читатель прошлой редакции. */
  readonly removed: string;
}

export interface TextDiff {
  readonly hunks: readonly TextHunk[];
  /** Изменено больше 60 % слов: блок показывается целиком заменённым, без пословной разметки. */
  readonly rewritten: boolean;
  readonly words: { readonly added: number; readonly removed: number };
}

/** Выравнивание последовательности (пункты, строки таблицы, строки кода) прошлой и новой редакции. */
export interface SequenceAlignment<Inner> {
  /** Состояние каждого нового элемента по его индексу. */
  readonly next: readonly {
    readonly status: 'same' | 'changed' | 'added';
    readonly previous?: number;
    readonly inner?: Inner;
  }[];
  /** Удалённые элементы и индекс нового элемента, перед которым они стояли (длина — в конце). */
  readonly removed: readonly { readonly previous: number; readonly before: number }[];
}

export interface DiagramDiff {
  readonly nodes: readonly { readonly id: string; readonly status: 'added' | 'changed' }[];
  readonly edges: readonly { readonly index: number; readonly status: 'added' | 'changed' }[];
  readonly removedNodes: readonly string[];
  readonly removedEdges: readonly { readonly from: string; readonly to: string }[];
}

export interface PointsDiff {
  readonly changed: readonly {
    readonly series: string;
    readonly label: string;
    readonly previous: string;
    readonly value: string;
  }[];
  readonly added: readonly { readonly series: string; readonly label: string }[];
  readonly removed: readonly { readonly series: string; readonly label: string }[];
}

export interface InnerDiff {
  readonly text?: TextDiff;
  readonly items?: SequenceAlignment<TextDiff>;
  readonly rows?: SequenceAlignment<readonly (TextDiff | undefined)[]>;
  readonly lines?: SequenceAlignment<undefined>;
  readonly diagram?: DiagramDiff;
  readonly points?: PointsDiff;
  /** Байты картинки или её `alt` изменились. */
  readonly media?: boolean;
  /** Блок больше пределов сравнения: помечен целиком, без внутренних правок. */
  readonly whole?: boolean;
}

export interface BlockMatch {
  readonly next: number;
  readonly status: BlockStatus;
  readonly previous?: number;
  readonly inner?: InnerDiff;
  /** Раздел прошлой редакции, из которого блок переехал. */
  readonly movedFrom?: string;
}

export interface RemovedBlock {
  readonly previous: number;
  /** Перемещённый блок оставляет на старом месте ссылку на новый. */
  readonly movedTo?: number;
  /** Новый блок, после которого стоял удалённый; нет — он стоял в начале своего раздела. */
  readonly after?: number;
  /** Раздел новой редакции, в который он попадает; `''` — до первого раздела. */
  readonly section: string;
  /** Весь раздел удалён: призрак раздела вместо призраков блоков. */
  readonly sectionRemoved: boolean;
}

export interface SectionMatch {
  readonly id: string;
  readonly status: SectionStatus;
  readonly previous?: string;
  readonly renamedFrom?: string;
  /** Раздел стоит в другом порядке относительно остальных. */
  readonly moved: boolean;
}

export interface RemovedSection {
  readonly previous: string;
  /** Новый раздел, после которого стоял удалённый; нет — до первого. */
  readonly after?: string;
}

export interface EditionTotals {
  readonly unchanged: number;
  readonly changed: number;
  readonly added: number;
  readonly removed: number;
  readonly moved: number;
}

export interface EditionComparison {
  readonly blocks: readonly BlockMatch[];
  readonly removed: readonly RemovedBlock[];
  readonly sections: readonly SectionMatch[];
  readonly removedSections: readonly RemovedSection[];
  readonly totals: EditionTotals;
  /** Ни один блок и ни один раздел не изменились. */
  readonly unchanged: boolean;
}

/** Пределы сравнения: сверх них блок помечается целиком, без внутренних правок. */
export const MAX_DIFF_WORDS = 5000;
export const MAX_DIFF_LINES = 5000;
const REWRITE_SHARE = 0.6;
const PAIR_SIMILARITY = 0.5;
const SECTION_OVERLAP = 0.5;
/** Цена дифа, после которой считать правку по частям бессмысленно: всё заменено. */
const MAX_EDIT_COST = 4000;

export function compareEditions(
  previous: EditionRecord,
  next: EditionRecord,
  language?: string,
): EditionComparison {
  const segmenter = wordSegmenter(language ?? next.locale);
  const sectionPairs = pairSections(previous, next);
  const blockResults = new Map<number, BlockMatch>();
  const removedByPrevious = new Map<number, RemovedBlock>();
  const nextBySection = groupBlocks(next.blocks);
  const previousBySection = groupBlocks(previous.blocks);

  for (const [previousId, nextId] of sectionPairs.pairs) {
    const oldIndexes = previousBySection.get(previousId) ?? [];
    const newIndexes = nextBySection.get(nextId) ?? [];
    const pairs = pairBlocks(previous.blocks, next.blocks, oldIndexes, newIndexes);
    const matchedNew = new Set<number>();
    for (const [oldIndex, newIndex] of pairs) {
      matchedNew.add(newIndex);
      const oldBlock = previous.blocks[oldIndex] as EditionBlock;
      const newBlock = next.blocks[newIndex] as EditionBlock;
      const same = blockHash(oldBlock) === blockHash(newBlock);
      blockResults.set(
        newIndex,
        same
          ? { next: newIndex, status: 'unchanged', previous: oldIndex }
          : {
              next: newIndex,
              status: 'changed',
              previous: oldIndex,
              inner: innerDiff(oldBlock, newBlock, segmenter),
            },
      );
    }
    for (const newIndex of newIndexes)
      if (!matchedNew.has(newIndex))
        blockResults.set(newIndex, { next: newIndex, status: 'added' });
    const matchedOld = new Map(pairs.map(([oldIndex, newIndex]) => [oldIndex, newIndex]));
    let lastAnchor: number | undefined;
    for (const oldIndex of oldIndexes) {
      const paired = matchedOld.get(oldIndex);
      if (paired !== undefined) {
        lastAnchor = paired;
        continue;
      }
      removedByPrevious.set(oldIndex, {
        previous: oldIndex,
        ...(lastAnchor === undefined ? {} : { after: lastAnchor }),
        section: nextId,
        sectionRemoved: false,
      });
    }
  }
  // Блоки нового раздела без пары — новые; блоки удалённого раздела — удалённые вместе с ним.
  for (const section of next.sections) {
    if (sectionPairs.nextToPrevious.has(section.id)) continue;
    for (const newIndex of nextBySection.get(section.id) ?? [])
      blockResults.set(newIndex, { next: newIndex, status: 'added' });
  }
  if (!sectionPairs.nextToPrevious.has('') && nextBySection.has(''))
    for (const newIndex of nextBySection.get('') ?? [])
      blockResults.set(newIndex, { next: newIndex, status: 'added' });
  const removedSections: RemovedSection[] = [];
  for (const section of previous.sections) {
    if (sectionPairs.previousToNext.has(section.id)) continue;
    const after = precedingPairedSection(
      previous.sections,
      section.id,
      sectionPairs.previousToNext,
    );
    removedSections.push({ previous: section.id, ...(after === undefined ? {} : { after }) });
    for (const oldIndex of previousBySection.get(section.id) ?? [])
      removedByPrevious.set(oldIndex, {
        previous: oldIndex,
        section: after ?? '',
        sectionRemoved: true,
      });
  }

  detectMoves(previous, next, blockResults, removedByPrevious);

  const blocks = next.blocks.map(
    (_block, index) => blockResults.get(index) ?? { next: index, status: 'added' as const },
  );
  const removed = [...removedByPrevious.values()].sort(
    (left, right) => left.previous - right.previous,
  );

  const changedSections = new Set<string>();
  for (const match of blocks)
    if (match.status !== 'unchanged')
      changedSections.add((next.blocks[match.next] as EditionBlock).section);
  for (const entry of removed) if (!entry.sectionRemoved) changedSections.add(entry.section);
  const orderMoved = movedSections(previous, sectionPairs.pairs);
  const previousTitles = new Map(previous.sections.map((section) => [section.id, section.title]));
  const sections: SectionMatch[] = next.sections.map((section) => {
    const previousId = sectionPairs.nextToPrevious.get(section.id);
    if (previousId === undefined) return { id: section.id, status: 'added', moved: false };
    const previousTitle = previousTitles.get(previousId);
    const renamed = previousTitle !== undefined && previousTitle !== section.title;
    const moved = orderMoved.has(section.id);
    return {
      id: section.id,
      status: renamed || moved || changedSections.has(section.id) ? 'changed' : 'unchanged',
      previous: previousId,
      ...(renamed ? { renamedFrom: previousTitle } : {}),
      moved,
    };
  });

  const totals: EditionTotals = {
    unchanged: blocks.filter((block) => block.status === 'unchanged').length,
    changed: blocks.filter((block) => block.status === 'changed').length,
    added: blocks.filter((block) => block.status === 'added').length,
    removed: removed.filter((block) => block.movedTo === undefined).length,
    moved: blocks.filter((block) => block.status === 'moved').length,
  };
  return {
    blocks,
    removed,
    sections,
    removedSections,
    totals,
    unchanged:
      totals.changed + totals.added + totals.removed + totals.moved === 0 &&
      sections.every((section) => section.status === 'unchanged') &&
      removedSections.length === 0,
  };
}

/* ---------- Разделы ---------- */

interface SectionPairs {
  /** Пары в порядке новой редакции: прошлый `id` → новый `id`. */
  readonly pairs: readonly (readonly [string, string])[];
  readonly previousToNext: ReadonlyMap<string, string>;
  readonly nextToPrevious: ReadonlyMap<string, string>;
}

function pairSections(previous: EditionRecord, next: EditionRecord): SectionPairs {
  const previousToNext = new Map<string, string>();
  const nextToPrevious = new Map<string, string>();
  const link = (oldId: string, newId: string): void => {
    previousToNext.set(oldId, newId);
    nextToPrevious.set(newId, oldId);
  };
  // Начало страницы до первого раздела — всегда одно и то же место.
  if (
    previous.blocks.some((block) => block.section === '') ||
    next.blocks.some((block) => block.section === '')
  )
    link('', '');
  const oldById = new Map(previous.sections.map((section) => [section.id, section]));
  for (const section of next.sections) {
    const old = oldById.get(section.id);
    if (old?.authoredId === true && section.authoredId) link(old.id, section.id);
  }
  // Сгенерированный `id` следует за заголовком: тот же `id` — тот же заголовок.
  for (const section of next.sections) {
    if (nextToPrevious.has(section.id)) continue;
    const old = oldById.get(section.id);
    if (old !== undefined && !previousToNext.has(old.id)) link(old.id, section.id);
  }
  const hashesOf = (record: EditionRecord): Map<string, Set<string>> => {
    const result = new Map<string, Set<string>>();
    for (const block of record.blocks) {
      const set = result.get(block.section) ?? new Set<string>();
      set.add(blockHash(block));
      result.set(block.section, set);
    }
    return result;
  };
  const oldHashes = hashesOf(previous);
  const newHashes = hashesOf(next);
  const candidates: { oldId: string; newId: string; overlap: number; title: number }[] = [];
  for (const newSection of next.sections) {
    if (nextToPrevious.has(newSection.id)) continue;
    for (const oldSection of previous.sections) {
      if (previousToNext.has(oldSection.id)) continue;
      const overlap = jaccard(
        oldHashes.get(oldSection.id) ?? new Set(),
        newHashes.get(newSection.id) ?? new Set(),
      );
      if (overlap < SECTION_OVERLAP) continue;
      candidates.push({
        oldId: oldSection.id,
        newId: newSection.id,
        overlap,
        title: dice(words(oldSection.title), words(newSection.title)),
      });
    }
  }
  candidates.sort(
    (left, right) =>
      right.overlap - left.overlap ||
      right.title - left.title ||
      compareText(left.newId, right.newId) ||
      compareText(left.oldId, right.oldId),
  );
  for (const candidate of candidates) {
    if (previousToNext.has(candidate.oldId) || nextToPrevious.has(candidate.newId)) continue;
    link(candidate.oldId, candidate.newId);
  }
  const order = ['', ...next.sections.map((section) => section.id)];
  const pairs = order.flatMap((newId) => {
    const oldId = nextToPrevious.get(newId);
    return oldId === undefined ? [] : [[oldId, newId] as const];
  });
  return { pairs, previousToNext, nextToPrevious };
}

function precedingPairedSection(
  sections: readonly EditionSection[],
  id: string,
  previousToNext: ReadonlyMap<string, string>,
): string | undefined {
  const index = sections.findIndex((section) => section.id === id);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const paired = previousToNext.get((sections[cursor] as EditionSection).id);
    if (paired !== undefined) return paired;
  }
  return undefined;
}

/** Разделы вне наибольшей общей подпоследовательности порядка пар — переставлены. */
function movedSections(
  previous: EditionRecord,
  pairs: readonly (readonly [string, string])[],
): Set<string> {
  const oldOrder = new Map(previous.sections.map((section, index) => [section.id, index]));
  const paired = pairs.filter(([oldId]) => oldId !== '');
  const newSequence = paired.map(([oldId]) => oldOrder.get(oldId) ?? 0);
  const sortedOld = [...newSequence].sort((left, right) => left - right);
  const kept = lcsIndexes(sortedOld, newSequence);
  const moved = new Set<string>();
  paired.forEach(([, newId], index) => {
    if (!kept.has(index)) moved.add(newId);
  });
  return moved;
}

/* ---------- Блоки ---------- */

function groupBlocks(blocks: readonly EditionBlock[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    const list = result.get(block.section) ?? [];
    list.push(index);
    result.set(block.section, list);
  });
  return result;
}

/** Пары блоков одной пары разделов: `[прошлый индекс, новый индекс]` в порядке новой редакции. */
function pairBlocks(
  previous: readonly EditionBlock[],
  next: readonly EditionBlock[],
  oldIndexes: readonly number[],
  newIndexes: readonly number[],
): (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [];
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  // Явный `id` сильнее всего.
  const oldByKey = new Map<string, number>();
  for (const index of oldIndexes) {
    const key = (previous[index] as EditionBlock).stableKey;
    if (key !== undefined) oldByKey.set(key, index);
  }
  for (const index of newIndexes) {
    const key = (next[index] as EditionBlock).stableKey;
    const old = key === undefined ? undefined : oldByKey.get(key);
    if (old === undefined) continue;
    pairs.push([old, index]);
    usedOld.add(old);
    usedNew.add(index);
  }
  const restOld = oldIndexes.filter((index) => !usedOld.has(index));
  const restNew = newIndexes.filter((index) => !usedNew.has(index));
  const oldKeys = restOld.map(
    (index) =>
      `${(previous[index] as EditionBlock).kind}\0${blockHash(previous[index] as EditionBlock)}`,
  );
  const newKeys = restNew.map(
    (index) => `${(next[index] as EditionBlock).kind}\0${blockHash(next[index] as EditionBlock)}`,
  );
  const script = diffSequences(oldKeys, newKeys);
  // Опоры — неизменённые блоки; между соседними опорами блоки спариваются по похожести.
  for (const region of script) {
    if (region.kind === 'equal') {
      for (let offset = 0; offset < region.oldEnd - region.oldStart; offset += 1)
        pairs.push([
          restOld[region.oldStart + offset] as number,
          restNew[region.newStart + offset] as number,
        ]);
      continue;
    }
    const gapOld = restOld.slice(region.oldStart, region.oldEnd);
    const gapNew = restNew.slice(region.newStart, region.newEnd);
    pairs.push(...pairSimilarBlocks(previous, next, gapOld, gapNew).pairs);
  }
  return pairs.sort((left, right) => left[1] - right[1]);
}

/**
 * Удалённый и добавленный блоки с одинаковым содержимым становятся перемещением, если такая пара
 * единственна: два одинаковых абзаца не угадываются и остаются удалённым и добавленным.
 */
function detectMoves(
  previous: EditionRecord,
  next: EditionRecord,
  blockResults: Map<number, BlockMatch>,
  removedByPrevious: Map<number, RemovedBlock>,
): void {
  const addedByHash = new Map<string, number[]>();
  for (const [index, match] of blockResults) {
    if (match.status !== 'added') continue;
    const hash = blockHash(next.blocks[index] as EditionBlock);
    addedByHash.set(hash, [...(addedByHash.get(hash) ?? []), index]);
  }
  const removedByHash = new Map<string, number[]>();
  for (const [index] of removedByPrevious) {
    const hash = blockHash(previous.blocks[index] as EditionBlock);
    removedByHash.set(hash, [...(removedByHash.get(hash) ?? []), index]);
  }
  for (const [hash, added] of addedByHash) {
    const removed = removedByHash.get(hash);
    if (added.length !== 1 || removed?.length !== 1) continue;
    const newIndex = added[0] as number;
    const oldIndex = removed[0] as number;
    const oldBlock = previous.blocks[oldIndex] as EditionBlock;
    if (isEmptyBlock(oldBlock)) continue;
    blockResults.set(newIndex, {
      next: newIndex,
      status: 'moved',
      previous: oldIndex,
      movedFrom: oldBlock.section,
    });
    const entry = removedByPrevious.get(oldIndex) as RemovedBlock;
    removedByPrevious.set(oldIndex, { ...entry, movedTo: newIndex });
  }
}

function isEmptyBlock(block: EditionBlock): boolean {
  return blockHash(block) === blockHash({ section: '', kind: block.kind });
}

/* ---------- Внутри блока ---------- */

function innerDiff(
  previous: EditionBlock,
  next: EditionBlock,
  segmenter: Intl.Segmenter,
): InnerDiff {
  const result: {
    text?: TextDiff;
    items?: SequenceAlignment<TextDiff>;
    rows?: SequenceAlignment<readonly (TextDiff | undefined)[]>;
    lines?: SequenceAlignment<undefined>;
    diagram?: DiagramDiff;
    points?: PointsDiff;
    media?: boolean;
    whole?: boolean;
  } = {};
  if ((previous.text ?? '') !== (next.text ?? '')) {
    const text = diffText(previous.text ?? '', next.text ?? '', segmenter);
    if (text === undefined) result.whole = true;
    else result.text = text;
  }
  if (previous.items !== undefined || next.items !== undefined) {
    const items = alignTexts(previous.items ?? [], next.items ?? [], segmenter);
    if (items === undefined) result.whole = true;
    else result.items = items;
  }
  if (previous.rows !== undefined || next.rows !== undefined) {
    const rows = alignRows(previous.rows ?? [], next.rows ?? [], segmenter);
    if (rows === undefined) result.whole = true;
    else result.rows = rows;
  }
  if (previous.lines !== undefined || next.lines !== undefined) {
    const lines = alignLines(previous.lines ?? [], next.lines ?? []);
    if (lines === undefined) result.whole = true;
    else result.lines = lines;
  }
  if (
    previous.nodes !== undefined ||
    next.nodes !== undefined ||
    previous.edges !== undefined ||
    next.edges !== undefined
  )
    result.diagram = diffDiagram(previous, next);
  if (previous.points !== undefined || next.points !== undefined)
    result.points = diffPoints(previous.points ?? [], next.points ?? []);
  if (JSON.stringify(previous.media ?? []) !== JSON.stringify(next.media ?? []))
    result.media = true;
  return result;
}

/** Пословная правка прозы; `undefined` — текст длиннее предела сравнения. */
export function diffText(
  previous: string,
  next: string,
  segmenter: Intl.Segmenter,
): TextDiff | undefined {
  const oldTokens = tokenize(previous, segmenter);
  const newTokens = tokenize(next, segmenter);
  const oldWords = oldTokens.filter((token) => token.word).length;
  const newWords = newTokens.filter((token) => token.word).length;
  if (oldWords > MAX_DIFF_WORDS || newWords > MAX_DIFF_WORDS) return undefined;
  const script = diffSequences(
    oldTokens.map((token) => token.text),
    newTokens.map((token) => token.text),
    MAX_EDIT_COST,
  );
  const regions = mergeRegions(script, oldTokens);
  let addedWords = 0;
  let removedWords = 0;
  const hunks: TextHunk[] = [];
  for (const region of regions) {
    const removedTokens = oldTokens.slice(region.oldStart, region.oldEnd);
    const addedTokens = newTokens.slice(region.newStart, region.newEnd);
    removedWords += removedTokens.filter((token) => token.word).length;
    addedWords += addedTokens.filter((token) => token.word).length;
    const oldStart = oldTokens[region.oldStart]?.start ?? previous.length;
    const oldEnd =
      region.oldEnd > region.oldStart ? (oldTokens[region.oldEnd - 1] as Token).end : oldStart;
    const newStart = newTokens[region.newStart]?.start ?? next.length;
    const newEnd =
      region.newEnd > region.newStart ? (newTokens[region.newEnd - 1] as Token).end : newStart;
    const trimmed = trimHunk(previous, next, { oldStart, oldEnd, newStart, newEnd });
    if (trimmed === undefined) continue;
    hunks.push(trimmed);
  }
  const total = oldWords + newWords;
  const rewritten = total > 0 && (addedWords + removedWords) / total > REWRITE_SHARE;
  return { hunks, rewritten, words: { added: addedWords, removed: removedWords } };
}

/** Пробелы по краям правки не подчёркиваются и не зачёркиваются. */
function trimHunk(
  previous: string,
  next: string,
  range: { oldStart: number; oldEnd: number; newStart: number; newEnd: number },
): TextHunk | undefined {
  let { oldStart, oldEnd, newStart, newEnd } = range;
  while (oldStart < oldEnd && previous[oldStart] === ' ') oldStart += 1;
  while (oldEnd > oldStart && previous[oldEnd - 1] === ' ') oldEnd -= 1;
  while (newStart < newEnd && next[newStart] === ' ') newStart += 1;
  while (newEnd > newStart && next[newEnd - 1] === ' ') newEnd -= 1;
  if (oldStart === oldEnd && newStart === newEnd) return undefined;
  return { oldStart, oldEnd, newStart, newEnd, removed: previous.slice(oldStart, oldEnd) };
}

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly word: boolean;
}

function tokenize(text: string, segmenter: Intl.Segmenter): Token[] {
  const tokens: Token[] = [];
  for (const segment of segmenter.segment(text)) {
    tokens.push({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
      word: segment.isWordLike === true || /[\p{L}\p{N}]/u.test(segment.segment),
    });
  }
  return tokens;
}

/**
 * Правки, между которыми меньше двух равных слов, склеиваются в одну: иначе пословная разметка
 * рябит через слово.
 */
function mergeRegions(
  script: readonly EditRegion[],
  oldTokens: readonly Token[],
): { oldStart: number; oldEnd: number; newStart: number; newEnd: number }[] {
  const changes: { oldStart: number; oldEnd: number; newStart: number; newEnd: number }[] = [];
  let pendingEqual: EditRegion | undefined;
  for (const region of script) {
    if (region.kind === 'equal') {
      pendingEqual = region;
      continue;
    }
    const last = changes.at(-1);
    const equalWords =
      pendingEqual === undefined
        ? 0
        : oldTokens.slice(pendingEqual.oldStart, pendingEqual.oldEnd).filter((token) => token.word)
            .length;
    if (last !== undefined && pendingEqual !== undefined && equalWords < 2) {
      last.oldEnd = region.oldEnd;
      last.newEnd = region.newEnd;
    } else if (last !== undefined && pendingEqual === undefined) {
      last.oldEnd = region.oldEnd;
      last.newEnd = region.newEnd;
    } else {
      changes.push({
        oldStart: region.oldStart,
        oldEnd: region.oldEnd,
        newStart: region.newStart,
        newEnd: region.newEnd,
      });
    }
    pendingEqual = undefined;
  }
  return changes;
}

function alignTexts(
  previous: readonly string[],
  next: readonly string[],
  segmenter: Intl.Segmenter,
): SequenceAlignment<TextDiff> | undefined {
  return alignSequence(previous, next, {
    key: (value) => value,
    similar: (left, right) => dice(words(left), words(right)) >= PAIR_SIMILARITY,
    inner: (left, right) => diffText(left, right, segmenter),
  });
}

function alignRows(
  previous: readonly (readonly string[])[],
  next: readonly (readonly string[])[],
  segmenter: Intl.Segmenter,
): SequenceAlignment<readonly (TextDiff | undefined)[]> | undefined {
  return alignSequence(previous, next, {
    key: (row) => row.join('\u0001'),
    // Строка таблицы узнаётся по первой ячейке, затем по позиции.
    firstCell: (row) => row[0] ?? '',
    similar: () => true,
    inner: (left, right) => {
      const cells: (TextDiff | undefined)[] = [];
      for (let index = 0; index < right.length; index += 1) {
        const before = left[index] ?? '';
        const after = right[index] ?? '';
        cells.push(before === after ? undefined : diffText(before, after, segmenter));
      }
      return cells;
    },
  });
}

function alignLines(
  previous: readonly string[],
  next: readonly string[],
): SequenceAlignment<undefined> | undefined {
  if (previous.length > MAX_DIFF_LINES || next.length > MAX_DIFF_LINES) return undefined;
  const script = diffSequences(previous, next, MAX_EDIT_COST);
  const status: SequenceAlignment<undefined>['next'][number][] = [];
  const removed: { previous: number; before: number }[] = [];
  for (const region of script) {
    if (region.kind === 'equal') {
      for (let offset = 0; offset < region.newEnd - region.newStart; offset += 1)
        status[region.newStart + offset] = { status: 'same', previous: region.oldStart + offset };
      continue;
    }
    for (let index = region.oldStart; index < region.oldEnd; index += 1)
      removed.push({ previous: index, before: region.newStart });
    for (let index = region.newStart; index < region.newEnd; index += 1)
      status[index] = { status: 'added' };
  }
  return { next: status, removed };
}

function alignSequence<Item, Inner>(
  previous: readonly Item[],
  next: readonly Item[],
  options: {
    readonly key: (item: Item) => string;
    readonly firstCell?: (item: Item) => string;
    readonly similar: (left: Item, right: Item) => boolean;
    readonly inner: (left: Item, right: Item) => Inner | undefined;
  },
): SequenceAlignment<Inner> | undefined {
  if (previous.length > MAX_DIFF_LINES || next.length > MAX_DIFF_LINES) return undefined;
  const script = diffSequences(previous.map(options.key), next.map(options.key), MAX_EDIT_COST);
  const status: { status: 'same' | 'changed' | 'added'; previous?: number; inner?: Inner }[] = [];
  const removedIndexes: number[] = [];
  for (const region of script) {
    if (region.kind === 'equal') {
      for (let offset = 0; offset < region.newEnd - region.newStart; offset += 1)
        status[region.newStart + offset] = { status: 'same', previous: region.oldStart + offset };
      continue;
    }
    const gapOld = range(region.oldStart, region.oldEnd);
    const gapNew = range(region.newStart, region.newEnd);
    const pairs = new Map<number, number>();
    const takenOld = new Set<number>();
    if (options.firstCell !== undefined) {
      const first = options.firstCell;
      for (const newIndex of gapNew) {
        const match = gapOld.find(
          (oldIndex) =>
            !takenOld.has(oldIndex) &&
            first(previous[oldIndex] as Item) === first(next[newIndex] as Item),
        );
        if (match === undefined) continue;
        pairs.set(newIndex, match);
        takenOld.add(match);
      }
      // Затем по позиции: оставшиеся строки промежутка спариваются по порядку.
      const restOld = gapOld.filter((index) => !takenOld.has(index));
      const restNew = gapNew.filter((index) => !pairs.has(index));
      const count = Math.min(restOld.length, restNew.length);
      for (let offset = 0; offset < count; offset += 1) {
        const oldIndex = restOld[offset] as number;
        pairs.set(restNew[offset] as number, oldIndex);
        takenOld.add(oldIndex);
      }
    } else {
      for (const newIndex of gapNew) {
        const match = gapOld.find(
          (oldIndex) =>
            !takenOld.has(oldIndex) &&
            options.similar(previous[oldIndex] as Item, next[newIndex] as Item),
        );
        if (match === undefined) continue;
        pairs.set(newIndex, match);
        takenOld.add(match);
      }
    }
    for (const newIndex of gapNew) {
      const oldIndex = pairs.get(newIndex);
      if (oldIndex === undefined) {
        status[newIndex] = { status: 'added' };
        continue;
      }
      const inner = options.inner(previous[oldIndex] as Item, next[newIndex] as Item);
      status[newIndex] = {
        status: 'changed',
        previous: oldIndex,
        ...(inner === undefined ? {} : { inner }),
      };
    }
    for (const oldIndex of gapOld) if (!takenOld.has(oldIndex)) removedIndexes.push(oldIndex);
  }
  // Удалённый элемент встаёт перед первым новым, что шёл после его ближайшего сохранившегося соседа.
  const previousToNew = new Map<number, number>();
  status.forEach((entry, index) => {
    if (entry.previous !== undefined) previousToNew.set(entry.previous, index);
  });
  const removed = removedIndexes.map((oldIndex) => {
    let before = 0;
    for (let cursor = oldIndex - 1; cursor >= 0; cursor -= 1) {
      const kept = previousToNew.get(cursor);
      if (kept !== undefined) {
        before = kept + 1;
        break;
      }
    }
    return { previous: oldIndex, before };
  });
  return { next: status, removed };
}

function diffDiagram(previous: EditionBlock, next: EditionBlock): DiagramDiff {
  const oldNodes = new Map((previous.nodes ?? []).map((node) => [node.id, node]));
  const newNodeIds = new Set((next.nodes ?? []).map((node) => node.id));
  const nodes: { id: string; status: 'added' | 'changed' }[] = [];
  for (const node of next.nodes ?? []) {
    const old = oldNodes.get(node.id);
    if (old === undefined) nodes.push({ id: node.id, status: 'added' });
    else if (old.label !== node.label || (old.detail ?? '') !== (node.detail ?? ''))
      nodes.push({ id: node.id, status: 'changed' });
  }
  const removedNodes = (previous.nodes ?? [])
    .filter((node) => !newNodeIds.has(node.id))
    .map((node) => node.label);
  const edgeKey = (edges: readonly NonNullable<EditionBlock['edges']>[number][]) => {
    const seen = new Map<string, number>();
    return edges.map((edge) => {
      if (edge.id !== undefined) return `id:${edge.id}`;
      const base = `${edge.from}\0${edge.to}`;
      const ordinal = (seen.get(base) ?? 0) + 1;
      seen.set(base, ordinal);
      return `${base}\0${ordinal}`;
    });
  };
  const oldEdges = previous.edges ?? [];
  const newEdges = next.edges ?? [];
  const oldKeys = edgeKey(oldEdges);
  const newKeys = edgeKey(newEdges);
  const oldByKey = new Map(oldKeys.map((key, index) => [key, oldEdges[index]]));
  const newKeySet = new Set(newKeys);
  const edges: { index: number; status: 'added' | 'changed' }[] = [];
  newKeys.forEach((key, index) => {
    const old = oldByKey.get(key);
    const edge = newEdges[index];
    if (old === undefined) edges.push({ index, status: 'added' });
    else if ((old.label ?? '') !== (edge?.label ?? '')) edges.push({ index, status: 'changed' });
  });
  const removedEdges = oldKeys.flatMap((key, index) => {
    if (newKeySet.has(key)) return [];
    const edge = oldEdges[index];
    return edge === undefined
      ? []
      : [{ from: labelOf(previous, edge.from), to: labelOf(previous, edge.to) }];
  });
  return { nodes, edges, removedNodes, removedEdges };
}

function labelOf(block: EditionBlock, id: string): string {
  return block.nodes?.find((node) => node.id === id)?.label ?? id;
}

function diffPoints(
  previous: NonNullable<EditionBlock['points']>,
  next: NonNullable<EditionBlock['points']>,
): PointsDiff {
  const key = (point: { series: string; label: string }) => `${point.series}\0${point.label}`;
  const oldByKey = new Map(previous.map((point) => [key(point), point]));
  const newKeys = new Set(next.map(key));
  const changed: PointsDiff['changed'][number][] = [];
  const added: PointsDiff['added'][number][] = [];
  for (const point of next) {
    const old = oldByKey.get(key(point));
    if (old === undefined) added.push({ series: point.series, label: point.label });
    else if (old.value !== point.value)
      changed.push({
        series: point.series,
        label: point.label,
        previous: old.value,
        value: point.value,
      });
  }
  const removed = previous
    .filter((point) => !newKeys.has(key(point)))
    .map((point) => ({ series: point.series, label: point.label }));
  return { changed, added, removed };
}

/* ---------- Примитивы ---------- */

/** Содержимое блока, которое видит читатель: всё, кроме раздела. */
export function blockHash(block: EditionBlock): string {
  return JSON.stringify([
    block.text ?? null,
    block.rows ?? null,
    block.items ?? null,
    block.lines ?? null,
    block.nodes ?? null,
    block.edges ?? null,
    block.points ?? null,
    block.media ?? null,
  ]);
}

function blockText(block: EditionBlock): string {
  return [
    block.text ?? '',
    ...(block.items ?? []),
    ...(block.rows ?? []).map((row) => row.join(' ')),
    ...(block.lines ?? []),
    ...(block.nodes ?? []).map((node) => `${node.label} ${node.detail ?? ''}`),
    ...(block.edges ?? []).map((edge) => edge.label ?? ''),
    ...(block.points ?? []).map((point) => `${point.label} ${point.value}`),
    ...(block.media ?? []).map((media) => `${media.alt} ${media.digest}`),
  ].join(' ');
}

/**
 * Greedy similarity matching with the same score/new-index/old-index order as the object candidate sort.
 * Token bags are built once per block. Each candidate is one packed integer in a chunked score bucket;
 * iteration by new then old index already supplies the tie order, so candidates need no object sort.
 * Statistics describe actual allocated storage, allowing checks without machine-dependent time limits.
 */
export function pairSimilarBlocks(
  previous: readonly EditionBlock[],
  next: readonly EditionBlock[],
  oldIndexes: readonly number[],
  newIndexes: readonly number[],
): {
  readonly pairs: readonly (readonly [number, number])[];
  readonly statistics: {
    readonly wordBags: number;
    readonly candidates: number;
    readonly candidateCapacity: number;
  };
} {
  const chunkSize = 1024;
  const oldWords = oldIndexes.map((index) => words(blockText(previous[index] as EditionBlock)));
  const newWords = newIndexes.map((index) => words(blockText(next[index] as EditionBlock)));
  const scores = new Map<number, { chunks: Uint32Array[]; length: number }>();
  let candidates = 0;
  let candidateCapacity = 0;
  // Index lists come from source order. Keep that order even for an independently supplied list.
  const orderedOld = oldIndexes
    .map((index, offset) => ({ index, offset }))
    .sort((a, b) => a.index - b.index);
  const orderedNew = newIndexes
    .map((index, offset) => ({ index, offset }))
    .sort((a, b) => a.index - b.index);
  for (const newer of orderedNew)
    for (const older of orderedOld) {
      if (previous[older.index]?.kind !== next[newer.index]?.kind) continue;
      const score = dice(
        oldWords[older.offset] as Map<string, number>,
        newWords[newer.offset] as Map<string, number>,
      );
      if (score < PAIR_SIMILARITY) continue;
      let bucket = scores.get(score);
      if (bucket === undefined) {
        bucket = { chunks: [], length: 0 };
        scores.set(score, bucket);
      }
      const offset = bucket.length % chunkSize;
      if (offset === 0) {
        bucket.chunks.push(new Uint32Array(chunkSize));
        candidateCapacity += chunkSize;
      }
      const chunk = bucket.chunks.at(-1) as Uint32Array;
      chunk[offset] = newer.offset * oldIndexes.length + older.offset;
      bucket.length += 1;
      candidates += 1;
    }
  const pairs: (readonly [number, number])[] = [];
  const takenOld = new Set<number>();
  const takenNew = new Set<number>();
  for (const score of [...scores.keys()].sort((a, b) => b - a)) {
    const bucket = scores.get(score) as { chunks: Uint32Array[]; length: number };
    for (let at = 0; at < bucket.length; at += 1) {
      const packed = (bucket.chunks[Math.floor(at / chunkSize)] as Uint32Array)[
        at % chunkSize
      ] as number;
      const oldIndex = oldIndexes[packed % oldIndexes.length] as number;
      const newIndex = newIndexes[Math.floor(packed / oldIndexes.length)] as number;
      if (takenOld.has(oldIndex) || takenNew.has(newIndex)) continue;
      takenOld.add(oldIndex);
      takenNew.add(newIndex);
      pairs.push([oldIndex, newIndex]);
    }
  }
  return {
    pairs,
    statistics: { wordBags: oldWords.length + newWords.length, candidates, candidateCapacity },
  };
}

function words(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/** Коэффициент Дайса по мультимножествам слов. */
export function dice(left: Map<string, number>, right: Map<string, number>): number {
  let total = 0;
  let shared = 0;
  for (const count of left.values()) total += count;
  for (const [word, count] of right) {
    total += count;
    shared += Math.min(count, left.get(word) ?? 0);
  }
  return total === 0 ? 1 : (2 * shared) / total;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_value, index) => start + index);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function wordSegmenter(language: string): Intl.Segmenter {
  const locale = language === '' || language === 'und' ? 'en' : language;
  try {
    return new Intl.Segmenter(locale, { granularity: 'word' });
  } catch {
    return new Intl.Segmenter('en', { granularity: 'word' });
  }
}

export interface EditRegion {
  readonly kind: 'equal' | 'change';
  readonly oldStart: number;
  readonly oldEnd: number;
  readonly newStart: number;
  readonly newEnd: number;
}

/**
 * Дифф Майерса: кратчайший сценарий правки двух последовательностей, отрезками «равно» и «заменено».
 * Когда цена правки превышает `maxCost`, всё среднее считается заменённым целиком.
 */
export function diffSequences(
  previous: readonly string[],
  next: readonly string[],
  maxCost = Number.POSITIVE_INFINITY,
): EditRegion[] {
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1;
  const a = previous.slice(prefix, previous.length - suffix);
  const b = next.slice(prefix, next.length - suffix);
  const regions: EditRegion[] = [];
  if (prefix > 0)
    regions.push({ kind: 'equal', oldStart: 0, oldEnd: prefix, newStart: 0, newEnd: prefix });
  const middle = myers(a, b, maxCost);
  for (const region of middle)
    regions.push({
      kind: region.kind,
      oldStart: region.oldStart + prefix,
      oldEnd: region.oldEnd + prefix,
      newStart: region.newStart + prefix,
      newEnd: region.newEnd + prefix,
    });
  if (suffix > 0)
    regions.push({
      kind: 'equal',
      oldStart: previous.length - suffix,
      oldEnd: previous.length,
      newStart: next.length - suffix,
      newEnd: next.length,
    });
  return coalesce(regions);
}

function myers(a: readonly string[], b: readonly string[], maxCost: number): EditRegion[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0)
    return [{ kind: 'change', oldStart: 0, oldEnd: n, newStart: 0, newEnd: m }];
  // With no common key the exact shortest script is one all-change region: no trace is needed.
  const keys = new Set(a);
  if (!b.some((key) => keys.has(key)))
    return [{ kind: 'change', oldStart: 0, oldEnd: n, newStart: 0, newEnd: m }];
  const max = n + m;
  // Запас в одну ячейку с каждой стороны: срез шага `d` начинается с `offset - d - 1`.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 4);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max; d += 1) {
    if (d > maxCost) return [{ kind: 'change', oldStart: 0, oldEnd: n, newStart: 0, newEnd: m }];
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))
          ? (v[offset + k + 1] as number)
          : (v[offset + k - 1] as number) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  // Обратный проход по сохранённым срезам: шаги «вставка», «удаление» и диагонали.
  const steps: ('equal' | 'delete' | 'insert')[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    const slice = trace[d] as Int32Array;
    const at = (k: number): number => slice[k + d + 1] as number;
    const k = x - y;
    const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      steps.push('equal');
      x -= 1;
      y -= 1;
    }
    steps.push(x === previousX ? 'insert' : 'delete');
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    steps.push('equal');
    x -= 1;
    y -= 1;
  }
  steps.reverse();
  const regions: EditRegion[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  for (const step of steps) {
    const kind = step === 'equal' ? 'equal' : 'change';
    const last = regions.at(-1);
    const oldStep = step === 'insert' ? 0 : 1;
    const newStep = step === 'delete' ? 0 : 1;
    if (last !== undefined && last.kind === kind) {
      regions[regions.length - 1] = {
        ...last,
        oldEnd: last.oldEnd + oldStep,
        newEnd: last.newEnd + newStep,
      };
    } else {
      regions.push({
        kind,
        oldStart: oldCursor,
        oldEnd: oldCursor + oldStep,
        newStart: newCursor,
        newEnd: newCursor + newStep,
      });
    }
    oldCursor += oldStep;
    newCursor += newStep;
  }
  return regions;
}

function coalesce(regions: readonly EditRegion[]): EditRegion[] {
  const result: EditRegion[] = [];
  for (const region of regions) {
    if (region.oldEnd === region.oldStart && region.newEnd === region.newStart) continue;
    const last = result.at(-1);
    if (last !== undefined && last.kind === region.kind)
      result[result.length - 1] = { ...last, oldEnd: region.oldEnd, newEnd: region.newEnd };
    else result.push(region);
  }
  return result;
}

/** Индексы элементов `sequence`, входящих в наибольшую общую подпоследовательность с `reference`. */
function lcsIndexes(reference: readonly number[], sequence: readonly number[]): Set<number> {
  const script = diffSequences(reference.map(String), sequence.map(String));
  const kept = new Set<number>();
  for (const region of script)
    if (region.kind === 'equal')
      for (let index = region.newStart; index < region.newEnd; index += 1) kept.add(index);
  return kept;
}
