# Declarative source contract

This document defines the current author-facing input to `agentic-report`. Agents write content and
semantic intent; they do not write JSX, templates with executable helpers, page layout, or browser code.

The product contract is defined in [`../../PRODUCT-REQUIREMENTS.md`](../../PRODUCT-REQUIREMENTS.md), and the
implementation behind this source contract is described in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
Only the syntax below and the generated schemas are accepted.

## Source directory

The input is a Markdown file or a directory containing `report.md` or `index.md`. A source directory may
also contain one YAML/JSON manifest, Markdown partials, images, downloadable resources, and fonts.
References are relative to the entry's canonical directory. The compiler resolves symbolic links before
reading contents and rejects a canonical target outside that directory.

## Metadata

Metadata can be frontmatter or `agentic-report.yaml`, `agentic-report.yml`, or `agentic-report.json`.
Frontmatter takes precedence. Supported fields are:

- `contractVersion`: authored source-contract major; omission is interpreted as legacy major `1`;
- `title`: non-empty document title; when omitted, the first level-one heading or filename is used;
- `description`: plain-text metadata description;
- `language`: tag used on `<html lang>`; the current accepted subset is a 2–8 ASCII-letter primary tag
  followed by optional 2–8 character ASCII alphanumeric subtags; default `und` means undetermined. `ru`
  and its subtags select complete Russian package-owned reader chrome; `en`, `und`, and every unsupported
  language select complete English chrome. The compiler never uses the browser or host locale, and it does
  not translate authored Markdown or CLI diagnostics. Visible and accessible package-generated chart
  numbers use the same selected locale;
- `preset`: coordinated `studio`, `editorial`, or `signal` package-owned visual defaults;
- `theme`: `system`, `light`, or `dark`;
- `layout`: `document`, `dashboard`, `landing`, or `mixed`;
- `scrollProgress`: boolean; default `false`; enables decorative normal-motion reading progress;
- `attribution`: boolean; default `true`; shows the package-owned footer link **Made with Agentic Report**
  to `https://agentic-report.witqq.dev/`. Set `false` to omit only that footer; authored links and prose are
  unchanged;
- `tokens`: optional compact visual overrides containing only the fields below:
  - `density`: `compact`, `comfortable`, or `spacious`;
  - `font`: `sans`, `serif`, or `mono`;
  - `accent`: `indigo`, `teal`, or `coral`;
  - `width`: `narrow`, `standard`, or `wide`;
  - `radius`: `sharp`, `soft`, or `round`;
- `output.format`: `single-file` or `directory`;
- `output.maxInlineBytes`: positive warning threshold for resources embedded in one file.

Run `agentic-report schema` for the exact accepted manifest-input schema and defaults. Defaulted fields
remain optional in the emitted JSON Schema because the compiler accepts their omission. Use
`schema --scope directives` for directive grammar and constraints, or `schema --scope source` for the
complete source-object schema. The ESM API exposes defensive project-owned projections through
`getAuthoringSchema(scope)`, `getSourceContract()`, and `listExamples()`; concrete Zod schemas remain an
internal implementation detail. The complete checked JSON form is
[`../generated/source-contract.json`](../generated/source-contract.json),
and [`../../examples/manifest.json`](../../examples/manifest.json) binds packaged example identities to
their source-file SHA-256 hashes.

The ESM `initProject({ destination, starter? })` operation initializes a registry-owned packaged starter
into an absent directory whose immediate parent is an existing directory. A symbolic-link parent is
resolved, and `projectPath` reports the resolved destination. It rejects
unknown starters, unsafe runtime option shapes, symlinks and special files, then fully reads the complete
local tree and verifies the registry entry before publication. The destination is claimed exclusively and
ordinary files use no-overwrite creation. Existing destinations are rejected unchanged. A later write
failure is structured and may leave the new destination incomplete; the operation never deletes or rolls
back its contents. CLI `init <destination> [--starter <id>] [--json]` adapts the same operation. Starter
eligibility, aliases, and the single-default flag are registry metadata shared by discovery and init.
Six trees are packaged: report (`report`, with stable canonical ID `basic`), `research`, `architecture`,
`tutorial`, `dashboard`, and `landing`. The report tree is the default and every registry entry is
`report.md`. A starter is also a buildable example; there is no separate generator contract.

The ESM `validateReport({ input, format?, review? })` and `inspectReport({ input, format?, review? })` operations use the
production source and render preparation without output publication. CLI `validate [input] [--format
<format>] [--json]` and `inspect [input] [--format <format>] [--json]` are adapters of the same
functions. Validation reports resolved project/entry identity, output format, derived runtime placement,
and warnings. Inspection also reports sorted relative source files, observed directives and local-resource
occurrence counts, and the registry-derived command/format/starter/capability catalog. Both commands read
and validate all resources required by the selected format but do not create or replace an output artifact.

`buildReport({ input, output?, format?, review?, share? })` is the publishing operation. `share: true`, or
CLI `build --share`, neutralizes compiler-owned workstation source links before serialization in either
output format. `BuildReportResult.share` identifies the selected profile and
`neutralizedSourceLinks` is the exact transformed-node count; human output prints the count for a share
build. The option does not rewrite source and is intentionally absent from validation and inspection.

