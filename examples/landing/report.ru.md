---
contractVersion: 1
title: От Markdown к странице, которой хочется поделиться
description: Сфокусированный лендинг автономного конструктора интерактивных страниц для агентов.
language: ru
---

# От Markdown к странице, которой хочется поделиться

**Вымышленный пример.** Все метрики, статусы, организации и решения на этой странице нужны только для
демонстрации движка отчётов; перед использованием замените их проверенными данными проекта.

Дайте агенту декларативный источник, а не frontend-проект. Создавайте отчёты, исследования, архитектурные
заметки, руководства, dashboards и лендинги, которые открываются прямо с диска.

::::actions{placement="edge"}
::action[Посмотреть процесс]{href="#workflow" kind="primary" effect="magnetic"}
::action[Изучить доказательства]{href="#proof" kind="secondary"}
::action[Прочитать ограничения]{href="#boundaries" kind="quiet"}
::::

::contents

:::::section{title="Начните с работы, а не с фреймворка" id="workflow" nav="Процесс" width="wide" align="start" tone="soft" composition="mosaic" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" choreography="cascade"}
:::lead
:term[Переносимая граница]{key="portable-boundary"} сохраняет основной тезис в обычном потоке чтения и
помогает быстро увидеть главное обещание страницы.
:::

:::callout{kind="success" title="Один переносимый результат"}
По умолчанию получается один автономный HTML-файл без сервера, удалённого runtime и авторского JavaScript.
:::

::::cards
:::card{title="Пишите естественно"}
Используйте Markdown, frontmatter, ограниченные partials и локальные ресурсы.
:::
:::card{title="Добавляйте намерение"}
Выбирайте карточки, решения, взаимодействия, схемы, хронологии и графики пакета.
:::
:::card{title="Поставляйте статику"}
Собирайте единым production-путём, который проверяет исходник перед записью.
:::
::::

:::glossary{key="portable-boundary" term="Переносимая граница" placement="appendix"}
Источник остаётся декларативным, а пакет владеет рендерингом, взаимодействием, confinement и автономным результатом.
:::
:::::

:::::section{title="Путь к полезной странице" id="journey" nav="Путь" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" choreography="cascade"}
::::timeline{title="Путь первой страницы" description="Четыре коротких этапа ведут от основы пакета к переносимому проверенному артефакту."}
:::event{date="Выбор" title="Выберите основу" kind="neutral"}
Возьмите форму страницы, наиболее близкую к задаче читателя.
:::
:::event{date="Правка" title="Замените примерные доказательства" kind="accent"}
Сохраните смысловую структуру и сделайте содержимое фактическим.
:::
:::event{date="Сборка" title="Соберите локально" kind="success"}
Создайте один файл или каталог с адресуемыми по содержимому ресурсами.
:::
:::event{date="Открытие" title="Проверьте артефакт" kind="warning"}
Испытайте реальную страницу через `file://` на desktop и mobile.
:::
::::
:::::

::::section{title="Доказательство без скрытого сервиса" id="proof" nav="Доказательство" width="wide" align="start" tone="accent" composition="stage" viewport="full" section-density="immersive" type="display" surface="glow" transition="stagger"}
:::decision{title="Сохранить публичный формат только для данных"}
Пакет владеет рендерингом и взаимодействиями, поэтому для готовой страницы автору не нужны JSX, CSS,
callbacks или hosted-редактор.
:::

:::popover{title="Сведения о переносимости" trigger="Почему важен file://?"}
Открытие прямо с диска доказывает, что после сборки артефакт не зависит от dev-сервера или удалённого runtime.
:::
::::

::::section{title="Соберите первую страницу" id="boundaries" nav="Старт" width="wide" align="center" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="plain" transition="stagger"}

```sh
agentic-report init ./my-page --starter landing
agentic-report build ./my-page --output ./my-page.html
```

Используйте `validate` или `inspect` позже, когда нужна точечная диагностика исходника.

:::disclosure{title="Что остаётся вне формата источника" open="false"}
Удалённая загрузка, raw HTML, исполняемые шаблоны, произвольные plugins и авторский браузерный код остаются
вне переносимой границы доверия.
:::

:::actions{placement="bottom"}
::action[Назад к процессу]{href="#workflow" kind="primary" effect="magnetic"}
::action[Документация проекта]{href="../../docs/product/source-contract.md" kind="secondary"}
::action[Изучить контракт источника]{href="../../docs/product/source-contract.md" kind="quiet"}
:::
::::
