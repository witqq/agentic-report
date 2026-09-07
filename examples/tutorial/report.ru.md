---
contractVersion: 1
title: Соберите первую переносимую страницу
description: Практическое руководство по декларативному циклу создания, правки, сборки и открытия.
language: ru
---

# Соберите первую переносимую страницу

**Вымышленный пример.** Все метрики, статусы, организации и решения на этой странице нужны только для
демонстрации движка отчётов; перед использованием замените их проверенными данными проекта.

К концу руководства у вас будет один автономный HTML-файл из Markdown — без авторского JSX, CSS,
браузерного JavaScript или конфигурации развёртывания.

::::::section{title="Начните с одного результата" id="start" nav="Начало" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" choreography="cascade"}
:::callout{kind="info" title="Перед началом"}
Используйте поддерживаемую версию Node.js и установите `agentic-report` в рабочий проект.
:::

:::steps{title="Путь первого использования"}

1. Запустите `agentic-report init ./my-page --starter tutorial`.
2. Откройте `./my-page/report.md` и замените примерный заголовок.
3. Запустите `agentic-report build ./my-page --output ./my-page.html`.
4. Откройте `./my-page.html` напрямую в браузере.
   :::
   ::::::

::::::section{title="Выберите формат" id="output" nav="Формат" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal"}

::::tabs{title="Форматы результата"}
:::tab{label="Один файл"}
По умолчанию runtime пакета и локальные ресурсы встраиваются в один переносимый HTML-файл.

```sh
agentic-report build ./my-page --output ./my-page.html
```

:::
:::tab{label="Каталог"}
Для крупных проектов формат каталога записывает HTML-вход и адресуемые по содержимому ресурсы.

```sh
agentic-report build ./my-page --format directory --output ./my-page-dist
```

:::
::::
::::::

::::::section{title="Добавьте смысловое содержимое" id="content" nav="Содержимое" width="wide" tone="plain" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grain" transition="stagger" choreography="cascade"}

::::cards
:::card{title="Выделите факт"}
Используйте callout, когда читатель не должен пропустить ограничение или результат.
:::
:::card{title="Зафиксируйте решение"}
Используйте блок решения для выбранного пути и его последствия.
:::
:::card{title="Покажите порядок"}
Используйте шаги или хронологию, когда порядок меняет смысл.
:::
::::

:::disclosure{title="Показать минимальный пример источника" open="false"}

```yaml
title: Итоги ревью
layout: document
theme: system
```

:::
::::::

::::::section{title="Практика и развитие" id="practice" nav="Практика" width="wide" tone="accent" composition="stack" viewport="bounded" section-density="editorial" type="display" surface="glow" transition="reveal"}

:::demo{title="Завершённые проверки руководства" start="0" step="1"}
Увеличивайте счётчик после создания, редактирования, сборки и открытия своего артефакта.
:::

:::disclosure{title="Нужна точечная диагностика?" open="false"}
Запустите `agentic-report validate ./my-page`, чтобы найти ошибки исходника без записи результата, или
`agentic-report inspect ./my-page --json`, когда агенту нужен список найденных возможностей.
:::

:::decision{title="Сохранить декларативную авторскую границу"}
Когда требование укладывается в примитив пакета, выражайте его как данные Markdown. Не пересобирайте
читательскую часть как отдельный frontend.
:::
::::::
