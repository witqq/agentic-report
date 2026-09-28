# Release runbook

The release cycle has one full local gate and a separate browser-free gate bound to the release tag.
Publication and deployment then validate their own effects. Run each gate once for unchanged bytes;
do not repeat public downloads, route crawls, or registry journeys after they pass.

## Prepare once

Use Node.js 24.18.0 or newer on a clean feature branch. Update the package, skill, plugin, documentation, and
test version literals together, then run:

```sh
pnpm format
pnpm verify
git status --short
```

`pnpm verify` checks generated authoring projections, strict types, lint, formatting, unit tests, the npm
inventory, and a clean installed-package consumer, then runs browser E2E against generated and installed
`file://` artifacts. Install Playwright Chromium before running it locally. The automated release workflow
uses `pnpm verify:ci`, which repeats the non-browser checks on the release tag and does not install
Chromium. Scheduled nightly E2E is separate from the release gate. The package check writes tarball identity
to `test-results/package/candidate-evidence.json`.

If `verify` passes and the release commit does not change afterward, do not run its constituent checks again.
Create the pull request, merge it, and bind the release to that exact merge commit. A documentation-only
merge commit does not require rebuilding the same candidate when its tree matches the reviewed head.

## Publish

Read the accepted candidate record once:

```sh
candidate_record="$(pwd)/test-results/package/candidate-evidence.json"
candidate_path="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.path)' "$candidate_record")"
candidate_sha256="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.tarball.sha256)' "$candidate_record")"
test -f "$candidate_path"
test -n "$candidate_sha256"
```

Verify that `origin/main` points to the accepted merge commit. Create an annotated tag on that commit and
push it from a clean feature branch: the
pre-push hook rejects pushes while `main` is checked out, including tag pushes. The `GitHub Release` workflow
(`.github/workflows/release.yml`) checks that the tag matches the package version, refuses personal paths and
credentials, runs `pnpm verify:ci`, refuses to replace an existing release, and creates one GitHub Release whose
only binary asset is the accepted tarball, with a description ending in `[Made with Moira](https://moira-mcp.com/)`.

```sh
git fetch origin main
accepted_merge_commit="$(git rev-parse origin/main)"
git tag -a v0.19.0 "$accepted_merge_commit" -m "agentic-report 0.19.0"
git push origin v0.19.0
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Read the accepted SHA-256 from the workflow's last step ("Report the accepted asset identity") and use it below.

Dispatch the trusted OIDC workflow. It downloads the canonical GitHub Release asset, verifies the supplied
SHA-256 and package/tag identity, and publishes those exact bytes. A successful workflow is the publication
gate; do not duplicate it with a second download or isolated install.

```sh
gh workflow run publish-npm.yml --ref main -f tag=v0.19.0 -f sha256="$candidate_sha256"
gh run list --workflow publish-npm.yml --limit 1 --json databaseId,status,conclusion,headSha,url
gh run watch "<databaseId>" --exit-status
npm view agentic-report dist-tags version --json
```

Continue only when the workflow succeeds and npm reports `latest` and `version` as `0.19.0`. Do not run
`npm publish` locally and do not move or overwrite a public tag or release asset.

## Deploy

Deploy the same merge commit through the repository contract:

```sh
pnpm deploy:prod
infra-tools status agentic-report --server witqq.ru --remote-dir /opt/agentic-report
```

The deployment command builds the staged site, records the package version and source revision in
`release.json`, uploads the image, starts the Compose service, and owns its health check. If it fails, inspect
that stage and repair its root cause; do not rerun the local `pnpm verify` unless the repair changes
repository bytes.

After a healthy deploy, perform one public smoke test:

```sh
curl --fail --silent --show-error https://agentic-report.witqq.dev/release.json
curl --fail --silent --show-error --output /dev/null https://agentic-report.witqq.dev/
curl --fail --silent --show-error https://agentic-report.witqq.dev/robots.txt
curl --fail --silent --show-error --output /dev/null https://agentic-report.witqq.dev/sitemap.xml
```

Confirm `release.json` reports package `0.19.0` and the accepted merge commit, the landing returns HTML over
trusted TLS, `robots.txt` names the absolute sitemap and `sitemap.xml` is served, and then record the
deployment in the operator's deployment inventory, which lives outside this repository. This single smoke checks
the public route and deployed identity; route construction was covered by both verification gates, while
installed-package browser checks ran in the local full gate and the scheduled nightly suite.

## Failure handling

Stop at the failed stage, inspect its own logs or structured result, and fix the owning source or automation.
Repeat only the affected gate and every later stage. Run the local full `pnpm verify` again only when repository
bytes changed. Never turn a failed release into a pass by moving a tag, replacing an immutable asset,
weakening TLS, bypassing package identity, or editing evidence.

External push, GitHub Release creation, npm publication, deployment, and community listing changes require
the caller's authorization. The repository metadata exposes the skill to compatible installers; no separate
community listing claim is part of the release gate.
