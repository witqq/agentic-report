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

`pnpm verify` runs the unit and E2E entry points sequentially. Both suites own files under `test-results/`, so
the required pre-commit gate must not run their workspace setup and cleanup concurrently.

## Tiers

- `unit` uses Vitest for source loading, validation, lexical and symlink partial/asset confinement,
  Markdown/directive rendering, image/download/font embedding and copying, absent-only starter
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
  determinism, registry-owned page layouts/themes/token defaults, the complete closed section visual
  grammar with independent invalid-value and executable-attribute rejection, registry-declared rejection of
  mosaic/stack with layers/gallery card-layout conflicts, identical single-file/directory and
  document/dashboard projections, post-enhancement per-rail gallery candidate marking across titles, sibling
  prose, repeated and Markdown-separated structures plus true one-item omission, GFM table rendering,
  collision-free
  document shell IDs, default attribution and explicit footer opt-out without changing authored content,
  compiler results, deterministic public-site staging, complete declared-route
  reachability, direct-file byte identity, release hashes, synchronized skill/plugin metadata, and public
  tree safety. Public-site staging also rejects route/source escapes, canonically external page sources,
  symlinked direct inputs, an existing destination, release-identity divergence, and invalid generated routes
  while proving failed candidates are removed and prior destination bytes are preserved. Hostile concurrent
  path mutation, process/OS crash recovery,
  and a cross-platform determinism matrix are outside the proportionate filesystem contract.
- `e2e` uses Playwright with desktop and mobile Chromium profiles. Global setup generates a real
  self-contained artifact; tests open it through `file://` and verify document navigation, code,
  responsive navigation, deterministic current-section ownership, sticky-topbar target clearance and
  settled normal/reduced hash ownership including the no-`scrollend` fallback, full bounded geometry and
  hash ownership without `IntersectionObserver`, generated in-flow contents using exact final headings and
  final explicit targets in both formats, short-sidebar-label divergence, fragment navigation, and
  narrow-screen visibility with the drawer closed, section lead and moved appendix definition states across
  desktop/mobile, light/dark and both formats, desktop collapse,
  native-dialog mobile
  focus containment/return, normal/reduced-motion progress, reveal/stagger entrances, progress/sticky
  scenes, ordered semantic choreography, fine-pointer depth/tilt/magnetic effects, responsive action
  placement, offscreen idling and animation-frame coalescing, themes, visible focus,
  locally scrolling wide tables, protected loopback source-location links that preserve the report page,
  authored glossary forms, first-only color-preserving code glossary references, clean code copying,
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
  overflow; image completion; and document containment. Dedicated foundation coverage also distinguishes
  the localized icon toolbar in fine/coarse pointer profiles, native locale focus, useful compact heading/
  action geometry, section-local short-story floats, and nonintersecting Russian stage titles/media at both
  constrained and wide desktop widths. Wide visual-family coverage separately preserves stage, split, and
  gallery track behavior. Inspected captures supplement those geometry and computed-style assertions.
  Public integration separately enumerates the closed staged inventory, opens the bilingual landing, every
  declared live example, and both canonical locale sources for each. It behaviorally distinguishes Terminal
  console treatment and Cinematic image-first scenes rather than inferring them from preset labels. Initial and
  scrolled states at ultrawide, tall, desktop, mobile, and 304-pixel widths assert useful occupied space,
  readable text, local gallery overflow, real scene/motion state changes, reduced-motion suppression,
  localized switching, contrast, and unchanged document geometry while a selected-text thread is open.
  All six
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
  always-on annotation from the retired mode/block-control and layout-shifting designs. It exercises
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
  installed binary in both formats plus directory output through the ESM API. It also builds every packaged
  page-layout example and all six starters in both formats and verifies the selected layout. Installed
  Terminal and Cinematic examples are built in both formats as well. Their complete source trees are then
  copied from the installed package inside the isolated consumer, edited, and rebuilt as complementary
  single-file and directory artifacts; the authored edit and expected preset identity must survive.
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

## Writing tests

- Use deterministic local fixtures and local assets.
- Test security failures before adding success cases for a new filesystem or content capability.
- Import Playwright `test` and `expect` from `tests/e2e/fixtures.ts` so browser errors are attached on
  failure.
- Assert behavior and generated contracts; avoid using screenshots as the only signal.
- Do not record artifact hashes, byte sizes, complete generated JSON, or descriptive prose as golden
  expectations. Determinism compares independent current builds; content-addressing and integrity compute the
  expected digest from the current input bytes. Assert an exact string only when that string is itself a
  public, serialized, accessibility, diagnostic, localization, or security contract.
- Choose evidence that distinguishes the required behavior from a superficially similar implementation.
  For responsive or animated UI, assert geometry, state transitions, ordering, reduced-motion behavior, and
  bounded work directly. Use an ordinary settled viewport capture for visual inspection; a stitched
  full-page screenshot can misrepresent sticky state and is not behavioral evidence.
- Do not increase a timeout to mask a state, environment, or implementation defect.
