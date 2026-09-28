# Brief: landing page

Category: `landing`. Convince a reader to try, adopt or remember something and send them to one next step.

Answer every dimension before writing the page. Ask the person only what you cannot derive from the request or the material; derive the rest and say how. Source is where the answer came from: `request` (stated in the request), `asked` (the person answered a question), `inferred` (derived from the material — name it).

The category is a recommendation, not a limit: any directive, mode or effect of another category may appear on this page when the reader needs it.

| Dimension        | Question                                                                                                                             | Answer                                                                                                                                   | Source                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `subvariant`     | Which kind of page within the category is this? `product`, `portfolio`, `showcase`, `launch`.                                        | `showcase`                                                                                                                               | inferred from the page           |
| `audience`       | Who reads the page, and what do they already know?                                                                                   | Authors choosing motion for a page.                                                                                                      | inferred from the page           |
| `reader-task`    | What must the reader be able to decide or do after reading?                                                                          | See every motion technique and its reduced-motion fallback.                                                                              | inferred from the page           |
| `material`       | What real material exists: screenshots, data, code, clips, quotes, documents?                                                        | Four NASA photographs, a diagram, and sample figures.                                                                                    | inferred from the files          |
| `language`       | Which languages does the page ship in?                                                                                               | English and Russian: `report.md` and `report.ru.md` carry the same content.                                                              | inferred from the files          |
| `art-direction`  | Which visual concept and theme fit the subject and the audience?                                                                     | `aurora` theme; a tour of every motion technique.                                                                                        | inferred from the source         |
| `motion`         | How much motion suits the page: none, restrained or expressive?                                                                      | Expressive on purpose: depth, tilt, a progress rail, steps, drawing, and counting.                                                       | inferred from the source         |
| `interactivity`  | What does the reader do on the page: only read, filter and switch views, comment (Review Workspace), or answer (Response Workspace)? | Only reads; a disclosure opens the detail.                                                                                               | inferred from the source         |
| `delivery`       | How is the page delivered: one file, a published directory, public or private?                                                       | One HTML file built with `agentic-report build`; the public site also serves it as a page.                                               | inferred                         |
| `references`     | Which 5–10 real sites on the same subject were studied before the concepts, and what does each teach?                                | None studied: this is a package sample, not a page for a real product; a real page lists its 5–10 references and what each teaches here. | inferred: sample page            |
| `first-screen`   | What does the first screen show: the result, code beside the result, a diagram or a clip?                                            | Title and introduction; the motion starts with the first chapter.                                                                        | inferred from the source         |
| `call-to-action` | What is the one action the reader should take?                                                                                       | Inspect the scenes.                                                                                                                      | inferred from the primary action |

## Media

One row per file under `assets/`: where it came from and under which licence. Origin is `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder` (a stand-in for real material still to come, marked as such on the page), or `generated` with its reason in Source.

| File                        | Origin | Source                                                                                                                                                                      | Licence              |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `assets/night-moscow.jpg`   | photo  | NASA Image and Video Library, record ISS039-E-009160: Moscow, the aurora and the moon, Expedition 39, 2 April 2014; cropped to remove the data strip and resized to 1600 px | public domain (NASA) |
| `assets/richat.jpg`         | photo  | NASA Image and Video Library, record ISS002-E-5457: the Richat Structure, Mauritania, Expedition 2, 13 April 2001; cropped to remove the data strip and resized to 1600 px  | public domain (NASA) |
| `assets/sand-sea.jpg`       | photo  | NASA Image and Video Library, record ISS005-E-11189: the Calanscio Sand Sea, Libya, Expedition 5, 25 August 2002; cropped to remove the data strip and resized to 1600 px   | public domain (NASA) |
| `assets/aurora-station.jpg` | photo  | NASA Image and Video Library, record iss030e119777: aurora over the night Earth, Expedition 30, 3 March 2012; cropped to remove the data strip and resized to 1600 px       | public domain (NASA) |

## Unresolved content facts

One line per fact the page needs but nobody gave: a placeholder link, a missing number, a date to confirm.

- Every name, number, and date on the page is sample data and must be replaced with real facts before use.

## Checks switched off

One line per design check deliberately switched off for this page, in the form `- DR-RULE: reason`.

- DR-ONE-EFFECT: the page is the catalogue of motion and shows pointer depth, tilt, and magnetic actions on purpose.
- DR-OPENING-MEDIA: the showcase opens with its title; the first chapter is the first demonstration.
