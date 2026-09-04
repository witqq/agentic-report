import { createHash } from 'node:crypto';

import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Code, Root as MdastRoot } from 'mdast';
import { decodeString } from 'micromark-util-decode-string';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import {
  authoringRegistry,
  DIAGRAM_CONTRACT,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
  type CodeFenceMetadataDefinition,
} from '../authoring/registry.js';
import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import type { Diagnostic, DiagnosticFix, SourceMapSegment } from '../contracts.js';
import { AgenticReportError, isTransportSafeReplacement } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from './authored-rules.js';
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
import { resolveSourceLocation, resolveSourceRange } from '../source/source-map.js';
import { decorativeIcon } from './icons.js';
import { resolveDocumentNavigation, type NavigationItem } from './navigation.js';
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
  /** Sink for authored warnings; a run without one keeps them silent rather than failing. */
  readonly warnings?: Diagnostic[];
}

interface DirectiveEnhancementOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly language?: string;
  readonly share?: boolean;
  readonly shareTransform?: { neutralizedSourceLinks: number };
  readonly navigationTransform?: { items: NavigationItem[] };
}

const directiveByName: ReadonlyMap<string, DirectiveDefinition> = new Map(
  authoringRegistry.directives.map((directive) => [directive.name, directive]),
);
const SOURCE_LINK_LABEL_MAX_LENGTH = sourceLinkLabelMaximumLength();
const GENERATED_SECTION_ID_PREFIX = 'generated:';
const CODE_TERM_FIELD = 'terms' as const;
const CODE_TERM_METADATA = authoringRegistry.source.codeFenceMetadata.terms;
const CODE_TERM_KEY_PATTERN = new RegExp(CODE_TERM_METADATA.itemConstraint.pattern, 'u');
const CODE_TERM_ATTEMPT_PATTERN = new RegExp(`(?:^|\\s)${CODE_TERM_FIELD}(?:\\s*=|\\s|$)`, 'u');
const CODE_TERM_EXACT_PATTERN = codeTermExactPattern(CODE_TERM_FIELD, CODE_TERM_METADATA);
const WORD_CONTINUATION_PATTERN = /[\p{L}\p{N}\p{M}\p{Pc}\u200c\u200d]/u;

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
    restoreLiteralColonText(tree, options.markdown);
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
    const violations: AgenticReportError[] = [];
    // Keys whose own glossary definition was refused: a later annotation pointing at such a key —
    // a term reference or an annotated code fence — repeats that refusal instead of reporting an
    // independent fact.
    const refusedGlossaryKeys = new Set<string>();
    visit(tree, (node, _index, parent) => {
      if (isCodeNode(node)) {
        const metadata = parseCodeTermMetadata(node.meta);
        if (metadata.kind === 'invalid') {
          violations.push(
            attachNodeSource(
              new AgenticReportError({
                level: 'error',
                code: 'INVALID_CODE_TERM_METADATA',
                message: metadata.message,
                remediation: metadata.remediation,
              }),
              node,
              options,
            ),
          );
          return;
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
      const found: AgenticReportError[] = [];
      const parsed: { values?: Readonly<Record<string, string | number | boolean>> } = {};
      const outcome = runAuthoredRules(
        directiveNodeRules,
        {
          node,
          parent,
          markdown: options.markdown,
          sectionIds,
          claimedAuthoredSectionIds,
          glossaryByKey,
          glossaryTerms,
          parsed,
        },
        found,
      );
      if (outcome === 'accepted') {
        // Names are claimed only now: every rule of the set accepted this node, so it is a section
        // the document really has.
        const values =
          node.name === 'section' && parsed.values !== undefined
            ? claimSectionIdentity(parsed.values, sectionIds, claimedAuthoredSectionIds)
            : (parsed.values ?? {});
        attributesByNode.set(node, values);
        const directive = directiveByName.get(node.name);
        if (directive !== undefined) {
          if (directive.name === 'glossary') registerGlossaryDefinition(node, values);
          if (directive.name === 'term') termReferences.push({ key: String(values.key), node });
          options.observedDirectives?.add(directive.name);
          node.data = renderDirective(
            directive,
            values,
            new Set(Object.keys(node.attributes ?? {})),
          );
        }
        return undefined;
      }

      if (node.name === 'glossary') {
        const refusedKey = node.attributes?.key;
        if (typeof refusedKey === 'string') refusedGlossaryKeys.add(refusedKey);
      }
      for (const violation of found)
        violations.push(locatedNodeViolation(violation, node, options));
      // Descendants of a rejected directive would only report consequences of this refusal.
      return SKIP;

      function registerGlossaryDefinition(
        definitionNode: DirectiveNode,
        values: Readonly<Record<string, string | number | boolean>>,
      ): void {
        const key = String(values.key);
        const term = String(values.term);
        // The forms rule accepted this definition, so re-reading them cannot fail here.
        const forms = declaredGlossaryForms(values.forms, definitionNode);
        if (forms instanceof AgenticReportError) return;
        const definition = { key, term, forms, node: definitionNode };
        glossaryByKey.set(key, definition);
        glossaryTerms.set(term.toLocaleLowerCase('und'), definition);
        for (const form of forms) glossaryTerms.set(form.toLocaleLowerCase('und'), definition);
      }
    });
    for (const reference of termReferences) {
      if (glossaryByKey.has(reference.key)) continue;
      // A reference whose own definition was refused repeats that refusal, so it is dropped; a
      // reference to a key nothing ever defined is an independent fact and joins the inventory.
      if (refusedGlossaryKeys.has(reference.key)) continue;
      violations.push(
        attachDirectiveSource(
          directiveError(
            reference.node,
            'UNKNOWN_GLOSSARY_TERM',
            `No glossary definition exists for key: ${reference.key}.`,
            'Add a glossary definition with the same key or correct the term reference.',
          ),
          reference.node,
          options,
        ),
      );
    }
    // Every check answers for its own subjects and returns; none of them ends the phase, so the run
    // reports what the whole source says rather than what its first refused subject said.
    validateCodeTermBlocks(codeTermBlocks, glossaryByKey, refusedGlossaryKeys, options, violations);
    validateVisualizationData(tree, attributesByNode, options, violations);
    validateActionGroups(tree, options, violations);
    validateCopyableProse(tree, options, violations);
    validateLeadParagraphs(tree, options, violations);
    validateTypedReviewComponents(tree, attributesByNode, options, violations);
    validateResponseForms(tree, attributesByNode, options, violations);
    validateUnmarkedGlossaryTerms(tree, [...glossaryByKey.values()], options, violations);
    if (violations.length > 0) throw aggregateViolations(violations);
  };

/**
 * Reports the earliest authored violation and carries the rest with it, so one run answers for the
 * whole source. Order follows the source, not the order the checks happen to run in; a violation
 * without a resolved position keeps its arrival order at the end.
 */
function aggregateViolations(violations: readonly AgenticReportError[]): AgenticReportError {
  const ordered = violations
    .map((violation, arrival) => ({ violation, arrival }))
    .sort((left, right) => {
      const leftStart = left.violation.diagnostic.source?.line;
      const rightStart = right.violation.diagnostic.source?.line;
      if (leftStart === undefined && rightStart === undefined) return left.arrival - right.arrival;
      if (leftStart === undefined) return 1;
      if (rightStart === undefined) return -1;
      if (leftStart !== rightStart) return leftStart - rightStart;
      const leftColumn = left.violation.diagnostic.source?.column ?? 0;
      const rightColumn = right.violation.diagnostic.source?.column ?? 0;
      if (leftColumn !== rightColumn) return leftColumn - rightColumn;
      return left.arrival - right.arrival;
    })
    .map((entry) => entry.violation);
  const [first, ...rest] = ordered;
  if (first === undefined) throw new Error('Aggregate requested without any violation.');
  if (rest.length === 0) return first;
  return new AgenticReportError(
    { ...first.diagnostic, related: rest.map((violation) => violation.diagnostic) },
    { cause: first },
  );
}

interface CopyableSubject {
  readonly node: DirectiveNode;
  readonly placement: (node: DirectiveNode) => AgenticReportError;
}

/** The single rule of a copyable block, declared as data like every other rule of this phase. */
const copyableRules = declareAuthoredRules<CopyableSubject>({
  subject: 'copyable',
  rules: [
    {
      id: 'prose-and-terms-only',
      check: ({ node, placement }) => {
        // Foreign children of one copyable block are independent of each other: a code fence says
        // nothing about the directive beside it, so the block answers for all of them. Nothing below
        // a refused child is read, because it lives inside the node just refused.
        const pending = [...(node.children ?? [])];
        const found: AgenticReportError[] = [];
        while (pending.length > 0) {
          const child = pending.pop();
          if (isCodeNode(child) || (isDirectiveNode(child) && child.name !== 'term')) {
            found.push(placement(child as DirectiveNode));
            continue;
          }
          if (isTraversableNode(child)) pending.push(...(child.children ?? []));
        }
        return found;
      },
    },
  ],
});

function validateCopyableProse(
  tree: MdastRoot,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'copyable') return;
    const outcome = runAuthoredRules(
      copyableRules,
      {
        node: candidate,
        placement: (node) =>
          attachDirectiveSource(
            directiveError(
              node,
              'INVALID_DIRECTIVE_PLACEMENT',
              'copyable accepts prose Markdown and term references, not code blocks or other directives.',
              'Move the code or interactive/data directive outside copyable.',
            ),
            node,
            options,
          ),
      },
      violations,
    );
    return outcome === 'refused' ? SKIP : undefined;
  });
}

