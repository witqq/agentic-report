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

| Built-in theme | Intent                                                                                                                         | Palette                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calm-paper`   | Long reading: warm paper, a Playfair display over Literata text, and one clay accent.                                          | Warm paper (#f4f1ea) and dark ink (#1b1a17) for text that reads like print; clay (#c2643f) marks rules and the current place, sage (#4b7a6a) the eyebrows.                                                                           |
| `neutral`      | Neutral reading and product pages: grey paper, a Literata display over Onest, Martian Mono, one ochre accent.                  | Grey paper (#f5f5f3) and ink (#16171a) with one warm ochre accent (#8a5c00); the dark scheme is warm graphite (#151514), not night blue. No cream, no terracotta.                                                                    |
| `frost`        | Two colours and one material: stone grey and graphite, an Onest display over IBM Plex Sans; colour is left to statuses.        | Stone (#eef0f3) and graphite (#383e4e) in the light scheme, graphite night (#1b1e25) and stone (#b6bac5) in the dark; the accent is graphite itself, so green, red and ochre appear only as statuses.                                |
| `daylight`     | Product documentation: a bright page, an Onest display over Golos Text, and Geist Mono.                                        | Cool white (#f7f8fa) and graphite ink (#121620); cobalt (#1f5bb8) marks the current place and petrol (#0e6f82) the eyebrows. No default framework palette.                                                                           |
| `midnight`     | Engineering story at night: a Geologica display over IBM Plex Sans, one blue signal and steel for the eyebrows.                | Night ink (#0b0e14) with one blue signal (#7aa2ff) and steel (#9fb2c8) for eyebrows; teal stays a chart series only. The light scheme keeps the pair on cool paper.                                                                  |
| `noir`         | Cinematic and editorial: spaced Cormorant Garamond capitals over Jost, amber on black.                                         | Black (#0a0a0b) and bone (#f4f4f5) with amber (#e0a458) and steel (#9fb2c8); the light scheme is ivory with darker amber.                                                                                                            |
| `aurora`       | Calm research and science: a light Raleway display over Commissioner, one mint signal on deep blue.                            | Deep blue night (#070b16) with one mint signal (#6fd6c4) and sand (#d9c7a0) for eyebrows; the light scheme is pale sea-green paper with ochre eyebrows.                                                                              |
| `blueprint`    | Dense technical evidence: a Tektur display over Fira Sans, Martian Mono labels, cyan and yellow on drafting blue.              | Drafting blue (#0a1a33) with cyan (#4cc9f0) and signal yellow (#f9c74f) and a faint grid; the light scheme is blueprint paper.                                                                                                       |
| `ember`        | Launches and announcements: a condensed Oswald capital page title over Rubik, orange on dark embers.                           | Ember black (#0e0907) and warm white (#fff4ec) with one orange signal (#ff7a3d) and warm grey (#c9b8a8) for eyebrows; the light scheme is warm paper with burnt orange.                                                              |
| `synthwave`    | Games and music only: a wide Unbounded display over Exo 2, magenta and cyan on violet night; not for a product landing.        | Violet night (#140b27) with magenta (#ff4fd8) and cyan (#37e0ff), for pages whose subject is play or music; the light scheme is lilac paper.                                                                                         |
| `terminal`     | Developer console: Martian Mono and JetBrains Mono on graphite, a green prompt, amber labels and a cursor at the page heading. | Console graphite (#0c0e0d) with light grey text (#c9d4cc); one muted green (#5ccf8a) for the prompt and markers, amber (#e0a84a) for labels and focus. Dark scheme only; scanlines and glow are off unless the author turns them on. |

Schemes: `system`, `light`, `dark`. Layouts: `document`, `dashboard`, `landing`, `mixed`, `slides`, `screens`.

## Theme fields

`theme` takes a built-in theme name, a relative path to a theme file (`.yaml`, `.yml`, `.json`), or a theme object in the frontmatter. A theme file and a theme object share these fields; every field is optional and anything left out comes from `extends`, which defaults to the default theme. Resolution order: default theme, extends chain, accent, explicit fields.

| Field                        | Values                                                                                                                                                                                                                                                                                                                                           | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                       | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`)                                                                                                                                                                                                                                                                                  | Theme identity shown in the theme selector; a theme file defaults to its file name, an inline theme to custom.                                                                                                                                                                                                                                                                                                                                                                             |
| `extends`                    | text (trimmed, min 1, max 300)                                                                                                                                                                                                                                                                                                                   | Built-in theme name or relative path to another theme file this theme starts from; defaults to the default theme.                                                                                                                                                                                                                                                                                                                                                                          |
| `description`                | text (trimmed, min 1, max 300)                                                                                                                                                                                                                                                                                                                   | One sentence saying what kind of page the theme is for.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `palette`                    | text (trimmed, min 1, max 600)                                                                                                                                                                                                                                                                                                                   | Why the palette looks the way it does, in words: the named colours and the reason for them.                                                                                                                                                                                                                                                                                                                                                                                                |
| `scheme`                     | `both`, `dark`                                                                                                                                                                                                                                                                                                                                   | Colour schemes the theme draws: both light and dark, or dark only.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `accent`                     | `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink`, `indigo`, `teal`, `coral`                                                                                                                                                                                                                                                                  | Named accent family for both schemes; explicit accent colours override it.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fonts.pair`                 | `midnight`, `calm-paper`, `synthwave`, `noir`, `aurora`, `daylight`, `ember`, `blueprint`, `terminal`, `neutral`, `frost`, `system`                                                                                                                                                                                                              | Coordinated heading, body and code families; a family named for a role in the same theme refines it.                                                                                                                                                                                                                                                                                                                                                                                       |
| `fonts.heading`              | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Headings and section titles.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `fonts.body`                 | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Body text and controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fonts.mono`                 | `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono` | Code, commands and metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
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
| `colors.light.<role>`        | `#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent` (trimmed)                                                                                                                                                                                                                                                                                        | Light scheme colour roles. Roles: `background`, `surface`, `raised`, `muted`, `heading`, `text`, `textMuted`, `border`, `borderStrong`, `accent`, `accentStrong`, `accentSoft`, `accent2`, `focus`, `chart1`, `chart2`, `chart3`, `chart4`, `chart5`, `chart6`, `statusDone`, `statusReview`, `statusReturned`, `marker`, `shadow`, `mediaBacking`, `codeBackground`, `codeText`, `codeKeyword`, `codeString`, `codeNumber`, `codeFunction`, `codeType`, `codeComment`, `codePunctuation`. |
| `colors.dark.<role>`         | `#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent` (trimmed)                                                                                                                                                                                                                                                                                        | Dark scheme colour roles. Roles: `background`, `surface`, `raised`, `muted`, `heading`, `text`, `textMuted`, `border`, `borderStrong`, `accent`, `accentStrong`, `accentSoft`, `accent2`, `focus`, `chart1`, `chart2`, `chart3`, `chart4`, `chart5`, `chart6`, `statusDone`, `statusReview`, `statusReturned`, `marker`, `shadow`, `mediaBacking`, `codeBackground`, `codeText`, `codeKeyword`, `codeString`, `codeNumber`, `codeFunction`, `codeType`, `codeComment`, `codePunctuation`.  |
| `chrome.topbar`              | `glass`, `ledger`                                                                                                                                                                                                                                                                                                                                | Glass bar with the page title, or a ledger bar with the current section.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `chrome.navigation`          | `plain`, `numbered`                                                                                                                                                                                                                                                                                                                              | Plain section list, or numbered chapters.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `chrome.sectionTitle`        | `plain`, `rule`, `bar`                                                                                                                                                                                                                                                                                                                           | Section title without a rule, underlined, or with a side bar.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `chrome.cards`               | `raised`, `ruled`                                                                                                                                                                                                                                                                                                                                | Raised cards, or cards ruled by an accent line.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `chrome.components`          | `soft`, `flat`, `edged`                                                                                                                                                                                                                                                                                                                          | Soft components, flat framed components, or components with a signal edge.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `chrome.landing`             | `centered`, `ledger`                                                                                                                                                                                                                                                                                                                             | Landing opening centred, or a ledger with a side rail and an eyebrow.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `chrome.edges`               | `none`, `mono`                                                                                                                                                                                                                                                                                                                                   | Nothing at the screen edges, or small monospace captions along them on a wide screen: the page title on the left, the current chapter and its number on the right — for a technical product.                                                                                                                                                                                                                                                                                               |
| `ornaments.headingPrefix`    | text (trimmed, min 0, max 3, pattern `^[^\s<"'\\]{0,3}$`)                                                                                                                                                                                                                                                                                        | Up to three characters drawn before the page heading in the accent colour, such as > or §; no spaces, quotes, backslash or <; empty for none.                                                                                                                                                                                                                                                                                                                                              |
| `ornaments.titleCursor`      | true or false                                                                                                                                                                                                                                                                                                                                    | Cursor after the page heading: blinks six times, then stays lit; still under reduced motion.                                                                                                                                                                                                                                                                                                                                                                                               |
| `ornaments.heroEmphasis`     | `none`, `rule`, `shadow`                                                                                                                                                                                                                                                                                                                         | Hero and story sections unmarked, marked by a thin accent rule, or lifted by a shadow.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ornaments.mediaTreatment`   | `plain`, `vivid`                                                                                                                                                                                                                                                                                                                                 | Plain images, or images with depth and slightly richer colour.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ornaments.console`          | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Console details: bracketed labels, dashed rules and a prompt mark at the current contents item.                                                                                                                                                                                                                                                                                                                                                                                            |
| `ornaments.scanlines`        | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Faint scanlines over the whole page; off by default, because a texture over the text reads as a generated-site cliché.                                                                                                                                                                                                                                                                                                                                                                     |
| `ornaments.glow`             | `none`, `on`                                                                                                                                                                                                                                                                                                                                     | Phosphor glow on headings and the primary action; off by default for the same reason.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ornaments.linkedCard`       | `raised`, `edge`                                                                                                                                                                                                                                                                                                                                 | Linked cards raised on hover, or marked by an accent edge.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Named accents: `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink`, `indigo`, `teal`, `coral`. Font families: `onest`, `golos-text`, `ibm-plex-sans`, `exo-2`, `jost`, `commissioner`, `rubik`, `fira-sans`, `geologica`, `manrope`, `raleway`, `unbounded`, `oswald`, `tektur`, `geist`, `literata`, `playfair`, `cormorant-garamond`, `jetbrains-mono`, `martian-mono`, `geist-mono`, `victor-mono`, `pt-mono`, `system-sans`, `system-serif`, `system-mono`.

The build refuses a theme whose colours fail these contrast pairs in any scheme it draws:

| Foreground       | Background       | Minimum | Used for                     |
| ---------------- | ---------------- | ------- | ---------------------------- |
| `heading`        | `background`     | 4.5:1   | headings on the page         |
| `text`           | `background`     | 4.5:1   | body text on the page        |
| `text`           | `surface`        | 4.5:1   | text inside components       |
| `textMuted`      | `background`     | 4.5:1   | captions on the page         |
| `textMuted`      | `surface`        | 4.5:1   | captions in components       |
| `text`           | `raised`         | 4.5:1   | text on raised panels        |
| `textMuted`      | `raised`         | 4.5:1   | captions on raised panels    |
| `textMuted`      | `muted`          | 4.5:1   | captions on muted wells      |
| `heading`        | `accentSoft`     | 4.5:1   | titles in accent sections    |
| `text`           | `accentSoft`     | 4.5:1   | text in accent sections      |
| `text`           | `accentSoft`     | 4.5:1   | captions in accent sections  |
| `accentStrong`   | `background`     | 4.5:1   | links on the page            |
| `accentStrong`   | `surface`        | 4.5:1   | links in components          |
| `accent2`        | `background`     | 4.5:1   | eyebrows and kickers         |
| `accent`         | `background`     | 3:1     | accent rules and markers     |
| `background`     | `heading`        | 4.5:1   | primary action label         |
| `focus`          | `background`     | 3:1     | keyboard focus ring          |
| `statusDone`     | `background`     | 3:1     | status «done» marks          |
| `statusDone`     | `surface`        | 3:1     | status «done» in cards       |
| `statusReview`   | `background`     | 3:1     | status «review» marks        |
| `statusReview`   | `surface`        | 3:1     | status «review» in cards     |
| `statusReturned` | `background`     | 3:1     | status «returned» marks      |
| `statusReturned` | `surface`        | 3:1     | status «returned» in cards   |
| `focus`          | `surface`        | 3:1     | focus ring inside components |
| `codeText`       | `codeBackground` | 4.5:1   | code text                    |
| `codeKeyword`    | `codeBackground` | 4.5:1   | code keywords                |
| `codeString`     | `codeBackground` | 4.5:1   | code strings                 |
| `codeNumber`     | `codeBackground` | 4.5:1   | code numbers                 |
| `codeFunction`   | `codeBackground` | 4.5:1   | code functions               |
| `codeType`       | `codeBackground` | 4.5:1   | code types                   |
| `codeComment`    | `codeBackground` | 4.5:1   | code comments                |

## Frontmatter and manifest fields

Every accepted field; anything else is refused as an unknown field.

| Field                   | Type             | Accepted values and constraints                                                            | Default                                             | Meaning                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contractVersion`       | integer          | integer from 1                                                                             | `1`                                                 | Authored source-contract major; omitted legacy source is interpreted as version 1.                                                                                                                                                                                                                            |
| `title`                 | string           | text (trimmed, min 1)                                                                      | —                                                   | Document title.                                                                                                                                                                                                                                                                                               |
| `description`           | string           | text (trimmed, min 1)                                                                      | —                                                   | Plain-text document description for metadata.                                                                                                                                                                                                                                                                 |
| `language`              | string           | text (trimmed, min 2, pattern `^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$`)                     | `"und"`                                             | Language tag using the supported 2-8 letter primary and optional 2-8 character alphanumeric subtags.                                                                                                                                                                                                          |
| `localizations`         | object           | —                                                                                          | —                                                   | Confined alternate Markdown entries for package-supported reader locales; the primary entry is the fallback.                                                                                                                                                                                                  |
| `localizations.en`      | string           | text (trimmed, min 1, format `relative-local-path`)                                        | —                                                   | Alternate English Markdown entry relative to the primary source root.                                                                                                                                                                                                                                         |
| `localizations.ru`      | string           | text (trimmed, min 1, format `relative-local-path`)                                        | —                                                   | Alternate Russian Markdown entry relative to the primary source root.                                                                                                                                                                                                                                         |
| `url`                   | string           | text (trimmed, min 1, format `absolute-http-url`, pattern `^[Hh][Tt][Tt][Pp][Ss]?://\S+$`) | —                                                   | Absolute public http(s) URL of the page; enables canonical, OpenGraph and Twitter card metadata.                                                                                                                                                                                                              |
| `image`                 | string           | text (trimmed, min 1, format `relative-local-path`)                                        | —                                                   | Local PNG, JPEG, WebP, GIF or AVIF social preview image; published as og:image by a directory build with a public URL.                                                                                                                                                                                        |
| `theme`                 | string or object | built-in theme, local theme file, or theme object                                          | `"neutral"`                                         | Visual theme: a built-in theme name, a relative path to a .yaml/.yml/.json theme file, or a theme object with extends and the fields it changes.                                                                                                                                                              |
| `scheme`                | string           | `system`, `light`, `dark`                                                                  | `"system"`                                          | Initial colour scheme: follow the reader system, or light, or dark.                                                                                                                                                                                                                                           |
| `layout`                | string           | `document`, `dashboard`, `landing`, `mixed`, `slides`, `screens`                           | `"document"`                                        | Responsive page composition selected from the package-owned layout catalog; screens moves one whole screen per gesture, with a screen switcher, keys and anchors, and scrolls normally under reduced motion.                                                                                                  |
| `progress`              | string           | `none`, `page`, `chapters`, `nodes`                                                        | `"none"`                                            | Page-wide progress element at the top edge: none, one bar for the whole page, one segment per chapter that fills as the reader moves through it and jumps to the chapter on click, or a row of nodes, one per chapter, marking the chapters passed and the current one.                                       |
| `motion`                | string           | `none`, `restrained`, `expressive`                                                         | `"expressive"`                                      | How much the page moves, decided by the brief: none — everything is drawn in its final state; restrained — at most one chapter entrance and one pointer effect, no pinned scenes, diagram drawing, WebGL or staged entrance; expressive — the whole motion vocabulary. Reduced motion always stills the page. |
| `opening`               | string           | `center`, `start`                                                                          | `"center"`                                          | Alignment of the page title, introduction and actions on a landing page: centered, or aligned to the start edge.                                                                                                                                                                                              |
| `attribution`           | boolean          | true or false                                                                              | `true`                                              | Shows the package-owned “Made with Agentic Report” footer link; set false to omit it.                                                                                                                                                                                                                         |
| `schemeToggle`          | boolean          | true or false                                                                              | `true`                                              | Shows the package-owned light and dark control; set false for a page that must stay in the scheme it was built with.                                                                                                                                                                                          |
| `themeSwitcher`         | boolean          | true or false                                                                              | `false`                                             | Shows a package-owned selector that swaps the page between the built-in themes and its own; the colour scheme stays where the reader put it.                                                                                                                                                                  |
| `review`                | boolean          | true or false                                                                              | `false`                                             | Enables the package-owned review workspace; off by default so an ordinary page ships as a document rather than a review surface.                                                                                                                                                                              |
| `extensions`            | array            | unique local paths (1–32 items)                                                            | —                                                   | Extension manifests the page declares (blocks, providers, effects, islands), relative to the source root.                                                                                                                                                                                                     |
| `data`                  | array            | unique local paths (1–16 items)                                                            | —                                                   | JSON data files the page reads at build time, relative to the source root; each is addressed by its name without .json, as in {{run.total}}.                                                                                                                                                                  |
| `output`                | object           | —                                                                                          | `{"format":"single-file","maxInlineBytes":5000000}` | Default output settings; command-line flags can override the format.                                                                                                                                                                                                                                          |
| `output.format`         | string           | `single-file`, `directory`                                                                 | `"single-file"`                                     | Static artifact layout; single-file is the portable default.                                                                                                                                                                                                                                                  |
| `output.maxInlineBytes` | integer          | integer from 1                                                                             | `5000000`                                           | Size budget of bytes embedded into single-file output; a build above it fails, use directory output or raise it deliberately.                                                                                                                                                                                 |

