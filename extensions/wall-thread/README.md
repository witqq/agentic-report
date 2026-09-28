# wall-thread — a thread down the page

An effect (`kind: effect`, level 2 of the [extension API](../../skills/agentic-report/references/extensions.md)).
A braided thread runs down the page from marked section to marked section. It starts in a ball of yarn on a
small shelf, hangs on nails beside the headings it passes (with a loop hanging from the nail), sags between
the nails like a rope, winds through balls in the empty places of the page and ends in a last ball. The
reader's progress draws it: the head of the thread follows the reading line, and each section it reaches is
marked `data-state-reached`.

The page only names the stations. The route is built from the layout: a distance field of the page (text,
pictures, cards and the contents column are obstacles), an A\* search between stations that keeps away from
text, a taut pull of that path with a nail at each turn, a sag between nails reduced wherever it would come
near text, and three twisted strands of fibres along the line. Nothing is placed by hand, so a change of text
or of the window width rebuilds the same kind of route.

```markdown
---
title: One bale, five hands
extensions: [extensions/wall-thread/extension.yaml]
---

::::section{title="The field" id="field" thread="start"}
…
::::

::::section{title="Ginning" id="gin" thread="pass"}
…
::::

::::section{title="The mill" id="mill" thread="tangle"}
…
::::

::::section{title="The shop" id="shop" thread="end"}
…
::::
```

## When to use it

- A page whose subject is one thing travelling through stages — a shipment, a request through services, a
  case through departments, a life through places — where the thread is that thing and each station a stage.
- A long document or a landing with at least three stations and margins or gaps between sections for the
  thread to run in.

## When not to use it

- As an ornament on a page that has no path: a thread that joins unrelated sections says nothing
  (`DR-SCENE-CARRIES`).
- Together with another page-long effect: one effect per page.
- On a dense page with no margins and no gaps between sections: the thread has nowhere to go and will run
  straight lines through the few gaps there are.

## Attributes

| Attribute | On                  | Values                           | Meaning                                                                                                                                                              |
| --------- | ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thread`  | `section` or `card` | `start`, `pass`, `tangle`, `end` | `start` — the first ball, where the thread begins; `pass` — a nail with a loop beside the heading; `tangle` — a ball the thread winds through; `end` — the last ball |

Stations are visited in document order. Put `start` on the first and `end` on the last; `pass` is the usual
station. Where a ball does not fit near its host, the host gets a nail instead; where a nail has no room for
its loop, the thread passes it without one. Long stretches between stations (more than one and a half
windows) get a ball of their own in the emptiest place between them.

## Render modes

- `live` and `static` draw the same 2D thread up to the reading line (the head is at 55 % of the window at
  the top of the page and reaches the bottom at its end); balls wind while the head passes through them.
  `static` means no WebGL; the effect does not use WebGL, so both look the same.
- `still` (reduced motion) draws the whole thread, every nail and every ball at once and marks every station
  reached.
- Print and readers without scripts get the sections without the thread (`staticEquivalent`).

The narrow layout (720 px and below) uses a finer grid, a thinner braid, smaller balls and loops, so the
thread fits the margins of a phone. Colours come from theme tokens: the strands are `--color-accent` and
`--color-accent-strong`, the shadow `--shadow-color`, nails `--color-text-muted`, shelves
`--color-border-strong`. Fixed and sticky chrome (the top bar, the contents) is cut out of the drawing.

## Files

- `extension.yaml` — the manifest: the `thread` target on `section` and `card`, a 20 000-byte budget.
- `effect.mjs` — `defineEffect`: measuring, building and drawing.
- `field.mjs` — the distance field (exact Euclidean distance transform).
- `route.mjs` — stations, balls, A\* search, taut pull, nails, sag, resampling.
- `braid.mjs` — the three strands and the fibres of the balls.
- `example-shipment.md` — an English document in the default theme, six sections.
- `example-studio.md` — a short Russian landing in `midnight`, dark, with a station on a card.

Check it with `agentic-report effect-check extensions/wall-thread/extension.yaml --out <empty directory>`.
