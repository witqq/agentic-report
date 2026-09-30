# Authoring catalog

Generated from the package contract by `pnpm generate:authoring`. Do not edit by hand: a stale copy
fails `pnpm check:authoring`. Every list here is closed, so a name missing from it is not accepted by
the compiler either.

Contract version: 1.

## Source syntax

| Form             | Written as                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| container        | `:::name{attributes} ⏎ Markdown children ⏎ :::`                                                                                                                                                                                                                                                                                                                                                                       |
| nestedContainer  | `Use a longer outer colon fence than nested directives.`                                                                                                                                                                                                                                                                                                                                                              |
| leaf             | `::name{attributes}`                                                                                                                                                                                                                                                                                                                                                                                                  |
| text             | `:name[label]{attributes}`                                                                                                                                                                                                                                                                                                                                                                                            |
| numericColonText | `A colon that opens a digit-initial name, and a colon written against the preceding word, remain literal Markdown text: 21:01, 1:30:05, 3:1, 1:10:100, localhost:9000, ключ:значение and Пункт :2. Only the inline form without attributes or children is restored: a spaced unknown alphabetic name, any attributed or child-bearing form, and every block-level form stay directives; write \: for ordinary prose.` |
| partial          | `{{include: relative/path.md}}`                                                                                                                                                                                                                                                                                                                                                                                       |

## Page metadata

Default theme `neutral`, default scheme `system`, default layout `document`.

