---
title: Extension showcase
language: en
extensions:
  - extensions/metric-card/extension.yaml
  - extensions/price-table/extension.yaml
  - extensions/counter/extension.yaml
---

# Extension showcase

::::section{title="Metrics" id="metrics"}
:::metric-card{title="Weekly readers" value="12 400" trend="up"}
Readers who opened the page at least once.
:::

::metric-card{title="Bounce" value="31%"}
::::

::::section{title="Pricing" id="pricing"}
::price-table{plan="team"}
::::

::::section{title="Counter" id="counter"}
:::island{name="counter" hydrate="load" title="A tiny counter"}
The counter starts at **0**; each press adds one.
:::
::::
