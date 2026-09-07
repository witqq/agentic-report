---
contractVersion: 1
title: agentic-report — declarative interactive pages for agent handoffs
description: Turn declarative Markdown into a finished interactive page an agent can hand to a human.
language: en
localizations:
  ru: report.ru.md
theme: system
layout: landing
preset: editorial
scrollProgress: true
---

# Give your agent a page worth handing over.

**Declarative visual stories, evidence, and review—built from Markdown.**

Install one skill. Your coding agent can turn research, code tours, decisions, incidents, and status into a
polished interactive page whenever visual structure helps. Everything compiles locally; there is no frontend
project, hosted editor, or author JavaScript.

::::actions{placement="edge"}
::action[Install the agent skill]{href="#agent-skill" kind="primary" effect="magnetic"}
::action[Explore live examples]{href="#examples" kind="secondary"}
::action[Read agent instructions]{href="docs/agent/index.md" kind="quiet"}
::::

![Fictional regional beta launch page compiled from public declarative source](assets/launch-readiness.png)

_Fictional sample · built by agentic-report from repository source._

::::cards
:::card{title="One HTML by default"}
Choose a content-addressed directory artifact only when the page is large.
:::
:::card{title="Interactive through file://"}
The package-owned browser runtime ships inside the artifact and makes the normal output interactive.
:::
:::card{title="No author JSX, JS, or CSS"}
Authors use Markdown, frontmatter, confined partials, and local assets.
:::
::::

::::::::section{title="One source becomes the whole experience." id="proof" nav="Proof" width="wide" align="start" tone="soft" composition="stage" viewport="full" section-density="immersive" type="display" media="mask" media-fit="cover" media-aspect="cinematic" focal="right" surface="mesh" transition="stagger" scene="progress" choreography="cascade"}
:::lead
The source, visual hierarchy, motion, and review behavior all travel through the same public declarative
contract. This page is not a mockup and has no landing-only renderer.
:::

:::::::cards
::::::card{title="Declarative source"}

```markdown
:::::section{title="Activation evidence" composition="split" viewport="bounded" section-density="editorial" type="display" surface="grid" transition="reveal" scene="progress" choreography="cascade"}
::::chart{type="line" title="Activated workspaces" description="A bounded cohort trend."}
::::series{label="Activation"}
::point{label="Cohort 1" value="46"}
::point{label="Cohort 4" value="64"}
::::
::::
:::::
```

[Read the complete launch source](examples/launch-readiness/report.md)
::::::
::::::card{title="Compiled result"}
![Decision-oriented launch page with navigation, evidence, charts, and a timeline](assets/launch-readiness.png)

The compiler supplies accessible navigation, responsive composition, local assets, restrained motion, and
the review workspace.

[Open this fictional launch page](examples/launch-readiness/index.html)
::::::
:::::::

:::callout{kind="info" title="The public site uses the ordinary compiler"}
This landing is compiled from its [canonical Markdown source](source/landing/report.md). Single-file and
directory output share the same page model and runtime. Public staging records the exact deployed identity
in [`release.json`](release.json); mutable pages revalidate while content-addressed assets can be immutable.
:::

```sh
npx --yes agentic-report build ./website/landing --output ./site/index.html --json
```

[English source](source/landing/report.md) · [Russian source](source/landing/report.ru.md) · [Release identity](release.json)
::::::::

:::::section{title="A small vocabulary creates a large visual range." id="data-scene" nav="Visual language" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="editorial" type="editorial" surface="grid" transition="reveal" scene="progress" choreography="cascade"}
:::lead
Authors choose semantic roles. The package combines them into responsive scenes without exposing CSS values
or executable templates.
:::

::::chart{type="bar" title="Closed visual vocabulary" description="Current package-owned choices available to every compatible page: six compositions, five decorative surfaces, four action placements, and two portable output formats." x-label="Public family" y-label="Available choices"}
:::series{label="Choices"}
::point{label="Compositions" value="6"}
::point{label="Surfaces" value="5"}
::point{label="Action placements" value="4"}
::point{label="Output formats" value="2"}
:::
::::

::::cards
:::card{title="Monument scale"}
Stage, split, mosaic, story, stack, full-bleed media, and bounded viewport roles make wide and tall screens
feel intentionally composed.
:::
:::card{title="Material reading surfaces"}
Editorial type, warm plates, masks, layers, galleries, grain, mesh, glow, and grid keep evidence readable.
:::
:::card{title="Signal and motion"}
Reveal, stagger, scroll scenes, semantic choreography, depth, tilt, and a rare magnetic primary action are
bounded, input-aware, and disabled under reduced motion.
:::
::::
:::::

:::::section{title="Four real pages. One public language." id="examples" nav="Examples" width="wide" align="start" tone="soft" composition="stage" viewport="full" section-density="immersive" type="display" media="gallery" media-fit="cover" media-aspect="landscape" surface="glow" transition="stagger" choreography="cascade"}
Every example is a separately compiled bilingual page. All organizations, people, events, metrics, and
decisions are fictional sample data.

::::cards
:::card{title="OrbitDesk P1 incident review"}
![Fictional incident review showing impact and causal evidence](assets/incident-review.png)

Follow a failure curve, causal diagram, evidence tabs, response timeline, and accountable action register.

[Open live example](examples/incident-review/index.html) · [English source](examples/incident-review/report.md) · [Russian source](examples/incident-review/report.ru.md)
:::
:::card{title="AI support vendor decision"}
![Fictional vendor decision showing hard gates and weighted evidence](assets/vendor-decision.png)