interface LeadSubject {
  readonly lead: DirectiveNode;
  readonly index: number;
  readonly siblings: NonNullable<DirectiveNode['children']>;
  readonly fail: (lead: DirectiveNode, message: string, remediation: string) => AgenticReportError;
}

/**
 * The rules of one lead paragraph. Shape and placement are independent questions — a lead holding
 * two blocks is still in the wrong place or the right one — so both answer for the same lead.
 */
const leadRules = declareAuthoredRules<LeadSubject>({
  subject: 'section/lead',
  rules: [
    {
      id: 'single-paragraph',
      check: ({ lead, fail }) => {
        const blocks = lead.children ?? [];
        const single =
          blocks.length === 1 &&
          typeof blocks[0] === 'object' &&
          blocks[0] !== null &&
          'type' in blocks[0] &&
          blocks[0].type === 'paragraph';
        return single
          ? undefined
          : fail(
              lead,
              'lead must contain exactly one Markdown paragraph.',
              'Keep one prose paragraph inside lead and move every other block outside it.',
            );
      },
    },
    {
      id: 'first-authored-block',
      check: ({ lead, index, siblings, fail }) =>
        index > 0 || siblings[0] !== lead
          ? fail(
              lead,
              'A section accepts one lead as its first authored block.',
              'Keep one lead first in the section and use ordinary paragraphs for the remaining prose.',
            )
          : undefined,
    },
  ],
});

function validateLeadParagraphs(
  tree: MdastRoot,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'section') return;
    return inspectSection(candidate) === 'refused' ? SKIP : undefined;
  });

  function inspectSection(candidate: DirectiveNode): 'accepted' | 'refused' {
    const children = candidate.children ?? [];
    const leads = children.filter(
      (child): child is DirectiveNode => isDirectiveNode(child) && child.name === 'lead',
    );
    const found: AgenticReportError[] = [];
    // Each lead is its own subject: a malformed one says nothing about the next, so the section
    // answers for every lead it holds.
    for (const [index, lead] of leads.entries()) {
      runAuthoredRules(leadRules, { lead, index, siblings: children, fail }, found);
    }
    violations.push(...found);
    return found.length === 0 ? 'accepted' : 'refused';
  }

  function fail(lead: DirectiveNode, message: string, remediation: string): AgenticReportError {
    return attachDirectiveSource(
      directiveError(lead, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
      lead,
      options,
    );
  }
}

function isAppendixGlossaryParent(parent: unknown): boolean {
  return (
    (isTraversableNode(parent) && parent.type === 'root') ||
    (isDirectiveNode(parent) && parent.name === 'section')
  );
}

function restoreLiteralColonText(tree: MdastRoot, markdown: string): void {
  visit(tree, (node, index, parent) => {
    if (
      !isDirectiveNode(node) ||
      node.type !== 'textDirective' ||
      Object.keys(node.attributes ?? {}).length > 0 ||
      (node.children?.length ?? 0) > 0 ||
      index === undefined ||
      !isMutableChildrenParent(parent)
    )
      return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (
      start === undefined ||
      end === undefined ||
      !isLiteralColonToken(markdown, start, node.name)
    )
      return;
    parent.children[index] = {
      type: 'text',
      value: markdown.slice(start, end),
      position: node.position,
    };
  });
}

/**
 * Ordinary prose keeps a colon that no authored directive could have opened. Two shapes are
 * literal: a name starting with a digit, because no registered directive name does, and a colon
 * written against the preceding word, because authored directives always start a fresh token.
 * Ratios, scales, host:port pairs, identifiers such as arXiv:2508.05775 and key:value phrases all
 * fall under one of the two. The digit feature holds whatever precedes the colon, so `Пункт :2` is
 * text as well; a spaced unknown *alphabetic* name keeps its diagnostic. The caller bounds this to
 * the inline form without attributes or children, so block-level forms never reach here.
 */
function isLiteralColonToken(markdown: string, directiveStart: number, name: string): boolean {
  if (markdown[directiveStart] !== ':') return false;
  if (/^\p{Nd}/u.test(name)) return true;
  const before = codePointBefore(markdown, directiveStart);
  return before !== undefined && WORD_CONTINUATION_PATTERN.test(before);
}

function codePointBefore(value: string, index: number): string | undefined {
  if (index <= 0) return;
  const finalCodeUnit = value.charCodeAt(index - 1);
  const start =
    finalCodeUnit >= 0xdc00 &&
    finalCodeUnit <= 0xdfff &&
    index >= 2 &&
    value.charCodeAt(index - 2) >= 0xd800 &&
    value.charCodeAt(index - 2) <= 0xdbff
      ? index - 2
      : index - 1;
  return codePointAt(value, start);
}

function codePointAt(value: string, index: number): string | undefined {
  const point = value.codePointAt(index);
  return point === undefined ? undefined : String.fromCodePoint(point);
}

function isMutableChildrenParent(value: unknown): value is { children: TraversableNode[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'children' in value &&
    Array.isArray((value as { readonly children?: unknown }).children)
  );
}

interface ResponseQuestionSubject {
  readonly node: DirectiveNode;
  readonly values: Readonly<Record<string, string | number | boolean>>;
  readonly kind: ResponseQuestionKind;
  readonly buckets: readonly DirectiveNode[];
  readonly choices: readonly DirectiveNode[];
  readonly items: readonly DirectiveNode[];
  readonly seenIds: Set<string>;
  readonly fail: (node: DirectiveNode, message: string) => AgenticReportError;
}

/**
 * The rules of one response question, declared as data. Independence is the point: a question whose
 * option count is wrong is still judged on its numeric bounds, because neither answer needs the
 * other. Where an answer does need another, the need is written in `dependsOn` instead of being
 * implied by the order of statements.
 */
const responseQuestionRules = declareAuthoredRules<ResponseQuestionSubject>({
  subject: 'response/question',
  rules: [
    {
      id: 'unique-id',
      check: ({ node, values, seenIds, fail }) => {
        const id = String(values.id);
        if (seenIds.has(id)) return fail(node, `Question id is duplicated: ${id}.`);
        seenIds.add(id);
        return undefined;
      },
    },
    {
      id: 'unique-child-ids',
      check: ({ node, buckets, choices, items, fail }) => {
        const duplicated = (children: readonly DirectiveNode[], label: string) => {
          const ids = children.map((child) => String(responseAttributes(child)?.id));
          return new Set(ids).size === ids.length
            ? undefined
            : fail(node, `${label} ids must be unique within the question.`);
        };
        return [
          duplicated(buckets, 'bucket'),
          duplicated(choices, 'option'),
          duplicated(items, 'item'),
        ].filter((violation): violation is AgenticReportError => violation !== undefined);
      },
    },
    {
      id: 'items-match-kind',
      check: ({ node, kind, items, fail }) => {
        const itemKind = ['bucket', 'item-single', 'item-multi', 'order', 'number'].includes(kind);
        if (itemKind === items.length > 0) return undefined;
        return fail(
          node,
          itemKind ? `${kind} requires response items.` : `${kind} does not accept items.`,
        );
      },
    },
    {
      id: 'buckets-match-kind',
      check: ({ node, kind, buckets, fail }) => {
        if (kind === 'bucket') {
          return buckets.length < 2 || buckets.length > 5
            ? fail(node, 'Bucket questions require 2 to 5 buckets.')
            : undefined;
        }
        return buckets.length > 0
          ? fail(node, `${kind} does not accept bucket definitions.`)
          : undefined;
      },
    },
    {
      // Items are read against accepted buckets: with the bucket set refused, an unknown reference
      // would be a fact about buckets nobody accepted.
      id: 'item-bucket-references',
      dependsOn: ['buckets-match-kind'],
      check: ({ kind, buckets, items, fail }) => {
        if (kind !== 'bucket') return undefined;
        const bucketIds = new Set(buckets.map((child) => String(responseAttributes(child)?.id)));
        return items
          .map((item) => {
            const initial = responseAttributes(item)?.bucket;
            return initial !== undefined && !bucketIds.has(String(initial))
              ? fail(item, `Response item references an unknown bucket: ${String(initial)}.`)
              : undefined;
          })
          .filter((violation): violation is AgenticReportError => violation !== undefined);
      },
    },
    {
      id: 'options-match-kind',
      check: ({ node, kind, choices, fail }) => {
        if (['item-single', 'item-multi', 'single'].includes(kind)) {
          return choices.length < 2 || choices.length > MAX_RESPONSE_OPTIONS
            ? fail(node, `${kind} requires 2 to ${MAX_RESPONSE_OPTIONS} options.`)
            : undefined;
        }
        return choices.length > 0
          ? fail(node, `${kind} does not accept option definitions.`)
          : undefined;
      },
    },
    {
      id: 'numeric-domain',
      check: ({ node, values, kind, fail }) => {
        if (kind === 'number') {
          const minimum = values.min;
          const maximum = values.max;
          const step = values.step;
          if (typeof minimum !== 'number' || typeof maximum !== 'number')
            return fail(node, 'Number questions require min and max.');
          if (minimum > maximum) return fail(node, 'Number question min must not exceed max.');
          return typeof step === 'number' && step <= 0
            ? fail(node, 'Number question step must be positive.')
            : undefined;
        }
        return values.min !== undefined || values.max !== undefined || values.step !== undefined
          ? fail(node, `Numeric bounds are supported only by number questions, not ${kind}.`)
          : undefined;
      },
    },
  ],
});

let responseAttributeSource: WeakMap<
  object,
  Readonly<Record<string, string | number | boolean>>
