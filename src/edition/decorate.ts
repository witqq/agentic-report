/**
 * Слой изменений: проход rehype, который снимает запись редакции с готового дерева страницы и, когда
 * сборке передана прошлая редакция, запекает в страницу пометки относительно неё — полосу редакции,
 * пометки блоков, пословные вставки (`ins`) и удаления (`del`), построчный дифф кода, призраки
 * удалённых блоков и ссылки на перемещённые.
 *
 * Всё, что слой добавляет поверх нового текста — `del`, призраки, ярлыки, заметки о схеме, — несёт
 * `data-edition-removed`: переключатель прячет такие узлы, а обход смещений ревью, копирование кода и
 * следующая запись редакции их пропускают. Новый текст остаётся на месте, поэтому страница с
 * выключенным слоем читается как страница без `--since`.
 */

import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import type { Plugin } from 'unified';

import type { PageLocaleChoice } from '../authoring/registry.js';
import type { EditionBlockChange, EditionChanges, EditionSectionChange } from '../contracts.js';
import { packageStrings, type EditionStrings } from '../localization.js';
import {
  compareEditions,
  diffText,
  wordSegmenter,
  type BlockMatch,
  type EditionComparison,
  type InnerDiff,
  type SequenceAlignment,
  type TextDiff,
} from './match.js';
import {
  captureVisuals,
  collectEdition,
  EDITION_RECORD_VERSION,
  EDITION_SPACE,
  normalizeEditionText,
  type BlockHandle,
  type CapturedVisual,
  type CollectedEdition,
  type EditionBlock,
  type EditionRecord,
  type EditionSection,
  type TextRun,
} from './record.js';
import type { ReviewTargetReference } from '../review/contract.js';

/** Что проход узнал о варианте страницы: тело записи и, со `--since`, слой изменений. */
export interface EditionCollector {
  captured: Map<string, CapturedVisual>;
  authoredSectionIds: Set<string>;
  body?: Pick<EditionRecord, 'sections' | 'blocks'>;
  layer?: EditionLayer;
}

export interface EditionListEntry {
  /** `id` помеченного элемента: уникален на странице. */
  readonly key: string;
  readonly href: string;
  readonly status: 'added' | 'changed' | 'removed' | 'moved';
  /** Короткое состояние словом: оно стоит в метке. */
  readonly label: string;
  /** Что это и откуда — вид блока, прежний раздел, прежнее имя: обычным текстом рядом с меткой. */
  readonly detail: string;
  readonly section: string;
  readonly excerpt: string;
}

export interface EditionLayer {
  readonly edition: number;
  readonly unchanged: boolean;
  readonly localeAdded: boolean;
  readonly summary: string;
  /** Разделы оглавления с изменениями. */
  readonly changedSections: ReadonlySet<string>;
  readonly entries: readonly EditionListEntry[];
  readonly changes: EditionChanges;
  /** Байты удалённого текста, который слой вернул на страницу: он входит в бюджет веса. */
  readonly removedTextBytes: number;
  /** Удалённых блоков на странице: с `--share` их текст уходит вместе с ней. */
  readonly removedBlocks: number;
}

export interface EditionPassOptions {
  readonly collector: EditionCollector;
  readonly targets: readonly ReviewTargetReference[];
  readonly sectionIds: () => readonly string[];
  readonly resourceBytes: ReadonlyMap<string, Buffer>;
  readonly locale: PageLocaleChoice;
  readonly language?: string;
  /** Прошлая редакция этого языка; `{ localeAdded }` — в прошлой не было этого языка. */
  readonly previous?:
    | { readonly record: EditionRecord }
    | { readonly localeAdded: true; readonly edition: number; readonly reportRevision: string };
}

/** Модели схем и графиков снимаются до того, как пакет превращает директивы в SVG. */
export const rehypeEditionCapture: Plugin<[EditionCollector], Root> = (collector) => (tree) => {
  collector.captured = captureVisuals(tree);
};

export const rehypeEdition: Plugin<[EditionPassOptions], Root> = (options) => (tree) => {
  flattenFragments(tree);
  const collected = collectEdition(tree, {
    targets: options.targets,
    sectionIds: options.sectionIds(),
    authoredSectionIds: options.collector.authoredSectionIds,
    captured: options.collector.captured,
    resourceBytes: options.resourceBytes,
  });
  options.collector.body = { sections: collected.sections, blocks: collected.blocks };
  if (options.previous === undefined) return;
  const localeAdded = 'localeAdded' in options.previous;
  const previous: EditionRecord =
    'record' in options.previous
      ? options.previous.record
      : {
          contractVersion: EDITION_RECORD_VERSION,
          locale: options.locale,
          edition: options.previous.edition,
          reportRevision: options.previous.reportRevision,
          sections: [],
          blocks: [],
        };
  const next: EditionRecord = {
    contractVersion: EDITION_RECORD_VERSION,
    locale: options.locale,
    edition: previous.edition + 1,
    reportRevision: previous.reportRevision,
    sections: collected.sections,
    blocks: collected.blocks,
  };
  const comparison = compareEditions(previous, next, options.language ?? options.locale);
  const edition = comparison.unchanged ? previous.edition : previous.edition + 1;
  const strings = packageStrings(options.language ?? options.locale).edition;
  options.collector.layer = new Decorator(
    tree,
    collected,
    previous,
    comparison,
    strings,
    edition,
    localeAdded,
  ).run();
};

type Parent = Root | Element;

/**
 * Подсветка кода заменяет блок фрагментом (`root` внутри дерева). Сериализация печатает фрагмент как
 * его детей; здесь он раскрывается на месте, чтобы обход видел блок кода обычным элементом.
 */
function flattenFragments(node: Parent): void {
  const children: (ElementContent | RootContent)[] = [];
  let changed = false;
  for (const child of node.children as (ElementContent | RootContent | Root)[]) {
    if (child.type === 'root') {
      changed = true;
      flattenFragments(child);
      children.push(...child.children);
      continue;
    }
    if (child.type === 'element') flattenFragments(child);
    children.push(child);
  }
  if (changed) node.children = children as typeof node.children;
}

