---
contractVersion: 1
title: Agentic Report · Превратите выводы в страницу
description: Собирайте интерактивные страницы из Markdown и локальных данных. Читатель может изучать данные и обсуждать фрагменты.
language: ru
---

# Превратите выводы в страницу.

Agentic Report превращает Markdown в интерактивные страницы, где читатель может изучать данные
и оставлять комментарии.

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

::::actions{placement="edge"}
::action[Сделать первую страницу]{href="#start" kind="primary"}
::action[Изучить работающий результат]{href="#result" kind="quiet"}
::::

:::::section{title="От исходника к странице" id="core" nav="Механизм" place="opening" recipe="demo" frame="none" transition="staged" media="natural" execution-core="report"}

::::actions{placement="inline"}
::action[Markdown]{href="#result" kind="quiet"}
::action[Компилятор]{href="#compile" kind="quiet"}
::action[HTML]{href="#result" kind="quiet"}
::::

![Авторская модель компиляции: пластины исходника входят в открывающееся объёмное ядро, из которого выходит страница](assets/compile-core.svg){dark="assets/compile-core-dark.svg"}

_Модель компиляции, не оборудование и не запись запуска._

:::::

::::::section{title="Сохраните исходник. Соберите страницу." id="compile" nav="От исходника к странице" composition="flow" scene="steps" media="natural" execution-core="report"}

![Пластины исходника, открытое ядро компиляции и выходящая страница в неподвижной изометрической проекции](assets/compile-core.svg){dark="assets/compile-core-dark.svg"}

_Исходник остаётся на месте, пока его данные входят в ядро, из которого выходит страница._

:::beat{title="Запишите то, что знаете" state="compile-input"}
Markdown хранит объяснение. Локальный JSON задаёт числа; ресурсы, общие фрагменты и тема в YAML/JSON
остаются рядом с исходником.
:::

:::beat{title="Соберите страницу из исходника" state="compile-process"}
Перед записью результата компилятор проверяет формат и границы файлов. Автор проверяет утверждения.
Собственный код входит через явно объявленные расширения.
:::

:::beat{title="Передайте читателю работающую страницу" state="compile-output"}
По умолчанию получается один HTML-файл, который открывается с диска. У фигур есть встроенные элементы
управления; к тексту можно оставлять заметки ревью. Для большой страницы с отдельными ресурсами есть
сборка в каталог.
:::

::::::

:::::::section{title="Изучите данные" id="result" nav="Работающий результат" composition="flow" width="reading"}

Этот график собран из данных ниже. Откройте его, изучите значения и вернитесь к странице.

::expect{data="incident.points" count="5"}

::::chart{type="line" title="Ошибки оформления заказа" description="Вымышленная доля ошибок оформления заказа OrbitDesk в пяти проверках по UTC." x-label="Момент проверки, UTC" y-label="Неудачные попытки, проценты"}
:::series{label="Доля ошибок"}
::point{label="{{incident.points.0.utc}}" value="{{incident.points.0.percent}}"}
::point{label="{{incident.points.1.utc}}" value="{{incident.points.1.percent}}"}
::point{label="{{incident.points.2.utc}}" value="{{incident.points.2.percent}}"}
::point{label="{{incident.points.3.utc}}" value="{{incident.points.3.percent}}"}
::point{label="{{incident.points.4.utc}}" value="{{incident.points.4.percent}}"}
:::
::::

::source-line[Пять проверок по UTC из вымышленного инцидента OrbitDesk. Это ошибки оформления заказа в примере, а не показатели работы Report.]{date="{{incident.date}}"}

:::::disclosure{title="Прочитать Markdown, из которого собран график" open="false"}

```md
::::chart{type="line" title="Ошибки оформления заказа" description="Вымышленная доля ошибок оформления заказа OrbitDesk в пяти проверках по UTC." x-label="Момент проверки, UTC" y-label="Неудачные попытки, проценты"}
:::series{label="Доля ошибок"}
::point{label="{{incident.points.0.utc}}" value="{{incident.points.0.percent}}"}
::point{label="{{incident.points.1.utc}}" value="{{incident.points.1.percent}}"}
::point{label="{{incident.points.2.utc}}" value="{{incident.points.2.percent}}"}
::point{label="{{incident.points.3.utc}}" value="{{incident.points.3.percent}}"}
::point{label="{{incident.points.4.utc}}" value="{{incident.points.4.percent}}"}
:::
::::
```

