# Find the real implementation

Paths are relative to the named source repository. The displayed code is extracted from these functions, not pseudocode. Values such as glow/shadow are illustrative authored content. `prepare.mjs` executes the installed model and saves the actual inputs, frames and object identities in `execution.json`.

| Repository / file                                    | Function and responsibility                | Concrete boundary                                                                                           |
| ---------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| agentic-report / src/composition.ts                  | compositionFrame(ids, cues, time, resolve) | Fresh Map of object states; timed connections/travels; no DOM or writes to input cues                       |
| agentic-report / src/composition.ts                  | compositionTime(anchor, starts, end)       | Standalone anchor resolution; three-second preview convention when starts is absent                         |
| agentic-report / src/browser/features/composition.ts | cuesOf, installComposition, render(time)   | Reads compiled cue attributes/templates; invokes model; updates actual DOM and SVG                          |
| agentic-report / src/browser/features/composition.ts | content, scopedClone                       | Clones original DOM bodies, keeps destination title and scopes copied local references                      |
| agentic-report / src/composition-route.ts            | connectionRoute(a, b, obstacles)           | Live boundary ports and rounded obstacle routes in stage CSS pixels                                         |
| agentic-report / src/browser/technique-timing.ts     | timed(render)                              | Subscribes render to page clock, passes milliseconds, requests further real frames while active             |
| agentic-report / src/browser/clock.ts                | createClock, pageClock                     | Manual seek notifies subscribers; external mode plugs into Screencast renderAt; real mode runs browser time |
| agentic-screencast / src/report-composition.ts       | installReportComposition                   | On stage mount, maps cue anchors to measured starts/ends and calls control.bind(resolve)                    |

For `copy`, the model's destination `content` refers to the source content descriptor; it is not a deep-cloned business value. The browser separately clones the referenced template into the destination DOM body. After `replace @ 3s`, `compositionFrame(..., 4)` returns `shape.content = {text: "Shadow 12 px"}`. A fresh call at 0 returns `{source: "shape"}`, a different Map and no travel. In a film, beat anchors use measured narration instead of these illustrative numeric times.

The resize listener and the clock both lead to the same browser render. `rect()` reads the current geometry after content/entrance changes; connections are not cached in obsolete screen coordinates. Adding a model action belongs in composition.ts and its source contract; changing its picture belongs in the browser renderer; changing speech binding belongs in Screencast's bridge. Printing and reduced motion render final static state.
