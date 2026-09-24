# agentic-report

`agentic-report` is a local interactive page builder for agents, distributed as an npm CLI and ESM API. It
turns declarative Markdown into responsive browser pages: one
self-contained HTML file by default, or a directory with content-addressed asset filenames. The public source
stays free of JSX and author code so an agent can focus on content and structure rather than page layout.

Choose it for agent-to-human research, architecture, tutorial, dashboard, landing, and work-report pages.
Choose a notebook or live application for computation and per-user state, a documentation generator for
a maintained multi-page site, a hosted document for simultaneous collaboration, or a bespoke web project
when arbitrary layout control is the primary job.

It is a local compiler, not a hosted or cloud service, and it does not start a server.

## Build your first page

Use Node.js 24.18.0 or newer. Initialize a starter, replace its declarative content, build once, and open
the resulting file:

```sh
npx --yes agentic-report@0.16.0 init ./my-page --starter landing --json
# Edit ./my-page/report.md and its local assets.
npx --yes agentic-report@0.16.0 build ./my-page --output ./my-page.html --json
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

### Build from reviewed source instead of installing the package

If you do not want to execute the published `agentic-report` npm package, clone a specific release tag,
inspect the repository, run its checks, and invoke the compiled CLI directly:

```sh
git clone --branch v0.16.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD

# Inspect README.md, LICENSE, package.json, pnpm-lock.yaml, and the source before installing dependencies.
pnpm install --frozen-lockfile
pnpm verify
pnpm build

node dist/node/cli.js init ../my-page --starter report --json
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

## Document map

| Document                                                             | Role                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`PRODUCT-REQUIREMENTS.md`](PRODUCT-REQUIREMENTS.md)                 | Normative product requirements                             |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                       | Authoritative description of the runnable current compiler |
| [`docs/product/source-contract.md`](docs/product/source-contract.md) | Exact current declarative authoring contract               |
| [`docs/AGENT-REFERENCE.md`](docs/AGENT-REFERENCE.md)                 | Current copyable CLI and source reference for agents       |
| [`docs/TESTING.md`](docs/TESTING.md)                                 | Current verification entry points and covered guarantees   |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                         | Contributor setup and local quality commands               |
| [`docs/PUBLIC-SITE.md`](docs/PUBLIC-SITE.md)                         | Static-site and skill release contract                     |
| [`docs/RELEASE.md`](docs/RELEASE.md)                                 | Ordered release and post-publication verification runbook  |
| [`skills/agentic-report/SKILL.md`](skills/agentic-report/SKILL.md)   | Canonical cross-agent authoring skill                      |

## Source format

A source is either a Markdown file or a directory containing `report.md` or `index.md`. A directory may
also contain:

- YAML frontmatter in the entry Markdown file;
- `agentic-report.yaml`, `agentic-report.yml`, or `agentic-report.json`;
- optional confined English/Russian alternate Markdown entries declared by `localizations`;
- local images referenced by relative paths;
- Markdown partials included as `{{include: partials/summary.md}}`;
- semantic directives for labelled page sections, generated in-flow contents, action and source-location links, authored/code glossary references, content, interactions, compile-time
  charts/diagrams/timelines, safe built-in demos, downloads, and fonts.

For a single-language page, set `language` to `ru` (including `ru-RU`) for Russian package-owned controls,
interaction states, accessibility labels, visualization descriptions, and Review Workspace. `en`, the
default `und`, and unsupported tags use the complete English fallback.

For one artifact with both languages, give the primary entry `language: en` or `language: ru` and declare
the other confined Markdown entry under `localizations`. The browser selects the first available language
from `navigator.languages`, falls back to the primary entry, and shows a native language selector only on
the multilingual page. Switching replaces content, metadata, navigation, package chrome, visualizations,
and locale-specific review/response state together. Both variants are compiled locally into the same
artifact; the browser fetches nothing, and the package never machine-translates authored Markdown or CLI
diagnostics.

