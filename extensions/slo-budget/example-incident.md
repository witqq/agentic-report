---
title: 'Search outage, 12 September: what it cost'
description: How much of the monthly error budget an 18-minute outage of search spent, and what the rest of the month can afford.
language: en
theme: neutral
extensions: [extension.yaml]
---

# Search outage, 12 September: what it cost

**Fictional sample.** The service, the outage and its minutes exist only to show the `slo-budget`
extension; use the minutes from your own incident record.

::::section{title="The cost in budget" id="cost" nav="Cost"}
Search promises 99.9 % of good minutes over a rolling 30 days. The outage on day 12 of the window took
18 minutes; nothing else went wrong this month. Change the inputs to see what another outage would do.

:::island{name="slo-budget" hydrate="visible" title="Error budget of search"}

| Target | Window  | Budget   | Spent on day 12 | Burn rate | Budget runs out |
| ------ | ------- | -------- | --------------- | --------- | --------------- |
| 99.9 % | 30 days | 43.2 min | 18 min, 41.7 %  | ×1.04     | on day 29 of 30 |

The budget is the window in minutes times one minus the target: 30 × 1 440 × 0.001 = 43.2 minutes.
:::
::::

::::section{title="What the rest of the month can afford" id="afford" nav="Next"}
At a burn rate just above 1 the budget lasts almost to the end of the window, so planned releases go
ahead. One more outage of the same length would spend the rest: releases of search then wait for the
window to roll past 12 September.
::::
