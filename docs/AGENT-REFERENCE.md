# Agent reference

This is the copyable reference for the implemented CLI and declarative source contract. Only syntax exposed
by the commands, generated schemas, and source contract below is supported. For programmatic Node.js use,
follow the published [Node ESM API reference](../skills/agentic-report/references/node-api.md); effect
modules use the separate [effect API reference](../skills/agentic-report/references/effect-api.md).

## Build the first page

Use Node.js 24.18.0 or newer. Initialize a suitable packaged starter, replace its declarative content, build
once, and open the result:

```bash
npx --yes agentic-report@0.19.0 init ./my-report --starter document --json
# Edit ./my-report/report.md and its local assets.
npx --yes agentic-report@0.19.0 build ./my-report --output ./my-report.html --json
```

Open `my-report.html` through `file://`. Build runs the complete source and render preparation before
publication, so `validate` and `inspect` are not prerequisites. Use `validate` for a read-only diagnostic
result, `inspect` for source inventory and the authoring catalog, `fix` for an exact compiler-provided
replacement, or `review` to bind returned local feedback.

## Verify the current tarball in a clean consumer

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
npx agentic-report init ./my-report --starter document
printf '\nAgent-authored edit.\n' >> ./my-report/report.md
printf '\n![Remote asset used to test diagnostics](https://local.invalid/image.png)\n' >> ./my-report/report.md
printf 'preserve me\n' > ./report.html
! npx agentic-report build ./my-report --output ./report.html --json
sed -i.bak '/Remote asset used to test diagnostics/d' ./my-report/report.md
npx agentic-report build ./my-report --output ./report.html --json
```

The command prefixed with `!` is expected to fail with `REMOTE_ASSET_BLOCKED` without replacing an existing
output. After removing the broken Markdown line, the direct build creates `report.html`. The package smoke
test executes this installed build-first recovery route with credential redaction and output sentinels, then
exercises optional validation and inspection independently.

## Discover the contract

```bash
agentic-report describe --json
agentic-report schema
agentic-report schema --scope directives
agentic-report schema --scope source
agentic-report examples --json
```

`describe` returns the current source-contract description, including directive forms, attributes,
constraints, nesting, resource/runtime behavior, output formats, the `commands` catalog — which names
every command this CLI registers, so a command is discoverable through the machine route without
reading prose — and `authoredRules` — the declared rules of the
directive phase with the dependencies between them, listed per authored subject. The list is the
declared sets, not every judgement the phase makes: checks written before this arrangement — among
them the children a question accepts, code-fence metadata, the shape of a response form, and
document-wide checks — are ordinary code and do not appear here, though they report violations the
same way. A rule that
declares a dependency stays silent when that dependency refused, which is why one run can report
several violations of the same element yet none derived from a refused reading. `schema` defaults to the
accepted manifest-input JSON Schema; `--scope directives` returns directive grammar and constraints, and
`--scope source` describes a complete source object. `examples` returns installed example metadata plus
absolute entry paths from the CLI adapter.

The ESM API exposes the same data through `getSourceContract()`, `getAuthoringSchema(scope)`, and
`listExamples()`. The first two return defensive values rather than public Zod instances; `listExamples()`
returns package-relative example identities and entry paths, while the CLI resolves entries to absolute
installed paths. The complete checked JSON projection is
[`generated/source-contract.json`](generated/source-contract.json), and the hash-bound packaged inventory is
[`../examples/manifest.json`](../examples/manifest.json). Agents should inspect these contracts instead of
inferring unsupported fields. The [Node API reference](../skills/agentic-report/references/node-api.md)
covers the other published root exports and their result shapes.

## Choose a page category and initialize its starter

A page belongs to one of five standard categories. The category names the reader's job, the starter
`init` copies, and the dimensions of the brief the agent answers before writing. It is a recommendation,
not a limit: every directive, mode, and effect works on a page of any category, and Review Workspace is a
mode of any category rather than a category of its own.

| Category       | Reader's job                                                      | Subvariants                                                              |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `landing`      | Try, adopt, or remember something and take one next step          | `product`, `portfolio`, `showcase`, `launch`                             |
| `document`     | Check and act on a finding, a system, or a procedure (default)    | `report`, `research`, `architecture`, `code-review`, `incident`, `guide` |
| `dashboard`    | See the current state at a glance, detail one step away           | `metrics`, `charts`, `filters`, `statuses`                               |
| `answer`       | Answer a question, pick an option, or fill in a form              | `choice`, `questions`, `survey`, `brief`                                 |
| `presentation` | Watch something shown one slide at a time, live, alone or on film | `demo`, `pitch`, `update`, `lesson`                                      |

`describe` publishes the categories under `page.categories`, each with its purpose, recommended layout,
subvariants, and brief dimensions.

Initialize through the CLI or the equivalent ESM API:

```bash
agentic-report init ./my-report
agentic-report init ./my-page --starter landing --json
agentic-report init ./triage --starter answer
```

```js
import { initProject } from 'agentic-report';

const project = await initProject({ destination: './my-report' });
console.log(project.entryPath);
```

The destination must be absent and its immediate parent must already exist and be a directory. The
parent may be a symbolic link — on macOS `/tmp` is one — and the destination is then created through it;
`projectPath` in the result names the resolved location rather than the path you typed. Any existing
file, directory (including empty), or symlink at the destination itself is rejected unchanged, and that
refusal, not a rule about the parent, is what protects an existing tree. The three parent refusals name
which check failed: the parent does not exist, is not a directory, or cannot be inspected.
Initialization selects the `document` starter unless `starter` names another category. Each of the five
starters is named after its category and contains `report.md`, its Russian alternate, and `brief.md`:

| Starter        | Contents                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `document`     | Decision-ready report with findings, evidence, a local asset, and a timeline                       |
| `landing`      | Focused product narrative with benefits, proof, and delivery milestones                            |
| `dashboard`    | Operational cards with statuses, charts, filtering, and optional detail                            |
| `answer`       | A question with options and trade-offs, then a response form that exports an answer                |
| `presentation` | A short demo as slides: title slide, click steps, diagram, figure, code, a question, speaker notes |

`brief.md` holds one table row per dimension of the category — subvariant, audience, reader task,
material, languages, art direction, motion, delivery, and the category's own dimensions — with columns for
the answer and its source (`request`, `asked`, or `inferred`). The agent fills it before writing the page
and records there, with a reason, any design check it deliberately switches off. The build ignores it.

`examples --json` and `listExamples()` expose each example's `category`, `subvariant`, and, for each
starter, `starter.default`. Other examples — research, architecture, tutorial, code review, incident,
and the rest — are copied from the examples inventory rather than initialized. Eligibility and default
selection are registry facts shared by discovery and initialization. The operation validates
and fully reads the packaged tree before exclusively creating the destination; ordinary files use
no-overwrite creation. It never overwrites, merges, deletes, or rolls back destination content. A later
failure may leave the newly created destination incomplete; inspect it and remove it explicitly before
retrying. The result contains starter, project and entry identity plus a sorted package-relative file
inventory, including each starter's maintained Russian alternate and localized partial/assets; it does not
contain source file contents.

Human success is `Created <projectPath> from starter <starterId> (<count> files)`. By default, stdout
contains one NDJSON result record with `type`, `runId`, `starterId`, `starterTitle`, `projectPath`,
`entryPath`, and `files`. Expected failures use the common diagnostic record and exit code `1`.

## Command output

The CLI has thirteen commands; `describe` lists them under `commands`, and the generated
[authoring catalog](../skills/agentic-report/references/catalog.md#commands) prints the same list. Every
command answers an agent without a flag, accepts `--json` as the name of that default, and offers
`--human` for a person. The agent shape follows what the command returns: `init`, `build`, `validate`,
`inspect`, `fix`, `review`, `sitemap`, `snapshot`, `effect-check` and `theme` report a run and write NDJSON records; `schema`, `describe` and `examples`
return one reference document and write it as a single compact JSON line. The human projection is prose
wherever prose exists — `init`, `build`, `validate`, `fix`, `review`, `sitemap`, `snapshot`, `effect-check`, `theme` and `examples` — and the same
document indented for `inspect`, `schema` and `describe`, whose answer is a catalog or a schema that no
summary line can carry.
Both projections of a run carry the same facts — every
independent violation, each with its `file:line:column` place — so choosing prose never hides a
violation.

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

With `--human`, validation prints the resolved entry plus format and runtime placement, and inspection
prints the inspection result as formatted JSON. By default, warnings are NDJSON diagnostic records followed by
one result record. Validation returns `contractVersion`, absolute `projectPath` and `entryPath`,
`format`, derived `runtimePlacement`, and sanitized `warnings`. Inspection returns those identities
plus:

- `output.format` and `output.runtimePlacement`;
- sorted source-root-relative `sourceFiles`, including read partials and local resources; resolve them
  against the returned `projectPath`, or against the caller's input root when that identity contains a
  `[REDACTED]` path segment;
- `structure`: the page's structure without its words — `layout`; `motion`, the page's motion level with
  the default applied; `beforeFirstSection`, the images,
  videos, diagrams, charts, timelines and code blocks shown before the first `section`; `sections`, one entry per
  authored section in source order with its nesting `depth`, resolved `recipe`, `place`, `surface`,
  `transition`, `scene`, `interaction`, `choreography`, and the same media counts;
  `magneticActions`; `movingElements`, the elements that move by themselves outside those section roles
  (`:count`, a `count-up` chart, a diagram with `draw="scroll"`, `pulse` or `zoom`, a `demo` with `play`,
  `:swap`, `:typing`, `:mark`, `spotlight`, a `video` with `seam="fade"`); and `cardGroups`, one entry per `cards` group with its number of `cards`, of distinct
  card forms (`shapes`: status, media, block count, list or table), of `plain` cards (a title and at most
  one paragraph) and of `linked` cards. It carries no titles, text, or identifiers, so advice built on it cannot judge the
  author's words; the skill's design check reads it;
- sorted distinct `observed.directives` and image/download/font occurrence counts;
- the registry-derived command, format, page, starter, and capability `catalog`;
- sanitized `warnings`.

The ESM equivalents are:

```js
import { inspectReport, validateReport } from 'agentic-report';