## Directives

68 directives are accepted.

### `action`

Ordinary safe link inside an actions group.

Forms: leaf. Children: label-or-generated-label. Required parent: `actions`.

| Attribute | Values and constraints                                                                                                                                                                                                                                          | Required | Default   | Meaning                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `href`    | text (trimmed, min 1, max 500, pattern `^(?:#[A-Za-z][A-Za-z0-9_-]{0,127}\|https?://[^\s<>]+\|mailto:[^\s<>]+\|tel:\+?[0-9][0-9().-]{0,31}\|sms:\+?[0-9][0-9().,-]{0,63}(?:\?body=[^\s<>]*)?\|(?!(?:[A-Za-z][A-Za-z0-9+.-]*:\|//\|/))[A-Za-z0-9.][^\s<>\\]*)$`) | yes      | —         | Safe same-page, relative, HTTP(S), email, phone (tel:), or text-message (sms:) link target; executable and local-file schemes are rejected. |
| `kind`    | `primary`, `secondary`, `quiet`                                                                                                                                                                                                                                 | no       | `primary` | Package-owned action emphasis.                                                                                                              |
| `effect`  | `none`, `magnetic`                                                                                                                                                                                                                                              | no       | `none`    | Rare package-owned action interaction.                                                                                                      |

Incompatible combinations:

