# Art direction

Art direction is the decision about how the page looks and moves, made from the subject and the reader
before any directive is written. On a page where the look decides the result — a landing, a showcase, a
portfolio, a presentation — study references first, offer the person two or three concepts, and let the
person choose. On a report or a dashboard, pick one yourself and write it in the brief.

## Study references before the concepts

For a landing or a showcase, look at 5–10 real sites on the same subject before writing a single concept,
and write in the brief (the `references` row) what each one teaches: a technique to take, a measurement, and
the cliché it carries. A first round built only from a list of things to avoid passes every ban and still
looks cheap. References give rhythm and technique, not code: never copy a site's code or assets
([`assets.md`](assets.md), licences). The measured sites in [`themes.md`](themes.md) and the exemplars in
[`playbook.md`](playbook.md) are a starting set, not a substitute for sites on the page's own subject.
For each new reference, record the capture date and viewport alongside any measured size or colour: a live
site can change after the study. The first Moira landing round (September 2026) studied only how to avoid
generated-looking pages; its four resulting directions were rejected as crude despite obeying those bans.

## What makes a page premium

Avoiding clichés removes the template but does not make a page good. The four prototypes of the first Moira
landing round had no indigo, no Inter, no glow, no identical cards, no emoji, and passed the «cover the logo»
test; the owner still called them crude. A considered page carries one point of view through its layout,
type, evidence and motion. Build the concept from these practices:

| Practice                       | What it means on the page                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| The product is the demo        | The real interface, a reconstruction of it, or a clip on the first screen, at natural size; the product larger than the title |
| One metaphor as material       | One object carries the idea through the page and changes state; it is what the page is made of, not a caption (below)         |
| A through-line                 | One element passes through every chapter — a line, a light, a sticky contents — and the colour of a cause matches its effect  |
| Directed motion                | Every movement has an origin and says what changed; while the main gesture plays, everything else stands still                |
| Type as the signal             | A deliberate pair, a large contrast of sizes, light weights at display size, «the key sentence bright, the explanation muted» |
| The language of a drawing      | Figure captions («FIG 0.2»), numbered sections in brackets, a monospace readout — where the product is technical              |
| Real numbers                   | Figures from the source with their date and unit; a live figure beats a static one; an unknown figure is called unknown       |
| Restraint                      | One accent, one effect, calm and fast; the cheap page shows itself by inconsistent spacing, not by a missing effect           |
| Reduced motion for every scene | Each scene has a still version drawn directly in its final state, a narrow-screen version, and a printed equivalent           |

Four shifts turn a concept from average to considered, and each concept should answer them: the product as
demo, the metaphor as material, direction of motion, type as a decision — with the palette and the faces
taken from the subject.

The September 2026 reference study behind this list recorded the useful choices, rather than a style to
copy: Linear reserved colour for signals, Stripe used light display type, Warp let a terminal-like product
surface lead, Cursor gave the real interface more area than its title, and Igloo Inc used one changing
object as the page's visual motif. Choose only the technique that supports the current subject.

## One metaphor, one object

- **One metaphor, one object, two inks and one material.** Igloo Inc builds its page from one ice object in
  two colours (`#b6bac5` and `#383e4e`) that changes state as the reader scrolls; Oryzo shows one object
  revealing its properties. A second metaphor on the same page dilutes the first.
- **The metaphor is the material, not a caption.** A flat line of constant width on paper reads as a
  diagram: the first Moira round drew its main object as a one-pixel SVG path and was rejected as crude;
  the accepted round gave that object visible volume, light and a response to motion. A metaphor expressed
  as a table stays a table.
- **The deletion test.** Remove the main scene in your head: if the page loses none of its numbers, its
  refusal and its path, the scene is decoration (`DR-SCENE-CARRIES` in [`design-rules.md`](design-rules.md)).
- **Chaos grows only inside a frame.** Organic or generative material lives inside a disciplined layout:
  the grid, the type and the controls stay calm around it. A few controlled forms can say more than a
  million particles.
- **One solved element per screen.** Every screen has one element that is not a stock component — a stamp
  turned across a ruled frame, a number set in place, a line that leaves the column — and it is the one
  thing the concept names as its solved element. Everything symmetric on the grid is a template.
- **Traces of authorship.** A real author's name, real dates, a dated change log: a page that could only be
  about this product and by these people.
