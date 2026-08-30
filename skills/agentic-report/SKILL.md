---
name: agentic-report
description: Create, validate, inspect, or build polished local interactive reports, research pages, architecture pages, tutorials, dashboards, decisions, and landing pages from declarative Markdown. Use for static agent-to-human page handoff; do not use for hosted apps, live collaboration, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.5.0'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run.
---

Use Review Workspace for local fragment discussion threads: ordered user/agent messages, editing and
resolved/reopened state exported together as deterministic version-2 `review.json`. Never imply an account
or signature. For a follow-up build, pass a confined prior artifact with `build --review review.json`; treat
stale bindings as immutable prior revision segments, append a current segment when continuing a changed
fragment, and export the next revision. Never rewrite Markdown. Ordinary typed
`decision`/`decision-option` and `checklist`/`check-item` syntax remains static report content.

# agentic-report

Create a local declarative source, verify it, and hand the user a finished interactive HTML artifact.

## Work within the product boundary

- Select `report`, `research`, `architecture`, `tutorial`, `dashboard`, or `landing` for the requested page.
- Author Markdown, YAML frontmatter or the optional manifest, supported directives, confined Markdown
  partials, and local assets. Do not introduce JSX, raw HTML, browser JavaScript, CSS, executable
  templates, plugins, or remote source fetching.
- Treat missing content facts as unresolved inputs; do not invent operational evidence, identities, or
  metrics.
- Use Response Workspace when the human must return structured triage, choices, ordering, scores, text, or
  item comments. Keep it separate from Review Workspace discussion threads, and tell the user to copy or
  download `response.json` after completing the local page.
- Write clock times and durations normally (`21:01`, `1:30:05`); do not add backslash escaping in prose or
  frontmatter.
- Use `copyable` for prose the reader should paste elsewhere; do not misrepresent ordinary language as a
  code fence merely to obtain a Copy button.
- Use top-level `::contents` when the reader needs the complete section route inside the article or print/file
  handoff. Do not author a parallel list: the compiler uses exact final section headings and targets while
  keeping optional short `nav` labels in sidebar chrome.
- Use one opening `:::lead` inside a `section` for its thesis, not a callout. When a glossary definition
  belongs beside that explanation but should print in the reference appendix, keep it as a direct section
  child with `placement="appendix"`; do not move it to a separate hand-maintained source list.
- When a finished artifact containing `source-link` will leave the source workstation, build it with
  `--share` and report the returned `neutralizedSourceLinks` count. Keep the default build when local editor
  links are part of the requested handoff; share output derives path-free filename/line labels from validated
  helpers and uses `source:line` when a terminal is unsafe. Directory-bearing and free-form authored labels
  remain available only in the default workstation build.
- Do not deploy, publish, use credentials, or mutate unrelated files. This skill authorizes only local
  installation, source authoring, validation, inspection, build, and artifact review.

## Build a reproducible page

Use the release pinned in this skill:

```sh
npx --yes agentic-report@0.5.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.5.0 validate ./my-page --json
npx --yes agentic-report@0.5.0 inspect ./my-page --json
npx --yes agentic-report@0.5.0 build ./my-page --output ./my-page.html --json
```

Choose a different starter or destination name when the task requires it. `init` requires an absent
destination whose immediate parent already exists. The first `npx` call requires registry/network access.

Edit the generated source before validation. Resolve every structured diagnostic at its reported file and
range, then rerun `validate --json` and `inspect --json`. Build only after both succeed. Open the result
through normal `file://`; use `--format directory` only when a multi-file output is intentionally needed.

Report the source path, artifact path, chosen starter/output format, warnings, and unresolved content facts.

## Respect source-review requirements

If the user does not trust the published npm package, do not run it through `npx`. Clone the release tag
pinned by this skill, expose the checked commit for review, and run the locally compiled CLI:

```sh
git clone --branch v0.5.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD
pnpm install --frozen-lockfile
pnpm verify
pnpm build
node dist/node/cli.js init ../my-page --starter report --json
```

Substitute `node dist/node/cli.js` for every `npx --yes agentic-report@0.5.0` command above. Keep page
sources and outputs outside the cloned repository.

Explain that this avoids executing the `agentic-report` npm package but is not registry-free:
`pnpm install` still downloads the dependencies pinned in `pnpm-lock.yaml`, and the project does not vendor
them. Never describe a source checkout as audited merely because the source is visible.

## Retrieve details only when needed

Start with the same-origin [agent quickstart](https://agentic-report.witqq.dev/docs/agent/index.md).
Use the linked hosted reference or source contract for exact syntax. Against the installed package,
`describe --json`, `schema --scope source`, and `examples --json` are the machine-readable runtime truth.
