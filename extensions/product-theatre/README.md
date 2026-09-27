# product-theatre — a product run replayed second by second

A composite block and a provider that work as a pair (levels 1a and 1b of the
[extension API](../../skills/agentic-report/references/extensions.md)). Together they show how a product
works from the record of one real run: the panels of the product as a diagram, and every event of the run
as a step that lights the panels it touches while the reader scrolls. After the scene comes the whole run as
a table.

The folder holds two manifests:

- `extension.yaml` — the block `product-theatre`, the **frame**. Its template is a section with
  `scene="steps"` and `width="wide"`, followed by the table of the run. The frame is the same on every page
  and is checked by the attribute schema: title, anchor, navigation label and the name of the scenario.
- `script.yaml` — the provider `theatre-script`, the **data**. `script.mjs` reads the scenario from the
  page's data and
  writes the `diagram` of the panels and one `beat` per event (`part="scene"`), or the table of the whole
  run in a `disclosure` with the note on where the scenario comes from (`part="script"`).

The split follows what changes. The frame is layout: a decision made once and written as a template of
built-in directives. The run is data: it comes from a log or an export, holds up to eight events with
their seconds, and would be tedious and error-prone to write by hand — a focus that names a panel the
diagram does not have, a second out of order. The provider checks the scenario and refuses a wrong one with
a message at the author's directive. An author who wants another frame (a different title level, no table)
uses `theatre-script` directly inside a section of their own.

```markdown
---
title: From an empty folder to a checked page
layout: landing
extensions: [extensions/product-theatre/extension.yaml, extensions/product-theatre/script.yaml]
data: [extensions/product-theatre/scenario-cli.json]
---

# From an empty folder to a checked page

::product-theatre{title="One run, second by second" id="run" nav="Run" scenario="scenario-cli"}
```

## When to use it

- The first screens of a landing that must show a product working, when the product is a process: a CLI
  run, an agent's session, an on-call walkthrough, an import that goes through stages.
- A report or an incident review that explains what happened in which order and where.
- The run is real: timed from a log, an export or a recording, with the seconds it took.

## When not to use it

- A behaviour that needs proof that it is real: record it and use `video`.
- A mechanism without time: a `diagram` or a section with `recipe="blueprint"` explains it better.
- A run longer than eight events: split it into two scenes, or show the key moments only.
- More than one theatre per page: a steps scene is the main scene of its chapter, and two compete.

## Attributes

`product-theatre` (block, leaf form):

| Attribute  | Type                       | Required | Meaning                                                      |
| ---------- | -------------------------- | -------- | ------------------------------------------------------------ |
| `title`    | text, up to 200 characters | yes      | the title of the section that holds the run                  |
| `id`       | text, up to 64 characters  | yes      | the anchor of the section                                    |
| `nav`      | text, up to 40 characters  | yes      | the short label the reader navigates by                      |
| `scenario` | text, up to 64 characters  | yes      | the name of the page data file with the run, without `.json` |

`theatre-script` (provider, leaf form): `scenario` as above, and `part` — `scene` (default) writes the
diagram and the beats, `script` writes the table of the whole run.

## The scenario file

The scenario is a page data file: keep it beside the page, declare it in the page's `data` field
(`data: [run.json]`) and name it without `.json` in `scenario="run"`. The build reads the file inside the
source root and hands it to the provider parsed, on standard input (`data.run`); the provider reads no
file itself. A name the page does not declare is refused at the author's directive.

| Field         | Meaning                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | the title of the diagram                                                                                                                           |
| `description` | one sentence that says what the diagram shows                                                                                                      |
| `origin`      | where the run comes from: the date, the machine, the log; shown under the table                                                                    |
| `layout`      | optional first view of the diagram: `auto` (default), `down`, `right`, `orthogonal`                                                                |
| `panels`      | two to eight panels: `id`, `label`, optional `detail`, optional `kind` (`accent`, `success`, `warning`) with `meaning` for the legend              |
| `links`       | connections between panels: `from`, `to`, optional `label`, optional `kind` (`call`, `data`, `event`, `dependency`)                                |
| `events`      | two to eight events in time order: `at` (seconds from the start), `title`, `panels` it touches, `text` (Markdown), optional `code` with `language` |

Seconds are written as `0.6 s` and `18 s` below a minute and as `2:10` above it, with a decimal comma in
Russian. The table's headings follow the page language (English or Russian).

## Static equivalent

Everything the provider writes is built-in directives, so the static equivalent is theirs: without motion
the diagram is drawn complete and every step stands in the flow of the page with its second and its text;
below about 912 pixels the diagram comes once, then the steps; print shows the diagram, the steps and the
table.

## Files

- `extension.yaml`, `template.md` — the block.
- `script.yaml`, `script.mjs` — the provider.
- `scenario-cli.json`, `example-cli.md` — an English landing: one timed run of this package's CLI.
- `scenario-dashboard.json`, `example-dashboard.md` — a Russian incident walkthrough across the panels of an
  on-call dashboard (fictional sample).

Build an example from the repository root:

```sh
pnpm build
node dist/node/cli.js build extensions/product-theatre/example-cli.md --output theatre.html
```
