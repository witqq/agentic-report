import { z } from 'zod';

import {
  reportManifestInputSchema,
  reportManifestSchema,
  type ReportManifest,
  type ReportManifestInput,
} from './authoring/schemas.js';
import { OUTPUT_FORMATS, type PAGE_CONTRACT, type PageLocaleChoice } from './authoring/registry.js';
import type { ResolvedTheme } from './authoring/themes.js';
import type { ResolvedReviewThread } from './review/binding.js';
import type { LoadedExtensions } from './extensions/load.js';
import type { ExtensionBuildReport } from './extensions/types.js';
import type { PageData } from './source/load-data.js';

export const OutputFormatSchema = z.enum(OUTPUT_FORMATS);
export const ReportManifestInputSchema = reportManifestInputSchema;
export const ReportManifestSchema = reportManifestSchema;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type { ReportManifest, ReportManifestInput };

export interface SourceVariantDocument {
  readonly entryPath: string;
  readonly sourceRoot: string;
  readonly sourceFiles: readonly string[];
  readonly markdown: string;
  readonly manifest: ReportManifest;
  readonly sourceMap: readonly SourceMapSegment[];
  readonly sourceDigests: readonly SourceDigest[];
  /** Data files declared by the primary `data` field; every language variant reads the same. */
  readonly data?: PageData;
}

export interface LocalizedSourceDocument extends SourceVariantDocument {
  readonly locale: PageLocaleChoice;
}

export interface SourceDocument extends SourceVariantDocument {
  /** Решённая тема страницы: встроенная, из файла темы или из frontmatter. */
  readonly theme: ResolvedTheme;
  /** Расширения, объявленные полем `extensions`; нет, когда страница их не объявила. */
  readonly extensions?: LoadedExtensions;
  readonly locale: PageLocaleChoice;
  readonly localizations: readonly LocalizedSourceDocument[];
}

export interface SourceDigest {
  readonly file: string;
  readonly sha256: string;
}

export interface SourceLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface SourceMapSegment {
  readonly generatedStart: number;
  readonly generatedEnd: number;
  readonly sourceFile: string;
  readonly sourceStart: number;
  readonly sourceText: string;
}

/**
 * A replacement the product computed exactly, addressed in the authored text so a consumer can apply
 * it without parsing prose. Present only where applying it preserves every authored construction the
 * range spans; a diagnostic whose repair would need a judgement carries none.
 */
export interface DiagnosticFix {
  readonly file: string;
  /**
   * Offset of the first replaced character, counted in UTF-16 code units of the file decoded as
   * UTF-8 — the unit a JavaScript string index uses. It is not a byte offset: a source with
   * non-ASCII text ahead of the range has more bytes than code units, and slicing the file buffer by
   * these numbers would cut mid-character.
   */
  readonly start: number;
  /** Offset just past the last replaced character, in the same units as `start`. */
  readonly end: number;
  readonly replacement: string;
}

export interface Diagnostic {
  readonly level: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly source?: SourceLocation;
  /**
   * The computed replacement for this violation, when one exists. Transport sanitization applies to
   * it like every other field; a replacement that sanitization would alter carries a credential in
   * authored bytes and is withheld rather than shipped redacted, because applying a redacted
   * replacement would destroy what it redacted.
   */
  readonly fix?: DiagnosticFix;
  readonly details?: Readonly<Record<string, unknown>>;
  /**
   * Further independent violations found in the same run, ordered by position in the source. Absent
   * when the run found exactly one.
   */
  readonly related?: readonly Diagnostic[];
}

export interface BuildReportOptions {
  readonly input: string;
  readonly output?: string;
  readonly format?: OutputFormat;
  readonly review?: string;
  readonly share?: boolean;
  /** Absolute public http(s) URL of the page; overrides the manifest `url`. */
  readonly url?: string;
  /**
   * The previous edition the reader already saw: a page built by this package (`.html` or a directory
   * with `index.html`) or its source (`.md` or a source directory). The page then shows what changed.
   */
  readonly since?: string;
}