class Decorator {
  private readonly parents = new Map<ElementContent | RootContent, Parent>();
  private readonly usedIds = new Set<string>();
  private readonly entries = new Map<
    number,
    Omit<EditionListEntry, 'href' | 'key'> & { element: Element }
  >();
  private entryCount = 0;
  private removedTextBytes = 0;
  private removedBlocks = 0;
  private readonly addedSections = new Set<string>();
  private readonly sectionById: Map<string, CollectedEdition['sectionHandles'][number]>;
  private readonly previousSectionTitles: Map<string, string>;
  private readonly nextSectionTitles: Map<string, string>;

  constructor(
    private readonly tree: Root,
    private readonly collected: CollectedEdition,
    private readonly previous: EditionRecord,
    private readonly comparison: EditionComparison,
    private readonly strings: EditionStrings,
    private readonly edition: number,
    private readonly localeAdded: boolean,
  ) {
    this.index(tree);
    this.sectionById = new Map(collected.sectionHandles.map((handle) => [handle.id, handle]));
    this.previousSectionTitles = new Map(
      previous.sections.map((section) => [section.id, section.title]),
    );
    this.nextSectionTitles = new Map(
      collected.sections.map((section) => [section.id, section.title]),
    );
  }

  run(): EditionLayer {
    const totals = this.comparison.totals;
    const changedSections = new Set<string>();
    if (!this.comparison.unchanged) {
      this.decorateSections(changedSections);
      this.decorateBlocks();
      this.decorateRemoved();
      this.markContents(changedSections);
      this.markClosedDisclosures();
    }
    const entries = this.orderedEntries();
    const summary = this.comparison.unchanged
      ? this.strings.unchanged(this.edition)
      : this.localeAdded
        ? this.strings.localeAdded(this.edition)
        : this.strings.summary(this.edition, {
            changed: totals.changed,
            added: totals.added,
            removed: totals.removed,
            moved: totals.moved,
            sections: this.affectedSections(changedSections),
          });
    this.insertStrip(summary, entries.length > 0);
    return {
      edition: this.edition,
      unchanged: this.comparison.unchanged,
      localeAdded: this.localeAdded,
      summary,
      changedSections,
      entries,
      changes: this.changesSummary(),
      removedTextBytes: this.removedTextBytes,
      removedBlocks: this.removedBlocks,
    };
  }

  /* ---------- Разделы ---------- */

  /** Разделы с изменениями вместе с началом страницы до первого раздела. */
  private affectedSections(changedSections: ReadonlySet<string>): number {
    const affected = new Set(changedSections);
    for (const match of this.comparison.blocks)
      if (match.status !== 'unchanged')
        affected.add((this.collected.blocks[match.next] as EditionBlock).section);
    for (const removed of this.comparison.removed)
      if (!removed.sectionRemoved) affected.add(removed.section);
    return affected.size;
  }

  private decorateSections(changedSections: Set<string>): void {
    for (const section of this.comparison.sections) {
      if (section.status === 'unchanged') continue;
      changedSections.add(section.id);
      const handle = this.sectionById.get(section.id);
      if (handle === undefined) continue;
      const heading = this.sectionHeading(handle.element);
      if (section.status === 'added') {
        this.addedSections.add(section.id);
        this.mark(handle.element, 'added', this.strings.added, {
          section: section.id,
          excerpt: handle.title,
          chipHost: heading,
          detail: this.strings.sectionAdded,
        });
        continue;
      }
      const details: string[] = [];
      if (section.renamedFrom !== undefined) {
        details.push(this.strings.sectionRenamed(section.renamedFrom));
        if (heading !== undefined) {
          const diff = diffText(
            section.renamedFrom,
            handle.title,
            wordSegmenter(this.previous.locale),
          );
          if (diff !== undefined) applyTextDiff(ownRunsOf(heading), diff, this.parents);
        }
      }
      if (section.moved) details.push(this.strings.sectionMoved);
      if (details.length > 0 && heading !== undefined)
        this.mark(
          heading,
          section.moved ? 'moved' : 'changed',
          section.renamedFrom === undefined ? this.strings.moved : this.strings.renamed,
          {
            section: section.id,
            excerpt: handle.title,
            bar: false,
            detail: details.join('; '),
          },
        );
    }
  }

  private sectionHeading(element: Element): Element | undefined {
    if (/^h[1-6]$/u.test(element.tagName)) return element;
    return element.children.find(
      (child): child is Element => child.type === 'element' && /^h[1-6]$/u.test(child.tagName),
    );
  }

  /* ---------- Блоки ---------- */

  private decorateBlocks(): void {
    for (const match of this.comparison.blocks) {
      if (match.status === 'unchanged') continue;
      const handle = this.collected.handles[match.next] as BlockHandle;
      const block = this.collected.blocks[match.next] as EditionBlock;
      if (match.status === 'added') {
        if (this.addedSections.has(block.section)) continue;
        this.markAdded(handle, block);
        continue;
      }
      if (match.status === 'moved') {
        const from = this.previousSectionTitles.get(match.movedFrom ?? '') ?? '';
        this.mark(this.hostOf(handle), 'moved', this.strings.moved, {
          section: block.section,
          excerpt: excerptOf(block, handle),
          kind: this.strings.kind(block.kind),
          ...(match.movedFrom === block.section || from === ''
            ? {}
            : { detail: this.strings.movedFrom(from) }),
        });
        continue;
      }
      this.markChanged(handle, block, match);
    }
  }

  private markAdded(handle: BlockHandle, block: EditionBlock): void {
    // Новая строка кода, пункт и строка таблицы помечаются сами; новый блок — целиком.
    this.mark(this.hostOf(handle), 'added', this.strings.added, {
      section: block.section,
      excerpt: excerptOf(block, handle),
      kind: this.strings.kind(block.kind),
    });
  }

