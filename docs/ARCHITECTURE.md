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
  runs before trusted compile-time syntax highlighting. The asset plugin embeds local images, downloads,
  and fonts or copies them under deterministic hashed names.
- `src/review/contract.ts`, `src/review/targets.ts`, and `src/review/binding.ts` own the platform-neutral
  versioned review data contract, bounded canonical serialization, compile-time target inventory,
  local-input revision, and exact/changed/missing/ambiguous binding. Target provenance is captured while AST
  offsets and the partial source map are available; it is never reconstructed from final HTML or matched by
  proximity.
- `src/render/directives.ts` maps the documented, allowlisted directive vocabulary to semantic HAST.
  Unknown directives, invalid attributes/nesting, unresolved glossary references, duplicate definitions,
  and unmarked occurrences of registered glossary terms fail with authored-range diagnostics. Compile-time
  enhancement creates labelled top-level sections, ordinary safe action links, native disclosures, and
  accessible package-owned tabs, dialogs, popovers, filters, switches, and bounded counters without
  accepting author code.
- `src/render/visualizations.ts` projects validated chart series/points, diagram nodes/edges, and timeline
  events into deterministic accessible SVG or semantic HTML. It is compile-time code and does not add a
  visualization browser runtime.
- `src/render/document.tsx` creates the static HTML document, explicit-section or legacy H2 navigation,
  selected registry-owned page layout/tokens, responsive shell, metadata, and content security policy. It
  allocates collision-free shell IDs around authored content IDs and uses them consistently for navigation
  and accessibility relationships.
- `src/browser/` contains the browser runtime and token-based stylesheet bundled by Vite. One delegated
  event controller handles theme/navigation controls, current-section ownership, bounded normal-motion
  progress/reveal, code copying, glossary hover/focus/tap explanations,
  tab selection, modal/popover focus, filtering, switches, and bounded counters. Interaction instances keep state in their own semantic DOM
  subtree, so repeated components do not share accidental state.
- `src/browser/review-workspace.ts` is a cohesive package-owned controller over the shared review contract.
  It parses the inert manifest once, creates bounded target affordances, owns in-memory reviewer feedback and
  page/target verdicts, validates exact-revision imports, and exports canonical JSON through a revoked local
  object URL. It never evaluates or injects feedback as HTML, writes storage, starts a service, or performs a
  network request.
- `src/core/prepare-report.ts` owns the shared side-effect-free preparation used by building, validation,
  and inspection: source/render work, registry-owned output selection, package browser assets, size
  accounting, content hashing, observed source features, and prepared directory resources. Package browser
  assets resolve only beside the installed module, never from the consumer's working directory.
- `src/core/compiler.ts` publishes a prepared single-file or staged directory artifact.
  `src/core/analyze-report.ts` projects the same preparation into compact validation and inspection
  results without output publication.
- `src/core/inspect-review.ts` reads one strictly bounded review JSON file confined under the prepared
  source root, validates it, binds its structured responses to the current target manifest, and returns a
  centrally sanitized result without publishing output or editing Markdown.
- `src/cli.ts` adapts initialization, building, validation, inspection, review binding, and discovery to human text or
  agent-oriented NDJSON. The executable reads its version from the installed package metadata rather than
  carrying a second version literal. Before parsing a command it compares the running Node.js version with
  that same installed package's minimum engine and returns `NODE_VERSION_UNSUPPORTED` below the floor rather
  than relying on npm's warning-only behavior. `src/index.ts` is the ESM API and applies the same installed
  engine gate before exposing operations; programmatic callers receive an `AgenticReportError` carrying the
  same diagnostic.

## Public contracts

The npm package exposes one `agentic-report` executable and one ESM root export. CLI discovery is
available through `describe`/`discover`, scoped `schema`, and `examples`. The ESM root exposes
`sourceContract`, defensive `getSourceContract()` and `getAuthoringSchema()` values, and example discovery;
concrete Zod schemas remain internal. The root also exposes `initProject()`, which selects the default or
any initializable named starter or alias from the typed registry, resolves its complete tree beside the installed
package, rejects symlinks/special files, fully reads it, and requires the declared entry before publication.
The destination must be absent and its immediate parent an existing ordinary non-symlink directory. Init
claims the destination exclusively and creates files without overwrite. A later failure may leave the new
destination incomplete; init reports it and never deletes or rolls back destination content. The CLI
exposes the same operation as `init <destination> [--starter <id>] [--json]`. The root also exposes
`validateReport()` and `inspectReport()`; CLI `validate` and `inspect` adapt them with the same
optional format override. Both run production preparation without output publication. Validation reports
project/entry identity, format, runtime placement, and warnings. Inspection adds relative source inventory,
observed directives/resources, and a registry-derived authoring catalog.