/** A block of the new edition that differs from the previous one; never carries the block's text. */
export interface EditionBlockChange {
  readonly kind: string;
  readonly status: 'changed' | 'added' | 'removed' | 'moved';
  /** Where the block stands in the new source; a removed block has `previousOrder` instead. */
  readonly source?: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
    readonly endLine: number;
    readonly endColumn: number;
  };
  /** Position of a removed block in the previous edition's record. */
  readonly previousOrder?: number;
  /** Words inserted and deleted inside changed prose. */
  readonly words?: { readonly added: number; readonly removed: number };
  /** Title of the section a moved block came from. */
  readonly movedFrom?: string;
}

/** A section with changes; `''` is the page opening before the first section. */
export interface EditionSectionChange {
  readonly id: string;
  /** The section's contents label, as `inspect` already reports it. */
  readonly title: string;
  readonly status: 'changed' | 'added' | 'removed';
  readonly renamedFrom: string | null;
  /** The section stands in another order among the others. */
  readonly moved: boolean;
  readonly blocks: readonly EditionBlockChange[];
}

/** What changed since the previous edition, per the design of `--since`: counts and places, no text. */
export interface EditionChanges {
  readonly locale: string;
  readonly since: { readonly edition: number; readonly reportRevision: string };
  readonly edition: number;
  /** Nothing the reader sees changed; the page carries no change layer. */
  readonly unchanged: boolean;
  readonly totals: {
    readonly unchanged: number;
    readonly changed: number;
    readonly added: number;
    readonly removed: number;
    readonly moved: number;
  };
  readonly sections: readonly EditionSectionChange[];
}

export interface BuildReportResult {
  readonly outputPath: string;
  readonly format: OutputFormat;
  readonly bytes: number;
  readonly embeddedAssets: number;
  readonly externalAssets: number;
  readonly contentHash: string;
  readonly share: boolean;
  readonly neutralizedSourceLinks: number;
  readonly warnings: readonly Diagnostic[];
  /** Расширения страницы: использования, вес упакованного кода, заметки. Нет у страницы без них. */
  readonly extensions?: readonly ExtensionBuildReport[];
  /** What changed since the edition passed as `since`; present only with `since`. */
  readonly changes?: EditionChanges;
}

export type SnapshotScheme = 'light' | 'dark';
export type SnapshotMotion = 'normal' | 'reduce';

export interface SnapshotReportOptions {
  readonly input: string;
  /** Absent or empty directory that receives the built page, the snapshots and the contact sheet. */
  readonly output: string;
  readonly widths?: readonly number[];
  readonly schemes?: readonly SnapshotScheme[];
  readonly motions?: readonly SnapshotMotion[];
  /** Previous edition, as for `build`: the photographed page carries its change layer. */
  readonly since?: string;
}

export interface SnapshotShot {
  readonly width: number;
  readonly scheme: SnapshotScheme;
  readonly motion: SnapshotMotion;
  /** The first screen: what the reader sees before scrolling. */
  readonly firstScreen: string;
  readonly fullPage: string;
  readonly pageHeight: number;
  /**
   * A frame per stop: each screen of a `layout: screens` page and each beat of a pinned `scene="scrub"`
   * scene, photographed where the reader stops. Absent when the page has no stops.
   */
  readonly stops?: readonly SnapshotStop[];
}

/** One place where the reader stops, with its frame and whether all of it is in view. */
export interface SnapshotStop {
  readonly kind: 'screen' | 'scene-step';
  /** Id of the screen or of the scene section. */
  readonly id: string;
  /** Number of the screen or of the scene step, from one. */
  readonly index: number;
  readonly frame: string;
  /** Everything the stop holds is in view without scrolling inside it: nothing is cut at the fold. */
  readonly fits: boolean;
}

/** How many were found and the first elements found, described by tag, id and two classes, never by text. */
export interface MeasuredFinding {
  readonly count: number;
  readonly samples: readonly string[];
}

export interface MeasuredContrast {
  readonly element: string;
  readonly ratio: number;
  /** WCAG AA minimum for this text: 4.5, or 3 for large text (24 px, or 18.66 px bold). */
  readonly minimum: number;
  /** Final opacity of the text with its ancestors' `opacity`; 1 is opaque. */
  readonly opacity: number;
}