- `kind` is `secondary` or `quiet`; `effect` is `magnetic`: Magnetic action treatment is available only for a primary action. Use kind="primary" or effect="none".

### `actions`

Responsive group containing ordinary action links.

Forms: container. Children: action-directives.

| Attribute   | Values and constraints             | Required | Default | Meaning                                        |
| ----------- | ---------------------------------- | -------- | ------- | ---------------------------------------------- |
| `placement` | `auto`, `edge`, `inline`, `bottom` | no       | `auto`  | Responsive placement for one action inventory. |

### `appear`

Markdown that appears on the next step of its slide in a presentation (layout slides); on any other page, and under reduced motion or in print, it is simply shown.

Forms: container. Children: markdown.

| Attribute | Values and constraints        | Required | Default | Meaning                                                                                         |
| --------- | ----------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| `effect`  | `rise`, `fade`, `wipe`, `pop` | no       | `rise`  | How the content arrives on its step: rising, fading, wiping in from the start edge, or popping. |

### `asset`

Download link to a confined local file.

Forms: text, leaf. Children: label-or-generated-label.

| Attribute | Values and constraints                                       | Required | Default | Meaning                       |
| --------- | ------------------------------------------------------------ | -------- | ------- | ----------------------------- |
| `src`     | text (trimmed, min 1, max 200, format `relative-local-path`) | yes      | —       | Relative local resource path. |

### `beat`

One step of a scene="steps" or scene="scrub" section or of a playable demo: Markdown that scrolls past the pinned media or plays in turn; the nth beat shows the nth picture, lights its focus nodes in the diagram or its lines of the code block.

Forms: container. Children: markdown. Required parent: `section` or `demo`.

| Attribute | Values and constraints                                                                                                       | Required | Default | Meaning                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | text (trimmed, min 1, max 200)                                                                                               | no       | —       | Visible title.                                                                                                                                                       |
| `focus`   | text (trimmed, min 1, max 640)                                                                                               | no       | —       | Diagram node and connection identities lit while this beat is current, separated by commas; a connection lights when named by its id or when both its nodes are lit. |
| `lines`   | text (trimmed, min 1, max 120, pattern `^[1-9][0-9]{0,3}(?:-[1-9][0-9]{0,3})?(?:, ?[1-9][0-9]{0,3}(?:-[1-9][0-9]{0,3})?)*$`) | no       | —       | Lines of the code block in the scene lit while this beat is current, such as 3, 2-4 or 1,5-7; the other lines dim.                                                   |
| `state`   | text (trimmed, min 1, max 41, pattern `^[a-z][a-z0-9-]{0,40}$`)                                                              | no       | —       | Page state set from the moment this beat becomes current; in a scrub scene it stays set for the later beats, so the last beat holds every state of the scene.        |

### `bucket`

One named assignment bucket.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                     |
| --------- | --------------------------------------------------------------- | -------- | ------- | ------------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable bucket identity within the question. |
| `label`   | text (trimmed, min 1, max 200)                                  | yes      | —       | Visible bucket label.                       |

### `callout`

Emphasized finding or notice containing Markdown.

Forms: container. Children: markdown.

| Attribute | Values and constraints                                          | Required | Default | Meaning                       |
| --------- | --------------------------------------------------------------- | -------- | ------- | ----------------------------- |
| `title`   | text (trimmed, min 1, max 200)                                  | no       | —       | Visible title.                |
| `kind`    | text (trimmed, min 1, max 32, pattern `^[a-z][a-z0-9-]{0,31}$`) | no       | `info`  | Lowercase presentation token. |

### `card`

One semantic card containing Markdown, optionally promoted to one safe whole-card link.

Forms: container. Children: markdown. Required parent: `cards`.

| Attribute | Values and constraints                                                                                                                                                                                                                                          | Required | Default | Meaning                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | text (trimmed, min 1, max 200)                                                                                                                                                                                                                                  | no       | —       | Visible title.                                                                                                                                                                   |
| `href`    | text (trimmed, min 1, max 500, pattern `^(?:#[A-Za-z][A-Za-z0-9_-]{0,127}\|https?://[^\s<>]+\|mailto:[^\s<>]+\|tel:\+?[0-9][0-9().-]{0,31}\|sms:\+?[0-9][0-9().,-]{0,63}(?:\?body=[^\s<>]*)?\|(?!(?:[A-Za-z][A-Za-z0-9+.-]*:\|//\|/))[A-Za-z0-9.][^\s<>\\]*)$`) | no       | —       | Safe same-page, relative, HTTP(S), email, phone (tel:), or text-message (sms:) link target; executable and local-file schemes are rejected.                                      |
| `status`  | `none`, `good`, `watch`, `risk`                                                                                                                                                                                                                                 | no       | `none`  | State label shown on the card as text and a marker: good, watch or risk.                                                                                                         |
| `when`    | text (trimmed, min 1, max 41, pattern `^[a-z][a-z0-9-]{0,40}$`)                                                                                                                                                                                                 | no       | —       | Page state that lights this card, such as a station that lights when the reader reaches its chapter; until then the card is dimmed. Without motion and in print the card is lit. |

### `cards`

Responsive grid, normally containing card directives.

Forms: container. Children: markdown-and-card-directives.

| Attribute | Values and constraints         | Required | Default | Meaning        |
| --------- | ------------------------------ | -------- | ------- | -------------- |
| `title`   | text (trimmed, min 1, max 200) | no       | —       | Visible title. |

### `chart`

Responsive bar, line, or pie chart rendered at compile time.

Forms: container. Children: series-directives.

| Attribute     | Values and constraints         | Required | Default | Meaning                                                                                                                                                                                    |
| ------------- | ------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | text (trimmed, min 1, max 200) | yes      | —       | Visible title.                                                                                                                                                                             |
| `description` | text (trimmed, min 1, max 300) | yes      | —       | Meaningful plain-text description for the visual.                                                                                                                                          |
| `type`        | `bar`, `line`, `pie`           | no       | `bar`   | Chart form.                                                                                                                                                                                |
| `x-label`     | text (trimmed, min 1, max 160) | no       | —       | Horizontal-axis label.                                                                                                                                                                     |
| `y-label`     | text (trimmed, min 1, max 160) | no       | —       | Vertical-axis label.                                                                                                                                                                       |
| `count-up`    | true or false                  | no       | `false` | Grow the bars, lines and slices from zero to their values, and count the slice percentages up, when the chart comes into view; under reduced motion and in print the values stand at once. |

### `check-item`

One labelled required or optional checklist item.

Forms: leaf. Children: label-or-generated-label. Required parent: `checklist`.

