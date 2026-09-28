# Design rules

Each rule has a stable identifier, the reason behind it, a counterexample taken from real pages — pages
this package produced before the rule existed, or the landing of Moira (an MCP server that leads an AI agent
through a workflow), whose prototypes were built by hand and reviewed round by round in September 2026 —
and the fix. Rules marked **fix on sight** justify an edit the
first time you see the problem; the rest need judgement against the brief. The design check
(`scripts/design-check.mjs`) applies the rules marked **checked** to the structure of a built page and
names the rule it found broken. A rule is switched off for one page only by a line in that page's
`brief.md` under «Checks switched off», with the reason — never in the page source.

## Layout and first screen

### DR-NAV-ABOVE-TITLE — no navigation frame above a landing title · fix on sight

A landing page opens with its claim, not with its table of contents. The package keeps landing navigation
in the top bar menu; do not add `::contents` or a card grid of links before the title.
Counterexample: the 0.17 public landing opened with an «On this page» box across the full width above
«A page worth handing over», so the first thing a visitor read was a list of seven link labels.
Fix: leave navigation to the top bar; put `::contents` after the first screen if the page needs it. A
vertical list of chapters beside the title, in the margin rather than across the column above it, is
allowed: it does not stand between the reader and the claim.

### DR-OPENING-MEDIA — a landing shows its product on the first screen · checked

A visitor decides in the first screen whether the product is real. Before the first section, or as a
first section with `recipe="demo"`, show a result: a screenshot, a clip, a diagram, or code beside what it
produces.
Counterexample: the 0.17 landing starter opened with a title, two paragraphs, and three buttons; the first
picture of the product came two screens later.
Fix: add `recipe="demo"` to the first section and put the product in it, or place an image, `video`,
`diagram`, `timeline`, or a code block right after the introduction.

### DR-LANDING-ORDER — do not keep the starter's order of recipes · checked

The landing starter shows one possible order. A page that keeps it recipe for recipe reads like every
other page made from the starter.
Counterexample: every 0.17 landing example opened with `hero`, and the cinematic story, the terminal
portfolio, and the motion showcase drew their chapters from the same five recipes — hero, story, rail,
metrics, evidence — so the pages differed mostly in their words.
Fix: order chapters by the argument in the brief — what the reader needs first, second, and last — and use
the recipes that argument needs.

### DR-MAIN-SCENE-SIZE — the main scene takes a real share of the screen, on every width · judgement

A main scene that fills a corner reads as an illustration, and one that collapses on a phone leaves the
page without its point.
Counterexample: in the second round of the Moira landing (September 2026) the graph of one direction took
about 440 of 1440 pixels, some 30 % of the screen, and below 1024 pixels the main scene lost its motion
entirely; in another direction the hero photograph under a 62–90 % mask became a grey strip on a phone.
Fix: give the main scene the larger part of its screen at 1440 pixels, and check at 390 pixels that the
main visual asset is still there and still readable; if it cannot survive, design its narrow version on
purpose rather than letting it shrink.

### DR-LINE-LENGTH — reading lines stay between about 45 and 80 characters · fix on sight

Long lines lose the reader at the line break; short lines chop sentences.
Counterexample: a 0.17 response workspace at 304 pixels squeezed its answer column to four characters per
line.
Fix: keep prose at `width="reading"` or the default track; widen only tables, code, diagrams, and galleries.

### DR-HEADING-HIERARCHY — one page title, then chapter titles · fix on sight

The page has one `#` title; every chapter is a `section` with its own title. Do not fake a heading or a
status with a bold paragraph, and do not start a chapter with a third-level heading.
Counterexample: the 0.17 dashboard starter opened each card with a bold one-word paragraph — «**Green**»,
«**Covered**», «**Verified**», «**0**» — so the card title and a bold line competed for the heading role
and the status was not machine-readable.
Fix: turn the bold line into a `section` title, a real heading at the right level, or a `card status`.

## Surfaces, colour, and type

### DR-BLOBS — no blurred colour blobs, meshes, or glows behind content · fix on sight

A soft violet blob behind a heading is the signature of a generated page and tells the reader nothing.
Counterexample: the 0.17 `mesh` and `glow` surfaces drew blurred radial gradients behind the incident
review's «Impact signal», the launch readiness page's «Launch signal», and the opening chapters of the layout
examples.
Fix: use a plain section, a one-colour `tint`, `grain`, `grid`, or `blueprint`, or no surface at all.

