---
title: A decision page
layout: document
theme: calm-paper
scheme: light
motion: expressive
extensions: [extension.yaml]
---

# Keep the evidence beside the decision

::::section{title="Building the handoff" id="handoff-model" execution-core="decision" media="natural"}
![Source sheets, an open compilation core and a completed decision page, represented as solid shapes](assets/compile-core.svg){dark="assets/compile-core-dark.svg"}

_Authored visual model of building a decision page. It represents neither hardware nor a timed run._

The source retains the decision and its supporting evidence. The compiler builds a page from it; the
reader decides whether to return an exported review to the author.
::::

:::decision{title="Retain the source"}
An exported review contains discussion. It does not rewrite the author's Markdown automatically.
:::