  private markChanged(handle: BlockHandle, block: EditionBlock, match: BlockMatch): void {
    const inner = match.inner ?? {};
    const previousBlock = this.previous.blocks[match.previous ?? -1];
    const host = this.hostOf(handle);
    const rewritten = inner.text?.rewritten === true;
    if (rewritten && previousBlock !== undefined) {
      // Переписано больше чем на 60 % слов: пословная каша не показывается, старый блок стоит
      // зачёркнутым призраком над новым.
      const ghost = this.ghost(previousBlock, 'replaced');
      this.insertBefore(host, ghost);
      this.mark(host, 'changed', this.strings.rewritten, {
        section: block.section,
        excerpt: excerptOf(block, handle),
        kind: this.strings.kind(block.kind),
      });
      return;
    }
    if (inner.text !== undefined) applyTextDiff(handle.runs, inner.text, this.parents);
    if (inner.items !== undefined && handle.items !== undefined)
      this.decorateItems(handle, inner.items, previousBlock);
    if (inner.rows !== undefined && handle.rows !== undefined)
      this.decorateRows(handle, inner.rows, previousBlock);
    if (inner.lines !== undefined && handle.code !== undefined)
      this.decorateLines(handle.code, inner.lines, previousBlock);
    if (inner.diagram !== undefined) this.decorateDiagram(handle.element, inner);
    if (inner.points !== undefined) this.decoratePoints(handle.element, inner);
    this.mark(host, 'changed', this.strings.changed, {
      section: block.section,
      excerpt: excerptOf(block, handle),
      kind: this.strings.kind(block.kind),
      words: inner.text?.words,
    });
  }

  private decorateItems(
    handle: BlockHandle,
    alignment: SequenceAlignment<TextDiff>,
    previousBlock: EditionBlock | undefined,
  ): void {
    const items = handle.items ?? [];
    alignment.next.forEach((entry, index) => {
      const item = items[index];
      if (item === undefined) return;
      if (entry.status === 'added') {
        wrapAll(item.runs, this.parents);
        item.item.properties.dataChange = 'added';
      } else if (entry.status === 'changed') {
        if (entry.inner !== undefined) applyTextDiff(item.runs, entry.inner, this.parents);
        item.item.properties.dataChange = 'changed';
      }
    });
    const list = handle.element;
    for (const removed of alignment.removed) {
      const text = previousBlock?.items?.[removed.previous] ?? '';
      this.removedTextBytes += Buffer.byteLength(text);
      const ghost = element(
        'li',
        { className: ['edition-ghost-item'], dataEditionRemoved: '', dataChange: 'removed' },
        [element('del', { className: ['edition-del'] }, [textNode(text)])],
      );
      const before = items[removed.before]?.item;
      if (before === undefined) list.children.push(ghost);
      else list.children.splice(list.children.indexOf(before), 0, ghost);
      this.parents.set(ghost, list);
    }
  }

  private decorateRows(
    handle: BlockHandle,
    alignment: SequenceAlignment<readonly (TextDiff | undefined)[]>,
    previousBlock: EditionBlock | undefined,
  ): void {
    const rows = handle.rows ?? [];
    alignment.next.forEach((entry, index) => {
      const row = rows[index];
      if (row === undefined) return;
      if (entry.status === 'added') {
        for (const cell of row.cells) wrapAll(cell, this.parents);
        row.row.properties.dataChange = 'added';
      } else if (entry.status === 'changed') {
        (entry.inner ?? []).forEach((diff, cellIndex) => {
          const cell = row.cells[cellIndex];
          if (diff !== undefined && cell !== undefined) applyTextDiff(cell, diff, this.parents);
        });
        row.row.properties.dataChange = 'changed';
      }
    });
    for (const removed of alignment.removed) {
      const cells = previousBlock?.rows?.[removed.previous] ?? [];
      const anchor = rows[removed.before]?.row;
      const reference = anchor ?? rows.at(-1)?.row;
      const parent = reference === undefined ? undefined : this.parents.get(reference);
      if (parent === undefined || reference === undefined || !('children' in parent)) continue;
      const width = Math.max(cells.length, rows[0]?.cells.length ?? 1);
      const ghost = element(
        'tr',
        { className: ['edition-ghost-row'], dataEditionRemoved: '', dataChange: 'removed' },
        Array.from({ length: width }, (_value, index) => {
          const text = cells[index] ?? '';
          this.removedTextBytes += Buffer.byteLength(text);
          return element(
            'td',
            {},
            text === '' ? [] : [element('del', { className: ['edition-del'] }, [textNode(text)])],
          );
        }),
      );
      if (anchor === undefined) parent.children.push(ghost);
      else parent.children.splice(parent.children.indexOf(anchor), 0, ghost);
      this.parents.set(ghost, parent);
    }
  }

  private decorateLines(
    code: Element,
    alignment: SequenceAlignment<undefined>,
    previousBlock: EditionBlock | undefined,
  ): void {
    const lines = codeLines(code);
    if (lines === undefined) return;
    alignment.next.forEach((entry, index) => {
      const line = lines[index];
      if (line !== undefined && entry.status !== 'same') line.properties.dataChange = 'added';
    });
    const grouped = new Map<number, number[]>();
    for (const removed of alignment.removed)
      grouped.set(removed.before, [...(grouped.get(removed.before) ?? []), removed.previous]);
    for (const [before, previousIndexes] of [...grouped].sort(
      (left, right) => right[0] - left[0],
    )) {
      const anchor = lines[before];
      const ghosts = previousIndexes.map((previousIndex) => {
        const text = previousBlock?.lines?.[previousIndex] ?? '';
        this.removedTextBytes += Buffer.byteLength(text);
        const lineBreak = element('span', { className: ['edition-line-break'] }, [textNode('\n')]);
        // Перенос строки живёт внутри призрака: скопированный без призраков код не получает пустых строк.
        const atEnd = anchor === undefined;
        return element(
          'span',
          {
            className: ['line', 'edition-ghost-line'],
            dataEditionRemoved: '',
            dataChange: 'removed',
          },
          atEnd ? [lineBreak, textNode(text)] : [textNode(text), lineBreak],
        );
      });
      if (anchor === undefined) code.children.push(...ghosts);
      else code.children.splice(code.children.indexOf(anchor), 0, ...ghosts);
      for (const ghost of ghosts) this.parents.set(ghost, code);
    }
    const pre = this.parents.get(code);
    const host = pre !== undefined && 'tagName' in pre && pre.tagName === 'pre' ? pre : code;
    host.properties.dataEditionCode = '';
  }

