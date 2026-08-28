---
contractVersion: 1
title: Research registry corpus
description: Bounded research-report contract coverage.
language: en
theme: light
layout: mixed
tokens:
  density: comfortable
  font: sans
  accent: teal
  width: wide
  radius: soft
output:
  format: single-file
  maxInlineBytes: 5000000
---

# Research registry corpus

Corpus class: research-report

:::callout{title="Finding" kind="info"}
Evidence remains local and declarative.
:::

:::decision{title="Decision"}
Continue with the evidence-backed branch.
:::

The :term[Evidence bundle]{key="evidence-bundle"} is reusable without duplicating its definition.

::term{key="evidence-bundle"}

:::glossary{key="evidence-bundle" term="Evidence bundle" placement="appendix"}
A local collection of findings and supporting material.
:::

:::disclosure{title="Research constraints" open="true"}
All evidence remains within the source root.
:::

::::tabs{title="Evidence views"}
:::tab{label="Summary"}
Review the main finding.
:::
:::tab{label="Details"}
Review the supporting notes.
:::
::::

:::modal{title="Review checklist" trigger="Open review checklist"}
Confirm that each claim has local support.
:::

:::popover{title="Sampling note" trigger="Show sampling note"}
The sample is intentionally bounded.
:::

:::filter{title="Filter findings" placeholder="Search findings"}

- Local source
- Typed contract
- Portable artifact
  :::

:::toggle{title="Optional appendix" label="Show appendix" default="on"}
Additional evidence is visible initially.
:::

::::chart{title="Evidence trend" description="Validated evidence rises over three iterations." type="line" x-label="Iteration" y-label="Items"}
:::series{label="Validated"}
::point{label="One" value="2.5"}
::point{label="Two" value="4"}
::point{label="Three" value="7.5"}
:::
::::

:::diagram{title="Evidence flow" description="Local evidence moves through validation into a portable result." type="flow" direction="right"}
::group{id="inputs" label="Inputs"}
::group{id="outputs" label="Outputs"}
::node{id="local" label="Local evidence" group="inputs" kind="accent"}
::node{id="validated" label="Validated model" group="outputs" kind="success"}
::edge{from="local" to="validated" label="check"}
:::

::::timeline{title="Research path" description="A short path from question to verified finding."}
:::event{date="Question" title="Bound the inquiry" kind="neutral"}
Define the decision that evidence must support.
:::
:::event{date="Evidence" title="Inspect local sources" kind="accent"}
Collect the smallest sufficient factual set.
:::
:::event{date="Decision" title="Record the result" kind="success"}
Publish the supported conclusion in the report.
:::
::::
