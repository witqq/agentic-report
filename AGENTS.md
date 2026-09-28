# Project instructions

These rules augment the global agent instructions. They describe only contracts specific to
`agentic-report`.

## The one rule: a change updates what the agent knows

An agent knows only what it reads in the skill. A capability that the skill does not name does not exist for
the agent that builds pages. So every change that adds, removes, or alters a capability updates, in the same
commit, everything an agent reads about it:

- the skill (`skills/agentic-report/SKILL.md`) and the reference it belongs to in
  `skills/agentic-report/references/`;
- the generated catalogue and schemas (`pnpm generate:authoring`; `pnpm check:authoring` fails when they are
  stale);
- the user and agent documentation that states the fact (`README.md`, `docs/AGENT-REFERENCE.md`,
  `docs/product/source-contract.md`, the public site under `website/`);
- the backlog entry in [`docs/BACKLOG.md`](docs/BACKLOG.md), when the change closes one.

Each fact lives in one place and the others link to it; a copied fact drifts.

The skill knowledge must be usable without opening external links: state each lesson as an action, condition,
measurement, or counterexample in the relevant reference. Keep an external address only when the address
itself is an action target, a literal example, or a licence requirement. List every allowed address with
its file and reason in `tests/unit/skill-self-contained.test.ts`; the test also rejects obsolete exceptions.

## Where to look

| Question                                       | Where                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| How the compiler, runtime and output are built | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                           |
| What an author may write                       | [`docs/product/source-contract.md`](docs/product/source-contract.md), `agentic-report schema`                            |
| What agents are taught                         | [`skills/agentic-report/`](skills/agentic-report/)                                                                       |
| What is planned and what the owner decided     | [`docs/BACKLOG.md`](docs/BACKLOG.md), [`docs/decisions.md`](docs/decisions.md)                                           |
| How to test, build and release                 | [`docs/TESTING.md`](docs/TESTING.md), [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md), [`docs/RELEASE.md`](docs/RELEASE.md) |
| How to contribute and report a vulnerability   | [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md)                                                       |

## Product boundary

- The product is a tool that lets agents build good pages for many kinds of tasks without effort. What is
  universal — a layout mode, a block many pages need, a check every page benefits from — belongs in the core.
  What is specific to one design — a custom effect, something hard to render and not universal — is built
  through the extension API, and the core helps the agent do it rather than forbidding it.
- Keep the public source format declarative and writable without JSX: Markdown, manifest/frontmatter,
  confined Markdown partials, confined theme files (YAML/JSON data, never CSS), JSON data files, and local
  assets. Author code enters only through the extension API, which declares it, bundles it with a hash in the
  page security policy, and checks it with the same checks as the built-in effects.
- Preserve `single-file` as the default output and `directory` as the optional large-page output.
- React and Vite are internal implementation details. Do not expose them as requirements for CLI users.
- Keep CLI JSON/NDJSON output stable, structured, and free of file contents or credentials.

## Governing product principles

Simplicity, visual quality, and usability are the primary product criteria. `agentic-report` must make a
polished agent-to-human page materially easier and faster to produce than implementing an equivalent page
from scratch.

Optimize the agent's path from a brief to a finished, high-quality page. Common cases should need only
declarative source and strong defaults: keep layout decisions and visual quality in the package, make the
ordinary `init` → edit → `build` path short, and prefer existing universal primitives before introducing
another author choice or using a custom extension for a design-specific need.

- Guarantee quality by construction. Ordinary declarative content composed from package-owned components and
  blocks must produce a coherent, polished, responsive result by default.
- Keep complexity inside the package. Prefer strong defaults, composable components, and one obvious primary
  author journey.
- Treat authored content as opaque input. The compiler validates syntax, types, confinement, component
  contracts and declared data expectations, but it does not infer, score, approve, or reject the meaning or
  quality of the author's content. Craft advice lives in the skill: its design rules, its design check
  (`skills/agentic-report/scripts/design-check.mjs`), and its snapshot measurements run outside `build` and
  `validate` and never become build diagnostics.
- Every visual capability takes its look only from theme tokens, works in every built-in theme and in an
  author theme, has a reduced-motion state and a static equivalent for print.
- Treat a merely valid or non-overflowing page as insufficient evidence. Acceptance includes direct
  inspection of representative real pages on compact and large displays.

## Architecture and source

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the authoritative architecture document.
- Confine filesystem references to the source root before reading them.
- Access environment variables only through `src/config/environment.ts`.
- Preserve strict TypeScript; do not add `any` or weaken strict compiler/lint rules.
- Keep rendering, source loading, component/runtime behavior, asset processing, CLI transport, and public
  contracts independently testable.

## Dependencies and licences

Decisions made so that the next change does not bring them back:

- Do not embed GSAP (its licence forbids no-code animation builders), Rive, Lottie/dotLottie, Spline,
  Theatre.js, or React islands in the page runtime.
- Do not copy code from Aceternity, React Bits, Hover.dev, Tailwind Plus, Cult UI Pro, ThemeForest, Envato,
  Framer or Webflow templates, or Unicorn Studio; from coss/Origin UI and shadcn/ui only MIT-licensed parts.
- Motion Primitives, Animata, AstroAnimate, demos.gsap.com and Awwwards are sources of ideas, not of code.
  Motion and Lenis (MIT) are acceptable if a library is really needed.
- Effect code is our own or under MIT, Apache-2.0, or Unlicense with its notice kept.

## WebGL: do not

- Do not drive a camera by scroll keyframes without an owner decision.
- Do not add GPGPU particles.
- Do not use WebGPU without a WebGL fallback.
- Do not store scene data as JSON where a texture carries it.

## Russian landing and example prose

When renderer or visual-system work changes Russian prose in a landing or example, first converge the facts,
structure, links, and component intent with the maintained English variant. Then apply the installed
`humanize-ru` skill conservatively to the Russian wording while preserving its register, technical meaning,
and localization parity. Do not apply that writing skill to code, schemas, runtime semantics, diagnostics, or
tests.

## Verification

- Run tests only through `pnpm test`, `pnpm test:ci`, `pnpm test:unit`, or `pnpm test:e2e`; these invoke
  Testfold. The default `pnpm test` runs unit and E2E locally; pull-request and release automation use
  browser-free `pnpm verify:ci`, and scheduled nightly automation runs E2E.
- Read `test-results/summary.json` and generated failure Markdown before rerunning failures.
- Run `pnpm verify` before a commit when the environment supports browser tests.
- Browser tests open normal generated artifacts through `file://`; do not introduce a test server or a
  hardcoded URL or port.
- Hooks are check-only. Run `pnpm format` explicitly before verification; never add mutating hook commands.
- A check is evidence only if it fails on the counterexample it exists for; state in each check what defect it
  catches.

## Repository hygiene

- Work on feature branches; direct commits and pushes from `main`/`master` are blocked.
- Put agent-owned temporary artifacts under `agent_temp_files_local/`, excluded through `.git/info/exclude`,
  not the tracked `.gitignore`.
- Continuous integration, security checks and release automation live in `.github/`; keep every action pinned
  to a full commit SHA.
- Never commit personal paths, credentials, or machine-specific configuration; `pnpm check:history` guards the
  tracked files.
