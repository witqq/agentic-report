/**
 * Запись редакции: машинный слепок того, что читатель видит на странице, — нормализованный текст
 * каждого блока с его разделом и идентичностью. Каждая сборка встраивает запись в каждую языковую
 * версию страницы инертным `<template data-edition-record>`, и следующая сборка с `--since` узнаёт по
 * ней прошлую редакцию, не имея прошлого исходника.
 *
 * Блок — то же, что цель ревью: абзац, заголовок, список, таблица, код, цитата, разделитель или
 * контейнерная директива со своим элементом на странице. Текст блока — его собственный видимый текст
 * без вложенных блоков; таблица записывается строками, список — пунктами, код — строками, схема —
 * узлами и связями, график — точками, картинка — отпечатком байтов и `alt`.
 *
 * Запись детерминирована: в ней нет путей и времени, поэтому одинаковый исходник даёт одинаковые байты.
 */

import { createHash } from 'node:crypto';

import type { Element, ElementContent, Root, Text } from 'hast';

import { PAGE_LOCALES, type PageLocaleChoice } from '../authoring/registry.js';
import { MAX_REVIEW_TARGETS, type ReviewTargetReference } from '../review/contract.js';

export const EDITION_RECORD_VERSION = 1 as const;
export const MAX_EDITION_RECORD_BYTES = 2_000_000;
export const MAX_EDITION_BLOCKS = MAX_REVIEW_TARGETS;
const MAX_ISSUES = 100;

export interface EditionSection {
  readonly id: string;
  /** `id` написан автором (`section{id=…}`), а не выведен из заголовка. */
  readonly authoredId: boolean;
  readonly title: string;
  readonly order: number;
}

export interface EditionNode {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

export interface EditionEdge {
  readonly from: string;
  readonly to: string;
  readonly id?: string;
  readonly label?: string;
}

export interface EditionPoint {
  readonly series: string;
  readonly label: string;
  readonly value: string;
}

export interface EditionMedia {
  readonly digest: string;
  readonly alt: string;
}

export interface EditionBlock {
  /** Раздел блока; `''` — начало страницы до первого раздела. */
  readonly section: string;
  readonly kind: string;
  readonly stableKey?: string;
  readonly text?: string;
  readonly rows?: readonly (readonly string[])[];
  readonly items?: readonly string[];
  readonly lines?: readonly string[];
  readonly nodes?: readonly EditionNode[];
  readonly edges?: readonly EditionEdge[];
  readonly points?: readonly EditionPoint[];
  readonly media?: readonly EditionMedia[];
}

export interface EditionRecord {
  readonly contractVersion: typeof EDITION_RECORD_VERSION;
  readonly locale: PageLocaleChoice;
  readonly edition: number;
  readonly reportRevision: string;
  readonly sections: readonly EditionSection[];
  readonly blocks: readonly EditionBlock[];
}

export class EditionContractError extends Error {
  readonly issues: readonly string[];
  readonly unsupportedVersion: boolean;

