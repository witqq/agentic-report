# Agent reference

This is the copyable reference for the implemented CLI and declarative source contract. Only syntax exposed
by the commands, generated schemas, and source contract below is supported.

## Install the current tarball and recover from an authored error

From the package repository, build one tarball and install that exact artifact into a clean directory:

```bash
pnpm install
pnpm build
PACK_DIR="$(mktemp -d)"
CONSUMER_DIR="$(mktemp -d)"
pnpm pack --pack-destination "$PACK_DIR"
cd "$CONSUMER_DIR"
npm init --yes
npm install "$PACK_DIR"/agentic-report-*.tgz
npx agentic-report init ./my-report --starter report
printf '\nAgent-authored edit.\n' >> ./my-report/report.md
printf '\n![Remote asset used to test diagnostics](https://local.invalid/image.png)\n' >> ./my-report/report.md
! npx agentic-report validate ./my-report --json
! npx agentic-report inspect ./my-report --json
sed -i.bak '/Remote asset used to test diagnostics/d' ./my-report/report.md
npx agentic-report validate ./my-report --json
npx agentic-report inspect ./my-report --json
npx agentic-report build ./my-report --output ./report.html --json
```

The two commands prefixed with `!` are expected to fail with `REMOTE_ASSET_BLOCKED`; neither analysis
operation writes output. After removing the broken Markdown line, validation and inspection return result
records and build creates `report.html`. The package smoke test executes the same installed
`init → edit → break → validate → inspect → fix → build` route, including credential redaction and output
sentinels.

## Discover the contract

```bash
agentic-report describe --json
agentic-report schema
agentic-report schema --scope directives
agentic-report schema --scope source
agentic-report examples --json
```

`describe` returns the current source-contract description, including directive forms, attributes,
constraints, nesting, resource/runtime behavior, and output formats. `schema` defaults to the
accepted manifest-input JSON Schema; `--scope directives` returns directive grammar and constraints, and
`--scope source` describes a complete source object. `examples` returns installed example metadata plus
absolute entry paths from the CLI adapter.

The ESM API exposes the same data through `getSourceContract()`, `getAuthoringSchema(scope)`, and
`listExamples()`. The first two return defensive values rather than public Zod instances; `listExamples()`
returns package-relative example identities and entry paths, while the CLI resolves entries to absolute
installed paths. Checked
JSON projections are under [`generated/`](generated/), and the hash-bound packaged inventory is
[`../examples/manifest.json`](../examples/manifest.json). Agents should inspect these contracts instead of
inferring unsupported fields.

## Initialize the packaged starter

Initialize through the CLI or the equivalent ESM API:

```bash
agentic-report init ./my-report
agentic-report init ./my-report --starter report --json
agentic-report init ./research-brief --starter research
```

```js
import { initProject } from 'agentic-report';

const project = await initProject({ destination: './my-report' });
console.log(project.entryPath);
```

The destination must be absent and its immediate parent must already be an ordinary non-symlink
directory. Any existing file, directory (including empty), or symlink is rejected unchanged.
Initialization selects the single registry-owned default unless `starter` names any other initializable
packaged example or alias. Six starter trees are packaged:

| Selector       | Purpose                                                      |
| -------------- | ------------------------------------------------------------ |
| `report`       | Decision-ready report; alias of stable canonical ID `basic`  |
| `research`     | Method, evidence, comparison, and recommendation             |
| `architecture` | System boundary, alternatives, consequences, and rollout     |
| `tutorial`     | Step-by-step first-use lesson with code and bounded practice |
| `dashboard`    | Operational cards, charts, filtering, and optional detail    |
| `landing`      | Focused narrative, benefits, proof, and delivery milestones  |

