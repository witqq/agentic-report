/**
 * The directive grammar vocabulary: the shape of a directive definition and the closed value sets
 * that block definitions read. It imports nothing from the registry or the blocks, so block modules
 * can depend on it while the registry assembles its directive list from those modules.
 */

export const SECTION_RECIPES = [
  {
    name: 'none',
    description: 'No high-level recipe; use the compatible detailed section defaults.',
    attributes: {},
  },
  {
    name: 'hero',
    description:
      'Staged opening with display type and broad cinematic media that eases as the page scrolls; shown at once, without an entrance.',
    attributes: {
      width: 'wide',
      composition: 'stage',
      viewport: 'full',
      'section-density': 'immersive',
      type: 'display',
      media: 'bleed',
      'media-fit': 'cover',
      'media-aspect': 'cinematic',
      scene: 'progress',
    },
  },
  {
    name: 'evidence',
    description:
      'Readable split evidence with bounded media beside its opening; the picture is proof, so it is shown whole, never masked or cropped.',
    attributes: {
      width: 'wide',
      composition: 'split',
      viewport: 'bounded',
    },
  },
  {
    name: 'story',
    description: 'Long-form scroll story with sticky narrative rhythm and progressive media.',
    attributes: {
      width: 'wide',
      composition: 'story',
      'section-density': 'immersive',
      type: 'editorial',
      media: 'bleed',
      'media-fit': 'cover',
      'media-aspect': 'cinematic',
      transition: 'reveal',
      scene: 'progress',
    },
  },
  {
    name: 'rail',
    description: 'Horizontal visual rail with broad gallery media.',
    attributes: {
      width: 'wide',
      composition: 'stage',
      'section-density': 'immersive',
      media: 'gallery',
      'media-fit': 'cover',
      'media-aspect': 'landscape',
    },
  },
  {
    name: 'metrics',
    description: 'Compact data field with a responsive mosaic on a faint grid.',
    attributes: {
      width: 'wide',
      composition: 'mosaic',
      'section-density': 'compact',
      surface: 'grid',
    },
  },
  {
    name: 'thesis',
    description:
      'One large claim in display type at reading width with its lead paragraph and no media: the argument before the evidence.',
    attributes: {
      width: 'reading',
      'section-density': 'immersive',
      type: 'display',
      transition: 'reveal',
    },
  },
  {
    name: 'statement',
    description:
      'One quote or one figure per screen: centered display type filling the viewport, with its attribution or caption below.',
    attributes: {
      width: 'standard',
      align: 'center',
      viewport: 'full',
      'section-density': 'immersive',
      type: 'display',
      transition: 'reveal',
    },
  },
  {
    name: 'blueprint',
    description:
      'Technical-drawing language: a drafting grid behind a hairline panel, text beside the drawing, labels set like annotations.',
    attributes: {
      width: 'wide',
      composition: 'split',
      surface: 'blueprint',
      frame: 'panel',
    },
  },
  {
    name: 'demo',
    description:
      'The product as the first screen: the first section, shown beside the page title as a framed result, code beside a result, a diagram or a clip.',
    attributes: {
      width: 'wide',
      place: 'opening',
      'section-density': 'compact',
      frame: 'panel',
    },
  },
] as const;

export const SECTION_RECIPE_NAMES = SECTION_RECIPES.map(
  (recipe) => recipe.name,
) as unknown as readonly [
  'none',
  'hero',
  'evidence',
  'story',
  'rail',
  'metrics',
  'thesis',
  'statement',
  'blueprint',
  'demo',
];

export function sectionRecipeDefaults(
  recipeName: string | undefined,
): Readonly<Record<string, string>> {
  const recipe = SECTION_RECIPES.find((candidate) => candidate.name === (recipeName ?? 'none'));
  if (recipe === undefined) return {};
  return recipe.attributes;
}