  constructor(message: string, issues: readonly string[], unsupportedVersion = false) {
    super(message);
    this.name = 'EditionContractError';
    this.issues = issues;
    this.unsupportedVersion = unsupportedVersion;
  }
}

/** NFC и один пробел вместо любой последовательности пробелов, включая неразрывный и узкий. */
export function normalizeEditionText(value: string): string {
  return value.normalize('NFC').replace(EDITION_SPACE_RUN, ' ').trim();
}

export const EDITION_SPACE = /[\s\u200B]/u;
const EDITION_SPACE_RUN = /[\s\u200B]+/gu;

/* ---------- Строгий разбор ---------- */

const SECTION_KEYS = ['id', 'authoredId', 'title', 'order'] as const;
const BLOCK_KEYS = [
  'section',
  'kind',
  'stableKey',
  'text',
  'rows',
  'items',
  'lines',
  'nodes',
  'edges',
  'points',
  'media',
] as const;
const RECORD_KEYS = [
  'contractVersion',
  'locale',
  'edition',
  'reportRevision',
  'sections',
  'blocks',
] as const;

export function parseEditionRecord(value: unknown): EditionRecord {
  const issues: string[] = [];
  const issue = (message: string): void => {
    if (issues.length < MAX_ISSUES) issues.push(message);
  };
  if (!isRecord(value)) throw new EditionContractError('Edition record must be an object.', ['/']);
  if (value.contractVersion !== EDITION_RECORD_VERSION)
    throw new EditionContractError(
      `Edition record version ${String(value.contractVersion)} is not supported.`,
      ['/contractVersion'],
      true,
    );
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > MAX_EDITION_RECORD_BYTES)
    issue(`/: record is larger than ${MAX_EDITION_RECORD_BYTES} bytes`);
  unknownKeys(value, RECORD_KEYS, '', issue);
  if (!PAGE_LOCALES.some((locale) => locale === value.locale)) issue('/locale: unsupported locale');
  if (!Number.isInteger(value.edition) || (value.edition as number) < 1)
    issue('/edition: must be a positive integer');
  if (
    typeof value.reportRevision !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(value.reportRevision)
  )
    issue('/reportRevision: must be a sha256 revision');
  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (!Array.isArray(value.sections)) issue('/sections: must be an array');
  const sectionIds = new Set<string>();
  sections.forEach((section: unknown, index) => {
    const at = `/sections/${index}`;
    if (!isRecord(section)) {
      issue(`${at}: must be an object`);
      return;
    }
    unknownKeys(section, SECTION_KEYS, at, issue);
    if (!isText(section.id) || section.id === '') issue(`${at}/id: must be a non-empty string`);
    else if (sectionIds.has(section.id)) issue(`${at}/id: duplicate section`);
    else sectionIds.add(section.id);
    if (typeof section.authoredId !== 'boolean') issue(`${at}/authoredId: must be a boolean`);
    if (!isText(section.title)) issue(`${at}/title: must be a string`);
    if (!Number.isInteger(section.order)) issue(`${at}/order: must be an integer`);
  });
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  if (!Array.isArray(value.blocks)) issue('/blocks: must be an array');
  if (blocks.length > MAX_EDITION_BLOCKS) issue(`/blocks: more than ${MAX_EDITION_BLOCKS} blocks`);
  blocks.forEach((block: unknown, index) => {
    const at = `/blocks/${index}`;
    if (!isRecord(block)) {
      issue(`${at}: must be an object`);
      return;
    }
    unknownKeys(block, BLOCK_KEYS, at, issue);
    if (!isText(block.section) || (block.section !== '' && !sectionIds.has(block.section)))
      issue(`${at}/section: must name a recorded section`);
    if (!isText(block.kind) || !/^(?:markdown|directive):[a-z0-9-]+$/u.test(block.kind))
      issue(`${at}/kind: must be a block kind`);
    if (block.stableKey !== undefined && !isText(block.stableKey))
      issue(`${at}/stableKey: must be a string`);
    if (block.text !== undefined && !isText(block.text)) issue(`${at}/text: must be a string`);
    if (block.items !== undefined && !isTextArray(block.items))
      issue(`${at}/items: must be strings`);
    if (block.lines !== undefined && !isTextArray(block.lines))
      issue(`${at}/lines: must be strings`);
    if (
      block.rows !== undefined &&
      !(Array.isArray(block.rows) && block.rows.every((row: unknown) => isTextArray(row)))
    )
      issue(`${at}/rows: must be rows of strings`);
    if (
      block.nodes !== undefined &&
      !objects(block.nodes, ['id', 'label', 'detail'], ['id', 'label'])
    )
      issue(`${at}/nodes: must be nodes with id and label`);
    if (
      block.edges !== undefined &&
      !objects(block.edges, ['from', 'to', 'id', 'label'], ['from', 'to'])
    )
      issue(`${at}/edges: must be edges with from and to`);
    if (
      block.points !== undefined &&
      !objects(block.points, ['series', 'label', 'value'], ['series', 'label', 'value'])
    )
      issue(`${at}/points: must be points with series, label and value`);
    if (block.media !== undefined && !objects(block.media, ['digest', 'alt'], ['digest', 'alt']))
      issue(`${at}/media: must be media with digest and alt`);
  });
  if (issues.length > 0)
    throw new EditionContractError('Edition record does not match contract version 1.', issues);
  return value as unknown as EditionRecord;
}

function unknownKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  at: string,
  issue: (message: string) => void,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) issue(`${at}/${key}: unknown field`);
}

function objects(value: unknown, allowed: readonly string[], required: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        isRecord(entry) &&
        Object.keys(entry).every((key) => allowed.includes(key)) &&
        required.every((key) => isText(entry[key])) &&
        Object.values(entry).every(isText),
    )
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isTextArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isText);
}

