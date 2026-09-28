---
title: Presentation tools
language: en
layout: slides
---

# Presentation tools

A fixture presentation that puts the tools of other categories on slides.

::::section{title="A diagram" id="diagram"}
:::diagram{title="Flow" description="A to B." layout="right"}
::node{id="a" label="A"}
::node{id="b" label="B"}
::edge{from="a" to="b"}
:::
::::

::::section{title="A clip" id="clip" slide-transition="push"}
::video{src="playback.webm" poster="poster.png" caption="A short recorded run."}
::::

::::section{title="A form" id="form" slide-transition="wipe"}
:::::response{title="Check" id="check"}
::::question{id="pick" kind="single" title="Pick one"}
::option{id="one" label="One"}
::option{id="two" label="Two"}
::::
:::::
::::

::::section{title="A scene" id="scene" scene="steps" slide-transition="zoom"}
![A poster frame](poster.png)

:::beat
First beat.
:::

:::beat
Second beat.
:::
::::

::::section{title="Steps" id="steps"}
:::appear
First point.
:::

:::appear{effect="wipe"}
Second point.
:::

:::notes
Say this only to yourself.
:::
::::
