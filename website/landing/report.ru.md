---
contractVersion: 1
title: agentic-report — красивые интерактивные страницы из Markdown
description: Дайте агенту декларативный Markdown и получите готовую локальную страницу для человека.
language: ru
---

# Страница, которую хочется передать. Из Markdown.

**Один декларативный исходник превращается в готовый интерактивный отчёт, руководство, панель или визуальную историю.**

Без отдельного фронтенд-проекта, облачного редактора и авторского JavaScript. `agentic-report` локально
собирает переносимый HTML с адаптивной композицией, взаимодействиями и локализацией. Ревью выделенного
текста и переключатель стиля для читателя включаются каждый своим флагом в метаданных.

::::actions{placement="edge"}
::action[Собрать первую страницу]{href="#workflow" kind="primary" effect="magnetic"}
::action[Выбрать визуальный характер]{href="#styles" kind="secondary"}
::action[Открыть живые примеры]{href="#examples" kind="quiet"}
::::

![Монументальная сцена локального отчёта со скульптурным светом и ощутимой глубиной](assets/monument.jpg)

_Собрано обычным компилятором из публичного исходника этой страницы._

::::cards
:::card{title="По умолчанию один HTML"}
Для крупных локальных медиа используйте каталог с адресацией ресурсов по содержимому.
:::
:::card{title="Интерактивность через file://"}
Среда выполнения входит в артефакт: читателю не нужно запускать сервер.
:::
:::card{title="Русский и английский"}
Первый язык выбирается по системе, а переключатель появляется только при наличии перевода.
:::
::::

::::::section{title="Выберите результат, затем его характер." id="styles" nav="Выбрать результат" recipe="rail" interaction="depth"}
:::lead
Начните с задачи читателя. Preset задаёт согласованные шрифты, поверхности, отступы, элементы управления,
медиа и движение. Рецепты разделов строят рассказ без длинной стены визуальных атрибутов. На этой странице
включён переключатель стиля: выберите другой в верхней строке, и тот же исходник перестроится на лету.
:::

![Разбор инцидента с влиянием и причинными данными](assets/incident-review.png)

![Решение по поставщику с обязательными условиями и взвешенными данными](assets/vendor-decision.png)

![Готовность запуска с данными активации и обратимым путём](assets/launch-readiness.png)

::::cards
:::card{title="Отчёт о решении · Material" href="examples/basic/index.html"}
Крупная иерархия для доказательств, решений, рисков и следующих ответственных действий.
:::
:::card{title="Исследование · Material" href="examples/research/index.html"}
Редакционная глубина для метода, источников, сравнения, неопределённости и рекомендации.
:::
:::card{title="Панель Signal" href="examples/dashboard/index.html"}
Контрастный операционный обзор с графиками, фильтрами, состояниями и компактным управлением.
:::
:::card{title="Терминальное портфолио" href="examples/terminal-portfolio/index.html"}
Моноширинный шрифт, ритм команд, сканирующая текстура, курсор и заметные ссылки на работы.
:::
:::card{title="Кинематографическая история" href="examples/cinematic-story/index.html"}
Локальные изображения ведут сценический пролог, рассказ при прокрутке, медиаленту и итог.
:::
:::card{title="Краткий отчёт · Monument" href="examples/executive-brief/index.html"}
Решительное вступление, просторный блок с доказательствами, порядок действий и готовая передача результата
в крупном оформлении Monument.
:::
:::card{title="Движение и глубина" href="examples/motion-showcase/index.html"}
Прогресс прокрутки, появление элементов, каскад, глубина и наклон. Если в системе отключена анимация,
страница сохраняет содержание и порядок чтения.
:::
:::card{title="Заготовка лендинга" href="examples/landing/index.html"}
Сфокусированный продуктовый рассказ с ясными действиями, переносимым доказательством и явной границей.
:::
::::

