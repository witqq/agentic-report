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
- local images referenced by relative paths;
- Markdown partials included as `{{include: partials/summary.md}}`;
- semantic directives for labelled page sections, action and source-location links, authored/code glossary references, content, interactions, compile-time
  charts/diagrams/timelines, safe built-in demos, downloads, and fonts.

Example:

````markdown
---
title: Architecture options
description: Decision report
layout: document
theme: system
preset: editorial
scrollProgress: true
tokens:
  font: serif
  width: narrow
  accent: indigo
---

# Architecture options

{{include: partials/context.md}}

![System boundary](assets/system.svg)

::::section{title="Decision" id="decision" nav="Decision" width="reading" align="start" tone="soft" reveal="true"}
:::callout{title="Key finding" kind="info"}
The compiler owns responsive layout and navigation.
:::

:::actions
::action[Review the decision]{href="#decision" kind="primary"}
::action[Open the evidence]{href="evidence.html" kind="secondary"}
:::

Inspect :source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}.

Traversal continues through :term[concepts]{key="concept"}.

```typescript terms="concept"
const concept = compileSource();
```

::::

:::glossary{key="concept" term="concept" placement="appendix"}
One canonical definition shared by prose forms and selected first code occurrences.
:::
````

See [`docs/product/source-contract.md`](docs/product/source-contract.md) for the complete declarative
source contract.
`source-link` is an optional local-workstation integration: its full absolute path remains in the generated
HTML even though the page shows a short label. Remove or replace it before public distribution when local
directory disclosure or machine-specific links are not acceptable.

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
aliases from the same registry metadata. The immediate parent must already be an ordinary directory. The starter is read completely
before the destination is created exclusively; files use no-overwrite creation. A later failure is reported
and may leave the new destination incomplete for explicit inspection and removal. The initializer never
deletes or rolls back destination content.
The ESM `validateReport({ input, format?, review? })` and `inspectReport({ input, format?, review? })` operations run the
same production preparation as `buildReport()` without publishing an artifact. Validation returns the
resolved project, entry, format, runtime placement, and warnings. Inspection additionally returns relative
source-file inventory, observed directives and local-resource occurrence counts, and the registry-derived
command/format/starter/capability catalog.

Generated pages also carry an inert deterministic review-target manifest. Use
`inspectReview({ input, review })` or `agentic-report review <review> [input] --json` to validate a confined
version-2 `review.json` and resolve each discussion thread to the current Markdown or partial range. Stale, changed,
missing, and ambiguous targets remain explicit; the command never rewrites source.

In the generated page, `Review` opens a local discussion layer. Readers open a thread on an exact block,
accumulate and edit messages, read agent replies, resolve or reopen the thread, and download all threads as
deterministic `review.json`. Ordinary `decision` and `checklist` directives remain static report content.

Pass `--review review.json` to `build`, `validate`, or `inspect` to consume a confined prior sidecar. Exact
revisions resume current state; stale threads remain prior exact/changed/missing/ambiguous evidence. Continuing
a changed target appends a current revision segment to the same thread, so prior messages and resolution stay
in the one exported sidecar instead of being copied onto a different source target.
Desktop uses a non-modal rail; mobile uses a modal sheet. State leaves the page only through explicit local
import/export—there is no account, backend, network sync, or authenticated signature.

The package owns four responsive page layouts: `document`, `dashboard`, `landing`, and `mixed`. Authors
select one as metadata and may choose the coordinated `studio`, `editorial`, or `signal` preset, an
independent `system`, `light`, or `dark` color mode, and compact token overrides for `density`, `font`,
`accent`, `width`, and `radius`. Preset defaults apply first and explicitly authored token values apply
last. The `editorial` preset is the Field Manual system for warm long-form pages with compact controls,
numbered contents, and package-owned action icons. These are closed validated values, not CSS or component code. Buildable examples under
`examples/layout-*` demonstrate every layout and are listed by
`agentic-report examples --json`; `examples/interactive-catalog` and `examples/visualization-catalog`
demonstrate the package-owned interaction and data primitives.

