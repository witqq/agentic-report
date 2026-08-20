import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { decodeString } from 'micromark-util-decode-string';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  authoringRegistry,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
} from '../authoring/registry.js';
import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import type { SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveSourceLocation } from '../source/source-map.js';
import { enhanceVisualization } from './visualizations.js';

interface DirectiveNode {
  readonly type: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | null>>;
  readonly children?: readonly unknown[];
  data?: {
    hName?: string;
    hProperties?: Readonly<Record<string, string | string[]>>;
  };
  readonly position?: {
    readonly start: { readonly line: number; readonly column: number; readonly offset?: number };
    readonly end: { readonly line: number; readonly column: number; readonly offset?: number };
  };
}

interface DirectivePluginOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly markdown: string;
  readonly observedDirectives?: Set<string>;
}

interface DirectiveEnhancementOptions {
  readonly sourceMap: readonly SourceMapSegment[];
}

const directiveByName: ReadonlyMap<string, DirectiveDefinition> = new Map(
  authoringRegistry.directives.map((directive) => [directive.name, directive]),
);
const GENERATED_SECTION_ID_PREFIX = 'generated:';

export const remarkSemanticDirectives: Plugin<[DirectivePluginOptions], MdastRoot> =
  (options) => (tree) => {
    const glossaryByKey = new Map<string, GlossaryDefinition>();
    const glossaryTerms = new Map<string, GlossaryDefinition>();
    const termReferences: Array<{ readonly key: string; readonly node: DirectiveNode }> = [];
    const attributesByNode = new WeakMap<
      object,
      Readonly<Record<string, string | number | boolean>>
    >();
    const sectionIds = collectAuthoredSectionIds(tree);
    const claimedAuthoredSectionIds = new Set<string>();
    visit(tree, (node, _index, parent) => {
      if (!isDirectiveNode(node)) {
        return;
      }
      try {
        const directive = directiveByName.get(node.name);
        if (directive === undefined) throw unsupportedDirectiveError(node);
        requireNoPrototypeLikeAttributes(node, options.markdown);
        requireDirectiveForm(node, directive);
        requireDirectivePlacement(node, directive, parent);
        const interpretation = interpretDirectiveAttributes(directive, node.attributes ?? {});
        if (!interpretation.ok) throw directiveAttributeError(node, interpretation);
        const values =
          directive.name === 'section'
            ? normalizeSectionAttributes(
                node,
                interpretation.values,
                sectionIds,
                claimedAuthoredSectionIds,
              )
            : interpretation.values;
        if (directive.name === 'action') requireActionLabel(node);
        attributesByNode.set(node, values);
        if (directive.name === 'glossary') {
          const key = String(interpretation.values.key);
          const term = String(interpretation.values.term);
          const normalizedTerm = term.toLocaleLowerCase('und');
          if (glossaryByKey.has(key) || glossaryTerms.has(normalizedTerm)) {
            throw directiveError(
              node,
              'DUPLICATE_GLOSSARY_DEFINITION',
              `Glossary key or term is defined more than once: ${key}.`,
              'Use one unique key and canonical term for each glossary definition.',
            );
          }
          const definition = { key, term, node };
          glossaryByKey.set(key, definition);
          glossaryTerms.set(normalizedTerm, definition);
        }
        if (directive.name === 'term') {
          termReferences.push({ key: String(interpretation.values.key), node });
        }
        options.observedDirectives?.add(directive.name);
        node.data = renderDirective(directive, values);
      } catch (error) {
        if (
          error instanceof AgenticReportError &&
          node.position?.start.offset !== undefined &&
          node.position.end.offset !== undefined
        ) {
          const source = resolveSourceLocation(
            options.sourceMap,
            node.position.start.offset,
            node.position.end.offset,
          );
          if (source !== undefined) {
            const details = {
              ...error.diagnostic.details,
              ...(error.diagnostic.source?.file === undefined
                ? {}
                : { target: error.diagnostic.source.file }),
            };
            throw new AgenticReportError(
              {
                ...error.diagnostic,
                source,
                ...(Object.keys(details).length === 0 ? {} : { details }),
              },
              { cause: error },
            );
          }
        }
        throw error;
      }
    });
    for (const reference of termReferences) {
      if (!glossaryByKey.has(reference.key)) {
        throw attachDirectiveSource(
          directiveError(
            reference.node,
            'UNKNOWN_GLOSSARY_TERM',
            `No glossary definition exists for key: ${reference.key}.`,
            'Add a glossary definition with the same key or correct the term reference.',
          ),
          reference.node,
          options,
        );
      }
    }
    validateVisualizationData(tree, attributesByNode, options);
    validateActionGroups(tree, options);
    validateUnmarkedGlossaryTerms(tree, [...glossaryByKey.values()], options);
  };

function normalizeSectionAttributes(
  node: DirectiveNode,
  values: Readonly<Record<string, string | number | boolean>>,
  used: Set<string>,
  claimedAuthored: Set<string>,
): Readonly<Record<string, string | number | boolean>> {
  const authoredId = values.id;
  if (typeof authoredId === 'string') {
    if (!claimedAuthored.has(authoredId)) {
      claimedAuthored.add(authoredId);
      return values;
    }
    throw directiveError(
      node,
      'DUPLICATE_SECTION_ID',
      `Section id is defined more than once: ${authoredId}.`,
      'Use a unique explicit id or omit it to generate a collision-free id from the title.',
    );
  }
  const base = sectionSlug(String(values.title));
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = suffixedIdentity(base, suffix);
    suffix += 1;
  }
  used.add(id);
  return { ...values, id: `${GENERATED_SECTION_ID_PREFIX}${id}` };
}

function collectAuthoredSectionIds(tree: MdastRoot): Set<string> {
  const ids = new Set<string>();
  visit(tree, (node) => {
    if (!isDirectiveNode(node) || node.name !== 'section') return;
    const id = node.attributes?.id;
    if (typeof id === 'string') ids.add(id.trim());
  });
  return ids;
}

function sectionSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('und')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 56)
    .replace(/-+$/gu, '');
  if (slug.length === 0) return 'section';
  return /^[a-z]/u.test(slug) ? slug : `section-${slug}`;
}

