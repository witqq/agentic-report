---
title: Support quarter in four figures
description: Where the support queue stood at the end of the third quarter, each figure with its date and source.
language: en
layout: dashboard
theme: neutral
extensions: [extension.yaml]
---

# Support quarter in four figures

**Fictional sample.** The team, the figures and the dashboards on this page exist only to show the
`key-figure` extension; replace them with figures from your own sources before use.

::::::section{title="Where the queue stood on 30 September" id="figures" nav="Figures" recipe="metrics"}
::::cards
:::key-figure{label="First reply, median" value="3 h 40 min" date="Q3 2026" source="Helpdesk report «Reply times»" status="good"}
Down from 5 h 10 min in Q2 after the night rota started.
:::

:::key-figure{label="Tickets open over 7 days" value="41" date="30 Sep 2026" source="Queue board, filter «age > 7d»" status="watch"}
Two thirds wait on a vendor answer, not on the team.
:::

:::key-figure{label="Reopened after closing" value="6.2 %" date="Q3 2026" source="Helpdesk report «Reopen rate»" status="risk"}
The target is under 4 %; billing questions reopen most.
:::

::key-figure{label="Satisfaction score" value="4.6 of 5" date="Q3 2026, 1 212 answers" source="Post-ticket survey export"}
::::
::::::

::::section{title="What we change in Q4" id="next" nav="Next"}
Reopened billing tickets are the one figure off target. From October a billing specialist reviews every
billing ticket before it is closed, and the reopen rate is read again on 31 December from the same report.
::::
