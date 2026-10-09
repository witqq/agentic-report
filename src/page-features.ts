/**
 * Page features: the units the browser assets of a page are assembled from. Every page carries the core
 * (`src/browser/runtime.ts` and `src/browser/styles/core.css`); a feature adds its script module and its
 * stylesheets only to pages that need it. The order of this list is the order of the page's stylesheets
 * and of its feature imports, so the assembly is the same on every build. The stylesheet order is part of
 * the cascade: the feature stylesheets were cut from one stylesheet so that no rule of a later file may
 * lose to an earlier one it used to follow (`docs/ARCHITECTURE.md`, «Page assets»); reordering them, or
 * a new rule that competes with a rule of a later file, needs the computed-style comparison again.
 *
 * A page needs a feature when one of its rendered blocks names it (`feature` in `defineBlock`), when its
 * finished page tree holds one of the feature's `hosts`, or through a page setting (layout, review, the
 * edition change layer, islands and effects of extensions, the chrome of the page's themes). `requires` closes the selection.
 */

/** An element of the finished page tree that needs the feature: by tag, or by a property and value. */
export type PageFeatureHost =
  { readonly tag: string } | { readonly property: string; readonly values?: readonly string[] };

export interface PageFeatureDefinition {
  readonly id: string;
  /** The browser module, relative to `src/`, imported before the core runtime. */
  readonly script?: string;
  /** Loaded after the core runtime has started: the edition layer, islands and effects. */
  readonly scriptAfterRuntime?: true;
  /** Stylesheets relative to `src/`, in order. */
  readonly styles?: readonly string[];
  readonly requires?: readonly string[];
  readonly hosts?: readonly PageFeatureHost[];
}

export const PAGE_FEATURES = [
  // The chrome of a theme that asks for it: console bands and ledger shells. They come first after the core,
  // where their rules stood in it, so no feature stylesheet meets them in a new order.
  { id: 'theme-console', styles: ['browser/styles/theme-console.css'] },
  { id: 'theme-ledger', styles: ['browser/styles/theme-ledger.css'] },
  { id: 'copy', script: 'browser/features/copy.ts' },
  { id: 'panel', styles: ['browser/styles/panel.css'] },
  {
    id: 'review',
    script: 'browser/features/review.ts',
    styles: ['browser/styles/review.css'],
    requires: ['panel'],
  },
  { id: 'toggle', script: 'browser/features/toggle.ts', styles: ['blocks/toggle.css'] },
  {
    id: 'copyable',
    script: 'browser/features/copyable.ts',
    styles: ['blocks/copyable.css'],
    requires: ['copy'],
  },
  {
    id: 'table',
    styles: ['blocks/table.css'],
    requires: ['figure-viewer'],
    hosts: [{ tag: 'table' }],
  },
  {
    id: 'contents',
    script: 'browser/features/contents.ts',
    styles: ['blocks/contents.css'],
  },
  {
    id: 'code',
    script: 'browser/features/code.ts',
    styles: ['browser/styles/code.css'],
    requires: ['copy'],
    hosts: [{ tag: 'pre' }],
  },
  { id: 'disclosure', styles: ['blocks/disclosure.css'] },
  { id: 'cards', styles: ['blocks/cards.css'] },
  { id: 'source-link', styles: ['blocks/source-link.css'] },
  { id: 'visualization', styles: ['browser/styles/visualization.css'] },
  {
    id: 'chart',
    script: 'browser/features/chart.ts',
    styles: ['blocks/chart.css'],
    requires: ['visualization', 'figure-viewer'],
  },
  {
    id: 'timeline',
    styles: ['blocks/timeline.css'],
    requires: ['visualization'],
  },
  { id: 'callout', styles: ['blocks/callout.css'] },
  { id: 'source-line', styles: ['blocks/source-line.css'] },
  { id: 'message', styles: ['blocks/message.css'] },
  { id: 'decision', styles: ['blocks/decision.css'] },
  { id: 'steps', styles: ['blocks/steps.css'] },
  {
    id: 'glossary',
    styles: ['blocks/glossary.css'],
  },
  { id: 'modal', script: 'browser/features/modal.ts', styles: ['blocks/modal.css'] },
  {
    id: 'popover',
    script: 'browser/features/popover.ts',
    styles: ['blocks/popover.css'],
    hosts: [{ property: 'dataPopover' }],
  },
  { id: 'filter', script: 'browser/features/filter.ts', styles: ['blocks/filter.css'] },
  {
    id: 'response',
    script: 'browser/features/response.ts',
    styles: ['blocks/response.css'],
  },
  { id: 'diff', styles: ['blocks/diff.css'] },
  { id: 'findings', styles: ['blocks/findings.css'] },
  { id: 'compare', script: 'browser/features/compare.ts', styles: ['blocks/compare.css'] },
  {
    id: 'demo',
    script: 'browser/features/demo.ts',
    styles: ['blocks/demo.css'],
  },
  {
    id: 'typography',
    script: 'browser/features/typography.ts',
    styles: ['blocks/typography.css'],
  },
  {
    id: 'spotlight',
    script: 'browser/features/spotlight.ts',
    styles: ['blocks/spotlight.css'],
  },
  {
    id: 'video',
    script: 'browser/features/video.ts',
    styles: ['blocks/video.css'],
    hosts: [{ tag: 'video' }],
  },
  {
    id: 'scheme-media',
    script: 'browser/features/scheme-media.ts',
    hosts: [
      { property: 'dataDarkSrc' },
      { property: 'dataDarkPoster' },
      { property: 'dataSharedDarkSrc' },
      { property: 'dataSharedDarkPoster' },
    ],
  },
  {
    id: 'gallery',
    script: 'browser/features/gallery.ts',
    hosts: [{ property: 'dataGalleryRail' }],
  },
  {
    id: 'scenes',
    script: 'browser/features/scenes.ts',
    styles: ['browser/styles/scenes.css'],
    hosts: [{ property: 'dataScene', values: ['steps', 'scrub'] }],
  },
  { id: 'count', script: 'browser/features/count.ts', styles: ['blocks/count.css'] },
  {
    id: 'diagram',
    script: 'browser/features/diagram.ts',
    styles: ['blocks/diagram.css'],
    requires: ['visualization', 'figure-viewer', 'tabs'],
  },
  {
    id: 'figure-viewer',
    script: 'browser/features/figure-viewer.ts',
    styles: ['browser/styles/figure-viewer.css'],
  },
  { id: 'process', styles: ['blocks/process.css'] },
  {
    id: 'composition',
    script: 'browser/features/composition.ts',
    styles: ['blocks/composition.css'],
  },
  {
    id: 'effects',
    script: 'browser/effects/index.ts',
    scriptAfterRuntime: true,
    styles: ['browser/styles/effects.css'],
  },
  { id: 'islands', script: 'browser/islands.ts', scriptAfterRuntime: true },
  {
    id: 'screens',
    script: 'browser/features/screens.ts',
    styles: ['browser/styles/screens.css'],
  },
  {
    id: 'slides',
    script: 'browser/features/slides.ts',
    styles: ['browser/styles/slides.css'],
  },
  {
    id: 'deck',
    script: 'browser/features/deck.ts',
    styles: ['browser/styles/deck.css'],
  },
  {
    id: 'tabs',
    script: 'browser/features/tabs.ts',
    styles: ['blocks/tabs.css'],
    hosts: [{ property: 'dataTabs' }],
  },
  {
    id: 'edition',
    script: 'browser/edition-changes.ts',
    scriptAfterRuntime: true,
    styles: ['browser/styles/edition.css'],
    requires: ['panel'],
  },
] as const satisfies readonly PageFeatureDefinition[];