function suffixedIdentity(base: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  return `${base.slice(0, 64 - suffixText.length).replace(/-+$/gu, '')}${suffixText}`;
}

function requireActionLabel(node: DirectiveNode): void {
  const label = (node.children ?? [])
    .map((child) =>
      typeof child === 'object' && child !== null && 'value' in child
        ? String((child as { readonly value?: unknown }).value ?? '')
        : '',
    )
    .join('')
    .trim();
  if (label.length === 0) {
    throw directiveError(
      node,
      'DIRECTIVE_LABEL_REQUIRED',
      'action requires a visible label.',
      'Use ::action[Visible label]{href="..."}.',
    );
  }
}

function validateActionGroups(tree: MdastRoot, options: DirectivePluginOptions): void {
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'actions') return;
    const children = candidate.children ?? [];
    if (
      children.length === 0 ||
      children.some((child) => !isDirectiveNode(child) || child.name !== 'action')
    ) {
      throw attachDirectiveSource(
        directiveError(
          candidate,
          'INVALID_DIRECTIVE_PLACEMENT',
          'actions accepts one or more action directives as direct children.',
          'Move prose outside actions and add links with ::action[Label]{href="..."}.',
        ),
        candidate,
        options,
      );
    }
  });
}

function validateVisualizationData(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
): void {
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate)) return;
    if (candidate.name === 'chart') validateChart(candidate);
    if (candidate.name === 'diagram') validateDiagram(candidate);
    if (candidate.name === 'timeline') requireBoundedChildren(candidate, 'event', 1, 20);
  });

  function validateChart(chart: DirectiveNode): void {
    const series = requireBoundedChildren(chart, 'series', 1, 6);
    const chartType = String(attributes(chart).type);
    if (chartType === 'pie' && series.length !== 1) {
      fail(chart, 'Pie charts require exactly one series.', 'Keep one series or use a bar chart.');
    }
    let canonicalLabels: readonly string[] | undefined;
    for (const seriesNode of series) {
      const points = requireBoundedChildren(seriesNode, 'point', 1, 12);
      const labels = points.map((point) => String(attributes(point).label));
      if (new Set(labels).size !== labels.length) {
        fail(
          seriesNode,
          'Chart point labels must be unique within each series.',
          'Use each category label once per series.',
        );
      }
      if (chartType === 'pie') {
        const values = points.map((point) => Number(attributes(point).value));
        if (values.some((value) => value < 0) || values.every((value) => value === 0)) {
          fail(
            seriesNode,
            'Pie chart values must be non-negative and include at least one positive value.',
            'Use zero or positive values, or select a bar or line chart.',
          );
        }
      }
      if (canonicalLabels === undefined) canonicalLabels = labels;
      else if (
        labels.length !== canonicalLabels.length ||
        labels.some((label, index) => label !== canonicalLabels?.[index])
      ) {
        fail(
          seriesNode,
          'Every chart series must use the same point labels in the same order.',
          'Align this series with the first series category list.',
        );
      }
    }
  }

  function validateDiagram(diagram: DirectiveNode): void {
    const children = requireOnlyDirectiveChildren(diagram, ['node', 'edge']);
    const nodes = children.filter((child) => child.name === 'node');
    const edges = children.filter((child) => child.name === 'edge');
    if (nodes.length < 1 || nodes.length > 12) {
      fail(diagram, 'Diagrams require 1 to 12 nodes.', 'Add a node or split a large diagram.');
    }
    if (edges.length > 20) {
      fail(diagram, 'Diagrams support at most 20 edges.', 'Split the diagram into smaller flows.');
    }
    const ids = nodes.map((node) => String(attributes(node).id));
    if (new Set(ids).size !== ids.length) {
      fail(diagram, 'Diagram node ids must be unique.', 'Give every node a distinct id.');
    }
    const known = new Set(ids);
    for (const edge of edges) {
      const from = String(attributes(edge).from);
      const to = String(attributes(edge).to);
      if (!known.has(from) || !known.has(to)) {
        fail(
          edge,
          `Diagram edge references an unknown node: ${!known.has(from) ? from : to}.`,
          'Use ids declared by node directives in this diagram.',
        );
      }
      if (from === to) {
        fail(edge, 'Diagram self-edges are not supported.', 'Connect two distinct nodes.');
      }
    }
  }

  function requireBoundedChildren(
    parent: DirectiveNode,
    childName: string,
    minimum: number,
    maximum: number,
  ): readonly DirectiveNode[] {
    const children = requireOnlyDirectiveChildren(parent, [childName]);
    if (children.length < minimum || children.length > maximum) {
      fail(
        parent,
        `${parent.name} requires ${minimum} to ${maximum} ${childName} directives.`,
        `Adjust the number of direct ${childName} children.`,
      );
    }
    return children;
  }

  function requireOnlyDirectiveChildren(
    parent: DirectiveNode,
    allowed: readonly string[],
  ): readonly DirectiveNode[] {
    const children = parent.children ?? [];
    const directives = children.filter(isDirectiveNode);
    if (directives.length !== children.length) {
      fail(
        parent,
        `${parent.name} accepts only ${allowed.join(' or ')} directives as direct children.`,
        'Move prose into an event body or outside this data container.',
      );
    }
    return directives;
  }

  function attributes(node: DirectiveNode): Readonly<Record<string, string | number | boolean>> {
    const values = attributesByNode.get(node);
    if (values === undefined) throw new Error(`Missing validated attributes for ${node.name}.`);
    return values;
  }

  function fail(node: DirectiveNode, message: string, remediation: string): never {
    throw attachDirectiveSource(
      directiveError(node, 'INVALID_VISUALIZATION_DATA', message, remediation),
      node,
      options,
    );
  }
}

interface GlossaryDefinition {
  readonly key: string;
  readonly term: string;
  readonly node: DirectiveNode;
}

interface TraversableNode {
  readonly type?: string;
  readonly name?: string;
  readonly value?: string;
  readonly children?: readonly TraversableNode[];
  readonly position?: DirectiveNode['position'];
}

interface InlineWrapper {
  readonly type: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  visibleStart: number;
  visibleEnd: number;
}

