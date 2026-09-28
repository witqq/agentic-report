# Testing

This document describes current verification entry points and the guarantees covered by the present test
implementation. The complete target is defined in
[`../PRODUCT-REQUIREMENTS.md`](../PRODUCT-REQUIREMENTS.md); requirements without scoped evidence are not
made current merely by an aggregate green run.

## Supported entry points

Run tests only through the package scripts:

```bash
pnpm test
pnpm test:unit
pnpm test:e2e
```

The scripts invoke Testfold. Do not call Vitest or Playwright directly during normal diagnosis. Testfold
writes its summary to `test-results/summary.json` and failure reports under
`test-results/artifacts/failures/**/*.md`; read both before inspecting raw logs or rerunning.

The Testfold configuration rejects suites that produce zero test results. This guard prevents setup or
discovery failures from being reported as successful empty runs.

`pnpm verify` is the required local, pull-request and release gate. It checks generated authoring projections,
types, lint, formatting, the complete unit suite and the installed npm package through `pnpm pack:check`.
The package check opens its installed output in Chromium; it does not run the full E2E suite.

The full `pnpm test:e2e` suite runs in `.github/workflows/e2e.yml` every day at 03:00 UTC
and can be started manually with `workflow_dispatch`. It does not block a pull request or release. Run it
locally when changing browser behavior or diagnosing a nightly failure. `pnpm test` also runs unit and E2E
through Testfold. Run these suites sequentially: both own files under `test-results/`, so concurrent workspace
setup and cleanup would invalidate their results.

## Tiers

