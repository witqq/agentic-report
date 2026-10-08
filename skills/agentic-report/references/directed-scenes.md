# Directed explanations and interface orientation

Use a directed composition when the viewer must see an object change, move between owners, or produce a result beside code. The page supplies the layout, named objects and actions; Agentic Screencast supplies measured narration time and the film's camera, entrances and transitions. A sequence of identical diagrams with a different highlighted paragraph rarely shows the mechanism. Choose the development with [directing](directing.md) and coordinate it with [combinations](combinations.md). Start from the visible change: what exists before the spoken line, what happens while it is spoken, and what remains afterward.

This reference covers composition choice, source syntax, action semantics, speech timing, existing effects and interface orientation. The exact field domains are in [the generated catalog](catalog.md#composition). The full sources to adapt are [first edit](../../../examples/directed-first-edit/report.md), [theme color](../../../examples/directed-theme-color/report.md) and [change event](../../../examples/directed-change-event/report.md).

## Choose the picture that explains the claim

| The viewer must understand                | Composition       | Put on the stage                                                              | Useful actions                                            |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Which operation changes the model         | `diagram-code`    | Visual/source/result objects beside one `role="code"` object                  | `copy`, `replace`, then `focus` with `lines`              |
| Where a value travels                     | `pipeline`        | Stages in their processing order                                              | `connect`, `transfer`, then `focus`                       |
| What changed, or which two results differ | `before-after`    | An optional source above result objects                                       | `replace`, `compare`; connect each result to its source   |
| Where a detail belongs                    | `overview-detail` | The complete visual on the left and one `role="detail"` explanation beside it | `focus`, `camera`; keep the whole visual available        |
| Who owns a value at each step             | `ownership`       | Named owners with stable titles                                               | `copy` for an independent value, `transfer` for a handoff |

Objects hold ordinary Markdown, local images, diagrams and code fences. Their original bodies and runtime copies use the same resource handling as the visible page: `single-file` embeds local images, while `directory` writes content-addressed files into its `assets/` folder. Keep authored paths relative to the source; no manual asset copying or CSP change is needed for composition replay. `role` selects a place in the package layout, not a class or CSS rule. Keep object titles stable when values change: the viewer should recognize the same owner throughout. Use a short title stating the claim, concise object labels and one readable value per object. Prefer a useful arrangement and visible causal action over decoration behind small text.

Code objects in `pipeline`, `before-after` and `ownership` receive a full-width row below the other objects; `diagram-code` gives shorter code its dedicated column. Connections and moving objects use stage-local coordinates and stay aligned when a film fits the scene.

## Write a scene without layout code

Use a longer fence for the outer composition than for its objects. Object names are local to their composition; two stages may both contain `source`. A composition has 1–16 objects and at most 64 cues. `id` is required; `title` is optional. The default kind is `diagram-code` and the default role is `visual`.

````markdown
---
title: The first edit makes the value local
language: en
layout: dashboard
theme: blueprint
scheme: light
motion: expressive
topbar: false
attribution: false
---

::::composition{id="edit" title="Keep the glow. Change the shadow." kind="diagram-code"}
:::object{id="layout" title="Layout owns the original" role="source"}
**Glow + shadow**
:::
:::object{id="shape" title="Shape owns the edited value" role="result"}
Inherited from the layout
:::
:::object{id="command" title="Illustrative command" role="code"}

```ts
const local = expand(inherited);
const next = patch(local, { shadow: newShadow });
shape.effects = next;
```

:::
::cue{at="b2" action="copy" target="layout" to="shape" duration="0.8"}
::cue{at="b2+0.8" action="focus" target="command" lines="1"}
::cue{at="b3" action="replace" target="shape" value="Glow + new shadow"}
::cue{at="b3" action="focus" target="command" lines="2-3"}
::cue{at="b4" action="compare" target="layout" to="shape"}
::::
````

The objects are arranged together from the beginning. The second paragraph copies a value, the third changes it, and the fourth compares the owners. This explains inheritance and a local edit through state changes. The pseudocode and values must be labelled illustrative unless they are taken verbatim from inspected product evidence.

## Keep the map stable while the example develops

An architecture object identifies a component and its responsibility. Keep that text, its title and its position stable. Put changing values inside a named `slot`, or give the evolving example a separate object. Do not replace a familiar component's definition with each new explanatory paragraph. Replacement remains useful for a genuinely changing value; it is not a substitute for moving attention.

```markdown
:::::composition{id="values" kind="ownership" layout="row" align="start"}
::::object{id="source" title="Original owner"}
Keeps the shared original.
:::slot{id="value" title="Example value"}
Glow + shadow
:::
::::
::::object{id="local" title="Local owner"}
Stores its independent edited value.
:::slot{id="value" title="Example value"}
Waiting
:::
::::
::cue{at="b2" action="copy" target="source" slot="value" to="local" toSlot="value"}
::cue{at="b3" action="replace" target="local" slot="value" value="Glow + new shadow"}
:::::
```

Slot ids are local to their object. `slot` addresses a source/value region; `toSlot` addresses the destination of copy or transfer. These fields belong to value actions only. A stable object containing slots must be changed through a slot, so replacing or transferring the complete owner cannot erase its map or responsibility. Slots appear after the stable body and keep their own optional title. The runtime reserves the largest declared value height at the current width, including intermediate copy/transfer states; backward seeks reconstruct values without shrinking the map. A slot containing an image still needs its intrinsic dimensions to establish size before the image loads. Select a slot for a filmed detail with `[data-composition-slot="local:value"]`.

## Arrange relationships, groups and reading edges

`kind` describes the explanation. Independent `layout` chooses `auto`, `row`, `column` or `grid`; `auto` retains the kind's arrangement. Rows wrap when the available width cannot hold readable objects. `align` chooses `start` (default), `center` or `stretch`. A shared start edge makes a processing chain readable when labels have different lengths. Center alignment is useful when centers themselves express a shared axis; stretch is useful for paired comparisons.

A `scene-group` contains related objects and has its own `id`, optional `title`, `layout` and `align`. Group names are local to their composition; object names remain unique throughout the entire stage, including its groups. Use a longer fence for the group than for its objects. Keep a code object outside the group when it explains the whole map.

```markdown
:::::composition{id="delivery" kind="pipeline" layout="column"}
::::scene-group{id="runtime" title="Runtime boundary" layout="row"}
:::object{id="queue" title="Queue"}
Retains pending messages.
:::
:::object{id="consumer" title="Consumer"}
Receives each delivered message.
:::
::::
:::object{id="explanation" title="Delivery result" role="detail"}
The queue loses the message only when delivery finishes.
:::
::cue{at="b2" action="connect" target="queue" to="consumer" value="delivers"}
:::::
```

Grouping expresses a real common responsibility, lifecycle or boundary; it is not decoration around unrelated terms. Nearer spacing within a group and separation between groups preserve the relationship on compact displays. A group boundary reinforces containment when proximity alone is ambiguous. Avoid adding boxes where space already distinguishes the relation. Empty space may separate independent outcomes or reserve a reading area; asymmetry is useful when it expresses hierarchy rather than accidental placement.

For a branched or cyclic network with many dependencies, use the existing `diagram` flow vocabulary, its named groups, node `row`, direction and layered/orthogonal layouts, rather than forcing a processing chain into an arbitrary row of cards. A paired result benefits from a common comparison axis; a containment map benefits from nested responsibility; a sequence benefits from a consistent flow direction. Choose the arrangement for the relationship, and keep the corresponding labels/data together when it wraps.

Sources for these recommendations: Aurora Harley, NN/g, _Proximity Principle in Visual Design_ and _The Principle of Common Region_; Kelley Gordon, NN/g, _5 Principles of Visual Design in UX_; Eclipse Layout Kernel, _ELK Layered_. Proximity and common-region findings describe perceived grouping, not a mandatory symmetric style. Layered graph algorithms express directed graph structure; the composition grid does not claim to minimize graph crossings.

## Give each action a purpose

| Action     | Required fields beyond `at`, `action`, `target`    | What the viewer sees                                                                        |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `reveal`   | —                                                  | An object enters; an object with a reveal cue is hidden before its first reveal             |
| `focus`    | Optional `lines="2-4,7"` on a code object          | This object is emphasized; context stays readable and earlier attention moves to the target |
| `connect`  | `to`; optional `value` as a short connection label | A directed connection draws between live object boundaries; its arrowhead follows the route |
| `trace`    | `to`; optional `effect`                            | A transient beam, pulse or packet travels along the relation                                |
| `annotate` | `value`; optional `lines`, `to`, `until`           | A short explanation appears beside the unchanged code                                       |
| `copy`     | `to`                                               | A moving copy arrives with the source content; the source keeps its value                   |
| `transfer` | `to`                                               | The value moves to its destination; the source content becomes empty on arrival             |
| `replace`  | `value`                                            | The object's body becomes escaped plain text; its title stays in place                      |
| `compare`  | `to`                                               | Both named objects are emphasized together; earlier focus is cleared                        |
| `camera`   | —                                                  | A restrained move toward the object, bounded by the visible stage                           |

`to` must name another object in the same stage and belongs to pair actions or an annotation relationship. `value` belongs to replacement, a connection label or annotation. `focus` without `lines` leaves every code line fully readable. Selected lines receive a local accent while other lines stay readable; `emphasis="dim"` explicitly dims the other lines, and a subsequent focus clears that selection. `lines` belongs to code focus or annotation; use line numbers or comma-separated ranges from 1 through 999. `duration` is movement time in seconds, 0.1–3, default 0.6. Replacement takes effect at its anchor; duration controls reveal, attention handoff, connection, trace, travel and camera interpolation. A copied or transferred value arrives at the end of its movement, so schedule a dependent edit after that duration. Cues on the same anchor are applied in source order.

`replace` accepts text, not Markdown, HTML or executable code. To show two complex code or diagram states, author both as named objects and reveal/focus/compare them. Copy and transfer copy the object's body, keeping the destination title. Connections use live boundary ports and rounded routes around visible objects; their arrowheads preserve direction after drawing. Labels occupy free space along the route inside the stage. Horizontal layouts reserve room for labels and wrap words in narrow gaps. If no nearby space remains, the stage adds a bottom label lane with a routed leader instead of moving labels into the composition title. Keep connection labels concise so the operation remains close to its arrow. Moving copies follow the same boundary route between their owners; entrance motion, replaced body sizes, fitting and camera movement update these attachments. Keep owners separate: overlapping rectangles have no unambiguous external route. A compact moving body preserves the full source content; use short values for a readable transfer rather than flying a whole code listing. Connections remain visible after they draw; a later focus replaces the previous emphasis. The camera cue is a small directing gesture, not a full-screen magnifier; use Screencast's camera or loupe for readable close-ups.

## Guide attention while keeping context readable

`focus` and `compare` preserve every object's and code line's full opacity by default. `duration` interpolates the emphasis from the previous subject to the next; it does not delay the spoken action. `emphasis` selects the treatment:

| Emphasis            | Use                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------- |
| `outline` (default) | Identify the current object while keeping its neighbors readable                      |
| `halo`              | Give a decisive receiving object local visual weight                                  |
| `brackets`          | Frame an operation or boundary with animated corner marks                             |
| `underline`         | Carry attention along a stable object's reading edge                                  |
| `dim`               | Explicitly subordinate other objects/lines when isolating a dense UI detail is useful |
| `none`              | Release attention and restore the whole map                                           |

Prefer additive emphasis for architecture, diagrams and code. An isolated bright card surrounded by dark text prevents the viewer from tracing its relationships. Dimming is a contextual choice for some interface material, not a default interpretation of focus. A selected code range is a reading cue, not a reason to make the complete method unreadable. Use the scene's existing draft to judge the attention handoff; no new effect quota or review step is required.

`trace` takes `target`, `to` and `duration`, with optional `effect="beam|pulse|packet"`. It makes a transient directional pass along the same live boundary route as a connector, then disappears. `beam` carries a short illuminated trail, `pulse` carries one breathing signal, and `packet` carries a compact group of dots. Establish the relation with a labelled `connect` when the map needs a persistent wire. Drawing a relation, showing one pass, and moving a value have different meanings: choose `connect`, `trace`, or `copy`/`transfer` accordingly. Repeated trace cues may explain successive messages; continual unmotivated looping adds noise.

```markdown
::cue{at="b2" action="connect" target="queue" to="consumer" value="delivers"}
::cue{at="b3" action="trace" target="queue" to="consumer" effect="beam" duration="1.2"}
::cue{at="b3+1.2" action="focus" target="consumer" emphasis="halo"}
::cue{at="b4" action="focus" target="code" lines="2-4" emphasis="brackets" duration="0.8"}
::cue{at="b5" action="focus" target="consumer" emphasis="none"}
```

Choose each anchor from the actual spoken line: these beat numbers describe this example's narration, not a generator default. Related representations of one event can move together; reading two independent operations needs separate moments. Direct clock seeks reconstruct emphasis strength and transient routes. Reduced motion and print retain final content, preserve readable context and omit travelling traces.

SVG routes and package-owned DOM emphasis stay attached to real geometry and theme tokens. Use Screencast's existing WebGL perspective/layer/orbit vocabulary when depth itself explains the subject, then settle for code reading. WebGL is one spatial tool; a shader behind unchanged boxes does not demonstrate a call or delivered value. Combine these techniques where their meanings agree rather than applying every available treatment to every scene.

## Explain the method in a separate presentation layer

`annotate` attaches a short plain-text explanation to a `role="code"` object. Its `value` is required; optional `lines` selects the operation, optional `to` links the explanation to another named object, and optional `until` ends its display on a narration anchor or time. The annotation adds a local line accent without moving the global focus by itself. The source fence, syntax and copy control retain the exact code. Use a separate `focus` to hand attention to the method, then to the receiving object when the story returns to the mechanism.

A code object's `notes="beside|below"` selects the presentation region. The default is below. Beside uses a broad code area with a narrower note rail only when that code block itself has at least 40rem of content width; a smaller block falls back below even on a large display. This keeps a short sidebar from wrapping a method into an unreadable column. Set `lineStart` to the first original source line of a real excerpt: cue `lines` stays relative to the excerpt, while the presentation label points to the corresponding original lines. Keep the file and method in the object title so the viewer can locate the implementation.

```markdown
:::object{id="method" title="render.ts:41 · apply" role="code" notes="below" lineStart="41"}
Insert the complete inspected code fence here.

:::
::cue{at="b2" until="b2.end" action="annotate" target="method" lines="2-4" to="result" value="The method resolves this input and returns the local result."}
::cue{at="b2" action="focus" target="method" lines="2-4" emphasis="brackets"}
::cue{at="b3" action="connect" target="method" to="result" relation="data" value="return value"}
::cue{at="b3" action="trace" target="method" to="result" effect="beam" duration="1"}
::cue{at="b3+1" action="focus" target="result" emphasis="halo"}
```

`until` is part of the same measured narration clock as `at`; missing speech anchors fail instead of guessing. Explicitly bound times must give the annotation a positive interval. Standalone three-second preview beats cannot prove the order of real speech offsets. Without `until`, a note stays until another annotation of that code object replaces it. Notes reserve their authored height at the current width, and seeks restore the relevant note. Static, reduced-motion and printed pages retain all authored explanations, including notes that have a timed end in a film.

`connect` accepts optional `relation="call|data|event|dependency|ownership|relation"`. It records the actual kind of relationship and uses distinct line treatments for data, event, dependency and ownership; a generic relation is the default. Use a label naming the real call, payload, event or ownership, and explain mixed meanings near the map. A directed line labelled “next” cannot tell the viewer whether a method is called, data moves or one component owns another.

The [real code execution example](../../../examples/directed-code-execution/report.md) contains complete actual `compositionAddress` and `compositionLineLabel` functions, their input and returned results, source-line locators, annotations and different attention moments. Run its `prepare.mjs` after a local build to refresh the excerpts from the current source; an installed package uses its compiled JavaScript when TypeScript sources are absent. These are this tool's operations with illustrative inputs, not a recording of another product.

Keep the method, call, argument, stored value and result visible where they support the current claim. An annotation states the operation or interpretation in a few words; it does not transcribe the whole narration. The viewer should be able to trace the shown cause and consequence without voice or subtitles, while speech explains why they matter. Independent reading tasks need separate moments; coordinated representations of the same event may remain visible together. Preserve the stable map and vary staging when the viewer's question changes.

## Time actions to narration

`at` accepts non-negative seconds (`0`, `1.5`, `1.5s`) or a speech paragraph anchor (`b2`, `b2.end`, `b2+0.3`, `b3.end-0.2`). In a standalone Report, paragraphs are illustrative three-second beats. When a Report scene is filmed by a compatible Agentic Screencast build, its anchors are bound to measured starts and ends of the scene's narration. Changing voice or paragraph length moves the action with the words. No authored JavaScript, manual animation loop or duplicated timestamp schedule is needed.

A paragraph may coordinate several related visible actions. Use separate paragraphs when the viewer needs distinct discoveries or reading moments, and enough time between dependent actions for the value to arrive. The stage state is reconstructed from the authored source on each clock seek, so a frame rendered directly from the middle has the same state as a continuous recording. A source with missing speech paragraphs is an error in a film rather than a guessed schedule.

The compiled page contains final values before the runtime starts. Reduced motion, `motion: none`, printing and a page without scripts show that final static result. They omit moving overlays and camera transforms. Do not rely on a reveal to hide factual qualifications in the final page.

For this source checkout, use its compiled CLI, `node <checkout>/dist/node/cli.js`, and a Screencast build containing the composition bridge. Check `schema --scope directives` for `composition` when selecting the compiler; the skill's pinned npm release is for its existing page vocabulary. Build one Report example locally, then let the report scene rebuild its Markdown directly. When a page contains several compositions, a filmed target selects that stage's anchors and binding; unrelated stages may use other beat counts. The runtime host API provides `anchors(id?)` and `bind(resolve, id?)`; omit the id only when intentionally binding the whole page to one shared clock.

Select it with `target: [data-composition-id="edit"]`; a compatible Screencast build fits that complete stage with a caption lane and excludes surrounding page prose from the shot.

## Compose with existing effects

Choose effects by the scene's job. These are useful alternatives, not a quota or an additional approval checklist.

- Introduce a real system with its whole screen. A browser frame identifies a web application; a quiet entrance can establish the screen, and then a spotlight or loupe explains one control. Keep private data out of the captured source.
- Introduce an architecture with a full relationship map, then use a diagram's `draw="scroll"`, `pulse` route, `scene="steps"` with beat focus and code `lines`, or a composition's `connect`/`transfer` to make the mechanism happen.
- Let a title's `transition="lines"`, a code block's `transition="log"`, a short `:typing` or `:mark` carry one emphasis. Use `:count` or chart `count-up` when the change is numerical. Match the effect to the narrated operation.
- Keep depth for the part whose structure it explains: Report section `interaction="depth|tilt"` responds to a fine pointer, while Screencast `slides.perspective`, `slides.layers`, `enter: tilt3d|flip3d` and supported `move` kinds produce depth in a filmed shot. A pointer effect alone will not create an automated 3D camera move.
- Use a Screencast transition to express the relation between scenes: `zoom` into a detail, `push` along a pipeline, or `morph` for an object shared by two scenes. Use a plain cut when an action itself is the change.

For a standalone page, choose section entrances and scroll scenes the reader can control. For a film, prefer timed object actions and the film's camera; a static screenshot cannot demonstrate transfer, a moving marker or a code-line focus. See Agentic Screencast's directed-compositions examples for complete films using a WebGL perspective opening, a framed screenshot with a dolly, and a chain with a 3D entrance.

## Establish every interface before showing a fragment

Whenever a system interface is shown, in a page, presentation, screenshot sequence or film of any aspect ratio, first show its complete application screen. Let the reader or viewer locate navigation, workspace and the area to be discussed. Then highlight, magnify or move into that area. A cropped panel alone does not explain where it belongs. After navigation to a substantially different screen, establish that screen again.

For a still page, put a full-screen image before the detail, or keep it beside the detail with `overview-detail` or `spotlight`. For a filmed UI, reserve the first narration beat for the whole viewport, then schedule detail focus at `b2` or later. The overview is a map, so every label need not be read at that size. The detail is the reading shot and needs enough size and a calm hold. Preserve navigation or another recognizable landmark during the move; use a loupe when the surrounding screen must remain visible.

In vertical conversion, compatible Screencast builds automatically fit a landscape page or capture take into the opening portrait frame, then move into the existing focus path. They retain the source viewport and the original action timeline. A native portrait page still needs the same authored overview; it is not exempt from spatial orientation. For an ordinary unmarked recording, explicitly choose `contain`/a device frame or author a full-view opening before detail scenes. Avoid cropping the only establishing image or using a tight panel capture as the entire visual explanation.
