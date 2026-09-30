import { DEFAULT_MOTION_LEVEL, MOTION_LEVELS, PAGE_MOTION_POLICY } from '../page-motion.js';
import { BUILT_IN_THEMES, DEFAULT_THEME_NAME } from './themes.js';
import { BLOCK_DIRECTIVES } from '../blocks/index.js';
import {
  type ConstraintDefinition,
  DIAGRAM_CONTRACT,
  type DirectiveDefinition,
  REGISTRY_IDENTITY_CONSTRAINT,
} from './directive-contract.js';

export {
  CARD_STATUSES,
  DIAGRAM_CONTRACT,
  FINDING_SEVERITIES,
  REGISTRY_IDENTITY_CONSTRAINT,
  SECTION_RECIPE_NAMES,
  SECTION_RECIPES,
  sectionRecipeDefaults,
} from './directive-contract.js';
export type {
  CapabilityHandoff,
  ConstraintDefinition,
  DiagramEdgeKindChoice,
  DiagramTypeChoice,
  DirectiveAttributeDefinition,
  DirectiveAttributeDiagnosticCode,
  DirectiveDefinition,
  DirectiveForm,
  DirectiveIncompatibleCombinationDefinition,
  RendererKey,
} from './directive-contract.js';

export const SOURCE_CONTRACT_MAJOR = 1 as const;

export const OUTPUT_CONTRACT = {
  default: 'single-file',
  formats: ['single-file', 'directory'],
  runtimePlacement: { 'single-file': 'inline', directory: 'external' },
} as const;
export const OUTPUT_FORMATS = OUTPUT_CONTRACT.formats;
export type OutputFormatChoice = (typeof OUTPUT_FORMATS)[number];
export type RuntimePlacement = (typeof OUTPUT_CONTRACT.runtimePlacement)[OutputFormatChoice];

export function runtimePlacementForFormat(format: OutputFormatChoice): RuntimePlacement {
  return OUTPUT_CONTRACT.runtimePlacement[format];
}

/**
 * Стандартные категории страниц. Категория — рекомендация, а не ограничение: она называет задачу
 * читателя, стартер `init` и измерения брифа, но ни одна директива, режим или приём не запрещены
 * на странице другой категории. Review Workspace — режим любой категории (`review: true`).
 */
const COMMON_BRIEF_DIMENSIONS = [
  { id: 'subvariant', question: 'Which kind of page within the category is this?' },
  { id: 'audience', question: 'Who reads the page, and what do they already know?' },
  {
    id: 'reader-task',
    question: 'What must the reader be able to decide or do after reading?',
  },
  {
    id: 'material',
    question: 'What real material exists: screenshots, data, code, clips, quotes, documents?',
  },
  { id: 'language', question: 'Which languages does the page ship in?' },
  {
    id: 'art-direction',
    question: 'Which visual concept and theme fit the subject and the audience?',
  },
  { id: 'motion', question: 'How much motion suits the page: none, restrained or expressive?' },
  {
    id: 'interactivity',
    question:
      'What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)?',
  },
  {
    id: 'delivery',
    question: 'How is the page delivered: one file, a published directory, public or private?',
  },
] as const;

