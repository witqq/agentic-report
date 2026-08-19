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

export const PAGE_TOKEN_FIELDS = [
  {
    name: 'density',
    description: 'Controls the shared spacing rhythm and control padding.',
    required: false,
    default: 'comfortable',
    constraint: { kind: 'enum', values: ['compact', 'comfortable', 'spacious'] },
  },
  {
    name: 'font',
    description: 'Selects the package-owned typography stack.',
    required: false,
    default: 'sans',
    constraint: { kind: 'enum', values: ['sans', 'serif', 'mono'] },
  },
  {
    name: 'accent',
    description: 'Selects the accent and visible-focus color family.',
    required: false,
    default: 'indigo',
    constraint: { kind: 'enum', values: ['indigo', 'teal', 'coral'] },
  },
  {
    name: 'width',
    description: 'Controls the maximum shell and reading width.',
    required: false,
    default: 'standard',
    constraint: { kind: 'enum', values: ['narrow', 'standard', 'wide'] },
  },
  {
    name: 'radius',
    description: 'Controls the shared corner treatment for surfaces and controls.',
    required: false,
    default: 'soft',
    constraint: { kind: 'enum', values: ['sharp', 'soft', 'round'] },
  },
] as const;

export const PAGE_PRESETS = [
  {
    name: 'studio',
    description:
      'Balanced product storytelling with a generous sans-serif rhythm and restrained depth.',
    tokens: {
      density: 'comfortable',
      font: 'sans',
      accent: 'indigo',
      width: 'standard',
      radius: 'soft',
    },
  },
  {
    name: 'editorial',
    description:
      'Long-form decision reading with serif typography, measured width, and quiet surfaces.',
    tokens: {
      density: 'spacious',
      font: 'serif',
      accent: 'coral',
      width: 'narrow',
      radius: 'soft',
    },
  },
  {
    name: 'signal',
    description:
      'Dense operational evidence with compact spacing, broad tracks, and crisp controls.',
    tokens: {
      density: 'compact',
      font: 'sans',
      accent: 'teal',
      width: 'wide',
      radius: 'sharp',
    },
  },
] as const;

export const PAGE_PRESET_NAMES = PAGE_PRESETS.map((preset) => preset.name) as unknown as readonly [
  'studio',
  'editorial',
  'signal',
];

export const PAGE_CONTRACT = {
  defaultPreset: 'studio',
  presets: PAGE_PRESETS,
  defaultLayout: 'document',
  layouts: ['document', 'dashboard', 'landing', 'mixed'],
  defaultTheme: 'system',
  themes: ['system', 'light', 'dark'],
  tokens: PAGE_TOKEN_FIELDS,
} as const;

export type LayoutChoice = (typeof PAGE_CONTRACT.layouts)[number];
export type ThemeChoice = (typeof PAGE_CONTRACT.themes)[number];
export type PresetChoice = (typeof PAGE_PRESET_NAMES)[number];

export type ConstraintDefinition =
  | {
      readonly kind: 'string';
      readonly normalization: 'trim';
      readonly minLength: number;
      readonly maxLength?: number;
      readonly pattern?: string;
      readonly format?: 'relative-local-path';
    }
  | {
      readonly kind: 'integer';
      readonly minimum?: number;
      readonly maximum?: number;
      readonly lexicalPattern?: string;
    }
  | {
      readonly kind: 'number';
      readonly minimum?: number;
      readonly maximum?: number;
      readonly multipleOf?: number;
      readonly lexicalPattern?: string;
    }
  | { readonly kind: 'enum'; readonly values: readonly string[] };

interface FieldDefinitionBase {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultVisibility?: 'published' | 'normalization-only';
}

export interface ScalarFieldDefinition extends FieldDefinitionBase {
  readonly default?: string | number;
  readonly constraint: ConstraintDefinition;
  readonly fields?: never;
}