## Review protocol and source binding

Every normal build embeds an inert version-2 review manifest in a `template` element. Container directives
that produce a final DOM owner and ordinary Markdown blocks receive deterministic review-target identities;
structural chart `series` data is reviewed through its owning chart rather than a removed intermediate node. Each target records its kind,
SHA-256 fingerprint, source-root-relative entry or partial path, and authored range. A section with an
explicit `id` also receives a stable review key. The manifest never contains source bodies or absolute
workstation paths.

The manifest `reportRevision` is a SHA-256 identity over the complete confined local input graph used by the
report—entry, metadata, expanded partials, and referenced local resources—plus the target-manifest version,
source-contract version, target-algorithm version, and canonical target inventory. It is independent of output destination
and `single-file` versus `directory`; `BuildReportResult.contentHash` remains the hash of the serialized
output HTML and is a separate contract.

A review artifact is strict version-3 JSON with a bound report revision, at most 500 threads and at most 500
messages. Each thread owns ordered revision segments; every segment binds one report revision and target to
its messages and resolved boolean. A selected-text segment additionally stores `selection.start` and
`selection.end` boundaries, each with a complete deterministic target reference and a non-negative Unicode
code-point offset, plus the bounded NFC `selection.quote`. The segment target must equal the start target.
This represents an exact range inside one target or across multiple targets without copying whole source
blocks. A whole-block thread omits `selection`. Valid closed version-2 whole-block artifacts are accepted and
normalize losslessly to version 3; version 2 never accepts selection fields.

Changed continuation appends a current segment while historical segments remain immutable. Selection
endpoint targets bind independently; if either endpoint changes, disappears, or becomes ambiguous, the
aggregate thread reports that state and preserves the old quote as historical evidence instead of guessing
new offsets. Serialization sorts thread identities while preserving segment and conversational message order
and adds no clock or random field. Messages are trimmed and normalized to Unicode NFC before length
validation, while selected quotes preserve their meaningful whitespace after NFC normalization. Review text
is local potentially sensitive data and must be handled like report source.

Use the read-only ESM operation or CLI adapter:

```sh
agentic-report review ./review.json ./my-report --json
```

```ts
const result = await inspectReview({ input: './my-report', review: 'review.json' });
```

The review path is resolved relative to the prepared source root and cannot be absolute, traverse outside,
escape through a symlink, or alias an entry, manifest, included partial, referenced local resource, or
output identity by canonical path or hard link. An exact bound revision requires the exact target identity and fingerprint. For
a stale revision, an explicit stable key resolves first. Otherwise a unique target at the same authored
source origin (file, line, and column) resolves there; a changed fingerprint returns `changed` even when an
equal block exists elsewhere. Fingerprint relocation is considered only after the original origin is absent.
A unique cross-file match is considered a move only when the previous source file no longer contributes any
current review target. Zero matches return `missing` and multiple matches return `ambiguous`. The operation
does not rewrite Markdown or publish output.
Structured thread and message fields are bounded and credential-sanitized before CLI/ESM transport; surrounding source and
complete input files are never returned.

### Review Workspace reader interface

When a report contains review targets, annotation is always available and its topbar includes `Review`; there
is no activation mode, target outline, block button, or exit action. Selecting eligible rendered text exposes
one localized **Create note** action beside the native selection. Activation snapshots the range and opens a
compact anchored popover containing the exact quote, message history, compose/edit actions, and resolve or
reopen. The range may stay inside one review target, cross nested inline markup, or end in a later target.
Both endpoints must belong to the same report article. Empty, whitespace-only, oversized, outside-report,
reversed, package-control, or unreconstructable ranges expose no action or fail import without replacing
current state. Releasing `Shift` after a keyboard selection focuses the action; pointer and touch selection
use the same captured state.

The inert manifest contains at most 5,000 targets and at most 750,000 serialized bytes. These are independent
bounds, so verbose relative source locations can make the byte ceiling bind before the target count. Target
validation receives the count bound from the Node-side compiler; the shared browser-safe review contract
contains no environment-variable lookup.

The interface supports one thread per subject: one whole-block subject plus multiple distinct selected ranges
may coexist on the same target. Threads retain ordered user and agent messages, message editing, and
resolved/reopened state. Each exact current selection stays highlighted, with distinct open and resolved
treatment. Hover or tap on a highlight exposes **View thread**; its focusable overlay marker supplies the
keyboard route. Selecting the exact saved range also exposes **View thread** rather than a second create path.
Overlapping highlights choose one deterministic most-specific thread, and the full lifecycle continues in the
same anchored popover.

The topbar `Review` action opens only an overlay list of every current thread and prior evidence plus import
and one all-thread export. Choosing a current or bindable prior entry closes the list, brings its target into
view, and opens the same popover. Desktop uses a non-modal right overlay; mobile uses a native modal bottom
sheet. Neither changes report width, margin, scroll ownership, or authored DOM flow, and closing returns
focus to the visible Review action after list-origin navigation. Existing valid version-2/version-3
whole-block discussions remain list-accessible, but new threads are created only from text selection.