The ESM root also exposes `inspectReview({ input, review })`, the review contract types, and defensive
parse/serialize functions. CLI `review <review> [input] [--json]` adapts the same read-only resolution. The
review path is a relative local reference confined under the report source root. Exact report revisions
resolve recorded targets; stale revisions resolve only a stable explicit identity or a unique matching
fingerprint in the same source file. A unique cross-file fingerprint is treated as a move only after the
previous source file disappears from the current target graph, preventing equal text elsewhere from
impersonating content changed in a still-present file. Changed, missing, and ambiguous targets remain
explicit and never trigger source mutation.

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
theme, layout, a coordinated preset, optional scroll progress, compact page-token overrides, and output defaults. `studio`,
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

The `section` directive is restricted to the Markdown root. It creates one real `<section>` labelled by an
owned visible H2, with a validated explicit ID or deterministic title-derived ID. Explicit duplicates and
unsafe IDs fail; generated collisions receive deterministic suffixes. When explicit sections exist they
are the primary navigation inventory, using `nav` when supplied; documents without them use legacy H2
headings. H3 and component IDs remain owned descendant hash targets but do not become primary links.
`reveal` defaults to false and opts only that section into the package-owned normal-motion reveal.
`actions` accepts only direct `action` children. Each action becomes an ordinary anchor after
its same-page, relative, HTTP(S), or mail target passes the closed registry constraint; executable,
local-file, absolute-path, and protocol-relative targets are rejected.

Partial expansion produces a compact offset source map. Markdown AST positions resolve through that map,
so diagnostics from entry content and nested partials identify the original authored file and range rather
than the concatenated intermediate document.

## Visualization model

The registry owns a closed data vocabulary for `chart`/`series`/`point`, `diagram`/`node`/`edge`, and
`timeline`/`event`. Charts support `bar`, `line`, and `pie`; series are bounded, share an ordered category
domain, and use finite numeric values. Diagrams contain bounded uniquely identified nodes and validated
directed references. Timeline events retain ordinary Markdown bodies. Every top-level visual requires a
visible title and meaningful description.

Visualization output is generated after Markdown sanitization from values already checked by the registry
schemas and cross-record validator. SVG uses deterministic document-order IDs, a responsive `viewBox`,
package theme variables, and an atomic image role. Its accessible `title` and `desc` expose the authored
summary plus complete chart series/point data or diagram node/connection data; decorative SVG descendants
do not make unreachable nested-role claims. Timelines use an ordered semantic list. No source value becomes
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

Output format, page layout, and visual preset are independent public data choices. One data-only registry
contract owns their defaults and closed domains: `single-file` uses an inline runtime and `directory` uses
an external content-addressed runtime; layout selects document/dashboard/landing/mixed composition; preset
selects coordinated visual defaults. The schema normalizer resolves preset defaults followed by explicit
bounded token overrides, and the renderer projects only the resolved preset/theme/token identities into
the shared package stylesheet in both formats. The stylesheet owns reading/standard/wide tracks, section
rhythm, component containment, and a single content-surface layer; wide media, tables, charts, and code
scroll locally instead of widening the document. Navigation exists only with at least two eligible
sections. One ordinary link is always current: direct and descendant hashes resolve through section
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
container directives and ordinary Markdown blocks carry deterministic `data-review-target` identities. The
manifest contains source-root-relative ranges and SHA-256 fingerprints, not source bodies or workstation
paths. Its report revision covers the confined entry, manifest, expanded partials, referenced local resource
bytes, review/source-contract versions, target-algorithm version, and canonical target inventory; it is
independent of output destination and format. A 500-target and 750,000-byte manifest limit bounds
artifact/runtime input; review files are limited separately before JSON parsing.

When at least one target exists, the shared document shell includes one Review entry and one native review
dialog. Normal reading exposes no target controls. Review mode creates one button sibling per actual DOM
target; tight-list paragraphs that do not render their own element are represented by the containing list,
so manifest and DOM inventories remain equal. Desktop opens the dialog non-modally as a fixed rail and
reserves page width; mobile opens the same dialog modally as a bottom sheet. Close returns focus to the exact
opener, while Exit removes all review affordances. State remains in memory until explicit canonical import or
download.

Feedback kinds are comment, question, change request, and blocker. Each target may own one independent
approve/revise/reject response; the page verdict remains separate. Negative verdicts require rationale.
Page approval cannot export while a blocker or negative target verdict remains. Unit-2 import is an exact
revision resume operation: stale or foreign reviews are rejected without changing current state.

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
MIME types, a real 404 rather than an SPA fallback, and ordinary publicly trusted HTTPS.

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
  file, rejects unknown fields and unsupported versions, and never evaluates feedback.
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
