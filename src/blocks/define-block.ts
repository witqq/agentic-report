import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { type PackageLocale, type PackageStrings, resolvePackageLocale } from '../localization.js';
import type { AuthoredRule } from '../render/authored-rules.js';
import type { DirectiveNode, LocatedNode } from './mdast.js';

/**
 * A block is the unit the directive vocabulary is built from: one directive with everything the
 * package needs to know about it — its grammar, its own authored checks, how its element is
 * enhanced, its messages, its runtime controller, where its styles come from, what it is without
 * motion, and examples that must validate. The registry, the schemas and the sanitizer are built
 * from the definitions of the registered blocks; the directive core dispatches to the hooks by
 * block name and never names a block itself.
 */

/** The attribute values the grammar interpreted for one accepted directive. */
export type BlockAttributeValues = Readonly<Record<string, string | number | boolean>>;

/** What a block node rule reads in the directive pass. */
export interface BlockNodeSubject {
  readonly node: DirectiveNode;
  readonly parent: unknown;
  /** The grammar's interpretation; absent when the attributes were refused. */
  readonly values: BlockAttributeValues | undefined;
}

/** Page settings from the frontmatter that a block check may compare its node with. */
export interface BlockPageSettings {
  readonly layout?: string | undefined;
  /** The page's motion level (`none`, `restrained`, `expressive`); absent means no bound. */
  readonly motion?: string | undefined;
  /** The language of the variant being read: number agreement and dates follow it. */
  readonly language?: string | undefined;
}

/** What a block's own check may read and report while the document is validated. */
export interface BlockValidationContext {
  /** The document root, the same object for every node of one run; key per-run state on it. */
  readonly document: MdastRoot;
  /** The page settings the check may read; empty when the source is validated without a page. */
  readonly page: BlockPageSettings;
  /** The parent of the node under check, as the document holds it. */
  readonly parent: unknown;
  /** Interpreted attributes of any directive, or nothing when its own reading was refused. */
  readonly attributes: (node: DirectiveNode) => BlockAttributeValues | undefined;
  /** An error located at the authored range of `node`. It is reported only when passed on. */
  readonly violation: (
    node: LocatedNode,
    code: string,
    message: string,
    remediation: string,
  ) => AgenticReportError;
  /** Adds violations to the run; the run keeps every one of them. */
  readonly report: (found: AgenticReportError | readonly AgenticReportError[]) => void;
  /** Adds a located warning; warnings never fail a build. */
  readonly warn: (node: LocatedNode, code: string, message: string, remediation: string) => void;
}

/**
 * The answer of a block check about its node. `refused` means the node's own reading failed: the
 * same check is then not run on the node's descendants, because it would only restate the refusal.
 * Blocks validated together (a family sharing one check function) share that skip.
 */
export type BlockVerdict = 'accepted' | 'refused';

export type BlockValidator = (node: DirectiveNode, context: BlockValidationContext) => BlockVerdict;

/** What the core offers the enhancement of every block element. */
export interface BlockEnhancementServices {
  /** Package strings in the page language. */
  readonly strings: PackageStrings;
  /** The page language as authored; the block's messages are resolved from it. */
  readonly language: string | undefined;
  readonly layout: string | undefined;
  /** Whether the page is built for distribution, with workstation links neutralized. */
  readonly share: boolean;
  /** A document-unique id derived from `base`. */
  readonly allocateId: (base: string) => string;
  /** The next number of the package-owned interactive instances, in document order. */
  readonly nextInstance: () => number;
  /** Counts one workstation source link replaced for a shared page. */
  readonly noteNeutralizedSourceLink: () => void;
}

/** What the enhancement of one block element may use. */
export interface BlockEnhancementContext<Messages = undefined> extends BlockEnhancementServices {
  /** The block's own messages in the page language, when it declares `strings`. */
  readonly messages: Messages;
}

/** What a block's preparation may use; preparation runs before any element is enhanced. */
export interface BlockPreparationContext {
  readonly strings: PackageStrings;
}

/** What a block's document pass may use after every element was enhanced. */
export interface BlockDocumentContext {
  readonly strings: PackageStrings;
  readonly layout: string | undefined;
}

/**
 * Where the block's styles come from. Built-in blocks are styled by the package stylesheet; the
 * field exists so that a block shipped outside the package can bring styles written only in theme
 * tokens.
 */
export type BlockStyles = 'package';

