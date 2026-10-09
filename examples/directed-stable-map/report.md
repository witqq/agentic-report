---
title: Stable owners and independent example values
language: en
layout: dashboard
theme: midnight
scheme: dark
motion: expressive
topbar: false
---

# Stable owners and independent values

**Fictional sample.** The owner names and values are illustrative. The displayed address helper is real code; this scene does not demonstrate copying a product model.

[View Markdown source](report.md).

::::::composition{id="stable-map" title="The operation changes a value, not its owner's responsibility" kind="ownership" layout="column"}
:::::scene-group{id="owners" title="Two independent owners" layout="row" align="stretch"}
::::object{id="original" title="Original owner"}
Keeps the original value throughout the edit.
:::slot{id="value" title="Illustrative value"}
Glow + shadow
:::
::::
::::object{id="local" title="Local owner"}
Owns an independent value after copying.
:::slot{id="value" title="Illustrative value"}
Waiting
:::
::::
:::::
:::object{id="address" title="src/composition.ts · compositionAddress" role="code"}

```ts
export function compositionAddress(object: string, slot?: string): string {
  return slot === undefined ? object : `${object}:${slot}`;
}
```

This real helper addresses a named value region; it does not perform a deep copy of a product model.
:::
::cue{at="b2" action="connect" target="original" to="local" value="independent value"}
::cue{at="b2" action="copy" target="original" slot="value" to="local" toSlot="value" duration="0.8"}
::cue{at="b3" action="replace" target="local" slot="value" value="Glow + new shadow"}
::cue{at="b4" action="compare" target="original" to="local"}
::::::
