---
contractVersion: 1
title: Three questions before the payments migration
description: Open questions the platform team must settle before moving card payments to the new provider, each with its context and a place to answer.
language: en
localizations:
  ru: report.ru.md
layout: document
theme: calm-paper
scheme: system
---

# Three questions before the payments migration

**Fictional sample.** The company, dates, and figures are invented to show a page of open questions;
replace them with your own.

Card payments move from the current provider to the new one on 1 December 2026. Three decisions are still
open. Each chapter gives the context and the options; answer all three in the form at the end and send
`response.json` to Lena Ortiz, who runs the migration, by 7 November.

::::::section{title="1. How long do we run both providers?" id="overlap" nav="Overlap"}
:::lead
While both providers run, a refund must go back through the provider that took the payment.
:::

Refunds arrive up to 120 days after a payment; 96% of them arrive within 30 days (refunds from January to
August 2026). A shorter overlap saves the old provider's monthly fee of €4,200 but sends late refunds
through a manual process.

| Overlap  | Refunds handled automatically | Old provider fees |
| -------- | ----------------------------- | ----------------- |
| 30 days  | 96%                           | €4,200            |
| 60 days  | 99%                           | €8,400            |
| 120 days | 100%                          | €16,800           |

::::::

::::::section{title="2. Who approves a failed-payment spike?" id="alerts" nav="Alerts"}
:::lead
The new provider's decline codes differ, so the first week will look like a spike in failed payments.
:::

Today a failed-payment alert pages the on-call engineer at 3% of payments in 15 minutes. During the first
week the payments team expects 4–5% while the code mapping settles. Someone has to decide whether that is a
real failure or the mapping.
::::::

::::::section{title="3. Do saved cards move, or do customers re-enter them?" id="cards" nav="Saved cards"}
:::lead
312,000 customers have a saved card. The providers can transfer tokens, but only in one batch.
:::

A token transfer takes one night and needs a freeze on card changes from 22:00 to 06:00. Without it, every
customer re-enters their card on the next purchase; the pilot on 2,000 customers lost 6% of those purchases
at that step.
::::::

::::::section{title="Your answers" id="answers" nav="Answers"}
:::::response{title="Payments migration questions" id="payments-migration"}
::::question{id="overlap" kind="single" title="How long do we run both providers?"}
::option{id="d30" label="30 days"}
::option{id="d60" label="60 days"}
::option{id="d120" label="120 days"}
::::

::::question{id="alerts" kind="single" title="Who decides during the first week?"}
::option{id="oncall" label="The on-call engineer, as today"}
::option{id="payments" label="The payments team lead"}
::option{id="raise" label="Raise the threshold to 6% for the week"}
::::

::::question{id="cards" kind="single" title="Saved cards"}
::option{id="transfer" label="Transfer tokens in one night"}
::option{id="reenter" label="Customers re-enter their card"}
::::

::::question{id="notes" kind="text" title="Anything the migration team must know" prompt="Conditions, risks, or people to involve."}
::::
:::::
::::::
