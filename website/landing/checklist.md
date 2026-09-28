# Checklist

Close an item with its evidence after an arrow: `- [x] item → what shows it is done`, or
`- [n/a] item → why it does not apply`. Hand the page over when `node scripts/checklist.mjs check`
reports no open items.

## Steps

- [x] Brief → brief.md answers every category dimension; design-check reports no missing answer.
- [x] References → brief.md records five official product pages with a usable lesson and a boundary for each.
- [x] Direction → brief.md names the inferred «Working proof» concept; both locale builds use it.
- [x] Material → the brief and screenshots.json trace the bilingual opening card and six bilingual gallery captures to package-built examples; social-preview.png shows this page.
- [x] Review the brief and the data → the fictional incident date and exact EN/RU source metric match the captured mobile cards; every local asset has a provenance row and live source route.
- [x] Source → report.md and report.ru.md build through the normal compiler in both output formats.
- [x] Prose → English/Russian structure and destinations align; the changed Russian opening passed conservative humanize-ru diagnosis.
- [x] Build → direct single-file and directory builds succeed; build:site stages the route tree and direct source bytes.
- [x] Design check → design-check.mjs returns empty advice, switchedOff and rejectedSwitches.
- [x] Look → the opening remains visible in landing-final-v3; gallery-after and gallery-v2 captures inspect all three cards in both languages at compact and large widths, in light and dark schemes.
- [x] Review the result → the same independent reviewer accepted the current bilingual gallery, source, assets and captures with no confirmed blocker.
- [x] Hand over → the source is report.md with report.ru.md; the product landing uses no starter, both languages build in the current Testfold E2E setup; the staged site is agent_temp_files_local/landing-gallery-repair-v2; staging supplies the social-preview public URL; design advice and unresolved content facts are empty.

## Brief

- [x] `subvariant` answered with its source → product landing, inferred from the page's job.
- [x] `audience` answered with its source → agents and developers, from the request and product boundary.
- [x] `reader-task` answered with its source → choose the short page path and build a page, from the request.
- [x] `material` answered with its source → source, output, bilingual opening and gallery captures, and CLI, traced in the brief.
- [x] `language` answered with its source → maintained English/Russian entries in source and routes.
- [x] `art-direction` answered with its source → «Working proof», inferred and visible in the first-screen demo.
- [x] `motion` answered with its source → restrained motion, in the brief and source metadata.
- [x] `interactivity` answered with its source → theme/language controls, live links and Review.
- [x] `delivery` answered with its source → local single file and staged public directory, both built.
- [x] `references` answered with its source → five official sites and lessons in the brief.
- [x] `first-screen` answered with its source → command, linked exact source metric, and built mobile card beside the action in inspected shots.
- [x] `call-to-action` answered with its source → Build a page / Собрать страницу links to the workflow.

## Design rules