:::::

Таблицы, схемы и локальные медиа используют ту же тему. Исходный Markdown остаётся основой
для следующей редакции.

:::::::

::::section{title="Оставьте вопрос у фрагмента" id="notes" nav="Заметки читателя" composition="flow" tone="contrast"}

Выделите это предложение и выберите **Создать заметку**: у каждого решения должны быть данные,
которые читатель может проверить.

Продолжите обсуждение, закройте вопрос и экспортируйте `review.json`, когда захотите передать
комментарии автору. Они не отправляются автоматически. Эта собранная страница хранит локальные
заметки и не подключается к Codex.

::::

:::::section{title="Правьте страницу в диалоге, где идёт работа" id="live" nav="Локальное обсуждение" composition="flow" width="reading"}

Для живого документа запустите локальный просмотр из диалога Codex, в котором создаётся исходник:

```sh
npx --yes agentic-report@0.21.1 serve ./my-page --human
```

Откройте напечатанный адрес localhost. Выделите фрагмент и выберите **Ask agent**. Ответ появится
в чате по мере написания; правки исходника пересоберут страницу и подсветят изменения. По умолчанию
подключается текущий загруженный диалог Codex с правом записи через совместимый локальный
управляющий интерфейс.

`serve` отдельно включает локальный просмотр для одного человека. Разговор не публикуется
как облачный сервис. Кнопки живого обсуждения пока на английском. Для отдельного агента нужен явный выбор.

:::::

:::::section{title="Проследите задачу по странице" id="examples" nav="Примеры" composition="flow"}

Организации и данные в этих поддерживаемых примерах вымышлены. Компоновка и взаимодействия работают
в собранной странице.

::::cards
:::card{title="Разбор инцидента" href="examples/incident-review/index.html"}
Влияние, причины, этапы восстановления и дальнейшие действия собраны в одном отчёте.
:::
:::card{title="Выбор поставщика" href="examples/vendor-decision/index.html"}
Условия и данные поддерживают рекомендацию; рядом указано, что может её изменить.
:::
:::card{title="Архитектура" href="examples/architecture/index.html"}
Карта системы стоит рядом с альтернативами и порядком внедрения, который следует из решения.
:::
::::

[Обзор возможностей](examples/capability-tour/index.html) связывает работающие
приёмы с Markdown. [Визуальный каталог](examples/visual-catalog/index.html)
показывает полные компоновки.

::::disclosure{title="Все примеры и их исходники" open="false"}

Это настоящие снимки поддерживаемых примеров в светлой и тёмной схемах.

![Разбор инцидента с влиянием и причинными данными](assets/incident-review.png){dark="assets/incident-review-dark.png"}

![Решение по поставщику с обязательными условиями и взвешенными данными](assets/vendor-decision.png){dark="assets/vendor-decision-dark.png"}

![Готовность запуска с данными активации и обратимым путём](assets/launch-readiness.png){dark="assets/launch-readiness-dark.png"}

