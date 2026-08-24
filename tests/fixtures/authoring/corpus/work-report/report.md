---
title: Work registry corpus
description: Bounded work-report contract coverage.
language: ru
---

# Work registry corpus

Corpus class: work-report

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
