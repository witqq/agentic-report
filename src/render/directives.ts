import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Code, Root as MdastRoot } from 'mdast';
import { decodeString } from 'micromark-util-decode-string';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import {
  authoringRegistry,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
  type CodeFenceMetadataDefinition,
} from '../authoring/registry.js';
import { allowedDirectiveChildren } from '../authoring/directive-contract.js';
import type {
  Block,
  BlockAttributeValues,
  BlockEnhancementServices,
  BlockNodeSubject,
  BlockPageSettings,
  BlockValidationContext,
  BlockValidator,
} from '../blocks/define-block.js';
import {
  hasClassName,
  hastRawText,
  hastText,
  prependDirectiveTitle,
  semanticTitle,
  stringProperty,
  takeStringProperty,
} from '../blocks/hast.js';
import { blockByName } from '../blocks/index.js';
import {
  type DirectiveNode,
  isCodeNode,
  isDirectiveNode,
  isTraversableNode,
  type LocatedNode,
  type SourcePosition,
  type TraversableNode,
} from '../blocks/mdast.js';
import { interpretDirectiveAttributes } from '../authoring/schemas.js';
import { BLOCK_STYLE_PROPERTY } from '../authoring/style-rules.js';
import type { Diagnostic, DiagnosticFix, SourceMapSegment } from '../contracts.js';
import { AgenticReportError, isTransportSafeReplacement } from '../diagnostics.js';
import { type AuthoredRule, declareAuthoredRules, runAuthoredRules } from './authored-rules.js';
import { packageStrings } from '../localization.js';
import { resolveSourceLocation, resolveSourceRange } from '../source/source-map.js';
import {
  claimSectionIdentity,
  collectAuthoredSectionIds,
  GENERATED_SECTION_ID_PREFIX,
  SECTION_DIRECTIVE,
  suffixedIdentity,
} from './section-identity.js';
import { resolveDocumentNavigation, type NavigationItem } from './navigation.js';
import { expansionDetails } from '../extensions/origin.js';

interface DirectivePluginOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly markdown: string;
  readonly observedDirectives?: Set<string>;
  /** Sink for authored warnings; a run without one keeps them silent rather than failing. */
  readonly warnings?: Diagnostic[];
  /** The page's directives and blocks; the built-ins when the page declares no extensions. */
  readonly vocabulary?: DirectiveVocabulary;
  /** Violations an earlier phase of the same run found, reported together with this phase's. */
  readonly priorViolations?: readonly AgenticReportError[];
  /** Page settings from the frontmatter that block checks read. */
  readonly page?: BlockPageSettings;
}

interface DirectiveEnhancementOptions {
  readonly sourceMap: readonly SourceMapSegment[];
  readonly language?: string;
  readonly layout?: string;
  readonly share?: boolean;
  readonly shareTransform?: { neutralizedSourceLinks: number };
  readonly navigationTransform?: { items: NavigationItem[] };
  readonly vocabulary?: DirectiveVocabulary;
  /**
   * Collects the feature of every block an element is dispatched to: the page's rendered blocks decide
   * which browser features the page carries (`src/page-features.ts`).
   */
  readonly renderedFeatures?: Set<string>;
}

const directiveByName: ReadonlyMap<string, DirectiveDefinition> = new Map(
  authoringRegistry.directives.map((directive) => [directive.name, directive]),
);

/**
 * The directives and blocks one page is built with. A page without extensions uses the built-ins; a
 * page that declares extensions gets the built-ins together with what its extensions add (effect
 * target attributes, the island block), assembled in `src/extensions/vocabulary.ts`.
 */
export interface DirectiveVocabulary {
  readonly directives: ReadonlyMap<string, DirectiveDefinition>;
  readonly blocks: ReadonlyMap<string, Block>;
}

export const BUILT_IN_VOCABULARY: DirectiveVocabulary = {
  directives: directiveByName,
  blocks: blockByName,
};
/**
 * The glossary is document-wide: definitions form the index that term references, annotated code
 * fences, the first-occurrence check and the appendix read, so the core names the pair.
 */
