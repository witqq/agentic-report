---
contractVersion: 1
title: Research registry corpus
description: Bounded research-report contract coverage.
language: en
layout: mixed
theme:
  extends: calm-paper
  accent: teal
  radius: soft
scheme: light
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

::::chart{title="Evidence trend" description="Validated evidence rises over three iterations." type="line" x-label="Iteration" y-label="Items" count-up="true"}
:::series{label="Validated"}
::point{label="One" value="2.5"}
::point{label="Two" value="4"}
::point{label="Three" value="7.5"}
:::
::::

:::diagram{title="Evidence flow" description="Local evidence moves through validation into a portable result." type="flow" direction="right" spacing="comfortable"}
::group{id="inputs" label="Inputs"}
::group{id="outputs" label="Outputs"}
::node{id="local" label="Local evidence" detail="files the author can open" group="inputs" kind="accent" row="1"}
::node{id="validated" label="Validated model" group="outputs" kind="success" row="2"}
::edge{from="local" to="validated" label="check" route="auto" kind="call"}
::edge{from="validated" to="local" label="citations" kind="data"}
::legend{title="How to read" auto="true"}
::legend-item{edge="call" label="validates"}
::legend-item{node="accent" label="collected locally"}
::legend-item{node="success" label="verified"}
::legend-item{edge="data" hidden="true"}
:::

:::diagram{title="Evidence at right angles" description="The same evidence path drawn with right-angle connectors." layout="orthogonal"}
::group{id="gather" label="Gather"}
::group{id="decide" label="Decide"}
::node{id="notes" label="Field notes" group="gather"}
::node{id="finding" label="Finding" group="decide"}
::edge{from="notes" to="finding" label="supports"}
:::

The review stands at :process[Collect > Check > Publish]{current="Check" returns="Check>Collect×2"}.

:::diagram{title="Review run" description="Evidence is checked, returned twice, and rechecked." layout="right" pulse="gather,check"}
::node{id="gather" label="Gather" status="done"}
::node{id="check" label="Check" status="returned"}
::node{id="publish" label="Publish" status="pending"}
::edge{from="gather" to="check" id="submit"}
::edge{from="check" to="gather" label="gaps" count="2"}
::edge{from="check" to="check" label="recheck" count="3"}
::edge{from="check" to="publish"}
::legend-item{status="returned" label="sent back"}
:::

::::diagram{title="Evidence service" description="The checker is a small flow of its own."}
::node{id="source" label="Source"}
::node{id="checker" label="Checker"}
::edge{from="source" to="checker"}
:::zoom{node="checker" title="Inside the checker"}
::group{id="rules" label="Rules"}
::node{id="parse" label="Parse" group="rules"}
::node{id="compare" label="Compare"}
::edge{from="parse" to="compare"}
:::
::::

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
::legend-item{event="accent" label="Evidence step"}
::legend-item{event="success" label="Decision"}
::::