Authors may replace heading-only structure with top-level `section` directives. Each section owns a
visible H2 and a stable anchor, plus closed reading/standard/wide tracks, start/center alignment, and
plain/soft/accent/contrast tones. `reveal="true"` opts one section into a bounded one-time normal-motion
reveal. A nested `actions` group composes ordinary safe links with primary/secondary/quiet emphasis.
Legacy heading documents remain valid; their H2 headings define the primary navigation while H3 and
component anchors remain owned descendant targets.

Pages with at least two eligible sections receive one responsive contents navigation. Desktop readers can
collapse the non-modal sidebar without persisting state; mobile readers get a labelled native dialog with
contained focus and focus return. Exactly one link exposes `aria-current="location"`, including for
descendant and outside hashes. `scrollProgress: true` enables a decorative progress line. Progress and
section-reveal DOM work are entirely absent under reduced motion; navigation semantics remain available.

## Realistic showcase portfolio

Three non-starter examples show complete decision-oriented pages built through the same public source and
compiler paths:

| Example                                          | Reader job                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [`incident-review`](examples/incident-review/)   | Reconstruct a fictional service incident, inspect evidence, and filter accountable follow-up                 |
| [`vendor-decision`](examples/vendor-decision/)   | Separate mandatory procurement gates from weighted preference and approve a conditional path                 |
| [`launch-readiness`](examples/launch-readiness/) | Judge a fictional regional beta from audience value, funnel evidence, launch gates, and a reversible rollout |

From a repository or package-source checkout, validate and rebuild them with the public CLI:

```bash
agentic-report validate ./examples/incident-review
agentic-report build ./examples/incident-review --output ./incident-review.html
agentic-report build ./examples/vendor-decision --output ./vendor-decision.html
agentic-report build ./examples/launch-readiness --output ./launch-readiness.html
agentic-report build ./examples/launch-readiness --format directory --output ./launch-readiness-directory
```

Open the HTML file or directory `index.html` directly through `file://`. In an installed package,
`agentic-report examples --json` returns each absolute installed entry path; use its containing directory as
the build input. These examples remain discovery-only and do not change the six `init` starters.

## Product-built landing

The canonical public landing is itself an ordinary compiler input at
[`website/landing`](website/landing/). It uses only supported Markdown, frontmatter, semantic directives,
and local screenshots generated from the three fictional showcases. Build it through the same public path
as any user page:

```bash
agentic-report validate ./website/landing --json
agentic-report inspect ./website/landing --json
agentic-report build ./website/landing --output ./landing.html --json
agentic-report build ./website/landing --format directory --output ./landing-directory --json
```

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
node dist/node/cli.js validate ./my-report
node dist/node/cli.js inspect ./my-report --json
node dist/node/cli.js build examples/basic --output report.html
node dist/node/cli.js build examples/basic --format directory --output report-dir
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
printf '\n![Remote asset used to test diagnostics](https://local.invalid/image.png)\n' >> ./my-report/report.md
! npx agentic-report validate ./my-report --json
! npx agentic-report inspect ./my-report --json
sed -i.bak '/Remote asset used to test diagnostics/d' ./my-report/report.md
npx agentic-report validate ./my-report --json
npx agentic-report inspect ./my-report --json
npx agentic-report build ./my-report --output ./report.html --json
```

The two broken-source commands must return `REMOTE_ASSET_BLOCKED` without creating or replacing output.
After the offending Markdown line is removed, validation and inspection succeed and the final command
creates `report.html`. `scripts/check-package.ts` executes this same installed-package recovery route with
credential-bearing diagnostics and output sentinels.

Install and use the published package with:

```bash
npx agentic-report build ./report-source --output report.html
npm install --global agentic-report
agentic-report init ./my-report
agentic-report validate ./my-report
agentic-report inspect ./my-report --json
agentic-report review ./review.json ./my-report --json
agentic-report build ./report-source --output report.html
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
