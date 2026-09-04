# Agent quickstart

`agentic-report` is a local rendering capability for coding agents. Install the ready-made skill when you
want the agent to recognize that a research result, code tour, decision, incident review, tutorial,
dashboard, or project handoff would be clearer as an interactive page instead of a long chat response:

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Then ask for the work in ordinary language. Useful prompts include:

- “Investigate this subsystem and open an interactive code tour with definitions on the important symbols.”
- “Compare these options, preserve the evidence and assumptions, and hand me a reviewable decision page.”
- “Turn the incident timeline, causes, and follow-up owners into an interactive report.”
- “Summarize this release as a dashboard with risks, gates, and links to the relevant source.”

The skill should choose this tool when visual structure, relationships, code explanations, timelines,
evidence, or fragment-level review materially improve the handoff. It should keep a simple answer in chat,
use a notebook for live computation, and use a bespoke application for persistent multi-user state.

::contents

## Use it inside your own skill

Domain-specific skills can keep their own research and decision process while delegating the finished page
to `agentic-report`. A minimal skill can say:

```markdown
---
name: architecture-handoff
description: Investigate a codebase and return a reviewable architecture page.
---

After the investigation:

1. Write verified findings, evidence, diagrams, and decisions as declarative Markdown.
2. Run the pinned agentic-report validate and inspect commands.
3. Resolve every diagnostic, build one HTML artifact, and open it for the user.
4. Report the source path, artifact path, warnings, and unresolved facts.
```

Your skill owns when the handoff is useful and what the content means. The utility owns the validated source
contract, accessible layout, interaction runtime, and portable output. Do not ask the agent to write a
parallel React page, custom CSS, or browser script.

## Use reviewed source instead of the npm package

When the user does not trust the published package, do not silently fall back to `npx`. Clone the requested
release tag, let the user inspect the repository, and run the locally compiled CLI:

```sh
git clone --branch v0.9.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD

# Pause for source, package.json, pnpm-lock.yaml, and lifecycle-script review.
pnpm install --frozen-lockfile
pnpm verify
pnpm build

node dist/node/cli.js init ../my-page --starter report --json
node dist/node/cli.js validate ../my-page --json
node dist/node/cli.js inspect ../my-page --json
node dist/node/cli.js build ../my-page --output ../my-page.html --json
```

State the trust boundary precisely: this avoids installing or executing the `agentic-report` package from
npm, but `pnpm install` still downloads the dependencies pinned in `pnpm-lock.yaml`. They are not vendored.
Do not claim a registry-free or fully audited installation. Keep the tag pinned, report the checked commit,
and use an isolated environment when the user's threat model calls for one.

## Build the artifact

Use Node.js 24.18.0 or newer. The first `npx` command needs npm registry and network access; the generated
page itself opens locally through `file://` with its included package-owned browser runtime.

For a reproducible 0.9.0 run, create a new landing-page source and keep the package version pinned through
validation, inspection, and build:

```sh
npx --yes agentic-report@0.9.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.9.0 validate ./my-page --json
npx --yes agentic-report@0.9.0 inspect ./my-page --json
npx --yes agentic-report@0.9.0 build ./my-page --output ./my-page.html --json
```

Open `my-page.html` through `file://`. Edit only the declarative source: Markdown, YAML frontmatter or the
optional YAML/JSON manifest, confined Markdown partials, and local assets. Authors do not need React,
JSX, browser JavaScript, CSS, or a frontend project.

Generated reports include a bottom **Made with Agentic Report** link by default. Keep that default unless
the user asks for an unbranded artifact; in that case set `attribution: false` in frontmatter or the
manifest. This removes only the package footer and does not alter author-owned prose or links.

The shorter current-channel journey is:

```sh
npx --yes agentic-report init ./my-page --starter landing --json
npx --yes agentic-report validate ./my-page --json
npx --yes agentic-report inspect ./my-page --json
npx --yes agentic-report build ./my-page --output ./my-page.html --json
```

Every command already defaults to agent output: run commands emit NDJSON and reference commands emit one
compact JSON line; `--json` names that default, while `--human` selects prose or indented JSON. One refused
directive pass reports its earliest authored violation plus the remaining independent violations in
`related`, so fix the whole inventory together. When a diagnostic carries an exact `fix`, run
`npx --yes agentic-report fix ./my-page`; this is the only command that writes authored Markdown, and it
leaves all other bytes unchanged. `describe` exposes all nine commands and the declared directive rule
dependencies as `commands` and `authoredRules`.

