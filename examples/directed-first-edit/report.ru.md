---
title: Первая правка создаёт локальное значение
language: ru
---

# Первая правка создаёт локальное значение

**Условный пример.** Значения и псевдокод объясняют механизм; они не подтверждают поведение работающего продукта.

[Исходник на английском](report.md) · [Исходник на русском](report.ru.md)

::::composition{id="first-edit" title="Сохранить свечение. Изменить тень." kind="diagram-code"}
:::object{id="layout" title="Исходное значение в макете" role="source"}
**Свечение + тень**
:::
:::object{id="shape" title="Изменённое значение в фигуре" role="result"}
Наследуется из макета
:::
:::object{id="command" title="Условный пример команды" role="code"}

```ts
const local = expand(inherited);
const next = patch(local, { shadow: newShadow });
shape.effects = next;
```

:::
::cue{at="b1" action="reveal" target="layout"}
::cue{at="b1+0.2" action="connect" target="layout" to="shape" value="наследует"}
::cue{at="b2" action="copy" target="layout" to="shape" duration="0.8"}
::cue{at="b2+0.8" action="focus" target="command" lines="1"}
::cue{at="b3" action="replace" target="shape" value="Свечение + новая тень"}
::cue{at="b3" action="focus" target="command" lines="2-3"}
::cue{at="b4" action="compare" target="layout" to="shape"}
::::
