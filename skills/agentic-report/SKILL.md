---
name: agentic-report
description: Create and build polished local pages from declarative Markdown — landing pages, documents (reports, research, architecture, code reviews, incidents, guides), dashboards, answer forms, and presentations that can be shown or filmed — starting from a brief, with design advice and snapshots before handoff. Use for static agent-to-human page handoff; do not use for hosted apps, live collaboration, deployment, publication, or bespoke frontend development.
license: MIT
metadata:
  version: '0.19.0'
  homepage: https://agentic-report.witqq.dev/
  compatibility: Requires Node.js 24.18.0 or newer, npm/npx, and registry access for the first npx run. Snapshots also need Playwright and its Chromium.
---

# agentic-report

Make a page a person will want to read: find out what it is for, choose how it should look, write it from
real material, build it, check it, and look at it before you hand it over. The package compiles a
declarative Markdown source into one interactive HTML file that opens from disk; this skill is the craft
around it. This file is the route: the order of work, where each answer lives, and the rules for every
page. The detail is in `references/` and in the CLI's own output.

## The order of work

Each step names what it produces, what to read first, and how you know it is done. Keep the page checklist
from the first step: `node scripts/checklist.mjs init <page-directory>` writes `checklist.md` beside the
page with these steps, the dimensions of the page's brief, and the design rules, all taken from the skill
at that moment. Close an item with `- [x] item → evidence` or `- [n/a] item → reason`; a tick without a
reason stays open. The script is [`scripts/checklist.mjs`](scripts/checklist.mjs).

1. **Brief.** Run `init` with the category's starter (table below), fill `brief.md`, then start the
   checklist. Read [`references/process.md`](references/process.md) («Start with the brief») and the
   category in [`references/playbook.md`](references/playbook.md). Ask only what you cannot find out, in one
   round. Done when every dimension row has an answer and a source (`request`, `asked`, `inferred`).
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
7. **Prose.** Audit the text against the prose rules and fix it. Read
   [`references/prose.md`](references/prose.md), then [`references/prose-en.md`](references/prose-en.md)
   or [`references/prose-ru.md`](references/prose-ru.md) by the language of the text, and
   [`references/typography-ru.md`](references/typography-ru.md) for Russian. A build before the audit to
   check syntax is fine; the audit comes before the build you hand over. Done when the audit's findings are
   treated and no fact was added or lost.
8. **Build.** Run `build`. Done when it reports no diagnostic.
9. **Design check.** Run [`scripts/design-check.mjs`](scripts/design-check.mjs) (its rules are
   [`scripts/design-rules.mjs`](scripts/design-rules.mjs)) and act on its advice. Read
   [`references/process.md`](references/process.md) («Check the design»). Done when `advice` is empty or
   each remaining rule is switched off in the brief with its reason.
10. **Look.** Read the checks first, then measure the page with `snapshot --measure` and fix every
    defect it counts, then photograph it with `snapshot` and look at it; judge motion in a browser. Read [`references/process.md`](references/process.md) («Look at the result»), and before
    each round of fixes reread [`references/design-rules.md`](references/design-rules.md) and
    [`references/art-direction.md`](references/art-direction.md); fix what you see and repeat from step 8.
    Done when the self-check questions there have answers you would show the person.
11. **Review the result.** An independent reviewer checks the built page, including its look against the
    references in the brief. Done when no blocking or major finding is open.