export interface ObjectFieldDefinition extends FieldDefinitionBase {
  readonly default?: Readonly<Record<string, unknown>>;
  readonly constraint?: never;
  readonly fields: readonly [FieldDefinition, ...FieldDefinition[]];
}

export type FieldDefinition = ScalarFieldDefinition | ObjectFieldDefinition;

export type DirectiveForm = 'container' | 'leaf' | 'text';
export type DirectiveAttributeDiagnosticCode =
  | 'INVALID_DIRECTIVE_ATTRIBUTE'
  | 'INVALID_DIRECTIVE_LINK'
  | 'INVALID_DIRECTIVE_PATH'
  | 'INVALID_FONT_FAMILY';

export interface DirectiveAttributeDefinition {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string | number;
  readonly constraint: ConstraintDefinition;
  readonly renderProperty: string;
  readonly invalidDiagnostic: DirectiveAttributeDiagnosticCode;
}

export type RendererKey = 'semantic-container' | 'download-asset' | 'font-registration';
export type CapabilityHandoff = 'semantic-document' | 'resource-graph' | 'reader-runtime';

export interface DirectiveDefinition {
  readonly name: string;
  readonly description: string;
  readonly forms: readonly [DirectiveForm, ...DirectiveForm[]];
  readonly attributes: readonly DirectiveAttributeDefinition[];
  readonly children:
    | 'markdown'
    | 'markdown-and-card-directives'
    | 'markdown-and-tab-directives'
    | 'action-directives'
    | 'series-directives'
    | 'point-directives'
    | 'node-and-edge-directives'
    | 'event-directives'
    | 'label-or-generated-label'
    | 'none';
  readonly placement: {
    readonly requiredParent?: string;
    readonly preferredParent?: string;
    readonly topLevelOnly?: true;
  };
  readonly behavior: {
    readonly renderer: RendererKey;
    readonly resource: 'none' | 'download' | 'font';
    readonly runtime:
      | 'none'
      | 'native-disclosure'
      | 'glossary-reference'
      | 'package-owned-counter'
      | 'package-owned-tabs'
      | 'package-owned-modal'
      | 'package-owned-popover'
      | 'package-owned-filter'
      | 'package-owned-toggle';
  };
  readonly sanitizer: {
    readonly tagName: 'a' | 'article' | 'aside' | 'div' | 'section' | 'span';
    readonly className: string;
    readonly properties: readonly [string, ...string[]];
  };
  readonly security: {
    readonly authorCode: false;
    readonly rawHtml: false;
    readonly localResourceOnly: boolean;
  };
  readonly handoffs: readonly [CapabilityHandoff, ...CapabilityHandoff[]];
}

export interface ExampleDefinition {
  readonly id: string;
  readonly path: string;
  readonly entry: string;
  readonly title: string;
  readonly description: string;
  readonly classes: readonly [string, ...string[]];
  readonly starter?: {
    readonly default: boolean;
    readonly aliases?: readonly string[];
  };
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
      Record<'container' | 'nestedContainer' | 'leaf' | 'text', string>
    >;
    readonly resources: readonly [string, ...string[]];
  };
  readonly output: {
    readonly default: OutputFormatChoice;
    readonly formats: readonly [OutputFormatChoice, ...OutputFormatChoice[]];
    readonly runtimePlacement: Readonly<Record<OutputFormatChoice, RuntimePlacement>>;
  };
  readonly page: typeof PAGE_CONTRACT;
  readonly manifestFields: readonly [FieldDefinition, ...FieldDefinition[]];
  readonly directives: readonly [DirectiveDefinition, ...DirectiveDefinition[]];
  readonly capabilities: readonly [CapabilityDefinition, ...CapabilityDefinition[]];
  readonly commands: readonly [CommandDefinition, ...CommandDefinition[]];
  readonly examples: readonly [ExampleDefinition, ...ExampleDefinition[]];
}

