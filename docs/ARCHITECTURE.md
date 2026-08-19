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
- `src/source/load-source.ts` resolves the entry, parses metadata, and expands confined Markdown
  partials. It validates raw metadata shapes before merging and retains metadata/partial provenance for
  diagnostics and output-collision protection. Reads perform lexical/canonical confinement. The product
  deliberately does not implement an inode ledger or defend against hostile concurrent path replacement.
- `src/render/markdown.ts` uses the unified/remark/rehype AST pipeline with GitHub Flavored Markdown table,
  strikethrough, task-list, and autolink-literal parsing. Raw HTML is not passed through; rehype sanitization
  runs before trusted compile-time syntax highlighting. The asset plugin embeds local images, downloads,
  and fonts or copies them under deterministic hashed names.
- `src/render/directives.ts` maps the documented, allowlisted directive vocabulary to semantic HAST.
  Unknown directives, invalid attributes/nesting, unresolved glossary references, duplicate definitions,
  and unmarked occurrences of registered glossary terms fail with authored-range diagnostics. Compile-time
  enhancement creates labelled top-level sections, ordinary safe action links, native disclosures, and
  accessible package-owned tabs, dialogs, popovers, filters, switches, and bounded counters without
  accepting author code.
- `src/render/visualizations.ts` projects validated chart series/points, diagram nodes/edges, and timeline
  events into deterministic accessible SVG or semantic HTML. It is compile-time code and does not add a
  visualization browser runtime.
- `src/render/document.tsx` creates the static HTML document, explicit-section or legacy H2/H3 navigation,
  selected registry-owned page layout/tokens, responsive shell, metadata, and content security policy. It
  allocates collision-free shell IDs around authored content IDs and uses them consistently for navigation
  and accessibility relationships.
- `src/browser/` contains the browser runtime and token-based stylesheet bundled by Vite. One delegated
  event controller handles theme/navigation controls, code copying, glossary hover/focus/tap explanations,
  tab selection, modal/popover focus, filtering, switches, and bounded counters. Interaction instances keep state in their own semantic DOM
  subtree, so repeated components do not share accidental state.
- `src/core/prepare-report.ts` owns the shared side-effect-free preparation used by building, validation,
  and inspection: source/render work, registry-owned output selection, package browser assets, size
  accounting, content hashing, observed source features, and prepared directory resources. Package browser
  assets resolve only beside the installed module, never from the consumer's working directory.
- `src/core/compiler.ts` publishes a prepared single-file or staged directory artifact.
  `src/core/analyze-report.ts` projects the same preparation into compact validation and inspection
  results without output publication.
- `src/cli.ts` adapts initialization, building, validation, inspection, and discovery to human text or
  agent-oriented NDJSON. The executable reads its version from the installed package metadata rather than
  carrying a second version literal. `src/index.ts` is the ESM API.

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
theme, layout, a coordinated preset, compact page-token overrides, and output defaults. `studio`,
`editorial`, and `signal` are registry-owned token-default families; theme remains an independent color
mode, and explicitly authored bounded tokens override the preset on density, typography, accent, content
width, and radius. `document`, `dashboard`, `landing`, and `mixed` share one responsive shell, track
system, and component surface model. Frontmatter overrides the matching manifest fields. Only Markdown partials
are allowed; the loader rejects cycles, nesting over 10 levels, and lexical or canonical paths outside the
source root. The source contract is defined in
[`product/source-contract.md`](product/source-contract.md).

The `section` directive is restricted to the Markdown root. It creates one real `<section>` labelled by an
owned visible H2, with a validated explicit ID or deterministic title-derived ID. Explicit duplicates and
unsafe IDs fail; generated collisions receive deterministic suffixes. When explicit sections exist they
are the primary navigation inventory, using `nav` when supplied; documents without them keep legacy H2/H3
navigation. `actions` accepts only direct `action` children. Each action becomes an ordinary anchor after
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
scroll locally instead of widening the document. The navigation toggle exists only when a table of
contents exists; desktop placement varies by layout, and all layouts use the same mobile drawer behavior.

## Security properties

- HTTP(S) image sources fail instead of triggering a network request.
- Relative source paths are decoded, resolved, canonicalized through filesystem links, and confined to
  the canonical source root before their contents are read.
- Raw Markdown HTML is not enabled, and content is sanitized before trusted renderer plugins run.
- Template partials are Markdown text; directives are allowlisted data; neither can execute author code.
- Generated documents receive a Content Security Policy matching their output format and package runtime.
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
