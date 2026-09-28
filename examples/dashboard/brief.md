# Brief: dashboard page

Category: `dashboard`. Show the current state of something at a glance, with the detail one step away.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                     | Source                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------- |
| `subvariant`    | Which kind of page within the category is this? `metrics`, `charts`, `filters`, `statuses`.                                          | `metrics`                                                                                  | inferred: a delivery control room |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | A delivery lead checking the state of a release every morning.                             | inferred from the sample          |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | See what is green, what to watch, and what blocks the release.                             | inferred from the sections        |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | Check counts, a throughput chart, and a risk distribution (sample data).                   | inferred from the source          |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                | inferred from the files           |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | The `blueprint` theme: dense, ruled, a faint grid.                                         | inferred from the source          |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | None beyond package defaults.                                                              | inferred from the source          |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Filters and switches views: `filter` and `toggle` controls over the cards.                 | inferred from the source          |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page. | inferred                          |
| `signals`       | Which numbers and statuses matter, and what counts as good, watch and risk?                                                          | Build health, route coverage, package journey, open blockers.                              | inferred from the cards           |
| `freshness`     | When was the data taken, and from which source?                                                                                      | Sample data without a real date; a real dashboard states when the numbers were taken.      | inferred                          |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File | Origin | Source | Licence |
| ---- | ------ | ------ | ------- |

No pictures, clips, or other media files: everything on the page is drawn by the package from the source.

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- The date of the snapshot and every number.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
