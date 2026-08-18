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
  followed by optional 2–8 character ASCII alphanumeric subtags; default `und` means undetermined;
- `theme`: `system`, `light`, or `dark`;
- `layout`: `document`, `dashboard`, `landing`, or `mixed`;
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
internal implementation detail. Checked JSON forms are available in [`../generated/`](../generated/),
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

The ESM `validateReport({ input, format? })` and `inspectReport({ input, format? })` operations use the
production source and render preparation without output publication. CLI `validate [input] [--format
<format>] [--json]` and `inspect [input] [--format <format>] [--json]` are adapters of the same
functions. Validation reports resolved project/entry identity, output format, derived runtime placement,
and warnings. Inspection also reports sorted relative source files, observed directives and local-resource
occurrence counts, and the registry-derived command/format/starter/capability catalog. Both commands read
and validate all resources required by the selected format but do not create or replace an output artifact.

The root metadata value, `tokens`, and `output` must be objects; scalar and array shapes fail instead of being
silently replaced by defaults. Validation diagnostics point to the actual manifest or frontmatter field
range that supplied the failing value.

Defaults are `layout: document`, `theme: system`, and `tokens: { density: comfortable, font: sans,
accent: indigo, width: standard, radius: soft }`. Omitted token fields receive their individual defaults.
These values select package-owned styles only; CSS values, class names, JSX, templates, and callbacks are
not accepted. `agentic-report describe --json` and the ESM `getSourceContract()` return the same `page`
domain and defaults. The packaged `layout-document`, `layout-dashboard`, `layout-landing`, and
`layout-mixed` examples exercise every layout.
The six starter examples combine these layouts with the public content, interaction, visualization,
partial, and local-asset contracts; they introduce no additional syntax.

## Partials and Markdown

`{{include: partials/context.md}}` inserts a Markdown partial. Only `.md` files are accepted. Includes are
limited to ten nested levels; cycles, missing files, malformed URI paths, and escaping lexical or symlink
paths fail with structured input diagnostics.

CommonMark plus GitHub Flavored Markdown tables, strikethrough, task-list syntax, and autolink literals is
converted through a typed unified AST. Raw HTML is not enabled. Sanitization occurs before package-trusted
syntax highlighting and semantic enhancement.

## Semantic primitives

The directive vocabulary is:

- `callout`: emphasized finding with optional `title` and lowercase `kind`;
- `decision`: decision or branch container with optional `title`;
- `cards` and nested `card`: responsive content grid;
- `steps`: styled process container whose authored Markdown supplies the ordered or explanatory content;
- `glossary`: reusable definition with required stable `key` and canonical `term` text;
- `term`: inline or standalone reference to a glossary `key`; output uses the canonical definition text,
  opens a contextual explanation on hover, focus, or tap, and provides a link to the full definition;
- `disclosure`: native details block with required `title` and optional initial `open` state;
- `tabs` and directly nested `tab`: keyboard-operable panels; each `tab` requires a visible `label`;
- `modal`: modal dialog with required `title` and optional trigger label;
- `popover`: dismissible non-modal contextual panel with required `title` and optional trigger label;
- `filter`: text filtering for directly authored list items with optional `title` and `placeholder`;
- `toggle`: switch-controlled content with required `label`, optional `title`, and `default` state;
- `chart`, nested `series`, and nested leaf `point`: compile-time `bar`, `line`, or `pie` SVG from bounded
  labelled numeric values;
- `diagram` with leaf `node` and `edge` children: compile-time directed flow SVG with validated node
  identities and references;
- `timeline` and directly nested `event`: semantic ordered chronology; each event may contain Markdown;
- `demo`: safe built-in counter with optional `title`, `start`, and `step`; it never evaluates author code;
- `asset`: downloadable local resource with required `src`;
- `font`: local WOFF2, WOFF, TTF, OTF, or other MIME-detected font resource with required `src` and
  validated `family`.

Container directives use `:::name ... :::`; nested containers use a longer outer fence. `asset` and
`font` support leaf directives. Use `:term[Canonical term]{key="term-key"}` inside prose; the label marks
the authored range, while output always uses the registered canonical text. The compatible standalone form
`::term{key="term-key"}` remains available when a detached reference is intentional. A `tab` must be a
direct directive child of `tabs`, and other directive children are rejected there. Complete copyable examples
are in
[`docs/AGENT-REFERENCE.md`](../AGENT-REFERENCE.md) and the shipped
[`examples/basic`](../../examples/basic), [`examples/research`](../../examples/research),
[`examples/architecture`](../../examples/architecture), [`examples/tutorial`](../../examples/tutorial),
[`examples/dashboard`](../../examples/dashboard), [`examples/landing`](../../examples/landing), and
[`examples/interactive-catalog`](../../examples/interactive-catalog) sources. The complete data example is
[`examples/visualization-catalog`](../../examples/visualization-catalog).

