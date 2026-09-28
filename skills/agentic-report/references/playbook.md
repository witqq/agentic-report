# Playbook: page categories

Five categories cover the pages people ask for. Each has a starter of the same name
(`init --starter <category>`) with a `brief.md` to fill first. A category is a recommendation: any
directive works on any page. For every category this file says what the reader is there to do, the form
that serves it, what the first screen must show, which tools of the package fit, where real material comes
from, how much motion suits it, when WebGL, video, or a presentation helps, the mistakes to avoid, and the
example to copy. Tool-by-tool advice is in [`vocabulary-use.md`](vocabulary-use.md); rule identifiers
point at [`design-rules.md`](design-rules.md).

## Landing — `product`, `portfolio`, `showcase`, `launch`

- **Reader's task.** Decide in one screen whether this is worth their time, then take one next step.
- **Form.** A claim, the product shown working, three or four chapters of proof, one call to action.
  `product` shows the thing in use; `portfolio` lets the work speak, with the person second; `showcase`
  is image-first and browsed; `launch` says what ships, when, and what the reader does now.
- **First screen.** The title and the product side by side: `recipe="demo"` on the first section with a
  real screenshot, a clip, code beside its result, or a diagram (`DR-OPENING-MEDIA`). No navigation frame
  above the title (`DR-NAV-ABOVE-TITLE`); `opening: start` when the demo needs the space.
- **In the tool.** `demo`, `thesis`, `statement`, `evidence`, `rail`, `compare` for before and after,
  `actions` for the call, `progress: chapters` for a long page.
- **Real material.** Screenshots of the product from a build, a clip filmed with agentic-screencast,
  numbers from the source the brief names. No stock photos (`DR-REAL-MATERIAL`).
- **Motion.** The brief's `motion` row decides the level, written as `motion:` in the frontmatter so the
  build holds the page to it, and the chosen concept answers it: `none` — the page stands still;
  `restrained` — one entrance for the chapter that changes the story and one pointer effect at most
  (`DR-UNIFORM-ENTRANCE`, `DR-ONE-EFFECT`); `expressive` — a directed page: a pinned scene whose steps
  change the picture (`scene="steps"`, or `scene="scrub"` for two to four screens played by the scroll), a
  diagram that draws its flow (`draw="scroll"`), a staged first screen (`transition="staged"`), stations
  that light as their chapters are reached (`state` and `when`), a WebGL effect where its motion is the
  subject, each with its still version. A story told one idea per screen takes `layout: screens`; its
  throughline is `progress: nodes`.
  The package's motion budget is a floor of safety, not the ceiling of the design: it keeps pointer effects
  to fine pointers and reduced motion still, whatever the level. At every level an entrance moves at most
  16 pixels and a meaningful gesture must be visible (`DR-MOTION-ORIGIN`).
- **WebGL, video, presentation.** A clip is the strongest demo. Use a declared effect extension when the
  subject requires WebGL and the same idea remains clear without it; a product screenshot should stay
  readable. A launch presented live becomes a `presentation` built from the same material.
- **Typical mistakes.** The starter's order kept (`DR-LANDING-ORDER`); three identical feature cards
  (`DR-CARD-SAMENESS`); blurred colour behind the hero (`DR-BLOBS`); a claim without a number or a date; a
  clever title instead of a promise; the same primitive repeated section after section.
- **Examples.** `landing` (product), `terminal-portfolio` (portfolio), `cinematic-story` (showcase),
  `launch-readiness` (launch).

### The title is a direct promise

Say plainly what the reader gets: the owner of the Moira landing preferred the plain «Let an AI agent carry
out your instructions» to every clever title of the first round («Spin, measure, cut», «Seven stations, four
paths back»). A concept title or a fact about a launch goes to the second level, under the promise. The
template «The AI-powered [category] for modern [audience]» and a title that would fit any competitor are
prose tells: cover the logo and check that the title still names this product.

The first Moira landing round (2026-09-24) showed why a clever title can obscure the product. Check the
promise against the first-screen demo: a reader should be able to match the noun and verb in the title to
what the screenshot or clip actually shows.

### The argument goes through a misconception