Canonical version-3 `review.json` download exports all whole-block and selected-text threads together.
Exact-revision import validates every current target, offset, range order, and quote against the rendered DOM
before swapping state and immediately restores valid selection highlights. It rejects oversized, malformed,
version-1, stale, foreign, non-current, or mismatched selected-text data without replacing active state;
valid version-2 whole-block import remains supported. Review state is session-only and never written to
browser storage, URL, network, or report source. Message authorship is descriptive rather than authenticated.

The root metadata value, `tokens`, and `output` must be objects; scalar and array shapes fail instead of being
silently replaced by defaults. Validation diagnostics point to the actual manifest or frontmatter field
range that supplied the failing value.

Defaults are `layout: document`, `theme: system`, `preset: studio`, `scrollProgress: false`, and
`attribution: true`. Presets provide these coordinated
token defaults:

| Preset      | Density     | Font  | Accent | Width    | Radius |
| ----------- | ----------- | ----- | ------ | -------- | ------ |
| `studio`    | comfortable | sans  | indigo | standard | soft   |
| `editorial` | comfortable | serif | indigo | wide     | sharp  |
| `signal`    | compact     | sans  | teal   | wide     | sharp  |

The selected preset supplies all five token axes, the selected theme supplies only the color mode, and
explicitly authored token fields apply last. An omitted token field therefore retains its selected preset
value rather than a second global default. These values select package-owned styles only; CSS values,
class names, JSX, templates, URLs, arbitrary fonts, and callbacks are not accepted.
`agentic-report describe --json` and the ESM `getSourceContract()` return the same `page` domain,
coordinated defaults, and precedence contract. In that discovery value, `page.tokenResolution` declares
that defaults come from the selected preset before explicit token fields apply. For major-1 compatibility,
`page.tokens` retains each Studio normalization `default` with
`defaultVisibility: normalization-only`; discovery consumers must materialize only `published` defaults as
authored fields. `page.presets` contains every complete coordinated map.
The public landing and vendor decision use the Field Manual `editorial` preset, the launch example uses
`studio`, and the incident review uses `signal`; the packaged `layout-*` examples retain
the default while exercising every layout.
The six starter examples combine these layouts with the public content, interaction, visualization,
partial, and local-asset contracts; they introduce no additional syntax.

## Partials and Markdown

`{{include: partials/context.md}}` inserts a Markdown partial. Only `.md` files are accepted. Includes are
limited to ten nested levels; cycles, missing files, malformed URI paths, and escaping lexical or symlink
paths fail with structured input diagnostics.

CommonMark plus GitHub Flavored Markdown tables, strikethrough, task-list syntax, and autolink literals is
converted through a typed unified AST. Raw HTML is not enabled. Sanitization occurs before package-trusted
syntax highlighting and semantic enhancement.

A colon in ordinary prose remains ordinary text under either of two lexical conditions: the name it opens
begins with a decimal digit, which no registered directive name does, or the colon is written against the
preceding letter, digit, combining mark or connector, whereas an authored directive always starts a fresh
token. So `21:01`, `21:01 — 00:12`, `1:30:05`, `3:1`, `1:10:100`, `localhost:9000`, `arXiv:2508.05775` and
`ключ:значение` require no backslash in Markdown or frontmatter. The first condition is independent of the
second, so `Пункт :2 списка.` is text as well. The rule restores only a leaf text directive without
attributes or children; an alphabetic name standing on its own after a space, any attributed or
child-bearing form, and every block-level form such as `::2` stay on the directive path, where an
unregistered name produces the normal directive diagnostic naming `\:` as the escape for ordinary prose
and a registered one is interpreted by its own rules, so a bare `:term` without its required attribute
reports the missing attribute instead of becoming text.

## Semantic primitives

The directive vocabulary is:

- `section`: top-level labelled page region with required `title`, optional stable `id` and short `nav`
  label, closed `width`, `align`, and `tone` choices, and optional boolean `reveal`;
- `contents`: top-level leaf placement for a compiler-generated in-flow map of final primary sections; it
  accepts no attributes, label or children;
- `lead`: attribute-free direct section child containing exactly one opening Markdown paragraph;
- `actions` and directly nested leaf `action`: responsive ordinary link group; every action requires a
  visible label and safe `href` and may select `primary`, `secondary`, or `quiet` emphasis;
- `source-link`: inline source-location link with a short visible label and a bounded IPv4-loopback editor
  helper URL containing an absolute path and positive line;
- `callout`: emphasized finding with optional `title` and lowercase `kind`;
- `copyable`: ordinary Markdown prose plus optional `term` references with a localized reader copy control;
  block code and nested package directives are rejected so clipboard text has one visible prose owner;
- `decision`: legacy static Markdown decision with optional `title`, or typed decision with stable `id`,
  optional `required`, and directly nested leaf `decision-option` values with stable `id` and `label`;
- `checklist`: static structured checklist with required `title` and stable `id`, containing directly nested
  leaf `check-item` values with stable `id`, visible `label`, and optional authored `required` marker;
- `response`: structured reader workspace with required `title` and stable `id`, containing direct
  `question` containers;
