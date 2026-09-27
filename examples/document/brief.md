# Brief: document page

Category: `document`. Explain a finding, a system or a procedure so the reader can check and act on it.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                         | Source                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| `subvariant`    | Which kind of page within the category is this? `report`, `research`, `architecture`, `code-review`, `incident`, `guide`.            | `report`                                                                                       | inferred: a release decision report |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | The release owner and the people who sign off on a release.                                    | inferred from the sample            |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | Accept or hold the release, knowing which evidence backs it.                                   | inferred from the decision section  |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | A drawn architecture diagram, findings in a partial, a timeline; all sample data.              | inferred from the files             |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                    | inferred from the files             |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | A custom `release-report` theme extending `calm-paper`: calm reading, contents in the sidebar. | inferred: no theme is set           |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | None beyond package defaults.                                                                  | inferred from the source            |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Only reads; disclosures open the detail.                                                       | inferred from the source            |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page.     | inferred                            |
| `depth`         | Does the reader need the conclusion only, or the full evidence behind it?                                                            | Conclusion first, then the full evidence on the same page.                                     | inferred from the order             |
| `review`        | Will someone review the page in place and hand notes back?                                                                           | No.                                                                                            | inferred: `review` is not set       |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                         | Origin | Source                                                                              | Licence       |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------- | ------------- |
| `assets/architecture.svg`    | drawn  | drawn for this page: evidence moving from source through verification to a decision | project (MIT) |
| `assets/architecture.ru.svg` | drawn  | Russian version of `architecture.svg`                                               | project (MIT) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- All findings, owners, and dates are sample data.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
