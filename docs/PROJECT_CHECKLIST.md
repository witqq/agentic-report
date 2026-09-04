# Project quality checklist

Use this checklist before each commit. It contains quality gates only.

## Build and static analysis

- [ ] `pnpm build` succeeds.
- [ ] `pnpm typecheck` succeeds with strict TypeScript unchanged.
- [ ] `pnpm lint` reports no warnings or errors.
- [ ] `pnpm format:check` succeeds after any explicit formatting pass.

## Tests and package

- [ ] Relevant unit tests pass through `pnpm test:unit`.
- [ ] Generated-artifact browser tests pass through `pnpm test:e2e` when behavior or rendering changed.
- [ ] `pnpm pack:check` confirms the npm tarball contract when exports, bin, build, or package metadata changed. The run isolates its own toolchain and npm global prefix, so it needs no change to the machine.
- [ ] Failure artifacts were read before any rerun.

## Content compiler

- [ ] Single-file behavior remains the default and is covered.
- [ ] Directory output and its external package runtime remain covered.
- [ ] New filesystem references are confined before I/O.
- [ ] Semantic directives execute only package-owned behavior and no author code.
- [ ] Document language metadata matches the authored content.
- [ ] Output remains deterministic and reports byte/hash/asset metadata.
- [ ] Publication failures preserve authoritative output and remove compiler-owned staging paths.
- [ ] Output does not alias an entry, manifest, partial, or local resource by path or filesystem identity.
- [ ] Agent JSON/NDJSON contracts remain stable or have an explicit compatibility decision.

## Documentation and Git hygiene

- [ ] `docs/ARCHITECTURE.md` reflects accepted architecture changes.
- [ ] User-facing commands and schemas are reflected in the README and agent reference.
- [ ] The change is on a feature branch and uses a conventional commit message.
- [ ] No credentials, test results, tarballs, build output, or agent temporary files are staged.
- [ ] Publication or deployment changes are explicitly scoped, verified, and free of credentials.