> = new WeakMap();

/**
 * The interpreted attributes of a node, or nothing when the node never reached interpretation. That
 * happens only for a directive whose own form or attributes were already refused, and everything
 * these checks would read comes from that unmade interpretation — so the subject is skipped rather
 * than judged on values nobody accepted.
 */
function responseAttributes(
  node: DirectiveNode,
): Readonly<Record<string, string | number | boolean>> | undefined {
  return responseAttributeSource.get(node);
}

function validateResponseForms(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  responseAttributeSource = attributesByNode;
  const formIds = new Set<string>();
  let formCount = 0;
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'response') return;
    return inspectForm(candidate) === 'refused' ? SKIP : undefined;
  });

  function inspectForm(candidate: DirectiveNode): 'accepted' | 'refused' {
    const form = attributes(candidate);
    if (form === undefined) return 'refused';
    const formViolations: AgenticReportError[] = [];
    // Question ids and the item budget are properties of one form, not of the document: two forms
    // may reuse an id, and each carries its own items.
    const questionIds = new Set<string>();
    let itemTotal = 0;
    formCount += 1;
    if (formCount > MAX_RESPONSE_FORMS)
      formViolations.push(
        fail(candidate, `A document supports at most ${MAX_RESPONSE_FORMS} response forms.`),
      );
    const formId = String(form.id);
    if (formIds.has(formId))
      formViolations.push(fail(candidate, `Response id is duplicated: ${formId}.`));
    formIds.add(formId);

    const questions = directChildren(candidate, ['question'], formViolations);
    if (questions !== undefined) {
      if (questions.length < 1 || questions.length > MAX_RESPONSE_QUESTIONS) {
        formViolations.push(
          fail(candidate, `Response requires 1 to ${MAX_RESPONSE_QUESTIONS} questions.`),
        );
      } else {
        // Each question is its own subject: a refused one says nothing about the next, so the form
        // answers for every question it holds.
        for (const question of questions) {
          itemTotal += inspectQuestion(question, formViolations, questionIds);
        }
        if (itemTotal > MAX_RESPONSE_ITEMS)
          formViolations.push(
            fail(candidate, `Response supports at most ${MAX_RESPONSE_ITEMS} items in total.`),
          );
      }
    }

    violations.push(...formViolations);
    return formViolations.length === 0 ? 'accepted' : 'refused';
  }

  function inspectQuestion(
    question: DirectiveNode,
    formViolations: AgenticReportError[],
    questionIds: Set<string>,
  ): number {
    const values = attributes(question);
    if (values === undefined) return 0;
    const children = directChildren(question, ['bucket', 'option', 'item'], formViolations);
    if (children === undefined) return 0;
    const items = children.filter((child) => child.name === 'item');
    runAuthoredRules(
      responseQuestionRules,
      {
        node: question,
        values,
        kind: String(values.kind) as ResponseQuestionKind,
        buckets: children.filter((child) => child.name === 'bucket'),
        choices: children.filter((child) => child.name === 'option'),
        items,
        seenIds: questionIds,
        fail,
      },
      formViolations,
    );
    return items.length;
  }

  function attributes(
    node: DirectiveNode,
  ): Readonly<Record<string, string | number | boolean>> | undefined {
    return responseAttributes(node);
  }
  function directChildren(
    parent: DirectiveNode,
    allowed: readonly string[],
    collected: AgenticReportError[],
  ): readonly DirectiveNode[] | undefined {
    const children = parent.children ?? [];
    const directives = children.filter(isDirectiveNode);
    if (
      directives.length !== children.length ||
      directives.some((child) => !allowed.includes(child.name))
    ) {
      collected.push(
        fail(
          parent,
          `${parent.name} accepts only ${allowed.join(', ')} directives as direct children.`,
        ),
      );
      return undefined;
    }
    return directives;
  }
  function fail(node: DirectiveNode, message: string): AgenticReportError {
    return attachDirectiveSource(
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

interface ReviewComponentSubject {
  readonly node: DirectiveNode;
  readonly childName: string;
  readonly children: readonly DirectiveNode[];
  readonly values: Readonly<Record<string, string | number | boolean>>;
  readonly childValues: (
    child: DirectiveNode,
  ) => Readonly<Record<string, string | number | boolean>>;
  readonly placement: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
  readonly attribute: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
}

/**
 * The rules of one typed review component. Child composition, size, identity and child uniqueness
 * are separate questions about the same component; only the ones that read an accepted child list
 * say so through `dependsOn`.
 */
const reviewComponentRules = declareAuthoredRules<ReviewComponentSubject>({
  subject: 'decision|checklist',
  rules: [
    {
      id: 'children-not-mixed',
      check: ({ node, childName, children, placement }) =>
        (node.children ?? []).length === children.length
          ? undefined
          : placement(
              node,
              `${node.name} cannot mix Markdown content with ${childName} children.`,
              node.name === 'decision'
                ? 'Use Markdown-only legacy decision content or direct decision-option children, not both.'
                : 'Use only direct check-item children inside checklist.',
            ),
    },
    {
      id: 'child-limit',
      check: ({ node, children, placement }) =>
        children.length > MAX_REVIEW_RESPONSES
          ? placement(
              node,
              `${node.name} exceeds the ${MAX_REVIEW_RESPONSES}-child review limit.`,
              `Split this ${node.name} into smaller components.`,
            )
          : undefined,
    },
    {
      id: 'stable-decision-id',
      check: ({ node, values, attribute }) =>
        node.name === 'decision' && typeof values.id !== 'string'
          ? attribute(
              node,
              'A typed decision requires a stable id.',
              'Add id="..." to the decision or remove its decision-option children.',
            )
          : undefined,
    },
    {
      id: 'child-present',
      check: ({ node, childName, children, placement }) =>
        children.length === 0
          ? placement(
              node,
              `${node.name} must contain at least one ${childName}.`,
              `Add a ${childName} text directive directly inside ${node.name}.`,
            )
          : undefined,
    },
    {
      // Child ids are read against an accepted child list: with the composition refused, the list is
      // not the author's own and duplicate ids inside it say nothing.
      id: 'unique-child-ids',
      dependsOn: ['children-not-mixed', 'child-present'],
      check: ({ node, children, childValues, attribute }) => {
        const seen = new Set<string>();
        const found: AgenticReportError[] = [];
        for (const child of children) {
          const id = String(childValues(child).id ?? '');
          if (seen.has(id)) {
            found.push(
              attribute(
                child,
                `${node.name} child id is duplicated: ${id}.`,
                `Use a unique id inside this ${node.name}.`,
              ),
            );
            continue;
          }
          seen.add(id);
        }
        return found;
      },
    },
  ],
});

function validateTypedReviewComponents(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  visit(tree, (candidate) => {
    if (
      !isDirectiveNode(candidate) ||
      (candidate.name !== 'decision' && candidate.name !== 'checklist')
    )
      return;
    return inspectComponent(candidate) === 'refused' ? SKIP : undefined;
  });

  function inspectComponent(candidate: DirectiveNode): 'accepted' | 'refused' {
    const childName = candidate.name === 'decision' ? 'decision-option' : 'check-item';
    const children = (candidate.children ?? []).filter(
      (child): child is DirectiveNode => isDirectiveNode(child) && child.name === childName,
    );
    // A decision without typed children is ordinary Markdown content and none of these rules apply.
    if (candidate.name === 'decision' && children.length === 0) return 'accepted';
    const found: AgenticReportError[] = [];
    runAuthoredRules(
      reviewComponentRules,
      {
        node: candidate,
        childName,
        children,
        values: attributesByNode.get(candidate) ?? {},
        childValues: (child) => attributesByNode.get(child) ?? {},
        placement: (node, message, remediation) =>
          attachDirectiveSource(
            directiveError(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
            node,
            options,
          ),
        attribute: (node, message, remediation) =>
          attachDirectiveSource(
            directiveError(node, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
            node,
            options,
          ),
      },
      found,
    );
    violations.push(...found);
    return found.length === 0 ? 'accepted' : 'refused';
  }
}

/**
 * Whether this section's authored id is already taken. Judging and claiming are separate because a
 * node the set refuses must not claim anything: the name it would take belongs to whichever section
 * the document actually keeps.
 */
function duplicateSectionIdViolation(
  node: DirectiveNode,
  values: Readonly<Record<string, string | number | boolean>>,
  claimedAuthored: ReadonlySet<string>,
): AgenticReportError | undefined {
  const authoredId = values.id;
  return typeof authoredId === 'string' && claimedAuthored.has(authoredId)
    ? directiveError(
        node,
        'DUPLICATE_SECTION_ID',
        `Section id is defined more than once: ${authoredId}.`,
        'Use a unique explicit id or omit it to generate a collision-free id from the title.',
      )
    : undefined;
}

/** Claims the identity of an accepted section, generating a collision-free one when none is authored. */
function claimSectionIdentity(
  values: Readonly<Record<string, string | number | boolean>>,
  used: Set<string>,
  claimedAuthored: Set<string>,
): Readonly<Record<string, string | number | boolean>> {
  const authoredId = values.id;
  if (typeof authoredId === 'string') {
    claimedAuthored.add(authoredId);
    return values;
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

function actionLabelViolation(node: DirectiveNode): AgenticReportError | undefined {
  const label = (node.children ?? [])
    .map((child) =>
      typeof child === 'object' && child !== null && 'value' in child
        ? String((child as { readonly value?: unknown }).value ?? '')
        : '',
    )
    .join('')
    .trim();
  if (label.length === 0) {
    return directiveError(
      node,
      'DIRECTIVE_LABEL_REQUIRED',
      'action requires a visible label.',
      'Use ::action[Visible label]{href="..."}.',
    );
  }
  return undefined;
}

interface DirectiveNodeSubject {
  readonly node: DirectiveNode;
  readonly parent: unknown;
  readonly markdown: string;
  readonly sectionIds: Set<string>;
  readonly claimedAuthoredSectionIds: Set<string>;
  readonly glossaryByKey: ReadonlyMap<string, GlossaryDefinition>;
  readonly glossaryTerms: ReadonlyMap<string, GlossaryDefinition>;
  /** Where the attribute rule leaves its interpretation for the rules that read it. */
  readonly parsed: { values?: Readonly<Record<string, string | number | boolean>> };
}

/**
 * The rules of one directive node. The name, the written attributes, the form, the placement and the
 * children are independent readings of the same node: an unknown attribute is an unknown attribute
 * wherever the node sits, so one run answers for all of them. What genuinely needs an accepted
 * reading says so — the interpreted values exist only after the attribute rule accepted them.
 */
const directiveNodeRules = declareAuthoredRules<DirectiveNodeSubject>({
  subject: 'directive-node',
  rules: [
    {
      id: 'registered-name',
      check: ({ node }) =>
        directiveByName.has(node.name) ? undefined : unsupportedDirectiveError(node),
    },
    {
      id: 'no-prototype-like-attributes',
      check: ({ node, markdown }) => prototypeLikeAttributeViolation(node, markdown),
    },
    {
      id: 'declared-form',
      dependsOn: ['registered-name'],
      check: ({ node }) => {
        const directive = directiveByName.get(node.name);
        return directive === undefined ? undefined : directiveFormViolation(node, directive);
      },
    },
    {
      id: 'declared-placement',
      dependsOn: ['registered-name'],
      check: ({ node, parent }) => {
        const directive = directiveByName.get(node.name);
        return directive === undefined
          ? undefined
          : directivePlacementViolation(node, directive, parent);
      },
    },
    {
      id: 'declared-children',
      dependsOn: ['registered-name'],
      check: ({ node }) => {
        const directive = directiveByName.get(node.name);
        return directive === undefined ? undefined : directiveChildrenViolation(node, directive);
      },
    },
    {
      id: 'interpreted-attributes',
      dependsOn: ['registered-name', 'no-prototype-like-attributes'],
      check: ({ node, parsed }) => {
        const directive = directiveByName.get(node.name);
        if (directive === undefined) return undefined;
        const interpretation = interpretDirectiveAttributes(directive, node.attributes ?? {});
        if (!interpretation.ok) return directiveAttributeError(node, interpretation);
        parsed.values = interpretation.values;
        return undefined;
      },
    },
    {
      id: 'action-label',
      dependsOn: ['registered-name'],
      check: ({ node }) => (node.name === 'action' ? actionLabelViolation(node) : undefined),
    },
    {
      // The identity is read from the interpreted attributes, so it cannot answer for a node whose
      // attributes were refused. The rule only judges: claiming the name belongs to the accepted
      // node, because a refused section must not take a name away from the section that keeps it.
      id: 'section-identity',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parsed, claimedAuthoredSectionIds }) =>
        node.name === 'section' && parsed.values !== undefined
          ? duplicateSectionIdViolation(node, parsed.values, claimedAuthoredSectionIds)
          : undefined,
    },
    {
      id: 'appendix-glossary-placement',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parent, parsed }) =>
        node.name === 'glossary' &&
        parsed.values?.placement === 'appendix' &&
        !isAppendixGlossaryParent(parent)
          ? directiveError(
              node,
              'INVALID_DIRECTIVE_PLACEMENT',
              'A glossary definition placed in the appendix must be top-level or directly inside a section.',
              'Move this appendix glossary outside lists, blockquotes, and unrelated directives, or make it a direct section child.',
            )
          : undefined,
    },
    {
      id: 'unique-glossary-identity',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parsed, glossaryByKey, glossaryTerms }) => {
        if (node.name !== 'glossary' || parsed.values === undefined) return undefined;
        const key = String(parsed.values.key);
        const term = String(parsed.values.term);
        return glossaryByKey.has(key) || glossaryTerms.has(term.toLocaleLowerCase('und'))
          ? directiveError(
              node,
              'DUPLICATE_GLOSSARY_DEFINITION',
              `Glossary key or term is defined more than once: ${key}.`,
              'Use one unique key and canonical term for each glossary definition.',
            )
          : undefined;
      },
    },
    {
      // Declared forms are read against the identity this definition claims, so a refused identity
      // leaves nothing to compare them with.
      id: 'declared-glossary-forms',
      dependsOn: ['interpreted-attributes', 'unique-glossary-identity'],
      check: ({ node, parsed, glossaryTerms }) => {
        if (node.name !== 'glossary' || parsed.values === undefined) return undefined;
        const forms = declaredGlossaryForms(parsed.values.forms, node);
        if (forms instanceof AgenticReportError) return forms;
        const claimed = new Set<string>();
        for (const form of forms) {
          const normalized = form.toLocaleLowerCase('und');
          // A spelling claimed by two definitions leaves the product deciding whose first mention an
          // occurrence is, and it would decide silently.
          if (glossaryTerms.has(normalized) || claimed.has(normalized)) {
            return directiveError(
              node,
              'DUPLICATE_GLOSSARY_DEFINITION',
              `Glossary form belongs to more than one definition: ${form}.`,
              'Declare each spelling under one definition; a form shared by two terms leaves the first mention ambiguous.',
            );
          }
          claimed.add(normalized);
        }
        return undefined;
      },
    },
  ],
});