interface ProseSegment {
  readonly value: string;
  readonly visibleStart: number;
  readonly visibleEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly sourceBoundaries?: readonly number[];
  readonly atomicSourceSpans?: readonly AtomicSourceSpan[];
  readonly wrappers: readonly InlineWrapper[];
}

interface AtomicSourceSpan {
  readonly visibleStart: number;
  readonly visibleEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

const PROSE_CONTAINERS = new Set(['heading', 'paragraph', 'tableCell']);
const INLINE_WRAPPERS = new Set(['delete', 'emphasis', 'link', 'linkReference', 'strong']);
const COMMONMARK_ESCAPE_OR_REFERENCE =
  /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/giu;

function validateUnmarkedGlossaryTerms(
  tree: MdastRoot,
  definitions: readonly GlossaryDefinition[],
  options: DirectivePluginOptions,
): void {
  if (definitions.length === 0) return;
  const ordered = [...definitions].sort((left, right) => right.term.length - left.term.length);
  walk(tree as TraversableNode, false);

  function walk(node: TraversableNode, excluded: boolean): void {
    const nextExcluded =
      excluded ||
      (node.type?.endsWith('Directive') === true &&
        (node.name === 'glossary' || node.name === 'term')) ||
      node.type === 'code' ||
      node.type === 'inlineCode';
    if (nextExcluded) return;
    if (node.type !== undefined && PROSE_CONTAINERS.has(node.type)) {
      validateProseContainer(node, ordered, options);
      return;
    }
    for (const child of node.children ?? []) walk(child, nextExcluded);
  }
}

function validateProseContainer(
  container: TraversableNode,
  definitions: readonly GlossaryDefinition[],
  options: DirectivePluginOptions,
): void {
  let visible = '';
  let segments: ProseSegment[] = [];
  const wrappers: InlineWrapper[] = [];

  const flush = (): void => {
    if (visible.length === 0) return;
    const match = earliestGlossaryMatch(visible, definitions);
    if (match !== undefined)
      throw unmarkedGlossaryError(match, visible, segments, wrappers, options);
    visible = '';
    segments = [];
    wrappers.length = 0;
  };

  const collect = (node: TraversableNode, ancestors: readonly InlineWrapper[]): void => {
    if (
      (node.type?.endsWith('Directive') === true &&
        (node.name === 'glossary' || node.name === 'term')) ||
      node.type === 'code' ||
      node.type === 'inlineCode'
    ) {
      flush();
      return;
    }
    if (node.type === 'text' && typeof node.value === 'string') {
      const sourceStart = node.position?.start.offset;
      const sourceEnd = node.position?.end.offset;
      if (sourceStart === undefined || sourceEnd === undefined) {
        flush();
        return;
      }
      const visibleStart = visible.length;
      visible += node.value;
      const raw = options.markdown.slice(sourceStart, sourceEnd);
      const sourceMapping = visibleSourceMapping(raw, node.value, sourceStart);
      segments.push({
        value: node.value,
        visibleStart,
        visibleEnd: visible.length,
        sourceStart,
        sourceEnd,
        ...(sourceMapping === undefined
          ? {}
          : {
              sourceBoundaries: sourceMapping.boundaries,
              atomicSourceSpans: sourceMapping.atomicSpans.map((span) => ({
                ...span,
                visibleStart: visibleStart + span.visibleStart,
                visibleEnd: visibleStart + span.visibleEnd,
              })),
            }),
        wrappers: ancestors,
      });
      return;
    }
    if (node.type === 'break') {
      const sourceStart = node.position?.start.offset;
      const sourceEnd = node.position?.end.offset;
      if (sourceStart === undefined || sourceEnd === undefined) {
        flush();
        return;
      }
      const visibleStart = visible.length;
      visible += ' ';
      segments.push({
        value: ' ',
        visibleStart,
        visibleEnd: visible.length,
        sourceStart,
        sourceEnd,
        sourceBoundaries: [sourceStart, sourceEnd],
        wrappers: ancestors,
      });
      return;
    }
    const children = node.children;
    if (children === undefined || children.length === 0) {
      flush();
      return;
    }
    if (node.type !== undefined && INLINE_WRAPPERS.has(node.type)) {
      const sourceStart = node.position?.start.offset;
      const sourceEnd = node.position?.end.offset;
      if (sourceStart === undefined || sourceEnd === undefined) {
        flush();
        return;
      }
      const wrapper: InlineWrapper = {
        type: node.type,
        sourceStart,
        sourceEnd,
        visibleStart: visible.length,
        visibleEnd: visible.length,
      };
      wrappers.push(wrapper);
      for (const child of children) collect(child, [...ancestors, wrapper]);
      wrapper.visibleEnd = visible.length;
      return;
    }
    for (const child of children) collect(child, ancestors);
  };

  for (const child of container.children ?? []) collect(child, []);
  flush();
}

function unmarkedGlossaryError(
  match: {
    readonly definition: GlossaryDefinition;
    readonly index: number;
    readonly length: number;
  },
  visible: string,
  segments: readonly ProseSegment[],
  wrappers: readonly InlineWrapper[],
  options: DirectivePluginOptions,
): AgenticReportError {
  const matchEnd = match.index + match.length;
  const startSegment = segmentAt(segments, match.index);
  const endSegment = segmentAt(segments, matchEnd - 1);
  if (startSegment === undefined || endSegment === undefined) {
    throw new Error('Glossary match is not backed by authored text segments.');
  }
  const mappedSourceStart =
    startSegment.sourceBoundaries?.[match.index - startSegment.visibleStart];
  const mappedSourceEnd = endSegment.sourceBoundaries?.[matchEnd - endSegment.visibleStart];
  let visibleStart = mappedSourceStart === undefined ? startSegment.visibleStart : match.index;
  let visibleEnd = mappedSourceEnd === undefined ? endSegment.visibleEnd : matchEnd;
  let sourceStart = mappedSourceStart ?? startSegment.sourceStart;
  let sourceEnd = mappedSourceEnd ?? endSegment.sourceEnd;

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const segment of segments) {
      for (const span of segment.atomicSourceSpans ?? []) {
        const overlaps = span.visibleStart < visibleEnd && span.visibleEnd > visibleStart;
        const contains = visibleStart <= span.visibleStart && visibleEnd >= span.visibleEnd;
        if (!overlaps || contains) continue;
        visibleStart = Math.min(visibleStart, span.visibleStart);
        visibleEnd = Math.max(visibleEnd, span.visibleEnd);
        sourceStart = Math.min(sourceStart, span.sourceStart);
        sourceEnd = Math.max(sourceEnd, span.sourceEnd);
        expanded = true;
      }
    }
    const envelopeStart = segmentAt(segments, visibleStart);
    const envelopeEnd = segmentAt(segments, visibleEnd - 1);
    if (envelopeStart === undefined || envelopeEnd === undefined) break;
    for (const wrapper of wrappers) {
      const crossesBoundary =
        envelopeStart.wrappers.includes(wrapper) !== envelopeEnd.wrappers.includes(wrapper);
      const nestsInteractiveTerm = wrapper.type === 'link' || wrapper.type === 'linkReference';
      const containsEnvelope =
        wrapper.visibleStart <= visibleStart && wrapper.visibleEnd >= visibleEnd;
      if (!crossesBoundary && !(nestsInteractiveTerm && containsEnvelope)) continue;
      const nextVisibleStart = Math.min(visibleStart, wrapper.visibleStart);
      const nextVisibleEnd = Math.max(visibleEnd, wrapper.visibleEnd);
      const nextSourceStart = Math.min(sourceStart, wrapper.sourceStart);
      const nextSourceEnd = Math.max(sourceEnd, wrapper.sourceEnd);
      if (
        nextVisibleStart !== visibleStart ||
        nextVisibleEnd !== visibleEnd ||
        nextSourceStart !== sourceStart ||
        nextSourceEnd !== sourceEnd
      ) {
        visibleStart = nextVisibleStart;
        visibleEnd = nextVisibleEnd;
        sourceStart = nextSourceStart;
        sourceEnd = nextSourceEnd;
        expanded = true;
      }
    }
  }

  const replacement = `${visible.slice(visibleStart, match.index)}:term[${escapeDirectiveLabel(match.definition.term)}]{key="${match.definition.key}"}${visible.slice(matchEnd, visibleEnd)}`;
  const source = resolveSourceLocation(options.sourceMap, sourceStart, sourceEnd);
  return new AgenticReportError({
    level: 'error',
    code: 'UNMARKED_GLOSSARY_TERM',
    message: `Registered glossary term must use a term reference: ${match.definition.term}.`,
    remediation: `Replace this occurrence with ${replacement}.`,
    ...(source === undefined ? {} : { source }),
    details: { key: match.definition.key },
  });
}