- **Check the metaphor against the thesis.** A glowing brain for a product whose point is that the model is
  an unreliable worker says the opposite of the page.

For a generated field, start from a bounded area and a small set of controlled paths; vary density or
direction to show the data, while labels and controls remain fixed. This is the transferable lesson from
flow-field studies, not a reason to add particles. The ice-object and changing-object examples above, and
the two Moira landing rounds, were recorded in the September 2026 direction review.

## Write a concept

A concept is ten lines, each of which could be wrong for another page:

| Line           | Says                                                           | Example                                                      |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Name           | A short handle the person can choose by                        | «Lab notebook»                                               |
| Idea           | What the page is like, taken from the subject                  | Field notes of an engineer, measured and dated               |
| Main object    | The one object or metaphor that carries the page               | The oscilloscope trace, redrawn from the lab's own data      |
| Theme          | A built-in theme or your own ([`themes.md`](themes.md))        | `neutral` with `accent: moss`, `fonts.pair: blueprint`       |
| First screen   | What the reader sees before scrolling                          | The title beside a real oscilloscope screenshot              |
| Order          | The recipes in the order of the argument                       | `demo`, `evidence`, `blueprint`, `statement`, actions        |
| Motion         | How much and where, or none                                    | `draw="scroll"` on the one wiring diagram; nothing else      |
| Solved element | The one element per screen that is not a stock component       | Measurements set in the margin like a lab stamp              |
| At 400 px      | What the phone reader sees and what changes from the wide page | The trace above the title; the diagram in its `down` view    |
| Cliché check   | The clichés nearest to this concept and why it avoids them     | «Cream + serif»: grey paper and a moss accent, no terracotta |

Two concepts differ when they differ in at least three of theme, first screen, order, and motion. «Dark»
and «light» versions of the same page are one concept.

Take the concept from the subject: a tool for accountants can look like a ledger, a hardware product like
a lab notebook, a game studio like a level map. A concept that fits any product fits none.

## Show concepts and let the person choose

For a landing, a showcase, a portfolio, or a presentation, offer two or three concepts and let the person
pick, unless the request already names the look — then the question is answered and you do not offer
concepts. The concept choice counts toward the budget of questions ([`process.md`](process.md)), and the
chosen concept also answers the brief's `first-screen` and `motion` rows (source `asked`), so do not ask
about them separately. For other pages choose yourself and say so in the brief.

The person chooses the concept; your own ranking is advice, not the decision. The first Moira round showed
each direction as a first screen and one block, and the owner read the missing rest as sloppy work: on a page
where the look decides, show each concept as a whole page with every chapter and its motion. A rough pass of
the chosen concept with placeholders is your internal step, never the thing you show.

Compare the concepts on the same axes, in one table, so the choice is between like and like:

| Axis                         | Concept A | Concept B | Concept C |
| ---------------------------- | --------- | --------- | --------- |
| Main object                  |           |           |           |
| Cliché risk                  |           |           |           |
| Weight (bytes, WebGL, video) |           |           |           |
| On a phone                   |           |           |           |
| What shows the mechanism     |           |           |           |

Send the variants in one message the person can forward, ending with the question which one to take; open a
page with motion in a browser rather than recording it. Keep every version you have shown as its own
artifact before changing it, and list them on an index of variants ([`playbook.md`](playbook.md)).

## Clichés and their fixes

