# Development

## Prerequisites

- Node.js 24.18.0 LTS or a compatible newer supported release;
- Corepack with pnpm 11.21.0;
- Chromium installed through Playwright for browser tests.

## Setup and build

```bash
corepack enable
pnpm install
pnpm build
```

The project is a CLI/static compiler and has no development server, localhost port, Docker environment,
database, or environment file. Build output is written to `dist/node/` and `dist/browser/`.

## Local CLI use

```bash
node dist/node/cli.js describe --json
node dist/node/cli.js schema
node dist/node/cli.js build examples/document --output report.html
```

The executable can also be tested as an npm package with `pnpm pack:check`. The run isolates itself: it
links only the interpreters it needs into its own toolchain directory, sets its own npm global prefix, and
searches only those directories plus system utilities, so a globally installed copy of the product — for
example a `npm link` on this checkout — cannot serve the consumer and does not have to be removed first.
Isolation replaces the demand on the machine without weakening the guarantee: the preflight still refuses
when a product executable is present inside the run environment. The consumer directory is created fresh
under a random name and the search directories are built by the run itself, so checking that refusal means
editing `scripts/check-package.ts` to write an `agentic-report` executable into the toolchain directory it
just created, running `pnpm pack:check`, reading `Clean consumer preflight found a checkout link, a
product executable inside the run environment, or a reused cache`, and reverting the edit.
That command verifies the exact tarball inventory and metadata, installs the tarball into a clean consumer,
and exercises direct `init` → edit → `build` first-use journeys in both output formats without a browser.
E2E opens those built artifacts through `file://`. Build's
own invalid-source refusal and output preservation are checked before the corrected artifact is accepted;
optional validation and inspection are exercised separately. It prints the candidate tarball path, SHA-256,
and file count. Do not publish the tarball as part of local verification.

## Quality commands

```bash
pnpm format
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:ci
pnpm pack:check
pnpm verify
pnpm verify:ci
```

`pnpm format` is intentionally explicit. Git hooks run checks only and never modify staged or source
files. `pnpm test` and `pnpm verify` run the full local unit and browser E2E suite; `pnpm test:ci` and
`pnpm verify:ci` are browser-free. The package candidate check performs one fresh npm installation, so it
needs registry access. Browser E2E needs Playwright Chromium. Use one gate for the desired scope rather than
running every command in the list: `pnpm verify` already includes `pnpm test` and the package check.

## Configuration

The product currently requires no environment variables. If runtime environment behavior is added, read
variables only in `src/config/environment.ts` and expose typed values to the rest of the code.

## Continuous integration

Every pull request and every push to `main` runs two workflows. `CI` (`.github/workflows/ci.yml`) installs the
pinned toolchain, refuses personal paths and credentials in tracked files (`pnpm check:history`) and runs
`pnpm verify:ci`. Scheduled nightly E2E installs Chromium and runs `pnpm test:e2e`. `Security`
(`.github/workflows/security.yml`) scans the whole history with a checksum-pinned
gitleaks, reviews dependency changes, validates workflows with actionlint, and refuses any action that is not
pinned to a full commit SHA. Dependabot proposes weekly updates for npm packages and actions. Release and npm
publication workflows are described in [`RELEASE.md`](RELEASE.md).
