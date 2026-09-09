---
name: agentic-report
description: Create and build polished local interactive reports, research pages, architecture pages, tutorials, dashboards, decisions, and landing pages from declarative Markdown, with optional diagnostic inspection. Use for static agent-to-human page handoff; do not use for hosted apps, live collaboration, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.14.0'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run.
---

# agentic-report

Create a local declarative source, build it, open it, and hand the user a finished interactive HTML artifact.

## Build a reproducible page

Use the release pinned in this skill:

```sh
npx --yes agentic-report@0.14.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.14.0 build ./my-page --output ./my-page.html --json
```

Choose a different starter or destination name when the task requires it. Edit the generated source between
the two commands. `build` validates the complete source before it writes output; resolve every structured
diagnostic at its reported file and range, then rerun build. Open the successful result through normal
`file://`. Use `validate` only for a separate diagnostic result, `inspect` only for source/catalog discovery,
and `--format directory` only when multi-file output is intentionally needed.

`init` requires an absent destination whose immediate parent already exists and is a directory; the parent
may be a symbolic link, and the reported `projectPath` then names the resolved location. An existing
destination is refused with `INIT_DESTINATION_EXISTS`. The first `npx` call requires registry/network access.

Every command answers an agent without a flag and accepts `--json` as the name of that default: the run
commands `init`, `build`, `validate`, `inspect`, `fix` and `review` write NDJSON records, while `schema`,
`describe` and `examples` write one compact JSON document. `--human` selects the form for a person. One
failed run lists every independent violation it found, so fix them together.

Report the source path, artifact path, chosen starter/output format, available languages, warnings, and
unresolved content facts.

## Work within the product boundary

- Select `report`, `research`, `architecture`, `tutorial`, `dashboard`, or `landing` for the requested page.
- Author Markdown, YAML frontmatter or the optional manifest, supported directives, confined Markdown
  partials, and local assets. Do not introduce JSX, raw HTML, browser JavaScript, CSS, executable
  templates, plugins, or remote source fetching.
- When the handoff needs English and Russian, keep one language in the primary entry and declare the other
  confined Markdown file with `localizations.en` or `localizations.ru`. Translate authored prose, partials,
  directive labels, and visible asset text explicitly. Keep layout, theme, preset, tokens, attribution, and
  output metadata in the primary entry. The generated page chooses the initial variant from system language
  preferences and shows a language selector only when both variants exist; do not add a bespoke switcher.
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
- Compose visually distinct sections with the closed package grammar before considering a bespoke page:
  start with `recipe="hero|evidence|story|rail|metrics"` when one of those reader jobs fits, then add only
  the detailed overrides that are actually needed. Monument is the default preset; Material, Signal,
  Terminal, and Cinematic are the other recommended directions, while Studio and Editorial remain accepted
  compatibility identities.
  `composition="flow|stage|split|mosaic|story|stack"`, `viewport="adaptive|full|bounded"`,
  `section-density="compact|editorial|immersive"`, `type="body|display|editorial"`,
  `media="natural|mask|layers|gallery|bleed"`, `media-fit="natural|contain|cover"`,
  `media-aspect="natural|landscape|cinematic|portrait|square"`,
  `focal="center|top|right|bottom|left"`, and `surface="plain|mesh|glow|grain|grid"`. Section tone owns its
  foreground/background relationship; a decorative surface stays behind content, while nested package
  components retain their own readable surface text. These attributes
  remain package-owned; never substitute CSS, classes, raw HTML, or browser code. Do not combine
  `composition="mosaic|stack"` with `media="layers|gallery"`: both would own the same card layout, so the
  compiler rejects those pairs. Other composition/media pairs remain available.
  Keep important reading order in source because multi-column/layered arrangements flatten on narrow
  screens. A media stage keeps its title across the full section and composes support with media below;
  gallery stages keep their separate rail. A multi-item gallery exposes its localized focusable arrow-key
  scroll route only while its current rail overflows, so do not add a parallel authored control. Prefer
  image-only cards for `layers`. Use the bilingual
  `layout-mixed` example as the complete grammar catalog, the landing starter as a smaller copyable narrative,
  `terminal-portfolio` for console-led composition, `cinematic-story` for image-first scroll storytelling,
  `executive-brief` for a Monument decision narrative, and `motion-showcase` for a complete combination of
  depth, scrolling media, gallery, cascade, and reduced-motion behavior. Locate their installed sources with
  `examples --json`; these examples can be copied and edited without becoming new `init` starters.
