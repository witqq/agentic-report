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

Objects hold ordinary Markdown, local images, diagrams and code fences. `role` selects a place in the package layout, not a class or CSS rule. Keep object titles stable when values change: the viewer should recognize the same owner throughout. Use a short title stating the claim, concise object labels and one readable value per object. Prefer a useful arrangement and visible causal action over decoration behind small text.

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

## Give each action a purpose

| Action     | Required fields beyond `at`, `action`, `target`    | What the viewer sees                                                                        |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `reveal`   | —                                                  | An object enters; an object with a reveal cue is hidden before its first reveal             |
| `focus`    | Optional `lines="2-4,7"` on a code object          | This object is emphasized; other objects are dimmed and earlier focus is cleared            |
| `connect`  | `to`; optional `value` as a short connection label | A directed connection draws between live object boundaries; its arrowhead follows the route |
| `copy`     | `to`                                               | A moving copy arrives with the source content; the source keeps its value                   |
| `transfer` | `to`                                               | The value moves to its destination; the source content becomes empty on arrival             |
| `replace`  | `value`                                            | The object's body becomes escaped plain text; its title stays in place                      |
| `compare`  | `to`                                               | Both named objects are emphasized together; earlier focus is cleared                        |
| `camera`   | —                                                  | A restrained move toward the object, bounded by the visible stage                           |

`to` must name another object in the same stage and is allowed only for pair actions. `value` belongs to replacement or a connection label. `focus` without `lines` leaves every code line fully readable. Selecting ranges dims only other lines, and a subsequent focus clears that selection. `lines` belongs only to code focus; use line numbers or comma-separated ranges from 1 through 999. `duration` is movement time in seconds, 0.1–3, default 0.6. Replacement and focus take effect at their anchor; movement duration controls reveal, connection, travel and camera interpolation. A copied or transferred value arrives at the end of its movement, so schedule a dependent edit after that duration. Cues on the same anchor are applied in source order.

`replace` accepts text, not Markdown, HTML or executable code. To show two complex code or diagram states, author both as named objects and reveal/focus/compare them. Copy and transfer copy the object's body, keeping the destination title. Connections use live boundary ports and rounded routes around visible objects; their arrowheads preserve direction after drawing. Labels occupy free space along the route inside the stage. Horizontal layouts reserve room for labels and wrap words in narrow gaps. If no nearby space remains, the stage adds a bottom label lane with a routed leader instead of moving labels into the composition title. Keep connection labels concise so the operation remains close to its arrow. Moving copies follow the same boundary route between their owners; entrance motion, replaced body sizes, fitting and camera movement update these attachments. Keep owners separate: overlapping rectangles have no unambiguous external route. A compact moving body preserves the full source content; use short values for a readable transfer rather than flying a whole code listing. Connections remain visible after they draw; a later focus replaces the previous emphasis. The camera cue is a small directing gesture, not a full-screen magnifier; use Screencast's camera or loupe for readable close-ups.

## Time actions to narration

`at` accepts non-negative seconds (`0`, `1.5`, `1.5s`) or a speech paragraph anchor (`b2`, `b2.end`, `b2+0.3`, `b3.end-0.2`). In a standalone Report, paragraphs are illustrative three-second beats. When a Report scene is filmed by a compatible Agentic Screencast build, its anchors are bound to measured starts and ends of the scene's narration. Changing voice or paragraph length moves the action with the words. No authored JavaScript, manual animation loop or duplicated timestamp schedule is needed.

A paragraph may coordinate several related visible actions. Use separate paragraphs when the viewer needs distinct discoveries or reading moments, and enough time between dependent actions for the value to arrive. The stage state is reconstructed from the authored source on each clock seek, so a frame rendered directly from the middle has the same state as a continuous recording. A source with missing speech paragraphs is an error in a film rather than a guessed schedule.

The compiled page contains final values before the runtime starts. Reduced motion, `motion: none`, printing and a page without scripts show that final static result. They omit moving overlays and camera transforms. Do not rely on a reveal to hide factual qualifications in the final page.

For this source checkout, use its compiled CLI, `node <checkout>/dist/node/cli.js`, and a Screencast build containing the composition bridge. Check `schema --scope directives` for `composition` when selecting the compiler; the skill's pinned npm release is for its existing page vocabulary. Build one Report example locally, then let the report scene rebuild its Markdown directly. Select it with `target: [data-composition-id="edit"]`; a compatible Screencast build fits that complete stage with a caption lane and excludes surrounding page prose from the shot.

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
