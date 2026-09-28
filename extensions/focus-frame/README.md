# focus-frame — a small WebGL effect around an image

`focus-frame` is a reference `kind: effect` extension. A section opts in with `focus-frame="trace"` or
`focus-frame="corners"`; both draw inside its first local image. `trace` grows a narrow perimeter as the
reader passes the section. `corners` grows four short corner marks. The marks identify the image as the
section's evidence without replacing the image, its alternative text, or its place in the document.

This excerpt is written in a report at the repository root:

```markdown
---
title: Field notes
extensions: [extensions/focus-frame/extension.yaml]
---

::::section{title="Survey map" focus-frame="trace"}
![The survey map with three observation points](extensions/focus-frame/assets/shoreline.svg)

The map records the route discussed here.
::::
```

The image and prose are the static equivalent. Under reduced motion, the completed frame is drawn at once;
when WebGL is unavailable the same geometry is drawn on a 2D canvas. The package owns the page clock,
pixel-density and slow-frame policy. A lost WebGL context requests the next safe render mode. Print hides
the decorative canvas and keeps the image with its alternative text.

The effect uses only `--color-accent` from the active theme. It uploads no image texture, fetches nothing,
and runs no timer of its own. It follows width and theme changes through the effect API. The source is under
the repository's MIT `LICENSE`; no third-party code or assets are included.

| File                  | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `extension.yaml`      | Target attribute, variants, bundle budget, and two unlike examples          |
| `effect.mjs`          | The small WebGL drawing and matching 2D/still geometry                      |
| `example-field.md`    | An English document using `trace` around a shoreline sketch                 |
| `example-workshop.md` | An English landing using `corners` around a workshop assembly diagram       |
| `assets/*.svg`        | Local original drawings used by the examples; their alt text is in Markdown |

Build either example directly and run the complete effect check with Playwright available:

```sh
agentic-report build ./extensions/focus-frame/example-field.md --output ./field.html
agentic-report effect-check ./extensions/focus-frame/extension.yaml --out ./focus-frame-check
```

The check directory must be absent or empty. All eleven checks must pass before copying the extension into
another project.
