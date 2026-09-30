# Brief: landing page

Category: `landing`. Convince a reader to try, adopt or remember something and send them to one next step.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension        | Question                                                                                      | Answer                                                                                             | Source                           |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| `subvariant`     | Which kind of page within the category is this? `product`, `portfolio`, `showcase`, `launch`. | `product`                                                                                          | inferred from the page           |
| `audience`       | Who reads the page, and what do they already know?                                            | Developers and agent builders who hand pages to people.                                            | inferred from the page           |
| `reader-task`    | What must the reader be able to decide or do after reading?                                   | Decide to try agentic-report and build a first page.                                               | inferred from the page           |
| `material`       | What real material exists: screenshots, data, code, clips, quotes, documents?                 | Real build screenshots of three examples, the Markdown source beside its result, commands.         | inferred from the files          |
| `language`       | Which languages does the page ship in?                                                        | English and Russian: `report.md` and `report.ru.md` carry the same content.                        | inferred from the files          |
| `art-direction`  | Which visual concept and theme fit the subject and the audience?                              | «Night product page»: `midnight` theme with the reader theme selector; source beside result first. | inferred from the source         |
| `motion`         | How much motion suits the page: none, restrained or expressive?                               | One pointer-depth effect on the review chapter; scenes on the story chapters.                      | inferred from the source         |
| `delivery`       | How is the page delivered: one file, a published directory, public or private?                | One HTML file built with `agentic-report build`; the public site also serves it as a page.         | inferred                         |
| `first-screen`   | What does the first screen show: the result, code beside the result, a diagram or a clip?     | Markdown source beside the cards it builds.                                                        | inferred from the source         |
| `call-to-action` | What is the one action the reader should take?                                                | Build the first page.                                                                              | inferred from the primary action |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                               | Origin           | Source                                                                                                                                                                | Licence       |
| ---------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `assets/incident-review.png`       | build-screenshot | `examples/incident-review` built as one HTML file and photographed at 1280×800 in the light scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`) | project (MIT) |
| `assets/incident-review-dark.png`  | build-screenshot | `examples/incident-review` built as one HTML file and photographed at 1280×800 in the dark scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`)  | project (MIT) |
| `assets/vendor-decision.png`       | build-screenshot | `examples/vendor-decision` built and photographed at 1280×800 in the light scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`)                  | project (MIT) |
| `assets/vendor-decision-dark.png`  | build-screenshot | `examples/vendor-decision` built and photographed at 1280×800 in the dark scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`)                   | project (MIT) |
| `assets/launch-readiness.png`      | build-screenshot | `examples/launch-readiness` built and photographed at 1280×800 in the light scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`)                 | project (MIT) |
| `assets/launch-readiness-dark.png` | build-screenshot | `examples/launch-readiness` built and photographed at 1280×800 in the dark scheme (`scripts/capture-site-screenshots.ts`, `assets/screenshots.json`)                  | project (MIT) |
| `assets/social-preview.png`        | build-screenshot | the first screen of this page built with `agentic-report build` and photographed at 1200×630, light scheme                                                            | project (MIT) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- None.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