| Cliché                                                              | Why it fails                                                      | Fix                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Violet-to-blue gradient behind a centred title                      | The signature of a generated page; says nothing about the subject | One accent from the subject, a plain surface (`DR-BLOBS`)                                                                        |
| Hero, three feature cards with icons, testimonials, call to action  | Every landing made from a template has it                         | Order by the argument in the brief (`DR-LANDING-ORDER`)                                                                          |
| Three cards of «Fast», «Secure», «Simple»                           | Claims without proof                                              | One claim with its evidence beside it (`recipe="evidence"`)                                                                      |
| A bento grid of feature cards                                       | The same three cards in a fashionable box                         | One claim with its proof, or ruled cards that each carry a different fact                                                        |
| Glassmorphism panels, glows, floating blobs                         | Decoration standing in for content                                | Real material on a quiet surface                                                                                                 |
| A glow on anything                                                  | Light without a source reads as a filter                          | A matte, lit material, or a thin ink line                                                                                        |
| Every block fades up on scroll                                      | The reader waits instead of reading (`DR-UNIFORM-ENTRANCE`)       | Motion only where it shows a change                                                                                              |
| Every heading animated letter by letter                             | Noise, and screen readers read the letters apart                  | One or two titles by line or by word, where the movement says something                                                          |
| A custom cursor; a preloader or a 0–100 % counter                   | The reader waits for, or chases, an effect                        | The system cursor; content that is there on arrival                                                                              |
| Abstract generated art as the hero                                  | Proves nothing (`DR-REAL-MATERIAL`)                               | A screenshot, a clip, a diagram of the real thing                                                                                |
| A flat infographic (metro lines, circles, dashes) as the main image | Correct and plain: a diagram where the page needs a material      | The metaphor as a lit material, or the real product at size                                                                      |
| Emoji as feature icons                                              | Looks like a chat, renders differently (the prose rules)          | No icon, or the fact that makes the card different                                                                               |
| Numbers counting up everywhere                                      | Animation replaces the value                                      | `:count` on one figure that is new; plain numbers elsewhere                                                                      |
| Tight, heavy display type on every heading                          | Fuses words, shouts (`DR-TIGHT-TRACKING`)                         | Display type on the title only; default tracking                                                                                 |
| A particle or WebGL background «for depth»                          | Costs battery, means nothing (`DR-ONE-EFFECT`)                    | A WebGL effect only where its motion is the subject                                                                              |
| A shader background with no meaning                                 | The mesh gradient of 2026                                         | A real picture, a plain surface, or the effect where its motion is the subject                                                   |
| Dark + neon + shader + bento grid                                   | One of the two fashionable looks of 2026: seen everywhere         | Palette and type taken from the subject                                                                                          |
| Cream paper + serif display + terracotta (+ mascots)                | The other fashionable look of 2026, an imitation of one AI lab    | Neutral paper, ink, one accent from the subject                                                                                  |
| Acid green on black, phosphor glow, scanlines                       | A costume of a terminal, not a terminal                           | Graphite, grey text, one muted green; no texture over text                                                                       |
| Magenta and cyan on violet night, a synthwave grid                  | A genre poster, not a product                                     | Only for games and music, and then on purpose                                                                                    |
| Near-black page, grotesque, grey subtitles, a bento of dark cards   | The Linear-style dark template                                    | Ruled cards, one signal colour, a real product shot                                                                              |
| Neutral palette + grotesque + 0.5rem radius + bordered cards        | The stock component-kit look                                      | A voice: a serif display, sharp corners, ruled cards                                                                             |
| Beams, a spotlight behind the cursor, aurora, glowing cards         | The AI-startup look                                               | Real material on a plain surface                                                                                                 |
| Spaced capitals over star dust or particles                         | A template of a «premium» launch                                  | Capitals on the page title only, no particles                                                                                    |
| An eyebrow in capitals joined by dots («ENGINE · MCP · APACHE-2.0») | The first line of every generated launch page                     | A plain eyebrow in the text face, or none                                                                                        |
| A title and two pill buttons, no product                            | The reader learns nothing before scrolling                        | Title on the left, one action, the secondary one as a link, the product beside them (`recipe="demo"`)                            |
| A call-to-action box with two buttons at the end                    | A closing template; a framed button reads as an afterthought      | A final scene: the main image resolved, one action inside it                                                                     |
| A logo strip, an integrations cloud, a testimonial wall             | Borrowed proof the reader cannot check                            | One named customer with a real quote and a date, or the product's own evidence                                                   |
| A switcher of SDK languages for its own sake                        | Interaction that shows the same thing five times                  | One real snippet in the reader's language; tabs only when the reader truly picks one                                             |
| A gold CSS gradient, gold on black                                  | Reads as cheap luxury                                             | Metal only as a photograph or a render; one small metal detail among matte forms                                                 |
| White marble as «eternal classic»                                   | A texture pasted on a plane                                       | A scan or photograph with light, large, monochrome, as a fragment                                                                |
| Paper and one ink, no material, light, or depth                     | Correct and plain: the rejected first round of the Moira landing  | Two inks and one material with light                                                                                             |
| Newspaper hairlines with dense columns                              | The ruled template of an «editorial» page                         | Fewer, wider columns; rules only where they separate meaning                                                                     |
| The same radius on everything; everything symmetric on the grid     | Nothing was decided                                               | Radii by role; asymmetry and one solved element per screen                                                                       |
| Pathos in the text («the fabric of destiny»)                        | Theme as costume                                                  | Say what the product does; at most three verbs of the metaphor                                                                   |
| The default palette of a CSS framework (indigo-500, slate)          | What an averaging generator produces                              | A named accent from the subject; own neutrals                                                                                    |
| A tilted dashboard, a screenshot in made-up browser chrome          | The product shown as a prop, not as it is                         | The real interface flat and at size; `frame="browser"` only with the page's real `address`, a mock-up with `illustration="true"` |

