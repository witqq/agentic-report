---
contractVersion: 1
title: From Markdown to a page worth sharing
description: A focused landing page for an offline, agent-friendly interactive page builder.
language: en
localizations:
  ru: report.ru.md
theme: light
layout: landing
preset: studio
scrollProgress: true
---

# From Markdown to a page worth sharing

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

Give an agent a declarative source, not a frontend project. Build reports, research, architecture notes,
tutorials, dashboards, and landing pages that open directly from disk.

::::actions{placement="edge"}
::action[See the workflow]{href="#workflow" kind="primary" effect="magnetic"}
::action[Review the proof]{href="#proof" kind="secondary"}
::action[Read the boundaries]{href="#boundaries" kind="quiet"}
::::

::contents

:::::section{title="Start with the work, not the framework" id="workflow" nav="Workflow" width="wide" align="start" tone="soft" composition="mosaic" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" choreography="cascade"}
:::lead
A :term[portable boundary]{key="portable-boundary"} keeps the opening thesis in normal reading flow while
making the page's main claim easy to scan.
:::

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

:::glossary{key="portable-boundary" term="Portable boundary" placement="appendix"}
The source remains declarative and the package owns rendering, interaction, confinement, and offline output.
:::
:::::

:::::section{title="The path to a useful page" id="journey" nav="Journey" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" choreography="cascade"}
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

::::section{title="Proof without a hidden service" id="proof" nav="Proof" width="wide" align="start" tone="accent" composition="stage" viewport="full" section-density="immersive" type="display" surface="glow" transition="stagger"}
:::decision{title="Keep the public format data-only"}
The package owns rendering and interaction behavior so authors do not need JSX, CSS, callbacks, or a hosted
editor to finish a page.
:::

:::popover{title="Portability details" trigger="Why does file:// matter?"}
Opening directly from disk proves that the artifact does not depend on a development server or remote page
runtime after compilation.
:::
::::

::::section{title="Build the first page" id="boundaries" nav="Start" width="wide" align="center" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="plain" transition="stagger"}

```sh
agentic-report init ./my-page --starter landing
agentic-report validate ./my-page
agentic-report build ./my-page --output ./my-page.html
```

:::disclosure{title="What stays outside the source format" open="false"}
Remote fetching, raw HTML, executable templates, arbitrary plugins, and author-supplied browser code stay
outside the portable trust boundary.
:::

:::actions{placement="bottom"}
::action[Back to workflow]{href="#workflow" kind="primary" effect="magnetic"}
::action[Project documentation]{href="../../docs/product/source-contract.md" kind="secondary"}
::action[Review the source contract]{href="../../docs/product/source-contract.md" kind="quiet"}
:::
::::