  private decorateDiagram(figure: Element, inner: InnerDiff): void {
    const diagram = inner.diagram;
    if (diagram === undefined) return;
    const nodes = new Map(diagram.nodes.map((node) => [node.id, node.status]));
    const edges = new Map(diagram.edges.map((edge) => [String(edge.index + 1), edge.status]));
    walkElements(figure, (node) => {
      const nodeId = node.properties.dataNodeId;
      if (typeof nodeId === 'string' && nodes.has(nodeId))
        node.properties.dataChange = nodes.get(nodeId) as string;
      const edge = node.properties.dataEdge;
      if (typeof edge === 'string' && node.properties.dataFrom !== undefined && edges.has(edge))
        node.properties.dataChange = edges.get(edge) as string;
    });
    const parts = [
      ...diagram.removedNodes.map((label) => this.strings.node(label)),
      ...diagram.removedEdges.map((edge) => this.strings.edge(edge.from, edge.to)),
    ];
    if (parts.length > 0) this.note(figure, this.strings.removedParts(parts));
  }

  private decoratePoints(figure: Element, inner: InnerDiff): void {
    const points = inner.points;
    if (points === undefined) return;
    const parts = [
      points.changed.length === 0
        ? undefined
        : this.strings.pointsChanged(
            points.changed.map((point) =>
              this.strings.pointChanged(
                this.strings.point(point.series, point.label),
                point.previous,
                point.value,
              ),
            ),
          ),
      points.added.length === 0
        ? undefined
        : this.strings.pointsAdded(
            points.added.map((point) => this.strings.point(point.series, point.label)),
          ),
      points.removed.length === 0
        ? undefined
        : this.strings.pointsRemoved(
            points.removed.map((point) => this.strings.point(point.series, point.label)),
          ),
    ].filter((part): part is string => part !== undefined);
    if (parts.length > 0) this.note(figure, parts.join(' '));
  }

  /** Заметка слоя под подписью схемы или графика: что в ней удалено и как изменились точки. */
  private note(figure: Element, value: string): void {
    this.removedTextBytes += Buffer.byteLength(value);
    const note = element('p', { className: ['edition-note'], dataEditionRemoved: '' }, [
      textNode(value),
    ]);
    const caption = figure.children.findIndex(
      (child) => child.type === 'element' && child.tagName === 'figcaption',
    );
    figure.children.splice(caption + 1, 0, note);
    this.parents.set(note, figure);
  }

  /* ---------- Удалённое ---------- */

  private decorateRemoved(): void {
    const handles = this.collected.handles;
    const bySection = new Map<string, typeof this.comparison.removed>();
    for (const removed of this.comparison.removed) {
      if (!removed.sectionRemoved) continue;
      const block = this.previous.blocks[removed.previous] as EditionBlock;
      bySection.set(block.section, [...(bySection.get(block.section) ?? []), removed]);
    }
    // Удалённый раздел — один свёрнутый призрак на месте раздела со старыми блоками внутри.
    for (const section of this.comparison.removedSections) {
      const title = this.previousSectionTitles.get(section.previous) ?? '';
      const members = bySection.get(section.previous) ?? [];
      const body = members.map((removed) =>
        removed.movedTo === undefined
          ? this.ghostBody(this.previous.blocks[removed.previous] as EditionBlock)
          : this.movedLink(removed.movedTo),
      );
      this.removedBlocks += members.filter((removed) => removed.movedTo === undefined).length;
      const ghost = element(
        'details',
        {
          className: ['edition-ghost', 'edition-ghost-section'],
          dataEditionRemoved: '',
          dataChange: 'removed',
        },
        [
          element('summary', { className: ['edition-ghost-summary'] }, [
            textNode(this.strings.sectionRemoved(title)),
          ]),
          element('div', { className: ['edition-ghost-body'] }, body.flat()),
        ],
      );
      this.placeSectionGhost(ghost, section.after);
      this.register(
        ghost,
        'removed',
        this.strings.removed,
        '',
        '',
        this.strings.sectionRemoved(title),
      );
    }
    for (const removed of [...this.comparison.removed].reverse()) {
      if (removed.sectionRemoved) continue;
      const block = this.previous.blocks[removed.previous] as EditionBlock;
      const ghost =
        removed.movedTo === undefined
          ? this.ghost(block, 'removed')
          : element(
              'p',
              {
                className: ['edition-ghost', 'edition-ghost-moved'],
                dataEditionRemoved: '',
                dataChange: 'moved',
              },
              this.movedLink(removed.movedTo),
            );
      if (removed.movedTo === undefined) this.removedBlocks += 1;
      const anchor = removed.after === undefined ? undefined : handles[removed.after];
      if (anchor !== undefined) this.insertAfter(this.hostOf(anchor), ghost);
      else this.placeAtSectionStart(ghost, removed.section);
      if (removed.movedTo === undefined)
        this.register(
          ghost,
          'removed',
          this.strings.removed,
          removed.section,
          excerptOf(block),
          this.strings.kind(block.kind),
        );
    }
  }

  private movedLink(movedTo: number): ElementContent[] {
    const handle = this.collected.handles[movedTo] as BlockHandle;
    const block = this.collected.blocks[movedTo] as EditionBlock;
    const host = this.hostOf(handle);
    const id = this.ensureId(host);
    const title = this.nextSectionTitles.get(block.section) ?? '';
    return [
      element('a', { href: `#${id}`, className: ['edition-moved-link'] }, [
        textNode(title === '' ? this.strings.movedHere : this.strings.movedTo(title)),
      ]),
    ];
  }

  /** Призрак удалённого блока: свёрнутый с подписью или, для переписанного, раскрытый зачёркнутый. */
  private ghost(block: EditionBlock, mode: 'removed' | 'replaced'): Element {
    const body = this.ghostBody(block);
    if (mode === 'replaced')
      return element(
        'div',
        {
          className: ['edition-ghost', 'edition-ghost-replaced'],
          dataEditionRemoved: '',
          dataChange: 'removed',
        },
        [
          element('p', { className: ['edition-ghost-label'] }, [
            textNode(this.strings.previousText),
          ]),
          element('div', { className: ['edition-ghost-body'] }, body),
        ],
      );
    return element(
      'details',
      { className: ['edition-ghost'], dataEditionRemoved: '', dataChange: 'removed' },
      [
        element('summary', { className: ['edition-ghost-summary'] }, [
          textNode(
            this.strings.removedBlock(
              this.strings.kind(block.kind),
              shortExcerpt(excerptOf(block)),
            ),
          ),
        ]),
        element('div', { className: ['edition-ghost-body'] }, body),
      ],
    );
  }