/** One table as `snapshot --measure` sees it. */
export interface MeasuredTable {
  readonly element: string;
  /** Width of the table's content in pixels, including what its scroll box hides. */
  readonly width: number;
  /** Visible width of the box that holds it: its own scroll box, a scrolling ancestor, or its parent. */
  readonly containerWidth: number;
  /** `width` divided by the window width. */
  readonly viewportShare: number;
  /** The table scrolls sideways inside its box. */
  readonly scrolls: boolean;
  /** Share of the cells' content area not covered by their text lines or pictures, 0–1. */
  readonly emptyShare: number;
  /** Marked `data-table-layout="scroll"`: declared scrollable, so its width is not a defect. */
  readonly scrollLayout: boolean;
}

/** A large block whose mean luminance is far from the page background of the current scheme. */
export interface MeasuredBlock {
  readonly element: string;
  /** Mean relative luminance of the block, 0 (black) to 1 (white): pixels for an image, fill for a surface. */
  readonly luminance: number;
  readonly pageLuminance: number;
  /** Share of the block's area whose luminance is 7:1 or more from the page; 1 for a solid surface. */
  readonly share: number;
}

/** What `snapshot --measure` measures in the page at one width, scheme and motion setting. */
export interface SnapshotPageMeasures {
  readonly pageHeight: number;
  /** Pixels the document scrolls sideways beyond the window; 0 when it does not. */
  readonly horizontalOverflow: number;
  /** The outermost elements beyond the window's left or right edge that no ancestor clips. */
  readonly overflowing: readonly string[];
  /** Text rendered smaller than 11 px on screen, SVG text at its on-screen size. */
  readonly smallText: MeasuredFinding;
  /** Text below its WCAG AA minimum against its composited background, ancestor opacity included. */
  readonly lowContrast: { readonly count: number; readonly samples: readonly MeasuredContrast[] };
  /** Text whose background cannot be reduced to one colour (an image or gradient under it): not measured. */
  readonly unmeasuredContrast: number;
  /** Text lines found under a fixed or sticky element at some scroll position (a full-width top bar excepted). */
  readonly coveredText: MeasuredFinding;
  /**
   * Vertical bands at least half a window high with no text, picture, border or fill, including the one
   * below the last content; `next` names the element that ends the band. None for screens and slides.
   */
  readonly emptyBands: readonly {
    readonly top: number;
    readonly height: number;
    readonly next?: string;
  }[];
  /** Headings cut by their box, an ellipsis, a line clamp or the window edge. */
  readonly clippedHeadings: MeasuredFinding;
  readonly firstScreen: {
    /** The page title is in the first window. */
    readonly heading: boolean;
    /** A primary action (`actions` button) is in the first window. */
    readonly action: boolean;
    /** The page has a primary action somewhere; one that exists but is not in the first window is a defect. */
    readonly actionOnPage: boolean;
    /** Share of the first window taken by its largest picture, clip, canvas, figure, code or scene stage, 0–1. */
    readonly mainSceneShare: number;
    readonly mainScene?: string;
  };
  /** «lorem ipsum», TODO, TBD or FIXME outside code. */
  readonly placeholders: number;
  /** Font families that failed to load. */
  readonly failedFonts: readonly string[];
  readonly tables: {
    readonly count: number;
    /** Wider than 1.25 windows and not marked `data-table-layout="scroll"`. */
    readonly wide: MeasuredFinding;
    /** More than 70% of the cells' content area empty; a table shown as cards is not counted. */
    readonly sparse: MeasuredFinding;
    /** A filled table surface wider than the table's cells by more than a quarter of its track. */
    readonly deadSurface: MeasuredFinding;
    /** Text of a row's first or last cell within 4 px of the edge of the table's filled surface. */
    readonly flushText: MeasuredFinding;
    /** Defective tables first, then the widest. */
    readonly samples: readonly MeasuredTable[];
  };
  /** The width most prose paragraphs share; `narrow` when a window of 480 px or less gives it under 88%. */
  readonly readingColumn: {
    readonly width: number;
    readonly share: number;
    readonly narrow: boolean;
    readonly element?: string;
  };
  /**
   * Inline `code` whose line breaks fall inside a word: not after a space or `/ . _ - : ( ,`, and not at a
   * `<wbr>` the compiler inserted.
   */
  readonly codeBreaks: MeasuredFinding;
  /**
   * SVG text in a figure or diagram under 11 px on screen (`small`, also counted in `smallText`) or cut by
   * the window width or a clipping frame (`clipped`); `count` is the labels with either, and the samples
   * name their figure and SVG. A label hidden only by the sideways scroll of a diagram that has the
   * full-screen viewer is reachable: it is `scrolled`, informational and not in `count`.
   */
  readonly diagramLabels: {
    readonly count: number;
    readonly small: number;
    readonly clipped: number;
    readonly scrolled: number;
    readonly samples: readonly string[];
  };
  /**
   * Images and surfaces of at least 120×80 px of which a fifth or more (and at least 120×80 px of area) is
   * 7:1 or more in luminance from the page background — a light picture or panel on a dark page, a dark
   * slab on a light one; primary actions and `tone="contrast"` bands are deliberate and excluded.
   */
  readonly offSchemeBlocks: { readonly count: number; readonly samples: readonly MeasuredBlock[] };
  /**
   * The composition of flow sections on a window wider than 48rem, measured against each section's prose
   * column (the width most of its direct paragraphs share): `misaligned`, a top-level block of the section
   * whose left edge is off the column's left edge by more than 2 px (a centred block excepted); `overrun`, a
   * text-level block — heading, lead, paragraph, list, quote or disclosure — whose lines (a disclosure: its
   * rules) run more than 24 px past the column's right edge; `emptyTrack`, a section whose column and every
   * block take less than 60% of the section's track, leaving most of the screen beside it empty. `count`
   * is their sum. A picture of a `media="bleed"` section reaching the section edge is not misaligned.
   * Blocks inside an open disclosure count as blocks of its section. `codeWidth`, a code block whose width is
   * neither the prose column nor the section's track (a third width beside its neighbours); `hollow`, a block
   * wider than the column that paints a frame or fill (or holds an island frame) and whose ink — text, pictures,
   * fields, the width an island reports — ends more than 48 px and a quarter of its width before its right edge.
   * `headWide`, a block of the page's head (the title and whatever stands before the first section) whose box
   * runs past the right edge of the flow sections; `tocGap`, a page whose content starts more than 96 px
   * right of the docked table of contents (the column floats in the rest of the window). Not measured for
   * `screens` and `slides`.
   */
  readonly sectionColumns: {
    readonly count: number;
    readonly misaligned: number;
    readonly overrun: number;
    readonly emptyTrack: number;
    readonly codeWidth: number;
    readonly hollow: number;
    readonly headWide: number;
    readonly tocGap: number;
    readonly samples: readonly MeasuredColumnFinding[];
  };
}

