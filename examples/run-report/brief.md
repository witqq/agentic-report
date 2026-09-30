# Brief: document page

Category: `document`. Explain a finding, a system or a procedure so the reader can check and act on it.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                | Source                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------- |
| `subvariant`    | Which kind of page within the category is this? `report`, `research`, `architecture`, `code-review`, `incident`, `guide`.            | `report`                                                                              | inferred from the page     |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | The owner of a nightly review flow who knows the stages.                              | inferred from the page     |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | See how the run went and which stage cost the time.                                   | inferred from the page     |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | One JSON export of the run, `data/run.json` (sample data).                            | inferred from the files    |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` read the same data.               | inferred from the files    |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | `neutral` with serif italic captions (`typography.captions: italic`), a quiet ledger. | inferred from the source   |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | Package defaults only.                                                                | inferred from the source   |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Only reads.                                                                           | inferred from the source   |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`.                                      | inferred                   |
| `depth`         | Does the reader need the conclusion only, or the full evidence behind it?                                                            | Conclusion first, then the numbers per stage.                                         | inferred from the order    |
| `review`        | Will someone review the page in place and hand notes back?                                                                           | No.                                                                                   | inferred from the manifest |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File | Origin | Source | Licence |
| ---- | ------ | ------ | ------- |

No pictures, clips, or other media files: everything on the page is drawn by the package from the source and the data file.

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- Every name, number, and date in `data/run.json` is sample data and must be replaced with a real export before use.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.

- PR-FORMAT-NOISE: the bold first sentence followed by `:muted[…]` is the typographic role «bright first sentence, quiet rest» from `vocabulary-use.md`, not decoration.