/**
 * Re-anchors a node violation onto the node's own authored range and carries a referenced target
 * path into details, as the phase has always reported it.
 */
function locatedNodeViolation(
  violation: AgenticReportError,
  node: DirectiveNode,
  options: DirectivePluginOptions,
): AgenticReportError {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return violation;
  const source = resolveSourceLocation(options.sourceMap, start, end);
  if (source === undefined) return violation;
  const details = {
    ...violation.diagnostic.details,
    ...(violation.diagnostic.source?.file === undefined
      ? {}
      : { target: violation.diagnostic.source.file }),
  };
  return new AgenticReportError(
    {
      ...violation.diagnostic,
      source,
      ...(Object.keys(details).length === 0 ? {} : { details }),
    },
    { cause: violation },
  );
}

interface ActionGroupSubject {
  readonly node: DirectiveNode;
  readonly placement: (
    node: DirectiveNode,
    message: string,
    remediation: string,
  ) => AgenticReportError;
}

/** The single rule of an action group, declared as data like every other rule of this phase. */
const actionGroupRules = declareAuthoredRules<ActionGroupSubject>({
  subject: 'actions',
  rules: [
    {
      id: 'action-children-only',
      check: ({ node, placement }) => {
        const children = node.children ?? [];
        const onlyActions =
          children.length > 0 &&
          children.every((child) => isDirectiveNode(child) && child.name === 'action');
        return onlyActions
          ? undefined
          : placement(
              node,
              'actions accepts one or more action directives as direct children.',
              'Move prose outside actions and add links with ::action[Label]{href="..."}.',
            );
      },
    },
  ],
});

function validateActionGroups(
  tree: MdastRoot,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate) || candidate.name !== 'actions') return;
    const found: AgenticReportError[] = [];
    runAuthoredRules(
      actionGroupRules,
      {
        node: candidate,
        placement: (node, message, remediation) =>
          attachDirectiveSource(
            directiveError(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
            node,
            options,
          ),
      },
      found,
    );
    violations.push(...found);
    return found.length === 0 ? undefined : SKIP;
  });
}

interface VisualizationContext {
  readonly attributes: (node: DirectiveNode) => Readonly<Record<string, string | number | boolean>>;
  readonly fail: (node: DirectiveNode, message: string, remediation: string) => AgenticReportError;
  readonly warn: (node: DirectiveNode, code: string, message: string, remediation: string) => void;
}

interface ChartSubject extends VisualizationContext {
  readonly chart: DirectiveNode;
  readonly series: readonly DirectiveNode[];
  readonly chartType: string;
}

interface ChartSeriesSubject extends VisualizationContext {
  readonly seriesNode: DirectiveNode;
  readonly points: readonly DirectiveNode[];
  readonly chartType: string;
  readonly canonicalLabels: () => readonly string[] | undefined;
  readonly rememberLabels: (labels: readonly string[]) => void;
}

interface DiagramEdgeSubject extends VisualizationContext {
  readonly edge: DirectiveNode;
  readonly known: ReadonlySet<string>;
  readonly type: string;
}

interface FlowDiagramSubject extends VisualizationContext {
  readonly diagram: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly nodes: readonly DirectiveNode[];
  readonly edges: readonly DirectiveNode[];
}

interface FlowNodeSubject extends VisualizationContext {
  readonly node: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly knownGroups: ReadonlySet<string>;
}

interface FlowGroupSubject extends VisualizationContext {
  readonly group: DirectiveNode;
  readonly nodes: readonly DirectiveNode[];
}

interface SequenceDiagramSubject extends VisualizationContext {
  readonly diagram: DirectiveNode;
  readonly groups: readonly DirectiveNode[];
  readonly participants: readonly DirectiveNode[];
  readonly messages: readonly DirectiveNode[];
}

interface SequenceParticipantSubject extends VisualizationContext {
  readonly participant: DirectiveNode;
}

