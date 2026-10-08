# agentic-report

`agentic-report` is a local interactive page builder for agents, distributed as an npm CLI and ESM API. It
turns declarative Markdown into responsive browser pages: one
self-contained HTML file by default, or a directory with content-addressed asset filenames. The public source
stays free of JSX so an agent can focus on content and structure rather than page layout; what one design
needs beyond the built-in vocabulary comes through extensions the page declares.

Choose it for agent-to-human research, architecture, tutorial, dashboard, landing, and work-report pages.
Choose a notebook or live application for computation and per-user state, a documentation generator for
a maintained multi-page site, a hosted document for simultaneous collaboration, or a bespoke web project
when arbitrary layout control is the primary job.

Ordinary builds are local and offline. The optional `serve` command opens a living document on loopback
with Codex discussion and source updates; it does not deploy a cloud service.

## Build your first page

Use Node.js 24.18.0 or newer. Initialize a starter, replace its declarative content, build once, and open
the resulting file:

```sh
npx --yes agentic-report@0.20.0 init ./my-page --starter landing --json
# Edit ./my-page/report.md and its local assets.
npx --yes agentic-report@0.20.0 build ./my-page --output ./my-page.html --json
```

Open `my-page.html` directly through `file://`. `build` validates the complete source before publishing the
artifact, so `validate` is an optional diagnostic-only preflight and `inspect` is optional source/catalog
discovery. Use `--format directory` only when separate content-addressed assets are useful.

## Give the capability to an agent

Install the packaged skill so a compatible coding agent can recognize when a static interactive handoff is
more useful than another long chat response:

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Ask naturally: “investigate this subsystem and open an interactive code tour,” “compare these options as a
reviewable decision,” or “turn this incident into a report with a timeline and owners.” The skill chooses a
starter, writes declarative source, builds the local HTML, opens it, and returns the source and artifact
paths. Validation and inspection remain available when focused diagnostics are useful. The skill is
intended for finished agent-to-human handoffs with evidence, relationships,
timelines, code explanations, visualizations, or fragment-level review; simple answers should stay in chat.
Beside `SKILL.md` the skill carries [`references/catalog.md`](skills/agentic-report/references/catalog.md),
generated from the package contract with every field, directive, and allowed value, and English and Russian
prose guides; `pnpm check:authoring` fails when the catalog drifts from the compiler.

You can also use the CLI as the rendering stage of a domain-specific skill. The custom skill owns research,
judgment, and the trigger; `agentic-report` owns the safe source contract, responsive page, packaged
interaction runtime, and portable output. See the [agent quickstart](website/docs/agent/index.md) for a
copyable custom-skill pattern and example prompts.

