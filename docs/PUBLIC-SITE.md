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

Site assembly adds one compact `Made with Moira` footer to every staged HTML page. The footer links to
`https://moira-mcp.com/`, makes no runtime request, and is deliberately owned by the public-site
assembler rather than the compiler. Ordinary pages built by package users are therefore unchanged. The
same attribution appears at the bottom of the repository README rendered by GitHub and npm.

## Host acceptance

Deploy the complete `site/` tree without an SPA fallback. Before accepting the deployment, require:

- ordinary HTTPS for `https://agentic-report.witqq.dev` with the intended hostname, valid dates, and a
  complete chain to a publicly trusted root;
- no `-k`, custom CA, browser certificate bypass, hosts override, or HTTP downgrade;
- HTTP 2xx for every route in `website/routes.json` and the expected MIME family: HTML for `.html`,
  Markdown/plain text for `.md` and `.txt`, and JSON for `.json`;
- a deliberate absent path returning a real 404 rather than the landing HTML;
- hosted direct-file bytes matching `release.json`, normal landing navigation, and normal browser behavior.

## Prepare and deploy the container

Deployment uses the same site assembler as local inspection. Begin from a clean committed feature or release
revision; preparation refuses a dirty checkout so `release.json.sourceRevision` cannot describe different
bytes.

```sh
pnpm deploy:prepare
pnpm deploy:config
docker build --platform linux/amd64 --tag agentic-report-site:local .
```

`deploy:prepare` safely replaces only the ignored generated `site/` directory. `.dockerignore` admits only
that directory, the nginx configuration, and the Dockerfile, so source, Git state, credentials, tests, caches,
and agent workspaces are outside the image build context. nginx serves explicit files and directory indexes
without an SPA fallback; an absent path remains a real 404.

Nginx requires revalidation for mutable HTML, `release.json`, direct Markdown/documentation, manifests, and
other unhashed routes, so a release cannot leave an old shell or identity current. Files whose compiler-owned
name contains a twelve-hex content digest—runtime, stylesheet, image, font, data, or another directory asset—
receive `public, max-age=31536000, immutable`. ETag remains enabled for both families; acceptance includes a
conditional `304 Not Modified`, correct MIME, the health route, and a deliberate 404.

The production command builds the same image and deploys it through the configured `infra-tools` and Traefik
contract:

```sh
pnpm deploy:prod
infra-tools status agentic-report --server witqq.ru --remote-dir /opt/agentic-report
infra-tools logs agentic-report 100 --server witqq.ru --remote-dir /opt/agentic-report
```

No environment file or application secret is required by this static service. Production execution remains
an external mutation and must use an explicitly authorized release revision.

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

The GitHub Release description must end with a `Made with Moira` link to the same canonical Moira product
endpoint. This keeps attribution present on the GitHub release surface as well as the README and site.

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
operator checks, and stop conditions are maintained in [`RELEASE.md`](RELEASE.md).