- Add motion through the same closed section grammar: `transition="none|reveal|stagger"`,
  `scene="none|progress|sticky"`, `interaction="none|depth|tilt"`, and
  `choreography="none|cascade"`. Without a recipe they default to `none`; legacy `reveal="true"` remains available. Do not
  combine layers or progress scenes with depth/tilt, or story/stack with sticky. Reduced motion leaves all
  content visible, and pointer effects require a fine pointer. Use
  `:::actions{placement="auto|edge|inline|bottom"}`;
  bottom stays compact normal-flow content. Reserve `effect="magnetic"` for a primary action. Do not invent
  animation timing, coordinates, CSS, or browser code—the package owns bounded behavior and icons.
  Recipes already supply motion: hero uses stagger and a progress scene, evidence uses reveal, story uses
  reveal and a progress scene, rail uses stagger, and metrics uses stagger with cascade. For a pointer-depth
  hero, use `recipe="hero" scene="none" interaction="depth"` with a local image. Do not restate all recipe
  attributes. Long sections reveal when reached, regardless of their height.
- Let package controls supply their icons. Authored modal/popover triggers and toggle labels stay visible
  on compact screens; action groups wrap without forced full-width buttons. Choose ordinary descriptive
  labels and keep default geometry rather than adding icon markup, shortening meaning, or patching CSS.
- Give a card `href` only when the whole card has one destination. The package validates the same safe-link
  domain as actions, renders one keyboard target and persistent icon, and rejects nested Markdown links.
- When a finished artifact containing `source-link` will leave the source workstation, build it with
  `--share` and report the returned `neutralizedSourceLinks` count. Keep the default build when local editor
  links are part of the requested handoff; share output derives path-free filename/line labels from validated
  helpers and uses `source:line` when a terminal is unsafe. Directory-bearing and free-form authored labels
  remain available only in the default workstation build.
- Do not deploy, publish, use credentials, or mutate unrelated files. This skill authorizes only local
  installation, source authoring, validation, inspection, build, and artifact review.

## Review the result with a human

Use Review Workspace for always-on local selected-text discussion. A reader selects eligible text, chooses
**Create note**, and writes in the anchored full-thread popover; saved open/resolved ranges stay highlighted,
and **View thread** reopens the same popover by pointer, touch, or focusable marker. The topbar **Review**
action opens only a non-reflowing list/import/export overlay. It exports every selection plus imported legacy
whole-block threads as deterministic version-3 `review.json` for a single-language page or version 4 with
the active `report.locale` for a multilingual page; valid version-2 whole-block files remain accepted and
list-only. Selection anchors contain the exact quote plus bounded target endpoints and Unicode code-point
offsets. Keep imported and authored threads in the locale they belong to.

Desktop thread popovers flip, shift, and clamp within the visual viewport; mobile uses a bounded bottom
surface. Window and visual-viewport changes keep the selection action, markers, and popover reachable without
moving report content. The measured contextual action and focus markers follow a visible rectangle from their
live range and hide when that range is wholly offscreen. A marker prefers a fully separate position above or
below its saved text before edge clamping, so marker and highlighted-text activation remain independent. The
topbar uses distinct navigation, Review, language, and theme icons with localized names and title tooltips.
The native language selector remains the locale input and receives visible focus after switching. At
constrained widths shell labels and secondary page identity are omitted without widening the document, and
coarse pointers receive larger targets. Visible contextual/action controls retain localized labels and use
16-pixel icons; Create note shows a pencil and View thread shows a comment.

Never imply an account or signature. For a follow-up build, pass a confined prior artifact with
`build --review review.json`; treat stale bindings as immutable prior revision segments, append a current
segment when continuing a changed fragment, and export the next revision. A report may contain at most 5,000
reviewable targets and a 750,000-byte target manifest; reduce or split it when either bound is reached. Never
rewrite Markdown. Ordinary typed `decision`/`decision-option` and `checklist`/`check-item` syntax remains
static report content.

## Respect source-review requirements

If the user does not trust the published npm package, do not run it through `npx`. Clone the release tag
pinned by this skill, expose the checked commit for review, and run the locally compiled CLI:

```sh
git clone --branch v0.14.0 --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD
pnpm install --frozen-lockfile
pnpm verify
pnpm build
node dist/node/cli.js init ../my-page --starter report --json
```

Substitute `node dist/node/cli.js` for every `npx --yes agentic-report@0.14.0` command above. Keep page
sources and outputs outside the cloned repository.

Explain that this avoids executing the `agentic-report` npm package but is not registry-free:
`pnpm install` still downloads the dependencies pinned in `pnpm-lock.yaml`, and the project does not vendor
them. Never describe a source checkout as audited merely because the source is visible.

## Retrieve details only when needed

Start with the same-origin [agent quickstart](https://agentic-report.witqq.dev/docs/agent/index.md).
Use the linked hosted reference or source contract for exact syntax. Against the installed package,
`describe --json`, `schema --scope source`, and `examples --json` are the machine-readable runtime truth.
