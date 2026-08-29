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
into an absent directory whose immediate parent is an existing ordinary non-symlink directory. It rejects
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

## Review protocol and source binding

Every normal build embeds an inert version-2 review manifest in a `template` element. Container directives
that produce a final DOM owner and ordinary Markdown blocks receive deterministic review-target identities;
structural chart `series` data is reviewed through its owning chart rather than a removed intermediate node. Each target records its kind,
SHA-256 fingerprint, source-root-relative entry or partial path, and authored range. A section with an
explicit `id` also receives a stable review key. The manifest never contains source bodies or absolute
workstation paths.

The manifest `reportRevision` is a SHA-256 identity over the complete confined local input graph used by the
report—entry, metadata, expanded partials, and referenced local resources—plus the review/source-contract
versions, target-algorithm version, and canonical target inventory. It is independent of output destination
and `single-file` versus `directory`; `BuildReportResult.contentHash` remains the hash of the serialized
output HTML and is a separate contract.

A review artifact is strict version-2 JSON with a bound report revision, at most 500 target threads and at
most 500 messages. Each thread owns ordered revision segments; every segment binds one report revision and
target to its messages and resolved boolean. Changed continuation appends a current segment while historical
segments remain immutable. Serialization sorts thread identities while preserving segment and conversational message order and adds no clock or random field. Messages
are trimmed and normalized to Unicode NFC before length validation, so canonically equivalent input produces
identical bytes. Review text is local potentially sensitive data and must be handled like report source.

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

When a report contains review targets, its topbar includes `Review`. The normal page remains clean until the
reader activates that control. In review mode each actual block target receives a labelled button; selecting
it opens the target editor. Tight-list paragraphs do not become separate targets because they render without
their own paragraph element—the containing list remains reviewable.

The interface supports one thread per target, ordered user and agent messages, message editing, and
resolved/reopened state. A compact target indicator opens the thread and a separate control resolves it.
Canonical version-2 `review.json` download and exact-revision import preserve the full conversation. Import
rejects oversized, malformed, version-1, stale, foreign, or non-current targets without replacing active state.

Desktop uses a non-modal right rail and leaves the report interactive. Mobile uses a native modal bottom
sheet; closing it returns focus to the topbar or target button that opened it, while `Exit review` hides every
target control. Review state is session-only and never written to browser storage, URL, network, or report
source. Message authorship is descriptive rather than authenticated.

The root metadata value, `tokens`, and `output` must be objects; scalar and array shapes fail instead of being
silently replaced by defaults. Validation diagnostics point to the actual manifest or frontmatter field
range that supplied the failing value.

Defaults are `layout: document`, `theme: system`, `preset: studio`, and `scrollProgress: false`. Presets provide these coordinated
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

Numeric clock and duration tokens with two or three groups remain ordinary text: the trailing groups contain
exactly two digits in the `00`–`59` domain, as in `21:01`, `21:01 — 00:12`, and `1:30:05`. They require no
backslash in Markdown or frontmatter. This narrow lexical rule does not accept malformed times or suppress
unknown alphabetic directives; those continue through the normal directive diagnostic.

## Semantic primitives

The directive vocabulary is:

- `section`: top-level labelled page region with required `title`, optional stable `id` and short `nav`
  label, closed `width`, `align`, and `tone` choices, and optional boolean `reveal`;
- `actions` and directly nested leaf `action`: responsive ordinary link group; every action requires a
  visible label and safe `href` and may select `primary`, `secondary`, or `quiet` emphasis;
- `source-link`: inline source-location link with a short visible label and a bounded IPv4-loopback editor
  helper URL containing an absolute path and positive line;
- `callout`: emphasized finding with optional `title` and lowercase `kind`;
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
- `glossary`: reusable definition with required stable `key`, canonical `term` text, and optional
  `placement="inline|appendix"`;
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

An `actions` container accepts one or more direct `action` children and no prose. `href` accepts a
same-page `#anchor`, a relative target, HTTP(S), or `mailto:`. Executable schemes such as `javascript:` and
`data:`, `file:` URLs, absolute local paths, protocol-relative URLs, callbacks, forms, and scripts are not
part of the contract. Output is an ordinary keyboard-operable anchor; action emphasis is package-owned
styling and adds no runtime behavior.