The report starter is the default. `examples --json` and `listExamples()` expose the canonical ID,
`starter.default`, and `starter.aliases`; `init --starter report` returns canonical `starterId: "basic"`.
Eligibility, aliases, and default selection are registry facts shared by discovery and initialization. The operation validates
and fully reads the packaged tree before exclusively creating the destination; ordinary files use
no-overwrite creation. It never overwrites, merges, deletes, or rolls back destination content. A later
failure may leave the newly created destination incomplete; inspect it and remove it explicitly before
retrying. The result contains starter, project and entry identity plus a sorted package-relative file
inventory; it does not contain source file contents.

Human success is `Created <projectPath> from starter <starterId> (<count> files)`. With `--json`, stdout
contains one NDJSON result record with `type`, `runId`, `starterId`, `starterTitle`, `projectPath`,
`entryPath`, and `files`. Expected failures use the common diagnostic record and exit code `1`.

## Validate and inspect without writing output

```bash
agentic-report validate ./my-report
agentic-report validate ./my-report --format directory --json
agentic-report inspect ./my-report
agentic-report inspect ./my-report --format directory --json
```

`validate` and `inspect` run the same source loading, directive validation, local-resource reads,
Markdown rendering, output selection, package-asset resolution, and warning calculation as `build`, but
they do not publish `report.html`, `report-artifact`, or any other output. `--format` checks either
supported output path without changing the manifest.

Human validation prints the resolved entry plus format and runtime placement. Human inspection prints the
inspection result as formatted JSON. With `--json`, warnings are NDJSON diagnostic records followed by
one result record. Validation returns `contractVersion`, absolute `projectPath` and `entryPath`,
`format`, derived `runtimePlacement`, and sanitized `warnings`. Inspection returns those identities
plus:

- `output.format` and `output.runtimePlacement`;
- sorted source-root-relative `sourceFiles`, including read partials and local resources; resolve them
  against the returned `projectPath`, or against the caller's input root when that identity contains a
  `[REDACTED]` path segment;
- sorted distinct `observed.directives` and image/download/font occurrence counts;
- the registry-derived command, format, page, starter, and capability `catalog`;
- sanitized `warnings`.

The ESM equivalents are:

```js
import { inspectReport, validateReport } from 'agentic-report';

const validation = await validateReport({ input: './my-report' });
const inspection = await inspectReport({ input: './my-report', format: 'directory' });
```

## Minimal source

```text
my-report/
├── report.md
├── agentic-report.yaml
├── assets/
│   ├── architecture.png
│   ├── evidence.json
│   └── report.woff2
└── partials/
    └── risks.md
```

`report.md`:

```markdown
---
title: Architecture analysis
description: Options and decision branches
language: en
layout: mixed
theme: system
preset: signal
scrollProgress: true
tokens:
  radius: round
---

# Architecture analysis

{{include: partials/risks.md}}

![Context](assets/architecture.png)

:::callout{title="Decision" kind="info"}
Use semantic directives instead of handwritten layout.
:::
```

## Choose the page shape

The package owns the page shell and design system. Metadata selects one closed layout, coordinated preset,
theme, and optional token values:

- `layout`: `document` (default), `dashboard`, `landing`, or `mixed`;
- `preset`: `studio` (default), `editorial`, or `signal`;
- `theme`: `system` (default), `light`, or `dark`;
- `scrollProgress`: boolean, default `false`; decorative normal-motion reading progress;
- `tokens.density`: `compact`, `comfortable`, or `spacious`;
- `tokens.font`: `sans`, `serif`, or `mono`;
- `tokens.accent`: `indigo`, `teal`, or `coral`;
- `tokens.width`: `narrow`, `standard`, or `wide`;
- `tokens.radius`: `sharp`, `soft`, or `round`.

Preset token defaults are `studio = comfortable/sans/indigo/standard/soft`, `editorial =
spacious/serif/coral/narrow/soft`, and `signal = compact/sans/teal/wide/sharp`, in the token order above.
The preset applies first, theme controls only light/dark/system color resolution, and every explicitly
authored token field overrides its preset value. Do not repeat all five token fields when the preset
already expresses the intended family.

