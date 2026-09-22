---
title: agentic-report documentation
description: Human and agent documentation for the local declarative interactive-page builder.
language: en
layout: document
theme: system
preset: material
scrollProgress: true
---

# Build the page, not a frontend project

`agentic-report` turns Markdown, compact metadata, confined partials, and local assets into a polished
interactive HTML page. The default is one self-contained file; directory output keeps the same behavior
with content-addressed assets.

::::section{title="Start here" id="start" nav="Start" width="standard" align="start" tone="soft" reveal="true"}

:::lead
Write the opening thesis as one emphasized prose paragraph, not as a callout or custom HTML component.
:::

Use Node.js 24.18.0 or newer. Start with the [agent quickstart](agent/index.html), retrieve the
[direct Markdown version](agent/index.md), or install the [agent skill](../skills/agentic-report/SKILL.md).

```sh
npx --yes agentic-report@0.15.0 init ./my-page --starter landing --json
# Edit ./my-page/report.md and its local assets.
npx --yes agentic-report@0.15.0 build ./my-page --output ./my-page.html --json
```

Open `my-page.html` through `file://`. Build validates before publishing; use `validate` or `inspect` only
when a separate diagnostic or source-inventory result is useful.

:::actions
::action[Open the quickstart]{href="agent/index.html" kind="primary"}
::action[Read agent Markdown]{href="agent/index.md" kind="secondary"}
::action[Inspect llms.txt]{href="../llms.txt" kind="quiet"}
:::

::::

::contents

::::section{title="Build from source" id="source-install" nav="From source" width="standard" align="start" tone="accent" reveal="true"}

If you prefer to inspect the implementation instead of executing the published `agentic-report` npm
package, clone a specific release tag and run the compiler directly from its build:

```sh
git clone --branch v0.15.0 --depth 1 https://github.com/witqq/agentic-report.git
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

The CLI commands are discoverable: `init`, `validate`, `inspect`, `build`, `fix`, `review`,
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

A top-level `section` can compose package-owned `flow`, `stage`, `split`, `mosaic`, `story`, or `stack`
arrangements. Closed attributes also select bounded viewport rhythm, density, typography, natural/masked/
layered/gallery/bleed media, independent image fit/aspect/focal point, and plain/mesh/glow/grain/grid
surfaces. They work in both output formats without author CSS or JavaScript. Multi-column and layered
arrangements flatten to the authored reading order on narrow screens; gallery overflow stays inside its
rail. A multi-item rail shows compact continuation and receives localized focus and arrow-key scrolling only
while it actually overflows; those scroll-only semantics disappear when a wide owner fits every item. Every
section contains its floats and local layer order. A media stage reserves a full-width title row
and composes supporting content with media below; gallery stages keep their separate title/rail arrangement,
while split returns to flow before desktop navigation can make its tracks unreadable. Mosaic/stack
composition cannot pair with layers/gallery media because both roles would own the same card layout; those
four combinations fail before rendering.

Use `recipe="hero|evidence|story|rail|metrics"` as the short path to a coordinated section; explicit detailed
attributes override only their own recipe roles. The default preset is Material. Monument, Signal, Terminal,
and Cinematic are the other recommended directions; Studio and Editorial remain compatible. A card may
declare one safe `href` to become a single visibly linked keyboard target, but it cannot contain nested links.

Section tone owns its background and foreground relationship. Decorative surfaces remain behind the
authored content, while nested cards and visualizations restore their own readable package surface text.

```markdown
::::section{title="A visual argument" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="mesh" transition="stagger" scene="progress" choreography="cascade"}
The content remains ordinary Markdown and semantic directives.
::::
```

Sections also accept closed motion roles: `transition="none|reveal|stagger"`,
`scene="none|progress|sticky"`, `interaction="none|depth|tilt"`, and
`choreography="none|cascade"`. Without a recipe they default to `none`; reduced motion leaves content visible and pointer
effects require a fine pointer. Conflicting layout or transform owners fail validation. `actions` accepts
`placement="auto|edge|inline|bottom"`, with bottom kept in normal flow, and only a primary action may use the
bounded `effect="magnetic"`. The package owns timings, movement, responsive placement, and icons.

Recipes include their entrance and scene behavior. For a pointer-depth opening, use
`recipe="hero" scene="none" interaction="depth"` with a local image; for a scrolling image rail, use
`recipe="rail" scene="progress"` with cards. The
[Motion showcase](../examples/motion-showcase/index.html) demonstrates the complete combination and links
to its [Markdown source](../examples/motion-showcase/report.md). The
[Executive brief](../examples/executive-brief/index.html) shows a Monument decision page with evidence,
timeline and handoff. Long sections reveal when reached even when they are taller than the screen.

Package controls provide icons automatically. Authored modal/popover and toggle labels stay visible on
phones, and action groups wrap without forcing every button across the screen. Large-screen composition
tracks remain separate from the paragraph reading measure; no per-page CSS is needed.

For a bilingual page, the primary entry declares `language: en` or `language: ru` and maps the other
confined Markdown entry under `localizations`. Translate that variant's prose, partials, directive labels,
and visible asset text; the package does not machine-translate. One artifact embeds both variants, selects
the initial language from ordered system preferences, falls back to the primary, and shows the native
language selector only when localization exists. Switching replaces content, metadata, navigation, chrome,
visualizations, and locale-specific review/response state together.

```yaml
language: en
localizations:
  ru: report.ru.md
