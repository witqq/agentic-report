# Extend the vocabulary

An extension adds to one page what the built-in vocabulary does not give: a block made of existing
directives, a block filled from data at build time, an effect drawn over built-in directives, or a small
application in its own frame. It is declared in the page's frontmatter, lives in a folder beside the page, and
is checked like the built-in blocks. This file says when to extend, which of the four levels to take, and
the rules every extension follows. The installed package holds the rest: the exact manifest format in
`docs/product/source-contract.md` (section «Extensions»), how each level is built and isolated and the
context an effect receives in `docs/ARCHITECTURE.md` (sections «Extensions» and «Level 2 — effects and the
effect engine»).

## First, the vocabulary

Most pages need no extension. Before writing one, look for the directive that answers the reader's question
([`vocabulary-use.md`](vocabulary-use.md)) and for a recipe that shapes the chapter; read the catalogue
([`catalog.md`](catalog.md)) for the exact attributes. The built-in blocks come with their narrow-screen
version, their reduced-motion state, their print form, both languages and a place in every check; an
extension has to earn each of these itself.

Extend when one of these is true:

- the page repeats the same arrangement of directives several times, and a mistake in one copy would reach
  the reader (a figure without its date, a card without its status);
- the content comes from data — a log, an export, a JSON file — and writing it by hand would copy numbers
  that can drift from their source;
- the design has one element no built-in directive draws: a thread through the chapters, a woven transition,
  a light that follows the reader;
- the reader must try their own values: a calculator, a sorter, a small simulator.

Do not extend to restyle a built-in block, to crowd a page with another effect, or to put decoration where
the vocabulary already says it plainly. What many pages need
belongs in the package, not in an extension: say so in the hand-over instead of building it for one page.

## Choose the level

Take the lowest level that does the job. Each level up costs more code, more checks and more bytes.

| Level | `kind`     | What it is                                                                                            | The page gets                                               |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1a    | `block`    | a Markdown template of existing directives with typed attributes, `{{attribute}}` and `{{content}}`   | built-in directives; no code, nothing new in the page       |
| 1b    | `provider` | a local program run at build time: the directive as JSON on stdin, Markdown of directives on stdout   | built-in directives; the program never reaches the page     |
| 2     | `effect`   | an ES module (`defineEffect`) that decorates built-in directives through target attributes            | one bundled script, only on pages whose directives carry it |
| 3     | `island`   | an HTML application in `<iframe sandbox="allow-scripts">`, with a required Markdown static equivalent | an isolated frame without network or access to the page     |

| The page needs                                                             | Level         | Reference                                                    |
| -------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| the same arrangement of directives with required fields, many times        | 1a `block`    | `key-figure`: a figure that cannot lose its date and source  |
| a fixed frame — a section, its scene and what follows it — around data     | 1a `block`    | `product-theatre`: a steps scene and the table of the run    |
| directives written from a JSON file, a log or an export at build time      | 1b `provider` | `theatre-script`: a product run as a diagram and timed steps |
| a decoration beside each marked section, driven by that section's progress | 2 `effect`    | `loom`: cloth woven beside a section as it is read           |
| a small WebGL mark around an image, with the same 2D fallback              | 2 `effect`    | `focus-frame`: a traced border or four corner marks          |
| something the reader operates: inputs, a result, a chart of the result     | 3 `island`    | `slo-budget`: an error-budget calculator                     |

A block and a provider can work as a pair: the block is the frame, checked by its attributes, and the
provider fills it with data. `product-theatre` is such a pair. An effect decorates what is already on the
page and never carries content; an island carries content, but only inside its frame, and the page must say
the same thing without it.

## Declare it

Put the extension's folder beside the page, usually under `extensions/`, and list its manifest in the
frontmatter. A path is relative to the page and must stay inside the page's folder; paths inside a manifest
are relative to the manifest and stay inside its folder.