- `question`: one required stable `id`, `title`, and `kind` from `bucket`, `item-single`, `item-multi`,
  `single`, `order`, `number`, or `text`; it accepts kind-appropriate direct `bucket`, `option`, and `item`
  leaves. Number questions require `min` and `max` and may add positive `step`; entered and imported values
  must remain within the range and align to that step from `min`;
- `bucket` and `option`: stable labelled domains scoped to one question;
- `item`: readable stable item with required `label`, explanatory `note`, metadata `meta`, and safe original
  `href`, plus optional initial `bucket` and boolean `comment` support;

Decision and checklist component, option, and item inventories are bounded to 500 at source and manifest
boundaries. Response Workspace has its own smaller limits: at most 20 forms per document, 50 questions and
250 items per form, 20 options per question, two to five buckets per bucket question, 4,000 characters per
text or comment value, and 2,000,000 bytes per imported response file. Mixed Markdown plus typed children is
invalid; use a Markdown-only legacy decision or a closed typed component.

`build`, `validate`, and `inspect` accept an optional confined prior-review sidecar. Exact revisions restore
current state. Stale bindings expose exact, changed, missing, or ambiguous prior thread segments without
rewriting their historical targets. Invalid sidecars fail before authoritative output replacement.

- `cards` and nested `card`: responsive content grid;
- `steps`: styled process container whose authored Markdown supplies the ordered or explanatory content;
- `glossary`: reusable definition with required stable `key`, canonical `term` text, optional declared
  `forms`, and optional `placement="inline|appendix"`;
- `term`: inline or standalone reference to a glossary `key`; an inline authored label remains the visible
  grammatical form while the detached form uses canonical text; both open a contextual explanation on hover,
  focus, or tap and link to the canonical full definition;
- `disclosure`: native details block with required `title` and optional initial `open` state;
- `tabs` and directly nested `tab`: keyboard-operable panels; each `tab` requires a visible `label`;
- `modal`: modal dialog with required `title` and optional trigger label;
- `popover`: dismissible non-modal contextual panel with required `title` and optional trigger label;
- `filter`: text filtering for directly authored list items with optional `title` and `placeholder`;
- `toggle`: switch-controlled content with required `label`, optional `title`, and `default` state;
- `chart`, nested `series`, and nested leaf `point`: compile-time `bar`, `line`, or `pie` SVG from bounded
  labelled numeric values;
- `diagram` with leaf `group`, `node`, and `edge` children: compile-time grouped flow or ordered sequence SVG
  with validated identities and references;
- `timeline` and directly nested `event`: semantic ordered chronology; each event may contain Markdown;
- `demo`: safe built-in counter with optional `title`, `start`, and `step`; it never evaluates author code;
- `asset`: downloadable local resource with required `src`;
- `font`: local WOFF2, WOFF, TTF, OTF, or other MIME-detected font resource with required `src` and
  validated `family`.

Container directives use `:::name ... :::`; nested containers use a longer outer fence. `asset` and
`font` support leaf directives. An `action` uses the labelled leaf form
`::action[Visible label]{href="#target" kind="primary"}`. Use
`:term[authored form]{key="term-key"}` inside prose; the label is rendered exactly as the visible grammatical
form while canonical text remains the explanation/definition title and unique identity. The compatible standalone form
`::term{key="term-key"}` remains available when a detached reference is intentional. A `tab` must be a
direct directive child of `tabs`, and other directive children are rejected there. Complete copyable examples
are in
[`docs/AGENT-REFERENCE.md`](../AGENT-REFERENCE.md) and the shipped
[`examples/basic`](../../examples/basic/report.md), [`examples/research`](../../examples/research/report.md),
[`examples/architecture`](../../examples/architecture/report.md), [`examples/tutorial`](../../examples/tutorial/report.md),
[`examples/dashboard`](../../examples/dashboard/report.md), [`examples/landing`](../../examples/landing/report.md), and
[`examples/interactive-catalog`](../../examples/interactive-catalog/report.md) sources. The complete data example is
[`examples/visualization-catalog`](../../examples/visualization-catalog/report.md); the complete response
example is [`examples/response-workspace`](../../examples/response-workspace/report.md).

A `section` must be a direct child of the Markdown document, not a blockquote, list item, or another
directive. It always renders a real labelled `<section>` and visible H2. `id` is a lowercase identity that
starts with a letter and contains only letters, digits, and hyphens; duplicate explicit IDs fail. If `id`
is omitted, the compiler derives a deterministic collision-free identity from `title`. `nav` is optional
short navigation text. Defaults are `width="standard"`, `align="start"`, `tone="plain"`, and
`reveal="false"`; other values are `reading|wide`, `center`, `soft|accent|contrast`, and boolean
`reveal="true"`. Documents without explicit sections use legacy H2 headings for primary navigation. H3
and component anchors remain owned descendant targets but are not primary links.

`::contents` is a top-level leaf directive. After final section IDs and appendix extraction, it renders a
labelled native navigation landmark at the authored position. Explicit sections supply their exact visible
H2 text and final section anchor; optional short `nav` text is not used. Without explicit sections, eligible
legacy H2 headings supply exact text and IDs, while H3 and `data-navigation-exclude` package headings stay
out. Zero and one-item maps remain visible in flow; sidebar and mobile-dialog chrome independently require
at least two items. Multiple authored maps receive the same final inventory. The compiler performs no
browser heading scan or runtime synchronization.

