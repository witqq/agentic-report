# Brief: presentation page

Category: `presentation`. Show something to people one slide at a time — live, as a file to click through, or filmed — between a screencast and a slide deck.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension       | Question                                                                                                                             | Answer                                                                                                                                            | Source                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `subvariant`    | Which kind of page within the category is this? `demo`, `pitch`, `update`, `lesson`.                                                 | `demo`                                                                                                                                            | inferred: a product demo deck |
| `audience`      | Who reads the page, and what do they already know?                                                                                   | People who will watch agentic-report presented or filmed.                                                                                         | inferred from the sample      |
| `reader-task`   | What must the reader be able to decide or do after reading?                                                                          | Understand what the package does and see it build a page.                                                                                         | inferred from the slides      |
| `material`      | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | A screen recording filmed with agentic-screencast, code, and a diagram.                                                                           | inferred from the files       |
| `language`      | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                                                                       | inferred from the files       |
| `art-direction` | Which visual concept and theme fit the subject and the audience?                                                                     | The `midnight` theme; one idea per slide, a fade between slides.                                                                                  | inferred from the source      |
| `motion`        | How much motion suits the page: none, restrained or expressive?                                                                      | Slide transitions and step reveals only.                                                                                                          | inferred from the source      |
| `interactivity` | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Watches, and answers one question to the room in a `response` form.                                                                               | inferred from the slides      |
| `delivery`      | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page. The clip ships in three encodings in directory output. | inferred                      |
| `setting`       | How is it shown: presented live, sent to click through alone, or filmed?                                                             | Presented live, clicked through alone, or filmed with `?view=film`.                                                                               | inferred from the slides      |
| `length`        | How many slides and how many minutes does it have?                                                                                   | About a dozen slides, a few minutes.                                                                                                              | inferred from the source      |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                       | Origin     | Source                                                                                       | Licence       |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------- | ------------- |
| `assets/demo.h264.mp4`     | screencast | agentic-screencast 1.2.0, run `ar-u8-742ad97e` (protocol kept with the change that added it) | project (MIT) |
| `assets/demo.av1.mp4`      | screencast | the same run, AV1 encoding written by `agentic-screencast web`                               | project (MIT) |
| `assets/demo.vp9.webm`     | screencast | the same run, VP9 encoding written by `agentic-screencast web`                               | project (MIT) |
| `assets/demo.poster.jpg`   | screencast | poster frame written by `agentic-screencast web` from the same run                           | project (MIT) |
| `assets/demo.chapters.vtt` | screencast | chapter track written by the same run                                                        | project (MIT) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- None.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.