A landing that argues well walks one path: the mistaken belief the reader holds → what has appeared → what it
can do → what it withstands → how it is controlled → where to get it. Give every message one home: a
chapter carries something no other chapter says, and the thesis appears once, in its own form, not in three
retellings. The same primitive repeated section after section — a card grid, then a card grid — is the mark
of a template, however good the words. A chapter «where the product stops: what it does not do» builds trust,
and a dated change log is proof that the product is alive.

Sources: the live Moira landing reviewed on 2026-09-25 (strong content in identical cards); the landing
guide of the Moira product (`LANDING-PAGE.md`, «one home for each message»).

### A tool for agents shows how to connect it on the first screen

For a product an agent installs, the connection line — the server address, the install command — sits in the
first screen beside the actions. Clerk's one-command install is a useful pattern for making the first step
copyable; Vercel's terminal command beside an audience list connects the step to its intended reader.
The connection chapter has two parts: the configuration the reader pastes, and what the server answers,
so the reader sees that it worked. Show an example response with the command, not only an installation
promise.

### Show the path through a refusal

«Attempt → refusal → fix → acceptance» proves more than a green path: Temporal lets the reader press Play and
watch a workflow survive a failure; Framer's scenario demonstrates the same beat-by-beat explanation for an
agent action. Put the text of the refusal verbatim beside its step; tell the scenario in three or four beats
rather than one screenshot. On the refusal, time can stop: the frame freezes and the steps walk around its
details before the story moves on. Linear's product reconstruction shows another way to do this: real HTML
states on a timeline, with readable text and selectable controls instead of a flattened video or canvas.

### The product at its real size

Show the real interface at natural size, without a device frame, and let the product be larger than the
title, as Cursor does; an interface can sit over the page's own or licensed painting with the text beside it.
A screenshot in made-up browser chrome or a tilted dashboard is a prop (`art-direction.md`, clichés).
Cursor's recorded first-screen lesson is the relative scale: let the actual interface take more area than
the display title so the reader can inspect it before scrolling.

### The final screen is a scene

The page ends in a designed scene — the main image resolved, one action inside it — not a framed button or a
box with two buttons. The main image stays alive without scrolling only as a quiet exception: one continuous
movement per page, calm, with a pause button in the flow and a still version under reduced motion. For
moving, blinking or scrolling content that starts automatically, lasts more than five seconds and appears
alongside other content, WCAG 2.2.2 requires a way to pause, stop or hide it unless the movement is
essential. The owner's accepted Moira landing review (2026-09-26) also rejected a framed button as the
finale: resolve the main scene around the action instead.

### Storyboard a directed page

A page with directed motion carries a storyboard in its brief: for each stretch, the gesture, what is
revealed, the curve, the scroll length, and what it means. Beside it, a table «section → technique → what it
proves»: a technique with nothing in the last column comes out.

| Section      | Technique                       | What it proves                                   |
| ------------ | ------------------------------- | ------------------------------------------------ |
| First screen | `recipe="demo"` with the output | The product exists and does this                 |
| The run      | `scene="steps"` over the flow   | The agent was refused, fixed its answer, went on |

For a sticky explanation, keep one figure in view while short text steps pass it. Change only the labelled
part the current step explains, and make the complete figure readable when scrolling and scripting are
unavailable. This is the transferable layout pattern from The Pudding's sticky stories and Scrollama's
sticky-side demonstration.

### Recipe: an index of variants

When the person has seen several versions, build one more page: an index of every version shown, each with
its date, why it was made, what changed, and a link to the frozen artifact. Build it as a document with
`cards` (one card per version, the date in its title, a link card to the file) or a `timeline` of versions.
Every shown version stays as its own file; the index is how the person finds the one they liked.

Sources: the navigator of the Moira prototypes (`dist/index.html` in that project), asked for by the owner
on 2026-09-26.

## Document — `report`, `research`, `architecture`, `code-review`, `incident`, `guide`

- **Reader's task.** Check a finding, a system, or a procedure and act on it; come back to it later.
- **Form.** A one-paragraph summary with the verdict, then chapters the reader can navigate from the side:
  `report` — findings, evidence, decision; `research` — question, method, evidence, conclusion, limits;
  `architecture` — boundary, parts, flows, alternatives, rollout; `code-review` — verdict, findings by
  severity, the diff, steps to merge; `incident` — impact, timeline, cause, recovery, owned follow-up;
  `guide` — goal, prerequisites, steps with code, what to do when it fails.
