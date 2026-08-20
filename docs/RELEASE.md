# Release runbook

This runbook separates local release-candidate evidence from observations that can exist only after the
candidate is public. Release `0.2.0` is not proven by an installed tarball alone: GitHub, npm, registry-clean
`npx`, the hosted site, and community skill channels are distinct ordered gates.

## Local candidate

Use Node.js 24.18.0 or newer and begin with a clean feature branch:

```sh
pnpm install --frozen-lockfile
pnpm format
pnpm verify
git status --short
```

`pnpm verify` must finish with generated authoring files unchanged, all unit and browser tests passing, and a
clean installed-package consumer. Record the tarball path, SHA-256, package file count, supported Node/npm/npx
paths, and the exact source commit. Inspect the complete `npm pack --json` inventory and the complete staged
site inventory before scanning their bounded bytes for credentials, private paths, workflow files, caches,
logs, editor state, VCS state, and temporary output.

The candidate must agree on all of these values before any external action:

- package, installed CLI `--version`, skill and plugin metadata: `0.2.0`;
- package and skill license: MIT;
- package engine and human/agent/skill compatibility: Node.js `>=24.18.0`;
- repository: `https://github.com/witqq/agentic-report`;
- npm package: `https://www.npmjs.com/package/agentic-report`;
- homepage and staged-site origin: `https://agentic-report.witqq.dev/`.

Running the installed tarball through `npx --no-install` is local-candidate evidence. It is not evidence that
the npm registry serves `0.2.0` and must be labelled accordingly.

## Publish source before package

After the accepted release commit is on the public default branch, create and push an annotated tag that
points to that exact commit. Verify the commit and tag through the public GitHub origin before publishing npm.
Do not tag a dirty tree or move an existing tag.

```sh
git status --short
git rev-parse HEAD
git tag -a v0.2.0 -m "agentic-report 0.2.0"
git push origin HEAD
git push origin v0.2.0
```

Push and tag creation are external mutations and require the release operator's explicit authorization.

## Publish the inspected tarball

Publish the exact tarball whose SHA-256 and inventory passed the local gate; do not let `npm publish` create
different bytes from the working tree.

```sh
npm publish --access public ./agentic-report-0.2.0.tgz
npm view agentic-report@0.2.0 version dist.integrity dist.shasum dist.tarball --json
npm view agentic-report dist-tags --json
```

The gate passes only when the immutable version exists and the `latest` dist-tag resolves to `0.2.0`.

## Prove real registry npx

Use one fresh shell and create both isolated journeys before either touches npm. The commands below bind npm
and npx beside the selected supported Node executable, restrict their search path, create distinct workspaces
and caches, and positively prove both caches begin empty:

```sh
release_node="$(command -v node)"
release_bin="$(dirname "$release_node")"
release_npm="$release_bin/npm"
release_npx="$release_bin/npx"
release_path="$release_bin:/usr/bin:/bin"
test -x "$release_node"
test -x "$release_npm"
test -x "$release_npx"

pinned_root="$(mktemp -d)"
latest_root="$(mktemp -d)"
pinned_work="$pinned_root/work"
latest_work="$latest_root/work"
pinned_cache="$pinned_root/npm-cache"
latest_cache="$latest_root/npm-cache"
mkdir -p "$pinned_work" "$latest_work" "$pinned_cache" "$latest_cache"
test "$pinned_root" != "$latest_root"
test "$pinned_cache" != "$latest_cache"
test -z "$(find "$pinned_cache" -mindepth 1 -print -quit)"
test -z "$(find "$latest_cache" -mindepth 1 -print -quit)"
test ! -e "$pinned_work/node_modules"
test ! -e "$latest_work/node_modules"
if PATH="$release_path" command -v agentic-report >/dev/null 2>&1; then exit 1; fi
printf '%s\n' "$release_node" "$release_npm" "$release_npx" "$pinned_work" "$pinned_cache" "$latest_work" "$latest_cache"
```

Run the pinned journey only from its new workspace. Every registry/npm/npx operation is explicitly bound to
its assigned cache and executable:

```sh
cd "$pinned_work"
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npm" view agentic-report@0.2.0 version dist.integrity dist.shasum dist.tarball --json
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npx" --yes agentic-report@0.2.0 --version
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npx" --yes agentic-report@0.2.0 init ./pinned-page --starter landing --json
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npx" --yes agentic-report@0.2.0 validate ./pinned-page --json
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npx" --yes agentic-report@0.2.0 inspect ./pinned-page --json
env PATH="$release_path" npm_config_cache="$pinned_cache" "$release_npx" --yes agentic-report@0.2.0 build ./pinned-page --output ./pinned-page.html --json
find "$pinned_cache/_npx" -path '*/node_modules/agentic-report/package.json' -print
find "$pinned_cache/_npx" -name package-lock.json -print
```

The unversioned journey first observes `latest=0.2.0` through its own still-empty cache, then uses only that
cache and workspace:

```sh
cd "$latest_work"
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npm" view agentic-report dist-tags --json
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npm" view agentic-report@0.2.0 version dist.integrity dist.shasum dist.tarball --json
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npx" --yes agentic-report --version
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npx" --yes agentic-report init ./latest-page --starter landing --json
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npx" --yes agentic-report validate ./latest-page --json
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npx" --yes agentic-report inspect ./latest-page --json
env PATH="$release_path" npm_config_cache="$latest_cache" "$release_npx" --yes agentic-report build ./latest-page --output ./latest-page.html --json
find "$latest_cache/_npx" -path '*/node_modules/agentic-report/package.json' -print
find "$latest_cache/_npx" -name package-lock.json -print
```

Run the blocks under a command recorder that preserves each expanded absolute argv, cwd, exit status,
stdout, and stderr. Preserve the initial empty-cache observations and final cache inventories. From each
printed npx `package.json` and lockfile record the installed version, bin target, registry-resolved tarball and
integrity; they must match the corresponding `npm view` values and the public release. Both artifacts must
open normally through `file://` in Chromium with no page/console error or horizontal overflow. The two cache
and workspace roots must remain distinct, and neither may contain a checkout link or local tarball. Published
`0.1.1` evidence is historical channel evidence only.

## Deploy and accept the site

Build the site from the same public release commit and deploy the complete new tree. Trusted TLS is the first
gate. A certificate failure stops acceptance; never use `-k`, a custom CA, a hosts-file override, HTTP, or a
browser bypass to turn it green.

For every declaration in `website/routes.json`, require HTTPS 2xx, the expected MIME family, and hosted bytes
matching `release.json`. Crawl internal links from the landing, open the three live examples and their public
Markdown sources, and compare canonical direct docs/skill bytes. A deliberate absent path must return a real
404 body rather than the landing page or another catch-all HTML response.

## Distribute the skill last

Only after GitHub, npm, both registry journeys, trusted TLS, and hosted byte/route checks pass may the release
be submitted to community skill channels. Validate installation from the public repository:

```sh
npx skills add witqq/agentic-report --skill agentic-report
```

Record OpenAI, Anthropic, and skills.sh status exactly as observed. Repository manifests are community
metadata; they do not prove curated, official, verified, approved, or indexed status. Update a listing only
from the same tagged skill bytes, and repeat its validator and public-install check after every skill change.

## Stop conditions

Stop the release at the first mismatch, credential exposure, unexpected public/package file, registry
provenance gap, engine warning on the supported runtime, untrusted TLS result, catch-all 404, or changed byte.
Repair the owning source, create a new candidate, and repeat every gate the correction can affect. Never
rewrite evidence to describe a different commit, tarball, site tree, or skill revision.
