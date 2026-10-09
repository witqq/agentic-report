# Art direction

Art direction is the decision about how the page looks and moves, made from the subject and the reader
before any directive is written. On a page where the look decides the result — a landing, a showcase, a
portfolio, a presentation — study references first, offer the person two or three concepts, and let the
person choose. On a report or a dashboard, pick one yourself and write it in the brief.

## Compose before choosing components

Decide what the reader notices first, what makes it worth looking at, and how the next chapters develop
it. Name the main visual, the hierarchy of title, material and action, the contrast of scales, and the
rhythm of dense and quiet sections in the existing art-direction row of the brief. A report may center
its conclusion and evidence; a landing may give most of the opening to the product or a material image.
Then choose recipes, cards and effects that realize that composition. The starter supplies syntax;
its component sequence does not supply the idea.

Aesthetic advice is contextual. A gradient can carry brand colour or light, a grid can compare distinct
facts, and quiet movement can establish atmosphere. Keep a technique when it serves the concept and
stays subordinate to the reading path. Accessibility, truthful evidence, privacy, both schemes, reduced
motion and print remain binding. Use only supported fields and declared extensions.

## Study references before the concepts

For a landing or a showcase, look at 5–10 real sites on the same subject before writing a single concept,
and write in the brief (the `references` row) what each one teaches: a technique to take, a measurement, and
the cliché it carries. A first round built only from a list of things to avoid passes every ban and still
looks cheap. References give rhythm and technique, not code: never copy a site's code or assets
([`assets.md`](assets.md), licences). The measured sites in [`themes.md`](themes.md) and the exemplars in
[`playbook.md`](playbook.md) are a starting set, not a substitute for sites on the page's own subject.

Squint at each reference until the words blur: a good page still shows one first, one second and one third
thing, and that order of attention is what you take from it. A gallery of awarded sites (Awwwards «Site of
the day») is a place to find references, not a list of templates: note the technique, not the look.

Sources: Viktor Shmatko, «What makes a website look premium» (premium is
control, not a rare effect; the squint test); the Awwwards «Site of the day» gallery.

## What makes a page premium

Avoiding clichés removes the template but does not make a page good. A page with no indigo, Inter, glow,
identical cards or emoji can pass the «cover the logo» test and still lack a clear hierarchy or convincing
material. A premium page is control and hundreds of small decisions, «a
single point of view executed with discipline», not a rare effect. Build the concept from these practices:

| Practice                       | What it means on the page                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The product is the demo        | The real interface, a reconstruction of it, or a clip on the first screen, at natural size; the product larger than the title                                     |
| One metaphor as material       | One object carries the idea through the page and changes state; it is what the page is made of, not a caption (below)                                             |
| A through-line                 | One element passes through every chapter — a line, a light, a sticky contents — and the colour of a cause matches its effect                                      |
| Directed motion                | Every movement has an origin and says what changed; supporting motion shares the main gesture's meaning; unrelated movements settle while the reader processes it |
| Type as the signal             | A deliberate pair, a large contrast of sizes, light weights at display size, «the key sentence bright, the explanation muted»                                     |
| The language of a drawing      | Figure captions («FIG 0.2»), numbered sections in brackets, a monospace readout — where the product is technical                                                  |
| Real numbers                   | Figures from the source with their date and unit; a live figure beats a static one; an unknown figure is called unknown                                           |
| Restraint                      | A clear focus, coordinated colour and movement; restraint follows the concept rather than a fixed look                                                            |
| Reduced motion for every scene | Each scene has a still version drawn directly in its final state, a narrow-screen version, and a printed equivalent                                               |

For an expressive product page, consider four useful shifts: the product as
demo, the metaphor as material, direction of motion, type as a decision — with the palette and the faces
taken from the subject.

Control is measurable. Use these numbers to judge a page, a theme of your own, or an extension effect; the
package's own blocks already keep them:

- **Spacing has a rhythm.** Repeat gaps within the same role; use a deliberate larger pause when the
  argument changes, rather than accidental differences between chapters; the gap between a heading and its paragraph is smaller than the gap between two chapters. Too
  tight looks cheap, uncontrolled empty space looks unfinished.