| Built-in theme | Intent                                                                                                                                               | Palette                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calm-paper`   | Long reading: warm paper, a Playfair display over Literata text, and one clay accent.                                                                | Warm paper (#f4f1ea) and dark ink (#1b1a17) for text that reads like print; clay (#ae522d) marks rules and the current place, sage (#3f6b5d) the eyebrows.                                                                                                                                                                 |
| `neutral`      | Neutral reading and product pages: grey paper, a Literata display over Onest, Martian Mono meta lines and JetBrains Mono code, one ochre accent.     | Grey paper (#f5f5f3) and ink (#16171a) with one warm ochre accent (#8a5c00); the dark scheme is warm graphite (#151514), not night blue. No cream, no terracotta.                                                                                                                                                          |
| `frost`        | Two colours and one material: stone grey and graphite, an Onest display over IBM Plex Sans; colour is left to statuses.                              | Stone (#eef0f3) and graphite (#383e4e) in the light scheme, graphite night (#1b1e25) and stone (#b6bac5) in the dark; the accent is graphite itself, so green, red and ochre appear only as statuses.                                                                                                                      |
| `daylight`     | Product documentation: a bright page, an Onest display over Golos Text, and Geist Mono.                                                              | Cool white (#f7f8fa) and graphite ink (#121620); cobalt (#1f5bb8) marks the current place and petrol (#0e6f82) the eyebrows. No default framework palette.                                                                                                                                                                 |
| `midnight`     | Engineering story at night: a Geologica display over IBM Plex Sans, one blue signal and steel for the eyebrows.                                      | Night ink (#0b0e14) with one blue signal (#7aa2ff) and steel (#9fb2c8) for eyebrows; teal stays a chart series only. The light scheme keeps the pair on cool paper.                                                                                                                                                        |
| `noir`         | Cinematic and editorial: spaced Cormorant Garamond capitals over Jost, amber on black.                                                               | Black (#0a0a0b) and bone (#f4f4f5) with amber (#e0a458) and steel (#9fb2c8); the light scheme is ivory with darker amber.                                                                                                                                                                                                  |
| `aurora`       | Calm research and science: a light Raleway display over Commissioner, one mint signal on deep blue.                                                  | Deep blue night (#070b16) with one mint signal (#6fd6c4) and sand (#d9c7a0) for eyebrows; the light scheme is pale sea-green paper with ochre eyebrows.                                                                                                                                                                    |
| `blueprint`    | Dense technical evidence: a Tektur display over Fira Sans, Martian Mono meta lines, cyan and yellow on drafting blue.                                | Drafting blue (#0a1a33) with cyan (#4cc9f0) and signal yellow (#f9c74f) and a faint grid; the light scheme is blueprint paper.                                                                                                                                                                                             |
| `ember`        | Launches and announcements: a condensed Oswald capital page title over Rubik, orange on dark embers.                                                 | Ember black (#0e0907) and warm white (#fff4ec) with one orange signal (#ff7a3d) and warm grey (#c9b8a8) for eyebrows; the light scheme is warm paper with burnt orange.                                                                                                                                                    |
| `synthwave`    | Games and music only: a wide Unbounded display over Exo 2, magenta and cyan on violet night; not for a product landing.                              | Violet night (#140b27) with magenta (#ff4fd8) and cyan (#37e0ff), for pages whose subject is play or music; the light scheme is lilac paper.                                                                                                                                                                               |
| `terminal`     | Developer console: Martian Mono and JetBrains Mono on graphite or pale console paper, a green prompt, amber labels and a cursor at the page heading. | Console graphite (#0c0e0d) with light grey text (#c9d4cc), one muted green (#5ccf8a) for the prompt and markers and amber (#e0a84a) for labels and focus; the light scheme is pale console paper (#f3f5f1) with deep green (#1d7a45) and dark amber (#8a5a00). Scanlines and glow are off unless the author turns them on. |

Schemes: `system`, `light`, `dark`. Layouts: `document`, `dashboard`, `landing`, `mixed`, `slides`, `screens`.

## Theme fields

`theme` takes a built-in theme name, a relative path to a theme file (`.yaml`, `.yml`, `.json`), or a theme object in the frontmatter. A theme file and a theme object share these fields; every field is optional and anything left out comes from `extends`, which defaults to the default theme. Resolution order: default theme, extends chain, accent, explicit fields.

| Field                        | Values                                                                                                                                                                                                                                                                                                                                           | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                       | text (min 1, max 64)                                                                                                                                                                                                                                                                                                                             | Theme identity shown in the theme selector; a theme file defaults to its file name, an inline theme to custom.                                                                                                                                                                                                                                                                                                                                                                             |
| `extends`                    | text (min 1, max 300)                                                                                                                                                                                                                                                                                                                            | Built-in theme name or relative path to another theme file this theme starts from; defaults to the default theme.                                                                                                                                                                                                                                                                                                                                                                          |
| `description`                | text (min 1, max 300)                                                                                                                                                                                                                                                                                                                            | One sentence saying what kind of page the theme is for.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `palette`                    | text (min 1, max 600)                                                                                                                                                                                                                                                                                                                            | Why the palette looks the way it does, in words: the named colours and the reason for them.                                                                                                                                                                                                                                                                                                                                                                                                |
| `scheme`                     | `both`, `dark`                                                                                                                                                                                                                                                                                                                                   | Colour schemes the theme draws: both light and dark, or dark only.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `accent`                     | `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink`, `indigo`, `teal`, `coral`                                                                                                                                                                                                                                                                  | Named accent family for both schemes; explicit accent colours override it.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fonts.pair`                 | `midnight`, `calm-paper`, `synthwave`, `noir`, `aurora`, `daylight`, `ember`, `blueprint`, `terminal`, `neutral`, `frost`, `system`                                                                                                                                                                                                              | Coordinated heading, body, label and code families; a family named for a role in the same theme refines it.                                                                                                                                                                                                                                                                                                                                                                                |
| `fonts.heading`              | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Headings and section titles.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `fonts.body`                 | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Body text and controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fonts.mono`                 | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Meta lines, chapter numbers and other monospaced interface text (not code); labels use the body face.                                                                                                                                                                                                                                                                                                                                                                                      |
| `fonts.code`                 | `jetbrains-mono`, `geist-mono`, `system-mono`                                                                                                                                                                                                                                                                                                    | Code blocks and inline code: a text-grade programming face.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `typography.headingWeight`   | integer from 300 to 900                                                                                                                                                                                                                                                                                                                          | Weight of headings, 300 to 900.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `typography.displayWeight`   | integer from 300 to 900                                                                                                                                                                                                                                                                                                                          | Weight of display-size titles, 300 to 900.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `typography.headingTracking` | number from -0.1 to 0.15                                                                                                                                                                                                                                                                                                                         | Letter spacing of large headings in Latin text, in em; Cyrillic text never goes tighter than -0.025em.                                                                                                                                                                                                                                                                                                                                                                                     |
| `typography.displayCase`     | `none`, `uppercase`                                                                                                                                                                                                                                                                                                                              | Letter case of display headings: as written, or capitals that want positive tracking.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `typography.displayScale`    | number from 0.6 to 1.2                                                                                                                                                                                                                                                                                                                           | Size of display headings against the package scale; wide faces usually look better below 1. Word fit on phones is automatic from the face metrics.                                                                                                                                                                                                                                                                                                                                         |
| `typography.headingMeasure`  | number from 8 to 40                                                                                                                                                                                                                                                                                                                              | Longest line of the page title and of display and editorial section titles, in ch; unset keeps the package measure of each: the reading measure for a report title, 10 to 17ch for landing, first-screen and display titles.                                                                                                                                                                                                                                                               |
| `typography.bodyLeading`     | number from 1.2 to 2                                                                                                                                                                                                                                                                                                                             | Line height of body text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `typography.bodyTracking`    | number from -0.05 to 0.05                                                                                                                                                                                                                                                                                                                        | Letter spacing of body text, in em.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `typography.captions`        | `plain`, `italic`                                                                                                                                                                                                                                                                                                                                | Figure captions and source lines: plain in the text face, or italic in the heading face, the serif italic caption of an editorial page when the heading face is a serif.                                                                                                                                                                                                                                                                                                                   |
| `spacing.density`            | `compact`, `comfortable`, `spacious`                                                                                                                                                                                                                                                                                                             | Shared spacing scale and control padding.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `spacing.rhythm`             | number from 2 to 6                                                                                                                                                                                                                                                                                                                               | Gap between sections, in rem before density.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `spacing.cardMinimum`        | number from 10 to 24                                                                                                                                                                                                                                                                                                                             | Narrowest card column, in rem.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `spacing.gap`                | `regular`, `tight`                                                                                                                                                                                                                                                                                                                               | Gap between the navigation column and the content.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `width`                      | `narrow`, `standard`, `wide`                                                                                                                                                                                                                                                                                                                     | Maximum shell width and reading measure.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `radius`                     | `sharp`, `soft`, `round`                                                                                                                                                                                                                                                                                                                         | Corner treatment of surfaces and controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `radii.control`              | `none`, `small`, `medium`, `large`                                                                                                                                                                                                                                                                                                               | Buttons, fields and toolbars; default small.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `radii.card`                 | `none`, `small`, `medium`, `large`                                                                                                                                                                                                                                                                                                               | Cards, panels, dialogs, popovers and stages; default medium.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `radii.media`                | `none`, `small`, `medium`, `large`                                                                                                                                                                                                                                                                                                               | Images and video on the page; default medium.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `controls`                   | `regular`, `compact`                                                                                                                                                                                                                                                                                                                             | Size of buttons, inputs and actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `backdrop`                   | `none`, `dots`, `grid`, `tint`, `grain`                                                                                                                                                                                                                                                                                                          | Package-drawn page background in the theme colours.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `elevation`                  | `lifted`, `close`, `flat`                                                                                                                                                                                                                                                                                                                        | Geometry of raised shadows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `motion.easing`              | `standard`, `gentle`, `decisive`                                                                                                                                                                                                                                                                                                                 | How moving things arrive: standard settles quickly, gentle eases in and out, decisive starts late and lands hard.                                                                                                                                                                                                                                                                                                                                                                          |
| `motion.pace`                | `brisk`, `calm`, `slow`                                                                                                                                                                                                                                                                                                                          | Multiplier of every package duration: brisk, calm (the package timing), or slow.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `colors.light.<role>`        | `#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent`                                                                                                                                                                                                                                                                                                  | Light scheme colour roles. Roles: `background`, `surface`, `raised`, `muted`, `heading`, `text`, `textMuted`, `border`, `borderStrong`, `accent`, `accentStrong`, `accentSoft`, `accent2`, `focus`, `chart1`, `chart2`, `chart3`, `chart4`, `chart5`, `chart6`, `statusDone`, `statusReview`, `statusReturned`, `marker`, `shadow`, `mediaBacking`, `codeBackground`, `codeText`, `codeKeyword`, `codeString`, `codeNumber`, `codeFunction`, `codeType`, `codeComment`, `codePunctuation`. |
| `colors.dark.<role>`         | `#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent`                                                                                                                                                                                                                                                                                                  | Dark scheme colour roles. Roles: `background`, `surface`, `raised`, `muted`, `heading`, `text`, `textMuted`, `border`, `borderStrong`, `accent`, `accentStrong`, `accentSoft`, `accent2`, `focus`, `chart1`, `chart2`, `chart3`, `chart4`, `chart5`, `chart6`, `statusDone`, `statusReview`, `statusReturned`, `marker`, `shadow`, `mediaBacking`, `codeBackground`, `codeText`, `codeKeyword`, `codeString`, `codeNumber`, `codeFunction`, `codeType`, `codeComment`, `codePunctuation`.  |
| `chrome.topbar`              | `glass`, `ledger`                                                                                                                                                                                                                                                                                                                                | Glass bar with the page title, or a ledger bar with the current section.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `chrome.navigation`          | `plain`, `numbered`                                                                                                                                                                                                                                                                                                                              | Plain section list, or numbered chapters.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `chrome.sectionTitle`        | `plain`, `rule`, `bar`                                                                                                                                                                                                                                                                                                                           | Section title without a rule, underlined, or with a side bar.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `chrome.cards`               | `raised`, `ruled`                                                                                                                                                                                                                                                                                                                                | Raised cards, or cards ruled by an accent line.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `chrome.components`          | `soft`, `flat`, `edged`                                                                                                                                                                                                                                                                                                                          | Soft components, flat framed components, or components with a signal edge.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `chrome.landing`             | `centered`, `ledger`                                                                                                                                                                                                                                                                                                                             | Landing opening centred, or a ledger with a side rail and an eyebrow.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `chrome.edges`               | `none`, `mono`                                                                                                                                                                                                                                                                                                                                   | Nothing at the screen edges, or small monospace captions along them on a wide screen: the page title on the left, the current chapter and its number on the right — for a technical product.                                                                                                                                                                                                                                                                                               |
| `ornaments.headingPrefix`    | text (min 0, max 3)                                                                                                                                                                                                                                                                                                                              | Up to three characters drawn before the page heading in the accent colour, such as > or §; no spaces, quotes, backslash or <; empty for none.                                                                                                                                                                                                                                                                                                                                              |
| `ornaments.titleCursor`      | true or false                                                                                                                                                                                                                                                                                                                                    | Cursor after the page heading: blinks six times, then stays lit; still under reduced motion.                                                                                                                                                                                                                                                                                                                                                                                               |
| `ornaments.heroEmphasis`     | `none`, `rule`, `shadow`                                                                                                                                                                                                                                                                                                                         | Hero and story sections unmarked, marked by a thin accent rule, or lifted by a shadow.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ornaments.mediaTreatment`   | `plain`, `vivid`                                                                                                                                                                                                                                                                                                                                 | Plain images, or images with depth and slightly richer colour.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ornaments.console`          | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Console details: bracketed labels, dashed rules and a prompt mark at the current contents item.                                                                                                                                                                                                                                                                                                                                                                                            |
| `ornaments.scanlines`        | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Faint scanlines over the whole page; off by default, because a texture over the text reads as a generated-site cliché.                                                                                                                                                                                                                                                                                                                                                                     |
| `ornaments.glow`             | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Phosphor glow on headings and the primary action; off by default for the same reason.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ornaments.linkedCard`       | `raised`, `edge`                                                                                                                                                                                                                                                                                                                                 | Linked cards raised on hover, or marked by an accent edge.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Named accents: `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink`, `indigo`, `teal`, `coral`. Font families: `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono`.

The build refuses a theme whose colours fail these contrast pairs in any scheme it draws:

| Foreground        | Background       | Minimum | Used for                                                                                   |
| ----------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------ |
| `heading`         | `background`     | 4.5:1   | headings on the page                                                                       |
| `text`            | `background`     | 4.5:1   | body text on the page                                                                      |
| `text`            | `surface`        | 4.5:1   | text inside components                                                                     |
| `textMuted`       | `background`     | 4.5:1   | captions on the page                                                                       |
| `textMuted`       | `surface`        | 4.5:1   | captions in components                                                                     |
| `text`            | `raised`         | 4.5:1   | text on raised panels                                                                      |
| `textMuted`       | `raised`         | 4.5:1   | captions on raised panels                                                                  |
| `textMuted`       | `muted`          | 4.5:1   | captions on muted wells                                                                    |
| `heading`         | `accentSoft`     | 4.5:1   | titles in accent sections                                                                  |
| `text`            | `accentSoft`     | 4.5:1   | text in accent sections                                                                    |
| `text`            | `accentSoft`     | 4.5:1   | captions in accent sections                                                                |
| `accentStrong`    | `background`     | 4.5:1   | links on the page                                                                          |
| `accentStrong`    | `surface`        | 4.5:1   | links in components                                                                        |
| `accent2`         | `background`     | 4.5:1   | eyebrows and kickers                                                                       |
| `accent`          | `background`     | 3:1     | accent rules and markers                                                                   |
| `background`      | `heading`        | 4.5:1   | primary action label                                                                       |
| `focus`           | `background`     | 3:1     | keyboard focus ring                                                                        |
| `statusDone`      | `background`     | 3:1     | status «done» marks                                                                        |
| `statusDone`      | `surface`        | 3:1     | status «done» in cards                                                                     |
| `statusReview`    | `background`     | 3:1     | status «review» marks                                                                      |
| `statusReview`    | `surface`        | 3:1     | status «review» in cards                                                                   |
| `statusReturned`  | `background`     | 3:1     | status «returned» marks                                                                    |
| `statusReturned`  | `surface`        | 3:1     | status «returned» in cards                                                                 |
| `focus`           | `surface`        | 3:1     | focus ring inside components                                                               |
| `codeText`        | `codeBackground` | 4.5:1   | code text                                                                                  |
| `codeKeyword`     | `codeBackground` | 4.5:1   | code keywords                                                                              |
| `codeString`      | `codeBackground` | 4.5:1   | code strings                                                                               |
| `codeNumber`      | `codeBackground` | 4.5:1   | code numbers                                                                               |
| `codeFunction`    | `codeBackground` | 4.5:1   | code functions                                                                             |
| `codeType`        | `codeBackground` | 4.5:1   | code types                                                                                 |
| `codeComment`     | `codeBackground` | 4.5:1   | code comments and line numbers                                                             |
| `codePunctuation` | `codeBackground` | 4.5:1   | code punctuation                                                                           |
| `codeText`        | `codeBackground` | 4.5:1   | code text on added diff and edition lines                                                  |
| `codeKeyword`     | `codeBackground` | 4.5:1   | code keywords on added diff and edition lines                                              |
| `codeString`      | `codeBackground` | 4.5:1   | code strings on added diff and edition lines                                               |
| `codeNumber`      | `codeBackground` | 4.5:1   | code numbers on added diff and edition lines                                               |
| `codeFunction`    | `codeBackground` | 4.5:1   | code functions on added diff and edition lines                                             |
| `codeType`        | `codeBackground` | 4.5:1   | code types on added diff and edition lines                                                 |
| `codeComment`     | `codeBackground` | 4.5:1   | code comments and line numbers on added diff and edition lines                             |
| `codePunctuation` | `codeBackground` | 4.5:1   | code punctuation on added diff and edition lines                                           |
| `codeText`        | `codeBackground` | 4.5:1   | code text on removed diff lines and removed-line ghosts of an edition                      |
| `codeKeyword`     | `codeBackground` | 4.5:1   | code keywords on removed diff lines and removed-line ghosts of an edition                  |
| `codeString`      | `codeBackground` | 4.5:1   | code strings on removed diff lines and removed-line ghosts of an edition                   |
| `codeNumber`      | `codeBackground` | 4.5:1   | code numbers on removed diff lines and removed-line ghosts of an edition                   |
| `codeFunction`    | `codeBackground` | 4.5:1   | code functions on removed diff lines and removed-line ghosts of an edition                 |
| `codeType`        | `codeBackground` | 4.5:1   | code types on removed diff lines and removed-line ghosts of an edition                     |
| `codeComment`     | `codeBackground` | 4.5:1   | code comments and line numbers on removed diff lines and removed-line ghosts of an edition |
| `codePunctuation` | `codeBackground` | 4.5:1   | code punctuation on removed diff lines and removed-line ghosts of an edition               |
| `codeText`        | `codeBackground` | 4.5:1   | code text on diff hunk lines                                                               |
| `codeKeyword`     | `codeBackground` | 4.5:1   | code keywords on diff hunk lines                                                           |
| `codeString`      | `codeBackground` | 4.5:1   | code strings on diff hunk lines                                                            |
| `codeNumber`      | `codeBackground` | 4.5:1   | code numbers on diff hunk lines                                                            |
| `codeFunction`    | `codeBackground` | 4.5:1   | code functions on diff hunk lines                                                          |
| `codeType`        | `codeBackground` | 4.5:1   | code types on diff hunk lines                                                              |
| `codeComment`     | `codeBackground` | 4.5:1   | code comments and line numbers on diff hunk lines                                          |
| `codePunctuation` | `codeBackground` | 4.5:1   | code punctuation on diff hunk lines                                                        |
| `codeText`        | `accentSoft`     | 4.5:1   | code text on lines lit by a scene step                                                     |
| `codeKeyword`     | `accentSoft`     | 4.5:1   | code keywords on lines lit by a scene step                                                 |
| `codeString`      | `accentSoft`     | 4.5:1   | code strings on lines lit by a scene step                                                  |
| `codeNumber`      | `accentSoft`     | 4.5:1   | code numbers on lines lit by a scene step                                                  |
| `codeFunction`    | `accentSoft`     | 4.5:1   | code functions on lines lit by a scene step                                                |
| `codeType`        | `accentSoft`     | 4.5:1   | code types on lines lit by a scene step                                                    |
| `codeComment`     | `accentSoft`     | 4.5:1   | code comments and line numbers on lines lit by a scene step                                |
| `codePunctuation` | `accentSoft`     | 4.5:1   | code punctuation on lines lit by a scene step                                              |

## Frontmatter and manifest fields

Every accepted field; anything else is refused as an unknown field.

| Field             | Type             | Default                                             | Meaning                                                                                                                                                                                                                                                                                                       |
| ----------------- | ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contractVersion` | integer          | `1`                                                 | Authored source-contract major; omitted legacy source is interpreted as version 1.                                                                                                                                                                                                                            |
| `title`           | string           | —                                                   | Document title.                                                                                                                                                                                                                                                                                               |
| `description`     | string           | —                                                   | Plain-text document description for metadata.                                                                                                                                                                                                                                                                 |
| `language`        | string           | `"und"`                                             | Language tag using the supported 2-8 letter primary and optional 2-8 character alphanumeric subtags.                                                                                                                                                                                                          |
| `localizations`   | object           | —                                                   | Confined alternate Markdown entries for package-supported reader locales; the primary entry is the fallback.                                                                                                                                                                                                  |
| `url`             | string           | —                                                   | Absolute public http(s) URL of the page; enables canonical, OpenGraph and Twitter card metadata.                                                                                                                                                                                                              |
| `image`           | string           | —                                                   | Local PNG, JPEG, WebP, GIF or AVIF social preview image; published as og:image by a directory build with a public URL.                                                                                                                                                                                        |
| `theme`           | string or object | `"neutral"`                                         | Visual theme: a built-in theme name, a relative path to a .yaml/.yml/.json theme file, or a theme object with extends and the fields it changes.                                                                                                                                                              |
| `scheme`          | string           | `"system"`                                          | Initial colour scheme: follow the reader system, or light, or dark.                                                                                                                                                                                                                                           |
| `layout`          | string           | `"document"`                                        | Responsive page composition selected from the package-owned layout catalog; screens moves one whole screen per gesture, with a screen switcher, keys and anchors, and scrolls normally under reduced motion.                                                                                                  |
| `progress`        | string           | `"none"`                                            | Page-wide progress element at the top edge: none, one bar for the whole page, one segment per chapter that fills as the reader moves through it and jumps to the chapter on click, or a row of nodes, one per chapter, marking the chapters passed and the current one.                                       |
| `motion`          | string           | `"expressive"`                                      | How much the page moves, decided by the brief: none — everything is drawn in its final state; restrained — at most one chapter entrance and one pointer effect, no pinned scenes, diagram drawing, WebGL or staged entrance; expressive — the whole motion vocabulary. Reduced motion always stills the page. |
| `opening`         | string           | `"center"`                                          | Alignment of the page title, introduction and actions on a landing page: centered, or aligned to the start edge.                                                                                                                                                                                              |
| `attribution`     | boolean          | `true`                                              | Shows the package-owned “Made with Agentic Report” footer link; set false to omit it.                                                                                                                                                                                                                         |
| `topbar`          | boolean          | `true`                                              | Shows the package-owned top bar with the title, the contents button and the page controls; set false for a page filmed as a scene: the first section starts at the top edge, and review and themeSwitcher, which live in the bar, are refused.                                                                |
| `schemeToggle`    | boolean          | `true`                                              | Shows the package-owned light and dark control; set false for a page that must stay in the scheme it was built with.                                                                                                                                                                                          |
| `themeSwitcher`   | boolean          | `false`                                             | Shows a package-owned selector that swaps the page between the built-in themes and its own; the colour scheme stays where the reader put it.                                                                                                                                                                  |
| `review`          | boolean          | `false`                                             | Enables the package-owned review workspace; off by default so an ordinary page ships as a document rather than a review surface.                                                                                                                                                                              |
| `extensions`      | array            | —                                                   | Extension manifests the page declares (blocks, providers, effects, islands), relative to the source root.                                                                                                                                                                                                     |
| `data`            | array            | —                                                   | JSON data files the page reads at build time, relative to the source root; each is addressed by its name without .json, as in {{run.total}}.                                                                                                                                                                  |
| `output`          | object           | `{"format":"single-file","maxInlineBytes":5000000}` | Default output settings; command-line flags can override the format.                                                                                                                                                                                                                                          |

