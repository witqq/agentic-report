---
contractVersion: 1
title: Service notice for station K3
description: The second edition of a fictional service notice for the Kestrel station on the fish quay.
language: en
localizations:
  ru: edition-2.ru.md
theme: kestrel-theme.yaml
scheme: system
---

# Service notice for station K3

Kestrel and its stations are invented. This is the second edition of the notice, written after the second
field test of firmware 2.4.

::::section{title="What is wrong" id="fault" nav="Fault"}
Salt from the fish quay jams the anemometer bearing of K3 for the second time. The cups slow down in a
strong wind, and the station reports less wind than there is.
::::

::::section{title="What to do" id="service" nav="Service"}
Replace the bearing with the sealed spare from the coastguard hut; rinsing it did not last a week.

```sh
kestrel service K3 --sensor wind --note "sealed bearing fitted"
```

::::

::::section{title="When" id="when" nav="When"}
The service is due on 19 September, before the third field test.
::::
