---
contractVersion: 1
title: Human review handoff
description: A local report prepared for selected-text notes and fragment discussion threads.
language: en
layout: document
theme: system
preset: studio
---

# Human review handoff

**Fictional sample.** Replace every metric and decision with evidence from the real review context.

Select **68% in the revised cohort**, choose **Create note**, and use the anchored popover to reply, edit,
resolve, or reopen without a mode. The range stays highlighted; hover, tap, or focus its marker for **View
thread**. A selection can cross adjacent targets. **Review** opens only the non-reflowing list, import, and one
local version-3 `review.json` export of every discussion.

The bundled `prior-review.json` remains a valid version-2 whole-block handoff. Its legacy thread stays
list-accessible after import, demonstrating backward-compatible binding without offering new block controls.

After editing this source, rebuild with `--review review.json` to display truthful prior bindings and complete
the next review round without a server or automatic Markdown rewriting.

:::section{title="Activation evidence" id="activation" nav="Activation" tone="soft"}
Activation reached **68%** in the revised cohort.

The evidence is ready for a reviewer to confirm or return for revision.
:::

:::section{title="Retention evidence" id="retention" nav="Retention"}
Activation reached **63%** in the observed cohort.

This repeated statement demonstrates that review threads remain attached to distinct source blocks.
:::

:::section{title="Proposed handoff" id="handoff" nav="Handoff" tone="accent"}
The reviewer can resolve a thread after accepting the agent's change or reopen it with another message.

The exported review is local, deterministic, and descriptive; it is not an authenticated signature.
:::

:::decision{title="Release path" id="release-path" required=true}
::decision-option{id="ship" label="Ship this candidate"}
::decision-option{id="hold" label="Hold for revision"}
:::

:::checklist{title="Release gates" id="release-gates"}
::check-item{id="owner" label="Accountable owner assigned" required=true}
::check-item{id="notes" label="Reviewer notes attached"}
:::