The public discovery contract represents this rule as `page.tokenResolution`: defaults come from the
selected preset, then explicit token fields apply. For source-contract-major compatibility, each
`page.tokens` entry retains Studio's internal normalization `default` and marks it
`defaultVisibility: normalization-only`; a discovery consumer must not materialize such values as authored
tokens. Use the complete maps in `page.presets` when constructing an editor or agent prompt, and apply only
defaults whose visibility is `published`.

`document` emphasizes long-form reading with persistent desktop contents. `dashboard` uses a wide dense
surface and horizontal desktop navigation. `landing` provides a spacious centered hero and wide content
sections. `mixed` combines a reading column with wide evidence, cards, tables, and media. Every layout
collapses to one mobile column with a package-owned contents drawer. Wide tables and code remain locally
scrollable rather than breaking the page.

Run `agentic-report examples --json` to locate the installed `layout-document`, `layout-dashboard`,
`layout-landing`, `layout-mixed`, `interactive-catalog`, and `visualization-catalog` examples. The same
source builds through either output format; authors never provide JSX, CSS, browser code, runtime
placement, or a layout-specific template.

The same inventory also contains the six initializable starters. Starters are buildable examples with
`starter` metadata, not a second template or generator system.

### Rebuild the realistic showcases

The registry also exposes three non-starter, decision-oriented examples. They are ordinary public source
trees rather than templates or a separate showcase system:

| ID                                                  | Page shape | Intended review                                                                          |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| [`incident-review`](../examples/incident-review/)   | `mixed`    | Service impact, causal evidence, recovery, and owned follow-up                           |
| [`vendor-decision`](../examples/vendor-decision/)   | `document` | Mandatory procurement gates, weighted evidence, and conditional adoption                 |
| [`launch-readiness`](../examples/launch-readiness/) | `landing`  | Audience value, activation/funnel evidence, launch gates, and a reversible regional beta |

From a checkout containing the package-owned source paths:

```bash
agentic-report validate ./examples/incident-review
agentic-report inspect ./examples/vendor-decision --json
agentic-report build ./examples/incident-review --output ./incident-review.html
agentic-report build ./examples/vendor-decision --output ./vendor-decision.html
agentic-report build ./examples/launch-readiness --output ./launch-readiness.html
agentic-report build ./examples/launch-readiness --format directory --output ./launch-readiness-directory
```

Open each single file or directory `index.html` through `file://`. For an installed package, first run
`agentic-report examples --json`; the response contains an `examples` array whose items have an absolute
`entry` value. Use the parent directory of that value as the input for `validate`, `inspect`, or `build`.
`single-file` remains the default; `directory` changes runtime and asset placement, not source semantics or
reader behavior.

### Build a landing page

Use the `landing` starter for a new restrained product or project page. It is the same declarative contract
as reports and decisions, not a frontend-project scaffold:

```bash
npx --yes agentic-report init ./my-page --starter landing --json
npx --yes agentic-report validate ./my-page --json
npx --yes agentic-report inspect ./my-page --json
npx --yes agentic-report build ./my-page --output ./my-page.html --json
```

The first zero-install `npx` run requires registry/network access and Node.js 24.18.0 or newer. The normal
generated page then opens locally through `file://` and requires the included package-owned browser runtime.
Authors write no JSX, raw HTML, CSS, or browser JavaScript.

The repository's canonical product proof is [`../website/landing`](../website/landing/). Its example cards
link to separately publishable incident-review, vendor-decision, and launch-readiness pages plus direct
public Markdown source routes. [`../website/routes.json`](../website/routes.json) owns those relative route
identities for deterministic static staging; a screenshot alone is never treated as the live example.

## Semantic directives

Directives are declarative and allowlisted. Unknown names and invalid attributes fail with actionable
diagnostics.

