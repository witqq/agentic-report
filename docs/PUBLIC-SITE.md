# Public site and skill release

The public static tree is assembled by `pnpm build:site`. The compiler still builds one page at a time;
the staging command only places independently compiled HTML pages and canonical direct files under one
origin. It adds no router, server, or second authoring format.

## Build and inspect locally

Use Node.js 24.18.0 or newer from a clean committed revision:

```sh
pnpm install --frozen-lockfile
pnpm build:site -- --output ./site --revision "$(git rev-parse HEAD)"
```

The output destination must not exist. Open `site/index.html` through `file://`, then inspect
`site/release.json`. Every route and every staged file other than `release.json` has a recorded SHA-256
digest and byte count. Direct Markdown and skill files are copied from their canonical repository sources;
they are not rendered or maintained as separate copies.

## Host acceptance

Deploy the complete `site/` tree without an SPA fallback. Before accepting the deployment, require:

- ordinary HTTPS for `https://agentic-report.witqq.dev` with the intended hostname, valid dates, and a
  complete chain to a publicly trusted root;
- no `-k`, custom CA, browser certificate bypass, hosts override, or HTTP downgrade;
- HTTP 2xx for every route in `website/routes.json` and the expected MIME family: HTML for `.html`,
  Markdown/plain text for `.md` and `.txt`, and JSON for `.json`;
- a deliberate absent path returning a real 404 rather than the landing HTML;
- hosted direct-file bytes matching `release.json`, normal landing navigation, and normal browser behavior.

## Keep the skill synchronized

For release `R`, update the package version, CLI runtime identity, `skills/agentic-report/SKILL.md`
`metadata.version`, both plugin manifest versions, the Claude marketplace entry, documentation commands,
and generated `release.json` together. Then:

1. Validate source contracts, package, skill, plugin manifests, staged routes, hashes, and public safety.
2. Publish the same commit and tag to GitHub and npm.
3. Prove pinned `agentic-report@R` and unversioned `latest=R` with separate empty npm caches.
4. Build and deploy that commit; pass trusted TLS, route, MIME, byte, link, and real-404 checks.
5. Only then submit or update the community OpenAI and Anthropic listings and verify
   `npx skills add witqq/agentic-report --skill agentic-report` from the public repository.

OpenAI/ChatGPT, Anthropic, and skills.sh review or discovery status must be recorded as observed. Repository
metadata is community/unofficial and must not claim curated, verified, or official placement. Pending
review is not publication. Credentials and irreversible submission actions never belong in repository
files or in this build command.

The channel contracts used by this process are the public [Agent Skills specification](https://agentskills.io/specification),
[OpenAI skill](https://learn.chatgpt.com/docs/build-skills) and
[plugin](https://learn.chatgpt.com/docs/build-plugins) guidance, Anthropic's
[plugin marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces), and the
[skills.sh CLI documentation](https://www.skills.sh/docs/cli). Recheck those sources at release time;
their submission and discovery behavior is external to this repository and may change independently.

The complete source → npm → registry `npx` → trusted-TLS site → skill-channel order, exact future commands,
provenance requirements, and stop conditions are maintained in [`RELEASE.md`](RELEASE.md).
