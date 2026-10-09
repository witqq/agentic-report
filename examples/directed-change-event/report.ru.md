---
title: Изменение значения становится событием
language: ru
---

# Изменение значения становится событием

**Условный пример.** Значения и псевдокод объясняют механизм; они не подтверждают поведение работающего продукта.

[Исходник на английском](report.md) · [Исходник на русском](report.ru.md)

::::composition{id="change-event" title="Проследить значение до получателя." kind="ownership"}
:::object{id="model" title="Модель фигуры" role="source"}
**Прежние эффекты**
:::
:::object{id="queue" title="Граница микрозадачи" role="visual"}
Ожидает изменение
:::
:::object{id="consumer" title="Получатель изменения" role="result"}
Ожидает событие
:::
:::object{id="call" title="Условная последовательность вызовов" role="code"}

```ts
shape.effects = next;
queueMicrotask(fireVisualChange);
consumer.onVisualChange();
```

:::
::cue{at="b1" action="replace" target="model" value="Обновлённые эффекты"}
::cue{at="b1" action="focus" target="call" lines="1"}
::cue{at="b2" action="connect" target="model" to="queue" value="запланировать"}
::cue{at="b2+0.2" action="copy" target="model" to="queue"}
::cue{at="b3" action="transfer" target="queue" to="consumer"}
::cue{at="b3+0.6" action="focus" target="call" lines="2-3"}
::cue{at="b4" action="camera" target="consumer"}
::::