```markdown
---
title: Support quarter
extensions: [extensions/key-figure/extension.yaml]
---

# Support quarter

::::cards
:::key-figure{label="First reply, median" value="3 h 40 min" date="Q3 2026" source="Helpdesk report «Reply times»" status="good"}
Down from 5 h 10 min in Q2 after the night rota started.
:::

::key-figure{label="Satisfaction score" value="4.6 of 5" date="Q3 2026" source="Post-ticket survey export"}
::::
```

Every manifest names its `kind`, a `name` (lowercase, not a built-in directive, not `island`), a
one-sentence `description`, its `staticEquivalent` — what the reader gets without motion, without scripts
and in print — its two `examples` and the `licenses` of any third-party code it bundles. Then per level:

- **`block`** — `forms` (`leaf`, `container`), `attributes` (`type` `string`, `number`, `boolean` or
  `enum` with `values`, `required`, `default`, `description`, `maxLength`, `minimum`, `maximum`) and
  `template`. A value is escaped for its place, so it cannot open a directive or close an attribute; the
  expansion is checked like Markdown you wrote, and a mistake in it points at your directive. An optional
  `styles: block.css` gives the block a look the built-in blocks lack (`key-figure` sets its figure in
  large type). The rules nest inside the block's element — `&` is that element, `& > p` a paragraph in
  it — and reach only pages that use the block. They take colours, faces, weights and radii from theme
  tokens (`agentic-report schema --scope theme`) and sizes from `--text-*` or a `clamp()` in `rem` and
  `vw`; a colour literal, a typeface, an off-scale size or radius, a variable outside the vocabulary, a
  sibling of the block (`& ~ x`, `& + x`), `:root`/`html`/`body`, an unclosed string, an
  at-rule other than `@media`/`@container`, `url()` or `\` is refused with `EXTENSION_STYLES_INVALID` and
  the line, more than 8 192 bytes with `EXTENSION_STYLES_OVER_BUDGET`.
- **`provider`** — `forms`, `attributes`, `command` (an argv, run without a shell in the extension folder)
  and `timeoutMs`. The program reads `{ name, attributes, content, language, data, source: { file, line } }`
  and writes Markdown. It runs with a minimal environment and its folder as working directory. Data beside
  the page reaches it through `data`: the page declares the JSON files in its `data` field, and the
  provider gets each parsed under its name without `.json` (`data: [run.json]` → `data.run`) — pass the
  name in an attribute, as `product-theatre` does with `scenario="run"`. `source.file` is relative to the
  page's folder. A non-zero exit fails the build at
  the directive with the end of its standard error: refuse bad data there, with a message that says what to
  fix. `validate`, `inspect` and `inspect-review` run providers exactly as `build` does — a provider is
  code, so do not validate an untrusted source that declares providers. A provider that starts its own
  children (`sh -c`, `npm run`) is stopped as a whole process group at `timeoutMs`.
- **`effect`** — `module`, `targets` (`directive`, `attribute`, `values`: the attribute a built-in
  directive gets on pages that declare the effect), `budgetBytes` and `ownsScroll`. The module is
  `export default defineEffect({ mount(ctx) { … return { at(t, progress) {} } } })` with `defineEffect`
  imported from `agentic-report/effect`; the build bundles it with its imports. Two fields belong to the
  object passed to `defineEffect`, not to the manifest: `continuous: false` draws only on scroll, rebuild,
  theme change and a clock seek, for an effect whose state the scroll sets (by default it draws every
  frame while a host is on screen), and `endless: true` (see the pause button below). The author writes
  the target attribute on the host directive, and the effect reads it with `ctx.attribute(host, name)`:

  ```markdown
  ---
  title: How cloth is woven
  extensions: [extensions/loom/extension.yaml]
  ---

  # How cloth is woven

  ::::section{title="The warp" id="warp" loom="selvedge"}
  The long threads are strung first.
  ::::

  ::::section{title="The weft" id="weft" loom="band"}
  The cross threads go over and under them.
  ::::
  ```

- **`island`** — `entry` (an `.html` file) and `assets` (the files it references). The author writes
  `:::island{name="…" hydrate="load|idle|visible|none" height="…" title="…"}` with a Markdown body.

`build` reports each extension's `kind`, `uses`, `bytes` and `notes` (declared but unused, hosts lost);
`inspect` lists them with their manifests. Read both before you hand the page over.

## The rules

- **Tokens only.** Every colour, face, radius, size and duration comes from the theme's public tokens
  (`agentic-report schema --scope theme`). A block and a provider get this for free — they write built-in
  directives. An effect reads tokens with `ctx.tokens.read(…)` and follows `ctx.tokens.onChange`; an island
  gets them as custom properties on its root and a `theme` message when the page's theme changes. A
  hard-coded colour breaks in the next theme and in the dark scheme.
- **The page clock owns time.** An effect gets its time in `at(t, progress)` and has no
  `requestAnimationFrame` or timers of its own; randomness comes from `ctx.random(seed)`. An island that
  moves follows `renderAt { t }`. Two seeks to one moment give one picture, so a page can be filmed and
  checked.
- **Three render modes from one geometry.** An effect runs in `live`, `still` (reduced motion: the final
  state drawn directly, never a timeline played forward) or `static` (no WebGL: the same drawing in 2D).
  Every state an effect sets on the page (`ctx.state.set`) exists in every mode. Below `motion: expressive`
  in the frontmatter the page runs every effect `still` (`reason: "motion-level"`). An asynchronous rendering
  failure such as a lost WebGL context calls `ctx.fallback()` to enter the next safe mode; use
  `ctx.rebuild(reason)` for changed geometry, not for resource failure.
- **Page states are shared.** `ctx.state.set(name, value, document.documentElement)` sets a page state that
  lights every `card` and `:count` with `when="name"`; `ctx.state.watch(name, callback)` follows a state
  that a section, a beat or another effect sets — for example, a station an effect lights when its chapter
  is reached (`events.on('reach', …)`).
- **Long motion gets the page's pause button.** An effect whose motion runs longer than five seconds on its
  own (a loop, a living background) declares `endless: true` in `defineEffect({ … })`; the page adds a **Pause motion** button after
  its block. Do not draw your own, and do not declare it for a short entrance — the button would push the
  page down for nothing. Geometry rebuilds (`rebuild()`) come on a width change — never on a height-only change —, after
  fonts load, after the first screen's entrance and on return to the tab, at most six a second.
- **A static equivalent that says the same thing.** Print, readers without scripts and the moment before an
  island is ready show the static form. The island body is required: write there the result of the page's
  own case, not «interactive calculator».
- **Nothing on the text.** An effect's canvas and details stay off the lines of text (`ctx.obstacles()`
  gives the rectangles to avoid); an island stays inside its frame. The frame narrows to the width the island
  actually draws in (fixed-size pictures in a wide figure get a frame of their width), so draw the island's
  panel on its root at full width and let its content decide; an island that should span the column fills it. Fixed and sticky elements — the top
  bar, the contents column — come as their own layer `ctx.obstacles().pinned` (`{ element, rect }`, the
  rectangle in viewport coordinates); the other layers and `ctx.measure.lines` leave their text out, so a
  route measured at any scroll is the same. Cut pinned elements out of the drawing at their current place.
  After a rebuild the engine draws in the next frame (at once under a recording clock), so place the DOM
  details a `rebuild()` creates in `rebuild()` itself; `ctx.layout.svh` is measured once per rebuild and is
  cheap to read.
- **Two unlike examples.** Each extension ships two example pages that differ in subject, language or
  layout; fewer builds with `EXTENSION_EXAMPLES_MISSING`. Two pages that share half their wording prove
  only that the extension fits one page.
- **An effect passes `effect-check` 11 of 11.** Run
  `agentic-report effect-check <extension.yaml> --out <directory>`: it builds both examples, opens them in
  Chromium and checks the declaration, the reduced-motion final state, the page clock, 50 ms per effect
  call at 4× CPU slowdown, theme colours, no decoration on text, four widths, content edits, states in every
  render mode, print and the two examples. When performance fails, read `performance-diagnostics.json` in the output
  directory for numeric timings by scroll and resize phase. Tasks outside those phases are listed
  separately and do not affect the result. After a confirmed timing failure, a separate advisory
  `effect-diagnostic` pass records the build timings an effect pushes to
  `window.__agenticReportBuildTimings` ([their shape](#build-timings)) under `phases[].builds`; unassigned
  builds are listed separately. If that
  advisory pass cannot complete within 20 seconds, `diagnosticUnavailable: true` leaves the confirmed
  verdict intact.
  The file contains no authored text or paths beyond validated stage names. Hand
  over only at `11 of 11 checks passed`.
- **Licences.** Effect and island code is your own or under MIT, Apache 2.0 or the Unlicense, with its
  notice kept and listed in `licenses`; take ideas from demos, not their code
  ([`assets.md`](assets.md#licences-of-code-and-effects)). GSAP, Rive, Lottie, Spline and Theatre.js are not
  embedded.
- **Weight.** An effect bundle is refused above `budgetBytes` (80 000 bytes by default); `build` reports
  the bytes of each bundled effect and island document. Keep an island to what the reader operates.

## Build timings

When an effect is slow, it can say where the time goes. In the advisory `effect-diagnostic` pass
`effect-check` sets `window.__agenticReportBuildTimings` to an empty array; an effect that finds the array
pushes one record per build (a rebuild or another costly recalculation) and does nothing when the array is
absent, which is every ordinary page:

```js
const timings = window.__agenticReportBuildTimings;
const started = performance.now();
// … measure, then lay out …
if (Array.isArray(timings))
  timings.push({
    startMs: started, // performance.now() when the build began; places it in a scroll or resize phase
    durationMs: performance.now() - started,
    width: document.documentElement.clientWidth,
    stages: { measure: 3.1, layout: 7.4 }, // your own stage names, in milliseconds
  });
