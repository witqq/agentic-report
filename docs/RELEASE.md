# Release runbook

This runbook separates local release-candidate evidence from observations that can exist only after the
candidate is public. Release `0.2.5` is not proven by an installed tarball alone: GitHub, npm, registry-clean
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

The package gate writes the accepted current record to `test-results/package/candidate-evidence.json` as well
as beside its unique candidate. Bind later commands to that record before leaving the repository:

```sh
candidate_record="$(pwd)/test-results/package/candidate-evidence.json"
test -f "$candidate_record"
candidate_sha256="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.sha256)' "$candidate_record")"
candidate_integrity="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.integrity)' "$candidate_record")"
candidate_shasum="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.shasum)' "$candidate_record")"
test -n "$candidate_sha256"
test -n "$candidate_integrity"
test -n "$candidate_shasum"
```

The candidate must agree on all of these values before any external action:

- package, installed CLI `--version`, skill and plugin metadata: `0.2.5`;
- package and skill license: MIT;
- package engine and human/agent/skill compatibility: Node.js `>=24.18.0`;
- repository: `https://github.com/witqq/agentic-report`;
- npm package: `https://www.npmjs.com/package/agentic-report`;
- homepage and staged-site origin: `https://agentic-report.witqq.dev/`.

Running the installed tarball through `npx --no-install` is local-candidate evidence. It is not evidence that
the npm registry serves `0.2.5` and must be labelled accordingly.

## Publish source before package

After the accepted release commit is on the public default branch, create and push an annotated tag that
points to that exact commit. Verify the commit and tag through the public GitHub origin before publishing npm.
Do not tag a dirty tree or move an existing tag.

```sh
git status --short
git rev-parse HEAD
git tag -a v0.2.5 -m "agentic-report 0.2.5"
git push origin HEAD
git push origin v0.2.5
```

Push and tag creation are external mutations and require the release operator's explicit authorization.
The GitHub Release description for the tag must end with
`[Made with Moira](https://moira-mcp.com/)`.

## Publish the inspected tarball

Upload the exact locally accepted `agentic-report-0.2.5.tgz` bytes as the asset of the verified GitHub
Release `v0.2.5`. Download that public asset into a new empty directory, verify its SHA-256 equals the local
candidate, then publish the exact canonical HTTPS asset URL. Local directories, relative/absolute paths,
`file:` specifications, alternate hosts/repositories/tags/names/versions, URL credentials, query strings,
fragments, and encoded near-misses are forbidden because npm copies source provenance into immutable public
metadata.

```sh
candidate_record="$(pwd)/test-results/package/candidate-evidence.json"
candidate_sha256="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.sha256)' "$candidate_record")"
candidate_integrity="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.integrity)' "$candidate_record")"
candidate_shasum="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.shasum)' "$candidate_record")"
release_asset_url="https://github.com/witqq/agentic-report/releases/download/v0.2.5/agentic-report-0.2.5.tgz"
asset_root="$(mktemp -d)"
curl --fail --location --proto '=https' --tlsv1.2 --output "$asset_root/agentic-report-0.2.5.tgz" "$release_asset_url"
test "$(shasum -a 256 "$asset_root/agentic-report-0.2.5.tgz" | awk '{print $1}')" = "$candidate_sha256"
npm publish --access public "$release_asset_url"
metadata_root="$(mktemp -d)"
mkdir -p "$metadata_root/home" "$metadata_root/npm-cache"
: > "$metadata_root/user.npmrc"
: > "$metadata_root/global.npmrc"
env -i PATH="$PATH" HOME="$metadata_root/home" npm_config_cache="$metadata_root/npm-cache" npm_config_userconfig="$metadata_root/user.npmrc" npm_config_globalconfig="$metadata_root/global.npmrc" npm view agentic-report@0.2.5 --json > "$asset_root/npm-version.json"
printf 'Expected integrity: %s\nExpected shasum: %s\n' "$candidate_integrity" "$candidate_shasum"
cat "$asset_root/npm-version.json"
env -i PATH="$PATH" HOME="$metadata_root/home" npm_config_cache="$metadata_root/npm-cache" npm_config_userconfig="$metadata_root/user.npmrc" npm_config_globalconfig="$metadata_root/global.npmrc" npm view agentic-report dist-tags --json
```