export const DIAGRAM_CONTRACT = {
  defaultType: 'flow',
  types: ['flow', 'sequence'],
  /**
   * Closed set of connection meanings. Each one has its own line and arrowhead drawn by the package,
   * so the author names what a connection means and cannot restyle it.
   */
  edgeKinds: ['call', 'data', 'event', 'dependency'],
  defaultEdgeKind: 'call',
  /** Node emphasis has no meaning of its own: the author names it with a legend item. */
  nodeKinds: ['neutral', 'accent', 'success', 'warning'],
  /**
   * Where a step of a process stands. Unlike an emphasis, a status has a package meaning and a
   * package word, so its legend entry appears without the author naming it; it is drawn in the
   * theme's status roles and marked with a glyph that reads without colour.
   */
  nodeStatuses: ['done', 'review', 'returned', 'pending'],
  /** How many times a connection was taken, written «×N» on it: a return repeated, a retry. */
  edgeCount: { minimum: 1, maximum: 999 },
  /** One node of a flow may open into a nested flow the camera flies into. */
  zoom: { maximumPerDiagram: 1 },
  /** A pulse route names consecutive nodes joined by connections. */
  pulse: { minimumNodes: 2, maximumNodes: 12 },
  /**
   * A legend of the edge kinds present appears as soon as one diagram mixes two or more kinds.
   * `legend` and `legend-item` rename, add, or hide entries and title the legend.
   */
  edgeKindLegend: { minimumKinds: 2 },
  legend: { maximumPerDiagram: 1, maximumItems: 8 },
  flow: {
    nodes: { minimum: 1, maximum: 20 },
    edges: { maximum: 40 },
    /** A connection from a node to itself — a step that repeats — is drawn as a loop on its corner. */
    selfEdges: true,
    /**
     * Every flow ships three views: layered top-down, layered left-to-right, and orthogonal
     * (right-angle routes by ELK); readers switch between them. `layout` names the one shown first
     * and printed; `auto` picks the view with the fewest crossings that reads largest on the page.
     */
    layouts: ['auto', 'down', 'right', 'orthogonal'],
    directions: ['auto', 'right', 'down'],
    groups: {
      maximum: 5,
      minimumMembers: 1,
      requireEveryNode: false,
    },
  },
  sequence: {
    participants: { minimum: 2, maximum: 6 },
    messages: { minimum: 1, maximum: 40, labelRequired: true },
    groups: false,
    participantGroups: false,
    direction: 'forbidden',
    selfMessages: true,
  },
} as const;
export type DiagramTypeChoice = (typeof DIAGRAM_CONTRACT.types)[number];
export type DiagramEdgeKindChoice = (typeof DIAGRAM_CONTRACT.edgeKinds)[number];

