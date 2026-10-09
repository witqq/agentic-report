---
title: Ссылка на тему и цвет для отрисовки
language: ru
---

# Ссылка на тему и цвет для отрисовки

**Условный пример.** Значения и псевдокод объясняют механизм; они не подтверждают поведение работающего продукта.

[Исходник на английском](report.md) · [Исходник на русском](report.ru.md)

::::composition{id="theme-color" title="Один источник. Два результата." kind="before-after"}
:::object{id="source" title="Сохранённый рецепт" role="source"}
**scheme(accent1)**
Цвет следует палитре.
:::
:::object{id="reading" title="Разрешить для отрисовки" role="result"}
Текущий цвет
:::
:::object{id="editing" title="Развернуть для редактирования" role="result"}
Семантический цвет
:::
::cue{at="b1" action="reveal" target="source"}
::cue{at="b2" action="connect" target="source" to="reading" value="resolve"}
::cue{at="b2+0.5" action="replace" target="reading" value="RGB(65, 105, 225)"}
::cue{at="b3" action="connect" target="source" to="editing" value="expand"}
::cue{at="b3+0.5" action="replace" target="editing" value="scheme(accent1)"}
::cue{at="b4" action="compare" target="reading" to="editing"}
::::
