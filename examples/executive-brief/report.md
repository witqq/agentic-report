---
contractVersion: 1
title: Executive decision brief
description: A Monument decision page combining a staged opening, evidence field, operating path, and explicit handoff.
language: en
localizations:
  ru: report.ru.md
theme: system
layout: mixed
preset: monument
scrollProgress: true
---

# Executive decision brief

**Fictional sample.** Every organization, metric, status, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

:::::section{title="Make the decision legible before making it large" id="opening" nav="Decision" recipe="hero"}
:::lead
One page should let a reader see the choice, understand the evidence, and find the next owner without
learning the system that produced it.
:::

![An architectural field of luminous planes converging on one clear route](assets/field.jpg)

:::decision{title="Adopt the reversible path"}
Proceed with the bounded launch after the evidence owner and rollback owner confirm the same release
packet.
:::

::::actions{placement="inline"}
::action[Review the evidence]{href="#evidence" kind="primary" effect="magnetic"}
::action[See the operating path]{href="#path" kind="secondary"}
::action[Open the handoff]{href="#handoff" kind="quiet"}
::::
:::::

:::::section{title="Evidence earns space by helping the decision" id="evidence" nav="Evidence" recipe="metrics"}
::::cards
:::card{title="Reader time"}
The first useful conclusion appears before supporting detail.
:::
:::card{title="Decision state"}
The recommendation, constraints, and owner remain visible together.
:::
:::card{title="Reversal path"}
The fallback is a named operating route rather than a footnote.
:::
:::card{title="Evidence boundary"}
Claims stay separate from illustrative structure.
:::
::::
:::::

:::::section{title="A strong page still respects reading order" id="path" nav="Path" recipe="story"}
![A dark terrain crossed by a single illuminated path](assets/path.jpg)

::::timeline{title="Operating path" description="Four bounded stages take the decision from review to a reversible release."}
:::event{date="Frame" title="Name the decision" kind="accent"}
State the choice and the consequence before presenting detail.
:::
:::event{date="Prove" title="Connect evidence" kind="success"}
Place the strongest observations beside the claim they support.
:::
:::event{date="Act" title="Assign the route" kind="neutral"}
Give every next action one owner and an observable completion state.
:::
:::event{date="Recover" title="Keep reversal visible" kind="warning"}
Make the rollback path as easy to find as the launch path.
:::
::::
:::::

:::::section{title="The handoff should feel finished" id="handoff" nav="Handoff" recipe="evidence" interaction="tilt"}
![A precise stack of translucent report surfaces ready for handoff](assets/handoff.jpg)

:::callout{kind="success" title="Built from ordinary source"}
This composition uses the same declarative sections, cards, actions, timeline, local images, Review, and
responsive runtime available to every report.
:::

::::actions{placement="bottom"}
::action[Return to the decision]{href="#opening" kind="primary" effect="magnetic"}
::action[Open the visual catalog]{href="../visual-catalog/index.html" kind="secondary"}
::::
:::::