## Directives

71 directives are accepted.

### `action`

Ordinary safe link inside an actions group.

Forms: leaf. Children: label-or-generated-label. Required parent: `actions`.

| Attribute | Values                          | Required | Default   |
| --------- | ------------------------------- | -------- | --------- |
| `href`    | text (min 1, max 500)           | yes      | —         |
| `kind`    | `primary`, `secondary`, `quiet` | no       | `primary` |
| `effect`  | `none`, `magnetic`              | no       | `none`    |

### `actions`

Responsive group containing ordinary action links.

Forms: container. Children: action-directives.

| Attribute   | Values                             | Required | Default |
| ----------- | ---------------------------------- | -------- | ------- |
| `placement` | `auto`, `edge`, `inline`, `bottom` | no       | `auto`  |

### `appear`

Markdown that appears on the next step of its slide in a presentation (layout slides); on any other page, and under reduced motion or in print, it is simply shown.

Forms: container. Children: markdown.

| Attribute | Values                        | Required | Default |
| --------- | ----------------------------- | -------- | ------- |
| `effect`  | `rise`, `fade`, `wipe`, `pop` | no       | `rise`  |

### `asset`

Download link to a confined local file.

Forms: text, leaf. Children: label-or-generated-label.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `src`     | text (min 1, max 200) | yes      | —       |

