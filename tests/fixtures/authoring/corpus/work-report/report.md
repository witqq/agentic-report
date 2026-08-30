---
title: Work registry corpus
description: Bounded work-report contract coverage.
language: ru
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

| Задача           | Состояние |
| ---------------- | --------- |
| Локальная сборка | Готово    |

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
