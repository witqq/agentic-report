---
name: agentic-report
description: Create, validate, inspect, or build polished local interactive reports, research pages, architecture pages, tutorials, dashboards, decisions, and landing pages from declarative Markdown. Use for static agent-to-human page handoff; do not use for hosted apps, live collaboration, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.8.0'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run.
---

Use Review Workspace for local discussion threads and selected-text notes. A reader selects eligible text,
chooses **Create note**, writes in the existing editor, and exports every whole-block thread and selection
note together as deterministic version-3 `review.json`; valid version-2 whole-block files remain accepted.
Selection anchors contain the exact quote plus bounded target endpoints and Unicode code-point offsets.
Never imply an account or signature. For a follow-up build, pass a confined prior artifact with
`build --review review.json`; treat stale bindings as immutable prior revision segments, append a current
segment when continuing a changed fragment, and export the next revision. A report may contain at most 5,000
reviewable targets and a 750,000-byte target manifest; reduce or split it when either bound is reached. Never
rewrite Markdown. Ordinary typed `decision`/`decision-option` and `checklist`/`check-item` syntax remains
static report content.

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
- Write an ordinary colon normally in prose and frontmatter: a colon that opens a digit-initial name and a
  colon written against the preceding word are literal text, so `21:01`, `1:30:05`, `3:1`, `1:10:100`,
  `localhost:9000`, `arXiv:2508.05775` and `ключ:значение` need no escape. The digit feature holds whatever
  precedes the colon, so `Пункт :2 списка.` is text too. This covers the inline form without attributes or
  children only: a colon that carries attributes or children, such as `слово:name{key="1"}`, stays a
  directive, and so do block-level forms such as `::2` and an unknown **alphabetic** name standing alone
  after a space. Those are validated as directives and fail on an unregistered name; write `\:` when such
  prose is not a directive, and do not turn it into a code span to hide it.
- Introduce a registered glossary term with `:term[...]{key="..."}` at its first occurrence in each
  `section` directive; later occurrences of that term in the same section stay ordinary prose. A term that
  is never introduced still fails. Declare inflected spellings with `forms="…, …"` on the definition when
  the text uses them: a declared form counts as an occurrence and is proposed with the spelling the
  sentence used, while an undeclared inflection stays ordinary prose.
- Run `agentic-report fix <source>` to apply the replacements the product computed exactly; it is the only
  command that writes to your Markdown, and it leaves every other byte alone. Violations it reports as
  remaining need your decision.
- A grouped flow diagram with a single group builds and returns the `INCOMPLETE_DIAGRAM_GROUPING` warning:
  unfinished grouping does not block the page, so finish the remaining groups or remove the only one.
- One failed run reports every authored violation it found while interpreting directives, including
  several over the same element, minus the ones that only repeat a refusal already reported: a descendant
  of a rejected directive, an annotation pointing at a key whose own `glossary` definition was refused,
  and any rule whose declared dependency refused. Which rule depends on which is data — `describe` returns
  it as `authoredRules` — so silence is explicable instead of guessed. The earliest survivor is the
  diagnostic and the rest are in its `related` inventory, in source order. Fix them together instead of rerunning once per violation. A definition lost with a rejected
  container leaves its key unknown, so a reference to it is still listed beside that container's refusal.
  A failure of another stage — an unreadable source graph, a refused output path — still ends the run with
  a single diagnostic.
- Use `copyable` for prose the reader should paste elsewhere; do not misrepresent ordinary language as a
  code fence merely to obtain a Copy button.
- Keep the default bottom **Made with Agentic Report** link. When the user explicitly needs an unbranded
  artifact, set root metadata `attribution: false`; this removes only the package-owned footer.
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
npx --yes agentic-report@0.8.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.8.0 validate ./my-page --json
npx --yes agentic-report@0.8.0 inspect ./my-page --json
npx --yes agentic-report@0.8.0 build ./my-page --output ./my-page.html --json
```

Choose a different starter or destination name when the task requires it. `init` requires an absent
destination whose immediate parent already exists and is a directory; the parent may be a symbolic link,
and the reported `projectPath` then names the resolved location. An existing destination is refused with
`INIT_DESTINATION_EXISTS`. The first `npx` call requires registry/network access.

Edit the generated source before validation. Resolve every structured diagnostic at its reported file and
range, then rerun `validate` and `inspect`. Every command answers an agent without a flag and accepts
`--json` as the name of that default: the run commands `init`, `build`, `validate`, `inspect`, `fix` and
`review` write NDJSON records, while `schema`, `describe` and `examples` write their one reference document
as a compact JSON line. `--human` selects the form for a person — prose from `init`, `build`, `validate`,
`fix`, `review` and `examples`, the same document indented from `inspect`, `schema` and `describe`. One failed run lists every independent
violation it found, so fix them together. Build only after both succeed. Open the result
through normal `file://`; use `--format directory` only when a multi-file output is intentionally needed.

Report the source path, artifact path, chosen starter/output format, warnings, and unresolved content facts.

## Respect source-review requirements

If the user does not trust the published npm package, do not run it through `npx`. Clone the release tag
pinned by this skill, expose the checked commit for review, and run the locally compiled CLI:

```sh
git clone --branch v0.8.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD
pnpm install --frozen-lockfile
pnpm verify
pnpm build
node dist/node/cli.js init ../my-page --starter report --json
```

Substitute `node dist/node/cli.js` for every `npx --yes agentic-report@0.8.0` command above. Keep page
sources and outputs outside the cloned repository.

Explain that this avoids executing the `agentic-report` npm package but is not registry-free:
`pnpm install` still downloads the dependencies pinned in `pnpm-lock.yaml`, and the project does not vendor
them. Never describe a source checkout as audited merely because the source is visible.

## Retrieve details only when needed

Start with the same-origin [agent quickstart](https://agentic-report.witqq.dev/docs/agent/index.md).
Use the linked hosted reference or source contract for exact syntax. Against the installed package,
`describe --json`, `schema --scope source`, and `examples --json` are the machine-readable runtime truth.