interface BlockSpecificationFields<Prepared, Messages> {
  /** The grammar: name, forms, attributes, children, placement, behavior, sanitizer, security. */
  readonly definition: DirectiveDefinition;
  /**
   * Checks read with the node's grammar in the directive pass. They run after the core has read
   * the name, form, placement, children and attributes, and may depend on those core rules by id
   * (`registered-name`, `interpreted-attributes`, …). A refusal leaves the node unrendered and its
   * descendants unread, like any grammar refusal.
   */
  readonly nodeRules?: readonly AuthoredRule<BlockNodeSubject>[];
  /**
   * The block's own authored checks, run on each of its nodes in source order after the directive
   * pass — also on a node whose grammar was refused, for which `context.attributes` returns nothing.
   */
  readonly validate?: BlockValidator;
  /**
   * Attributes whose registry default is English text: when the author leaves them out, the
   * enhancement writes the default in the page language instead of transporting the English one.
   */
  readonly localizedDefaults?: readonly string[];
  /**
   * Runs once per element before any element is enhanced, in document order; asynchronous work
   * such as a layout is awaited together. Its result reaches `enhance` for the same element.
   */
  readonly prepare?: (
    element: Element,
    context: BlockPreparationContext,
  ) => Prepared | Promise<Prepared>;
  /**
   * Turns the sanitized element of this block into its final HTML. A block without it gets the
   * default: its title, when it has one, becomes its heading.
   */
  readonly enhance?: (
    element: Element,
    context: BlockEnhancementContext<Messages>,
    prepared: Prepared | undefined,
  ) => void;
  /** A pass over the whole enhanced document, in block order, before navigation is resolved. */
  readonly finalize?: (tree: HastRoot, context: BlockDocumentContext) => void;
  /**
   * The runtime controller that brings the block to life in the browser. Metadata in this stage;
   * by default the controller named by the definition's `behavior.runtime`.
   */
  readonly runtime?: string;
  readonly styles: BlockStyles;
  /** One sentence: what the block is without motion and in print. */
  readonly staticEquivalent: string;
  /** Source snippets that must validate as a whole page. */
  readonly examples?: readonly string[];
}

/**
 * Messages of the block that the package catalogue does not carry, in every page language. A block
 * that reads `context.messages` must declare them, and one that declares none reads nothing there.
 */
type BlockMessages<Messages> = [Messages] extends [undefined]
  ? { readonly strings?: never }
  : { readonly strings: Readonly<Record<PackageLocale, Messages>> };

export type BlockSpecification<
  Prepared = undefined,
  Messages = undefined,
> = BlockSpecificationFields<Prepared, Messages> & BlockMessages<Messages>;

/** A block as the core reads it: every hook typed without the block's private types. */
export interface Block {
  readonly name: string;
  readonly definition: DirectiveDefinition;
  readonly nodeRules: readonly AuthoredRule<BlockNodeSubject>[];
  readonly validate: BlockValidator | undefined;
  readonly localizedDefaults: ReadonlySet<string>;
  readonly prepare:
    ((element: Element, context: BlockPreparationContext) => Promise<void>) | undefined;
  readonly enhance: ((element: Element, context: BlockEnhancementServices) => void) | undefined;
  readonly finalize: ((tree: HastRoot, context: BlockDocumentContext) => void) | undefined;
  readonly runtime: string | undefined;
  readonly styles: BlockStyles;
  readonly staticEquivalent: string;
  readonly examples: readonly string[];
}

export function defineBlock<Prepared = undefined, Messages = undefined>(
  specification: BlockSpecification<Prepared, Messages>,
): Block {
  const { definition } = specification;
  for (const name of specification.localizedDefaults ?? []) {
    const attribute = definition.attributes.find((candidate) => candidate.name === name);
    if (attribute?.default === undefined) {
      throw new Error(`Block ${definition.name} localizes ${name}, which has no default.`);
    }
  }
  if (specification.staticEquivalent.trim().length === 0) {
    throw new Error(`Block ${definition.name} must say what it is without motion and in print.`);
  }
  const preparedByElement = new WeakMap<Element, Prepared>();
  const prepare = specification.prepare;
  const enhance = specification.enhance;
  const strings: Readonly<Record<PackageLocale, Messages>> | undefined = specification.strings;
  return {
    name: definition.name,
    definition,
    nodeRules: specification.nodeRules ?? [],
    validate: specification.validate,
    localizedDefaults: new Set(specification.localizedDefaults ?? []),
    prepare:
      prepare === undefined
        ? undefined
        : async (element, context) => {
            preparedByElement.set(element, await prepare(element, context));
          },
    enhance:
      enhance === undefined
        ? undefined
        : (element, context) => {
            // `BlockMessages` makes `strings` present exactly when `Messages` is not undefined, so
            // the missing catalogue can only stand for a block whose messages are undefined.
            const messages = (
              strings === undefined ? undefined : strings[resolvePackageLocale(context.language)]
            ) as Messages;
            enhance(element, { ...context, messages }, preparedByElement.get(element));
          },
    finalize: specification.finalize,
    runtime:
      specification.runtime ??
      (definition.behavior.runtime === 'none' ? undefined : definition.behavior.runtime),
    styles: specification.styles,
    staticEquivalent: specification.staticEquivalent,
    examples: specification.examples ?? [],
  };
}