Four or more of these on one page mean an average page, not a distinctive one.

The 2026 cliché survey and the rejected Moira prototypes supplied these counterexamples. Check the
mechanism as well as the look: splitting a heading into animated letters can disrupt its reading order,
and a custom cursor can hide the expected pointer or make a target harder to acquire. Keep each heading
as readable text and retain the system cursor. The live Moira landing was reviewed on 2026-09-25.

## A synonym is not a fix

These substitutions look like changes and leave the cliché in place:

| Found                                | Not this                                                         | Fix                                                     |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Violet gradient hero                 | Teal gradient hero, orange gradient hero                         | No gradient; a real picture on a plain surface          |
| Three feature cards with icons       | Three feature cards with numbers 01, 02, 03; four cards; a bento | One claim with its proof, or a paragraph                |
| Blurred colour blob behind the title | A glow, a blurred image behind text                              | `plain`, `grain`, or `blueprint`                        |
| Fade-up on every section             | Slide-in on every section                                        | Most sections still; one entrance where the story turns |
| Stock photo of people at a laptop    | A generated picture of people at a laptop                        | A screenshot of what they would see on that laptop      |
| Starter order with new words         | Starter order with sections renamed                              | Order written from the brief's argument                 |
| Tailwind indigo accent               | Tailwind violet-500 or blue-600                                  | A named accent from the subject                         |
| Neon green on black                  | Neon cyan on black                                               | Graphite, grey text, one muted signal                   |
| Inter everywhere                     | Neue Montreal, Geist or Manrope everywhere                       | A pair chosen for the subject: display voice + text     |
| A fashionable serif display          | Instrument Serif or Bricolage Grotesque (no Cyrillic at all)     | An embedded face with Cyrillic, chosen for the subject  |
| Mesh gradient                        | Dither, ASCII art, a shader gradient                             | A real picture, or a plain surface                      |
| Letter-by-letter title animation     | A text scramble, a typewriter on every heading                   | A still title, or one title by line                     |
| A glowing neural network             | A plexus of lines and dots without the glow                      | The real material: named nodes from the real data       |

ASCII and dithering shaders can replace a mesh gradient without adding meaning; ask what the picture
proves before choosing either. Instrument Serif and Bricolage Grotesque lack Cyrillic in the recorded
reference set, so a bilingual page needs a face with the required glyphs instead.

## What makes a palette look considered

- Paper or bone, ink, one warm accent; the dark scheme a warm graphite rather than a night blue.
- One accent carries action and the current place; everything else is neutral or a status colour. One
  signal colour stands for one status only (`DR-SIGNAL-COLOUR`).
- AI labs themselves moved away from neon to warm palettes and texture; a neon page now dates itself.
- Colour and motion come from the data when there is data: a status colour where the status is, a speed
  from the measured time, not from taste.

## Type: a pair and its weights

- **Choose a pair, not a face.** A display voice over a text face and a code face, chosen together for the
  subject: a strict serif large with a quiet grotesque and small capitals for eyebrows; or a grotesque with
  an expressive display cut over a text grotesque. «Inter unchosen» signals that nobody decided.
- **With an expressive serif display, set labels and meta lines in the monospace face;** the serif carries
  the voice, the monospace carries the data.
- **Weight at display size.** A light 300–400 suits a large Latin title (Stripe sets its display at 300).
  Cyrillic is never heavier than 600–720; a heavy 800 fuses Cyrillic words, and the package caps Russian
  display headings at 720 whatever the theme says ([`themes.md`](themes.md)).