  /** Старое содержимое блока: текстом, таблицей, пунктами, строками или словесным описанием. */
  private ghostBody(block: EditionBlock): ElementContent[] {
    const count = (value: string): string => {
      this.removedTextBytes += Buffer.byteLength(value);
      return value;
    };
    const content: ElementContent[] = [];
    if (block.text !== undefined && block.text !== '')
      content.push(
        element('p', { className: ['edition-ghost-text'] }, [textNode(count(block.text))]),
      );
    if (block.rows !== undefined)
      content.push(
        element('div', { className: ['edition-ghost-table'] }, [
          element(
            'table',
            {},
            block.rows.map((row) =>
              element(
                'tr',
                {},
                row.map((cell) => element('td', {}, [textNode(count(cell))])),
              ),
            ),
          ),
        ]),
      );
    if (block.items !== undefined)
      content.push(
        element(
          'ul',
          { className: ['edition-ghost-list'] },
          block.items.map((item) => element('li', {}, [textNode(count(item))])),
        ),
      );
    if (block.lines !== undefined)
      content.push(
        element(
          'div',
          { className: ['edition-ghost-code'] },
          block.lines.map((line) =>
            element('span', { className: ['edition-ghost-code-line'] }, [textNode(count(line))]),
          ),
        ),
      );
    const parts = [
      ...(block.nodes ?? []).map((node) => this.strings.node(node.label)),
      ...(block.edges ?? []).map((edge) =>
        this.strings.edge(
          block.nodes?.find((node) => node.id === edge.from)?.label ?? edge.from,
          block.nodes?.find((node) => node.id === edge.to)?.label ?? edge.to,
        ),
      ),
      ...(block.points ?? []).map((point) =>
        this.strings
          .pointChanged(this.strings.point(point.series, point.label), '', point.value)
          .replace(': → ', ': '),
      ),
      ...(block.media ?? []).map((media) => this.strings.image(media.alt)),
    ];
    if (parts.length > 0)
      content.push(
        element('p', { className: ['edition-ghost-text'] }, [textNode(count(parts.join('; ')))]),
      );
    return content;
  }

  private placeSectionGhost(ghost: Element, after: string | undefined): void {
    const handle = after === undefined ? undefined : this.sectionById.get(after);
    if (handle !== undefined && handle.element.properties.dataSemantic === 'section') {
      this.insertAfter(handle.element, ghost);
      return;
    }
    if (handle !== undefined) {
      // Раздел без директивы — заголовок h2 и всё до следующего такого заголовка.
      const parent = this.parents.get(handle.element);
      const headings = new Set(this.collected.sectionHandles.map((section) => section.element));
      if (parent !== undefined) {
        const start = parent.children.indexOf(handle.element as RootContent & ElementContent);
        let at = start + 1;
        while (at < parent.children.length && !headings.has(parent.children[at] as Element))
          at += 1;
        parent.children.splice(at, 0, ghost);
        this.parents.set(ghost, parent);
        return;
      }
    }
    const first = this.collected.sectionHandles[0]?.element;
    if (first !== undefined) this.insertBefore(first, ghost);
    else {
      this.tree.children.push(ghost);
      this.parents.set(ghost, this.tree);
    }
  }

  private placeAtSectionStart(ghost: Element, section: string): void {
    const handle = this.sectionById.get(section);
    if (handle === undefined) {
      this.tree.children.unshift(ghost);
      this.parents.set(ghost, this.tree);
      return;
    }
    const heading = this.sectionHeading(handle.element);
    if (heading !== undefined) this.insertAfter(heading, ghost);
    else this.insertAfter(handle.element, ghost);
  }

  /* ---------- Пометки ---------- */

  private hostOf(handle: BlockHandle): Element {
    const parent = this.parents.get(handle.element);
    if (handle.element.tagName === 'table' && parent !== undefined && 'tagName' in parent)
      return classes(parent).includes('table-frame') ? parent : handle.element;
    if (handle.element.tagName === 'code' && parent !== undefined && 'tagName' in parent)
      return parent.tagName === 'pre' ? parent : handle.element;
    return handle.element;
  }

  /**
   * Пометка блока: состояние в `data-change`, ярлык словом и полоса на поле. Ярлык и полоса —
   * узлы слоя: переключатель их прячет, а ревью и копирование не видят.
   */
  private mark(
    host: Element,
    status: 'added' | 'changed' | 'moved',
    label: string,
    options: {
      readonly section: string;
      readonly excerpt: string;
      readonly chipHost?: Element | undefined;
      readonly bar?: boolean;
      readonly words?: { readonly added: number; readonly removed: number } | undefined;
      readonly kind?: string;
      readonly detail?: string;
    },
  ): void {
    host.properties.dataChange = status;
    const chip = element(
      'span',
      { className: ['edition-chip'], dataEditionRemoved: '', dataChange: status },
      [textNode(label)],
    );
    const chipHost = options.chipHost ?? this.chipHostOf(host);
    // Откуда блок и как он назывался — обычным текстом после метки: метка остаётся коротким словом.
    if (options.detail !== undefined) {
      const detail = element(
        'span',
        { className: ['edition-chip-detail'], dataEditionRemoved: '' },
        [textNode(options.detail)],
      );
      insertFirst(chipHost, detail, this.parents);
    }
    insertFirst(chipHost, chip, this.parents);
    if (
      options.bar !== false &&
      !['pre', 'table', 'tr', 'li'].includes(host.tagName) &&
      !classes(host).includes('table-frame')
    ) {
      const bar = element(
        'span',
        { className: ['edition-bar'], dataEditionRemoved: '', ariaHidden: 'true' },
        [],
      );
      insertFirst(host, bar, this.parents);
    }
    this.register(
      host,
      status,
      label,
      options.section,
      options.excerpt,
      [options.kind, options.detail].filter((part) => part !== undefined).join(', '),
    );
  }

