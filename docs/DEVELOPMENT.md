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

The executable can also be tested as an npm package with `pnpm pack:check`. That command verifies the exact
tarball inventory and metadata, installs the tarball into a clean consumer, and exercises CLI/ESM first-use
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