Use `:source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}`
for an address that a reader opens repeatedly while following code. The visible label is authored and may
stay short; `href` must use literal host `127.0.0.1`, a port from 1 through 65535, `/open`, a `path` value
beginning with `/` or encoded `%2F`, and a positive `line`. The output is a native link in a protected
separate browsing context. The report page therefore remains in place for either an empty 200 or 204 helper
response. The package never contacts the helper during build, validation, inspection, or page startup, does
not verify that the external helper opened an editor, and adds no network CSP capability.
The full absolute path is still present in the generated HTML even though only the short label is visible.
Treat a page containing `source-link` as workstation-specific. Do not put credentials or sensitive directory
names in the path, and remove or replace source links before public distribution when revealing the local
path is unacceptable or the recipient does not share the same filesystem layout.

Top-level visuals require `title` and `description`. A chart accepts 1–6 `series`; each series accepts 1–12
leaf `point` values, and every series must use the same unique labels in the same order. Values are finite
decimal numbers between `-999999999` and `999999999`, with at most four decimal places. Pie charts require
one series, non-negative values, and at least one positive value. `diagram.type` defaults to `flow`. A flow
accepts 1–20 unique nodes and up to 40 edges; it is ungrouped or declares 2–3 non-empty groups and gives every
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
canonical glossary term is registered, an ordinary prose occurrence must use
`:term[Canonical term]{key="..."}`; the validator excludes the definition itself, marked references, inline
code, and code blocks and reports the unmarked authored range with a valid inline replacement. This keeps
terminology machine-checkable without splitting sentences or rewriting code samples.

The occurrence validator deliberately recognizes only the exact canonical prose form. Explicitly marked
labels such as `:term[атомам]{key="atom"}` are accepted as author-owned grammatical forms of the same key;
unmarked inflected forms are not guessed or reported as checked.

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

`glossary.placement` defaults to `inline`. On a top-level glossary definition, `appendix` moves the complete
visible definition into one labelled package-owned glossary appendix after the authored reading flow, in definition order. A nested appendix definition fails instead of leaving its parent empty. The appendix heading is
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