function visibleSourceMapping(
  raw: string,
  visible: string,
  sourceStart: number,
):
  | {
      readonly boundaries: readonly number[];
      readonly atomicSpans: readonly AtomicSourceSpan[];
    }
  | undefined {
  const boundaries = [sourceStart];
  const atomicSpans: AtomicSourceSpan[] = [];
  let rawCursor = 0;
  let decoded = '';

  const appendLiteral = (end: number): void => {
    const literal = raw.slice(rawCursor, end);
    decoded += literal;
    for (let index = rawCursor; index < end; index += 1) {
      boundaries.push(sourceStart + index + 1);
    }
    rawCursor = end;
  };

  for (const match of raw.matchAll(COMMONMARK_ESCAPE_OR_REFERENCE)) {
    const index = match.index;
    appendLiteral(index);
    const token = match[0];
    const tokenDecoded = decodeString(token);
    const tokenVisibleStart = decoded.length;
    decoded += tokenDecoded;
    if (tokenDecoded === token) {
      for (let offset = 0; offset < token.length; offset += 1) {
        boundaries.push(sourceStart + index + offset + 1);
      }
    } else {
      for (let offset = 0; offset < tokenDecoded.length; offset += 1) {
        boundaries.push(
          sourceStart + index + (offset === tokenDecoded.length - 1 ? token.length : 0),
        );
      }
      if (tokenDecoded.length > 1) {
        atomicSpans.push({
          visibleStart: tokenVisibleStart,
          visibleEnd: tokenVisibleStart + tokenDecoded.length,
          sourceStart: sourceStart + index,
          sourceEnd: sourceStart + index + token.length,
        });
      }
    }
    rawCursor = index + token.length;
  }
  appendLiteral(raw.length);
  return decoded === visible && boundaries.length === visible.length + 1
    ? { boundaries, atomicSpans }
    : undefined;
}

function segmentAt(
  segments: readonly ProseSegment[],
  visibleIndex: number,
): ProseSegment | undefined {
  return segments.find(
    (segment) => visibleIndex >= segment.visibleStart && visibleIndex < segment.visibleEnd,
  );
}

