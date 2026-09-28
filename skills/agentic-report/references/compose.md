# Compose the page

How to write the source once the brief is settled: what the product boundary allows, how chapters are
structured, how a call to action, a diagram, a recording, a presentation, and the review and answer
workspaces are written. The complete accepted surface — every frontmatter field, every directive with its
attributes and allowed values, the built-in themes and theme fields, visualization limits, output formats,
and commands — is in [`catalog.md`](catalog.md). It is generated from the package contract. Read it for an
exact name; read [`vocabulary-use.md`](vocabulary-use.md) to decide whether a tool belongs on this page at
all, including which directive answers which question of the reader and what each recipe brings.

## Work within the product boundary

- Author Markdown, YAML frontmatter or the optional manifest, supported directives, confined Markdown
  partials, and local assets. Do not put JSX, raw HTML, CSS or remote fetches into the page source. When the
  vocabulary lacks what the page needs, declare it in `extensions`: a composite block from a Markdown
  template, a build-time provider, an effect, or a sandboxed island — each is checked like the built-in
  ones (`agentic-report effect-check` for effects). When to extend, which level to take, the rules and the
  reference extensions to copy from are in [`extensions.md`](extensions.md).
- A source written by hand needs only a title:

  ```yaml
  ---
  title: Bookstore checkout architecture
  description: How an order becomes a paid, shipped parcel.
  ---
  ```

  `layout` is `document` (default), `dashboard`, `landing`, `mixed`, `slides`, or `screens` (one screen per
  gesture). `motion` is the brief's level — `none`, `restrained`, or `expressive` (default); the build
  refuses a technique above it. A frontmatter value
  outside its domain fails with `INVALID_MANIFEST`, and the diagnostic lists the allowed values in
  `details.issues`. `contractVersion` names the source-contract major the source is written for; omit it
  for version 1, which is what a source without it is read as.

- When the handoff needs English and Russian, keep one language in the primary entry and declare the other
  confined Markdown file with `localizations.en` or `localizations.ru`. Translate authored prose, partials,
  directive labels, and visible asset text explicitly. Keep layout, theme, scheme, attribution, and
  output metadata in the primary entry. The page chooses the initial variant from system language
  preferences and shows a language selector only when both variants exist.
- Write an ordinary colon normally in prose and frontmatter: a colon that opens a digit-initial name and a
  colon written against the preceding word are literal text, so `21:01`, `1:30:05`, `3:1`,
  `localhost:9000`, `arXiv:2508.05775`, and `ключ:значение` need no escape. A colon that carries attributes
  or children, a block-level form such as `::2`, and an unknown alphabetic name standing alone after a
  space stay directives and fail on an unregistered name; write `\:` when such prose is not a directive.
- A code block that shows directives inside a directive needs a longer outer colon fence than any fence
  line inside it: a `::::` line in a fenced example closes a four-colon container around it.
- Introduce a registered glossary term with `:term[...]{key="..."}` at its first occurrence in each
  `section`; later occurrences in the same section stay ordinary prose. Declare inflected spellings with
  `forms="…, …"` on the definition.
- Run `agentic-report fix <source>` to apply the replacements the product computed exactly; it is the only
  command that writes to your Markdown. Violations it reports as remaining need your decision.
- A failed run reports every authored violation it found; the earliest is the diagnostic and the rest are
  in its `related` inventory. `describe` returns which rule depends on which as `authoredRules`, so a
  silent rule is explicable. Fix them together instead of rerunning once per violation.
- Use `copyable` for prose the reader should paste elsewhere; do not disguise language as a code fence.

