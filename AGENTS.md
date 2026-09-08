# Project instructions

These rules augment the global agent instructions. They describe only contracts specific to
`agentic-report`.

## Product boundary

- Keep the public source format declarative and writable without JSX: Markdown, manifest/frontmatter,
  confined Markdown partials, and local assets.
- Preserve `single-file` as the default output and `directory` as the optional large-page output. Both use
  the normal package-owned browser runtime; no-JavaScript and runtime-failure profiles are out of scope.
- Do not add remote fetching, raw HTML, executable templates, plugins, or a large UI/content framework
  without source-grounded research and an explicit security/portability decision.
- React and Vite are internal implementation details. Do not expose them as requirements for CLI users.
- Keep CLI JSON/NDJSON output stable, structured, and free of file contents or credentials.

## Governing product principles

Simplicity, visual quality, and usability are the primary product criteria. `agentic-report` must make a
polished agent-to-human page materially easier and faster to produce than implementing an equivalent page
from scratch.

- Guarantee quality by construction. Ordinary declarative content composed from a small, understandable
  set of package-owned components and blocks must produce a coherent, polished, responsive result by
  default. Authors must not need internal design-system knowledge, CSS repair, layout tuning, or a long
  mandatory command sequence.
- Keep complexity inside the package. Prefer strong defaults, composable components, and one obvious
  primary author journey. Advanced controls may remain available for explicit needs, but they must not be
  prerequisites for a good first result.
- Treat authored content as opaque input. The product may validate syntax, types, confinement, and explicit
  component contracts, but it must not infer, classify, score, approve, or reject the meaning or quality of
  the author's content. Do not add semantic-content heuristics, visual linters, author-facing design
  budgets, or rejection rules as substitutes for robust components.
- Make every supported component combination usable across the product's supported viewport and locale
  profiles. Responsive behavior, hierarchy, typography, spacing, controls, accessibility, and visual
  balance belong to package-owned components and defaults rather than per-page fixes.
- Treat a merely valid or non-overflowing page as insufficient evidence. Acceptance must include direct
  inspection of representative real pages and confirm that information hierarchy, composition, controls,
  and reading flow are effective on both compact and large displays.

## Architecture and source

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the authoritative architecture document.
- Confine filesystem references to the source root before reading them.
- Access environment variables only through `src/config/environment.ts`.
- Preserve strict TypeScript; do not add `any` or weaken strict compiler/lint rules.
- Keep rendering, source loading, component/runtime behavior, asset processing, CLI transport, and public contracts independently
  testable even while they live in one npm package.

## Russian landing and example prose

When renderer or visual-system work changes Russian prose in a landing or example, first converge the facts,
structure, links, and component intent with the maintained English variant. Then apply the installed
`humanize-ru` skill conservatively to the Russian wording while preserving its register, technical meaning,
and localization parity.

Do not apply that writing skill to code, schemas, runtime semantics, diagnostics, or tests. Never turn its
guidance into authored-content inference, scoring, rejection, or validation inside the product.

## Verification

- Run tests only through `pnpm test`, `pnpm test:unit`, or `pnpm test:e2e`; these invoke Testfold.
- Read `test-results/summary.json` and generated failure Markdown before rerunning failures.
- Run `pnpm verify` before a commit when the environment supports browser tests.
- Browser tests must open normal interactive generated artifacts through `file://`; do not introduce a
  test server or hardcoded URL/port.
- Hooks are check-only. Run `pnpm format` explicitly before verification; never add mutating hook commands.

## Repository hygiene

- Work on feature branches; direct commits and pushes from `main`/`master` are blocked.
- Put agent-owned temporary artifacts under `agent_temp_files_local/`. It is excluded through
  `.git/info/exclude`, not the tracked `.gitignore`.
- Do not create `.github/workflows`, deployment configuration, Docker files, or publication automation
  without a later approved scope change.

## Autonomous product program

The user has explicitly authorized fully autonomous work on `agentic-report` and will not be available to
answer questions during this program of work. Do not pause to request the user's approval, preference, or
confirmation when a decision can be made within the repository and the product goal below. Resolve such
decisions automatically from evidence, documented requirements, engineering judgment, and the safest
path that still achieves the complete outcome.

- Do not use the `start-development` skill for this program. Use `moira/todo-list` as the parent
  orchestrator.
- The only Moira workflows approved for this program are `moira/todo-list`, `moira/quick-task`,
  `moira/robust-task`, and `moira/software-development-flow`. Do not start any other workflow.
- Build the orchestrator plan from child Moira workflows. Use `moira/quick-task` or `moira/robust-task`
  children for bounded research and product work, and `moira/software-development-flow` children for
  implementation.
- When a new workflow performs a stage that belongs to a current workflow, it must be started as a child
  with `parentExecutionId` set to the current parent execution. Never start an embedded stage as an
  unrelated standalone execution. Continue the parent after the child completes.
- Continue through research, product strategy, architecture, implementation, verification, packaging,
  documentation, operational readiness, and deploy readiness. Do not stop at an MVP, prototype, plan,
  scaffold, or partial implementation.
- Determine the number and boundaries of stages autonomously. Include all work required for a coherent,
  useful, production-ready open-source product, even when it requires substantial research, code, tests,
  documentation, or rework.
- Decide quality criteria, architecture, implementation approach, research depth, product positioning,
  adoption features, distribution strategy, and sustainable monetization options autonomously. The goal
  is usefulness and broad adoption; direct paid sales are optional, not assumed.
- When a Moira step presents an approval-style choice, select the option that continues the already
  authorized program if it stays within this repository and these requirements. Do not treat the user's
  absence as a blocker for ordinary product or engineering choices.
- Standing Moira decision delegation: the user appoints the agent as the user's decision-maker for every
  approval, confirmation, plan acceptance, review-limit, retry, continue, and equivalent user-choice gate
  in this autonomous program. Do not pause or ask the user to answer such a gate. Read the exact artifact,
  options, review, and evidence; choose the option that best advances the authorized goal without lowering
  quality or violating the external-action boundary; and record the chosen decision in the durable file
  required by the workflow as an exercise of this standing delegation.
- Treat this standing delegation as the user's explicit authorization to return an affirmative decision
  when the reviewed option is sound and in scope, or a negative/rework decision when evidence shows a
  defect. A workflow's user-choice gate is not a reason to stop merely because it is phrased as a request
  for explicit user approval.
- Standing delegation supplies the user-side decision; it does not permit fabricating evidence, marking an
  incomplete condition complete, bypassing a non-decision technical or security gate, or performing the
  separately excluded external actions.
- Mandatory system, tool, security, and workflow completion conditions still apply. Never claim a gate
  passed without evidence and never bypass a hard requirement that cannot be satisfied automatically.
- Work may modify this repository, install project dependencies, run tests and local build tooling, create
  child Moira executions, and create local commits when a workflow requires them. Keep work on a feature
  branch.
- Production-ready and deploy-ready are required outcomes. Actual external push, npm publication,
  deployment, account creation, paid purchase, credential use, or other irreversible external action is
  not implied by deploy readiness and requires separate explicit authority.

The autonomous program is complete only when the product requirements in
[`PRODUCT-REQUIREMENTS.md`](PRODUCT-REQUIREMENTS.md) are implemented and verified as a finished product,
with no known blocking defect or required stage left incomplete.