Top-level visuals require `title` and `description`. A chart accepts 1–6 `series`; each series accepts 1–12
leaf `point` values, and every series must use the same unique labels in the same order. Values are finite
decimal numbers between `-999999999` and `999999999`, with at most four decimal places. Pie charts require
one series, non-negative values, and at least one positive value. A diagram accepts 1–12 unique nodes and
up to 20 edges; every edge must reference two distinct declared node IDs. `direction` is `right` or `down`.
A timeline accepts 1–20 direct events. Visual data containers reject prose as a direct child, while an
event body accepts ordinary Markdown.

The compiler emits responsive deterministic SVG for charts and diagrams and semantic HTML for timelines.
Titles and descriptions are visible and label each atomic SVG image. The SVG accessible description also
contains every complete series/point value or diagram node/connection label, including text shortened only
in the visible plot. Values retain up to the supported four decimal places in observable text. Colors come
from package-owned theme variables. There is no visualization-time JavaScript, canvas, network request,
author CSS, executable graph DSL, or separate behavior between `single-file` and `directory`.

Every glossary key and canonical term must be unique. A term reference to an unknown key fails. Once a
canonical glossary term is registered, an ordinary prose occurrence must use
`:term[Canonical term]{key="..."}`; the validator excludes the definition itself, marked references, inline
code, and code blocks and reports the unmarked authored range with a valid inline replacement. This keeps
terminology machine-checkable without splitting sentences or rewriting code samples.

The text form `:asset[Label]{src="path"}` uses the authored accessible label. The leaf form
`::asset{src="path"}` is also valid and receives the deterministic visible label `Download <filename>`.

## Interactive reader contract

All state is local to the generated component instance. Browser behavior is package-owned, works through
`file://` in both output formats, and never evaluates author content.

| Primitive           | Initial state and semantic HTML                                                                                                                                                                        | Keyboard behavior                                                                                                                   | Pointer/touch behavior and limits                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glossary` + `term` | The definition is a visible labelled section with a stable `glossary-<key>` ID. Each term is a button controlling a closed labelled contextual `dialog`; its text comes from the canonical definition. | Focusing the term opens the explanation. `Escape` closes it and restores focus. The panel link navigates to the full definition.    | Hover or click/tap opens the explanation; leaving/clicking outside closes it. The panel link is the explicit route to the full Markdown definition.               |
| `disclosure`        | Native `details`/`summary`; closed unless `open="true"`.                                                                                                                                               | Native summary activation with `Enter` or `Space`.                                                                                  | Click/tap the summary to toggle.                                                                                                                                  |
| `tabs` + `tab`      | `tablist`, `tab`, and `tabpanel` roles; the first direct `tab` is selected and other panels are hidden. Each panel requires `label`; non-`tab` directive children are rejected.                        | `ArrowLeft`/`ArrowRight` select and focus adjacent tabs with wraparound; `Home`/`End` select the first/last tab.                    | Click/tap a tab to select its panel. State does not cross into another tabs instance.                                                                             |
| `modal`             | Trigger button plus closed native `dialog` labelled by required `title`.                                                                                                                               | Activating the trigger opens the modal; native `Escape` closes it and restores focus to the opener. The Close button does the same. | Click/tap the trigger and Close button. Backdrop-click dismissal is not part of the contract.                                                                     |
| `popover`           | Trigger button controls a closed non-modal labelled `dialog`.                                                                                                                                          | `Enter`/`Space` toggles the trigger. `Escape` closes an open panel and restores trigger focus.                                      | Click/tap toggles; clicking outside closes without moving focus.                                                                                                  |
| `filter`            | Labelled search input plus polite live result count; the empty query shows every item.                                                                                                                 | Normal search-input editing.                                                                                                        | Input filters case-insensitively while typing. Only `li` elements in a direct authored `ul` or `ol` are filter targets; nested lists are not independent targets. |
| `toggle`            | Button with `role="switch"` and a controlled panel; `default="off"` hides content, `on` shows it.                                                                                                      | Native button `Enter`/`Space` toggles `aria-checked` and panel visibility.                                                          | Click/tap toggles the same state. Instances are isolated.                                                                                                         |
| `demo`              | Bounded numeric output starts at `start` (default `0`).                                                                                                                                                | Native Increment button activation adds `step` (default `1`).                                                                       | Click/tap performs the same package-owned increment; no author script is accepted.                                                                                |

## Output behavior

`single-file` is the default. CSS and the package runtime are embedded inline; images, downloads,
and fonts become MIME-qualified data URLs whose binary payloads use base64. `directory` writes
`index.html` and hash-suffixed files under `assets/`, then rewrites references. Identical sources and tool
versions produce equal single-file bytes and equal directory name/content trees at independent
destinations; clean-package verification repeats the build through independent CLI processes.

`output.maxInlineBytes` is compared with the serialized inline CSS, package runtime, and image/download
data URLs including base64 expansion. A font data URL is counted once through generated CSS. The result's `bytes` field
separately reports the HTML file size, not a directory-tree total.

Both formats include the same package-owned page layout, theme/tokens, responsive navigation, code-copy,
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
