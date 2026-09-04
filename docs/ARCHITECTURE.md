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
  supplies its duration/translation to package CSS through runtime-owned custom properties.
- `src/source/load-source.ts` resolves the entry, parses metadata, and expands confined Markdown
  partials. It validates raw metadata shapes before merging and retains metadata/partial provenance for
  diagnostics and output-collision protection. Reads perform lexical/canonical confinement. The product
  deliberately does not implement an inode ledger or defend against hostile concurrent path replacement.
- `src/render/markdown.ts` uses the unified/remark/rehype AST pipeline with GitHub Flavored Markdown table,
  strikethrough, task-list, and autolink-literal parsing. Raw HTML is not passed through; rehype sanitization
  runs before trusted compile-time syntax highlighting. The authoring registry owns the serializable
  code-fence `terms` envelope, shared key constraint, bounds, uniqueness and exact-match policy; discovery
  projects those fields and the mdast parser consumes the same contract before transporting validated keys
  through Shiki metadata. Trusted post-Shiki enhancement splits existing styled HAST spans around bounded
  first glossary occurrences without changing code text. The asset plugin embeds local images, downloads,
  and fonts or copies them under deterministic hashed names.
- `src/review/contract.ts`, `src/review/targets.ts`, and `src/review/binding.ts` own the platform-neutral
  versioned review data contract, bounded canonical serialization, compile-time target inventory,
  local-input revision, and exact/changed/missing/ambiguous binding. The unchanged version-2 target manifest
  is separate from the version-3 review artifact, whose optional selected-text anchor stores full start/end
  target references, Unicode code-point offsets, and a normalized quote. Valid version-2 whole-block
  artifacts normalize into the current shape. Target provenance is captured while AST offsets and the
  partial source map are available; it is never reconstructed from final HTML or matched by proximity.
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
- `src/render/directives.ts` maps the documented, allowlisted directive vocabulary to semantic HAST.
  Unknown directives, invalid attributes/nesting, unresolved glossary references, duplicate definitions,
  and an unmarked first occurrence of a registered glossary term in a section fail with authored-range
  diagnostics. Compile-time
  normalization restores the colon tokens that `remark-directive` misclassifies as text directives: a
  digit-initial name whatever precedes the colon, and a colon written against the preceding word. A spaced
  alphabetic name, any attributed or child-bearing form, and every block-level form stay on the directive
  path, so an unregistered name among them keeps its normal error. Compile-time
  enhancement creates labelled top-level sections, ordinary safe action links, bounded loopback
  source-location links that preserve the report browsing context, native disclosures, and
  accessible package-owned tabs, dialogs, popovers, filters, switches, and bounded counters without
  accepting author code. Authored term labels remain visible forms of one canonical key; appendix glossary
  definitions are moved after review targeting and retain their source identities.
- `src/render/visualizations.ts` projects validated chart series/points, diagram nodes/edges, and timeline
  events into deterministic accessible SVG or semantic HTML. It is compile-time code and does not add a
  visualization browser runtime.
- `src/render/navigation.ts` derives the final explicit-section or legacy H2 inventory structurally from
  enhanced HAST, fills authored in-flow maps with exact headings, and projects optional short labels for the
  shell. Appendix and subordinate headings remain excluded without parsing serialized HTML.
- `src/render/document.tsx` creates the static HTML document from prepared navigation, selected
  registry-owned page layout/tokens, responsive shell, metadata, and content security policy. It allocates
  collision-free shell IDs around authored content IDs and uses them consistently for navigation and
  accessibility relationships.
- `src/browser/` contains the browser runtime and token-based stylesheet bundled by Vite. One delegated
  event controller handles theme/navigation controls, current-section ownership, bounded normal-motion
  progress/reveal, code copying, glossary hover/focus/tap explanations,
  tab selection, modal/popover focus, filtering, switches, and bounded counters. A code-term explanation is
  portalled to `body` while open, positioned against its trigger with viewport clamping and above/below
  flipping, then restored to its semantic source position on close; this prevents scrollable code blocks from
  clipping or relocating the panel. Interaction instances otherwise keep state in their own semantic DOM
  subtree, so repeated components do not share accidental state.
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
  and inspection: source/render work, registry-owned output selection, package browser assets, size
  accounting, content hashing, observed source features, and prepared directory resources. Package browser
  assets resolve only beside the installed module, never from the consumer's working directory.
