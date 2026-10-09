---
title: A theme reference and its rendered color
language: en
localizations:
  ru: report.ru.md
theme: midnight
scheme: dark
layout: dashboard
motion: expressive
topbar: false
---

# A theme reference and its rendered color

**Fictional sample.** Values and pseudocode illustrate the mechanism; they are not evidence from a running product.

[English source](report.md) · [Russian source](report.ru.md)

::::composition{id="theme-color" title="One source. Two useful results." kind="before-after"}
:::object{id="source" title="Stored recipe" role="source"}
**scheme(accent1)**
Color follows the palette.
:::
:::object{id="reading" title="Resolve for drawing" role="result"}
The current color
:::
:::object{id="editing" title="Expand for editing" role="result"}
The semantic color
:::
::cue{at="b1" action="reveal" target="source"}
::cue{at="b2" action="connect" target="source" to="reading" value="resolve"}
::cue{at="b2+0.5" action="replace" target="reading" value="RGB(65, 105, 225)"}
::cue{at="b3" action="connect" target="source" to="editing" value="expand"}
::cue{at="b3+0.5" action="replace" target="editing" value="scheme(accent1)"}
::cue{at="b4" action="compare" target="reading" to="editing"}
::::
