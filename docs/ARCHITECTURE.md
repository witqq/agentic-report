# Architecture

This is the authoritative architecture document for `agentic-report`. It describes the runnable current
compiler; proposals do not change this contract until they are reflected here, in code, and in scoped
verification.

The normative product contract is defined in
[`../PRODUCT-REQUIREMENTS.md`](../PRODUCT-REQUIREMENTS.md). A requirement listed there is not a current
architecture guarantee until code and scoped verification support it here.

## System boundary

`agentic-report` is a local offline compiler distributed as one npm package. It accepts a Markdown
entry or source directory and writes a static artifact. It does not host files, listen on a port, fetch
remote resources, deploy output, or publish itself.

```text
Markdown + metadata + local assets + partials + semantic directives
                              │
                              ▼
                 source loader and validation
                              │
                              ▼
           Markdown AST → sanitized HTML AST → highlighting
                              │
                              ▼
           local asset resolver + output contract
                              │
                              ▼
                 internal React document renderer
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       self-contained HTML        HTML + hashed assets
          (default)                  (directory)
```

## Modules

- `src/contracts.ts` assembles internal validation schemas and the TypeScript contracts selectively exposed
  by `src/index.ts`.
- `src/page-motion.ts` is the presentation-neutral source of truth for the fixed package motion policy.
  The authoring registry projects it into discovery, while the browser runtime consumes the same values and
  supplies entrance/stagger/choreography timing and bounded depth, tilt, and magnetic distances to package
  CSS through runtime-owned custom properties.
- `src/source/load-source.ts` resolves the primary entry, parses metadata, and expands confined Markdown
  partials. An optional closed `en`/`ru` localization map loads alternate Markdown entries through the same
  graph and confinement boundary. The primary owns presentation/output policy; an alternate may own only
  source-contract version, title, description, language, Markdown, partials, and local resources. Distinct
  canonical file identities, matching locale/contract declarations, recursion refusal, and complete source
  inventory prevent aliases and incomplete selectable variants. The loader validates raw metadata shapes
  before merging and retains metadata/partial provenance for diagnostics and output-collision protection.
  The product deliberately does not implement an inode ledger or defend against hostile concurrent path
  replacement.
- `src/render/markdown.ts` uses the unified/remark/rehype AST pipeline with GitHub Flavored Markdown table,
  strikethrough, task-list, and autolink-literal parsing. Raw HTML is not passed through; rehype sanitization
  runs before trusted compile-time syntax highlighting. One process-level Shiki highlighter loads only the
  grammars a document's fences need: each fence language, resolved through every name the Shiki bundle
  registers, together with the grammars it embeds eagerly or lazily, the scopes its rules `include`, and
  the injection grammars targeting any of those scopes or a dot-prefix of one, which is how Shiki applies
  injections. Output is therefore the same as with every bundled grammar loaded, while a document without
  fences loads none; a fence in a language Shiki does not bundle, or without a language, stays plain
  escaped code. The authoring registry owns the serializable
  code-fence `terms` envelope, shared key constraint, bounds, uniqueness and exact-match policy; discovery
  projects those fields and the mdast parser consumes the same contract before transporting validated keys
  through Shiki metadata. Trusted post-Shiki enhancement splits existing styled HAST spans around bounded
  first glossary occurrences without changing code text. The asset plugin embeds local images, downloads,
  and fonts or copies them under deterministic hashed names.
- `src/review/contract.ts`, `src/review/routing.ts`, `src/review/targets.ts`, and `src/review/binding.ts` own the platform-neutral
  versioned review data contract, bounded canonical serialization, compile-time target inventory,
  local-input revision, and exact/changed/missing/ambiguous binding. The unchanged version-2 target manifest
  is separate from single-language review artifact version 3 and multilingual version 4. Version 4 requires
  a closed locale discriminator and routes to one prepared target manifest before binding; legacy v2/v3
  input uses a unique exact revision or the primary locale. The optional selected-text anchor stores full
  start/end target references, Unicode code-point offsets, and a normalized quote. Valid version-2
  whole-block artifacts normalize into the current single-language shape. Target provenance is captured
  while AST offsets and the partial source map are available; it is never reconstructed from final HTML or
  matched by proximity.
- `src/response/contract.ts` owns the independent version-1 response manifest and answer artifact. It
  validates exact bounded records and kind-specific values, distinguishes untouched questions from authored
  defaults, normalizes human text, compares the compiler-created form revision, and serializes canonical
  newline-terminated JSON. It has no DOM, filesystem, review-thread, or transport dependency.
- `src/render/authored-rules.ts` holds the executor of the directive phase. Rule sets are declared
  against it per authored subject, including the reading of the directive node itself: its name, written
  attributes, form, placement and children are independent rules that answer together. The declared sets are not the whole phase, and the split is historical rather than principled:
  checks that predate this arrangement — among them the children a question or a data container
  accepts, the metadata of an annotated code fence, the shape of a response form, and document-wide
  checks such as a glossary key referenced but never defined — are still written as ordinary code and
  are not declared as rules. Report completeness does not depend on that split, because those checks
  collect violations too; what it bounds is only what can be read as data. An authored rule
  answers with a violation instead of throwing, and a rule that reads another's accepted result declares
  that dependency by name; the executor keeps every violation and skips only what a refused dependency made
  unreadable. Completeness therefore no longer depends on how finely the phase happens to be split,
  and `src/render/authored-rule-contract.ts` projects the declared rules and dependencies into
  discovery so a consumer can read them without running a check.
- `src/blocks/` holds the directive vocabulary as block modules. A block is one directive declared with
  `defineBlock` (`src/blocks/define-block.ts`): its grammar (the registry `DirectiveDefinition`), node
  rules read with that grammar, its own authored checks, an optional preparation, the enhancement of its
  sanitized element, an optional pass over the whole enhanced page, its own messages when the package
  catalogue does not carry them, its runtime controller, where its styles come from, one sentence saying
  what it is without motion and in print, and source examples that must validate. A tight family shares a
  file — `section.ts` holds section, lead, beat and notes and owns the page passes that read sections
  (openings, galleries, steps scenes, the media effect, the first screen, slides); `diagram.ts`,
  `chart.ts`, `timeline.ts`, `response.ts`, `decision.ts`, `cards.ts`, `tabs.ts`, `findings.ts` and
  `actions.ts` hold their families. `src/blocks/index.ts` lists the built-in blocks in registry order,
  and the registry takes its directive list from their definitions. The value sets the definitions read
  (`DIAGRAM_CONTRACT`, section recipes, severities, card statuses) and the definition types live in
  `src/authoring/directive-contract.ts`, which imports neither the registry nor the blocks; the registry
  re-exports them.
- `src/source/load-data.ts` reads the JSON files the primary entry lists in `data`: each path is confined
  to the source root like a partial, the file is addressed by its name without `.json`, and its bytes join
  the source files and digests of every language variant, so a change of data changes the report
  revision. `src/render/page-data.ts` is the data phase, the first remark plugin of a page that declares
  data: it replaces `{{name.path}}` in text, code, link targets and directive attribute values with the
  value as text of the already parsed tree (a value is never parsed, so it cannot add markup), repeats the
  body of `each` per list item (inside one list or one table when the body is one), checks `expect`
  against the data, and removes both directives. Its refusals join the directive phase's report. There is
  no expression language; derived values are precomputed or come from a provider.