Separate mandatory procurement gates from weighted preference and inspect the ranking exception.

[Open live example](examples/vendor-decision/index.html) · [English source](examples/vendor-decision/report.md) · [Russian source](examples/vendor-decision/report.ru.md)
:::
:::card{title="Regional beta launch readiness"}
![Fictional launch review showing audience value and activation evidence](assets/launch-readiness.png)

Judge a bounded beta from activation, retention, operating gates, and a reversible rollout.

[Open live example](examples/launch-readiness/index.html) · [English source](examples/launch-readiness/report.md) · [Russian source](examples/launch-readiness/report.ru.md)
:::
::::
:::::

:::::section{title="From an empty folder to a reviewable story." id="workflow" nav="Workflow" width="wide" align="start" tone="accent" composition="story" viewport="bounded" section-density="editorial" type="editorial" media="mask" media-fit="cover" media-aspect="landscape" focal="left" surface="grain" transition="reveal" interaction="depth"}
![Fictional incident page used as a local review handoff](assets/incident-review.png)

:::steps{title="First useful result"}

1. Initialize with `npx --yes agentic-report init ./my-page --starter landing --json`.
2. Replace the sample evidence and add only confined partials or local assets.
3. Run `validate` and `inspect`; fix every reported source violation.
4. Build one HTML file or a content-addressed directory and open it through `file://`.
   :::

:::callout{kind="info" title="Agent-first diagnostics"}
All registered CLI commands are machine-discoverable. Run commands return structured NDJSON by default; reference
commands return compact JSON. `fix` is the only command that writes Markdown, and only at exact computed
ranges. Use Node.js 24.18.0 or newer.
:::

::::actions{placement="inline"}
::action[Open the quickstart]{href="docs/agent/index.md" kind="primary"}
::action[Inspect the source contract]{href="docs/product/source-contract.md" kind="secondary"}
::::
:::::

:::::section{title="Comment exactly where the question lives." id="review" nav="Review" width="wide" align="start" tone="plain" composition="split" viewport="bounded" section-density="compact" type="display" surface="glow" transition="reveal"}
Select any eligible text on the normal page and choose **Create note**. The exact range stays highlighted;
the anchored thread supports reply, edit, resolve, reopen, and **View thread** without moving the report.
The topbar **Review** control opens only the overlay list, import, and one canonical export of all threads.

:::callout{kind="success" title="Try it on this sentence"}
Highlight any words in this callout. There are no special review blocks and no separate review mode—the
selection itself is the review target.
:::

:::callout{kind="info" title="When comments are not enough"}
Response Workspace collects bounded triage, choices, scores, ordering, and free text in one local
`response.json`. [Try the bilingual workspace](examples/response-workspace/index.html) or read its
[English](examples/response-workspace/report.md) and [Russian](examples/response-workspace/report.ru.md) sources.
:::

::::actions{placement="inline"}
::action[Try the review workspace]{href="examples/review-workspace/index.html" kind="primary"}
::action[Read its source]{href="examples/review-workspace/report.md" kind="secondary"}
::action[Inspect the prior handoff]{href="examples/review-workspace/prior-review.json" kind="quiet"}
::::
:::::

:::::section{title="Give your agent the complete tool, not a screenshot." id="agent-skill" nav="Agent skill" width="wide" align="start" tone="soft" composition="mosaic" viewport="adaptive" section-density="compact" type="editorial" surface="grid" transition="stagger" choreography="cascade"}
::::cards
:::card{title="Install the ready-made skill"}

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Ask naturally for an interactive code tour, a vendor comparison, or an incident handoff. The skill decides
when a page adds value and returns the finished local artifact.

[Read the exact skill](skills/agentic-report/SKILL.md)
:::
:::card{title="Use the right page shape"}
The six starters cover report, research, architecture, tutorial, dashboard, and landing work. Decisions and
review use the same primitives rather than parallel templates.

[Open the landing starter](source/starter/landing/report.md) · [Browse the example manifest](examples/manifest.json)
:::
:::card{title="Keep the trust boundary small"}
Included: declarative local source, package-owned interaction, single-file and directory output. Excluded:
remote fetching, raw HTML, author scripts, hosted collaboration, print, and disabled-JavaScript parity.

[Architecture](docs/ARCHITECTURE.md) · [Testing contract](docs/TESTING.md) · [Product requirements](PRODUCT-REQUIREMENTS.md)
:::
:::card{title="Documentation for both readers"}
Humans get a task guide; agents get direct Markdown, generated schemas, and the closed source contract.

[Human guide](docs/index.html) · [Agent guide](docs/agent/index.md) · [Agent reference](docs/AGENT-REFERENCE.md) · [Extension template](docs/generated/extension-proposal.template.json) · [Public route manifest](website/routes.json) · [llms.txt](llms.txt)
:::
::::
:::::

:::::section{title="Build the page your agent needs to hand off." id="start" nav="Start" width="wide" align="center" tone="contrast" composition="stage" viewport="bounded" section-density="immersive" type="display" surface="mesh" transition="stagger"}
Use Node.js 24.18.0 or newer. The first zero-install run retrieves the package from npm; compilation and the
generated page then run locally.

```sh
npx --yes agentic-report init ./my-page --starter landing --json
```

::::actions{placement="bottom"}
::action[Read the quick start]{href="docs/index.html" kind="primary" effect="magnetic"}
::action[Explore examples]{href="#examples" kind="secondary"}
::action[View the repository]{href="https://github.com/witqq/agentic-report" kind="quiet"}
::::

No signup, cloud project, or telemetry promise is required to produce the local artifact.
:::::