  /** Куда встаёт ярлык: в начало текста блока, в подпись раскрывающегося блока, в первый пункт. */
  private chipHostOf(host: Element): Element {
    if (host.tagName === 'details') {
      const summary = host.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'summary',
      );
      if (summary !== undefined) return summary;
    }
    if (host.tagName === 'ul' || host.tagName === 'ol') {
      const item = host.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'li',
      );
      if (item !== undefined) return item;
    }
    if (host.tagName === 'table') {
      const cell = findElement(host, (node) => node.tagName === 'th' || node.tagName === 'td');
      if (cell !== undefined) return cell;
    }
    return host;
  }

  private register(
    element: Element,
    status: EditionListEntry['status'],
    label: string,
    section: string,
    excerpt: string,
    detail = '',
  ): void {
    const index = this.entryCount;
    this.entryCount += 1;
    element.properties.dataEditionChange = String(index);
    this.ensureId(element);
    this.entries.set(index, {
      element,
      status,
      label,
      detail,
      section: this.nextSectionTitles.get(section) ?? '',
      excerpt: shortExcerpt(excerpt),
    });
  }

  private orderedEntries(): EditionListEntry[] {
    const ordered: EditionListEntry[] = [];
    const slideOf = new Map<Element, string>();
    const walk = (node: Parent, slide: string | undefined, step: string | undefined): void => {
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        const ownSlide =
          typeof child.properties.dataSlide === 'string' ? child.properties.dataSlide : slide;
        const ownStep =
          typeof child.properties.dataStep === 'string' ? child.properties.dataStep : step;
        const index = child.properties.dataEditionChange;
        if (typeof index === 'string') {
          const entry = this.entries.get(Number(index));
          if (entry !== undefined) {
            if (ownSlide !== undefined)
              slideOf.set(
                child,
                `#/${Number(ownSlide) + 1}${ownStep === undefined ? '' : `/${ownStep}`}`,
              );
            const id = child.properties.id;
            ordered.push({
              key: typeof id === 'string' ? id : index,
              href: slideOf.get(child) ?? `#${typeof id === 'string' ? id : ''}`,
              status: entry.status,
              label: entry.label,
              detail: entry.detail,
              section: entry.section,
              excerpt: entry.excerpt,
            });
          }
        }
        walk(child, ownSlide, ownStep);
      }
    };
    walk(this.tree, undefined, undefined);
    return ordered;
  }

  private markContents(changedSections: ReadonlySet<string>): void {
    walkElements(this.tree, (node) => {
      if (node.properties.dataInFlowContents === undefined) return;
      walkElements(node, (link) => {
        if (link.tagName !== 'a' || typeof link.properties.href !== 'string') return;
        if (!changedSections.has(link.properties.href.slice(1))) return;
        const item = this.parents.get(link);
        if (item === undefined) return;
        const dot = this.dot(this.strings.contentsMark);
        item.children.splice(item.children.indexOf(link) + 1, 0, dot);
        this.parents.set(dot, item);
      });
    });
  }

  /** Закрытый раскрывающийся блок с изменениями внутри получает точку у подписи. */
  private markClosedDisclosures(): void {
    const marked = new Set<Element>();
    walkElements(this.tree, (node) => {
      if (
        node.properties.dataEditionChange === undefined &&
        node.properties.dataChange === undefined
      )
        return;
      let cursor = this.parents.get(node);
      while (cursor !== undefined && 'tagName' in cursor) {
        if (
          cursor.tagName === 'details' &&
          !marked.has(cursor) &&
          cursor.properties.dataEditionRemoved === undefined
        ) {
          marked.add(cursor);
        }
        cursor = this.parents.get(cursor);
      }
    });
    for (const details of marked) {
      const summary = details.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'summary',
      );
      if (summary === undefined || details.properties.dataChange !== undefined) continue;
      details.properties.dataEditionContains = '';
      summary.children.push(this.dot(this.strings.containsChanges));
    }
  }

  private dot(label: string): Element {
    return element('span', { className: ['edition-dot'], dataEditionRemoved: '' }, [
      element('span', { className: ['visually-hidden'] }, [textNode(label)]),
    ]);
  }

  /* ---------- Полоса редакции ---------- */

  private insertStrip(summary: string, interactive: boolean): void {
    const strip = element(
      'div',
      {
        className: ['edition-strip'],
        role: 'region',
        ariaLabel: this.strings.region,
        dataEditionStrip: '',
      },
      [
        element('p', { className: ['edition-strip-summary'] }, [textNode(summary)]),
        ...(interactive
          ? [
              element('div', { className: ['edition-strip-actions'] }, [
                element(
                  'button',
                  {
                    type: 'button',
                    role: 'switch',
                    ariaChecked: 'true',
                    className: ['ui-switch'],
                    dataEditionLayerToggle: '',
                  },
                  [textNode(this.strings.show)],
                ),
                stripButton(this.strings.previous, { dataEditionStep: 'previous' }),
                stripButton(this.strings.next, { dataEditionStep: 'next' }),
                stripButton(this.strings.list, { dataEditionOpenList: '', ariaHasPopup: 'dialog' }),
              ]),
            ]
          : []),
      ],
    );
    const find = (predicate: (node: Element) => boolean): Element | undefined =>
      findElement(this.tree, predicate);
    const cover = find(
      (node) =>
        node.properties.dataSlideCover !== undefined ||
        node.properties.dataScreenCover !== undefined,
    );
    if (cover !== undefined) {
      cover.children.push(strip);
      this.parents.set(strip, cover);
      return;
    }
    const contents = find((node) => node.properties.dataInFlowContents !== undefined);
    if (contents !== undefined) {
      this.insertBefore(contents, strip);
      return;
    }
    const opening = find((node) => node.properties.dataPageOpening !== undefined);
    if (opening !== undefined) {
      this.insertAfter(opening, strip);
      return;
    }
    const firstSection = this.collected.sectionHandles[0]?.element;
    if (firstSection !== undefined) {
      this.insertBefore(firstSection, strip);
      return;
    }
    let at = 0;
    const children = this.tree.children;
    const firstHeading = children.findIndex(
      (child) => child.type === 'element' && child.tagName === 'h1',
    );
    if (firstHeading >= 0) {
      at = firstHeading + 1;
      while (at < children.length) {
        const child = children[at];
        if (child?.type === 'element' && child.tagName !== 'p') break;
        at += 1;
      }
    }
    children.splice(at, 0, strip);
    this.parents.set(strip, this.tree);
  }

  /* ---------- Сводка для агента ---------- */

  private changesSummary(): EditionChanges {
    const sections = new Map<string, EditionSectionChange & { blocks: EditionBlockChange[] }>();
    const sectionEntry = (id: string): EditionSectionChange & { blocks: EditionBlockChange[] } => {
      const existing = sections.get(id);
      if (existing !== undefined) return existing;
      const match = this.comparison.sections.find((section) => section.id === id);
      const created = {
        id,
        title: this.nextSectionTitles.get(id) ?? '',
        status: match?.status === 'added' ? ('added' as const) : ('changed' as const),
        renamedFrom: match?.renamedFrom ?? null,
        moved: match?.moved ?? false,
        blocks: [] as EditionBlockChange[],
      };
      sections.set(id, created);
      return created;
    };
    for (const section of this.comparison.sections)
      if (section.status !== 'unchanged') sectionEntry(section.id);
    for (const match of this.comparison.blocks) {
      if (match.status === 'unchanged') continue;
      const handle = this.collected.handles[match.next] as BlockHandle;
      const block = this.collected.blocks[match.next] as EditionBlock;
      const words = match.inner?.text?.words;
      sectionEntry(block.section).blocks.push({
        kind: block.kind,
        status: match.status,
        source: { ...handle.target.source },
        ...(words === undefined ? {} : { words: { ...words } }),
        ...(match.status === 'moved' && match.movedFrom !== undefined
          ? { movedFrom: this.previousSectionTitles.get(match.movedFrom) ?? '' }
          : {}),
      });
    }
    for (const removed of this.comparison.removed) {
      if (removed.movedTo !== undefined) continue;
      const block = this.previous.blocks[removed.previous] as EditionBlock;
      if (removed.sectionRemoved) continue;
      sectionEntry(removed.section).blocks.push({
        kind: block.kind,
        status: 'removed',
        previousOrder: removed.previous,
      });
    }
    const removedSections: EditionSectionChange[] = this.comparison.removedSections.map(
      (section) => ({
        id: section.previous,
        title: this.previousSectionTitles.get(section.previous) ?? '',
        status: 'removed',
        renamedFrom: null,
        moved: false,
        blocks: this.comparison.removed
          .filter(
            (removed) =>
              removed.sectionRemoved &&
              removed.movedTo === undefined &&
              (this.previous.blocks[removed.previous] as EditionBlock).section === section.previous,
          )
          .map((removed) => ({
            kind: (this.previous.blocks[removed.previous] as EditionBlock).kind,
            status: 'removed' as const,
            previousOrder: removed.previous,
          })),
      }),
    );
    const order = new Map(
      ['', ...this.collected.sections.map((section) => section.id)].map((id, index) => [id, index]),
    );
    return {
      locale: this.previous.locale,
      since: { edition: this.previous.edition, reportRevision: this.previous.reportRevision },
      edition: this.edition,
      unchanged: this.comparison.unchanged,
      totals: { ...this.comparison.totals },
      sections: [
        ...[...sections.values()].sort(
          (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
        ),
        ...removedSections,
      ],
    };
  }

  /* ---------- Дерево ---------- */

  private index(node: Parent): void {
    for (const child of node.children) {
      this.parents.set(child, node);
      if (child.type === 'element') {
        if (typeof child.properties.id === 'string') this.usedIds.add(child.properties.id);
        this.index(child);
      }
    }
  }

  private ensureId(element: Element): string {
    const existing = element.properties.id;
    if (typeof existing === 'string' && existing !== '') return existing;
    let index = this.usedIds.size + 1;
    let id = `edition-change-${index}`;
    while (this.usedIds.has(id)) {
      index += 1;
      id = `edition-change-${index}`;
    }
    this.usedIds.add(id);
    element.properties.id = id;
    return id;
  }

  private insertBefore(reference: Element, node: Element): void {
    const parent = this.parents.get(reference);
    if (parent === undefined) return;
    parent.children.splice(
      parent.children.indexOf(reference as RootContent & ElementContent),
      0,
      node,
    );
    this.parents.set(node, parent);
  }

  private insertAfter(reference: Element, node: Element): void {
    const parent = this.parents.get(reference);
    if (parent === undefined) return;
    parent.children.splice(
      parent.children.indexOf(reference as RootContent & ElementContent) + 1,
      0,
      node,
    );
    this.parents.set(node, parent);
  }
}

