---
title: Real functions with directed presentation notes
language: en
layout: dashboard
theme: midnight
scheme: dark
motion: expressive
topbar: false
attribution: false
---

:::::composition{id="address" title="An owner and its named value form one address" kind="diagram-code" layout="auto"}
::::scene-group{id="values" title="Illustrative input and actual function result" layout="row" align="stretch"}
:::object{id="input" title="Input" role="source"}
object = local; slot = value
:::
:::object{id="result" title="Actual returned value" role="result"}
local:value
:::
::::
:::object{id="code" title="src/composition.ts:128 · compositionAddress" role="code" notes="beside" lineStart="128"}

```ts
export function compositionAddress(object: string, slot?: string): string {
  return slot === undefined ? object : `${object}:${slot}`;
}
```

:::
::cue{at="b1" action="connect" target="input" to="code" relation="call" value="arguments"}
::cue{at="b2" until="b2.end" action="annotate" target="code" lines="2" to="result" value="The returned address keeps the owner and value region together."}
::cue{at="b2" action="focus" target="code" lines="2" emphasis="brackets"}
::cue{at="b3" action="connect" target="code" to="result" relation="data" value="return value"}
::cue{at="b3" action="trace" target="code" to="result" effect="beam" duration="1"}
::cue{at="b3+1" action="focus" target="result" emphasis="halo"}
:::::

:::::composition{id="source-lines" title="An excerpt keeps the original source line numbers" kind="pipeline" layout="column"}
::::scene-group{id="values" title="Illustrative input and actual function result" layout="row" align="stretch"}
:::object{id="input" title="Input" role="source"}
relative lines = 2-4,7; excerpt starts at 41
:::
:::object{id="result" title="Actual returned value" role="result"}
L42–44, 47
:::
::::
:::object{id="code" title="src/composition.ts:116 · compositionLineLabel" role="code" notes="beside" lineStart="116"}

```ts
export function compositionLineLabel(lines: string, lineStart = 1): string {
  return `L${lines
    .split(',')
    .map((part) =>
      part
        .trim()
        .split('-')
        .map((n) => Number(n) + lineStart - 1)
        .join('–'),
    )
    .join(', ')}`;
}
```

:::
::cue{at="b1" action="connect" target="input" to="code" relation="call" value="arguments"}
::cue{at="b2" until="b2.end" action="annotate" target="code" lines="8" to="result" value="The source offset locates this operation in its original file."}
::cue{at="b2" action="focus" target="code" lines="8" emphasis="brackets"}
::cue{at="b3" action="connect" target="code" to="result" relation="data" value="return value"}
::cue{at="b3" action="trace" target="code" to="result" effect="beam" duration="1"}
::cue{at="b3+1" action="focus" target="result" emphasis="halo"}
:::::
