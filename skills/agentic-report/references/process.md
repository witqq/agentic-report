# The process around a page

[`SKILL.md`](../SKILL.md) lists the order of work; this file explains each stage that is about the work
rather than the page source: the brief and the questions, versions shown to the person, the design check,
looking at the result, reviews, verified claims, privacy, trusted builds, and the hand-over. How to write
the source itself is in [`compose.md`](compose.md) and [`vocabulary-use.md`](vocabulary-use.md).

## Build a reproducible page

Use the release pinned in `SKILL.md`; its commands block has the exact `init`, `build`, and `snapshot`
lines. `init` copies the starter and its `brief.md` into an absent destination whose parent exists. `build`
validates the complete source before it writes output; resolve every structured diagnostic at its reported
file and range, then rerun. Open the result through `file://`. Use `validate` for a diagnostic-only run,
`inspect` for the source's structure and the catalog, and `--format directory` only when multi-file output
is needed (several clips, a published site).

Every command answers an agent without a flag and accepts `--json` as the name of that default: the run
commands `init`, `build`, `validate`, `inspect`, `fix`, `review`, `sitemap`, `snapshot`, `effect-check`, and `theme` write NDJSON
records, while `schema`, `describe`, and `examples` write one compact JSON document. `--human` selects the
form for a person. One failed run lists every independent violation it found, so fix them together.

### Deliver the page

- Keep the default **Made with Agentic Report** link; `attribution: false` removes only that footer when
  the user explicitly needs an unbranded artifact.
- When a finished artifact containing `source-link` will leave the workstation, build it with `--share` and
  report the returned `neutralizedSourceLinks` count.
- When the page will be served at a known web address, build it with `--format directory --url <address>`
  (or declare `url`). Add a local `image` for a link preview. Report `PUBLIC_PAGE_OVER_CRAWLER_LIMIT` or
  `SOCIAL_IMAGE_NOT_PUBLISHED` if the result carries them. Do not invent an address. For a whole published
  tree, `agentic-report sitemap <published-directory>` writes `sitemap.xml` and `robots.txt`.
- Do not deploy, publish, use credentials, or mutate unrelated files. This skill authorizes local
  installation, source authoring, validation, inspection, build, snapshots, and artifact review.

## Start with the brief

A page is good for someone and for something. Before writing, pick the category (the table in `SKILL.md`,
and [`playbook.md`](playbook.md) for each one) and answer every dimension of the category in `brief.md`, the
file `init` puts beside the source.

The brief has one row per dimension with the answer and its source: `request` (stated in the request),
`asked` (the person answered), `inferred` (derived from the material — name it).

| Dimension        | Categories   | Question                                                                                                                             |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `subvariant`     | all          | Which kind of page within the category is this?                                                                                      |
| `audience`       | all          | Who reads the page, and what do they already know?                                                                                   |
| `reader-task`    | all          | What must the reader be able to decide or do after reading?                                                                          |
| `material`       | all          | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        |
| `language`       | all          | Which languages does the page ship in?                                                                                               |
| `art-direction`  | all          | Which visual concept and theme fit the subject and the audience?                                                                     |
| `motion`         | all          | How much motion suits the page: none, restrained or expressive?                                                                      |
| `interactivity`  | all          | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? |
| `delivery`       | all          | How is the page delivered: one file, a published directory, public or private?                                                       |
| `references`     | landing      | Which 5–10 real sites on the same subject were studied before the concepts, and what does each teach?                                |
| `first-screen`   | landing      | What does the first screen show: the result, code beside the result, a diagram or a clip?                                            |
| `call-to-action` | landing      | What is the one action the reader should take?                                                                                       |
| `depth`          | document     | Does the reader need the conclusion only, or the full evidence behind it?                                                            |
| `review`         | document     | Will someone review the page in place and hand notes back?                                                                           |
| `signals`        | dashboard    | Which numbers and statuses matter, and what counts as good, watch and risk?                                                          |
| `freshness`      | dashboard    | When was the data taken, and from which source?                                                                                      |
| `respondent`     | answer       | Who answers, and how much context do they have?                                                                                      |
| `handoff`        | answer       | Where do the answers go after export, and who reads them?                                                                            |
| `setting`        | presentation | How is it shown: presented live, sent to click through alone, or filmed?                                                             |
| `length`         | presentation | How many slides and how many minutes does it have?                                                                                   |