const validation = await validateReport({ input: './my-report' });
const inspection = await inspectReport({ input: './my-report', format: 'directory' });
```

## Apply the repairs the product computed

```bash
agentic-report fix ./my-report
agentic-report fix ./my-report --human
```

`fix` is the only command that writes to an authored source. It applies the `fix` field of the
diagnostics a run produced — the replaced range and its replacement, both computed exactly — and touches
no other byte. Diagnostics without that field are left alone and reported as `remaining`: their repair
needs an author decision, and guessing it would be a different product. Running it twice changes nothing
the first run already repaired.

Today one check computes such a repair: the first unmarked occurrence of a registered glossary term in a
section, which `fix` replaces with its `:term[…]{key="…"}` reference.

The result carries `applied` — file, line, column, diagnostic code and the written replacement for each
repair — and `remaining`. With `--human` each repair prints as `file:line:column  CODE → replacement`.
The equivalent ESM API is `fixReport({ input, format? })`.

## Resolve review feedback to source

A generated report contains an inert review-target manifest bound to the local source graph. A versioned
review artifact created for that report can be resolved without writing output or changing Markdown:

The manifest accepts at most 5,000 reviewable targets and 750,000 serialized bytes. Both bounds apply; a
report with long source-location records can reach the byte limit before the target-count limit.

```bash
agentic-report review ./review.json ./my-report
agentic-report review ./review.json ./my-report --json
```

The review path is relative to `./my-report` and must remain inside its canonical source root. JSON output
contains the current and reviewed revisions plus each thread and revision segment with `exact`, `changed`,
`missing`, or `ambiguous` binding and the current entry/partial range when resolved. Message fields are bounded and
credential-sanitized; source bodies are not returned.

The ESM equivalent is:

```js
import { inspectReview, parseReviewArtifact, serializeReviewArtifact } from 'agentic-report';

const result = await inspectReview({ input: './my-report', review: 'review.json' });
```

`parseReviewArtifact()` enforces the closed single-language version-3 and multilingual version-4 thread
schemas and losslessly normalizes a valid version-2 whole-block artifact. Version 4 requires
`report.locale`; review inspection routes that locale before resolving source targets. Legacy v2/v3 input
uses a unique exact locale revision when available and otherwise the primary variant. A segment omits
`selection` for a whole-block thread or carries an
exact selected-text anchor: full `start.target` and `end.target` references, non-negative Unicode code-point
`offset` values, and the bounded NFC `quote`; `segment.target` equals `selection.start.target`.
`serializeReviewArtifact()` trims and normalizes human messages to Unicode NFC, then produces canonical
newline-terminated JSON without a timestamp or random value. A changed or ambiguous endpoint is
never applied automatically; inspect its reported source state and edit the Markdown explicitly.

A page built with `review: true`, or with a prior sidecar passed through `--review`, provides Review
Workspace annotations; an ordinary page ships without them. Select any eligible rendered phrase and choose
**Create note**; no separate review mode is required. The selection may cross inline markup or end
in a later review target. A compact popover beside it shows the exact quote and keeps compose, ordered
messages, edit, resolve, and reopen at the text locus. Saved ranges stay highlighted with distinct open and
resolved treatment. Hover or tap exposes **View thread**, and each range has a focusable keyboard marker.

The topbar **Review** action opens only an overlay list of current comments and prior evidence plus local
import and one **Export review.json** action. The list never changes report geometry; choosing a bound entry
brings its target into view and opens the same popover. Existing version-2/version-3 whole-block discussions
remain list-accessible, but readers create new threads only from selected text. A multilingual page exports
version 4 for the active locale and keeps each locale's threads isolated across switching. Empty, whitespace-only,
oversized, outside-report, and package-control selections create nothing.

Desktop uses a non-modal list overlay; mobile uses a modal sheet. Exact state import first verifies rendered
quotes and offsets, then restores the highlights. Stale ranges remain prior evidence rather than being
fuzzily relocated. Continuing a changed whole-block target from the list appends a current revision segment;
the next export retains every historical message and resolution state. Build
[`../examples/review-workspace/report.md`](../examples/review-workspace/report.md), select **68% in the
revised cohort**, create a note, close it, reopen the highlighted range, and export the result.

The anchored thread surface does not reflow the report. Desktop prefers the right or left of its anchor,
then centers above or below when neither side fits; every placement shifts/clamps inside the visual viewport.
Mobile uses a bounded bottom surface. Window and
`visualViewport` scroll/resize updates keep that surface, **Create note**, and range markers reachable when
browser chrome or the on-screen keyboard changes the visible area. The contextual action and focus markers
are clamped by their measured size to a visible rectangle from the live range and hide when that range is
wholly offscreen. A focus marker prefers to sit completely above the range, then below it, before edge
clamping, so tapping the highlighted text remains a separate **View thread** route.
Navigation, Review, language, theme, and scheme controls use distinct package-owned topbar icons with localized names and
title tooltips. The native language selector remains the locale input and receives visible focus after a
switch. At constrained widths the shell omits visible labels and secondary page identity instead of clipping
or inventing an abbreviation; coarse pointers receive larger targets. Visible contextual/action controls
retain their labels and use 16-pixel icons; Create note shows a pencil and View thread shows a comment
without replacing the control.

Typed review controls are declarative and keep legacy decisions static:

```md
:::decision{title="Release path" id="release-path" required=true}
::decision-option{id="ship" label="Ship now"}
::decision-option{id="hold" label="Hold release"}
:::

:::checklist{title="Release gates" id="release-gates"}
::check-item{id="owner" label="Owner assigned" required=true}
::check-item{id="notes" label="Notes attached"}
:::
```

These directives remain static report content; Review Workspace does not turn them into approval controls.

For a repeat review, run `agentic-report build ./my-page --review review.json --output revised.html`.
The sidecar is confined to the source root and read before publication. Invalid input preserves existing
output. Exact state resumes; stale bindings remain prior evidence until the reviewer resolves the new revision.

## Collect a structured reader response

Response Workspace is separate from Review Workspace: it collects typed question values rather than block
discussion threads. Declare one response form with stable direct questions and kind-specific leaves:

```md
:::::response{title="Review triage" id="triage"}
::::question{id="scope" kind="bucket" title="What should happen?" prompt="Assign every item."}
::bucket{id="do" label="Do now"}
::bucket{id="later" label="Later"}
::bucket{id="skip" label="Do not do"}
::item{id="login" label="Fix login" note="Empty email returns 500." meta="Issue 142" href="https://example.com/issues/142" bucket="do" comment=true}
::item{id="copy" label="Correct the export label" note="Cosmetic." meta="Issue 138" href="https://example.com/issues/138" comment=true}
::::
::::question{id="decision" kind="single" title="Release decision"}
::option{id="go" label="Go"}
::option{id="hold" label="Hold"}
::::
::::question{id="score" kind="number" title="Scores" min="1" max="5" step="1"}
::item{id="confidence" label="Evidence confidence" note="Score the evidence quality." meta="Release evidence" href="https://example.com/evidence"}
::::
::::question{id="summary" kind="text" title="Decision summary"}
::::
:::::
```

The remaining kinds are `item-single` (one option per item), `item-multi` (several options per item),
and `order` (all items in priority order). Bucket questions require two to five buckets. Choice questions
require at least two options. `comment=true` adds an optional item comment; empty comments are omitted.

The reader can complete every question with native fields and buttons. Bucket cards also support drag and
drop, while the select remains the keyboard and fallback route. **Copy response** and **Download
response.json** serialize the same deterministic version-1 JSON. Every question stores `id`, `kind`,
`answered`, and a machine-readable value; comments are a separate sparse array. Import accepts only the
same form revision and validates the complete file before replacing any current answer. State remains in the
current tab without storage, network, an account, or form submission. Build the complete packaged
[`response-workspace` English source](../examples/response-workspace/report.md) or its maintained
[`Russian entry`](../examples/response-workspace/report.ru.md) to inspect every answer kind.

## Copy prose without code styling

Use a closed `copyable` container for text the reader should paste into a chat or handoff:

```md
:::copyable
Deploy after **two checks** are complete.