/* ---------- Пословная разметка ---------- */

interface CharPoint {
  readonly run: number;
  readonly offset: number;
}

/** Нормализованный текст прогонов и место каждого его символа в текстовых узлах страницы. */
function textMap(runs: readonly TextRun[]): { text: string; points: CharPoint[] } {
  let text = '';
  const points: CharPoint[] = [];
  let pendingSpace: CharPoint | undefined;
  runs.forEach((run, runIndex) => {
    const value = run.node.value.normalize('NFC');
    if (value !== run.node.value) run.node.value = value;
    if (run.gapBefore === true && text.length > 0 && pendingSpace === undefined)
      pendingSpace = { run: runIndex, offset: 0 };
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value[offset] as string;
      if (EDITION_SPACE.test(character)) {
        if (text.length > 0 && pendingSpace === undefined) pendingSpace = { run: runIndex, offset };
        continue;
      }
      if (pendingSpace !== undefined) {
        text += ' ';
        points.push(pendingSpace);
        pendingSpace = undefined;
      }
      text += character;
      points.push({ run: runIndex, offset });
    }
  });
  return { text, points };
}

type RunEdit =
  | { readonly kind: 'wrap'; readonly start: number; readonly end: number }
  | { readonly kind: 'insert'; readonly at: number; readonly node: Element };