/* ---------- Сбор из дерева страницы ---------- */

/** Текстовый узел собственного текста блока вместе с родителем: в него встают правки. */
export interface TextRun {
  readonly node: Text;
  readonly parent: Element;
  /** Перед прогоном стоит граница частей (заголовок и описание подписи): в тексте она — пробел. */
  readonly gapBefore?: boolean;
}

export interface BlockHandle {
  readonly element: Element;
  readonly target: ReviewTargetReference;
  readonly runs: readonly TextRun[];
  readonly rows?: readonly {
    readonly row: Element;
    readonly cells: readonly (readonly TextRun[])[];
  }[];
  readonly items?: readonly { readonly item: Element; readonly runs: readonly TextRun[] }[];
  readonly code?: Element;
  /** Заголовок подписи схемы или графика: им блок назван в списке изменений. */
  readonly title?: string;
}

export interface SectionHandle {
  readonly id: string;
  readonly element: Element;
  readonly title: string;
}

/** Модель схемы или графика, снятая до того, как пакет превратил директиву в SVG. */
export type CapturedVisual =
  | {
      readonly nodes: readonly EditionNode[];
      readonly edges: readonly EditionEdge[];
    }
  | { readonly points: readonly EditionPoint[] };

export interface CollectedEdition {
  readonly sections: readonly EditionSection[];
  readonly blocks: readonly EditionBlock[];
  readonly handles: readonly BlockHandle[];
  readonly sectionHandles: readonly SectionHandle[];
}

export interface CollectOptions {
  readonly targets: readonly ReviewTargetReference[];
  readonly sectionIds: readonly string[];
  readonly authoredSectionIds: ReadonlySet<string>;
  readonly captured: ReadonlyMap<string, CapturedVisual>;
  /** Байты локальных ресурсов каталога по их относительному пути: для отпечатка картинки. */
  readonly resourceBytes: ReadonlyMap<string, Buffer>;
}

const SKIPPED_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'template',
  'script',
  'style',
  'noscript',
]);

export function collectEdition(tree: Root, options: CollectOptions): CollectedEdition {
  const targets = new Map(options.targets.map((target) => [target.id, target]));
  const sectionIds = new Set(options.sectionIds);
  const sectionHandles: SectionHandle[] = [];
  const blocks: EditionBlock[] = [];
  const handles: BlockHandle[] = [];
  let legacySection = '';
  const explicitSections = hasExplicitSections(tree, sectionIds);

  const visit = (node: Element, section: string): void => {
    let current = section;
    const id = typeof node.properties.id === 'string' ? node.properties.id : undefined;
    const isPrimarySection =
      id !== undefined &&
      sectionIds.has(id) &&
      (explicitSections ? node.properties.dataSemantic === 'section' : node.tagName === 'h2');
    if (isPrimarySection) {
      const heading = explicitSections
        ? node.children.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'h2',
          )
        : node;
      sectionHandles.push({
        id,
        element: node,
        title: normalizeEditionText(heading === undefined ? '' : plainText(heading)),
      });
      if (explicitSections) current = id;
      else legacySection = id;
    }
    const block = explicitSections ? current : legacySection;
    const targetId = node.properties.dataReviewTarget;
    const target = typeof targetId === 'string' ? targets.get(targetId) : undefined;
    if (target !== undefined && !isPrimarySection) {
      const collected = collectBlock(node, target, block, options);
      if (collected !== undefined) {
        blocks.push(collected.block);
        handles.push(collected.handle);
      }
    }
    for (const child of node.children) if (child.type === 'element') visit(child, current);
  };
  for (const child of tree.children) if (child.type === 'element') visit(child, '');

  const sections: EditionSection[] = sectionHandles.map((handle, order) => ({
    id: handle.id,
    authoredId: options.authoredSectionIds.has(handle.id),
    title: handle.title,
    order,
  }));
  return { sections, blocks, handles, sectionHandles };
}

function hasExplicitSections(tree: Root, sectionIds: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (node: Element): void => {
    if (found) return;
    if (
      node.properties.dataSemantic === 'section' &&
      typeof node.properties.id === 'string' &&
      sectionIds.has(node.properties.id)
    ) {
      found = true;
      return;
    }
    for (const child of node.children) if (child.type === 'element') visit(child);
  };
  for (const child of tree.children) if (child.type === 'element') visit(child);
  return found;
}