| Attribute  | Values and constraints                                          | Required | Default | Meaning                                             |
| ---------- | --------------------------------------------------------------- | -------- | ------- | --------------------------------------------------- |
| `id`       | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable checklist item identity.                     |
| `label`    | text (trimmed, min 1, max 160)                                  | yes      | —       | Visible checklist item label.                       |
| `required` | true or false                                                   | no       | `false` | Marks this item as required in the static document. |

### `checklist`

Static structured checklist containing stable check-item directives.

Forms: container. Children: check-item-directives.

| Attribute | Values and constraints                                          | Required | Default | Meaning                    |
| --------- | --------------------------------------------------------------- | -------- | ------- | -------------------------- |
| `title`   | text (trimmed, min 1, max 200)                                  | yes      | —       | Visible title.             |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable checklist identity. |

### `compare`

Before and after of the same view: exactly two Markdown images, before then after, laid over each other with a divider the reader moves by pointer or keyboard.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default  | Meaning                    |
| --------- | ------------------------------ | -------- | -------- | -------------------------- |
| `before`  | text (trimmed, min 1, max 160) | no       | `Before` | Label of the first image.  |
| `after`   | text (trimmed, min 1, max 160) | no       | `After`  | Label of the second image. |

### `contents`

Generated in-flow links to final primary sections using their exact visible headings.

Forms: leaf. Children: none. Top-level only.

| Attribute | Values and constraints | Required | Default | Meaning                                                                                                                                                                      |
| --------- | ---------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sticky`  | true or false          | no       | `false` | On a landing: the chapters numbered and held at the edge of a wide screen while the reader scrolls, the current chapter marked; in the flow on a narrow screen and in print. |

### `conversation`

A mock of a dialog or a notification feed: message directives in order, with an optional title and an illustrative mark.

Forms: container. Children: message-directives.

| Attribute      | Values and constraints         | Required | Default | Meaning                                                                                     |
| -------------- | ------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `title`        | text (trimmed, min 1, max 200) | no       | —       | Visible title.                                                                              |
| `illustrative` | true or false                  | no       | `false` | Marks the mock as an illustration: its names, times and numbers are examples, not a record. |

### `copyable`

Ordinary Markdown prose with a localized copy control.

Forms: container. Children: markdown-and-term-directives.

### `count`

A number in running text that counts up from zero to its written value when it comes into view; the written value is what the page holds and shows without motion.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                                                                                                                |
| --------- | --------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `when`    | text (trimmed, min 1, max 41, pattern `^[a-z][a-z0-9-]{0,40}$`) | no       | —       | Page state that starts the count instead of the number coming into view, such as the chapter that the figure belongs to being reached. |

### `decision`

Static Markdown decision or typed decision containing decision-option directives.

Forms: container. Children: decision-option-directives.

| Attribute  | Values and constraints                                          | Required | Default | Meaning                                                      |
| ---------- | --------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------ |
| `title`    | text (trimmed, min 1, max 200)                                  | no       | —       | Visible title.                                               |
| `id`       | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | no       | —       | Stable identity required when decision options are authored. |
| `required` | true or false                                                   | no       | `false` | Marks this decision as required in the static document.      |

### `decision-option`

One labelled option inside a typed decision.

Forms: leaf. Children: label-or-generated-label. Required parent: `decision`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                 |
| --------- | --------------------------------------------------------------- | -------- | ------- | ----------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable option identity. |
| `label`   | text (trimmed, min 1, max 160)                                  | yes      | —       | Visible option label.   |

### `demo`

Package-owned demo: a counter card, or with play a scene that reconstructs the product from ordinary directives (code, a diagram, cards, a picture) and plays its beats by time or by scroll; author code is never executed.

Forms: container. Children: markdown.

| Attribute | Values and constraints                                | Required | Default | Meaning                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | text (trimmed, min 1, max 200)                        | no       | —       | Visible title.                                                                                                                                                                                                         |
| `start`   | integer from -999999 to 999999 spelling `^-?\d{1,6}$` | no       | `0`     | Initial counter value (counter demo only).                                                                                                                                                                             |
| `step`    | integer from -999999 to 999999 spelling `^-?\d{1,6}$` | no       | `1`     | Amount added per activation (counter demo only).                                                                                                                                                                       |
| `play`    | `none`, `time`, `scroll`                              | no       | `none`  | none: a counter card. time: a playable scene whose beats advance by the page clock, with a play and a pause button, ending on its final frame. scroll: the scene is pinned while the reader scrolls through its beats. |
| `seconds` | integer from 1 to 10 spelling `^\d{1,2}$`             | no       | `3`     | Seconds each beat of a play="time" scene stays current (1–10); the theme pace scales it.                                                                                                                               |

### `diagram`

Directed flow diagram rendered as deterministic SVG.

Forms: container. Children: diagram-part-directives.

| Attribute     | Values and constraints                                                                         | Required | Default       | Meaning                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | text (trimmed, min 1, max 200)                                                                 | yes      | —             | Visible title.                                                                                                                                                                                                                             |
| `description` | text (trimmed, min 1, max 300)                                                                 | yes      | —             | Meaningful plain-text description for the visual.                                                                                                                                                                                          |
| `type`        | `flow`, `sequence`                                                                             | no       | `flow`        | Diagram form.                                                                                                                                                                                                                              |
| `direction`   | `auto`, `right`, `down`                                                                        | no       | `auto`        | Direction in which flow layers follow each other; auto lets the layout pick the one that reads larger on the page.                                                                                                                         |
| `layout`      | `auto`, `down`, `right`, `orthogonal`                                                          | no       | `auto`        | Flow view shown first and printed: auto picks the clearest; down and right are layered, orthogonal routes at right angles; readers can switch.                                                                                             |
| `spacing`     | `compact`, `comfortable`, `spacious`                                                           | no       | `comfortable` | Layout breathing room; the package keeps a readable result at every value.                                                                                                                                                                 |
| `draw`        | `none`, `scroll`                                                                               | no       | `none`        | Draw the connections as the diagram scrolls through the view, in flow order, with backward connections as a later phase, while a marker rides the connection being drawn; still and complete, the marker at the end, under reduced motion. |
| `pulse`       | text (trimmed, min 3, max 800, pattern `^[a-z][a-z0-9-]{0,63}(\s*,\s*[a-z][a-z0-9-]{0,63})+$`) | no       | —             | A route of node identities separated by commas, each joined to the next by a connection: pulses travel along it three times when the diagram comes into view; under reduced motion the route is marked still.                              |

### `diff`

One change in unified diff form: exactly one fenced code block with @@ hunks, drawn with old and new line numbers.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default | Meaning                                           |
| --------- | ------------------------------ | -------- | ------- | ------------------------------------------------- |
| `title`   | text (trimmed, min 1, max 200) | no       | —       | Visible title.                                    |
| `file`    | text (trimmed, min 1, max 300) | no       | —       | Path of the changed file, shown above the change. |

### `disclosure`

Native disclosure with a visible summary.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default | Meaning                   |
| --------- | ------------------------------ | -------- | ------- | ------------------------- |
| `title`   | text (trimmed, min 1, max 200) | yes      | —       | Visible title.            |
| `open`    | `false`, `true`                | no       | `false` | Initial disclosure state. |

### `each`

Repeats its Markdown once per item of a list from the page data when the page builds; a body that is one list or one table repeats its items or rows inside it.

Forms: container. Children: markdown.

| Attribute | Values and constraints                                                                                        | Required | Default | Meaning                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------- |
| `in`      | text (trimmed, min 1, max 200, pattern `^[A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*\|[0-9]+))*$`) | yes      | —       | Path of a list in the page data, such as run.blocks.                                          |
| `as`      | text (trimmed, min 1, max 32, pattern `^[a-z][a-z0-9-]{0,31}$`)                                               | yes      | —       | Name of the current item inside the body: {{as}} for a plain value, {{as.field}} for a field. |

### `edge`

One directed connection between diagram nodes; from equal to to is a step that repeats, drawn as a loop on the node in a flow and on the lifeline in a sequence.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                                                                                    |
| --------- | --------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `from`    | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Source node identity.                                                                                      |
| `to`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Target node identity; a flow requires a different node.                                                    |
| `label`   | text (trimmed, min 1, max 160)                                  | no       | —       | Optional connection label, required in a sequence; a long label wraps onto several lines and is never cut. |
| `kind`    | `call`, `data`, `event`, `dependency`                           | no       | `call`  | What the connection means; each kind has its own package-drawn line and arrowhead.                         |
| `route`   | `auto`, `direct`, `around`                                      | no       | `auto`  | Optional layout pull; direct keeps the connection short and straight, around lets it stretch.              |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | no       | —       | Optional connection identity, distinct from the node identities: a beat focus lights the connection by it. |
| `count`   | integer from 1 to 999                                           | no       | —       | How many times the connection was taken, written «×N» on it: a return repeated, a retry.                   |

### `event`

One dated timeline event with optional Markdown detail.

Forms: container. Children: markdown. Required parent: `timeline`.

| Attribute | Values and constraints                    | Required | Default   | Meaning                       |
| --------- | ----------------------------------------- | -------- | --------- | ----------------------------- |
| `date`    | text (trimmed, min 1, max 160)            | yes      | —         | Visible date or phase label.  |
| `title`   | text (trimmed, min 1, max 200)            | yes      | —         | Visible title.                |
| `kind`    | `neutral`, `accent`, `success`, `warning` | no       | `neutral` | Package-owned event emphasis. |

### `expect`

A control value over the page data: the build fails at this line when the data at the path diverges from the stated count, bounds or value. Renders nothing.

Forms: leaf. Children: none.

| Attribute | Values and constraints                                                                                        | Required | Default | Meaning                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------ |
| `data`    | text (trimmed, min 1, max 200, pattern `^[A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*\|[0-9]+))*$`) | yes      | —       | Path of the value the expectation reads, such as run.blocks.                               |
| `count`   | integer from 0 to 100000                                                                                      | no       | —       | The list at the path has exactly this many items.                                          |
| `min`     | number                                                                                                        | no       | —       | A list has at least this many items (min="1": not empty); a number is at least this value. |
| `max`     | number                                                                                                        | no       | —       | A list has at most this many items; a number is at most this value.                        |
| `equals`  | text (trimmed, min 1, max 300)                                                                                | no       | —       | A text, number or true/false value written exactly like this.                              |

### `eyebrow`

A short small-caps line above the title that follows it, in the eyebrow colour of the theme; written first in a section, it stands above the section title.

Forms: leaf. Children: label-or-generated-label.

### `filter`

Client-side text filter for authored list items.

Forms: container. Children: markdown.

| Attribute     | Values and constraints         | Required | Default        | Meaning                   |
| ------------- | ------------------------------ | -------- | -------------- | ------------------------- |
| `title`       | text (trimmed, min 1, max 200) | no       | —              | Visible title.            |
| `placeholder` | text (trimmed, min 1, max 160) | no       | `Filter items` | Search-field placeholder. |

### `finding`

One review finding with a severity, a title and Markdown detail.

Forms: container. Children: markdown. Required parent: `findings`.

| Attribute  | Values and constraints               | Required | Default | Meaning                                                                 |
| ---------- | ------------------------------------ | -------- | ------- | ----------------------------------------------------------------------- |
| `severity` | `blocking`, `major`, `minor`, `note` | yes      | —       | How much the finding blocks the change; shown as text, not only colour. |
| `title`    | text (trimmed, min 1, max 200)       | yes      | —       | Visible title.                                                          |
| `location` | text (trimmed, min 1, max 300)       | no       | —       | Where the finding applies, such as a path and line.                     |

### `findings`

Review findings in authored order, with a generated count per severity above them.

Forms: container. Children: finding-directives.

| Attribute | Values and constraints         | Required | Default | Meaning        |
| --------- | ------------------------------ | -------- | ------- | -------------- |
| `title`   | text (trimmed, min 1, max 200) | no       | —       | Visible title. |

### `font`

Register a confined local font for one text role; the first declaration of each role replaces the theme font of that role.

Forms: leaf. Children: none.

| Attribute | Values and constraints                                           | Required | Default | Meaning                                                                                |
| --------- | ---------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `src`     | text (trimmed, min 1, max 200, format `relative-local-path`)     | yes      | —       | Relative local font path.                                                              |
| `family`  | text (trimmed, min 1, max 80, pattern `^[\p{L}\p{N} _-]{1,80}$`) | yes      | —       | CSS font family using letters, numbers, spaces, underscores, or hyphens.               |
| `role`    | `body`, `heading`, `mono`                                        | no       | `body`  | Text role the font sets: body text and controls, headings and section titles, or code. |

### `glossary`

Reusable glossary definition containing Markdown, optionally moved from the document root or a direct section child into the appendix.

Forms: container. Children: markdown.

| Attribute   | Values and constraints                                          | Required | Default  | Meaning                                                                                                                                       |
| ----------- | --------------------------------------------------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`       | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —        | Stable glossary definition key.                                                                                                               |
| `term`      | text (trimmed, min 1, max 160)                                  | yes      | —        | Canonical glossary identity and explanation title.                                                                                            |
| `forms`     | text (trimmed, min 1, max 640)                                  | no       | —        | Additional declared spellings of the canonical term, comma separated. An occurrence of any declared form counts as an occurrence of the term. |
| `placement` | `inline`, `appendix`                                            | no       | `inline` | Definition location in the authored flow or, from the document root or a direct section child, one package-owned reference appendix.          |

