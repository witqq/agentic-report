---
name: agentic-report
description: Create and build polished local pages from declarative Markdown — landing pages, documents (reports, research, architecture, code reviews, incidents, guides), dashboards, answer forms, and presentations that can be shown or filmed — starting from a brief, with design advice and snapshots before handoff. Use for static agent-to-human handoff or a local living document with Codex discussion and source updates; do not use for remote hosted apps, simultaneous multi-user editing, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.20.0'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run. Snapshots also need Playwright and its Chromium.
---

# agentic-report

Make a page a person will want to read: find out what it is for, choose how it should look, write it from
real material, build it, check it, and look at it before you hand it over. The package compiles a
declarative Markdown source into one interactive HTML file that opens from disk; this skill is the craft
around it. This file is the route: the order of work, where each answer lives, and the rules for every
page. The detail is in `references/` and in the CLI's own output.

For a local living document, launch `serve` from the current author Codex session and read
[`references/process.md`](references/process.md#live-local-document). It covers selecting text to ask Codex,
streamed formatted replies, source watching, revision highlights, durable questions and local service lifecycle.
Selection opens a question form beside the passage; replies stay in the main chat. Waiting questions have
an ordered list and immediate cancellation; active replies cannot be cancelled there. The panel also owns
reader theme, appearance, change visibility and bounded desktop width controls, with a reset action.
The default attaches that existing conversation; a separate agent requires explicit `--agent standalone`.
Current-session chat mirrors human text from the same Codex/terminal conversation and interleaves agent
replies without replaying input. Correlated browser questions appear once. This is a bounded recent text
history; tools, reasoning, approvals and non-text attachments are omitted, and limited history is labelled.
Ordinary `build` still produces the standalone offline handoff.

## Pages and sources made for a film

Start from the material and the viewer: [knowledge map](references/knowledge.md) routes to the relevant references; [directing](references/directing.md) helps choose what the viewer should understand or feel, how that develops, and how it is staged. [Combinations](references/combinations.md) coordinates several actions into one event. Then use the [atlas](references/atlas.md) to discover tools and complete examples. These are conditional choices, not a common structure for every page or film.

For a filmed explanation, read [directed scenes](references/directed-scenes.md) for the supported syntax. It offers five composition meanings (`diagram-code`, `pipeline`, `before-after`, `overview-detail`, `ownership`), independent responsive layouts, named `scene-group` boundaries, dynamic `slot` values inside stable objects, and timed named-object actions. Keep component responsibilities fixed while example values develop; use `slot`/`toSlot` for copy, transfer and replacement inside an owner. Read the same reference for grouping, reading edges and choosing a graph layout when dependencies branch. Let a value change, travel or cross an ownership boundary while the narration names it; focus the code that performs that operation. Preserve readable diagram context: choose additive outline, halo, brackets or underline; request dim only when isolation serves the material. A timed `trace` beam, pulse or packet shows a directional pass along a relation, while copy/transfer changes a named value. Use `annotate` for a short presentation note tied to real code `lines`, optional related object `to`, and measured `until`; `notes` selects an adaptive beside/below region and `lineStart` preserves source locators without changing code. Name call/data/event/dependency/ownership with connection `relation` and an explicit label. A specific composition target binds only that stage's anchors; other stages on the same page may use different narration lengths. Bind each effect to the meaning of the spoken beat; do not inherit example beat numbers as a general schedule. Combine these actions with existing diagram draw/pulse, section entrances, code-line focus, typing, marks and the film's camera or 3D effects where they explain the subject.

Whenever a system interface is shown, first show its complete application screen in every format, then focus or zoom into a named part. A detail must have an established location. A page can keep the full screenshot beside its detail; a film reserves an opening beat for the whole viewport. Re-establish a substantially different screen after navigation. Read the same reference for still-page, presentation and vertical-film recipes.

When a Report source is only material inside a Screencast film, follow the film's workflow: build that source and inspect its actual film frames. The full page-handoff route below applies when the page itself is a deliverable; do not add it as a second workflow to every filmed scene. Use a coordinated local compiler and Screencast build for the new composition syntax, as the directed-scenes reference explains.

The [atlas builder](scripts/build-atlas.mjs) renders a browsable gallery of native examples, companion pages and reference extensions: `node <skill>/scripts/build-atlas.mjs --out ./report-atlas`. Build it when discovering or comparing tools; it adds no handoff gate.

## The order of work

Each step names what it produces, what to read first, and how you know it is done. The page is checked by
scripts, not by your memory of the references: `prose-check`, `design-check` and `snapshot --measure` name
every rule they find broken, and [`handover.mjs`](scripts/handover.mjs) runs them all at the end. Before
a decision, ask `node scripts/craft.mjs <topic>` ([`scripts/craft.mjs`](scripts/craft.mjs)) for the rules
that decide it (`table`, `landing-first-screen`, `motion`, `prose-ru`, a directive name, or a rule id such
as `DR-SURFACES` or `PR-DASH`).

Keep the skill's scripts together: their shared
[`source-files.mjs`](scripts/source-files.mjs) enforces the page file boundary before reads and writes.

1. **Brief.** Run `init` with the category's starter (table below), fill `brief.md`, then start the
   checklist: `node scripts/checklist.mjs init <page-directory>`
   ([`scripts/checklist.mjs`](scripts/checklist.mjs)) writes `checklist.md` with these steps,
   the brief's dimensions, the design rules and the hand-over gates. Close an item with
   `- [x] item → evidence` or `- [n/a] item → reason`. Read [`references/process.md`](references/process.md)
   («Start with the brief») and the category in [`references/playbook.md`](references/playbook.md). Ask
   only what you cannot find out, in one round. Done when every dimension row has an answer and a source
   (`request`, `asked`, `inferred`).
2. **References.** For a landing or a showcase, study 5–10 real sites on the same subject and write what
   each teaches in the brief's `references` row, before any concept. Read
   [`references/art-direction.md`](references/art-direction.md). Done when the row names each site and its
   lesson.
3. **Direction.** On a page where the look decides the result, offer two or three concepts as whole pages
   and let the person choose; otherwise choose one and write it in the brief. Read
   [`references/art-direction.md`](references/art-direction.md) and
   [`references/themes.md`](references/themes.md). Done when the brief's `art-direction` row holds the
   chosen concept and every shown version is frozen as its own artifact.
4. **Material.** Collect real screenshots, numbers, code, clips into `assets/`. Record where each file came
   from, keep only safe fields, and take copy verbatim from the source the person named, marking your own
   headings in the brief. Read [`references/assets.md`](references/assets.md). Done when the brief's
   «Media» table has one row per file.
5. **Review the brief and the data.** Before the first build, an independent reviewer checks the brief and
   the material: numbers against their source, claims about the product against the code. Read
   [`references/process.md`](references/process.md) («Review before you hand over»). Done when no blocking
   or major finding is open.
6. **Source.** Start from the category's starter, then write chapters in the order of the argument. Read
   [`references/compose.md`](references/compose.md) and
   [`references/vocabulary-use.md`](references/vocabulary-use.md); exact names are in
   [`references/catalog.md`](references/catalog.md). Done when `validate` reports no diagnostic.
7. **Prose.** Run `node scripts/prose-check.mjs <page-source>`
   ([`scripts/prose-check.mjs`](scripts/prose-check.mjs)), then audit what it cannot see. Read
   [`references/prose.md`](references/prose.md), then [`references/prose-en.md`](references/prose-en.md)
   or [`references/prose-ru.md`](references/prose-ru.md) by the language of the text, and
   [`references/typography-ru.md`](references/typography-ru.md) for Russian. Done when the check exits 0 —
   every finding fixed, or switched off in `brief.md` with its reason — and no fact was added or lost.
8. **Build.** Run `build`; for a new edition of a page the person already saw, write `Previous edition:
<path>` in `brief.md` and build with `--since` that page
   ([`references/process.md`](references/process.md), «Show what changed since the last edition»). Done
   when it reports no diagnostic.
9. **Design check.** Run `node scripts/design-check.mjs <page-source>`
   ([`scripts/design-check.mjs`](scripts/design-check.mjs), rules in
   [`scripts/design-rules.mjs`](scripts/design-rules.mjs)) and act on its advice. Read
   [`references/process.md`](references/process.md) («Check the design»). Done when `advice` is empty or
   each remaining rule is switched off in the brief with its reason.
10. **Look.** Measure the page with `snapshot --measure` and fix every defect it counts, then photograph it
    with `snapshot` and look at it; judge motion in a browser. Read
    [`references/process.md`](references/process.md) («Look at the result»), and before each round of
    fixes reread [`references/design-rules.md`](references/design-rules.md) and
    [`references/art-direction.md`](references/art-direction.md); fix what you see and repeat from step 8.
    Done when `defects` is 0 everywhere and the self-check questions there have answers you would show the
    person. Close the checklist item with the path of a frame you opened and what you saw on it
    (`- [x] Look → shots/390-dark-normal-full.png: …`); the check refuses a look without a frame taken after
    the last change of the page.
11. **Review the result.** An independent reviewer checks the built page, including its look against the
    references in the brief. Done when no blocking or major finding is open.
12. **Hand over.** Run `node scripts/handover.mjs <page-source>`. It runs the design check, the prose
    check, `snapshot --measure` and `checklist.mjs check`, stamps the gates in `checklist.md`, and prints
    one verdict. **The page is not handed over until it passes.** Then report the source path, artifact
    path, starter, languages, warnings, advice and prose rules you switched off and why, and unresolved
    content facts. See [`references/process.md`](references/process.md) («Hand over»).

Pick the category by what the reader must do. It is a recommendation, not a limit: any directive, mode, or
effect works on any page.

| Category       | The reader must                                     | Starter                  | Subvariants                                                              |
| -------------- | --------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `landing`      | decide whether to try something, then take one step | `--starter landing`      | `product`, `portfolio`, `showcase`, `launch`                             |
| `document`     | check a finding, a system, or a procedure and act   | `--starter document`     | `report`, `research`, `architecture`, `code-review`, `incident`, `guide` |
| `dashboard`    | see the current state and what needs attention      | `--starter dashboard`    | `metrics`, `charts`, `filters`, `statuses`                               |
| `answer`       | answer a question and hand the answer back          | `--starter answer`       | `choice`, `questions`, `survey`, `brief`                                 |
| `presentation` | watch something shown one slide at a time           | `--starter presentation` | `demo`, `pitch`, `update`, `lesson`                                      |

Review Workspace (`review: true`) is a mode any page can switch on, not a category.

## Commands

Use the release pinned in this skill:

```sh
npx --yes agentic-report@0.20.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.20.0 build ./my-page --output ./my-page.html --json
npx --yes agentic-report@0.20.0 build ./my-page --output ./my-page.html --since ./my-page.html --json
node scripts/prose-check.mjs ./my-page
node scripts/design-check.mjs ./my-page
npx --yes playwright@1.62.1 install chromium
npx --yes -p agentic-report@0.20.0 -p playwright@1.62.1 agentic-report snapshot ./my-page --out ./my-page-snapshots
node scripts/handover.mjs ./my-page
node scripts/craft.mjs table
```

`--output` names the file `build` writes (a folder with `--format directory`). A source written by hand
needs only a `title` in its frontmatter; `contractVersion` names the source-contract major it is written
for — omit it for version 1. What each command prints, delivery flags, and building from a reviewed source
checkout instead of npm are in [`references/process.md`](references/process.md).
For a Node host that supplies author-overridable page-control defaults, use `buildReport` with
`manifestDefaults`; read «Build inside a Node host» in that reference.

## Where the answer is

| Question                                                                                                    | Where                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| What material, viewer question, development or staging should guide the page or film?                       | [knowledge](references/knowledge.md), [directing](references/directing.md), [combinations](references/combinations.md)                               |
| What tools and complete examples exist, and how do they look?                                               | [atlas](references/atlas.md), [gallery builder](scripts/build-atlas.mjs); `describe`, `schema`, `examples` for exact installed support               |
| What must the brief answer, and how do I ask the person?                                                    | [`references/process.md`](references/process.md) («Start with the brief»)                                                                            |
| What does this category need: form, first screen, mistakes, examples?                                       | [`references/playbook.md`](references/playbook.md)                                                                                                   |
| How do I compose a filmed mechanism, time actions to speech, and establish a whole interface before detail? | [`references/directed-scenes.md`](references/directed-scenes.md)                                                                                     |
| Which directive answers the reader's question; where does a tool fit?                                       | [`references/vocabulary-use.md`](references/vocabulary-use.md)                                                                                       |
| How are chapters, data, diagrams, recordings, slides, messages written?                                     | [`references/compose.md`](references/compose.md)                                                                                                     |
| What is the exact name or allowed value of a field or attribute?                                            | [`references/catalog.md`](references/catalog.md); `agentic-report schema --scope manifest\|directives\|source\|theme`                                |
| What does the product support, and which rule depends on which?                                             | `agentic-report describe` (its `authoredRules`)                                                                                                      |
| How is my source structured, what did each recipe resolve to?                                               | `agentic-report inspect ./my-page`                                                                                                                   |
| Which complete page can I copy from?                                                                        | `agentic-report examples`; the exemplars at the end of [`references/playbook.md`](references/playbook.md)                                            |
| How should the page look; which concept; which clichés to avoid?                                            | [`references/art-direction.md`](references/art-direction.md)                                                                                         |
| Which theme, or how do I make my own?                                                                       | [`references/themes.md`](references/themes.md); `agentic-report schema --scope theme`                                                                |
| Why does a design rule exist, and how is it fixed?                                                          | [`references/design-rules.md`](references/design-rules.md)                                                                                           |
| Where may a picture, clip, font, or effect code come from?                                                  | [`references/assets.md`](references/assets.md)                                                                                                       |
| The vocabulary lacks what the page needs: do I extend it, and how?                                          | [`references/extensions.md`](references/extensions.md); the reference extensions in `agentic-report examples`                                        |
| How do I audit the prose?                                                                                   | [`references/prose.md`](references/prose.md), [`references/prose-en.md`](references/prose-en.md), [`references/prose-ru.md`](references/prose-ru.md) |
| How is Russian text set?                                                                                    | [`references/typography-ru.md`](references/typography-ru.md)                                                                                         |
| How do I check the design, look at the result, review, and hand over?                                       | [`references/process.md`](references/process.md)                                                                                                     |
| Which rules decide the choice in front of me?                                                               | `node scripts/craft.mjs <topic, directive or rule id>`                                                                                               |

Against the installed package, `describe`, `schema`, and `examples` are the machine-readable runtime
truth; the catalogue is generated from the same contract.

## Techniques: when to take them

Only the top-level choices; every tool's row is in
[`references/vocabulary-use.md`](references/vocabulary-use.md).

| Technique                            | Take it when                                                                                | Not when                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `layout: slides`                     | something is shown one idea at a time, live or filmed                                       | people read the page alone and search in it               |
| `deck` of `slide`s                   | a document needs a few slides to show in place and on the whole screen                      | the whole page is a talk — that is `layout: slides`       |
| `layout: screens`                    | a page read alone should stop at one idea per screen, one per gesture                       | a document people search, scan or come back to            |
| `recipe="demo"` on the first section | a landing must show its product working on the first screen                                 | any section but the first; a report                       |
| `transition`, `scene`, `interaction` | `motion:` in the frontmatter (the brief's row) allows it and the movement says what changed | every chapter; decoration                                 |
| `video`, a short screencast film     | a process, a live interface, a before/after over time — what the reader must see in motion  | what reads as a static diagram or table                   |
| `diagram`                            | parts hand work to each other, or calls follow in time                                      | a picture the prose already says in one sentence          |
| `response` (Response Workspace)      | the person must hand structured answers back                                                | discussion of the text — that is `review: true`           |
| a theme of your own                  | no built-in theme fits the direction in the brief                                           | a built-in theme with one or two fields changed would do  |
| `--format directory`                 | several clips, or a published site                                                          | a private page handed over as one file                    |
| `localizations`                      | the page ships in English and Russian                                                       | a single-language page — delete the starter's other entry |
| `build --since <page>`               | the person saw the previous edition and asked for changes                                   | a first edition, a new reader, text removed for privacy   |

## Rules for every page

- Hand over only when `node scripts/handover.mjs <page-source>` passes, no blocking or major review
  finding is open, and the brief describes what was built.
- Write only Markdown, frontmatter or the manifest, supported directives, confined partials, and local
  assets: never JSX, raw HTML, browser JavaScript, CSS, executable templates, plugins, or remote fetching.
  Code enters a page only as a declared extension, checked by its own rules
  ([`references/extensions.md`](references/extensions.md)).
- Never invent metrics, customers, dates, identities, or claims about the product: each claim carries the
  file and line that shows it or the person's approved wording; a gap is listed under «Unresolved content
  facts».
- Show only safe fields; crop private text out of screenshots and clips (`DR-PRIVACY`).
- Never switch a design or prose check off in the source — only in `brief.md` under «Checks switched off»,
  with the reason on the same line: `- DR-SURFACES: reason`, or `- PR-DASH report.ru.md:14: reason` for
  one place.
- Do not deploy, publish, use credentials, or mutate unrelated files.

## The costliest rules

These cost a page the most when missed; keep them in mind while writing, before any check runs. The full
rule, its counterexample and its fix are in `node scripts/craft.mjs <id>`.

- `DR-REAL-MATERIAL` — real screenshots, numbers and diagrams, never stock or generated pictures.
- `DR-OPENING-MEDIA` — a landing shows its product on the first screen.
- `DR-NAV-ABOVE-TITLE` — no navigation frame above a landing title.
- `DR-NUMBERS-UNITS` — every number carries its unit and its date.
- `DR-DATA-SLICE` — every figure with data names its source and its moment.
- `DR-EXAMPLE-SCOPE` — what is true of an example is said of that example.
- `DR-HEADING-HIERARCHY` — one page title, then chapter titles; no bold line posing as a heading.
- `DR-LINE-LENGTH` — reading lines stay between about 45 and 80 characters.
- `DR-ONE-ACCENT` and `DR-CONTRAST` — one accent colour; every text meets WCAG AA.
- `DR-BLOBS` — no blurred colour blobs, meshes or glows behind content.
- `DR-MOTION-MEANING` — motion shows a change in meaning, or it goes.
- `DR-RU-TYPOGRAPHY` and `DR-CAPTIONS` — Russian typography; every picture explains itself.
- `PR-NOT-X-BUT-Y` — no staged contrast («не просто X, а Y», "not just X, it is Y"); state the claim.
- `PR-DASH` — no dash where a full stop, comma or colon belongs.
- `PR-MODEL-WORDS` and `PR-SALES` — no model vocabulary and no sales words; put the fact in their place.

For a directed filmed mechanism, use the live directional connections and coordinated content changes described in [directed scenes](references/directed-scenes.md). Stable owner titles, concrete changing values and the corresponding code focus make the relation understandable; a highlighted generic card under several paragraphs does not.

For filmed architecture/code explanations, read [architecture films](references/architecture-films.md) and the [real-code example route](references/architecture-films.md#buildable-real-code-example). Start with `midnight`, `scheme: dark` unless the material or requested look calls for another choice. Show concrete inputs, stored forms, owners, reads, mutations, calls and events, with the matching real code and file/function locator. Let content develop with measured speech; diagrams explain relations, lists enumerate, and a right-hand detail panel is only one arrangement. Use the existing draft to judge what the viewer learned; do not add another gate.

Build the actual packaged examples gallery with the [atlas helper](scripts/build-atlas.mjs); its output is a local preview, not a publication.