### Ask only what you cannot derive

Fill from the request and the material first, and confirm what you derived in one line («One private
file, in English — inferred from the request») instead of asking it. Ask the person the rest in one round,
with the host's structured-input tool when it has one: two to four options per question, the recommended
one first and marked «(Recommended)», because a choice is easier to answer than free text. Keep to a budget
of at most three calls of four questions each, the concept choice included; when more questions are open
than fit, confirm the derived ones in a line and put the rest on one decision page (for example the host's
`decide` skill, if it has one). Never ask about a dimension the request already answered. A content gap
outside the dimensions — a list the page needs but nobody gave, a number without its unit — goes in the
same round when the page cannot be honest without it; otherwise show a labelled example and record the
gap. Re-check `subvariant` and `reader-task` after the answers arrive. Some dimensions have a default you
may infer and record: `language` is the language of the request, `delivery` is one private local file
unless the request mentions publishing, and `subvariant` usually follows from what the page is about.

### Study references and choose a concept

For a landing or a showcase, study 5–10 real sites on the same subject and write what each teaches in the
brief's `references` row, before any concept. On a page where the look decides the result, offer two or
three concepts and let the person choose; for other pages choose yourself and say so in the brief. How to
study references, write a concept, and show concepts is in [`art-direction.md`](art-direction.md).

## Collect the material

Collect real screenshots, numbers, code, and clips. Record where each file came from in the brief's
«Media» table, keep only safe fields, and take copy verbatim from the source the person named, marking
your own headings in the brief. What to use, licences, and sizes are in [`assets.md`](assets.md).

## Freeze every version you show

Keep each shown version as its own artifact before changing it, and when there are several, give the
person an index of variants with the date and reason of each (the recipe is in
[`playbook.md`](playbook.md)).

## Show what changed since the last edition

When the person already saw a page and asked questions or left notes, rebuild with the page they saw last:

```sh
npx --yes agentic-report@0.20.0 build ./my-page --output ./my-page.html --since ./my-page.html --json
```

Every page (except one built with `--url`) carries a record of its edition; `--since` reads it from the
previous page (`.html`, or a `--format directory` folder with `index.html`) or builds the previous source
(`.md` or its folder) when the page predates editions. The path may equal `--output`: the previous page is
read before the new one is written. A directory build needs an empty folder, so build the next edition into
a new one (`site.r2/`) and pass the old folder to `--since`. `validate`, `inspect` and `snapshot` take the
same `--since`, so a snapshot shows the page with its change layer.

The new page shows an edition strip under the title and intro («Показывать изменения», on by default and
for this session only), a «Changes N» button with the list of changes, dots in the contents, a label and
margin bar on every changed block, inserted words underlined and removed words struck through, removed
blocks as collapsed ghosts with the old text, a changed code block line by line, and moved blocks with a
link from where they stood.

- **Pass `--since` whenever** the reader of the new edition saw the previous one. Pass the page the person
  saw last, not the last one you built for yourself.
- **Build without `--since`** for the first edition, for a reader who never saw the previous one, for a
  public page, and when more than half of the blocks were rewritten — then say in the chat that the page
  was rewritten.
- **Text removed for privacy or because it was wrong is built without `--since`**: otherwise it stays on
  the page as a ghost. `--share` together with removed blocks warns `EDITION_REMOVED_TEXT_SHARED`.
- **Tell the person what changed** from `changes` in the build result (`inspect --since` gives it without
  building): one sentence per changed section — what changed, from `changes`, and which question it
  answers, from the conversation. `changes` carries counts, kinds and source lines, never the text; open
  the named lines yourself. Say that the changes are marked on the page and switch off with the toggle.
