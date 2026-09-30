---
contractVersion: 1
title: The Kestrel season in four screens
description: A companion to the Kestrel technique tour, told one idea per screen with layout screens.
language: en
localizations:
  ru: screens.ru.md
layout: screens
progress: nodes
theme: kestrel-theme.yaml
scheme: system
---

# The Kestrel season in four screens

Kestrel is an invented network of six weather stations on one stretch of coast. One gesture moves one
screen; the switcher at the edge jumps to any of them.

::::section{title="Six stations watch one coast" id="coast" nav="Coast"}
:::lead
Three stations stand around the harbour, one on the lighthouse point, one by the dunes and one at the
coastguard hut.
:::

Every ten minutes each of them sends the wind and the readings of its other sensors to the harbour page.
::::

::::section{title="The gust of 18 September" id="gust" nav="Gust"}
:::lead
At 14:00 the lighthouse station measured a gust of :count[44] knots, and the harbour page showed a gale
warning six seconds later.
:::

The server waited for a second station, K1 on the north mole, before it believed the gust.
::::

::::section{title="Firmware 2.4 is in its third field test" id="firmware" nav="Firmware"}
:::lead
The release stands at :process[Plan > Build > Field test > Ship]{current="Field test" returns="Field test>Build×2"}.
:::

Salt in the anemometer bearing of K3 sent the build back twice.
::::

::::section{title="What comes next" id="next" nav="Next"}
:::lead
K5 goes back on air when the sea calms, and firmware 2.4 ships once the field test passes.
:::

Every technique on these screens is shown with its source in the [Kestrel technique tour](../index.html).
::::