`:::lead` is valid only as the first direct block of a `section`, at most once. It accepts no attributes and
exactly one Markdown paragraph; inline emphasis, links and term references retain normal prose semantics.
Empty, multi-paragraph, list, quote, code, heading, nested-component, top-level, later and repeated forms fail
with authored source evidence. Output is one semantic paragraph with an accent rule, not a callout/aside,
card, disclosure or runtime component. Its paragraph remains the review target after wrapper removal.

An `actions` container accepts one or more direct `action` children and no prose. `href` accepts a
same-page `#anchor`, a relative target, HTTP(S), or `mailto:`. Executable schemes such as `javascript:` and
`data:`, `file:` URLs, absolute local paths, protocol-relative URLs, callbacks, forms, and scripts are not
part of the contract. Output is an ordinary keyboard-operable anchor; action emphasis is package-owned
styling and adds no runtime behavior.

Use `:source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}`
for an address that a reader opens repeatedly while following code. The visible label is authored and may
stay short; `href` must use literal host `127.0.0.1`, a port from 1 through 65535, `/open`, a `path` value
beginning with `/` or encoded `%2F`, and a positive `line`. The output is a native link in a protected
separate browsing context in a default build. The report page therefore remains in place for either an empty
200 or 204 helper response. The package never contacts the helper during build, validation, inspection, or
page startup, does not verify that the external helper opened an editor, and adds no network CSP capability.
The full absolute path is present in a default build even though only the short label is visible. Treat that
artifact as workstation-specific. For distribution, select the share build profile: each source-link label
becomes a non-anchor `span` whose text is a safe final helper filename plus line or `source:line`. An authored
path-free label remains exact only when it already equals that derived location; directory-bearing and
free-form labels are replaced wholesale, so no semantic path-token inference is applied to arbitrary label
text. Link/helper attributes and their absolute path are absent, and the build result reports the exact count.
Arbitrary prose and ordinary links are not scanned or rewritten.
Do not put credentials in authored paths; share-safe output is not a general secret scrubber.

Top-level visuals require `title` and `description`. A chart accepts 1–6 `series`; each series accepts 1–12
leaf `point` values, and every series must use the same unique labels in the same order. Values are finite
decimal numbers between `-999999999` and `999999999`, with at most four decimal places. Pie charts require
one series, non-negative values, and at least one positive value. `diagram.type` defaults to `flow`. A flow
accepts 1–20 unique nodes and up to 40 edges; it is ungrouped or declares 2–3 non-empty groups, with one group accepted as unfinished grouping and warned about, and gives every
node a declared group. Ungrouped flows accept `direction="right|down"`; grouped subsystem columns are
rightward. A `sequence` accepts 2–6 node participants and 1–40
labelled edge messages in authored order; group records, group membership, direction and self-messages fail.
Every edge or message references two distinct declared node IDs.
Grouped members use authored row order. Longer intra-group connections route through the group's inner gutter,
and the first connection for an adjacent group pair uses its inter-column gutter. Non-adjacent connections and
additional edges for an already-used pair receive distinct bottom-corridor lanes outside all groups; each lane
increases the SVG viewBox height within the finite edge bound. Dense arbitrary graph optimization remains
outside the bounded flow contract.
A timeline accepts 1–20 direct events. Visual data containers reject prose as a direct child, while an
event body accepts ordinary Markdown.

The compiler emits responsive deterministic SVG for charts and diagrams and semantic HTML for timelines.
Titles and descriptions are visible and label each atomic SVG image. The SVG accessible description also
contains every complete series/point value, flow group/member/node/connection, or sequence participant and
ordered message, including text shortened only in the visible plot. Values retain up to the supported four decimal places in observable text. Colors come
from package-owned theme variables. There is no visualization-time JavaScript, canvas, network request,
author CSS, executable graph DSL, or separate behavior between `single-file` and `directory`.

Every glossary key and canonical term must be unique. A term reference to an unknown key fails. Once a
canonical glossary term is registered, its **first** ordinary prose occurrence in a section must use
`:term[Canonical term]{key="..."}`; later occurrences in that same section may stay plain prose, and each
section is introduced on its own. The validator excludes the definition itself, marked references, inline
code, and code blocks and reports the unmarked authored range with a valid inline replacement.

`forms` declares the inflected spellings of the term, comma separated, at most 24 items of at most 64
characters each, none repeated and none claimed by another definition. An occurrence of a declared form is
an occurrence of the term, and the proposed replacement keeps the spelling the sentence used rather than
the canonical headword. The package does not inflect words itself: an undeclared inflection stays ordinary
prose, and that is the price of never producing a false match on a word that merely shares a stem. This keeps
terminology machine-checkable without splitting sentences, rewriting code samples, or forcing every mention
of a frequently repeated term to be annotated.

