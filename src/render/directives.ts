import { createHash } from 'node:crypto';

import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Code, Root as MdastRoot } from 'mdast';
import { decodeString } from 'micromark-util-decode-string';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  authoringRegistry,
  DIAGRAM_CONTRACT,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
  type CodeFenceMetadataDefinition,
} from '../authoring/registry.js';
import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import type { SourceMapSegment } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { packageStrings, type PackageStrings } from '../localization.js';
import { MAX_REVIEW_RESPONSES } from '../review/contract.js';
import {
  RESPONSE_CONTRACT_VERSION,
  MAX_RESPONSE_FORMS,
  MAX_RESPONSE_ITEMS,
  MAX_RESPONSE_OPTIONS,
  MAX_RESPONSE_QUESTIONS,
  parseResponseFormManifest,
  type ResponseItemDefinition,
  type ResponseQuestionDefinition,
  type ResponseQuestionKind,
} from '../response/contract.js';
import { resolveSourceLocation } from '../source/source-map.js';
import { decorativeIcon } from './icons.js';
import { enhanceVisualization } from './visualizations.js';

interface SourcePosition {
  readonly start: {
    readonly line: number;
    readonly column: number;
    readonly offset?: number | undefined;
  };
  readonly end: {
    readonly line: number;
    readonly column: number;
    readonly offset?: number | undefined;
  };
}

interface DirectiveNode {
  readonly type: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | null>>;
  readonly children?: readonly unknown[];
  data?: {
    hName?: string;
    hProperties?: Readonly<Record<string, string | string[]>>;
  };
  readonly position?: SourcePosition | undefined;
}

interface DirectivePluginOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly markdown: string;
  readonly observedDirectives?: Set<string>;
}

interface DirectiveEnhancementOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly language?: string;
}

const directiveByName: ReadonlyMap<string, DirectiveDefinition> = new Map(
  authoringRegistry.directives.map((directive) => [directive.name, directive]),
);
const GENERATED_SECTION_ID_PREFIX = 'generated:';
const CODE_TERM_FIELD = 'terms' as const;
const CODE_TERM_METADATA = authoringRegistry.source.codeFenceMetadata.terms;
const CODE_TERM_KEY_PATTERN = new RegExp(CODE_TERM_METADATA.itemConstraint.pattern, 'u');
const CODE_TERM_ATTEMPT_PATTERN = new RegExp(`(?:^|\\s)${CODE_TERM_FIELD}(?:\\s*=|\\s|$)`, 'u');
const CODE_TERM_EXACT_PATTERN = codeTermExactPattern(CODE_TERM_FIELD, CODE_TERM_METADATA);

export type CodeTermMetadataResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'valid'; readonly keys: readonly string[] }
  | { readonly kind: 'invalid'; readonly message: string; readonly remediation: string };

export function parseCodeTermMetadata(meta: string | null | undefined): CodeTermMetadataResult {
  if (meta === undefined || meta === null || !CODE_TERM_ATTEMPT_PATTERN.test(meta)) {
    return { kind: 'none' };
  }
  const match = CODE_TERM_EXACT_PATTERN.exec(meta);
  if (match === null) {
    return {
      kind: 'invalid',
      message: `Code term metadata must contain only ${CODE_TERM_METADATA.syntax}.`,
      remediation: 'Use one quoted comma-separated terms field or remove the code metadata.',
    };
  }
  const keys = (match[1] ?? '').split(CODE_TERM_METADATA.separator).map((key) => key.trim());
  if (
    keys.length < CODE_TERM_METADATA.minItems ||
    keys.some((key) => !CODE_TERM_KEY_PATTERN.test(key))
  ) {
    return {
      kind: 'invalid',
      message: 'Code term metadata contains an empty or invalid glossary key.',
      remediation: 'Use lowercase glossary keys separated by commas.',
    };
  }
  if (keys.length > CODE_TERM_METADATA.maxItems) {
    return {
      kind: 'invalid',
      message: `Code term metadata supports at most ${CODE_TERM_METADATA.maxItems} keys.`,
      remediation: 'Keep only terms that need an explanation in this code block.',
    };
  }
  if (CODE_TERM_METADATA.uniqueItems && new Set(keys).size !== keys.length) {
    return {
      kind: 'invalid',
      message: 'Code term metadata contains a duplicate glossary key.',
      remediation: 'List each glossary key once per code block.',
    };
  }
  return { kind: 'valid', keys };
}

function codeTermExactPattern(field: string, definition: CodeFenceMetadataDefinition): RegExp {
  const quote = metadataQuote(definition.quoting);
  switch (definition.fieldExclusivity) {
    case 'only-field':
      return new RegExp(`^\\s*${field}=${quote}([^${quote}]*)${quote}\\s*$`, 'u');
    default:
      return unsupportedCodeMetadataContract(definition.fieldExclusivity);
  }
}

function metadataQuote(quoting: CodeFenceMetadataDefinition['quoting']): string {
  switch (quoting) {
    case 'double':
      return '"';
    default:
      return unsupportedCodeMetadataContract(quoting);
  }
}

function unsupportedCodeMetadataContract(value: never): never {
  throw new Error(`Unsupported code metadata contract: ${JSON.stringify(value)}.`);
}

