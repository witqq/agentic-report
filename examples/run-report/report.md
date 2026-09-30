---
contractVersion: 1
title: Nightly review run 96
description: A run report built from one JSON export, with values, repeated rows and control values settled when the page builds.
language: en
localizations:
  ru: report.ru.md
data:
  - data/run.json
theme:
  name: run-ledger
  extends: neutral
  typography:
    captions: italic
scheme: system
---

# Nightly review run 96

**Fictional sample.** The run, its numbers and its messages are invented to show how a page reads its
figures from a JSON export; replace `data/run.json` with a real export before use.

::expect{data="run.stages" count="5"}
::expect{data="run.status" equals="done"}
::expect{data="run.findings" max="0"}

::::::section{title="Result" id="result" nav="Result"}

::eyebrow[Flow {{run.flow}} · run {{run.id}}]

**Run {{run.id}} finished with {{run.findings}} findings.** :muted[It took :plural[{{run.returns}}]{forms="return|returns"} across five stages; {{run.accepted}} of {{run.items}} review items were accepted, the rest went back once.]

The export was taken :time[{{run.exportedAt}}]{zone="Europe/Moscow"} from :meta[{{run.flow}} #{{run.id}}].

:::::cards{title="Stages"}
::::each{in="run.stages" as="stage"}
:::card{title="{{stage.title.en}}" status="{{stage.card}}"}
**:plural[{{stage.items}}]{forms="item|items"}**, :plural[{{stage.returns}}]{forms="return|returns"}: {{stage.note.en}}.
:::
::::
:::::

::source-line[Moira export of run {{run.id}}, {{run.records}} records]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

::::::

::::::section{title="Time per stage" id="time" nav="Time"}

:::::chart{title="Minutes per stage" description="Wall-clock minutes each stage of run 96 took, read from the export." type="bar" x-label="Stage" y-label="Minutes"}
::::series{label="Minutes"}
:::each{in="run.stages" as="stage"}
::point{label="{{stage.title.en}}" value="{{stage.minutes}}"}
:::
::::
:::::

::source-line[Moira export of run {{run.id}}; minutes are wall-clock time per stage]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

:::each{in="run.stages" as="stage"}

| Stage              |           Items |           Returns |           Minutes |
| ------------------ | --------------: | ----------------: | ----------------: |
| {{stage.title.en}} | {{stage.items}} | {{stage.returns}} | {{stage.minutes}} |

:::

::source-line[The same export, one row per stage]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

::::::

::::::section{title="What the owner saw" id="messages" nav="Messages"}

The notification below is a mock of what the owner received; its wording and times are illustrative,
the numbers come from the same export.

::::conversation{title="Moira notifications" illustrative="true"}
:::message{from="Moira" time="01:17" status="delivered"}
Run {{run.id}} of {{run.flow}} finished: **{{run.findings}} findings**, {{run.accepted}} of {{run.items}} items accepted.
:::
:::message{from="You" time="01:19" side="out" status="read"}
Thanks, send me the page.
:::
::::

::::::