- `src/core/compiler.ts` publishes a prepared single-file or staged directory artifact.
  `src/core/analyze-report.ts` projects the same preparation into compact validation and inspection
  results without output publication.
- `src/core/inspect-review.ts` reads one strictly bounded review JSON file confined under the prepared
  source root, validates it, binds its threads and revision segments to the current target manifest, and returns a
  centrally sanitized result without publishing output or editing Markdown.
- `src/core/fix-report.ts` applies the replacements diagnostics carry in their `fix` field and writes
  nothing else. It is the only module that writes to an authored source; the analysis and build modules
  above never do. Replacements whose ranges overlap within one round are deferred rather than merged, and
  the run repeats validation until no applicable replacement is left or a bounded number of rounds is
  reached, reporting whatever remains.
- `src/cli.ts` adapts initialization, building, validation, inspection, repair, review binding, and discovery to
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
applying it preserves every authored construction the range spans. The ESM root exposes
`sourceContract`, defensive `getSourceContract()` and `getAuthoringSchema()` values, and example discovery;
concrete Zod schemas remain internal. The root also exposes `initProject()`, which selects the default or
any initializable named starter or alias from the typed registry, resolves its complete tree beside the installed
package, rejects symlinks/special files, fully reads it, and requires the declared entry before publication.
The destination must be absent and its immediate parent an existing directory; a symbolic-link parent is
resolved and the reported project path names the resolved location. Init
claims the destination exclusively and creates files without overwrite. A later failure may leave the new
destination incomplete; init reports it and never deletes or rolls back destination content. The CLI
exposes the same operation as `init <destination> [--starter <id>] [--json]`. The root also exposes
`validateReport()` and `inspectReport()`; CLI `validate` and `inspect` adapt them with the same
optional format and confined prior-review overrides. Both run production preparation without output publication. Validation reports
project/entry identity, format, runtime placement, and warnings. Inspection adds relative source inventory,
observed directives/resources, and a registry-derived authoring catalog.

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

Six package-owned starter trees are ordinary buildable examples carrying registry `starter` metadata:
the default report tree (canonical ID `basic`, alias `report`), `research`, `architecture`, `tutorial`,
`dashboard`, and `landing`. Discovery exposes canonical identity, aliases, and default status; init uses
the same metadata and copies the selected tree rather than invoking a separate template generator.

The CLI emits structured diagnostics, authored ranges, and a per-run identifier. One transport sanitizer
removes credential-bearing URL user information, signed-URL and other recognized credential values from
text, paths, structured details, and successful CLI records. ESM validation/inspection identities pass
through the same boundary. Unexpected internal causes and source bodies do not cross the transport. Result
envelopes are not yet independently versioned; the source-contract major is included in validation and
inspection results.

The current source schema supports title, description, a documented restricted language-tag syntax,
theme, layout, a coordinated preset, optional scroll progress, a default-on boolean package attribution,
compact page-token overrides, and output defaults. `attribution: false` removes only the renderer-owned
**Made with Agentic Report** footer; default and opt-out behavior are identical across output formats. `studio`,
`editorial`, and `signal` are registry-owned token-default families; `editorial` is the Field Manual family
with warm package surfaces, compact controls, numbered document navigation, and package-owned decorative
action/shell icons. Theme remains an independent color mode, and explicitly authored bounded tokens
override the preset on density, typography, accent, content width, and radius. The icon vocabulary is a
small compile-time set of MIT-licensed Primer Octicon paths: it adds no author syntax, network request,
runtime dependency, or CSP branch, and visible control text remains the accessible name. `document`,
`dashboard`, `landing`, and `mixed` share one responsive shell, track
system, and component surface model. Frontmatter overrides the matching manifest fields. Only Markdown partials
are allowed; the loader rejects cycles, nesting over 10 levels, and lexical or canonical paths outside the
source root. The source contract is defined in
[`product/source-contract.md`](product/source-contract.md).