```markdown
::::section{title="Decision" id="decision" nav="Decision" width="wide" align="start" tone="soft" reveal="true"}
:::callout{title="Finding" kind="warning"}
Content may contain ordinary Markdown.
:::

:::actions
::action[Review the decision]{href="#decision" kind="primary"}
::action[Open related evidence]{href="evidence.html" kind="secondary"}
::action[Project home]{href="https://example.com/project" kind="quiet"}
:::
::::

:::decision{title="Output choice"}
Choose `single-file` when transport is the priority.
:::

::::cards
:::card{title="Portable"}
One offline HTML file.
:::
:::card{title="Discoverable"}
Schemas and examples are CLI-readable.
:::
::::

:::steps{title="Build sequence"}

1. Write Markdown.
2. Add local resources.
3. Run the CLI.
   :::

Use the :term[Review packet]{key="review-packet"} while writing ordinary prose.

:::glossary{key="review-packet" term="Review packet"}
A reusable definition shared by every marked reference.
:::

:::disclosure{title="Build details" open="true"}
This content starts expanded and uses native disclosure semantics.
:::

::::tabs{title="Output choices"}
:::tab{label="Single file"}
One self-contained HTML artifact.
:::
:::tab{label="Directory"}
HTML plus content-addressed local assets.
:::
::::

:::modal{title="Release checklist" trigger="Open checklist"}
Review the generated artifact before delivery.
:::

:::popover{title="Local behavior" trigger="Show note"}
The artifact opens directly through `file://`.
:::

:::filter{title="Filter checks" placeholder="Search checks"}

- Source validation
- Browser inspection
  :::

:::toggle{title="Optional evidence" label="Show evidence" default="off"}
Evidence becomes visible when the package-owned switch is active.
:::

:::demo{title="Safe counter" start="1" step="2"}
The package-owned runtime increments a number. Author JavaScript is never executed.
:::

:asset[Download evidence]{src="assets/evidence.json"}

::asset{src="assets/evidence.json"}

::font{src="assets/report.woff2" family="Report Sans"}
```

### Data visualizations

Visuals use nested data directives, not JSX, JavaScript, JSON-in-an-attribute, or a graph language:

```markdown
:::::chart{type="bar" title="Weekly builds" description="Successful builds increase each week." x-label="Week" y-label="Builds"}
::::series{label="Assisted"}
::point{label="W1" value="42"}
::point{label="W2" value="68.5"}
::::
::::series{label="Baseline"}
::point{label="W1" value="31"}
::point{label="W2" value="44"}
::::
:::::

:::diagram{title="Build flow" description="Validated source becomes a portable artifact." direction="right"}
::node{id="source" label="Source" kind="accent"}
::node{id="artifact" label="Artifact" kind="success"}
::edge{from="source" to="artifact" label="compile"}
:::

