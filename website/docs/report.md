---
title: agentic-report documentation
description: Human and agent documentation for the local declarative interactive-page builder.
language: en
layout: document
theme: system
preset: editorial
scrollProgress: true
---

# Build the page, not a frontend project

`agentic-report` turns Markdown, compact metadata, confined partials, and local assets into a polished
interactive HTML page. The default is one self-contained file; directory output keeps the same behavior
with content-addressed assets.

::contents

::::section{title="Start here" id="start" nav="Start" width="standard" align="start" tone="soft" reveal="true"}

:::lead
Write the opening thesis as one emphasized prose paragraph, not as a callout or custom HTML component.
:::

Use Node.js 24.18.0 or newer. Start with the [agent quickstart](agent/index.html), retrieve the
[direct Markdown version](agent/index.md), or install the [agent skill](../skills/agentic-report/SKILL.md).

:::actions
::action[Open the quickstart]{href="agent/index.html" kind="primary"}
::action[Read agent Markdown]{href="agent/index.md" kind="secondary"}
::action[Inspect llms.txt]{href="../llms.txt" kind="quiet"}
:::

::::

::::section{title="Build from source" id="source-install" nav="From source" width="standard" align="start" tone="accent" reveal="true"}

If you prefer to inspect the implementation instead of executing the published `agentic-report` npm
package, clone a specific release tag and run the compiler directly from its build:

```sh
git clone --branch v0.7.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD

# Review the source, package.json, pnpm-lock.yaml, and lifecycle scripts first.
pnpm install --frozen-lockfile
pnpm verify
pnpm build

node dist/node/cli.js init ../my-page --starter report --json
node dist/node/cli.js build ../my-page --output ../my-page.html --json
```

This path does not install or execute the `agentic-report` package from npm. It still uses the npm registry
for the exact dependencies pinned by `pnpm-lock.yaml`; dependencies are not vendored. Review the lockfile
and scripts before installation, use an isolated environment if your threat model requires it, and keep the
tag pinned so later commands continue to use the revision you inspected.

::::

::::section{title="Validate, explain, and repair" id="diagnostics" nav="Diagnostics" width="standard" align="start" tone="soft" reveal="true"}

The CLI registers nine discoverable commands: `init`, `validate`, `inspect`, `build`, `fix`, `review`,
`describe`, `schema`, and `examples`. Agent output is the default—NDJSON for run commands and one compact
JSON line for reference commands. `--json` explicitly names that default; `--human` selects prose or
indented JSON without dropping diagnostic facts.

One directive pass returns every independent authored violation it found. The first diagnostic carries the
rest in `related`, ordered by source position, while declared dependencies suppress only conclusions that
would rely on an already refused interpretation. Inspect those dependencies without compiling through
`describe` → `authoredRules`.

When a diagnostic contains an exact source-range `fix`, run `agentic-report fix ./my-page`. It is the only
command that writes authored Markdown and changes only the computed ranges; `validate`, `inspect`, `build`,
and `review` remain read-only. Glossary definitions may declare exact inflections with `forms`; the compiler
does not guess morphology. `init` accepts a symbolic-link parent such as macOS `/tmp`, reports the resolved
destination, and still refuses every existing destination.

::::

:::::section{title="Authoring contract" id="authoring" nav="Authoring" width="wide" align="start" tone="plain" reveal="true"}

Authors write declarative source rather than application code. Use Markdown for content, frontmatter or a
manifest for page settings, allowlisted semantic directives for components, confined Markdown partials
for composition, and local assets for media and downloads.

::::cards
:::card{title="Agent reference"}
Commands, JSON output, starters, components, layouts, themes, diagnostics, and output behavior.

[Read the reference](AGENT-REFERENCE.md)
:::
:::card{title="Source contract"}
The authoritative syntax, confinement boundary, output modes, and security model.

[Read the source contract](product/source-contract.md)
:::
:::card{title="Live discovery"}
Run `describe --json`, `schema`, and `examples --json` against the installed release for machine-readable
runtime truth.
:::
::::

:::::

::::section{title="Review and return feedback" id="review" nav="Review" width="standard" align="start" tone="accent" reveal="true"}

Generated pages include a local Review Workspace. A reader opens a discussion thread on an exact block,
adds or edits messages, reads agent replies, resolves or reopens the thread, and downloads deterministic
version-2 `review.json`. Desktop uses a non-modal rail; mobile uses a modal sheet. Nothing is uploaded or
stored in an account; ordinary decisions and checklists remain static report content.
The target manifest is bounded to 5,000 reviewable blocks and 750,000 serialized bytes; unusually large
handoffs must stay under both limits or be split.

An agent resolves the downloaded review against the current source with:

```sh
agentic-report review ./review.json ./my-page --json
```

The result names exact, changed, missing, or ambiguous entry/partial targets without rewriting Markdown.

Use `build --review review.json` for a follow-up artifact. Exact state resumes; stale threads are labelled
prior exact/changed/missing/ambiguous evidence. Continuing a changed fragment appends a current revision
segment to the same exported thread, retaining every prior user/agent message and resolution state.

When the reader must return typed values instead of discussion, use Response Workspace. It supports bucket
triage, per-item and global choices, priority ordering, bounded scores, free text, and sparse item comments.
The page keeps state only in the current tab and exports the same deterministic response through clipboard
and file download. [Open the complete live example](../examples/response-workspace/index.html) or inspect
its [declarative source](../examples/response-workspace/report.md).

Use `copyable` when ordinary prose should be pasted elsewhere. It keeps Markdown typography/wrapping and
copies only visible rendered text through the localized package control.

::::

::::section{title="Output and operation" id="output" nav="Output" width="standard" align="start" tone="soft" reveal="true"}

- `single-file` is the default: one portable HTML file with embedded local resources and runtime.
- `directory` writes `index.html` plus content-hashed resources for larger pages.
- Both formats open through normal `file://` and preserve the same supported interactions.
- Both formats show a bottom **Made with Agentic Report** link by default. Set root metadata
  `attribution: false` to omit only that package footer.
- Top-level `::contents` keeps an exact compiler-generated section map in the article and on narrow screens;
  short `section.nav` labels remain exclusive to sidebar/mobile navigation.
- A section may start with one bounded `:::lead` paragraph. Appendix glossary definitions may be direct
  section children and compile into the existing ordered appendix without leaving an in-flow placeholder.
- `build --share` derives path-free non-link filename/line text from each validated source helper, falls back
  to `source:line` for unsafe terminals, omits workstation paths and authored directory/free-form labels, and
  reports the exact count without editing Markdown.
- The compiler neither hosts nor deploys the result and never fetches remote source.

The public [landing](../index.html), [incident review](../examples/incident-review/index.html),
[vendor decision](../examples/vendor-decision/index.html), and
[launch readiness page](../examples/launch-readiness/index.html) are all built through this same contract.

::::

::::section{title="Release identity" id="release" nav="Release" width="standard" align="start" tone="contrast"}

[`release.json`](../release.json) records the package version, source revision, and hashes for the exact
staged files. The hosted site is accepted only after ordinary trusted HTTPS, real route/MIME checks, and
a real 404 prove that a static host is not serving a catch-all shell.

:::actions
::action[Inspect release metadata]{href="../release.json" kind="secondary"}
::action[Open source repository]{href="https://github.com/witqq/agentic-report" kind="quiet"}
:::

::::