export interface MeasuredColumnFinding {
  readonly element: string;
  readonly kind:
    'misaligned' | 'overrun' | 'empty-track' | 'code-width' | 'hollow' | 'head-wide' | 'toc-gap';
  /** Width of the section's prose column, px. */
  readonly column: number;
  /**
   * The block's left offset from the column (`misaligned`), how far it runs past it (`overrun`), the track
   * width (`empty-track`), the code block's width (`code-width`), the empty width inside the frame (`hollow`),
   * how far the head block runs past the column (`head-wide`) or the gap to the contents (`toc-gap`), px.
   */
  readonly value: number;
}

export interface SnapshotMeasurement extends SnapshotPageMeasures {
  readonly width: number;
  readonly scheme: SnapshotScheme;
  readonly motion: SnapshotMotion;
  /** Screens of a `layout: screens` page and steps of pinned scrub scenes, and whether each fits the window. */
  readonly stops: readonly Omit<SnapshotStop, 'frame'>[];
  /** Uncaught page errors and `console.error` messages, first line of each. */
  readonly pageErrors: readonly string[];
  /**
   * Number of the defects above: every finding, band, error, failed font, placeholder and cut stop, overflow,
   * a title outside the first window, a primary action the page has but not in the first window, wide and
   * sparse tables, tables with a dead or flush surface, a narrow reading column on a phone, code broken inside a word, clipped diagram labels
   * (small ones are already in `smallText`), off-scheme blocks and section blocks off their prose column.
   */
  readonly defects: number;
}