::::timeline{title="Delivery" description="The page moves through two verified phases."}
:::event{date="Author" title="Write declarative content" kind="accent"}
Use ordinary Markdown inside an event.
:::
:::event{date="Build" title="Compile offline" kind="success"}
Open the result directly through `file://`.
:::
::::
```

`chart.type` is `bar`, `line`, or `pie`. Charts accept 1–6 series with 1–12 points each; series share the
same unique ordered labels. Pie charts accept exactly one non-negative series with a positive total.
Diagrams accept 1–12 unique nodes and up to 20 validated directed edges. `direction` is `right` or `down`.
Timelines accept 1–20 direct events. Every visual requires a title and description and compiles into
theme-aware responsive SVG or semantic HTML without visualization runtime code. A chart or diagram is one
atomic accessible image whose description includes the complete authored data; visible axis and connection
labels may be shortened to preserve layout, but accessible point values, node identities, and connection
labels are not truncated. Numeric output retains the supported four decimal places.

`callout.kind` is a lowercase presentation token. `demo.start` and `demo.step` are bounded integers.
`section` is top-level only and requires `title`. Its optional `id` is a lowercase letter-led identity;
omission derives a deterministic collision-free ID from the title. `nav` supplies a short primary label.
`width` is `reading|standard|wide`, `align` is `start|center`, and `tone` is
`plain|soft|accent|contrast`; `reveal` is boolean. Defaults are `standard`, `start`, `plain`, and
`reveal="false"`. Explicit sections own real labelled section/H2 markup and primary navigation, while
heading-only sources use H2 primary links. H3 and component anchors remain owned targets without becoming
primary links.

`actions` accepts only direct labelled `::action[...]` children. Every action requires `href`; valid targets
are same-page anchors, relative paths, HTTP(S), and `mailto:`. `javascript:`, `data:`, `file:`, absolute
local paths, and protocol-relative URLs fail validation. `kind` is `primary`, `secondary`, or `quiet` and
changes package styling only; the output remains an ordinary anchor with no callback or form behavior.

`asset.src` and `font.src` must resolve to existing files under the canonical source root. The first font
directive becomes the document font; later directives register additional faces. The text form uses its
authored label; the leaf asset form receives `Download <filename>` so it remains visible and accessible.
`tab` must be directly nested in `tabs`. Glossary keys and canonical terms are unique; registered terms in
ordinary prose use `:term[Canonical term]{key="..."}`, while definitions and code are excluded from that
occurrence rule. Output uses the registered canonical text even if the inline label differs. The standalone
`::term{key="..."}` form remains available for an intentionally detached reference. Initial states are
declarative, and all interaction code belongs to the package.

### Interaction behavior and limits

| Primitive           | Semantics and initial state                                                                                                | Reader routes                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `term` / `glossary` | A term button controls a closed labelled contextual dialog; the full definition remains a visible section.                 | Hover, focus, click, or tap opens; `Escape` closes and restores focus; click **View full definition** to navigate to the complete Markdown entry. Clicking outside closes. |
| `disclosure`        | Native `details`/`summary`; `open="false"` is the default.                                                                 | Activate the summary with click/tap or native `Enter`/`Space`.                                                                                                             |
| `tabs` / `tab`      | ARIA `tablist`/`tab`/`tabpanel`; first direct tab selected. A tab requires `label`; other directive children are rejected. | Click/tap selects. `ArrowLeft`/`ArrowRight` wrap, while `Home`/`End` select the first/last tab.                                                                            |
| `modal`             | Closed native `dialog` with a labelled trigger.                                                                            | Trigger opens; `Escape` or Close closes and returns focus to the opener. Backdrop click is not a supported dismissal route.                                                |
| `popover`           | Closed non-modal labelled dialog.                                                                                          | Click/tap or native button activation toggles; `Escape` closes and restores trigger focus; outside click closes.                                                           |
| `filter`            | Labelled search input and polite live count; empty initially.                                                              | Typing filters case-insensitively. Only list items in a direct authored `ul`/`ol` are targets.                                                                             |
| `toggle`            | ARIA switch; `default="off"` hides its panel.                                                                              | Click/tap or native `Enter`/`Space` toggles checked state and visibility.                                                                                                  |
| `demo`              | Numeric output starts at `start="0"`.                                                                                      | Increment button adds `step="1"` by default; author code is never executed.                                                                                                |

Each instance owns its state. Tabs, overlays, filters, switches, and demos do not change another instance.

### Page navigation and bounded motion

Two or more explicit sections produce one navigation list; a heading-only document uses its H2 headings
when at least two exist. Exactly one primary link carries `aria-current="location"` for section,
descendant, outside, invalid, scroll-boundary, and document-bottom states. Desktop contents are non-modal
and collapse per document session. Mobile contents use a native modal dialog: Close receives initial
focus, Tab stays contained, Escape/backdrop/Close return to the trigger, and a chosen link closes the dialog
and focuses its section heading. Do not add `menu` keyboard behavior or persist collapse state.

Set root metadata `scrollProgress: true` only when decorative reading progress is useful. Set
`reveal="true"` only on selected top-level sections. Both features run only in the normal-motion profile;
reduced motion installs no progress or reveal machinery, and an unavailable `IntersectionObserver` leaves
reveals visible. The package owns the fixed transform/opacity behavior and duration; authors cannot supply
animation coordinates, easing, JavaScript, or parallax.

## Build for an agent

```bash
agentic-report build ./my-report --output ./architecture.html --json
```

Each stdout line is JSON. A diagnostic line contains `type`, `runId`, `level`, `code`, `message`, and
`remediation`; a content-backed error includes the authored `source.file`, start/end line and column, while
the referenced local path is kept in structured `details.target`. Process-level errors omit source
locations. The final result contains an absolute output path, format, HTML byte size, embedded/external
occurrence counts, an HTML SHA-256 content hash, and warnings. Asset counters describe authored/generated
occurrences, while `contentHash` hashes the generated HTML rather than an entire directory tree.
Successful warnings are duplicated between diagnostic and result records. The build transport has no independent contract
version yet; treat these fields as the current 0.x shape, not a final portable protocol.
All CLI result/diagnostic transport and ESM analysis identities are centrally sanitized:
credential-bearing URL user information, signed-URL and other recognized credential
query/fragment/assignment values, credential-named detail fields, and the same values in paths are replaced
with `[REDACTED]`. A redacted path is an output identity, not a usable filesystem path; retain the original
input locally when a later operation needs it. Source bodies are never included. Avoid authored
credentials regardless; redaction is a transport boundary, not a secret-storage mechanism.

Exit code `0` means the requested operation succeeded. Exit code `1` means the source, manifest,
option, destination, or local asset input is invalid. Exit code `2` means the installed package cannot
supply a required build asset.
Exit code `3` means an unexpected internal failure occurred.

## Output selection

- Omit `--format` for the portable default `single-file`.
- Use `--format directory` when separate content-addressed assets are more important than one-file
  portability. The package runtime is embedded for `single-file` and external for `directory`; callers do
  not select its placement.

All source assets must be local and below the source directory after symlinks are resolved. Remote URLs,
escaping paths, executable templates, author scripts, and raw HTML are outside the current contract.

The package has no plugin API. A proposed new primitive or authoring surface must first satisfy the closed
[`generated extension gate`](generated/extension-proposal.schema.json); the copyable
[`proposal template`](generated/extension-proposal.template.json) fixes the non-negotiable trust boundary
to no author code, callbacks, evaluation, dynamic imports or network access, source-root confinement,
offline and deterministic operation, CSP compatibility, and bounded package-owned runtime behavior. It
also requires evidence for grammar, accessibility, budgets, dependencies/licenses, and compatibility.
Passing that record is a design gate, not runtime plugin loading. The ESM API exposes the same template
through `getExtensionProposalTemplate()`.

On narrow screens the package runtime controls the responsive table of contents. The stylesheet provides
one visible-focus system and shared typography, spacing, color, width, density, and surface tokens for
headings, navigation, callouts, decisions, cards, steps, charts, diagrams, timelines, GFM tables, code,
images, and attachments. Output paths that resolve to, or share a filesystem identity with, an entry,
manifest, partial, or local asset fail with `OUTPUT_COLLIDES_WITH_SOURCE`. Both output formats publish from
private sibling staging paths. Injected partial-write and rename failures preserve the previous output,
remove compiler-owned staging, and permit an immediate retry. The proportionate filesystem contract does
not attempt to defeat a hostile concurrent path swap or process/OS crash.
`output.maxInlineBytes` emits a warning from the exact serialized inline CSS, package runtime, and
image/download data-URL occurrence total. Font data URLs are counted once through the stylesheet.

Use standard CommonMark angle brackets around an asset destination containing spaces, for example
`![Architecture](<assets/схема системы.png>)`.
