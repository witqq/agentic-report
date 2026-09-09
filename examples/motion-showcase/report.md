---
contractVersion: 1
title: Motion and depth showcase
description: A Cinematic page demonstrating package-owned scroll scenes, reveal, choreography, depth, tilt, and reduced-motion fallback.
language: en
localizations:
  ru: report.ru.md
theme: dark
layout: landing
preset: cinematic
scrollProgress: true
---

# Motion that carries the story

**Fictional sample.** Every place, metric, status, and conclusion on this page exists only to demonstrate
the report engine; replace it with verified project evidence before use.

::::actions{placement="inline"}
::action[Enter the first scene]{href="#opening" kind="primary" effect="magnetic"}
::action[Browse the image rail]{href="#rail" kind="secondary"}
::action[Check reduced motion]{href="#fallback" kind="quiet"}
::::

:::::section{title="Depth follows attention" id="opening" nav="Depth" recipe="hero" scene="none" interaction="depth"}
:::lead
Scroll changes the relationship between image and frame. Fine-pointer depth adds response without becoming
the only way to read or navigate the page.
:::

![An aurora folding over a dark mountain ridge](assets/aurora.jpg)

:::callout{kind="info" title="Move, scroll, or simply read"}
The package owns the effect, its bounds, and the fallback. Authored content remains ordinary Markdown.
:::
:::::

:::::section{title="A rail can feel continuous without leaving its container" id="rail" nav="Rail" recipe="rail" scene="progress"}
::::cards
:::card{title="Mineral light"}
![A red mineral plane cut by black geological lines](assets/gallery-red.jpg)
:::
:::card{title="Night terrain"}
![A dark terrain crossed by pale atmospheric light](assets/terrain.jpg)
:::
:::card{title="Distant signal"}
![A cinematic horizon under a concentrated band of light](assets/cinematic.jpg)
:::
::::
:::::

:::::section{title="Sequence makes evidence easier to scan" id="sequence" nav="Sequence" recipe="metrics"}
::::cards
:::card{title="Reveal"}
Sections enter only when they become relevant.
:::
:::card{title="Stagger"}
Related items arrive in authored order.
:::
:::card{title="Progress"}
Scene depth follows bounded scroll progress.
:::
:::card{title="Pointer"}
Fine-pointer response is local and frame-coalesced.
:::
::::
:::::

:::::section{title="The effect never owns the meaning" id="fallback" nav="Fallback" recipe="evidence" interaction="tilt"}
![A broad illuminated landscape retaining a clear horizon](assets/terrain.jpg)

:::decision{title="Keep content complete without motion"}
When reduced motion is enabled, every image, card, control, and conclusion remains visible in the same
reading order. Only movement disappears.
:::

:::popover{title="What is package-owned?" trigger="Inspect the boundary"}
Timing, distance, pointer gating, viewport observation, and reduced-motion behavior live in the runtime.
The source declares only a closed semantic role.
:::

::::actions{placement="bottom"}
::action[Return to depth]{href="#opening" kind="primary" effect="magnetic"}
::action[Open the Cinematic story]{href="../cinematic-story/index.html" kind="secondary"}
::::
:::::
