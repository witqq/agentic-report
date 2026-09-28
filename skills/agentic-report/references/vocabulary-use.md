# Where each tool fits

Every recipe, motion technique, video mode, review tool, and presentation capability has a
place where it helps the reader and a place where it only decorates. Read the row before you reach for the
tool. The rule identifiers such as `DR-UNIFORM-ENTRANCE` point at [`design-rules.md`](design-rules.md).

## Choose the directive by the question the reader is asking

| The reader wants                                  | Reach for                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| to see the shape of the page before reading it    | `contents`, and `section` with a short `nav` label                                           |
| the point of a chapter in one paragraph           | `lead` at the top of the section                                                             |
| a warning or a consequence they must not miss     | `callout` with `kind`                                                                        |
| to compare a handful of options side by side      | `cards` with `card`, or a GFM table for dense values                                         |
| the state of each item on a dashboard             | `card` with `status`                                                                         |
| an ordered procedure                              | `steps`                                                                                      |
| what something looks like inside                  | a fenced code block, plus `source-link` to open the real file                                |
| one change, line by line                          | `diff`                                                                                       |
| the verdict of a review or incident               | `findings` with `finding` and a severity                                                     |
| how parts hand work to each other                 | `diagram` with `type="flow"`                                                                 |
| the order of calls in time                        | `diagram` with `type="sequence"`                                                             |
| what changed between two pictures                 | `compare`                                                                                    |
| to watch a behaviour or a recorded run            | `video`                                                                                      |
| how a number moved                                | `chart`                                                                                      |
| figures that come from an export                  | `data` with `{{…}}`, `each` and `expect` ([`compose.md`](compose.md#build-a-page-from-data)) |
| which data or footage a block shows, and when     | `source-line` under the block                                                                |
| a count with its noun, a time in a known zone     | `plural`, `time`                                                                             |
| what a notification or an agent dialog looks like | `message`, `conversation` with `illustrative="true"` for a mock                              |
| when things happened                              | `timeline`                                                                                   |
| a definition they will meet again                 | `glossary` with `term`                                                                       |
| detail that only some readers need                | `disclosure`, `tabs`, `modal`, or `popover`                                                  |
| to give you a structured answer back              | `response` with `question`, `bucket`, `option`, `item`                                       |
| to discuss a fragment with you                    | `review: true` in the frontmatter, then Review Workspace                                     |

A directive earns its place when it answers a question the prose cannot. Three `callout` blocks in a row
mean none of them is a warning any more. How to write a diagram, a recording, and a presentation is in
[`compose.md`](compose.md).

## Typographic roles

The page sets its type by roles, and the look of each role is the theme's. Mark a role; never imitate one
with bold text or capitals typed by hand.

| Role                              | Write                                                | Where it fits                                                          | Where it does not                                   |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Lead                              | `:::lead` first in a section                         | The point of the chapter in one paragraph                              | A second lead, a lead that repeats the title        |
| Eyebrow                           | `::eyebrow[…]` before a title, or first in a section | A short kicker: the flow and run, the chapter's subject in two words   | A sentence; an eyebrow over every chapter           |
| Bright first sentence, quiet rest | `**First sentence.** :muted[the rest]`               | A dense paragraph whose first sentence is the claim                    | Hiding information the reader needs in grey         |
| Mono label                        | `:meta[run 96 · 01:17]`                              | Identifiers and readings inside prose: a run, a version, a file name   | Code the reader copies — that is inline code        |
| Figure caption                    | `typography.captions: italic` in the theme           | An editorial page with a serif heading face: captions in serif italics | A dashboard; a sans theme where italics add nothing |

## Recipes

A section is shaped by the closed package grammar, never by CSS or HTML. Start with a recipe when one fits
the chapter's job, then add only the overrides that are actually needed. The last column says what the
recipe brings by default.

| Recipe      | Where it fits                                                                                                | Where it does not                                                                                              | Brings by default                         |
| ----------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `hero`      | The one chapter that sets the stage of a landing or showcase, with a real picture                            | A report chapter; a second hero on the same page; a hero without an image                                      | `scene="progress"`                        |
| `evidence`  | A claim beside the picture, chart, or table that proves it                                                   | Prose with nothing to show beside it — the split leaves an empty half                                          | nothing moves                             |
| `story`     | A sticky picture, diagram, or timeline with steps of text beside it: a walkthrough, a process, a field story | Fewer than three steps; text that does not refer to what stays on screen                                       | `transition="reveal"`, `scene="progress"` |
| `rail`      | Several pictures of the same kind the reader browses: work, screens, places                                  | One or two pictures; pictures that must be compared side by side                                               | nothing moves                             |
| `metrics`   | Four to eight numbers with their labels at the top of a dashboard or report                                  | A single number (use `statement`); numbers without units or dates                                              | `surface="grid"`                          |
| `thesis`    | The one sentence the page argues, before the evidence                                                        | Every chapter — a thesis only works once                                                                       | `transition="reveal"`                     |
| `statement` | One quote or one figure that deserves a whole screen                                                         | A figure without its caption; more than two statements on a page (`DR-SURFACES`)                               | `transition="reveal"`                     |
| `blueprint` | A specification, an architecture, a technical drawing with its explanation beside it                         | Marketing copy; a page whose theme already draws a grid backdrop (`blueprint`) unless you set `backdrop: none` | `surface="blueprint"`                     |
| `demo`      | The first screen of a landing that shows the product: a result, code beside it, a clip                       | Any section but the first; a demo that is a stock picture (`DR-REAL-MATERIAL`)                                 | nothing moves                             |

A recipe's defaults count like attributes you wrote: they move the page and use up its decorative surfaces.
Override one with an explicit value (`transition="none"`, `surface="plain"`) when the brief asks for less.
`inspect` reports each section's resolved values under `structure`.

`place="opening"` on the first section joins it to the title as the first screen; `opening: start` in the
frontmatter aligns that screen to the start. Overrides: `composition`, `viewport`, `section-density`, `type`,
`media`, `media-fit`, `media-aspect`, `focal`, `surface` (`plain`, `tint`, `grain`, `grid`, `blueprint`),
`frame`, `tone`, `width`, `align`. Do not combine `composition="mosaic|stack"` with `media="layers|gallery"`.
Split and stage arrange only the opening blocks right after the title, with at most one picture; every
later block spans the whole track. Keep important reading order in source: layouts flatten on narrow
screens. At most two chapters get a decorative surface (`DR-SURFACES`).

The order of recipes is the argument of the page. Write it from the brief; a landing that keeps the
starter's order reads like every other page made from it (`DR-LANDING-ORDER`). The form catalog
`layout-mixed`, the examples in `examples --json`, and the exemplar list at the end of the playbook show
complete pages to copy from.

## Motion

Motion comes from the same grammar: `transition` (`reveal`, `stagger`, `lines`, `clip`, `staged`), `scene`
(`progress`, `sticky`, `steps` and `scrub` with `beat{focus lines state}`), `interaction` (`depth`, `tilt`),
`choreography="cascade"`, `draw="scroll"`, `pulse` and `zoom` on a flow diagram, `count-up` on a chart,
`:count[…]` on a figure, page states (`state` on a section or beat, `when` on a `card` or `:count`),
`progress: page|chapters|nodes` in the frontmatter,
and `effect="magnetic"` on one primary action. The theme's `motion.easing` and `motion.pace` set the
character of all of it. Reduced motion always leaves every piece of content visible and still.

The brief's `motion` row decides how much moves — `none`, `restrained` or `expressive` — and you write the
answer as `motion:` in the frontmatter; the package's motion budget is only a floor of safety under it. The
build holds the page to its level by the table below: at `none` nothing moves; a technique above the level
fails with `MOTION_LEVEL_EXCEEDED` where it is written, and a value a recipe brought is named with its
recipe — write that attribute as `"none"` or raise the level. Leave `motion` out only when the brief gives
the whole vocabulary (`expressive`).

| Lowest level | Techniques                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restrained` | One chapter entrance: `transition` `reveal`, `stagger`, `lines`, `clip` or `log`, or `reveal="true"`                                                                                                                                                          |
| `restrained` | One pointer effect: `interaction` `depth` or `tilt`, `effect="magnetic"` on an `action`                                                                                                                                                                       |
| `restrained` | Any number of counts and small in-place movements: `:count`, `count-up` on a `chart`, `choreography="cascade"`, `:swap`, `:typing`, `:mark`, `spotlight`, `seam="fade"` on a `video`                                                                          |
| `expressive` | Directed motion: `scene` `progress`, `steps` or `scrub`, `transition="staged"`, `draw="scroll"`, `pulse` and `zoom` on a `diagram`, `demo` with `play` (`time` or `scroll`), and extension effects; below this level extension effects draw their still state |

For each moving element, say in one sentence what the
reader learns from the movement; remove the ones without an answer (`DR-MOTION-MEANING`); an entrance
travels at most 16 pixels toward its source, and a meaningful gesture is large enough to see
(`DR-MOTION-ORIGIN`). Most chapters simply are there (`DR-UNIFORM-ENTRANCE`); at most one pointer or magnetic
effect per page (`DR-ONE-EFFECT`). Do not invent timing, coordinates, CSS, or browser code.

The table says where each technique helps. The last two columns say what the reader gets under reduced motion and on a phone; a
technique whose still version would lose the point does not belong on the page.

| Technique                | Where it fits                                                                                                              | Where it does not                                                                               | Without motion                                       | On a narrow screen                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `transition="reveal"`    | A chapter that should arrive as one piece when the reader reaches it                                                       | Every section of the page (`DR-UNIFORM-ENTRANCE`)                                               | The chapter is simply there                          | As on a wide screen                                            |
| `transition="stagger"`   | Cards or steps whose order matters and is read in turn                                                                     | Blocks that are read together; more than one staggered section per page                         | Every item is there at once                          | As on a wide screen                                            |
| `transition="lines"`     | A long display title that is the point of its chapter                                                                      | Short titles; body text; several titles in a row                                                | The title is there, whole                            | As on a wide screen                                            |
| `scene="progress"`       | Media that should ease with the scroll so the chapter feels continuous                                                     | Media that the reader studies in detail — it moves under their eyes                             | The media stands still                               | Moves the same small distance                                  |
| `scene="sticky"`         | One picture that the following paragraphs keep referring to                                                                | A picture taller than the screen                                                                | Still pinned; nothing moves                          | Not pinned at 768 px and below: the picture stays in the flow  |
| `scene="steps"`          | A process explained step by step against one picture, one diagram or one code block (`beat{lines="2-4"}` lights the lines) | Fewer than two beats; beats that do not change the picture or the lit part                      | The beats stand in the flow, each with its state     | The media stays under the top bar above the current beat       |
| `scene="scrub"`          | Two to four steps the scroll should play like a short film against one picture or diagram: a reveal, a before and after    | A walkthrough longer than four steps (use `steps`); text the reader studies                     | The picture, then every beat, every state set        | The picture above the caption, one screen per step             |
| `transition="clip"`      | A chapter that opens like a curtain from its lower edge: a scene, a finale                                                 | Several chapters in a row; text-only chapters                                                   | The chapter is simply there                          | As on a wide screen                                            |
| `transition="staged"`    | The first screen of an expressive landing (`place="opening"` only): title by lines, eyebrow, subtitle, actions, scene      | Any other section; a document                                                                   | The first screen is simply there                     | As on a wide screen                                            |
| `recipe="thesis"` fill   | The one thesis of the page: its lead fills with the heading colour as the reader passes it                                 | Ordinary prose — never colour paragraphs word by word                                           | Filled                                               | As on a wide screen                                            |
| `state` and `when`       | Stations that light when their chapter is reached; a count that starts with its chapter                                    | Decoration that says nothing about where the reader is                                          | Every station lit, every count final                 | As on a wide screen                                            |
| `interaction="depth"`    | A hero picture that invites a small pointer response (12 px)                                                               | More than one per page (`DR-ONE-EFFECT`); pictures with text in them                            | No response                                          | No response: pointer effects need a fine pointer               |
| `interaction="tilt"`     | A single card-like picture: a photo, an object                                                                             | A product shot (a tilted dashboard is a cliché); charts, diagrams, anything read closely        | No response                                          | No response: pointer effects need a fine pointer               |
| `choreography="cascade"` | A metrics field whose values should be read in order                                                                       | Unrelated cards                                                                                 | Every value is there at once                         | As on a wide screen                                            |
| `draw="scroll"`          | A diagram whose story is the order of its connections; a marker rides the connection being drawn                           | Dense diagrams read as a whole; diagrams inside a report chapter the reader returns to          | The diagram is drawn complete, the marker at the end | Draws in the diagram's narrow view                             |
| `pulse="a,b,c"`          | A route through a diagram the reader should follow once                                                                    | Every diagram of a page; a route that is not the point of the chapter                           | The route marked in the accent colour                | As on a wide screen                                            |
| `zoom`                   | One node that is a system of its own, opened after the whole is read                                                       | A node whose inside is one or two boxes — write its `detail`; a second zoom in the same diagram | The diagram and the inside side by side              | The camera flies in the narrow column; the inside ends smaller |
| `count-up` on a chart    | A chart whose growth from zero is the news — a first release, a jump                                                       | Charts read for comparison; several on one screen                                               | The final values                                     | As on a wide screen                                            |
| `:count[…]`              | A real, dated figure that matters and is new to the reader                                                                 | Many figures at once; values that change meaning while counting (dates, versions, IDs)          | The final value                                      | As on a wide screen                                            |
| `progress: chapters`     | A long landing or story whose chapters the reader should see passing                                                       | A short page; a document with a sidebar that already shows the route                            | Stays: it is navigation                              | Stays                                                          |
| `progress: nodes`        | A throughline: a story whose chapters are stations — passed, current, ahead                                                | A document; a page with two chapters                                                            | Stays: it is navigation                              | Stays                                                          |
| `progress: page`         | A long single-chapter essay                                                                                                | Pages with chapters — use `chapters`                                                            | Not drawn: it is decoration                          | As on a wide screen                                            |

A section's `state` is set when the reader reaches it, and every `card` or `:count` with the same `when`
lights or starts then; a `beat` of a scrub scene carries its own `state` for its step:

```markdown
---
title: Stations
---

# Stations

::::::section{title="Arrive" id="arrive" state="arrived"}
The reader arrives.

::::cards{title="Route"}
:::card{title="Arrive" when="arrived"}
Here, :count[3]{when="arrived"} stations in.
:::

:::card{title="Walk" when="walked"}
Still ahead.
:::
::::
::::::

::::section{title="Walk" id="walk" state="walked"}
Then walks.
::::

::::::section{title="The plane" id="plane" scene="scrub"}
![The plane on the stand](assets/plane.jpg)

:::beat{title="Parked" state="parked"}
The plane stands on the stand.
:::

:::beat{title="Loaded" state="loaded"}
The cargo is aboard.
:::
::::::
```

### Norms of motion

- **An entrance comes from somewhere and travels little.** At most 16 pixels toward its source, a scale only
  from 0.97 to 1; a meaningful gesture — a jerk, a cut, a recoil — is a different class, around 40 pixels,
  and must be visible at normal scroll speed (`DR-MOTION-ORIGIN`).
- **`scene="progress"` is a decorative layer.** Its travel stays within 10–15 % of the screen and goes one
  way; the package moves the media ±12 pixels and switches it off under reduced motion. A reader who studies
  the picture should never have to chase it.
- **Depth is 12 pixels.** The pointer response of `interaction="depth"` stays within the 5–15-pixel norm;
  wider is sway, not depth.
- **One continuous movement per page, and quiet.** WCAG 2.2.2 calls for a pause, stop or hide control when
  visible information starts moving automatically, lasts more than five seconds and appears beside other
  content, unless that motion is essential to the activity. Automatically updated information beside other
  content needs such a control or an update-frequency control even below five seconds. A constant pulse
  stops feeling like energy. For an effect with `endless: true`, the package adds **Pause motion** in the
  page flow in live mode and remembers the reader's pause choice between visits; do not write another
  button. Under reduced motion the effect draws its still state and needs no motion button.
- **Captions of a scrub scene are short.** Every caption shares one cell of fixed height, so the longest
  sets the height of all; one or two sentences, and a status that appears only when its step is reached.
- **`:count` only on a real figure with its date.** Counting an invented or undated number animates a
  claim nobody can check.
- **The final state is drawn directly.** A still version shows the end of the animation built from the same
  source, not a frame captured halfway or a timeline rewound.
- **No word-by-word highlighting of prose.** Karaoke-style colouring of paragraphs makes the reader wait
  for the text; colour a thesis at most, once.
- **A WebGL transition between screens belongs to a page that moves one screen per gesture** (`layout:
slides` or `layout: screens`); on a scrolling page it is decoration.
- **Tabs and diagram views change by a view transition.** A node keeps its place between views of a diagram
  and a list row moves into the diagram node with the same text; write the same labels in both if the
  switch is meant to read as one thing changing form. Without support and without motion the view changes
  at once.
- **On a phone, the current row replaces hover.** A linked card, a step or a timeline row at the middle of
  the screen takes the look it has under the pointer; nothing is hidden behind hover.
- **Grain only under a large fill beside real material.** Grain on an empty gradient is a cliché.

Keep scroll under the reader's control: a pinned or scrubbed scene follows the reader's gesture rather
than taking over wheel input to play a fixed-duration film. Use grain only under a large fill beside real
material; it cannot supply the subject of a page by itself.

## Played scenes, marks and frames

These techniques come from product landings that reconstruct the product instead of showing a picture of it.
Each is a directive or an attribute; the page runtime plays it on the page clock, and each has a final frame
that the page shows under reduced motion, with `motion: none` and in print.

| Technique                   | Where it fits                                                                                    | Where it does not                                                                          | Without motion                                       | On a narrow screen                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------- |
| `demo` with `play="time"`   | The product reconstructed and played: a run, a request, a deploy, with a play and a pause button | A behaviour that needs proof it is real (a `video`); more than one played scene per screen | The final frame: the stage with every beat beside it | The beats under the stage, played the same way                |
| `demo` with `play="scroll"` | The same reconstruction the reader drives: pinned while its beats pass                           | A short chapter; a scene the reader must study while it moves                              | The final frame, nothing pinned                      | Not pinned; the beats follow the stage                        |
| `transition="log"`          | A section whose code block is the output of a run, printed line by line like a log               | Source code the reader studies; several logs on one screen                                 | The whole block, printed                             | As on a wide screen                                           |
| `:swap[…]`                  | One word of a thesis that has two or three true alternatives                                     | Body text; a word the reader must read to follow the sentence; more than one per screen    | The written word alone                               | As on a wide screen                                           |
| `:typing[…]`                | A short command or query the reader will type themselves                                         | Headings; anything longer than a line (80 characters); several on a screen                 | The whole line                                       | Types in place when the line fits; a wrapped line stays whole |
| `:mark[…]`                  | The one or two words a chapter turns on: a count, a refusal, a result                            | Decoration; a third mark in a section (the build refuses it)                               | The mark drawn complete                              | As on a wide screen                                           |
| `spotlight`                 | One detail of a real screenshot and what it means                                                | A picture without a detail worth moving in on; a chart (use `chart`)                       | The loupe in place, the rest dimmed                  | The explanation under the picture                             |

A playable scene is a `demo` with `play`: what comes before its first `beat` is the stage — code, a diagram,
cards or a picture of the product — and each `beat` is one moment of the run. A beat's `focus` lights the
diagram nodes and connections it names, as in a steps scene. `play="time"` plays each beat for `seconds`
(3 by default) and stops on the last one with a button to play again; the scene starts when it is on screen
and pauses when it leaves. `play="scroll"` pins the scene while the reader scrolls through 2–8 beats. To let
the reader choose a scenario, put one scene in each `tab`: a scene in a closed tab waits and starts from its
beginning when the tab opens.

```markdown
---
title: A deploy, played
---

# A deploy, played

::::::demo{title="One deploy" play="time" seconds="2"}
:::::diagram{title="Pipeline" description="Build, then test, then ship."}
::node{id="build" label="Build"}
::node{id="test" label="Test"}
::node{id="ship" label="Ship"}
::edge{from="build" to="test"}
::edge{from="test" to="ship"}
:::::

:::beat{title="Build" focus="build"}
The bundle is written in 4 seconds.
:::

:::beat{title="Test" focus="test"}
312 checks pass.
:::

:::beat{title="Ship" focus="ship"}
The page is live.
:::
::::::
```

The small techniques live in running text. `:swap[faster]{words="calmer, exact"}` shows the written word,
swaps it on a beat through one to three other `words` and returns to it within five seconds; the widest word
keeps its place, so the line never moves. `:typing[agentic-report build page]` types a line of at most 80
characters in place when it comes into view; the whole line is in the page from the start.
`:mark[three times]{shape="circle"}` draws a hand-made line around the words in the theme's marker colour: `shape` is
`underline`, `circle` or `strike`, and the jitter comes from `seed` (by default from the words), so every
build draws the same line. A section holds at most two marks.

`:::spotlight{x="72" y="38" zoom="2.5"}` holds one screenshot, first, and its explanation after it: a loupe
over the point `x`, `y` (per cent of the picture from the left and the top) shows the detail `zoom` times
larger (1.5–4), the rest of the picture is dimmed, and the explanation stands beside it.

```markdown
---
title: The switch
---

# The switch

:::spotlight{title="The cache switch" x="72" y="38" zoom="2.5"}
![Settings with the cache switch on](assets/settings.png)

The switch turns the build cache on for every branch.
:::
```

A section with `transition="log"` prints each of its code blocks line by line when it comes into view; the
block keeps its height, and its whole text is in the page for copying and for the screen reader.

| Frame or through-line                   | Where it fits                                                                                                 | Where it does not                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `section{frame="browser" address}`      | A screenshot of a live page, with the page's real address in the bar                                          | A made-up address; a screenshot of an app, not a page; every picture of the page          |
| `section{frame="browser" illustration}` | A mock-up shown as a page: the bar says Illustration                                                          | A real page — give its `address` instead                                                  |
| `::contents{sticky="true"}`             | A long landing whose chapters are its argument: numbered at the edge of a wide screen, the current one marked | A document or a dashboard: their contents already stand beside the text (the build warns) |
| `tabs` with `orientation="vertical"`    | Scenarios or parallel views with longer labels, beside the panel on a wide screen                             | Two short labels; tabs inside a narrow column                                             |
| `chrome.edges: mono` in the theme       | A technical product: the page title and the current chapter in small monospace along the screen edges         | A report, a story, a page without chapters; with a numbered navigation it repeats it      |

```markdown
---
title: The live page
---

# The live page

::::section{title="Illustrative pricing layout" id="pricing" frame="browser" illustration="true"}
![Mock pricing layout marked as an illustration](assets/pricing.png)

This is a mock layout, not a live pricing page.
::::
```

A browser frame is the one place where browser chrome belongs, and only with the truth in its bar: the build
refuses `frame="browser"` without `address` or `illustration="true"`. The frame holds the first picture of
the section and has no window buttons or made-up tabs (see the cliché table in
[`art-direction.md`](art-direction.md)).

## WebGL

WebGL belongs in a declared `kind: effect` extension when the visual subject needs it. The core has no
WebGL section attribute. Give the effect a still equivalent and a fallback for a missing or weak WebGL
context; the [extensions reference](extensions.md) describes the contract and its checks. The packaged
[`focus-frame`](../../../extensions/focus-frame/README.md) shows a small WebGL effect with two image-frame
variants and matching 2D rendering.

- **The law of motion comes from the subject.** A network lights the path the data took. A product tool can
  show its mechanism with timed HTML and SVG states; a shader helps only when the visual subject needs it.
- **Fewer exact elements beat a million particles.** Draw only the marks that explain the subject or guide
  the reader; more marks do not make the point clearer.
- **Outdated tricks of 2018–2024:** a photo that distorts under the cursor, an RGB split, «liquid»
  transitions, tilt from scroll speed, particles that gather into a logo, cube, whip and zoom-blur
  transitions, bloom as a filter.
- **Pre-render the heavy.** Procedural scenes that only play are cheaper as a clip with the live interface
  beside it; keep live only what answers the reader or shows the steps.
- **At rest the effect matches its still picture,** and every state it shows exists without WebGL
  (`DR-WEBGL-FALLBACK`).
- **Do not:** a camera driven by key frames from scroll without the owner's decision (it costs months),
  GPGPU particles, WebGPU without a fallback to WebGL, scene data in JSON instead of textures.

Reference lessons without copying their code: Igloo Inc keeps one procedural ice object as the subject;
Lusion lets physics move the scene while text stays legible; Messenger by Abeto uses stylised shapes rather
than photorealism. If a shader is costly, lower its work after measured slow frames and use high precision
where coordinates actually need it. For this package, begin with one marked host, inspect frame cost with
`effect-check`, reduce work before adding detail, and keep a matching 2D/still rendering path.

## Video

| `video` attribute   | Where it fits                                                                                        | Where it does not                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mode="clip"`       | A short silent loop that shows a behaviour: a screen recording, a result                             | Anything with speech or that needs the reader's attention from the start            |
| `mode="background"` | A calm silent loop behind a landing chapter that sets a mood with meaning                            | Behind text that must be read; a loop with cuts; a page without a poster            |
| `mode="manual"`     | A walkthrough with sound the reader chooses to watch                                                 | The first screen of a landing — a video that waits is a closed box                  |
| `sources`           | Every published clip: AV1 and VP9 before H.264 for a smaller download                                | A single-file handoff — only the most compatible source is embedded                 |
| `chapters`          | A clip longer than a minute with distinct parts                                                      | A loop under 20 seconds                                                             |
| `start`             | A recording whose useful part begins after a few seconds of setup: the loop starts and returns there | A manual video — it does not loop (the build refuses it)                            |
| `seam="fade"`       | A loop whose end and start differ: the last half-second dims and the first brightens                 | A loop that already joins cleanly; a background whose cut is the point              |
| `expand="true"`     | A clip too small to read in the column: Expand opens it large with full controls and sound           | A background or a manual video (the build refuses it); a clip already at full width |

Without motion a clip waits on its poster for the reader to press play; on a phone it plays inline, muted.

- **A poster, always,** whatever the mode: it is what the reader sees before the clip plays, under reduced
  motion, when the phone refuses to autoplay, and in print.
- **Video or reconstruction.** A clip proves that the product is real and shows complex behaviour cheaply;
  a reconstruction from directives (code, a diagram, cards, `scene="steps"`) explains a mechanism, stays
  sharp, weighs kilobytes, and can be searched and translated. Video for proof, reconstruction for
  explanation.
- **Cut for meaning.** One clip, one action, 4–12 seconds; cut the pauses, move in on the action, end on the
  result. A loop runs 15–30 seconds at most (under 20 is the package's advice for a `clip`); an explaining
  video of 60–90 seconds plays only when the reader presses it.
- **Captions are required:** people watch without sound, so the text on screen or a WebVTT track says what
  happens.
- **Crop the recording to readable text.** Record on a high-density screen and crop until the interface
  text is 13–14 pixels on the reader's screen; a whole editor shrunk into a card is noise.
- **Scrub only a physical object.** Scrolling through a clip suits an object turning in space; a recording
  of an interface is an action in time, and a wheel turns it into jerky rewinding.
- **Do not:** a video as a WebGL texture only to show a clip (it costs a WebGL context), image sequences in
  a canvas, a YouTube embed on the first screen (the player weighs more than the clip).

When several product clips are equally useful, give each a named tab or disclosure and play only the
reader's selected clip. The still poster and caption explain each choice before playback.

## Detail on demand

| Directive    | Where it fits                                            | Where it does not                                                   |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `disclosure` | Evidence or detail that only some readers need           | The conclusion of the chapter                                       |
| `tabs`       | Parallel views the reader truly picks one of             | Content every reader needs; a switcher for its own sake             |
| `popover`    | A definition or a short aside next to a word             | The only place of a key number: it must also be visible on the page |
| `modal`      | A large detail the reader opens on purpose: a full table | The only place of a key number or a status                          |

A key number, a status or a count never lives only in a popover, a modal, or a tooltip: a reader scanning
the page, a phone without hover and a printout all miss it.

## Parts inside a block

A block is written with its parts; the catalogue ([`catalog.md`](catalog.md)) lists every allowed value.
The parts an agent most often gets wrong:

| Block                 | Parts and attributes                                                                                                                                                                                              | When it matters                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `decision`            | `decision-option{id label}` per option; `required="true"` marks the decision required on the page                                                                                                                 | Every option the reader weighs, the recommended one first                           |
| `checklist`           | `check-item{id label required}`                                                                                                                                                                                   | A static list of conditions; for answers the reader returns use `response`          |
| `tabs`                | `tab{label}` per panel                                                                                                                                                                                            | Parallel views of one thing; never the only place of a key number                   |
| `chart`               | `type` (`bar`, `line`, `pie`), `description`, `x-label`, `y-label`, `count-up`; `series{label}` with `point{value}`                                                                                               | Axis labels carry the unit and the date of the slice (`DR-DATA-SLICE`)              |
| `findings`            | `finding{severity location}` with `blocking`, `major`, `minor` or `note`                                                                                                                                          | `location` names the file and line the finding is about                             |
| `question`            | `kind` (`bucket`, `item-single`, `item-multi`, `single`, `order`, `number`, `text`) and `prompt`; `min`, `max`, `step` on a `number` question; answers go into `bucket`, `option`, `item{note meta href comment}` | `comment` lets the reader explain a choice; `href` points at the thing being ranked |
| `compare`             | `before`, `after` images of the same frame                                                                                                                                                                        | Two states of one screen, not two different screens                                 |
| `diagram`             | `direction` `auto`, `right` or `down`                                                                                                                                                                             | `down` on a long chain that must read on a phone                                    |
| `actions`             | `action{href kind}` with `kind` `primary` (default), `secondary` or `quiet`; `placement` `auto`, `edge`, `inline` or `bottom`                                                                                     | One primary action; the rest are links                                              |
| `modal`, `popover`    | `trigger` — the words that open it                                                                                                                                                                                | The trigger says what opens, not «more»                                             |
| `disclosure`          | `open` `true` when the detail is needed on first read                                                                                                                                                             | Closed by default; open only for what most readers need                             |
| `glossary`            | `key` and `term` per definition, `forms` for its inflected spellings; `placement` `inline` or `appendix`                                                                                                          | `appendix` when many terms would break the reading line                             |
| `card`, `source-link` | `href` to the thing the card or link is about                                                                                                                                                                     | A card with `href` is one link; do not put a second link inside                     |
| `asset`               | `src` of a confined local file offered as a download                                                                                                                                                              |
| `timeline`            | `description`; `event{date kind}` per entry, `kind` `neutral`, `accent`, `success` or `warning`                                                                                                                   |
| `filter`, `toggle`    | `filter{placeholder}` names the search field; `toggle{label default}` starts `off` or `on`                                                                                                                        |
| `demo`                | `start` and `step` of the counter card; `play`, `seconds` and `beat` for a played scene                                                                                                                           | Data the reader takes away: a CSV, a JSON export, a PDF                             |

## Review tools

| Directive or attribute | Where it fits                                                          | Where it does not                                                   |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `diff`                 | One change a reviewer must read line by line, with its `file`          | A whole file (use a code block); more than 80 changed lines at once |
| `findings`             | The verdict of a review, incident, or audit with one entry per finding | A list of ideas without severity                                    |
| `finding`              | One problem with a severity, a title, and where it is                  | A compliment or a neutral remark — use prose                        |
| `card status`          | A dashboard card whose state the reader acts on: good, watch, risk     | Decoration; a status that is not true right now                     |

## Presentation

| Capability         | Where it fits                                                                                           | Where it does not                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `layout: slides`   | A demo, pitch, update, or lesson shown to people, live or filmed                                        | A document people read alone and search in                                                     |
| `layout: screens`  | A story or landing read alone, one idea per screen, one gesture per screen — a throughline, a manifesto | A document people search, scan or come back to; a screen whose content does not fit the window |
| `appear`           | Points the speaker reveals one at a time while talking                                                  | Every block of every slide; content the audience needs at once                                 |
| `notes`            | What the speaker says but the slide does not show                                                       | Text the audience should read                                                                  |
| `slide-transition` | On a `section`: `fade` by default; `push` for moving forward in a sequence; `zoom` into a detail        | A different transition on every slide                                                          |
| `?view=film`       | Recording the deck with agentic-screencast or any browser recorder                                      | Presenting to people — they need the controls                                                  |
| `?view=presenter`  | The speaker's own screen during a talk                                                                  | The screen the audience sees                                                                   |

A `layout: screens` page keeps scrolling but stops at every top-level section: one wheel, trackpad or touch
gesture and one key press move exactly one screen, a switcher at the edge jumps to any screen, and the
address follows the current one. Every screen must fit the window: `snapshot` photographs each screen (and
each step of a scrub scene) and warns `SNAPSHOT_STOP_CUT` for one cut at the fold — shorten it or split it.
Under reduced motion the page scrolls as a document, and it prints as one.
