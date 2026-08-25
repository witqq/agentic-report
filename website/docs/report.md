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

::::section{title="Start here" id="start" nav="Start" width="standard" align="start" tone="soft" reveal="true"}

Use Node.js 24.18.0 or newer. Start with the [agent quickstart](agent/index.html), retrieve the
[direct Markdown version](agent/index.md), or install the [agent skill](../skills/agentic-report/SKILL.md).

:::actions
::action[Open the quickstart]{href="agent/index.html" kind="primary"}
::action[Read agent Markdown]{href="agent/index.md" kind="secondary"}
::action[Inspect llms.txt]{href="../llms.txt" kind="quiet"}
:::

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

Generated pages include a local Review Workspace. A reader can attach comments or blockers to exact blocks,
set independent block and overall verdicts, and download deterministic `review.json`. Desktop uses a
non-modal rail; mobile uses a modal sheet. No feedback is uploaded or stored in an account.

Authors may add stable typed decision options and required/optional checklist items. Reviewers can select,
leave open, defer, check, or explain not-applicable state. Unresolved required controls block approval, and
the same canonical JSON resumes locally. Markdown-only decisions remain static.

An agent resolves the downloaded review against the current source with:

```sh
agentic-report review ./review.json ./my-page --json
```

The result names exact, changed, missing, or ambiguous entry/partial targets without rewriting Markdown.

Use `build --review review.json` for a follow-up artifact. Exact state resumes; stale feedback is labelled
prior exact/changed/missing/ambiguous evidence until the reviewer completes and exports the new revision.

::::

::::section{title="Output and operation" id="output" nav="Output" width="standard" align="start" tone="soft" reveal="true"}

- `single-file` is the default: one portable HTML file with embedded local resources and runtime.
- `directory` writes `index.html` plus content-hashed resources for larger pages.
- Both formats open through normal `file://` and preserve the same supported interactions.
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
