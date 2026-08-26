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
  diagnostics, both output formats and their derived runtime placement, truthful discovery/schema defaults,
  declared Node.js floor comparison and below-floor diagnostic behavior,
  manifest/frontmatter provenance, entry/partial diagnostic source maps, source/output collision protection,
  deterministic review-target manifests and local-input revisions, strict canonical review JSON,
  exact/changed/missing/ambiguous entry/partial binding, confined review paths, and sanitized review transport,
  exact serialized inline-size accounting, canonical and hard-link source/output collision protection,
  injected partial-write/rename preservation and retry for both output formats, same-process name/content
  determinism, registry-owned page layouts/themes/token defaults, GFM table rendering, collision-free
  document shell IDs, compiler results, deterministic public-site staging, complete declared-route
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
  hash ownership without `IntersectionObserver`, desktop collapse,
  native-dialog mobile
  focus containment/return, normal/reduced-motion progress and one-time reveal, themes, visible focus,
  locally scrolling wide tables, built-in demo and code-copy interactions, embedded single-file and
  external directory runtimes, and representative architecture, tutorial, work-report, and landing-page
  artifacts. The document, dashboard, landing, and mixed examples are built and exercised through
  `file://` in desktop and mobile profiles, including their page data contract and local images. All six
  package starters are also opened in both profiles, exercise a declared interaction, assert responsive
  containment, and produce inspected captures. Dedicated semantic-tabs coverage builds every current
  tab-bearing starter, example, and fixture for desktop and mobile `file://` artifacts; it asserts readable
  non-shrinking single-line labels, list-owned overflow where needed, document containment, and pointer and
  keyboard selection and focus. Dedicated Review Workspace coverage builds both formats, exercises clean
  enter/exit, desktop/mobile dialog semantics, equal-text target isolation, ordered user/agent messages,
  message editing, resolved/reopened state, version-1 rejection without state loss, canonical download,
  exact import and stale prior-thread classification, and produces the required visually inspected state
  captures. A local SVG must complete with non-zero intrinsic width in
  both embedded and rewritten hashed forms. The current suite does not cover browser behavior for downloadable assets or local fonts,
  axe/screen-reader evidence or difficult-content reflow beyond the authored fixtures.
- `pack:check` builds an npm tarball, checks its exact release allowlist, metadata, license, types, exports,
  engine, installed CLI version and supported-runtime behavior, CLI shebang, file count, absence of private/temporary paths,
  and common secret/token patterns. It
  computes and prints the candidate SHA-256, then installs the
  tarball into a clean temporary npm consumer, invokes discovery, and builds complete offline artifacts through the
  installed binary in both formats plus directory output through the ESM API. It also builds every packaged
  page-layout example and all six starters in both formats and verifies the selected layout. Two installed
  first-use journeys perform init, edit, validate, inspect, and build for single-file and directory output.
  It asserts exact
  discovery/schema/result shapes, rejects retired options, type members, and out-of-domain ESM format
  values without output mutation, and contains conflicting `dist/browser` files to prove the installed
  compiler uses only package-owned runtime assets. Repeated clean-consumer builds compare exact
  single-file bytes and directory trees across independent CLI processes.
  The accepted record is written beside the unique candidate and to the stable ignored
  `test-results/package/candidate-evidence.json` handoff used by the release runbook.

The E2E setup also stages the same-origin public tree and builds directory-format documentation fixtures.
Tests start from the staged landing, follow real `file://` links to human and direct agent documentation,
open all three independently staged showcase pages, compare rendered documentation across output formats,
assert code/content containment, exercise responsive navigation, and capture desktop/mobile documentation
states in both formats. Screenshots supplement behavioral and byte assertions; they are never the only
evidence.

Tests do not need a URL, port, service, credential, database, or external API. Test workspaces and failure
artifacts live under ignored `test-results/`.

## Writing tests

- Use deterministic local fixtures and local assets.
- Test security failures before adding success cases for a new filesystem or content capability.
- Import Playwright `test` and `expect` from `tests/e2e/fixtures.ts` so browser errors are attached on
  failure.
- Assert behavior and generated contracts; avoid using screenshots as the only signal.
- Do not increase a timeout to mask a state, environment, or implementation defect.