export interface MeasureReportResult {
  readonly outputDirectory: string;
  readonly page: string;
  readonly measurements: readonly SnapshotMeasurement[];
  readonly warnings: readonly Diagnostic[];
}

export interface SnapshotReportResult {
  readonly outputDirectory: string;
  readonly page: string;
  readonly shots: readonly SnapshotShot[];
  readonly contactSheet: { readonly html: string; readonly image: string };
  readonly warnings: readonly Diagnostic[];
}

export interface GenerateSitemapOptions {
  /** Root of a published static tree; it corresponds to the root of the pages' origin. */
  readonly directory: string;
}

export interface GenerateSitemapResult {
  readonly directory: string;
  readonly sitemap: string;
  readonly robots: string;
  /** Canonical URLs of the indexed pages, sorted. */
  readonly urls: readonly string[];
  /** HTML files in the tree that agentic-report did not build, relative to the directory. */
  readonly skipped: readonly string[];
}

export interface InitProjectOptions {
  readonly destination: string;
  readonly starter?: string;
}

export interface InitProjectResult {
  readonly starterId: string;
  readonly starterTitle: string;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly files: readonly string[];
}

export interface CreateBrandThemeOptions {
  /** One or two brand colours, `#rgb` or `#rrggbb`: an array, or one comma-separated string. */
  readonly colors: string | readonly string[];
  /** Built-in theme the new theme extends; the default theme when absent. */
  readonly extends?: string;
  /** Absent `.yaml`, `.yml` or `.json` path to write; `brand-theme.yaml` when absent. */
  readonly output?: string;
}

/** One colour role the command set in one scheme, and how far its lightness moved from the brand. */
export interface BrandThemeRole {
  readonly scheme: 'light' | 'dark';
  readonly role: string;
  /** The brand colour the role was derived from, as given. */
  readonly from: string;
  readonly value: string;
  /** OKLCH lightness of the value minus that of the brand colour, 0–1 scale. */
  readonly lightnessShift: number;
  /** Hue distance between the value and the brand colour, in degrees. */
  readonly hueShift: number;
}

export interface CreateBrandThemeResult {
  readonly themePath: string;
  readonly name: string;
  readonly extends: string;
  readonly schemes: readonly ('light' | 'dark')[];
  readonly roles: readonly BrandThemeRole[];
}

export interface ValidateReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
  readonly review?: string;
  readonly url?: string;
  /** Previous edition, as for `build`. */
  readonly since?: string;
}

export interface ValidateReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly format: OutputFormat;
  readonly runtimePlacement: 'inline' | 'external';
  readonly warnings: readonly Diagnostic[];
}

export interface FixReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
}

/** One replacement the run wrote, reported so the author can see what changed without a diff. */
export interface AppliedFix {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly replacement: string;
}

export interface FixReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  /** Empty when the source needed no applicable repair; the command is then a no-op by design. */
  readonly applied: readonly AppliedFix[];
  /**
   * Violations that remain after every applicable replacement was written. A repair the product
   * cannot derive from authored bytes stays here rather than being guessed.
   */
  readonly remaining: readonly Diagnostic[];
}

export interface InspectReportOptions {
  readonly input: string;
  readonly format?: OutputFormat;
  readonly review?: string;
  readonly url?: string;
  /** Previous edition, as for `build`. */
  readonly since?: string;
}