### `beat`

One step of a scene="steps" or scene="scrub" section or of a playable demo: Markdown that scrolls past the pinned media or plays in turn; the nth beat shows the nth picture, lights its focus nodes in the diagram or its lines of the code block.

Forms: container. Children: markdown. Required parent: `section` or `demo`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `focus`   | text (min 1, max 640) | no       | —       |
| `lines`   | text (min 1, max 120) | no       | —       |
| `state`   | text (min 1, max 41)  | no       | —       |

### `bucket`

One named assignment bucket.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)  | yes      | —       |
| `label`   | text (min 1, max 200) | yes      | —       |

### `callout`

Emphasized finding or notice containing Markdown.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `kind`    | text (min 1, max 32)  | no       | `info`  |

### `card`

One semantic card containing Markdown, optionally promoted to one safe whole-card link.

Forms: container. Children: markdown. Required parent: `cards`.

| Attribute | Values                          | Required | Default |
| --------- | ------------------------------- | -------- | ------- |
| `title`   | text (min 1, max 200)           | no       | —       |
| `href`    | text (min 1, max 500)           | no       | —       |
| `status`  | `none`, `good`, `watch`, `risk` | no       | `none`  |
| `when`    | text (min 1, max 41)            | no       | —       |

### `cards`

Responsive grid, normally containing card directives.

Forms: container. Children: markdown-and-card-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |

### `chart`

Responsive bar, line, or pie chart rendered at compile time.

Forms: container. Children: series-directives.

| Attribute     | Values                | Required | Default |
| ------------- | --------------------- | -------- | ------- |
| `title`       | text (min 1, max 200) | yes      | —       |
| `description` | text (min 1, max 300) | yes      | —       |
| `type`        | `bar`, `line`, `pie`  | no       | `bar`   |
| `x-label`     | text (min 1, max 160) | no       | —       |
| `y-label`     | text (min 1, max 160) | no       | —       |
| `count-up`    | true or false         | no       | `false` |

### `check-item`

One labelled required or optional checklist item.

Forms: leaf. Children: label-or-generated-label. Required parent: `checklist`.

| Attribute  | Values                | Required | Default |
| ---------- | --------------------- | -------- | ------- |
| `id`       | text (min 1, max 64)  | yes      | —       |
| `label`    | text (min 1, max 160) | yes      | —       |
| `required` | true or false         | no       | `false` |

### `checklist`

Static structured checklist containing stable check-item directives.

Forms: container. Children: check-item-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | yes      | —       |
| `id`      | text (min 1, max 64)  | yes      | —       |

### `compare`

Before and after of the same view: exactly two Markdown images, before then after, laid over each other with a divider the reader moves by pointer or keyboard.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default  |
| --------- | --------------------- | -------- | -------- |
| `before`  | text (min 1, max 160) | no       | `Before` |
| `after`   | text (min 1, max 160) | no       | `After`  |

### `contents`

Generated in-flow links to final primary sections using their exact visible headings.

Forms: leaf. Children: none.

| Attribute | Values        | Required | Default |
| --------- | ------------- | -------- | ------- |
| `sticky`  | true or false | no       | `false` |

### `conversation`

A mock of a dialog or a notification feed: message directives in order, with an optional title and an illustrative mark.

Forms: container. Children: message-directives.

| Attribute      | Values                | Required | Default |
| -------------- | --------------------- | -------- | ------- |
| `title`        | text (min 1, max 200) | no       | —       |
| `illustrative` | true or false         | no       | `false` |

### `copyable`

Ordinary Markdown prose with a localized copy control.

Forms: container. Children: markdown-and-term-directives.