function collectBlock(
  element: Element,
  target: ReviewTargetReference,
  section: string,
  options: CollectOptions,
): { readonly block: EditionBlock; readonly handle: BlockHandle } | undefined {
  const kind = target.kind === 'markdown:thematicBreak' ? 'markdown:thematic-break' : target.kind;
  const base = {
    section,
    kind,
    ...(target.stableKey === undefined ? {} : { stableKey: target.stableKey }),
  };
  if (element.properties.dataVisualization !== undefined) {
    const caption = element.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'figcaption',
    );
    // Заголовок и описание подписи — разные части: в тексте между ними пробел.
    const runs =
      caption === undefined
        ? []
        : caption.children.flatMap((part) => {
            if (part.type !== 'element' || skipped(part)) return [];
            return ownRuns(part).map((run, index) =>
              index === 0 ? { ...run, gapBefore: true } : run,
            );
          });
    const captured = options.captured.get(target.id);
    const text = runsText(runs);
    return {
      block: {
        ...base,
        ...(text === '' ? {} : { text }),
        ...(captured === undefined
          ? {}
          : 'points' in captured
            ? { points: captured.points }
            : { nodes: captured.nodes, edges: captured.edges }),
      },
      handle: {
        element,
        target,
        runs,
        ...(caption === undefined ? {} : { title: captionTitle(caption) }),
      },
    };
  }
  if (element.tagName === 'table') {
    const rows = tableRows(element).map((row) => ({
      row,
      cells: row.children
        .filter(
          (cell): cell is Element =>
            cell.type === 'element' && (cell.tagName === 'td' || cell.tagName === 'th'),
        )
        .map((cell) => ownRuns(cell)),
    }));
    return {
      block: { ...base, rows: rows.map((row) => row.cells.map(runsText)) },
      handle: { element, target, runs: [], rows },
    };
  }
  if (element.tagName === 'ul' || element.tagName === 'ol') {
    const items = element.children
      .filter((child): child is Element => child.type === 'element' && child.tagName === 'li')
      .map((item) => ({ item, runs: ownRuns(item) }));
    return {
      block: { ...base, items: items.map((item) => runsText(item.runs)) },
      handle: { element, target, runs: [], items },
    };
  }
  if (kind === 'markdown:code') {
    const code =
      element.tagName === 'code'
        ? element
        : element.children.find(
            (child): child is Element => child.type === 'element' && child.tagName === 'code',
          );
    const raw = code === undefined ? '' : rawText(code);
    const lines = raw.replace(/\n$/u, '').split('\n');
    return {
      block: { ...base, lines },
      handle: { element, target, runs: [], ...(code === undefined ? {} : { code }) },
    };
  }
  const runs = ownRuns(element);
  const text = runsText(runs);
  const media = ownMedia(element, options.resourceBytes);
  return {
    block: {
      ...base,
      ...(text === '' ? {} : { text }),
      ...(media.length === 0 ? {} : { media }),
    },
    handle: { element, target, runs },
  };
}

function captionTitle(caption: Element): string {
  const first = caption.children.find(
    (part): part is Element => part.type === 'element' && !skipped(part),
  );
  return first === undefined ? '' : runsText(ownRuns(first));
}

function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  const visit = (node: Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'tr') rows.push(child);
      else if (['thead', 'tbody', 'tfoot'].includes(child.tagName)) visit(child);
    }
  };
  visit(table);
  return rows;
}

/**
 * Собственный видимый текст элемента: без вложенных блоков, служебных кнопок, скрытых панелей,
 * иконок и SVG. Кнопка-термин глоссария и вкладка несут текст автора и остаются.
 */
export function ownRuns(element: Element): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (node: Element): void => {
    for (const child of node.children) {
      if (child.type === 'text') {
        runs.push({ node: child, parent: node });
        continue;
      }
      if (child.type !== 'element' || skipped(child)) continue;
      walk(child);
    }
  };
  walk(element);
  return runs;
}

function skipped(element: Element): boolean {
  const properties = element.properties;
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  if (typeof properties.dataReviewTarget === 'string') return true;
  if (properties.hidden === true || properties.hidden === '') return true;
  if (String(properties.ariaHidden) === 'true') return true;
  if (properties.dataGlossaryPanel !== undefined) return true;
  if (properties.dataEditionRemoved !== undefined) return true;
  if (
    element.tagName === 'button' &&
    properties.dataGlossaryTrigger === undefined &&
    properties.role !== 'tab'
  )
    return true;
  return false;
}

