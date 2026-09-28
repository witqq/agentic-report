# Brief: landing page

Category: `landing`. Convince a reader to try, adopt or remember something and send them to one next step.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension        | Question                                                                                      | Answer                                                                                                                                                                     | Source                                           |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `subvariant`     | Which kind of page within the category is this? `product`, `portfolio`, `showcase`, `launch`. | `product`                                                                                                                                                                  | inferred from the product and page               |
| `audience`       | Who reads the page, and what do they already know?                                            | AI agents and the developers who give them page work; readers may know Markdown but should not need a frontend project.                                                    | request and project product boundary             |
| `reader-task`    | What must the reader be able to decide or do after reading?                                   | Decide whether this is the short path for their page task, then build a first page.                                                                                        | request                                          |
| `material`       | What real material exists: screenshots, data, code, clips, quotes, documents?                 | The fictional incident example's exact source metric and built mobile card, built example pages for a decision and a launch, plus actual CLI commands.                     | inferred: repository sources and built artifacts |
| `language`       | Which languages does the page ship in?                                                        | English and Russian from maintained `report.md` and `report.ru.md`.                                                                                                        | inferred: source and route manifest              |
| `art-direction`  | Which visual concept and theme fit the subject and the audience?                              | «Working proof»: neutral paper/graphite, one ochre signal, exact source excerpt and legible built card on the first screen, then three localized closeups from real pages. | inferred from the agent-first request            |
| `motion`         | How much motion suits the page: none, restrained or expressive?                               | `restrained`: one purposeful entrance at most and one pointer response; the proof stays legible without motion.                                                            | inferred from the product and playbook           |
| `interactivity`  | What does the reader do on the page?                                                          | Switch the page theme and language, open real examples and source, and try selected-text Review in place.                                                                  | inferred: existing page and package runtime      |
| `delivery`       | How is the page delivered: one file, a published directory, public or private?                | Normal single-file build for direct handoff; the public site stages the same source as an indexable directory page.                                                        | inferred: source contract and site assembler     |
| `references`     | Which real sites teach this page a useful technique?                                          | The official v0, Lovable, Framer AI, Cursor and Linear product pages; lessons and limits below.                                                                            | inferred: official pages reviewed 2026-09-28     |
| `first-screen`   | What does the first screen show: the result, code beside the result, a diagram or a clip?     | A short product promise, copyable install action, and a linked exact source metric beside its legible built card.                                                          | request and landing playbook                     |
| `call-to-action` | What is the one action the reader should take?                                                | Build the first page.                                                                                                                                                      | request and primary page action                  |

## References

These are composition lessons from the official pages viewed on 2026-09-28, not code or assets to copy. No
pixel measurement is taken from them; the live pages can change.

| Page                                                 | Take                                                                                          | Avoid for this product                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [v0](https://v0.app/)                                | Put the first input and a varied gallery of real outcomes close to the opening promise.       | A wall of community tiles that hides the local author path.                      |
| [Lovable](https://lovable.dev/build/website-builder) | State the outcome in one direct sentence, then show a real generated page.                    | Its hosting and publish promise: this package's default handoff is local.        |
| [Framer AI](https://www.framer.com/ai/)              | Show the editable source and the visual result as one relationship.                           | A visual canvas as a requirement for authors of declarative Markdown.            |
| [Cursor](https://cursor.com/home)                    | Let the real product interface take more area than the title and make the entry action clear. | A decorative interface mockup or a dense product chronology on the first screen. |
| [Linear](https://linear.app/features)                | Reserve signal colour for status and keep ordinary navigation and labels neutral.             | A grid of identical dark feature cards.                                          |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                                 | Origin           | Source                                                                                                                                                               | Licence       |
| ------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `assets/incident-impact-card.png`    | build-screenshot | Customer impact card captured from the English directory build of `examples/incident-review` through `file://` at a 390×800 viewport (see `assets/screenshots.json`) | project (MIT) |
| `assets/incident-impact-card.ru.png` | build-screenshot | The same card after switching that built page to Russian through `file://` at a 390×800 viewport (see `assets/screenshots.json`)                                     | project (MIT) |
| `assets/incident-review.en.png`      | build-screenshot | Recovery card from the English directory build of `examples/incident-review` through `file://` at a 390×800 viewport (see `assets/screenshots.json`)                 | project (MIT) |
| `assets/incident-review.ru.png`      | build-screenshot | The same recovery card after switching the built page to Russian through `file://` at a 390×800 viewport (see `assets/screenshots.json`)                             | project (MIT) |
| `assets/vendor-decision.en.png`      | build-screenshot | Ranking-exception card from the English directory build of `examples/vendor-decision` through `file://` at a 390×800 viewport (see `assets/screenshots.json`)        | project (MIT) |
| `assets/vendor-decision.ru.png`      | build-screenshot | The same ranking-exception card after switching the built page to Russian through `file://` at a 390×800 viewport (see `assets/screenshots.json`)                    | project (MIT) |
| `assets/launch-readiness.en.png`     | build-screenshot | Activation card from the English directory build of `examples/launch-readiness` through `file://` at a 390×800 viewport (see `assets/screenshots.json`)              | project (MIT) |
| `assets/launch-readiness.ru.png`     | build-screenshot | The same activation card after switching the built page to Russian through `file://` at a 390×800 viewport (see `assets/screenshots.json`)                           | project (MIT) |
| `assets/social-preview.png`          | build-screenshot | the first screen of this page built with `agentic-report build` and photographed at 1200×630, light scheme                                                           | project (MIT) |

## Verified product claims

| Claim on the page                                                                        | Product source                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A Markdown entry can build a portable single file or a directory.                        | `src/authoring/registry.ts:34-39`, `src/core/prepare-report.ts:108-113`                                                         |
| The agent's common commands are `init` and `build`, and `document` is a starter.         | `src/cli.ts:116-124`, `src/cli.ts:165-176`, `src/authoring/registry.ts` example registry                                        |
| The page can declare a Russian localization, theme switcher, Review, and a motion level. | `src/authoring/registry.ts:418-423`, `src/authoring/registry.ts:500-542`                                                        |
| The ordinary source can declare extensions explicitly.                                   | `src/authoring/registry.ts:550-557`, `src/authoring/extension-gate.ts`                                                          |
| Review threads can be created, reopened, resolved, and exported in the page.             | `src/browser/review-workspace.ts:100-115`, `src/browser/review-workspace.ts:330-339`, `src/browser/review-workspace.ts:398-461` |
| The public site stages the maintained source files and compiled bilingual examples.      | `scripts/build-site.ts:357-389`, `website/routes.json`                                                                          |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- None.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