### `count`

A number in running text that counts up from zero to its written value when it comes into view; the written value is what the page holds and shows without motion.

Forms: text. Children: label-or-generated-label.

| Attribute | Values               | Required | Default |
| --------- | -------------------- | -------- | ------- |
| `when`    | text (min 1, max 41) | no       | —       |

### `decision`

Static Markdown decision or typed decision containing decision-option directives.

Forms: container. Children: decision-option-directives.

| Attribute  | Values                | Required | Default |
| ---------- | --------------------- | -------- | ------- |
| `title`    | text (min 1, max 200) | no       | —       |
| `id`       | text (min 1, max 64)  | no       | —       |
| `required` | true or false         | no       | `false` |

### `decision-option`

One labelled option inside a typed decision.

Forms: leaf. Children: label-or-generated-label. Required parent: `decision`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)  | yes      | —       |
| `label`   | text (min 1, max 160) | yes      | —       |

### `deck`

A slide deck inside the page: slide directives shown one at a time in a 16:9 slot of the column, paged with buttons and keys, and opened on the whole screen; without the runtime and in print the slides follow one another.

Forms: container. Children: slide-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `id`      | text (min 1, max 64)  | no       | —       |

### `demo`

Package-owned demo: a counter card, or with play a scene that reconstructs the product from ordinary directives (code, a diagram, cards, a picture) and plays its beats by time or by scroll; author code is never executed.

Forms: container. Children: markdown.

| Attribute | Values                         | Required | Default |
| --------- | ------------------------------ | -------- | ------- |
| `title`   | text (min 1, max 200)          | no       | —       |
| `start`   | integer from -999999 to 999999 | no       | `0`     |
| `step`    | integer from -999999 to 999999 | no       | `1`     |
| `play`    | `none`, `time`, `scroll`       | no       | `none`  |
| `seconds` | integer from 1 to 10           | no       | `3`     |

### `diagram`

Directed flow diagram rendered as deterministic SVG.

Forms: container. Children: diagram-part-directives.

| Attribute     | Values                                | Required | Default       |
| ------------- | ------------------------------------- | -------- | ------------- |
| `title`       | text (min 1, max 200)                 | yes      | —             |
| `description` | text (min 1, max 300)                 | yes      | —             |
| `type`        | `flow`, `sequence`                    | no       | `flow`        |
| `direction`   | `auto`, `right`, `down`               | no       | `auto`        |
| `layout`      | `auto`, `down`, `right`, `orthogonal` | no       | `auto`        |
| `spacing`     | `compact`, `comfortable`, `spacious`  | no       | `comfortable` |
| `draw`        | `none`, `scroll`                      | no       | `none`        |
| `pulse`       | text (min 3, max 800)                 | no       | —             |

### `diff`

One change in unified diff form: exactly one fenced code block with @@ hunks, drawn with old and new line numbers.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `file`    | text (min 1, max 300) | no       | —       |

### `disclosure`

Native disclosure with a visible summary.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | yes      | —       |
| `open`    | `false`, `true`       | no       | `false` |

### `each`

Repeats its Markdown once per item of a list from the page data when the page builds; a body that is one list or one table repeats its items or rows inside it.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `in`      | text (min 1, max 200) | yes      | —       |
| `as`      | text (min 1, max 32)  | yes      | —       |

### `edge`

One directed connection between diagram nodes; from equal to to is a step that repeats, drawn as a loop on the node in a flow and on the lifeline in a sequence.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values                                | Required | Default |
| --------- | ------------------------------------- | -------- | ------- |
| `from`    | text (min 1, max 64)                  | yes      | —       |
| `to`      | text (min 1, max 64)                  | yes      | —       |
| `label`   | text (min 1, max 160)                 | no       | —       |
| `kind`    | `call`, `data`, `event`, `dependency` | no       | `call`  |
| `route`   | `auto`, `direct`, `around`            | no       | `auto`  |
| `id`      | text (min 1, max 64)                  | no       | —       |
| `count`   | integer from 1 to 999                 | no       | —       |

### `event`

One dated timeline event with optional Markdown detail.

Forms: container. Children: markdown. Required parent: `timeline`.

| Attribute | Values                                    | Required | Default   |
| --------- | ----------------------------------------- | -------- | --------- |
| `date`    | text (min 1, max 160)                     | yes      | —         |
| `title`   | text (min 1, max 200)                     | yes      | —         |
| `kind`    | `neutral`, `accent`, `success`, `warning` | no       | `neutral` |

### `expect`

A control value over the page data: the build fails at this line when the data at the path diverges from the stated count, bounds or value. Renders nothing.

Forms: leaf. Children: none.

| Attribute | Values                   | Required | Default |
| --------- | ------------------------ | -------- | ------- |
| `data`    | text (min 1, max 200)    | yes      | —       |
| `count`   | integer from 0 to 100000 | no       | —       |
| `min`     | number                   | no       | —       |
| `max`     | number                   | no       | —       |
| `equals`  | text (min 1, max 300)    | no       | —       |

### `eyebrow`

A short small-caps line above the title that follows it, in the eyebrow colour of the theme; written first in a section, it stands above the section title.

Forms: leaf. Children: label-or-generated-label.

### `filter`

Client-side text filter for authored list items.

Forms: container. Children: markdown.

| Attribute     | Values                | Required | Default        |
| ------------- | --------------------- | -------- | -------------- |
| `title`       | text (min 1, max 200) | no       | —              |
| `placeholder` | text (min 1, max 160) | no       | `Filter items` |

### `finding`

One review finding with a severity, a title and Markdown detail.

Forms: container. Children: markdown. Required parent: `findings`.

| Attribute  | Values                               | Required | Default |
| ---------- | ------------------------------------ | -------- | ------- |
| `severity` | `blocking`, `major`, `minor`, `note` | yes      | —       |
| `title`    | text (min 1, max 200)                | yes      | —       |
| `location` | text (min 1, max 300)                | no       | —       |

### `findings`

Review findings in authored order, with a generated count per severity above them.

Forms: container. Children: finding-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |

### `font`

Register a confined local font for one text role; the first declaration of each role replaces the theme font of that role.

Forms: leaf. Children: none.

| Attribute | Values                            | Required | Default |
| --------- | --------------------------------- | -------- | ------- |
| `src`     | text (min 1, max 200)             | yes      | —       |
| `family`  | text (min 1, max 80)              | yes      | —       |
| `role`    | `body`, `heading`, `mono`, `code` | no       | `body`  |

### `glossary`

Reusable glossary definition containing Markdown, optionally moved from the document root or a direct section child into the appendix.

Forms: container. Children: markdown.

| Attribute   | Values                | Required | Default  |
| ----------- | --------------------- | -------- | -------- |
| `key`       | text (min 1, max 64)  | yes      | —        |
| `term`      | text (min 1, max 160) | yes      | —        |
| `forms`     | text (min 1, max 640) | no       | —        |
| `placement` | `inline`, `appendix`  | no       | `inline` |

### `group`

One labelled subsystem group around some nodes of a flow diagram.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)  | yes      | —       |
| `label`   | text (min 1, max 160) | yes      | —       |

### `item`

One readable response item.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values                 | Required | Default |
| --------- | ---------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)   | yes      | —       |
| `label`   | text (min 1, max 500)  | yes      | —       |
| `note`    | text (min 1, max 1000) | yes      | —       |
| `meta`    | text (min 1, max 500)  | yes      | —       |
| `href`    | text (min 1, max 500)  | yes      | —       |
| `bucket`  | text (min 1, max 64)   | no       | —       |
| `comment` | true or false          | no       | `false` |

### `lead`

One emphasized opening thesis paragraph inside a section.

Forms: container. Children: markdown. Required parent: `section`.

### `legend`

Optional title and policy for the diagram legend; at most one per diagram.

Forms: leaf. Children: none. Required parent: `diagram`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 160) | no       | —       |
| `auto`    | true or false         | no       | `true`  |

