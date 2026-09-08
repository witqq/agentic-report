---
contractVersion: 1
title: Release decision report
description: A decision-ready report that turns evidence into an accountable delivery path.
language: en
localizations:
  ru: report.ru.md
theme: system
layout: document
tokens:
  density: comfortable
  font: serif
  accent: indigo
  width: standard
  radius: soft
---

# Release decision report

**Fictional sample.** Every metric, status, organization, and decision on this page exists only to
demonstrate the report engine; replace it with verified project evidence before use.

This starter organizes a real review: the decision, the evidence behind it, the remaining risk, and the
next accountable steps. Replace the sample facts while keeping the semantic structure.

::::::section{title="Decision signal" id="signal" nav="Signal" recipe="hero" width="wide" tone="contrast" composition="stage" viewport="bounded" section-density="compact" type="display" surface="mesh" transition="stagger" choreography="cascade"}

:::callout{kind="success" title="Recommendation"}
Proceed with the local release candidate. The documented first-use journey is complete and no blocking
defect remains in the reviewed scope.
:::

{{include: partials/findings.md}}
::::::

::::::section{title="Evidence map" id="evidence" nav="Evidence" width="wide" tone="soft" composition="mosaic" viewport="bounded" section-density="editorial" type="editorial" media="natural" media-fit="cover" media-aspect="landscape" surface="grain" transition="reveal"}

![Evidence moving from source through verification to a release decision](assets/architecture.svg)

::asset[Download the evidence map]{src="assets/architecture.svg"}

::::cards
:::card{title="Scope" href="#evidence"}
The candidate includes the declarative authoring loop, static output, and package-owned interactions.
:::
:::card{title="Confidence"}
Focused unit, browser, and installed-package journeys cover the public path.
:::
:::card{title="Boundary"}
Publication and deployment remain separate external actions.
:::
::::
::::::

::::::section{title="Decision and review" id="decision" nav="Decision" width="wide" tone="plain" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="stagger" choreography="cascade"}

:::decision{title="Accept the candidate for release preparation"}
The evidence supports advancing. Any new blocking observation reopens this decision with a reproducible
failure, owner, and next check.
:::

::::timeline{title="Evidence trail" description="Four accountable phases turn declarative source into a reviewed release decision."}
:::event{date="Author" title="State the decision" kind="neutral"}
Record the audience, scope, and success criteria in ordinary Markdown.
:::
:::event{date="Edit" title="Replace the sample" kind="accent"}
Keep the structure and replace every demonstration claim with observed evidence.
:::
:::event{date="Build" title="Create the artifact" kind="success"}
Generate the portable page in the selected output format.
:::
:::event{date="Open" title="Review the result" kind="warning"}
Open the built file and record the decision against observed evidence.
:::
::::

## Review detail

:::disclosure{title="Open the residual-risk register" open="false"}

- Large embedded assets can exceed the configured warning threshold.
- External publication still requires an explicit release action.
- New requirements need their own evidence before they enter this decision.
  :::
  ::::::

::::::section{title="Next actions" id="actions" nav="Actions" width="wide" tone="accent" composition="stack" viewport="adaptive" section-density="compact" type="display" surface="glow" transition="reveal"}

:::steps{title="Complete the handoff"}

1. Replace the sample findings with verified project facts.
2. Build the selected output; `build` validates the source before writing it.
3. Open the result directly in a browser and review the real page.
4. Use `validate` or `inspect` only when you need focused diagnostics, then assign owners and dates.
   :::

:::demo{title="Review confidence" start="1" step="1"}
Use this bounded control during a live review to count independently confirmed evidence groups.
:::
::::::