const GLOSSARY_DIRECTIVE = 'glossary';
const TERM_DIRECTIVE = 'term';
const LOCALIZED_DEFAULT_ATTRIBUTES = new Set(
  [...blockByName.values()].flatMap((block) =>
    [...block.localizedDefaults].map((attribute) => `${block.name}.${attribute}`),
  ),
);
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
    const vocabulary = options.vocabulary ?? BUILT_IN_VOCABULARY;
    const sectionIds = collectAuthoredSectionIds(tree);
    const claimedAuthoredSectionIds = new Set<string>();
    const violations: AgenticReportError[] = [...(options.priorViolations ?? [])];
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
          options.observedDirectives?.add(TERM_DIRECTIVE);
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
          directives: vocabulary.directives,
        },
        found,
      );
      if (outcome === 'accepted') {
        // Names are claimed only now: every rule of the set accepted this node, so it is a section
        // the document really has.
        const values =
          node.name === SECTION_DIRECTIVE && parsed.values !== undefined
            ? claimSectionIdentity(parsed.values, sectionIds, claimedAuthoredSectionIds)
            : (parsed.values ?? {});
        attributesByNode.set(node, values);
        const directive = vocabulary.directives.get(node.name);
        if (directive !== undefined) {
          if (directive.name === GLOSSARY_DIRECTIVE) registerGlossaryDefinition(node, values);
          if (directive.name === TERM_DIRECTIVE)
            termReferences.push({ key: String(values.key), node });
          options.observedDirectives?.add(directive.name);
          // Метка элемента составного блока со стилями (`expand.ts`) переживает отрисовку директивы.
          const block = node.data?.hProperties?.[BLOCK_STYLE_PROPERTY];
          node.data = renderDirective(
            directive,
            values,
            new Set(Object.keys(node.attributes ?? {})),
          );
          if (typeof block === 'string' && node.data.hProperties !== undefined)
            node.data.hProperties[BLOCK_STYLE_PROPERTY] = block;
        }
        return undefined;
      }

      if (node.name === GLOSSARY_DIRECTIVE) {
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
    validateBlocks(tree, attributesByNode, vocabulary.blocks, options, violations);
    validateUnmarkedGlossaryTerms(tree, [...glossaryByKey.values()], options, violations);
    validateStrayFences(tree, options, violations);
    if (violations.length > 0) throw aggregateViolations(violations);
  };

/**
 * A paragraph made only of fence colons (`:::`, `:::::` …) is a closing fence nothing opened, or one left
 * over after its container closed early on a shorter fence: Markdown keeps it as text, and the page would
 * show a row of colons where a block was meant to end. It is refused with its line.
 */
function validateStrayFences(
  tree: MdastRoot,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  visit(tree, 'paragraph', (node) => {
    const text = node.children.every((child) => child.type === 'text')
      ? node.children.map((child) => (child.type === 'text' ? child.value : '')).join('')
      : undefined;
    if (text === undefined || !/^:{3,}$/u.test(text.trim())) return;
    violations.push(
      attachNodeSource(
        new AgenticReportError({
          level: 'error',
          code: 'UNBALANCED_DIRECTIVE_FENCE',
          message: `A closing fence ${text.trim()} closes nothing: its container is already closed or was never opened.`,
          remediation:
            'Give each container a fence longer than every fence inside it (::::section around :::callout), and close it with the same number of colons; remove a fence left over.',
        }),
        node,
        options,
      ),
    );
  });
}

/**
 * Runs every block's own check on each of its nodes, in document order, after the directive pass.
 * A check that refuses its node is not run again below it; blocks sharing one check function share
 * that skip, so a refused visualization hides every visualization nested in it. Every other check
 * still reads the subtree, because a refusal of one block says nothing about another.
 */