### `legend-item`

One legend entry: names a connection kind, a node emphasis, a node status, or a timeline event emphasis in the author's words, or hides a connection kind.

Forms: leaf. Children: none. Required parent: `diagram` or `timeline`.

| Attribute | Values                                    | Required | Default |
| --------- | ----------------------------------------- | -------- | ------- |
| `edge`    | `call`, `data`, `event`, `dependency`     | no       | —       |
| `node`    | `neutral`, `accent`, `success`, `warning` | no       | —       |
| `status`  | `done`, `review`, `returned`, `pending`   | no       | —       |
| `event`   | `accent`, `success`, `warning`            | no       | —       |
| `label`   | text (min 1, max 160)                     | no       | —       |
| `hidden`  | true or false                             | no       | `false` |

### `mark`

Words in running text marked by hand: underlined, circled or struck through in the accent colour, drawn when they come into view; the jitter comes from a seed, and a section holds at most two marks.

Forms: text. Children: label-or-generated-label.

| Attribute | Values                          | Required | Default     |
| --------- | ------------------------------- | -------- | ----------- |
| `shape`   | `underline`, `circle`, `strike` | no       | `underline` |
| `seed`    | integer from 0 to 9999          | no       | —           |

### `message`

One message or notification: sender, time, Markdown text and an optional status; alone it is a notification, inside conversation it is one turn.

Forms: container. Children: markdown.

| Attribute      | Values               | Required | Default |
| -------------- | -------------------- | -------- | ------- |
| `from`         | text (min 1, max 80) | yes      | —       |
| `time`         | text (min 1, max 40) | no       | —       |
| `side`         | `in`, `out`          | no       | `in`    |
| `status`       | text (min 1, max 40) | no       | —       |
| `illustrative` | true or false        | no       | `false` |

### `meta`

A short label in the mono face for identifiers and readings: :meta[run 96 · 01:17].

Forms: text. Children: label-or-generated-label.

### `modal`

Modal dialog opened by a package-owned control.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default       |
| --------- | --------------------- | -------- | ------------- |
| `title`   | text (min 1, max 200) | yes      | —             |
| `trigger` | text (min 1, max 160) | no       | `Open dialog` |

### `muted`

The quiet continuation of a paragraph in the muted text colour; the sentence before it reads bright: **The run passed.** :muted[Two retries, both on the network step.]

Forms: text. Children: label-or-generated-label.

### `node`

One labelled node in a flow diagram.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values                                    | Required | Default   |
| --------- | ----------------------------------------- | -------- | --------- |
| `id`      | text (min 1, max 64)                      | yes      | —         |
| `label`   | text (min 1, max 160)                     | yes      | —         |
| `detail`  | text (min 1, max 160)                     | no       | —         |
| `group`   | text (min 1, max 64)                      | no       | —         |
| `kind`    | `neutral`, `accent`, `success`, `warning` | no       | `neutral` |
| `row`     | integer from 1 to 20                      | no       | —         |
| `status`  | `done`, `review`, `returned`, `pending`   | no       | —         |

### `notes`

Speaker notes of a slide — a presentation section or a deck slide: never shown to the audience; on a presentation page the presenter view (?view=presenter) shows them under the slide.

Forms: container. Children: markdown. Required parent: `section` or `slide`.

### `option`

One selectable answer option.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)  | yes      | —       |
| `label`   | text (min 1, max 200) | yes      | —       |

### `plural`

A number with its noun in the form the page language requires, settled when the page builds: :plural[5]{forms="file|files"} → 5 files.

Forms: text. Children: label-or-generated-label.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `forms`   | text (min 3, max 200) | yes      | —       |

### `point`

One labelled numeric value in a chart series.

Forms: leaf. Children: none. Required parent: `series`.

| Attribute | Values                              | Required | Default |
| --------- | ----------------------------------- | -------- | ------- |
| `label`   | text (min 1, max 160)               | yes      | —       |
| `value`   | number from -999999999 to 999999999 | yes      | —       |

### `popover`

Non-modal contextual panel opened by a package-owned control.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default        |
| --------- | --------------------- | -------- | -------------- |
| `title`   | text (min 1, max 200) | yes      | —              |
| `trigger` | text (min 1, max 160) | no       | `Show details` |

### `process`

A mini process in a line of text or a card: its steps, separated by ">" in the label, drawn as dots in order with arcs for the returns and their «×N»; the step names and returns are said in words for assistive technology.

Forms: text. Children: label-or-generated-label.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `current` | text (min 1, max 80)  | no       | —       |
| `returns` | text (min 3, max 400) | no       | —       |

### `question`

One typed question inside a response workspace.

Forms: container. Children: response-field-directives. Required parent: `response`.

| Attribute | Values                                                                     | Required | Default |
| --------- | -------------------------------------------------------------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)                                                       | yes      | —       |
| `kind`    | `bucket`, `item-single`, `item-multi`, `single`, `order`, `number`, `text` | yes      | —       |
| `title`   | text (min 1, max 200)                                                      | yes      | —       |
| `prompt`  | text (min 1, max 500)                                                      | no       | —       |
| `min`     | number from -999999999 to 999999999                                        | no       | —       |
| `max`     | number from -999999999 to 999999999                                        | no       | —       |
| `step`    | number from -999999999 to 999999999                                        | no       | —       |

### `response`

Local structured reader-response workspace with deterministic export.

Forms: container. Children: response-question-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | yes      | —       |
| `id`      | text (min 1, max 64)  | yes      | —       |

### `section`

Labelled top-level page section containing Markdown.

Forms: container. Children: markdown.

| Attribute          | Values                                                                                             | Required | Default     |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------- | ----------- |
| `title`            | text (min 1, max 200)                                                                              | yes      | —           |
| `id`               | text (min 1, max 64)                                                                               | no       | —           |
| `nav`              | text (min 1, max 160)                                                                              | no       | —           |
| `recipe`           | `none`, `hero`, `evidence`, `story`, `rail`, `metrics`, `thesis`, `statement`, `blueprint`, `demo` | no       | `none`      |
| `place`            | `flow`, `opening`                                                                                  | no       | `flow`      |
| `width`            | `reading`, `standard`, `wide`                                                                      | no       | `standard`  |
| `align`            | `start`, `center`                                                                                  | no       | `start`     |
| `tone`             | `plain`, `soft`, `accent`, `contrast`                                                              | no       | `plain`     |
| `composition`      | `flow`, `stage`, `split`, `mosaic`, `story`, `stack`                                               | no       | `flow`      |
| `viewport`         | `adaptive`, `full`, `bounded`                                                                      | no       | `adaptive`  |
| `section-density`  | `compact`, `editorial`, `immersive`                                                                | no       | `editorial` |
| `type`             | `body`, `display`, `editorial`                                                                     | no       | `body`      |
| `media`            | `natural`, `mask`, `layers`, `gallery`, `bleed`                                                    | no       | `natural`   |
| `media-fit`        | `natural`, `contain`, `cover`                                                                      | no       | `natural`   |
| `media-aspect`     | `natural`, `landscape`, `cinematic`, `portrait`, `square`                                          | no       | `natural`   |
| `focal`            | `center`, `top`, `right`, `bottom`, `left`                                                         | no       | `center`    |
| `surface`          | `plain`, `tint`, `grain`, `grid`, `blueprint`                                                      | no       | `plain`     |
| `frame`            | `none`, `panel`, `browser`                                                                         | no       | `none`      |
| `address`          | text (min 1, max 300)                                                                              | no       | —           |
| `illustration`     | true or false                                                                                      | no       | `false`     |
| `transition`       | `none`, `reveal`, `stagger`, `lines`, `log`, `clip`, `staged`                                      | no       | `none`      |
| `scene`            | `none`, `progress`, `sticky`, `steps`, `scrub`                                                     | no       | `none`      |
| `slide-transition` | `fade`, `push`, `wipe`, `zoom`, `none`                                                             | no       | `fade`      |
| `interaction`      | `none`, `depth`, `tilt`                                                                            | no       | `none`      |
| `choreography`     | `none`, `cascade`                                                                                  | no       | `none`      |
| `reveal`           | true or false                                                                                      | no       | `false`     |
| `state`            | text (min 1, max 41)                                                                               | no       | —           |