### `group`

One labelled subsystem group around some nodes of a flow diagram.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                   |
| --------- | --------------------------------------------------------------- | -------- | ------- | ----------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Unique group identity within the diagram. |
| `label`   | text (trimmed, min 1, max 160)                                  | yes      | —       | Visible group label.                      |

### `item`

One readable response item.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values and constraints                                                                                                                                                                                                                                          | Required | Default | Meaning                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`)                                                                                                                                                                                                 | yes      | —       | Stable item identity within the question.                                                                                                   |
| `label`   | text (trimmed, min 1, max 500)                                                                                                                                                                                                                                  | yes      | —       | Visible item title.                                                                                                                         |
| `note`    | text (trimmed, min 1, max 1000)                                                                                                                                                                                                                                 | yes      | —       | Required explanatory line.                                                                                                                  |
| `meta`    | text (trimmed, min 1, max 500)                                                                                                                                                                                                                                  | yes      | —       | Required metadata line.                                                                                                                     |
| `href`    | text (trimmed, min 1, max 500, pattern `^(?:#[A-Za-z][A-Za-z0-9_-]{0,127}\|https?://[^\s<>]+\|mailto:[^\s<>]+\|tel:\+?[0-9][0-9().-]{0,31}\|sms:\+?[0-9][0-9().,-]{0,63}(?:\?body=[^\s<>]*)?\|(?!(?:[A-Za-z][A-Za-z0-9+.-]*:\|//\|/))[A-Za-z0-9.][^\s<>\\]*)$`) | yes      | —       | Safe same-page, relative, HTTP(S), email, phone (tel:), or text-message (sms:) link target; executable and local-file schemes are rejected. |
| `bucket`  | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`)                                                                                                                                                                                                 | no       | —       | Optional authored initial bucket.                                                                                                           |
| `comment` | true or false                                                                                                                                                                                                                                                   | no       | `false` | Enables one optional comment for this item.                                                                                                 |

### `lead`

One emphasized opening thesis paragraph inside a section.

Forms: container. Children: markdown. Required parent: `section`.

### `legend`

Optional title and policy for the diagram legend; at most one per diagram.

Forms: leaf. Children: none. Required parent: `diagram`.

| Attribute | Values and constraints         | Required | Default | Meaning                                                                        |
| --------- | ------------------------------ | -------- | ------- | ------------------------------------------------------------------------------ |
| `title`   | text (trimmed, min 1, max 160) | no       | —       | Visible legend title.                                                          |
| `auto`    | true or false                  | no       | `true`  | Add the connection kinds the diagram mixes without a legend item of their own. |

### `legend-item`

One legend entry: names a connection kind, a node emphasis, a node status, or a timeline event emphasis in the author's words, or hides a connection kind.

Forms: leaf. Children: none. Required parent: `diagram` or `timeline`.

| Attribute | Values and constraints                    | Required | Default | Meaning                                                                             |
| --------- | ----------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------- |
| `edge`    | `call`, `data`, `event`, `dependency`     | no       | —       | Connection kind this entry names; exclusive with node.                              |
| `node`    | `neutral`, `accent`, `success`, `warning` | no       | —       | Node emphasis this entry names; exclusive with edge and requires a label.           |
| `status`  | `done`, `review`, `returned`, `pending`   | no       | —       | Node status this entry renames in the author's words; exclusive with edge and node. |
| `event`   | `accent`, `success`, `warning`            | no       | —       | Timeline event emphasis this entry names, inside a timeline; requires a label.      |
| `label`   | text (trimmed, min 1, max 160)            | no       | —       | Entry text; a connection kind without one keeps its package name.                   |
| `hidden`  | true or false                             | no       | `false` | Leave this connection kind out of the legend.                                       |

### `mark`

Words in running text marked by hand: underlined, circled or struck through in the accent colour, drawn when they come into view; the jitter comes from a seed, and a section holds at most two marks.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints                      | Required | Default     | Meaning                                                                                                               |
| --------- | ------------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `shape`   | `underline`, `circle`, `strike`             | no       | `underline` | How the words are marked: a hand-drawn underline, a circle around them, or a strike through them.                     |
| `seed`    | integer from 0 to 9999 spelling `^\d{1,4}$` | no       | —           | Seed of the hand-drawn jitter (0–9999); the same seed draws the same line. By default it comes from the marked words. |

### `message`

One message or notification: sender, time, Markdown text and an optional status; alone it is a notification, inside conversation it is one turn.

Forms: container. Children: markdown.

| Attribute      | Values and constraints        | Required | Default | Meaning                                                                                     |
| -------------- | ----------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `from`         | text (trimmed, min 1, max 80) | yes      | —       | Sender as the product names it: a person, an agent, a system.                               |
| `time`         | text (trimmed, min 1, max 40) | no       | —       | When it was sent, as the product shows it, such as 01:17 or yesterday.                      |
| `side`         | `in`, `out`                   | no       | `in`    | in — received, drawn at the start edge; out — sent by the reader, drawn at the end edge.    |
| `status`       | text (trimmed, min 1, max 40) | no       | —       | Delivery or run status shown under the text, such as delivered or done.                     |
| `illustrative` | true or false                 | no       | `false` | Marks the mock as an illustration: its names, times and numbers are examples, not a record. |

### `meta`

A short label in the mono face for identifiers and readings: :meta[run 96 · 01:17].

Forms: text. Children: label-or-generated-label.

### `modal`

Modal dialog opened by a package-owned control.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default       | Meaning                       |
| --------- | ------------------------------ | -------- | ------------- | ----------------------------- |
| `title`   | text (trimmed, min 1, max 200) | yes      | —             | Visible title.                |
| `trigger` | text (trimmed, min 1, max 160) | no       | `Open dialog` | Visible dialog trigger label. |

### `muted`

The quiet continuation of a paragraph in the muted text colour; the sentence before it reads bright: **The run passed.** :muted[Two retries, both on the network step.]

Forms: text. Children: label-or-generated-label.

### `node`

One labelled node in a flow diagram.

Forms: leaf. Children: none. Required parent: `diagram` or `zoom`.

| Attribute | Values and constraints                                          | Required | Default   | Meaning                                                                                                                                                     |
| --------- | --------------------------------------------------------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —         | Unique node identity within the diagram.                                                                                                                    |
| `label`   | text (trimmed, min 1, max 160)                                  | yes      | —         | Visible node label.                                                                                                                                         |
| `detail`  | text (trimmed, min 1, max 160)                                  | no       | —         | Optional second line under the label, set smaller: what the node holds or does.                                                                             |
| `group`   | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | no       | —         | Optional subsystem group identity; nodes without one stand beside the groups.                                                                               |
| `kind`    | `neutral`, `accent`, `success`, `warning`                       | no       | `neutral` | Package-owned node emphasis; a legend item names what it means.                                                                                             |
| `row`     | integer from 1 to 20                                            | no       | —         | Optional one-based flow layer; nodes sharing a row share a layer when their connections allow it.                                                           |
| `status`  | `done`, `review`, `returned`, `pending`                         | no       | —         | Where this step of a process stands: done, review, returned or pending; drawn in the theme status roles with a glyph, named in the legend in package words. |

### `notes`

Speaker notes of a slide: never shown to the audience, shown under the slide in the presenter view (?view=presenter).

Forms: container. Children: markdown. Required parent: `section`.

### `option`

One selectable answer option.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                     |
| --------- | --------------------------------------------------------------- | -------- | ------- | ------------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable option identity within the question. |
| `label`   | text (trimmed, min 1, max 200)                                  | yes      | —       | Visible option label.                       |

### `plural`

A number with its noun in the form the page language requires, settled when the page builds: :plural[5]{forms="file|files"} → 5 files.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints         | Required | Default | Meaning                                                                                                     |
| --------- | ------------------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `forms`   | text (trimmed, min 3, max 200) | yes      | —       | Noun forms separated by \|: English one\|other (file\|files), Russian one\|few\|many (файл\|файла\|файлов). |

### `point`

One labelled numeric value in a chart series.

Forms: leaf. Children: none. Required parent: `series`.

| Attribute | Values and constraints                                                                           | Required | Default | Meaning                                                |
| --------- | ------------------------------------------------------------------------------------------------ | -------- | ------- | ------------------------------------------------------ |
| `label`   | text (trimmed, min 1, max 160)                                                                   | yes      | —       | Category label.                                        |
| `value`   | number from -999999999 to 999999999 step 0.0001 spelling `^-?(?:0\|[1-9]\d{0,8})(?:\.\d{1,4})?$` | yes      | —       | Finite numeric value between -999999999 and 999999999. |

### `popover`

Non-modal contextual panel opened by a package-owned control.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default        | Meaning                        |
| --------- | ------------------------------ | -------- | -------------- | ------------------------------ |
| `title`   | text (trimmed, min 1, max 200) | yes      | —              | Visible title.                 |
| `trigger` | text (trimmed, min 1, max 160) | no       | `Show details` | Visible popover trigger label. |

### `process`

A mini process in a line of text or a card: its steps, separated by ">" in the label, drawn as dots in order with arcs for the returns and their «×N»; the step names and returns are said in words for assistive technology.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints         | Required | Default | Meaning                                                                                                                                   |
| --------- | ------------------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `current` | text (trimmed, min 1, max 80)  | no       | —       | The step the process stands at, in review; the steps before it are done and the ones after it not started. Without it every step is done. |
| `returns` | text (trimmed, min 3, max 400) | no       | —       | Returns drawn as arcs over the steps, separated by commas, each "step>earlier step×N"; a step returning to itself repeats.                |

### `question`

One typed question inside a response workspace.

Forms: container. Children: response-field-directives. Required parent: `response`.

| Attribute | Values and constraints                                                                           | Required | Default | Meaning                                            |
| --------- | ------------------------------------------------------------------------------------------------ | -------- | ------- | -------------------------------------------------- |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`)                                  | yes      | —       | Stable question identity within the response form. |
| `kind`    | `bucket`, `item-single`, `item-multi`, `single`, `order`, `number`, `text`                       | yes      | —       | Structured answer kind.                            |
| `title`   | text (trimmed, min 1, max 200)                                                                   | yes      | —       | Visible title.                                     |
| `prompt`  | text (trimmed, min 1, max 500)                                                                   | no       | —       | Optional reader instruction.                       |
| `min`     | number from -999999999 to 999999999 step 0.0001 spelling `^-?(?:0\|[1-9]\d{0,8})(?:\.\d{1,4})?$` | no       | —       | Required minimum for number questions.             |
| `max`     | number from -999999999 to 999999999 step 0.0001 spelling `^-?(?:0\|[1-9]\d{0,8})(?:\.\d{1,4})?$` | no       | —       | Required maximum for number questions.             |
| `step`    | number from -999999999 to 999999999 step 0.0001 spelling `^-?(?:0\|[1-9]\d{0,8})(?:\.\d{1,4})?$` | no       | —       | Optional positive increment for number questions.  |

