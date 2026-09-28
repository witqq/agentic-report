---
contractVersion: 1
title: Executive decision brief
description: A decision page — move nightly integration builds onto the shared cache — with its evidence, its path, and who owns each step.
language: en
localizations:
  ru: report.ru.md
layout: mixed
theme: daylight
scheme: system
progress: chapters
---

# Move nightly builds onto the shared cache

**Fictional sample.** The company, the numbers, and the people on this page are invented to show a decision
page; replace them with your own measured evidence.

:::::section{title="Recommendation: switch on 3 November 2026" id="opening" nav="Decision" recipe="hero"}
:::lead
Nightly integration builds at Northwind take 118 minutes and finish after the European morning starts. On
the shared cache, the four-week trial ran them in 46 minutes. We recommend switching all 38 nightly
pipelines on Tuesday 3 November 2026, with a one-command way back.
:::

::::chart{type="bar" title="Nightly build time, median of 20 runs" description="Median nightly integration build time in minutes without and with the shared cache, measured 6 September to 3 October 2026." x-label="Setup" y-label="Minutes"}
:::series{label="Median minutes"}
::point{label="Local runners" value="118"}
::point{label="Shared cache" value="46"}
:::
::::

::::actions{placement="inline"}
::action[Review the evidence]{href="#evidence" kind="primary"}
::action[See the rollout]{href="#path" kind="secondary"}
::::
:::::

:::::section{title="What the trial measured" id="evidence" nav="Evidence" recipe="metrics"}
::::cards
:::card{title="−61% build time" status="good"}
Median nightly time fell from 118 to 46 minutes over 20 runs, 6 September – 3 October 2026.
:::
:::card{title="94% cache hits" status="good"}
Share of compile steps served from the cache in the last week of the trial.
:::
:::card{title="+€1,900 a month" status="watch"}
Storage and egress for the cache at today's volume, quoted by the platform team on 1 October.
:::
:::card{title="2 stale-cache failures" status="risk"}
Both came from one misconfigured key in week 1 and were fixed on 12 September; none since.
:::
::::
:::::

:::::section{title="How we switch, and how we switch back" id="path" nav="Rollout" recipe="story"}
:::diagram{title="Nightly build with the shared cache" description="The scheduler starts a build, the runner asks the cache for each compile step, and only misses compile locally before results return to the cache." layout="right"}
::node{id="scheduler" label="Scheduler" detail="02:00 CET"}
::node{id="runner" label="Build runner"}
::node{id="cache" label="Shared cache" kind="accent"}
::node{id="compile" label="Local compile" detail="cache misses only"}
::edge{from="scheduler" to="runner" label="start nightly build"}
::edge{from="runner" to="cache" label="look up each step" kind="data"}
::edge{from="runner" to="compile" label="on a miss"}
::edge{from="compile" to="cache" label="store the result" kind="data"}
::legend-item{node="accent" label="New component"}
:::

::::timeline{title="Rollout" description="Four dated steps from the switch to closing the trial, each with one owner."}
:::event{date="3 Nov" title="Switch 38 pipelines" kind="accent"}
Owner: Priya Raman, build platform. One flag per pipeline; the old runners stay warm.
:::
:::event{date="3–7 Nov" title="Watch the morning" kind="neutral"}
Owner: Tomás Ferreira, release. Compare finish times with the trial every morning at 07:00.
:::
:::event{date="10 Nov" title="Keep or roll back" kind="warning"}
Owner: Priya Raman. Rolling back is one command that turns the flag off on all pipelines.
:::
:::event{date="17 Nov" title="Retire the spare runners" kind="success"}
Owner: Ana Kovač, finance partner. Only after a full week without a stale-cache failure.
:::
::legend-item{event="accent" label="Switch-over"}
::legend-item{event="warning" label="Decision point"}
::legend-item{event="success" label="Trial closed"}
::::
:::::

:::::section{title="What we ask of you" id="handoff" nav="Your decision" recipe="evidence"}

| Decision needed           | By         | From              |
| ------------------------- | ---------- | ----------------- |
| Approve the €1,900 budget | 24 October | Head of platform  |
| Agree the 3 November date | 24 October | Release manager   |
| Name a rollback reviewer  | 31 October | Engineering leads |

:::decision{title="Adopt the shared cache, reversibly"}
Switch on 3 November, keep the old runners warm for one week, and decide on 10 November from the morning
finish times.
:::
:::::
