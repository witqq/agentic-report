---
contractVersion: 1
title: Portable page architecture
description: An architecture decision packet with boundaries, alternatives, and rollout evidence.
language: en
localizations:
  ru: report.ru.md
theme: dark
layout: document
tokens:
  density: comfortable
  font: sans
  accent: indigo
  width: standard
  radius: sharp
---

# Portable page architecture

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

This starter records one system decision in enough detail for implementation and later reversal. It keeps
the trust boundary visible instead of hiding it in framework code.

::::::section{title="System boundary" id="boundary" nav="Boundary" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" surface="mesh" transition="stagger" choreography="cascade"}
![The source, compiler, artifact, and browser boundary](assets/system-map.svg)

{{include: partials/decision.md}}
::::::

::::::section{title="Runtime flow" id="flow" nav="Flow" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress"}

:::diagram{title="Offline compilation boundary" description="Declarative local input passes through validation and compile-time rendering into a static browser artifact." direction="right"}
::node{id="source" label="Local source" kind="accent"}
::node{id="model" label="Validated model" kind="neutral"}
::node{id="render" label="Semantic renderer" kind="success"}
::node{id="artifact" label="Static artifact" kind="accent"}
::edge{from="source" to="model" label="parse"}
::edge{from="model" to="render" label="typed data"}
::edge{from="render" to="artifact" label="HTML + assets"}
:::
::::::

::::::section{title="Alternatives and consequences" id="alternatives" nav="Alternatives" width="wide" tone="plain" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grain" transition="stagger" choreography="cascade"}

::::tabs{title="Alternatives considered"}
:::tab{label="Package primitives"}
One registry, model, renderer, and bounded runtime keep every supported page on the same contract.
:::
:::tab{label="Custom frontend"}
Maximum freedom, but every page owns framework setup, security review, accessibility, and packaging.
:::
:::tab{label="Hosted editor"}
Fast visual editing, but it introduces a service dependency and weakens offline portability.
:::
::::

::::cards
:::card{title="Positive"}
Authors provide data and semantic intent; the package owns browser behavior.
:::
:::card{title="Trade-off"}
New interaction classes require a package release instead of arbitrary author JavaScript.
:::
:::card{title="Guardrail"}
All filesystem references are confined before reads and all output works locally.
:::
::::

:::modal{title="Architecture review checklist" trigger="Open review checklist"}

- Does the source remain declarative?
- Is every local path confined before reading?
- Does the artifact work without a network or server?
- Is the new behavior covered at its public boundary?
  :::
  ::::::

::::::section{title="Rollout" id="rollout" nav="Rollout" width="wide" tone="accent" composition="stack" viewport="bounded" section-density="editorial" type="display" surface="glow" transition="reveal"}

:::steps{title="Adopt the decision"}

1. Replace the sample decision and evidence in the declarative source.
2. Build semantic output through the shared compiler.
3. Open the artifact through `file://` at desktop and mobile widths.
4. Revisit the decision when a verified requirement no longer fits the boundary.
   :::
   ::::::