export const PAGE_CATEGORIES = [
  {
    id: 'landing',
    title: 'Landing',
    purpose:
      'Convince a reader to try, adopt or remember something and send them to one next step.',
    layout: 'landing',
    subvariants: ['product', 'portfolio', 'showcase', 'launch'],
    dimensions: [
      ...COMMON_BRIEF_DIMENSIONS,
      {
        id: 'references',
        question:
          'Which 5–10 real sites on the same subject were studied before the concepts, and what does each teach?',
      },
      {
        id: 'first-screen',
        question:
          'What does the first screen show: the result, code beside the result, a diagram or a clip?',
      },
      { id: 'call-to-action', question: 'What is the one action the reader should take?' },
    ],
  },
  {
    id: 'document',
    title: 'Document',
    purpose: 'Explain a finding, a system or a procedure so the reader can check and act on it.',
    layout: 'document',
    subvariants: ['report', 'research', 'architecture', 'code-review', 'incident', 'guide'],
    dimensions: [
      ...COMMON_BRIEF_DIMENSIONS,
      {
        id: 'depth',
        question: 'Does the reader need the conclusion only, or the full evidence behind it?',
      },
      {
        id: 'review',
        question: 'Will someone review the page in place and hand notes back?',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    purpose: 'Show the current state of something at a glance, with the detail one step away.',
    layout: 'dashboard',
    subvariants: ['metrics', 'charts', 'filters', 'statuses'],
    dimensions: [
      ...COMMON_BRIEF_DIMENSIONS,
      {
        id: 'signals',
        question: 'Which numbers and statuses matter, and what counts as good, watch and risk?',
      },
      { id: 'freshness', question: 'When was the data taken, and from which source?' },
    ],
  },
  {
    id: 'presentation',
    title: 'Presentation',
    purpose:
      'Show something to people one slide at a time — live, as a file to click through, or filmed — between a screencast and a slide deck.',
    layout: 'slides',
    subvariants: ['demo', 'pitch', 'update', 'lesson'],
    dimensions: [
      ...COMMON_BRIEF_DIMENSIONS,
      {
        id: 'setting',
        question: 'How is it shown: presented live, sent to click through alone, or filmed?',
      },
      { id: 'length', question: 'How many slides and how many minutes does it have?' },
    ],
  },
  {
    id: 'answer',
    title: 'Answer',
    purpose:
      'Put a question, choices or a form in front of the reader and collect a structured answer.',
    layout: 'document',
    subvariants: ['choice', 'questions', 'survey', 'brief'],
    dimensions: [
      ...COMMON_BRIEF_DIMENSIONS,
      { id: 'respondent', question: 'Who answers, and how much context do they have?' },
      {
        id: 'handoff',
        question: 'Where do the answers go after export, and who reads them?',
      },
    ],
  },
] as const;

export type PageCategoryId = (typeof PAGE_CATEGORIES)[number]['id'];

export const PAGE_CONTRACT = {
  defaultTheme: DEFAULT_THEME_NAME,
  themes: BUILT_IN_THEMES.map((theme) => ({
    name: theme.name,
    description: theme.description,
    palette: theme.palette,
  })),
  themeFileExtensions: ['.yaml', '.yml', '.json'],
  defaultLayout: 'document',
  layouts: ['document', 'dashboard', 'landing', 'mixed', 'slides', 'screens'],
  defaultScheme: 'system',
  schemes: ['system', 'light', 'dark'],
  defaultProgress: 'none',
  progress: ['none', 'page', 'chapters', 'nodes'],
  defaultMotion: DEFAULT_MOTION_LEVEL,
  motionLevels: MOTION_LEVELS,
  defaultOpening: 'center',
  openings: ['center', 'start'],
  defaultAttribution: true,
  defaultReview: false,
  defaultSchemeToggle: true,
  defaultTopbar: true,
  defaultThemeSwitcher: false,
  motion: PAGE_MOTION_POLICY,
  categories: PAGE_CATEGORIES,
} as const;

/**
 * Публичная страница: предел, после которого Googlebot перестаёт читать HTML, и OpenGraph-локали
 * тех языков каталога, у которых в теге нет региона. Остальные теги без региона `og:locale` не
 * получают: территорию пакет не угадывает.
 */
export const PUBLIC_PAGE_CONTRACT = {
  crawlerHtmlByteLimit: 2_097_152,
  openGraphLocales: { en: 'en_US', ru: 'ru_RU' },
} as const;

/** Картинки, которые показывают браузеры и карточки ссылок: постер видео и превью страницы. */
export const STILL_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
]);

export const PAGE_LOCALES = ['en', 'ru'] as const;
export type PageLocaleChoice = (typeof PAGE_LOCALES)[number];

export type LayoutChoice = (typeof PAGE_CONTRACT.layouts)[number];
export type SchemeChoice = (typeof PAGE_CONTRACT.schemes)[number];

