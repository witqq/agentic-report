---
contractVersion: 1
title: agentic-report — декларативные интерактивные страницы для передачи результатов агента
description: Превратите декларативный Markdown в готовую интерактивную страницу, которую агент передаст человеку.
language: ru
---

# Дайте агенту страницу, которую не стыдно передать.

**Визуальные истории, доказательства и ревью из декларативного Markdown.**

Установите один навык. Агент разработки сможет превращать исследования, экскурсии по коду, решения,
инциденты и статусы в выразительную интерактивную страницу. Всё компилируется локально: без отдельного
фронтенд-проекта, облачного редактора и авторского JavaScript.

::::actions{placement="edge"}
::action[Установить навык агента]{href="#agent-skill" kind="primary" effect="magnetic"}
::action[Открыть живые примеры]{href="#examples" kind="secondary"}
::action[Прочитать инструкции агента]{href="docs/agent/index.md" kind="quiet"}
::::

![Вымышленная страница запуска региональной беты из публичного декларативного исходника](assets/launch-readiness.png)

_Вымышленный пример · собран agentic-report из исходника репозитория._

::::cards
:::card{title="По умолчанию один HTML"}
Каталог с адресацией ресурсов по содержимому нужен только для большой страницы.
:::
:::card{title="Интерактивность через file://"}
Среда выполнения из пакета входит в артефакт и оживляет обычный результат.
:::
:::card{title="Без авторских JSX, JS и CSS"}
Авторы используют Markdown, frontmatter, ограниченные части и локальные ресурсы.
:::
::::

::::::::section{title="Один исходник становится целым впечатлением." id="proof" nav="Доказательство" width="wide" align="start" tone="soft" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="mesh" transition="stagger" scene="progress" choreography="cascade"}
:::lead
Исходник, визуальная иерархия, движение и ревью проходят через один публичный декларативный контракт. Эта
страница не макет, и у неё нет отдельного рендерера для лендинга.
:::

:::::::cards
::::::card{title="Декларативный исходник"}

```markdown
:::::section{title="Данные активации" composition="split" viewport="bounded" section-density="editorial" type="display" surface="grid" transition="reveal" scene="progress" choreography="cascade"}
::::chart{type="line" title="Активированные пространства" description="Ограниченный тренд когорт."}
::::series{label="Активация"}
::point{label="Когорта 1" value="46"}
::point{label="Когорта 4" value="64"}
::::
::::
:::::
```

[Прочитать полный исходник запуска](examples/launch-readiness/report.ru.md)
::::::
::::::card{title="Собранный результат"}
![Страница решения о запуске с навигацией, доказательствами, графиками и хронологией](assets/launch-readiness.png)

Компилятор добавляет доступную навигацию, адаптивную композицию, локальные ресурсы, сдержанное движение и
пространство ревью.

[Открыть вымышленную страницу запуска](examples/launch-readiness/index.html)
::::::
:::::::

:::callout{kind="info" title="Публичный сайт использует обычный компилятор"}
Этот лендинг собирается из [канонического Markdown-исходника](source/landing/report.md). Один файл и каталог
используют общую модель страницы и среду выполнения. Публичная сборка записывает точный идентификатор в
[`release.json`](release.json): изменяемые страницы перепроверяются, а адресованные ресурсы могут быть
неизменными.
:::

```sh
npx --yes agentic-report build ./website/landing --output ./site/index.html --json
```

[Английский исходник](source/landing/report.md) · [Русский исходник](source/landing/report.ru.md) · [Идентификатор релиза](release.json)
::::::::