For a Node integration, use the public ESM `buildReport` API with author-overridable page-control defaults;
see [Build from ESM](docs/product/source-contract.md#build-from-esm) for its typed options and precedence.

### Build from reviewed source instead of installing the package

If you do not want to execute the published `agentic-report` npm package, clone a specific release tag,
inspect the repository, run its checks, and invoke the compiled CLI directly:

```sh
git clone --branch v0.20.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD

# Inspect README.md, LICENSE, package.json, pnpm-lock.yaml, and the source before installing dependencies.
pnpm install --frozen-lockfile
pnpm verify
pnpm build

node dist/node/cli.js init ../my-page --starter document --json
node dist/node/cli.js build ../my-page --output ../my-page.html --json
```

Edit `../my-page/report.md` between the two commands. `build` validates the complete source before writing;
use `validate` for a diagnostic-only run or `inspect` for the observed source catalog when either answer is
needed separately.

This avoids installing or running the `agentic-report` package from npm and gives you the complete source to
review. It does not eliminate registry trust: `pnpm install` still downloads the exact dependencies recorded
in `pnpm-lock.yaml`. The project does not vendor those dependencies. Inspect the lockfile and lifecycle
scripts before installation, use an isolated environment when appropriate, and keep the release tag pinned
for reproducibility.

## Discover staging and tools

The skill's [knowledge map](skills/agentic-report/references/knowledge.md), [directing guide](skills/agentic-report/references/directing.md) and [combinations](skills/agentic-report/references/combinations.md) connect the material and viewer's task to development, staging and coordinated actions. The [generated atlas](skills/agentic-report/references/atlas.md) covers the complete directive vocabulary, native examples and reference extensions. Existing research and craft references remain available through the map.

From a compiled checkout or installed package, render the native gallery:

```sh
node skills/agentic-report/scripts/build-atlas.mjs --out ./report-atlas
```

Open `report-atlas/index.html` to compare actual pages. The gallery is for discovery; it adds no page or film handoff gate.

## Directed explanations for a film

A `composition` arranges named Markdown objects as `diagram-code`, `pipeline`, `before-after`, `overview-detail` or `ownership`. Its cues reveal and focus objects, draw connections, copy or transfer values, replace text, compare results and move the camera. Agentic Screencast report scenes bind those cues to measured speech paragraphs; standalone pages use preview beats and keep final values in static or reduced-motion views. Read the [directing guide](skills/agentic-report/references/directed-scenes.md) for syntax, existing effects and the three complete examples. Use the compiled local checkout for this composition vocabulary.

Stable objects can contain named `slot` regions for changing values. `scene-group` keeps related objects together, and `layout="row|column|grid"` chooses their spatial arrangement independently of the composition meaning. See the same guide for slot addressing, preserved owner identity and responsive grouping.

Whenever showing a system interface, first show its complete application screen, then move to a detail. The same guide gives page, presentation and vertical-film recipes that preserve the detail's location.

## Local living document

From a checkout containing the live mode, run `pnpm build`, then
`node dist/node/cli.js serve ../my-page --human` from the author Codex session. Open the printed URL,
select text and choose **Ask agent** to write beside the passage, or send a general chat question. Waiting
questions show their order and can be cancelled immediately; the chat panel also offers width and visual
settings. The same agent receives the questions, streams its reply and edits original sources; valid rebuilt
editions highlight changes. The chat mirrors human text sent from that Codex/terminal conversation
alongside its other replies, with correlated browser questions appearing once. The
[live operating guide](skills/agentic-report/references/process.md#live-local-document)
describes setup, recovery, storage and the separate `agentic-report/live` Node API.

## Document map

| Document                                                                                     | Role                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                               | Authoritative description of the runnable current compiler             |
| [`docs/product/source-contract.md`](docs/product/source-contract.md)                         | Exact current declarative authoring contract                           |
| [`docs/AGENT-REFERENCE.md`](docs/AGENT-REFERENCE.md)                                         | Current copyable CLI and source reference for agents                   |
| [`docs/TESTING.md`](docs/TESTING.md)                                                         | Current verification entry points and covered guarantees               |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                                                 | Contributor setup and local quality commands                           |
| [`docs/PUBLIC-SITE.md`](docs/PUBLIC-SITE.md)                                                 | Static-site and skill release contract                                 |
| [`docs/RELEASE.md`](docs/RELEASE.md)                                                         | Ordered release and post-publication verification runbook              |
| [`skills/agentic-report/SKILL.md`](skills/agentic-report/SKILL.md)                           | Canonical cross-agent authoring skill                                  |
| [`skills/agentic-report/references/catalog.md`](skills/agentic-report/references/catalog.md) | Generated closed lists: themes, layouts, recipes, directives, commands |

## Source format

A source is either a Markdown file or a directory containing `report.md` or `index.md`. Beside the entry it
may hold YAML frontmatter or an `agentic-report.yaml`, `.yml` or `.json` manifest, Markdown partials
included as `{{include: partials/summary.md}}`, an English or Russian alternate entry declared by
`localizations`, a theme file, and local images, clips, downloads and fonts. The page is ordinary Markdown
plus allowlisted semantic directives; there is no JSX, CSS or author script to write.

Example:

````markdown
---
title: Architecture options
description: Decision report
language: en
layout: document
scheme: system
theme:
  extends: calm-paper
  width: narrow
progress: chapters
attribution: true
---

# Architecture options

{{include: partials/context.md}}

![System boundary](assets/system.svg)

::contents

::::section{title="Decision" id="decision" nav="Decision" width="reading" align="start" tone="soft" transition="stagger" scene="progress" choreography="cascade"}
:::lead
The opening thesis introduces :term[concepts]{key="concept"} as emphasized prose, not a callout.
:::

:::callout{title="Key finding" kind="info"}
The compiler owns responsive layout and navigation.
:::

:::actions{placement="auto"}
::action[Review the decision]{href="#decision" kind="primary" effect="magnetic"}
::action[Open the evidence]{href="evidence.html" kind="secondary"}
:::

Inspect :source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}.

```typescript terms="concept"
const concept = compileSource();
```

:::glossary{key="concept" term="concept" forms="concepts" placement="appendix"}
One canonical definition shared by prose forms and selected first code occurrences.
:::
::::
````

Each part of the format is described in one place:

| Question                                                                                                | Where                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| What a source may contain: every metadata field, directive, limit and the output behaviour              | [`docs/product/source-contract.md`](docs/product/source-contract.md)                                                                 |
| How to write a page: categories and starters, themes, sections and recipes, visualizations, workspaces  | [`docs/AGENT-REFERENCE.md`](docs/AGENT-REFERENCE.md)                                                                                 |
| The closed lists: built-in themes, layouts, recipes, directives with their attributes, and CLI commands | [`skills/agentic-report/references/catalog.md`](skills/agentic-report/references/catalog.md), generated                              |
| The same contract as JSON                                                                               | `agentic-report describe`, `agentic-report schema --scope manifest\|directives\|source\|theme`, [`docs/generated/`](docs/generated/) |

The catalog and the JSON projections are generated from the package registry; `pnpm check:authoring` fails
when either drifts from the compiler.

Pages fall into five standard categories — `document` (the default), `landing`, `dashboard`, `answer`,
and `presentation` — and each has a starter of the same name that `init` copies together with a `brief.md`
of the questions to settle before writing. A category is a recommendation: any directive works on a page of
any category. Subvariants and starter contents are listed under
[«Choose a page category»](docs/AGENT-REFERENCE.md#choose-a-page-category-and-initialize-its-starter).

The look of a page is its `theme`: `neutral` by default, another built-in theme, or a theme written as data
that extends one of them and changes only what it names; the build checks every field and the contrast of
text, links, actions and focus in each scheme. The layout is `document` by default. Both closed lists are in
the catalog, and [«Make a theme of your own»](docs/AGENT-REFERENCE.md#make-a-theme-of-your-own) shows how
to write a theme.

A top-level `section` composes package-owned arrangements, media treatment and bounded motion from closed
attributes, and a `recipe` sets a coordinated group of them in one word; see
[«Semantic directives»](docs/AGENT-REFERENCE.md#semantic-directives) for how to use them and the
[source contract](docs/product/source-contract.md#semantic-primitives) for every value. Charts, flow and
sequence diagrams and timelines compile offline into accessible SVG or HTML
([«Data visualizations»](docs/AGENT-REFERENCE.md#data-visualizations)); a local clip plays in the page
([«Video and agentic-screencast»](docs/AGENT-REFERENCE.md#video-and-agentic-screencast)); `layout: slides`
makes a presentation that can be shown or filmed, and a `deck` puts a few slides inside any page with a
full-screen view ([«Presentations»](docs/AGENT-REFERENCE.md#presentations)).

Two opt-in layers return the reader's answer to the agent. Review Workspace (`review: true`) lets a reader
select text, leave notes and export `review.json`, which `agentic-report review` binds back to the Markdown
([«Resolve review feedback to source»](docs/AGENT-REFERENCE.md#resolve-review-feedback-to-source)).
Response Workspace collects typed answers — buckets, choices, order, scores, text — as `response.json`
([«Collect a structured reader response»](docs/AGENT-REFERENCE.md#collect-a-structured-reader-response)).

One artifact may carry an English and a Russian variant, chosen from the reader's system languages and
switchable in the page; the package never machine-translates. Package-owned controls follow the page
`language`. See `language` and `localizations` under
[«Metadata»](docs/product/source-contract.md#metadata).

Every generated page shows a compact footer link, **Made with Agentic Report**, pointing to
`https://agentic-report.witqq.dev/`. Set `attribution: false` in frontmatter or the manifest to remove only
that footer.

## Public example portfolio

The package ships buildable examples beside its starters: layout and component catalogs, Review and
Response workspaces, and realistic showcases, each with a maintained Russian entry. Their reader jobs and
page shapes are listed under
[«Rebuild the public showcases»](docs/AGENT-REFERENCE.md#rebuild-the-public-showcases).

From a repository or package-source checkout, build them with the public CLI:

```bash
agentic-report build ./examples/incident-review --output ./incident-review.html
agentic-report build ./examples/vendor-decision --output ./vendor-decision.html
agentic-report build ./examples/launch-readiness --output ./launch-readiness.html
agentic-report build ./examples/terminal-portfolio --output ./terminal-portfolio.html
agentic-report build ./examples/cinematic-story --format directory --output ./cinematic-story-directory
agentic-report build ./examples/tutorial --share --output ./tutorial-share.html
```

Open the HTML file or directory `index.html` directly through `file://`. In an installed package,
`agentic-report examples --json` returns each absolute installed entry path; use its containing directory as
the build input. These examples remain discovery-only and do not change the five `init` starters.

`agentic-report fix ./my-report` applies compiler-computed repairs to an authored source: it applies the
replacements the product computed exactly and leaves every other byte alone
([«Apply the repairs the product computed»](docs/AGENT-REFERENCE.md#apply-the-repairs-the-product-computed)).
Every command answers an agent with JSON or NDJSON by default and a person with `--human`; which command
writes which shape is under [«Command output»](docs/AGENT-REFERENCE.md#command-output).

## Product-built landing

The canonical public landing is itself an ordinary compiler input at
[`website/landing`](website/landing/). It uses only supported Markdown, frontmatter, semantic directives,
and local media. Its first viewport presents the value, actions, and a generated result; the remaining
sections lead through style choice, the three-step author path, the full public gallery, selected-text Review,
product reasons, agent setup, and the trust boundary. Its paired Russian entry and every public demo use the
same multilingual contract as package consumers. Build it through the same public path as any user page:

```bash
agentic-report build ./website/landing --output ./landing.html --json
agentic-report build ./website/landing --format directory --output ./landing-directory --json
```

The build validates before writing. Run `validate` or `inspect` separately only when diagnostics or an
observed source inventory is the desired result.

[`website/routes.json`](website/routes.json) is the deployment-route authority. It gives every internal
landing destination one relative URL, canonical repository source, route kind, and an optional confined
prior-review sidecar for a page build. Each example
card points to a separately publishable live page and a separately retrievable Markdown source; screenshots
are previews, not substitutes for the published demos. Static site assembly resolves these declarations
without adding a client router or a second authoring framework.

The same-origin public tree also exposes [human documentation](website/docs/report.md), a
[direct agent quickstart](website/docs/agent/index.md), the complete reference and source contract,
the byte-identical canonical skill, [`llms.txt`](website/llms.txt), and hash-bound release metadata.
Build the deployment tree from a clean revision:

```bash
pnpm build:site -- --output ./site --revision "$(git rev-parse HEAD)"
```

The output path must not exist. Open `site/index.html` through `file://`; see
[`docs/PUBLIC-SITE.md`](docs/PUBLIC-SITE.md) for deterministic staging, trusted-TLS hosting, skill
distribution, and synchronized update gates.

## Commands

After a local build:

```bash
pnpm install
pnpm build
node dist/node/cli.js init ./my-report
node dist/node/cli.js init ./weekly-status --starter dashboard
node dist/node/cli.js build examples/document --output report.html
node dist/node/cli.js build examples/document --format directory --output report-dir
node dist/node/cli.js validate ./my-report
node dist/node/cli.js inspect ./my-report --json
node dist/node/cli.js describe --json
node dist/node/cli.js schema
node dist/node/cli.js schema --scope directives
node dist/node/cli.js schema --scope source
node dist/node/cli.js examples --json
node dist/node/cli.js sitemap ./public
```

To exercise the current installable artifact rather than repository-relative `dist`, create a tarball and
install that exact file into a clean consumer:

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
npx agentic-report build ./my-report --output ./report.html --json
```

The build creates `report.html` directly from the edited starter. `scripts/check-package.ts` additionally
proves that the same installed build rejects invalid source before publication, preserves an existing
output, and succeeds after correction; it covers optional validation and inspection separately.

Install and use the published package with:

```bash
npx agentic-report build ./report-source --output report.html
npm install --global agentic-report
agentic-report init ./my-report
# Edit ./my-report/report.md and its local assets.
agentic-report build ./my-report --output ./my-report.html
agentic-report validate ./my-report
agentic-report inspect ./my-report --json
agentic-report review ./review.json ./my-report --json
```

## Output formats

The default `single-file` output is one HTML file carrying styles, the package runtime and every local
resource; `directory` writes `index.html` with content-hashed assets beside it. Both behave the same in the
browser and open through `file://`; the runtime placement follows the format and is not an option. A
single-file build above the `output.maxInlineBytes` budget fails rather than producing a heavy file. How
both formats publish atomically, refuse to overwrite a source, and count the budget is under
[«Output behavior»](docs/product/source-contract.md#output-behavior) in the source contract.

A page extends the vocabulary through the extension manifests it lists in `extensions`: a composite block
(a Markdown template of existing directives), a provider (a local program that writes Markdown at build
time), an effect (a bundled script decorating existing directives) or an island (an application in a
sandboxed frame with a Markdown static equivalent). Author code runs only through them: a provider runs
locally at build time like any build script you chose, an island has no network and no access to the page,
and an effect ships with its hash in the page policy only where it is used. `validate`, `inspect` and
`review` run providers too, because they expand the page like `build`: do not validate an untrusted
source that declares providers. The format is in the source
contract's [«Extensions»](docs/product/source-contract.md#extensions).
The package ships reference extensions to copy from in `extensions/`, each with a README and two example
pages, and `agentic-report examples` lists them: [`key-figure`](extensions/key-figure/README.md) (a block),
[`product-theatre`](extensions/product-theatre/README.md) (a block and a provider),
[`loom`](extensions/loom/README.md) and
[`focus-frame`](extensions/focus-frame/README.md) (effects) and
[`slo-budget`](extensions/slo-budget/README.md) (an island). When to extend and which level to take is in
the skill's [extensions reference](skills/agentic-report/references/extensions.md).

### Pages served on the web

Declare the address a page is served from as `url` in its metadata, or pass `--url` to `build`:

```bash
agentic-report build ./site-source --format directory --url https://example.com/guide/ --output ./public/guide
```

The page head then carries a canonical link, OpenGraph and a Twitter card, and an optional local `image`
becomes the link preview in a directory build. After publishing a tree of such pages at one origin, index it:

```bash
agentic-report sitemap ./public
```

`sitemap` writes `sitemap.xml` from the pages' canonical URLs and a `robots.txt` that names it. Why public
pages are built as `directory`, and when `sitemap` refuses to write, is under
[«Output selection»](docs/AGENT-REFERENCE.md#output-selection) in the agent reference.

For implementation boundaries and verification guarantees, see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/TESTING.md`](docs/TESTING.md).

## Development

See the contributor, testing, and architecture entries in the document map above.

## License

MIT. See [`LICENSE`](LICENSE).

---

<p align="center">
  <a href="https://moira-mcp.com/"><img alt="Made with Moira" src="https://img.shields.io/badge/Made_with-Moira-6d5dfc?style=flat-square"></a>
</p>