The manifest language is also the sole input to the browser-safe package localization module. It resolves
`ru` and Russian subtags to one closed Russian catalog and resolves `en`, `und`, and unsupported tags to the
complete English catalog. Static document markup, compile-time directive and visualization enhancement,
the browser runtime, and Review Workspace consume that same catalog. They never inspect `navigator`, the
host environment, or network state. Authored content and CLI diagnostics remain outside this reader-chrome
boundary. The catalog also owns explicit-locale numeric formatting for visible and accessible chart output,
so compiled values cannot fall back to a host or hardcoded locale.

The `section` directive is restricted to the Markdown root. It creates one real `<section>` labelled by an
owned visible H2, with a validated explicit ID or deterministic title-derived ID. Explicit duplicates and
unsafe IDs fail; generated collisions receive deterministic suffixes. When explicit sections exist they
are the primary navigation inventory, using `nav` when supplied; documents without them use legacy H2
headings. H3 and component IDs remain owned descendant hash targets but do not become primary links.
`reveal` defaults to false and opts only that section into the package-owned normal-motion reveal.
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
local-file, absolute-path, and protocol-relative targets are rejected.
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
`diagram`/`group`/`node`/`edge`, and
`timeline`/`event`. Charts support `bar`, `line`, and `pie`; series are bounded, share an ordered category
domain, and use finite numeric values. Flow diagrams contain up to twenty uniquely identified nodes, bounded
directed references, and optionally two or three complete subsystem groups; a single group builds with an
authored warning so grouping can be finished later. Sequence diagrams retain
participant and labelled message order. The registry owns both form-specific bounds and unsupported
combinations. Timeline events retain ordinary Markdown bodies. Every top-level visual requires a visible
title and meaningful description.

Visualization output is generated after Markdown sanitization from values already checked by the registry
schemas and cross-record validator. SVG uses deterministic document-order IDs, a responsive `viewBox`,
package theme variables, and an atomic image role. Its accessible `title` and `desc` expose the authored
summary plus complete chart series/point data, grouped-flow membership/connections, or sequence participants/
messages; decorative SVG descendants do not make unreachable nested-role claims. Timelines use an ordered
semantic list. No source value becomes
JavaScript, CSS, raw HTML, a URL, or an executable graph expression.