Build and delivery flags (`--share`, `--url`, `sitemap`, attribution) are in
[`process.md`](process.md#deliver-the-page).

## Structure the chapters

Give every `section` an `id` and a short `nav` label: the label is what the reader navigates by. Inside a
chapter, put the summary and the picture first and the detail after; a reader who stops at the first
screen of a chapter should still leave with its conclusion. Keep chapters comparable in weight.

Use top-level `::contents` when the reader needs the route inside the article; the compiler writes it from
the final section titles, so never author a parallel list. On a landing page, put it after the first
screen, never above the title (`DR-NAV-ABOVE-TITLE`): landing navigation already lives in the top bar menu.

## Point the call to action where the reader acts

An `action` links a page anchor, a relative page, a web address, `mailto:`, `tel:` (a phone number) or
`sms:` (a number with an optional `?body=`); an ordinary Markdown link takes the same targets. A link that
leads nowhere fails the build: an empty target (`EMPTY_LINK_TARGET`), an anchor no element on the page
carries (`MISSING_ANCHOR_TARGET`), or a phone number that is not one (`INVALID_LINK_TARGET`). An `action`
takes `kind` `primary` (the default), `secondary` or `quiet`.

## Build a diagram that stays readable

Describe the graph; laying it out is the package's job. A flow goes by layers along the flow: backward
connections are drawn and described apart, nodes inside a layer are ordered to cross less, and each label
sits on its own connection. The reader switches between three views built at compile time: top to bottom
(`down`), left to right (`right`), and right angles (`orthogonal`). `layout` names the view shown first and
printed; the default `auto` picks the one with the fewest crossings that fits the page best.

| The picture answers                             | Use                                                       |
| ----------------------------------------------- | --------------------------------------------------------- |
| who creates, calls, or feeds whom, with no time | `type="flow"` (default)                                   |
| what happens in which order between 2–6 parties | `type="sequence"`                                         |
| subsystems with many connections between them   | a flow with `group`; `layout="orthogonal"` if you pin one |
| a short pipeline, five nodes or fewer           | a flow; `layout="right"` reads like a sentence            |
| a tall chain of steps                           | a flow; `layout="down"`                                   |

```markdown
:::diagram{title="How a frame is shown" description="The driver ticks the player, the player writes values, and the accessor hands the renderer one matrix per target."}
::group{id="engine" label="Engine"}
::node{id="driver" label="Driver" detail="requestAnimationFrame" group="engine"}
::node{id="player" label="Player" group="engine"}
::node{id="accessor" label="Canvas accessor" kind="accent"}
::node{id="renderer" label="Renderer"}
::edge{from="driver" to="player" label="tick(time)"}
::edge{from="player" to="accessor" label="write(target, path, value)" kind="data"}
::edge{from="accessor" to="renderer" label="applyTransform: one matrix per frame"}
::legend{title="How to read"}
::legend-item{edge="call" label="calls a method"}
::legend-item{edge="data" label="passes values"}
::legend-item{node="accent" label="new in this change"}
:::
```

- **Name a node by what it is, and put the rest in `detail`.**
- **Say what each connection is with `kind`:** `call` (default), `data`, `event`, `dependency`. As soon as
  a diagram mixes two kinds, a legend of the kinds present appears.
- **Name things in your own words** with `legend` and `legend-item`; `legend-item{node="…"}` is the only way
  a node `kind` gets a meaning; `hidden="true"` hides a kind; `auto="false"` keeps only your items. A timeline
  takes `legend-item{event="accent|success|warning" label="…"}` the same way. A marked node or event without
  a legend item is reported (`LEGEND_ENTRY_MISSING`): a colour alone tells the reader nothing.
- **Write the whole call in a connection label;** labels wrap and are never cut.
- **Group only what forms a subsystem;** up to five groups.
- **Show a step that repeats** with an edge whose `from` equals its `to`: a loop on the corner of a flow
  node, or a step inside one participant of a `sequence`.
- **Give a connection an `id`** when a `beat{focus}` should light it on its own: a focus lists node and
  connection ids together, and a connection also lights when both its nodes are lit. The id differs from
  every node id.
- **Leave `node{row}`, `edge{route}` and `diagram{spacing}` alone** unless the picture needs them; they are
  flow-only.
- **Keep a sequence to five participants or fewer,** and split a flow a reader must decode into two.

Every diagram is also written out in words under the picture in a closed disclosure. Do not restate it in
prose next to it; explain what it means.

### Draw a process

A run, a review cycle or a pipeline with rework is a flow whose nodes carry a `status` and whose returns
carry a `count`:

```markdown
:::diagram{title="Review run" description="The change was sent back twice and is in review again." layout="right"}
::node{id="plan" label="Plan" status="done"}
::node{id="build" label="Build" status="done"}
::node{id="review" label="Review" status="review"}
::node{id="ship" label="Ship" status="pending"}
::edge{from="plan" to="build"}
::edge{from="build" to="review"}
::edge{from="review" to="build" label="changes" count="2"}
::edge{from="review" to="review" label="re-run" count="3"}
::edge{from="review" to="ship"}
:::
```

- **`status`** is `done`, `review`, `returned` or `pending`. Unlike `kind`, a status means something by
  itself: the node takes the theme's status colour and a glyph on its frame that reads without colour, and
  the legend names each status present in package words. Rename one with `legend-item{status="…" label="…"}`.
- **`count="N"`** writes «×N» after the connection label: how many times a return or a retry happened.
- **A process that lives in data** comes from the page's JSON at build time: repeat nodes and returns with
  `:::each` inside the diagram, for example `::node{id="{{s.id}}" label="{{s.label}}" status="{{s.status}}"}`
  over `run.steps`. Pin what the picture must show with `::expect`.
- **In a line of text or on a card**, use the mini process: the steps separated by `>`, the step the work
  stands at, and the returns as arcs.

```markdown
The change is at :process[Plan > Build > Review > Ship]{current="Review" returns="Review>Build×2"} after two rounds.
```

Steps before `current` are done, after it not started; without `current` every step is done. A return is
`step>earlier step×N`; `Review>Review×3` repeats one step. The dots are a sign, not a diagram: the step
names are said to assistive technology, and a reader who needs the names gets a `diagram`.

- **A pulse along a route** shows which way work travels: `pulse="plan,build,review"` names nodes joined in
  that order by connections. Pulses run three times when the diagram comes into view; the route is marked in
  the accent colour, which is also its still and printed form.

### Open a node

When one node is a system of its own, write its inside as a `zoom` in the diagram. The page pins the
diagram and flies the camera into that node while the reader scrolls; the nested flow grows readable in its
place. Without motion and in print the whole diagram and the inside stand side by side.

```markdown
::::diagram{title="Service" description="A request reaches the API, and the API is a small flow of its own."}
::node{id="client" label="Client"}
::node{id="api" label="API"}
::node{id="store" label="Store"}
::edge{from="client" to="api"}
::edge{from="api" to="store"}
:::zoom{node="api" title="Inside the API"}
::node{id="router" label="Router"}
::node{id="handler" label="Handler"}
::edge{from="router" to="handler"}
:::
::::
```

One zoom per flow diagram, with no `draw="scroll"`: the zoom is the diagram's scroll scene. The zoomed
diagram shows its default view only, without the view switcher. Keep the inside to a handful of nodes: the
camera fits it into the node's box, and a wide inside ends small.

## Build a page from data

When the page's numbers come from an export — a run, a dashboard snapshot, a benchmark — put the export
next to the page as JSON and let the build write the figures, instead of copying them by hand
(`DR-DATA-SLICE`, `DR-HEADING-COUNT`). List the files in `data`; each is addressed by its name without
`.json`:

```markdown
---
title: Nightly review run
data:
  - data/run.json
---

# Nightly review run {{run.id}}

::expect{data="run.stages" count="5"}
::expect{data="run.status" equals="done"}

Run {{run.id}} took :plural[{{run.returns}}]{forms="return|returns"}; the export was taken
:time[{{run.exportedAt}}]{zone="Europe/Moscow"}.

:::each{in="run.stages" as="stage"}

| Stage              |           Items |           Minutes |
| ------------------ | --------------: | ----------------: |
| {{stage.title.en}} | {{stage.items}} | {{stage.minutes}} |

:::

::source-line[Moira export of run {{run.id}}, {{run.records}} records]{date="{{run.exportedAt}}" zone="Europe/Moscow"}
```

- `{{run.stages.0.id}}` — dots walk keys and list positions — works in text, code, link targets and
  quoted directive attributes (`title="{{stage.title.en}}"`). The value is inserted as plain text: markup
  inside the data stays literal and cannot open a directive or add HTML.
- `:::each{in as}` repeats its body per item. A body that is one list or one table repeats its items or
  rows inside it, so numbering and the table stay whole. Leave a blank line between the table and the closing
  `:::`: a Markdown formatter that does not know directives otherwise takes the fence for a table row. `each` also stands between a container and its
  children — `cards` and `card`, `series` and `point` — so cards and chart points can come from the data
  (nest the fences: the outer container takes more colons).
- `::expect` is the control value that fails the build at its line when the data change under the page:
  `count` for «should be 7 blocks», `min="1"` for «not empty», `max`, `equals`. Put one beside every number
  a heading or a sentence claims.
- There is no expression language. A derived figure — a streak, «k of N», a percentage — goes into the JSON
  already computed (the script that exports it computes it), or comes from a provider extension
  ([`extensions.md`](extensions.md)). Label it as derived on the page (`DR-DATA-SLICE`).
- For a bilingual page keep language-neutral values in the data and text per language as
  `{"en": "…", "ru": "…"}`, read as `{{stage.title.en}}` and `{{stage.title.ru}}`.

`agentic-report examples` lists `run-report`, a complete bilingual page built this way.

### Write numbers and dates in the page language

`:plural[{{n}}]{forms="file|files"}` writes the number with the noun form it needs — two forms
(`one|other`) on an English page, three (`one|few|many`: `файл|файла|файлов`) on a Russian one — joined by a
no-break space. `:time[2026-09-25T01:17]{zone="Europe/Moscow"}` writes a date or a moment in the page
language; a time needs `zone`, is read in that zone unless it carries its own offset, and is shown with the
short zone label of the page language: an abbreviation where the language has one for that zone
(`EDT` for `America/New_York` in English), otherwise the offset (`GMT+3` for `Europe/Moscow`). `show` picks `date`, `time` or `datetime`; `auto` shows what the value has. Both are settled
when the page builds, so the reader copies final text and every reader sees the same zone.

### Say where the data came from

Write `::source-line[…]` directly under every table, chart, cards block, picture or clip whose content
comes from somewhere: which run or system, how many records, and `date` (with `zone` for a time). It is the
source line of `DR-DATA-SLICE` and the provenance caption of a screenshot or a recording («Screen recording
of run 96»). The build refuses one with nothing above it.

### Show a message or a notification

`message` mocks one message — `from`, `time`, `status`, `side="out"` for the reader's own turn — and
`conversation` holds several in order, with a `title`:

```markdown
::::conversation{title="Moira notifications" illustrative="true"}
:::message{from="Moira" time="01:17" status="delivered"}
Run 96 finished: **0 findings**, 9 of 10 items accepted.
:::
:::message{from="You" time="01:19" side="out"}
Send me the page.
:::
::::
```

A mock with invented names, times or numbers takes `illustrative="true"`: the page marks it
«Illustrative», and the reader does not take it for a record (`DR-DATA-SLICE`). Use a real screenshot with a
`source-line` when the real message exists.

## Show a recording

```markdown
::video{src="assets/demo.h264.mp4" sources="assets/demo.av1.mp4, assets/demo.vp9.webm" poster="assets/demo.poster.jpg" chapters="assets/demo.chapters.vtt" caption="The page is built from its source in one command."}
```

`mode` is `clip` (default: muted, looping, playing while visible, with controls), `background` (muted loop
without controls, with a pause button; `poster` required), or `manual` (sound and controls, plays only when
pressed). `sources` lists further encodings in order of preference; directory output offers them all,
single-file output embeds only the most compatible one and warns. `chapters` is a WebVTT file shown as a
chapter list the reader can jump by. Clips count toward `output.maxInlineBytes`, the size budget of one file:
above it the build fails (`INLINE_SIZE_BUDGET_EXCEEDED`), so build a page with several clips as a directory.
Where each mode fits is in [`vocabulary-use.md`](vocabulary-use.md#video); encoding sizes are in
[`assets.md`](assets.md#sizes).

To film a product for the page, use agentic-screencast as a finished tool: install it
(`npm install --global agentic-screencast`, then `npx playwright install chromium`), write its scenario in
a working directory outside the page source, build the film, and run
`agentic-screencast web film.mp4 --out web --formats av1,vp9,h264`. Copy the H.264 file into `src`, the AV1
and VP9 files into `sources`, the poster, and the chapters file into the page's `assets/`, and record the
run in the brief's «Media» table. Its own skill explains the scenario.

## Make a presentation

`layout: slides` turns every top-level section into a slide and the title with its introduction into a
title slide. `appear{effect="rise|fade|wipe|pop"}` reveals a block as a step, `notes` holds what the speaker
says, and `slide-transition` (`fade` default, `push`, `wipe`, `zoom`, `none`) sets how a slide arrives.
Arrows, space, and clicks move through steps and slides; the address `#/3/2` opens slide 3 at step 2.

`?view=presenter` shows the notes under each slide. `?view=film` removes every control for recording: drive
it with `window.agenticSlides.goto(slide, step)`, `next()`, `previous()`, and wait for
`window.agenticSlides.settled()` (or the `agentic-slides:settled` event, or `data-slide-state="settled"` on
the root) before each frame, because every transition has a fixed duration published as
`data-slide-duration`.

## Answer and review workspaces

Use Response Workspace (`response`) when the human must return structured triage, choices, ordering,
scores, text, or item comments. Keep it separate from Review Workspace discussion threads. The hand-over
tells the user how the answers come back ([`process.md`](process.md#hand-over)).

### Review the page with a human

Use Review Workspace for local selected-text discussion; it ships only with `review: true` in the
frontmatter or when a prior sidecar is passed through `--review`. A reader selects text, chooses **Create
note**, and writes in the anchored thread; the topbar **Review** action lists, imports, and exports threads
as a deterministic `review.json` (version 3 for a single-language page, version 4 with the active locale for
a multilingual one). For a follow-up build, pass the prior artifact with `build --review review.json`;
stale bindings stay as prior revision segments. Never imply an account or signature, and never rewrite the
Markdown from a review file. A report may contain at most 5,000 reviewable targets.
