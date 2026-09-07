---
contractVersion: 1
title: Атлас продуктовых сигналов
description: Декларативные визуализации, собранные в доступные офлайн-примитивы страницы.
language: ru
---

# Атлас продуктовых сигналов

**Вымышленный пример.** Все показатели, статусы, организации и решения на этой странице нужны только для
демонстрации движка отчётов; перед использованием замените их проверенными данными проекта.

Каждая визуализация ниже описана ограниченными директивами Markdown. Компилятор проверяет данные и создаёт
детерминированный SVG или семантический HTML; при визуализации страница не обращается к сети.

::::::section{title="Сигнал внедрения" id="adoption" nav="Внедрение" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" scene="progress" choreography="cascade"}

:::::chart{type="bar" title="Еженедельно активные агенты" description="Число активных агентов росло четыре еженедельных релиза, а после второй недели лидировала группа с поддержкой." x-label="Неделя релиза" y-label="Активные агенты"}
::::series{label="С поддержкой"}
::point{label="Н1" value="42"}
::point{label="Н2" value="68"}
::point{label="Н3" value="91"}
::point{label="Н4" value="128"}
::::
::::series{label="Базовая"}
::point{label="Н1" value="38"}
::point{label="Н2" value="51"}
::point{label="Н3" value="63"}
::point{label="Н4" value="74"}
::::
:::::
::::::

::::::section{title="Тренд качества" id="quality" nav="Качество" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress"}

::::chart{type="line" title="Успешные первые сборки" description="Доля агентов, успешно завершивших первую сборку, росла на протяжении измеряемых релизов." x-label="Неделя релиза" y-label="Процент"}
:::series{label="Доля успеха"}
::point{label="Н1" value="61.5"}
::point{label="Н2" value="70"}
::point{label="Н3" value="82.5"}
::point{label="Н4" value="91"}
:::
::::
::::::

::::::section{title="Состав работ" id="mix" nav="Состав" width="wide" tone="plain" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grain" transition="stagger" choreography="cascade"}

::::chart{type="pie" title="Состав созданных страниц" description="Отчёты — крупнейшая категория, затем идут учебные материалы, панели и лендинги."}
:::series{label="Страницы"}
::point{label="Отчёты" value="46"}
::point{label="Учебные материалы" value="24"}
::point{label="Панели" value="18"}
::point{label="Лендинги" value="12"}
:::
::::
::::::

::::::section{title="Поток компиляции" id="flow" nav="Поток" width="wide" tone="accent" composition="story" viewport="bounded" section-density="immersive" type="display" surface="glow" transition="reveal" interaction="depth"}

:::diagram{title="Поток офлайн-компиляции" description="Пятнадцать участников в подсистемах авторинга, компиляции и артефакта." type="flow"}
::group{id="authoring" label="Граф авторинга"}
::group{id="compiler" label="Конвейер компилятора"}
::group{id="artifact" label="Переносимый артефакт"}
::node{id="source" label="Декларативный исходник" group="authoring" kind="accent"}
::node{id="partials" label="Части Markdown" group="authoring"}
::node{id="assets" label="Локальные ресурсы" group="authoring"}
::node{id="manifest" label="Метаданные манифеста" group="authoring"}
::node{id="review" label="Файл ревью" group="authoring"}
::node{id="validate" label="Проверка данных" group="compiler"}
::node{id="confine" label="Ограничение ресурсов" group="compiler"}
::node{id="highlight" label="Подсветка кода" group="compiler"}
::node{id="render" label="Компиляция графики" group="compiler" kind="success"}
::node{id="serialize" label="Сериализация результата" group="compiler"}
::node{id="html" label="Семантический HTML" group="artifact"}
::node{id="styles" label="Стили пакета" group="artifact"}
::node{id="runtime" label="Среда читателя" group="artifact"}
::node{id="targets" label="Цели ревью" group="artifact"}
::node{id="portable" label="Переносимый артефакт" group="artifact" kind="accent"}
::edge{from="source" to="validate" label="разобрать"}
::edge{from="partials" to="validate" label="раскрыть"}
::edge{from="assets" to="confine" label="разрешить"}
::edge{from="manifest" to="validate" label="нормализовать"}
::edge{from="review" to="targets" label="привязать"}
::edge{from="validate" to="confine" label="типизированный граф"}
::edge{from="confine" to="highlight" label="безопасный исходник"}
::edge{from="highlight" to="render" label="стилизованный HAST"}
::edge{from="render" to="serialize" label="семантическое дерево"}
::edge{from="serialize" to="html" label="документ"}
::edge{from="serialize" to="styles" label="тема"}
::edge{from="serialize" to="runtime" label="поведение"}
::edge{from="serialize" to="targets" label="происхождение"}
::edge{from="html" to="portable" label="собрать"}
::edge{from="styles" to="portable" label="упаковать"}
::edge{from="runtime" to="portable" label="взаимодействовать"}
::edge{from="targets" to="portable" label="ревью"}
:::

## Последовательность запроса компиляции

:::diagram{title="Последовательность запроса компиляции" description="Одна офлайн-сборка проходит четырёх участников в заданном автором порядке сообщений." type="sequence"}
::node{id="agent" label="Агент-автор"}
::node{id="loader" label="Загрузчик исходника"}
::node{id="compiler" label="Компилятор"}
::node{id="browser" label="Браузер"}
::edge{from="agent" to="loader" label="загрузить исходник"}
::edge{from="loader" to="compiler" label="проверенный граф"}
::edge{from="compiler" to="browser" label="записать артефакт"}
::edge{from="browser" to="agent" label="результат ревью"}
:::
::::::

::::::section{title="Путь поставки" id="delivery" nav="Поставка" width="wide" tone="contrast" composition="stack" viewport="bounded" section-density="editorial" type="display" surface="mesh" transition="stagger" choreography="cascade"}

::::timeline{title="Путь релиза" description="Четыре этапа переводят продукт от данных к локально проверенному кандидату на релиз."}
:::event{date="Исследование" title="Изучить каталог" kind="neutral"}
Агент читает контракт исходника, полученный из реестра, и выбирает поддерживаемые примитивы.
:::
:::event{date="Авторинг" title="Записать компактные данные" kind="accent"}
Графики, узлы, рёбра и события остаются обычными атрибутами директив и Markdown.
:::
:::event{date="Сборка" title="Скомпилировать офлайн" kind="success"}
Одна проверяемая модель создаёт результат в одном файле или каталоге.
:::
:::event{date="Проверка" title="Открыть через file://" kind="warning"}
Проверки на компьютере и телефоне изучают настоящий созданный артефакт без сервера.
:::
::::
::::::