export const remarkSemanticDirectives: Plugin<[DirectivePluginOptions], MdastRoot> =
  (options) => (tree) => {
    const glossaryByKey = new Map<string, GlossaryDefinition>();
    const glossaryTerms = new Map<string, GlossaryDefinition>();
    const termReferences: Array<{ readonly key: string; readonly node: DirectiveNode }> = [];
    const codeTermBlocks: Array<{ readonly node: Code; readonly keys: readonly string[] }> = [];
    const attributesByNode = new WeakMap<
      object,
      Readonly<Record<string, string | number | boolean>>
    >();
    const sectionIds = collectAuthoredSectionIds(tree);
    const claimedAuthoredSectionIds = new Set<string>();
    visit(tree, (node, _index, parent) => {
      if (isCodeNode(node)) {
        const metadata = parseCodeTermMetadata(node.meta);
        if (metadata.kind === 'invalid') {
          throw attachNodeSource(
            new AgenticReportError({
              level: 'error',
              code: 'INVALID_CODE_TERM_METADATA',
              message: metadata.message,
              remediation: metadata.remediation,
            }),
            node,
            options,
          );
        }
        if (metadata.kind === 'valid') {
          codeTermBlocks.push({ node, keys: metadata.keys });
          options.observedDirectives?.add('term');
        }
        return;
      }
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
        if (directive.name === 'action') {
          requireActionLabel(node);
        }
        if (
          directive.name === 'glossary' &&
          values.placement === 'appendix' &&
          (!isTraversableNode(parent) || parent.type !== 'root')
        ) {
          throw directiveError(
            node,
            'INVALID_DIRECTIVE_PLACEMENT',
            'A glossary definition placed in the appendix must be a top-level directive.',
            'Move this appendix glossary outside lists, blockquotes, sections, and other directives.',
          );
        }
        if (directive.name === 'source-link' && (node.children ?? []).length > 0) {
          throw directiveError(
            node,
            'INVALID_DIRECTIVE_PLACEMENT',
            'source-link accepts its visible label only through the label attribute.',
            'Use :source-link{label="Short path:line" href="..."}.',
          );
        }
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
        node.data = renderDirective(directive, values, new Set(Object.keys(node.attributes ?? {})));
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
    validateCodeTermBlocks(codeTermBlocks, glossaryByKey, options);
    validateVisualizationData(tree, attributesByNode, options);
    validateActionGroups(tree, options);
    validateTypedReviewComponents(tree, attributesByNode, options);
    validateResponseForms(tree, attributesByNode, options);
    validateUnmarkedGlossaryTerms(tree, [...glossaryByKey.values()], options);
  };

function validateResponseForms(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
): void {
  const formIds = new Set<string>();
  let formCount = 0;
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'response') return;
    formCount += 1;
    if (formCount > MAX_RESPONSE_FORMS)
      fail(candidate, `A document supports at most ${MAX_RESPONSE_FORMS} response forms.`);
    const form = attributes(candidate);
    const formId = String(form.id);
    if (formIds.has(formId)) fail(candidate, `Response id is duplicated: ${formId}.`);
    formIds.add(formId);
    const questions = directChildren(candidate, ['question']);
    if (questions.length < 1 || questions.length > MAX_RESPONSE_QUESTIONS)
      fail(candidate, `Response requires 1 to ${MAX_RESPONSE_QUESTIONS} questions.`);
    const questionIds = new Set<string>();
    let itemTotal = 0;
    for (const question of questions) {
      const values = attributes(question);
      const id = String(values.id);
      const kind = String(values.kind) as ResponseQuestionKind;
      if (questionIds.has(id)) fail(question, `Question id is duplicated: ${id}.`);
      questionIds.add(id);
      const children = directChildren(question, ['bucket', 'option', 'item']);
      const buckets = children.filter((child) => child.name === 'bucket');
      const choices = children.filter((child) => child.name === 'option');
      const items = children.filter((child) => child.name === 'item');
      itemTotal += items.length;
      uniqueChildIds(question, buckets, 'bucket');
      uniqueChildIds(question, choices, 'option');
      uniqueChildIds(question, items, 'item');
      const itemKind = ['bucket', 'item-single', 'item-multi', 'order', 'number'].includes(kind);
      if (itemKind !== items.length > 0)
        fail(
          question,
          itemKind ? `${kind} requires response items.` : `${kind} does not accept items.`,
        );
      if (kind === 'bucket') {
        if (buckets.length < 2 || buckets.length > 5)
          fail(question, 'Bucket questions require 2 to 5 buckets.');
        const bucketIds = new Set(buckets.map((child) => String(attributes(child).id)));
        for (const item of items) {
          const initial = attributes(item).bucket;
          if (initial !== undefined && !bucketIds.has(String(initial)))
            fail(item, `Response item references an unknown bucket: ${String(initial)}.`);
        }
      } else if (buckets.length > 0) fail(question, `${kind} does not accept bucket definitions.`);
      if (['item-single', 'item-multi', 'single'].includes(kind)) {
        if (choices.length < 2 || choices.length > MAX_RESPONSE_OPTIONS)
          fail(question, `${kind} requires 2 to ${MAX_RESPONSE_OPTIONS} options.`);
      } else if (choices.length > 0) fail(question, `${kind} does not accept option definitions.`);
      if (kind === 'number') {
        const minimum = values.min;
        const maximum = values.max;
        const step = values.step;
        if (typeof minimum !== 'number' || typeof maximum !== 'number')
          fail(question, 'Number questions require min and max.');
        if (minimum > maximum) fail(question, 'Number question min must not exceed max.');
        if (typeof step === 'number' && step <= 0)
          fail(question, 'Number question step must be positive.');
      } else if (
        values.min !== undefined ||
        values.max !== undefined ||
        values.step !== undefined
      ) {
        fail(question, `Numeric bounds are supported only by number questions, not ${kind}.`);
      }
    }
    if (itemTotal > MAX_RESPONSE_ITEMS)
      fail(candidate, `Response supports at most ${MAX_RESPONSE_ITEMS} items in total.`);
  });

  function attributes(node: DirectiveNode): Readonly<Record<string, string | number | boolean>> {
    const values = attributesByNode.get(node);
    if (!values) throw new Error(`Missing validated response attributes for ${node.name}.`);
    return values;
  }
  function directChildren(
    parent: DirectiveNode,
    allowed: readonly string[],
  ): readonly DirectiveNode[] {
    const children = parent.children ?? [];
    const directives = children.filter(isDirectiveNode);
    if (
      directives.length !== children.length ||
      directives.some((child) => !allowed.includes(child.name))
    )
      fail(
        parent,
        `${parent.name} accepts only ${allowed.join(', ')} directives as direct children.`,
      );
    return directives;
  }
  function uniqueChildIds(
    parent: DirectiveNode,
    children: readonly DirectiveNode[],
    label: string,
  ): void {
    const ids = children.map((child) => String(attributes(child).id));
    if (new Set(ids).size !== ids.length)
      fail(parent, `${label} ids must be unique within the question.`);
  }
  function fail(node: DirectiveNode, message: string): never {
    throw attachDirectiveSource(
      directiveError(
        node,
        'INVALID_RESPONSE_DATA',
        message,
        'Correct the response/question child types, stable ids, defaults, or kind-specific domain.',
      ),
      node,
      options,
    );
  }
}