- **First screen.** The title, the verdict or goal in one paragraph, and where the reader is going
  (`contents` or the sidebar). No hero.
- **In the tool.** `lead`, `callout`, `cards`, `diagram`, `chart`, `timeline`, `diff`, `findings`,
  `steps`, `tabs`, `glossary`, `copyable`, `review: true` when someone will comment in place.
- **Real material.** Logs, measurements, commits, the diff itself, the real system's parts; each number
  with its source and date (`DR-NUMBERS-UNITS`).
- **Motion.** Almost none. `draw="scroll"` only for a diagram whose order is the explanation.
- **WebGL, video, presentation.** No WebGL. A short clip shows a behaviour better than a paragraph
  (`mode="clip"`). A review meeting can use a `presentation` of the findings.
- **Typical mistakes.** Burying the verdict; a callout on every paragraph; a diagram repeated in prose;
  findings without severity; code without the file it belongs to.
- **Examples.** `document` (report), `research`, `architecture`, `code-review`, `incident-review`
  (incident), `tutorial` (guide).
- **Figure composition.** For a stepwise explanation, keep the figure beside the moving text and change
  one labelled part per step; also show its complete static state. An Activation Atlas-style comparison
  keeps related images in a fixed grid with group labels. An attribution-graph-style explanation labels
  nodes and directed connections, then highlights only the path supporting the current claim. Put the
  figure's source, date, scale or units and caption directly beside it. The Moira landing reviews found
  numbers without their source and moment to be uncheckable (`DR-DATA-SLICE`).

## Dashboard — `metrics`, `charts`, `filters`, `statuses`

- **Reader's task.** See the current state at a glance, find what needs attention, open the detail.
- **Form.** The few numbers that matter first, then trends, then the list the reader filters; every card's
  state said in words (`card status`).
- **First screen.** The metrics with their units and the time they were taken (`recipe="metrics"`), with
  what is at risk marked.
- **In the tool.** `cards` with `status`, `chart`, `filter`, `toggle`, `timeline`, `layout: dashboard`.
- **Real material.** Numbers from the system of record, with the date of the snapshot (the `freshness`
  row of the brief).
- **Motion.** None beyond `choreography="cascade"` on the metrics field if order matters; `:count[…]` is
  wrong here — the reader wants the value, not an animation.
- **WebGL, video, presentation.** None.
- **Typical mistakes.** Status only as a colour; numbers without a date; ten charts nobody asked for;
  green for «unknown».
- **Examples.** `dashboard` (metrics; its `filter` controls also show the `filters` subvariant),
  `visualization-catalog` (charts), `layout-dashboard` (statuses).
- **Signal reference.** Linear's recorded example uses colour for status, leaving ordinary labels neutral.
  The Moira landing's «Form» prototype put a red stamp on every status and made the whole column an alarm.
  Assign one signal colour to one state and write that state in words too (`DR-SIGNAL-COLOUR`).

## Answer — `choice`, `questions`, `survey`, `brief`

- **Reader's task.** Understand the question, answer it, and hand the answer back.
- **Form.** The question and why it is asked now; the options with their trade-offs; the form. `choice`
  picks one option; `questions` walks through several open questions, each with context and a place to
  answer; `survey` collects comparable answers from many people; `brief` gathers what an author needs
  before starting work.
- **First screen.** The question itself and the deadline or consequence.
- **In the tool.** `response` with `question` kinds `single`, `item-single`, `order`, `number`, `text`;
  `decision`; `cards` for options; `disclosure` for the evidence behind an option.
- **Real material.** The real options with their real costs; the pilot data behind a recommendation.
- **Motion.** None.
- **WebGL, video, presentation.** None; a clip can explain an option that is hard to describe.
- **Typical mistakes.** A recommendation hidden in the options; asking what the author could find out;
  a form without saying where the answer goes (the `handoff` row of the brief).
- **Examples.** `answer` (choice), `question-review` (questions), `response-workspace` (survey),
  `vendor-decision` (a choice with weighted evidence); `brief` has no example of its own (below).
