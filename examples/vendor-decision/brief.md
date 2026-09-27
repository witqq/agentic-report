# Brief: answer page

Category: `answer`. Put a question, choices or a form in front of the reader and collect a structured answer.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                                                | Source                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `subvariant`    | Which kind of page within the category is this? `choice`, `questions`, `survey`, `brief`.                                            | `choice`                                                                                                              | inferred from the page   |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | Procurement and support leads choosing an AI support vendor.                                                          | inferred from the page   |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | Approve or reject the reversible pilot of Cedar Assist, weighing the options and their evidence.                      | inferred from the source |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | Hard gates, weighted scores, and a drawn evidence map (sample data).                                                  | inferred from the page   |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                                           | inferred from the files  |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | The `calm-paper` theme; a ruled decision packet.                                                                      | inferred from the source |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | Expressive: two reveals and two staggered entrances, cascades of evidence, a progress scene and depth on one section. | inferred from the source |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Only reads: the decision with its evidence in tabs and disclosures; there is no answer form.                          | inferred from the source |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page.                            | inferred                 |
| `respondent`    | Who answers, and how much context do they have?                                                                                      | Procurement and support leads choosing an AI support vendor.                                                          | inferred from the page   |
| `handoff`       | Where do the answers go after export, and who reads them?                                                                            | The chosen option and conditions go to procurement.                                                                   | inferred from the page   |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                         | Origin | Source                                                 | Licence       |
| ---------------------------- | ------ | ------------------------------------------------------ | ------------- |
| `assets/evidence-map.svg`    | drawn  | drawn for this page: weighted evidence for each vendor | project (MIT) |
| `assets/evidence-map.ru.svg` | drawn  | Russian version of `evidence-map.svg`                  | project (MIT) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- Every name, number, and date on the page is sample data and must be replaced with real facts before use.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