function validateTypedReviewComponents(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
): void {
  visit(tree, (candidate) => {
    if (
      !isDirectiveNode(candidate) ||
      (candidate.name !== 'decision' && candidate.name !== 'checklist')
    )
      return;
    const childName = candidate.name === 'decision' ? 'decision-option' : 'check-item';
    const children = (candidate.children ?? []).filter(
      (child): child is DirectiveNode => isDirectiveNode(child) && child.name === childName,
    );
    if (candidate.name === 'decision' && children.length === 0) return;
    if ((candidate.children ?? []).length !== children.length) {
      throw attachDirectiveSource(
        directiveError(
          candidate,
          'INVALID_DIRECTIVE_PLACEMENT',
          `${candidate.name} cannot mix Markdown content with ${childName} children.`,
          candidate.name === 'decision'
            ? 'Use Markdown-only legacy decision content or direct decision-option children, not both.'
            : 'Use only direct check-item children inside checklist.',
        ),
        candidate,
        options,
      );
    }
    if (children.length > MAX_REVIEW_RESPONSES) {
      throw attachDirectiveSource(
        directiveError(
          candidate,
          'INVALID_DIRECTIVE_PLACEMENT',
          `${candidate.name} exceeds the ${MAX_REVIEW_RESPONSES}-child review limit.`,
          `Split this ${candidate.name} into smaller components.`,
        ),
        candidate,
        options,
      );
    }
    const values = attributesByNode.get(candidate) ?? {};
    if (candidate.name === 'decision' && typeof values.id !== 'string') {
      throw attachDirectiveSource(
        directiveError(
          candidate,
          'INVALID_DIRECTIVE_ATTRIBUTE',
          'A typed decision requires a stable id.',
          'Add id="..." to the decision or remove its decision-option children.',
        ),
        candidate,
        options,
      );
    }
    if (children.length === 0) {
      throw attachDirectiveSource(
        directiveError(
          candidate,
          'INVALID_DIRECTIVE_PLACEMENT',
          `${candidate.name} must contain at least one ${childName}.`,
          `Add a ${childName} text directive directly inside ${candidate.name}.`,
        ),
        candidate,
        options,
      );
    }
    const ids = new Set<string>();
    for (const child of children) {
      const id = String(attributesByNode.get(child)?.id ?? '');
      if (ids.has(id)) {
        throw attachDirectiveSource(
          directiveError(
            child,
            'INVALID_DIRECTIVE_ATTRIBUTE',
            `${candidate.name} child id is duplicated: ${id}.`,
            `Use a unique id inside this ${candidate.name}.`,
          ),
          child,
          options,
        );
      }
      ids.add(id);
    }
  });
}

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
    const children = requireOnlyDirectiveChildren(diagram, ['group', 'node', 'edge']);
    const type = String(attributes(diagram).type);
    const groups = children.filter((child) => child.name === 'group');
    const nodes = children.filter((child) => child.name === 'node');
    const edges = children.filter((child) => child.name === 'edge');
    const ids = nodes.map((node) => String(attributes(node).id));
    if (new Set(ids).size !== ids.length) {
      fail(diagram, 'Diagram node ids must be unique.', 'Give every node a distinct id.');
    }
    const groupIds = groups.map((group) => String(attributes(group).id));
    if (new Set(groupIds).size !== groupIds.length) {
      fail(diagram, 'Diagram group ids must be unique.', 'Give every group a distinct id.');
    }
    if (type === 'flow') validateFlowDiagram(diagram, groups, nodes, edges, groupIds);
    else validateSequenceDiagram(diagram, groups, nodes, edges);
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
      const selfConnectionAllowed =
        type === 'sequence'
          ? DIAGRAM_CONTRACT.sequence.selfMessages
          : DIAGRAM_CONTRACT.flow.selfEdges;
      if (from === to && !selfConnectionAllowed) {
        fail(
          edge,
          type === 'sequence'
            ? 'Sequence self-messages are not supported.'
            : 'Diagram self-edges are not supported.',
          'Connect two distinct nodes.',
        );
      }
    }
  }

  function validateFlowDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    nodes: readonly DirectiveNode[],
    edges: readonly DirectiveNode[],
    groupIds: readonly string[],
  ): void {
    const contract = DIAGRAM_CONTRACT.flow;
    if (nodes.length < contract.nodes.minimum || nodes.length > contract.nodes.maximum) {
      fail(
        diagram,
        `Flow diagrams require ${contract.nodes.minimum} to ${contract.nodes.maximum} nodes.`,
        'Add nodes or split a larger flow.',
      );
    }
    if (edges.length > contract.edges.maximum) {
      fail(
        diagram,
        `Flow diagrams support at most ${contract.edges.maximum} edges.`,
        'Split the flow or remove non-essential connections.',
      );
    }
    if (
      groups.length !== contract.groups.ungrouped &&
      (groups.length < contract.groups.minimum || groups.length > contract.groups.maximum)
    ) {
      fail(
        diagram,
        `Grouped flows require ${contract.groups.minimum} to ${contract.groups.maximum} groups.`,
        'Remove all groups or declare the supported number of subsystem groups.',
      );
    }
    if (groups.length > 0 && attributes(diagram).direction !== contract.groups.direction) {
      fail(
        diagram,
        'Grouped flows support only rightward subsystem columns.',
        'Use direction="right" or remove groups for an ungrouped down flow.',
      );
    }
    const knownGroups = new Set(groupIds);
    for (const node of nodes) {
      const group = attributes(node).group;
      if (groups.length === 0 && group !== undefined) {
        fail(
          node,
          `Diagram node references an undeclared group: ${String(group)}.`,
          'Declare the group or remove the group attribute.',
        );
      }
      if (
        groups.length > 0 &&
        contract.groups.requireEveryNode &&
        (group === undefined || !knownGroups.has(String(group)))
      ) {
        fail(
          node,
          group === undefined
            ? 'Every node in a grouped flow requires a group.'
            : `Diagram node references an unknown group: ${String(group)}.`,
          'Reference one of the groups declared in this diagram.',
        );
      }
    }
    for (const group of groups) {
      const id = String(attributes(group).id);
      if (!nodes.some((node) => attributes(node).group === id)) {
        fail(
          group,
          `Diagram group has no nodes: ${id}.`,
          'Assign at least one node to this group.',
        );
      }
    }
  }

  function validateSequenceDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    participants: readonly DirectiveNode[],
    messages: readonly DirectiveNode[],
  ): void {
    const contract = DIAGRAM_CONTRACT.sequence;
    if (!contract.groups && groups.length > 0) {
      fail(
        groups[0] ?? diagram,
        'Sequence diagrams do not support subsystem groups.',
        'Remove group directives and node group attributes.',
      );
    }
    if (contract.direction === 'forbidden' && diagram.attributes?.direction !== undefined) {
      fail(
        diagram,
        'Sequence diagrams do not accept a flow direction.',
        'Remove the direction attribute from this sequence diagram.',
      );
    }
    if (
      participants.length < contract.participants.minimum ||
      participants.length > contract.participants.maximum
    ) {
      fail(
        diagram,
        `Sequence diagrams require ${contract.participants.minimum} to ${contract.participants.maximum} participants.`,
        'Adjust the number of node participants.',
      );
    }
    if (
      messages.length < contract.messages.minimum ||
      messages.length > contract.messages.maximum
    ) {
      fail(
        diagram,
        `Sequence diagrams require ${contract.messages.minimum} to ${contract.messages.maximum} messages.`,
        'Adjust the number of edge messages.',
      );
    }
    for (const participant of participants) {
      if (!contract.participantGroups && attributes(participant).group !== undefined) {
        fail(
          participant,
          'Sequence participants do not accept a group.',
          'Remove the group attribute.',
        );
      }
    }
    for (const message of messages) {
      if (contract.messages.labelRequired && attributes(message).label === undefined) {
        fail(message, 'Sequence messages require a label.', 'Add a label to this edge message.');
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

function validateCodeTermBlocks(
  blocks: readonly { readonly node: Code; readonly keys: readonly string[] }[],
  glossaryByKey: ReadonlyMap<string, GlossaryDefinition>,
  options: DirectivePluginOptions,
): void {
  for (const block of blocks) {
    const ranges: Array<{
      readonly key: string;
      readonly term: string;
      readonly start: number;
      readonly end: number;
    }> = [];
    for (const key of block.keys) {
      const definition = glossaryByKey.get(key);
      if (definition === undefined) {
        throw attachNodeSource(
          new AgenticReportError({
            level: 'error',
            code: 'UNKNOWN_GLOSSARY_TERM',
            message: `No glossary definition exists for code term key: ${key}.`,
            remediation:
              'Add a glossary definition with the same key or correct the code metadata.',
            details: { key },
          }),
          block.node,
          options,
        );
      }
      const term = codeTermMatchText(definition, CODE_TERM_METADATA.matching.source);
      const start = firstCodeTermIndex(block.node.value, term, CODE_TERM_METADATA.matching);
      if (start === -1) {
        throw attachNodeSource(
          new AgenticReportError({
            level: 'error',
            code: 'CODE_TERM_NOT_FOUND',
            message: `Code term ${key} does not occur as canonical text: ${term}.`,
            remediation: 'Correct the key or include the exact canonical term in this code block.',
            details: { key },
          }),
          block.node,
          options,
        );
      }
      const end = start + term.length;
      if (
        CODE_TERM_METADATA.matching.lineBoundary === 'reject' &&
        block.node.value.slice(start, end).includes('\n')
      ) {
        throw attachNodeSource(
          new AgenticReportError({
            level: 'error',
            code: 'INVALID_CODE_TERM_METADATA',
            message: `Code term ${key} crosses a line boundary.`,
            remediation: 'Use a glossary term that occurs within one code line.',
            details: { key },
          }),
          block.node,
          options,
        );
      }
      ranges.push({ key, term, start, end });
    }
    const ordered = [...ranges].sort(
      (left, right) => left.start - right.start || right.end - left.end,
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (
        CODE_TERM_METADATA.matching.overlap === 'reject' &&
        previous !== undefined &&
        current !== undefined &&
        current.start < previous.end
      ) {
        throw attachNodeSource(
          new AgenticReportError({
            level: 'error',
            code: 'OVERLAPPING_CODE_TERMS',
            message: `Code terms ${previous.key} and ${current.key} overlap in their first occurrences.`,
            remediation: 'Annotate only one of the overlapping glossary terms in this code block.',
            details: { keys: [previous.key, current.key] },
          }),
          block.node,
          options,
        );
      }
    }
  }
}

function codeTermMatchText(
  definition: { readonly term: string },
  source: CodeFenceMetadataDefinition['matching']['source'],
): string {
  switch (source) {
    case 'canonical-glossary-term':
      return definition.term;
    default:
      return unsupportedCodeMetadataContract(source);
  }
}

function firstCodeTermIndex(
  value: string,
  term: string,
  matching: CodeFenceMetadataDefinition['matching'],
): number {
  let searchableValue: string;
  let searchableTerm: string;
  switch (matching.caseSensitive) {
    case true:
      searchableValue = value;
      searchableTerm = term;
      break;
    default:
      return unsupportedCodeMetadataContract(matching.caseSensitive);
  }
  switch (matching.occurrence) {
    case 'first':
      return searchableValue.indexOf(searchableTerm);
    default:
      return unsupportedCodeMetadataContract(matching.occurrence);
  }
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
  return attachNodeSource(error, node, options);
}

function attachNodeSource(
  error: AgenticReportError,
  node: { readonly position?: SourcePosition | undefined },
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
    const strings = packageStrings(options.language);
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
    const createGlossaryReference = (
      key: string,
      triggerChildren: ElementContent[],
      classNames: readonly string[] = ['semantic-term'],
    ): Element => {
      const definition = glossary.get(key);
      if (definition === undefined)
        throw new Error(`Missing validated glossary definition: ${key}.`);
      glossaryReferenceInstance += 1;
      const panelId = allocateId(`glossary-reference-${glossaryReferenceInstance}`);
      const panelTitleId = allocateId(`${panelId}-title`);
      return {
        type: 'element',
        tagName: 'span',
        properties: {
          className: [...classNames],
          dataTermReference: key,
          dataPopover: '',
          dataGlossaryReference: '',
        },
        children: [
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
            children: triggerChildren,
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
                children: [{ type: 'text', value: strings.viewFullDefinition }],
              },
            ],
          },
        ],
      };
    };
    visit(tree, 'element', (node: Element) => {
      if (
        node.tagName === 'a' &&
        typeof node.properties.dataLocalAsset === 'string' &&
        node.children.length === 0
      ) {
        node.children.push({
          type: 'text',
          value: strings.download(assetLabel(node.properties.dataLocalAsset)),
        });
      }
      const codeTermKeys = takeStringProperty(node, 'dataCodeTerms');
      if (node.tagName === 'pre' && codeTermKeys !== undefined) {
        enhanceCodeTerms(node, codeTermKeys.split(','), glossary, createGlossaryReference);
      }
      const semantic = stringProperty(node, 'dataSemantic');
      if (semantic === 'response') {
        enhanceResponse(node, allocateId);
        return;
      }
      if (semantic === 'section') {
        enhanceSection(node, allocateId);
        return;
      }
      if (semantic === 'action') {
        enhanceAction(node);
        return;
      }
      if (semantic === 'source-link') {
        enhanceSourceLink(node);
        return;
      }
      if (semantic !== undefined && ['chart', 'diagram', 'timeline'].includes(semantic)) {
        instance += 1;
        enhanceVisualization(node, semantic, instance, allocateId, strings);
        return;
      }
      if (semantic === 'term') {
        const key = stringProperty(node, 'dataKey');
        const definition = key === undefined ? undefined : glossary.get(key);
        if (key !== undefined && definition !== undefined) {
          const authoredLabel = hastText(node) || definition.term;
          const reference = createGlossaryReference(key, [{ type: 'text', value: authoredLabel }]);
          node.tagName = reference.tagName;
          node.properties = reference.properties;
          node.children = reference.children;
        }
        return;
      }
      if (semantic === 'glossary') {
        const key = stringProperty(node, 'dataKey');
        const term = stringProperty(node, 'dataTerm');
        const placement = takeStringProperty(node, 'dataPlacement') ?? 'inline';
        if (key !== undefined && term !== undefined) {
          node.properties.id = glossary.get(key)?.id ?? allocateId(`glossary-${key}`);
          node.children.unshift(semanticTitle(term));
          if (placement === 'appendix') node.properties.dataGlossaryAppendixDefinition = '';
        }
        delete node.properties.dataKey;
        delete node.properties.dataTerm;
        return;
      }
      if (semantic === 'disclosure') {
        enhanceDisclosure(node, strings);
        return;
      }
      if (semantic === 'tabs') {
        instance += 1;
        enhanceTabs(node, instance, allocateId, strings);
        return;
      }
      if (semantic === 'modal') {
        instance += 1;
        enhanceModal(node, instance, allocateId, strings);
        return;
      }
      if (semantic === 'popover') {
        instance += 1;
        enhancePopover(node, instance, allocateId, strings);
        return;
      }
      if (semantic === 'filter') {
        instance += 1;
        enhanceFilter(node, instance, allocateId, strings);
        return;
      }
      if (semantic === 'toggle') {
        instance += 1;
        enhanceToggle(node, instance, allocateId, strings);
        return;
      }
      prependDirectiveTitle(node);
      if ('dataDemoCounter' in node.properties) enhanceCounter(node, strings);
    });
    const appendixDefinitions = extractAppendixGlossaries(tree);
    if (appendixDefinitions.length > 0) {
      const appendixId = allocateId('glossary-appendix');
      const titleId = allocateId(`${appendixId}-title`);
      tree.children.push({
        type: 'element',
        tagName: 'aside',
        properties: {
          id: appendixId,
          className: ['semantic-glossary-appendix'],
          ariaLabelledBy: [titleId],
          dataGlossaryAppendix: '',
        },
        children: [
          {
            type: 'element',
            tagName: 'h2',
            properties: {
              id: titleId,
              className: ['semantic-glossary-appendix-title'],
              dataNavigationExclude: '',
            },
            children: [{ type: 'text', value: strings.glossary }],
          },
          ...appendixDefinitions,
        ],
      });
    }
  };