Read the [rollback runbook](https://example.com/runbook) before the handoff.
:::
```

The block remains ordinary wrapped Markdown. Its localized button copies rendered visible text with
paragraph breaks and link labels, without Markdown syntax, URLs, HTML, control labels, or hidden panels.
`term` references are allowed; block code and other nested directives are rejected.

## Minimal source

Write an ordinary colon directly. A colon whose name begins with a digit, and a colon written against the
preceding word, are literal Markdown text: `21:01`, `21:01 — 00:12`, `1:30:05`, `3:1`, `1:10:100`,
`localhost:9000`, `arXiv:2508.05775` and `ключ:значение` all render as authored, and a frontmatter title
such as `title: Отчёт за 9 июля (ночь до 05:24)` needs no backslash. The digit feature does not depend on
what precedes the colon, so `Пункт :2 списка.` is text as well. Only the inline form without attributes or
children is restored: a colon carrying attributes or children, such as `слово:name{key="1"}`, remains a
directive, and so do block-level forms such as `::2` and an unknown **alphabetic** name standing on its own
after a space. Such a form is validated as a directive and fails when its name is unregistered; write `\:`
when the prose is not a directive.

```text
my-report/
├── report.md
├── report.ru.md
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
localizations:
  ru: report.ru.md
layout: mixed
theme:
  extends: blueprint
  radius: round
scheme: system
progress: chapters
attribution: true
---

# Architecture analysis

{{include: partials/risks.md}}

![Context](assets/architecture.png)

:::callout{title="Decision" kind="info"}
Use semantic directives instead of handwritten layout.
:::
```

On a single-language page, `language` is the sole selector for package-owned reader chrome. Use `ru` or a
Russian subtag such as `ru-RU` for Russian shell controls, interaction states, Review Workspace, accessible
visualization prose, and locale-formatted chart numbers. Use `en` for English. The default `und` and
unsupported language tags select the complete English fallback even when the browser or operating system
uses another locale.

To ship both languages in one artifact, set the primary entry to `language: en` or `language: ru` and map
only the other locale under `localizations`. The alternate file must declare the matching language and may
set only `contractVersion`, `title`, `description`, and `language`; keep layout, theme, scheme,
attribution, output, `url`, `image`, and `localizations` in the primary. Translate its Markdown, partials, visible SVG text,
and authored directive labels explicitly—the compiler does not machine-translate them. At startup the
browser uses ordered system preferences to select an available variant, falls back to the primary, and
shows a native selector only for the multilingual artifact. Manual switching replaces the whole page and
keeps review/response/component state isolated by locale in the current tab.

## Choose the page shape

The package owns the page shell and design system. Metadata selects one closed layout, a theme, and a
colour scheme. The complete field list with every accepted value is in the
[source contract](product/source-contract.md#metadata); the closed lists of layouts and built-in themes
are in the generated [authoring catalog](../skills/agentic-report/references/catalog.md#page-metadata).

- `layout`: `document` (default) or another catalog layout; each is described below the theme section,
  and `slides` under «Presentations»;
- `language`: selects reader chrome for one source variant; unsupported single-language tags use English;
- `localizations.en` / `localizations.ru`: optional confined alternate Markdown entry for the other
  package-supported locale; a multilingual primary must itself be English or Russian;
- `theme`: the look of the page. A built-in theme name (`neutral` by default; each theme's intent is in
  the catalog and in the paragraph after the theme example below), a relative path to a `.yaml`, `.yml` or
  `.json` theme file inside the source directory, or a theme object written in the frontmatter;
- `scheme`: `system` (default), `light`, or `dark`;
- `schemeToggle`: boolean, default `true`; shows the reader's light/dark button. Set `false` for a page that
  must stay in the scheme it was built with;
- `themeSwitcher`: boolean, default `false`; adds a reader theme selector that swaps between the built-in
  themes and the page's own live, without touching the scheme the reader chose;
- `review`: boolean, default `false`; ships Review Workspace. A build given a prior sidecar through
  `--review` enables it automatically;
- `progress`: `none` (default), `page`, or `chapters`. `page` is one decorative line at the bottom of the
  top bar, shown only in normal motion. `chapters` is the page's throughline: one segment per chapter
  along the top bar that fills as the reader moves through it, marks the current chapter, and jumps to it
  on click; it stays with reduced motion because it is navigation, not decoration;
- `opening`: `center` (default) or `start`; aligns a landing page's title, introduction, and actions;
- `attribution`: boolean, default `true`; shows **Made with Agentic Report** linked to
  `https://agentic-report.witqq.dev/` at the bottom. Set `false` to omit only that package footer.

### Make a theme of your own

A theme is data, not CSS. It names colour roles for the light and dark schemes (`background`, `surface`,
`heading`, `text`, `textMuted`, `accent`, `accentStrong`, `accent2`, `focus`, six chart colours, the code
colours `codeBackground`…`codeComment`, and a few more), a package font family for headings, body and code,
typography (display weight, tracking and letter case), density and rhythm, width, corner radius, a package-drawn
backdrop, and a few named treatments of the shell (`chrome.topbar`, `chrome.navigation`,
`chrome.sectionTitle`, `chrome.cards`, `chrome.components`, `chrome.landing`) and small signature details
(`ornaments.headingPrefix`, `ornaments.titleCursor`, `ornaments.heroEmphasis`, `ornaments.mediaTreatment`,
`ornaments.linkedCard`, `ornaments.console`). Every field is optional: a theme starts from the theme named in `extends` (the
default theme when it is absent) and changes only what it names. What it leaves out — including the
signature details of the theme it extends — is inherited, so a theme extending `terminal` keeps its prompt
and cursor until it turns them off.

Write a small theme in the frontmatter, or a theme file when several pages share it:

```yaml
theme:
  extends: blueprint
  name: field-report
  accent: coral
  colors:
    light:
      background: '#f7f5f0'
      surface: '#ffffff'
```

`accent` picks a named accent family for both schemes: prefer a restrained family and take a brighter one
only when the subject calls for it; explicit accent colours in `colors` override it. To use a product's own colours,
`agentic-report theme --colors "#0b5fff,#ff7a00"` (ESM `createBrandTheme({ colors })`) writes a theme file
whose accent roles are those colours with their lightness shifted until every contrast pair passes; it cannot
read a logo, because the package carries no image decoder. How the colours map to roles and when not to use
it is in [`themes.md`](../skills/agentic-report/references/themes.md#a-theme-from-brand-colours). `fonts.pair` takes the
type trio of any built-in theme or `system`. The accent families, the trio of each theme and the embedded
families are listed under «Themes» in the [source contract](product/source-contract.md#themes). The
package embeds the Latin and Cyrillic subsets of every
family the theme uses, so the page looks the same on every machine. A local font of your own goes in with
`::font{src="…" family="…" role="heading"}`: the role (`body`, `heading`, `mono`) says which text it sets. A theme file may itself extend a built-in theme or another theme file; the chain
stays inside the source directory. The build checks every field and refuses a theme whose headings, text,
captions, links, eyebrows, primary action label, code colours, accent marks or focus ring fall below WCAG AA
contrast in a scheme it draws; the diagnostic
names the failing pair, its ratio, and the line of the field in the theme. `agentic-report schema --scope
theme` returns the complete theme schema, and `describe --json` lists the fields, accents, font families
and contrast pairs under `page.theme`.

Neutral is the default: grey paper, a Literata display over Onest and one ochre accent, warm graphite in the
dark; frost is stone and graphite with colour left to statuses; calm-paper is warm paper for long reading; daylight is bright product documentation;
midnight is the engineering story at night; noir sets image-first stories under a spaced capital title;
aurora is calm research; blueprint is dense technical evidence with a ledger top bar and landing; ember is for
launches and incidents; synthwave is for games and music only; terminal is a developer console on graphite with
a prompt, a finite cursor and bracketed labels (scanlines and glow are opt-in ornaments, off by default).
Eight of the eleven built-in themes come from the themes of agentic-screencast; neutral and frost were added
as themes without the fashionable clichés, and terminal is this package's own. `document`
emphasizes long-form reading with persistent desktop contents. `dashboard` uses a wide dense
surface and horizontal desktop navigation. `landing` provides a centered desktop opening, compact
left-aligned mobile heading, and wide content
sections. `mixed` combines a reading column with wide evidence, cards, tables, and media. `slides` shows
one section at a time as a presentation (see «Presentations»). `screens` keeps the scrolling page but moves
one whole screen per gesture (see «Page navigation and bounded motion»). Every scrolling layout
collapses to one mobile column with a package-owned contents drawer. Wide tables and code remain locally
scrollable rather than breaking the page.
Composition tracks use large screens without widening paragraphs beyond their reading measure. Package
controls receive icons and shared compact geometry automatically; modal/popover triggers and toggle labels
stay visible on phones. Action groups wrap at content width instead of making every short label a full-width
button. Authors do not supply icon markup or corrective CSS.

Run `agentic-report examples --json` to locate the installed `layout-document`, `layout-dashboard`,
`layout-landing`, `layout-mixed`, `interactive-catalog`, and `visualization-catalog` examples. The same
source builds through either output format; authors never provide JSX, CSS, browser code, runtime
placement, or a layout-specific template.

The same inventory also contains the five category starters. Starters are buildable examples with
`starter` metadata, not a second template or generator system.

### Rebuild the public showcases

The registry also exposes non-starter public source trees. They are ordinary examples rather than templates
or a separate showcase system:

| ID                                                                     | Page shape  | Intended use                                                                                                               |
| ---------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `layout-mixed`                                                         | `mixed`     | Complete visual grammar and component range; public source route: [`visual-catalog`](../examples/visual-catalog/report.md) |
| [`interactive-catalog`](../examples/interactive-catalog/report.md)     | `mixed`     | Package-owned interactive primitives                                                                                       |
| [`visualization-catalog`](../examples/visualization-catalog/report.md) | `dashboard` | Charts, a 15-node grouped subsystem flow, a compile-request sequence, timelines, and data controls                         |
| [`terminal-portfolio`](../examples/terminal-portfolio/report.md)       | `mixed`     | Console-led systems portfolio with prompt rhythm and linked evidence                                                       |
| [`cinematic-story`](../examples/cinematic-story/report.md)             | `landing`   | Image-first scroll story with staged media and gallery rail                                                                |
| [`executive-brief`](../examples/executive-brief/report.md)             | `mixed`     | Daylight decision narrative with evidence cards, timeline, local media and handoff                                         |
| [`motion-showcase`](../examples/motion-showcase/report.md)             | `landing`   | Pointer depth, scrolling media, gallery, cascade and reduced-motion behavior                                               |
| [`incident-review`](../examples/incident-review/report.md)             | `mixed`     | Service impact, causal evidence, recovery, and owned follow-up                                                             |
| [`vendor-decision`](../examples/vendor-decision/report.md)             | `document`  | Mandatory procurement gates, weighted evidence, and conditional adoption                                                   |
| [`launch-readiness`](../examples/launch-readiness/report.md)           | `landing`   | Audience value, activation/funnel evidence, launch gates, and a reversible regional beta                                   |
| [`review-workspace`](../examples/review-workspace/report.md)           | `document`  | Selected-text threads, prior feedback, and complete review export                                                          |
| [`response-workspace`](../examples/response-workspace/report.md)       | `document`  | Typed triage, choices, ordering, scores, and comments                                                                      |

Every starter, layout example, catalog, workspace example, and showcase declares its maintained Russian
entry. Building any example produces one bilingual artifact; the initial variant follows the browser's
ordered language preferences and the reader can switch it manually.

From a checkout containing the package-owned source paths:

```bash
agentic-report build ./examples/incident-review --output ./incident-review.html
agentic-report build ./examples/vendor-decision --output ./vendor-decision.html
agentic-report build ./examples/launch-readiness --output ./launch-readiness.html
agentic-report build ./examples/terminal-portfolio --output ./terminal-portfolio.html
agentic-report build ./examples/cinematic-story --format directory --output ./cinematic-story-directory
```

Open each single file or directory `index.html` through `file://`. For an installed package, first run
`agentic-report examples --json`; the response contains an `examples` array whose items have an absolute
`entry` value. Use the parent directory of that value as the build input. Build validates before writing;
use `validate` or `inspect` separately when diagnostics or the observed source inventory is the intended
result.
`single-file` remains the default; `directory` changes runtime and asset placement, not source semantics or
reader behavior.

### Build a landing page

Use the `landing` starter for a new restrained product or project page. It is the same declarative contract
as reports and decisions, not a frontend-project scaffold:

```bash
npx --yes agentic-report init ./my-page --starter landing --json
npx --yes agentic-report build ./my-page --output ./my-page.html --json
```

Replace the starter content between initialization and build. The first zero-install `npx` run requires
registry/network access and Node.js 24.18.0 or newer. The normal generated page then opens locally through
`file://` and requires the included package-owned browser runtime. Authors write no JSX, raw HTML, CSS, or
browser JavaScript.

The CLI and ESM entry read this floor from installed package metadata before accepting work. A lower CLI
runtime exits with code `1` and `NODE_VERSION_UNSUPPORTED`; an ESM import throws `AgenticReportError` with
the same diagnostic. Neither path continues after npm's engine warning.

The repository's canonical product proof is [`../website/landing/report.md`](../website/landing/report.md).
Its gallery links to independently publishable starters, catalogs, Terminal and noir showcases, decision
showcases, and Review/Response workspaces plus direct public Markdown source routes.
[`../website/routes.json`](../website/routes.json) owns those relative route identities for deterministic
static staging; an image alone is never treated as the live example.

## Semantic directives

Directives are declarative and allowlisted. Unknown names and invalid attributes fail with actionable
diagnostics.

````markdown
::::section{title="Decision" id="decision" nav="Decision" width="wide" align="start" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="display" media="mask" media-fit="cover" media-aspect="landscape" focal="right" surface="tint" transition="stagger" scene="progress" choreography="cascade"}
:::callout{title="Finding" kind="warning"}
Content may contain ordinary Markdown.
:::

:::actions{placement="auto"}
::action[Review the decision]{href="#decision" kind="primary" effect="magnetic"}
::action[Open related evidence]{href="evidence.html" kind="secondary"}
::action[Project home]{href="https://example.com/project" kind="quiet"}
:::

Inspect :source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}.
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

Use the :term[Review packets]{key="review-packet"} while writing ordinary prose.

:::glossary{key="review-packet" term="Review packet" placement="appendix"}
A reusable definition shared by every marked reference.
:::

```typescript terms="review-packet"
const packet = await createReviewPacket(); // Review packet
```

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

::video{src="assets/playback.webm" poster="assets/playback-frame.png" caption="The card slides in and settles."}

::font{src="assets/report.woff2" family="Report Sans"}
````

### Page data, numbers, dates and messages

A page whose figures come from an export lists the JSON files in `data` and reads them when it builds;
the syntax and the refusals are in the [source contract](product/source-contract.md#page-data), and the
shipped `run-report` example is a complete page built this way.

```markdown
---
title: Nightly review run
language: en
data:
  - data/run.json
---

# Nightly review run {{run.id}}

::expect{data="run.stages" count="5"}

::eyebrow[Flow {{run.flow}}]

**Run {{run.id}} finished.** :muted[It took :plural[{{run.returns}}]{forms="return|returns"}; export
:meta[{{run.flow}} #{{run.id}}] was taken :time[{{run.exportedAt}}]{zone="Europe/Moscow"}.]

:::each{in="run.stages" as="stage"}

- **{{stage.title.en}}**: :plural[{{stage.items}}]{forms="item|items"}
  :::

::source-line[Moira export of run {{run.id}}, {{run.records}} records]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

::::conversation{title="Notifications" illustrative="true"}
:::message{from="Moira" time="01:17" status="delivered"}
Run {{run.id}} finished with {{run.findings}} findings.
:::
::::
```

- `{{…}}` values are inserted as text into the parsed page, never parsed as Markdown; `each` repeats a
  body per list item (one list or one table stays whole), and `expect` fails the build at its line when the
  data diverge. Derived values are precomputed in the JSON or produced by a provider: there is no
  expression language.
- `plural` and `time` are settled at build time in the page language (`Intl.PluralRules`,
  `Intl.DateTimeFormat` with `timeZone`), so the text is final and copies as shown; a time requires `zone`.
- `source-line` goes directly under the block it describes; `conversation`/`message` mock a notification or
  a dialog, and `illustrative="true"` marks a mock whose names, times and numbers are examples.
- `eyebrow`, `muted` and `meta` mark typographic roles; the theme field `typography.captions: italic` sets
  captions and source lines in the heading face in italics.

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

:::diagram{title="Build flow" description="Source crosses two subsystems." type="flow"}
::group{id="authoring" label="Authoring"}
::group{id="output" label="Output"}
::node{id="source" label="Source" group="authoring" kind="accent"}
::node{id="validate" label="Validate" group="authoring"}
::node{id="render" label="Render" group="output"}
::node{id="artifact" label="Artifact" group="output" kind="success"}
::edge{from="source" to="validate" label="parse"}
::edge{from="validate" to="render" label="typed graph"}
::edge{from="render" to="artifact" label="compile"}
:::

:::diagram{title="Build sequence" description="Calls stay in authored order." type="sequence"}
::node{id="agent" label="Agent"}
::node{id="compiler" label="Compiler"}
::node{id="browser" label="Browser"}
::edge{from="agent" to="compiler" label="build"}
::edge{from="compiler" to="browser" label="write artifact"}
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
same unique ordered labels. Pie charts accept exactly one non-negative series with a positive total. Every
chart is compiled twice: the page view, and a narrower view that a phone shows instead, so the chart fits
the column without sideways scrolling; category labels wrap onto two lines instead of being cut.
`diagram.type` is `flow` by default or `sequence`. A flow accepts 1–20 unique nodes and up to 40 validated
edges, and up to 5 non-empty groups. A group surrounds only the nodes that name it with `group`; a node
without a group stands beside the groups, and a named group must be declared. A sequence accepts 2–6 node
participants and 1–40 labelled edge messages; participant and message order is source order, while groups and
direction are rejected. A message whose `from` equals `to` is a step inside that participant and is drawn as a
loop on its lifeline with the label beside it; in a flow the same edge is a step that repeats, drawn as a
loop on the node's corner.

A flow is laid out by layers along the flow, the way Mermaid's flowcharts are. A connection that returns
along an already started path is drawn backward and described separately. Nodes inside a layer are ordered to
reduce crossings, every connection keeps its own path with its ends spread along the node side, and a label
sits on its own connection without landing on a node or another label. Node boxes and labels are measured: a
label wraps by words and is never cut. Every flow ships three views built at compile time, and a package
switcher above the diagram (a keyboard-operable tab list labelled in the page language) shows one at a time:
`down` (layers top to bottom), `right` (layers left to right), and `orthogonal` (right-angle connections in
their own lanes, groups as nested frames). `layout="auto|down|right|orthogonal"` names the view shown first
and printed; `auto` picks the view with the fewest crossings that fits the page best. A diagram wider than the
page column shrinks only as far as its smallest text, a 13-pixel connection label, stays at 12 pixels, and
scrolls inside its frame beyond that; on a narrow screen the reader first sees a view that fits, and the
view switcher wraps rather than hiding a view.

Every view of every diagram — flow, orthogonal, and sequence — is drawn in one visual language taken from
the page theme: the theme's body typeface for node, group, and connection text; one connection-label size
and weight in every view; one line weight for connections, a lighter one for dependencies and lifelines;
and colours only from the theme's palette, so a diagram follows the theme and its light or dark scheme
without any author styling. A legend reads like page text: the main text colour at a small-text size, with
line samples drawn larger than the lines on the diagram so dashes, dots, and hollow arrowheads are easy to
tell apart, and it wraps item by item on a narrow screen.
`direction="right|down"` is the older spelling of the same choice and cannot be combined with `layout`; any
`layout` on a sequence fails.

Four attributes say what the picture means without styling it:

| Attribute                                   | Where     | Meaning                                                                                         |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `kind="call\|data\|event\|dependency"`      | `edge`    | Connection kind; each has a package-drawn line and arrowhead. Default `call`.                   |
| `detail="…"`                                | `node`    | A smaller second line under the label: what the node holds or does.                             |
| `::legend{title="…" auto="true\|false"}`    | `diagram` | At most one. Titles the legend; `auto="false"` leaves out kinds without a legend item.          |
| `::legend-item{edge=… \| node=… label="…"}` | `diagram` | Names a connection kind or a node emphasis in the author's words; `hidden="true"` hides a kind. |
| `status="done\|review\|returned\|pending"`  | `node`    | Where a step of a process stands: status colour, a glyph, a legend entry in package words.      |
| `count="N"`                                 | `edge`    | «×N» after the label: how many times a return or retry happened.                                |
| `id="…"`                                    | `edge`    | Lets a `beat{focus}` light this connection by name; differs from every node id.                 |

A process in a line of text or on a card is `:process[Plan > Build > Review]{current="Review" returns="Review>Build×2"}`:
the steps as dots coloured by where the work stands, the returns as arcs with «×N», and the same said in
words for assistive technology.

A diagram mixing two or more connection kinds gets a legend of the kinds present, in package words. Legend
items come first in authored order, then the kinds the diagram mixes that no item names. Node emphasis
(`kind="neutral|accent|success|warning"` on a node) has no package meaning, so it appears in the legend only
through an item with a label. The legend's words also name kinds and emphasis in the diagram description.

Three optional attributes let the author overrule the default without being required for a readable result:

| Attribute                                  | Where     | Meaning                                                                                  |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------- |
| `spacing="compact\|comfortable\|spacious"` | `diagram` | Breathing room between layers and nodes; every value stays readable.                     |
| `row="1..20"`                              | `node`    | Flow layer hint. Nodes given the same row share a layer when their connections allow it. |
| `route="auto\|direct\|around"`             | `edge`    | Layout pull: `direct` keeps the connection short and straight, `around` lets it stretch. |

Split a dense arbitrary graph rather than treating this bounded flow layout as a general graph optimizer.
Timelines accept 1–20 direct events. Every visual requires a title and description and compiles into
theme-aware responsive SVG or semantic HTML without visualization runtime code. A chart or diagram is one
atomic accessible image whose description includes the complete authored data; visible axis labels may be
shortened to preserve layout, but accessible point values, group membership, node identities,
participants, and ordered messages are not truncated. A diagram's description is written as text rather than
a raw list: the node and layer count, groups with their members, layers in flow order, connections along the
flow, and backward connections separately, each connection kind named in the legend's words. The same text
appears under the picture in a closed «diagram in words» disclosure. Numeric output retains up to six
fractional digits and uses the reader locale for decimal and grouping separators; authored numeric values
and labels retain their meaning.

`callout.kind` is a lowercase presentation token. `demo.start` and `demo.step` are bounded integers.
`section` is top-level only and requires `title`. Its optional `id` is a lowercase letter-led identity;
omission derives a deterministic collision-free ID from the title. `nav` supplies a short primary label.
Its closed visual attributes, their values and defaults, and the combinations that fail before rendering
because two roles would own the same layout or transform are listed in the
[source contract's section table](product/source-contract.md#semantic-primitives); discovery and the JSON
Schema declare the same records.

A recipe is the short path: it supplies a coordinated subset of detailed roles before explicit attributes
apply. Pick one of the nine recipes from that table, and omit `recipe` only when composing the detailed
roles directly. A `card` may carry one safe
`href`; linked cards render as one focusable anchor with a persistent icon, and nested Markdown links fail.
A card's `status` (`good`, `watch`, `risk`) puts the state on the card as a localized word with a
coloured marker, so a dashboard reads without relying on colour.

A code review uses two directives. `diff` holds exactly one fenced block of a unified diff — file
headers, then `@@ -old,count +new,count @@` hunks — and draws each line with its old and new line
numbers; a hunk whose lines do not add up to its header fails the build with `INVALID_DIFF` at the
directive's line. Copying the block yields the diff itself, without the numbers. `file` names the changed
path above the block. `findings` groups `finding` children in authored order and prints a count per
severity above them; each `finding` requires `severity` (`blocking`, `major`, `minor`, `note`) and
`title`, and may name a `location` such as `path:line`. Severity is shown as a word, not only a colour.

Recipes also supply motion and, for two of them, a decorative surface; the source contract lists
[which recipe brings which](product/source-contract.md#semantic-primitives). For a pointer-depth hero,
write `recipe="hero" scene="none" interaction="depth"` and add a local image. For a scrolling gallery,
write `recipe="rail" scene="progress"` with image cards. The complete
[`motion-showcase`](../examples/motion-showcase/report.md) demonstrates both without custom runtime code.

### Directed motion

Motion is part of the closed vocabulary and always has a still end state: under reduced motion every
technique below shows its final state, nothing is pinned, and nothing moves.

| Technique                      | How to write it                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Pinned scene switched by steps | `scene="steps"` on a section: its first images, video, diagram or code block, then 2–8 `:::beat` containers  |
| Diagram lit by the story       | `beat{focus="node-a, edge-id"}` lights those nodes and connections, and connections between lit nodes        |
| Code lit line by line          | `beat{lines="2-4"}` in a steps or scrub scene with a code block: those lines light, the others dim           |
| Scene played by the scroll     | `scene="scrub"` with 2–4 beats: one screen per beat, caption at a third of its step, the last step holds all |
| Chapter opened by a mask       | `transition="clip"` on a section: the chapter opens from its lower edge, nothing slides                      |
| Staged first screen            | `transition="staged"` with `place="opening"`: title by lines, eyebrow, subtitle, actions, then the scene     |
| Thesis filled while read       | `recipe="thesis"`: the heading colour fills its lead from the top while the reader passes it                 |
| Page state from progress       | `state="name"` on a section or beat, `when="name"` on a `card` or `:count`: lit while the state is set       |
| Diagram drawn while scrolling  | `draw="scroll"` on a `diagram`: connections draw in flow order, backward ones later, a marker rides along    |
| Pulses along a route           | `pulse="a,b,c"` on a flow `diagram`: a pulse runs the route three times; the route is marked still           |
| Flight into a node             | `:::zoom{node="api" title="…"}` inside a flow `diagram`: the camera flies into the node, its inside grows    |
| Chart growing to its values    | `count-up="true"` on a `chart`: bars, lines and slices grow from zero, slice percentages count up            |
| Title line by line             | `transition="lines"` on a section: its title opens one line at a time, without touching the text             |
| Number that counts up          | `:count[1,284]` in running text: counts from zero to the written value, which is what the page holds         |

A steps scene pins its media beside the beats only on a screen at least 57rem wide with normal motion; each
beat takes up to two thirds of the screen and the pinned part stays within four screens. On a narrow screen
with normal motion the media stays under the top bar above the current beat; under reduced motion the media
and the beats simply follow each other. A scrub scene holds two to four beats — a fifth is refused — because
each beat is a whole screen of scrolling. The nth beat shows the nth image; a beat's `focus`
names node ids of the diagram in the same section, and a missing id fails at the beat's line.

The pace and the curve of all package motion come from the theme: `motion.easing` is `standard`, `gentle`,
or `decisive`, and `motion.pace` is `brisk`, `calm` (the package timing), or `slow`.

### Played scenes, marks and frames

These techniques reconstruct and point at the product instead of decorating the page. Each has a still final
frame: under reduced motion, with `motion: none`, and in print a scene shows every beat beside its stage, a
swap its written word, a typed line and a log their whole text, a mark its complete line, and a spotlight its
loupe in place. The build refuses each one outside its conditions.

| Technique                     | How to write it                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Product played by time        | `:::demo{play="time" seconds="2"}`: the stage (code, a diagram, cards, a picture), then 2–8 `:::beat` containers |
| Product played by scroll      | `:::demo{play="scroll"}`: the same scene, pinned while the reader scrolls through its beats                      |
| Scenario chosen by tabs       | One playable `demo` in each `tab`; the scene in a tab starts from its beginning when the tab opens               |
| Word swapped on a beat        | `:swap[faster]{words="calmer, exact"}`: one to three other words, back to the written one within 5 s             |
| Line typed in place           | `:typing[agentic-report build page]`: at most 80 characters, the whole line in the page from the start           |
| Hand-drawn mark               | `:mark[three times]{shape="circle"}`: `underline`, `circle` or `strike`, jitter from `seed`; two per section     |
| Loupe over a screenshot       | `:::spotlight{x="72" y="38" zoom="2.5"}`: one image first, then its explanation                                  |
| Log printed line by line      | `transition="log"` on a section: each code block prints line by line, keeping its height                         |
| Screenshot in a browser       | `frame="browser"` with the page's real `address`, or `illustration="true"` for a mock-up                         |
| Vertical tabs                 | `orientation="vertical"` on `tabs`: the tab list beside the panels on a wide screen                              |
| Numbered chapters at the edge | `::contents{sticky="true"}` on a landing: numbered chapters held at the edge, the current one marked             |
| Monospace edge captions       | `chrome: { edges: mono }` in the theme: page title and current chapter along the screen edges                    |

````markdown
---
title: A deploy, played
layout: landing
---

# A deploy, played

::contents{sticky="true"}

::::::::section{title="The run" id="run"}
::::::demo{title="One deploy" play="time" seconds="2"}

```text
$ agentic-report build page
```

:::beat{title="Build"}
The bundle is written in 4 seconds; the run was :mark[green]{shape="underline"}.
:::

:::beat{title="Ship"}
The page is live.
:::
::::::
::::::::

::::section{title="Install" id="install" transition="log"}
Run :typing[npm install agentic-report] and read the log:

```text
$ npm install agentic-report
added 12 packages
found 0 vulnerabilities
```

::::
````

### Video and agentic-screencast

`::video{src=… }` embeds a local clip. `mode` is `clip` (default: muted, looping, playing while visible,
with controls), `background` (muted and looping without controls, with a pause button; `poster` is
required, and a missing one fails with `VIDEO_POSTER_REQUIRED`), or `manual` (controls and sound, playing
only when the reader presses play). `sources` lists further encodings of the same clip in order of
preference; directory output offers all of them before `src`, each with a codec read from the file, so the
browser plays the first one it can decode. One file embeds only the most compatible encoding and warns
with `VIDEO_SOURCES_SINGLE_FILE`, so give H.264 MP4 as `src`. `chapters` points at a WebVTT file; its
chapters appear as buttons under the clip that jump to each one. Under reduced motion nothing plays by
itself. A looping clip or background takes `start` (the second where the loop begins and returns) and
`seam="fade"` (the end of the loop dims and its start brightens); `expand="true"` on a clip adds an Expand
button that opens it large with full controls and sound.

When a page needs a clip of a product, a finding, or the page itself, film it with the agentic-screencast
CLI as a finished tool, from a working directory of your own and never inside the tool's checkout:

```bash
mkdir -p ./media/demo && cd ./media/demo            # your directory, not the tool's
export AGENTIC_SCREENCAST_HOME="$PWD/.screencast"    # cache and build data stay here
agentic-screencast build --source story.md --out demo.mp4 \
  --voice-json '{"engine":"stub","name":"silent","cps":15}'
agentic-screencast web demo.mp4 --out web --formats av1,vp9,h264 --width 1280
```

`web` writes `demo.av1.mp4`, `demo.vp9.webm`, `demo.h264.mp4`, `demo.poster.jpg`, and, when the film has
them, `demo.chapters.vtt`. Copy them into the page source and embed them without re-encoding:

```markdown
::video{src="media/demo.h264.mp4" sources="media/demo.av1.mp4, media/demo.vp9.webm" poster="media/demo.poster.jpg" chapters="media/demo.chapters.vtt" caption="What the clip shows."}
```

### Presentations

`layout: slides` shows the page one slide at a time on the whole screen, between a screencast and a slide
deck, for showing work to other people. Every top-level `section` is a slide; everything before the first
section — the `#` title and its introduction — is the title slide. Each `:::appear{effect="rise|fade|wipe|pop"}`
block inside a slide is one step, shown on the next click; `:::notes` holds speaker notes that the audience
never sees. A section's `slide-transition` (`fade` by default, `push`, `wipe`, `zoom`, or `none`) says how it
arrives. Every directive works on a slide; a `scene="steps"` section is not pinned on a slide — its beats
simply follow each other — because a slide has no page scroll to drive it.

The reader turns slides with the arrow keys, Space, Page Up/Down, Home and End, a click on the slide, a
horizontal swipe, or the buttons at the bottom corner. Without the runtime, in print, and under reduced
motion every step is shown: printing puts each slide on its own page, and reduced motion turns without
transitions.

A presentation is made to be filmed. The address `#/<slide>/<step>` (slide from 1, step from 0) opens any
slide and step directly, and `?view=film` removes the top bar and the controls; `?view=presenter` shows the
notes under each slide. `window.agenticSlides` offers `goto(slide, step)`, `next()`, `previous()`,
`state()` — slide, step, steps, the duration of the running transition and whether it has finished —
`durationOf(slide)` and `settled()`, a promise for the end of the running transition. Every transition has
a fixed duration (fade 420 ms, push and wipe 520 ms, zoom 460 ms, a step 320 ms, each multiplied by the
theme's `motion.pace`), published as `data-slide-duration` on the root; while it runs the root carries
`data-slide-state="moving"`, then `settled`, and the document receives `agentic-slides:settled`. A recorder
therefore opens an address or calls `next()`, waits for `settled()`, and takes the frame.

### First screen and dramaturgy

On a landing page no navigation frame stands above the first screen: the contents open from the top bar
at every width (a theme whose landing keeps a side column, such as `blueprint`, keeps it beside the
content). The shell order is unchanged — top bar and navigation come before `main`, and Skip to content
still leads there. `opening: center|start` chooses where the title, introduction, and actions sit.

A section with `place="opening"` — the `demo` recipe sets it — is the product as the first screen: the page
title, introduction, and actions stand on one side and the section on the other, framed as a result, code
beside a result, a diagram, or a clip. Only the first section may take that place, and only on a page that
starts with a `#` title; anything else fails at the section's line. On a narrow screen the section follows
the introduction. In that column the section always flows as one column in body type with full-width
media, whatever composition, viewport, type, or media its recipe brings, so a `hero` can open the page
beside its title.

Six forms of a strong page are part of the vocabulary; five are recipes, which can be overridden
attribute by attribute, and one is the `compare` directive:

| Form                               | How to write it                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| One large claim                    | `recipe="thesis"` with a `lead`                                                               |
| The product as the demo            | `recipe="demo"` on the first section                                                          |
| A sticky step-by-step story        | `recipe="story"`: the image stays while its steps scroll past                                 |
| Before and after                   | a `compare` holding exactly two images; the reader moves the divider by pointer or arrow keys |
| Technical-drawing language         | `recipe="blueprint"`: a drafting grid behind a hairline panel, annotations in mono capitals   |
| One quote or one figure per screen | `recipe="statement"`: a blockquote with its attribution, or the figure as the section title   |

`compare` takes `before` and `after` labels (localized `Before`/`After` by default); both images keep their
alternative text, and without the runtime the divider stays in the middle.

Compose these roles instead of writing a bespoke layout. `media` owns the treatment, while fit, aspect, and
focal point frame local images and videos independently. Section `tone` owns its background/foreground relationship;
`surface` stays behind authored content, and nested package components keep their own readable surface text.
For `layers`, prefer
image-only cards when the overlap is the point: the package transforms image descendants and leaves the
semantic card and review target untransformed. At narrow widths, split/mosaic/story/stack/layers return to
source order and galleries retain their own horizontal scroll. After rendering, every direct cards rail with
at least two direct element items uses container-relative tracks and keeps its next item partly visible on
compact widths. It exposes a localized focusable scroll group only while it actually overflows;
`ArrowLeft` and `ArrowRight` then move the focused rail through direct-item snap targets. The scroll-only
focus stop and label disappear when a wider owner fits every track. Repeated rails, cards titles, sibling
Markdown and multiple cards follow the same rule. A true one-item rail has no continuation gap or false
scroll announcement. Every section contains its floats and local
layer order. Split and stage arrange only the opening: the blocks right after the title that read well in
half the track, with at most one picture. Split sets that run (lead, paragraphs, lists, quotes, callouts,
decisions, glossary entries, copyable prose, assets, modal and popover triggers, actions) beside its title;
a stage sets its lead, paragraphs, and actions beside its opening picture under a full-width title, and a
gallery stage keeps its title beside the rail. Every later block, including code, tables, cards,
visualizations, and further pictures, spans the whole section track, so put the short opening first and the
detail after it. `align="center"` centers only the full-width heading, lead, and actions while the body keeps the
start edge, and split returns to normal flow before a desktop sidebar can make its
tracks unreadable. Explicit sections own real labelled
section/H2 markup and primary navigation, while heading-only sources use H2 primary links. H3 and component
anchors remain owned targets without becoming primary links. The packaged English/Russian `layout-mixed`
source is the complete grammar catalog; locate it with `agentic-report examples --json`. The bilingual
landing starter is the smaller copyable narrative. Use `terminal-portfolio` for console-led composition,
`cinematic-story` for image-first scrolling, and the decision showcases for reuse across page layouts.

Use top-level `::contents` to place the section map inside the article. It accepts no attributes, label, or
children. The compiler fills it after final IDs are known: exact visible section headings become native
links, while short `section.nav` labels remain exclusive to sidebar/mobile navigation. The in-flow map stays
visible on narrow screens and renders zero or one item even when navigation chrome is absent. Do not write a
parallel Markdown list or parse headings in browser code.

Use one direct `:::lead` as the first block of a `section` to emphasize its opening thesis without creating
a callout. It accepts no attributes and exactly one Markdown paragraph, including ordinary inline markup
and term references; additional paragraphs, lists, code, nested components, top-level placement, and later
or repeated lead blocks fail validation. A glossary with `placement="appendix"` may be top-level or a direct
section child. Direct-section authorship keeps the definition beside its explanation while compilation
moves the complete already-targeted definition into the single appendix without leaving a placeholder.

`actions` accepts only direct labelled `::action[...]` children. Its `placement` is `auto`, `edge`, `inline`,
or `bottom`; `auto` resolves to edge alignment on desktop and a compact bottom group on mobile. On a
`landing` page, an `auto` or `inline` group written directly under the page heading or its first paragraph
shares the opening's axis: it is centred while the heading is centred and starts where the heading starts on
narrow screens. A theme with `chrome.landing: ledger` (such as `blueprint`) keeps its opening at the start,
so its groups keep the ordinary placement. An explicit `edge` under a centred opening ends the group at the end of the opening's reading
measure, level with its lead paragraph, rather than at the far edge of the column. Bottom
placement remains at the authored position in normal flow and never becomes a sticky/fixed overlay. Every action requires `href`; valid targets
are same-page anchors, relative paths, HTTP(S), `mailto:`, `tel:` (a phone number such as
`tel:+1-201-555-0123`), and `sms:` (a number with an optional `?body=`). `javascript:`, `data:`, `file:`, absolute
local paths, and protocol-relative URLs fail validation. `kind` is `primary`, `secondary`, or `quiet` and
changes package styling only. `effect` is `none` or `magnetic`; magnetic is primary-only and moves by at most
9 pixels for a fine pointer in normal motion. The output remains an ordinary anchor with a 16-pixel package
icon and no callback or form behavior.

`source-link` is an inline labelled address for an external local editor helper. Its `href` is deliberately
narrower than an action: `http://127.0.0.1:<port>/open?path=<absolute-path>&line=<positive-line>`, with an
absolute path beginning with `/` or encoded `%2F`. The compiler emits a native `target="_blank"` link with
`noopener noreferrer`, so the report remains open regardless of an empty helper response. It never requests
the helper itself, checks the editor, reads the addressed path, or relaxes CSP. Use a short authored
`path:line` label and percent-encode the full absolute path in the URL. A default build retains that path and
remains workstation-specific. For distribution, add `--share`: the label becomes a non-link, the helper/path
payload is absent from output bytes, and the result reports the exact neutralized count. The profile does not
scan arbitrary prose or replace ordinary links.

`asset.src`, `video.src`, `video.poster`, and `font.src` must resolve to existing files under the canonical
source root. A video is a `.webm`, `.mp4`, `.m4v`, or `.ogv` file (Playwright `recordVideo` writes WebM) and is
drawn as a muted, looping `<video>` with controls; `![Alt](recording.webm)` gives the same player in place of the
image. The player starts while on screen and waits for the reader under reduced motion. A section's `media-fit`,
`media-aspect`, and `focal` frame the player as they frame an image. Embedded video counts
toward `output.maxInlineBytes`, so long recordings belong in `--format directory`. The first font
directive becomes the document font; later directives register additional faces. The text form uses its
authored label; the leaf asset form receives `Download <filename>` so it remains visible and accessible.
`tab` must be directly nested in `tabs`. Glossary keys and canonical terms are unique. In prose,
`:term[authored form]{key="..."}` renders the authored grammatical form while the popover and full definition
retain the canonical title; detached `::term{key="..."}` uses canonical text. Unmarked validation recognizes
the canonical form and every spelling the definition declares in `forms` — a comma-separated list of at most
24 items of at most 64 characters, none repeated and none claimed by another definition — and the proposed
replacement keeps the spelling the sentence used. An inflection nobody declared is not guessed: the package
claims no morphological inference, and that mention stays ordinary prose. Validation requires the first
occurrence in each section and leaves later mentions of the same term in that section as ordinary prose.

`glossary.placement` is `inline` by default. A top-level or direct-section definition may use `appendix` for
one visible package-owned reference section outside primary navigation; list, quote, lead, and unrelated
directive nesting fails rather than leaving an empty authored container. A code fence may use only `terms="key,other-key"` metadata to annotate exact
case-sensitive canonical text. Keys are bounded and unique; every requested term must occur within one line,
and first ranges cannot overlap. Only the first occurrence per key becomes a glossary control. Shiki colors,
literal code bytes, keyboard/touch behavior, full-definition links and copied code text are preserved; the
compiler never executes the block. Every code block carries a localized **Copy** button in its own band
above the first line, so no line of code sits under the button, and wide code scrolls inside its block.
Initial states are declarative, and all interaction code belongs to the package.

### Interaction behavior and limits

Every interactive primitive — term and glossary, disclosure, tabs, modal, popover, filter, toggle, demo,
copyable, Review Workspace, and response — has its initial state, keyboard route and pointer route in the
[interactive reader contract](product/source-contract.md#interactive-reader-contract). Initial states are
declarative; authors never write interaction code. Each instance owns its state, so two tabs, overlays,
filters, switches, demos, Review Workspaces, or response forms never change each other.

### Page navigation and bounded motion

Two or more explicit sections produce one navigation list; a heading-only document uses its H2 headings
when at least two exist. Exactly one primary link carries `aria-current="location"` for section,
descendant, outside, invalid, scroll-boundary, and document-bottom states. Desktop contents are non-modal
and collapse per document session. Mobile contents use a native modal dialog: Close receives initial
focus, Tab stays contained, Escape/backdrop/Close return to the trigger, and a chosen link closes the dialog
and focuses its section heading. Do not add `menu` keyboard behavior or persist collapse state.

Set root metadata `progress: chapters` for a long page whose chapters the reader should see passing,
`progress: nodes` for the same chapters as a row of nodes (passed, current, ahead), or `progress: page` when
decorative reading progress is useful. Set `motion: none | restrained | expressive` from the brief: the build
refuses a technique above the level where it is written (`MOTION_LEVEL_EXCEEDED`), `none` stills the page
like reduced motion, and below `expressive` extension effects draw still. `layout: screens` moves one screen
per wheel, trackpad or touch gesture and per key, with a screen switcher at the edge, the current screen in
the address and `window.agenticScreens.check()` naming a screen cut at the fold; `snapshot` photographs
every screen and every scrub step and warns `SNAPSHOT_STOP_CUT`. Continuous motion gets a **Pause motion**
button in the flow, remembered between visits and pressed from the start under reduced motion. Tabs and
diagram views switch through a View Transition where the browser has one. On a section, choose a `transition`, `scene`,
`interaction`, or `choreography` role; each defaults to `none` unless a recipe supplies it, and legacy
`reveal="true"` remains supported. The package owns every duration, distance and item cap of these roles,
their reduced-motion and coarse-pointer behavior, and the fallback without `IntersectionObserver`; the
numbers are in the [source contract](product/source-contract.md#page-navigation-and-motion). Authors cannot
supply timing, coordinates, easing, JavaScript, or custom runtime code.

## Extend the vocabulary for one page

When a design needs something the built-in directives do not give, declare an extension instead of
changing the core. List its manifest in the page metadata:

```yaml
extensions:
  - extensions/metric-card/extension.yaml
```

- `kind: block` — a Markdown template of existing directives with `{{attribute}}` and `{{content}}`;
  values are escaped, the expansion is checked like authored Markdown. Optional `styles` — a `.css` file
  from theme tokens only, nested inside the block's element and emitted only where the block is used;
  literals are refused with `EXTENSION_STYLES_INVALID`.
- `kind: provider` — a local program (`command`) that receives the directive as JSON on stdin — with
  `data`, the page's declared data files parsed by name — and writes Markdown to stdout at build time.
- `kind: island` — `:::island{name="…"}` with a Markdown static equivalent; the application runs in a
  sandboxed frame without network and receives theme tokens, scheme, language and the page clock.
- `kind: effect` — a bundled script that decorates built-in directives through its target attributes.

Give each extension two unlike example pages; without them the build warns `EXTENSION_EXAMPLES_MISSING`.

An effect module is `export default defineEffect({ mount(ctx) { … return { at(t, progress) {} } } })` with
`defineEffect` and its types imported from `agentic-report/effect`; the build bundles it with its imports
into one script (refused above `budgetBytes` with `EXTENSION_EFFECT_OVER_BUDGET`). For an asynchronous
rendering failure, such as a lost WebGL context, call `ctx.fallback()` to enter the next safe mode;
`ctx.rebuild(reason)` requests geometry recalculation. Check an effect with
`agentic-report effect-check <extension.yaml> --out <directory>`, which builds both examples, opens them in Chromium (Playwright beside the package,
as for `snapshot`) and prints `N of M checks passed`: the declaration, the reduced-motion final state, the
page clock, a 50 ms budget per effect call at 4× CPU slowdown, colours from theme tokens, no decoration on
text, four widths, content edits, states in every render mode, print and two unlike examples. By default it
writes one `check` NDJSON record per check and a result record; a failed check exits with code `1`. The
output directory contains `performance-diagnostics.json` with numeric timings and fixed scroll/resize
phase labels; tasks outside those measured phases are recorded separately and do not affect the result.
After a confirmed timing failure, a separate `effect-diagnostic` pass records advisory build-stage timings
without changing the 50 ms verdict; if it fails or exceeds 20 seconds, `diagnosticUnavailable: true`
marks the missing profile without exposing its browser error. The `wall-thread` reference writes those numeric timings under
`phases[].builds`, including route search and path pulling; builds outside measured phases appear in
`unassignedBuilds`.
The file contains no authored text or paths; inspect it when the 50 ms check fails. The context the effect
receives, including its render modes, canvas coordinates, services and lifecycle, is described in the
[effect API reference](../skills/agentic-report/references/effect-api.md).
`inspect` lists the extensions a page uses and `build` reports their uses and bundled bytes. The manifest
format is in the source contract, [Extensions](product/source-contract.md#extensions); how each level
is built and isolated is in [the architecture](ARCHITECTURE.md#extensions).

Start from a reference extension rather than a blank folder. The package ships them in `extensions/`, and
`agentic-report examples` lists each one after the example pages with its `name`, `kind`, `description` and
the installed paths of its `manifest`, `readme` and `examples`. Copy the folder beside your page and declare
its manifest:

| Extension                                                    | Level                                 | What it shows                                                    |
| ------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| [`key-figure`](../extensions/key-figure/README.md)           | block                                 | a figure that cannot lose its date and source                    |
| [`product-theatre`](../extensions/product-theatre/README.md) | block and provider (`theatre-script`) | a product run from a JSON scenario, replayed as a steps scene    |
| [`wall-thread`](../extensions/wall-thread/README.md)         | effect                                | a thread drawn from section to section in all three render modes |
| [`loom`](../extensions/loom/README.md)                       | effect                                | cloth woven beside a section as the reader goes through it       |
| [`focus-frame`](../extensions/focus-frame/README.md)         | effect                                | a small WebGL frame around an image with 2D and still fallbacks  |
| [`slo-budget`](../extensions/slo-budget/README.md)           | island                                | an error-budget calculator with a static body for print          |

When to extend at all and how to choose the level is in the skill's
[extensions reference](../skills/agentic-report/references/extensions.md).

## Build for an agent

```bash
agentic-report build ./my-report --output ./architecture.html --json
```

Each stdout line is JSON. A diagnostic line contains `type`, `runId`, `level`, `code`, `message`, and
`remediation`; a content-backed error includes the authored `source.file`, start/end line and column, while
the referenced local path is kept in structured `details.target`. Process-level errors omit source
locations. When one run finds several authored violations while interpreting directives, the
line reports the earliest one and carries the rest in `related`, ordered by position in the source and
shaped like the diagnostic itself; the field is absent when the run found exactly one. Three refusals are
dropped because each only repeats one already reported: a descendant of a rejected directive, a term
reference or an annotated code fence pointing at a key whose own `glossary` definition was refused, and a
check reading an interpretation already refused. A key nothing ever defined stays an independent fact in
both forms. Suppression follows those three mechanisms and claims nothing wider: a definition that was
never read because its container was rejected leaves its key unknown, so a reference to it is still
listed beside the refusal of that container. The
inventory covers the directive phase: a failure of another stage, such as reading the source graph or
publishing the artifact, still ends the run with one diagnostic. The final result contains an absolute output path, format, HTML byte size, embedded/external
occurrence counts, an HTML SHA-256 content hash, the selected share profile, exact neutralized source-link
count, and warnings. Asset counters describe authored/generated
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
option, destination, local asset input, or Node.js runtime is unsupported. Exit code `2` means the installed package cannot
supply a required build asset.
Exit code `3` means an unexpected internal failure occurred.

## Output selection

- Omit `--format` for the portable default `single-file`.
- Use `--format directory` when separate content-addressed assets are more important than one-file
  portability. The package runtime is embedded for `single-file` and external for `directory`; callers do
  not select its placement.
- For a page served on the web, declare its absolute address as `url` in the primary entry or pass
  `--url https://…/` to `build`. The head then carries `<link rel="canonical">`, OpenGraph (`og:url`,
  `og:title`, `og:description`, `og:locale` and alternates for the other embedded language) and a Twitter
  card. Build such a page with `--format directory`: images, fonts, styles and the runtime leave the HTML,
  which keeps it under the 2,097,152 bytes Googlebot reads; a larger public page reports
  `PUBLIC_PAGE_OVER_CRAWLER_LIMIT`. Add a local `image` (PNG, JPEG, WebP, GIF or AVIF) for a link preview;
  it becomes an absolute `og:image` only in a directory build with a URL and otherwise reports
  `SOCIAL_IMAGE_NOT_PUBLISHED`. Leave `url` out of packaged or shared sources that are not published at one
  address, and pass it per build instead.
- After the pages of one origin are published into a directory whose root is the origin root, run
  `agentic-report sitemap <directory>`. It writes `sitemap.xml` from the pages' canonical URLs and a
  `robots.txt` with an absolute `Sitemap:` line, lists HTML from other tools as `skipped`, and refuses
  without writing when either file exists (`SITEMAP_TARGET_EXISTS`), origins differ
  (`SITEMAP_ORIGIN_MISMATCH`), a URL is not the page's place in the tree — a directory index needs its
  trailing `/` (`SITEMAP_PATH_MISMATCH`) — an agentic-report page has no URL
  (`SITEMAP_PAGE_WITHOUT_URL`), the tree has no agentic-report page (`SITEMAP_NO_PAGES`), contains a symbolic
  link or special file (`SITEMAP_SPECIAL_FILE`), or the path is not a directory (`SITEMAP_DIRECTORY_INVALID`).
- Look at the page before handing it over: `agentic-report snapshot <input> --out <directory>` builds it
  and photographs it at 390, 768 and 1440 pixels, in the light and dark schemes, with normal and reduced
  motion — the first screen and the full page of each — and writes `contact-sheet.html` and
  `contact-sheet.png`. Every shot is taken on the page clock stopped after all motion has finished, so
  repeated runs on an unchanged page give identical frames. `--widths`, `--schemes` and `--motion` take
  comma-separated subsets. The destination
  must be absent or empty (`SNAPSHOT_DESTINATION_EXISTS`). The package ships no browser: run the command
  with Playwright beside it, `npx --yes -p agentic-report -p playwright@<version> agentic-report snapshot …`,
  after `npx --yes playwright@<version> install chromium` once; without it the command fails with
  `SNAPSHOT_BROWSER_MISSING` and those commands. A page that pins `scheme` shows that scheme in every shot.
- `agentic-report snapshot <input> --out <directory> --measure` measures instead of photographing, at 320,
  360, 390, 768, 1024 and 1440 pixels unless `--widths` says otherwise, on the same stopped page clock. It
  writes only `page.html` and prints one NDJSON record `{"type":"measure", width, scheme, motion, …}` per
  combination, then the result with every `measurements` entry (`--human` prints a table): the pixels the
  page scrolls sideways (`horizontalOverflow`) and the outermost elements beyond the window
  (`overflowing`); `smallText`, text under 11 px on screen, SVG text at its on-screen size; `lowContrast`,
  text below 4.5:1 (3:1 for large text) against its composited background with the `opacity` of its
  ancestors applied, and `unmeasuredContrast`, text over an image or gradient; `coveredText`, text lines
  under a fixed or sticky element at some scroll position (a full-width top bar excepted); `emptyBands`
  at least half a window high (not for `screens` and `slides`); `clippedHeadings`; `firstScreen` — the
  title and a primary action in the first window, `actionOnPage` (whether the page has a primary action at
  all) and `mainSceneShare`, the share of that window taken by
  its largest picture, clip, figure, code or scene; `stops` with `fits`; `pageErrors`, `placeholders`
  (lorem ipsum, TODO, TBD, FIXME outside code) and `failedFonts`; and `defects`, their total, which also
  counts a title outside the first window and a primary action the page has but not in it. Findings name
  elements by tag, id and classes, never by their text.
- Add `--share` when the artifact leaves the source workstation. Source-link labels remain readable
  non-links derived as path-free filename/line from the validated helper, with `source:line` for an unsafe
  terminal. An already matching short label remains exact; directory-bearing and free-form labels are
  replaced wholesale. Compiler-owned helper paths are not serialized, and human/JSON results report the
  exact neutralized count. The default build preserves every authored label and working editor link.

All source assets must be local and below the source directory after symlinks are resolved. Remote URLs,
escaping paths, executable templates and raw HTML are outside the contract; author code enters only
through the page's [extensions](#extend-the-vocabulary-for-one-page).

A proposed new primitive of the core itself must first satisfy the closed
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
images, and attachments. An output path that resolves to, or shares a filesystem identity with, an entry,
manifest, partial, or local asset fails with `OUTPUT_COLLIDES_WITH_SOURCE`. How both formats publish, and
how `output.maxInlineBytes` refuses a single file that is too large, is described under «Output behavior» in
the [source contract](product/source-contract.md#output-behavior).

Use standard CommonMark angle brackets around an asset destination containing spaces, for example
`![Architecture](<assets/схема системы.png>)`.