The occurrence validator recognizes the canonical prose form and every spelling declared in `forms`.
Explicitly marked labels such as `:term[атомам]{key="atom"}` are accepted as author-owned grammatical forms
of the same key. An inflection that is neither canonical nor declared is not guessed: the package performs
no morphological inference, and such a mention stays ordinary prose.

To explain code where a term first appears, use one closed fence field:

````markdown
```typescript terms="own-field,node-type"
@d.def(Node) accessor child!: Node;
@d.def(Node) accessor sibling!: Node;
```
````

The value contains 1–20 unique comma-separated glossary keys. Every key must exist, and its canonical term
must occur exactly and case-sensitively within one code line. The first occurrence for each key becomes the
same keyboard/hover/tap glossary control; repeated occurrences remain ordinary highlighted code. First
ranges may not overlap. Malformed metadata, unknown or duplicate keys, missing canonical text, multiline or
overlapping matches fail at the authored code block. Other fences keep current behavior. The code remains
escaped text, Shiki token colors are preserved, and copying excludes generated explanation panels.
`getSourceContract().source.codeFenceMetadata.terms` exposes the quoted envelope, separator, item bounds,
uniqueness, shared key constraint and exact-match policy as machine-readable discovery data.

`glossary.placement` defaults to `inline`. On a top-level or direct-section glossary definition, `appendix`
moves the complete visible definition into one labelled package-owned glossary appendix after the authored
reading flow, in authored document order. The source section retains no placeholder. Placement inside a
list, quote, lead, callout, or unrelated directive fails instead of leaving its parent empty. The appendix heading is
excluded from primary navigation, while every full-definition link and review target retains its stable ID
and authored source range.

The text form `:asset[Label]{src="path"}` uses the authored accessible label. The leaf form
`::asset{src="path"}` is also valid and receives the deterministic visible label `Download <filename>`.

## Interactive reader contract

All state is local to the generated component instance. Browser behavior is package-owned, works through
`file://` in both output formats, and never evaluates author content.

Response Workspace uses a closed version-1 manifest and export. Every exported question includes its stable
id, kind, explicit `answered` boolean, and kind-specific value; authored defaults may be visible while
`answered` remains false. Non-empty item comments are exported in a separate sorted array. Clipboard and
file actions serialize identical canonical JSON without clocks or random values. Import is bounded and
validates the complete schema, domains, form identity, and form revision before replacing current state; a
foreign, stale, unsupported, or malformed file leaves existing answers unchanged. No state is written to
cookies, Web Storage, IndexedDB, a service, or a form submission. The exact Response Workspace bounds are
20 forms per document, 50 questions and 250 items per form, 20 options per question, two to five buckets per
bucket question, 4,000 characters per text or comment value, and 2,000,000 bytes per imported response file.