```

`startMs` and `durationMs` are required finite non-negative numbers, otherwise the record is dropped;
`width` becomes 0 when it is not such a number. Stage names are yours: a letter followed by letters, digits
or hyphens, 32 characters at most. A stage with another name or a value that is not a finite non-negative
number is dropped, only the first 16 valid stages of a build and the first 128 builds of a pass are kept,
and any other key is ignored. So `performance-diagnostics.json` holds these numbers and your stage names,
never other text the effect wrote.

## Reference extensions

The package ships reference extensions for every level in its `extensions/` folder, and the public site
publishes their READMEs under the same paths. `agentic-report examples` lists them after the example pages,
with the installed path of each manifest, README and example; start from the one closest to your need and
copy its folder beside your page.

| Extension                           | Folder                       | Level     | What it shows                                                                                           |
| ----------------------------------- | ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `key-figure`                        | `extensions/key-figure`      | 1a        | the simplest template: one card, required date and source                                               |
| `product-theatre`, `theatre-script` | `extensions/product-theatre` | 1a and 1b | a frame block and a provider as a pair: a product run from a JSON scenario, replayed as a steps scene   |
| `loom`                              | `extensions/loom`            | 2         | a local effect: each host has its own geometry and progress, and states that exist in every render mode |
| `focus-frame`                       | `extensions/focus-frame`     | 2         | a small WebGL effect on a section image, with token colours and matching 2D/still rendering             |
| `slo-budget`                        | `extensions/slo-budget`      | 3         | an island: theme tokens, language, reported height, `renderAt`, and a static body with the page's case  |

Each README says when to use the extension and when not, lists its attributes and describes its static
equivalent; each folder holds two example pages to build with `agentic-report build`.