function earliestGlossaryMatch(
  value: string,
  definitions: readonly GlossaryDefinition[],
):
  | { readonly definition: GlossaryDefinition; readonly index: number; readonly length: number }
  | undefined {
  let earliest:
    | { readonly definition: GlossaryDefinition; readonly index: number; readonly length: number }
    | undefined;
  for (const definition of definitions) {
    const visibleTerm = escapeRegExp(definition.term).replace(/\s+/gu, '\\s+');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${visibleTerm}(?![\\p{L}\\p{N}_])`, 'iu');
    const match = pattern.exec(value);
    if (match === null) continue;
    if (earliest === undefined || match.index < earliest.index) {
      earliest = { definition, index: match.index, length: match[0].length };
    }
  }
  return earliest;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function escapeDirectiveLabel(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\[/gu, '\\[').replace(/\]/gu, '\\]');
}

function attachDirectiveSource(
  error: AgenticReportError,
  node: DirectiveNode,
  options: DirectivePluginOptions,
): AgenticReportError {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return error;
  const source = resolveSourceLocation(options.sourceMap, start, end);
  return source === undefined
    ? error
    : new AgenticReportError({ ...error.diagnostic, source }, { cause: error });
}

const PROTOTYPE_LIKE_ATTRIBUTES = new Set(['__proto__', 'prototype', 'constructor']);

function requireNoPrototypeLikeAttributes(node: DirectiveNode, markdown: string): void {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return;
  const directiveSource = markdown.slice(start, end);
  const attributes = directiveAttributeNames(directiveSource).filter((name) =>
    PROTOTYPE_LIKE_ATTRIBUTES.has(name),
  );
  if (attributes.length === 0) return;
  throw directiveError(
    node,
    'UNKNOWN_DIRECTIVE_ATTRIBUTE',
    `${node.name} does not support: ${attributes.join(', ')}.`,
    `Use only these attributes: ${
      directiveByName
        .get(node.name)
        ?.attributes.map((attribute) => attribute.name)
        .join(', ') || 'none'
    }.`,
  );
}

function directiveAttributeNames(directiveSource: string): string[] {
  const block = directiveAttributeBlock(directiveSource);
  if (block === undefined) return [];
  const names: string[] = [];
  let index = 0;
  while (index < block.length) {
    index = skipWhitespace(block, index);
    if (index >= block.length) break;
    if (block[index] === '#' || block[index] === '.') {
      index = skipBareToken(block, index + 1);
      continue;
    }
    const nameStart = index;
    while (index < block.length && !/[\s=]/u.test(block[index] ?? '')) index += 1;
    const name = block.slice(nameStart, index);
    index = skipWhitespace(block, index);
    if (name.length > 0) names.push(name);
    if (block[index] !== '=') {
      continue;
    }
    index = skipWhitespace(block, index + 1);
    const quote = block[index];
    if (quote === '"' || quote === "'") {
      index = skipQuotedValue(block, index + 1, quote);
    } else {
      index = skipBareToken(block, index);
    }
  }
  return names;
}

function directiveAttributeBlock(directiveSource: string): string | undefined {
  let index = 0;
  while (directiveSource[index] === ':') index += 1;
  while (/[\p{L}\p{N}_-]/u.test(directiveSource[index] ?? '')) index += 1;
  if (directiveSource[index] === '[') {
    index = skipDirectiveLabel(directiveSource, index + 1);
  }
  while (directiveSource[index] === ' ' || directiveSource[index] === '\t') index += 1;
  if (directiveSource[index] !== '{') return undefined;
  const end = matchingAttributeBrace(directiveSource, index + 1);
  return end === undefined ? undefined : directiveSource.slice(index + 1, end);
}

function skipDirectiveLabel(value: string, start: number): number {
  let depth = 1;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return value.length;
}

function matchingAttributeBrace(value: string, start: number): number | undefined {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== undefined) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '}') return index;
  }
  return undefined;
}

function skipWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/u.test(value[index] ?? '')) index += 1;
  return index;
}

function skipBareToken(value: string, start: number): number {
  let index = start;
  while (index < value.length && !/\s/u.test(value[index] ?? '')) index += 1;
  return index;
}

function skipQuotedValue(value: string, start: number, quote: '"' | "'"): number {
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === quote) return index + 1;
  }
  return value.length;
}

export const rehypeEnhanceDirectives: Plugin<[DirectiveEnhancementOptions], HastRoot> =
  (options) => (tree) => {
    const allocateId = createDocumentIdAllocator(tree, options);
    const glossary = new Map<
      string,
      { readonly term: string; readonly explanation: string; readonly id: string }
    >();
    visit(tree, 'element', (node: Element) => {
      if (node.properties.dataSemantic !== 'glossary') return;
      const key = stringProperty(node, 'dataKey');
      const term = stringProperty(node, 'dataTerm');
      if (key !== undefined && term !== undefined) {
        glossary.set(key, {
          term,
          explanation: hastText(node),
          id: allocateId(`glossary-${key}`),
        });
      }
    });

    let instance = 0;
    let glossaryReferenceInstance = 0;
    visit(tree, 'element', (node: Element) => {
      if (
        node.tagName === 'a' &&
        typeof node.properties.dataLocalAsset === 'string' &&
        node.children.length === 0
      ) {
        node.children.push({
          type: 'text',
          value: `Download ${assetLabel(node.properties.dataLocalAsset)}`,
        });
      }
      const semantic = stringProperty(node, 'dataSemantic');
      if (semantic === 'section') {
        enhanceSection(node, allocateId);
        return;
      }
      if (semantic === 'action') {
        enhanceAction(node);
        return;
      }
      if (semantic !== undefined && ['chart', 'diagram', 'timeline'].includes(semantic)) {
        instance += 1;
        enhanceVisualization(node, semantic, instance, allocateId);
        return;
      }
      if (semantic === 'term') {
        const key = stringProperty(node, 'dataKey');
        const definition = key === undefined ? undefined : glossary.get(key);
        if (key !== undefined && definition !== undefined) {
          glossaryReferenceInstance += 1;
          const panelId = allocateId(`glossary-reference-${glossaryReferenceInstance}`);
          const panelTitleId = allocateId(`${panelId}-title`);
          node.tagName = 'span';
          node.properties.dataTermReference = key;
          node.properties.dataPopover = '';
          node.properties.dataGlossaryReference = '';
          node.children = [
            {
              type: 'element',
              tagName: 'button',
              properties: {
                type: 'button',
                ariaControls: [panelId],
                ariaExpanded: 'false',
                ariaHasPopup: 'dialog',
                dataPopoverTrigger: '',
                dataGlossaryTrigger: '',
              },
              children: [{ type: 'text', value: definition.term }],
            },
            {
              type: 'element',
              tagName: 'span',
              properties: {
                id: panelId,
                role: 'dialog',
                ariaLabelledBy: [panelTitleId],
                hidden: '',
                dataPopoverPanel: '',
                dataGlossaryPanel: '',
              },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { id: panelTitleId, className: ['semantic-title'] },
                  children: [{ type: 'text', value: definition.term }],
                },
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['semantic-glossary-explanation'] },
                  children: [{ type: 'text', value: definition.explanation }],
                },
                {
                  type: 'element',
                  tagName: 'a',
                  properties: {
                    href: `#${definition.id}`,
                    className: ['semantic-glossary-link'],
                    dataGlossaryDefinitionLink: '',
                  },
                  children: [{ type: 'text', value: 'View full definition' }],
                },
              ],
            },
          ];
          delete node.properties.dataKey;
        }
        return;
      }
      if (semantic === 'glossary') {
        const key = stringProperty(node, 'dataKey');
        const term = stringProperty(node, 'dataTerm');
        if (key !== undefined && term !== undefined) {
          node.properties.id = glossary.get(key)?.id ?? allocateId(`glossary-${key}`);
          node.children.unshift(semanticTitle(term));
        }
        delete node.properties.dataKey;
        delete node.properties.dataTerm;
        return;
      }
      if (semantic === 'disclosure') {
        enhanceDisclosure(node);
        return;
      }
      if (semantic === 'tabs') {
        instance += 1;
        enhanceTabs(node, instance, allocateId);
        return;
      }
      if (semantic === 'modal') {
        instance += 1;
        enhanceModal(node, instance, allocateId);
        return;
      }
      if (semantic === 'popover') {
        instance += 1;
        enhancePopover(node, instance, allocateId);
        return;
      }
      if (semantic === 'filter') {
        instance += 1;
        enhanceFilter(node, instance, allocateId);
        return;
      }
      if (semantic === 'toggle') {
        instance += 1;
        enhanceToggle(node, instance, allocateId);
        return;
      }
      prependDirectiveTitle(node);
      if ('dataDemoCounter' in node.properties) enhanceCounter(node);
    });
  };