export const REVIEW_TARGET_OWNERSHIP_CONTRACT = {
  parentOwnedDirectives: ['lead', 'series', 'question', 'bucket', 'option', 'item'],
} as const;

export interface CodeFenceMetadataDefinition {
  readonly syntax: string;
  readonly description: string;
  readonly fieldExclusivity: 'only-field';
  readonly quoting: 'double';
  readonly separator: ',';
  readonly minItems: number;
  readonly maxItems: number;
  readonly uniqueItems: true;
  readonly itemConstraint: typeof REGISTRY_IDENTITY_CONSTRAINT;
  readonly matching: {
    readonly source: 'canonical-glossary-term';
    readonly caseSensitive: true;
    readonly occurrence: 'first';
    readonly lineBoundary: 'reject';
    readonly overlap: 'reject';
  };
}

interface FieldDefinitionBase {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultVisibility?: 'published' | 'normalization-only';
}

export interface ScalarFieldDefinition extends FieldDefinitionBase {
  readonly default?: string | number | boolean;
  readonly constraint: ConstraintDefinition;
  readonly fields?: never;
}

export interface ObjectFieldDefinition extends FieldDefinitionBase {
  readonly default?: Readonly<Record<string, unknown>>;
  readonly constraint?: never;
  readonly fields: readonly [FieldDefinition, ...FieldDefinition[]];
}

export type FieldDefinition = ScalarFieldDefinition | ObjectFieldDefinition;

export interface ExampleDefinition {
  readonly id: string;
  readonly path: string;
  readonly entry: string;
  readonly title: string;
  readonly description: string;
  readonly classes: readonly [string, ...string[]];
  /** Категория страницы и её подвариант; стартер категории носит её имя. */
  readonly category: PageCategoryId;
  readonly subvariant?: string;
  readonly starter?: { readonly default: boolean };
}

export interface CapabilityDefinition {
  readonly id: string;
  readonly description: string;
}

export interface CommandDefinition {
  readonly id: string;
  readonly description: string;
}

export interface AuthoringRegistryDefinition {
  readonly contract: {
    readonly major: number;
    readonly supportedReaderMajors: readonly [number, ...number[]];
    readonly legacySourceMajor: number;
    readonly schemaDialect: string;
    readonly schemaIds: Readonly<Record<'manifest' | 'directives' | 'source', string>>;
    readonly evolution: {
      readonly additiveWithinMajor: boolean;
      readonly breakingChangeRequiresNewMajor: boolean;
      readonly silentReinterpretationAllowed: boolean;
    };
  };
  readonly source: {
    readonly entry: string;
    readonly metadata: readonly [string, ...string[]];
    readonly partialSyntax: string;
    readonly directiveSyntax: Readonly<
      Record<'container' | 'nestedContainer' | 'leaf' | 'text' | 'numericColonText', string>
    >;
    readonly codeFenceMetadata: Readonly<Record<'terms', CodeFenceMetadataDefinition>>;
    readonly resources: readonly [string, ...string[]];
  };
  readonly output: {
    readonly default: OutputFormatChoice;
    readonly formats: readonly [OutputFormatChoice, ...OutputFormatChoice[]];
    readonly runtimePlacement: Readonly<Record<OutputFormatChoice, RuntimePlacement>>;
  };
  readonly page: typeof PAGE_CONTRACT;
  readonly visualizations: { readonly diagram: typeof DIAGRAM_CONTRACT };
  readonly manifestFields: readonly [FieldDefinition, ...FieldDefinition[]];
  readonly directives: readonly [DirectiveDefinition, ...DirectiveDefinition[]];
  readonly capabilities: readonly [CapabilityDefinition, ...CapabilityDefinition[]];
  readonly commands: readonly [CommandDefinition, ...CommandDefinition[]];
  readonly examples: readonly [ExampleDefinition, ...ExampleDefinition[]];
}