12. **Hand over.** Check that the brief describes what was built, and that
    `node scripts/checklist.mjs check <page-directory>` reports no open items; then report the source path,
    artifact path, starter, languages, warnings, advice you left in place and why, and unresolved content
    facts. See [`references/process.md`](references/process.md) («Hand over»).

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
npx --yes agentic-report@0.19.0 init ./my-page --starter landing --json
npx --yes agentic-report@0.19.0 build ./my-page --output ./my-page.html --json
node scripts/design-check.mjs ./my-page
npx --yes playwright@1.62.1 install chromium
npx --yes -p agentic-report@0.19.0 -p playwright@1.62.1 agentic-report snapshot ./my-page --out ./my-page-snapshots
```

`--output` names the file `build` writes (a folder with `--format directory`). A source written by hand
needs only a `title` in its frontmatter; `contractVersion` names the source-contract major it is written
for — omit it for version 1. Arguments, result records, diagnostics, and delivery flags are in
[`references/cli.md`](references/cli.md); building from a reviewed source checkout is in
[`references/process.md`](references/process.md).

## Where the answer is

| Question                                                                | Where                                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| What must the brief answer, and how do I ask the person?                | [`references/process.md`](references/process.md) («Start with the brief»)                                                                            |
| What does this category need: form, first screen, mistakes, examples?   | [`references/playbook.md`](references/playbook.md)                                                                                                   |
| Which directive answers the reader's question; where does a tool fit?   | [`references/vocabulary-use.md`](references/vocabulary-use.md)                                                                                       |
| How are chapters, data, diagrams, recordings, slides, messages written? | [`references/compose.md`](references/compose.md)                                                                                                     |
| What is the exact name or allowed value of a field or attribute?        | [`references/catalog.md`](references/catalog.md); `agentic-report schema --scope manifest\|directives\|source\|theme`                                |
| How do I invoke a command and parse its agent result or diagnostics?    | [`references/cli.md`](references/cli.md)                                                                                                             |
| How do I call the public Node ESM API from another program?             | [`references/node-api.md`](references/node-api.md)                                                                                                   |
| What does the product support, and which rule depends on which?         | `agentic-report describe` (its `authoredRules`)                                                                                                      |
| How is my source structured, what did each recipe resolve to?           | `agentic-report inspect ./my-page`                                                                                                                   |
| Which complete page can I copy from?                                    | `agentic-report examples`; the exemplars at the end of [`references/playbook.md`](references/playbook.md)                                            |
| How should the page look; which concept; which clichés to avoid?        | [`references/art-direction.md`](references/art-direction.md)                                                                                         |
| Which theme, or how do I make my own?                                   | [`references/themes.md`](references/themes.md); `agentic-report schema --scope theme`                                                                |
| Why does a design rule exist, and how is it fixed?                      | [`references/design-rules.md`](references/design-rules.md)                                                                                           |
| Where may a picture, clip, font, or effect code come from?              | [`references/assets.md`](references/assets.md)                                                                                                       |
| The vocabulary lacks what the page needs: do I extend it, and how?      | [`references/extensions.md`](references/extensions.md); the reference extensions in `agentic-report examples`                                        |
| How do I implement an effect with the complete public context API?      | [`references/effect-api.md`](references/effect-api.md)                                                                                               |
| How do I audit the prose?                                               | [`references/prose.md`](references/prose.md), [`references/prose-en.md`](references/prose-en.md), [`references/prose-ru.md`](references/prose-ru.md) |
| How is Russian text set?                                                | [`references/typography-ru.md`](references/typography-ru.md)                                                                                         |
| How do I check the design, look at the result, review, and hand over?   | [`references/process.md`](references/process.md)                                                                                                     |

Against the installed package, `describe`, `schema`, and `examples` are the machine-readable runtime
truth; the catalogue is generated from the same contract.

## Techniques: when to take them

Only the top-level choices; every tool's row is in
[`references/vocabulary-use.md`](references/vocabulary-use.md).

| Technique                            | Take it when                                                                                | Not when                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `layout: slides`                     | something is shown one idea at a time, live or filmed                                       | people read the page alone and search in it               |
| `layout: screens`                    | a page read alone should stop at one idea per screen, one per gesture                       | a document people search, scan or come back to            |
| `recipe="demo"` on the first section | a landing must show its product working on the first screen                                 | any section but the first; a report                       |
| `transition`, `scene`, `interaction` | `motion:` in the frontmatter (the brief's row) allows it and the movement says what changed | every chapter; decoration                                 |
| `video`                              | a behaviour needs proof that it is real                                                     | a mechanism a diagram or `scene="steps"` explains better  |
| `diagram`                            | parts hand work to each other, or calls follow in time                                      | a picture the prose already says in one sentence          |
| `response` (Response Workspace)      | the person must hand structured answers back                                                | discussion of the text — that is `review: true`           |
| a theme of your own                  | no built-in theme fits the direction in the brief                                           | a built-in theme with one or two fields changed would do  |
| `--format directory`                 | several clips, or a published site                                                          | a private page handed over as one file                    |
| `localizations`                      | the page ships in English and Russian                                                       | a single-language page — delete the starter's other entry |

## Rules for every page

- Hand over only when `node scripts/checklist.mjs check <page-directory>` reports no open items, no
  blocking or major review finding is open, and the brief describes what was built.
- Write only Markdown, frontmatter or the manifest, supported directives, confined partials, and local
  assets: never JSX, raw HTML, browser JavaScript, CSS, executable templates, plugins, or remote fetching.
  Code enters a page only as a declared extension, checked by its own rules
  ([`references/extensions.md`](references/extensions.md)).
- Never invent metrics, customers, dates, identities, or claims about the product: each claim carries the
  file and line that shows it or the person's approved wording; a gap is listed under «Unresolved content
  facts».
- Show only safe fields; crop private text out of screenshots and clips (`DR-PRIVACY`).
- Never switch a design check off in the source — only in `brief.md`, with the reason on the same line.
- Do not deploy, publish, use credentials, or mutate unrelated files.
- Fix on sight, the first time you see it: `DR-NAV-ABOVE-TITLE`, `DR-LINE-LENGTH`, `DR-HEADING-HIERARCHY`,
  `DR-BLOBS`, `DR-ONE-ACCENT`, `DR-CONTRAST`, `DR-TIGHT-TRACKING`, `DR-RU-TYPOGRAPHY`, `DR-REAL-MATERIAL`,
  `DR-NUMBERS-UNITS`, `DR-CAPTIONS` — each with its reason and fix in
  [`references/design-rules.md`](references/design-rules.md).
