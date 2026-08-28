# Agent quickstart

Use Node.js 24.18.0 or newer. The first `npx` command needs npm registry and network access; the generated
page itself opens locally through `file://` with its included package-owned browser runtime.

For a reproducible 0.4.1 run, create a new landing-page source and keep the package version pinned through
validation, inspection, and build:

```sh
npx --yes agentic-report@0.4.1 init ./my-page --starter landing --json
npx --yes agentic-report@0.4.1 validate ./my-page --json
npx --yes agentic-report@0.4.1 inspect ./my-page --json
npx --yes agentic-report@0.4.1 build ./my-page --output ./my-page.html --json
```

Open `my-page.html` through `file://`. Edit only the declarative source: Markdown, YAML frontmatter or the
optional YAML/JSON manifest, confined Markdown partials, and local assets. Authors do not need React,
JSX, browser JavaScript, CSS, or a frontend project.

The shorter current-channel journey is:

```sh
npx --yes agentic-report init ./my-page --starter landing --json
npx --yes agentic-report validate ./my-page --json
npx --yes agentic-report inspect ./my-page --json
npx --yes agentic-report build ./my-page --output ./my-page.html --json
```

Open the generated page and select **Review** when the human needs to discuss exact fragments. After the
reader downloads `review.json`, map it back to the authored files with:

```sh
npx --yes agentic-report review review.json ./my-page --json
```

Review version 2 stores ordered user/agent messages and resolved state in one local sidecar; it is not an
account, signature, or hosted collaboration service. Decision/checklist directives remain document content.

For a repeat review, pass the prior local artifact with `build --review review.json`. Never copy a prior page
thread into changed content; inspect bindings, continue the current discussion, and export the next revision.
The sidecar keeps immutable historical revision segments and one editable current segment per thread, so the
complete conversation remains in one file without rewriting old target identities.

Use the pinned form for repeatable agent work. Use the unpinned form only when intentionally accepting the
registry's current `latest` release.

## Choose a starter

- `report` for a general report or work summary.
- `research` for evidence, findings, and limits.
- `architecture` for constraints, alternatives, and decisions.
- `tutorial` for ordered teaching material.
- `dashboard` for dense status and metrics.
- `landing` for a product or project page.

`npx --yes agentic-report examples --json` lists the installed starters and realistic showcase sources.

## Inspect the contract

Use the CLI as the runtime source of truth:

```sh
npx --yes agentic-report@0.4.1 describe --json
npx --yes agentic-report@0.4.1 schema --scope source
npx --yes agentic-report@0.4.1 examples --json
```

Read the [complete agent reference](../AGENT-REFERENCE.md), the [declarative source contract](../product/source-contract.md),
or the [agentic-report skill](../../skills/agentic-report/SKILL.md) when more guidance is needed.

## Boundaries

The tool reads local source and writes a static page. It does not deploy, publish, fetch remote source,
use credentials, host an editor, or provide live collaboration. Remote assets, raw HTML, executable
templates, and author JavaScript are not supported.