export interface InspectReportResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly output: {
    readonly format: OutputFormat;
    readonly runtimePlacement: 'inline' | 'external';
  };
  readonly sourceFiles: readonly string[];
  readonly structure: PageStructure;
  readonly observed: {
    readonly directives: readonly string[];
    readonly resources: {
      readonly images: number;
      readonly videos: number;
      readonly downloads: number;
      readonly fonts: number;
    };
  };
  /** Расширения, которые объявила страница, и сколько раз она их использовала. */
  readonly extensions?: readonly InspectedExtension[];
  /** What changed since the edition passed as `since`; present only with `since`. */
  readonly changes?: EditionChanges;
  readonly catalog: {
    readonly commands: Readonly<Record<string, string>>;
    readonly formats: readonly OutputFormat[];
    readonly starters: readonly {
      readonly id: string;
      readonly title: string;
      readonly default: boolean;
    }[];
    readonly capabilities: Readonly<Record<string, string>>;
    readonly page: typeof PAGE_CONTRACT;
  };
  readonly warnings: readonly Diagnostic[];
}

/** Extension of the inspected page: its manifest, what it adds and how often the page uses it. */
export interface InspectedExtension {
  readonly name: string;
  readonly kind: ExtensionBuildReport['kind'];
  readonly manifest: string;
  readonly description: string;
  readonly uses: number;
  /** Attributes a block or provider directive accepts, or the targets an effect adds. */
  readonly attributes?: readonly string[];
  readonly targets?: readonly string[];
}

/** Pictures, clips, diagrams, charts and code blocks counted in one part of the page. */
export interface PageMediaCounts {
  readonly images: number;
  readonly videos: number;
  readonly diagrams: number;
  readonly charts: number;
  readonly timelines: number;
  readonly code: number;
}

/** One authored `section` as the package resolved it, recipe defaults included. */
export interface PageSectionStructure {
  readonly depth: number;
  readonly recipe: string | null;
  readonly place: string;
  readonly surface: string;
  readonly transition: string;
  readonly scene: string;
  readonly interaction: string;
  readonly choreography: string;
  readonly media: PageMediaCounts;
}

/**
 * The structure of the primary page variant: no author text, headings or identifiers, only the
 * resolved section properties and counts. The skill's design check reads it.
 */
/**
 * One `cards` group by its form, without its words: how many cards, how many distinct card forms (status,
 * media, number of blocks, list or table), how many plain cards — a title and at most one paragraph,
 * with no status, media, list or table — and how many cards are links.
 */
export interface PageCardGroup {
  readonly cards: number;
  readonly shapes: number;
  readonly plain: number;
  /** Cards promoted to one link (`href`): a group of them is an index of links. */
  readonly linked: number;
}

export interface PageStructure {
  readonly layout: string;
  /** The page's motion level from the manifest (`none`, `restrained`, `expressive`), default applied. */
  readonly motion: string;
  readonly beforeFirstSection: PageMediaCounts;
  readonly sections: readonly PageSectionStructure[];
  readonly magneticActions: number;
  /**
   * Elements that move by themselves outside the section roles: `:count`, `chart{count-up}`, a diagram with
   * `draw="scroll"`, `pulse` or `zoom`, `demo` with `play`, `:swap`, `:typing`, `:mark`, `spotlight`,
   * `video{seam="fade"}`.
   */
  readonly movingElements: number;
  readonly cardGroups: readonly PageCardGroup[];
  /** Headings (`h1`–`h6`, section and block titles included) whose text carries an emoji. */
  readonly emojiHeadings: number;
  readonly emptyBlocks: PageEmptyBlocks;
}

/**
 * Blocks that reached the page with nothing in them — usually a data `each` over an empty list: a section
 * with only its title, a table with a header and no rows, a `cards` group without cards. Counts only: data
 * for the skill's advice, not a judgement of the content.
 */
export interface PageEmptyBlocks {
  readonly sections: number;
  readonly tables: number;
  readonly cardGroups: number;
}

export interface InspectReviewOptions {
  readonly input: string;
  readonly review: string;
}

export interface InspectReviewResult {
  readonly contractVersion: number;
  readonly projectPath: string;
  readonly entryPath: string;
  readonly reportRevision: string;
  readonly reviewedRevision: string;
  readonly reportStatus: 'exact' | 'stale';
  readonly threads: readonly ResolvedReviewThread[];
}