### `response`

Local structured reader-response workspace with deterministic export.

Forms: container. Children: response-question-directives.

| Attribute | Values and constraints                                          | Required | Default | Meaning                        |
| --------- | --------------------------------------------------------------- | -------- | ------- | ------------------------------ |
| `title`   | text (trimmed, min 1, max 200)                                  | yes      | —       | Visible title.                 |
| `id`      | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Stable response form identity. |

### `section`

Labelled top-level page section containing Markdown.

Forms: container. Children: markdown. Top-level only.

| Attribute          | Values and constraints                                                                             | Required | Default     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | text (trimmed, min 1, max 200)                                                                     | yes      | —           | Visible title.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `id`               | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`)                                    | no       | —           | Optional stable section anchor.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `nav`              | text (trimmed, min 1, max 160)                                                                     | no       | —           | Optional short primary-navigation label.                                                                                                                                                                                                                                                                                                                                                                                              |
| `recipe`           | `none`, `hero`, `evidence`, `story`, `rail`, `metrics`, `thesis`, `statement`, `blueprint`, `demo` | no       | `none`      | High-level package-owned section composition; explicit detailed attributes override its roles.                                                                                                                                                                                                                                                                                                                                        |
| `place`            | `flow`, `opening`                                                                                  | no       | `flow`      | Where the section stands: in the flow of the page, or as the first screen beside the page title (only the first section).                                                                                                                                                                                                                                                                                                             |
| `width`            | `reading`, `standard`, `wide`                                                                      | no       | `standard`  | Section content track.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `align`            | `start`, `center`                                                                                  | no       | `start`     | Section content alignment.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tone`             | `plain`, `soft`, `accent`, `contrast`                                                              | no       | `plain`     | Package-owned section surface tone.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `composition`      | `flow`, `stage`, `split`, `mosaic`, `story`, `stack`                                               | no       | `flow`      | Semantic arrangement for the section content; authored reading order is unchanged.                                                                                                                                                                                                                                                                                                                                                    |
| `viewport`         | `adaptive`, `full`, `bounded`                                                                      | no       | `adaptive`  | Bounded use of the available viewport without changing document order.                                                                                                                                                                                                                                                                                                                                                                |
| `section-density`  | `compact`, `editorial`, `immersive`                                                                | no       | `editorial` | Section-local content rhythm independent of the page density token.                                                                                                                                                                                                                                                                                                                                                                   |
| `type`             | `body`, `display`, `editorial`                                                                     | no       | `body`      | Section-local typography role.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `media`            | `natural`, `mask`, `layers`, `gallery`, `bleed`                                                    | no       | `natural`   | Art direction for confined local images inside the section.                                                                                                                                                                                                                                                                                                                                                                           |
| `media-fit`        | `natural`, `contain`, `cover`                                                                      | no       | `natural`   | Section-local object fitting for confined images.                                                                                                                                                                                                                                                                                                                                                                                     |
| `media-aspect`     | `natural`, `landscape`, `cinematic`, `portrait`, `square`                                          | no       | `natural`   | Section-local aspect ratio for confined images.                                                                                                                                                                                                                                                                                                                                                                                       |
| `focal`            | `center`, `top`, `right`, `bottom`, `left`                                                         | no       | `center`    | Package-owned object position for cropped local media.                                                                                                                                                                                                                                                                                                                                                                                |
| `surface`          | `plain`, `tint`, `grain`, `grid`, `blueprint`                                                      | no       | `plain`     | Package-owned band behind the section: none, a one-colour tint, a fine grain, a drafting grid, or a blueprint grid with major and minor lines in the accent colour.                                                                                                                                                                                                                                                                   |
| `frame`            | `none`, `panel`, `browser`                                                                         | no       | `none`      | Section edge: a full-width band with no border, or a bordered rounded panel. browser puts the first picture of the section in a browser window whose bar shows the real address (address) or, for a mock-up, the label Illustration (illustration="true").                                                                                                                                                                            |
| `address`          | text (trimmed, min 1, max 300, format `absolute-http-url`)                                         | no       | —           | The real address of the page in the picture, shown in the bar of frame="browser": an absolute http or https URL.                                                                                                                                                                                                                                                                                                                      |
| `illustration`     | true or false                                                                                      | no       | `false`     | The picture in frame="browser" is a mock-up, not a real page: its bar says Illustration.                                                                                                                                                                                                                                                                                                                                              |
| `transition`       | `none`, `reveal`, `stagger`, `lines`, `log`, `clip`, `staged`                                      | no       | `none`      | Bounded package-owned entrance treatment: one section reveal, children in turn, the section title line by line, or log: every code block of the section prints line by line like a log, with its whole text in the page from the start; clip opens the chapter from its lower edge; staged, on the first screen (place="opening") only, brings in the page title by lines, then the eyebrow, the subtitle, the actions and the scene. |
| `scene`            | `none`, `progress`, `sticky`, `steps`, `scrub`                                                     | no       | `none`      | Content-driven scroll scene without changing document order; steps pins the section media while its beats scroll past and switches the picture, the lit part of the diagram or the lit code lines with each beat; scrub pins the media for one screen per beat (two to four) and plays the beats as a timeline of the scroll.                                                                                                         |
| `slide-transition` | `fade`, `push`, `wipe`, `zoom`, `none`                                                             | no       | `fade`      | How this slide arrives in a presentation (layout slides): a fade, a push, a wipe, a zoom, or at once; the duration is fixed and published.                                                                                                                                                                                                                                                                                            |
| `interaction`      | `none`, `depth`, `tilt`                                                                            | no       | `none`      | Fine-pointer-only media interaction.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `choreography`     | `none`, `cascade`                                                                                  | no       | `none`      | Semantic ordered emphasis for metrics and visualizations.                                                                                                                                                                                                                                                                                                                                                                             |
| `reveal`           | true or false                                                                                      | no       | `false`     | Enables one package-owned one-time section reveal in the normal-motion profile.                                                                                                                                                                                                                                                                                                                                                       |
| `state`            | text (trimmed, min 1, max 41, pattern `^[a-z][a-z0-9-]{0,40}$`)                                    | no       | —           | Page state set while the reader has reached this section (its top passed the middle of the screen) and cleared when they scroll back above it; blocks with the same when light.                                                                                                                                                                                                                                                       |