| Задача читателя                | Работающая страница                                  | Исходник                                                |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| Отчёт о решении                | [Открыть](examples/document/index.html)              | [Markdown](examples/document/report.ru.md)              |
| Исследование                   | [Открыть](examples/research/index.html)              | [Markdown](examples/research/report.ru.md)              |
| Архитектура                    | [Открыть](examples/architecture/index.html)          | [Markdown](examples/architecture/report.ru.md)          |
| Руководство по первой странице | [Открыть](examples/tutorial/index.html)              | [Markdown](examples/tutorial/report.ru.md)              |
| Панель                         | [Открыть](examples/dashboard/index.html)             | [Markdown](examples/dashboard/report.ru.md)             |
| Заготовка лендинга             | [Открыть](examples/landing/index.html)               | [Markdown](examples/landing/report.ru.md)               |
| Визуальный каталог             | [Открыть](examples/visual-catalog/index.html)        | [Markdown](examples/visual-catalog/report.ru.md)        |
| Каталог взаимодействий         | [Открыть](examples/interactive-catalog/index.html)   | [Markdown](examples/interactive-catalog/report.ru.md)   |
| Атлас визуализаций             | [Открыть](examples/visualization-catalog/index.html) | [Markdown](examples/visualization-catalog/report.ru.md) |
| Терминальное портфолио         | [Открыть](examples/terminal-portfolio/index.html)    | [Markdown](examples/terminal-portfolio/report.ru.md)    |
| Кинематографическая история    | [Открыть](examples/cinematic-story/index.html)       | [Markdown](examples/cinematic-story/report.ru.md)       |
| Краткий отчёт                  | [Открыть](examples/executive-brief/index.html)       | [Markdown](examples/executive-brief/report.ru.md)       |
| Движение и глубина             | [Открыть](examples/motion-showcase/index.html)       | [Markdown](examples/motion-showcase/report.ru.md)       |
| Отчёт о прогоне из данных      | [Открыть](examples/run-report/index.html)            | [Markdown](examples/run-report/report.ru.md)            |
| Обзор возможностей             | [Открыть](examples/capability-tour/index.html)       | [Markdown](examples/capability-tour/report.ru.md)       |
| Разбор инцидента               | [Открыть](examples/incident-review/index.html)       | [Markdown](examples/incident-review/report.ru.md)       |
| Выбор поставщика               | [Открыть](examples/vendor-decision/index.html)       | [Markdown](examples/vendor-decision/report.ru.md)       |
| Готовность запуска             | [Открыть](examples/launch-readiness/index.html)      | [Markdown](examples/launch-readiness/report.ru.md)      |
| Ревью кода                     | [Открыть](examples/code-review/index.html)           | [Markdown](examples/code-review/report.ru.md)           |
| Вопрос с ответом               | [Открыть](examples/answer/index.html)                | [Markdown](examples/answer/report.ru.md)                |
| Презентация                    | [Открыть](examples/presentation/index.html)          | [Markdown](examples/presentation/report.ru.md)          |
| Открытые вопросы               | [Открыть](examples/question-review/index.html)       | [Markdown](examples/question-review/report.ru.md)       |

[Пространство Review](examples/review-workspace/index.html) ·
[Русский исходник Review](examples/review-workspace/report.ru.md) ·
[Пример прежнего ревью](examples/review-workspace/prior-review.json) ·
[Структурированный Response](examples/response-workspace/index.html) ·
[Манифест примеров](examples/manifest.json)

::::

:::::

::::::section{title="Дайте агенту материал" id="start" nav="Собрать свою страницу" composition="flow" width="reading"}

Установите скил командой в начале страницы, затем передайте агенту настоящие заметки и данные.

:::copyable
Используй agentic-report, чтобы превратить эти заметки об инциденте в отчёт. Покажи хронологию и данные,
на которых основано решение. Дай мне комментировать фрагменты и проверь готовую страницу на телефоне
и компьютере.
:::

:::::disclosure{title="Собрать напрямую из командной строки" open="false"}
Нужен Node.js 24.18.0 или новее. Первый запуск требует доступа к реестру npm.

```sh
npx --yes agentic-report@0.21.1 init ./my-page --starter document --json
npx --yes agentic-report@0.21.1 build ./my-page --output ./my-page.html --json
```

Между командами отредактируйте `my-page/report.md`. Готовый HTML открывается прямо с диска;
сервер разработки не нужен. `build` проверяет исходник перед записью результата.
:::::

[Контракт исходника](docs/product/source-contract.md) описывает границы
авторского формата. [Руководство для агента](docs/agent/index.html) объясняет,
как собирать страницы.

:::actions{placement="bottom"}
::action[Прочитать руководство для агента]{href="docs/agent/index.html" kind="primary"}
::action[Исходники проекта]{href="https://github.com/witqq/agentic-report" kind="quiet"}
:::

::::::

::::::section{title="Держите исходники под рукой" id="resources" nav="Ресурсы" composition="flow" width="reading"}

[Руководство для читателя](docs/index.html) · [Исходник быстрого старта для агента](docs/agent/index.md) ·
[Точный скил](skills/agentic-report/SKILL.md) · [Исходник заготовки лендинга](source/starter/landing/report.md) ·
[Манифест публичных маршрутов](website/routes.json) · [Идентификатор выпуска](release.json)

Обычный исходник не загружает данные из сети, не принимает сырой HTML и не запускает код сам по себе.
Явные расширения работают в описанных для них границах доверия. Облачная совместная работа, экспорт PDF,
пагинация и режим без JavaScript в продукт не входят.

