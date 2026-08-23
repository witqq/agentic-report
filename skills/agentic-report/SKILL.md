---
name: agentic-report
description: Create, validate, inspect, or build polished local interactive reports, research pages, architecture pages, tutorials, dashboards, decisions, and landing pages from declarative Markdown. Use for static agent-to-human page handoff; do not use for hosted apps, live collaboration, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.2.5'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run.
---

# agentic-report

Create a local declarative source, verify it, and hand the user a finished interactive HTML artifact.

## Work within the product boundary

- Select `report`, `research`, `architecture`, `tutorial`, `dashboard`, or `landing` for the requested page.
- Author Markdown, YAML frontmatter or the optional manifest, supported directives, confined Markdown
  partials, and local assets. Do not introduce JSX, raw HTML, browser JavaScript, CSS, executable
  templates, plugins, or remote source fetching.
- Treat missing content facts as unresolved inputs; do not invent operational evidence, identities, or
  metrics.
- Do not deploy, publish, use credentials, or mutate unrelated files. This skill authorizes only local
  installation, source authoring, validation, inspection, build, and artifact review.

## Build a reproducible page

Use the release pinned in this skill:

```sh
npx --yes agentic-report@0.2.5 init ./my-page --starter landing --json
npx --yes agentic-report@0.2.5 validate ./my-page --json
npx --yes agentic-report@0.2.5 inspect ./my-page --json
npx --yes agentic-report@0.2.5 build ./my-page --output ./my-page.html --json
```

Choose a different starter or destination name when the task requires it. `init` requires an absent
destination whose immediate parent already exists. The first `npx` call requires registry/network access.

Edit the generated source before validation. Resolve every structured diagnostic at its reported file and
range, then rerun `validate --json` and `inspect --json`. Build only after both succeed. Open the result
through normal `file://`; use `--format directory` only when a multi-file output is intentionally needed.

Report the source path, artifact path, chosen starter/output format, warnings, and unresolved content facts.

## Retrieve details only when needed

Start with the same-origin [agent quickstart](https://agentic-report.witqq.dev/docs/agent/index.md).
Use the linked hosted reference or source contract for exact syntax. Against the installed package,
`describe --json`, `schema --scope source`, and `examples --json` are the machine-readable runtime truth.