`init` requires an absent destination below an existing directory. A symbolic-link parent such as macOS
`/tmp` is accepted and the result reports the resolved `projectPath`; an existing destination is always
refused. For glossary inflections, declare only the spellings you intend with
`forms="spelling, other-spelling"`; the validator recognizes those exact forms and performs no morphology.

Add top-level `::contents` when the handoff needs a route map inside the article. The compiler uses exact
final section headings and anchors; do not duplicate them in an authored Markdown list. Optional short
`section.nav` labels continue to serve sidebar/mobile navigation only.

Inside a section, use one first `:::lead` paragraph for the main thesis without turning it into a callout.
An appendix glossary definition may sit directly beside the section explanation; the compiler moves it into
the single appendix and preserves the same full-definition link. Do not nest appendix definitions in lists,
quotes, the lead, or unrelated components.

When the artifact leaves the source workstation, add `--share`. The compiler derives path-free non-link
filename/line text from each validated source helper and uses `source:line` for unsafe terminals;
compiler-owned local paths and authored directory/free-form labels are omitted, and the JSON result reports
`neutralizedSourceLinks`. The default build keeps every authored label and working editor link.

Open the generated page and select the exact text the human wants to discuss. Choose **Create note** and use
the anchored popover to add the first message, reply, edit, resolve, or reopen without entering a separate
mode; a selection can cross inline markup or adjacent report targets. Saved open and resolved ranges stay
visibly distinct, and their **View thread** action reopens the same popover. **Review** opens only an overlay
list with prior evidence, import, and one **Export review.json** action; it never divides or shifts the page.
Valid version-2 whole-block threads remain list-accessible, but new threads begin with selected text. After
the reader downloads `review.json`, map it back to the authored files with:

```sh
npx --yes agentic-report review review.json ./my-page --json
```

One report may contain at most 5,000 reviewable targets and 750,000 serialized target-manifest bytes. Split
an unusually large handoff when either bound is reached.

Use the separate `response`/`question` directives when the reader must return structured triage, choices,
priority order, scores, text, or per-item comments. The generated page keeps answers in the current tab and
offers both **Copy response** and **Download response.json**; a rejected import preserves existing answers.
The installed example catalog includes the complete `response-workspace` source.

Write an ordinary colon directly—a digit-initial name and a colon written against the preceding word remain
literal text in Markdown, so `21:01`, `1:30:05`, `3:1`, `1:10:100`, `localhost:9000`, `arXiv:2508.05775` and
`ключ:значение` need no backslash, and neither do frontmatter titles. The digit feature does not depend on
what precedes the colon, so `Пункт :2 списка.` is text as well. Only the inline form without attributes or
children is restored: a colon carrying attributes or children, such as `слово:name{key="1"}`, remains a
directive, and so do block-level forms such as `::2` and an unknown **alphabetic** name standing alone after
a space. Those continue as directives and fail with a source diagnostic when the name is unregistered; write
`\:` when such prose is not a directive.

Use `:::copyable` for prose handoffs. It remains ordinary wrapped Markdown and copies visible text only;
do not use a `text` code fence just to get a Copy button.

Review version 3 stores ordered user/agent messages, resolved state, and optional exact selected-text anchors
in one local sidecar. Each anchor records its quote and bounded start/end target plus Unicode code-point
offsets. Valid version-2 whole-block reviews remain accepted. The sidecar is not an account, signature, or
hosted collaboration service. Decision/checklist directives remain document content.

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
npx --yes agentic-report@0.9.0 describe --json
npx --yes agentic-report@0.9.0 schema --scope source
npx --yes agentic-report@0.9.0 examples --json
```

Read the [complete agent reference](../AGENT-REFERENCE.md), the [declarative source contract](../product/source-contract.md),
or the [agentic-report skill](../../skills/agentic-report/SKILL.md) when more guidance is needed.

## Boundaries

The tool reads local source and writes a static page. It does not deploy, publish, fetch remote source,
use credentials, host an editor, or provide live collaboration. Remote assets, raw HTML, executable
templates, and author JavaScript are not supported.
