---
title: The first edit makes the value local
language: en
localizations:
  ru: report.ru.md
theme: blueprint
scheme: light
layout: dashboard
motion: expressive
topbar: false
---

# The first edit makes the value local

**Fictional sample.** Values and pseudocode illustrate the mechanism; they are not evidence from a running product.

[English source](report.md) · [Russian source](report.ru.md)

::::composition{id="first-edit" title="Keep the glow. Change the shadow." kind="diagram-code"}
:::object{id="layout" title="Layout owns the original" role="source"}
**Glow + shadow**
:::
:::object{id="shape" title="Shape owns the edited value" role="result"}
Inherited from the layout
:::
:::object{id="command" title="Illustrative command" role="code"}

```ts
const local = expand(inherited);
const next = patch(local, { shadow: newShadow });
shape.effects = next;
```

:::
::cue{at="b1" action="reveal" target="layout"}
::cue{at="b1+0.2" action="connect" target="layout" to="shape" value="inherits"}
::cue{at="b2" action="copy" target="layout" to="shape" duration="0.8"}
::cue{at="b2+0.8" action="focus" target="command" lines="1"}
::cue{at="b3" action="replace" target="shape" value="Glow + new shadow"}
::cue{at="b3" action="focus" target="command" lines="2-3"}
::cue{at="b4" action="compare" target="layout" to="shape"}
::::