export type ConstraintDefinition =
  | {
      readonly kind: 'string';
      readonly normalization: 'trim';
      readonly minLength: number;
      readonly maxLength?: number;
      readonly pattern?: string;
      readonly format?: 'relative-local-path' | 'absolute-http-url';
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
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  /**
   * Тема страницы: имя встроенной темы, относительный путь к файлу темы (`.yaml`, `.yml`, `.json`)
   * или сама тема объектом. Поля объекта и файла — один договор `THEME_FIELDS`.
   */
  | { readonly kind: 'theme-reference' }
  /**
   * Список относительных путей внутри корня источника: каждый элемент — тот же относительный путь, что
   * у частей и ресурсов, без повторов.
   */
  | { readonly kind: 'local-path-list'; readonly minItems: number; readonly maxItems: number };

export const REGISTRY_IDENTITY_CONSTRAINT = {
  kind: 'string',
  normalization: 'trim',
  minLength: 1,
  maxLength: 64,
  pattern: '^[a-z][a-z0-9-]{0,63}$',
} as const satisfies ConstraintDefinition;

export type DirectiveForm = 'container' | 'leaf' | 'text';
export type DirectiveAttributeDiagnosticCode =
  | 'INVALID_DIRECTIVE_ATTRIBUTE'
  | 'INVALID_DIRECTIVE_LINK'
  | 'INVALID_SOURCE_LINK'
  | 'INVALID_DIRECTIVE_PATH'
  | 'INVALID_FONT_FAMILY';

export interface DirectiveAttributeDefinition {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string | number | boolean;
  readonly constraint: ConstraintDefinition;
  readonly renderProperty: string;
  readonly invalidDiagnostic: DirectiveAttributeDiagnosticCode;
}

export interface DirectiveIncompatibleCombinationDefinition {
  readonly attributes: Readonly<Record<string, readonly [string, ...string[]]>>;
  readonly message: string;
  readonly remediation: string;
}

export type RendererKey =
  'semantic-container' | 'download-asset' | 'font-registration' | 'embedded-video';
export type CapabilityHandoff = 'semantic-document' | 'resource-graph' | 'reader-runtime';

export interface DirectiveDefinition {
  readonly name: string;
  readonly description: string;
  readonly forms: readonly [DirectiveForm, ...DirectiveForm[]];
  readonly attributes: readonly DirectiveAttributeDefinition[];
  readonly incompatibleCombinations?: readonly DirectiveIncompatibleCombinationDefinition[];
  readonly children:
    | 'markdown'
    | 'decision-option-directives'
    | 'check-item-directives'
    | 'markdown-and-card-directives'
    | 'markdown-and-tab-directives'
    | 'markdown-and-term-directives'
    | 'action-directives'
    | 'series-directives'
    | 'point-directives'
    | 'node-and-edge-directives'
    | 'diagram-part-directives'
    | 'zoom-part-directives'
    | 'event-directives'
    | 'response-question-directives'
    | 'response-field-directives'
    | 'finding-directives'
    | 'message-directives'
    | 'slide-directives'
    | 'label-or-generated-label'
    | 'none';
  readonly placement: {
    readonly requiredParent?: string | readonly [string, ...string[]];
    readonly preferredParent?: string;
    readonly topLevelOnly?: true;
  };
  readonly behavior: {
    readonly renderer: RendererKey;
    readonly resource: 'none' | 'download' | 'font' | 'video';
    readonly runtime:
      | 'none'
      | 'native-disclosure'
      | 'glossary-reference'
      | 'package-owned-counter'
      | 'package-owned-tabs'
      | 'package-owned-modal'
      | 'package-owned-popover'
      | 'package-owned-filter'
      | 'package-owned-toggle'
      | 'package-owned-compare'
      | 'package-owned-scene'
      | 'package-owned-count'
      | 'package-owned-typography'
      | 'package-owned-spotlight'
      | 'package-owned-slides'
      | 'package-owned-response'
      | 'package-owned-copy';
  };
  readonly sanitizer: {
    readonly tagName: 'a' | 'article' | 'aside' | 'div' | 'figure' | 'nav' | 'section' | 'span';
    readonly className: string;
    readonly properties: readonly [string, ...string[]];
  };
  readonly security: {
    /**
     * Built-in directives never carry author code. Only a page's own extension directives may: the
     * island runs its code in a sandboxed frame, a provider runs locally at build time.
     */
    readonly authorCode: boolean;
    readonly rawHtml: false;
    readonly localResourceOnly: boolean;
  };
  readonly handoffs: readonly [CapabilityHandoff, ...CapabilityHandoff[]];
}

/** Серьёзность находки: закрытый словарь от блокирующей до заметки, порядок — по убыванию. */
export const FINDING_SEVERITIES = ['blocking', 'major', 'minor', 'note'] as const;
/** Состояние карточки дашборда; `none` — карточка без метки. */
export const CARD_STATUSES = ['none', 'good', 'watch', 'risk'] as const;

/**
 * The directives a `children` value lets a container hold directly; `undefined` when the value does
 * not restrict directive children. This is the meaning of the `children` vocabulary above, kept
 * beside it so the grammar reads one table.
 */
export function allowedDirectiveChildren(
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
    case 'diagram-part-directives':
      return ['group', 'node', 'edge', 'legend', 'legend-item', 'zoom'];
    case 'zoom-part-directives':
      return ['group', 'node', 'edge'];
    case 'event-directives':
      return ['event', 'legend-item'];
    case 'response-question-directives':
      return ['question'];
    case 'response-field-directives':
      return ['bucket', 'option', 'item'];
    case 'finding-directives':
      return ['finding'];
    case 'message-directives':
      return ['message'];
    case 'slide-directives':
      return ['slide'];
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