Every generated report shows a compact footer link, **Made with Agentic Report**, pointing to
`https://agentic-report.witqq.dev/`. Omit `attribution` to keep this default. Set `attribution: false` in
frontmatter or the manifest when the generated artifact must not carry the package attribution; this
removes only the package-owned footer and never rewrites authored links or prose.

Example:

````markdown
---
title: Architecture options
description: Decision report
language: en
layout: document
theme: system
preset: material
scrollProgress: true
attribution: true
tokens:
  font: serif
  width: narrow
  accent: indigo
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

To localize this page, set `localizations.ru` to `report.ru.md` in its frontmatter. The alternate uses the
same source contract, declares `language: ru`, and contains the maintained Russian content, partial references,
and localized visible asset text. Presentation and output metadata stay in the primary entry; an alternate
may set only `contractVersion`, `title`, `description`, and `language`. See the complete paired-file example
in the [source contract](docs/product/source-contract.md#metadata).

See [`docs/product/source-contract.md`](docs/product/source-contract.md) for the complete declarative
source contract.
`source-link` is an optional local-workstation integration: its full absolute path remains in a normal
build even though the page shows a short label. For distribution, run the same build with `--share`; the
compiler derives non-link `filename:line` text from each validated helper, using `source:line` when the
terminal filename is unsafe. An already matching short label remains byte-exact; directory-bearing and
free-form labels are replaced wholesale. Compiler-owned paths are omitted, and the result reports the exact
neutralized count without changing Markdown.

Agents can retrieve the same closed contract through `getSourceContract()`,
`getAuthoringSchema('manifest' | 'directives' | 'source')`, and `listExamples()` from the ESM API. Checked
JSON projections live in [`docs/generated/`](docs/generated/), and
[`examples/manifest.json`](examples/manifest.json) records packaged example identities and source hashes.
The ESM `initProject({ destination, starter? })` operation copies the selected registry-owned starter from
the installed package into an absent destination without overwriting or merging user content.
The package includes report, research, architecture, tutorial, dashboard, and landing-page starters. The
report starter is the default; its stable canonical ID is `basic`, and the clearer `report` alias is also
accepted. The other IDs are `research`, `architecture`, `tutorial`, `dashboard`, and `landing`.
`listExamples()` and `agentic-report examples --json` return starter eligibility, default selection, and
aliases from the same registry metadata. The immediate parent must resolve to an ordinary directory. It may
be a symbolic link, including macOS `/tmp`; `projectPath` reports the resolved destination. The starter is read completely
before the destination is created exclusively; files use no-overwrite creation. A later failure is reported
and may leave the new destination incomplete for explicit inspection and removal. The initializer never
deletes or rolls back destination content.
The ESM `validateReport({ input, format?, review? })` and `inspectReport({ input, format?, review? })` operations run the
same production preparation as `buildReport()` without publishing an artifact. Validation returns the
resolved project, entry, format, runtime placement, and warnings. Inspection additionally returns relative
source-file inventory, observed directives and local-resource occurrence counts, and the registry-derived
command/format/starter/capability catalog.

Review Workspace is opt-in. An ordinary page ships as a document without review chrome; set `review: true` in
frontmatter or the manifest when a reader should discuss fragments. Passing a prior review sidecar with
`--review` turns it on for that build automatically. An enabled page carries an inert deterministic
review-target manifest. Use
`inspectReview({ input, review })` or `agentic-report review <review> [input] --json` to validate a confined
review and resolve each discussion thread to the current Markdown or partial range. Single-language pages
export version 3. Multilingual pages export version 4 with the active `report.locale`, so Node-side review,
build, validate, and inspect route feedback to the matching source variant before binding targets. Valid
version-2 whole-block reviews remain accepted; legacy v2/v3 input uses a unique exact revision when present
and otherwise the primary locale. Stale, changed, missing, and ambiguous targets remain explicit; the
command never rewrites source.
The manifest accepts at most 5,000 reviewable targets and 750,000 serialized bytes; the byte ceiling may
bind first when source-location records are unusually long.

On a review-enabled page, select any eligible text and choose **Create note**; annotation is available
everywhere without a separate review mode or block controls. A selection may cross inline markup or adjacent review targets; its
anchor records both target references and Unicode code-point offsets. The anchored popover shows
the exact quote and keeps compose, reply, edit, resolve, and reopen beside it. Saved open/resolved ranges
remain visibly distinct; hover/tap exposes **View thread**, and focusable markers provide the keyboard route.
Desktop flips, shifts, and clamps the popover within the visual viewport; mobile uses a bounded bottom
surface that follows browser-chrome and on-screen-keyboard viewport changes without reflowing the report.
The contextual action and focus markers are clamped by their measured size to a visible range rectangle and
hide when the saved range is wholly offscreen. A saved-range marker prefers a fully separate position above
or below the text, keeping marker activation and a direct tap on the highlighted text independent.
Navigation, Review, language, and theme use distinct package-owned topbar icons with localized names and title
tooltips. The native language selector remains the locale input and receives visible focus after switching.
At constrained widths the topbar omits visible labels and secondary page identity instead of clipping or
inventing an abbreviation; coarse pointers receive larger targets. Visible contextual controls retain their
labels while 16-pixel pencil/comment icons distinguish Create note from View thread.

The topbar **Review** action opens only a non-reflowing overlay list, prior evidence, import, and one complete
export. Choosing an entry returns to the same anchored popover. Existing whole-block threads remain
list-accessible for version-2/version-3 compatibility, but new threads begin from selected text. Empty,
whitespace-only, oversized, package-control, and outside-report selections create nothing. Ordinary
`decision` and `checklist` directives remain static report content. The complete local flow is in the
[`review-workspace` example](examples/review-workspace/report.md).

Pass `--review review.json` to `build`, `validate`, or `inspect` to consume a confined prior sidecar. Exact
revisions resume current state; stale threads remain prior exact/changed/missing/ambiguous evidence. Continuing
a changed target appends a current revision segment to the same thread, so prior messages and resolution stay
in the one exported sidecar instead of being copied onto a different source target.
Desktop uses a non-modal list overlay; mobile uses a modal sheet. Neither moves the report. State leaves the
page only through explicit local import/export—there is no account, backend, network sync, or authenticated
signature.

Response Workspace is the separate typed-answer layer for triage and decisions. Declarative questions cover
bucket assignment, one or several choices per item, one global choice, priority order, bounded item scores,
global text, and optional item comments. Native fields and buttons provide the complete keyboard path;
bucket cards also support drag-and-drop. The reader copies or downloads the same deterministic
`response.json`, and a foreign, stale, unsupported, or invalid import preserves current-tab answers. The
complete source is [`examples/response-workspace/report.md`](examples/response-workspace/report.md).

The package owns four responsive page layouts: `document`, `dashboard`, `landing`, and `mixed`. Authors
select one as metadata and may choose `material` (default), `monument`, `signal`, `terminal`, or `cinematic`, an
independent `system`, `light`, or `dark` color mode, and compact token overrides for `density`, `font`,
`accent`, `width`, and `radius`. Preset defaults apply first and explicitly authored token values apply
last. `studio` and `editorial` remain accepted compatibility identities for Monument and Material.
Material provides warm editorial reading, Monument provides large-scale staged storytelling, Signal keeps
dense data crisp, Terminal adds console texture and prompt rhythm, and Cinematic stages image-first stories.
These are closed validated values, not CSS or component code.
The reader gets two independent package-owned controls. The light/dark button is on by default;
`themeToggle: false` removes it from a page that must stay in the scheme it was built with.
`presetSwitcher: true` adds a style selector that swaps the preset and its five tokens live without changing
the reader's color scheme. Buildable examples under
`examples/layout-*` demonstrate every layout and are listed by
`agentic-report examples --json`; `examples/interactive-catalog` and `examples/visualization-catalog`
demonstrate the package-owned interaction and data primitives.
Composition tracks expand on large displays while paragraphs keep a separate reading measure. Compact
headings scale down, and action groups wrap at their content width rather than forcing every button across
the screen. Disclosure, modal, popover, filter, toggle, copy, Review and Response controls receive package
icons automatically. Authored trigger labels remain visible on phones; no icon markup or CSS is required.
The visualization catalog includes a 15-node grouped subsystem flow and an ordered compile-request sequence;
both use the same bounded `diagram`/`group`/`node`/`edge` directives and compile offline. Flow layout goes
by layers along the flow, picks its direction and node order itself, keeps every connection on its own path
with its label on it, and needs no tuning. Readers switch between top-to-bottom, left-to-right, and
right-angle views with buttons above the diagram; `layout="auto|down|right|orthogonal"` sets the view shown
first and printed, and `auto` picks the clearest one. Groups surround only the nodes they mean. A connection
says what it is with `kind="call|data|event|dependency"`, a node can add a smaller `detail` line, and
`legend`/`legend-item` title the legend and name kinds and node emphasis in the author's words. Every
diagram is also written out in words under the picture.

Recordings play inside the page. `::video{src="assets/run.webm" poster="assets/frame.png" caption="…"}` or a
plain `![Alt](assets/run.webm)` becomes a muted, looping `<video>` with controls, embedded in single-file
output and copied beside `index.html` in directory output. It starts while on screen and waits for the reader
who prefers reduced motion.

Use `:::copyable` for prose that a reader should paste into a message or handoff. Paragraphs, emphasis,
links, proportional typography, and wrapping remain ordinary Markdown; the localized Copy control writes
only visible rendered text rather than Markdown or HTML.

Authors may replace heading-only structure with top-level `section` directives. Each section owns a
visible H2 and stable anchor. Start with `recipe="hero|evidence|story|rail|metrics"` for a coherent
high-level composition; any explicitly authored detailed attribute overrides only its matching recipe role.
Closed visual attributes compose package-owned arrangements (`flow`, `stage`,
`split`, `mosaic`, `story`, `stack`), bounded viewport rhythm, compact/editorial/immersive density,
body/display/editorial typography, natural/masked/layered/gallery/bleed media, image fit/aspect/focal point,
and plain/mesh/glow/grain/grid surfaces. They are semantic choices, not CSS or component code; multi-column
and layered arrangements return to authored order on narrow screens, and gallery overflow stays local. A
multi-item gallery shows compact continuation and becomes a localized arrow-key focus target only while its
rail actually overflows; the scroll-only semantics disappear when a wide owner fits every item. Every
section contains its floats and local layer order. A media stage uses a full-width title row with supporting
content and media composed below; gallery stages keep their separate title/rail arrangement, while split
returns to flow before desktop navigation can make its tracks unreadable.
Because mosaic/stack and layers/gallery would both own the same card layout, those four combinations fail
before rendering; use flow/stage/split/story with layered/gallery media or natural/mask/bleed media with
mosaic/stack.
`transition="reveal|stagger"`, `scene="progress|sticky"`, `interaction="depth|tilt"`, and
`choreography="cascade"` add bounded package-owned motion. Without a recipe these roles default to `none`; legacy
`reveal="true"` remains supported. A nested `actions` group composes ordinary safe links with
primary/secondary/quiet emphasis, `auto|edge|inline|bottom` placement, and an optional primary-only
`magnetic` effect. Mobile bottom placement remains compact normal-flow content rather than a sticky overlay.
Add `href` to a `card` when the whole card is one destination. The compiler reuses the safe-link contract,
rejects nested links, and renders one keyboard focus target with a persistent link icon; cards without
`href` remain informational articles.
Legacy heading documents remain valid;
their H2 headings define the primary navigation while H3 and component anchors remain owned descendant
targets.

```markdown
::::section{title="A visual argument" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="mesh" transition="stagger" scene="progress" choreography="cascade"}
The content remains ordinary Markdown and semantic directives.
::::
```

Use the packaged `layout-mixed` example as the complete bilingual composition reference. The exact domains
and defaults are in the
[`section` source contract](docs/product/source-contract.md#semantic-primitives) and machine-readable
directive schema.

Recipes include their motion: `hero` combines stagger with a scroll-driven scene, `evidence` uses reveal,
`story` combines reveal with a scroll-driven scene, `rail` uses stagger, and `metrics` combines stagger with
cascade. To use pointer depth on a hero instead, set `recipe="hero" scene="none" interaction="depth"`.
Keep the remaining defaults and add a confined local image; the package handles responsive framing and
reduced motion. See [`motion-showcase`](examples/motion-showcase/report.md) for a complete composition.

Place `::contents` at the document root to keep a generated route map inside the article. Its native links
use exact visible section headings and final collision-free targets; optional short `nav` labels remain in
the sidebar. The map stays visible at narrow widths and still renders with zero or one primary section,
while sidebar/mobile-dialog chrome continues to require at least two.

Inside a `section`, place one opening `:::lead` containing exactly one Markdown paragraph when the first
thesis needs restrained in-flow emphasis rather than a callout. The lead must be the section's first block
and accepts no attributes. A glossary definition with `placement="appendix"` may be authored at the document
root or directly inside that section; the compiler removes it from the section and keeps its existing full-
definition target in the single ordered appendix. Lists, quotes, lead blocks, and unrelated directives do
not become valid appendix parents.

Pages with at least two eligible sections receive one responsive contents navigation. Desktop readers can
collapse the non-modal sidebar without persisting state; mobile readers get a labelled native dialog with
contained focus and focus return. Exactly one link exposes `aria-current="location"`, including for
descendant and outside hashes. `scrollProgress: true` enables a decorative progress line. Progress and
section motion are entirely absent under reduced motion; content remains visible and navigation semantics
remain available. Reveal activates when any part of a section enters the viewport, including sections taller
than the screen. Entrance and cascade sequences are capped at 12 items; pointer depth, tilt, and magnetic
movement run only for a fine pointer, while scene progress and pointer updates are visibility-bound and
animation-frame-coalesced. Authors choose semantic roles, not timings, coordinates, easing, or scripts.
If `IntersectionObserver` is unavailable or non-callable, observer-dependent motion and pointer enhancement
remain inert, baseline content stays readable, and navigation uses its bounded geometry fallback.

## Public example portfolio

The packaged portfolio includes complete pages built through the same public source and compiler paths:

| Example                                                    | Reader job                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`layout-mixed`](examples/layout-mixed/)                   | Inspect the complete visual grammar and component range                                                        |
| [`interactive-catalog`](examples/interactive-catalog/)     | Exercise package-owned interactions                                                                            |
| [`visualization-catalog`](examples/visualization-catalog/) | Read the complete chart, diagram, and timeline range                                                           |
| [`terminal-portfolio`](examples/terminal-portfolio/)       | Present systems work through console rhythm, scan treatment, and linked evidence                               |
| [`cinematic-story`](examples/cinematic-story/)             | Follow an image-first story through staged media, scroll progress, and a gallery rail                          |
| [`executive-brief`](examples/executive-brief/)             | Compose a Monument decision narrative with evidence cards, a timeline, local imagery, and a handoff            |
| [`motion-showcase`](examples/motion-showcase/)             | Explore pointer depth, scrolling media, a gallery rail, cascade, and the content-complete reduced-motion state |
| [`incident-review`](examples/incident-review/)             | Reconstruct a fictional service incident, inspect evidence, and filter accountable follow-up                   |
| [`vendor-decision`](examples/vendor-decision/)             | Separate mandatory procurement gates from weighted preference and approve a conditional path                   |
| [`launch-readiness`](examples/launch-readiness/)           | Judge a fictional regional beta from audience value, funnel evidence, launch gates, and a reversible rollout   |
| [`review-workspace`](examples/review-workspace/)           | Create, reopen, resolve, and export selected-text discussion threads                                           |
| [`response-workspace`](examples/response-workspace/)       | Return typed triage, choices, ordering, scores, and comments                                                   |

Every packaged starter, layout example, catalog, workspace example, realistic showcase, and the public
landing pairs its canonical English source with a maintained Russian entry. A generated artifact chooses
the system-preferred available language initially and keeps the selector available for manual switching.

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
the build input. These examples remain discovery-only and do not change the six `init` starters.

`agentic-report fix ./my-report` applies the replacements the product computed exactly and leaves every
other byte alone. Today one check computes them: the term reference that a registered glossary term is
missing. It is the only command that writes to an authored source.

Every command answers an agent without a flag, because agents are who run this package: `init`, `build`,
`validate`, `inspect`, `fix` and `review` write NDJSON records, and `schema`, `describe` and `examples`
write their one reference document as a compact JSON line. `--json` is accepted and names that default. Add
`--human` when a person is reading — it prints prose from `init`, `build`, `validate`, `fix`, `review` and
`examples`, and the same document indented from `inspect`, `schema` and `describe`.

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
node dist/node/cli.js init ./research-brief --starter research
node dist/node/cli.js build examples/basic --output report.html
node dist/node/cli.js build examples/basic --format directory --output report-dir
node dist/node/cli.js validate ./my-report
node dist/node/cli.js inspect ./my-report --json
node dist/node/cli.js describe --json
node dist/node/cli.js schema
node dist/node/cli.js schema --scope directives
node dist/node/cli.js schema --scope source
node dist/node/cli.js examples --json
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
npx agentic-report init ./my-report --starter report
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

| Format        | Result                                                        |
| ------------- | ------------------------------------------------------------- |
| `single-file` | One HTML file containing styles, runtime, and local resources |
| `directory`   | `index.html` plus content-hashed package and source resources |

Both formats contain the same package-owned interactive behavior. `single-file` embeds the runtime;
`directory` writes it as a content-addressed local asset. Runtime placement is not a source or CLI option.
Remote asset fetching and executable templates are not supported.

Page layout and preset are independent of output format: the same declarative source can be built as
either one file or a directory artifact. Both paths preserve the selected preset, resolved page tokens,
responsive navigation, local assets, CSP, and `file://` behavior.

There is no public plugin or author-code execution API. Proposed declarative extensions are evaluated
against the checked [`extension proposal schema`](docs/generated/extension-proposal.schema.json), which
enforces the current no-code/no-network trust boundary and requires explicit portability, security,
accessibility, performance, dependency, license, and compatibility evidence before implementation.

The compiler rejects an output path that resolves to, or shares a filesystem identity with, the entry,
manifest, partial, or local asset. Both formats are prepared before publication. A single file is written
exclusively to a private sibling path, closed, and atomically renamed; a directory is assembled in a
private sibling directory and published by rename. Injected write and rename failures preserve any
previous authoritative output, remove compiler-owned staging paths, and allow an immediate retry.
`output.maxInlineBytes` is a warning threshold over the exact serialized inline CSS, package runtime, and
image/download data-URL occurrences. Font data URLs are counted once through the serialized stylesheet.

### Pages served on the web

Declare the address a page is served from as `url` in its metadata, or pass `--url` to `build`:

```bash
agentic-report build ./site-source --format directory --url https://example.com/guide/ --output ./public/guide
```

The page head then carries `<link rel="canonical">`, OpenGraph (`og:url`, `og:title`, `og:description`,
`og:locale` and the other embedded language as `og:locale:alternate`) and a Twitter card. An optional local
`image` becomes an absolute `og:image` for link previews in a directory build. Build public pages as
`directory`: Googlebot reads only the first 2,097,152 bytes of an HTML file, and directory output keeps
images, fonts, styles and the runtime out of the HTML. A public page above that size reports
`PUBLIC_PAGE_OVER_CRAWLER_LIMIT`.

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
