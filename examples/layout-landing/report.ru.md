---
title: Страницы, которые агенты могут завершить
description: Выразительный лендинг без JSX, собственного CSS и авторского JavaScript.
language: ru
---

# Страницы, которые агенты могут завершить

**Вымышленный пример.** Все показатели, статусы, организации и решения на этой странице нужны только для
демонстрации движка отчётов; перед использованием замените их проверенными данными проекта.

Пишите Markdown, выбирайте форму страницы и собирайте качественный офлайн-артефакт, не создавая ещё одно
фронтенд-приложение вручную.

::::::section{title="Единый декларативный путь" id="value" nav="Ценность" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="mesh" transition="stagger" choreography="cascade"}

::::cards
:::card{title="Начните со смысла"}
Используйте заголовки, решения, карточки, шаги, таблицы, код, изображения и вложения.
:::
:::card{title="Сохраняйте малую границу"}
Темы, компоновки и компактные токены — проверяемые данные, а не CSS или функции обратного вызова.
:::
:::card{title="Поделитесь результатом"}
Откройте один самодостаточный файл прямо в браузере или выберите каталог с хешированными ресурсами.
:::
::::
::::::

::::::section{title="Для реального рабочего цикла" id="proof" nav="Доказательство" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress"}

:::decision{title="Создать → изменить → собрать → открыть"}
Одна сборка проверяет исходник и создаёт артефакт для просмотра. Отдельная диагностика нужна только тогда,
когда ошибку исходника требуется разобрать подробнее.
:::
::::::

::::::section{title="Создайте первую страницу" id="start" nav="Начать" width="wide" align="center" tone="accent" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="glow" transition="stagger"}

```sh
agentic-report init ./my-page
agentic-report build ./my-page --output ./my-page.html
```

:::callout{kind="success" title="Сервер не требуется"}
Созданная страница открывается через `file://`, использует взаимодействия из пакета и локальные ресурсы.
:::
::::::