- `src/extensions/` holds the page extensions described under [Extensions](#extensions): the manifest
  loader (`load.ts`), the page vocabulary (`vocabulary.ts`), template compilation and escaping
  (`template.ts`), expansion of composite blocks and providers in the remark phase (`expand.ts`,
  `provider.ts`, `origin.ts`), islands (`island.ts`), effect-host counting (`targets.ts`), the effect
  bundler (`effect-bundle.ts`) and the per-page assembly of scripts and the build report (`assembly.ts`).
  A page without the `extensions` field never reaches this code path.
- `src/render/directives.ts` is the directive core. Its remark plugin restores the colon tokens that
  `remark-directive` misclassifies as text directives — a digit-initial name whatever precedes the colon,
  and a colon written against the preceding word; a spaced alphabetic name, any attributed or
  child-bearing form, and every block-level form stay on the directive path, so an unregistered name
  among them keeps its normal error. It then reads every directive node against the registry grammar
  (name, form, placement, children, attributes, attribute combinations) together with the node rules of
  the node's block, and afterwards walks the document once in source order, running each block's own
  check on the nodes of that block; a check that refuses its node is not repeated on the node's
  descendants. Unknown directives, invalid attributes or nesting, block data errors, unresolved glossary
  references, duplicate definitions, and an unmarked first occurrence of a registered glossary term in a
  section fail with authored-range diagnostics. Its rehype plugin runs the blocks' preparations
  (awaiting the asynchronous flow layout), then enhances each element through its block — found by
  `data-semantic`, or by package class for the resource blocks — with shared services: package strings,
  the page language and layout, the share mode, the document id allocator, and the instance counter of
  interactive components; a block without an enhancement gets its title as a heading. The blocks' page
  passes follow in block order, then the glossary appendix and navigation. The core keeps only
  document-wide concepts: section identity (`src/render/section-identity.ts`), the glossary with its term
  references, code-fence terms and first-occurrence check, and the literal-colon restoration; a unit test
  (`tests/unit/blocks.test.ts`) fails when the core names any other block. Authored term labels remain
  visible forms of one canonical key; appendix glossary definitions are moved after review targeting and
  retain their source identities.
- `src/render/visualizations.ts` projects validated chart series/points, diagram nodes/edges/legends, and
  timeline events into deterministic accessible SVG or semantic HTML. It is compile-time code and does not
  add a visualization browser runtime. `src/render/flow-layout.ts` lays out flow diagrams by layers, and
  `src/render/diagram-description.ts` writes a diagram out in words for its `desc` and its
  «diagram in words» disclosure.
- `src/render/navigation.ts` derives the final explicit-section or legacy H2 inventory structurally from
  enhanced HAST, fills authored in-flow maps with exact headings, and projects optional short labels for the
  shell. Appendix and subordinate headings remain excluded without parsing serialized HTML.
- `src/authoring/themes.ts` owns the theme contract: the closed theme fields shared by built-in themes,
  theme files and frontmatter theme objects, the accent and font catalogs, the base values and the built-in
  themes as partial data over them, and the merge that resolves a theme through its `extends` chain.
  `src/authoring/theme-contrast.ts` holds the contrast pairs a resolved theme must pass.
  `src/source/load-theme.ts` resolves the page `theme` — a built-in name, a confined theme file, or an
  inline object — through the chain inside the source root, validates every field against the shared schema
  with diagnostics at the field's line, checks contrast, and returns the resolved theme with the theme files
  it read, which join the source graph. `src/render/theme-css.ts` projects a resolved theme into CSS
  variables under `:root[data-theme='<name>']` (with dark-scheme blocks) and into root attributes named after
  each shell treatment; the static package stylesheet reads only those and never a theme name, so the whole
  look of a theme is its data and a theme that extends another inherits all of it.
- `src/render/document.tsx` creates the static HTML document from prepared locale variants, navigation,
  the resolved theme's root attributes and scheme, the selected layout, responsive shell, metadata, and content security policy. For a
  page with a public URL it also writes a static canonical link, OpenGraph, and Twitter card metadata from
  the primary variant; `src/render/public-page.ts` maps language tags to OpenGraph locales through the
  registry-owned `PUBLIC_PAGE_CONTRACT`. A page with more than one language adds a
  `hreflang` alternate per language and `x-default`, all at the same address, since the variants share it.
  That head metadata sits outside the locale templates, so a
  reader's language switch never rewrites it. One
  active variant and inert alternate templates contain complete localized shell/article state; the native
  selector exists only when more than one variant is present. It allocates collision-free shell IDs around
  each variant's authored content IDs and uses them consistently for navigation and accessibility
  relationships.
- `src/browser/` contains the browser runtime and token-based stylesheet bundled by Vite. The locale
  controller chooses the initial embedded variant from ordered `navigator.languages`, falls back to the
  primary variant, and atomically swaps the complete active DOM boundary. It updates document metadata and
  language, recreates variant-bound controllers, restores locale-local review/response/component state, and
  keeps manual choice session-only. One delegated
  event controller handles theme/navigation controls, current-section ownership, bounded normal-motion
  progress, entrances, scenes, choreography and fine-pointer effects, responsive action placement, code copying, glossary hover/focus/tap explanations,
  tab selection, modal/popover focus, filtering, switches, and bounded counters. A separate page-bound
  controller fits each diagram's initial view to its frame until the reader picks one. Every authored glossary or
  popover panel is portalled to `body` while open, positioned against its trigger from the current visual
  viewport with clamping and above/below flipping, then restored to its exact semantic source position on
  close. This lets transient UI escape the section isolation and local scrolling that intentionally contain
  authored and decorative content. Active panels share animation-frame-coalesced document, nested-scroll,
  window, and `visualViewport` positioning listeners; the listeners exist only while a panel is open and are
  torn down before localized DOM replacement. Interaction instances retain source-owner mappings and state
  in their own semantic DOM subtree, so repeated components do not share accidental state.
- `src/browser/page-modules.ts` installs the layout and motion runtime on every activated language variant
  and removes it on a language switch: `screens.ts` (`layout: screens`: gesture-per-screen wheel handling,
  keys, switcher, address, `window.agenticScreens.check()`), `page-states.ts` (root `data-state-*` flags
  from sections and beats, `data-state-on` on `when` blocks), `scenes.ts` with the pure mini timeline
  `timeline.ts` (`scene="scrub"`, code lines and beat states shared with the steps scene),
  `opening-entrance.ts` (`transition="staged"`), `thesis-fill.ts`, `current-row.ts` (`data-current` without
  hover) and `pause-control.ts` (the **Pause motion** button). `motion-level.ts` turns `data-motion-level`
  into the runtime's «page stands still» query: `motion: none` reads as reduced motion everywhere.
  `view-transitions.ts` switches tabs through `document.startViewTransition` with shared names for diagram
  nodes and matching list rows. `geometry-rebuild.ts` is the one geometry rebuild helper used by the scrub
  scene, the screens mode and the effect engine: width changes only, fonts, the `agentic-report:geometry`
  event (the runtime announces `entrance` when a section or the first screen has entered), return to the
  tab, one rebuild per frame, at most six per clock second (`rebuildGate`), optionally keeping what the
  reader sees in place.
- `src/iconography.ts` owns the local SVG path vocabulary. `src/browser/icon.ts` creates runtime DOM icons
  for copy, Review and Response controls; compiler and document rendering use the same vocabulary through
  their HAST and React boundaries. No icon resource is fetched at runtime.
- `src/browser/review-workspace.ts` is a cohesive package-owned controller over the shared review contract.
  It parses the inert manifest once, maps native in-target or cross-target text ranges to deterministic
  anchors, owns in-memory discussion threads, ordered user/agent messages and segment-local resolution,
  validates exact-revision imports against reconstructed DOM ranges, and exports canonical JSON through a
  revoked local object URL. CSS Custom Highlight ranges, focusable overlay markers, the selection/highlight
  action, anchored thread popover, and overlay comment list share that state machine. Geometry work is
  animation-frame-coalesced and dormant when no annotation UI exists. It never evaluates or injects messages
  as HTML, writes storage, starts a service, or performs a network request.
- `src/browser/response-workspace.ts` reads each inert response manifest and creates native question controls.
  It owns current-tab answer state, select-based bucket assignment plus drag-and-drop, explicit order moves,
  sparse item comments, clipboard and Blob-file export, and validate-before-swap file import. It uses DOM
  text/value APIs only and never writes storage, submits a form, starts a service, or performs a request.
  Drag identity is a controller-local DOM reference accepted only by its owning bucket question; native and
  artifact validation apply the authored number range and step before either export path.
- The main browser runtime owns one copy-control factory and localized clipboard lifecycle for both code and
  `copyable` prose. Trusted enhancement marks a prose content owner; runtime reads its rendered `innerText`,
  while code retains clone-based glossary-panel exclusion. Neither route accepts author behavior.
- `src/core/prepare-report.ts` owns the shared side-effect-free preparation used by building, validation,
  and inspection: every declared locale graph, per-locale Markdown/navigation/review preparation,
  deterministic resource merge/collision checks, registry-owned output selection, package browser assets,
  size accounting, content hashing, observed source features, and prepared directory resources. Matching
  resource bytes deduplicate; conflicting locale resources at one output path fail. Multilingual authored
  font identities and activation properties are locale-scoped, while single-language font output remains
  compatible. Package browser assets resolve only beside the installed module, never from the consumer's
  working directory.
- `src/core/compiler.ts` publishes a prepared single-file or staged directory artifact.
  `src/core/analyze-report.ts` projects the same preparation into compact validation and inspection
  results without output publication. The normal author journey therefore initializes a starter, edits its
  declarative source, invokes `build` once, and opens the artifact: build itself crosses the complete
  preparation boundary before publication. `validate` and `inspect` are optional projections, not stateful
  prerequisites for compilation.
- `src/core/site-index.ts` indexes a published static tree for search engines. It walks the tree and
  refuses it whole when any symbolic link or special file is present, recognizes agentic-report pages by the package `generator` meta, reads only
  their `<head>`, and takes each page's own canonical URL; other HTML files are reported as skipped and
  never interpreted. All canonical URLs must share one origin and each must equal the page's place in the
  tree, whose root is the origin root. It then creates `sitemap.xml` and `robots.txt` exclusively, and
  refuses without writing on any mismatch or when either file exists. It is exposed as ESM
  `generateSitemap()` and CLI `sitemap <directory>`.
- `src/core/inspect-review.ts` reads one strictly bounded review JSON file confined under the prepared
  source root, validates it, binds its threads and revision segments to the current target manifest, and returns a
  centrally sanitized result without publishing output or editing Markdown.
- `src/core/fix-report.ts` applies the replacements diagnostics carry in their `fix` field and writes
  nothing else. It is the only module that writes to an authored source; the analysis and build modules
  above never do. Replacements whose ranges overlap within one round are deferred rather than merged, and
  the run repeats validation until no applicable replacement is left or a bounded number of rounds is
  reached, reporting whatever remains.
- `src/cli.ts` adapts initialization, building, validation, inspection, repair, review binding, site indexing,
  snapshots, and discovery to
  one diagnostic model, and `src/cli-output.ts` projects that model. The agent projection is the default
  because the package is consumed by agents, and `--json` remains accepted for what already happens. Its
  shape follows the kind of answer: a run reports through NDJSON records, while the discovery commands
  return one reference document as a compact JSON line. `--human` selects the projection for a person —
  prose where a run ends in a fact a sentence can carry, and the same document indented where the answer
  is a catalog or a schema, which is the case for inspection and for discovery. A flag description states
  which of the two a command gives. A projection selects the presentation, never the set of facts:
  both show every independent violation of a run, each with `file:line:column`. The executable reads its version from the installed package metadata rather than
  carrying a second version literal. Before parsing a command it compares the running Node.js version with
  that same installed package's minimum engine and returns `NODE_VERSION_UNSUPPORTED` below the floor rather
  than relying on npm's warning-only behavior. `src/index.ts` is the ESM API and applies the same installed
  engine gate before exposing operations; programmatic callers receive an `AgenticReportError` carrying the
  same diagnostic.

## Public contracts

The npm package exposes one `agentic-report` executable and one ESM root export. CLI discovery is
available through `describe`/`discover`, scoped `schema`, and `examples`. `fix` and its ESM equivalent
`fixReport()` apply the replacements diagnostics carry in their `fix` field — a file, a range in the
authored text and the replacement — and write nothing else; a diagnostic carries that field only where
applying it preserves every authored construction the range spans. `sitemap` and its ESM equivalent
`generateSitemap()` write `sitemap.xml` and `robots.txt` into a published tree and nothing else. `theme` and its ESM
equivalent `createBrandTheme()` write one absent theme file from brand colours: the lightness of each colour
is moved in OKLCH (`src/authoring/oklch.ts`) until the same `contrastRatio()` the theme loader checks with
passes every pair, so the written file and the build never disagree. The ESM root exposes
`sourceContract`, defensive `getSourceContract()` and `getAuthoringSchema()` values, and example discovery;
concrete Zod schemas remain internal. The root also exposes `initProject()`, which selects the default or
any category starter from the typed registry, resolves its complete tree beside the installed
package, rejects symlinks/special files, fully reads it, and requires the declared entry before publication.
The destination must be absent and its immediate parent an existing directory; a symbolic-link parent is
resolved and the reported project path names the resolved location. Init
claims the destination exclusively and creates files without overwrite. A later failure may leave the new
destination incomplete; init reports it and never deletes or rolls back destination content. The CLI
exposes the same operation as `init <destination> [--starter <id>] [--json]`. The root also exposes
`validateReport()` and `inspectReport()`; CLI `validate` and `inspect` adapt them with the same
optional format and confined prior-review overrides. Both run production preparation without output publication. Validation reports
project/entry identity, format, runtime placement, and warnings. Inspection adds relative source inventory,
observed directives/resources, the page `structure` (section properties and media counts collected by
`src/render/page-structure.ts` from the rendered tree of the primary variant, with no author text), and a
registry-derived authoring catalog. `src/core/snapshot.ts` builds a page and photographs it through a
Playwright the user installs beside the package; it imports only the fixed package names `playwright`,
`playwright-core` and `@playwright/test`, and the package declares none of them as a dependency.

The ESM root also exposes `inspectReview({ input, review })`, the review contract types, and defensive
parse/serialize functions. CLI `review <review> [input] [--json]` adapts the same read-only resolution. The
review path is a dedicated relative local reference confined under the report source root; canonical path
and device/inode identity prevent it from aliasing loaded source/resource or output identities. Exact report revisions
resolve recorded targets. Stale revisions resolve a stable explicit identity first, then a unique target at
the same authored source origin (file, line, and column); a changed fingerprint at that origin is reported as
changed. Only when the original origin is absent may a unique matching fingerprint in the same source file
resolve the thread segment. A unique cross-file fingerprint is treated as a move only after the previous source
file disappears from the current target graph. This prevents equal text elsewhere from impersonating edited
content. For a selected-text segment, binding applies independently to both stored endpoint targets and the
aggregate becomes changed, missing, or ambiguous when either endpoint does. The browser restores exact
offsets only for an exact report revision; stale quotes remain historical evidence rather than fuzzy
relocation. Changed, missing, and ambiguous targets remain explicit and never trigger source mutation.

Response Workspace is deliberately a reader artifact contract rather than a CLI source-binding API. The
compiler validates `response`/`question`/`bucket`/`option`/`item` records, hashes their canonical form
projection, and embeds one inert manifest per form. The browser exports a closed artifact containing form
identity/revision, one ordered typed answer per question, and only non-empty item comments. Defaults can be
visible while `answered` remains false. Import validates the whole artifact, value domains and matching form
revision before replacing any visible state. Clipboard and file downloads serialize the same bytes.

The package-owned starter trees, one per page category (`PAGE_CATEGORIES` in
`src/authoring/registry.ts`), are ordinary buildable examples carrying registry `starter` metadata;
`document` is the default. Registry integrity requires exactly one starter per category, named after it.
The `brief.md` inside a starter tree is a filled sample of that page's brief. Init does not copy it: it
writes a blank brief rendered from the category's brief dimensions by `renderBriefTemplate`
(`src/authoring/brief.ts`) in its place. Discovery exposes identity, category, subvariant, and default
status; init uses the same metadata and copies the selected tree rather than invoking a separate template
generator. Categories carry no
compile-time rule: the compiler never restricts directives by category.

The CLI emits structured diagnostics, authored ranges, and a per-run identifier. One transport sanitizer
removes credential-bearing URL user information, signed-URL and other recognized credential values from
text, paths, structured details, and successful CLI records. ESM validation/inspection identities pass
through the same boundary. Unexpected internal causes and source bodies do not cross the transport. Result
envelopes are not yet independently versioned; the source-contract major is included in validation and
inspection results.

The current source schema supports title, description, a documented restricted language-tag syntax, an
optional fixed-shape `en`/`ru` localization map, a theme, a colour scheme, layout, optional scroll
progress, a default-on boolean package attribution, and output defaults.
`attribution: false` removes only the renderer-owned
**Made with Agentic Report** footer; default and opt-out behavior are identical across output formats.
`neutral` is the registry-owned default theme; `BUILT_IN_THEMES` in `src/authoring/themes.ts` holds the
others, and the generated [authoring catalog](../skills/agentic-report/references/catalog.md#page-metadata)
lists them. The scheme is an independent light/dark/system choice. The icon
vocabulary is a
small compile-time set of MIT-licensed Primer Octicon paths: it adds no author syntax, network request,
runtime dependency, or CSP branch. Shell controls retain localized accessible names and title tooltips even
when compact presentation omits their visible labels. Every layout of `PAGE_CONTRACT.layouts` shares one
responsive shell, track system, and component surface model; `slides` adds the deck controller described
under «Output model». Frontmatter overrides the matching manifest fields. Only Markdown partials
are allowed; the loader rejects cycles, nesting over 10 levels, and lexical or canonical paths outside the
source root. The source contract is defined in
[`product/source-contract.md`](product/source-contract.md).

For a single-language source, manifest `language` remains the sole input to the browser-safe package
catalog: `ru` and Russian subtags resolve Russian, while `en`, `und`, and unsupported tags retain the
complete English fallback regardless of browser locale. A source that declares `localizations` narrows its
selectable locale domain to catalog-backed `en` and `ru`; each entry's language resolves the matching
catalog at compile time. Static document markup, compile-time directive and visualization enhancement,
Review Workspace, and Response Workspace consume that locale's same catalog. At startup only, the browser
runtime inspects ordered `navigator.languages` to choose among already embedded variants, then falls back to
the primary entry. It does not fetch or compile content, consult network state, persist the manual choice,
or change generated bytes. Authored content and CLI diagnostics remain outside this reader-chrome boundary.
The catalog also owns explicit-locale numeric formatting for visible and accessible chart output, so
compiled values cannot fall back to a host or hardcoded locale.

The `section` directive is restricted to the Markdown root. It creates one real `<section>` labelled by an
owned visible H2, with a validated explicit ID or deterministic title-derived ID. Explicit duplicates and
unsafe IDs fail; generated collisions receive deterministic suffixes. When explicit sections exist they
are the primary navigation inventory, using `nav` when supplied; documents without them use legacy H2
headings. H3 and component IDs remain owned descendant hash targets but do not become primary links.
The same registry owns the closed high-level section recipes (`SECTION_RECIPES`, listed in the catalog)
and the detailed visual grammar for each section: composition, viewport,
density, typography, media treatment, image and video fit/aspect/focal point, decorative surface, transition, scene,
interaction, and choreography. Legacy `reveal` remains a false-by-default entrance alias. Validation emits
only normalized data attributes; package CSS interprets them for both output formats. This keeps author CSS,
class names, arbitrary values, callbacks, and layout JavaScript outside the public source boundary. Media
treatment does not absorb image framing: `media` owns natural/mask/layers/gallery/bleed behavior, while
`media-fit`, `media-aspect`, and `focal` remain independent. Layered presentation transforms image
descendants rather than semantic cards or review-target owners, so browser range geometry remains stable.
Recipe values resolve before the existing incompatible-combination rules and explicitly authored detailed
attributes apply last. Optional card `href` values reuse the safe-link constraint; the authored tree rejects
nested links before one semantic card anchor is emitted.
Responsive rules restore multi-column and overlapping compositions to authored order on narrow screens and
confine gallery overflow to the gallery rail. Every section establishes local formatting and stacking
contexts. Split and stage arrange only a section's opening, which trusted HAST enhancement marks structurally
after directive enhancement: `enhanceSectionOpenings` walks the direct children after the title and marks
the run that reads well in half the track, with at most one picture, as `data-section-opening="text|media"`.
For split the run may hold the lead, paragraphs, lists, quotes, callouts, decisions, glossary entries,
copyable prose, assets, and modal, popover, and action groups; for stage only the lead, paragraphs, and
actions, because a long container beside a picture leaves the picture column empty. Highlighted code and
every other block end the run. The section receives `data-section-opening-layout` and the run length as
`--section-opening-rows` only when the arrangement applies: split needs a non-empty run, stage needs an
opening picture with text beside it, or a gallery rail beside the title. Package CSS then sets split's run
beside the title and a stage's text beside its picture under a full-width title; every later block spans
the whole track. The rule is structural, by element kind, and never reads authored meaning. Without it a
long section squeezed tables, code, and diagrams into one half while the other half stayed empty. Every block
after the opening uses the same section track from the same start edge. Centered sections center only a
full-width title and lead and their actions; the body keeps the start edge. Edge actions end at the column
they follow: the section track inside a section and the reading measure of the page opening. Split sections return to normal flow before a desktop sidebar can
leave unreadably narrow tracks, and story floats cannot influence a following section; a bleeding story
picture keeps the story float width and bleeds only past the end edge.
The registry also owns incompatible attribute combinations. Markdown validation, public discovery and JSON
Schema consume the same records; mosaic/stack with layers/gallery, layers with depth/tilt, progress with
depth/tilt, story/stack with sticky, and non-primary magnetic actions are rejected because two roles would
otherwise control the same layout or transform.
One direct `lead` may be the section's first authored block. MDAST validation bounds it to one paragraph
before review targeting; lead is excluded as a duplicate directive owner, and trusted HAST enhancement
collapses the wrapper while retaining the paragraph's authored review target. It adds presentation only,
not a callout region or browser behavior.
After section enhancement and appendix extraction, one structural HAST inventory supplies both projections:
`contents` renders exact heading text and final anchors in article flow, while the document shell receives
short `nav` labels when authored. The shell alone applies its two-item threshold; an in-flow map remains
visible with zero or one item. Production no longer reparses serialized HTML to derive navigation, and no
browser heading parser or synchronization state exists.
`actions` accepts only direct `action` children. Each action becomes an ordinary anchor after
its same-page, relative, HTTP(S), or mail target passes the closed registry constraint; executable,
local-file, absolute-path, and protocol-relative targets are rejected. The group owns a closed
auto/edge/inline/bottom placement role; auto resolves responsively, and bottom remains compact normal-flow
content instead of a sticky or fixed overlay. On a landing page with a centred opening (every theme except one with
`chrome.landing: ledger`), package CSS aligns an auto or inline group written directly under the opening heading or its
first paragraph with that heading: centred on wide screens, at the start on narrow ones. The group's box is
the reading measure, so the box itself is centred too, and an explicit edge group ends level with the lead paragraph. Primary actions alone may opt into the bounded normal-motion
magnetic treatment. Package-owned 16-pixel icons remain part of the anchor rather than authored markup.
The inline `source-link` directive is narrower: it accepts only an explicit IPv4-loopback `/open` helper
URL carrying an absolute path and positive line. The compiled protected anchor opens a separate browsing
context, so helper response status cannot replace the `file://` report. The package does not request the
helper, read the addressed source file, add a CSP source, or install browser behavior for the link. The
authored absolute path remains serialized in a default build. An explicit share build branches inside
trusted HAST enhancement: it derives one path-free terminal filename/line from the validated helper, uses
`source:line` when that terminal is unsafe, discards the authored label plus helper/path properties, and
counts transformed nodes. An already matching short label is observably unchanged; directory-bearing and
free-form labels are replaced rather than semantically scanned for embedded paths. Terminal classification
checks raw and iteratively percent-decoded representations with an input-derived termination bound. It never
resolves the path, parses arbitrary HTML, rewrites Markdown, or scans user prose.

Partial expansion produces a compact offset source map. Markdown AST positions resolve through that map,
so diagnostics from entry content and nested partials identify the original authored file and range rather
than the concatenated intermediate document.

Glossary definitions default to their authored inline position. A source-mapped placement check restricts
`placement="appendix"` to root definitions or direct section children, so extraction cannot empty lists,
quotes, lead blocks, or unrelated component parents. After review targeting, the complete already-targeted
definition is removed from its section without a placeholder and moves into one package-owned labelled
appendix in authored document order. Its heading is marked
as package-owned navigation-excluded content, so explicit-section and legacy-H2 primary inventories remain
the document's reading route. Popover links still target the same collision-free definition IDs. Code-term
panels reuse the existing delegated glossary runtime; code copy clones the code element and removes generated
panels before reading text.

## Visualization model

The registry owns a closed data vocabulary for `chart`/`series`/`point`,
`diagram`/`group`/`node`/`edge`/`legend`/`legend-item`, and
`timeline`/`event`. Charts support `bar`, `line`, and `pie`; series are bounded, share an ordered category
domain, and use finite numeric values. Flow diagrams contain up to twenty uniquely identified nodes, bounded
directed references, and up to five subsystem groups around some of the nodes; a node without a group stands
beside them. Every connection has one of four package-drawn kinds (`call`, `data`, `event`, `dependency`),
and a node may carry a smaller `detail` line. A diagram mixing two or more connection kinds gets a legend of
the kinds present; `legend` titles it and `legend-item` renames, adds, or hides entries and names node
emphasis. A flow node may carry a process `status` (done, review, returned, pending) with a package meaning
and legend word, a connection a «×N» `count` and an `id` a beat focus addresses, a connection to its own node
is a loop on the node's corner kept out of the layout, and one node may open into a nested `zoom` flow laid
out on its own and drawn inside the node's box for the camera (`src/render/diagram-zoom.ts`). The text
directive `process` draws a mini process of dots and return arcs (`src/blocks/process.ts`). Sequence diagrams retain participant and labelled message order. The registry owns both form-specific bounds and unsupported
combinations. Timeline events retain ordinary Markdown bodies. Every top-level visual requires a visible
title and meaningful description.

Visualization output is generated after Markdown sanitization from values already checked by the registry
schemas and cross-record validator. SVG uses deterministic document-order IDs, a responsive `viewBox`,
package theme variables, and an atomic image role. Its accessible `title` and `desc` expose the authored
summary plus complete chart series/point data; for a diagram they carry the text of
`src/render/diagram-description.ts`: groups with their members, layers in flow order, connections along the
flow and backward connections separately, named in the legend's words, or sequence participants and ordered
messages. The same text is repeated under the picture in a closed «diagram in words» `<details>`.
Decorative SVG descendants do not make unreachable nested-role claims. Timelines use an ordered
semantic list. No source value becomes
JavaScript, CSS, raw HTML, a URL, or an executable graph expression.

### Flow layout

A flow is laid out by layers in the manner of Sugiyama. The package assigns layers itself: connections that
return along an already started path are reversed by a depth-first walk in authored order, each node takes
the longest incoming path, nodes sharing a `row` are raised to one layer, and free nodes then move to where
their connections are shortest, a grouped node staying within the layers of its group mates when its
connections allow it, so one far target does not stretch the group frame across the diagram. The same layers
drive the diagram description and every view, so the text never depends on the view a reader picked.

Two build-time engines draw those layers; neither adds browser code, network access, or an output-format
branch.

- [dagre](https://github.com/dagrejs/dagre) (`@dagrejs/dagre` 3.1.1, MIT) draws the two layered views,
  `down` and `right`, in `src/render/flow-layout.ts`. It receives the layers through its `ranker` hook and
  does node order inside a layer, coordinates, subsystem groups as clusters, and a label node on the middle
  rank of every labelled connection, so a label never lands on a node or another label. The package runs
  dagre with each of its alignments, both authored node orders, and six seeded shuffles; attaches every end
  to the node face the connection comes from; straightens small bends that do not clear a node; and keeps the
  candidate with the fewest crossings that fits the page width best. It then shrinks every group frame to its
  own nodes, because dagre widens a cluster for connections passing by and for the place of its title, and
  puts the title into the leftmost band above the nodes that no connection, label, or node crosses. Three or
  more parallel connections between the same two nodes are laid out as one bundle and drawn side by side with
  stacked labels: dagre 3.1 loses the coordinates of its dummy nodes when three parallel connections leave a
  group. Its in-layer `constraints` option is not used for the same reason: it gives two nodes of one layer
  the same order and one of them no coordinates.
- [ELK](https://github.com/kieler/elkjs) (`elkjs` 0.12.0, dual-licensed EPL-2.0 or GPL-3.0; this package uses
  it under EPL-2.0) draws the `orthogonal` view in `src/render/flow-elk.ts`: its layered algorithm with
  right-angle routing, groups as nested nodes, and labels placed on their own connection
  (`elk.edgeLabels.inline` is read from each label, not from the graph). Top to bottom, connections enter a
  group through its top edge, so a group entered from outside gets its title as a separate node one layer
  above all of its nodes, held there by service connections that are not drawn; ELK routes real connections
  around the title as around any node. Layer constraints are not used for this: ELK layers are global, so
  `FIRST` would lift the title to the top of the whole diagram, and `FIRST_SEPARATE` fails in ELK 0.12
  together with authored order. The ELK layout call is asynchronous, which is why the diagram step of
  `rehypeEnhanceDirectives` prepares all diagrams before it rewrites them.

Edges are straight segments with rounded corners (radius 18 in the layered views, 8 at right angles): a spline
through the same points bulges out on sharp turns and can cross a neighbouring node.

Writing these layouts in the package would mean owning crossing reduction, Brandes–Köpf coordinate
assignment, cluster-aware ordering, and orthogonal routing, which dagre and ELK already implement and Mermaid
uses for its own flowcharts.

### Flow views and the switcher

`enhanceFlowDiagram` builds three views of every flow at compile time: `down` and `right` from dagre and
`orthogonal` from ELK in the direction the layered layout chose. `layoutFlowViews` scores each view by its
crossings, by connections drawn against the flow, and by its width across the page; `layout="auto"` (the
default) shows the best of the three first, and `down`, `right`, or `orthogonal` name the first view
explicitly. The views become panels of the package tab list: the same `data-tabs`, `data-tab`, and
`data-tab-panel` markup as the `tabs` directive, so the existing runtime handles clicks, arrow keys, Home and
End; the only diagram-specific browser code is the view fit controller described below. The default view carries `data-layout-default`; print CSS shows
only that panel and hides the switcher.

Every diagram SVG has its natural width and a `--diagram-width` custom property. The page shrinks a diagram
wider than the column, but not below three quarters of that width; the rest scrolls inside the frame, and in
print the diagram fits the sheet whole. The frame shares the scroll cue of tables, code blocks, and tab
lists: a shadow in the block's own ink at each edge that still has content beyond it, visible on light and
dark surfaces. Until the reader picks a view, the runtime's diagram fit controller watches each view
switcher with a `ResizeObserver` and, when the authored view would have to scroll at three quarters of its
natural width, activates the widest view that fits, or the narrowest one when none fits, through the same
tab activation. A flow authored left to right therefore appears top-down on a phone or beside a docked
sidebar. The authored view stays the default in print, and a reader's own tab choice is never overridden.
When the shown view still has to scroll, the controller scrolls its frame once so that the nodes of the
first layer (`data-layer="0"`) are centred, both for the view it picked and for a view the reader picks;
the first look is then the start of the flow rather than its cut middle.
Edge-label plates are opaque and use the visualization surface, so a label reads in accent and contrast
sections as well.

### Sequence layout

Participant names wrap by words in boxes at most 128 wide; a single word longer than that widens its box
instead of being cut. The gap between two neighbouring lifelines grows for the labels of messages between
exactly those two participants and for self-message loops, each capped at 240, within a 640-pixel width
budget, which is the report column beside `contents` at a 1100-pixel window; a message crossing several
participants uses the sum of the gaps. A message to its own participant is a loop to the right, or to the left
for the last participant, so it never widens the picture on its own. Flow layout uses the same 640-pixel budget
when it compares candidates.

### Why the rest is package-owned

Charts, sequence diagrams, and timelines use package-owned compile-time SVG/HTML. The bounded
comparison found that [Chart.js renders canvas whose accessible alternative remains the integrator's
responsibility](https://www.chartjs.org/docs/latest/general/accessibility.html),
[Mermaid defaults to non-deterministic IDs and exposes a broad security-sensitive diagram
configuration](https://mermaid.js.org/config/schema-docs/config.html), and
[Vega-Lite compiles a broad JSON grammar into Vega specifications](https://vega.github.io/vega-lite/docs/)
while covering charts rather than the complete diagram/timeline surface. The local package spike measured
published tarballs at 1,576,314 bytes for Chart.js 4.5.1, 17,619,777 bytes for Mermaid 11.16.1, and
1,078,939 bytes for Vega-Lite 6.4.3. Those libraries would bring their own grammar and browser runtime,
so the closed renderer keeps charts, sequences, and timelines free of any runtime, network behavior, CSP
directive, or output-format branch; only flow layout borrows the algorithms of dagre and ELK at build time.

## Embedded video

The resource step of `src/render/markdown.ts` runs after sanitization and turns two sources into a player: a
Markdown image whose file is a video type, and the `video` directive, which the registry renders as a
`figure.semantic-video` carrying only its validated `src`, `poster`, and `caption`. `<video>` and `<source>`
never pass through the sanitizer; the package builds them from those values. The video and poster use the same
local-asset path as images: confined to the source root, `data:` URLs in `single-file`, content-addressed
files in `directory`, recorded in the source digests, and counted toward `output.maxInlineBytes`. The Content
Security Policy gains `media-src` with the same sources as `img-src`.

The player is muted, looping, inline, with controls, and carries `data-video-autoplay`. Playback belongs to
`src/browser/video-autoplay.ts`: an `IntersectionObserver` plays a video while half of it is visible and pauses
it when it leaves, never under `prefers-reduced-motion: reduce`, and a pause the reader made is not undone. A
muted video may start without a user gesture, so no fallback path is needed; a refused `play()` leaves the
controls. Without the runtime the video still plays from its controls.

## Output model

`single-file` embeds CSS, the package-owned runtime, every declared locale variant, local images,
downloadable resources, and declared fonts. Binary resource bytes are encoded as MIME-qualified base64 data
URLs. The `output.maxInlineBytes` budget measures the complete multilingual artifact; above it the build
fails with `INLINE_SIZE_BUDGET_EXCEEDED` rather than warning or switching the format. An image that
appears more than once is embedded once in a data block and counted once.

`directory` writes `index.html` and an `assets/` directory. Browser and source assets receive SHA-256
prefixes in their filenames. A non-empty destination is rejected to avoid destructive cleanup and stale
files. The complete tree is built in a private sibling staging directory and renamed into place. An
existing empty destination is restored if rename fails. Injected partial-write and rename failures verify
cleanup, preservation, and immediate retry.

Single-file output is written exclusively to a private sibling file, closed, measured, and atomically
renamed into place. Both formats refuse to replace a canonical source path or a hard-link alias of an
entry, manifest, included partial, or referenced local asset. Publication failures are structured and do
not report success. Hostile concurrent path replacement and process/OS crash recovery are outside the
proportionate filesystem model. The inline size budget, which fails a single-file build above it, counts the actual serialized CSS, inline
runtime, and image/download data URLs; a font data URL is counted once through generated CSS.

A public URL comes from the primary manifest `url` or from the `build`/`validate`/`inspect` `--url` option
and ESM `url`, which takes precedence; `src/authoring/public-url.ts` is the one validator for the manifest
format, the option, and the JSON Schema format `absolute-http-url`. The loader checks an optional manifest
`image` at its authored field — a PNG, JPEG, WebP, GIF, or AVIF regular file inside the source root. A
`../` path fails as `INVALID_MANIFEST` at the field, a symbolic link resolving outside the root as
`ASSET_OUTSIDE_SOURCE`, and another type or a path that is not a regular file as `INVALID_SOCIAL_IMAGE` with
the field range. Preparation derives the page metadata from the URL,
resolves the image through the same confined local-resource path as content assets, protects it from
output collision like any source file, and publishes the image as a hashed `assets/` file with an absolute `og:image` only for directory
output. It warns with `SOCIAL_IMAGE_NOT_PUBLISHED` when a declared image cannot be published and with
`PUBLIC_PAGE_OVER_CRAWLER_LIMIT` when the serialized HTML of a public page exceeds
`PUBLIC_PAGE_CONTRACT.crawlerHtmlByteLimit` (2,097,152 bytes). Without a URL the document head and bytes are
unchanged.

`build --share` and ESM `share: true` are one build profile over the same preparation/publication path in
both formats. The typed result always identifies the profile and exact neutralized source-link count;
human output states that count for an explicit share build. Validation and inspection do not publish and
therefore do not accept the build-only profile.

Output format, page layout, and theme are independent public data choices. One data-only registry
contract owns their defaults and closed domains: `single-file` uses an inline runtime and `directory` uses
an external content-addressed runtime; layout selects the page composition or the slide deck; the
theme selects the look. Preparation appends the generated theme rules — the page theme, or every built-in
theme plus the page theme when the theme selector is on — to the shared package stylesheet in both
formats. The stylesheet owns reading/standard/wide tracks, section
rhythm, semantic page/section/component/control/current/muted/inverse color roles, the closed section recipe,
composition and media grammar, component containment, and package-only
decorative surfaces. Section tone retains background/foreground ownership, while decorative surfaces change
only the behind-content treatment and nested package components restore their own readable surface text.
Cards, table headers, decision gradients, assets, source links, and response items take their surfaces
from the section's component and control roles, so an accent or contrast section never pairs section text
with a page surface of the opposite lightness. Every content image on a dark surface gets a light backing
(`--media-backing`) behind its transparent pixels, because screenshots and exported schemes are usually
drawn dark on a transparent page; opaque pixels hide it. The backing follows the surface rather than the
page theme. A contrast section (`tone="contrast"`) is the opposite scheme of the same theme: every scheme
block also declares the other scheme's colours as `--inverse-*`, and the section maps each colour role,
`color-scheme`, and the semantic roles onto them. Accent, focus ring, marker, chart series, media backing,
and code colours inside the band are therefore the pairs the contrast check already verified for the
other scheme. The console treatment keeps its own band — an accent frame without inversion. Toned sections use the same inset and
a 1-pixel border box as decorated ones, so every boxed section starts its content at one left edge.
The callout kinds `success`, `warning`, and `danger` (alias `error`) take a signal colour for their rule
and a light tint; any other `kind` token keeps the accent. Above 48rem inline code in table cells does not
wrap, so a table wraps its prose column instead of breaking a path at its hyphens; on phones code wraps
and every cell keeps a 7rem minimum, so a narrow table scrolls with readable columns.
Composition tracks expand separately from the prose reading measure. Compact headings scale down, shared
control typography and padding limit bulk, and action groups wrap at content width. Authored modal, popover
and toggle labels remain visible beside their icons on compact screens, the modal close control included.
Visualization surfaces, labels, axes and legends consume local component/control/muted roles. Node and
timeline kind variants layer their signals within the owning rules, preserving distinctions in accent and
inverse contexts.
Full and bounded viewport profiles are capped rather than forcing unbounded empty
height; display/editorial headings retain readable words; and wide media, galleries, tables, charts, and
code scroll only within their owning surface instead of widening the document. After generic directive
enhancement has materialized optional titles and Markdown blocks, the compiler visits every direct cards
rail in a gallery section and marks rails containing at least two direct rendered elements—the exact items
CSS turns into columns. This structural marker drives container-relative next-item preview and direct-item
snap targets. A page-bound `ResizeObserver` controller derives the separate interactive marker from effective
overflow, adding localized focusable scroll-group semantics and rail-only `ArrowLeft`/`ArrowRight` movement
only while scrolling is possible. Repeated rails and viewport changes cannot leave stale semantics, and a
true one-item rail receives neither false continuation nor a scroll announcement.
Sidebar/mobile navigation
exists only with at least two
eligible sections; an authored in-flow map remains ordinary visible content at every inventory size and
viewport. One shell navigation link is always current: direct and descendant hashes resolve through section
ownership, outside targets use the preceding or first section, and geometry uses the sticky-topbar
activation line with deterministic bottom and equal-top rules. Root scroll padding keeps hash/focus targets
below the sticky topbar; primary sections compensate their own block padding. In browsers with `scrollend`,
a smooth hash traversal retains synchronous hash ownership until scrolling settles and then returns to
geometry; other browsers debounce the scroll signal into one terminal geometry pass. When
`IntersectionObserver` is unavailable, those same terminal and resize boundaries run the total geometry
selection directly instead of scanning on every scroll signal. Desktop collapse is non-modal and
session-only; after the reader's first toggle the docked panel slides in from the start edge when it
returns. Mobile moves the same nav into a native modal dialog drawn as a full-height side panel that slides
in and out, with inert background, cyclic focus, Escape/backdrop/Close return, link-to-heading focus, and
safe breakpoint closure.

Both formats contain one inert escaped review-target manifest per locale variant. Reviewable
container directives that survive enhancement as DOM owners and ordinary Markdown blocks carry deterministic
`data-review-target` identities. The registry-owned review-ownership contract assigns structural chart
`series` data to the chart target instead of
creating an orphan target after compile-time SVG enhancement. The
manifest contains source-root-relative ranges and SHA-256 fingerprints, not source bodies or workstation
paths. Its report revision covers the confined entry, manifest, expanded partials, referenced local resource
bytes, review/source-contract versions, target-algorithm version, and canonical target inventory; it is
independent of output destination and format. A 5,000-target and 750,000-byte manifest limit bounds
artifact/runtime input; review files are limited separately before JSON parsing. Node-side target collection
passes the count bound into shared validation explicitly, so the browser bundle has no process-environment
lookup and the default is identical in both output formats.

When at least one target exists, the shared document shell includes one Review entry, one native review-list
dialog, one anchored thread popover, and one contextual action. There is no review mode and no control or
outline is injected beside a target. A valid native text selection in report content exposes the localized,
viewport-clamped **Create note** action. The controller snapshots its exact range before focus changes and
opens the popover beside the selection; compose, ordered history, edit, resolve, and reopen stay at that text
locus. Empty, whitespace-only, oversized, outside-report, and package-control selections expose no action.

Current exact ranges are reconstructed from review selection anchors and registered as separate open and resolved
CSS highlights without rewriting authored DOM. A pointer or touch point is compared with the actual range
rectangles; overlapping matches choose the unresolved, shortest, then lexically stable thread. Focusable
fixed overlay markers give each highlight a keyboard route without affecting layout. Re-selecting an exact
saved subject resolves the contextual action to its existing thread instead of creating a duplicate. Window
and `visualViewport` scroll/resize updates are coalesced and run only while an action, popover, or saved range
exists. Desktop popovers flip, shift and clamp around their anchor; mobile uses a bounded bottom surface
inside the visual viewport. This preserves report geometry while browser chrome or the on-screen keyboard
changes the visible area. Contextual actions and focus markers use a visible rectangle from their live range,
measure their own surface before two-axis clamping, and hide when the range is wholly offscreen. A focus
marker prefers a fully separated position above the range, then below it, before edge clamping, so the marker
and highlighted text remain independent activation targets. Navigation, Review, language, theme, and scheme controls use
distinct package-owned topbar icons. Each available control retains a localized accessible name and title
tooltip; the native language selector remains the locale input and receives visible focus after switching.
At constrained widths visible labels and secondary page identity are omitted, coarse pointers receive larger
targets, and the document has no artificial minimum width. Visible contextual/action controls retain their
labels while package-owned icons default to 16 pixels; the selection action switches pencil/comment
visibility without replacing either SVG node.

The topbar Review action opens only the current/prior thread list plus import/export. Desktop shows a fixed
non-modal overlay and mobile a native modal bottom sheet; neither mode changes report width, margin, or
authored flow. Choosing a current or bindable prior item closes the list, brings its target into view, and
opens the same anchored popover. Valid legacy whole-block threads remain list-accessible but the reader
cannot create a new one. List-origin popovers return focus to the visible Review entry rather than a control in
the closed list; other close paths return to their relevant opener. State remains in memory until explicit
canonical import or download.

Single-language review protocol version 3 stores discussion threads as ordered revision segments.
Multilingual version 4 has the same thread model and additionally requires `report.locale`; browser export
uses the active locale, and the shared Node router selects that still-declared locale before binding. A
version-4 target may remain `missing` within its locale when its old source and targets disappeared; a
foreign locale is rejected without substituting another variant. Legacy v2/v3 input first uses a unique
matching report revision and otherwise follows the primary-locale migration rule. Each segment owns its
report revision, source target, optional selected-text anchor, ordered user/agent messages and resolved flag.
An anchor repeats the start target as an enforced invariant and supplies the end target, code-point offsets,
and bounded NFC quote. Subject uniqueness distinguishes a whole-block thread and multiple ranges on the same
target while rejecting duplicate exact subjects. A changed continuation appends a current segment without
rewriting historical targets or messages. Equivalent artifacts serialize deterministically without clocks or
random IDs. Valid version-2 whole-block artifacts normalize losslessly to version 3; a selection field cannot
masquerade under the closed version-2 schema. The browser can edit messages and resolve or reopen a thread;
ordinary decision/checklist directives remain static report content and create no review requirements or
approval gates. Version-1 formal review files fail at the version boundary without changing current state.

An optional confined prior-review sidecar enters common preparation before publication. Preparation routes
its locale/revision, then embeds the parsed artifact plus exact/changed/missing/ambiguous bindings only in the
selected variant; it never embeds the sidecar path. Exact revisions resume current locale state. Stale
threads render as prior evidence. Invalid, foreign-locale, ambiguous, or colliding input fails before
authoritative output replacement.

`progress` defaults to `none`. With `page`, in normal motion only, the runtime appends one decorative line to
the top bar, installs one passive document scroll listener and one resize listener, coalesces updates through
one animation frame, and changes one `scaleX()` transform. With `chapters`, in every motion profile, it
appends one segment per top-level section to the top bar and sets each segment's fill from the part of its
section already read, through the same coalesced listeners; segments are links to their sections and are
hidden from assistive technology, which has the contents navigation. On a landing page the navigation
controller keeps the contents in the dialog at every width (`data-nav-mode="dialog"`) unless the theme's
landing treatment is the side column; the compiler wraps the title, introduction, and a first section with
`place="opening"` in one `.page-opening` frame without changing reading order. The story controller installs steps scenes (an
IntersectionObserver per scene picks the beat crossing the middle of the screen, sets the active image and
the lit nodes and edges), line-by-line titles (a measured line count drives a masked, stepped reveal), and
count-up numbers, and tears them down on locale switch or when the width or motion preference changes.
Diagram drawing is pure CSS: the compiler orders each connection along the flow and writes its share of a
view timeline. The WebGL threads of `media-effect="threads"` are a built-in effect of the effect engine
(`src/browser/effects/`, built to `dist/browser/effects.js`), appended to the runtime script only for pages
whose HTML carries `data-webgl` or an effect extension; how the engine draws them is described under
[Level 2 — effects and the effect engine](#level-2--effects-and-the-effect-engine). For `layout: slides` the compiler wraps the content before the
first section into a title slide and numbers slides and their `appear` steps; the slides controller owns
the deck state, the address, the keyboard, click, swipe and button input, the published transition
durations and the settled signal, and the navigation controller keeps the contents in its dialog. Section transition, scene, interaction, and choreography roles default to `none`
when no recipe supplies them; explicit attributes override recipe defaults.
Reveal and legacy `reveal=true` use a one-time 24-pixel, 420-millisecond entrance on section contents while
the anchor owner remains stable; stagger applies it to at most 12 direct children in 90-millisecond steps.
The one-shot observer activates on viewport intersection without requiring a fraction of the section's
height, so long content remains reachable. Progress scenes drive normalized media movement and bounded
mesh/glow surface movement, while
sticky scenes return to normal flow at 48rem and below. Cascade orders at most 12 semantic cards, chart
points, or timeline items in 75-millisecond steps. Fine-pointer depth, tilt, and primary magnetic effects are
bounded to 24 pixels, 4.5 degrees, and 9 pixels; visibility gates and one animation frame coalesce their
updates. Reduced motion installs no progress/entrance/scene/choreography/pointer machinery and leaves no
hidden pending content; coarse pointers receive no pointer effects. An absent or non-callable
`IntersectionObserver` leaves sections visible while navigation retains hash, activation-line, equal-top,
resize, short-final and document-bottom ownership through bounded terminal geometry selection.

## Page clock

Every time-based behaviour of a built page reads one clock, `src/browser/clock.ts`. The runtime creates it
before anything else; the effect engine, built as a separate script, finds the same instance on `window`
under `Symbol.for('agentic-report.clock')`. Page code asks it for the time (`now()`), for an animation frame
(`frame`, `cancelFrame`) and for a delay the reader can see (`later`, `cancelLater`: the slide settle
signal, the popover close delay, the copy label reset, the navigation scroll fallback), and a subsystem
whose state is a function of time subscribes with `register({ at(seconds) })`, which returns its
unsubscribe function. `registerTimed` is the same call for code outside the runtime. Today the count-up
numbers, progress scenes, chapter and page progress bars, the diagram motion module
(`src/browser/diagram-motion.ts`: diagram drawing without scroll timelines, the draw marker, route pulses,
the zoom camera and chart growth), the layout and motion modules (screens, page states, the scrub scene,
the thesis fill, the current row), the island controller and the effect engine (for every effect, including
the WebGL threads) subscribe. Delays that only defer input handling or release an object URL stay on the
browser's `setTimeout`, and embedded videos keep their own playback time.

The clock has three modes, chosen once when the runtime starts:

- `real`, the default. Time, frames and delays are the browser's own, and the page behaves as if the clock
  were absent.
- `manual`, when `window.__agenticReportClock === 'manual'` before the runtime runs. A recorder sets it with
  Playwright `addInitScript`; the snapshot command takes that one-line script from
  `MANUAL_CLOCK_INIT_SCRIPT` in `src/page-clock.ts`. The clock replaces `performance.now`, `Date`, `requestAnimationFrame` and
  `cancelAnimationFrame`, so time stands still from 0, and defines `window.__clock` with the contract
  agentic-screencast uses: `seek(seconds)`, `now()` and `realNow()` in milliseconds. `seek(t)` runs the
  delays that fall due, in order and with the clock at their due time, calls every `at(t)`, calls a page
  `window.renderAt(t)` if one exists, runs the frame callbacks queued before the seek once, and finally
  pauses every Web Animation (CSS animations and transitions included) at `t` minus the clock time at which
  it started, and every SVG at SMIL time `t`. Animations that start between seeks — a section revealed by
  an intersection observer, for example — are paused at their first frame on the next real animation frame,
  so they never run on real time; animations seen once are remembered, so a backward seek restores one that
  had already finished. Scroll-timeline animations follow scroll position and are left alone.
- `external`, when `window.__clock` already exists, which is how agentic-screencast opens a page as a scene.
  Its init script has already replaced time and frames; the page clock only wraps `window.renderAt`, so the
  film's seek also runs the page's due delays and `at(t)` subscribers.

Scroll-driven effects are functions of scroll position, and a seek recomputes them from the current
geometry. A recorder can set their progress directly instead: the attribute `data-clock-progress` (0–1) on
a `scene="progress"` section or on the image of `media-effect="threads"` replaces the measured progress on
the next frame or seek, and an overridden progress scene drops its smoothing transition so the value shows
exactly. `agentic-report snapshot` uses the manual clock: after its scroll pass it seeks to 10 s and then
11 s, so every entrance, count and slide transition has finished and repeated runs give identical frames.
It then photographs every stop — each screen of `layout: screens`, and each step of a live scrub scene set
through `data-clock-progress` on the section — one seek later each.

## Interface system

Every interactive or labelling element of a page is an interface primitive with one form on the whole
page. The primitives are: `ui-button` (variants `primary`, `secondary`, `quiet`; sizes `sm` and `md`;
flags `data-ui-icon-only` and `data-ui-toolbar`), `ui-field` (input, select, textarea), `ui-field-group`
(a label above its field), `ui-label` (field label, number, status, severity, table header), `ui-meta`
(time, path, counter), `ui-chip`, `ui-title` (component title, set in the body face — display type stays with page and chapter titles), `ui-item-title` (item and group title),
`ui-tabs` and `ui-tab`, `ui-row` (disclosure summary, video chapter, thread row; sizes `sm` and `md`),
`ui-switch` (a track with a thumb), `ui-choice` (a themed radio or checkbox with its label), `ui-range`,
and `ui-panel` (popover and dialog surface).

Markup gets its primitives in one place: `src/render/ui-primitives.ts` holds the rule table and the
`rehypeUiPrimitives` pass, which runs after asset embedding and adds the class and `data-ui-*` attributes
to directive output. Elements the browser runtime creates take the same classes through
`src/browser/ui.ts`, and the shell (`src/render/document.tsx`) writes them directly. The glossary term
button and the review highlight marker stay outside the system: one is part of a sentence, the other is a
mark over the text.

`src/browser/document.css` orders its rules in cascade layers
`base, defaults, components, primitives, contexts, treatments`, and hidden elements are one unlayered
`[hidden] { display: none !important }`. The layers divide ownership:

- `defaults` gives primitives their layout — display, width, margins — so a component may place, stretch, or
  hide an element.
- `components` owns composition: position, spacing, grids, and component surfaces. It does not set the
  typography, height, border, or padding of a primitive.
- `primitives` owns the look of each primitive and wins over every component rule, so no component can
  set a button or a label its own size.
- `contexts` changes the scale where the reader's situation changes it: under a finger
  (`pointer: coarse`, not window width) `--control-height-md` and `--control-height-sm` grow to
  `--control-touch` (44 px); reduced motion zeroes `--duration-ui`; print shows a diagram's authored view.
- `treatments` restyles whole variants for a theme ornament: the ledger topbar squares toolbar buttons,
  the console sets buttons in monospaced capitals, brackets labels, dashes fields, and squares checkboxes and the switch track, and a blueprint
  surface sets component titles in monospaced capitals.

Sizes come from scales, not numbers. Type uses `--text-label`, `--text-xs`, `--text-sm`, `--text-md`,
and `--text-lg` with weights `--weight-regular`, `--weight-medium`, and `--weight-strong`. Control heights
come from the theme's `controls` (`regular`: 36 and 32 px, `compact`: 32 and 28 px) as `--control-md` and
`--control-sm`; elements read `--control-height-md` and `--control-height-sm`, which the touch context
raises. Rows use `--control-row` and the topbar `--control-toolbar`. `tests/unit/theme-tokens.test.ts`
refuses a literal colour, typeface, radius, weight, or type size in the stylesheet, except for named
prose and SVG-label cases.

Text set in the heading face never breaks a word. The protection follows the typeface, not a tag list:
`src/render/heading-fit.ts` covers every element the stylesheet sets in `--font-heading` — page, chapter,
and block titles, timeline event titles, and the pull quote of a display section — and a new element in
that face joins its list. It writes the letter count of the longest word as `--heading-word` on those with
a word of five letters or more (the widest embedded face in capitals, at the largest phone size, fits only four letters in the narrowest column), and the stylesheet caps the heading size at the width of the heading's own column divided by that
count and by the letter width of the heading face, `--display-advance`. The column width is `100cqi`: the
content column, the text column of a two-column first screen, and each timeline event are inline-size
containers, so the cap holds on phones, tablets, desktops and portrait monitors alike. A width container
scopes CSS counters to itself, so figure numbers are not a counter: `src/render/figure-numbers.ts` numbers
charts, diagrams, and timelines in document order at compile time and writes `data-figure-number` on the
caption, which the stylesheet shows as «Fig. 01». Chapter numbers come from the same list that builds the
contents block and the navigation: `src/render/navigation.ts` writes each chapter's place in that list as
`data-chapter-number` on its heading, so a chapter carries one number everywhere, including the section
the first screen moves out of the article. Only counters that live inside one list remain CSS counters. That width belongs to the typeface:
every embedded family carries a measured `advance` (widest average letter of long Latin and Cyrillic words,
lowercase and capitals, at weights up to 800) in `THEME_FONT_FAMILIES`, and `theme-css.ts` adds the theme's
case and tracking. A family with an optical-size axis (`opticalSize` in the same table: Literata and Playfair)
is embedded as the `opsz`+`wght` file instead of the `wght` file, the stylesheet sets
`font-optical-sizing: auto` on the root, and its `advance` is the widest value across 16–100 px in that mode.
`typography.headingMeasure` becomes `--heading-measure` (`initial` when unset), which replaces the package
measure of the page title (the reading measure in an article, 13–17ch on landing and first-screen layouts)
and of display and editorial section titles (10–17ch). An own theme that picks a wide face is therefore protected without any extra setting; an
author's own heading font gets the widest width through `--display-advance-author`, which the fit reads before the theme value, since the package has not measured it.
`typography.displayScale` only chooses how large display titles are. Headings are never narrower than their
longest word and are not hyphenated. On phones a gallery rail card takes almost the whole column, and a
linked card keeps room for its corner arrow only beside its title, so body words fit as well.

`tests/e2e/ui-system.spec.ts` builds six examples with the theme selector and checks, in every built-in
theme and scheme, that one primitive of one variant, size, and context has one signature (typeface, size,
weight, case, tracking, scale height, border, radius); that heights come from the scale and grow only
under a finger; that every interactive element is a primitive and every hidden element stays hidden; that
print shows the authored diagram view; that the contrast band keeps focus, accent, links, and captions
readable and the skip link reads; that no text in the heading face, and no long word of body text outside
code, breaks or widens the page — built-in themes at 304 and 390 px (1440 px for the widest faces), in
English and Russian, finding heading text by its computed typeface; that own themes with the widest face,
lowercase and in capitals, keep every example whole at 304, 390, 1024, 1440 px and 1080×1920, with no
heading leaving its column; that an author's heading font gets the widest letter width; that figures
are numbered in a row even when one sits in the first-screen column; and that a chapter has the same number
in its heading, the contents block, and the navigation.

## Public site staging

The public site is not a compiler mode or a multi-page framework. `scripts/build-site.ts` reads the closed
`website/routes.json` inventory with its declared public `origin`, invokes the normal page compiler
independently for the landing, each showcase, and each rendered documentation page, and copies canonical
direct Markdown/text/skill files without rewriting their bytes. Every page route is a directory index built
in `directory` format with the public URL of its place in the tree (`examples/document/index.html` →
`<origin>/examples/document/`), in a private scratch directory whose files are then moved into the staged tree
without overwriting any staged file; the landing's tree is therefore the site root while every other route
lives below it. After all routes are staged, the assembler runs the package `generateSitemap` operation,
so `sitemap.xml` and `robots.txt` come from the pages' own canonical URLs. It publishes the complete new tree
by one sibling-directory rename and refuses an existing destination.

Every staged route is relative and confined to the output tree. Every declared source is relative to
`website/` and confined to the repository before use; copied sources must be ordinary non-symlink files.
The deterministic `release.json` records package/engine identity, a caller-supplied complete Git revision,
canonical skill identity, route hashes, and the sorted complete file inventory. It deliberately omits a
build timestamp, workstation path, credential, and self-referential hash. The same inputs, package build,
and revision produce identical staged bytes.

The human docs, direct agent quickstart, complete agent reference, source contract, canonical skill, and
`llms.txt` are available under the same static origin as the product-built landing and separately built
examples. Every staged bilingual demo and the landing also expose their canonical English and Russian
Markdown entries as direct copy routes. Hosting is outside the compiler. A valid deployment serves these files, including
`robots.txt` and `sitemap.xml`, directly with appropriate MIME types, a real 404 rather than an SPA fallback, and ordinary publicly trusted HTTPS. The reference
Nginx policy requires every mutable HTML, Markdown, manifest, and release-metadata route to revalidate while
allowing a one-year immutable cache only for filenames containing the compiler's 12-hex content hash. ETag
remains enabled for both families so unchanged conditional requests can return `304` without risking a stale
mutable landing or document.

The product landing is compiled as an ordinary multi-scene bilingual input rather than receiving a site
assembler theme or runtime hook. Its first viewport, theme chooser, author path, public gallery, Review
explanation, agent setup, and trust boundary use the same registry-owned recipes, media, motion, cards, and
actions as package consumers. Every starter, the complete visual/interactive/data catalogs, Terminal and
noir showcases, Executive brief, Motion showcase, decision showcases, and Review/Response workspaces are separate bilingual
compiler invocations. Preview images never replace their independently staged live pages or direct Markdown
routes.

The canonical skill is instruction-only. Its OpenAI and Claude plugin manifests point to the same
`skills/` folder and carry the same package version, license, homepage, and compatibility contract.
Repository/marketplace metadata is community distribution metadata; it grants no deployment, publication,
credential, remote-source, or unrelated mutation authority.

## Release provenance boundary

`scripts/check-package.ts` writes the exact accepted local-candidate record both beside its unique tarball
and at the stable ignored `test-results/package/candidate-evidence.json` handoff path. GitHub publication
must bind those tarball bytes to the canonical public asset before npm consumes its URL. The release
operator verifies the asset hash, inspects the complete public npm version document, and stops on any
identity mismatch or sensitive value. Registry queries, network access, authentication, publication, and
deployment remain operator actions described by `docs/RELEASE.md`; none enters the compiler, CLI, ESM API,
browser runtime, or a separate release-validation subsystem. The clean consumer initializes and edits a
starter, lets `build` itself reject an invalid source without replacing output, then reaches a successful
artifact by correcting the source and running build directly. Optional analysis commands retain independent
coverage and are not part of the first-use prerequisite chain.

## Security properties

- HTTP(S) image sources fail instead of triggering a network request.
- Relative source paths are decoded, resolved, canonicalized through filesystem links, and confined to
  the canonical source root before their contents are read.
- Raw Markdown HTML is not enabled, and content is sanitized before trusted renderer plugins run.
- Template partials are Markdown text; directives are allowlisted data; neither can execute author code.
  Author code enters only through extensions the page declares (see [Extensions](#extensions)): an
  effect is bundled and allowed by its hash in the page policy, only on pages that use it; an island runs
  in a sandboxed frame with an opaque origin and its own `default-src 'none'` policy, without network or
  access to the page; a provider runs locally at build time, with a minimal environment, like any build
  script the author chose, and its output is sanitized like authored Markdown.
- Generated documents receive a Content Security Policy matching their output format and package runtime.
- Review metadata is inert escaped markup; review inspection reads only a confined ordinary bounded JSON
  file, rejects unknown fields and unsupported versions, and never evaluates thread messages.
- Package-owned inline JavaScript escapes HTML script terminators before insertion and CSP hashing.
- Unexpected internal errors are projected without causes or source bodies. Expected diagnostics and
  public transport results retain actionable structure while centrally replacing recognized
  credential-bearing values with `[REDACTED]`.

## Extension boundaries

The unit of the directive vocabulary is the block module described under Modules: one `defineBlock` call
carries everything the package knows about a directive, and a new built-in directive is one new module
listed in `src/blocks/index.ts`. The registry assembles its directive list from the blocks, so the
directive schema, the sanitizer, discovery, the generated catalogue and the coverage checks all follow
from the same definitions; the directive core dispatches to the blocks by name and names only the
document-wide concepts listed there. The typed registry still owns interaction behavior identities, page
layouts, built-in themes and the theme field contract, schemes, capabilities, output behavior, and
example/starter metadata. Its schemas, discovery values, generated documentation projections, and
examples are integrity-checked together.

The block interface is internal in this stage: the built-in blocks are its only users, and nothing in the
public API or the published declarations exposes it. Built-in blocks keep their styles in the package
stylesheet (`styles: 'package'`) and their messages in the package catalogue, which the browser runtime
shares; the `strings` and `styles` fields exist so that a block shipped outside the package can bring
token-only styles and its own messages, and `runtime` is metadata naming the controller the runtime will
mount. A page brings its own blocks, providers, effects and islands through the page extensions described
under [Extensions](#extensions); a composite block or provider becomes a `defineBlock` module built from
its manifest, so it is read by the same grammar as a built-in block. Extensions belong to one page and
never enter the package registry, its schemas or its catalogue. A large dependency added to the package
itself requires one bounded source-and-spike review, followed by an implementation decision; formal
multi-attempt admission research is outside the product process.

## Extensions

What is specific to one design is built through extensions a page declares, not in the core. The page
lists extension manifests in its `extensions` metadata field; each path is relative, confined to the
source root like a partial, and names a `.yaml`, `.yml` or `.json` manifest. `src/source/load-source.ts`
passes the list to `src/extensions/load.ts`, which validates each manifest strictly (unknown fields,
missing fields, wrong types, a name equal to a built-in directive, `island` or another extension) and
refuses with `EXTENSION_*` diagnostics carrying the manifest file and the range of the field. Paths
inside a manifest stay inside the manifest's directory. The format is specified in the source contract,
section [Extensions](product/source-contract.md#extensions). A manifest with fewer than two `examples`
builds, with the warning `EXTENSION_EXAMPLES_MISSING`, because two unlike examples are what
`effect-check` needs to check it.

A page with extensions is built with its own vocabulary (`src/extensions/vocabulary.ts`): the built-in
directives and blocks plus what its extensions add. The directive core takes that vocabulary as a
parameter (`remarkSemanticDirectives` and `rehypeEnhanceDirectives` options), and the sanitizer schema is
projected from it with the same `projectSemanticSanitizeSchema` that projects the built-in one. A page
without extensions uses the built-in vocabulary and is built byte for byte as before.

**Composite block (`kind: block`).** A Markdown template made of existing directives with `{{attribute}}`
and, for a container, `{{content}}` placeholders. The loader compiles the template once and refuses a
placeholder that names no attribute, one inside code, one inside directive attributes but outside a
quoted value, and `{{content}}` that does not stand alone on its line or belongs to a block without the
container form (`EXTENSION_TEMPLATE_INVALID` with the template line). At build time the remark plugin
`remarkExtensionExpansions` runs before the built-in directive checks: it reads the author's directive
with the manifest attributes through `interpretDirectiveAttributes`, substitutes each value escaped for
its context — in Markdown text every ASCII punctuation character is backslash-escaped and whitespace runs
become one space; in a quoted attribute value quotes, braces, `&`, angle brackets and line breaks become
character references — parses the result with the page's parser, and puts the author's own body nodes
where `{{content}}` stood. The expansion then passes every built-in check, sanitization and rendering
like authored Markdown. Its nodes take the position of the author's directive, and `origin.ts` records
the template line each came from, so a diagnostic inside an expansion points at the author's directive
and carries `details.extension`, `details.template` and `details.templateLine`. Expansions nest up to
eight levels (`EXTENSION_EXPANSION_DEPTH`), and all expansions of a page together produce at most 10 000
Markdown nodes (`EXTENSION_EXPANSION_TOO_LARGE`), so a template that uses its own directive several times
fails instead of growing as a power of the depth.

A block may bring `styles`, a `.css` file. The loader checks it with the literal rules of the package
stylesheet (`src/authoring/style-rules.ts`, the same module the unit test of `document.css` runs) without
the package's named exceptions, plus isolation rules — only public theme tokens and the `--text-*`,
`--weight-*` and `--heading-fit` scales are read, no variable is declared, braces balance, no at-rule
besides `@media` and `@container`, nothing is loaded, no `\` or `<` — and refuses a violation with
`EXTENSION_STYLES_INVALID` (styles above 8 192 bytes: `EXTENSION_STYLES_OVER_BUDGET`). It nests the rules
inside `[data-extension-block="<name>"] { … }`. The expansion marks every top-level node of the template
with that attribute (`hProperties.dataExtensionBlock`; the directive phase keeps it when it renders a
directive, and the page's sanitizer schema admits it only when a block with styles is declared).
`assembleExtensions` collects the styles of blocks the page used, and `prepare-report.ts` appends them to
the page stylesheet, where they count towards `output.maxInlineBytes`.

**Provider (`kind: provider`).** The same expansion point runs the provider's `command` — an argv, no
shell, the extension directory as working directory, the minimal environment from
`src/config/environment.ts` (`getProviderEnvironment`) — once per distinct input per build. Standard input
is JSON `{ name, attributes, content, language, data, source: { file, line } }`, where `data` maps the
name of each data file the page declared (`src/source/load-data.ts`, read and confined to the source root
before rendering) to its parsed value, so a provider reads data beside the page without receiving a path;
the data are part of the cache key. Standard output is Markdown,
parsed, validated and sanitized as authored Markdown, so a provider can produce only what an author could
write. A timeout (`timeoutMs`, default 10 s, at most 120 s), output above 1 MB, a non-zero exit or output
that is not UTF-8 fail the build at the author's directive with the tail of the provider's standard error
in `details.stderr`. Diagnostics inside provider output carry `details.providerOutputLine`.

**Island (`kind: island`).** A page with islands gets the `island` block: `:::island{name hydrate height
title}` whose Markdown body is required (`EXTENSION_ISLAND_STATIC_REQUIRED`) and is the static
equivalent. At build time `island.ts` assembles the island document from its HTML entry: scripts with
`src` become inline scripts, stylesheet links become `<style>`, images and `url()` references become
`data:` URLs; a reference that is not a declared asset, and any network address, is refused
(`EXTENSION_ISLAND_REFERENCE`), as is an inline event handler attribute. The document gets its own policy
(`default-src 'none'`, scripts by hash, inline styles, `data:` images, fonts and media) and a
package-owned bridge script first. The figure carries the static body and the document in
`data-island-document`; a `srcdoc` document inherits the page policy, so the hashes of the island's
scripts are added to the page's `script-src` — only on pages with a live island (`frame-src` is not
needed for `srcdoc`). The controller `src/browser/islands.ts`, built to `dist/browser/islands.js` and
appended to the runtime only on such pages, creates `<iframe sandbox="allow-scripts">` at `load`, when
idle, when visible, or never (`none`). Messages use protocol `agentic-report-island` version 1: the page
sends `init { tokens, scheme, language, reducedMotion }`, `theme { tokens, scheme }` when the root's
attributes or the system scheme change, `renderAt { t }` from the page clock (`registerTimed`) and
`resize { width, height }`; the island answers `ready` and `height { px }`. The bridge applies tokens as
custom properties on the island root and exposes `window.agenticReportIsland.on(type, callback)`. Until
`ready` the static body shows; print and readers without scripts always see it, never the frame.

**Effect targets (`kind: effect`).** An effect declares target attributes with closed values on built-in
directives. The page vocabulary adds them to those directives only when the page declares the effect, so
elsewhere they are unknown attributes; the value reaches the element as `data-effect-<name>-<attribute>`,
and the sanitizer allows exactly those properties. `targets.ts` counts the directives that accepted a
target and the elements that still carry it in the final HTML. An effect with at least one host is bundled
by `bundleEffect` (`src/extensions/effect-bundle.ts`) and placed after the runtime and the effect engine
(`dist/browser/effects.js`): inline with its hash in the page policy in single-file output, as
`assets/effect-<name>.<hash>.js` in directory output. A declared effect without hosts is not bundled.

**Build report.** `build` returns `extensions` for a page that declares them: per extension its `kind`,
`uses` (across language variants; for an effect, the elements carrying it), `bytes` of the bundled effect
or the island document, and `notes` (declared but unused, hosts lost during rendering). `inspect` lists
the declared extensions with their manifest, attributes or targets and uses.

### Level 2 — effects and the effect engine

**Authoring entry.** An effect module imports `defineEffect` and the types of its context from the
package subpath `agentic-report/effect` (`src/effect.ts`, the only export besides the root) and exports
`defineEffect({ mount(ctx) { … return { at(t, progress), rebuild?(), unmount?() } }, continuous?, ownsScroll? })`
by default. `defineEffect` returns its argument; the types are the contract.

**Bundling.** `bundleEffect` (`src/extensions/effect-bundle.ts`) loads esbuild (an exact runtime dependency)
lazily, only when a page declares an effect; a missing platform binary is `EXTENSION_BUNDLER_UNAVAILABLE`,
not a crash. The entry imports the author's module and pushes `{ name, selector, ownsScroll, definition }`
to `globalThis.__agenticReportEffects` (`src/extensions/effect-registration.ts`); the selector is
`[data-effect-<name>-<attribute>]` for each target attribute. The bundle is one minified classic IIFE for
ES2022 browsers: `agentic-report/effect` resolves to an in-memory module with the identity `defineEffect`,
any other `agentic-report` import and any import left external refuse the bundle
(`EXTENSION_EFFECT_BUNDLE_FAILED`, with the author's file and line when esbuild gives one), legal comments
stay inline, and the texts of the declared `licenses` files are prepended as comments. A bundle above
`budgetBytes` (default 80 000) is `EXTENSION_EFFECT_OVER_BUDGET`. The queue lets the effect's script run
before or after the engine.

**Render modes.** The engine (`src/browser/effects/engine.ts`) chooses one mode per page and writes it to
the root as `data-render`: `still` when the reader prefers reduced motion, `static` when a WebGL context
without a major performance caveat cannot be created, `live` otherwise. All three come from one geometry.
In `live`, `at(t, progress)` receives the page-clock time in seconds; in `still` and `static`, `t` is
`Infinity`, so an effect evaluates the final state of its timeline directly rather than playing it
forward. `progress` is the page's scroll progress (0–1, or `data-clock-progress` on the root) in every
mode: `static` means “no WebGL”, not “no scroll position”, and the threads use it to draw the same
unweaving in 2D. The engine lowers a single effect when it fails: an exception in `live` remounts it in
`static`, in `static` in `still`, in `still` it is marked failed; three slow frames at the lowest density
(`webgl-policy.ts`) remount it in `still` with the reason `slow`. `ctx.render` and `ctx.reason` tell the
effect which mode it is in and why. For checks, `window.__agenticReportRender = 'live' | 'still' |
'static'`, set before the page script, forces the mode.

**Time.** The engine is the only owner of frames: it subscribes to the page clock (`registerTimed`), asks
for frames through it, and the context offers no `requestAnimationFrame` or timers. A `continuous` effect
(the default) is drawn every frame while one of its hosts is visible and the page is not paused; an effect
with `continuous: false` is drawn on scroll, resize, rebuild, theme change and clock seek. Under the manual
clock a `seek(t)` draws every effect at `t` synchronously, so two seeks give identical frames. The engine
marks the effect whose code is running (`__agenticReportEffectEngine.current`) and times every call;
`effect-check` reads both.

**The context** (`EffectContext`):

- `hosts` — the elements carrying the effect's attributes, in document order; `attribute(host, name)` reads
  a target value;
- `render`, `reason` — the mode and why it is not `live`;
- `tokens.read(token)` — the resolved value of a token of the public vocabulary (`schema --scope theme`),
  colours as `rgb(r g b / a)`; `tokens.rgba(token)` — a colour as fractions for a shader; a name outside the
  vocabulary throws; `tokens.onChange(callback)` fires when a `data-theme*` or `data-scheme` attribute of the
  root or the system scheme changes;
- `clock.now()` — page-clock seconds; `random(seed)` — a seeded mulberry32 generator;
- `measure.rect(element)`, `measure.lines(element)` — rectangles in page coordinates; the translation of
  elements waiting for or playing their entrance (`data-reveal-*`, running animations) is subtracted, so the
  geometry is the settled one, and page styles are never changed to measure; `lines` leaves out the text of
  fixed and sticky descendants, whose place on the page depends on the scroll;
- `obstacles()` — four layers, each computed on first read: `text` (line rectangles of the page, plus the
  whole box of any element whose `::before` or `::after` generates text), `chrome` (header, navigation and
  controls), `free` (rectangles of at least 24 px with no text within 8 px, found by cutting the page into
  8 px rows and merging the free intervals of neighbouring rows — side margins and gaps between paragraphs)
  and `pinned` (the outermost fixed and sticky elements, `{ element, rect }` with `rect` in viewport
  coordinates at the call). The first three are in page coordinates and do not depend on the scroll:
  whatever lies inside a pinned element belongs to `pinned` only, so two rebuilds at different scroll
  positions measure the same page; an effect cuts pinned elements out of its drawing at their current
  place (`element.getBoundingClientRect()`);
- `layout` — `{ mode, narrow, svh, width }`, narrow at 720 px and below; `svh` is read from a hidden probe
  that stays in the effect layer, once per rebuild, so reading it does not dirty the layout;
  `pick({ wide, narrow })`;
- `progress(host)` — the host's passage through the viewport, or its `data-clock-progress`;
- `canvas({ host, kind: '2d' | 'webgl', layer })` — see below; `webgl` returns `null` outside `live`;
- `events.on('reach' | 'leave', host, callback)` — the host reaches or leaves the middle of the viewport, in
  every mode;
- `state.set(name, value, host?)` — `data-state-<name>` on the host (on all hosts without one), in every
  mode; `false` and `null` remove it; with the document root as `host` it is a page state that lights the
  `when` blocks of the page;
- `state.watch(name, callback)` — called at once and on every change of the page state `data-state-<name>`
  on the root, with its value or `undefined`;
- `rebuild(reason)` — requests a rebuild.

**Canvas service and layers.** The engine keeps one fixed, viewport-sized layer (`.effect-layer`,
`z-index: 25`: above content, below the header and panels, no pointer events, hidden in print) with the
effects' canvases in `layer` order and a `details` layer above them for the effect's DOM details. A canvas
is sized to the viewport at the density of `webgl-policy.ts`, lowered on slow frames, before every `at`;
`anchor()` is the host's rectangle on screen and `toCanvas(rect)` converts page coordinates, so a drawing
follows its host and may leave its box. Each effect gets its own canvas: one WebGL context shared by
independent authors would carry one effect's GL state into another.

**Rebuild and content changes.** `ctx.rebuild(reason)` and the engine's own triggers — which come from the
shared geometry helper (`src/browser/geometry-rebuild.ts`): a change of the viewport width (not height),
fonts loaded, the end of a section's or the first screen's entrance, the tab becoming visible — are
coalesced in a microtask; the effect's `rebuild()` runs, or, without one, the effect is
unmounted and mounted again. The drawing after a rebuild comes in the next frame, not in the task that
rebuilt, so measuring and building and the strokes of a frame do not add up to one long task. Under a
recording clock (`manual`, `external`) frames come only with a seek, so there the rebuilt effect is drawn
at once and the picture after a seek is the rebuilt one. More than six rebuilds of one effect within one clock second are treated as a
loop: further ones wait and the status counts `loopGuard`. A change of the document that changes the set of
hosts — a section deleted, reordered or duplicated, a language switch — remounts the effect with the new
hosts.

**Pause and scroll.** `src/browser/effects/pause.ts` is the page's pause controller, shared by the runtime
and the effect engine through `window[Symbol.for('agentic-report.pause')]`: while any reason holds (the tab
is hidden, the reader pressed **Pause motion**, or `__agenticReportEffectEngine.pause(reason)` was called)
the root carries `data-motion-paused` and continuous drawing stops; a clock seek still draws. A mounted
`live` effect that is `continuous` declares its hosts (`data-continuous-motion`), and the runtime's
`pause-control.ts` puts the button in the flow after them. Below `motion: expressive` the engine mounts
every effect `still` with the reason `motion-level`. At most one effect on a page may
declare `ownsScroll`; a second one is not mounted and reports why. Anchors and focus stay with the runtime.

**The threads effect.** `media-effect="threads"` is the built-in effect `threads`
(`src/browser/effects/threads.ts`) on the same engine. In `live` it draws every image of its hosts with one
shader on its page canvas at the image's place on screen; in `static` a 2D canvas draws the same threads
(`threadColumn`: the same hash, pull, drift, width and fade as the shader) as strips of the image with the
theme accent on their edges; in `still` it draws nothing and the image stays whole. The image carries
`data-webgl-state` (`pending`, `live`, `2d`, `static`, `static-slow`); the stylesheet hides it while a
canvas draws it and shows it in print.

**Status and checks.** `window.__agenticReportEffectEngine` exposes `status()` (per effect: mode, reason,
hosts, the state names it ever set, the tokens it read, rebuilds, loop guards, errors and its longest call),
`rebuildAll`, `resetTimings`, `obstacles`, `pause` and `resume`. `agentic-report effect-check`
(`src/core/effect-check.ts`) uses them; its checks are listed in [Testing](TESTING.md#effect-check).