function enhanceCodeTerms(
  pre: Element,
  keys: readonly string[],
  glossary: ReadonlyMap<
    string,
    { readonly term: string; readonly explanation: string; readonly id: string }
  >,
  createReference: (
    key: string,
    triggerChildren: ElementContent[],
    classNames?: readonly string[],
  ) => Element,
): void {
  const code = pre.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  if (code === undefined) throw new Error('Highlighted code metadata is missing its code element.');
  const lines = code.children.filter(
    (child): child is Element => child.type === 'element' && hasClassName(child, 'line'),
  );
  const rangesByLine = new Map<
    Element,
    Array<{ readonly key: string; readonly start: number; readonly end: number }>
  >();
  for (const key of keys) {
    const definition = glossary.get(key);
    if (definition === undefined) throw new Error(`Missing validated code glossary key: ${key}.`);
    const term = codeTermMatchText(definition, CODE_TERM_METADATA.matching.source);
    let matched = false;
    for (const line of lines) {
      const start = firstCodeTermIndex(hastRawText(line), term, CODE_TERM_METADATA.matching);
      if (start === -1) continue;
      const ranges = rangesByLine.get(line) ?? [];
      ranges.push({ key, start, end: start + term.length });
      rangesByLine.set(line, ranges);
      matched = true;
      break;
    }
    if (!matched) throw new Error(`Highlighted code lost validated glossary term: ${key}.`);
  }
  for (const [line, ranges] of rangesByLine) {
    for (const range of [...ranges].sort((left, right) => right.start - left.start)) {
      const pieces = splitContentRange(line.children, range.start, range.end);
      if (pieces.match.length === 0) {
        throw new Error(`Highlighted code range is empty for glossary term: ${range.key}.`);
      }
      line.children = [
        ...pieces.before,
        createReference(range.key, pieces.match, ['semantic-term', 'semantic-code-term']),
        ...pieces.after,
      ];
    }
  }
}

