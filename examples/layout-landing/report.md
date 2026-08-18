---
title: Pages agents can finish
description: A focused landing page assembled without JSX, custom CSS, or author JavaScript.
language: en
theme: light
layout: landing
tokens:
  density: spacious
  font: sans
  accent: coral
  width: wide
  radius: round
---

# Pages agents can finish

Write Markdown, choose a page shape, and build a polished offline artifact without hand-building another
frontend application.

## One declarative path

::::cards
:::card{title="Start with meaning"}
Use headings, decisions, cards, steps, tables, code, images, and attachments.
:::
:::card{title="Keep the boundary small"}
Themes, layouts, and compact tokens are validated data—not CSS or callbacks.
:::
:::card{title="Share the result"}
Open one self-contained file directly in a browser or choose a hashed directory artifact.
:::
::::

## Built for the real loop

:::decision{title="Create → validate → inspect → build"}
The same production preparation powers every step, so analysis describes the artifact that will actually be
built.
:::

## Make the first page

```sh
agentic-report init ./my-page
agentic-report validate ./my-page
agentic-report build ./my-page --output ./my-page.html
```

:::callout{kind="success" title="No server required"}
The generated page opens through `file://` with package-owned interaction and local assets.
:::
