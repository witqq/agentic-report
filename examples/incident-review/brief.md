# Brief: document page

Category: `document`. Explain a finding, a system or a procedure so the reader can check and act on it.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                                           | Source                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `subvariant`    | Which kind of page within the category is this? `report`, `research`, `architecture`, `code-review`, `incident`, `guide`.            | `incident`                                                                                                       | inferred from the page     |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | Engineering and support leads after a P1 incident.                                                               | inferred from the page     |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | Understand impact and cause, then own the follow-up actions.                                                     | inferred from the page     |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | A drawn service topology, an impact chart, a response timeline (sample data).                                    | inferred from the files    |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                                      | inferred from the files    |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | A custom `incident-signal` theme extending `ember` in the dark scheme; a contrast opening, one topology picture. | inferred from the source   |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | Staggered entrances on two chapters, a progress scene on the opening.                                            | inferred from the source   |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Filters and switches views: a filter, tabs, and disclosures.                                                     | inferred from the source   |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page.                       | inferred                   |
| `depth`         | Does the reader need the conclusion only, or the full evidence behind it?                                                            | Conclusion first, then the evidence.                                                                             | inferred from the order    |
| `review`        | Will someone review the page in place and hand notes back?                                                                           | No.                                                                                                              | inferred from the manifest |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                                  | Origin | Source                                                                                        | Licence       |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | ------------- |
| `assets/service-topology.svg`         | drawn  | drawn for this page: traffic through checkout, billing, and the payment provider              | project (MIT) |
| `assets/service-topology-dark.svg`    | drawn  | dark-scheme variant of `service-topology.svg`, the same drawing in the page's dark colours    | project (MIT) |
| `assets/service-topology.ru.svg`      | drawn  | Russian version of `service-topology.svg`                                                     | project (MIT) |
| `assets/service-topology-dark.ru.svg` | drawn  | dark-scheme variant of `service-topology.ru.svg`, the same drawing in the page's dark colours | project (MIT) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- Every name, number, and date on the page is sample data and must be replaced with real facts before use.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