### DR-SURFACES — at most two chapters with a decorative surface · checked

A surface marks a chapter as different. When most chapters have one, none of them is different.
Counterexample: the 0.17 `layout-mixed` catalog put `mesh`, `glow`, `grain`, or `grid` on six of its eight
chapters, and the visualization catalog put a surface on all five.
Fix: keep surfaces for the one or two chapters that change the mood — an opening, a closing statement —
and leave the rest plain.

### DR-ONE-ACCENT — one accent colour, used for action and emphasis · fix on sight

A page with an indigo-to-violet gradient, a teal badge, and an orange button has no accent, and an accent
borrowed from every other generated site says nothing about this one.
Counterexample: the 0.17 default theme painted links, buttons, focus, and a glow behind the page in indigo
`#3856d8`, the stock accent of generated sites, so pages about unrelated subjects shared one colour.
Fix: choose one accent in the theme (`accent`), from the subject when it has a colour, and let charts use
the theme's chart colours.

### DR-SIGNAL-COLOUR — one signal colour stands for one status · judgement

A signal colour is an alarm. Spread over every status it stops meaning anything, and a status told only by
colour is lost to a colour-blind reader and in print.
Counterexample: the «Form» prototype of the first Moira landing round stamped every step red, including
«Accepted», so the whole column read as an alarm; the reviewer asked for «Accepted» in ink and red only on
the refusal.
Fix: keep the signal colour for the one status the reader must act on (a refusal, a risk); draw the rest in
ink or neutral; give every status a word or a shape as well (`card status` says it in words).

### DR-NOT-YET — what is not reached yet is muted by colour, not by transparency · judgement

Opacity lowers the contrast of text below what the reader can see, and an automatic contrast check that
reads only the colour does not notice it.
Counterexample: in the second Moira landing round the steps a run had not reached were drawn at opacity 0.18
and read as grey ghosts; in another direction elements muted through `opacity` measured 2.36:1 and 3.19:1
against their background.
Fix: mute with a quieter colour that still meets the contrast rule; if transparency is unavoidable, never go
below 0.35 and measure the contrast of the final colour in both schemes, after every animation has ended.

### DR-FIGURE-TEXT — text inside a figure is at least 11 px on screen and in the page's language · judgement

A figure scaled to fit a narrow column scales its labels with it, and a label in another language breaks
the page for the reader it was written for.
Counterexample: in the second Moira landing round the text inside one direction's figures measured 4.5–6.9
pixels on screen, labels of the first round's hero were about 6 pixels at 400 pixels wide, and a Russian
figure carried English labels.
Fix: use the package's `diagram`, `chart` and `timeline`, which keep their labels readable, or put the
labels in the text beside a picture; translate every label of a figure with the page; a screenshot whose
text would fall below 11 pixels on a phone becomes a diagram drawn from the data
([`assets.md`](assets.md)).

### DR-CONTRAST — every text meets WCAG AA contrast · fix on sight

The build checks the contrast of a theme's text, links, primary action, and focus in both schemes. Text on
an image or a coloured band is your responsibility.
Counterexample: in 0.17 the teal accent `#087f75` on the muted surface `#e8edf5` measured 4.15:1, below the
4.5:1 AA threshold for text, and nothing checked the pair.
Fix: put text beside the image, not on it, or use a section `tone` whose text colour the package owns.

### DR-TIGHT-TRACKING — display type must not fuse words · fix on sight

Tight negative tracking on a large heading merges words, and Cyrillic suffers first.
Counterexample: the 0.17 landing heading rendered «A page worth handing over» with −0.06em tracking so
the words read as «Apageworthhanding»; the Russian version fused worse.
Fix: use a built-in theme (they cap tracking and add Cyrillic word spacing), and in your own theme keep
`headingTracking` at −0.03 or looser.

### DR-RU-TYPOGRAPHY — Russian text follows Russian typography · fix on sight

Quotes «ёлочки», a non-breaking space after one- and two-letter words and before a dash, and no English
quotes in Russian text. See [`typography-ru.md`](typography-ru.md).
Counterexample: the 0.17 Russian architecture example wrote «…ограниченные partials и локальные ресурсы…»
and «…с помощью рендереров…» with ordinary spaces, so a narrow screen could leave «и» or «с» alone at the
end of a line.
Fix: put a non-breaking space after the short word.

## Content and material

### DR-REAL-MATERIAL — real material, not stock or generated pictures · fix on sight