- `unit` uses Vitest for source loading, validation, lexical and symlink partial/asset confinement,
  Markdown/directive rendering, code highlighting that loads only the grammars a document's fences need and stays
  byte-identical to full-bundle output for aliased, `terms`-annotated, lazily embedding (Markdown
  frontmatter and nested fences), injected (tagged templates, and `jsx`/`angular-html` under a parent-scope injection in a
  module-isolated file), `include`-dependent (`jinja-html`),
  unknown and language-less fences, public page metadata read from the written file — the exact canonical,
  OpenGraph, locale-alternate and Twitter tags of a bilingual directory page whose `og:image` resolves to the
  asset the build wrote, no image and one warning in single-file or without a URL, region and catalog
  locale mapping, option-over-manifest precedence, refused URL and image classes, primary-only ownership,
  and the crawler warning at exactly 2,097,152 against 2,097,153 measured HTML bytes — the exact
  `sitemap.xml` and `robots.txt` bytes for a compiler-built tree with root, nested directory, query-bearing
  and foreign pages, and every sitemap refusal leaving a byte-identical tree —
  image/download/font embedding and copying, absent-only starter
  initialization, installed starter-root resolution, no-overwrite/incomplete-state behavior, CLI
  diagnostics — including one run whose three independent violations appear in both projections, the
  agent one without any flag and the prose one under `--human` with a `file:line:column` place per
  violation and a closing count, a manifest refusal that names the unknown key and proposes a
  replacement only when a registered field is close enough for the implemented measure — the proposal
  itself is asserted, because the accepted-key list already contains every field name and a substring
  check on one would stay green with the proposal branch removed — and the output rule observed on
  every discovery command, where the flagless answer is one compact agent line, `--json` reproduces it
  byte for byte, and `--human` differs from it; the help text of every command the CLI registers, where
  the promise of prose stands at exactly the commands that emit prose; the computed replacement carried as data and
  applied to the authored text, its absence on every occupied envelope — a term inside a link whose label
  is longer than the term, one whose label is exactly the term, and one written through a reference — and
  `fix` writing those replacements while every other byte and a second run stay unchanged, with
  `validate` and `inspect` still writing nothing; declared glossary forms, where a declared inflection is
  found and proposed in the spelling the sentence used, an undeclared word sharing the stem is not, and
  one form claimed by two definitions is refused; initialization through a symbolic-link parent returning
  the resolved destination while an existing destination stays refused; the directive phase answering
  with every independent rule of one element — a question judged on both its options and its numeric
  bounds, a misplaced directive judged on its attributes as well — and staying silent below a rule whose
  declared dependency refused, a refused section leaving its identity to the section the document keeps,
  and the declared rules with their dependencies read from the contract without
  compiling a source —
  both output formats and their derived runtime placement, truthful discovery/schema defaults,
  declared Node.js floor comparison and below-floor diagnostic behavior,
  manifest/frontmatter provenance, entry/partial diagnostic source maps, source/output collision protection,
  closed multilingual en/ru declarations, alternate-entry policy and locale matching, lexical/canonical
  confinement, aliases, recursion, graph/resource collisions, complete source inventory, unsupported
  single-language/`und` English fallback, Russian count forms, locale-scoped equal-name fonts, deterministic
  merged resources, localized review binding/target fallbacks, and explicit-locale visualization number
  formatting, deterministic version-2 review-target manifests and per-locale local-input revisions, strict
  canonical single-language version-3 and multilingual version-4 review JSON with version-2 whole-block
  normalization, locale-first/legacy-revision routing, fully missing localized targets, foreign-locale
  refusal, selected-text anchor structure, subject uniqueness, and two-endpoint binding,
  strict response form/artifact parsing, kind-specific answer domains, untouched/default distinction,
  canonical response JSON and foreign/stale/prototype-like rejection,
  exact unescaped colon prose and frontmatter titles—clock, range and duration notation, ratios, host/port
  pairs, identifiers and key/value phrases, including astral-letter and combining-mark word adjacency and a
  digit-initial name after a space or bracket—while a spaced unknown alphabetic name, any attributed
  word-adjacent form and a block-level digit-initial form retain source-mapped rejection and a spaced
  registered name without its required attribute reports that attribute instead of becoming text,
  one run reporting several independent authored violations — repeated across the tree walk, repeated
  inside one check across independent subjects, and repeated inside one subject across independent
  elements such as two unmarked terms in a paragraph, two undefined keys on a code fence, two
  malformed leads in a section, two refused questions in a form, three diagram edges pointing at
  undeclared nodes, two chart series with duplicate labels, two nodes referencing unknown groups,
  two sequence participants carrying a group, two unlabelled sequence messages, two response items
  pointing at an undeclared bucket, two annotated code keys absent from the block and two foreign
  children of one copyable block, plus mixed across checks in source order and a reference to a key nothing
  ever defined joining the inventory instead of ending the run before the remaining checks — while
  violations that only repeat a refusal already reported stay out of it: a term reference whose own
  definition was refused, an annotated code fence naming that same refused key beside a key nothing ever
  defined, a second fence answering for itself after one whose only key was refused, an empty group beside a
  node whose own group assignment was refused, and an overlap computed
  from code-term ranges whose key was just refused — while the boundary of that rule is itself observed: a
  definition lost with a rejected container leaves its key unknown, so a reference to it stays in the
  inventory beside the container's refusal,
  semantic copyable-prose ownership and nested behavior/code rejection,
  generated in-flow contents in both formats with exact-heading/short-navigation divergence, final ID
  collision handling, rename/reorder synchronization, repeated declarations, legacy/explicit H3 and
  appendix exclusion, zero/one cardinality, and invalid form/attribute/label/placement diagnostics,
  bounded first/unique lead paragraphs, direct-section appendix extraction, root/section definition order,
  collision-resolved glossary links, preserved review targets, empty-source-flow removal, and invalid
  lead/glossary parent diagnostics,
  share-safe source-link neutralization in both formats, compiler-derived filename/line precedence over
  arbitrary authored labels, total raw/nested-decoded unsafe-terminal fallback, exact transformed-node
  results, default-link compatibility, source-byte preservation, non-boolean ESM rejection and staged
  publication recovery,
  exact/changed/missing/ambiguous entry/partial binding, confined review paths, and sanitized review transport,
  exact serialized inline-size accounting, canonical and hard-link source/output collision protection,
  injected partial-write/rename preservation and retry for both output formats, same-process name/content
  determinism, registry-owned page layouts and built-in theme data, the complete closed section visual
  grammar with independent invalid-value and executable-attribute rejection, registry-declared rejection of
  mosaic/stack with layers/gallery card-layout conflicts, identical single-file/directory and
  document/dashboard projections, post-enhancement per-rail gallery candidate marking across titles, sibling
  prose, repeated and Markdown-separated structures plus true one-item omission, GFM table rendering,
  collision-free
  document shell IDs, default attribution and explicit footer opt-out without changing authored content,
  compiler results, deterministic public-site staging, every staged page's canonical URL of its place in
  the tree with `sitemap.xml`, `robots.txt` and their `release.json` entries, the landing under the crawler
  byte limit with a hashed `og:image`, complete declared-route
  reachability with each page's hashed assets present, direct-file byte identity, release hashes, synchronized skill/plugin metadata, and public
  tree safety. Public-site staging also rejects route/source escapes, canonically external page sources,
  symlinked direct inputs, an existing destination, release-identity divergence, and invalid generated routes
  while proving failed candidates are removed and prior destination bytes are preserved. Hostile concurrent
  path mutation, process/OS crash recovery,
  and a cross-platform determinism matrix are outside the proportionate filesystem contract.