:::::section{title="Небольшой словарь создаёт большой визуальный диапазон." id="data-scene" nav="Визуальный язык" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress" choreography="cascade"}
:::lead
Автор выбирает смысловые роли. Пакет собирает их в адаптивные сцены, не открывая значения CSS или
исполняемые шаблоны.
:::

::::chart{type="bar" title="Закрытый визуальный словарь" description="Текущие возможности пакета для каждой совместимой страницы: шесть композиций, пять декоративных поверхностей, четыре расположения действий и два переносимых формата результата." x-label="Публичное семейство" y-label="Число вариантов"}
:::series{label="Варианты"}
::point{label="Композиции" value="6"}
::point{label="Поверхности" value="5"}
::point{label="Расположения действий" value="4"}
::point{label="Форматы результата" value="2"}
:::
::::

::::cards
:::card{title="Монументальный масштаб"}
Сцена, разделение, мозаика, история, стопка, сквозные медиа и ограниченный viewport осмысленно заполняют
широкие и высокие экраны.
:::
:::card{title="Материальные поверхности чтения"}
Редакционная типографика, тёплые пластины, маски, слои, галереи, зерно, сетка и свечение сохраняют читаемость.
:::
:::card{title="Сигналы и движение"}
Появление, каскад, сцены прокрутки, смысловая хореография, глубина, наклон и редкий магнитный призыв
ограничены, учитывают ввод и отключаются при reduced motion.
:::
::::
:::::

:::::section{title="Четыре настоящие страницы. Один публичный язык." id="examples" nav="Примеры" width="wide" align="start" tone="soft" composition="stage" viewport="full" section-density="immersive" type="display" media="gallery" media-fit="cover" media-aspect="landscape" surface="glow" transition="stagger" choreography="cascade"}
Каждый пример — отдельно собранная двуязычная страница. Все организации, люди, события, показатели и решения
вымышлены.

::::cards
:::card{title="Разбор инцидента P1 в OrbitDesk"}
![Вымышленный разбор инцидента с влиянием и причинными данными](assets/incident-review.png)

Проследите кривую отказов, причинную схему, вкладки данных, хронологию и реестр ответственных действий.

[Открыть живой пример](examples/incident-review/index.html) · [Английский исходник](examples/incident-review/report.md) · [Русский исходник](examples/incident-review/report.ru.md)
:::
:::card{title="Решение по поставщику ИИ-поддержки"}
![Вымышленное решение по поставщику с обязательными условиями и взвешенными данными](assets/vendor-decision.png)

Отделите обязательные условия закупки от предпочтений и изучите исключение из рейтинга.

[Открыть живой пример](examples/vendor-decision/index.html) · [Английский исходник](examples/vendor-decision/report.md) · [Русский исходник](examples/vendor-decision/report.ru.md)
:::
:::card{title="Готовность региональной беты"}
![Вымышленный обзор запуска с ценностью для аудитории и данными активации](assets/launch-readiness.png)

Оцените ограниченную бету по активации, удержанию, операционным условиям и обратимому развёртыванию.

[Открыть живой пример](examples/launch-readiness/index.html) · [Английский исходник](examples/launch-readiness/report.md) · [Русский исходник](examples/launch-readiness/report.ru.md)
:::
::::
:::::

:::::section{title="От пустого каталога до визуальной истории для ревью." id="workflow" nav="Процесс" width="wide" align="start" tone="accent" composition="story" viewport="bounded" section-density="editorial" type="editorial" media="mask" media-fit="cover" media-aspect="landscape" focal="left" surface="grain" transition="reveal" interaction="depth"}
![Вымышленная страница инцидента как локальная передача для ревью](assets/incident-review.png)

:::steps{title="Первый полезный результат"}

1. Создайте проект: `npx --yes agentic-report init ./my-page --starter landing --json`.
2. Замените примерные доказательства и добавляйте только ограниченные части или локальные ресурсы.
3. Запустите `validate` и `inspect`; исправьте все нарушения исходника.
4. Соберите один HTML или каталог с адресуемыми ресурсами и откройте его через `file://`.
   :::

:::callout{kind="info" title="Диагностика для агента"}
Все зарегистрированные команды CLI обнаруживаются машинно. Исполняемые команды по умолчанию возвращают NDJSON, справочные —
компактный JSON. Только `fix` изменяет Markdown и только по точно вычисленным диапазонам. Нужен Node.js 24.18.0
или новее.
:::

::::actions{placement="inline"}
::action[Открыть быстрый старт]{href="docs/agent/index.md" kind="primary"}
::action[Изучить контракт исходника]{href="docs/product/source-contract.md" kind="secondary"}
::::
:::::

:::::section{title="Комментируйте именно там, где возник вопрос." id="review" nav="Ревью" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="compact" type="display" surface="glow" transition="reveal"}
Выделите подходящий текст на обычной странице и выберите **Создать заметку**. Точный диапазон останется
подсвеченным; привязанная ветка поддерживает ответ, изменение, закрытие, повторное открытие и **Посмотреть
обсуждение**, не сдвигая отчёт. Кнопка **Ревью** в верхней панели открывает только список-оверлей, импорт и
единый канонический экспорт всех веток.

:::callout{kind="success" title="Попробуйте на этом предложении"}
Выделите любые слова в этой плашке. Специальных блоков и отдельного режима ревью нет: целью становится само
выделение.
:::

:::callout{kind="info" title="Когда комментариев недостаточно"}
Response Workspace собирает ограниченную сортировку, варианты, оценки, порядок и свободный текст в локальный
`response.json`. [Попробуйте двуязычную форму](examples/response-workspace/index.html) или прочитайте её
[английский](examples/response-workspace/report.md) и [русский](examples/response-workspace/report.ru.md) исходники.
:::

::::actions{placement="inline"}
::action[Попробовать пространство ревью]{href="examples/review-workspace/index.html" kind="primary"}
::action[Прочитать его русский исходник]{href="examples/review-workspace/report.ru.md" kind="secondary"}
::action[Изучить прежнюю передачу]{href="examples/review-workspace/prior-review.json" kind="quiet"}
::::
:::::

:::::section{title="Дайте агенту полный инструмент, а не снимок." id="agent-skill" nav="Навык агента" width="wide" align="start" tone="soft" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grid" transition="stagger" choreography="cascade"}
::::cards
:::card{title="Установите готовый навык"}

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Попросите интерактивную экскурсию по коду, сравнение поставщиков или передачу по инциденту. Навык решает,
когда страница полезнее чата, и возвращает готовый локальный артефакт.

[Прочитать точный навык](skills/agentic-report/SKILL.md)
:::
:::card{title="Выберите правильную форму страницы"}
Шесть заготовок покрывают отчёт, исследование, архитектуру, учебный материал, панель и лендинг. Решения и ревью
используют те же примитивы вместо параллельных шаблонов.

[Открыть заготовку лендинга](source/starter/landing/report.md) · [Посмотреть манифест примеров](examples/manifest.json)
:::
:::card{title="Сохраняйте малую границу доверия"}
Входит: декларативный локальный исходник, взаимодействия из пакета, один файл и каталог. Не входит: удалённая
загрузка, raw HTML, авторские скрипты, облачная совместная работа, печать и disabled-JavaScript parity.

[Архитектура](docs/ARCHITECTURE.md) · [Контракт тестирования](docs/TESTING.md) · [Требования продукта](PRODUCT-REQUIREMENTS.md)
:::
:::card{title="Документация для двух читателей"}
Люди получают руководство по задачам; агенты — прямой Markdown, сгенерированные схемы и закрытый контракт.

[Руководство](docs/index.html) · [Руководство агента](docs/agent/index.md) · [Справочник агента](docs/AGENT-REFERENCE.md) · [Шаблон расширения](docs/generated/extension-proposal.template.json) · [Манифест маршрутов](website/routes.json) · [llms.txt](llms.txt)
:::
::::
:::::

:::::section{title="Соберите страницу, которую агент должен передать." id="start" nav="Начать" width="wide" align="center" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="mesh" transition="stagger"}
Используйте Node.js 24.18.0 или новее. Первый запуск без установки получает пакет из npm; компиляция и
созданная страница затем работают локально.

```sh
npx --yes agentic-report init ./my-page --starter landing --json
```

::::actions{placement="bottom"}
::action[Прочитать быстрый старт]{href="docs/index.html" kind="primary" effect="magnetic"}
::action[Изучить примеры]{href="#examples" kind="secondary"}
::action[Открыть репозиторий]{href="https://github.com/witqq/agentic-report" kind="quiet"}
::::

Для создания локального артефакта не нужны регистрация, облачный проект или обещание телеметрии.
:::::
