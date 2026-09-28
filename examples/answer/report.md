---
contractVersion: 1
title: Which search should the help centre use?
description: A question put to the support leads with three options, their trade-offs, and a form that collects one structured answer.
language: en
localizations:
  ru: report.ru.md
layout: document
theme: calm-paper
scheme: system
---

# Which search should the help centre use?

**Fictional sample.** The options, numbers, and names below are demonstration data; replace them
with the real question and its evidence before use.

Support leads choose one search approach for the help centre before the March content migration.
Read the three options, then answer in the form at the end and export the answer for the platform
team.

::::::section{title="The question" id="question" nav="Question" recipe="hero"}
:::lead
Readers find the right article on the first search in 58% of sessions. The migration is the
cheapest moment to change how search works.
:::

The platform team can ship any one of the options below before the migration. The choice decides
who maintains synonyms, how fast new articles become findable, and what the monthly bill is.
::::::

::::::section{title="Three options" id="options" nav="Options"}
::::cards
:::card{title="Keep keyword search"}
**No new cost.** Articles are findable within a minute of publishing. Synonyms stay a manual list
that support edits.
:::
:::card{title="Hosted semantic search"}
**Best first-search rate in the pilot: 74%.** New articles need up to an hour to index, and the
bill grows with traffic.
:::
:::card{title="Hybrid ranking"}
**Keyword first, semantic re-ranking on top.** 69% in the pilot, one more service for the
platform team to run.
:::
::::

:::disclosure{title="How the pilot measured first-search success"}
Two weeks of anonymised sessions, 4,100 searches, counted as a success when the reader opened an
article and did not search again within five minutes.
:::
::::::

::::::section{title="Your answer" id="answer" nav="Answer"}
:::::response{title="Help centre search" id="help-search"}
::::question{id="choice" kind="single" title="Which option should ship before the migration?"}
::option{id="keyword" label="Keep keyword search"}
::option{id="semantic" label="Hosted semantic search"}
::option{id="hybrid" label="Hybrid ranking"}
::::

::::question{id="confidence" kind="single" title="How sure are you?"}
::option{id="sure" label="Sure"}
::option{id="leaning" label="Leaning"}
::option{id="unsure" label="Unsure — need more data"}
::::

::::question{id="conditions" kind="text" title="Conditions" prompt="What must be true for your choice to work?"}
::::

::::question{id="open" kind="text" title="Open questions" prompt="What would you ask the platform team before deciding?"}
::::
:::::
::::::