Incompatible combinations:

- `composition` is `mosaic` or `stack`; `media` is `layers` or `gallery`: section composition mosaic or stack cannot be combined with layered or gallery media. Use composition flow, stage, split, or story with layered/gallery media, or use natural, mask, or bleed media with mosaic/stack composition.
- `media` is `layers`; `interaction` is `depth` or `tilt`: Layered media cannot also own a pointer transform. Use interaction="none" with layered media or another media treatment.
- `scene` is `progress`; `interaction` is `depth` or `tilt`: A progress scene and pointer interaction cannot transform the same media. Use either scene="progress" or a depth/tilt interaction.
- `composition` is `story` or `stack`; `scene` is `sticky`: Story and stack compositions already own sticky positioning. Use scene="none|progress" or a flow, stage, split, or mosaic composition.
- `composition` is `story` or `stack` or `mosaic`; `scene` is `steps` or `scrub`: A steps or scrub scene arranges its own media and beats. Use composition="flow" with scene="steps" or scene="scrub".
- `scene` is `steps` or `scrub`; `interaction` is `depth` or `tilt`: A pinned scene and pointer interaction cannot move the same media. Use interaction="none" with scene="steps" or scene="scrub".

### `series`

One named chart series containing data points.

Forms: container. Children: point-directives. Required parent: `chart`.

| Attribute | Values and constraints         | Required | Default | Meaning       |
| --------- | ------------------------------ | -------- | ------- | ------------- |
| `label`   | text (trimmed, min 1, max 160) | yes      | —       | Legend label. |

### `source-line`

The source line under the block before it — which data or footage, how many records, taken when: ::source-line[Moira export of run 96, 212 records]{date="2026-09-25"}.

Forms: leaf. Children: label-or-generated-label.

| Attribute | Values and constraints                                                   | Required | Default | Meaning                                                                                 |
| --------- | ------------------------------------------------------------------------ | -------- | ------- | --------------------------------------------------------------------------------------- |
| `date`    | text (trimmed, min 1, max 32)                                            | no       | —       | When the data or footage was taken: 2026-09-25, or 2026-09-25T01:17 together with zone. |
| `zone`    | text (trimmed, min 1, max 64, pattern `^[A-Za-z][A-Za-z0-9_+/-]{0,63}$`) | no       | —       | IANA time zone of a date with a time, such as Europe/Moscow.                            |

### `source-link`

Source location opened through an explicit IPv4 loopback editor helper without replacing the report page.

Forms: text. Children: none.

| Attribute | Values and constraints                                                                                                                                                                                                 | Required | Default | Meaning                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------- |
| `label`   | text (trimmed, min 1, max 160)                                                                                                                                                                                         | yes      | —       | Short visible source path and line.                                             |
| `href`    | text (trimmed, min 1, max 1000, pattern `^http://127\.0\.0\.1:(?:[1-9][0-9]{0,3}\|[1-5][0-9]{4}\|6[0-4][0-9]{3}\|65[0-4][0-9]{2}\|655[0-2][0-9]\|6553[0-5])/open\?path=(?:%2[Ff]\|/)[^\s<>&#]+&line=[1-9][0-9]{0,8}$`) | yes      | —       | IPv4 loopback editor-helper URL with an absolute path and positive source line. |

### `spotlight`

One screenshot with a loupe over one detail: the detail enlarged in place, the rest of the picture dimmed, and the explanation beside it.

Forms: container. Children: markdown.

| Attribute | Values and constraints                           | Required | Default | Meaning                                                                                    |
| --------- | ------------------------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------ |
| `title`   | text (trimmed, min 1, max 200)                   | no       | —       | Visible title.                                                                             |
| `x`       | integer from 0 to 100 spelling `^\d{1,3}$`       | yes      | —       | Horizontal position of the detail, in per cent of the picture width from the left (0–100). |
| `y`       | integer from 0 to 100 spelling `^\d{1,3}$`       | yes      | —       | Vertical position of the detail, in per cent of the picture height from the top (0–100).   |
| `zoom`    | number from 1.5 to 4 spelling `^[1-4](?:\.\d)?$` | no       | `2`     | How many times the loupe enlarges the detail (1.5–4).                                      |

### `steps`

Process or tutorial sequence containing Markdown, normally an ordered list.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default | Meaning        |
| --------- | ------------------------------ | -------- | ------- | -------------- |
| `title`   | text (trimmed, min 1, max 200) | no       | —       | Visible title. |

### `swap`

