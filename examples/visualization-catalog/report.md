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

:::diagram{title="Offline compilation flow" description="Fifteen participants across authoring, compilation, and artifact subsystems." type="flow"}
::group{id="authoring" label="Authoring graph"}
::group{id="compiler" label="Compiler pipeline"}
::group{id="artifact" label="Portable artifact"}
::node{id="source" label="Declarative source" group="authoring" kind="accent"}
::node{id="partials" label="Markdown partials" group="authoring"}
::node{id="assets" label="Local assets" group="authoring"}
::node{id="manifest" label="Manifest metadata" group="authoring"}
::node{id="review" label="Review sidecar" group="authoring"}
::node{id="validate" label="Validate data" group="compiler"}
::node{id="confine" label="Confine resources" group="compiler"}
::node{id="highlight" label="Highlight code" group="compiler"}
::node{id="render" label="Compile visuals" group="compiler" kind="success"}
::node{id="serialize" label="Serialize output" group="compiler"}
::node{id="html" label="Semantic HTML" group="artifact"}
::node{id="styles" label="Package styles" group="artifact"}
::node{id="runtime" label="Reader runtime" group="artifact"}
::node{id="targets" label="Review targets" group="artifact"}
::node{id="portable" label="Portable artifact" group="artifact" kind="accent"}
::edge{from="source" to="validate" label="parse"}
::edge{from="partials" to="validate" label="expand"}
::edge{from="assets" to="confine" label="resolve"}
::edge{from="manifest" to="validate" label="normalize"}
::edge{from="review" to="targets" label="bind"}
::edge{from="validate" to="confine" label="typed graph"}
::edge{from="confine" to="highlight" label="safe source"}
::edge{from="highlight" to="render" label="styled HAST"}
::edge{from="render" to="serialize" label="semantic tree"}
::edge{from="serialize" to="html" label="document"}
::edge{from="serialize" to="styles" label="theme"}
::edge{from="serialize" to="runtime" label="behavior"}
::edge{from="serialize" to="targets" label="provenance"}
::edge{from="html" to="portable" label="assemble"}
::edge{from="styles" to="portable" label="package"}
::edge{from="runtime" to="portable" label="interact"}
::edge{from="targets" to="portable" label="review"}
:::

## Compile request sequence

:::diagram{title="Compile request sequence" description="One offline build crosses four participants in authored message order." type="sequence"}
::node{id="agent" label="Authoring agent"}
::node{id="loader" label="Source loader"}
::node{id="compiler" label="Compiler"}
::node{id="browser" label="Browser"}
::edge{from="agent" to="loader" label="load source"}
::edge{from="loader" to="compiler" label="validated graph"}
::edge{from="compiler" to="browser" label="write artifact"}
::edge{from="browser" to="agent" label="review result"}
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