function validateBlocks(
  tree: MdastRoot,
  attributesByNode: WeakMap<object, BlockAttributeValues>,
  blocks: ReadonlyMap<string, Block>,
  options: DirectivePluginOptions,
  violations: AgenticReportError[],
): void {
  const services = {
    document: tree,
    page: options.page ?? {},
    attributes: (node: DirectiveNode) => attributesByNode.get(node),
    violation: (node: LocatedNode, code: string, message: string, remediation: string) =>
      attachNodeSource(
        new AgenticReportError({ level: 'error', code, message, remediation }),
        node,
        options,
      ),
    report: (found: AgenticReportError | readonly AgenticReportError[]) => {
      if (found instanceof AgenticReportError) violations.push(found);
      else violations.push(...found);
    },
    warn: (node: LocatedNode, code: string, message: string, remediation: string) => {
      const located = attachNodeSource(
        new AgenticReportError({ level: 'warning', code, message, remediation }),
        node,
        options,
      );
      options.warnings?.push(located.diagnostic);
    },
  } as const;
  walk(tree, undefined, new Set());

  function walk(node: unknown, parent: unknown, skipped: ReadonlySet<BlockValidator>): void {
    let below = skipped;
    const check = isDirectiveNode(node) ? blocks.get(node.name)?.validate : undefined;
    if (isDirectiveNode(node) && check !== undefined && !skipped.has(check)) {
      const context: BlockValidationContext = { ...services, parent };
      if (check(node, context) === 'refused') below = new Set([...skipped, check]);
    }
    if (!isTraversableNode(node)) return;
    for (const child of node.children ?? []) walk(child, node, below);
  }
}

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

function isAppendixGlossaryParent(parent: unknown): boolean {
  return (
    (isTraversableNode(parent) && parent.type === 'root') ||
    (isDirectiveNode(parent) && parent.name === SECTION_DIRECTIVE)
  );
}