```

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

Set `review: true` in the frontmatter to ship local Review Workspace annotations; an ordinary page is a plain
document, and a build given a prior sidecar through `--review` enables them automatically. Select an eligible
passage and choose
**Create note**; the anchored popover opens with the exact quote and keeps reply, edit, resolve, and reopen
beside the text. A selection may cross inline markup or adjacent review targets. Saved open/resolved ranges
stay visibly distinct; hover/tap exposes **View thread**, and focusable markers provide the keyboard route.
The topbar **Review** action opens only a non-reflowing overlay list, prior evidence, import, and one export
of every thread. Single-language pages export deterministic version 3; multilingual pages export version 4
with the active `report.locale` and retain separate threads for each locale. Valid version-2 whole-block
files remain accepted and list-accessible, but new threads begin with selected text. Desktop uses a
non-modal list overlay; mobile uses a modal sheet. Nothing is uploaded or stored in an account; ordinary
decisions and checklists remain static report content. [Try the complete Review Workspace example](../examples/review-workspace/index.html)
or [read its declarative source](../examples/review-workspace/report.md).
The target manifest is bounded to 5,000 reviewable blocks and 750,000 serialized bytes; unusually large
handoffs must stay under both limits or be split.

The anchored thread surface flips, shifts, and clamps within the desktop visual viewport; on mobile it
becomes a bounded bottom surface. Window and visual-viewport changes keep it, the selection action, and saved
range markers reachable without moving report content. The measured contextual action and focus markers
follow a visible rectangle from their live range and hide when that range is wholly offscreen. A marker
prefers to sit fully above or below its saved text before edge clamping, keeping marker activation distinct
from tapping the highlighted range. The topbar Review entry has a localized title tooltip around its
20-pixel icon. Navigation, Review, language, and theme use distinct package icons with localized names and
tooltips. The native language selector receives visible focus after switching. At constrained widths visible
labels and secondary page identity are omitted without widening the page, and coarse pointers receive larger
targets. Visible contextual/action controls retain localized labels and use 16-pixel icons; Create note shows
a pencil and View thread shows a comment.

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
its [English source](../examples/response-workspace/report.md) and
[Russian source](../examples/response-workspace/report.ru.md).

Use `copyable` when ordinary prose should be pasted elsewhere. It keeps Markdown typography/wrapping and
copies only visible rendered text through the localized package control.

::::

::::section{title="Output and operation" id="output" nav="Output" width="standard" align="start" tone="soft" reveal="true"}

- `single-file` is the default: one portable HTML file with embedded local resources and runtime.
- `directory` writes `index.html` plus content-hashed resources for larger pages.
- Both formats open through normal `file://` and preserve the same supported interactions.
- On the reference static host, mutable HTML, Markdown, and release metadata revalidate on every use;
  content-hashed directory assets alone receive a one-year immutable cache policy.
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

The public [landing](../index.html) links to independently built bilingual starters, complete visual,
interactive, and data catalogs, [Terminal portfolio](../examples/terminal-portfolio/index.html),
[Cinematic story](../examples/cinematic-story/index.html),
[Executive brief](../examples/executive-brief/index.html),
[Motion showcase](../examples/motion-showcase/index.html), decision showcases, and Review/Response
workspaces. Every page uses the same declarative contract on its own layout and exposes its English and
Russian Markdown sources from the landing.

::::

::::section{title="Release identity" id="release" nav="Release" width="standard" align="start" tone="contrast"}

[`release.json`](../release.json) records the package version, source revision, and hashes for the exact
staged files. The hosted site is accepted only after ordinary trusted HTTPS, real route/MIME checks, and
a real 404 prove that a static host is not serving a catch-all shell. Acceptance also verifies revalidation
for mutable routes and immutable caching only for filenames carrying the compiler's content hash.

:::actions
::action[Inspect release metadata]{href="../release.json" kind="secondary"}
::action[Open source repository]{href="https://github.com/witqq/agentic-report" kind="quiet"}
:::

::::
