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

## Keep the brief with the source

It records who the page is for, the chosen concept, the «Media» provenance table (empty, with a sentence
saying so, when the page has no files under `assets/`), every design check switched off with its reason,
and the unresolved content facts. It describes what was built: when the page changes, the brief changes
with it, and before handover you check one against the other.

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
`DR-LANDING-ORDER`, `DR-SURFACES`, `DR-UNIFORM-ENTRANCE`, `DR-ONE-EFFECT`, and `DR-BRIEF`. `--cli <command>`
names another agentic-report command, such as a local `dist/node/cli.js`.

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
`--widths`, `--schemes`, and `--motion` narrow the set. A page that pins `scheme: light` or `dark` shows
that scheme in both.

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
(`frame-390.png` … `frame-1920.png`) show the effect at each width. `--built-in threads` runs the same checks
over the package's own WebGL effect.

Look economically: what a check can say in words is cheaper than a frame. Read the build diagnostics and the
design check first, then run `snapshot` with `--measure`: it writes no pictures and prints, per width,
scheme and motion, the numbers a reviewer would otherwise read off frames — sideways overflow, text under
11 px, text below its contrast minimum with every `opacity` applied (a ghost at 0.18 is caught), text under
a fixed or sticky element, empty bands, clipped headings, whether the title and the primary action are on
the first screen and how much of it the main scene takes, stops that do not fit, page errors, placeholders
and unloaded fonts. `defects` adds them up, and counts a title outside the first screen and a primary
action that the page has but not on its first screen. Fix every non-zero `defects`; then take only the
frames you still need with `--widths`, `--schemes` and `--motion`, not every frame on every round. Like
every `snapshot`, `--measure` needs an absent or empty `--out` directory: give each round a fresh one.

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
the order of work, the dimensions of the page's brief, and the design rules, all taken from the skill at
that moment; a rule switched off in the brief starts closed as n/a with the brief's reason. Close an item
with its evidence after an arrow — `- [x] item → evidence`, or `- [n/a] item → reason` — because a tick
without a reason counts as open. `node scripts/checklist.mjs check <page-directory>` exits with an error
while any item is open, and refuses a checklist with no items.

## Hand over

Hand over only when `node scripts/checklist.mjs check <page-directory>` reports no open items and no
blocking or major review finding is open. Check that the brief describes what was built, then report the
source path, artifact path, starter, languages, warnings, advice you left in place and why, and unresolved
content facts. For a page with Response Workspace, tell the user to copy or download `response.json` after
completing the page.

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
