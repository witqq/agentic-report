# loom — cloth woven beside a section

An effect (`kind: effect`, level 2 of the [extension API](../../skills/agentic-report/references/extensions.md)).
Each marked section gets its own small loom. The warp is strung from the start: a few threads stand in the
free space beside the section. As the section passes through the window, weft rows are woven into them
over and under, the shuttle waits beside the last row, and when the section has been read the strip is
finished cloth. A section being woven carries `data-state-weaving`, a finished one `data-state-woven`.

Nothing joins the sections: every loom is local to its host and driven by that host's
own progress through the window (`ctx.progress(host)`), and the geometry is a rectangle beside the text, not
a route.

```markdown
---
title: How cloth is woven
extensions: [extensions/loom/extension.yaml]
---

::::section{title="The warp" id="warp" loom="selvedge"}
…
::::

::::section{title="Shed and shuttle" id="shed" loom="band"}
…
::::
```

## When to use it

- A guide, a course or a process page where each section is a step the reader works through, and the growing
  cloth is the record of steps done.
- Release notes, changelogs and checklists: each band is one item finished.

## When not to use it

- On every section of a long page: two to five looms are enough; more read as a pattern, not as progress.
- On a section the reader does not read through (a hero, a call to action).
- Together with another effect on the same page.

## Attributes

| Attribute | On        | Values             | Meaning                                                                                                                                                                                                                                       |
| --------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loom`    | `section` | `selvedge`, `band` | `selvedge` — a narrow vertical strip in the margin beside the section, woven top to bottom in plain weave; `band` — a horizontal band across the section's column in the first free gap under its heading, woven left to right in a 2/2 twill |

A `selvedge` goes into the left margin, or the right one when the left is taken (by the contents column, for
example). Where neither margin has room — on a phone with a full-width column, for instance, when the margin
is narrower than the strip — the section gets a band instead. A section with no free gap for a band gets no
loom and keeps its states.

## Render modes

- `live` and `static` weave with the reading: rows start when a fifth of the section's passage through the
  window is behind and finish at three quarters. The effect draws on a 2D canvas, so both look the same.
- `still` (reduced motion) shows every strip finished and every section woven.
- Print and readers without scripts get the sections without the cloth (`staticEquivalent`).

The narrow layout uses a finer pitch and a narrower strip. Colours come from theme tokens: the warp is
`--color-border-strong`, the weft `--color-accent` in bands of six rows alternating with
`--color-accent-strong`, the shuttle `--color-text-muted`, the shadow `--shadow-color`.

## Files

- `extension.yaml` — the manifest: the `loom` target on `section`, a 12 000-byte budget.
- `effect.mjs` — `defineEffect`: placing the strips, weaving and drawing.
- `example-craft.md` — a Russian guide to hand weaving in `calm-paper`, with selvedges.
- `example-release.md` — English release notes in `daylight`, dark, with bands.

Check it with `agentic-report effect-check extensions/loom/extension.yaml --out <empty directory>`.
