---
contractVersion: 1
title: From Markdown to a page worth sharing
description: A focused landing page for an offline, agent-friendly interactive page builder.
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

# From Markdown to a page worth sharing

Give an agent a declarative source, not a frontend project. Build reports, research, architecture notes,
tutorials, dashboards, and landing pages that open directly from disk.

::::actions
::action[See the workflow]{href="#workflow" kind="primary"}
::action[Review the proof]{href="#proof" kind="secondary"}
::action[Read the boundaries]{href="#boundaries" kind="quiet"}
::::

:::::section{title="Start with the work, not the framework" id="workflow" nav="Workflow" width="wide" align="start" tone="soft"}
:::callout{kind="success" title="One portable result"}
The default output is one self-contained HTML file with no server, remote runtime, or author JavaScript.
:::

::::cards
:::card{title="Write naturally"}
Use Markdown, frontmatter, confined partials, and local assets.
:::
:::card{title="Add intent"}
Choose package-owned cards, decisions, interactions, diagrams, timelines, and charts.
:::
:::card{title="Ship static output"}
Validate, inspect, and build through one production preparation path.
:::
::::
:::::

:::::section{title="The path to a useful page" id="journey" nav="Journey" width="standard" align="start" tone="plain"}
::::timeline{title="First page journey" description="Four short stages move from a package-owned starter to a portable reviewed artifact."}
:::event{date="Choose" title="Select a starter" kind="neutral"}
Pick the page shape closest to the reader's job.
:::
:::event{date="Edit" title="Replace the sample evidence" kind="accent"}
Keep the semantic structure and make the content factual.
:::
:::event{date="Build" title="Compile locally" kind="success"}
Create one file or a content-addressed directory.
:::
:::event{date="Open" title="Review the artifact" kind="warning"}
Exercise the real page at desktop and mobile widths through `file://`.
:::
::::
:::::

::::section{title="Proof without a hidden service" id="proof" nav="Proof" width="reading" align="start" tone="accent"}
:::decision{title="Keep the public format data-only"}
The package owns rendering and interaction behavior so authors do not need JSX, CSS, callbacks, or a hosted
editor to finish a page.
:::

:::popover{title="Portability details" trigger="Why does file:// matter?"}
Opening directly from disk proves that the artifact does not depend on a development server or remote page
runtime after compilation.
:::
::::

::::section{title="Build the first page" id="boundaries" nav="Start" width="standard" align="center" tone="contrast"}

```sh
agentic-report init ./my-page --starter landing
agentic-report validate ./my-page
agentic-report build ./my-page --output ./my-page.html
```

:::disclosure{title="What stays outside the source format" open="false"}
Remote fetching, raw HTML, executable templates, arbitrary plugins, and author-supplied browser code stay
outside the portable trust boundary.
:::

:::actions
::action[Back to workflow]{href="#workflow" kind="primary"}
::action[Project documentation]{href="../../docs/product/source-contract.md" kind="secondary"}
::action[Review the source contract]{href="../../docs/product/source-contract.md" kind="quiet"}
:::
::::
