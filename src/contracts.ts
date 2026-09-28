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
  /** Vertical bands at least half a window high with no text, picture, border or fill; none for screens and slides. */
  readonly emptyBands: readonly { readonly top: number; readonly height: number }[];
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
   * a title outside the first window, and a primary action the page has but not in the first window.
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
