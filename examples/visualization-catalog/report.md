---
contractVersion: 1
title: Product signal atlas
description: Declarative visualizations compiled into offline, accessible page primitives.
language: en
theme: system
layout: dashboard
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

# Product signal atlas

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

Every visual below is authored as bounded Markdown directives. The compiler validates the data and emits
deterministic SVG or semantic HTML; the page performs no visualization-time network request.

## Adoption

:::::chart{type="bar" title="Weekly active agents" description="Active agents increased across four weekly releases, with the assisted cohort leading after week two." x-label="Release week" y-label="Active agents"}
::::series{label="Assisted"}
::point{label="W1" value="42"}
::point{label="W2" value="68"}
::point{label="W3" value="91"}
::point{label="W4" value="128"}
::::
::::series{label="Baseline"}
::point{label="W1" value="38"}
::point{label="W2" value="51"}
::point{label="W3" value="63"}
::point{label="W4" value="74"}
::::
:::::

## Quality trend

::::chart{type="line" title="Successful first builds" description="The percentage of agents completing a successful first build rose during the measured releases." x-label="Release week" y-label="Percent"}
:::series{label="Success rate"}
::point{label="W1" value="61.5"}
::point{label="W2" value="70"}
::point{label="W3" value="82.5"}
::point{label="W4" value="91"}
:::
::::

## Work mix

::::chart{type="pie" title="Generated page mix" description="Reports are the largest category, followed by tutorials, dashboards, and landing pages."}
:::series{label="Pages"}
::point{label="Reports" value="46"}
::point{label="Tutorials" value="24"}
::point{label="Dashboards" value="18"}
::point{label="Landing pages" value="12"}
:::
::::

## Compilation flow

:::diagram{title="Offline compilation flow" description="Validated local source moves through preparation and deterministic rendering into a portable artifact." direction="right"}
::node{id="source" label="Declarative source" kind="accent"}
::node{id="validate" label="Validate data" kind="neutral"}
::node{id="render" label="Compile visuals" kind="success"}
::node{id="artifact" label="Portable artifact" kind="accent"}
::edge{from="source" to="validate" label="parse"}
::edge{from="validate" to="render" label="typed model"}
::edge{from="render" to="artifact" label="HTML + SVG"}
:::

## Delivery path

::::timeline{title="Release journey" description="Four milestones move the product from evidence to a locally verified release candidate."}
:::event{date="Discover" title="Inspect the catalog" kind="neutral"}
The agent reads the registry-derived source contract and chooses supported primitives.
:::
:::event{date="Author" title="Write compact data" kind="accent"}
Charts, nodes, edges, and events remain ordinary directive attributes and Markdown.
:::
:::event{date="Build" title="Compile offline" kind="success"}
The same validated model produces single-file or directory output.
:::
:::event{date="Verify" title="Open through file://" kind="warning"}
Desktop and mobile checks inspect the real generated artifact without a server.
:::
::::