function splitContentRange(
  children: readonly ElementContent[],
  start: number,
  end: number,
): {
  readonly before: ElementContent[];
  readonly match: ElementContent[];
  readonly after: ElementContent[];
} {
  const before: ElementContent[] = [];
  const match: ElementContent[] = [];
  const after: ElementContent[] = [];
  let offset = 0;
  for (const child of children) {
    const length = hastContentLength(child);
    const childStart = offset;
    const childEnd = offset + length;
    offset = childEnd;
    if (childEnd <= start) {
      before.push(child);
      continue;
    }
    if (childStart >= end) {
      after.push(child);
      continue;
    }
    const pieces = splitContentNode(
      child,
      Math.max(0, start - childStart),
      Math.min(length, end - childStart),
    );
    before.push(...pieces.before);
    match.push(...pieces.match);
    after.push(...pieces.after);
  }
  return { before, match, after };
}

function splitContentNode(
  node: ElementContent,
  start: number,
  end: number,
): {
  readonly before: ElementContent[];
  readonly match: ElementContent[];
  readonly after: ElementContent[];
} {
  if (node.type === 'text') {
    return {
      before:
        node.value.slice(0, start).length === 0
          ? []
          : [{ ...node, value: node.value.slice(0, start) }],
      match:
        node.value.slice(start, end).length === 0
          ? []
          : [{ ...node, value: node.value.slice(start, end) }],
      after: node.value.slice(end).length === 0 ? [] : [{ ...node, value: node.value.slice(end) }],
    };
  }
  if (node.type !== 'element') {
    return start === 0 && end > 0
      ? { before: [], match: [node], after: [] }
      : { before: [node], match: [], after: [] };
  }
  const pieces = splitContentRange(node.children, start, end);
  return {
    before: cloneElementPart(node, pieces.before),
    match: cloneElementPart(node, pieces.match),
    after: cloneElementPart(node, pieces.after),
  };
}

