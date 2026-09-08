---
contractVersion: 1
title: Build your first portable page
description: A practical tutorial for the declarative initialize, edit, build, and open loop.
language: en
localizations:
  ru: report.ru.md
theme: light
layout: document
preset: material
---

# Build your first portable page

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

By the end of this tutorial you will have one offline HTML file built from Markdown—without authoring JSX,
CSS, browser JavaScript, or a deployment configuration.

::::::section{title="Start with one outcome" id="start" nav="Start" recipe="hero"}
:::callout{kind="info" title="Before you start"}
Use Node.js in the supported engine range and install `agentic-report` in the working project.
:::

:::steps{title="First-use path"}

1. Run `agentic-report init ./my-page --starter tutorial`.
2. Open `./my-page/report.md` and replace the sample title.
3. Run `agentic-report build ./my-page --output ./my-page.html`.
4. Open `./my-page.html` directly in a browser.
   :::
   ::::::

::::::section{title="Choose an output" id="output" nav="Output" recipe="story"}

::::tabs{title="Output formats"}
:::tab{label="Single file"}
The default embeds the package runtime and local assets into one transportable HTML file.

```sh
agentic-report build ./my-page --output ./my-page.html
```

:::
:::tab{label="Directory"}
The directory format writes an HTML entry plus content-addressed assets for larger projects.

```sh
agentic-report build ./my-page --format directory --output ./my-page-dist
```

:::
::::
::::::

::::::section{title="Add semantic content" id="content" nav="Content" recipe="evidence"}

::::cards
:::card{title="Call out a fact"}
Use a callout when the reader must not miss a constraint or result.
:::
:::card{title="Record a decision"}
Use a decision block for the selected path and its consequence.
:::
:::card{title="Show a sequence"}
Use steps or a timeline when order changes the meaning.
:::
::::

:::disclosure{title="Show the smallest source example" open="false"}

```yaml
title: Review summary
layout: document
theme: system
```

:::
::::::

::::::section{title="Practice and extend" id="practice" nav="Practice" recipe="metrics"}

:::demo{title="Completed tutorial checks" start="0" step="1"}
Increment the counter after you initialize, edit, build, and open your own artifact.
:::

:::disclosure{title="Need focused diagnostics?" open="false"}
Run `agentic-report validate ./my-page` for source errors without writing output, or
`agentic-report inspect ./my-page --json` when an agent needs the observed feature inventory.
:::

:::decision{title="Keep the authoring boundary declarative"}
When a requirement fits a package primitive, express it as Markdown data. Do not rebuild the reader as a
custom frontend.
:::
::::::
