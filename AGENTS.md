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
  `docs/product/source-contract.md`, the public site under `website/`).

Each fact lives in one place and the others link to it; a copied fact drifts.

The skill is self-contained: write a lesson as its content — the rule, the number — not as a link. An
external address in `skills/agentic-report` comes only from the allowlist in
`tests/unit/skill-self-contained.test.ts`.

## Where to look

| Question                                       | Where                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| How the compiler, runtime and output are built | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                           |
| What an author may write                       | [`docs/product/source-contract.md`](docs/product/source-contract.md), `agentic-report schema`                            |
| What agents are taught                         | [`skills/agentic-report/`](skills/agentic-report/)                                                                       |
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
- Do not add timed annotations over video (a `video-note` block): agentic-screencast draws annotations in
  the frame itself, an overlay drifts on seeking and is invisible to a screen reader, and what a reader
  needs without the video belongs in the caption and the chapters.
- Keep CLI JSON/NDJSON output stable, structured, and free of file contents or credentials.

## Governing product principles

Simplicity, visual quality, and usability are the primary product criteria. `agentic-report` must make a
polished agent-to-human page materially easier and faster to produce than implementing an equivalent page
from scratch.

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

- Run tests only through `pnpm test`, `pnpm test:unit`, `pnpm test:e2e`, or `pnpm test:perf` (timed budgets,
  alone and never in parallel with another suite); these invoke Testfold.
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

## Skills and knowledge describe current facts

Skills and knowledge references contain confirmed facts about current capabilities, rules, recommendations, conditions of use and limitations. Do not include development history, session or review narratives, iteration logs, accounts of the research process or the origins of changes. Express a useful finding as a rule or recommendation while retaining its basis and scope.

Negative examples may explain a concrete mistake, its consequence and the correction. Make them self-contained, without participants, conversation quotes or chronology. Preserve supporting sources, measurement conditions, evidence limitations and dates needed to judge a fact's currency. Change history belongs in Git or a separately requested report.