- [x] `DR-NAV-ABOVE-TITLE` no navigation frame above a landing title → first screens show only the compact package toolbar above h1.
- [x] `DR-OPENING-MEDIA` a landing shows its product on the first screen → the opening pairs a legible card captured from a real built page with its exact source metric and links to the full page.
- [x] `DR-LANDING-ORDER` do not keep the starter's order of recipes → source uses its own demo, statement, evidence and rail argument.
- [x] `DR-MAIN-SCENE-SIZE` the main scene takes a real share of the screen, on every width → the source/result panel fills the right desktop column and the complete card fits mobile first screen.
- [x] `DR-LINE-LENGTH` reading lines stay between about 45 and 80 characters → full screenshots show bounded paragraph tracks.
- [x] `DR-HEADING-HIERARCHY` one page title, then chapter titles → one h1 and ordered section titles in both languages.
- [x] `DR-BLOBS` no blurred colour blobs, meshes, or glows behind content → neutral paper/graphite pages use no blob backdrop.
- [x] `DR-SURFACES` at most two chapters with a decorative surface → design-check reports no surface advice.
- [x] `DR-ONE-ACCENT` one accent colour, used for action and emphasis → neutral palette and ochre links in both schemes.
- [n/a] `DR-SIGNAL-COLOUR` one signal colour stands for one status → landing asserts no status signals.
- [n/a] `DR-NOT-YET` what is not reached yet is muted by colour, not by transparency → no staged status or upcoming state is authored.
- [x] `DR-FIGURE-TEXT` text inside a figure is at least 11 px on screen and in the page's language → the bilingual opening and all six localized gallery cards were directly inspected at 390 px and 1440 px; the wide vendor crop preserves the complete last line.
- [x] `DR-CONTRAST` every text meets WCAG AA contrast → light/dark screenshots and browser theme checks show readable text and controls.
- [x] `DR-TIGHT-TRACKING` display type must not fuse words → EN/RU headings retain word separation on compact and large views.
- [x] `DR-RU-TYPOGRAPHY` Russian text follows Russian typography → reviewed Russian page uses natural punctuation and no cramped title tracking.
- [x] `DR-REAL-MATERIAL` real material, not stock or generated pictures → proof captures and social preview came from compiled pages.
- [x] `DR-SCENE-CARRIES` without the main scene the page must lose its point → removing the opening source/card relationship would remove the core proof.
- [x] `DR-PROCESS-FROM-DATA` a process is drawn from its data, not by hand → flow diagram uses the package's declared nodes and edges.
- [x] `DR-DATA-SLICE` every figure with data names its source and its moment → the opening identifies the fictional incident, 18 July 2026, links the exact source metric, and the captured card gives the UTC error period.
- [n/a] `DR-HEADING-COUNT` a number in a heading is counted by a stated rule → headings contain no quantitative claim.
- [x] `DR-NAME-NOT-COUNT` name what a product can do instead of counting it → chapter headings name the source, workflow, feedback and boundary.
- [x] `DR-EXAMPLE-SCOPE` what is true of an example is said of that example → fictional scenarios are labelled; links lead to exact live cases.
- [x] `DR-PRIVACY` only safe fields reach the page → public-site safety and tracked-history checks passed; images show fictional sample content.
- [x] `DR-CARD-SAMENESS` cards differ by content, not only by words → recovery time, a disqualified top scorer and activation against a target show three different decisions and visual treatments.
- [x] `DR-NUMBERS-UNITS` every number carries its unit and its date → the first-screen percentage is tied to the fictional 18 July 2026 incident and the card labels its UTC period.
- [x] `DR-CAPTIONS` every picture explains itself → proof image alt text and card prose identify what each capture proves.
- [x] `DR-UNIFORM-ENTRANCE` not every chapter enters the same way → design-check reports no uniform-entrance advice; one statement disables its transition.
- [x] `DR-ONE-EFFECT` at most one pointer or magnetic effect per page → no authored pointer effect appears in the landing source.
- [x] `DR-MOTION-MEANING` motion shows a change in meaning → restrained chapter motion preserves static reading and reduced-motion screenshots.
- [x] `DR-MOTION-ORIGIN` every movement comes from somewhere, and the main gesture is visible → chapter progress/reveal follows scroll with stable reduced-motion layout.
- [n/a] `DR-WEBGL-FALLBACK` a WebGL scene at rest is no worse than its fallback → this landing has no WebGL scene.
- [x] `DR-ONE-COORDINATE-SPACE` a drawing and its labels share one coordinate system → package flow diagram keeps nodes and labels together at both widths.
- [n/a] `DR-CANVAS-LAYERS` nothing translucent over a decorative canvas, no control over text → no decorative canvas is authored.
- [x] `DR-PAGE-WEIGHT` the page fits its size budget → single-file build succeeds and staged directory HTML stays below its crawler limit.
- [x] `DR-BRIEF` the page has a filled brief beside its source → all category dimensions and media rows are present; design-check advice is empty.
- [x] `DR-BRIEF-MATCH` the page does what the brief decided → first action, local build, languages, captures and delivery match the brief.