const titleAttribute = {
  name: 'title',
  description: 'Visible title.',
  required: false,
  constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 200 },
  renderProperty: 'dataDirectiveTitle',
  invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
} as const satisfies DirectiveAttributeDefinition;

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
    },
    resources: ['local images', 'downloadable local assets', 'local fonts'],
  },
  output: OUTPUT_CONTRACT,
  page: PAGE_CONTRACT,
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
      name: 'preset',
      description:
        'Coordinated package-owned visual defaults; explicit bounded token values override the preset.',
      required: false,
      default: PAGE_CONTRACT.defaultPreset,
      constraint: { kind: 'enum', values: PAGE_PRESET_NAMES },
    },
    {
      name: 'theme',
      description: 'Initial document color theme.',
      required: false,
      default: PAGE_CONTRACT.defaultTheme,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.themes },
    },
    {
      name: 'layout',
      description: 'Responsive page composition selected from the package-owned layout catalog.',
      required: false,
      default: PAGE_CONTRACT.defaultLayout,
      constraint: { kind: 'enum', values: PAGE_CONTRACT.layouts },
    },
    {
      name: 'tokens',
      description: 'Compact package-owned visual token overrides; arbitrary CSS is not accepted.',
      required: false,
      defaultVisibility: 'normalization-only',
      default: Object.fromEntries(PAGE_TOKEN_FIELDS.map((token) => [token.name, token.default])),
      fields: PAGE_TOKEN_FIELDS,
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
          description: 'Warning threshold for bytes embedded into single-file output.',
          required: false,
          default: 5_000_000,
          constraint: { kind: 'integer', minimum: 1 },
        },
      ],
    },
  ],
  directives: [
    sectionDirective(),
    actionsDirective(),
    actionDirective(),
    {
      name: 'callout',
      description: 'Emphasized finding or notice containing Markdown.',
      forms: ['container'],
      attributes: [
        titleAttribute,
        {
          name: 'kind',
          description: 'Lowercase presentation token.',
          required: false,
          default: 'info',
          constraint: {
            kind: 'string',
            normalization: 'trim',
            minLength: 1,
            maxLength: 32,
            pattern: '^[a-z][a-z0-9-]{0,31}$',
          },
          renderProperty: 'dataKind',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
      ],
      children: 'markdown',
      placement: {},
      behavior: {
        renderer: 'semantic-container',
        resource: 'none',
        runtime: 'none',
      },
      sanitizer: {
        tagName: 'aside',
        className: 'semantic-callout',
        properties: ['dataSemantic', 'dataDirectiveTitle', 'dataKind'],
      },
      security: { authorCode: false, rawHtml: false, localResourceOnly: false },
      handoffs: ['semantic-document'],
    },
    ...semanticContainers(),
    ...interactiveDirectives(),
    ...visualizationDirectives(),
    {
      name: 'demo',
      description: 'Package-owned counter interaction; author code is never executed.',
      forms: ['container'],
      attributes: [
        titleAttribute,
        integerAttribute('start', 'Initial counter value.', 0),
        integerAttribute('step', 'Amount added per activation.', 1),
      ],
      children: 'markdown',
      placement: {},
      behavior: {
        renderer: 'semantic-container',
        resource: 'none',
        runtime: 'package-owned-counter',
      },
      sanitizer: {
        tagName: 'section',
        className: 'semantic-demo',
        properties: [
          'dataSemantic',
          'dataDirectiveTitle',
          'dataStart',
          'dataStep',
          'dataDemoCounter',
        ],
      },
      security: { authorCode: false, rawHtml: false, localResourceOnly: false },
      handoffs: ['semantic-document', 'reader-runtime'],
    },
    {
      name: 'asset',
      description: 'Download link to a confined local file.',
      forms: ['text', 'leaf'],
      attributes: [pathAttribute('src', 'Relative local resource path.', 'dataLocalAsset')],
      children: 'label-or-generated-label',
      placement: {},
      behavior: {
        renderer: 'download-asset',
        resource: 'download',
        runtime: 'none',
      },
      sanitizer: {
        tagName: 'a',
        className: 'semantic-asset',
        properties: ['dataLocalAsset', 'download'],
      },
      security: { authorCode: false, rawHtml: false, localResourceOnly: true },
      handoffs: ['resource-graph'],
    },
    {
      name: 'font',
      description:
        'Register a confined local font; the first declaration becomes the document font.',
      forms: ['leaf'],
      attributes: [
        pathAttribute('src', 'Relative local font path.', 'dataFontSource'),
        {
          name: 'family',
          description: 'CSS font family using letters, numbers, spaces, underscores, or hyphens.',
          required: true,
          constraint: {
            kind: 'string',
            normalization: 'trim',
            minLength: 1,
            maxLength: 80,
            pattern: '^[\\p{L}\\p{N} _-]{1,80}$',
          },
          renderProperty: 'dataFontFamily',
          invalidDiagnostic: 'INVALID_FONT_FAMILY',
        },
      ],
      children: 'none',
      placement: {},
      behavior: {
        renderer: 'font-registration',
        resource: 'font',
        runtime: 'none',
      },
      sanitizer: {
        tagName: 'span',
        className: 'semantic-font',
        properties: ['dataFontSource', 'dataFontFamily', 'hidden'],
      },
      security: { authorCode: false, rawHtml: false, localResourceOnly: true },
      handoffs: ['resource-graph'],
    },
  ],
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
    { id: 'build', description: 'Compile a source into a static artifact.' },
    { id: 'describe', description: 'Return the complete source contract.' },
    {
      id: 'schema',
      description: 'Return manifest, directive, or complete source JSON Schema.',
    },
    { id: 'examples', description: 'List packaged buildable examples.' },
  ],
  examples: [
    {
      id: 'basic',
      path: 'basic',
      entry: 'report.md',
      title: 'Report starter',
      description:
        'Decision-ready report with findings, evidence, a local asset, a timeline, and bounded interaction.',
      classes: ['report', 'work-report'],
      starter: { default: true, aliases: ['report'] },
    },
    {
      id: 'research',
      path: 'research',
      entry: 'report.md',
      title: 'Research starter',
      description:
        'Research synthesis with a method partial, evidence map, comparison chart, tabs, and recommendation.',
      classes: ['research-report'],
      starter: { default: false, aliases: [] },
    },
    {
      id: 'architecture',
      path: 'architecture',
      entry: 'report.md',
      title: 'Architecture starter',
      description:
        'Architecture decision packet with a local system map, alternatives, flow diagram, and rollout.',
      classes: ['architecture-report'],
      starter: { default: false, aliases: [] },
    },
    {
      id: 'tutorial',
      path: 'tutorial',
      entry: 'report.md',
      title: 'Tutorial starter',
      description:
        'Step-by-step learning page with tabs, progressive detail, code, and a bounded practice control.',
      classes: ['tutorial-with-code-and-bounded-demo'],
      starter: { default: false, aliases: [] },
    },
    {
      id: 'dashboard',
      path: 'dashboard',
      entry: 'report.md',
      title: 'Dashboard starter',
      description:
        'Operational dashboard with scan-friendly cards, charts, filtering, and optional detail.',
      classes: ['work-report'],
      starter: { default: false, aliases: [] },
    },
    {
      id: 'landing',
      path: 'landing',
      entry: 'report.md',
      title: 'Landing page starter',
      description:
        'Focused product narrative with benefits, proof, delivery milestones, and contextual detail.',
      classes: ['landing-page'],
      starter: { default: false, aliases: [] },
    },
    {
      id: 'layout-document',
      path: 'layout-document',
      entry: 'report.md',
      title: 'Document layout example',
      description:
        'Long-form report with persistent contents, decisions, table, code, and local media.',
      classes: ['architecture-report'],
    },
    {
      id: 'layout-dashboard',
      path: 'layout-dashboard',
      entry: 'report.md',
      title: 'Dashboard layout example',
      description:
        'Wide operational summary using dense cards, callouts, a table, and compact navigation.',
      classes: ['work-report'],
    },
    {
      id: 'layout-landing',
      path: 'layout-landing',
      entry: 'report.md',
      title: 'Landing layout example',
      description:
        'Focused product narrative with a spacious hero, benefits, proof, and next steps.',
      classes: ['landing-page'],
    },
    {
      id: 'layout-mixed',
      path: 'layout-mixed',
      entry: 'report.md',
      title: 'Mixed layout example',
      description: 'Research brief combining long-form narrative with wide card and data sections.',
      classes: ['research-report'],
    },
    {
      id: 'interactive-catalog',
      path: 'interactive-catalog',
      entry: 'report.md',
      title: 'Interactive component catalog',
      description:
        'Declarative glossary, disclosure, tabs, overlays, filtering, toggles, and a bounded demo.',
      classes: ['interactive-component-catalog'],
    },
    {
      id: 'visualization-catalog',
      path: 'visualization-catalog',
      entry: 'report.md',
      title: 'Declarative visualization catalog',
      description:
        'Validated bar, line, and pie charts, a directed flow diagram, and a semantic timeline.',
      classes: ['data-visualization-catalog'],
    },
    {
      id: 'incident-review',
      path: 'incident-review',
      entry: 'report.md',
      title: 'Service incident command review',
      description:
        'Fictional P1 incident review with impact metrics, causal evidence, recovery timeline, and accountable follow-up.',
      classes: ['work-report', 'incident-response-showcase'],
    },
    {
      id: 'vendor-decision',
      path: 'vendor-decision',
      entry: 'report.md',
      title: 'AI support vendor decision packet',
      description:
        'Fictional procurement decision separating hard security gates, weighted evidence, and conditional adoption.',
      classes: ['research-report', 'vendor-governance-showcase'],
    },
    {
      id: 'launch-readiness',
      path: 'launch-readiness',
      entry: 'report.md',
      title: 'Regional beta launch readiness',
      description:
        'Fictional launch brief combining audience value, funnel evidence, operational gates, and a reversible rollout.',
      classes: ['landing-page', 'launch-readiness-showcase'],
    },
  ],
} as const satisfies AuthoringRegistryDefinition;