- **Type is a scale, not a set of sizes.** Neighbouring sizes step by a ratio of 1.25 to 1.5; body text
  keeps a line height of 1.6–1.8 and a line of 45–80 characters; at most two families besides code.
- **Colour has consistent roles.** One action accent is a useful starting point. A broader brand palette
  can work when hierarchy stays clear and each status keeps its meaning; a default colour needs the same
  reason as an unusual one.
- **Cards share one frame.** The same aspect ratio for every picture in a row, the same inner padding, the
  same radius per role.
- **Interface motion is short.** A state change under the pointer takes 150–200 ms, an opening panel or
  menu under 300 ms (about 180 ms reads crisp, 400 ms sluggish); entering and leaving ease out. Nothing grows
  from `scale(0)`: an entrance starts at 0.9 or more (in the package a section reveal moves 16 px without
  scaling, a slide with `slide-transition="zoom"` starts at 0.94 and `appear` with `effect="pop"` at 0.9), a pressed control shrinks only
  slightly (the package's buttons to 0.98, linked cards to 0.99), and a panel grows from the control that opened it, not from its centre.
  Movement repeated many times a day — a tooltip after the first, a menu the reader opens constantly — does
  not animate at all.

The measured sites behind the practices — Linear, Stripe, Warp, Cursor and Igloo Inc — are in the table
«Measured references» in [`themes.md`](themes.md): what each sets for display type, background and colour.

Sources: Viktor Shmatko, «Premium website design details»; Made by Evoke, «What makes a website look
expensive» (spacing, scale ratios, line height, hover timing); Emil Kowalski, «7 practical animation tips»
(durations, easing, starting scale, origin); the sites measured in [`themes.md`](themes.md).

## One metaphor, one object

- **When a metaphor carries the concept, keep its material coherent.** Igloo Inc builds its page from one ice object in
  two colours (`#b6bac5` and `#383e4e`) that changes state as the reader scrolls; Oryzo shows one object
  revealing its properties. Competing metaphors can dilute the first; a product demo or a clear editorial page needs no metaphor.
- **The metaphor is the material, not a caption.** A flat line of constant width on paper reads as a
  diagram. A thread used as the page's material needs visible volume, light, sag, tension and recoil,
  with fibres that respond together. A metaphor expressed as a table stays a table.
- **The deletion test for an explanatory scene.** Remove it in your head: if the mechanism or finding
  is no harder to understand, it is supporting atmosphere rather than the explanation (`DR-SCENE-CARRIES` in [`design-rules.md`](design-rules.md)).
- **Chaos grows only inside a frame.** Organic, generative or tangled material lives inside a disciplined
  layout: the grid, the type and the controls stay calm around it. Three hundred exact threads say more than
  a million particles.
- **A distinctive element where it matters.** An opening or turning point can have one element shaped for this subject — a stamp
  turned across a ruled frame, a number set in place, a line that leaves the column — and it is the one
  thing the concept names as its solved element. Quiet chapters can use the ordinary grid; asymmetry needs a reason too.
- **Traces of authorship.** A real author's name, real dates, a dated change log: a page that could only be
  about this product and by these people.
- **Check the metaphor against the thesis.** A glowing brain for a product whose point is that the model is
  an unreliable worker says the opposite of the page.

What makes organic material read as crafted rather than as noise, from the practice of generative art
(Tyler Hobbs on flow fields): the lines never cross and keep a minimum distance from each other; the field
bends smoothly (a continuous noise, not a random angle per cell); lines start from evenly spread points
rather than from a stiff grid or pure chance; each step of a line is small (0.1–0.5 % of the picture's
width) so tight turns stay clean; and the field reaches half a picture beyond each edge so lines can turn
back in. Short lines read as fur or texture, long ones as flow. The same discipline — few exact marks,
spacing enforced — is what «three hundred exact threads» means.

Sources: the Awwwards case study of Igloo Inc (one ice object in two inks, changing state with the scroll);
Oryzo (one object revealing its properties); Tyler Hobbs, «Flow fields».

## Write a concept

A concept is ten lines, each of which could be wrong for another page:

| Line           | Says                                                           | Example                                                           |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Name           | A short handle the person can choose by                        | «Lab notebook»                                                    |
| Idea           | What the page is like, taken from the subject                  | Field notes of an engineer, measured and dated                    |
| Main object    | The one object or metaphor that carries the page               | The oscilloscope trace, redrawn from the lab's own data           |
| Theme          | A built-in theme or your own ([`themes.md`](themes.md))        | `neutral` with `accent: moss`, `fonts.pair: blueprint`            |
| First screen   | What the reader sees before scrolling                          | The title beside a real oscilloscope screenshot                   |
| Order          | The sequence of claims, proof, pauses and action               | Show the result, inspect its mechanism, pause on the finding, act |
| Motion         | How much and where, or none                                    | `draw="scroll"` on the one wiring diagram; nothing else           |
| Solved element | The subject-specific detail at an opening or turning point     | Measurements set in the margin like a lab stamp                   |
| At 400 px      | What the phone reader sees and what changes from the wide page | The trace above the title; the diagram in its `down` view         |
| Cliché check   | The clichés nearest to this concept and why it avoids them     | «Cream + serif»: grey paper and a moss accent, no terracotta      |

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

The person chooses the concept; your own ranking is advice, not the decision. A first screen and one block
leave the rest of a direction untested: on a page where the look decides, show each concept as a whole
page with every chapter and its motion. A rough pass of
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

These rows diagnose unconsidered combinations, not forbidden styles. Apply a fix when the named failure
is present. A centred title, bento grid, serif, neon palette or glow may suit the subject; its presence
alone is no reason to remove it. Keep readable contrast and clear attention, and use the existing brief
to explain a deliberate exception to checked advice. The alternatives below are examples, not a new
default template.

| Cliché                                                              | Why it fails                                                      | Fix                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Violet-to-blue gradient behind a centred title                      | The signature of a generated page; says nothing about the subject | One accent from the subject, a plain surface (`DR-BLOBS`)                                                                        |
| Hero, three feature cards with icons, testimonials, call to action  | Every landing made from a template has it                         | Order by the argument in the brief (`DR-LANDING-ORDER`)                                                                          |
| Three cards of «Fast», «Secure», «Simple»                           | Claims without proof                                              | One claim with its evidence beside it (`recipe="evidence"`)                                                                      |
| A bento grid of feature cards                                       | The same three cards in a fashionable box                         | One claim with its proof, or ruled cards that each carry a different fact                                                        |
| Glassmorphism panels, glows, floating blobs                         | Decoration standing in for content                                | Real material on a quiet surface                                                                                                 |
| A glow on anything                                                  | Light without a source reads as a filter                          | A matte, lit material, or a thin ink line                                                                                        |
| Every block fades up on scroll                                      | The reader waits instead of reading (`DR-UNIFORM-ENTRANCE`)       | Motion for explanation, attention or atmosphere; keep supporting motion quiet                                                    |
| Every heading animated letter by letter                             | Noise, and screen readers read the letters apart                  | One or two titles by line or by word, where the movement says something                                                          |
| A custom cursor; a preloader or a 0–100 % counter                   | The reader waits for, or chases, an effect                        | The system cursor; content that is there on arrival                                                                              |
| Abstract generated art as the hero                                  | Proves nothing (`DR-REAL-MATERIAL`)                               | A screenshot, a clip, a diagram of the real thing                                                                                |
| A flat infographic (metro lines, circles, dashes) as the main image | Correct and plain: a diagram where the page needs a material      | The metaphor as a lit material, or the real product at size                                                                      |
| Emoji as feature icons                                              | Looks like a chat, renders differently (the prose rules)          | No icon, or the fact that makes the card different                                                                               |
| Numbers counting up everywhere                                      | Animation replaces the value                                      | `:count` on one figure that is new; plain numbers elsewhere                                                                      |
| Tight, heavy display type on every heading                          | Fuses words, shouts (`DR-TIGHT-TRACKING`)                         | Display type on the title only; default tracking                                                                                 |
| A particle or WebGL background «for depth»                          | Costs battery, means nothing (`DR-ONE-EFFECT`)                    | A declared effect for the subject or a purposeful atmosphere, with a complete still page                                         |
| A shader background with no meaning                                 | The mesh gradient of 2026                                         | A real picture, a plain surface, or a declared effect that supports the subject or atmosphere                                    |
| Dark + neon + shader + bento grid                                   | One of the two fashionable looks of 2026: seen everywhere         | Palette and type taken from the subject                                                                                          |
| Cream paper + serif display + terracotta (+ mascots)                | The other fashionable look of 2026, an imitation of one AI lab    | Neutral paper, ink, one accent from the subject                                                                                  |
| Acid green on black, phosphor glow, scanlines                       | A costume of a terminal, not a terminal                           | Graphite, grey text, one muted green; no texture over text                                                                       |
| Magenta and cyan on violet night, a synthwave grid                  | A genre poster, not a product                                     | Games, music, deliberate retro or a vivid brand direction; keep the reading hierarchy clear                                      |
| Near-black page, grotesque, grey subtitles, a bento of dark cards   | The Linear-style dark template                                    | Ruled cards, one signal colour, a real product shot                                                                              |
| Neutral palette + grotesque + 0.5rem radius + bordered cards        | The stock component-kit look                                      | A voice: a serif display, sharp corners, ruled cards                                                                             |
| Beams, a spotlight behind the cursor, aurora, glowing cards         | The AI-startup look                                               | Real material on a plain surface                                                                                                 |
| Spaced capitals over star dust or particles                         | A template of a «premium» launch                                  | Use capitals or particles where the subject calls for them; preserve reading and a clear main visual                             |
| An eyebrow in capitals joined by dots («ENGINE · MCP · APACHE-2.0») | The first line of every generated launch page                     | A plain eyebrow in the text face, or none                                                                                        |
| A title and two pill buttons, no product                            | The reader learns nothing before scrolling                        | Title on the left, one action, the secondary one as a link, the product beside them (`recipe="demo"`)                            |
| A call-to-action box with two buttons at the end                    | A closing template; a framed button reads as an afterthought      | A final scene: the main image resolved, one action inside it                                                                     |
| A logo strip, an integrations cloud, a testimonial wall             | Borrowed proof the reader cannot check                            | One named customer with a real quote and a date, or the product's own evidence                                                   |
| A switcher of SDK languages for its own sake                        | Interaction that shows the same thing five times                  | One real snippet in the reader's language; tabs only when the reader truly picks one                                             |
| A gold CSS gradient, gold on black                                  | Reads as cheap luxury                                             | Metal only as a photograph or a render; one metal thread among matte ones                                                        |
| White marble as «eternal classic»                                   | A texture pasted on a plane                                       | A scan or photograph with light, large, monochrome, as a fragment                                                                |
| Paper and one ink, no material, light, or depth                     | A diagram where the concept needs a visible material              | Two inks and one material with light                                                                                             |
| Newspaper hairlines with dense columns                              | The ruled template of an «editorial» page                         | Fewer, wider columns; rules only where they separate meaning                                                                     |
| The same radius on everything; everything symmetric on the grid     | Uniformity without a role can flatten hierarchy                   | Keep symmetry and equal radii when they unify the page; vary roles or add asymmetry where the argument benefits                  |
| Pathos in the text («the fabric of destiny»)                        | Theme as costume                                                  | Say what the product does; at most three verbs of the metaphor                                                                   |
| The default palette of a CSS framework (indigo-500, slate)          | What an averaging generator produces                              | A named accent from the subject; own neutrals                                                                                    |
| A tilted dashboard, a screenshot in made-up browser chrome          | The product shown as a prop, not as it is                         | The real interface flat and at size; `frame="browser"` only with the page's real `address`, a mock-up with `illustration="true"` |

The original four-or-more heuristic is a prompt to examine the choices, not a quality verdict. A page about these effects may deliberately contain them; judge their purpose, hierarchy, real evidence and readability. Do not remove useful tools merely to reduce a count.

Why the table holds:

- **The violet gradient and the indigo accent are averages, not choices.** Generators learned the web of
  2015–2020, when violet-to-blue gradients stood for «modern», and the default palette of the most common CSS
  framework (Tailwind's `indigo-500`, `#6366f1`, over `slate` neutrals) fills their training pages; a model
  that is not told otherwise returns that mean. Renaming the shade keeps the mean.
- **The generic landing has six tells together:** a title from the template «The AI-powered [category] for
  modern [audience]»; a centred hero with a gradient blob and two buttons; a row of three identical cards
  with thin-line icons or emoji and two-word titles; the default palette; the stock order hero → logos →
  features → testimonial → pricing → call to action; and benefit copy («Save time. Work smarter.») that fits
  any product. The fix for each is in the table above; the one that moves the page most is a left-aligned
  title with the real product beside it.
- **Letters split for animation break reading.** Each letter becomes its own element; tested screen readers
  then announce nothing (JAWS with Chrome, VoiceOver on iPadOS), only the first letter (Narrator with Edge),
  or the letters one by one (VoiceOver on macOS). An `aria-label` on the wrapper does not help, because a
  generic element cannot be named that way, and a label is not translated with the page. The package
  animates titles by line or by word and keeps the text whole.
- **A custom cursor hides what it points at** — text and sometimes the whole control — and throws away the
  size and colour a reader set for their own cursor for accessibility.

Sources: Jack Pearce, «The purple gradient»; «Why every AI-built website looks the same» (the Tailwind
`indigo-500` default); 925 Studios, «AI slop design tells»; «Every AI startup website looks the same»;
Superdesign, «Fix a generic AI landing page» (the six tells); Creative Boom, trends creatives are over in
2026; Adrian Roselli, «Just don't split words into letters» (the screen-reader results); Funka, «The curse
of the custom cursor».

## A synonym is not a fix

When a technique has no purpose, changing its colour or fashionable name does not give it one. If the
original technique already serves the composition, keep it.

These substitutions look like changes and leave the cliché in place:

| Found                                | Not this                                                         | Fix                                                                         |
| ------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Violet gradient hero                 | Teal gradient hero, orange gradient hero                         | A purposeful light or brand treatment, or a real picture on a plain surface |
| Three feature cards with icons       | Three feature cards with numbers 01, 02, 03; four cards; a bento | One claim with its proof, or a paragraph                                    |
| Blurred colour blob behind the title | A glow, a blurred image behind text                              | `plain`, `grain`, or `blueprint`                                            |
| Fade-up on every section             | Slide-in on every section                                        | Most sections still; one entrance where the story turns                     |
| Stock photo of people at a laptop    | A generated picture of people at a laptop                        | A screenshot of what they would see on that laptop                          |
| Starter order with new words         | Starter order with sections renamed                              | Order written from the brief's argument                                     |
| Tailwind indigo accent               | Tailwind violet-500 or blue-600                                  | A named accent from the subject                                             |
| Neon green on black                  | Neon cyan on black                                               | Graphite, grey text, one muted signal                                       |
| Inter everywhere                     | Neue Montreal, Geist or Manrope everywhere                       | A pair chosen for the subject: display voice + text                         |
| A fashionable serif display          | Instrument Serif or Bricolage Grotesque (no Cyrillic at all)     | An embedded face with Cyrillic, chosen for the subject                      |
| Mesh gradient                        | Dither, ASCII art, a shader gradient                             | A real picture, or a plain surface                                          |
| Letter-by-letter title animation     | A text scramble, a typewriter on every heading                   | A still title, or one title by line                                         |
| A glowing neural network             | A plexus of lines and dots without the glow                      | The real material: named nodes from the real data                           |

Sources: a Codrops tutorial of January 2026 on real-time ASCII and dithering shaders, which shows dither and
ASCII becoming the next mesh gradient; the character sets of Instrument Serif and Bricolage Grotesque,
neither of which has Cyrillic.

## What makes a palette look considered

- Paper, ink and one warm accent suit an editorial direction; cool surfaces or night blue can suit a
  technical or cinematic one. Choose from the subject and material.
- Start with one accent for action and the current place; add colour when its role is clear. One
  signal colour stands for one status only (`DR-SIGNAL-COLOUR`).
- Neon can suit games, music or a deliberate retro direction; warm texture can suit editorial material.
  Neither palette establishes quality by itself.
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

Sources: Stripe (display measured at weight 300) and Resend (a serif at 96 px on black), both in the
«Measured references» table of [`themes.md`](themes.md); Literata, a serif with Cyrillic and an optical-size
axis, which the package embeds; Cormorant, whose hairlines are drawn for display sizes.

## Thematic presentation

A theme lives in the name, the verbs and the material, not in an illustration of the theme.

- **Myth.** Palantir, Anduril, Nike and Hermes Agent carry the myth in the name and show data on the screen.
  Craft at scale works as material: Loewe Weaves, Anni Albers and the Jacquard punched card as weaving that
  programs. Do: the myth in the name and at most three verbs of the mechanism; the material with light, in
  a coherent palette; type chosen for the subject; motion tied to the concept. Illustrations follow the
  provenance rules in `assets.md`. Avoid unrelated antique decor,
  neon statues, vaporwave, literal goddesses, stock «threads of fate»; decor that can be removed without
  supporting the concept is costume.
- **Neural networks.** Show the real material with its physics and data: Anthropic's «Mapping the mind»
  and attribution graphs, the Activation Atlas, the FlyWire and H01 connectomes, Ramón y Cajal's drawings,
  Brendan Bycroft's LLM visualisation. Clichés: the plexus, the glowing blue brain, the Matrix rain of
  zeros and ones, robots; DeepMind's «Visualising AI» set is now recognised as stock.
- **Check the metaphor against the thesis.** A glowing brain says «intelligence», so it contradicts a page
  whose point is that the model is an unreliable worker held to a procedure.
- **Colour and motion come from the data.** A path lit where the run went, a speed from the recorded time,
  a node size from its count.
- **«Chaos to order» without neon.** The tangle is warm and lit, the order is ink on paper; FIELD.IO's IBM
  work shows the drama without a glow.

What each example teaches, so you can use it without looking it up:

| Example                                        | What to take                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Palantir, Anduril, Hermes Agent                | The myth lives in the name; the mark and the type are plain, and the screen shows data, not a statue        |
| Loewe Weaves, Anni Albers, Jacquard cards      | A craft shown as material at scale: close photographs of the weave, the punched card as a program           |
| «Mapping the mind», attribution graphs         | Real features and graphs from a model, labelled with what they are, drawn as nodes and weighted links       |
| Activation Atlas                               | A grid of real activations the reader zooms into; the picture is the argument, with captions at every level |
| FlyWire and H01 connectomes                    | Real reconstructed neurons, coloured by type, on black or white: density and detail instead of glow         |
| Ramón y Cajal's drawings                       | Ink on paper, one line weight, every cell drawn from observation: the material itself is the illustration   |
| Brendan Bycroft's LLM visualisation            | A model's real layers drawn as blocks of numbers the reader steps through, each step naming the operation   |
| FIELD.IO for IBM                               | Generative forms with a matte, lit material; drama from scale and light, not from a neon glow               |
| Better Images of AI; DeepMind «Visualising AI» | Collections showing why the glowing brain misleads, and a commissioned set now read as stock                |

Sources: those projects and publications, named above.

## Controls are the package's, the voice is the theme's

Buttons, fields, tabs, disclosures, switches, choices, labels and captions are one interface system:
each kind has one size and one form on the whole page, and under a finger every control grows to 44 px.
The direction does not restyle them one by one; it sets their voice through the theme — `controls`
(`regular` or `compact`), `radius`, the type set, and `ornaments.console` for console brackets and dashed
rules (`ornaments.scanlines` and `ornaments.glow` stay off unless the page is retro on purpose). A
wide display face — spaced capitals, a wide sans, a monospace — usually looks better with
`typography.displayScale` below 1; titles never break a word on a phone whichever face is chosen.

## Check the direction with snapshots

Build, take snapshots at 390, 768, and 1440 pixels in both schemes, and look at them as a stranger would:
does the first screen say what the page is about, and does its composition belong to this subject?
Judge hierarchy, main visual scale, chapter rhythm and visual coherence separately from readability
and defects. Explain what makes this page distinctive, whether bold or quiet, using visible choices.
Compare those choices with the references in the brief; passing checks or counting fewer clichés does
not settle this judgement. Before each further iteration, reread
this file and [`design-rules.md`](design-rules.md).