- Page data and text settled at build time: `tests/unit/page-data.test.ts` covers substitution into text,
  code, attributes and links, markup in data staying literal, `each` keeping one list and one table whole,
  `expect` failing at its line, every data refusal, confinement and the data file in the source graph;
  `tests/unit/text-blocks.test.ts` covers `plural` forms for en/ru with the no-break space, `time` in a
  declared zone across a daylight-saving change, `source-line`, `message`/`conversation` markup and the
  eyebrow placed above a section title. `tests/e2e/data-and-text.spec.ts` opens the `run-report` example
  in both languages and checks the figures, the source-line geometry, the theme caption role, the message
  mock, print and `hreflang` alternates of a public build.
- `e2e` uses Playwright with desktop and mobile Chromium profiles. Global setup generates a real
  self-contained artifact; tests open it through `file://` and verify document navigation, code,
  responsive navigation, deterministic current-section ownership, sticky-topbar target clearance and
  settled normal/reduced hash ownership including the no-`scrollend` fallback, full bounded geometry and
  hash ownership without `IntersectionObserver`, generated in-flow contents using exact final headings and
  final explicit targets in both formats, short-sidebar-label divergence, fragment navigation, and
  narrow-screen visibility with the drawer closed, section lead and moved appendix definition states across
  desktop/mobile, light/dark and both formats, desktop collapse,
  native-dialog mobile
  focus containment/return, normal/reduced-motion progress, reveal/stagger entrances, long sections reached
  near their end with visible rendered contents and a working export action, progress/sticky
  scenes, ordered semantic choreography, fine-pointer depth/tilt/magnetic effects, responsive action
  placement, landing opening actions that share a centred heading's axis on wide screens and its start on
  narrow ones while an explicit edge group ends level with the opening's lead paragraph, offscreen idling and animation-frame
  coalescing, themes, visible focus,
  locally scrolling wide tables, protected loopback source-location links that preserve the report page,
  authored glossary forms, first-only color-preserving code glossary references, clean code copying,
  a code Copy button that no line of code intersects at rest or after local horizontal scrolling,
  appendix navigation, 15–20-node grouped flows, ordered sequence messages, diagram geometry and accessible
  descriptions, built-in demo interactions, input-derived Russian shell/runtime chrome, controlled copy
  success/failure, localized filter counts, glossary/modal/popover/demo/visualization states, textless
  review-target accessible labels, Russian Review Workspace add/edit/resolve/reopen/import states and stale
  prior classifications, non-English-browser independence for unsupported/`und` fallback, embedded single-file and
  external directory runtimes, and representative architecture, tutorial, work-report, and landing-page
  artifacts. Both formats also verify the accessible **Made with Agentic Report** footer at the visible
  document bottom and its complete absence under `attribution: false`. The document, dashboard, landing,
  and mixed examples are built and exercised through
  `file://` in desktop and mobile profiles, including their page data contract and local images. All six
  visual composition families are also exercised in one ordinary bilingual non-landing artifact at
  ultrawide, tall portrait, desktop, mobile, and narrow-mobile viewports. That coverage distinguishes
  computed stage/split/mosaic/story/stack layouts; masked, layered, gallery, and bleed media; independent
  fit/aspect/focal framing; distinct decorative surfaces; authored-order mobile flattening; local gallery
  overflow; image completion; and document containment. Dedicated video coverage frames a landscape
  recording, in both the directive and the Markdown-image player, into a section's portrait and square
  aspect with contain, cover and a focal point. Dedicated foundation coverage also distinguishes
  the localized icon toolbar in fine/coarse pointer profiles, native locale focus, useful compact heading/
  action geometry, section-local short-story floats, and nonintersecting Russian stage titles/media at both
  constrained and wide desktop widths. Wide visual-family coverage separately preserves stage, split, and
  gallery track behavior. Inspected captures supplement those geometry and computed-style assertions.
  The public component matrix derives its roots from the registry, adds the generated rules of every
  built-in theme and switches the page to each theme's complete root attributes before measuring containment
  and effective text/surface contrast. The theme engine is checked where it lives: unit tests resolve theme
  files, frontmatter objects and `extends` chains, report field, contrast, cycle and confinement errors at
  their lines, and read the static stylesheet to prove no rule selects a theme by name; e2e builds a page for
  every built-in theme and for a child that extends it, and requires identical computed styles until the
  child changes one field, which then changes exactly one property. Page categories are checked as
  registry facts and as behavior: unit tests initialize every category starter, build it, and compare
  its `brief.md` rows with the category's brief dimensions; they build a landing page with answer and
  review directives and a document with landing recipes to prove a category restricts nothing; they number
  unified-diff lines and refuse hunks that disagree with their headers at the directive's source line.
  `review-vocabulary.spec.ts` opens the diff, findings, and card status in both languages at 320 and 1280
  pixels without page overflow, reads the line-number gutter, copies the diff without numbers, and checks
  the reduced-motion end state. Diagrams are checked for one visual language and readable layout:
  `diagram-style.test.ts` reads the stylesheet rules of diagrams and charts and the SVG renderers and
  refuses any colour literal or typeface that does not come from the theme; `diagram-views.spec.ts` clicks
  every view of four flows and opens a sequence at 1440 and 400 pixels and requires no overlapping nodes or
  label plates, no connection sampled through a foreign node, no page overflow, a different layout per
  view, and no diagram text rendered below 12 pixels; `diagram-legend.spec.ts` measures every legend item in
  every built-in theme and both schemes — at least 12 pixels, text contrast 4.5:1 and sample contrast 3:1
  against the effective background — and keeps each item inside its frame at 400 pixels in English and
  Russian. The first screen and the dramaturgy forms are checked in `first-screen.test.ts` and
  `first-screen.spec.ts`: the compiler wraps the title, introduction, and a `place="opening"` section into one
  frame in reading order and refuses the placement anywhere but the first section of a titled page; no
  recipe defaults to a stagger or a cascade; every landing route at 1440×900 has no navigation frame above
  its title, keeps the top bar and navigation before `main`, and does not overflow at 400 pixels; the
  landing starter's demo fits the first 900 pixels beside the title; each catalog form is visible and still
  at 1440 and 400 pixels under reduced motion; `compare` follows a click, a drag, and the arrow keys; chapter
  segments match the chapters, fill to the end, and jump on click. Directed motion is checked in
  `motion.test.ts` (runtime growth capped at 15 KB compressed over the pre-motion baseline,
  byte-identical rebuilds, connection order, refusals of wrong
  scenes and counts, theme motion variables) and in `motion-vocabulary.spec.ts` (reduced motion leaves
  every technique still and complete at 1440 and 400 pixels; a steps scene pins, switches its picture and
  lights focus nodes; drawing is empty before the diagram and complete after it; a count passes through
  intermediate values and ends on the written one; a review note on a line-by-line title keeps its quote
  after width and language changes and copy stays exact). `effects.spec.ts` runs the sample effect `tests/fixtures/effects/margin-mark` (a
  canvas and a DOM detail) and requires the same mark positions and states in `live`, `still` and
  `static`, a drawn mark in all three, byte-identical frames for one clock time and a different frame for
  another, zero overlap with text lines at 1280 and 390 pixels (and a positive overlap for the planted
  on-heading placement), and a canvas colour equal to the accent token before and after a scheme switch;
  `effect-check.spec.ts` runs [`effect-check`](#effect-check) on the sample
  (11 of 11) and on a planted defect for each of the eleven checks — an own timer, a hard-coded colour, a
  mark on a heading, a still state that lives in time, a slow frame, overlapping details, a mount that
  breaks on a content edit, a state set only live, a layer printed, third-party code without a licence file
  and two examples with the same text — each failing exactly its check; `effect-bundle.test.ts` refuses a
  bundle one byte over its budget, compiles the bundle as a classic script and runs it in a VM context,
  keeps licence texts, refuses a package import and explains a missing esbuild, and compiles a sample
  effect against the published `agentic-report/effect` types while a misuse of them fails `tsc`;
  `focus-frame.spec.ts` opens the reference WebGL frame through `file://`, checks both variants against
  a page-clock progress change, then checks missing/lost WebGL, the matching 2D drawing, token colours,
  reduced motion, print and all eleven `effect-check` results;
  `motion-performance.spec.ts` scrolls the motion showcase with a 4x slower CPU, video and trace recording
  off because they create long tasks themselves, and requires no long task over 50 ms. It measures the
  display refresh interval before CPU throttling, then requires the 95th-percentile frame interval to stay
  within 2.2 refreshes and the mean within 1.25 refreshes; this distinguishes a single missed refresh from
  sustained half-rate rendering on both 60 Hz and 120 Hz displays. `presentation.spec.ts` turns a fixture deck by keyboard, click and
  address, reveals and hides steps, keeps notes from the audience and shows them to the presenter, runs a
  diagram, a clip, a response form and an unpinned steps scene on slides, turns without transitions under
  reduced motion, prints one slide per page, keeps every slide within 400 pixels, and films the deck: frames
  taken by address in the film view repeat within 0.1% of pixels, a `next()` command clears the settled
  flag and restores it after its published duration (±60 ms), the frame then matches a direct load of the
  same address, and the published durations are stable. `video-sources.test.ts` reads codecs from the
  agentic-screencast encodings of the presentation example, checks source order and types in directory
  output, the single source and warning in one file, chapter buttons, the background poster requirement and
  the manual mode; `video-modes.spec.ts` plays that real clip in both formats, compares `currentSrc` with the
  first source Chromium can decode, seeks by chapter, pauses the background video with its button, keeps a
  manual video waiting, and plays nothing by itself under reduced motion. Real diagram and timeline checks preserve kind signals inside plain, accent and
  contrast contexts. Compact-operation checks observe unclipped bilingual labels, icons, touch targets and
  dialog focus return. Public action groups are checked for forced full-width expansion separately from
  naturally long text.
  Public integration separately enumerates the closed staged inventory, opens the bilingual landing, every
  declared live example, and both canonical locale sources for each. It behaviorally distinguishes Terminal
  console treatment and Cinematic image-first scenes rather than inferring them from theme labels. Initial and
  scrolled states at ultrawide, tall, desktop, mobile, and 304-pixel widths assert useful occupied space,
  readable text, local gallery overflow, real scene/motion state changes, reduced-motion suppression,
  localized switching, contrast, and unchanged document geometry while a selected-text thread is open.
  All five
  package starters are also opened in both profiles, exercise a declared interaction, assert responsive
  containment, and produce inspected captures. Registry-derived portfolio coverage additionally opens every
  shipped starter, layout example, catalog, workspace, and showcase at mobile and ultrawide sizes, switches
  each artifact to Russian, and distinguishes horizontal overflow, disproportionate headings, pages that do
  not occupy the viewport, missing semantic sections, and leaked directive fences. Dedicated semantic-tabs coverage builds every current
  tab-bearing starter, example, and fixture for desktop and mobile `file://` artifacts; it asserts readable
  non-shrinking single-line labels, list-owned overflow where needed, document containment, and pointer and
  keyboard selection and focus. Route-derived layout-integrity coverage also opens the complete registered
  public page inventory at narrow mobile, mobile, and desktop widths. It compares cards, semantic surfaces,
  tables, code blocks, tab lists, visualization frames, and gallery scrollers with their immediate layout
  owner rather than treating the absence of root overflow as sufficient. An overflowing gallery must retain
  effective user-scroll overflow, localized focus semantics and a visible contained next-item preview. Every
  observed rail must also omit those scroll-only semantics whenever its current width has no overflow. A
  generated repeated/mixed wide rail fixture distinguishes a contained one-item rail, compact title/prose/card
  continuations with bidirectional focused keyboard scrolling, and ultrawide two-item tracks that fit without
  a false focus stop or label. The same coverage opens every
  authored popover at mobile and desktop sizes, requires a reversible document overlay host, measures whole-
  panel visual-viewport containment and multi-point topmost hit testing, and repeats after document/nested
  scrolling, viewport resizing, and localized DOM replacement. Dedicated localization coverage builds both formats and verifies ordered
  `navigator.languages` selection, unsupported preference fallback, conditional selector absence, complete
  metadata/content/navigation/chrome replacement, focus return, locale-local review/response/component
  state, version-4 active-locale export, localized visualization text and number formatting, and
  desktop/mobile containment. Dedicated Review Workspace coverage builds both formats and distinguishes
  always-on annotation on a `review: true` page from the retired mode/block-control and layout-shifting
  designs. It exercises
  desktop/mobile list-overlay semantics, unchanged report geometry, ordered user/agent messages, reply/edit,
  resolved/reopened highlights, version-1 rejection, list-only version-2 whole-block import, strict
  substring, inline-markup, adjacent, overlapping, and cross-target anchors, keyboard-focused localized
  **Create note**, exact saved-range **View thread**, focus markers, pointer/touch **View thread**, cancelled
  pointer-state isolation, visible current/prior list-origin focus return, offscreen list navigation, multiple
  notes in one canonical download, exact imported highlight restoration, malformed/mismatched range
  preservation, topbar/control/whitespace suppression, stale prior classification/continuation, and
  idle-versus-active animation-frame bounds. Desktop flip/shift/clamp geometry and the mobile bounded bottom
  surface are exercised through both window and `visualViewport` movement. Measured contextual actions and
  focus markers are checked at constrained edges, after viewport movement, and after their saved range
  becomes wholly offscreen. At the exact 304-pixel width the saved marker must also remain fully separate
  from the range whenever above or below placement fits, so tapping highlighted text still exposes the
  thread action instead of being intercepted by the marker. The same cases produce the inspected selection, popover,
  highlight, and populated desktop/mobile drawer captures.
  Dedicated Response Workspace coverage builds both formats for desktop/mobile, completes all
  seven answer kinds, uses bucket select/drag and explicit ordering controls, preserves original-link state,
  asserts every exported answer shape, compares clipboard/file bytes, forces clipboard failure, rejects
  oversized, unsupported, malformed, and foreign form revisions without state loss, replaces a selected
  global choice with a valid unanswered import, proves whole-artifact restoration by byte equality, isolates
  two forms that reuse radio and bucket item IDs, rejects cross-owner drag while preserving same-owner drag,
  blocks out-of-range/step-mismatched numeric export and import until correction, accepts phase-sensitive
  large four-decimal values through export/import, proves reload returns to the untouched memory-only state,
  checks containment, and captures inspected dense form states. Dedicated copyable-prose coverage opens
  English and Russian single-file/directory artifacts on desktop
  and mobile, asserts proportional wrapping/no code surface, keyboard copy success/failure, exact visible
  multi-paragraph clipboard text, unchanged prose, localization, containment, and inspected light/dark states.
  A local SVG must complete with non-zero intrinsic width in
  both embedded and rewritten hashed forms. The current suite does not cover browser behavior for downloadable assets or local fonts,
  axe/screen-reader evidence or difficult-content reflow beyond the authored fixtures.
- `pack:check` builds an npm tarball, checks its exact release allowlist, metadata, license, types, exports,
  engine, installed CLI version and supported-runtime behavior, CLI shebang, file count, absence of private/temporary paths,
  and common secret/token patterns. It
  computes and prints the candidate SHA-256, then installs the
  tarball into a clean temporary npm consumer, invokes discovery, and builds complete multilingual offline artifacts through the
  installed binary in both formats plus directory output through the ESM API. It also builds every example
  listed in `examples/manifest.json`, starters included, in both formats and verifies the layout its source
  declares; the example, starter, theme and reference-extension lists it expects come from the repository
  manifest, `docs/generated/source-contract.json` and the extension contract, not from counts in the script. Installed
  Terminal and Cinematic examples are built in both formats as well. Their complete source trees are then
  copied from the installed package inside the isolated consumer, edited, and rebuilt as complementary
  single-file and directory artifacts; the authored edit and expected theme identity must survive.
  Installed
  first-use journeys initialize and edit a starter, then build directly for single-file and directory
  output without an analysis-command prerequisite. The single-file route first supplies invalid source to
  build and observes its diagnostic plus preservation of an existing output, then corrects the source and observes
  successful publication. The exact first-use artifacts are opened through `file://`; optional validate and
  inspect behavior remains independently covered. Installed CLI and ESM share builds additionally prove
  exact source-link counts and absence of their workstation paths while default builds retain the links.
  It asserts exact
  discovery/schema/result shapes, rejects retired options, type members, and out-of-domain ESM format
  values without output mutation, and contains conflicting `dist/browser` files to prove the installed
  compiler uses only package-owned runtime assets. Repeated clean-consumer builds compare exact
  single-file bytes and directory trees across independent CLI processes.
  The accepted record is written beside the unique candidate and to the stable ignored
  `test-results/package/candidate-evidence.json` handoff used by the release runbook.

The E2E setup also stages the same-origin public tree and builds directory-format documentation fixtures.
Starter and non-starter artifact preparation derives from the example registry, so newly registered pages
do not require a second preparation list. Response pointer evidence begins a native drag on the card before
scrolling to its destination; it then asserts the assigned bucket and exported state. Visibility evidence
for animated content checks rendered opacity as well as geometry.
Tests start from the staged landing, follow real `file://` links to human and direct agent documentation,
open every independently staged example page, compare rendered documentation across output formats,
assert code/content containment, exercise responsive navigation, and capture desktop/mobile documentation
states in both formats. Screenshots supplement behavioral and byte assertions; they are never the only
evidence.

Tests do not need a URL, port, service, credential, database, or external API. Test workspaces and failure
artifacts live under ignored `test-results/`.

The deployment cache configuration has a unit contract check and a real-image acceptance check. Mutable
HTML, release identity, direct documentation/source, and other unhashed routes must revalidate; twelve-hex
content-addressed assets receive the long immutable policy. The running Nginx image must preserve MIME,
ETag/conditional `304`, health, and real `404` behavior.

## Effect check

`agentic-report effect-check <extension.yaml> --out <directory>` builds the
examples of an effect, opens the first in Chromium and reports `N of M checks passed`. Pages run on the
manual page clock except for the performance pass. An init script records what the effect's own code does
while the engine marks it current: calls of `requestAnimationFrame`, `setTimeout` and `setInterval`, colours
given to a 2D context (`fillStyle`, `strokeStyle`, `shadowColor`, gradient stops) and to WebGL (`clearColor`,
3- and 4-component uniforms whose name contains `color`, `colour`, `tint`, `edge`, `fill`, `stroke` or
`ink`). Each check and the defect it catches:

| Check         | Fails when                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declaration` | a field is empty, fewer than two examples, a named file is missing, the bundle fails, or bundled package code has no licence                                                    |
| `still`       | under reduced motion the picture at 0 s differs from the picture at 60 s, or the effect is not in `still`                                                                       |
| `clock`       | the effect calls its own timer, or two seeks to 2 s or two rebuilds change the picture                                                                                          |
| `performance` | at 4× CPU slowdown while scrolling, resizing and scrolling again, one effect call takes over 50 ms, or the page has a task over 50 ms that a run with effects off does not have |
| `tokens`      | a recorded colour, or a colour of an effect DOM detail, is not a theme colour, before or after a switch to the dark scheme                                                      |
| `text`        | over 0.2 % (and 40) of the text-line pixels on screen are covered by the effect's canvas or details, in any render mode                                                         |
| `widths`      | the page scrolls sideways, effect details overlap by over a quarter, or a host collapses, at 390, 768, 1280 or 1920 px                                                          |
| `content`     | after duplicating a host's section, moving the last section first, or deleting a host's section, the effect fails or loses hosts                                                |
| `states`      | the `data-state-*` names set in `live` differ from those set in `still` or `static` after scrolling the page through                                                            |
| `print`       | the effect layer prints, or a host is hidden or has no text or alternative text in print                                                                                        |
| `examples`    | fewer than two examples, one does not use the effect, or they share over half of their word triples                                                                             |

A page task over 50 ms counts against the effect only when the same pass with effects off
(`window.__agenticReportEffectsOff = true`) has none: garbage collection or another process on a loaded
machine would otherwise fail an effect that did nothing wrong, and the comparison still catches work the
effect leaves to the browser outside its own calls. A timing failure is confirmed with a second independent
effect-on/effect-off pair; both pairs must show the same over-budget condition, so an isolated runner stall
does not reject an effect. The frames `frame-390.png` … `frame-1920.png` are written to the output
directory. The same directory also contains `performance-diagnostics.json`, updated after each completed
effect-on or effect-off pass so a CI timeout does not erase earlier measurements. Only tasks whose start
falls inside a measured scroll or resize phase affect the result; tasks outside those phases are recorded
separately as `unassignedLongTasks` and `unassignedLongFrames`. Each phase records effect-call duration,
long tasks, and long animation frame script time, forced style time, and the time remaining after rendering
and style/layout begin (`renderTailMs` and `layoutAndPaintTailMs`). After a confirmed timing failure,
`effect-check` runs a separate `effect-diagnostic` pass whose probes do not contribute to the 50 ms verdict.
If that advisory pass fails or exceeds 20 seconds, `diagnosticUnavailable: true` records its absence without
replacing the verdict or serializing the browser error.
In that pass the `wall-thread` reference effect records each build in `phases[].builds`: total duration and
numeric time spent measuring geometry,
building the field, route, samples and braid, and assigning stations, balls, nails and chunks. Route time
is split into waypoints, grid search, path pulling, line construction and other work. Builds outside a
measured phase appear in `unassignedBuilds`. Build entries contain only finite
numbers under fixed keys; the file otherwise uses fixed labels and flags, with no authored text or paths.

## Writing tests

- Use deterministic local fixtures and local assets.
- Test security failures before adding success cases for a new filesystem or content capability.
- Import Playwright `test` and `expect` from `tests/e2e/fixtures.ts` so browser errors are attached on
  failure.
- Assert behavior and generated contracts; avoid using screenshots as the only signal.
- Do not record artifact hashes, byte sizes, complete generated JSON, or descriptive prose as golden
  expectations. Determinism compares independent current builds; content-addressing and integrity compute the
  expected digest from the current input bytes. Assert an exact string only when that string is itself a
  public, serialized, accessibility, diagnostic, localization, or security contract. The one exception is
  equivalence with a published renderer: when a change must keep output byte-identical to a released
  version, the expected bytes are captured from that published version, never from the working tree, and
  are refreshed only by capturing them again from it — as the code-highlighting fixtures do with 0.16.0.
- Choose evidence that distinguishes the required behavior from a superficially similar implementation.
  For responsive or animated UI, assert geometry, state transitions, ordering, reduced-motion behavior, and
  bounded work directly. Use an ordinary settled viewport capture for visual inspection; a stitched
  full-page screenshot can misrepresent sticky state and is not behavioral evidence.
- Take motion snapshots on the page clock, not after a real wait. Before `page.goto`, run
  `page.addInitScript(() => { window.__agenticReportClock = 'manual'; })`; time then stands at 0, and
  `window.__clock.seek(t)` puts every entrance, count, transition, scene and extension effect frame at `t` seconds (the
  contract is in the page clock section of [`ARCHITECTURE.md`](ARCHITECTURE.md)). Seek, give the page's
  observers a short real pause, seek to the same `t` again, then capture the viewport. Set scroll-driven
  progress with the `data-clock-progress` attribute instead of scrolling to a pixel.
  `tests/e2e/page-clock.spec.ts` shows the pattern and proves that the same `t` gives byte-identical frames
  across loads and seeks.
- Do not increase a timeout to mask a state, environment, or implementation defect.