Inspect the complete unauthenticated version document, not a selected projection. Confirm the expected
package, version, license, Node engine, executable, repository, homepage, `_from`, `_resolved`, registry
tarball, SHA-512 integrity, and SHA-1 shasum. Search the complete document for workstation or temporary
paths such as `/Users/` and `/tmp/`, `file:` sources, credentials, tokens, passwords, private keys, workflow
paths, and test output. Stop on any mismatch or sensitive value. Continue only when `latest` resolves to
`0.2.5`.

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
pinned_home="$pinned_root/home"
latest_home="$latest_root/home"
pinned_userconfig="$pinned_root/user.npmrc"
latest_userconfig="$latest_root/user.npmrc"
pinned_globalconfig="$pinned_root/global.npmrc"
latest_globalconfig="$latest_root/global.npmrc"
mkdir -p "$pinned_work" "$latest_work" "$pinned_cache" "$latest_cache" "$pinned_home" "$latest_home"
: > "$pinned_userconfig"
: > "$latest_userconfig"
: > "$pinned_globalconfig"
: > "$latest_globalconfig"
test "$pinned_root" != "$latest_root"
test "$pinned_cache" != "$latest_cache"
test "$pinned_userconfig" != "$latest_userconfig"
test "$pinned_globalconfig" != "$latest_globalconfig"
test -z "$(find "$pinned_cache" -mindepth 1 -print -quit)"
test -z "$(find "$latest_cache" -mindepth 1 -print -quit)"
test ! -s "$pinned_userconfig"
test ! -s "$latest_userconfig"
test ! -s "$pinned_globalconfig"
test ! -s "$latest_globalconfig"
test ! -e "$pinned_work/node_modules"
test ! -e "$latest_work/node_modules"
if PATH="$release_path" command -v agentic-report >/dev/null 2>&1; then exit 1; fi
printf '%s\n' "$release_node" "$release_npm" "$release_npx" "$pinned_work" "$pinned_cache" "$latest_work" "$latest_cache"
```

Run the pinned journey only from its new workspace. Every registry/npm/npx operation is explicitly bound to
its assigned cache and executable:

```sh
cd "$pinned_work"
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npm" view agentic-report@0.2.5 --json > ./npm-version.json
cat ./npm-version.json
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npx" --yes agentic-report@0.2.5 --version
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npx" --yes agentic-report@0.2.5 init ./pinned-page --starter landing --json
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npx" --yes agentic-report@0.2.5 validate ./pinned-page --json
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npx" --yes agentic-report@0.2.5 inspect ./pinned-page --json
env -i PATH="$release_path" HOME="$pinned_home" npm_config_cache="$pinned_cache" npm_config_userconfig="$pinned_userconfig" npm_config_globalconfig="$pinned_globalconfig" "$release_npx" --yes agentic-report@0.2.5 build ./pinned-page --output ./pinned-page.html --json
find "$pinned_cache/_npx" -path '*/node_modules/agentic-report/package.json' -print
find "$pinned_cache/_npx" -name package-lock.json -print
```

The unversioned journey first observes `latest=0.2.5` through its own still-empty cache, then uses only that
cache and workspace:

```sh
cd "$latest_work"
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npm" view agentic-report dist-tags --json
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npm" view agentic-report@0.2.5 --json > ./npm-version.json
cat ./npm-version.json
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npx" --yes agentic-report --version
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npx" --yes agentic-report init ./latest-page --starter landing --json
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npx" --yes agentic-report validate ./latest-page --json
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npx" --yes agentic-report inspect ./latest-page --json
env -i PATH="$release_path" HOME="$latest_home" npm_config_cache="$latest_cache" npm_config_userconfig="$latest_userconfig" npm_config_globalconfig="$latest_globalconfig" "$release_npx" --yes agentic-report build ./latest-page --output ./latest-page.html --json
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

Build the site from the same public release commit and deploy the complete new tree through the repository's
Docker/infra-tools contract:

```sh
pnpm deploy:prepare
test "$(node -e 'process.stdout.write(require("./site/release.json").sourceRevision)')" = "$(git rev-parse HEAD)"
pnpm deploy:config
pnpm deploy:prod
infra-tools status agentic-report-site --server witqq.ru --remote-dir /opt/agentic-report
infra-tools logs agentic-report-site 100 --server witqq.ru --remote-dir /opt/agentic-report
```

Preparation requires a clean checkout and replaces only ignored `site/`. The Docker context is an allowlist
containing the generated public tree and nginx-owned deployment files; do not weaken it by adding source,
`.git`, environment files, credentials, tests, caches, or workflow artifacts.

Trusted TLS is the first hosted gate. A certificate failure stops acceptance; never use `-k`, a custom CA, a
hosts-file override, HTTP, or a browser bypass to turn it green.

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