- **Tracking.** Not tighter than −0.03em for Latin and −0.025em for Cyrillic (`DR-TIGHT-TRACKING`);
  capitals want positive tracking.
- **Faces without Cyrillic are not an option** for a bilingual page: Instrument Serif and Bricolage
  Grotesque have none. Cormorant Garamond is for large sizes only.

The September 2026 reference measurements include Stripe's display weight 300 and Resend's 96 px serif
on black. Those are observations, not universal settings: compare their hierarchy with the current page
at the same viewport before borrowing it. Literata has a Cyrillic subset; Cormorant needs large display
sizes. Verify the actual embedded font files cover every language in the page.

## Thematic presentation

A theme lives in the name, the verbs and the material, not in an illustration of the theme.

- **Myth.** Put the allusion in the name, then show what the product does. Palantir uses a seeing-stone
  name and a compact monochrome mark while the product's data remains the subject; borrow the separation
  of symbolic identity from concrete evidence. Anduril pairs its mythic name with restrained black-and-white
  typography; its product imagery supplies the colour, so medieval decoration is unnecessary. Hermes Agent
  takes a messenger name but leads with a direct product promise and an install action; borrow the plain
  first step rather than illustrating the deity. For a craft metaphor, borrow Loewe Weaves' focus on the
  material at close range, Anni Albers' ordered variation of a repeated pattern, or the Jacquard card's
  visible mapping from a punched instruction to a woven result. Use at most three verbs of the mechanism,
  a material with light in two inks, one large serif and motion tied to the product. Antique decor, neon
  statues and literal goddesses are costume when they can be removed without losing the argument.
- **Neural networks.** Show the system's real structure and data. Anthropic's «Mapping the mind» and its
  attribution graphs make relationships readable as labelled features and directed links; borrow the
  labelled cause-to-effect path, not a decorative web. Activation Atlas uses a grid of related activation
  images so comparison is possible; borrow its fixed frame, grouping and caption. FlyWire and H01 show
  traced anatomy with scale and spatial context; Ramón y Cajal's drawings isolate the branching form
  against a quiet field. Brendan Bycroft's LLM visualisation walks through layers and token flow; reveal
  one stage at a time, with labels that stay attached to the part they explain. For a research figure,
  give the whole structure a static overview, then enlarge the one path the chapter argues about; put
  the source, scale or unit and caption next to the figure, not in distant prose. The recorded DeepMind
  «Visualising AI» set is a cautionary example of abstract AI imagery that can be reused without telling
  the reader which system or finding is shown. Avoid the glowing blue brain, Matrix rain and robots too.
- **Check the metaphor against the thesis.** A glowing brain says «intelligence», so it contradicts a page
  whose point is that the model is an unreliable worker held to a procedure.
- **Colour and motion come from the data.** A path lit where the run went, a speed from the recorded time,
  a node size from its count.
- **«Chaos to order» without neon.** FIELD.IO's IBM Generation starts from many apparently uncontrolled
  data points and reveals a pattern and structure; borrow the visible transformation, not arbitrary noise.
  Keep it inside one bounded frame, and change the positions or connections that explain the transition.
  The disorder can be warm and lit; the resolved state can be ink on paper. Do not add a glow as a
  substitute for a visible change.

## Controls are the package's, the voice is the theme's

Buttons, fields, tabs, disclosures, switches, choices, labels and captions are one interface system:
each kind has one size and one form on the whole page, and under a finger every control grows to 44 px.
The direction does not restyle them one by one; it sets their voice through the theme — `controls`
(`regular` or `compact`), `radius`, the type trio, and `ornaments.console` for console brackets and dashed
rules (`ornaments.scanlines` and `ornaments.glow` stay off unless the page is retro on purpose). A
wide display face — spaced capitals, a wide sans, a monospace — usually looks better with
`typography.displayScale` below 1; titles never break a word on a phone whichever face is chosen.

## Check the direction with snapshots

Build, take snapshots at 390, 768, and 1440 pixels in both schemes, and look at them as a stranger would:
does the first screen say what the page is about, and could the same screen belong to a different product?
If it could, the direction is not done. Then judge it against the references in the brief, not only
against the clichés: which of them does this page beat, and in what? Before each further iteration, reread
this file and [`design-rules.md`](design-rules.md).