- `EDITION_UNCHANGED` means nothing the reader sees changed; `EDITION_RECORD_MISSING` means the previous
  page carries no record — pass its source instead.
- Before handover, look at the change layer in the light and dark scheme, at 390 and 1440, and with the
  toggle switched off.

Record the edition in `brief.md`, one line outside the dimension table, with the path of the page the person
saw last, relative to the page folder:

```markdown
Previous edition: ../my-page.html
```

The line makes the page a new edition for the skill's scripts. `checklist.mjs init` adds an «Edition» section
with three items — built with `--since` that page, the change list told to the person, the change layer
looked at — and `checklist.mjs check` keeps an item open while the brief, or a `--since` passed to it or to
`handover.mjs`, names an edition the checklist has no items for. `design-check.mjs` and `handover.mjs` read the page with `--since` that edition, so the design
check sees the page with its change layer, `snapshot --measure` measures the strip, the marks and the ghosts
like the rest of the page, and the design check prints `edition` with the totals of changed, added, removed
and moved blocks. `--since <path>` on any of the three scripts names the edition instead of the brief. An
edition that does not exist stops the design check. For the first edition, a reader who never saw the
previous one, or a page built without `--since` on purpose, leave the line out or write `Previous edition:
none`.

## Keep the brief with the source

It records who the page is for, the chosen concept, the «Media» provenance table (empty, with a sentence
saying so, when the page has no files under `assets/`), every design check switched off with its reason,
and the unresolved content facts. It describes what was built: when the page changes, the brief changes
with it, and before handover you check one against the other.

Keep `brief.md`, `checklist.md` and included Markdown inside the canonical page source directory. All
skill checks refuse a path or symbolic link that leaves that directory before reading page-owned text;
an include must name `.md` both as written and at its resolved target. A missing optional brief stays
missing. Explicit `--cli`, `--since` and snapshot-frame paths remain the paths the operator selected.

## Check every claim about the product

List the page's statements about what the product does; give each the file and line of the code or
document that shows it, or the wording the person approved in the brief. A claim with neither comes out. A
count in a heading follows a stated rule (`DR-HEADING-COUNT`); a property of an example is said of that
example (`DR-EXAMPLE-SCOPE`). Treat missing content facts as unresolved inputs; do not invent operational
evidence, identities, or metrics.

## Keep private things off the page