A word in running text that swaps on a beat to up to three other words and returns to the written one within five seconds; the widest word reserves the width, so the line never moves.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints         | Required | Default | Meaning                                                                                      |
| --------- | ------------------------------ | -------- | ------- | -------------------------------------------------------------------------------------------- |
| `words`   | text (trimmed, min 1, max 160) | yes      | —       | The other words, separated by commas (one to three); the written label comes first and last. |

### `tab`

One labelled panel inside tabs.

Forms: container. Children: markdown. Required parent: `tabs`.

| Attribute | Values and constraints         | Required | Default | Meaning            |
| --------- | ------------------------------ | -------- | ------- | ------------------ |
| `label`   | text (trimmed, min 1, max 160) | yes      | —       | Visible tab label. |

### `tabs`

Keyboard-operable group of tab panels.

Forms: container. Children: markdown-and-tab-directives.

| Attribute     | Values and constraints         | Required | Default      | Meaning                                                                                                                                                                                                   |
| ------------- | ------------------------------ | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | text (trimmed, min 1, max 200) | no       | —            | Visible title.                                                                                                                                                                                            |
| `orientation` | `horizontal`, `vertical`       | no       | `horizontal` | horizontal: the tab list above the panels. vertical: on a wide screen the tab list stands in a column beside the panels (arrow keys up and down move along it); on a narrow screen it returns above them. |

### `term`

Inline or standalone reference that opens a registered glossary explanation. Prose must carry one for the first occurrence of a registered term in each section; later occurrences of that term in the same section stay ordinary prose.

Forms: leaf, text. Children: label-or-generated-label.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                      |
| --------- | --------------------------------------------------------------- | -------- | ------- | -------------------------------------------- |
| `key`     | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Key of the glossary definition to reference. |

### `time`

A date or a moment written in the page language and, for a time, in a declared time zone, settled when the page builds: :time[2026-09-25T01:17]{zone="Europe/Moscow"}.

Forms: text. Children: label-or-generated-label.

| Attribute | Values and constraints                                                   | Required | Default | Meaning                                                                                                        |
| --------- | ------------------------------------------------------------------------ | -------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `zone`    | text (trimmed, min 1, max 64, pattern `^[A-Za-z][A-Za-z0-9_+/-]{0,63}$`) | no       | —       | IANA time zone the time is shown in and named by, such as Europe/Moscow; required when the value has a time.   |
| `show`    | `auto`, `date`, `time`, `datetime`                                       | no       | `auto`  | What of the moment the page writes: auto (the date, and the time when one is written), date, time or datetime. |

### `timeline`

Semantic chronological sequence with bounded events.

Forms: container. Children: event-directives.

| Attribute     | Values and constraints         | Required | Default | Meaning                                           |
| ------------- | ------------------------------ | -------- | ------- | ------------------------------------------------- |
| `title`       | text (trimmed, min 1, max 200) | yes      | —       | Visible title.                                    |
| `description` | text (trimmed, min 1, max 300) | yes      | —       | Meaningful plain-text description for the visual. |

### `toggle`

Switch controlling visibility of declarative content.

Forms: container. Children: markdown.

| Attribute | Values and constraints         | Required | Default | Meaning               |
| --------- | ------------------------------ | -------- | ------- | --------------------- |
| `title`   | text (trimmed, min 1, max 200) | no       | —       | Visible title.        |
| `label`   | text (trimmed, min 1, max 160) | yes      | —       | Visible switch label. |
| `default` | `off`, `on`                    | no       | `off`   | Initial switch state. |

### `typing`

A short line in running text typed in place, character by character, when it comes into view; the whole line is in the page from the start and holds its width, so nothing moves.

Forms: text. Children: label-or-generated-label.

### `video`

Embedded local video (webm, mp4, m4v, or ogv) as a looping muted clip, a background with a pause control, or a manually started video with sound; directory output ships every source for the browser to choose from, one file ships the most compatible.

Forms: leaf. Children: none.

| Attribute  | Values and constraints                                       | Required | Default | Meaning                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------ | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`      | text (trimmed, min 1, max 200, format `relative-local-path`) | yes      | —       | Relative local video path: .webm, .mp4, .m4v, or .ogv. Give the most compatible encoding (H.264 MP4) here.                                                                                                                        |
| `sources`  | text (trimmed, min 1, max 600)                               | no       | —       | Further encodings of the same video, separated by commas, in order of preference (for example AV1 and VP9 from agentic-screencast web); directory output offers all of them before src, one file embeds only the most compatible. |
| `mode`     | `clip`, `background`, `manual`                               | no       | `clip`  | clip: muted, looping, plays while visible, with controls. background: muted and looping without controls, with a pause button; a poster is required. manual: starts only when the reader presses play, with sound.                |
| `chapters` | text (trimmed, min 1, max 200, format `relative-local-path`) | no       | —       | Relative WebVTT chapters file (.vtt), such as the one agentic-screencast web writes; the chapters appear as buttons under the video that jump to each chapter.                                                                    |
| `poster`   | text (trimmed, min 1, max 200, format `relative-local-path`) | no       | —       | Relative local image shown before playback and in print: .png, .jpg, .jpeg, .webp, .gif, or .avif.                                                                                                                                |
| `caption`  | text (trimmed, min 1, max 300)                               | no       | —       | Visible caption under the video; it also names the video for assistive technology.                                                                                                                                                |
| `start`    | number from 0 to 3600 spelling `^\d{1,4}(?:\.\d{1,2})?$`     | no       | —       | Second of the recording where a looping clip or background starts and every loop returns (0–3600, up to two decimals): the useful part of a recording without re-encoding it.                                                     |
| `seam`     | `cut`, `fade`                                                | no       | `cut`   | How a looping clip or background joins its end to its start: cut jumps back at once, fade dims the last half-second and brightens the first, so the loop has no visible jump.                                                     |
| `expand`   | true or false                                                | no       | `false` | Adds an Expand button to a clip that opens it large in a dialog with the full player controls and sound.                                                                                                                          |

### `zoom`

The inside of one node of a flow diagram, written as its own small flow: while the diagram is pinned on screen the camera flies into that node and the nested flow grows readable in its place.

Forms: container. Children: zoom-part-directives. Required parent: `diagram`.

| Attribute | Values and constraints                                          | Required | Default | Meaning                                                             |
| --------- | --------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `node`    | text (trimmed, min 1, max 64, pattern `^[a-z][a-z0-9-]{0,63}$`) | yes      | —       | Identity of the node of the enclosing diagram that this flow opens. |
| `title`   | text (trimmed, min 1, max 200)                                  | yes      | —       | Title of the nested flow.                                           |

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
  "schema": "Return manifest, directive, complete source, or theme JSON Schema.",
  "examples": "List packaged buildable examples and the reference extensions shipped beside them.",
  "sitemap": "Write sitemap.xml and robots.txt for a published tree of pages built with a public URL.",
  "snapshot": "Build a page and photograph it at several widths, in both schemes, with and without motion, with a contact sheet; with --measure, measure it instead of photographing.",
  "effect-check": "Build the examples of an effect extension and run the eleven effect checks in Chromium, reporting N of M checks passed."
}
```

## Capabilities

```json
{
  "init": "Initialize a packaged declarative starter without overwriting user content.",
  "validate": "Validate a project through the production preparation pipeline.",
  "inspect": "Inspect a valid project through the production preparation pipeline.",
  "review": "Resolve a versioned review artifact to current Markdown source locations."
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
- {"subject":"video/loop","rules":[{"id":"loop-only-start-and-seam","dependsOn":[]},{"id":"expand-on-clip","dependsOn":[]}]}
- {"subject":"directive-node","rules":[{"id":"registered-name","dependsOn":[]},{"id":"no-prototype-like-attributes","dependsOn":[]},{"id":"declared-form","dependsOn":["registered-name"]},{"id":"declared-placement","dependsOn":["registered-name"]},{"id":"declared-children","dependsOn":["registered-name"]},{"id":"interpreted-attributes","dependsOn":["registered-name","no-prototype-like-attributes"]},{"id":"action-label","dependsOn":["registered-name"]},{"id":"compatible-attribute-combination","dependsOn":["interpreted-attributes"]},{"id":"section-identity","dependsOn":["interpreted-attributes"]},{"id":"appendix-glossary-placement","dependsOn":["interpreted-attributes"]},{"id":"unique-glossary-identity","dependsOn":["interpreted-attributes"]},{"id":"declared-glossary-forms","dependsOn":["interpreted-attributes","unique-glossary-identity"]}]}
- {"subject":"code-fence/terms","rules":[{"id":"known-keys","dependsOn":[]},{"id":"locatable-terms","dependsOn":["known-keys"]},{"id":"no-overlap","dependsOn":["known-keys","locatable-terms"]}]}
- {"subject":"prose-container/glossary","rules":[{"id":"first-occurrence-marked","dependsOn":[]}]}

## Safety boundary

- canonical source-root confinement
- local resources only
- sanitized Markdown HTML
- no author code or template execution