interface SequenceMessageSubject extends VisualizationContext {
  readonly message: DirectiveNode;
}

/** Series count and pie arity are separate questions about the same chart. */
const chartRules = declareAuthoredRules<ChartSubject>({
  subject: 'chart',
  rules: [
    {
      id: 'pie-single-series',
      check: ({ chart, series, chartType, fail }) =>
        chartType === 'pie' && series.length !== 1
          ? fail(
              chart,
              'Pie charts require exactly one series.',
              'Keep one series or use a bar chart.',
            )
          : undefined,
    },
  ],
});

/**
 * The rules of one chart series. Label uniqueness, pie values and alignment with the first series
 * are independent readings of the same series; only alignment needs the labels this series declares,
 * which is why it names that dependency instead of relying on statement order.
 */
const chartSeriesRules = declareAuthoredRules<ChartSeriesSubject>({
  subject: 'chart/series',
  rules: [
    {
      id: 'unique-point-labels',
      check: ({ seriesNode, points, attributes, fail }) => {
        const labels = points.map((point) => String(attributes(point).label));
        return new Set(labels).size === labels.length
          ? undefined
          : fail(
              seriesNode,
              'Chart point labels must be unique within each series.',
              'Use each category label once per series.',
            );
      },
    },
    {
      id: 'pie-values',
      check: ({ seriesNode, points, chartType, attributes, fail }) => {
        if (chartType !== 'pie') return undefined;
        const values = points.map((point) => Number(attributes(point).value));
        return values.some((value) => value < 0) || values.every((value) => value === 0)
          ? fail(
              seriesNode,
              'Pie chart values must be non-negative and include at least one positive value.',
              'Use zero or positive values, or select a bar or line chart.',
            )
          : undefined;
      },
    },
    {
      id: 'aligned-categories',
      dependsOn: ['unique-point-labels'],
      check: ({ seriesNode, points, attributes, canonicalLabels, rememberLabels, fail }) => {
        const labels = points.map((point) => String(attributes(point).label));
        const canonical = canonicalLabels();
        if (canonical === undefined) {
          rememberLabels(labels);
          return undefined;
        }
        return labels.length !== canonical.length ||
          labels.some((label, index) => label !== canonical[index])
          ? fail(
              seriesNode,
              'Every chart series must use the same point labels in the same order.',
              'Align this series with the first series category list.',
            )
          : undefined;
      },
    },
  ],
});

/** Reference validity and self-connection are separate readings of the same edge. */
const diagramEdgeRules = declareAuthoredRules<DiagramEdgeSubject>({
  subject: 'diagram/edge',
  rules: [
    {
      id: 'known-endpoints',
      check: ({ edge, known, attributes, fail }) => {
        const from = String(attributes(edge).from);
        const to = String(attributes(edge).to);
        return known.has(from) && known.has(to)
          ? undefined
          : fail(
              edge,
              `Diagram edge references an unknown node: ${!known.has(from) ? from : to}.`,
              'Use ids declared by node directives in this diagram.',
            );
      },
    },
    {
      id: 'self-connection',
      check: ({ edge, type, attributes, fail }) => {
        const from = String(attributes(edge).from);
        const to = String(attributes(edge).to);
        const selfConnectionAllowed =
          type === 'sequence'
            ? DIAGRAM_CONTRACT.sequence.selfMessages
            : DIAGRAM_CONTRACT.flow.selfEdges;
        return from === to && !selfConnectionAllowed
          ? fail(
              edge,
              type === 'sequence'
                ? 'Sequence self-messages are not supported.'
                : 'Diagram self-edges are not supported.',
              'Connect two distinct nodes.',
            )
          : undefined;
      },
    },
  ],
});

