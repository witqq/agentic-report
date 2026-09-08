---
contractVersion: 1
title: Terminal field notes
description: A console-led portfolio for systems work, decisions, and verified outcomes.
language: en
localizations:
  ru: report.ru.md
theme: dark
layout: landing
preset: terminal
scrollProgress: true
---

# Ship signal, not ceremony

**Fictional sample.** Names, dates, systems, and outcomes demonstrate the page vocabulary. Replace them
with verified project facts before publishing.

`$ agentic-report build ./field-notes --output ./handoff.html`

::::actions{placement="edge"}
::action[Inspect the work]{href="#work" kind="primary" effect="magnetic"}
::action[Read the operating log]{href="#log" kind="secondary"}
::action[Open the handoff]{href="#handoff" kind="quiet"}
::::

::::::section{title="Operator profile" id="profile" nav="Profile" recipe="hero"}
:::lead
I turn ambiguous infrastructure work into small, observable changes. Each entry below exposes the command,
the boundary, and the result a reviewer can reproduce.
:::

![A green constellation of connected system nodes on a black field](assets/constellation.jpg)

::::cards
:::card{title="Runtime repair" href="#log"}
Recovered a stalled worker pool while preserving queued jobs and the public protocol.
:::
:::card{title="Release boundary" href="#handoff"}
Separated local verification from credentialed publication and deployment.
:::
:::card{title="Plain status"}
Available for focused systems investigations and implementation handoffs.
:::
::::
::::::

::::::section{title="Selected work" id="work" nav="Work" recipe="rail"}
::::cards
:::card{title="Runtime repair" href="#log"}
**Input:** a reproducible deadlock under bounded concurrency.

**Result:** one ownership rule, deterministic shutdown, and an observable recovery path.
:::
:::card{title="Release boundary" href="#handoff"}
**Input:** implementation and delivery effects mixed in one process.

**Result:** a verified local candidate and a separate authorized release handoff.
:::
:::card{title="Source confinement" href="#handoff"}
**Input:** local assets supplied by an untrusted declarative source.

**Result:** canonical paths checked beneath the source root before every read.
:::
::::
::::::

::::::section{title="Operating log" id="log" nav="Log" recipe="story"}
::::timeline{title="One change, four signals" description="A compact log keeps cause, action, evidence, and ownership in reading order."}
:::event{date="09:10" title="Reproduce" kind="neutral"}
Captured the smallest state that separates the failure from a healthy worker.
:::
:::event{date="09:42" title="Repair" kind="accent"}
Moved cancellation ownership to the queue boundary instead of adding a retry loop.
:::
:::event{date="10:18" title="Exercise" kind="success"}
Verified normal completion, cancellation, and process shutdown through the public surface.
:::
:::event{date="10:31" title="Hand off" kind="warning"}
Recorded the remaining external release action without claiming it happened.
:::
::::
::::::

::::::section{title="Reproducible handoff" id="handoff" nav="Handoff" recipe="metrics"}

```sh
pnpm test:unit
pnpm test:e2e
agentic-report build ./field-notes --output ./handoff.html
```

:::decision{title="Keep the interface smaller than the implementation"}
The reader gets the outcome, the evidence, and the next action. Package-owned composition carries the
visual system, so this source stays ordinary Markdown.
:::
::::::