Show only safe fields — identifiers, step names, times, counts, error text — and crop task titles and
private text out of screenshots and clips (`DR-PRIVACY`; the media side is in
[`assets.md`](assets.md#privacy-in-media)).

## A product that does not exist yet has no screenshots

Show it with what the package draws from the source — code, a diagram, a table, a card — label invented
examples as examples on the page, and never invent metrics, customers, or dates. Record what is missing
under «Unresolved content facts».

## Trim the starter to the brief

For a single-language page, delete the starter's `report.ru.md` (or `report.en.md`) and the
`localizations` key. A link the product does not have yet, such as a sign-up address, uses an
`https://….example/` placeholder and is listed as an unresolved fact.

## Check the prose

The prose rules are checked by a script as well as by reading. Run it from the skill folder over the page
source:

```sh
node scripts/prose-check.mjs ./my-page
```

The script is [`scripts/prose-check.mjs`](../scripts/prose-check.mjs). Includes use paths relative to the
page's source root and name Markdown files only; the check refuses paths or symbolic links that leave
that root before reading their contents. It reads the authored prose of every
Markdown file of the page — paragraphs, list items, table cells, headings, titles and the prose attributes
of directives — skips code, other attribute values, link targets, data, block quotes, quoted phrases and
the «>» between the steps of a `:process` label, and checks each file against the catalogue of its
language ([`prose-ru.md`](prose-ru.md) or [`prose-en.md`](prose-en.md)). Each finding names the `PR-…` rule of the catalogue, the file and line, the
words it found and the treatment; it exits 1 while a blocking finding remains. A pattern the catalogue
calls _weak alone_ blocks only when another finding shares its paragraph. What the script cannot see —
sayings that sound deep, a paragraph skeleton, jargon — is still yours to read for
([`prose.md`](prose.md)).

A finding you keep on purpose is switched off in `brief.md` under «Checks switched off», never in the
source, with the reason on the same line: `- PR-DASH report.ru.md:14: the dash stands between subject and
predicate` for one place, `- PR-DASH: reason` for the whole rule. A line with an unknown rule or without a
reason switches nothing off and is reported.

## Ask for the rules at the point of decision

`node scripts/craft.mjs <topic>` prints the three to seven rules that decide a choice, taken from the
references as they are: `table`, `landing-first-screen`, `dashboard`, `diagram`, `media`, `motion`,
`colour`, `phone`, `prose-ru`, `prose-en` and the other topics it lists without an argument. A directive
name (`chart`, `video`, `section`) prints where the directive fits from [`vocabulary-use.md`](vocabulary-use.md)
and the rules that govern it; a rule id (`DR-SURFACES`, `PR-DASH`) prints that rule in full and says
whether a script finds it. The script is [`scripts/craft.mjs`](../scripts/craft.mjs).

## Check the design

The compiler does not judge content; craft advice lives in this skill. After a successful build, run the
design check from the skill folder:

```sh
node scripts/design-check.mjs ./my-page
```

It runs the `agentic-report` installed for the page (the nearest `node_modules/.bin` above it) and only
without one the release pinned in `SKILL.md`; `--cli <path>` names another build, spaces in the path
allowed.

The script is [`scripts/design-check.mjs`](../scripts/design-check.mjs); its rules are the pure functions in
[`scripts/design-rules.mjs`](../scripts/design-rules.mjs). It reads the page's structure from
`agentic-report inspect` (section recipes, surfaces, transitions, effects, and what the first screen shows —
never your words) and `brief.md` beside the entry. It prints one JSON document whose `advice` lists each
broken rule with its identifier, what it found, and what to change. It checks `DR-OPENING-MEDIA`,
`DR-LANDING-ORDER`, `DR-SURFACES`, `DR-UNIFORM-ENTRANCE`, `DR-ONE-EFFECT`, `DR-CARD-SAMENESS`,
`DR-EMPTY-STATE` (a chapter, table or cards group that reached the page empty), `DR-HEADING-EMOJI`,
`DR-BRIEF`, and `DR-BRIEF-MATCH`. `--cli <command>`
names another agentic-report command, such as a local `dist/node/cli.js`. Each piece of advice has the
shape every check of the skill uses — `rule` (the `DR-…` id), `id` (the check that fired), `message` and
`hint` — and the hint names `node scripts/craft.mjs <rule>`, which prints the rule with its counterexample
and fix. Beside `advice` the document carries `cliches`: how many of the findings are rows of the cliché
table in [`art-direction.md`](art-direction.md) (a title with buttons and no product, the template landing
order, decorative surfaces everywhere, every block fading up, competing effects, a wall of identical cards,
emoji as icons), which rows, and `average: true` from three of them — with the clichés of colour, type and
texture that only your eye counts, that is the table's four. The design check itself exits 0 with advice; the
hand-over gate is what fails on it.

Act on the advice. When a rule is wrong for this page, switch it off in `brief.md`, never in the source,
with the reason on the same line:

```markdown
## Checks switched off

- DR-SURFACES: the page is a catalog of surfaces and shows each one on purpose.
```

A line without a reason, or naming a rule the check does not know, is reported under `rejectedSwitches` and
switches nothing off.

## Look at the result

A page is not done until you have seen it. The `snapshot` command (its exact lines are in the commands
block of `SKILL.md`) builds the page and photographs it at 390, 768, and 1440 pixels, in the light and dark
schemes, with normal and reduced motion, and writes a contact sheet of first screens. Shots with motion are
taken on the page's own clock, stopped at the moment every entrance, count and transition has finished, so
two runs on an unchanged page give identical frames: a frame that changed between rounds means the page
changed.

The first of the two lines installs the browser once per machine; the second runs the command with
Playwright beside it, because the package does not ship a browser. Use the same Playwright version in both
lines. Without Playwright the command fails with `SNAPSHOT_BROWSER_MISSING` and the command to run.
`--widths`, `--schemes`, and `--motion` narrow the set. Every shot switches the page to its scheme, as the
reader's scheme toggle does, so a page that starts in `scheme: light` or `dark` is seen in both; a theme with
only a dark scheme stays dark.

A page with stops gets a frame per stop: every screen of `layout: screens` (`<shot>-screen-<n>.png`) and
every step of a pinned `scene="scrub"` (`<shot>-scene-<id>-<n>.png`), listed under `stops` in the result
with `fits`. A stop that does not fit the window — part of it cut at the fold — is the warning
`SNAPSHOT_STOP_CUT`; shorten or split that screen, since a reader who moves one screen per gesture never
sees what lies below it.

When the page carries an effect of your own (an extension with `kind: effect`), check it before you look:
`agentic-report effect-check <extension.yaml> --out <empty-directory>`, run with Playwright beside it like
`snapshot`. It builds the two examples the manifest lists and prints `N of M checks passed` with a line per
check — the declaration, the reduced-motion final state, time only from the page clock, a 50 ms budget per
effect call, colours only from theme tokens, no decoration on text, four widths, content edits, the same
states in every render mode, print, and two unlike examples. Fix every failed line; the frames it writes
(`frame-390.png` … `frame-1920.png`) show the effect at each width.

Look economically: what a check can say in words is cheaper than a frame. Read the build diagnostics and the
design check first, then run `snapshot` with `--measure`: it writes no pictures and prints, per width,
scheme and motion, the numbers a reviewer would otherwise read off frames — sideways overflow, text under
11 px (page text on a phone under 12 px), text below its contrast minimum with every `opacity` applied (a ghost at 0.18 is caught), text under
a fixed or sticky element, empty bands, clipped headings (a card heading past the window inside a sideways-scrolling rail is reachable, not
clipped), whether the title and the primary action are on
the first screen and how much of it the main scene takes, stops that do not fit, page errors, placeholders
and unloaded fonts. `defects` adds them up, and counts a title outside the first screen and a primary
action that the page has but not on its first screen. Fix every non-zero `defects`; then take only the
frames you still need with `--widths`, `--schemes` and `--motion`, not every frame on every round. Like
every `snapshot`, `--measure` needs an absent or empty `--out` directory: give each round a fresh one.

The measure also reports what a reader on a phone meets and a frame shows only if you look closely. Each
finding names elements by tag, id and class, with the nearest ancestor that has an id, and each counts in
`defects`:

- `tables.wide` — a table whose content is more than 1.25 times the window wide, so the reader scrolls it
  sideways several screens per row. Each entry of `tables.samples` gives `width`, `containerWidth`,
  `viewportShare`, `scrolls` and `emptyShare`. Shorten the columns, move long text out of the cells, split
  the table, or turn it into a list on a phone. A table that is meant to be read by scrolling sideways is
  marked `data-table-layout="scroll"` and is not counted.
- `tables.sparse` — a table where more than 70% of the cells' content area holds no text: one column is
  squeezed into a pillar of single words beside empty cells. Dense tables stay between 30% and 70%. Give
  the long column room, shorten it, or present the rows as cards. A table shown as cards is not counted.
- `tables.deadSurface` — a table whose filled surface is wider than its cells by more than a quarter of
  the track: a short table on a panel as wide as the page. `tables.flushText` — a table on a filled
  surface whose first or last cell's text is within 4 px of the surface edge. The package's tables own
  their surface at their own width with an inset; these come from a theme, extension or page style that
  paints a wider frame or removes the inset.
- `readingColumn` — the width most prose paragraphs share and its share of the window. On a window of
  480 px or less, a column under 88% (`narrow: true`) wastes the phone's width on double gutters; a single
  gutter of 16–20 px keeps it above.
- `codeBreaks` — inline code whose line breaks fall inside a word (`stagin|g`) rather than after a space,
  after `/ . _ - : ( ,`, or at a break the compiler put at the hump of a long camel-case word. Let long
  paths break at their separators, or put them in a code block.
- `diagramLabels` — SVG text in a figure or diagram that is under 11 px on screen (`small`, already
  counted in `smallText`) or cut with no way to reach it (`clipped`: by the window, the SVG itself, or a
  scrolling frame of a figure without the full-screen viewer). A label hidden only by the sideways scroll
  of a diagram that has the viewer is reachable: it is `scrolled`, reported but not a defect. Give the
  diagram a layout that fits the phone or let the reader open it full size.
- `offSchemeBlocks` — an image or surface of at least 120×80 px of which a fifth or more is 7:1 or more
  in luminance from the page background: a light screenshot on a dark page or a dark slab on a light one.
  Each sample gives the mean `luminance`, `pageLuminance` and the `share` of such pixels. Give the image a
  variant for each scheme or a surface from theme tokens. Primary actions and `tone="contrast"` bands are
  deliberate and not counted.
- `sectionColumns` — on a window wider than 48rem, a flow section whose blocks do not form one column
  with its prose (the width most of its direct paragraphs share): `misaligned`, a text block (heading, paragraph,
  list, quote, lead) whose left edge is more than 2 px off the column's left edge, or another block that
  neither starts there nor stands on the column's centre — and on a `document` or `mixed` page a block
  wider than the column must stand on its centre, overhanging it equally on both sides, and the title of a
  section of another composition (`split`, `stage`…) must start where the page title starts; `overrun`, a heading, lead,
  paragraph, list, quote or disclosure whose lines (a disclosure: its rules) run more than 24 px past the
  column's right edge; `emptyTrack`, a section where neither the column nor any block reaches 60% of the
  section's track; `codeWidth`, a code block that is neither the column nor the section's track wide (a
  third width beside its neighbours); `hollow`, a block wider than the column with a frame or fill, or an
  island frame, whose content ends more than 48 px and a quarter of its width before its right edge (an
  island's content width is the one it reports); `headWide`, a block of the page head (the title and what
  stands before the first section) running past the sections' right edge; `tocGap`, a column (on a `document`
  or `mixed` page the article's track, whose text stands on its axis) that starts more than 96 px right of
  the docked table of contents. Blocks inside an open disclosure count as the section's, and on a `document`
  or `mixed` page the article's own blocks form a column too; `screens` and `slides` pages are not measured. A
  picture of a `media="bleed"` section that meets the section edge is not misaligned. Each sample names
  the block, its `kind`, the `column` width and the offset, overrun or track width (`value`). The package's
  `document` and `mixed` sections compose this way by themselves; a finding comes from a theme, extension
  or page style that widens a text block, shifts a block, or a `width="wide"` flow section of prose.

`emptyBands` counts the empty space below the last content, names the element that ends each band
(`next`), and treats a rule without fill as ink only along its line. Bands are measured in the final state
of every entrance animation, so content that appears as the reader scrolls is not a band, and neither is
the scroll length of a pinned scene or a `zoom` flight; a full-page frame taken without scrolling can
still show it blank. Text the reader cannot see, such as the inside of a zoomed node before the camera
flies in, is not counted as small text.

Open `contact-sheet.png` and each `*-full.png` and look as a stranger would:

- Does the first screen say what the page is about and show it, or could it belong to a different product?
- Is any half of the first screen empty?
- Is the main effect noticeable at a normal scrolling speed, and does the main visual asset survive on a
  phone?
- Does anything overlap, overflow, or read badly at 390 pixels; does the dark scheme hold?
- How many clichés from [`art-direction.md`](art-direction.md) does it carry, and in what is this page
  better than the median page on its subject?

A page with motion is judged in a browser, not from frames: open it and scroll at a normal speed. Before
each round of fixes, reread [`design-rules.md`](design-rules.md) and [`art-direction.md`](art-direction.md).
Fix what you see, rebuild, and look again.

## Review before you hand over

Two independent reviews guard the page: one of the brief and the data before the first build, one of the
built page before handover. The reviewer is another agent or a person who did not write the page, because
an author checks the text against what they remember, not what is there. The first review checks the
brief and the material: numbers against their source, claims about the product against the code. For the
second, give the reviewer the files, the brief with its references, and a fixed list of questions for every
frame: what the frame shows, whether each number has its unit, date and source, what overlaps or is cut
off, and whether this beats the references in the brief. The reviewer returns the findings as text by
severity — blocking, major, minor — with the checksums of the files read. Besides correctness, the review
judges the look against the references in the brief. Hand over only when no blocking or major finding is
open.

A check proves something only if it tells apart the two states you care about: a check that would stay
green whether the page was done as intended or done another way proves nothing. Before trusting a check,
make it fail once on a counterexample.

## Keep the page checklist

`node scripts/checklist.mjs init <page-directory>` (the script is
[`scripts/checklist.mjs`](../scripts/checklist.mjs)) writes `checklist.md` beside the page, with the steps of
the order of work, the dimensions of the page's brief, the edition items when the brief names a previous
edition («Show what changed since the last edition»), the design rules, and the three gates of the
hand-over, all taken from the skill at that moment; a rule switched off in the brief starts closed as n/a
with the brief's reason. Close an item with its evidence after an arrow — `- [x] item → evidence`, or
`- [n/a] item → reason` — because a tick without a reason counts as open. The gates — the design check,
the prose check and `snapshot --measure` — close only with the stamp `handover.mjs` writes when the check
passes: the stamp carries a fingerprint of the page source, so a stamp written by hand, or one left from
before the page changed, counts as open. The Look step closes only with the path of a snapshot frame
(`.png`) taken after the last change of the page source and what it shows, such as
`- [x] Look → shots/390-dark-normal-full.png: the table turns into cards, nothing cut`; a look written
without a frame, or from a frame of an earlier version, stays open.
`node scripts/checklist.mjs check <page-directory>` exits with an
error while any item is open, and refuses a checklist with no items or without its gates.

## Hand over

Run the hand-over gate from the skill folder:

```sh
node scripts/handover.mjs ./my-page
```

The script is [`scripts/handover.mjs`](../scripts/handover.mjs). It runs the design check, the prose
check, `snapshot --measure` over every width, scheme and motion, and `checklist.mjs check`, writes the
result of the first three into the gates of `checklist.md`, and prints one record: `verdict` (`pass` or
`fail`) and `checks`, each with `name`, `passed` and its `findings` in the `rule`, `id`, `message`, `hint`
shape. It exits 1 unless every check passed, and the page is not handed over until it passes. `--cli`
names the agentic-report command as for the design check; for a new edition the design check and the
measure run with `--since` the previous edition, and the record names it as `since`. The measure needs Playwright and its Chromium
(the install line is in the commands block of `SKILL.md`); where no browser can run, `--no-browser
"<reason>"` skips it, and the reason is written into the checklist and the verdict so the person sees the
page was not measured.

Hand over only when the gate passes and no blocking or major review finding is open. Check that the brief
describes what was built, then report the source path, artifact path, starter, languages, warnings, the
advice and prose rules you switched off and why, and unresolved content facts. For a page with Response
Workspace, tell the user to copy or download `response.json` after completing the page.

## Respect source-review requirements

If the user does not trust the published npm package, do not run it through `npx`. Clone the release tag
pinned by this skill — `v` followed by `metadata.version` in the frontmatter of `SKILL.md` — expose the
checked commit for review, and run the locally compiled CLI:

```sh
git clone --branch v<version> --depth 1 https://github.com/witqq/agentic-report.git
cd agentic-report
git rev-parse HEAD
git tag --points-at HEAD
pnpm install --frozen-lockfile
pnpm verify
pnpm build
node dist/node/cli.js init ../my-page --starter document --json
```

Substitute `node dist/node/cli.js` for every `npx --yes agentic-report@<version>` command in `SKILL.md`,
and pass it to the design check as `--cli`. Keep page sources and outputs outside the cloned repository.
This avoids executing the npm package but is not registry-free: `pnpm install` still downloads the pinned
dependencies. Never describe a source checkout as audited merely because the source is visible.