### `series`

One named chart series containing data points.

Forms: container. Children: point-directives. Required parent: `chart`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `label`   | text (min 1, max 160) | yes      | —       |

### `slide`

One slide of a deck: Markdown with optional appear steps and speaker notes.

Forms: container. Children: markdown. Required parent: `deck`.

| Attribute    | Values                                 | Required | Default |
| ------------ | -------------------------------------- | -------- | ------- |
| `transition` | `fade`, `push`, `wipe`, `zoom`, `none` | no       | `fade`  |

### `source-line`

The source line under the block before it — which data or footage, how many records, taken when: ::source-line[Moira export of run 96, 212 records]{date="2026-09-25"}.

Forms: leaf. Children: label-or-generated-label.

| Attribute | Values               | Required | Default |
| --------- | -------------------- | -------- | ------- |
| `date`    | text (min 1, max 32) | no       | —       |
| `zone`    | text (min 1, max 64) | no       | —       |

### `source-link`

Source location opened through an explicit IPv4 loopback editor helper without replacing the report page.

Forms: text. Children: none.

| Attribute | Values                 | Required | Default |
| --------- | ---------------------- | -------- | ------- |
| `label`   | text (min 1, max 160)  | yes      | —       |
| `href`    | text (min 1, max 1000) | yes      | —       |

### `spotlight`

One screenshot with a loupe over one detail: the detail enlarged in place, the rest of the picture dimmed, and the explanation beside it.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `x`       | integer from 0 to 100 | yes      | —       |
| `y`       | integer from 0 to 100 | yes      | —       |
| `zoom`    | number from 1.5 to 4  | no       | `2`     |

### `steps`

Process or tutorial sequence containing Markdown, normally an ordered list.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |

### `swap`

A word in running text that swaps on a beat to up to three other words and returns to the written one within five seconds; the widest word reserves the width, so the line never moves.

Forms: text. Children: label-or-generated-label.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `words`   | text (min 1, max 160) | yes      | —       |

### `tab`

One labelled panel inside tabs.

Forms: container. Children: markdown. Required parent: `tabs`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `label`   | text (min 1, max 160) | yes      | —       |

### `table`

One Markdown table with a chosen narrow-track layout; a table without the directive uses layout auto.

Forms: container. Children: markdown.

| Attribute | Values                    | Required | Default |
| --------- | ------------------------- | -------- | ------- |
| `layout`  | `auto`, `stack`, `scroll` | no       | `auto`  |

### `tabs`

Keyboard-operable group of tab panels.

Forms: container. Children: markdown-and-tab-directives.

| Attribute     | Values                   | Required | Default      |
| ------------- | ------------------------ | -------- | ------------ |
| `title`       | text (min 1, max 200)    | no       | —            |
| `orientation` | `horizontal`, `vertical` | no       | `horizontal` |

### `term`

Inline or standalone reference that opens a registered glossary explanation. Prose must carry one for the first occurrence of a registered term in each section; later occurrences of that term in the same section stay ordinary prose.

Forms: leaf, text. Children: label-or-generated-label.

| Attribute | Values               | Required | Default |
| --------- | -------------------- | -------- | ------- |
| `key`     | text (min 1, max 64) | yes      | —       |

### `time`

A date or a moment written in the page language and, for a time, in a declared time zone, settled when the page builds: :time[2026-09-25T01:17]{zone="Europe/Moscow"}.

Forms: text. Children: label-or-generated-label.

| Attribute | Values                             | Required | Default |
| --------- | ---------------------------------- | -------- | ------- |
| `zone`    | text (min 1, max 64)               | no       | —       |
| `show`    | `auto`, `date`, `time`, `datetime` | no       | `auto`  |

### `timeline`

Semantic chronological sequence with bounded events.

Forms: container. Children: event-directives.

| Attribute     | Values                | Required | Default |
| ------------- | --------------------- | -------- | ------- |
| `title`       | text (min 1, max 200) | yes      | —       |
| `description` | text (min 1, max 300) | yes      | —       |

### `toggle`

Switch controlling visibility of declarative content.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `label`   | text (min 1, max 160) | yes      | —       |
| `default` | `off`, `on`           | no       | `off`   |

### `typing`

A short line in running text typed in place, character by character, when it comes into view; the whole line is in the page from the start and holds its width, so nothing moves.

Forms: text. Children: label-or-generated-label.

### `video`

Embedded local video (webm, mp4, m4v, or ogv), or an agentic-screencast film named by from, as a looping muted clip, a background with a pause control, or a manually started video with sound (the default for a recording that carries sound); directory output ships every source for the browser to choose from, one file ships the most compatible; each source is typed with the codecs read from its file.

Forms: leaf. Children: none.

| Attribute     | Values                         | Required | Default |
| ------------- | ------------------------------ | -------- | ------- |
| `src`         | text (min 1, max 200)          | no       | —       |
| `from`        | text (min 1, max 200)          | no       | —       |
| `sources`     | text (min 1, max 600)          | no       | —       |
| `mode`        | `clip`, `background`, `manual` | no       | —       |
| `chapters`    | text (min 1, max 200)          | no       | —       |
| `poster`      | text (min 1, max 200)          | no       | —       |
| `dark-poster` | text (min 1, max 200)          | no       | —       |
| `caption`     | text (min 1, max 300)          | no       | —       |
| `start`       | number from 0 to 3600          | no       | —       |
| `seam`        | `cut`, `fade`                  | no       | `cut`   |
| `expand`      | true or false                  | no       | `false` |

### `zoom`

The inside of one node of a flow diagram, written as its own small flow: while the diagram is pinned on screen the camera flies into that node and the nested flow grows readable in its place.

Forms: container. Children: zoom-part-directives. Required parent: `diagram`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `node`    | text (min 1, max 64)  | yes      | —       |
| `title`   | text (min 1, max 200) | yes      | —       |

## Visualization limits

```json
{
  "diagram": {
    "defaultType": "flow",
    "types": ["flow", "sequence"],
    "edgeKinds": ["call", "data", "event", "dependency"],
    "defaultEdgeKind": "call",
    "nodeKinds": ["neutral", "accent", "success", "warning"],
    "nodeStatuses": ["done", "review", "returned", "pending"],
    "edgeCount": {
      "minimum": 1,
      "maximum": 999
    },
    "zoom": {
      "maximumPerDiagram": 1
    },
    "pulse": {
      "minimumNodes": 2,
      "maximumNodes": 12
    },
    "edgeKindLegend": {
      "minimumKinds": 2
    },
    "legend": {
      "maximumPerDiagram": 1,
      "maximumItems": 8
    },
    "flow": {
      "nodes": {
        "minimum": 1,
        "maximum": 20
      },
      "edges": {
        "maximum": 40
      },
      "selfEdges": true,
      "layouts": ["auto", "down", "right", "orthogonal"],
      "directions": ["auto", "right", "down"],
      "groups": {
        "maximum": 5,
        "minimumMembers": 1,
        "requireEveryNode": false
      }
    },
    "sequence": {
      "participants": {
        "minimum": 2,
        "maximum": 6
      },
      "messages": {
        "minimum": 1,
        "maximum": 40,
        "labelRequired": true
      },
      "groups": false,
      "participantGroups": false,
      "direction": "forbidden",
      "selfMessages": true
    }
  }
}
```

## Output formats

```json
{
  "default": "single-file",
  "formats": ["single-file", "directory"],
  "runtimePlacement": {
    "single-file": "inline",
    "directory": "external"
  }
}
```

