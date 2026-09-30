---
contractVersion: 1
title: Ночной прогон ревью № 96
description: Отчёт о прогоне, собранный из одной выгрузки JSON; значения, повторяемые строки и контрольные значения подставляются при сборке.
language: ru
---

# Ночной прогон ревью № 96

**Вымышленный пример.** Прогон, его числа и сообщения выдуманы, чтобы показать, как страница берёт
цифры из выгрузки JSON; перед использованием замените `data/run.json` настоящей выгрузкой.

::expect{data="run.stages" count="5"}
::expect{data="run.status" equals="done"}
::expect{data="run.findings" max="0"}

::::::section{title="Итог" id="result" nav="Итог"}

::eyebrow[Процесс {{run.flow}} · прогон {{run.id}}]

**Прогон {{run.id}} закончился без находок.** :muted[На пять этапов пришлось :plural[{{run.returns}}]{forms="возврат|возврата|возвратов"}; из {{run.items}} пунктов ревью принято {{run.accepted}}, остальные один раз ушли на доработку.]

Выгрузка снята :time[{{run.exportedAt}}]{zone="Europe/Moscow"} из :meta[{{run.flow}} #{{run.id}}].

:::::cards{title="Этапы"}
::::each{in="run.stages" as="stage"}
:::card{title="{{stage.title.ru}}" status="{{stage.card}}"}
**:plural[{{stage.items}}]{forms="пункт|пункта|пунктов"}**, :plural[{{stage.returns}}]{forms="возврат|возврата|возвратов"}: {{stage.note.ru}}.
:::
::::
:::::

::source-line[Выгрузка Moira по прогону {{run.id}}, {{run.records}} записей]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

::::::

::::::section{title="Время по этапам" id="time" nav="Время"}

:::::chart{title="Минуты по этапам" description="Фактическая длительность каждого этапа прогона 96 в минутах по данным выгрузки." type="bar" x-label="Этап" y-label="Минуты"}
::::series{label="Минуты"}
:::each{in="run.stages" as="stage"}
::point{label="{{stage.title.ru}}" value="{{stage.minutes}}"}
:::
::::
:::::

::source-line[Выгрузка Moira по прогону {{run.id}}; длительность каждого этапа в минутах]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

:::each{in="run.stages" as="stage"}

| Этап               |          Пункты |          Возвраты |            Минуты |
| ------------------ | --------------: | ----------------: | ----------------: |
| {{stage.title.ru}} | {{stage.items}} | {{stage.returns}} | {{stage.minutes}} |

:::

::source-line[Та же выгрузка, по строке на этап]{date="{{run.exportedAt}}" zone="Europe/Moscow"}

::::::

::::::section{title="Что увидел владелец" id="messages" nav="Сообщения"}

Уведомление ниже — макет того, что получил владелец: формулировки и время в нём иллюстративные,
а числа взяты из той же выгрузки.

::::conversation{title="Уведомления Moira" illustrative="true"}
:::message{from="Moira" time="01:17" status="доставлено"}
Прогон {{run.id}} процесса {{run.flow}} завершён: **находок нет**, принято {{run.accepted}} из {{run.items}} пунктов.
:::
:::message{from="Вы" time="01:19" side="out" status="прочитано"}
Спасибо, пришлите страницу.
:::
::::

::::::
