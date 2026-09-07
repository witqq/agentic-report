---
title: Architecture decision record
description: A long-form document layout with durable navigation and evidence.
language: en
localizations:
  ru: report.ru.md
theme: system
layout: document
tokens:
  density: comfortable
  font: serif
  accent: indigo
  width: narrow
  radius: soft
---

# Architecture decision record

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

A focused reading surface for a decision, its evidence, and the path from constraints to rollout.

::::::section{title="Decision context" id="context" nav="Context" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="compact" type="display" media="mask" media-fit="cover" media-aspect="cinematic" surface="mesh" transition="stagger" choreography="cascade"}
:::callout{kind="info" title="Decision status"}
Accepted for the next implementation unit after local validation.
:::

The product turns declarative Markdown into a portable interactive browser page. Authors provide meaning;
the package owns layout, tokens, navigation, and focus behavior.

![A layered page model](page-model.svg)
::::::

::::::section{title="Options and decision" id="options" nav="Options" width="wide" tone="soft" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress"}

| Option                   | Portability | Author effort | Runtime |
| ------------------------ | ----------: | ------------: | ------- |
| Package-owned page model |        High |           Low | Bounded |
| Hand-built application   |    Variable |          High | Custom  |
| Hosted editor            | Low offline |        Medium | Remote  |

:::decision{title="Use one registry-owned page model"}
Keep layout and visual choices as validated values. Do not expose arbitrary CSS or component code.
:::
::::::

::::::section{title="Implementation and verification" id="implementation" nav="Implementation" width="wide" tone="accent" composition="story" viewport="adaptive" section-density="editorial" type="editorial" surface="grain" transition="stagger" interaction="depth"}

```yaml
layout: document
theme: system
tokens:
  font: serif
  width: narrow
```

:::steps{title="Adoption path"}

1. Select a layout and theme.
2. Add semantic content blocks.
3. Build the artifact and open it; use `validate` or `inspect` only for focused diagnostics.
   :::

## Verification

The page remains readable on a narrow viewport, the contents drawer is keyboard reachable, and wide tables
scroll inside the reading surface instead of breaking the page.
::::::