A screenshot of the real product, a chart of the real numbers, or a diagram of the real system proves
something; a generated illustration proves nothing.
Counterexample: the 0.17 showcases used generated abstract art as their hero images.
Fix: take a screenshot of the build, film the product with agentic-screencast, or draw the system with
`diagram`. A generated picture is allowed only with its reason written in the brief, at most one per page.
See [`assets.md`](assets.md).

### DR-SCENE-CARRIES — without the main scene the page must lose its point · judgement

A scene that can be removed without losing a number, a refusal, or the path is decoration, however
beautiful. The deletion test says whether the metaphor is the material of the page or a picture beside it.
Counterexample: the first Moira landing round drew its «thread» as a flat one-pixel SVG line of constant
width on paper, while the times, the returns and the text of the refusal lived in the table and the event
grid under it; the line was a picture of the process, not its carrier, and the owner rejected the round as
crude.
Fix: put in the scene what the page proves — the numbers, the refusal, the path taken — and check that
removing the scene would remove them; otherwise shrink the scene to an ornament or drop it.

### DR-PROCESS-FROM-DATA — a process is drawn from its data, not by hand · judgement

A chain drawn by hand shows what the author remembers, not what the system does, and it drifts as the
system changes. A mock-up with numbers looks like a record.
Counterexample: the live Moira landing (2026-09-25) drew «Made with Moira» as a hand-made chain PLAN → CODE →
TESTS → DOCS → GIT → NOTIFICATION, not from the flow, and showed a message mock-up «Step 4/6 done: tests
passed (42/42)» whose numbers were illustrative; in the second round a screenshot of the flow was so small
and blurred that the owner said nothing in it could be understood, and it was replaced by a map of blocks
built from the flow's definition.
Fix: build the `diagram` from the real definition (its nodes, connections and returns), show the run as it
was recorded, and label every illustrative number in a mock-up as an example on the page.

### DR-DATA-SLICE — every figure with data names its source and its moment · judgement