/** Size, grouping arity and direction are independent questions about one flow diagram. */
const flowDiagramRules = declareAuthoredRules<FlowDiagramSubject>({
  subject: 'diagram/flow',
  rules: [
    {
      id: 'node-count',
      check: ({ diagram, nodes, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return nodes.length < contract.nodes.minimum || nodes.length > contract.nodes.maximum
          ? fail(
              diagram,
              `Flow diagrams require ${contract.nodes.minimum} to ${contract.nodes.maximum} nodes.`,
              'Add nodes or split a larger flow.',
            )
          : undefined;
      },
    },
    {
      id: 'edge-count',
      check: ({ diagram, edges, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return edges.length > contract.edges.maximum
          ? fail(
              diagram,
              `Flow diagrams support at most ${contract.edges.maximum} edges.`,
              'Split the flow or remove non-essential connections.',
            )
          : undefined;
      },
    },
    {
      id: 'group-count',
      check: ({ diagram, groups, fail, warn }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        if (groups.length === contract.groups.incomplete) {
          // A single group is how a grouped flow looks while it is being written: the author has
          // started grouping and has not finished. Refusing it would make the source unbuildable
          // mid-edit, so the run continues and says what is still missing.
          warn(
            diagram,
            'INCOMPLETE_DIAGRAM_GROUPING',
            `A grouped flow with one group is incomplete: ${contract.groups.minimum} to ${contract.groups.maximum} groups are supported.`,
            'Add the remaining subsystem groups or remove the only group for an ungrouped flow.',
          );
          return undefined;
        }
        return groups.length !== contract.groups.ungrouped &&
          (groups.length < contract.groups.minimum || groups.length > contract.groups.maximum)
          ? fail(
              diagram,
              `Grouped flows require ${contract.groups.minimum} to ${contract.groups.maximum} groups.`,
              'Remove all groups or declare the supported number of subsystem groups.',
            )
          : undefined;
      },
    },
    {
      id: 'group-direction',
      check: ({ diagram, groups, attributes, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        return groups.length > 0 && attributes(diagram).direction !== contract.groups.direction
          ? fail(
              diagram,
              'Grouped flows support only rightward subsystem columns.',
              'Use direction="right" or remove groups for an ungrouped down flow.',
            )
          : undefined;
      },
    },
  ],
});

/** One node's group assignment, read against the groups the diagram declares. */
const flowNodeRules = declareAuthoredRules<FlowNodeSubject>({
  subject: 'diagram/flow/node',
  rules: [
    {
      id: 'group-assignment',
      check: ({ node, groups, knownGroups, attributes, fail }) => {
        const contract = DIAGRAM_CONTRACT.flow;
        const group = attributes(node).group;
        if (groups.length === 0) {
          return group === undefined
            ? undefined
            : fail(
                node,
                `Diagram node references an undeclared group: ${String(group)}.`,
                'Declare the group or remove the group attribute.',
              );
        }
        return contract.groups.requireEveryNode &&
          (group === undefined || !knownGroups.has(String(group)))
          ? fail(
              node,
              group === undefined
                ? 'Every node in a grouped flow requires a group.'
                : `Diagram node references an unknown group: ${String(group)}.`,
              'Reference one of the groups declared in this diagram.',
            )
          : undefined;
      },
    },
  ],
});

/** Whether a group holds nodes, read from the node assignments the diagram accepted. */
const flowGroupRules = declareAuthoredRules<FlowGroupSubject>({
  subject: 'diagram/flow/group',
  rules: [
    {
      id: 'group-membership',
      check: ({ group, nodes, attributes, fail }) => {
        const id = String(attributes(group).id);
        return nodes.some((node) => attributes(node).group === id)
          ? undefined
          : fail(
              group,
              `Diagram group has no nodes: ${id}.`,
              'Assign at least one node to this group.',
            );
      },
    },
  ],
});

/** Group support, direction and the two arities are independent readings of one sequence diagram. */
const sequenceDiagramRules = declareAuthoredRules<SequenceDiagramSubject>({
  subject: 'diagram/sequence',
  rules: [
    {
      id: 'no-groups',
      check: ({ diagram, groups, fail }) =>
        !DIAGRAM_CONTRACT.sequence.groups && groups.length > 0
          ? fail(
              groups[0] ?? diagram,
              'Sequence diagrams do not support subsystem groups.',
              'Remove group directives and node group attributes.',
            )
          : undefined,
    },
    {
      id: 'no-direction',
      check: ({ diagram, fail }) =>
        DIAGRAM_CONTRACT.sequence.direction === 'forbidden' &&
        diagram.attributes?.direction !== undefined
          ? fail(
              diagram,
              'Sequence diagrams do not accept a flow direction.',
              'Remove the direction attribute from this sequence diagram.',
            )
          : undefined,
    },
    {
      id: 'participant-count',
      check: ({ diagram, participants, fail }) => {
        const contract = DIAGRAM_CONTRACT.sequence;
        return participants.length < contract.participants.minimum ||
          participants.length > contract.participants.maximum
          ? fail(
              diagram,
              `Sequence diagrams require ${contract.participants.minimum} to ${contract.participants.maximum} participants.`,
              'Adjust the number of node participants.',
            )
          : undefined;
      },
    },
    {
      id: 'message-count',
      check: ({ diagram, messages, fail }) => {
        const contract = DIAGRAM_CONTRACT.sequence;
        return messages.length < contract.messages.minimum ||
          messages.length > contract.messages.maximum
          ? fail(
              diagram,
              `Sequence diagrams require ${contract.messages.minimum} to ${contract.messages.maximum} messages.`,
              'Adjust the number of edge messages.',
            )
          : undefined;
      },
    },
  ],
});

const sequenceParticipantRules = declareAuthoredRules<SequenceParticipantSubject>({
  subject: 'diagram/sequence/participant',
  rules: [
    {
      id: 'no-participant-group',
      check: ({ participant, attributes, fail }) =>
        !DIAGRAM_CONTRACT.sequence.participantGroups && attributes(participant).group !== undefined
          ? fail(
              participant,
              'Sequence participants do not accept a group.',
              'Remove the group attribute.',
            )
          : undefined,
    },
  ],
});

const sequenceMessageRules = declareAuthoredRules<SequenceMessageSubject>({
  subject: 'diagram/sequence/message',
  rules: [
    {
      id: 'label-required',
      check: ({ message, attributes, fail }) =>
        DIAGRAM_CONTRACT.sequence.messages.labelRequired && attributes(message).label === undefined
          ? fail(message, 'Sequence messages require a label.', 'Add a label to this edge message.')
          : undefined,
    },
  ],
});

function validateVisualizationData(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, Readonly<Record<string, string | number | boolean>>>,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  const context: VisualizationContext = { attributes, fail, warn };
  visit(tree, (candidate) => {
    if (!isDirectiveNode(candidate)) return;
    if (candidate.name !== 'chart' && candidate.name !== 'diagram' && candidate.name !== 'timeline')
      return;
    if (!fullyInterpreted(candidate)) return SKIP;
    const found: AgenticReportError[] = [];
    if (candidate.name === 'chart') validateChart(candidate, found);
    if (candidate.name === 'diagram') validateDiagram(candidate, found);
    if (candidate.name === 'timeline') requireBoundedChildren(candidate, 'event', 1, 20, found);
    violations.push(...found);
    return found.length === 0 ? undefined : SKIP;
  });

  function validateChart(chart: DirectiveNode, found: AgenticReportError[]): void {
    const series = requireBoundedChildren(chart, 'series', 1, 6, found);
    if (series === undefined) return;
    const chartType = String(attributes(chart).type);
    // Series are read against an accepted chart shape: with the arity of a pie chart refused, the
    // second series is not a series the author meant to align, and judging it would only restate
    // the refusal.
    if (runAuthoredRules(chartRules, { ...context, chart, series, chartType }, found) === 'refused')
      return;
    let canonicalLabels: readonly string[] | undefined;
    // Series are read against the labels of the first accepted series, so a refused series says
    // nothing about the next one: the chart answers for each of them.
    for (const seriesNode of series) {
      const points = requireBoundedChildren(seriesNode, 'point', 1, 12, found);
      if (points === undefined) continue;
      runAuthoredRules(
        chartSeriesRules,
        {
          ...context,
          seriesNode,
          points,
          chartType,
          canonicalLabels: () => canonicalLabels,
          rememberLabels: (labels) => {
            canonicalLabels = labels;
          },
        },
        found,
      );
    }
  }

  function validateDiagram(diagram: DirectiveNode, found: AgenticReportError[]): void {
    const children = requireOnlyDirectiveChildren(diagram, ['group', 'node', 'edge'], found);
    if (children === undefined) return;
    const type = String(attributes(diagram).type);
    const groups = children.filter((child) => child.name === 'group');
    const nodes = children.filter((child) => child.name === 'node');
    const edges = children.filter((child) => child.name === 'edge');
    const ids = nodes.map((node) => String(attributes(node).id));
    if (new Set(ids).size !== ids.length) {
      found.push(
        fail(diagram, 'Diagram node ids must be unique.', 'Give every node a distinct id.'),
      );
    }
    const groupIds = groups.map((group) => String(attributes(group).id));
    if (new Set(groupIds).size !== groupIds.length) {
      found.push(
        fail(diagram, 'Diagram group ids must be unique.', 'Give every group a distinct id.'),
      );
    }
    if (type === 'flow') validateFlowDiagram(diagram, groups, nodes, edges, groupIds, found);
    else validateSequenceDiagram(diagram, groups, nodes, edges, found);
    const known = new Set(ids);
    // Edges are read against the declared nodes, not against each other, so every edge answers for
    // itself and a refused one does not hide the next.
    for (const edge of edges) {
      runAuthoredRules(diagramEdgeRules, { ...context, edge, known, type }, found);
    }
  }

  function validateFlowDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    nodes: readonly DirectiveNode[],
    edges: readonly DirectiveNode[],
    groupIds: readonly string[],
    found: AgenticReportError[],
  ): void {
    runAuthoredRules(flowDiagramRules, { ...context, diagram, groups, nodes, edges }, found);
    const knownGroups = new Set(groupIds);
    // Nodes are read against the declared groups, not against each other.
    const beforeNodes = found.length;
    for (const node of nodes) {
      runAuthoredRules(flowNodeRules, { ...context, node, groups, knownGroups }, found);
    }
    // Whether a group holds nodes is read from the very assignments just refused, so an empty group
    // beside a node without its group only repeats that refusal.
    if (found.length !== beforeNodes) return;
    for (const group of groups) {
      runAuthoredRules(flowGroupRules, { ...context, group, nodes }, found);
    }
  }

  function validateSequenceDiagram(
    diagram: DirectiveNode,
    groups: readonly DirectiveNode[],
    participants: readonly DirectiveNode[],
    messages: readonly DirectiveNode[],
    found: AgenticReportError[],
  ): void {
    runAuthoredRules(
      sequenceDiagramRules,
      { ...context, diagram, groups, participants, messages },
      found,
    );
    // Participants and messages are read against the diagram contract, not against each other, so
    // every one of them answers for itself.
    for (const participant of participants) {
      runAuthoredRules(sequenceParticipantRules, { ...context, participant }, found);
    }
    for (const message of messages) {
      runAuthoredRules(sequenceMessageRules, { ...context, message }, found);
    }
  }

  function requireBoundedChildren(
    parent: DirectiveNode,
    childName: string,
    minimum: number,
    maximum: number,
    found: AgenticReportError[],
  ): readonly DirectiveNode[] | undefined {
    const children = requireOnlyDirectiveChildren(parent, [childName], found);
    if (children === undefined) return undefined;
    if (children.length < minimum || children.length > maximum) {
      found.push(
        fail(
          parent,
          `${parent.name} requires ${minimum} to ${maximum} ${childName} directives.`,
          `Adjust the number of direct ${childName} children.`,
        ),
      );
      return undefined;
    }
    return children;
  }

  function requireOnlyDirectiveChildren(
    parent: DirectiveNode,
    allowed: readonly string[],
    found: AgenticReportError[],
  ): readonly DirectiveNode[] | undefined {
    const children = parent.children ?? [];
    const directives = children.filter(isDirectiveNode);
    if (directives.length !== children.length) {
      found.push(
        fail(
          parent,
          `${parent.name} accepts only ${allowed.join(' or ')} directives as direct children.`,
          'Move prose into an event body or outside this data container.',
        ),
      );
      return undefined;
    }
    return directives;
  }

  function attributes(node: DirectiveNode): Readonly<Record<string, string | number | boolean>> {
    return attributesByNode.get(node) ?? {};
  }

  /**
   * Whether every node of this visualization reached interpretation. One that did not had its own
   * form or attributes refused already, and every reading below — node identity, edge endpoints,
   * group membership — is derived from that unmade interpretation, so the visualization is skipped
   * instead of answering about values nobody accepted.
   */
  function fullyInterpreted(root: DirectiveNode): boolean {
    if (attributesByNode.get(root) === undefined) return false;
    return (root.children ?? []).every(
      (child) => !isDirectiveNode(child) || attributesByNode.get(child) !== undefined,
    );
  }

  function fail(node: DirectiveNode, message: string, remediation: string): AgenticReportError {
    return attachDirectiveSource(
      directiveError(node, 'INVALID_VISUALIZATION_DATA', message, remediation),
      node,
      options,
    );
  }

  function warn(node: DirectiveNode, code: string, message: string, remediation: string): void {
    const located = attachDirectiveSource(
      new AgenticReportError({ level: 'warning', code, message, remediation }),
      node,
      options,
    );
    options.warnings?.push(located.diagnostic);
  }
}

interface GlossaryDefinition {
  readonly key: string;
  readonly term: string;
  /** Author-declared spellings besides the canonical term; empty when none were declared. */
  readonly forms: readonly string[];
  readonly node: DirectiveNode;
}

/** Bounds on the declared-form list, stated like every other list this registry accepts. */
const MAX_GLOSSARY_FORMS = 24;
const MAX_GLOSSARY_FORM_LENGTH = 64;

interface CodeTermBlockSubject {
  readonly block: { readonly node: Code; readonly keys: readonly string[] };
  readonly glossaryByKey: ReadonlyMap<string, GlossaryDefinition>;
  readonly refusedGlossaryKeys: ReadonlySet<string>;
  readonly ranges: Array<{
    readonly key: string;
    readonly term: string;
    readonly start: number;
    readonly end: number;
  }>;
  readonly refuse: (
    code: string,
    message: string,
    remediation: string,
    details: Readonly<Record<string, unknown>>,
  ) => AgenticReportError;
}

/**
 * The rules of one annotated code fence. Locating the terms and comparing their ranges both read the
 * definitions the keys name, so both declare that dependency: with a key undefined, a range is not
 * missing — it does not exist.
 */
const codeTermBlockRules = declareAuthoredRules<CodeTermBlockSubject>({
  subject: 'code-fence/terms',
  rules: [
    {
      id: 'known-keys',
      check: ({ block, glossaryByKey, refusedGlossaryKeys, refuse }) => {
        // Each annotated key stands on its own: a key without a definition says nothing about the
        // next one, so the block answers for all of them. A key whose own definition was refused
        // repeats that refusal and is left out, exactly as a term reference is.
        const missing = block.keys.filter((key) => !glossaryByKey.has(key));
        if (missing.length === 0) return undefined;
        const reportable = missing
          .filter((key) => !refusedGlossaryKeys.has(key))
          .map((key) =>
            refuse(
              'UNKNOWN_GLOSSARY_TERM',
              `No glossary definition exists for code term key: ${key}.`,
              'Add a glossary definition with the same key or correct the code metadata.',
              { key },
            ),
          );
        // Every missing key leaves the block unreadable, even when the record itself is suppressed
        // as derived: the ranges the later rules compare simply do not exist.
        return reportable.length === 0 ? 'refused' : reportable;
      },
    },
    {
      id: 'locatable-terms',
      dependsOn: ['known-keys'],
      check: ({ block, glossaryByKey, ranges, refuse }) => {
        const found: AgenticReportError[] = [];
        // Each key is located in the block text on its own, so a key that cannot be found says
        // nothing about the next one.
        for (const key of block.keys) {
          const definition = glossaryByKey.get(key);
          if (definition === undefined) {
            throw new Error(`Missing glossary definition for validated code term key: ${key}.`);
          }
          const term = codeTermMatchText(definition, CODE_TERM_METADATA.matching.source);
          const start = firstCodeTermIndex(block.node.value, term, CODE_TERM_METADATA.matching);
          if (start === -1) {
            found.push(
              refuse(
                'CODE_TERM_NOT_FOUND',
                `Code term ${key} does not occur as canonical text: ${term}.`,
                'Correct the key or include the exact canonical term in this code block.',
                { key },
              ),
            );
            continue;
          }
          const end = start + term.length;
          if (
            CODE_TERM_METADATA.matching.lineBoundary === 'reject' &&
            block.node.value.slice(start, end).includes('\n')
          ) {
            found.push(
              refuse(
                'INVALID_CODE_TERM_METADATA',
                `Code term ${key} crosses a line boundary.`,
                'Use a glossary term that occurs within one code line.',
                { key },
              ),
            );
            continue;
          }
          ranges.push({ key, term, start, end });
        }
        return found;
      },
    },
    {
      // Overlap is computed from the ranges of every annotated key, so it cannot answer for a block
      // whose keys were refused or could not be located.
      id: 'no-overlap',
      dependsOn: ['known-keys', 'locatable-terms'],
      check: ({ block, ranges, refuse }) => {
        if (ranges.length !== block.keys.length) return undefined;
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
            return refuse(
              'OVERLAPPING_CODE_TERMS',
              `Code terms ${previous.key} and ${current.key} overlap in their first occurrences.`,
              'Annotate only one of the overlapping glossary terms in this code block.',
              { keys: [previous.key, current.key] },
            );
          }
        }
        return undefined;
      },
    },
  ],
});