function enhanceSection(node: Element, allocateId: (base: string) => string): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const transportedId = takeStringProperty(node, 'dataId');
  if (title === undefined || transportedId === undefined) {
    throw new Error('Validated section is missing its title or id.');
  }
  const generated = transportedId.startsWith(GENERATED_SECTION_ID_PREFIX);
  const desiredId = generated
    ? transportedId.slice(GENERATED_SECTION_ID_PREFIX.length)
    : transportedId;
  const sectionId = generated ? allocateId(desiredId) : desiredId;
  const titleId = allocateId(`${sectionId}-title`);
  node.properties.id = sectionId;
  node.properties.ariaLabelledBy = [titleId];
  node.children.unshift({
    type: 'element',
    tagName: 'h2',
    properties: { id: titleId, className: ['semantic-section-title'] },
    children: [{ type: 'text', value: title }],
  });
}

function createDocumentIdAllocator(
  tree: HastRoot,
  options: DirectiveEnhancementOptions,
): (base: string) => string {
  const usedIds = new Set<string>();
  visit(tree, 'element', (node: Element) => {
    const id = stringProperty(node, 'id');
    if (id !== undefined) usedIds.add(id);
  });
  visit(tree, 'element', (node: Element) => {
    if (node.properties.dataSemantic !== 'section') return;
    const transportedId = stringProperty(node, 'dataId');
    if (transportedId === undefined || transportedId.startsWith(GENERATED_SECTION_ID_PREFIX)) {
      return;
    }
    if (usedIds.has(transportedId)) {
      const diagnostic = {
        level: 'error',
        code: 'DUPLICATE_SECTION_ID',
        message: `Section id collides with another document id: ${transportedId}.`,
        remediation: 'Use a unique explicit section id or omit it to generate a collision-free id.',
        details: { id: transportedId },
      } as const;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const source =
        start === undefined || end === undefined
          ? undefined
          : resolveSourceLocation(options.sourceMap, start, end);
      throw new AgenticReportError(source === undefined ? diagnostic : { ...diagnostic, source });
    }
    usedIds.add(transportedId);
  });
  return (base: string): string => {
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = suffixedIdentity(base, suffix);
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };
}

function enhanceAction(node: Element): void {
  const href = takeStringProperty(node, 'dataHref');
  if (href === undefined) throw new Error('Validated action is missing its href.');
  node.properties.href = href;
}

function hastText(node: Element): string {
  const values: string[] = [];
  const pending = [...node.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (child?.type === 'text') values.push(child.value);
    else if (child?.type === 'element') pending.push(...[...child.children].reverse());
  }
  return values.join(' ').replace(/\s+/gu, ' ').trim();
}

function enhanceDisclosure(node: Element): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? 'Details';
  const open = takeStringProperty(node, 'dataOpen') === 'true';
  node.tagName = 'details';
  node.properties.dataDisclosure = '';
  if (open) node.properties.open = true;
  node.children.unshift({
    type: 'element',
    tagName: 'summary',
    properties: { className: ['semantic-disclosure-summary'] },
    children: [{ type: 'text', value: title }],
  });
}

function enhanceTabs(node: Element, instance: number, allocateId: (base: string) => string): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const titleId = title === undefined ? undefined : allocateId(`tabs-${instance}-title`);
  const panels = node.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'tab',
  );
  const buttons: Element[] = [];
  panels.forEach((panel, index) => {
    const label = takeStringProperty(panel, 'dataLabel') ?? `Tab ${index + 1}`;
    const tabId = allocateId(`tabs-${instance}-tab-${index + 1}`);
    const panelId = allocateId(`tabs-${instance}-panel-${index + 1}`);
    panel.properties.id = panelId;
    panel.properties.role = 'tabpanel';
    panel.properties.ariaLabelledBy = [tabId];
    panel.properties.tabIndex = 0;
    panel.properties.dataTabPanel = '';
    if (index !== 0) panel.properties.hidden = '';
    buttons.push({
      type: 'element',
      tagName: 'button',
      properties: {
        type: 'button',
        id: tabId,
        role: 'tab',
        ariaControls: [panelId],
        ariaSelected: index === 0 ? 'true' : 'false',
        tabIndex: index === 0 ? 0 : -1,
        dataTab: '',
      },
      children: [{ type: 'text', value: label }],
    });
  });
  node.properties.dataTabs = '';
  node.children = [
    ...(title === undefined || titleId === undefined ? [] : [semanticTitle(title, titleId)]),
    {
      type: 'element',
      tagName: 'div',
      properties: {
        role: 'tablist',
        ...(titleId === undefined
          ? { ariaLabel: 'Content sections' }
          : { ariaLabelledBy: [titleId] }),
        className: ['semantic-tab-list'],
      },
      children: buttons,
    },
    ...node.children,
  ];
}