| Primitive           | Initial state and semantic HTML                                                                                                                                                                                                                                                                                                                                                                                                         | Keyboard behavior                                                                                                                                                                                                          | Pointer/touch behavior and limits                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glossary` + `term` | The inline or appendix definition is a visible labelled section with a stable `glossary-<key>` ID. Each prose/code term is a button controlling a closed labelled contextual `dialog`; prose may show an authored form while the dialog title stays canonical. An open code-term panel is portalled to `body`, anchored next to its token, flipped/clamped within the viewport, and restored on close so code scrolling cannot clip it. | Focusing the term opens the explanation. `Escape` closes it and restores focus. The panel link navigates to the full definition.                                                                                           | Hover or click/tap opens the explanation; leaving/clicking outside closes it. The panel link is the explicit route to the full Markdown definition.                                                             |
| `disclosure`        | Native `details`/`summary`; closed unless `open="true"`.                                                                                                                                                                                                                                                                                                                                                                                | Native summary activation with `Enter` or `Space`.                                                                                                                                                                         | Click/tap the summary to toggle.                                                                                                                                                                                |
| `tabs` + `tab`      | `tablist`, `tab`, and `tabpanel` roles; the first direct `tab` is selected and other panels are hidden. Each panel requires `label`; non-`tab` directive children are rejected.                                                                                                                                                                                                                                                         | `ArrowLeft`/`ArrowRight` select and focus adjacent tabs with wraparound; `Home`/`End` select the first/last tab.                                                                                                           | Click/tap a tab to select its panel. State does not cross into another tabs instance.                                                                                                                           |
| `modal`             | Trigger button plus closed native `dialog` labelled by required `title`.                                                                                                                                                                                                                                                                                                                                                                | Activating the trigger opens the modal; native `Escape` closes it and restores focus to the opener. The Close button does the same.                                                                                        | Click/tap the trigger and Close button. Backdrop-click dismissal is not part of the contract.                                                                                                                   |
| `popover`           | Trigger button controls a closed non-modal labelled `dialog`.                                                                                                                                                                                                                                                                                                                                                                           | `Enter`/`Space` toggles the trigger. `Escape` closes an open panel and restores trigger focus.                                                                                                                             | Click/tap toggles; clicking outside closes without moving focus.                                                                                                                                                |
| `filter`            | Labelled search input plus polite live result count; the empty query shows every item.                                                                                                                                                                                                                                                                                                                                                  | Normal search-input editing.                                                                                                                                                                                               | Input filters case-insensitively while typing. Only `li` elements in a direct authored `ul` or `ol` are filter targets; nested lists are not independent targets.                                               |
| `toggle`            | Button with `role="switch"` and a controlled panel; `default="off"` hides content, `on` shows it.                                                                                                                                                                                                                                                                                                                                       | Native button `Enter`/`Space` toggles `aria-checked` and panel visibility.                                                                                                                                                 | Click/tap toggles the same state. Instances are isolated.                                                                                                                                                       |
| `demo`              | Bounded numeric output starts at `start` (default `0`).                                                                                                                                                                                                                                                                                                                                                                                 | Native Increment button activation adds `step` (default `1`).                                                                                                                                                              | Click/tap performs the same package-owned increment; no author script is accepted.                                                                                                                              |
| `copyable`          | Ordinary paragraphs, emphasis, links and wrapping remain visible body prose. One package button copies rendered visible text only; its own label and hidden helper/panel content are outside the content owner.                                                                                                                                                                                                                         | Native Copy button activation supports focus, `Enter`, and `Space`; success/failure text follows document locale.                                                                                                          | Click/tap performs the same clipboard action. Clipboard failure changes only the button label and leaves prose unchanged.                                                                                       |
| Review Workspace    | Annotation is always available without block controls or a mode. **Create note** opens the exact selection in an anchored full-thread popover; saved open/resolved ranges stay visibly distinct. `Review` opens only an overlay list/import/export surface and never reflows the report. Legacy whole-block threads remain list-only.                                                                                                   | `Shift` release focuses **Create note**. Each highlight has a focusable overlay marker; the popover textarea, edit, resolve/reopen, close, and list/import/export controls use native keyboard behavior and restore focus. | Pointer/touch selection exposes **Create note**; hover/tap on a saved range exposes **View thread**. Empty, whitespace-only, oversized, outside-report, control, reversed, or mismatched ranges create nothing. |
| `response`          | Native fieldsets, legends, radio buttons, checkboxes, selects, number inputs, textareas, ordered lists, safe original anchors, status output, import control, and copy/file export. Each form owns isolated current-tab state.                                                                                                                                                                                                          | Native fields cover every value. Bucket selects are the complete fallback to drag-and-drop; explicit Move up/down buttons reorder items. Copy, download, import, and original links use native controls.                   | Bucket cards may additionally be dragged between named columns. Pointer changes use the same state as keyboard controls; original links do not mutate answers.                                                  |

`actions`/`action` does not appear in the stateful table because it is an ordinary group of links. Native
anchor focus, Enter activation, URL behavior, and browser history apply without a package event handler.
In a default build, `source-link` is also a native anchor without a package event handler; its protected
separate browsing context and loopback-only grammar are compile-time link contracts rather than reader
state. Share output is ordinary inline text and has no activation or reader state.

## Page navigation and motion

Navigation is generated only when a page has at least two explicit top-level sections, or at least two
legacy H2 headings when no explicit sections exist. It is one native labelled navigation list with no
`menu` role. Exactly one link has `aria-current="location"`: a section or owned descendant hash selects
that section, a valid outside target selects the preceding section or the first when none precedes it, and
an empty or invalid hash uses the sticky-topbar activation line. Equal tops choose the later section and
document bottom chooses the final section. Without `IntersectionObserver`, direct hashes and clicks remain
deterministic and the same total geometry rules run at resize and settled-scroll boundaries; empty or
invalid hashes therefore use the current activation-line owner rather than a fixed fallback. Hash and
focused targets clear the sticky topbar. During normal-motion smooth hash navigation, the hash owner remains
current until the scroll settles. Native `scrollend` performs one terminal geometry update; browsers without
it coalesce the scroll series into one terminal update. Reduced motion uses the same final ownership without
smooth traversal.

This shell navigation is separate from authored `::contents`. The in-flow landmark uses the same final
primary inventory but exact visible headings, has no `aria-current` state or browser controller, remains in
the article at narrow widths, and is present for zero or one item even when shell navigation is absent.

On desktop, a persistent `Hide contents`/`Show contents` button collapses a non-modal navigation region,
removes hidden links from focus, and releases the content column. This state lasts only for the current
document session. On mobile, the same links move into a labelled native modal dialog. Close receives
initial focus; Tab and Shift+Tab remain contained; Escape, backdrop, and Close restore the trigger; a link
closes the dialog and focuses its target heading. Crossing to desktop while open closes the dialog safely.

`scrollProgress: true` installs one decorative transform-based progress indicator only in normal motion.
A section with `reveal="true"` becomes visible once using opacity and at most 12 pixels of translation over
220 milliseconds. Under `prefers-reduced-motion: reduce`, progress DOM/listeners/animation frames and
reveal hidden state/observer are absent. Without `IntersectionObserver`, reveal sections are immediately
visible. These behaviors are identical in both output formats through `file://`.

## Output behavior

`single-file` is the default. CSS and the package runtime are embedded inline; images, downloads,
and fonts become MIME-qualified data URLs whose binary payloads use base64. `directory` writes
`index.html` and hash-suffixed files under `assets/`, then rewrites references. Identical sources and tool
versions produce equal single-file bytes and equal directory name/content trees at independent
destinations; clean-package verification repeats the build through independent CLI processes.

