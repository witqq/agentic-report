---
contractVersion: 1
title: A page that presents itself
description: A short fictional product demo told as slides, with steps, a diagram, a figure and a question for the room.
language: en
localizations:
  ru: report.ru.md
layout: slides
theme: midnight
scheme: system
---

# A page that presents itself

**Fictional sample.** A five-minute product demo for a team review; replace the claims with your own.

::::section{title="The problem" id="problem"}
Reports reach people as files nobody opens.

:::appear

- The finding is on page nine.
  :::

:::appear

- The chart needs the original spreadsheet.
  :::

:::appear{effect="fade"}

- Nobody can answer inside the document.
  :::

:::notes
Pause after the third point and ask who opened the last report they received.
:::
::::

::::section{title="How it works" id="flow" slide-transition="push"}
:::diagram{title="Source to slides" description="A Markdown source becomes checked slides through one build." layout="right"}
::node{id="source" label="Markdown"}
::node{id="build" label="Build" kind="accent"}
::node{id="slides" label="Slides"}
::edge{from="source" to="build" label="checks"}
::edge{from="build" to="slides" label="one file" kind="data"}
::legend-item{node="accent" label="Validation step"}
:::

:::notes
The same source also builds a document; only the layout changes.
:::
::::

::::section{title="See it built" id="clip"}
::video{src="assets/demo.h264.mp4" sources="assets/demo.av1.mp4, assets/demo.vp9.webm" poster="assets/demo.poster.jpg" chapters="assets/demo.chapters.vtt" caption="A short silent film made with agentic-screencast from a three-scene story about this page."}
::::

::::section{title="12 slides, one file" id="figure" recipe="statement" slide-transition="zoom"}
Every slide, picture and diagram travels in a single HTML file that opens from disk.
::::

:::::section{title="What it looks like in the source" id="source" slide-transition="wipe"}

```md
::::section{title="The problem"}
:::appear

- The finding is on page nine.
  :::
  ::::
```

:::appear{effect="pop"}
Each `appear` block is one click.
:::
:::::

::::::section{title="Your turn" id="question"}
:::::response{title="Room check" id="room-check"}
::::question{id="use" kind="single" title="Where would you use slides from a report?"}
::option{id="review" label="Team review"}
::option{id="demo" label="Customer demo"}
::option{id="lesson" label="Onboarding lesson"}
::::
:::::
::::::