function cloneElementPart(node: Element, children: ElementContent[]): ElementContent[] {
  return children.length === 0 ? [] : [{ ...node, properties: { ...node.properties }, children }];
}

function hastContentLength(node: ElementContent): number {
  if (node.type === 'text') return node.value.length;
  if (node.type === 'element')
    return node.children.reduce((total, child) => total + hastContentLength(child), 0);
  return 0;
}

function hastRawText(node: Element): string {
  const values: string[] = [];
  const pending = [...node.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (child?.type === 'text') values.push(child.value);
    else if (child?.type === 'element') pending.push(...[...child.children].reverse());
  }
  return values.join('');
}

function hasClassName(node: Element, className: string): boolean {
  const value = node.properties.className ?? node.properties.class;
  return Array.isArray(value)
    ? value.some((candidate) => candidate === className)
    : typeof value === 'string' && value.split(/\s+/u).includes(className);
}

function extractAppendixGlossaries<Parent extends HastRoot | Element>(parent: Parent): Element[] {
  const appendix: Element[] = [];
  const retained: Array<Parent['children'][number]> = [];
  for (const child of parent.children) {
    if (child.type === 'element' && child.properties.dataGlossaryAppendixDefinition !== undefined) {
      delete child.properties.dataGlossaryAppendixDefinition;
      appendix.push(child);
      continue;
    }
    if (child.type === 'element') appendix.push(...extractAppendixGlossaries(child));
    retained.push(child);
  }
  parent.children = retained as Parent['children'];
  return appendix;
}

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
  node.children.unshift(decorativeIcon('arrow-right'));
}