function enhanceModal(node: Element, instance: number, allocateId: (base: string) => string): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? 'Dialog';
  const trigger = takeStringProperty(node, 'dataTrigger') ?? 'Open dialog';
  const dialogId = allocateId(`modal-${instance}`);
  const titleId = allocateId(`${dialogId}-title`);
  const content = node.children;
  node.properties.dataModal = '';
  node.children = [
    actionButton(trigger, { dataModalOpen: dialogId, ariaHasPopup: 'dialog' }),
    {
      type: 'element',
      tagName: 'dialog',
      properties: { id: dialogId, ariaLabelledBy: [titleId], dataModalDialog: '' },
      children: [
        semanticTitle(title, titleId),
        ...content,
        actionButton('Close', { dataModalClose: '' }),
      ],
    },
  ];
}

function enhancePopover(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? 'Details';
  const trigger = takeStringProperty(node, 'dataTrigger') ?? 'Show details';
  const panelId = allocateId(`popover-${instance}`);
  const titleId = allocateId(`${panelId}-title`);
  const content = node.children;
  node.properties.dataPopover = '';
  node.children = [
    actionButton(trigger, {
      dataPopoverTrigger: '',
      ariaControls: [panelId],
      ariaExpanded: 'false',
      ariaHasPopup: 'dialog',
    }),
    {
      type: 'element',
      tagName: 'div',
      properties: {
        id: panelId,
        role: 'dialog',
        ariaLabelledBy: [titleId],
        hidden: '',
        dataPopoverPanel: '',
      },
      children: [semanticTitle(title, titleId), ...content],
    },
  ];
}

function enhanceFilter(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const placeholder = takeStringProperty(node, 'dataPlaceholder') ?? 'Filter items';
  const inputId = allocateId(`filter-${instance}`);
  node.properties.dataFilter = '';
  node.children = [
    ...(title === undefined ? [] : [semanticTitle(title)]),
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['semantic-filter-controls'] },
      children: [
        {
          type: 'element',
          tagName: 'label',
          properties: { htmlFor: [inputId] },
          children: [{ type: 'text', value: 'Filter' }],
        },
        {
          type: 'element',
          tagName: 'input',
          properties: { id: inputId, type: 'search', placeholder, dataFilterInput: '' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'output',
          properties: { ariaLive: 'polite', dataFilterCount: '' },
          children: [],
        },
      ],
    },
    ...node.children,
  ];
}

function enhanceToggle(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const label = takeStringProperty(node, 'dataLabel') ?? 'Toggle content';
  const active = takeStringProperty(node, 'dataDefault') === 'on';
  const panelId = allocateId(`toggle-${instance}`);
  const content = node.children;
  node.properties.dataToggle = '';
  node.children = [
    ...(title === undefined ? [] : [semanticTitle(title)]),
    actionButton(label, {
      role: 'switch',
      ariaChecked: active ? 'true' : 'false',
      ariaControls: [panelId],
      dataToggleControl: '',
    }),
    {
      type: 'element',
      tagName: 'div',
      properties: { id: panelId, dataTogglePanel: '', ...(active ? {} : { hidden: '' }) },
      children: content,
    },
  ];
}

function enhanceCounter(node: Element): void {
  const start = String(node.properties.dataStart ?? '0');
  node.children.push({
    type: 'element',
    tagName: 'div',
    properties: { className: ['semantic-demo-controls'] },
    children: [
      actionButton('Increment', { dataDemoIncrement: '' }),
      { type: 'text', value: ' ' },
      {
        type: 'element',
        tagName: 'output',
        properties: { dataDemoOutput: '', ariaLive: 'polite' },
        children: [{ type: 'text', value: start }],
      },
    ],
  });
}

function prependDirectiveTitle(node: Element): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  if (title === undefined) return;
  node.children.unshift(
    node.properties.dataSemantic === 'callout'
      ? {
          type: 'element',
          tagName: 'p',
          properties: { className: ['semantic-title'] },
          children: [{ type: 'text', value: title }],
        }
      : semanticTitle(title),
  );
}

function semanticTitle(value: string, id?: string): Element {
  return {
    type: 'element',
    tagName: 'h3',
    properties: { className: ['semantic-title'], ...(id === undefined ? {} : { id }) },
    children: [{ type: 'text', value }],
  };
}

function actionButton(label: string, properties: Element['properties']): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: { type: 'button', ...properties },
    children: [{ type: 'text', value: label }],
  };
}

function stringProperty(node: Element, name: string): string | undefined {
  const value = node.properties[name];
  return typeof value === 'string' ? value : undefined;
}

function takeStringProperty(node: Element, name: string): string | undefined {
  const value = stringProperty(node, name);
  delete node.properties[name];
  return value;
}

function assetLabel(reference: string): string {
  const basename = reference.split(/[\\/]/).at(-1) ?? reference;
  try {
    return decodeURIComponent(basename);
  } catch {
    return basename;
  }
}

function isDirectiveNode(node: unknown): node is DirectiveNode {
  if (typeof node !== 'object' || node === null || !('type' in node) || !('name' in node)) {
    return false;
  }
  const candidate = node as { readonly type?: unknown; readonly name?: unknown };
  return (
    typeof candidate.type === 'string' &&
    candidate.type.endsWith('Directive') &&
    typeof candidate.name === 'string'
  );
}

function requireDirectiveForm(node: DirectiveNode, directive: DirectiveDefinition): void {
  const form = directiveForm(node.type);
  if (form === undefined || !directive.forms.includes(form)) {
    throw directiveError(
      node,
      'INVALID_DIRECTIVE_FORM',
      `${node.name} cannot use the ${node.type} form.`,
      `Use one of these directive forms: ${directive.forms.map(formNodeType).join(', ')}.`,
    );
  }
}

