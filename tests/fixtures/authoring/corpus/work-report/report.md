---
title: Work registry corpus
description: Bounded work-report contract coverage.
language: ru
review: true
localizations:
  en: report.en.md
extensions:
  - extensions/status-note/extension.yaml
data:
  - data/run.json
---

# Work registry corpus

Corpus class: work-report

::contents

:::copyable
Скопируйте этот обычный абзац в сообщение.
:::

:::callout{title="Статус" kind="success"}
Работа описана декларативно.
:::

:::table{layout="stack"}

| Задача           | Состояние |
| ---------------- | --------- |
| Локальная сборка | Готово    |

:::

::source-line[Выгрузка прогона 96, 212 записей]{date="2026-09-25T01:17" zone="Europe/Moscow"}

::expect{data="run.blocks" count="2" min="1" max="5"}
::expect{data="run.status" equals="done"}

:::each{in="run.blocks" as="block"}

- **{{block.title}}**: :plural[{{block.items}}]{forms="пункт|пункта|пунктов"}
  :::

::eyebrow[Прогон {{run.id}}]

Прогон завершён :time[2026-09-25T01:17]{zone="Europe/Moscow" show="datetime"}. :muted[Два повтора на сетевом шаге.] :meta[run {{run.id}}]

::::conversation{title="Ночной прогон" illustrative=true}
:::message{from="Moira" time="01:17" side="in" status="доставлено" illustrative=true}
Ревью завершено.
:::
::::

:::decision{title="Решение" id="corpus-decision" required=true}
::decision-option{id="ship" label="Выпустить"}
::decision-option{id="hold" label="Отложить"}
:::

:::checklist{title="Проверки" id="corpus-checklist"}
::check-item{id="owner" label="Назначен ответственный" required=true}
::check-item{id="notes" label="Добавлены заметки"}
:::

:::::response{title="Ответ читателя" id="corpus-response"}
::::question{id="scope" kind="bucket" title="Распределение" prompt="Разложите по корзинам"}
::bucket{id="do" label="Сделать"}
::bucket{id="skip" label="Пропустить"}
::item{id="task" label="Задача" note="Пояснение" meta="Issue 1" href="https://example.com/issues/1" bucket="do" comment=true}
::::
::::question{id="choice" kind="item-single" title="Выбор"}
::option{id="yes" label="Да"}
::option{id="no" label="Нет"}
::item{id="finding" label="Замечание" note="Пояснение" meta="Review 1" href="https://example.com/reviews/1"}
::::
::::question{id="score" kind="number" title="Оценка" min="1" max="5" step="1"}
::item{id="confidence" label="Уверенность" note="Оценка уверенности" meta="Шкала 1–5" href="https://example.com/scores/confidence"}
::::
:::::

::::section{title="Тезис и определение" nav="Тезис"}
:::lead
Ведущий абзац вводит :term[локальный термин]{key="local-term"} как обычную акцентированную прозу.
:::
::::

:::glossary{key="local-term" term="Локальный термин" forms="локального термина, локальному термину" placement="appendix"}
Определение напечатано в приложении.
:::

:::diff{title="Ключ идемпотентности" file="src/webhooks/handler.ts"}

```diff
@@ -1,2 +1,2 @@
 const verified = verify(event);
-apply(event);
+applyOnce(event);
```

:::

:::::findings{title="Находки"}
::::finding{severity="blocking" title="Ключ зависит от попытки" location="src/webhooks/handler.ts:2"}
Счётчик попыток меняется при каждом повторе.
::::
:::::
