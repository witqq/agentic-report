---
contractVersion: 1
title: Assisted authoring research synthesis
description: A research brief that connects method, evidence, comparison, and recommendation.
language: en
theme: system
layout: mixed
tokens:
  density: comfortable
  font: sans
  accent: teal
  width: wide
  radius: soft
---

# Assisted authoring research synthesis

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

This starter turns a research question into a transparent recommendation. It keeps the method and evidence
close enough for another agent to challenge the conclusion.

:::callout{kind="info" title="Research question"}
Which authoring route gives agents the shortest path to a portable, reviewable interactive page?
:::

{{include: partials/method.md}}

## Evidence model

![Research inputs converging into a recommendation](assets/evidence-map.svg)

::::tabs{title="Evidence views"}
:::tab{label="Observed"}
Agents completed the declarative path without writing browser code or starting a server.
:::
:::tab{label="Constraints"}
The output had to remain offline, deterministic, accessible, and openable through `file://`.
:::
:::tab{label="Unknowns"}
Long-term adoption and maintenance cost require longitudinal evidence beyond this focused study.
:::
::::

## Comparison

:::::chart{type="bar" title="First useful artifact" description="Median focused work units required to reach a reviewable local artifact; lower is better." x-label="Authoring route" y-label="Work units"}
::::series{label="Median effort"}
::point{label="Declarative starter" value="3"}
::point{label="Blank Markdown" value="6"}
::point{label="Custom frontend" value="14"}
::::
:::::

## Interpretation

:::disclosure{title="Read the validity limits" open="true"}
The comparison measures a bounded local task, not every publishing workflow. It supports the recommendation
only for portable static pages within the stated security boundary.
:::

:::decision{title="Prefer the declarative starter path"}
Use a starter when the intended page fits the package vocabulary. Escalate to a custom application only
when verified requirements exceed that vocabulary.
:::

## Follow-up

:::steps{title="Extend the study"}

1. Replace the sample observation table with traceable session evidence.
2. Record exclusions and counterexamples before updating the recommendation.
3. Re-run the comparison after a meaningful authoring-contract change.
   :::
