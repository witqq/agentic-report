---
title: Tutorial registry corpus
description: Bounded tutorial contract coverage.
language: en
scheme: system
---

# Tutorial registry corpus

Corpus class: tutorial

Inspect :source-link{label="src/render/directives.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42"}.

:::steps{title="Build locally"}

1. Write Markdown.
2. Run the CLI.
3. Open the artifact.
   :::

```ts
const portable: boolean = true;
```

:::demo{title="Bounded counter" start="2" step="3"}
The authored content remains useful without executing author code.
:::

::::::composition{id="directed" title="A value beside code" kind="diagram-code" layout="column" align="stretch"}
:::::scene-group{id="owners" title="Stable owners" layout="row" align="start"}
::::object{id="original" title="Original" role="source"}
:::slot{id="value" title="Original value"}
1
:::
::::
::::object{id="result" title="Result" role="result"}
:::slot{id="value" title="Local value"}
Waiting.
:::
::::
:::::
:::object{id="source" title="Source" role="code" notes="beside" lineStart="41"}

```ts
const value = 1;
consume(value);
```

:::
::cue{at="b1" action="focus" target="source" lines="1-2" emphasis="brackets" duration="0.6"}
::cue{at="b2" action="connect" target="source" to="result" relation="data" value="data"}
::cue{at="b2" until="b2.end" action="annotate" target="source" lines="2" to="result" value="Consume the copied value."}
::cue{at="b2" action="copy" target="original" slot="value" to="result" toSlot="value"}
::cue{at="b3" action="trace" target="source" to="result" effect="beam"}
::::::
