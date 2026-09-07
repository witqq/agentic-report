---
contractVersion: 1
title: Interactive component catalog
description: Declarative copyable prose, glossary, disclosure, tabs, overlays, filtering, toggles, and a bounded demo.
language: en
localizations:
  ru: report.ru.md
theme: dark
layout: mixed
tokens:
  density: comfortable
  font: sans
  accent: teal
  width: wide
  radius: soft
---

# Interactive component catalog

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

This page demonstrates package-owned behavior authored entirely as Markdown directives. A
:term[Decision packet]{key="decision-packet"} keeps a reusable definition close to the exact language it
explains.

:::glossary{key="decision-packet" term="Decision packet" forms="decision packets, decision-packet"}
A compact bundle of evidence, constraints, and a recommendation that another agent can review.
:::

The same :term[Decision packet]{key="decision-packet"} explanation remains available wherever the concept
appears.

::::::section{title="Copyable meaning" id="copy" nav="Copy" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" choreography="cascade"}

:::copyable
Deploy after **two checks** are complete.

Read the [rollback runbook](https://example.com/runbook) and confirm the
:term[decision packet]{key="decision-packet"} before the handoff.
:::
::::::

::::::section{title="Progressive detail" id="detail" nav="Detail" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grain" transition="reveal"}

:::disclosure{title="Why the source stays declarative" open="true"}
The author chooses intent and initial state. The package supplies semantic HTML, focus behavior, and the
browser runtime.
:::

::::tabs{title="Delivery choices"}
:::tab{label="Single file"}
Use the default when the page should travel as one self-contained HTML artifact.
:::
:::tab{label="Directory"}
Use a directory when large local resources should remain content-addressed files.
:::
:::tab{label="Review"}
Open either result directly through `file://` and exercise the same interactions.
:::
::::

::::tabs{title="Independent review views"}
:::tab{label="Requirements"}
Check the declared behavior and constraints.
:::
:::tab{label="Artifact"}
Check the generated page in a browser.
:::
::::
::::::

::::::section{title="Focused overlays" id="overlays" nav="Overlays" width="wide" tone="plain" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grid" transition="stagger" choreography="cascade"}

:::modal{title="Release checklist" trigger="Open release checklist"}

- Replace the sample content.
- Build the selected output; the build validates before writing.
- Open the browser artifact directly from disk.
  :::

:::popover{title="Portability note" trigger="Show portability note"}
The page does not need a local web server after it is built.
:::
::::::

::::::section{title="Find, reveal, and demonstrate" id="controls" nav="Controls" width="wide" tone="accent" composition="stack" viewport="bounded" section-density="editorial" type="display" surface="glow" transition="reveal"}

:::filter{title="Filter component capabilities" placeholder="Search capabilities"}

- Keyboard-operable tabs
- Native disclosure
- Focus-restoring modal
  - Nested keyboard route
- Dismissible popover
- Client-side list filter
  :::

:::toggle{title="Optional evidence" label="Show verification evidence" default="off"}
The generated artifact was opened through a local file URL at desktop and mobile widths.
:::

:::toggle{title="Initially visible note" label="Show authoring note" default="on"}
Authors provide no JSX, CSS, or browser JavaScript.
:::

:::demo{title="Estimate revisions" start="2" step="1"}
The counter is one deliberately limited package-owned interaction.
:::
::::::