function enhanceSourceLink(node: Element): void {
  const label = takeStringProperty(node, 'dataLabel');
  const href = takeStringProperty(node, 'dataHref');
  if (label === undefined || href === undefined) {
    throw new Error('Validated source-link is missing its label or href.');
  }
  node.properties.href = href;
  node.properties.target = '_blank';
  node.properties.rel = ['noopener', 'noreferrer'];
  node.properties.dataSourceLink = '';
  node.children = [decorativeIcon('arrow-right'), { type: 'text', value: label }];
}

function enhanceResponse(node: Element, allocateId: (base: string) => string): void {
  const id = stringProperty(node, 'dataId');
  const title = stringProperty(node, 'dataDirectiveTitle');
  if (!id || !title) throw new Error('Validated response is missing its id or title.');
  const authoredChildren = node.children;
  const questions = authoredChildren.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'question',
  );
  const projection = {
    contractVersion: RESPONSE_CONTRACT_VERSION,
    id,
    title,
    questions: questions.map(responseQuestionDefinition),
  };
  const revision = `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
  const manifest = parseResponseFormManifest({ ...projection, revision });
  const titleId = allocateId(`response-${id}-title`);
  node.properties.id = allocateId(`response-${id}`);
  node.properties.ariaLabelledBy = [titleId];
  node.properties.dataResponseWorkspace = '';
  node.properties.dataResponseId = id;
  node.children = [
    semanticTitle(title, titleId),
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseSource: '', hidden: '' },
      children: authoredChildren,
    },
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseManifest: '', hidden: '' },
      children: [{ type: 'text', value: JSON.stringify(manifest) }],
    },
    {
      type: 'element',
      tagName: 'div',
      properties: { dataResponseMount: '' },
      children: [],
    },
  ];
}

function responseQuestionDefinition(node: Element): ResponseQuestionDefinition {
  const id = stringProperty(node, 'dataId');
  const kind = stringProperty(node, 'dataKind') as ResponseQuestionKind | undefined;
  const title = stringProperty(node, 'dataDirectiveTitle');
  if (!id || !kind || !title) throw new Error('Validated response question is incomplete.');
  const prompt = stringProperty(node, 'dataPrompt');
  const minimum = numericProperty(node, 'dataMin');
  const maximum = numericProperty(node, 'dataMax');
  const step = numericProperty(node, 'dataStep');
  const buckets = responseDefinitions(node, 'bucket');
  const options = responseDefinitions(node, 'option');
  const items = node.children
    .filter(
      (child): child is Element =>
        child.type === 'element' && child.properties.dataSemantic === 'item',
    )
    .map(responseItemDefinition);
  return {
    id,
    kind,
    title,
    ...(prompt === undefined ? {} : { prompt }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(step === undefined ? {} : { step }),
    buckets,
    options,
    items,
  };
}

function responseDefinitions(
  node: Element,
  kind: 'bucket' | 'option',
): readonly { readonly id: string; readonly label: string }[] {
  return node.children
    .filter(
      (child): child is Element =>
        child.type === 'element' && child.properties.dataSemantic === kind,
    )
    .map((child) => {
      const id = stringProperty(child, 'dataId');
      const label = stringProperty(child, 'dataLabel');
      if (!id || !label) throw new Error(`Validated response ${kind} is incomplete.`);
      return { id, label };
    });
}

function responseItemDefinition(node: Element): ResponseItemDefinition {
  const id = stringProperty(node, 'dataId');
  const label = stringProperty(node, 'dataLabel');
  if (!id || !label) throw new Error('Validated response item is incomplete.');
  const note = stringProperty(node, 'dataNote');
  const meta = stringProperty(node, 'dataMeta');
  const href = stringProperty(node, 'dataHref');
  const bucket = stringProperty(node, 'dataBucket');
  const comment = stringProperty(node, 'dataComment') === 'true';
  if (!note || !meta || !href) throw new Error('Validated response item detail is incomplete.');
  return {
    id,
    label,
    note,
    meta,
    href,
    ...(bucket === undefined ? {} : { bucket }),
    comment,
  };
}

function numericProperty(node: Element, name: string): number | undefined {
  const value = stringProperty(node, name);
  return value === undefined ? undefined : Number(value);
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

function enhanceDisclosure(node: Element, strings: PackageStrings): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? strings.details;
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

function enhanceTabs(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const titleId = title === undefined ? undefined : allocateId(`tabs-${instance}-title`);
  const panels = node.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'tab',
  );
  const buttons: Element[] = [];
  panels.forEach((panel, index) => {
    const label = takeStringProperty(panel, 'dataLabel') ?? strings.tab(index + 1);
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
          ? { ariaLabel: strings.contentSections }
          : { ariaLabelledBy: [titleId] }),
        className: ['semantic-tab-list'],
      },
      children: buttons,
    },
    ...node.children,
  ];
}

function enhanceModal(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? strings.dialog;
  const trigger = takeStringProperty(node, 'dataTrigger') ?? strings.openDialog;
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
        actionButton(strings.close, { dataModalClose: '' }),
      ],
    },
  ];
}

function enhancePopover(
  node: Element,
  instance: number,
  allocateId: (base: string) => string,
  strings: PackageStrings,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle') ?? strings.details;
  const trigger = takeStringProperty(node, 'dataTrigger') ?? strings.showDetails;
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
  strings: PackageStrings,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const placeholder = takeStringProperty(node, 'dataPlaceholder') ?? strings.filterItems;
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
          children: [{ type: 'text', value: strings.filter }],
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
  strings: PackageStrings,
): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const label = takeStringProperty(node, 'dataLabel') ?? strings.toggleContent;
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

function enhanceCounter(node: Element, strings: PackageStrings): void {
  const start = String(node.properties.dataStart ?? '0');
  node.children.push({
    type: 'element',
    tagName: 'div',
    properties: { className: ['semantic-demo-controls'] },
    children: [
      actionButton(strings.increment, { dataDemoIncrement: '' }),
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

function isCodeNode(node: unknown): node is Code {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === 'code';
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
    case 'decision-option-directives':
      return ['decision-option'];
    case 'check-item-directives':
      return ['check-item'];
    case 'series-directives':
      return ['series'];
    case 'point-directives':
      return ['point'];
    case 'node-and-edge-directives':
      return ['node', 'edge'];
    case 'group-node-and-edge-directives':
      return ['group', 'node', 'edge'];
    case 'event-directives':
      return ['event'];
    case 'response-question-directives':
      return ['question'];
    case 'response-field-directives':
      return ['bucket', 'option', 'item'];
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
  authoredAttributes: ReadonlySet<string>,
): NonNullable<DirectiveNode['data']> {
  const properties: Record<string, string | string[]> = {
    className: [directive.sanitizer.className],
  };
  for (const attribute of directive.attributes) {
    const value = values[attribute.name];
    if (
      !authoredAttributes.has(attribute.name) &&
      LOCALIZED_DEFAULT_ATTRIBUTES.has(`${directive.name}.${attribute.name}`)
    )
      continue;
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

const LOCALIZED_DEFAULT_ATTRIBUTES = new Set([
  'modal.trigger',
  'popover.trigger',
  'filter.placeholder',
]);

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
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return 'Add {href="http://127.0.0.1:PORT/open?path=%2Fabsolute%2Fpath&line=42"}.';
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
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return `${directiveName}.href must be an IPv4 loopback editor-helper URL with an absolute path and positive line.`;
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
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return 'Use http://127.0.0.1:PORT/open?path=%2Fabsolute%2Fpath&line=LINE.';
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