::::actions{placement="inline"}
::action[Открыть полный визуальный каталог]{href="examples/visual-catalog/index.html" kind="primary"}
::action[Открыть каталог взаимодействий]{href="examples/interactive-catalog/index.html" kind="secondary"}
::::
::::::

::::::section{title="Три шага от пустой папки до готовой страницы." id="workflow" nav="Собрать страницу" recipe="story"}
![Локальная страница инцидента для прямой передачи в браузере](assets/incident-review.png)

:::steps{title="Основной путь автора"}

1. Создайте заготовку, которая ближе всего к задаче читателя.
2. Замените примерный Markdown и добавьте ограниченные локальные ресурсы, если они несут смысл.
3. Соберите страницу и откройте настоящий артефакт через `file://`.
   :::

```sh
npx --yes agentic-report init ./my-page --starter research --json
npx --yes agentic-report build ./my-page --output ./my-page.html --json
```

:::callout{kind="info" title="Расширенная диагностика остаётся необязательной"}
`build` проверяет исходник перед записью. Команды `validate` и `inspect` нужны только для точечной
диагностики; обычный путь не требует отдельного шага проверки.
:::

::::actions{placement="inline"}
::action[Прочитать быстрый старт для агента]{href="docs/agent/index.md" kind="primary"}
::action[Открыть контракт исходника]{href="docs/product/source-contract.md" kind="secondary"}
::::
::::::

::::::section{title="Живые страницы для разных задач читателя." id="examples" nav="Изучить примеры" recipe="evidence"}
Люди, организации, инциденты, показатели и решения в примерах вымышлены. Каждая страница собирается
отдельно и содержит равнозначные тексты на русском и английском.

::::cards
:::card{title="Разбор инцидента" href="examples/incident-review/index.html"}
Динамика влияния, причинная схема, хронология реакции и ответственные действия.
:::
:::card{title="Выбор поставщика" href="examples/vendor-decision/index.html"}
Обязательные условия закупки, взвешенные данные, исключение из рейтинга и условное решение.
:::
:::card{title="Готовность запуска" href="examples/launch-readiness/index.html"}
Ценность для аудитории, активация, операционные условия и обратимый запуск.
:::
:::card{title="Архитектурное решение" href="examples/architecture/index.html"}
Граница доверия, альтернативы, схема, чек-лист ревью и порядок внедрения.
:::
:::card{title="Руководство по первой странице" href="examples/tutorial/index.html"}
Практическая сборка с вкладками, постепенным раскрытием и ограниченным учебным контролом.
:::
:::card{title="Атлас визуализаций" href="examples/visualization-catalog/index.html"}
Графики, поток, последовательность и хронология из проверяемых директив.
:::
:::card{title="Краткий отчёт для руководителя" href="examples/executive-brief/index.html"}
Оформление Monument для решения, построенного вокруг доказательств и дальнейших действий.
:::
:::card{title="Демонстрация движения" href="examples/motion-showcase/index.html"}
Наглядный обзор визуальных эффектов, доступных через обычные декларативные роли.
:::
::::

[Отчёт](examples/basic/report.ru.md) · [Исследование](examples/research/report.ru.md) ·
[Архитектура](examples/architecture/report.ru.md) · [Руководство](examples/tutorial/report.ru.md) ·
[Панель](examples/dashboard/report.ru.md) · [Лендинг](examples/landing/report.ru.md) ·
[Визуальный каталог](examples/visual-catalog/report.ru.md) · [Взаимодействия](examples/interactive-catalog/report.ru.md) ·
[Визуализации](examples/visualization-catalog/report.ru.md) · [Terminal](examples/terminal-portfolio/report.ru.md) ·
[Cinematic](examples/cinematic-story/report.ru.md) · [Краткий отчёт](examples/executive-brief/report.ru.md) ·
[Движение](examples/motion-showcase/report.ru.md) · [Инцидент](examples/incident-review/report.ru.md) ·
[Выбор поставщика](examples/vendor-decision/report.ru.md) · [Готовность запуска](examples/launch-readiness/report.ru.md)
::::::