The implementation uses package-owned compile-time SVG/HTML rather than a new dependency. The bounded
comparison found that [Chart.js renders canvas whose accessible alternative remains the integrator's
responsibility](https://www.chartjs.org/docs/latest/general/accessibility.html),
[Mermaid defaults to non-deterministic IDs and exposes a broad security-sensitive diagram
configuration](https://mermaid.js.org/config/schema-docs/config.html), and
[Vega-Lite compiles a broad JSON grammar into Vega specifications](https://vega.github.io/vega-lite/docs/)
while covering charts rather than the complete diagram/timeline surface. The local package spike measured
published tarballs at 1,576,314 bytes for Chart.js 4.5.1, 17,619,777 bytes for Mermaid 11.16.1, and
1,078,939 bytes for Vega-Lite 6.4.3. The closed renderer therefore adds no package dependency, runtime,
network behavior, CSP directive, or output-format branch.

## Output model

`single-file` embeds CSS, the package-owned runtime, local images, downloadable resources, and declared
fonts. Binary resource bytes are encoded as MIME-qualified base64 data URLs. A configured byte threshold
produces a warning, not an implicit format change.

`directory` writes `index.html` and an `assets/` directory. Browser and source assets receive SHA-256
prefixes in their filenames. A non-empty destination is rejected to avoid destructive cleanup and stale
files. The complete tree is built in a private sibling staging directory and renamed into place. An
existing empty destination is restored if rename fails. Injected partial-write and rename failures verify
cleanup, preservation, and immediate retry.

Single-file output is written exclusively to a private sibling file, closed, measured, and atomically
renamed into place. Both formats refuse to replace a canonical source path or a hard-link alias of an
entry, manifest, included partial, or referenced local asset. Publication failures are structured and do
not report success. Hostile concurrent path replacement and process/OS crash recovery are outside the
proportionate filesystem model. The inline warning threshold counts the actual serialized CSS, inline
runtime, and image/download data URLs; a font data URL is counted once through generated CSS.

`build --share` and ESM `share: true` are one build profile over the same preparation/publication path in
both formats. The typed result always identifies the profile and exact neutralized source-link count;
human output states that count for an explicit share build. Validation and inspection do not publish and
therefore do not accept the build-only profile.

Output format, page layout, and visual preset are independent public data choices. One data-only registry
contract owns their defaults and closed domains: `single-file` uses an inline runtime and `directory` uses
an external content-addressed runtime; layout selects document/dashboard/landing/mixed composition; preset
selects coordinated visual defaults. The schema normalizer resolves preset defaults followed by explicit
bounded token overrides, and the renderer projects only the resolved preset/theme/token identities into
the shared package stylesheet in both formats. The stylesheet owns reading/standard/wide tracks, section
rhythm, component containment, and a single content-surface layer; wide media, tables, charts, and code
scroll locally instead of widening the document. Sidebar/mobile navigation exists only with at least two
eligible sections; an authored in-flow map remains ordinary visible content at every inventory size and
viewport. One shell navigation link is always current: direct and descendant hashes resolve through section
ownership, outside targets use the preceding or first section, and geometry uses the sticky-topbar
activation line with deterministic bottom and equal-top rules. Root scroll padding keeps hash/focus targets
below the sticky topbar; primary sections compensate their own block padding. In browsers with `scrollend`,
a smooth hash traversal retains synchronous hash ownership until scrolling settles and then returns to
geometry; other browsers debounce the scroll signal into one terminal geometry pass. When
`IntersectionObserver` is unavailable, those same terminal and resize boundaries run the total geometry
selection directly instead of scanning on every scroll signal. Desktop collapse is non-modal and
session-only. Mobile moves the same nav into a native modal dialog with inert background, cyclic focus,
Escape/backdrop/Close return, link-to-heading focus, and safe breakpoint closure.

Both formats contain the same inert escaped review-target manifest in a `template` element. Reviewable
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

Current exact ranges are reconstructed from version-3 anchors and registered as separate open and resolved
CSS highlights without rewriting authored DOM. A pointer or touch point is compared with the actual range
rectangles; overlapping matches choose the unresolved, shortest, then lexically stable thread. Focusable
fixed overlay markers give each highlight a keyboard route without affecting layout. Re-selecting an exact
saved subject resolves the contextual action to its existing thread instead of creating a duplicate. Scroll
and resize updates are coalesced and run only while an action, popover, or saved range exists.

The topbar Review action opens only the current/prior thread list plus import/export. Desktop shows a fixed
non-modal overlay and mobile a native modal bottom sheet; neither mode changes report width, margin, or
authored flow. Choosing a current or bindable prior item closes the list, brings its target into view, and
opens the same anchored popover. Valid legacy whole-block threads remain list-accessible but the reader
cannot create a new one. List-origin popovers return focus to the visible Review entry rather than a control in
the closed list; other close paths return to their relevant opener. State remains in memory until explicit
canonical import or download.

Review protocol version 3 stores discussion threads as ordered revision segments. Each segment owns its
report revision, source target, optional selected-text anchor, ordered user/agent messages and resolved flag.
An anchor repeats the start target as an enforced invariant and supplies the end target, code-point offsets,
and bounded NFC quote. Subject uniqueness distinguishes a whole-block thread and multiple ranges on the same
target while rejecting duplicate exact subjects. A changed continuation appends a current segment without
rewriting historical targets or messages. Equivalent artifacts serialize deterministically without clocks or
random IDs. Valid version-2 whole-block artifacts normalize losslessly to version 3; a selection field cannot
masquerade under the closed version-2 schema. The browser can edit messages and resolve or reopen a thread;
ordinary decision/checklist directives remain static report content and create no review requirements or
approval gates. Version-1 formal review files fail at the version boundary without changing current state.

An optional confined prior-review sidecar enters common preparation before publication. Preparation embeds
the parsed artifact plus shared exact/changed/missing/ambiguous bindings; it never embeds the sidecar path.
Exact revisions resume current state. Stale threads render as prior evidence. Invalid or colliding input fails
before authoritative output replacement.

`scrollProgress` defaults to false. In normal motion, an enabled page installs one passive document scroll
listener and one resize listener, coalesces updates through one animation frame, and changes one decorative
`scaleX()` transform. A section with `reveal=true` is observed once and uses only opacity plus a 12-pixel,
220-millisecond transition. Reduced motion installs neither progress DOM/listeners/frames nor reveal hidden
state/observer; lack of `IntersectionObserver` leaves sections visible while navigation retains hash,
activation-line, equal-top, resize, short-final and document-bottom ownership through bounded terminal
geometry selection.

## Public site staging

The public site is not a compiler mode or a multi-page framework. `scripts/build-site.ts` reads the closed
`website/routes.json` inventory, invokes the normal page compiler independently for the landing, each
showcase, and each rendered documentation page, and copies canonical direct Markdown/text/skill files
without rewriting their bytes. It publishes the complete new tree by one sibling-directory rename and
refuses an existing destination.

Every staged route is relative and confined to the output tree. Every declared source is relative to
`website/` and confined to the repository before use; copied sources must be ordinary non-symlink files.
The deterministic `release.json` records package/engine identity, a caller-supplied complete Git revision,
canonical skill identity, route hashes, and the sorted complete file inventory. It deliberately omits a
build timestamp, workstation path, credential, and self-referential hash. The same inputs, package build,
and revision produce identical staged bytes.

The human docs, direct agent quickstart, complete agent reference, source contract, canonical skill, and
`llms.txt` are available under the same static origin as the product-built landing and separately built
examples. Hosting is outside the compiler. A valid deployment serves these files directly with appropriate
MIME types, a real 404 rather than an SPA fallback, and ordinary publicly trusted HTTPS. The reference
Nginx policy requires every mutable HTML, Markdown, manifest, and release-metadata route to revalidate while
allowing a one-year immutable cache only for filenames containing the compiler's 12-hex content hash. ETag
remains enabled for both families so unchanged conditional requests can return `304` without risking a stale
mutable landing or document.

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
browser runtime, or a separate release-validation subsystem.

## Security properties

- HTTP(S) image sources fail instead of triggering a network request.
- Relative source paths are decoded, resolved, canonicalized through filesystem links, and confined to
  the canonical source root before their contents are read.
- Raw Markdown HTML is not enabled, and content is sanitized before trusted renderer plugins run.
- Template partials are Markdown text; directives are allowlisted data; neither can execute author code.
- Generated documents receive a Content Security Policy matching their output format and package runtime.
- Review metadata is inert escaped markup; review inspection reads only a confined ordinary bounded JSON
  file, rejects unknown fields and unsupported versions, and never evaluates thread messages.
- Package-owned inline JavaScript escapes HTML script terminators before insertion and CSP hashing.
- Unexpected internal errors are projected without causes or source bodies. Expected diagnostics and
  public transport results retain actionable structure while centrally replacing recognized
  credential-bearing values with `[REDACTED]`.

## Extension boundaries

The typed registry owns current authoring directives, interaction behavior identities, page layouts,
presets, themes, compact token domains, capabilities, output behavior, and example/starter metadata. Its schemas,
discovery values, generated documentation projections, and examples are integrity-checked together. The
interactive catalog extends this same registry; later data primitives must do the same rather than create
layout-specific renderers.
There is no public plugin, callback, executable-template, or dynamic-extension contract. A large dependency
or public extension requires one bounded source-and-spike review, followed by an implementation decision;
formal multi-attempt admission research is outside the product process.