export type PageFeatureId = (typeof PAGE_FEATURES)[number]['id'];

/** What a block renders with: its feature, or the core the page always carries. */
export type BlockFeature = PageFeatureId | 'core';

/**
 * The browsers page scripts and styles are built for: the Baseline widely available set, the default
 * the package's former Vite build used.
 */
export const BROWSER_TARGETS = ['chrome111', 'edge111', 'firefox114', 'safari16.4'] as const;

/** The core, always first: the runtime module and the stylesheet of every page. */
export const CORE_SCRIPT = 'browser/runtime.ts';
export const CORE_STYLES = ['browser/styles/core.css'] as const;

const byId: ReadonlyMap<string, PageFeatureDefinition> = new Map(
  PAGE_FEATURES.map((definition) => [definition.id, definition]),
);

export function pageFeature(id: PageFeatureId): PageFeatureDefinition {
  const definition = byId.get(id);
  if (definition === undefined) throw new Error(`Unknown page feature ${id}.`);
  return definition;
}

export function isPageFeatureId(value: string): value is PageFeatureId {
  return byId.has(value);
}

/** The selection closed under `requires`, in table order. */
export function resolvePageFeatures(requested: Iterable<string>): readonly PageFeatureId[] {
  const selected = new Set<string>();
  const add = (id: string): void => {
    if (selected.has(id)) return;
    const definition = byId.get(id);
    if (definition === undefined) throw new Error(`Unknown page feature ${id}.`);
    selected.add(id);
    for (const required of definition.requires ?? []) add(required);
  };
  for (const id of requested) if (id !== 'core') add(id);
  return PAGE_FEATURES.filter((definition) => selected.has(definition.id)).map(
    (definition) => definition.id,
  );
}

/** Whether a finished-tree element with this tag and these properties is a host of the feature. */
export function isFeatureHost(
  host: PageFeatureHost,
  tagName: string,
  properties: Readonly<Record<string, unknown>>,
): boolean {
  if ('tag' in host) return tagName === host.tag;
  const value = properties[host.property];
  if (value === undefined || value === null || value === false) return false;
  return host.values === undefined || host.values.includes(String(value));
}

/** The same host as a CSS selector, for checks against a built page. */
export function featureHostSelector(host: PageFeatureHost): string {
  if ('tag' in host) return host.tag;
  const attribute = `data-${host.property
    .replace(/^data/u, '')
    .replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^-/u, '')}`;
  return host.values === undefined
    ? `[${attribute}]`
    : host.values.map((value) => `[${attribute}="${value}"]`).join(', ');
}
