# Declarative source contract

This document defines the current author-facing input to `agentic-report`. Agents write content and
semantic intent; they do not write JSX, templates with executable helpers, page layout, or browser code in
the page itself. What one design needs beyond the built-in vocabulary comes through the page
[extensions](#extensions) it declares.

The product contract is defined in [`../../PRODUCT-REQUIREMENTS.md`](../../PRODUCT-REQUIREMENTS.md), and the
implementation behind this source contract is described in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
Only the syntax below and the generated schemas are accepted.

## Source directory

The input is a Markdown file or a directory containing `report.md` or `index.md`. A source directory may
also contain one YAML/JSON manifest, confined English/Russian alternate Markdown entries, Markdown partials,
images, videos, downloadable resources, and fonts. References are relative to the primary entry's canonical
directory. The compiler resolves symbolic links before reading contents and rejects a canonical target
outside that directory.

## Metadata

Metadata can be frontmatter or `agentic-report.yaml`, `agentic-report.yml`, or `agentic-report.json`.
Frontmatter takes precedence. Supported fields are:

- `contractVersion`: authored source-contract major; omission is interpreted as legacy major `1`;
- `title`: non-empty document title; when omitted, the first level-one heading or filename is used;
- `description`: plain-text metadata description;
- `language`: tag used on `<html lang>`; the current accepted subset is a 2–8 ASCII-letter primary tag
  followed by optional 2–8 character ASCII alphanumeric subtags; default `und` means undetermined. `ru`
  and its subtags select complete Russian package-owned reader chrome; `en`, `und`, and every unsupported
  language select complete English chrome on a single-language page. The package does not translate
  authored Markdown or CLI diagnostics. Visible and accessible package-generated chart numbers use the
  same selected locale;
- `localizations`: optional fixed object whose `en` and `ru` values are confined relative `.md` entry
  paths. The primary entry must itself resolve to `en` or `ru`, may not repeat its own locale, and remains
  the fallback. Every alternate must declare the matching `language`, use the same `contractVersion`, be a
  distinct ordinary file, and may contain only `contractVersion`, `title`, `description`, and `language`
  metadata. Presentation, output, `url`, and `image` settings come from the primary entry. An empty object, unsupported
  locale, recursive localization declaration, canonical alias, or lexical/symlink escape fails before
  publication;
- `url`: optional absolute `http`/`https` address the page is served from, without user name, password
  or `#fragment`; it is normalized to its canonical URL form and never requested. With a URL the page head
  carries `<link rel="canonical">`, `og:type`, `og:url`, `og:title`, `og:description`, `og:locale` with one
  `og:locale:alternate` per other embedded language, and a Twitter card, all taken from the primary entry.
  A language tag with a two-letter region maps to `ll_TT` (`pt-BR` → `pt_BR`); `en` and `ru` without a
  region map to `en_US` and `ru_RU`; other tags without a two-letter region and `und` get no `og:locale`.
  Give a page served as a directory index its address with the trailing `/` (`https://example.com/guide/`),
  because the social image address is resolved against it. A page with more than one language variant
  also carries `<link rel="alternate" hreflang>` for each language and `hreflang="x-default"`, all pointing
  at the same address, because the variants share it and the page picks one from the reader's languages.
  Without a URL the head carries none of these tags;
- `image`: optional confined relative path to a PNG, JPEG, WebP, GIF, or AVIF social preview image. A
  `directory` build with a URL writes it under `assets/` with a content-hash name and publishes the absolute
  address as `og:image` and `twitter:image` with a `summary_large_image` card. A `single-file` build, or a
  build without a URL, omits the image and reports `SOCIAL_IMAGE_NOT_PUBLISHED`. Another file type, or a
  path that is not a regular file, fails with `INVALID_SOCIAL_IMAGE` at the `image` field, and a path that
  leaves the source directory is refused like any other local reference;
- `data`: optional list of up to 16 confined relative paths to JSON files the page reads when it builds;
  see «Page data» below. It belongs to the primary entry, and every language variant reads the same files;
- `theme`: a built-in theme name (`neutral` by default; the built-in themes with their intent and palette
  are listed in the generated [authoring catalog](../../skills/agentic-report/references/catalog.md#page-metadata)
  and by `describe` under `page.themes`), a confined relative path to a `.yaml`, `.yml` or `.json` theme
  file, or a theme object in the frontmatter; see «Themes» below;
- `scheme`: `system`, `light`, or `dark`;
- `layout`: one of the page layouts listed in the
  [authoring catalog](../../skills/agentic-report/references/catalog.md#page-metadata) (`document` by
  default); `slides` turns the page into a presentation and `screens` into a page that moves one screen per
  gesture, both described under «Page navigation and motion»;
- `motion`: `none`, `restrained` or `expressive` (default); how much the page moves, decided by the brief.
  The build refuses a technique above the level with `MOTION_LEVEL_EXCEEDED` at the place it is written
  (a recipe value is named with its recipe): `none` allows no entrance, scene, pointer effect, count,
  cascade, `count-up`, `:swap`, `:typing`, `:mark`, `spotlight` or `seam="fade"`; `restrained` allows one
  chapter entrance (`transition="log"` included), one pointer effect, and those counts and small in-place
  movements, but no `scene="progress|steps|scrub"`, `draw="scroll"`, `pulse`, `zoom`, `demo` with `play`,
  `transition="staged"`. The
  level is written on the root as `data-motion-level`; `none` stills the page for the runtime like reduced
  motion, and below `expressive` extension effects draw their still state (`reason: "motion-level"`);
- `schemeToggle`: boolean; default `true`; shows the reader's package-owned light/dark button;
- `themeSwitcher`: boolean; default `false`; adds a reader theme selector that swaps between the built-in
  themes and the page's own theme live without changing the color scheme;
- `review`: boolean; default `false`; ships Review Workspace. A build given a prior review sidecar enables it
  automatically;
- `extensions`: optional list of 1–32 unique relative paths to extension manifests (`.yaml`, `.yml`,
  `.json`), confined to the source root; primary entry only. See [Extensions](#extensions);
- `progress`: `none` (default), `page`, `chapters`, or `nodes`; `page` is a decorative normal-motion reading
  line, `chapters` a segment per chapter along the top bar that fills while the chapter is read and jumps to
  it, `nodes` the same chapters as a row of nodes on one line — passed chapters filled, the current one
  ringed;
- `opening`: `center` (default) or `start`; alignment of a landing page's title, introduction, and actions;
- `attribution`: boolean; default `true`; shows the package-owned footer link **Made with Agentic Report**
  to `https://agentic-report.witqq.dev/`. Set `false` to omit only that footer; authored links and prose are
  unchanged;
- `output.format`: `single-file` or `directory`;
- `output.maxInlineBytes`: positive size budget for resources embedded in one file; a single-file build above
  it fails with `INLINE_SIZE_BUDGET_EXCEEDED`.

Run `agentic-report schema` for the exact accepted manifest-input schema and defaults. Defaulted fields
remain optional in the emitted JSON Schema because the compiler accepts their omission. Use
`schema --scope directives` for directive grammar and constraints, or `schema --scope source` for the
complete source-object schema. The ESM API exposes defensive project-owned projections through
`getAuthoringSchema(scope)`, `getSourceContract()`, and `listExamples()`; concrete Zod schemas remain an
internal implementation detail. The complete checked JSON form is
[`../generated/source-contract.json`](../generated/source-contract.json),
and [`../../examples/manifest.json`](../../examples/manifest.json) binds packaged example identities to
their source-file SHA-256 hashes.

A multilingual build compiles the primary and every declared alternate, including each variant's partials
and local assets, into one artifact. The browser chooses the first available `en`/`ru` primary language in
ordered `navigator.languages`, or the primary entry when none matches. A native language selector appears
only when the artifact contains multiple variants. Manual switching atomically changes `<html lang>`, title,
description, article, navigation, package controls, visualization text/number formatting, review targets,
and response forms. Review threads, response drafts, and component state are restored only within their
locale during the current tab session. No locale choice uses storage, changes generated bytes, or triggers a
network request or browser-side compilation.

Primary `report.md`:

```yaml
---
title: Architecture decision
language: en
localizations:
  ru: report.ru.md
layout: document
---
```

Alternate `report.ru.md`:

```yaml
---
title: Архитектурное решение
language: ru
---
```

The ESM `initProject({ destination, starter? })` operation initializes a registry-owned packaged starter
into an absent directory whose immediate parent is an existing directory. A symbolic-link parent is
resolved, and `projectPath` reports the resolved destination. It rejects
unknown starters, unsafe runtime option shapes, symlinks and special files, then fully reads the complete
local tree and verifies the registry entry before publication. The destination is claimed exclusively and
ordinary files use no-overwrite creation. Existing destinations are rejected unchanged. A later write
failure is structured and may leave the new destination incomplete; the operation never deletes or rolls
back its contents. CLI `init <destination> [--starter <id>] [--json]` adapts the same operation. Starter
eligibility and the single-default flag are registry metadata shared by discovery and init. There is one
starter per page category, named after it: `landing`, `document` (the default), `dashboard`, `answer`, and
`presentation`;
each tree holds `report.md`, its Russian alternate, and a `brief.md` whose table lists the category's
brief dimensions. A starter is also a buildable example; there is no separate generator contract.

`page.categories` in `describe` lists the five categories with their purpose, recommended layout,
subvariants, and brief dimensions, and every example in `examples` names its `category` and `subvariant`.
A category is a recommendation: the compiler never checks or restricts which directives, modes, or
effects a page of a given category uses.

The normal first-use path is `init`, edit the generated Markdown and local assets, run one `build`, and open
the resulting artifact through `file://`. Build runs the complete source and render preparation before it
publishes output, so neither `validate` nor `inspect` is a prerequisite. Use those read-only operations only
when their separate diagnostic or discovery result is useful.

The ESM `validateReport({ input, format?, review?, url? })` and `inspectReport({ input, format?, review?, url? })` operations use the
production source and render preparation without output publication. CLI `validate [input] [--format
<format>] [--url <url>] [--json]` and `inspect [input] [--format <format>] [--url <url>] [--json]` are adapters of the same
functions. Validation reports resolved project/entry identity, output format, derived runtime placement,
and warnings. Inspection also reports sorted relative source files, the page `structure` (layout, motion level, media
shown before the first section, per section its resolved recipe, place, surface, motion attributes,
and media counts, and per card group its card, form, plain-card and linked-card counts, with no author text), observed directives and local-resource occurrence counts, and the
registry-derived command/format/starter/capability catalog.

`snapshot [input] --out <directory> [--widths <list>] [--schemes <list>] [--motion <list>] [--measure] [--json]` builds
the source into `<directory>/page.html` and photographs it through a Playwright installed beside the
package, then writes a contact sheet; with `--measure` it writes no pictures and reports one `measure`
record per width, scheme and motion instead (overflow, small text, contrast with opacity, covered text,
empty bands, clipped headings, first screen, stops, page errors). It never overwrites a non-empty destination. Both commands read
and validate all resources required by the selected format but do not create or replace an output artifact.

`buildReport({ input, output?, format?, review?, share?, url? })` is the publishing operation. `url`, and
CLI `--url <url>` on `build`, `validate` and `inspect`, overrides the manifest `url` with the same validation
and fails with `PUBLIC_URL_INVALID` otherwise. A page with a public URL whose HTML exceeds 2,097,152 bytes,
the part of an HTML file Googlebot reads, reports `PUBLIC_PAGE_OVER_CRAWLER_LIMIT` with the measured size;
directory output keeps images, fonts, styles, and the runtime out of the HTML and removes that risk. `share: true`, or
CLI `build --share`, neutralizes compiler-owned workstation source links before serialization in either
output format. `BuildReportResult.share` identifies the selected profile and
`neutralizedSourceLinks` is the exact transformed-node count; human output prints the count for a share
build. The option does not rewrite source and is intentionally absent from validation and inspection.

## Review protocol and source binding

A build with Review Workspace enabled (`review: true` or a prior review sidecar) embeds an inert version-2
review manifest in a `template` element; a build without it carries no manifest. Container directives
that produce a final DOM owner and ordinary Markdown blocks receive deterministic review-target identities;
structural chart `series` data is reviewed through its owning chart rather than a removed intermediate node. Each target records its kind,
SHA-256 fingerprint, source-root-relative entry or partial path, and authored range. A section with an
explicit `id` also receives a stable review key. The manifest never contains source bodies or absolute
workstation paths.

The manifest `reportRevision` is a SHA-256 identity over the complete confined local input graph used by the
report—entry, metadata, expanded partials, theme and data files, every file of the declared extensions
(manifests, templates, styles, effect modules, island entries and assets), and referenced local resources—plus the target-manifest version,
source-contract version, target-algorithm version, and canonical target inventory. It is independent of output destination
and `single-file` versus `directory`; `BuildReportResult.contentHash` remains the hash of the serialized
output HTML and is a separate contract.

A single-language review artifact is strict version-3 JSON with a bound report revision. A multilingual
artifact is strict version 4 and additionally requires `report.locale` to be one of the report's declared
`en`/`ru` variants. Both forms allow at most 500 threads and at most 500 messages. Each thread owns ordered
revision segments; every segment binds one report revision and target to its messages and resolved boolean.
A selected-text segment additionally stores `selection.start` and
`selection.end` boundaries, each with a complete deterministic target reference and a non-negative Unicode
code-point offset, plus the bounded NFC `selection.quote`. The segment target must equal the start target.
This represents an exact range inside one target or across multiple targets without copying whole source
blocks. A whole-block thread omits `selection`. Valid closed version-2 whole-block artifacts are accepted and
normalize losslessly to version 3; version 2 never accepts selection fields. Legacy v2/v3 input against a
multilingual report routes to a unique exact revision when possible and otherwise to the primary locale.
Version 4 routes by locale before target binding, preserves fully missing stale targets in that locale, and
rejects an undeclared locale instead of substituting another source.

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

Review Workspace ships only when `review` is `true` or a prior review sidecar is supplied; otherwise the page
carries no review manifest, topbar action, or annotation layer. When an enabled report contains review targets,
annotation is always available and its topbar includes `Review`; there
is no activation mode, target outline, block button, or exit action. Selecting eligible rendered text exposes
one localized **Create note** action beside the native selection. Activation snapshots the range and opens a
compact anchored popover containing the exact quote, message history, compose/edit actions, and resolve or
reopen. The range may stay inside one review target, cross nested inline markup, or end in a later target.
Both endpoints must belong to the same report article. Empty, whitespace-only, oversized, outside-report,
reversed, package-control, or unreconstructable ranges expose no action or fail import without replacing
current state. Releasing `Shift` after a keyboard selection focuses the action; pointer and touch selection
use the same captured state.

On desktop, the popover prefers the right or left of its anchor, then centers above or below when neither
side fits; every placement shifts/clamps within the visual viewport and its height is bounded so the thread
remains scrollable without moving the report. On mobile it becomes a bounded bottom surface inside the
visual viewport. Selection actions, saved-range markers, and the thread popover
recalculate from both window and `visualViewport` scroll/resize signals, so browser chrome and the on-screen
keyboard cannot strand them off screen. The contextual action and focus markers measure their complete
surface, clamp against a visible rectangle from the live range, and hide when the range is wholly offscreen.
A saved-range marker prefers a fully separated position above the range, then below it, before edge clamping;
this keeps direct marker activation distinct from tapping the highlighted text. Navigation, Review, language,
theme, and scheme controls use distinct package-owned topbar icons — 20 pixels for Review, language, theme
and scheme, 16 for navigation — with localized accessible names and title tooltips. The
native language selector remains the locale input and receives visible focus after switching. At constrained
widths visible labels and secondary page identity are omitted without imposing a document minimum width, and
coarse pointers receive larger targets. Visible contextual/action controls retain localized labels and use
16-pixel icons; Create note shows a pencil and View thread shows a comment.

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

Canonical `review.json` download exports all whole-block and selected-text threads for the active locale
together: version 3 for a single-language page or version 4 with `report.locale` for a multilingual page.
Exact-revision import validates every current target, offset, range order, and quote against the rendered DOM
before swapping state and immediately restores valid selection highlights. It rejects oversized, malformed,
version-1, stale, foreign, non-current, or mismatched selected-text data without replacing active state;
valid version-2 whole-block import remains supported. On a multilingual page, import and current state are
isolated by locale; switching away and back restores only that locale's threads. Review state is session-only
and never written to browser storage, URL, network, or report source. Message authorship is descriptive
rather than authenticated.

The root metadata value and `output` must be objects; scalar and array shapes fail instead of being
silently replaced by defaults. Validation diagnostics point to the actual manifest or frontmatter field
range that supplied the failing value.

Defaults are `layout: document`, `theme: neutral`, `scheme: system`, `schemeToggle: true`,
`themeSwitcher: false`, `review: false`, `progress: none`, `opening: center`, and `attribution: true`.

### Themes

A theme is typed data from which the package generates the page stylesheet; the static package stylesheet
reads only the variables and root attributes the theme produces and never selects a theme by its name. A
theme file and a theme object share one schema (`agentic-report schema --scope theme`, `docs/generated/theme.schema.json`).
The same schema lists the public token vocabulary under `x-agentic-report-tokens`: every CSS variable a theme
declares, by group, with the field it comes from. Package styles, runtime effects and extensions read only
these tokens; `tests/unit/theme-tokens.test.ts` fails when a theme declares a variable outside the vocabulary,
when a token is read by nothing, or when a stylesheet or renderer names a colour of its own. The fields:

- `name`: theme identity for the theme selector; a file defaults to its file name, an inline theme to
  `custom`; a built-in name is refused (`THEME_NAME_TAKEN`);
- `extends`: a built-in theme name or a confined relative path to another theme file; defaults to the
  default theme. A chain that returns to a file it has passed fails with `THEME_EXTENDS_CYCLE`;
- `description`, `palette`: what the theme is for and why its colours are what they are;
- `scheme`: `both` or `dark` — a dark-only theme draws its dark palette in either reader scheme;
- `accent`: the restrained `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink`, or the brighter `indigo`,
  `teal`, `coral` — a named accent family with a checked light and dark pair;
- `fonts.pair`: the display, text and code trio of a built-in theme — `midnight` (Geologica, IBM Plex Sans,
  JetBrains Mono), `calm-paper` (Playfair, Literata, PT Mono), `synthwave` (Unbounded, Exo 2, JetBrains
  Mono), `noir` (Cormorant Garamond, Jost, PT Mono), `aurora` (Raleway, Commissioner, Victor Mono),
  `daylight` (Onest, Golos Text, Geist Mono), `ember` (Oswald, Rubik, JetBrains Mono), `blueprint`
  (Tektur, Fira Sans, Martian Mono), `terminal` (Martian Mono, JetBrains Mono, JetBrains Mono), `neutral`
  (Literata, Onest, Martian Mono), `frost` (Onest, IBM Plex Sans, Geist Mono) — or `system`
  (the reader's system faces); `fonts.heading`, `fonts.body`, `fonts.mono` name one of the 23 embedded
  families (`onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`,
  `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`,
  `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`) or
  `system-sans`, `system-serif`, `system-mono` for a role and refine the pair. The package embeds the Latin and Cyrillic subsets of every family a
  theme uses, so every reader sees the same type; `literata` and `playfair` are embedded with their
  optical-size axis (`opsz`) and the page sets `font-optical-sizing: auto`, so their drawing follows the size;
- `typography.headingWeight`, `typography.displayWeight`, `typography.headingTracking`,
  `typography.bodyLeading`, `typography.bodyTracking`: bounded numbers; `typography.displayCase`: `none` or
  `uppercase` for display headings; `typography.displayScale` (0.6–1.2, default 1): the size of display
  headings against the package scale; `typography.headingMeasure` (8–40, in `ch`, optional): the longest
  line of the page title and of display and editorial section titles, emitted as `--heading-measure` — left
  out, each of those headings keeps the package measure: the reading measure for a report title, 10–17ch
  for landing, first-screen and display titles. Independently, the package caps a heading's size by the measured
  letter width of its face so its longest word fits the column, and never breaks or hyphenates a word in a
  heading. Russian headings never
  take a tracking tighter than -0.025em, whatever the theme sets for Latin; `typography.captions`
  (`plain` by default, or `italic`): figure captions and `source-line` text in the text face, or in the
  heading face in italics — the serif italic caption of an editorial page when the heading face is a serif
  (the embedded faces carry no italic drawing, so the browser slants the upright);
- `spacing.density` (`compact`, `comfortable`, `spacious`), `spacing.rhythm`, `spacing.cardMinimum`,
  `spacing.gap` (`regular`, `tight`);
- `width` (`narrow`, `standard`, `wide`), `radius` (`sharp`, `soft`, `round`), `radii.control`,
  `radii.card`, `radii.media` (`none`, `small`, `medium`, `large`; defaults `small`, `medium`, `medium`: the
  step of the radius scale each role takes), `controls` (`regular`:
  36 px buttons and fields with 32 px small ones, `compact`: 32 and 28 px; under a finger every control is
  44 px), `backdrop` (`none`, `dots`, `grid`, `tint`, `grain`: a faint noise in the text colour over the page,
  not printed),
  `elevation` (`lifted`, `close`, `flat`);
- `colors.light.<role>`, `colors.dark.<role>`: `#rgb`, `#rrggbb`, `#rrggbbaa`, or `transparent` for the roles
  `background`, `surface`, `raised`, `muted`, `heading`, `text`, `textMuted`, `border`, `borderStrong`,
  `accent`, `accentStrong`, `accentSoft`, `accent2`, `focus`, `chart1`–`chart6`, the status roles
  `statusDone`, `statusReview`, `statusReturned` (each follows `chart2`, `chart4`, `chart3` unless set, and
  must reach 3:1 against `background` and `surface`), `marker`, `shadow`,
  `mediaBacking`, and the code colours `codeBackground`, `codeText`, `codeKeyword`,
  `codeString`, `codeNumber`, `codeFunction`, `codeType`, `codeComment`, `codePunctuation` that colour
  highlighted code through Shiki's CSS-variables theme;
- `chrome.topbar` (`glass`, `ledger`), `chrome.navigation` (`plain`, `numbered`), `chrome.sectionTitle`
  (`plain`, `rule`, `bar`), `chrome.cards` (`raised`, `ruled`), `chrome.components` (`soft`, `flat`,
  `edged`), `chrome.landing` (`centered`, `ledger`), `chrome.edges` (`none`, `mono`: the page title and the
  current chapter in small monospace captions along the screen edges on a wide screen);
- `ornaments.headingPrefix` (up to three characters), `ornaments.titleCursor` (boolean),
  `ornaments.heroEmphasis` (`none`, `rule`, `shadow`), `ornaments.mediaTreatment` (`plain`, `vivid`),
  `ornaments.linkedCard` (`raised`, `edge`), `ornaments.console` (`none`, `on`: bracketed labels, dashed
  rules and a prompt mark), `ornaments.scanlines` and `ornaments.glow` (`none`, `on`; off in every built-in
  theme, because a texture over the text and a phosphor glow read as a generated-site cliché).

Resolution applies the default theme, then the `extends` chain, then the theme's named accent, then its
explicit fields. The resolved theme must keep `heading` on `background`, `text` and `textMuted`
on `background` and `surface`, `accentStrong` on `background` and `surface`, `accent2` on `background`,
`background` on `heading` (the primary action label) and every code colour on `codeBackground` at 4.5:1 or
more, and `accent` and `focus` on `background` at 3:1 or more, in every scheme it draws; otherwise the build fails with `THEME_CONTRAST`.
Field errors fail with `THEME_INVALID`, an unknown name with `THEME_UNKNOWN`, a file outside the source root
with `THEME_OUTSIDE_SOURCE`, and an unreadable or malformed file with `THEME_READ_FAILED`; each diagnostic
points to the field's line in the theme file or frontmatter. Theme files are part of the source graph: they
are protected from output collision like any source file. These values select package-owned styles only;
CSS values, class names, JSX, templates, URLs, and callbacks are not accepted.
`agentic-report describe --json` and the ESM `getSourceContract()` return the built-in themes with their
intent and palette under `page.themes`, and the theme fields, accents, font families and contrast pairs
under `page.theme`.
The public landing uses `neutral`, Executive brief `daylight`, vendor decision `calm-paper`, launch
readiness and incident review extend `ember`, Terminal portfolio uses `terminal`, Cinematic story `noir`,
Motion showcase and research `aurora`, the landing starter `neutral`, and architecture and the dashboard
`blueprint`. These sources compose the same public components without page-specific CSS.
The five category starters combine these layouts with the public content, interaction, visualization,
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

## Page data

`data` lists JSON files; each is addressed by its file name without `.json` (`data/run-96.json` is
`run-96`), which must be lowercase letters, digits and hyphens starting with a letter and unique on the
page. Files are confined to the source root like partials, at most 1 MB each, and join the source graph:
their bytes are part of the report revision. A missing file, a file outside the source root, a name that
cannot be addressed and invalid JSON fail with `DATA_READ_FAILED`, `DATA_OUTSIDE_SOURCE`,
`DATA_FILE_INVALID` and `DATA_JSON_INVALID` (the last one at the place of the syntax error in the file).

On a page that declares `data`, the build settles the data before any directive is read:

- `{{name.key.0.field}}` — a name, then object keys and list positions separated by dots — becomes the
  value at that path in text, inline and block code, link and image targets, image alternative text and
  directive attribute values (write the attribute quoted: `title="Run {{run.id}}"`). A string is placed
  as written, a number as JSON writes it, `true`/`false` as words. The value goes into the parsed page as
  text and is never read as Markdown, so data cannot add a directive, a link, emphasis or HTML. An unknown
  name fails with `DATA_PATH_UNKNOWN`, a missing key or position with `DATA_PATH_MISSING`, and a list,
  object or `null` with `DATA_VALUE_NOT_TEXT`; in code, a placeholder whose name is not data stays as
  written, so code can show the template syntax of other tools.
- `:::each{in="run.stages" as="stage"}` repeats its body once per item of the list at `in`, with
  `{{stage}}` or `{{stage.field}}` reading the item. A body that is one list repeats its items inside one
  list; a body that is one table keeps its header row and repeats the rows below it inside one table. An
  `each` may stand wherever its body could, for example between `cards` and its `card` directives or
  between a `series` and its `point` leaves. A path that is not a list fails with `DATA_NOT_A_LIST`, an
  item name already in use with `DATA_NAME_SHADOWED`; an empty list writes nothing.
- `::expect{data="run.stages" count="5"}` is a control value and renders nothing: `count` is the exact
  number of items of a list, `min` and `max` bound the number of items or a number's value (`min="1"`: not
  empty), `equals` compares a text, number or `true`/`false` value as written. The build fails with
  `DATA_EXPECTATION_FAILED` at the `expect` line when the data diverge.

There is no expression language: a derived value — a streak, «k of N», a sum — is written into the JSON
before the build, or produced by a provider extension. `each` and `expect` on a page without `data` fail
with `DATA_NOT_DECLARED`.

## Extensions

A page extends the vocabulary for its own design through extension manifests listed in `extensions`.
Every manifest has these fields; anything else is refused with `EXTENSION_INVALID` and the line of the
field:

| Field              | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `kind`             | `block`, `provider`, `effect` or `island`                                                     |
| `name`             | `^[a-z][a-z0-9-]{1,40}$`; not a built-in directive, not `island`, not another extension       |
| `description`      | one sentence                                                                                  |
| `staticEquivalent` | what the reader gets without motion, without scripts and in print                             |
| `examples`         | optional relative page sources that use the extension; two unlike ones are needed to check it |
| `licenses`         | optional relative licence files of bundled third-party code                                   |

Paths in a manifest are relative to the manifest and stay inside its directory (`EXTENSION_PATH_OUTSIDE`,
`EXTENSION_FILE_MISSING`). Fewer than two examples do not stop the build; it warns
`EXTENSION_EXAMPLES_MISSING`. `block` and `provider` declare `forms` (`leaf`, `container`) and
`attributes`, a map from a lowercase name to `{ type: string | number | boolean | enum, values,
required, default, description, maxLength, minimum, maximum }`; the author's directive is read against
them exactly as a built-in directive is against its attributes.

**`kind: block`** adds `template`, a `.md` file built from existing directives. `{{attribute}}` stands in
Markdown text or inside a quoted directive attribute value (`title="{{title}}"`); `{{content}}` stands
alone on a line of a container block and receives the author's body. The value is escaped for its place,
so no value can open a directive, close an attribute or add HTML. The expansion is checked, sanitized and
rendered like authored Markdown; a diagnostic inside it points at the author's directive and names
`details.template` and `details.templateLine`.

A block may add `styles`, a `.css` file of a few rules that give it a look the built-in blocks do not
have, such as a figure in large type. The rules are nested inside the block's own element — the top-level
elements of its expansion carry `data-extension-block="<name>"` — so `&` is that element and a nested
selector reaches only inside it. The styles take their look from the theme only, by the same rules as the
package stylesheet: no colour literal (hex, `rgb()`, named colours), no typeface name, `font-size` from the
`--text-*` scale or a `clamp()` in `rem` and `vw`, `font-weight` from `--weight-*`, `--heading-weight` or
`--display-weight`, radii from `--radius-*`, and no `font` shorthand. On top of that a block's styles read
only public theme tokens (`agentic-report schema --scope theme`) and the `--text-*`, `--weight-*` and
`--heading-fit` scales, declare no variables, keep their braces balanced (braces inside strings and comments
do not count; an unclosed string or comment is refused), select no sibling of the block (`~` or `+` after
`&`, or at the start of a nested rule, where `&` is implied), name no document root (`:root`, `html`,
`body`), use no at-rule but `@media` and `@container`, load nothing (`url()`, `image-set()`, `@import`) and
contain neither `\` nor `<`. A
violation is refused with `EXTENSION_STYLES_INVALID` and the line of the styles file; styles above 8 192
bytes with `EXTENSION_STYLES_OVER_BUDGET`. The styles reach only pages that use the block, and their bytes
count towards `output.maxInlineBytes` and appear as `bytes` in the build's extension report.

```yaml
kind: block
name: metric-card
description: One metric with its value and trend.
staticEquivalent: A bordered notice with the metric name and its value.
forms: [leaf, container]
attributes:
  title: { type: string, required: true }
  value: { type: string, required: true }
  trend: { type: enum, values: [up, down, flat], default: flat }
template: template.md
styles: block.css
examples: [example-one.md, example-two.md]
```

**`kind: provider`** adds `command`, an argv run without a shell in the extension directory, and
`timeoutMs` (default 10000, at most 120000). The build runs it once per distinct use with JSON
`{ name, attributes, content, language, data, source: { file, line } }` on standard input and reads
Markdown from standard output; that Markdown is checked and sanitized as authored. `data` holds the page's
data files (the `data` field) parsed, under the name each is addressed by in the text (`data/run.json` →
`data.run`), and is `{}` when the page declares none; this is how a provider reads data kept beside the
page. The build has already read those files inside the source root, so the provider receives no path and
nothing the page did not declare. A change of a data file changes the provider's input and reruns it. The program gets only `PATH`,
`HOME`, the temporary-directory, locale and Windows system variables of the environment. A timeout
(`EXTENSION_PROVIDER_TIMEOUT`), more than 1 MB of output (`EXTENSION_PROVIDER_OUTPUT_TOO_LARGE`), a
non-zero exit (`EXTENSION_PROVIDER_FAILED`, with `details.stderr`) or output that is not UTF-8
(`EXTENSION_PROVIDER_OUTPUT_INVALID`) fails the build at the author's directive.

**`kind: island`** adds `entry`, an `.html` file, and `assets`, the files it references. The author writes
`:::island{name="…" hydrate="load|idle|visible|none" height="28rem" title="…"}` with a required Markdown
body, the static equivalent shown in print, without scripts and until the island is ready. `hydrate`
defaults to `visible`; without `height` the frame follows the height the island reports. The island runs
in `<iframe sandbox="allow-scripts">` built from the entry with every asset inlined and its own policy
`default-src 'none'`: no network, no access to the page. A reference that is not a declared asset or an
inline event handler is refused. The island talks to the page through `window.agenticReportIsland.on(type,
callback)`: it receives `init { tokens, scheme, language, reducedMotion }`, `theme { tokens, scheme }`,
`renderAt { t }` and `resize { width, height }`; the theme tokens are also set as CSS custom properties on
its root, and its height is reported automatically.

**`kind: effect`** adds `module` (an ES module using `defineEffect` from `agentic-report/effect`),
`targets` (`{ directive, attribute, values }`: a built-in directive gets the attribute with those values,
only on pages that declare the effect), `attributes`, `budgetBytes` (default 80000) and `ownsScroll`
(default `false`). The value reaches the element as `data-effect-<name>-<attribute>`; the effect's
bundled script ships only on pages where an element carries it. The effect runtime contract and
`effect-check` are described in [the architecture](../ARCHITECTURE.md#extensions).

`build` reports `extensions` with each extension's `kind`, `uses`, `bytes` and `notes`; `inspect` lists
them with their manifests.

## Semantic primitives

The directive vocabulary is:

- `section`: top-level labelled page region with required `title`, optional stable `id` and short `nav`
  label, closed reading-track, composition, viewport, density, typography, media, focal-point, surface, tone,
  transition, scene, interaction, and choreography choices, plus optional legacy boolean `reveal`;
  `frame="browser"` puts the section's first picture in a browser window whose bar shows the page's real
  `address` (an absolute HTTP(S) URL) or, with `illustration="true"`, the label Illustration — one of the two
  is required, neither is accepted without the frame, and the section must have a direct image or video;
  `transition="log"` prints each code block of the section line by line when it comes into view;
- `contents`: top-level leaf placement for a compiler-generated in-flow map of final primary sections; it
  accepts no label or children; `sticky="true"` on `layout: landing` holds the numbered chapters at the start
  edge of a wide screen and marks the current one; on another layout the list stays in the flow and the
  build warns with `STICKY_CONTENTS_OUTSIDE_LANDING`;
- `lead`: attribute-free direct section child containing exactly one opening Markdown paragraph;
- `eyebrow`: leaf with a short label set in small capitals in the theme's second accent above the title
  that follows it; written first in a section, it is placed above the section title;
- `muted` and `meta` (text): the label in the muted text colour — the quiet continuation after a bright
  first sentence — or in the mono face for identifiers and readings; neither changes the words;
- `actions` and directly nested leaf `action`: responsive ordinary link group with a closed placement role;
  every action requires a visible label and safe `href`, may select `primary`, `secondary`, or `quiet`
  emphasis, and a primary action may opt into the bounded `magnetic` pointer effect;
- `source-link`: inline source-location link with a short visible label and a bounded IPv4-loopback editor
  helper URL containing an absolute path and positive line;
- `callout`: emphasized finding with optional `title` and lowercase `kind`; `success`, `warning`, and
  `danger` (alias `error`) get their own signal colour, and any other token keeps the accent;
- `source-line`: leaf written directly after the block it describes — a table, chart, cards, image, video,
  code — whose label says which data or footage it is; optional `date` (`YYYY-MM-DD`, or
  `YYYY-MM-DDTHH:MM` with `zone`) is written in the page language. It renders «Source: label · date»; one
  with nothing before it fails with `SOURCE_LINE_WITHOUT_BLOCK`;
- `plural` (text): a plain decimal number as the label and `forms` — two noun forms `one|other` on an
  English page, three `one|few|many` on a Russian one (another language tag takes the English rules) —
  written as the number in the page language, a no-break space and the form `Intl.PluralRules` selects;
- `time` (text): a date or a moment as the label, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]` with an optional
  `Z` or `±HH:MM` offset; a time needs `zone` (an IANA name), in which a time without an offset is read and
  every time is shown with its zone name. `show` is `auto` (the date, and the time when one is written),
  `date`, `time` or `datetime`. It renders a `<time datetime>` element with the final text;
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
- `conversation` and `message`: a mock of a notification or a dialog. `message` requires `from` and takes
  `time`, `side` (`in` at the start edge, `out` at the end edge), `status` and `illustrative`; its body is
  Markdown. `conversation` holds only `message` directives in order, with optional `title` and
  `illustrative`; `illustrative="true"` puts a visible «Illustrative» mark on the mock, whose names, times
  and numbers are then examples rather than a record;
- `each` and `expect`: the data directives, consumed when the page builds (see «Page data»);
- `steps`: styled process container whose authored Markdown supplies the ordered or explanatory content;
- `glossary`: reusable definition with required stable `key`, canonical `term` text, optional declared
  `forms`, and optional `placement="inline|appendix"`;
- `term`: inline or standalone reference to a glossary `key`; an inline authored label remains the visible
  grammatical form while the detached form uses canonical text; both open a contextual explanation on hover,
  focus, or tap and link to the canonical full definition;
- `disclosure`: native details block with required `title` and optional initial `open` state;
- `tabs` and directly nested `tab`: keyboard-operable panels; each `tab` requires a visible `label`;
  `orientation="vertical"` sets the tab list in a column beside the panels on a wide screen (arrow keys up
  and down move along it) and above them on a narrow one;
- `modal`: modal dialog with required `title` and optional trigger label;
- `popover`: dismissible non-modal contextual panel with required `title` and optional trigger label;
- `filter`: text filtering for directly authored list items with optional `title` and `placeholder`;
- `toggle`: switch-controlled content with required `label`, optional `title`, and `default` state;
- `chart`, nested `series`, and nested leaf `point`: compile-time `bar`, `line`, or `pie` SVG from bounded
  labelled numeric values; `count-up="true"` grows the marks from zero when the chart comes into view;
- `diagram` with leaf `group`, `node`, `edge`, `legend`, and `legend-item` children and at most one `zoom`
  container: compile-time layered flow or ordered sequence SVG with validated identities and references, a
  legend, and the diagram in words;
- `process` (text): a mini process in a line or a card — steps separated by `>` in the label, optional
  `current` and `returns`;
- `timeline` and directly nested `event`: semantic ordered chronology; each event may contain Markdown;
- `demo`: safe built-in counter with optional `title`, `start`, and `step`; with `play="time"` or
  `play="scroll"` a playable scene instead: the content before its first `beat` is the stage, and its 2–8
  direct `beat` containers are played in order by the page clock (`seconds` per beat, 1–10, default 3,
  `play="time"` only) or by the scroll while the scene is pinned; `start` and `step` are refused on a scene,
  and a beat's `focus` names nodes or connections of a diagram on the stage. It never evaluates author code;
- `swap` (text): a plain written word and `words` — one to three other words, comma separated, each at most
  40 characters and all different — that replace it in turn and return to it;
- `typing` (text): a plain line of at most 80 characters typed in place when it comes into view;
- `mark` (text): words marked by a hand-drawn `shape` (`underline`, `circle`, `strike`) whose jitter comes
  from `seed` (0–9999, by default from the words); a section holds at most two marks;
- `spotlight`: one Markdown image first and its explanation after it, with required `x` and `y` (per cent of
  the picture, 0–100), `zoom` (1.5–4, default 2) and optional `title`: a loupe over that point, the rest
  dimmed, the explanation beside;
- `asset`: downloadable local resource with required `src`;
- `video`: embedded local `.webm`, `.mp4`, `.m4v`, or `.ogv` recording with required `src`, optional image
  `poster`, and optional `caption`; a Markdown image whose file is one of those video types becomes the same
  player without a caption;
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
[`examples/document`](../../examples/document/report.md), [`examples/research`](../../examples/research/report.md),
[`examples/architecture`](../../examples/architecture/report.md), [`examples/tutorial`](../../examples/tutorial/report.md),
[`examples/dashboard`](../../examples/dashboard/report.md), [`examples/landing`](../../examples/landing/report.md), and
[`examples/interactive-catalog`](../../examples/interactive-catalog/report.md) sources. The complete data example is
[`examples/visualization-catalog`](../../examples/visualization-catalog/report.md); the complete response
example is [`examples/response-workspace`](../../examples/response-workspace/report.md).

A `section` must be a direct child of the Markdown document, not a blockquote, list item, or another
directive. It always renders a real labelled `<section>` and visible H2. `id` is a lowercase identity that
starts with a letter and contains only letters, digits, and hyphens; duplicate explicit IDs fail. If `id`
is omitted, the compiler derives a deterministic collision-free identity from `title`. `nav` is optional
short navigation text. The complete visual grammar is closed and package-owned:

| Attribute         | Values                                                                                             | Default     |
| ----------------- | -------------------------------------------------------------------------------------------------- | ----------- |
| `recipe`          | `none`, `hero`, `evidence`, `story`, `rail`, `metrics`, `thesis`, `statement`, `blueprint`, `demo` | `none`      |
| `place`           | `flow`, `opening`                                                                                  | `flow`      |
| `width`           | `reading`, `standard`, `wide`                                                                      | `standard`  |
| `align`           | `start`, `center`                                                                                  | `start`     |
| `tone`            | `plain`, `soft`, `accent`, `contrast`                                                              | `plain`     |
| `composition`     | `flow`, `stage`, `split`, `mosaic`, `story`, `stack`                                               | `flow`      |
| `viewport`        | `adaptive`, `full`, `bounded`                                                                      | `adaptive`  |
| `section-density` | `compact`, `editorial`, `immersive`                                                                | `editorial` |
| `type`            | `body`, `display`, `editorial`                                                                     | `body`      |
| `media`           | `natural`, `mask`, `layers`, `gallery`, `bleed`                                                    | `natural`   |
| `media-fit`       | `natural`, `contain`, `cover`                                                                      | `natural`   |
| `media-aspect`    | `natural`, `landscape`, `cinematic`, `portrait`, `square`                                          | `natural`   |
| `focal`           | `center`, `top`, `right`, `bottom`, `left`                                                         | `center`    |
| `surface`         | `plain`, `tint`, `grain`, `grid`, `blueprint`                                                      | `plain`     |
| `frame`           | `none`, `panel`                                                                                    | `none`      |
| `transition`      | `none`, `reveal`, `stagger`, `lines`, `log`, `clip`, `staged`                                      | `none`      |
| `scene`           | `none`, `progress`, `sticky`, `steps`, `scrub`                                                     | `none`      |
| `state`           | page state name, `^[a-z][a-z0-9-]{0,40}$`                                                          | —           |
| `interaction`     | `none`, `depth`, `tilt`                                                                            | `none`      |
| `choreography`    | `none`, `cascade`                                                                                  | `none`      |
| `reveal`          | boolean                                                                                            | `false`     |

These attributes compose independently except where two roles would own the same layout or transform.
`composition="mosaic|stack"` cannot combine with `media="layers|gallery"`; `media="layers"` and
`scene="progress"` cannot combine with `interaction="depth|tilt"`; and `composition="story|stack"` cannot
combine with `scene="sticky"`. A non-primary action cannot use `effect="magnetic"`. The registry publishes
these incompatibilities through discovery and JSON Schema, and authored Markdown fails before rendering.
`composition` selects a semantic arrangement; `viewport` and
`section-density` set bounded rhythm; `type` selects a package typography role; `media` chooses a treatment;
and `media-fit`, `media-aspect`, and `focal` control image framing without duplicating that treatment.
`tone` owns the section background and foreground relationship; `surface` adds package decoration behind
that content without replacing the tone background. Nested package components and visualizations restore
their own readable surface text tokens. Transition, scene, interaction, and choreography are closed semantic
roles rather than author-supplied timing or coordinates. `layers` transforms image descendants rather than
cards or other semantic containers, preserving stable review geometry. Narrow screens return multi-column
and overlapping arrangements to authored order, and gallery overflow stays local to its rail. After titles
and Markdown are rendered, every direct cards rail containing at least two direct element items uses the
same container-relative tracks and leaves part of its next item visible on compact widths. It exposes a
localized focusable scroll group only while those tracks actually overflow. With that rail itself focused,
`ArrowLeft` and `ArrowRight` move through its direct-item snap targets; when a wider owner fits every track,
the scroll-only focus stop and label disappear. Repeated rails, a cards title, sibling Markdown and multiple
cards retain the same rule; a true one-item rail stays ordinary without a false label.
Every section
contains its floats and local layer order. Split and stage arrange only the section's opening: the run of
blocks right after the title that reads well in half the track, with at most one picture. For split that run
may hold the lead, paragraphs, lists, quotes, callouts, decisions, glossary entries, copyable prose, assets,
modal and popover triggers, and actions, and it sits beside the title. For stage it may hold the lead,
paragraphs, and actions, and it sits beside its opening picture under a full-width title; a gallery stage
keeps its title beside the rail. A stage whose opening has no picture, or no text beside it, stays in one
column. Every block after the opening, including code, tables, cards, visualizations, and further
pictures, spans the whole section track, so all sections share one start edge and one track width.
`align="center"` centers only a full-width title and lead and the section's actions; the body
keeps the start edge. Split returns to normal flow before a desktop sidebar can leave unreadably narrow
tracks. Authors cannot supply CSS values, class names, event handlers, or executable layout code.

Recipes provide the short path. Their coordinated detailed values resolve first, and any explicit detailed
attribute overrides only its own role before the same incompatibility checks run. `hero` stages an opening,
`evidence` creates a split proof field, `story` creates a scroll narrative, `rail` creates a local media rail,
and `metrics` creates a compact data mosaic. A card may declare one safe `href`; it then renders as one
focusable anchor with a persistent link icon, while nested Markdown links fail validation.

`thesis` sets one claim in display type at reading width, `statement` gives one quote or one figure a full
screen, `blueprint` draws a drafting grid behind a hairline panel with text beside the drawing, and `demo`
places the first section beside the page title as the first screen (`place="opening"`, valid only on the
first section of a page that starts with a `#` title). `compare` shows exactly two images, before and after,
with a divider the reader moves by pointer or arrow keys.

Recipe motion is part of those defaults, and no recipe gives every child the same entrance: hero shows at
once and eases its media with a progress scene; story supplies reveal and a progress scene; thesis and
statement use one section reveal; evidence, rail, metrics, blueprint, and demo stay still. Only metrics
(`grid`) and blueprint (`blueprint`) bring a decorative surface. Explicit `scene="none"` allows `interaction="depth"` or `interaction="tilt"` on a hero without
conflicting transform owners. The [Motion showcase](../../examples/motion-showcase/report.md) and
[Executive brief](../../examples/executive-brief/report.md) are complete bilingual recipe compositions.

Directed motion adds these roles. `scene="steps"` pins a section's first images, video, diagram or code
block beside 2–8 `beat` containers on a wide screen with normal motion and switches the picture — the nth
beat shows the nth image — or lights the diagram nodes and connections named by the beat's `focus` (node ids
and edge `id`s in one comma-separated list) and the connections between lit nodes; focus ids must exist in
that section's diagram. A beat's `lines` (`3`, `2-4`, `1,5-7`) lights those lines of the scene's code block
and dims the rest; `lines` in a scene without a code block is refused. The pinned part of a steps scene
never runs longer than four screens: with many beats each beat is shorter. On a screen narrower than 57rem
with normal motion the stage stays under the top bar above the current beat (`data-scene-narrow`), so the
media stands before every step. `scene="scrub"` pins the media and the captions together for one screen per
beat, two to four beats (a fifth is refused): the caption changes when a third of its step's scroll has
passed and sits in one cell of constant height, the picture and the diagram focus belong to the reached
step and stay lit for the later ones, a segment bar and «Step n of N» stand under the caption, and the last
step holds every segment. Everything is shown by opacity, so scrolling back restores the picture; the
caption follows the scroll over 0.6 s, and `data-clock-progress` (0–1) on the section sets it exactly. On a
wide screen the stage stands beside the caption, on a phone above it. `transition="clip"` opens a chapter
from its lower edge with `clip-path: inset()` over the scene duration, without translation.
`transition="staged"`, valid only on the first section with `place="opening"`, brings the first screen in
reading order: the page title line by line, then the eyebrow, the subtitle, the actions and the scene, each
starting when the previous one has travelled 60 % of its way; when it ends, dependent geometry is rebuilt.
`recipe="thesis"` fills its lead paragraph with the heading colour from the top down while the reader passes
it and empties it again on the way back; without motion and in print the thesis is filled.
`transition="lines"` opens the section title one line at a
time through a mask, measured after fonts load and again on width and language changes, so the title text
and review targets are unchanged. `draw="scroll"` on a diagram draws its connections in flow order,
backward connections last; solid kinds draw, dashed kinds fade in, and a marker rides the connection being
drawn. A browser with scroll-driven timelines draws through CSS; one without them (Firefox, Safari) and a
recording that sets `data-clock-progress` (0–1, the drawn share) on the figure draw through the page runtime
on the page clock. Without motion the diagram is complete and the marker stands at the end of the last
connection. `pulse="a,b,c"` on a flow names a route of nodes joined in that order by connections: a pulse
travels it three times when the diagram comes into view, and the route is marked in the accent colour, its
still and printed form. A `zoom` pins the diagram and moves the camera — the SVG `viewBox` — into its node
by the progress through a three-screen scene (or `data-clock-progress` on the figure); nested labels fade in
as they reach a readable size. Without motion and in print the diagram and the inside stand as two figures
side by side. `chart{count-up}` grows bars, lines and slices from zero and counts slice percentages up over
0.9 s of the page clock once the chart is half visible; without motion the final values stand.
`:count[value]` counts up to its written value, which stays in the HTML. Themes set the curve and pace of
all motion through `motion.easing`
(`standard`, `gentle`, `decisive`) and `motion.pace` (`brisk`, `calm`, `slow`).

The vocabulary techniques run on the same page clock and have the same still end state. A timed `demo`
starts when half of it is on screen, plays each beat for its `seconds` times the theme pace, pauses when it
leaves the screen or when the reader presses its button, stops on its last beat with a button to play again,
and starts from its beginning when the closed tab that holds it opens again; a scroll `demo` is pinned on a
screen at least 57rem wide while the reader passes about half a screen per beat, and a recording sets its
progress with `data-clock-progress`. `:swap` holds each word 1.2 s and returns to the written one;
`:typing` types at most 45 ms per character and within 1.5 s, and a line that wraps stays whole; `:mark`
draws its line and `spotlight` moves in when they come into view; a `transition="log"` code block prints
within 2.4 s. Every one of them keeps its whole text in the page and its width and height from the first
frame. Under reduced motion, with `motion: none`, and in print a scene shows every beat, a swap its written
word, a typed line and a log their whole text, a mark its complete line, and a spotlight its loupe in place.

```markdown
::::section{title="A visual argument" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="tint" transition="stagger" scene="progress" choreography="cascade"}
The content remains ordinary Markdown and semantic directives.
::::
```

Documents without explicit sections use legacy H2 headings for primary navigation. H3 and component anchors
remain owned descendant targets but are not primary links. The packaged bilingual `layout-mixed` example
exercises every visual family through this same source contract and is discoverable through
`agentic-report examples --json`.

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
same-page `#anchor`, a relative target, HTTP(S), `mailto:`, `tel:` with a phone number, or `sms:` with a
number and an optional `?body=`. Executable schemes such as `javascript:` and
`data:`, `file:` URLs, absolute local paths, protocol-relative URLs, callbacks, forms, and scripts are not
part of the contract. `actions.placement` is `auto`, `edge`, `inline`, or `bottom`; `auto` resolves to an
edge-aligned group on desktop and a compact bottom group at its authored position on mobile. `bottom` remains
in normal document flow—it is not sticky, fixed, or allowed to cover later content. `action.effect` is
`none` or `magnetic`; the latter is valid only on a primary action and moves by at most 9 pixels for a fine
pointer in the normal-motion profile. Output remains an ordinary keyboard-operable anchor with package-owned
styling and a 16-pixel package icon.

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
accepts 1–20 unique nodes, up to 40 edges, and up to 5 groups; every declared group needs a member, a node's
`group` must name a declared group, and a node without `group` stands outside every group. Every flow is
compiled into three views and shows a package tab list above the diagram to switch between them: `down`,
`right`, and `orthogonal`. `layout` is `auto|down|right|orthogonal` (default `auto`, which picks the view with
the fewest crossings that fits the page best) and names the view shown first and the only one printed.
`direction` is `auto|right|down` and is the older spelling
of the same choice; a flow that sets both `layout` and `direction` fails, and a `sequence` rejects `layout`. A `sequence` accepts 2–6 node participants and 1–40
labelled edge messages in authored order; group records, group membership and direction fail. Every edge or
message references declared node IDs. An edge whose `from` equals `to` is a step that repeats: in a flow a
loop on the node's top-right corner with its label beside it, in a sequence a labelled loop on the lifeline.
`node.status` is `done|review|returned|pending`: the node takes the theme's status role (`statusDone`,
`statusReview`, `statusReturned`; pending is a dashed frame) and a glyph on its frame, and the legend lists
each status present in package words unless `auto="false"`. `edge.count` (1–999) writes «×N» after the
connection label. `edge.id` is optional, unique among edges and different from every node id; a beat focus
lights the connection by it. A `zoom{node title}` inside a flow opens the named node into a nested flow of
its own `group`, `node` and `edge` leaves under the flow rules; a diagram holds at most one zoom, a zoom
cannot be combined with `draw="scroll"`, and the zoomed diagram shows its default view without the view
switcher. `pulse` accepts 2–12 declared nodes of a flow, each joined to the next by a connection in that
direction.
`edge.kind` is `call|data|event|dependency` (default `call`); each kind has a package-drawn line and
arrowhead. `node.detail` adds a smaller second line under the label. A diagram accepts at most one
`legend{title auto}` and up to eight `legend-item` leaves. An item names exactly one `edge` kind, one `node`
emphasis or one node `status`; a node item requires `label`, a status item renames the package word, and `hidden="true"` is accepted only on an edge item without a label.
A duplicate item fails. The legend lists authored items in order, then the connection kinds the diagram mixes
(two or more) that no item names, unless `auto="false"`.
A flow is laid out by layers along the flow. Connections returning along an already started path are drawn
backward; nodes inside a layer are ordered to reduce crossings; groups become clusters; every labelled
connection gets its label in the middle of its own path, clear of nodes and other labels; ends of connections
meeting one node side are spread along it. Labels wrap by words and are never cut. `row="1..20"` asks for a
flow layer: nodes sharing a row share a layer when their connections allow it. `edge` accepts
`route="auto|direct|around"` as a layout pull: `direct` keeps the connection short and straight, `around`
lets it stretch. `diagram` accepts `spacing="compact|comfortable|spacious"` (default `comfortable`). Dense
arbitrary graph optimization remains outside the bounded flow contract.
A timeline accepts 1–20 direct events. Visual data containers reject prose as a direct child, while an
event body accepts ordinary Markdown.

The compiler emits responsive deterministic SVG for charts and diagrams and semantic HTML for timelines.
Titles and descriptions are visible and label each atomic SVG image. The SVG accessible description also
contains every complete series/point value, or for a diagram a text: node and layer count, groups with
members, layers in flow order, connections along the flow and backward connections separately in the
legend's words, or sequence participants and ordered messages, including text shortened only in the visible
plot. A diagram repeats that text under the picture in a closed «diagram in words» disclosure. Values retain up to the supported four decimal places in observable text. Colors come
from package-owned theme variables. Layout happens at build time; the page runtime only moves what is
already drawn — the drawing fallback, the draw marker, pulses, the zoom camera and chart growth — on the page
clock. There is no canvas, network request, author CSS, executable graph DSL, or separate behavior between
`single-file` and `directory`.

`:process[Plan > Build > Review > Ship]{current="Review" returns="Review>Build×2"}` draws 2–12 unique steps
as dots in order: steps before `current` are done, `current` is in review, the rest not started; without
`current` every step is done. `returns` lists `step>earlier step×N` separated by commas (N 1–999, default
1; a step returning to itself repeats), drawn as arcs over the dots with «×N». An unknown step, a return
forward or a count out of range fails. The steps and returns are said in words for assistive technology;
the drawing is the same still and in print.

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

`::video{src="path" poster="frame.png" caption="…"}` compiles to a `<figure>` with a `<video>` that has
controls, is muted, loops, plays inline, and names itself by the caption, followed by the caption as
`<figcaption>`. `![Alt text](recording.webm)` compiles to the same `<video>` in place of the image, named by
its alt text. The video and poster are embedded as `data:` URLs in `single-file` output and written as
content-addressed files under `assets/` in `directory` output; the Content Security Policy allows media from
exactly those places. Embedded video counts toward `output.maxInlineBytes` like any other resource. The
package runtime starts a video while at least half of it is on screen and pauses it when it leaves, unless the
reader prefers reduced motion, in which case the reader starts it with the player controls; a reader's own
pause is kept. A `src` of another type or a `poster` that is not a PNG, JPEG, WebP, GIF, or AVIF image fails
with `INVALID_VIDEO_SOURCE`.

A looping clip or background takes `start` — the second (0–3600, two decimals) where it starts and every
loop returns — and `seam="fade"`, which dims the last half-second of the loop and brightens its first; the
package runtime runs such a loop itself. `expand="true"` on a clip adds an Expand button that opens the clip
large in a dialog with the full controls and sound, from the same second. A manual video refuses `start` and
`seam`, and only a clip takes `expand`.

`mode="background"` removes the controls, adds a package pause button, and requires a `poster`
(`VIDEO_POSTER_REQUIRED`); `mode="manual"` keeps the controls and the sound and never starts by itself.
`sources="a.av1.mp4, b.vp9.webm"` adds encodings of the same clip: directory output writes a `<source>` for
each, in authored order and before `src`, with a `type` whose codec is read from the file (AV1, H.264, HEVC,
VP9, VP8); single-file output embeds only the most compatible one (H.264, then VP9, VP8, AV1) and warns with
`VIDEO_SOURCES_SINGLE_FILE`. `chapters="film.chapters.vtt"` adds a `kind="chapters"` track, embedded as data
in both formats because a sibling file on `file://` is a foreign origin, and renders one button per cue that
seeks to its start; a file that is not WebVTT with a titled cue per chapter fails with
`INVALID_VIDEO_CHAPTERS`.

## Interactive reader contract

All state is local to the generated component instance. Browser behavior is package-owned, works through
`file://` in both output formats, and never evaluates author content.

Package controls supply their icons and geometry from one interface system: every button, field, tab,
disclosure, switch, and choice has one size and form per kind on the whole page, and under a finger every
control grows to 44 px. Modal/popover triggers, toggle labels, and close buttons keep their visible labels
beside their icons at every width.
Action groups wrap without forcing short labels to fill the container. Components and visualizations use
paired local surface/text roles under every section tone; authored node and event kinds retain their visible
signals. These presentation defaults require no additional source attributes.

Response Workspace uses a closed version-1 manifest and export. Every exported question includes its stable
id, kind, explicit `answered` boolean, and kind-specific value; authored defaults may be visible while
`answered` remains false. Non-empty item comments are exported in a separate sorted array. Clipboard and
file actions serialize identical canonical JSON without clocks or random values. Import is bounded and
validates the complete schema, domains, form identity, and form revision before replacing current state; a
foreign, stale, unsupported, or malformed file leaves existing answers unchanged. No state is written to
cookies, Web Storage, IndexedDB, a service, or a form submission. The exact Response Workspace bounds are
20 forms per document, 50 questions and 250 items per form, 20 options per question, two to five buckets per
bucket question, 4,000 characters per text or comment value, and 2,000,000 bytes per imported response file.

| Primitive           | Initial state and semantic HTML                                                                                                                                                                                                                                                                                                                                                                                                                             | Keyboard behavior                                                                                                                                                                                                          | Pointer/touch behavior and limits                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `glossary` + `term` | The inline or appendix definition is a visible labelled section with a stable `glossary-<key>` ID. Each prose/code term is a button controlling a closed labelled contextual `dialog`; prose may show an authored form while the dialog title stays canonical. Every open term panel is portalled to `body`, anchored next to its trigger, flipped/clamped within the visual viewport, and restored on close so a section or local scroller cannot clip it. | Focusing the term opens the explanation. `Escape` closes it and restores focus. The panel link navigates to the full definition.                                                                                           | Hover or click/tap opens the explanation; leaving/clicking outside closes it. The panel link is the explicit route to the full Markdown definition.                                                    |
| `disclosure`        | Native `details`/`summary`; closed unless `open="true"`.                                                                                                                                                                                                                                                                                                                                                                                                    | Native summary activation with `Enter` or `Space`.                                                                                                                                                                         | Click/tap the summary to toggle.                                                                                                                                                                       |
| `tabs` + `tab`      | `tablist`, `tab`, and `tabpanel` roles; the first direct `tab` is selected and other panels are hidden. Each panel requires `label`; non-`tab` directive children are rejected.                                                                                                                                                                                                                                                                             | `ArrowLeft`/`ArrowRight` select and focus adjacent tabs with wraparound; `Home`/`End` select the first/last tab.                                                                                                           | Click/tap a tab to select its panel. State does not cross into another tabs instance.                                                                                                                  |
| `modal`             | Trigger button plus closed native `dialog` labelled by required `title`.                                                                                                                                                                                                                                                                                                                                                                                    | Activating the trigger opens the modal; native `Escape` closes it and restores focus to the opener. The Close button does the same.                                                                                        | Click/tap the trigger and Close button. Backdrop-click dismissal is not part of the contract.                                                                                                          |
| `popover`           | Trigger button controls a closed non-modal labelled `dialog`. While open, the panel is portalled to `body`, anchored beside its trigger, flipped/clamped within the visual viewport, and restored to its source position on close so section clipping and local scrolling cannot hide it.                                                                                                                                                                   | `Enter`/`Space` toggles the trigger. `Escape` closes an open panel and restores trigger focus.                                                                                                                             | Click/tap toggles; clicking outside closes without moving focus. Scrolling or a visual-viewport resize repositions the open panel.                                                                     |
| `filter`            | Labelled search input plus polite live result count; the empty query shows every item.                                                                                                                                                                                                                                                                                                                                                                      | Normal search-input editing.                                                                                                                                                                                               | Input filters case-insensitively while typing. Only `li` elements in a direct authored `ul` or `ol` are filter targets; nested lists are not independent targets.                                      |
| `toggle`            | Button with `role="switch"` and a controlled panel; `default="off"` hides content, `on` shows it.                                                                                                                                                                                                                                                                                                                                                           | Native button `Enter`/`Space` toggles `aria-checked` and panel visibility.                                                                                                                                                 | Click/tap toggles the same state. Instances are isolated.                                                                                                                                              |
| `demo`              | Bounded numeric output starts at `start` (default `0`).                                                                                                                                                                                                                                                                                                                                                                                                     | Native Increment button activation adds `step` (default `1`).                                                                                                                                                              | Click/tap performs the same package-owned increment; no author script is accepted.                                                                                                                     |
| `copyable`          | Ordinary paragraphs, emphasis, links and wrapping remain visible body prose. One package button copies rendered visible text only; its own label and hidden helper/panel content are outside the content owner.                                                                                                                                                                                                                                             | Native Copy button activation supports focus, `Enter`, and `Space`; success/failure text follows document locale.                                                                                                          | Click/tap performs the same clipboard action. Clipboard failure changes only the button label and leaves prose unchanged.                                                                              |
| Review Workspace    | With `review: true`, annotation is available without block controls or a mode. **Create note** opens the exact selection in an anchored full-thread popover; desktop flips/shifts/clamps it and mobile uses a bounded visual-viewport bottom surface. Saved open/resolved ranges stay visibly distinct. `Review` opens only an overlay list/import/export surface and never reflows the report. Legacy whole-block threads remain list-only.                | `Shift` release focuses **Create note**. Each highlight has a focusable overlay marker; the popover textarea, edit, resolve/reopen, close, and list/import/export controls use native keyboard behavior and restore focus. | Pointer/touch selection exposes **Create note**; hover/tap on a saved range exposes **View thread**. Window and visual-viewport changes keep active controls on screen. Invalid ranges create nothing. |
| `response`          | Native fieldsets, legends, radio buttons, checkboxes, selects, number inputs, textareas, ordered lists, safe original anchors, status output, import control, and copy/file export. Each form owns isolated current-tab state.                                                                                                                                                                                                                              | Native fields cover every value. Bucket selects are the complete fallback to drag-and-drop; explicit Move up/down buttons reorder items. Copy, download, import, and original links use native controls.                   | Bucket cards may additionally be dragged between named columns. Pointer changes use the same state as keyboard controls; original links do not mutate answers.                                         |

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

`progress: page` installs one decorative transform-based progress line only in normal motion;
`progress: chapters` installs the chapter segments in every motion profile, without transitions, and
`progress: nodes` the same chapters as a row of nodes marked `data-passed` and `data-current`.

`layout: screens` makes every top-level section a screen as tall as the window under the top bar, and the
content before the first section the first screen. One gesture moves exactly one screen: touch and the
scroll bar through `scroll-snap-type: y mandatory` with `scroll-snap-stop: always`, a wheel or trackpad
gesture (events without a 180 ms pause) through the runtime, and `ArrowUp`/`ArrowDown`, `PageUp`/`PageDown`,
Space and `Home`/`End` through the runtime. A screen taller than the window scrolls inside its place until
its edge shows. A screen switcher at the end edge links every screen (`aria-current="step"` on the current
one), the address follows the current screen, and an address hash opens its screen. `window.agenticScreens`
offers `count`, `current()`, `goto(n)`, `next()`, `previous()` and `check()`, which measures every screen
against the window (`fits: false` names a screen cut at the fold). Under reduced motion and `motion: none`
the page scrolls as a document and the switcher stays; in print the screens are ordinary chapters.
`snapshot` photographs every stop — each screen, and each step of a live `scene="scrub"` — as
`<shot>-screen-<n>.png` and `<shot>-scene-<id>-<n>.png`, lists them under `stops` with `fits`, and warns
`SNAPSHOT_STOP_CUT` for a stop that does not fit the window.

Page states are flags on the root, `data-state-<name>`. A section with `state` sets its state while its top
is above the middle of the window (or its `data-clock-progress` is at least 0.5) and clears it when the
reader scrolls back above it; a beat with `state` sets it while current in a steps scene and from the
moment it is reached in a scrub scene; an extension effect sets one with
`ctx.state.set(name, value, document.documentElement)` and follows one with `ctx.state.watch(name, callback)`.
A `card` or `:count` with `when` answers to the state: the card is dimmed until the state is set, the count
starts counting when it is set instead of when it comes into view. The states are recomputed on every page
clock seek. Without motion, with `motion: none` and in print every `when` block is lit.

Motion that runs longer than five seconds on its own — a live effect that declares `endless: true` — gets a
**Pause motion** button in the flow of the page, as the last block of the chapter it runs in or right after
the block it runs on, never over text. The button carries `aria-pressed`, pauses through the page's shared
pause controller (`data-motion-paused` on the root), and its state is remembered in `localStorage`. Under
reduced motion effects draw their still state, so there is nothing to pause and no button. On a device without hover, a linked card, a step or a timeline row at the middle of the
visible window gets `data-current` and the look it has under the pointer. A tab switch — also the switch of
a diagram's view — runs a View Transition when the browser has one: a diagram node keeps its identity across
views and a list row matches a diagram node with the same text, so both move to their new place; without
View Transitions, under reduced motion and with `motion: none` the tab changes at once.
`scene="progress"` moves its media on the browser's scroll timeline (`animation-timeline: view()`); a
browser without it and a recording that sets `data-clock-progress` use the runtime and the page clock.
Durations come from roles written next to the three easing curves: text 700 ms with 70 ms per line and a
rise of 108 %, scene 1200 ms, a quicker 240 ms way back. Everything that measures text rebuilds its geometry
through one helper: on a width change (not a height-only change), after fonts load, after the first screen
and chapter entrances end, and on return to the tab, at most six times a clock second, keeping what the
reader sees in place.

`layout: slides` makes a presentation: every top-level section is a slide, the content before the first
section is the title slide, `appear` blocks are the steps of their slide, `notes` are speaker notes, and a
section's `slide-transition` (`fade`, `push`, `wipe`, `zoom`, `none`) names its transition. The runtime
turns slides by keyboard, click, swipe and buttons, addresses them as `#/<slide>/<step>`, exposes
`window.agenticSlides` (`goto`, `next`, `previous`, `state`, `durationOf`, `settled`), publishes the fixed
duration of the running transition as `data-slide-duration`, and marks its end with
`data-slide-state="settled"` and the `agentic-slides:settled` event. `?view=film` hides the shell and
`?view=presenter` shows the notes. Print, reduced motion, and a page without the runtime show every step.
`transition="reveal"` and legacy `reveal="true"` reveal section contents once using opacity and at most 24
pixels of translation over 420 milliseconds while the section anchor remains stable. Activation follows
viewport intersection rather than a fraction of section height, so long sections remain readable when
reached. `transition="stagger"` applies the same entrance to at most 12 direct children with 90-millisecond
steps. `scene="progress"` drives bounded media movement from normalized visible
scroll progress; `scene="sticky"` keeps the direct image-bearing paragraph sticky on desktop and restores
normal flow at 48rem and below. `choreography="cascade"` reveals at most 12 semantic cards, chart points, or
timeline items in source order with 75-millisecond steps. `interaction="depth|tilt"` applies at most 24 pixels
of depth or 4.5 degrees of tilt to media for a fine pointer. Primary magnetic movement is bounded to 9
pixels. Pointer updates are visibility-bound and
coalesced to one animation frame. Under `prefers-reduced-motion: reduce`, progress, entrance, scene,
choreography, and pointer machinery leave no hidden or transformed pending state; coarse pointers receive no
depth, tilt, or magnetic behavior. Without a callable `IntersectionObserver`, observer-dependent enhancement
remains inert, content stays immediately visible, navigation uses bounded geometry, and later runtime
controllers still initialize.
These behaviors are identical in both output formats through `file://`.

## Output behavior

`single-file` is the default. CSS and the package runtime are embedded inline; images, downloads,
and fonts become MIME-qualified data URLs whose binary payloads use base64. `directory` writes
`index.html` and hash-suffixed files under `assets/`, then rewrites references. Identical sources and tool
versions produce equal single-file bytes and equal directory name/content trees at independent
destinations; clean-package verification repeats the build through independent CLI processes.

An image that appears more than once in one file — in two sections, or in both language versions — is
embedded once in a data block and referred to from every occurrence; the runtime puts it in place on load and
after a language switch. `output.maxInlineBytes` (a budget: exceeding it fails the build) is compared with the
serialized inline CSS, package runtime, and image/download
data URLs including base64 expansion. A font data URL is counted once through generated CSS. The result's `bytes` field
separately reports the HTML file size, not a directory-tree total.

Both formats include every declared locale variant and the same package-owned page layout, theme,
responsive navigation and bounded motion, default attribution footer, code-copy, tabs, overlays, filters,
switches, visualizations, and demo behavior. Matching resources are deduplicated; two locale resources that
would publish different bytes at the same directory-output path fail rather than overwrite each other. Tabs start on their first panel; disclosures use the
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

Every command that reports a run — `build`, `validate`, `inspect` and the others the
[agent reference](../AGENT-REFERENCE.md#choose-a-page-category-and-initialize-its-starter) lists as run
commands — writes only NDJSON records to stdout by default — `--json` names that default and `--human`
selects the prose projection of the same records — including failures detected while parsing CLI
arguments. Every record has a per-invocation `runId`, but no
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

The compiler does not fetch remote assets, execute template helpers, enable raw HTML, start a server,
publish, or deploy. Unknown directives fail instead of silently producing ambiguous output. Author code
runs only through the [extensions](#extensions) the page declares: a provider runs locally at build time
like any build script the author chose, an island runs in a sandboxed frame without network or access to
the page, and an effect's bundled script is allowed by its hash only on pages that use it. `validate`,
`inspect` and `review` expand the page as `build` does and therefore run its providers as well: a
provider is code, so an untrusted source with providers must not be validated or inspected either. An
effect module is bundled with everything it imports, including files outside the source root such as
`node_modules`; the build result lists those files in the effect's `notes`.

A new capability of the core itself — a directive or behavior every page may use — must first satisfy the
checked
[`extension proposal schema`](../generated/extension-proposal.schema.json) using the
[`complete template`](../generated/extension-proposal.template.json). Its closed `trustBoundary` fields
make author code, callbacks, evaluation, dynamic imports and network access forbidden and require
source-root confinement, offline deterministic behavior, CSP compatibility and bounded package-owned
runtime behavior for code the package owns. This is a development-time evidence gate for the core; code
specific to one design goes through extensions instead.