`output.maxInlineBytes` is compared with the serialized inline CSS, package runtime, and image/download
data URLs including base64 expansion. A font data URL is counted once through generated CSS. The result's `bytes` field
separately reports the HTML file size, not a directory-tree total.

Both formats include the same package-owned page layout, theme/tokens, responsive navigation and bounded motion, default attribution footer, code-copy,
tabs, overlays, filters, switches, visualizations, and demo behavior. Tabs start on their first panel; disclosures use the
authored `open` value; toggles use `default: off` unless set to `on`; popovers start closed; filter counts
and modal state initialize in the browser. Wide tables and code scroll inside their content surface on
narrow screens instead of breaking the page. Runtime
placement follows the format and is not authored: inline for `single-file`, or a deterministic hashed local
asset for `directory`.

The attribution footer is the final visible package-owned block after the report shell in both formats. It
contains one ordinary HTTPS anchor named **Made with Agentic Report**. `attribution: false` removes that
footer at compile time and does not hide matching author-owned content.

An output may not resolve to, or share a filesystem identity with, the entry, a manifest, an included
partial, or a referenced local asset. A single file is written exclusively to a private sibling file and
published by atomic rename. Directory output is assembled in a private sibling directory and published by
rename. Injected partial-write and rename failures preserve the previous authoritative output, remove
compiler-owned staging, and permit immediate retry. The product does not attempt to defeat hostile
concurrent path swaps or provide process/OS crash recovery.

## Authored rules

The directive phase judges many authored subjects — a question, a section lead, a chart series, an
annotated code fence — through a declared set of rules. A rule answers with a violation or with
nothing; it never ends the phase, so one run reports every independent violation the source holds,
including several over the same element. A rule that reads what another rule accepted declares that
dependency, and it stays silent when the dependency refused: the record it would produce describes an
interpretation nobody accepted.

A rule only judges; what a judgement changes for the rest of the document — the identity a section
claims, the definition a glossary key registers — happens once the whole set accepted the subject, so a
refused subject takes nothing away from an accepted one.

`getSourceContract().authoredRules` and `describe` expose the rule sets, their rule ids and those
dependencies as data, readable without compiling a source. The sets are the declared ones, not every
judgement the phase makes: checks written before this arrangement — among them the children a
question accepts, code-fence metadata, the shape of a response form, and document-wide checks — are
ordinary code and are absent from the list, though they report violations the same way. Read the list
as what the phase declares, not as an inventory of everything it checks.

## Diagnostics and safety

`build`, `validate`, and `inspect` write only NDJSON records to stdout by default — `--json` names that
default and `--human` selects the prose projection of the same records — including
failures detected while parsing CLI arguments. Every record has a per-invocation `runId`, but no
independent transport version. Diagnostics contain a code, level, message, remediation, and optional
source/details, plus an optional `related` inventory carrying the remaining authored violations
of the same directive phase in source order and shaped like the diagnostic itself, minus the three that only
repeat a refusal already reported; it is absent when the run
found exactly one, and a failure of another stage ends the run with a single diagnostic. Unexpected internal causes do not cross the transport. Expected diagnostics sanitize
credential-bearing URL user information, signed-URL and other recognized credential
query/fragment/assignment values, credential-named detail fields, and corresponding path text to
`[REDACTED]`. Successful CLI records and ESM analysis identities use the same boundary; a redacted path is
not intended for subsequent filesystem access. Source bodies are not included. Do not use authored
references as secret storage. Source-backed errors use
`source.file`, `line`, `column`, `endLine`, and `endColumn` for the authored manifest, frontmatter,
Markdown, or partial; a referenced/missing target path is reported separately as `details.target`.

A diagnostic whose repair the product computed exactly also carries `fix`: the authored `file`, the
`start` and `end` of the replaced range, and the `replacement` text. The range is measured in UTF-16 code
units of the decoded file — the unit a JavaScript string index uses — and not in bytes: read the file as
text, slice by these numbers, and write it back. The field is present only where
applying it preserves every authored construction it spans, so an occurrence inside a link or other
wrapper carries none — replacing the wrapper would delete the author's own syntax, and no later check
would notice, because the loss happens inside the replaced range. A replacement that transport
sanitization would alter is withheld for the same reason. The `fix` command applies exactly these
replacements and nothing else; `build`, `validate`, `inspect` and `review` never write to an authored
source.

The compiler does not fetch remote assets, execute author code or template helpers, enable raw HTML,
start a server, publish, or deploy. Unknown directives fail instead of silently producing ambiguous
output.

There is no public plugin, callback, dynamic-import, evaluation, or executable-template surface. New
declarative capabilities must first satisfy the checked
[`extension proposal schema`](../generated/extension-proposal.schema.json) using the
[`complete template`](../generated/extension-proposal.template.json). Its closed `trustBoundary` fields
make author code, callbacks, evaluation, dynamic imports and network access forbidden and require
source-root confinement, offline deterministic behavior, CSP compatibility and bounded package-owned
runtime behavior. This is a development-time evidence gate; it does not load third-party code into
authored reports.