export function restoreLiteralColonText(tree: MdastRoot, markdown: string): void {
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
  /** The directives of the page's vocabulary. */
  readonly directives: ReadonlyMap<string, DirectiveDefinition>;
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
      check: ({ node, directives }) =>
        directives.has(node.name) ? undefined : unsupportedDirectiveError(node, directives),
    },
    {
      id: 'no-prototype-like-attributes',
      check: ({ node, markdown, directives }) =>
        prototypeLikeAttributeViolation(node, markdown, directives),
    },
    {
      id: 'declared-form',
      dependsOn: ['registered-name'],
      check: ({ node, directives }) => {
        const directive = directives.get(node.name);
        return directive === undefined ? undefined : directiveFormViolation(node, directive);
      },
    },
    {
      id: 'declared-placement',
      dependsOn: ['registered-name'],
      check: ({ node, parent, directives }) => {
        const directive = directives.get(node.name);
        return directive === undefined
          ? undefined
          : directivePlacementViolation(node, directive, parent, directives);
      },
    },
    {
      id: 'declared-children',
      dependsOn: ['registered-name'],
      check: ({ node, directives }) => {
        const directive = directives.get(node.name);
        return directive === undefined ? undefined : directiveChildrenViolation(node, directive);
      },
    },
    {
      id: 'interpreted-attributes',
      dependsOn: ['registered-name', 'no-prototype-like-attributes'],
      check: ({ node, parsed, directives }) => {
        const directive = directives.get(node.name);
        if (directive === undefined) return undefined;
        const interpretation = interpretDirectiveAttributes(directive, node.attributes ?? {});
        if (!interpretation.ok) return directiveAttributeError(node, interpretation, directives);
        parsed.values = interpretation.values;
        return undefined;
      },
    },
    // A block's own node rules follow the reading of the node and precede the combination and
    // identity checks; each applies to the nodes of its own block only.
    ...[...blockByName.values()].flatMap(blockNodeRules),
    {
      id: 'compatible-attribute-combination',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parsed, directives }) => {
        const directive = directives.get(node.name);
        if (directive === undefined || parsed.values === undefined) return undefined;
        const violations = (directive.incompatibleCombinations ?? [])
          .filter((combination) =>
            Object.entries(combination.attributes).every(([name, incompatibleValues]) => {
              const value = parsed.values?.[name];
              return typeof value === 'string' && incompatibleValues.includes(value);
            }),
          )
          .map((combination) =>
            directiveError(
              node,
              'INVALID_DIRECTIVE_ATTRIBUTE',
              combination.message,
              combination.remediation,
            ),
          );
        return violations.length === 0 ? undefined : violations;
      },
    },
    {
      // The identity is read from the interpreted attributes, so it cannot answer for a node whose
      // attributes were refused. The rule only judges: claiming the name belongs to the accepted
      // node, because a refused section must not take a name away from the section that keeps it.
      id: 'section-identity',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parsed, claimedAuthoredSectionIds }) =>
        node.name === SECTION_DIRECTIVE && parsed.values !== undefined
          ? duplicateSectionIdViolation(node, parsed.values, claimedAuthoredSectionIds)
          : undefined,
    },
    {
      id: 'appendix-glossary-placement',
      dependsOn: ['interpreted-attributes'],
      check: ({ node, parent, parsed }) =>
        node.name === GLOSSARY_DIRECTIVE &&
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
        if (node.name !== GLOSSARY_DIRECTIVE || parsed.values === undefined) return undefined;
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
        if (node.name !== GLOSSARY_DIRECTIVE || parsed.values === undefined) return undefined;
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

function blockNodeRules(block: Block): readonly AuthoredRule<DirectiveNodeSubject>[] {
  return block.nodeRules.map((rule) => ({
    id: rule.id,
    ...(rule.dependsOn === undefined ? {} : { dependsOn: rule.dependsOn }),
    check: ({ node, parent, parsed }) => {
      if (node.name !== block.name) return undefined;
      const subject: BlockNodeSubject = { node, parent, values: parsed.values };
      return rule.check(subject);
    },
  }));
}

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
    ...expansionDetails(node),
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
    if (
      isDirectiveNode(node) &&
      (node.name === GLOSSARY_DIRECTIVE || node.name === TERM_DIRECTIVE)
    ) {
      if (node.name === TERM_DIRECTIVE) introduced.add(String(node.attributes?.key ?? ''));
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
    const scope =
      isDirectiveNode(node) && node.name === SECTION_DIRECTIVE ? new Set<string>() : introduced;
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
        (node.name === GLOSSARY_DIRECTIVE || node.name === TERM_DIRECTIVE)) ||
      node.type === 'code' ||
      node.type === 'inlineCode'
    ) {
      // Text before an explicit reference is still unintroduced; the reference counts only after it.
      flush();
      if (isDirectiveNode(node) && node.name === TERM_DIRECTIVE)
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
  if (source === undefined) return error;
  const expansion = expansionDetails(node);
  return new AgenticReportError(
    {
      ...error.diagnostic,
      source,
      ...(expansion === undefined
        ? {}
        : { details: { ...error.diagnostic.details, ...expansion } }),
    },
    { cause: error },
  );
}

const PROTOTYPE_LIKE_ATTRIBUTES = new Set(['__proto__', 'prototype', 'constructor']);