## Commands

```json
{
  "init": "Initialize a packaged declarative starter without overwriting user content.",
  "validate": "Validate a project without writing an output artifact.",
  "inspect": "Inspect source usage and the available authoring catalog without writing output.",
  "review": "Resolve a confined review artifact without changing report sources.",
  "build": "Compile a source into a default or share-safe static artifact.",
  "fix": "Apply the replacements the product computed exactly, and nothing else.",
  "theme": "Write an author theme file from one or two brand colours, their lightness shifted until every contrast pair passes in both schemes.",
  "describe": "Return the complete source contract.",
  "schema": "Return manifest, directive, or complete source JSON Schema.",
  "examples": "List packaged buildable examples and the reference extensions shipped beside them.",
  "sitemap": "Write sitemap.xml and robots.txt for a published tree of pages built with a public URL.",
  "snapshot": "Build a page and photograph it at several widths, in both schemes, with and without motion, with a contact sheet; with --measure, measure it instead of photographing.",
  "effect-check": "Build the examples of an effect extension and run the eleven effect checks in Chromium, reporting N of M checks passed."
}
```

## Rules checked for you

- {"subject":"actions","rules":[{"id":"action-children-only","dependsOn":[]}]}
- {"subject":"chart","rules":[{"id":"pie-single-series","dependsOn":[]}]}
- {"subject":"chart/series","rules":[{"id":"unique-point-labels","dependsOn":[]},{"id":"pie-values","dependsOn":[]},{"id":"aligned-categories","dependsOn":["unique-point-labels"]}]}
- {"subject":"diagram/edge","rules":[{"id":"known-endpoints","dependsOn":[]},{"id":"self-connection","dependsOn":[]}]}
- {"subject":"diagram/flow","rules":[{"id":"layout-or-direction","dependsOn":[]},{"id":"node-count","dependsOn":[]},{"id":"edge-count","dependsOn":[]},{"id":"group-count","dependsOn":[]}]}
- {"subject":"diagram/flow/node","rules":[{"id":"group-assignment","dependsOn":[]}]}
- {"subject":"diagram/flow/group","rules":[{"id":"group-membership","dependsOn":[]}]}
- {"subject":"diagram/legend","rules":[{"id":"legend-count","dependsOn":[]},{"id":"item-count","dependsOn":[]}]}
- {"subject":"diagram/legend-item","rules":[{"id":"one-subject","dependsOn":[]},{"id":"node-label","dependsOn":["one-subject"]},{"id":"hidden-edge-only","dependsOn":["one-subject"]},{"id":"unique-subject","dependsOn":["one-subject"]}]}
- {"subject":"diagram/sequence","rules":[{"id":"no-groups","dependsOn":[]},{"id":"no-direction","dependsOn":[]},{"id":"no-layout","dependsOn":[]},{"id":"participant-count","dependsOn":[]},{"id":"message-count","dependsOn":[]}]}
- {"subject":"diagram/sequence/participant","rules":[{"id":"no-participant-group","dependsOn":[]}]}
- {"subject":"diagram/sequence/message","rules":[{"id":"label-required","dependsOn":[]}]}
- {"subject":"compare","rules":[{"id":"two-images","dependsOn":[]}]}
- {"subject":"copyable","rules":[{"id":"prose-and-terms-only","dependsOn":[]}]}
- {"subject":"decision|checklist","rules":[{"id":"children-not-mixed","dependsOn":[]},{"id":"child-limit","dependsOn":[]},{"id":"stable-decision-id","dependsOn":[]},{"id":"child-present","dependsOn":[]},{"id":"unique-child-ids","dependsOn":["children-not-mixed","child-present"]}]}
- {"subject":"demo/scene","rules":[{"id":"beats-in-playing-demo","dependsOn":[]},{"id":"scene-beat-count","dependsOn":[]},{"id":"scene-stage","dependsOn":[]},{"id":"counter-attributes","dependsOn":[]},{"id":"seconds-with-time","dependsOn":[]},{"id":"scene-focus-nodes","dependsOn":[]}]}
- {"subject":"diff","rules":[{"id":"one-code-block","dependsOn":[]},{"id":"code-language","dependsOn":["one-code-block"]},{"id":"unified-hunks","dependsOn":["one-code-block"]}]}
- {"subject":"response/question","rules":[{"id":"unique-id","dependsOn":[]},{"id":"unique-child-ids","dependsOn":[]},{"id":"items-match-kind","dependsOn":[]},{"id":"buckets-match-kind","dependsOn":[]},{"id":"item-bucket-references","dependsOn":["buckets-match-kind"]},{"id":"options-match-kind","dependsOn":[]},{"id":"numeric-domain","dependsOn":[]}]}
- {"subject":"section/steps","rules":[{"id":"beats-in-steps-scene","dependsOn":[]},{"id":"beat-count","dependsOn":[]},{"id":"scrub-screens","dependsOn":[]},{"id":"stage-media","dependsOn":[]},{"id":"beat-lines","dependsOn":[]},{"id":"focus-nodes","dependsOn":[]}]}
- {"subject":"section/place","rules":[{"id":"first-section","dependsOn":[]},{"id":"page-title","dependsOn":[]}]}
- {"subject":"section/browser-frame","rules":[{"id":"real-address-or-illustration","dependsOn":[]},{"id":"frame-for-address","dependsOn":[]},{"id":"framed-picture","dependsOn":[]}]}
- {"subject":"section/lead","rules":[{"id":"single-paragraph","dependsOn":[]},{"id":"first-authored-block","dependsOn":[]}]}
- {"subject":"spotlight","rules":[{"id":"one-picture-first","dependsOn":[]},{"id":"explanation","dependsOn":[]}]}
- {"subject":"swap","rules":[{"id":"plain-written-word","dependsOn":[]},{"id":"word-count","dependsOn":[]},{"id":"word-length","dependsOn":[]},{"id":"different-words","dependsOn":[]}]}
- {"subject":"typing","rules":[{"id":"plain-line","dependsOn":[]},{"id":"short-line","dependsOn":[]}]}
- {"subject":"mark","rules":[{"id":"marked-words","dependsOn":[]},{"id":"two-per-screen","dependsOn":[]}]}
- {"subject":"video/loop","rules":[{"id":"loop-only-start-and-seam","dependsOn":[]},{"id":"dark-poster-with-poster","dependsOn":[]},{"id":"expand-on-clip","dependsOn":[]}]}
- {"subject":"video/source","rules":[{"id":"src-or-from","dependsOn":[]}]}
- {"subject":"directive-node","rules":[{"id":"registered-name","dependsOn":[]},{"id":"no-prototype-like-attributes","dependsOn":[]},{"id":"declared-form","dependsOn":["registered-name"]},{"id":"declared-placement","dependsOn":["registered-name"]},{"id":"declared-children","dependsOn":["registered-name"]},{"id":"interpreted-attributes","dependsOn":["registered-name","no-prototype-like-attributes"]},{"id":"action-label","dependsOn":["registered-name"]},{"id":"compatible-attribute-combination","dependsOn":["interpreted-attributes"]},{"id":"section-identity","dependsOn":["interpreted-attributes"]},{"id":"appendix-glossary-placement","dependsOn":["interpreted-attributes"]},{"id":"unique-glossary-identity","dependsOn":["interpreted-attributes"]},{"id":"declared-glossary-forms","dependsOn":["interpreted-attributes","unique-glossary-identity"]}]}
- {"subject":"code-fence/terms","rules":[{"id":"known-keys","dependsOn":[]},{"id":"locatable-terms","dependsOn":["known-keys"]},{"id":"no-overlap","dependsOn":["known-keys","locatable-terms"]}]}
- {"subject":"prose-container/glossary","rules":[{"id":"first-occurrence-marked","dependsOn":[]}]}

## Safety boundary

- canonical source-root confinement
- local resources only
- sanitized Markdown HTML
- no author code or template execution
