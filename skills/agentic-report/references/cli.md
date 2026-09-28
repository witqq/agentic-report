# CLI for agents

The CLI is the local, machine-readable route to the installed package. Use the version pinned in
[`SKILL.md`](../SKILL.md); its command block shows how to run it. The source syntax and allowed values
come from `agentic-report describe` and `agentic-report schema`; the generated
[`catalog.md`](catalog.md) is their readable projection. The options and result shapes below are the
CLI contract. Paths passed as input are resolved from the current working directory. The optional input
of `build`, `validate`, `inspect`, `fix`, and `snapshot` defaults to `.` and accepts a Markdown file or a
directory containing `report.md` or `index.md`.

## Commands and options

Every command accepts `--json` (the default agent output) and `--human` (a reader-oriented projection).
The table lists its other arguments and flags; `--help` shows the installed command's current help.
For an unfamiliar starter or extension, run `examples` before choosing an ID or writing code.

| Command        | Arguments and other options                                                                                    | Result or effect                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`         | `<destination>`; `--starter <id>`                                                                              | Create an absent project directory from a packaged starter. The default starter is `document`; `examples` lists the installed IDs.                                                                                                                                                                                    |
| `theme`        | `--colors <list>` required; `--extends <theme>`; `-o, --output <path>`                                         | Write an absent `.yaml`, `.yml`, or `.json` theme file. Give one or two comma-separated `#rgb` or `#rrggbb` colours. The default output is `brand-theme.yaml`; without `--extends`, the default built-in theme is used. See [`themes.md`](themes.md).                                                                 |
| `build`        | `[input]`; `-o, --output <path>`; `--format <format>`; `--review <path>`; `--share`; `--url <url>`             | Validate and compile. `--format` is `single-file` (the default unless the source selects otherwise) or `directory`. Without `--output`, write `report.html` or the `report-artifact` directory in the working directory. `--share` neutralizes workstation source links; `--url` overrides the manifest's public URL. |
| `validate`     | `[input]`; `--format <format>`; `--review <path>`; `--url <url>`                                               | Run the same preparation and validation as `build`, without writing an artifact.                                                                                                                                                                                                                                      |
| `inspect`      | `[input]`; `--format <format>`; `--review <path>`; `--url <url>`                                               | Return resolved source structure, observed directives and resource counts, installed authoring catalog, and warnings. It writes no artifact.                                                                                                                                                                          |
| `fix`          | `[input]`; `--format <format>`                                                                                 | Apply only replacements computed for diagnostics that can be repaired without an author decision. The result reports what was written and what remains.                                                                                                                                                               |
| `sitemap`      | `<directory>`                                                                                                  | Write `sitemap.xml` and `robots.txt` for a published tree of built pages with public URLs; report indexed URLs and skipped HTML files.                                                                                                                                                                                |
| `snapshot`     | `[input]`; `--out <directory>` required; `--widths <list>`; `--schemes <list>`; `--motion <list>`; `--measure` | Build the page into an absent or empty directory and photograph it. `--measure` measures it instead, without pictures. Both need Playwright and Chromium; see [`process.md`](process.md#look-at-the-result).                                                                                                          |
| `effect-check` | `<manifest>`; `--out <directory>` required                                                                     | Build an effect extension's examples and run eleven Chromium checks. A failed check gives exit code 1 while still returning all check records and the result. See [`extensions.md`](extensions.md).                                                                                                                   |
| `review`       | `<review>`; `[input]`                                                                                          | Resolve a confined, relative review JSON sidecar against the current source. The first argument is the review path, not the report path.                                                                                                                                                                              |
| `schema`       | `--scope <scope>`                                                                                              | Return a JSON Schema; scope is `manifest` (default), `directives`, `source`, or `theme`.                                                                                                                                                                                                                              |
| `describe`     | no other options                                                                                               | Return the complete installed source contract, including directives, capabilities, commands and authored rules. `discover` is an alias.                                                                                                                                                                               |
| `examples`     | no other options                                                                                               | List packaged examples and reference extensions with installed paths.                                                                                                                                                                                                                                                 |

The `--review` sidecar on `build`, `validate`, and `inspect` is confined to the source root; `review`
also takes a confined relative sidecar. `--url` must be an absolute public HTTP(S) page URL.
`--widths` is a comma-separated list of whole pixel widths from 240 to 3840; duplicates collapse.
`--schemes` accepts `light,dark`, and `--motion` accepts `normal,reduce`. Without selection flags,
`snapshot` photographs widths 390, 768, and 1440 in both schemes and motion settings. With `--measure`,
it measures widths 320, 360, 390, 768, 1024, and 1440 in both schemes and motion settings.

## Agent output and diagnostics

The agent mode is the default; `--json` explicitly requests the same mode. If both output flags appear,
`--human` takes precedence. Run commands (`init`,
`theme`, `build`, `validate`, `inspect`, `fix`, `sitemap`, `snapshot`, `effect-check`, `review`) write one
newline-delimited JSON (NDJSON) object per line to stdout. All records in one invocation carry the same
UUID `runId`. The final successful record has `type: "result"` and the command's result fields. Warnings
appear first as `type: "diagnostic"` records and also remain in the result's `warnings` field when that
result has one. `snapshot --measure` emits one `type: "measure"` record per width, scheme, and motion
before its result. `effect-check` emits one `type: "check"` record per check before its result; each check
record also has `effect`. Parse by `type` and `runId`, not by line position alone.

`schema`, `describe`, and `examples` return one compact JSON document, without the NDJSON envelope.
`--human` makes prose for the run commands except `inspect`, whose result is indented JSON. It makes
indented JSON for `schema` and `describe`, and a path list for `examples`. Diagnostics and warnings in
human mode go to stderr; agent records go to stdout. `--help` and `--version` are command-line help
responses, not report records.

A diagnostic record has `level` (`warning` or `error`), `code`, `message`, `remediation`, and optional
`source` (`file`, `line`, `column`, `endLine`, `endColumn`), `details`, `fix`, and `related`. `related`
contains further independent violations from the same run. `fix`, when present, identifies the exact
`file`, UTF-16 `start` and exclusive `end` offsets, and `replacement`; these are string offsets, not
UTF-8 byte offsets. Do not guess a replacement when `fix` is absent. Values are sanitized for transport;
a replacement that would change during credential redaction is withheld. Exit code 0 means the command
succeeded, 1 means a reported failure (including failed effect checks), 2 means a required package asset
is missing, and 3 means an internal error. On an internal error, report the CLI version and `runId`.

## Result fields

The table names every top-level field after removing the NDJSON envelope's `type` and `runId`. Nested
structures and optional fields are explained below. For a specific installed release, inspect an actual
result before consuming it.

| Command              | Result interface         | Top-level fields                                                                                                                                |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`               | `InitProjectResult`      | `starterId`, `starterTitle`, `projectPath`, `entryPath`, `files`                                                                                |
| `theme`              | `CreateBrandThemeResult` | `themePath`, `name`, `extends`, `schemes`, `roles`                                                                                              |
| `build`              | `BuildReportResult`      | `outputPath`, `format`, `bytes`, `embeddedAssets`, `externalAssets`, `contentHash`, `share`, `neutralizedSourceLinks`, `warnings`, `extensions` |
| `validate`           | `ValidateReportResult`   | `contractVersion`, `projectPath`, `entryPath`, `format`, `runtimePlacement`, `warnings`                                                         |
| `inspect`            | `InspectReportResult`    | `contractVersion`, `projectPath`, `entryPath`, `output`, `sourceFiles`, `structure`, `observed`, `extensions`, `catalog`, `warnings`            |
| `fix`                | `FixReportResult`        | `contractVersion`, `projectPath`, `entryPath`, `applied`, `remaining`                                                                           |
| `sitemap`            | `GenerateSitemapResult`  | `directory`, `sitemap`, `robots`, `urls`, `skipped`                                                                                             |
| `snapshot`           | `SnapshotReportResult`   | `outputDirectory`, `page`, `shots`, `contactSheet`, `warnings`                                                                                  |
| `snapshot --measure` | `MeasureReportResult`    | `outputDirectory`, `page`, `measurements`, `warnings`                                                                                           |
| `effect-check`       | `EffectCheckResult`      | `effect`, `passed`, `total`, `summary`, `checks`, `outputDirectory`, `frames`, `warnings`                                                       |
| `review`             | `InspectReviewResult`    | `contractVersion`, `projectPath`, `entryPath`, `reportRevision`, `reviewedRevision`, `reportStatus`, `threads`                                  |

`extensions` is optional on `build` and `inspect`; it is absent when the page declares none.
`init.files` lists the files written by the starter. Each `theme.roles` item gives `scheme`, `role`,
`from`, `value`, `lightnessShift`, and `hueShift`, so an agent can inspect the adjusted brand colours.
`build.contentHash` is the artifact SHA-256, while `bytes`, `embeddedAssets`, and `externalAssets` report
its size and resource counts. `sitemap.urls` lists indexed canonical URLs; `skipped` lists HTML files
outside the builder's published-page inventory.
`inspect.structure` has
resolved section properties and counts without authored prose. `inspect.observed` counts directives,
images, videos, downloads, and fonts; `inspect.catalog` includes the installed command, format,
starter, capability, and page lists. `fix.applied` reports file, line, column, code, and replacement;
`fix.remaining` holds diagnostics needing an author decision. `review.reportStatus` is `exact` or
`stale`; each thread has a `binding` of `exact`, `changed`, `missing`, or `ambiguous`.

`snapshot.shots` identifies each first-screen and full-page frame, plus any screen or scene stops;
`contactSheet` names its HTML and image. `snapshot --measure` carries the same individual objects in
its `measure` records and final `measurements` array. Each measurement includes viewport settings,
overflow, text size and contrast findings, covered text, empty bands, clipped headings, first-screen
checks, stops, browser errors, failed fonts, placeholders, and a `defects` total. Fix nonzero defects,
then photograph the remaining cases. `effect-check.checks` contains each check's `id`, `title`, `passed`,
and `details`; its `check` records contain these plus `effect`.

These are the nested records an agent needs to parse. `SnapshotMeasurement` adds its listed fields to
`SnapshotPageMeasures`; a streamed `measure` record adds `type` and `runId` to that complete object.

| Location                         | Record                  | Fields                                                                                                                                                                                            |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.extensions[]`             | `ExtensionBuildReport`  | `name`, `kind`, `uses`, optional `bytes`, `notes`                                                                                                                                                 |
| `inspect.extensions[]`           | `InspectedExtension`    | `name`, `kind`, `manifest`, `description`, `uses`, optional `attributes`, optional `targets`                                                                                                      |
| `inspect.structure`              | `PageStructure`         | `layout`, `motion`, `beforeFirstSection`, `sections`, `magneticActions`, `movingElements`, `cardGroups`                                                                                           |
| `inspect.structure.sections[]`   | `PageSectionStructure`  | `depth`, `recipe`, `place`, `surface`, `transition`, `scene`, `interaction`, `choreography`, `media`                                                                                              |
| `inspect.structure.*.media`      | `PageMediaCounts`       | `images`, `videos`, `diagrams`, `charts`, `timelines`, `code`                                                                                                                                     |
| `inspect.structure.cardGroups[]` | `PageCardGroup`         | `cards`, `shapes`, `plain`, `linked`                                                                                                                                                              |
| `snapshot.shots[]`               | `SnapshotShot`          | `width`, `scheme`, `motion`, `firstScreen`, `fullPage`, `pageHeight`, optional `stops`                                                                                                            |
| `snapshot.shots[].stops[]`       | `SnapshotStop`          | `kind`, `id`, `index`, `frame`, `fits`                                                                                                                                                            |
| `snapshot.measurements[]`        | `SnapshotMeasurement`   | `width`, `scheme`, `motion`, `stops`, `pageErrors`, `defects` plus the page measures below                                                                                                        |
| `snapshot.measurements[]`        | `SnapshotPageMeasures`  | `pageHeight`, `horizontalOverflow`, `overflowing`, `smallText`, `lowContrast`, `unmeasuredContrast`, `coveredText`, `emptyBands`, `clippedHeadings`, `firstScreen`, `placeholders`, `failedFonts` |
| `measurement findings`           | `MeasuredFinding`       | `count`, `samples`                                                                                                                                                                                |
| `lowContrast.samples[]`          | `MeasuredContrast`      | `element`, `ratio`, `minimum`, `opacity`                                                                                                                                                          |
| `effect-check.checks[]`          | `EffectCheckItem`       | `id`, `title`, `passed`, `details`                                                                                                                                                                |
| `review.threads[]`               | `ResolvedReviewThread`  | `thread`, `binding`, optional `currentTarget`, `segments`                                                                                                                                         |
| `review.threads[].segments[]`    | `ResolvedReviewSegment` | `segment`, `binding`, optional `currentTarget`, optional `selection`                                                                                                                              |

`SnapshotPageMeasures.firstScreen` has `heading`, `action`, `actionOnPage`, `mainSceneShare`, and an
optional `mainScene`. Each `emptyBands` item has `top` and `height`; `lowContrast` has `count` and
`samples`. A measurement stop carries the `SnapshotStop` fields except `frame`. Review segments preserve
the original versioned thread data and report each segment's binding; a selected-text segment also has
`selection.start` and `selection.end`, each with its original `boundary`, a `binding`, and an optional
`currentTarget`. Treat `changed`, `missing`, and `ambiguous` bindings as unresolved source locations.

The three reference commands return these unwrapped documents:

| Command    | Document fields                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema`   | The requested JSON Schema document; use `--scope` to select it.                                                                                                                                                                                                                |
| `describe` | `contractVersion`, `source`, `directives`, `outputs`, `page`, `visualizations`, `authoredRules`, `safety`, `capabilities`, `commands`                                                                                                                                          |
| `examples` | `contractVersion`, `examples`, `extensions`; each example has `id`, `path`, `entry`, `title`, `description`, `classes`, `category`, and optional `subvariant` and `starter`. Each reference extension has `name`, `kind`, `description`, `manifest`, `readme`, and `examples`. |