export const authoringRegistry = {
  contract: {
    major: SOURCE_CONTRACT_MAJOR,
    supportedReaderMajors: [SOURCE_CONTRACT_MAJOR],
    legacySourceMajor: SOURCE_CONTRACT_MAJOR,
    schemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    schemaIds: {
      manifest: 'urn:agentic-report:schema:manifest:1',
      directives: 'urn:agentic-report:schema:directives:1',
      source: 'urn:agentic-report:schema:source:1',
    },
    evolution: {
      additiveWithinMajor: true,
      breakingChangeRequiresNewMajor: true,
      silentReinterpretationAllowed: false,
    },
  },
  source: {
    entry: 'Markdown file or directory containing report.md/index.md',
    metadata: ['YAML/JSON manifest', 'YAML frontmatter'],
    partialSyntax: '{{include: relative/path.md}}',
    directiveSyntax: {
      container: ':::name{attributes}\nMarkdown children\n:::',
      nestedContainer: 'Use a longer outer colon fence than nested directives.',
      leaf: '::name{attributes}',
      text: ':name[label]{attributes}',
      numericColonText:
        'A colon that opens a digit-initial name, and a colon written against the preceding word, remain literal Markdown text: 21:01, 1:30:05, 3:1, 1:10:100, localhost:9000, ключ:значение and Пункт :2. Only the inline form without attributes or children is restored: a spaced unknown alphabetic name, any attributed or child-bearing form, and every block-level form stay directives; write \\: for ordinary prose.',
    },
    codeFenceMetadata: {
      terms: {
        syntax: 'terms="key,other-key"',
        description: 'Annotates exact first canonical glossary occurrences in one code fence.',
        fieldExclusivity: 'only-field',
        quoting: 'double',
        separator: ',',
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        itemConstraint: REGISTRY_IDENTITY_CONSTRAINT,
        matching: {
          source: 'canonical-glossary-term',
          caseSensitive: true,
          occurrence: 'first',
          lineBoundary: 'reject',
          overlap: 'reject',
        },
      },
    },
    resources: ['local images', 'downloadable local assets', 'local fonts'],
  },
  output: OUTPUT_CONTRACT,
  page: PAGE_CONTRACT,
  visualizations: { diagram: DIAGRAM_CONTRACT },
  manifestFields: [
    {
      name: 'contractVersion',
      description:
        'Authored source-contract major; omitted legacy source is interpreted as version 1.',
      required: false,
      default: SOURCE_CONTRACT_MAJOR,
      constraint: { kind: 'integer', minimum: 1 },
    },
    {
      name: 'title',
      description: 'Document title.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
    },
    {
      name: 'description',
      description: 'Plain-text document description for metadata.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
    },
    {
      name: 'language',
      description:
        'Language tag using the supported 2-8 letter primary and optional 2-8 character alphanumeric subtags.',
      required: false,
      default: 'und',
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 2,
        pattern: '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$',
      },
    },
    {
      name: 'localizations',
      description:
        'Confined alternate Markdown entries for package-supported reader locales; the primary entry is the fallback.',
      required: false,
      fields: [
        {
          name: 'en',
          description: 'Alternate English Markdown entry relative to the primary source root.',
          required: false,
          constraint: {
            kind: 'string',
            normalization: 'trim',
            minLength: 1,
            format: 'relative-local-path',
          },
        },
        {
          name: 'ru',
          description: 'Alternate Russian Markdown entry relative to the primary source root.',
          required: false,
          constraint: {
            kind: 'string',
            normalization: 'trim',
            minLength: 1,
            format: 'relative-local-path',
          },
        },
      ],
    },
    {
      name: 'url',
      description:
        'Absolute public http(s) URL of the page; enables canonical, OpenGraph and Twitter card metadata.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        pattern: '^[Hh][Tt][Tt][Pp][Ss]?://\\S+$',
        format: 'absolute-http-url',
      },
    },
    {
      name: 'image',
      description:
        'Local PNG, JPEG, WebP, GIF or AVIF social preview image; published as og:image by a directory build with a public URL.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        format: 'relative-local-path',
      },
    },
    {
      name: 'theme',
      description:
        'Visual theme: a built-in theme name, a relative path to a .yaml/.yml/.json theme file, or a theme object with extends and the fields it changes.',
      required: false,
      default: PAGE_CONTRACT.defaultTheme,
      constraint: { kind: 'theme-reference' },
    },
    {
      name: 'scheme',
      description: 'Initial colour scheme: follow the reader system, or light, or dark.',
      required: false,
      default: PAGE_CONTRACT.defaultScheme,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.schemes },
    },
    {
      name: 'layout',
      description:
        'Responsive page composition selected from the package-owned layout catalog; screens moves one whole screen per gesture, with a screen switcher, keys and anchors, and scrolls normally under reduced motion.',
      required: false,
      default: PAGE_CONTRACT.defaultLayout,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.layouts },
    },
    {
      name: 'progress',
      description:
        'Page-wide progress element at the top edge: none, one bar for the whole page, one segment per chapter that fills as the reader moves through it and jumps to the chapter on click, or a row of nodes, one per chapter, marking the chapters passed and the current one.',
      required: false,
      default: PAGE_CONTRACT.defaultProgress,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.progress },
    },
    {
      name: 'motion',
      description:
        'How much the page moves, decided by the brief: none — everything is drawn in its final state; restrained — at most one chapter entrance and one pointer effect, no pinned scenes, diagram drawing, WebGL or staged entrance; expressive — the whole motion vocabulary. Reduced motion always stills the page.',
      required: false,
      default: PAGE_CONTRACT.defaultMotion,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.motionLevels },
    },
    {
      name: 'opening',
      description:
        'Alignment of the page title, introduction and actions on a landing page: centered, or aligned to the start edge.',
      required: false,
      default: PAGE_CONTRACT.defaultOpening,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.openings },
    },
    {
      name: 'attribution',
      description:
        'Shows the package-owned “Made with Agentic Report” footer link; set false to omit it.',
      required: false,
      default: PAGE_CONTRACT.defaultAttribution,
      constraint: { kind: 'boolean' },
    },
    {
      name: 'topbar',
      description:
        'Shows the package-owned top bar with the title, the contents button and the page controls; set false for a page filmed as a scene: the first section starts at the top edge, and review and themeSwitcher, which live in the bar, are refused.',
      required: false,
      default: PAGE_CONTRACT.defaultTopbar,
      constraint: { kind: 'boolean' },
    },
    {
      name: 'schemeToggle',
      description:
        'Shows the package-owned light and dark control; set false for a page that must stay in the scheme it was built with.',
      required: false,
      default: PAGE_CONTRACT.defaultSchemeToggle,
      constraint: { kind: 'boolean' },
    },
    {
      name: 'themeSwitcher',
      description:
        'Shows a package-owned selector that swaps the page between the built-in themes and its own; the colour scheme stays where the reader put it.',
      required: false,
      default: PAGE_CONTRACT.defaultThemeSwitcher,
      constraint: { kind: 'boolean' },
    },
    {
      name: 'review',
      description:
        'Enables the package-owned review workspace; off by default so an ordinary page ships as a document rather than a review surface.',
      required: false,
      default: PAGE_CONTRACT.defaultReview,
      constraint: { kind: 'boolean' },
    },
    {
      name: 'extensions',
      description:
        'Extension manifests the page declares (blocks, providers, effects, islands), relative to the source root.',
      required: false,
      constraint: { kind: 'local-path-list', minItems: 1, maxItems: 32 },
    },
    {
      name: 'data',
      description:
        'JSON data files the page reads at build time, relative to the source root; each is addressed by its name without .json, as in {{run.total}}.',
      required: false,
      constraint: { kind: 'local-path-list', minItems: 1, maxItems: 16 },
    },
    {
      name: 'output',
      description: 'Default output settings; command-line flags can override the format.',
      required: false,
      default: { format: OUTPUT_CONTRACT.default, maxInlineBytes: 5_000_000 },
      fields: [
        {
          name: 'format',
          description: 'Static artifact layout; single-file is the portable default.',
          required: false,
          default: OUTPUT_CONTRACT.default,
          constraint: { kind: 'enum', values: OUTPUT_FORMATS },
        },
        {
          name: 'maxInlineBytes',
          description:
            'Size budget of bytes embedded into single-file output; a build above it fails, use directory output or raise it deliberately.',
          required: false,
          default: 5_000_000,
          constraint: { kind: 'integer', minimum: 1 },
        },
      ],
    },
  ],
  directives: BLOCK_DIRECTIVES,
  capabilities: [
    {
      id: 'init',
      description: 'Initialize a packaged declarative starter without overwriting user content.',
    },
    {
      id: 'validate',
      description: 'Validate a project through the production preparation pipeline.',
    },
    {
      id: 'inspect',
      description: 'Inspect a valid project through the production preparation pipeline.',
    },
    {
      id: 'review',
      description: 'Resolve a versioned review artifact to current Markdown source locations.',
    },
  ],
  commands: [
    {
      id: 'init',
      description: 'Initialize a packaged declarative starter without overwriting user content.',
    },
    {
      id: 'validate',
      description: 'Validate a project without writing an output artifact.',
    },
    {
      id: 'inspect',
      description:
        'Inspect source usage and the available authoring catalog without writing output.',
    },
    {
      id: 'review',
      description: 'Resolve a confined review artifact without changing report sources.',
    },
    {
      id: 'build',
      description: 'Compile a source into a default or share-safe static artifact.',
    },
    {
      id: 'fix',
      description: 'Apply the replacements the product computed exactly, and nothing else.',
    },
    {
      id: 'theme',
      description:
        'Write an author theme file from one or two brand colours, their lightness shifted until every contrast pair passes in both schemes.',
    },
    { id: 'describe', description: 'Return the complete source contract.' },
    {
      id: 'schema',
      description: 'Return manifest, directive, or complete source JSON Schema.',
    },
    {
      id: 'examples',
      description:
        'List packaged buildable examples and the reference extensions shipped beside them.',
    },
    {
      id: 'sitemap',
      description:
        'Write sitemap.xml and robots.txt for a published tree of pages built with a public URL.',
    },
    {
      id: 'snapshot',
      description:
        'Build a page and photograph it at several widths, in both schemes, with and without motion, with a contact sheet; with --measure, measure it instead of photographing.',
    },
    {
      id: 'effect-check',
      description:
        'Build the examples of an effect extension and run the eleven effect checks in Chromium, reporting N of M checks passed.',
    },
  ],
  examples: [
    {
      id: 'document',
      path: 'document',
      entry: 'report.md',
      title: 'Document starter',
      description:
        'Decision-ready report with findings, evidence, a local asset, a timeline, and bounded interaction.',
      classes: ['report', 'work-report'],
      category: 'document',
      subvariant: 'report',
      starter: { default: true },
    },
    {
      id: 'answer',
      path: 'answer',
      entry: 'report.md',
      title: 'Answer starter',
      description:
        'A question with options and their trade-offs, followed by a response form that exports one structured answer.',
      classes: ['structured-response-handoff'],
      category: 'answer',
      subvariant: 'choice',
      starter: { default: false },
    },
    {
      id: 'presentation',
      path: 'presentation',
      entry: 'report.md',
      title: 'Presentation starter',
      description:
        'A short product demo as slides: a title slide, steps that appear on click, a diagram, a figure, code and a question for the room, with speaker notes.',
      classes: ['landing-page'],
      category: 'presentation',
      subvariant: 'demo',
      starter: { default: false },
    },
    {
      id: 'research',
      path: 'research',
      entry: 'report.md',
      title: 'Research synthesis example',
      description:
        'Research synthesis with a method partial, evidence map, comparison chart, tabs, and recommendation.',
      classes: ['research-report'],
      category: 'document',
      subvariant: 'research',
    },
    {
      id: 'architecture',
      path: 'architecture',
      entry: 'report.md',
      title: 'Architecture decision example',
      description:
        'Architecture decision packet with a local system map, alternatives, flow diagram, and rollout.',
      classes: ['architecture-report'],
      category: 'document',
      subvariant: 'architecture',
    },
    {
      id: 'code-review',
      path: 'code-review',
      entry: 'report.md',
      title: 'Code review',
      description:
        'Review of one change with a verdict, findings by severity, the unified diff, and the steps to merge.',
      classes: ['work-report'],
      category: 'document',
      subvariant: 'code-review',
    },
    {
      id: 'tutorial',
      path: 'tutorial',
      entry: 'report.md',
      title: 'Tutorial example',
      description:
        'Step-by-step learning page with tabs, progressive detail, code, and a bounded practice control.',
      classes: ['tutorial-with-code-and-bounded-demo'],
      category: 'document',
      subvariant: 'guide',
    },
    {
      id: 'dashboard',
      path: 'dashboard',
      entry: 'report.md',
      title: 'Dashboard starter',
      description:
        'Operational dashboard with scan-friendly cards, charts, filtering, and optional detail.',
      classes: ['work-report'],
      category: 'dashboard',
      subvariant: 'metrics',
      starter: { default: false },
    },
    {
      id: 'landing',
      path: 'landing',
      entry: 'report.md',
      title: 'Landing page starter',
      description:
        'Focused product narrative with benefits, proof, delivery milestones, and contextual detail.',
      classes: ['landing-page'],
      category: 'landing',
      subvariant: 'product',
      starter: { default: false },
    },
    {
      id: 'layout-document',
      path: 'layout-document',
      entry: 'report.md',
      title: 'Document layout example',
      description:
        'Long-form report with persistent contents, decisions, table, code, and local media.',
      classes: ['architecture-report'],
      category: 'document',
      subvariant: 'architecture',
    },
    {
      id: 'layout-dashboard',
      path: 'layout-dashboard',
      entry: 'report.md',
      title: 'Dashboard layout example',
      description:
        'Wide operational summary using dense cards, callouts, a table, and compact navigation.',
      classes: ['work-report'],
      category: 'dashboard',
      subvariant: 'statuses',
    },
    {
      id: 'layout-landing',
      path: 'layout-landing',
      entry: 'report.md',
      title: 'Landing layout example',
      description:
        'Focused product narrative with a spacious hero, benefits, proof, and next steps.',
      classes: ['landing-page'],
      category: 'landing',
      subvariant: 'product',
    },
    {
      id: 'layout-mixed',
      path: 'layout-mixed',
      entry: 'report.md',
      title: 'Complete visual language catalog',
      description:
        'Bilingual catalog covering the complete composition, media, surface, motion, and responsive vocabulary.',
      classes: ['research-report'],
      category: 'landing',
      subvariant: 'showcase',
    },
    {
      id: 'interactive-catalog',
      path: 'interactive-catalog',
      entry: 'report.md',
      title: 'Interactive component catalog',
      description:
        'Declarative glossary, disclosure, tabs, overlays, filtering, toggles, and a bounded demo.',
      classes: ['interactive-component-catalog'],
      category: 'document',
      subvariant: 'guide',
    },
    {
      id: 'review-workspace',
      path: 'review-workspace',
      entry: 'report.md',
      title: 'Human review handoff example',
      description:
        'Offline report with repeated evidence blocks for fragment threads, user/agent messages, resolution, and deterministic review export.',
      classes: ['work-report'],
      category: 'document',
      subvariant: 'report',
    },
    {
      id: 'response-workspace',
      path: 'response-workspace',
      entry: 'report.md',
      title: 'Structured reader response workspace',
      description:
        'Offline response form covering bucket, per-item choices, ordering, scoring, text, comments, import, and deterministic export.',
      classes: ['work-report', 'structured-response-handoff'],
      category: 'answer',
      subvariant: 'survey',
    },
    {
      id: 'question-review',
      path: 'question-review',
      entry: 'report.md',
      title: 'Open questions with context and answers',
      description:
        'Three open decisions, each with its context and options, and one form that collects the answers for the team that asked.',
      classes: ['structured-response-handoff'],
      category: 'answer',
      subvariant: 'questions',
    },
    {
      id: 'visualization-catalog',
      path: 'visualization-catalog',
      entry: 'report.md',
      title: 'Declarative visualization catalog',
      description:
        'Validated bar, line, and pie charts, a directed flow diagram, and a semantic timeline.',
      classes: ['data-visualization-catalog'],
      category: 'dashboard',
      subvariant: 'charts',
    },
    {
      id: 'incident-review',
      path: 'incident-review',
      entry: 'report.md',
      title: 'Service incident command review',
      description:
        'Fictional P1 incident review with impact metrics, causal evidence, recovery timeline, and accountable follow-up.',
      classes: ['work-report', 'incident-response-showcase'],
      category: 'document',
      subvariant: 'incident',
    },
    {
      id: 'vendor-decision',
      path: 'vendor-decision',
      entry: 'report.md',
      title: 'AI support vendor decision packet',
      description:
        'Fictional procurement decision separating hard security gates, weighted evidence, and conditional adoption.',
      classes: ['research-report', 'vendor-governance-showcase'],
      category: 'answer',
      subvariant: 'choice',
    },
    {
      id: 'launch-readiness',
      path: 'launch-readiness',
      entry: 'report.md',
      title: 'Regional beta launch readiness',
      description:
        'Fictional launch brief combining audience value, funnel evidence, operational gates, and a reversible rollout.',
      classes: ['landing-page', 'launch-readiness-showcase'],
      category: 'landing',
      subvariant: 'launch',
    },
    {
      id: 'executive-brief',
      path: 'executive-brief',
      entry: 'report.md',
      title: 'Executive decision brief',
      description:
        'Decision narrative with a staged opening, evidence field, operating path, and finished handoff.',
      classes: ['work-report', 'executive-brief-showcase'],
      category: 'document',
      subvariant: 'report',
    },
    {
      id: 'motion-showcase',
      path: 'motion-showcase',
      entry: 'report.md',
      title: 'Motion and depth showcase',
      description:
        'Motion demonstration of scroll scenes, reveal, choreography, depth, tilt, and reduced-motion fallback.',
      classes: ['landing-page', 'motion-showcase'],
      category: 'landing',
      subvariant: 'showcase',
    },
    {
      id: 'terminal-portfolio',
      path: 'terminal-portfolio',
      entry: 'report.md',
      title: 'Terminal field notes',
      description:
        'Console-led systems portfolio with prompt rhythm, linked work, an operating log, and a reproducible handoff.',
      classes: ['landing-page', 'terminal-portfolio-showcase'],
      category: 'landing',
      subvariant: 'portfolio',
    },
    {
      id: 'cinematic-story',
      path: 'cinematic-story',
      entry: 'report.md',
      title: 'Image-first field story',
      description:
        'Local-media visual essay with a staged hero, scroll narrative, image rail, and measured summary.',
      classes: ['landing-page', 'cinematic-story-showcase'],
      category: 'landing',
      subvariant: 'showcase',
    },
    {
      id: 'run-report',
      path: 'run-report',
      entry: 'report.md',
      title: 'Run report from a JSON export',
      description:
        'Bilingual run report whose numbers, stage cards, chart points and table rows come from one JSON file, with control values, number agreement, a dated source line and an illustrative notification.',
      classes: ['work-report'],
      category: 'document',
      subvariant: 'report',
    },
    {
      id: 'capability-tour',
      path: 'capability-tour',
      entry: 'report.md',
      title: 'Every technique on one station network',
      description:
        'Bilingual guide that follows a fictional weather-station network through a season, one technique per chapter with its Markdown under the result: data from JSON, tables as cards, full-screen viewer, statuses and returns, zoom, a played scene, a scroll scene, a loupe, a film, a brand theme, a companion page in layout screens and an edition pair built with --since.',
      classes: ['tutorial-with-code-and-bounded-demo', 'capability-tour'],
      category: 'document',
      subvariant: 'guide',
    },
  ],
} as const satisfies AuthoringRegistryDefinition;

export type AuthoringRegistry = typeof authoringRegistry;
export type DirectiveName = AuthoringRegistry['directives'][number]['name'];
