# Contributing to agentic-report

Search existing issues before proposing a change. Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md). Project rules for agents and people are in [AGENTS.md](AGENTS.md); the planned work
and the owner's decisions are in [docs/BACKLOG.md](docs/BACKLOG.md) and [docs/decisions.md](docs/decisions.md).

## Development setup

Use Node.js 24.18.0 or newer and the pnpm version pinned in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

`pnpm verify` runs the full local unit and browser E2E suite, including installed-package `file://` checks.
Pull-request and release workflows use browser-free `pnpm verify:ci`: generated authoring projections,
strict types, lint, formatting, unit tests and the clean npm package consumer. The full Playwright suite
also runs nightly at 03:00 UTC; it does not block a pull request or release. `pnpm check:history` refuses
personal paths and credentials in tracked files.

## Changes

- Work on a dedicated branch and keep one logical change together with its tests and documentation.
- A change that adds or alters a capability updates the skill and its references in the same commit
  (`AGENTS.md`, «The one rule»). Run `pnpm generate:authoring` after touching the registry or the themes.
- Reuse the registry, theme tokens, runtime controllers and interface primitives before adding a parallel
  mechanism. Every visual capability takes its look from theme tokens and has a reduced-motion state.
- Add a check that distinguishes the requested state from a plausible incorrect state, and show it failing on
  the counterexample before it passes.
- Use imperative commit subjects with a `feat:`, `fix:`, `docs:`, `test:`, `build:`, or `chore:` prefix.

Describe the commands and observed results in the pull request. A maintainer performs release, npm
publication, and deployment by following [docs/RELEASE.md](docs/RELEASE.md).

## Traps

These cost review rounds, and none of them announce themselves:

- A container query container (`container-type: inline-size`) also scopes CSS counters to its subtree: a
  counter incremented inside it restarts. Numbers that must run across the page (figures, chapters) are set by
  the compiler, not by CSS counters.
- A heading word fit measured in `vw` is wrong wherever a contents column or a two-column opening narrows the
  column; measure with `cqi` of the heading's own container.
- A class or attribute that the runtime sets but no CSS rule reads silently does nothing; check both sides.
- Browser tests that wait for "all animations" hang on an infinite animation: filter by a finite end time.
- Under heavy machine load a few browser tests are timing-sensitive (see `docs/BACKLOG.md`, flaky tests); find
  the source of nondeterminism instead of raising a timeout.
- The theme selector embeds the fonts of every theme; the unit test keeps it under 1.3 MB. A new pair that
  brings a new family spends that budget.
- A string that a guard test plants as a counterexample must not appear literally in a tracked file, or the
  guard finds the test itself; assemble it from parts.
- Prettier preserves prose line breaks in Markdown (`proseWrap: preserve`); wrap long lines yourself.