- **Sources.** No external study backs this section yet; it comes from the package's own answer examples and
  the question rules of the brief step in [`process.md`](process.md): options with the recommended one first, a budget of
  questions, many questions moved to a decision page.

## Presentation — `demo`, `pitch`, `update`, `lesson`

- **Reader's task.** Watch something shown to them, live, alone, or on film, one idea per slide.
- **Form.** A title slide, one idea per slide, the steps of each idea revealed as the speaker talks
  (`appear`), notes for the speaker (`notes`). `demo` shows the product working; `pitch` argues for a
  decision; `update` reports progress against a plan; `lesson` teaches one skill.
- **First screen.** The title slide: what this is about and for whom.
- **In the tool.** `layout: slides`, `appear`, `notes`, `slide-transition`, `statement` for a figure,
  `diagram`, `video`, `compare`, `response` for a question to the room.
- **Real material.** The same as the page the presentation comes from; a clip filmed with
  agentic-screencast for the demo.
- **Motion.** The default `fade`; `push` for a sequence; steps instead of animation inside a slide.
- **WebGL, video, presentation.** A clip per demo slide; no WebGL. To film the deck, open it with
  `?view=film` and wait for `window.agenticSlides.settled()` between steps.
- **Typical mistakes.** A document pasted into slides; every block an `appear`; a different transition per
  slide; speaker notes on the slide.
- **Examples.** `presentation` (demo); `pitch`, `update`, and `lesson` have no example of their own (below).
- **Scenario reference.** Temporal's playable workflow failure and Framer's staged agent scenario both
  show a sequence of actions and outcomes; copy the beat structure, with the refusal and recovery visible.
  The recorded Personal Log 2024 reference used scene transitions of 1–1.5 seconds. Treat that as an
  observed cinematic tempo, not a default for a task-oriented deck; check that the audience can read the
  incoming slide and use the still version under reduced motion.

## Subvariants without an example of their own

Four subvariants have no example of their own yet. Copy the nearest example and change what the subvariant
changes:

| Subvariant            | Copy              | Change                                                                                                       |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| dashboard `filters`   | `dashboard`       | The list the reader narrows comes first; `filter` and `toggle` above it; the metrics shrink to one line      |
| answer `brief`        | `question-review` | Questions about the work to be done, each with the recommended answer first and why it is recommended        |
| presentation `pitch`  | `presentation`    | One decision argued: the problem, the proposal, the evidence, the cost, the ask on the last slide            |
| presentation `update` | `presentation`    | Progress against the plan: what was promised, what shipped with its date, what slipped and why, what is next |
| presentation `lesson` | `presentation`    | One skill taught: the goal, a worked example per slide with `appear` steps, an exercise, a summary           |

## Exemplars

The examples each category and subvariant points at, as data. Every exemplar ships a `brief.md`.

```json
{
  "exemplars": [
    { "category": "landing", "subvariant": "product", "example": "landing" },
    { "category": "landing", "subvariant": "portfolio", "example": "terminal-portfolio" },
    { "category": "landing", "subvariant": "showcase", "example": "cinematic-story" },
    { "category": "landing", "subvariant": "launch", "example": "launch-readiness" },
    { "category": "document", "subvariant": "report", "example": "document" },
    { "category": "document", "subvariant": "research", "example": "research" },
    { "category": "document", "subvariant": "architecture", "example": "architecture" },
    { "category": "document", "subvariant": "code-review", "example": "code-review" },
    { "category": "document", "subvariant": "incident", "example": "incident-review" },
    { "category": "document", "subvariant": "guide", "example": "tutorial" },
    { "category": "dashboard", "subvariant": "metrics", "example": "dashboard" },
    { "category": "dashboard", "subvariant": "charts", "example": "visualization-catalog" },
    { "category": "dashboard", "subvariant": "statuses", "example": "layout-dashboard" },
    { "category": "answer", "subvariant": "choice", "example": "answer" },
    { "category": "answer", "subvariant": "questions", "example": "question-review" },
    { "category": "answer", "subvariant": "survey", "example": "response-workspace" },
    { "category": "presentation", "subvariant": "demo", "example": "presentation" }
  ]
}
```