function prototypeLikeAttributeViolation(
  node: DirectiveNode,
  markdown: string,
  directives: ReadonlyMap<string, DirectiveDefinition>,
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
      directives
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
  (options) => async (tree) => {
    const strings = packageStrings(options.language);
    const blocks = options.vocabulary?.blocks ?? blockByName;
    const allocateId = createDocumentIdAllocator(tree, options);
    const glossary = new Map<
      string,
      { readonly term: string; readonly explanation: string; readonly id: string }
    >();
    visit(tree, 'element', (node: Element) => {
      if (node.properties.dataSemantic !== GLOSSARY_DIRECTIVE) return;
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

    // Blocks settle their own content and compute what their enhancement needs before any element
    // is enhanced; asynchronous preparation, such as the orthogonal flow layout, is awaited together.
    const preparations: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      const prepare = blockForElement(node, blocks)?.prepare;
      if (prepare !== undefined) preparations.push(prepare(node, { strings }));
    });
    await Promise.all(preparations);

    let instance = 0;
    const services: BlockEnhancementServices = {
      strings,
      language: options.language,
      layout: options.layout,
      share: options.share === true,
      allocateId,
      nextInstance: () => {
        instance += 1;
        return instance;
      },
      noteNeutralizedSourceLink: () => {
        if (options.shareTransform !== undefined)
          options.shareTransform.neutralizedSourceLinks += 1;
      },
    };
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
      const codeTermKeys = takeStringProperty(node, 'dataCodeTerms');
      if (node.tagName === 'pre' && codeTermKeys !== undefined) {
        enhanceCodeTerms(node, codeTermKeys.split(','), glossary, createGlossaryReference);
      }
      const semantic = stringProperty(node, 'dataSemantic');
      const block = blockForElement(node, blocks);
      if (block !== undefined) options.renderedFeatures?.add(block.feature);
      if (semantic === TERM_DIRECTIVE) {
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
      if (semantic === GLOSSARY_DIRECTIVE) {
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
      const enhance = block?.enhance;
      if (enhance === undefined) {
        prependDirectiveTitle(node);
        return;
      }
      enhance(node, services);
    });
    // Each block's pass over the whole enhanced page, in block order, before navigation reads it.
    for (const block of blocks.values())
      block.finalize?.(tree, { strings, layout: options.layout });
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

/**
 * The block an enhanced element belongs to. A block rendered as a semantic container carries its
 * name; the resource blocks (downloads, fonts, videos) are recognised by their package class.
 */
function blockForElement(node: Element, blocks: ReadonlyMap<string, Block>): Block | undefined {
  const semantic = stringProperty(node, 'dataSemantic');
  if (semantic !== undefined) return blocks.get(semantic);
  return RESOURCE_BLOCKS.find((block) => hasClassName(node, block.definition.sanitizer.className));
}

const RESOURCE_BLOCKS: readonly Block[] = [...blockByName.values()].filter(
  (block) => block.definition.behavior.renderer !== 'semantic-container',
);

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
    if (node.properties.dataSemantic !== SECTION_DIRECTIVE) return;
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
  directives: ReadonlyMap<string, DirectiveDefinition>,
): AgenticReportError | undefined {
  const parentDirective = isDirectiveNode(parent) ? directives.get(parent.name) : undefined;
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
  const parents = requiredParent === undefined ? [] : [requiredParent].flat();
  if (parents.length > 0 && !parents.includes(parentDirective?.name ?? '')) {
    const named = parents.join(' or ');
    return directiveError(
      node,
      'INVALID_DIRECTIVE_PLACEMENT',
      `${directive.name} must be nested directly inside ${named}.`,
      `Move this ${directive.name} directive inside a ${named} directive.`,
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
    case 'embedded-video':
      // Разметку плеера строит шаг ресурсов после очистки: `<video>` в схему очистки не входит.
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
  directives: ReadonlyMap<string, DirectiveDefinition>,
): AgenticReportError {
  if (interpretation.reason === 'unknown') {
    const allowed = directives.get(node.name)?.attributes.map((attribute) => attribute.name) ?? [];
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
    return 'Use #anchor, a relative path, https:// or http:// URL, mailto: address, tel: number, or sms: number.';
  }
  if (attribute.constraint.kind === 'integer') {
    return `Use an integer ${attribute.name} value.`;
  }
  return `Provide a valid ${attribute.name} value described by the authoring schema.`;
}

function unsupportedDirectiveError(
  node: DirectiveNode,
  directives: ReadonlyMap<string, DirectiveDefinition>,
): AgenticReportError {
  return directiveError(
    node,
    'UNSUPPORTED_DIRECTIVE',
    `Unsupported semantic directive: ${node.name}`,
    `Use ${[...directives.keys()].join(', ')}. Escape the colon as \\: when this text is ordinary prose.`,
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