/** Вставленные слова оборачиваются в `ins`, удалённые встают на своё место в `del`. */
export function applyTextDiff(
  runs: readonly TextRun[],
  diff: TextDiff,
  parents: Map<ElementContent | RootContent, Parent>,
): void {
  if (runs.length === 0) return;
  const { points } = textMap(runs);
  const edits = new Map<number, RunEdit[]>();
  const push = (run: number, edit: RunEdit): void => {
    edits.set(run, [...(edits.get(run) ?? []), edit]);
  };
  const positionOf = (at: number): CharPoint => {
    const point = points[at];
    if (point !== undefined) return point;
    const last = points.at(-1) ?? { run: runs.length - 1, offset: -1 };
    return { run: last.run, offset: last.offset + 1 };
  };
  for (const hunk of diff.hunks) {
    if (hunk.removed !== '') {
      const at = positionOf(hunk.newStart);
      push(at.run, {
        kind: 'insert',
        at: at.offset,
        node: element('del', { className: ['edition-del'], dataEditionRemoved: '' }, [
          textNode(hunk.removed),
        ]),
      });
    }
    if (hunk.newEnd > hunk.newStart) {
      const spans = new Map<number, { start: number; end: number }>();
      for (let index = hunk.newStart; index < hunk.newEnd; index += 1) {
        const point = points[index];
        if (point === undefined) continue;
        const span = spans.get(point.run);
        if (span === undefined)
          spans.set(point.run, { start: point.offset, end: point.offset + 1 });
        else span.end = point.offset + 1;
      }
      for (const [run, span] of spans)
        push(run, { kind: 'wrap', start: span.start, end: span.end });
    }
  }
  for (const [runIndex, runEdits] of edits) {
    const run = runs[runIndex];
    if (run !== undefined) rewriteRun(run, runEdits, parents);
  }
}

function rewriteRun(
  run: TextRun,
  edits: readonly RunEdit[],
  parents: Map<ElementContent | RootContent, Parent>,
): void {
  const value = run.node.value;
  const sorted = [...edits].sort((left, right) => {
    const leftAt = left.kind === 'wrap' ? left.start : left.at;
    const rightAt = right.kind === 'wrap' ? right.start : right.at;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return left.kind === 'insert' ? -1 : 1;
  });
  const pieces: ElementContent[] = [];
  let cursor = 0;
  for (const edit of sorted) {
    const at = edit.kind === 'wrap' ? edit.start : edit.at;
    if (at > cursor) pieces.push(textNode(value.slice(cursor, at)));
    cursor = Math.max(cursor, at);
    if (edit.kind === 'insert') {
      pieces.push(edit.node);
      continue;
    }
    pieces.push(
      element('ins', { className: ['edition-ins'] }, [textNode(value.slice(edit.start, edit.end))]),
    );
    cursor = edit.end;
  }
  if (cursor < value.length) pieces.push(textNode(value.slice(cursor)));
  const index = run.parent.children.indexOf(run.node);
  if (index < 0) return;
  run.parent.children.splice(index, 1, ...pieces);
  for (const piece of pieces) parents.set(piece, run.parent);
}

/** Весь текст нового пункта или новой строки таблицы — вставка. */
function wrapAll(
  runs: readonly TextRun[],
  parents: Map<ElementContent | RootContent, Parent>,
): void {
  const { text } = textMap(runs);
  if (text === '') return;
  applyTextDiff(
    runs,
    {
      hunks: [{ oldStart: 0, oldEnd: 0, newStart: 0, newEnd: text.length, removed: '' }],
      rewritten: false,
      words: { added: 0, removed: 0 },
    },
    parents,
  );
}

function ownRunsOf(heading: Element): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (node: Element): void => {
    for (const child of node.children) {
      if (child.type === 'text') runs.push({ node: child, parent: node });
      else if (
        child.type === 'element' &&
        child.properties.dataEditionRemoved === undefined &&
        child.tagName !== 'svg'
      )
        walk(child);
    }
  };
  walk(heading);
  return runs;
}

/** Строки подсвеченного кода; простой текст режется на строки тем же видом, что даёт подсветка. */
function codeLines(code: Element): Element[] | undefined {
  const lines = code.children.filter(
    (child): child is Element => child.type === 'element' && classes(child).includes('line'),
  );
  if (lines.length > 0) return lines;
  if (!code.children.every((child) => child.type === 'text')) return undefined;
  const raw = code.children
    .map((child) => (child as Text).value)
    .join('')
    .replace(/\n$/u, '');
  const rebuilt: ElementContent[] = [];
  raw.split('\n').forEach((line, index) => {
    if (index > 0) rebuilt.push(textNode('\n'));
    rebuilt.push(element('span', { className: ['line'] }, [textNode(line)]));
  });
  code.children = rebuilt;
  return rebuilt.filter((child): child is Element => child.type === 'element');
}

/* ---------- Мелочи ---------- */

function stripButton(label: string, properties: Element['properties']): Element {
  return element(
    'button',
    {
      type: 'button',
      className: ['ui-button'],
      dataUiVariant: 'quiet',
      dataUiSize: 'sm',
      ...properties,
    },
    [textNode(label)],
  );
}

function insertFirst(
  host: Element,
  node: Element,
  parents: Map<ElementContent | RootContent, Parent>,
): void {
  host.children.unshift(node);
  parents.set(node, host);
}

/** Выдержка для списка: у схемы и графика — заголовок, у таблицы — ячейки через точку. */
function excerptOf(block: EditionBlock, handle?: BlockHandle): string {
  const source =
    handle?.title ??
    block.text ??
    block.items?.[0] ??
    block.rows?.[0]?.join(' · ') ??
    block.lines?.find((line) => line.trim() !== '') ??
    block.nodes?.map((node) => node.label).join(', ') ??
    block.media?.[0]?.alt ??
    '';
  return normalizeEditionText(source);
}

function shortExcerpt(value: string): string {
  const words = value.split(' ');
  if (value.length <= 60) return value;
  let result = '';
  for (const word of words) {
    if ((result + word).length > 56) break;
    result = result === '' ? word : `${result} ${word}`;
  }
  return `${result === '' ? value.slice(0, 56) : result}…`;
}

function classes(node: Element): string[] {
  // Подсветка кода пишет класс свойством `class`, остальной конвейер — `className`.
  const value = node.properties.className ?? node.properties.class;
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null ? [] : String(value).split(' ');
}

function walkElements(node: Parent, visit: (element: Element) => void): void {
  for (const child of [...node.children]) {
    if (child.type !== 'element') continue;
    visit(child);
    walkElements(child, visit);
  }
}

function findElement(node: Parent, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (predicate(child)) return child;
    const found = findElement(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function element(
  tagName: string,
  properties: Element['properties'],
  children: ElementContent[],
): Element {
  return { type: 'element', tagName, properties, children };
}

function textNode(value: string): Text {
  return { type: 'text', value };
}

export type { EditionSection };