function plainText(element: Element): string {
  return ownRuns(element)
    .map((run) => run.node.value)
    .join('');
}

function rawText(element: Element): string {
  let value = '';
  const walk = (node: Element): void => {
    for (const child of node.children) {
      if (child.type === 'text') value += child.value;
      else if (child.type === 'element' && child.properties.dataEditionRemoved === undefined)
        walk(child);
    }
  };
  walk(element);
  return value;
}

export function runsText(runs: readonly TextRun[]): string {
  return normalizeEditionText(
    runs.map((run) => (run.gapBefore === true ? ' ' : '') + run.node.value).join(''),
  );
}

function ownMedia(element: Element, resources: ReadonlyMap<string, Buffer>): EditionMedia[] {
  const media: EditionMedia[] = [];
  const walk = (node: Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (typeof child.properties.dataReviewTarget === 'string') continue;
      if (child.tagName === 'img' && typeof child.properties.src === 'string') {
        media.push({
          digest: mediaDigest(child.properties.src, resources),
          alt: normalizeEditionText(
            typeof child.properties.alt === 'string' ? child.properties.alt : '',
          ),
        });
        continue;
      }
      walk(child);
    }
  };
  walk(element);
  return media;
}

/** Отпечаток байтов картинки: одинаков у встроенной data URL и у файла каталога. */
function mediaDigest(source: string, resources: ReadonlyMap<string, Buffer>): string {
  const data = /^data:[^,]*;base64,(.*)$/su.exec(source);
  const bytes =
    data !== null
      ? Buffer.from(data[1] ?? '', 'base64')
      : (resources.get(source) ?? Buffer.from(source, 'utf8'));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Модели схем и графиков до их превращения в SVG, по `id` цели ревью. */
export function captureVisuals(tree: Root): Map<string, CapturedVisual> {
  const captured = new Map<string, CapturedVisual>();
  const visit = (node: Element): void => {
    const target = node.properties.dataReviewTarget;
    const semantic = node.properties.dataSemantic;
    if (typeof target === 'string' && (semantic === 'diagram' || semantic === 'chart')) {
      captured.set(
        target,
        semantic === 'chart' ? { points: chartPoints(node) } : diagramModel(node),
      );
    }
    walk(node);
  };
  // Подсветка кода оставляет в дереве фрагменты (`root`): обход проходит сквозь них, не меняя дерево.
  const walk = (node: Root | Element): void => {
    for (const child of node.children as (ElementContent | Root)[]) {
      if (child.type === 'element') visit(child);
      else if (child.type === 'root') walk(child);
    }
  };
  walk(tree);
  return captured;
}

function semanticChildren(node: Element, name: string): Element[] {
  const found: Element[] = [];
  const walk = (parent: Element): void => {
    for (const child of parent.children as ElementContent[]) {
      if (child.type !== 'element') continue;
      if (child.properties.dataSemantic === name) found.push(child);
      else walk(child);
    }
  };
  walk(node);
  return found;
}

function text(node: Element, property: string): string | undefined {
  const value = node.properties[property];
  return typeof value === 'string' ? normalizeEditionText(value) : undefined;
}

function diagramModel(node: Element): CapturedVisual {
  const nodes = semanticChildren(node, 'node').map((child, index) => {
    const detail = text(child, 'dataDetail');
    return {
      id: text(child, 'dataId') ?? `node-${index + 1}`,
      label: text(child, 'dataLabel') ?? '',
      ...(detail === undefined ? {} : { detail }),
    };
  });
  const edges = semanticChildren(node, 'edge').map((child) => {
    const id = text(child, 'dataId');
    const label = text(child, 'dataLabel');
    return {
      from: text(child, 'dataFrom') ?? '',
      to: text(child, 'dataTo') ?? '',
      ...(id === undefined ? {} : { id }),
      ...(label === undefined ? {} : { label }),
    };
  });
  return { nodes, edges };
}

function chartPoints(node: Element): EditionPoint[] {
  return semanticChildren(node, 'series').flatMap((series) => {
    const seriesLabel = text(series, 'dataLabel') ?? '';
    return semanticChildren(series, 'point').map((point) => ({
      series: seriesLabel,
      label: text(point, 'dataLabel') ?? '',
      value: text(point, 'dataValue') ?? '',
    }));
  });
}
