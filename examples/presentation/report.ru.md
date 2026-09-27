---
contractVersion: 1
title: Страница, которая показывает себя сама
description: Короткое вымышленное демо продукта слайдами — с шагами, схемой, цифрой и вопросом к залу.
language: ru
---

# Страница, которая показывает себя сама

**Вымышленный пример.** Пятиминутное демо продукта для командного обзора; замените утверждения своими.

::::section{title="Проблема" id="problem"}
Отчёты доходят до людей файлами, которые никто не открывает.

:::appear

- Вывод — на девятой странице.
  :::

:::appear

- Графику нужна исходная таблица.
  :::

:::appear{effect="fade"}

- Ответить внутри документа нельзя.
  :::

:::notes
После третьего пункта спросить, кто открывал последний полученный отчёт.
:::
::::

::::section{title="Как это работает" id="flow" slide-transition="push"}
:::diagram{title="От исходника к слайдам" description="Исходник на Markdown становится проверенными слайдами за одну сборку." layout="right"}
::node{id="source" label="Markdown"}
::node{id="build" label="Сборка" kind="accent"}
::node{id="slides" label="Слайды"}
::edge{from="source" to="build" label="проверки"}
::edge{from="build" to="slides" label="один файл" kind="data"}
::legend-item{node="accent" label="Шаг проверки"}
:::

:::notes
Тот же исходник собирается и документом; меняется только компоновка.
:::
::::

::::section{title="Посмотрите, как это собирается" id="clip"}
::video{src="assets/demo.h264.mp4" sources="assets/demo.av1.mp4, assets/demo.vp9.webm" poster="assets/demo.poster.jpg" chapters="assets/demo.chapters.vtt" caption="Короткий немой ролик, снятый agentic-screencast по сценарию из трёх сцен об этой странице."}
::::

::::section{title="12 слайдов, один файл" id="figure" recipe="statement" slide-transition="zoom"}
Каждый слайд, изображение и схема находятся в одном HTML-файле, который открывается с диска.
::::

:::::section{title="Как это выглядит в исходнике" id="source" slide-transition="wipe"}

```md
::::section{title="Проблема"}
:::appear

- Вывод — на девятой странице.
  :::
  ::::
```

:::appear{effect="pop"}
Каждый блок `appear` — один щелчок.
:::
:::::

::::section{title="Ваш ход" id="question"}
:::::response{title="Вопрос к залу" id="room-check"}
::::question{id="use" kind="single" title="Где бы вы показали отчёт слайдами?"}
::option{id="review" label="Обзор в команде"}
::option{id="demo" label="Демо клиенту"}
::option{id="lesson" label="Урок для новичков"}
::::
:::::
::::