A reader cannot check a figure that does not say which data it shows, when it was taken, and which field
each number comes from.
Counterexample: the first Moira landing round said «the run is still going» about an export taken on
25.09 at 01:17 Moscow time, labelled «sixth review, zero findings» with the time the review was entered
rather than left, filled two numbers by script as «unchanged» without saying so, and in the second round
showed two runs in one figure without marking where one ended.
Fix: put a source line under every block of data — which run or system, taken when, how many records;
describe a snapshot as a snapshot («as of the export on …»); label a time with the event its field records;
mark a derived number as derived; call an unknown number unknown on the page («at most 500 characters, the
exact length is unknown»); mark a change of run inside one figure. In the source: read the figures from the
export with `data` and `{{…}}`, guard each claimed count with `::expect`, write the line with
`::source-line[…]{date zone}`, and mark a message mock with `illustrative="true"`
([`compose.md`](compose.md#build-a-page-from-data)).

### DR-HEADING-COUNT — a number in a heading is counted by a stated rule · judgement

A count in a title is the claim readers remember, so a wrong one is the most visible mistake on the page.
Counterexample: a first-round Moira title said «Five paths back» and counted the «next unit» loop, which is
not a path back; the flow had four.
Fix: write the counting rule in the brief («returns to an earlier block, loops excluded»), derive the number
from the data by that rule, and check it against the source before handing over.

### DR-NAME-NOT-COUNT — name what a product can do instead of counting it · judgement

A count of features, themes, or layouts goes stale with the next release while the page keeps saying it.
Counterexample: this package's own documents said «four layouts» and «six starters» after the product had
changed, and the Moira project forbids drifting counts in its own rules for the same reason.
Fix: name the capabilities, or leave the number to something generated from the product; if a count must
stay, check it against the code before every handover.

### DR-EXAMPLE-SCOPE — what is true of an example is said of that example · judgement

A property of one sample presented as a property of the product is a false claim, and a caption that joins
data from different levels invents a contract nobody wrote.
Counterexample: a first-round Moira page said «until the plan has passed an independent review, work does
not start» — true of the Quick Task flow shown, not of Moira; a column «the agent must return» merged the
fields of two different steps and left out the step that was refused.
Fix: tie every statement about an example to the example's name («in Quick Task …»), and caption a group at
the level its data has.

### DR-PRIVACY — only safe fields reach the page · judgement

A page travels further than its author expects: a task title, a customer name or a quoted prompt in it
leaks with every forward.
Counterexample: the second Moira landing round quoted an edited English sentence that carried the private
text of a task, and annotated a clip with solid pills laid over the recorded data.
Fix: show identifiers, names of steps, times, counts, and the text of an error; show a model's answer only
as its length; crop or cover task titles in screenshots and clips; put annotations outside the data, beside
the frame; record in the brief which fields were judged safe.

### DR-CARD-SAMENESS — cards differ by content, not only by words · checked

Three cards with an icon, a two-word title, and one sentence each are a template, not information, and a
long run of cards of one form is a wall the reader stops reading.
Counterexample: the 0.17 landing starter's «Write naturally», «Add intent», «Ship static output» — three
cards of two words and one sentence each, interchangeable in order and in content.
Fix: give each card the fact that makes it different — a number, a status, a screenshot — or write the
three sentences as a paragraph; split a long series into titled groups, a table, or a list. The check reads
card forms only and names a group of eight or more cards that all share one form (a group whose every card
is a link is an index and passes); three plain cards it cannot tell from three distinct ones, so judge those
yourself.

### DR-NUMBERS-UNITS — every number carries its unit and its date · fix on sight

«74%» of what, measured when? A number without both is decoration.
Counterexample: the 0.17 dashboard starter said «137 focused checks passed in the current environment» with
no date, build, or source.
A second counterexample: in the second Moira landing round the «1» of a fifth return stood against «9 of 10
items» and read as «1 9 of 10», and a label «0 · accepted» did not say zero of what.
Fix: write the unit, the population, and the date next to the figure or in its caption, and keep a word
with every number («0 findings · accepted»). Leave a clear gap between neighbouring numeric labels so two
figures never read as one. When the source does not give the unit or the date, list the figure under
«Unresolved content facts» instead of guessing. A count beside its noun is `:plural`, so the noun agrees
with the number even when the data change.

### DR-CAPTIONS — every picture explains itself · fix on sight

A picture has alternative text that says what it shows, and a caption when the reader needs to know why it
is there, in the words the product uses for what is on screen.
Counterexample: the 0.17 `layout-mixed` catalog showed one and the same `layout-map.svg` eight times under
eight different alternative texts — «Foundation layer», «Evidence layer», «Decision layer», «System view» —
so the text described pictures the page did not have.
A second counterexample: the risky techniques listed from agentic-screencast for the Moira landing included
slogans in place of captions and decorative «before/after» cards in place of footage.
Fix: one picture per meaning, and alternative text that describes that picture. A caption names what is in
the frame in the product's own words — the step, the field, the result — never a slogan about it.

## Motion

### DR-UNIFORM-ENTRANCE — not every chapter enters the same way · checked

When every section reveals the same way, the reader learns to wait instead of reading.
Counterexample: the 0.17 recipes gave hero, rail, and metrics a staggered entrance, so a page built from
them made every block fade up in turn.
A second counterexample: the first prototypes of the Moira landing were rejected as crude partly because
their motion was the same everywhere: every block entered the same way, so no movement marked the moment the
story turned.
Fix: let most chapters simply be there; keep an entrance for the one or two chapters that change the story.

### DR-ONE-EFFECT — at most one pointer or magnetic effect per page · checked

Depth, tilt, and magnetic buttons each ask for attention. Two of them compete; three make the page a
toy.
Counterexample: the 0.17 executive brief combined pointer tilt on one section with magnetic pull on two
primary buttons, so three elements moved under the pointer on one screen.
Fix: keep the one that carries meaning — usually on the hero — and remove the rest.

### DR-MOTION-MEANING — motion shows a change in meaning · judgement

A diagram that draws its flow in order, a number that counts because it is new, a picture that changes with
the step being explained: these carry meaning. Motion that only decorates distracts.
Counterexample: the 0.17 motion showcase put pointer depth on the hero, tilt on a card, and a magnetic pull on
two buttons of one page; none of the movements told the reader anything about the subject.
A second counterexample: the same first Moira round showed the process — a plan returned by review, a refused
answer, a fix — as a static picture, so the order of events, which was the point, had to be read from labels.
Fix: for each moving element, say in one sentence what the reader learns from the movement; remove the
ones without an answer. A process whose order is the explanation moves in that order: `scene="steps"` over
one picture, or `draw="scroll"` on its diagram.

### DR-MOTION-ORIGIN — every movement comes from somewhere, and the main gesture is visible · judgement

An entrance that slides in from nowhere is noise; a meaningful gesture too small to notice is wasted. The
two are different classes of motion and get different sizes.
Counterexample: in the second Moira landing round the «jerk» of a refused step was a 10-pixel dip the
reviewer could not see — about 40 pixels of recoil were needed — and a fly-in «is easy to miss at normal
scroll speed»; elsewhere secondary elements kept moving while the main gesture played.
Fix: an entrance moves at most 16 pixels, toward the source it comes from, and scales only from 0.97 to 1;
a meaningful gesture (a jerk, a cut, a recoil) is large enough to see at normal scroll speed, around 40
pixels; while the main gesture of a screen plays, everything else stands still and text arrives before or
after it. Check each key effect at normal scrolling speed, not frame by frame.

## Effects and weight

### DR-WEBGL-FALLBACK — a WebGL scene at rest is no worse than its fallback · judgement

WebGL is a layer over a page that already works. When the effect at rest looks worse than the still picture
under it, or sets states the other render paths never get, the effect costs the page.
Counterexample: in the second Moira landing round one WebGL scene lifted the blacks of its picture and drew
hairline seams about every 15 pixels, and in another direction the step statuses were set only inside the
WebGL path, so under reduced motion and without WebGL they disappeared.
Fix: at rest the effect must match the still picture pixel for pixel; every state the scene shows exists in
every render path; the still version is drawn directly in its final state from the same geometry, not a
single screenshot of the effect.

### DR-ONE-COORDINATE-SPACE — a drawing and its labels share one coordinate system · judgement

An SVG layer scaled one way and HTML labels placed another way agree at one width and drift apart at every
other.
Counterexample: in the second Moira landing round an SVG layer was scaled with
`preserveAspectRatio="xMidYMid meet"` while its HTML labels were positioned against the page, and the row
captions landed one row below their rows.
Fix: draw labels inside the figure's own coordinate system, or keep the `viewBox` equal to the figure's box;
the package's `diagram`, `chart`, and `timeline` already do this.

### DR-CANVAS-LAYERS — nothing translucent over a decorative canvas, no control over text · judgement

A decorative canvas that runs under translucent, blurred blocks turns to mud, and a floating control laid
over text hides the words it sits on.
Counterexample: in the second Moira landing round the thread canvas ran under blocks with
`backdrop-filter`, so the thread went muddy behind them, and a floating pause button covered text on a phone.
Fix: give blocks over a decorative scene an opaque background or none at all; keep pause buttons and other
controls in the flow of the page, beside the content they control, never on top of text.

### DR-PAGE-WEIGHT — the page fits its size budget · judgement

Speed is part of a premium page, and a single file that carries several clips becomes too heavy to send.
Counterexample: in 0.17 exceeding `output.maxInlineBytes` only warned, and the `cinematic-story` example
alone weighed 3.66 MB with one clip; the Moira landing prototypes set themselves an 8 MB ceiling per file and
failed their own bundle above it.
Fix: keep one file under the budget (the build now fails above `output.maxInlineBytes`), put a page with
several clips in a directory build, follow the sizes in [`assets.md`](assets.md), and check the first
screen's bytes with `inspect` before handing over.

## Process

### DR-BRIEF — the page has a filled brief beside its source · checked

`brief.md` records who the page is for, what the reader must do after reading, the material, the art
direction, and every design check switched off with its reason. Without it the next agent cannot tell a
decision from an accident.
Counterexample: none of the 0.17 examples had a brief, so nothing recorded why the showcase used generated
art or why the landing kept the starter's order; each later edit had to guess.
Fix: copy the brief from the starter of the page's category and fill every dimension row with its answer and
its source (`request`, `asked`, or `inferred`); the check names the rows left empty.

### DR-BRIEF-MATCH — the page does what the brief decided · checked

The brief is the decision; a page that contradicts it was built from a different decision nobody wrote
down.
Counterexample: the review of this package's landing in September 2026 counted «the brief and the result
diverge» among its 37 defect classes, and nothing but the reader's eye compared the two.
Fix: when the brief answers motion «None», write `motion: none` in the manifest and drop the motion
attributes, or change the brief's answer and give the reason. The check names a brief whose motion answer
is «None» while a section still moves, an action is magnetic, or another element moves by itself — a
`:count`, a `count-up` chart, a diagram with `draw="scroll"`, `pulse` or `zoom`, a `demo` with `play`, a
`:swap`, `:typing` or `:mark`, a `spotlight`, a `video` with `seam="fade"` — and the manifest has not
stopped the page.