::::::section{title="Комментируйте там, где возник вопрос." id="review" nav="Ревью на месте" recipe="evidence" interaction="depth"}
![Локальная передача на ревью с доказательствами и подсвеченным обсуждением](assets/incident-review.png)

Выделите подходящий текст на обычной странице и выберите **Создать заметку**. Диапазон останется
подсвеченным, а всплывающая панель покажет ветку, ответ, изменение, закрытие, повторное открытие и действие
**Посмотреть обсуждение**. Страница не переходит в режим ревью и не сдвигается ради боковой панели.

:::callout{kind="success" title="Попробуйте здесь"}
Выделите несколько слов в этом предложении. Контекстная панель останется рядом, а компактная кнопка
**Ревью** в верхней строке откроет список и экспорт заметок.
:::

::::actions{placement="inline"}
::action[Открыть пространство Review]{href="examples/review-workspace/index.html" kind="primary"}
::action[Открыть структурированный Response]{href="examples/response-workspace/index.html" kind="secondary"}
::::

[Русский исходник Review](examples/review-workspace/report.ru.md) ·
[Пример прежнего ревью](examples/review-workspace/prior-review.json)
::::::

::::::section{title="Качество заложено в пакет." id="reasons" nav="Почему это работает" recipe="metrics"}
::::cards
:::card{title="Сильные настройки по умолчанию"}
По умолчанию выбран Material: с ним удобно читать длинный текст. Monument, Signal, Terminal и Cinematic
отличаются композицией, типографикой, поверхностями, медиа и характером движения.
:::
:::card{title="Небольшой публичный словарь"}
Автор выбирает заготовку, визуальное оформление и при необходимости рецепты разделов. Точные настройки доступны для
особых случаев, но для хорошего результата они не обязательны.
:::
:::card{title="Одна среда выполнения"}
Один файл и каталог используют общий семантический HTML, адаптивные правила, взаимодействия, локализацию и
состояния ревью.
:::
:::card{title="Узкая граница доверия"}
Источник принимает Markdown, метаданные в начале файла, ограниченные включения и локальные ресурсы. Необработанный HTML, удалённая
загрузка, исполняемые шаблоны и авторский браузерный код запрещены.
:::
::::
::::::

::::::section{title="Дайте агенту короткий путь." id="agent-skill" nav="Настроить агента" recipe="evidence"}

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Попросите подготовить интерактивное исследование, экскурсию по коду, пакет решения, руководство, панель или
лендинг. Канонический навык начинает с цикла создания, правки, сборки и открытия, а к расширенному синтаксису
обращается только по необходимости.

::::actions{placement="inline"}
::action[Прочитать точный навык]{href="skills/agentic-report/SKILL.md" kind="primary"}
::action[Открыть инструкции агента]{href="docs/agent/index.md" kind="secondary"}
::action[Посмотреть упакованные примеры]{href="examples/manifest.json" kind="quiet"}
::::
::::::

::::::section{title="Переносимость заложена в архитектуру. Граница остаётся явной." id="boundaries" nav="Понять границы" recipe="story"}
В формат входят декларативные локальные источники, адаптивные компоновки, локальные медиа, взаимодействия
пакета, локализация, Review и Response, один HTML и каталог с адресуемыми ресурсами.

За границей формата остаются удалённая загрузка, raw HTML, исполняемые шаблоны, произвольные плагины,
авторские скрипты, облачная совместная работа, печать и режим без JavaScript.

::::actions{placement="bottom"}
::action[Собрать первую страницу]{href="docs/index.html" kind="primary" effect="magnetic"}
::action[Изучить все живые примеры]{href="#examples" kind="secondary"}
::action[Открыть репозиторий]{href="https://github.com/witqq/agentic-report" kind="quiet"}
::::

[Английский исходник](source/landing/report.md) · [Русский исходник](source/landing/report.ru.md) ·
[Манифест публичных маршрутов](website/routes.json) · [Идентификатор выпуска](release.json)
::::::