:::::disclosure{title="Скачать полный набор исходников этой страницы" open="false"}
В обоих каталогах лежат одинаковые оригинальные файлы. Сохраняйте взаимные пути исходника, его русского
варианта, данных, изображений и объявленного расширения. Код модели сопровождается лицензией MIT.

| Файл                                                     | Каталог исходников                                                               | Канонический каталог                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `report.md`                                              | [Скачать](source/landing/report.md)                                              | [Скачать](website/landing/report.md)                                              |
| `report.ru.md`                                           | [Скачать](source/landing/report.ru.md)                                           | [Скачать](website/landing/report.ru.md)                                           |
| `data/incident.json`                                     | [Скачать](source/landing/data/incident.json)                                     | [Скачать](website/landing/data/incident.json)                                     |
| `assets/compile-core.svg`                                | [Скачать](source/landing/assets/compile-core.svg)                                | [Скачать](website/landing/assets/compile-core.svg)                                |
| `assets/compile-core-dark.svg`                           | [Скачать](source/landing/assets/compile-core-dark.svg)                           | [Скачать](website/landing/assets/compile-core-dark.svg)                           |
| `assets/social-preview.png`                              | [Скачать](source/landing/assets/social-preview.png)                              | [Скачать](website/landing/assets/social-preview.png)                              |
| `assets/incident-review.png`                             | [Скачать](source/landing/assets/incident-review.png)                             | [Скачать](website/landing/assets/incident-review.png)                             |
| `assets/incident-review-dark.png`                        | [Скачать](source/landing/assets/incident-review-dark.png)                        | [Скачать](website/landing/assets/incident-review-dark.png)                        |
| `assets/vendor-decision.png`                             | [Скачать](source/landing/assets/vendor-decision.png)                             | [Скачать](website/landing/assets/vendor-decision.png)                             |
| `assets/vendor-decision-dark.png`                        | [Скачать](source/landing/assets/vendor-decision-dark.png)                        | [Скачать](website/landing/assets/vendor-decision-dark.png)                        |
| `assets/launch-readiness.png`                            | [Скачать](source/landing/assets/launch-readiness.png)                            | [Скачать](website/landing/assets/launch-readiness.png)                            |
| `assets/launch-readiness-dark.png`                       | [Скачать](source/landing/assets/launch-readiness-dark.png)                       | [Скачать](website/landing/assets/launch-readiness-dark.png)                       |
| `assets/screenshots.json`                                | [Скачать](source/landing/assets/screenshots.json)                                | [Скачать](website/landing/assets/screenshots.json)                                |
| `extensions/execution-core/extension.yaml`               | [Скачать](source/landing/extensions/execution-core/extension.yaml)               | [Скачать](website/landing/extensions/execution-core/extension.yaml)               |
| `extensions/execution-core/effect.mjs`                   | [Скачать](source/landing/extensions/execution-core/effect.mjs)                   | [Скачать](website/landing/extensions/execution-core/effect.mjs)                   |
| `extensions/execution-core/README.md`                    | [Скачать](source/landing/extensions/execution-core/README.md)                    | [Скачать](website/landing/extensions/execution-core/README.md)                    |
| `extensions/execution-core/LICENSE`                      | [Скачать](source/landing/extensions/execution-core/LICENSE)                      | [Скачать](website/landing/extensions/execution-core/LICENSE)                      |
| `extensions/execution-core/example-report.md`            | [Скачать](source/landing/extensions/execution-core/example-report.md)            | [Скачать](website/landing/extensions/execution-core/example-report.md)            |
| `extensions/execution-core/example-decision.md`          | [Скачать](source/landing/extensions/execution-core/example-decision.md)          | [Скачать](website/landing/extensions/execution-core/example-decision.md)          |
| `extensions/execution-core/assets/compile-core.svg`      | [Скачать](source/landing/extensions/execution-core/assets/compile-core.svg)      | [Скачать](website/landing/extensions/execution-core/assets/compile-core.svg)      |
| `extensions/execution-core/assets/compile-core-dark.svg` | [Скачать](source/landing/extensions/execution-core/assets/compile-core-dark.svg) | [Скачать](website/landing/extensions/execution-core/assets/compile-core-dark.svg) |

:::::

::::::