function validateCodeTermBlocks(
  blocks: readonly { readonly node: Code; readonly keys: readonly string[] }[],
  glossaryByKey: ReadonlyMap<string, GlossaryDefinition>,
  refusedGlossaryKeys: ReadonlySet<string>,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  for (const block of blocks) {
    runAuthoredRules(
      codeTermBlockRules,
      {
        block,
        glossaryByKey,
        refusedGlossaryKeys,
        ranges: [],
        refuse: (code, message, remediation, details) =>
          attachNodeSource(
            new AgenticReportError({ level: 'error', code, message, remediation, details }),
            block.node,
            options,
          ),
      },
      violations,
    );
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

/**
 * A registered term must be introduced by an explicit reference the first time it appears in a
 * section; later mentions in that same section may stay plain prose. Marking every occurrence is
 * what made the glossary unusable for inflected languages, where one term is written many times.
 */
function validateUnmarkedGlossaryTerms(
  tree: MdastRoot,
  definitions: readonly GlossaryDefinition[],
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  if (definitions.length === 0) return;
  const ordered = [...definitions].sort((left, right) => right.term.length - left.term.length);
  walk(tree as TraversableNode, new Set<string>());

  function walk(node: TraversableNode, introduced: Set<string>): void {
    if (node.type === 'code' || node.type === 'inlineCode') return;
    if (isDirectiveNode(node) && (node.name === 'glossary' || node.name === 'term')) {
      if (node.name === 'term') introduced.add(String(node.attributes?.key ?? ''));
      return;
    }
    if (node.type !== undefined && PROSE_CONTAINERS.has(node.type)) {
      // Prose containers are independent subjects: an unmarked term in one paragraph says nothing
      // about the next, so the walk continues and every container answers for itself.
      runAuthoredRules(
        proseContainerRules,
        { container: node, definitions: ordered, options, introduced },
        violations,
      );
      return;
    }
    // Each section carries its own introductions, so a reader entering mid-document still meets the
    // term explained where they are reading.
    const scope = isDirectiveNode(node) && node.name === 'section' ? new Set<string>() : introduced;
    for (const child of node.children ?? []) walk(child, scope);
  }
}

interface ProseContainerSubject {
  readonly container: TraversableNode;
  readonly definitions: readonly GlossaryDefinition[];
  readonly options: DirectivePluginOptions;
  readonly introduced: Set<string>;
}

/**
 * The rule of one prose container. Every registered term left unmarked in it is an independent fact,
 * so the rule answers with all of them rather than with the first.
 */
const proseContainerRules = declareAuthoredRules<ProseContainerSubject>({
  subject: 'prose-container/glossary',
  rules: [
    {
      id: 'first-occurrence-marked',
      check: ({ container, definitions, options, introduced }) => {
        const found: AgenticReportError[] = [];
        validateProseContainer(container, definitions, options, introduced, found);
        return found;
      },
    },
  ],
});

function validateProseContainer(
  container: TraversableNode,
  definitions: readonly GlossaryDefinition[],
  options: DirectivePluginOptions,
  introduced: Set<string>,
  violations: AgenticReportError[],
): void {
  let visible = '';
  let segments: ProseSegment[] = [];
  const wrappers: InlineWrapper[] = [];

  const flush = (): void => {
    if (visible.length === 0) return;
    // Different terms left unmarked in the same prose are independent facts, so the container
    // answers for all of them. A term already reported is answered for: every later mention of it
    // would only repeat that refusal, so the section treats it as introduced from here on.
    for (;;) {
      const pending = definitions.filter((definition) => !introduced.has(definition.key));
      const match = pending.length === 0 ? undefined : earliestGlossaryMatch(visible, pending);
      if (match === undefined) break;
      introduced.add(match.definition.key);
      violations.push(unmarkedGlossaryError(match, visible, segments, wrappers, options));
    }
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
      // Text before an explicit reference is still unintroduced; the reference counts only after it.
      flush();
      if (isDirectiveNode(node) && node.name === 'term')
        introduced.add(String(node.attributes?.key ?? ''));
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
    readonly label: string;
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

  const replacement = `${visible.slice(visibleStart, match.index)}:term[${escapeDirectiveLabel(match.label)}]{key="${match.definition.key}"}${visible.slice(matchEnd, visibleEnd)}`;
  const source = resolveSourceLocation(options.sourceMap, sourceStart, sourceEnd);
  const fix = applicableGlossaryFix({
    replacement,
    options,
    sourceStart,
    sourceEnd,
    // The envelope is compared in authored coordinates, not visible ones. A link whose label is
    // exactly the term occupies the same visible span as the term itself while its authored span
    // covers `[label](url)` entirely, so a visible-only comparison sees no expansion and hands out a
    // replacement that deletes the author's URL.
    envelopeExpanded:
      mappedSourceStart === undefined ||
      mappedSourceEnd === undefined ||
      sourceStart !== mappedSourceStart ||
      sourceEnd !== mappedSourceEnd,
  });
  return new AgenticReportError({
    level: 'error',
    code: 'UNMARKED_GLOSSARY_TERM',
    message: `Registered glossary term must use a term reference: ${match.definition.term}.`,
    remediation: `Replace this occurrence with ${replacement}.`,
    ...(source === undefined ? {} : { source }),
    ...(fix === undefined ? {} : { fix }),
    details: { key: match.definition.key },
  });
}

/**
 * The replacement as applicable data, or nothing when applying it would not be safe. Withholding is
 * the deliberate answer rather than a best effort: a consumer that receives the field is entitled to
 * write it into the file unread.
 */
function applicableGlossaryFix(input: {
  readonly replacement: string;
  readonly options: DirectivePluginOptions;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly envelopeExpanded: boolean;
}): DiagnosticFix | undefined {
  if (input.envelopeExpanded) return undefined;
  if (!isTransportSafeReplacement(input.replacement)) return undefined;
  const range = resolveSourceRange(input.options.sourceMap, input.sourceStart, input.sourceEnd);
  if (range === undefined) return undefined;
  return { ...range, replacement: input.replacement };
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

/**
 * Reads the declared-form list of one glossary definition. Bounds are enforced here rather than in
 * the attribute constraint because the attribute carries a list in one string: the registry can
 * bound the whole string, not its items.
 */
/**
 * The spellings this definition declares, or the violation that prevents reading them. Bounds are
 * enforced here rather than in the attribute constraint because the attribute carries a list in one
 * string: the registry can bound the whole string, not its items.
 */
function declaredGlossaryForms(
  value: unknown,
  node: DirectiveNode,
): readonly string[] | AgenticReportError {
  if (value === undefined) return [];
  const declared = String(value)
    .split(',')
    .map((form) => form.trim())
    .filter((form) => form.length > 0);
  if (declared.length === 0) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_ATTRIBUTE',
      'Glossary forms must list at least one spelling.',
      'Remove the empty forms attribute or list the spellings, separated by commas.',
    );
  }
  if (declared.length > MAX_GLOSSARY_FORMS) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_ATTRIBUTE',
      `Glossary forms must list at most ${MAX_GLOSSARY_FORMS} spellings.`,
      'Keep the declared spellings to the ones the text actually uses.',
    );
  }
  for (const form of declared) {
    if (form.length > MAX_GLOSSARY_FORM_LENGTH) {
      return directiveError(
        node,
        'INVALID_DIRECTIVE_ATTRIBUTE',
        `Glossary form must be at most ${MAX_GLOSSARY_FORM_LENGTH} characters: ${form}.`,
        'Declare one spelling per list item rather than a phrase.',
      );
    }
  }
  const unique = new Set(declared.map((form) => form.toLocaleLowerCase('und')));
  if (unique.size !== declared.length) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_ATTRIBUTE',
      'Glossary forms must not repeat a spelling.',
      'List each spelling once; case alone does not make two forms.',
    );
  }
  return declared;
}

