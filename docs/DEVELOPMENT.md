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

The project has a static compiler and an optional local living-document host, with no Docker environment,
database, or required environment file. Build output is written to `dist/node/` (`tsc`) and `dist/browser/`
(`scripts/build-browser.ts`: the browser modules and stylesheets pages are bundled from, and the embedded
fonts); the build removes both directories first (`scripts/clean-build.ts`), so a module deleted from `src/`
leaves no compiled files behind.

## Local CLI use

```bash
node dist/node/cli.js describe --json
node dist/node/cli.js schema
node dist/node/cli.js build examples/document --output report.html
node dist/node/cli.js serve examples/document --agent none --human
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
and exercises direct `init` → edit → `build` → `file://` first-use journeys in both output formats. Build's
own invalid-source refusal and output preservation are checked before the corrected artifact is accepted;
optional validation and inspection are exercised separately. It also starts the installed watcher-only
live host and checks that its reader and contextual bridge can be bundled and served. It prints the candidate tarball path, SHA-256,
and file count. Do not publish the tarball as part of local verification.

## Quality commands

```bash
pnpm format
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm verify
```

`pnpm format` is intentionally explicit. Git hooks run checks only and never modify staged or source
files.

## Configuration

The compiler requires no environment variables. Current-session hosting reads author identity and control
endpoint through `src/config/environment.ts`; explicit standalone hosting inherits the user's environment.
All environment access remains in that module. See the
[live operating guide](../skills/agentic-report/references/process.md#live-local-document) for Codex setup.

## Continuous integration

Every pull request and every push to `main` runs two workflows. `CI` (`.github/workflows/ci.yml`) installs the
pinned toolchain, refuses personal paths and credentials in tracked files (`pnpm check:history`) and runs
`pnpm verify`. `Security` (`.github/workflows/security.yml`) scans the whole history with a checksum-pinned
gitleaks, reviews dependency changes, validates workflows with actionlint, and refuses any action that is not
pinned to a full commit SHA. Dependabot proposes weekly updates for npm packages and actions. Release and npm
publication workflows are described in [`RELEASE.md`](RELEASE.md).
