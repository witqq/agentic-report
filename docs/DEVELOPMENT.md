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
node dist/node/cli.js build examples/basic --output report.html
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
That command verifies the exact tarball inventory and metadata, installs the tarball into a clean consumer, and exercises CLI/ESM first-use
journeys in both output formats. It prints the candidate tarball path, SHA-256, and file count. Do not
publish the tarball as part of local verification.

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

The product currently requires no environment variables. If runtime environment behavior is added, read
variables only in `src/config/environment.ts` and expose typed values to the rest of the code.