export type AuthoringRegistry = typeof authoringRegistry;
export type DirectiveName = AuthoringRegistry['directives'][number]['name'];

function semanticContainers() {
  return [
    container('decision', 'Decision or product-development branch containing Markdown.'),
    container('cards', 'Responsive grid, normally containing card directives.', {
      handoffs: ['semantic-document'],
    }),
    container('card', 'One semantic card containing Markdown.', {
      tagName: 'article',
      requiredParent: 'cards',
      preferredParent: 'cards',
      handoffs: ['semantic-document'],
    }),
    container(
      'steps',
      'Process or tutorial sequence containing Markdown, normally an ordered list.',
      {
        handoffs: ['semantic-document'],
      },
    ),
  ] as const;
}

function sectionDirective(): DirectiveDefinition {
  const attributes = [
    requiredTitleAttribute(),
    optionalIdentityAttribute('id', 'Optional stable section anchor.'),
    textAttribute('nav', 'Optional short primary-navigation label.', false),
    enumAttribute('width', 'Section content track.', ['reading', 'standard', 'wide'], 'standard'),
    enumAttribute('align', 'Section content alignment.', ['start', 'center'], 'start'),
    enumAttribute(
      'tone',
      'Package-owned section surface tone.',
      ['plain', 'soft', 'accent', 'contrast'],
      'plain',
    ),
  ] as const;
  return {
    name: 'section',
    description: 'Labelled top-level page section containing Markdown.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: { topLevelOnly: true },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-section',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function actionsDirective(): DirectiveDefinition {
  return {
    name: 'actions',
    description: 'Responsive group containing ordinary action links.',
    forms: ['container'],
    attributes: [],
    children: 'action-directives',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-actions',
      properties: ['dataSemantic'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function actionDirective(): DirectiveDefinition {
  const attributes = [
    linkAttribute(),
    enumAttribute(
      'kind',
      'Package-owned action emphasis.',
      ['primary', 'secondary', 'quiet'],
      'primary',
    ),
  ] as const;
  return {
    name: 'action',
    description: 'Ordinary safe link inside an actions group.',
    forms: ['leaf'],
    attributes,
    children: 'label-or-generated-label',
    placement: { requiredParent: 'actions' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'a',
      className: 'semantic-action',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function interactiveDirectives(): readonly DirectiveDefinition[] {
  return [
    interactiveContainer('glossary', 'Reusable glossary definition containing Markdown.', {
      attributes: [
        keyAttribute('Stable glossary definition key.'),
        textAttribute('term', 'Canonical term text inserted at every reference.', true),
      ],
      runtime: 'none',
    }),
    {
      name: 'term',
      description: 'Inline or standalone reference that opens a registered glossary explanation.',
      forms: ['leaf', 'text'],
      attributes: [keyAttribute('Key of the glossary definition to reference.')],
      children: 'label-or-generated-label',
      placement: {},
      behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'glossary-reference' },
      sanitizer: {
        tagName: 'span',
        className: 'semantic-term',
        properties: ['dataSemantic', 'dataKey'],
      },
      security: { authorCode: false, rawHtml: false, localResourceOnly: false },
      handoffs: ['semantic-document', 'reader-runtime'],
    },
    interactiveContainer('disclosure', 'Native disclosure with a visible summary.', {
      attributes: [
        requiredTitleAttribute(),
        enumAttribute('open', 'Initial disclosure state.', ['false', 'true'], 'false'),
      ],
      runtime: 'native-disclosure',
    }),
    interactiveContainer('tabs', 'Keyboard-operable group of tab panels.', {
      attributes: [titleAttribute],
      children: 'markdown-and-tab-directives',
      runtime: 'package-owned-tabs',
    }),
    interactiveContainer('tab', 'One labelled panel inside tabs.', {
      attributes: [textAttribute('label', 'Visible tab label.', true)],
      requiredParent: 'tabs',
      runtime: 'package-owned-tabs',
    }),
    interactiveContainer('modal', 'Modal dialog opened by a package-owned control.', {
      attributes: [
        requiredTitleAttribute(),
        textAttribute('trigger', 'Visible dialog trigger label.', false, 'Open dialog'),
      ],
      runtime: 'package-owned-modal',
    }),
    interactiveContainer(
      'popover',
      'Non-modal contextual panel opened by a package-owned control.',
      {
        attributes: [
          requiredTitleAttribute(),
          textAttribute('trigger', 'Visible popover trigger label.', false, 'Show details'),
        ],
        runtime: 'package-owned-popover',
      },
    ),
    interactiveContainer('filter', 'Client-side text filter for authored list items.', {
      attributes: [
        titleAttribute,
        textAttribute('placeholder', 'Search-field placeholder.', false, 'Filter items'),
      ],
      runtime: 'package-owned-filter',
    }),
    interactiveContainer('toggle', 'Switch controlling visibility of declarative content.', {
      attributes: [
        titleAttribute,
        textAttribute('label', 'Visible switch label.', true),
        enumAttribute('default', 'Initial switch state.', ['off', 'on'], 'off'),
      ],
      runtime: 'package-owned-toggle',
    }),
  ];
}

function visualizationDirectives(): readonly DirectiveDefinition[] {
  return [
    visualizationContainer(
      'chart',
      'Responsive bar, line, or pie chart rendered at compile time.',
      {
        attributes: [
          requiredTitleAttribute(),
          descriptionAttribute(),
          enumAttribute('type', 'Chart form.', ['bar', 'line', 'pie'], 'bar'),
          textAttribute('x-label', 'Horizontal-axis label.', false),
          textAttribute('y-label', 'Vertical-axis label.', false),
        ],
        children: 'series-directives',
      },
    ),
    visualizationContainer('series', 'One named chart series containing data points.', {
      attributes: [textAttribute('label', 'Legend label.', true)],
      children: 'point-directives',
      requiredParent: 'chart',
      tagName: 'section',
    }),
    visualizationContainer('point', 'One labelled numeric value in a chart series.', {
      attributes: [
        textAttribute('label', 'Category label.', true),
        numberAttribute('value', 'Finite numeric value between -999999999 and 999999999.'),
      ],
      children: 'none',
      requiredParent: 'series',
      tagName: 'span',
      forms: ['leaf'],
    }),
    visualizationContainer('diagram', 'Directed flow diagram rendered as deterministic SVG.', {
      attributes: [
        requiredTitleAttribute(),
        descriptionAttribute(),
        enumAttribute('direction', 'Flow direction.', ['right', 'down'], 'right'),
      ],
      children: 'node-and-edge-directives',
    }),
    visualizationContainer('node', 'One labelled node in a flow diagram.', {
      attributes: [
        identityAttribute('id', 'Unique node identity within the diagram.'),
        textAttribute('label', 'Visible node label.', true),
        enumAttribute(
          'kind',
          'Package-owned node emphasis.',
          ['neutral', 'accent', 'success', 'warning'],
          'neutral',
        ),
      ],
      children: 'none',
      requiredParent: 'diagram',
      tagName: 'span',
      forms: ['leaf'],
    }),
    visualizationContainer('edge', 'One directed connection between diagram nodes.', {
      attributes: [
        identityAttribute('from', 'Source node identity.'),
        identityAttribute('to', 'Target node identity.'),
        textAttribute('label', 'Optional connection label.', false),
      ],
      children: 'none',
      requiredParent: 'diagram',
      tagName: 'span',
      forms: ['leaf'],
    }),
    visualizationContainer('timeline', 'Semantic chronological sequence with bounded events.', {
      attributes: [requiredTitleAttribute(), descriptionAttribute()],
      children: 'event-directives',
    }),
    visualizationContainer('event', 'One dated timeline event with optional Markdown detail.', {
      attributes: [
        textAttribute('date', 'Visible date or phase label.', true),
        requiredTitleAttribute(),
        enumAttribute(
          'kind',
          'Package-owned event emphasis.',
          ['neutral', 'accent', 'success', 'warning'],
          'neutral',
        ),
      ],
      children: 'markdown',
      requiredParent: 'timeline',
    }),
  ];
}

function visualizationContainer(
  name: 'chart' | 'series' | 'point' | 'diagram' | 'node' | 'edge' | 'timeline' | 'event',
  description: string,
  options: {
    readonly attributes: readonly DirectiveAttributeDefinition[];
    readonly children: DirectiveDefinition['children'];
    readonly requiredParent?: string;
    readonly tagName?: 'section' | 'span';
    readonly forms?: readonly [DirectiveForm, ...DirectiveForm[]];
  },
): DirectiveDefinition {
  return {
    name,
    description,
    forms: options.forms ?? ['container'],
    attributes: options.attributes,
    children: options.children,
    placement:
      options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: options.tagName ?? 'section',
      className: `semantic-${name}`,
      properties: [
        'dataSemantic',
        ...options.attributes.map((attribute) => attribute.renderProperty),
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function interactiveContainer(
  name: 'glossary' | 'disclosure' | 'tabs' | 'tab' | 'modal' | 'popover' | 'filter' | 'toggle',
  description: string,
  options: {
    readonly attributes: readonly DirectiveAttributeDefinition[];
    readonly children?: DirectiveDefinition['children'];
    readonly requiredParent?: string;
    readonly runtime: DirectiveDefinition['behavior']['runtime'];
  },
): DirectiveDefinition {
  return {
    name,
    description,
    forms: ['container'],
    attributes: options.attributes,
    children: options.children ?? 'markdown',
    placement:
      options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: options.runtime },
    sanitizer: {
      tagName: 'section',
      className: `semantic-${name}`,
      properties: [
        'dataSemantic',
        ...options.attributes.map((attribute) => attribute.renderProperty),
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function requiredTitleAttribute(): DirectiveAttributeDefinition {
  return { ...titleAttribute, required: true };
}

function keyAttribute(description: string): DirectiveAttributeDefinition {
  return identityAttribute('key', description);
}

function identityAttribute(
  name: 'key' | 'id' | 'from' | 'to',
  description: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-z][a-z0-9-]{0,63}$',
    },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function optionalIdentityAttribute(name: 'id', description: string): DirectiveAttributeDefinition {
  return { ...identityAttribute(name, description), required: false };
}

function linkAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'href',
    description:
      'Safe same-page, relative, HTTP(S), or email link target; executable and local-file schemes are rejected.',
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 500,
      pattern:
        '^(?:#[A-Za-z][A-Za-z0-9_-]{0,127}|https?://[^\\s<>]+|mailto:[^\\s<>]+|(?!(?:[A-Za-z][A-Za-z0-9+.-]*:|//|/))[A-Za-z0-9.][^\\s<>\\\\]*)$',
    },
    renderProperty: 'dataHref',
    invalidDiagnostic: 'INVALID_DIRECTIVE_LINK',
  };
}

function descriptionAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'description',
    description: 'Meaningful plain-text description for the visual.',
    required: true,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
    renderProperty: 'dataDescription',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function numberAttribute(name: 'value', description: string): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: {
      kind: 'number',
      minimum: -999_999_999,
      maximum: 999_999_999,
      multipleOf: 0.0001,
      lexicalPattern: '^-?(?:0|[1-9]\\d{0,8})(?:\\.\\d{1,4})?$',
    },
    renderProperty: 'dataValue',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function textAttribute(
  name: string,
  description: string,
  required: boolean,
  defaultValue?: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 160 },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function attributeRenderProperty(name: string): string {
  return `data${name
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')}`;
}

function enumAttribute(
  name: string,
  description: string,
  values: readonly [string, ...string[]],
  defaultValue: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    default: defaultValue,
    constraint: { kind: 'enum', values },
    renderProperty: `data${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`,
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function container<const Name extends 'decision' | 'cards' | 'card' | 'steps'>(
  name: Name,
  description: string,
  options: {
    readonly tagName?: 'article' | 'section';
    readonly requiredParent?: string;
    readonly preferredParent?: string;
    readonly handoffs?: readonly ['semantic-document', ...'semantic-document'[]];
  } = {},
): DirectiveDefinition & { readonly name: Name } {
  return {
    name,
    description,
    forms: ['container'],
    attributes: [titleAttribute],
    children: name === 'cards' ? 'markdown-and-card-directives' : 'markdown',
    placement: {
      ...(options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent }),
      ...(options.preferredParent === undefined
        ? {}
        : { preferredParent: options.preferredParent }),
    },
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'none',
    },
    sanitizer: {
      tagName: options.tagName ?? 'section',
      className: `semantic-${name}`,
      properties: ['dataSemantic', 'dataDirectiveTitle'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: options.handoffs ?? ['semantic-document'],
  };
}

function integerAttribute(
  name: 'start' | 'step',
  description: string,
  defaultValue: number,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    default: defaultValue,
    constraint: {
      kind: 'integer',
      minimum: -999_999,
      maximum: 999_999,
      lexicalPattern: '^-?\\d{1,6}$',
    },
    renderProperty: name === 'start' ? 'dataStart' : 'dataStep',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

function pathAttribute(
  name: 'src',
  description: string,
  renderProperty: 'dataLocalAsset' | 'dataFontSource',
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 200,
      format: 'relative-local-path',
    },
    renderProperty,
    invalidDiagnostic: 'INVALID_DIRECTIVE_PATH',
  };
}