/**
 * The earliest occurrence of any registered term, matched through the canonical spelling and every
 * spelling its author declared. The visible text of the match is carried back, because the term
 * reference that replaces it must keep the spelling the sentence used, not the dictionary headword.
 */
function earliestGlossaryMatch(
  value: string,
  definitions: readonly GlossaryDefinition[],
):
  | {
      readonly definition: GlossaryDefinition;
      readonly index: number;
      readonly length: number;
      readonly label: string;
    }
  | undefined {
  let earliest:
    | {
        readonly definition: GlossaryDefinition;
        readonly index: number;
        readonly length: number;
        readonly label: string;
      }
    | undefined;
  for (const definition of definitions) {
    for (const spelling of [definition.term, ...definition.forms]) {
      const visibleTerm = escapeRegExp(spelling).replace(/\s+/gu, '\\s+');
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${visibleTerm}(?![\\p{L}\\p{N}_])`, 'iu');
      const match = pattern.exec(value);
      if (match === null) continue;
      if (earliest === undefined || match.index < earliest.index) {
        // The label collapses the whitespace the match spanned: a term split across a soft line
        // break is one occurrence, and a directive label may not carry the break.
        const label = match[0].replace(/\s+/gu, ' ');
        earliest = { definition, index: match.index, length: match[0].length, label };
      }
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

function prototypeLikeAttributeViolation(
  node: DirectiveNode,
  markdown: string,
): AgenticReportError | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  const directiveSource = markdown.slice(start, end);
  const attributes = directiveAttributeNames(directiveSource).filter((name) =>
    PROTOTYPE_LIKE_ATTRIBUTES.has(name),
  );
  if (attributes.length === 0) return undefined;
  return directiveError(
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
      if (semantic === 'lead') {
        enhanceLead(node);
        return;
      }
      if (semantic === 'copyable') {
        enhanceCopyableProse(node);
        return;
      }
      if (semantic === 'response') {
        enhanceResponse(node, allocateId);
        return;
      }
      if (semantic === 'section') {
        enhanceSection(node, allocateId);
        return;
      }
      if (semantic === 'contents') return;
      if (semantic === 'action') {
        enhanceAction(node);
        return;
      }
      if (semantic === 'source-link') {
        enhanceSourceLink(node, options.share === true);
        if (options.share === true && options.shareTransform !== undefined) {
          options.shareTransform.neutralizedSourceLinks += 1;
        }
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
    const navigation = resolveDocumentNavigation(tree, strings.contentSections);
    if (options.navigationTransform !== undefined) {
      options.navigationTransform.items = navigation;
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

function enhanceLead(node: Element): void {
  const paragraphs = node.children.filter(
    (child): child is Element => child.type === 'element' && child.tagName === 'p',
  );
  const paragraph = paragraphs[0];
  if (paragraph === undefined || paragraphs.length !== 1) {
    throw new Error('Validated lead is missing its single paragraph.');
  }
  node.tagName = 'p';
  node.properties = { ...paragraph.properties, ...node.properties };
  node.children = paragraph.children;
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

function enhanceSourceLink(node: Element, share: boolean): void {
  const label = takeStringProperty(node, 'dataLabel');
  const href = takeStringProperty(node, 'dataHref');
  if (label === undefined || href === undefined) {
    throw new Error('Validated source-link is missing its label or href.');
  }
  if (share) {
    node.tagName = 'span';
    delete node.properties.href;
    delete node.properties.target;
    delete node.properties.rel;
    delete node.properties.dataSourceLink;
    node.properties.dataSourceLinkNeutralized = '';
    node.children = [{ type: 'text', value: shareSafeSourceLabel(href) }];
    return;
  }
  node.properties.href = href;
  node.properties.target = '_blank';
  node.properties.rel = ['noopener', 'noreferrer'];
  node.properties.dataSourceLink = '';
  node.children = [decorativeIcon('arrow-right'), { type: 'text', value: label }];
}

type ShareLabelSafety =
  { readonly safe: true; readonly fixedPoint: string } | { readonly safe: false };

function shareSafeSourceLabel(href: string): string {
  const helper = new URL(href);
  const helperPath = helper.searchParams.get('path');
  const line = helper.searchParams.get('line');
  if (helperPath === null || line === null) {
    throw new Error('Validated source-link helper is missing its path or line.');
  }
  const generic = `source:${line}`;
  if (/[\\/]$/u.test(helperPath)) return generic;
  const candidate = helperPath.split(/[\\/]/u).at(-1);
  if (candidate === undefined) return generic;
  const safety = classifyShareLabel(candidate);
  if (!safety.safe) return generic;
  const derived = `${safety.fixedPoint}:${line}`;
  return derived.length <= SOURCE_LINK_LABEL_MAX_LENGTH ? derived : generic;
}

function classifyShareLabel(value: string): ShareLabelSafety {
  let current = value;
  for (let inspection = 0; inspection <= value.length; inspection += 1) {
    if (!shareLabelRepresentationIsSafe(current)) return { safe: false };
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return { safe: false };
    }
    if (decoded === current) return { safe: true, fixedPoint: current };
    current = decoded;
  }
  return { safe: false };
}

function shareLabelRepresentationIsSafe(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.startsWith('~') &&
    !hasShareLabelControl(value) &&
    !/[\\/:]/u.test(value)
  );
}

function hasShareLabelControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

function sourceLinkLabelMaximumLength(): number {
  const sourceLink = directiveByName.get('source-link');
  const label = sourceLink?.attributes.find((attribute) => attribute.name === 'label');
  if (label?.constraint.kind !== 'string' || label.constraint.maxLength === undefined) {
    throw new Error('Source-link label constraint is missing its maximum length.');
  }
  return label.constraint.maxLength;
}

function enhanceCopyableProse(node: Element): void {
  const authoredChildren = node.children;
  node.properties.dataCopyableProse = '';
  node.children = [
    {
      type: 'element',
      tagName: 'div',
      properties: { dataCopyableContent: '' },
      children: authoredChildren,
    },
  ];
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

function directiveFormViolation(
  node: DirectiveNode,
  directive: DirectiveDefinition,
): AgenticReportError | undefined {
  const form = directiveForm(node.type);
  if (form === undefined || !directive.forms.includes(form)) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_FORM',
      `${node.name} cannot use the ${node.type} form.`,
      `Use one of these directive forms: ${directive.forms.map(formNodeType).join(', ')}.`,
    );
  }
  return undefined;
}

function directivePlacementViolation(
  node: DirectiveNode,
  directive: DirectiveDefinition,
  parent: unknown,
): AgenticReportError | undefined {
  const parentDirective = isDirectiveNode(parent) ? directiveByName.get(parent.name) : undefined;
  const requiredParent = directive.placement.requiredParent;
  if (
    directive.placement.topLevelOnly === true &&
    (!isTraversableNode(parent) || parent.type !== 'root')
  ) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${directive.name} must be a top-level directive.`,
      `Move this ${directive.name} directive outside blockquotes, lists, and other directives.`,
    );
  }
  if (requiredParent !== undefined && parentDirective?.name !== requiredParent) {
    return directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${directive.name} must be nested directly inside ${requiredParent}.`,
      `Move this ${directive.name} directive inside a ${requiredParent} directive.`,
    );
  }
  const allowedChildren = allowedDirectiveChildren(parentDirective?.children);
  if (allowedChildren !== undefined && !allowedChildren.includes(directive.name)) {
    const parentName = parentDirective?.name ?? 'parent';
    return directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${parentName} accepts only ${allowedChildren.join(' or ')} directives as directive children.`,
      `Move this ${directive.name} directive outside ${parentName} or use an allowed child.`,
    );
  }
  return undefined;
}

function directiveChildrenViolation(
  node: DirectiveNode,
  directive: DirectiveDefinition,
): AgenticReportError | undefined {
  if (directive.children !== 'none' || (node.children ?? []).length === 0) return undefined;
  return directiveError(
    node,
    'INVALID_DIRECTIVE_PLACEMENT',
    `${directive.name} accepts no label or child content.`,
    `Remove the label or child content from this ${directive.name} directive.`,
  );
}

function allowedDirectiveChildren(
  children: DirectiveDefinition['children'] | undefined,
): readonly string[] | undefined {
  switch (children) {
    case 'markdown-and-card-directives':
      return ['card'];
    case 'markdown-and-tab-directives':
      return ['tab'];
    case 'markdown-and-term-directives':
      return ['term'];
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
    `Use ${authoringRegistry.directives.map((directive) => directive.name).join(', ')}. Escape the colon as \\: when this text is ordinary prose.`,
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