| Primitive           | Initial state and semantic HTML                                                                                                                                                                                                                                                                                                                                                                                                         | Keyboard behavior                                                                                                                                                                                        | Pointer/touch behavior and limits                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glossary` + `term` | The inline or appendix definition is a visible labelled section with a stable `glossary-<key>` ID. Each prose/code term is a button controlling a closed labelled contextual `dialog`; prose may show an authored form while the dialog title stays canonical. An open code-term panel is portalled to `body`, anchored next to its token, flipped/clamped within the viewport, and restored on close so code scrolling cannot clip it. | Focusing the term opens the explanation. `Escape` closes it and restores focus. The panel link navigates to the full definition.                                                                         | Hover or click/tap opens the explanation; leaving/clicking outside closes it. The panel link is the explicit route to the full Markdown definition.               |
| `disclosure`        | Native `details`/`summary`; closed unless `open="true"`.                                                                                                                                                                                                                                                                                                                                                                                | Native summary activation with `Enter` or `Space`.                                                                                                                                                       | Click/tap the summary to toggle.                                                                                                                                  |
| `tabs` + `tab`      | `tablist`, `tab`, and `tabpanel` roles; the first direct `tab` is selected and other panels are hidden. Each panel requires `label`; non-`tab` directive children are rejected.                                                                                                                                                                                                                                                         | `ArrowLeft`/`ArrowRight` select and focus adjacent tabs with wraparound; `Home`/`End` select the first/last tab.                                                                                         | Click/tap a tab to select its panel. State does not cross into another tabs instance.                                                                             |
| `modal`             | Trigger button plus closed native `dialog` labelled by required `title`.                                                                                                                                                                                                                                                                                                                                                                | Activating the trigger opens the modal; native `Escape` closes it and restores focus to the opener. The Close button does the same.                                                                      | Click/tap the trigger and Close button. Backdrop-click dismissal is not part of the contract.                                                                     |
| `popover`           | Trigger button controls a closed non-modal labelled `dialog`.                                                                                                                                                                                                                                                                                                                                                                           | `Enter`/`Space` toggles the trigger. `Escape` closes an open panel and restores trigger focus.                                                                                                           | Click/tap toggles; clicking outside closes without moving focus.                                                                                                  |
| `filter`            | Labelled search input plus polite live result count; the empty query shows every item.                                                                                                                                                                                                                                                                                                                                                  | Normal search-input editing.                                                                                                                                                                             | Input filters case-insensitively while typing. Only `li` elements in a direct authored `ul` or `ol` are filter targets; nested lists are not independent targets. |
| `toggle`            | Button with `role="switch"` and a controlled panel; `default="off"` hides content, `on` shows it.                                                                                                                                                                                                                                                                                                                                       | Native button `Enter`/`Space` toggles `aria-checked` and panel visibility.                                                                                                                               | Click/tap toggles the same state. Instances are isolated.                                                                                                         |
| `demo`              | Bounded numeric output starts at `start` (default `0`).                                                                                                                                                                                                                                                                                                                                                                                 | Native Increment button activation adds `step` (default `1`).                                                                                                                                            | Click/tap performs the same package-owned increment; no author script is accepted.                                                                                |
| `response`          | Native fieldsets, legends, radio buttons, checkboxes, selects, number inputs, textareas, ordered lists, safe original anchors, status output, import control, and copy/file export. Each form owns isolated current-tab state.                                                                                                                                                                                                          | Native fields cover every value. Bucket selects are the complete fallback to drag-and-drop; explicit Move up/down buttons reorder items. Copy, download, import, and original links use native controls. | Bucket cards may additionally be dragged between named columns. Pointer changes use the same state as keyboard controls; original links do not mutate answers.    |

`actions`/`action` does not appear in the stateful table because it is an ordinary group of links. Native
anchor focus, Enter activation, URL behavior, and browser history apply without a package event handler.
`source-link` is also a native anchor without a package event handler; its protected separate browsing
context and loopback-only grammar are compile-time link contracts rather than reader state.

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

Both formats include the same package-owned page layout, theme/tokens, responsive navigation and bounded motion, code-copy,
tabs, overlays, filters, switches, visualizations, and demo behavior. Tabs start on their first panel; disclosures use the
authored `open` value; toggles use `default: off` unless set to `on`; popovers start closed; filter counts
and modal state initialize in the browser. Wide tables and code scroll inside their content surface on
narrow screens instead of breaking the page. Runtime
placement follows the format and is not authored: inline for `single-file`, or a deterministic hashed local
asset for `directory`.

An output may not resolve to, or share a filesystem identity with, the entry, a manifest, an included
partial, or a referenced local asset. A single file is written exclusively to a private sibling file and
published by atomic rename. Directory output is assembled in a private sibling directory and published by
rename. Injected partial-write and rename failures preserve the previous authoritative output, remove
compiler-owned staging, and permit immediate retry. The product does not attempt to defeat hostile
concurrent path swaps or provide process/OS crash recovery.

## Diagnostics and safety

`build --json`, `validate --json`, and `inspect --json` write only NDJSON records to stdout, including
failures detected while parsing CLI arguments. Every record has a per-invocation `runId`, but no
independent transport version. Diagnostics contain a code, level, message, remediation, and optional
source/details. Unexpected internal causes do not cross the transport. Expected diagnostics sanitize
credential-bearing URL user information, signed-URL and other recognized credential
query/fragment/assignment values, credential-named detail fields, and corresponding path text to
`[REDACTED]`. Successful CLI records and ESM analysis identities use the same boundary; a redacted path is
not intended for subsequent filesystem access. Source bodies are not included. Do not use authored
references as secret storage. Source-backed errors use
`source.file`, `line`, `column`, `endLine`, and `endColumn` for the authored manifest, frontmatter,
Markdown, or partial; a referenced/missing target path is reported separately as `details.target`.

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
