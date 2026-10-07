---
title: A value change becomes an event
language: en
localizations:
  ru: report.ru.md
theme: neutral
scheme: light
layout: dashboard
motion: expressive
topbar: false
---

# A value change becomes an event

**Fictional sample.** Values and pseudocode illustrate the mechanism; they are not evidence from a running product.

[English source](report.md) · [Russian source](report.ru.md)

::::composition{id="change-event" title="Follow the value to its consumer." kind="ownership"}
:::object{id="model" title="Shape model" role="source"}
**Previous effects**
:::
:::object{id="queue" title="Microtask boundary" role="visual"}
Waiting for the change
:::
:::object{id="consumer" title="Visual-change consumer" role="result"}
Waiting for the event
:::
:::object{id="call" title="Illustrative call sequence" role="code"}

```ts
shape.effects = next;
queueMicrotask(fireVisualChange);
consumer.onVisualChange();
```

:::
::cue{at="b1" action="replace" target="model" value="Updated effects"}
::cue{at="b1" action="focus" target="call" lines="1"}
::cue{at="b2" action="connect" target="model" to="queue" value="schedule"}
::cue{at="b2+0.2" action="copy" target="model" to="queue"}
::cue{at="b3" action="transfer" target="queue" to="consumer"}
::cue{at="b3+0.6" action="focus" target="call" lines="2-3"}
::cue{at="b4" action="camera" target="consumer"}
::::