function requireDirectivePlacement(
  node: DirectiveNode,
  directive: DirectiveDefinition,
  parent: unknown,
): void {
  const parentDirective = isDirectiveNode(parent) ? directiveByName.get(parent.name) : undefined;
  const requiredParent = directive.placement.requiredParent;
  if (
    directive.placement.topLevelOnly === true &&
    (!isTraversableNode(parent) || parent.type !== 'root')
  ) {
    throw directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${directive.name} must be a top-level directive.`,
      `Move this ${directive.name} directive outside blockquotes, lists, and other directives.`,
    );
  }
  if (requiredParent !== undefined && parentDirective?.name !== requiredParent) {
    throw directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${directive.name} must be nested directly inside ${requiredParent}.`,
      `Move this ${directive.name} directive inside a ${requiredParent} directive.`,
    );
  }
  const allowedChildren = allowedDirectiveChildren(parentDirective?.children);
  if (allowedChildren !== undefined && !allowedChildren.includes(directive.name)) {
    const parentName = parentDirective?.name ?? 'parent';
    throw directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${parentName} accepts only ${allowedChildren.join(' or ')} directives as directive children.`,
      `Move this ${directive.name} directive outside ${parentName} or use an allowed child.`,
    );
  }
}

function allowedDirectiveChildren(
  children: DirectiveDefinition['children'] | undefined,
): readonly string[] | undefined {
  switch (children) {
    case 'markdown-and-card-directives':
      return ['card'];
    case 'markdown-and-tab-directives':
      return ['tab'];
    case 'action-directives':
      return ['action'];
    case 'series-directives':
      return ['series'];
    case 'point-directives':
      return ['point'];
    case 'node-and-edge-directives':
      return ['node', 'edge'];
    case 'event-directives':
      return ['event'];
    case 'markdown':
    case 'label-or-generated-label':
    case 'none':
    case undefined:
      return undefined;
    default: {
      const exhaustive: never = children;
      return exhaustive;
    }
  }
}

function isTraversableNode(value: unknown): value is TraversableNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function renderDirective(
  directive: DirectiveDefinition,
  values: Readonly<Record<string, string | number | boolean>>,
): NonNullable<DirectiveNode['data']> {
  const properties: Record<string, string | string[]> = {
    className: [directive.sanitizer.className],
  };
  for (const attribute of directive.attributes) {
    const value = values[attribute.name];
    if (value !== undefined) properties[attribute.renderProperty] = String(value);
  }
  switch (directive.behavior.renderer) {
    case 'semantic-container':
      properties.dataSemantic = directive.name;
      if (directive.behavior.runtime === 'package-owned-counter') {
        properties.dataDemoCounter = '';
      }
      break;
    case 'download-asset':
      properties.download = '';
      break;
    case 'font-registration':
      properties.hidden = '';
      break;
    default: {
      const exhaustive: never = directive.behavior.renderer;
      return exhaustive;
    }
  }
  return { hName: directive.sanitizer.tagName, hProperties: properties };
}

function directiveAttributeError(
  node: DirectiveNode,
  interpretation: Exclude<ReturnType<typeof interpretDirectiveAttributes>, { readonly ok: true }>,
): AgenticReportError {
  if (interpretation.reason === 'unknown') {
    const allowed =
      directiveByName.get(node.name)?.attributes.map((attribute) => attribute.name) ?? [];
    return directiveError(
      node,
      'UNKNOWN_DIRECTIVE_ATTRIBUTE',
      `${node.name} does not support: ${interpretation.attributes.join(', ')}.`,
      `Use only these attributes: ${allowed.join(', ') || 'none'}.`,
    );
  }
  const { attribute } = interpretation;
  if (interpretation.reason === 'required') {
    return directiveError(
      node,
      'DIRECTIVE_ATTRIBUTE_REQUIRED',
      `${node.name} requires the ${attribute.name} attribute.`,
      requiredAttributeRemediation(attribute),
    );
  }
  return directiveError(
    node,
    attribute.invalidDiagnostic,
    invalidAttributeMessage(node.name, attribute),
    invalidAttributeRemediation(attribute),
  );
}

function requiredAttributeRemediation(attribute: DirectiveAttributeDefinition): string {
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_PATH') {
    return `Add {${attribute.name}="relative/path"} to the directive.`;
  }
  if (attribute.invalidDiagnostic === 'INVALID_FONT_FAMILY') {
    return 'Add {family="Readable font name"} to the directive.';
  }
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_LINK') {
    return `Add {${attribute.name}="#anchor"} or another safe link target to the directive.`;
  }
  return `Add the required ${attribute.name} attribute.`;
}

function invalidAttributeMessage(
  directiveName: string,
  attribute: DirectiveAttributeDefinition,
): string {
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_PATH') {
    return `${directiveName}.${attribute.name} must be a relative local path.`;
  }
  if (attribute.invalidDiagnostic === 'INVALID_FONT_FAMILY') {
    return 'font.family contains unsupported characters.';
  }
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_LINK') {
    return `${directiveName}.${attribute.name} must be a safe same-page, relative, HTTP(S), or email target.`;
  }
  if (attribute.constraint.kind === 'integer') {
    return `${directiveName}.${attribute.name} must be an integer with at most six digits.`;
  }
  return `${directiveName}.${attribute.name} does not satisfy its declared constraint.`;
}

function invalidAttributeRemediation(attribute: DirectiveAttributeDefinition): string {
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_PATH') {
    return 'Place the resource under the source directory and use a relative path.';
  }
  if (attribute.invalidDiagnostic === 'INVALID_FONT_FAMILY') {
    return 'Use 1-80 letters, numbers, spaces, underscores, or hyphens.';
  }
  if (attribute.invalidDiagnostic === 'INVALID_DIRECTIVE_LINK') {
    return 'Use #anchor, a relative path, https:// or http:// URL, or mailto: address.';
  }
  if (attribute.constraint.kind === 'integer') {
    return `Use an integer ${attribute.name} value.`;
  }
  return `Provide a valid ${attribute.name} value described by the authoring schema.`;
}

function unsupportedDirectiveError(node: DirectiveNode): AgenticReportError {
  return directiveError(
    node,
    'UNSUPPORTED_DIRECTIVE',
    `Unsupported semantic directive: ${node.name}`,
    `Use ${authoringRegistry.directives.map((directive) => directive.name).join(', ')}.`,
  );
}

function directiveForm(nodeType: string): DirectiveForm | undefined {
  return (
    {
      containerDirective: 'container',
      leafDirective: 'leaf',
      textDirective: 'text',
    } as Readonly<Record<string, DirectiveForm>>
  )[nodeType];
}

function formNodeType(form: DirectiveForm): string {
  return `${form}Directive`;
}

function directiveError(
  _node: DirectiveNode,
  code: string,
  message: string,
  remediation: string,
): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code,
    message,
    remediation,
  });
}
