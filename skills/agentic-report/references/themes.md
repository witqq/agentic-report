# Make a theme of your own

A built-in theme is a starting point, not the answer. When the brief's art direction names a look none of
the eleven themes has, write a theme before you build the page. A theme is data: the build checks it field by
field, checks its contrast, and points at the line of a wrong field. `agentic-report schema --scope theme`
returns the complete schema; this file says how to decide what goes in it.

## Start from the closest theme

Each built-in theme is a voice: its own display face over its own text face and code face, with its own
weight, tracking and letter case for display headings, a signal accent and a quiet second one, and code
colours for both schemes. Eight of them started as the themes of agentic-screencast; `neutral` and `frost` were added as themes without
the fashionable clichés. The page themes have since been cleaned (one signal accent, lighter display weights, no
Tailwind indigo, no scanlines or glow), and the film themes have not caught up yet, so the same name can still give
a page and a film different looks.

| Built-in     | Type (display / text / code)                      | Character                                                      | Extend it for                                | Do not take it for                                                    |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `neutral`    | Literata 600 / Onest / Martian Mono               | Grey paper, ink, one ochre accent; warm graphite dark; default | Reports, product pages, landings, docs       | A page whose subject asks for a strong mood                           |
| `frost`      | Onest 600 / IBM Plex Sans / Geist Mono            | Stone and graphite; colour only in statuses                    | Dashboards, status pages, technical products | Pages that need a colourful brand                                     |
| `calm-paper` | Playfair 600 / Literata / PT Mono                 | Warm paper, clay accent, numbered contents                     | Reports, guides, answers, decisions          | A product landing: cream, a serif and terracotta is the 2026 cliché   |
| `daylight`   | Onest 680 / Golos Text / Geist Mono               | Bright cool page, cobalt and petrol                            | Product documentation, tutorials, briefs     | Pages that need a voice of their own; it is deliberately quiet        |
| `midnight`   | Geologica 680 / IBM Plex Sans / JetBrains Mono    | Night blue, one blue signal, steel eyebrows, ruled cards       | Engineering stories, code reviews, decks     | A grid of dark feature cards: it becomes the Linear-style dark cliché |
| `noir`       | Cormorant Garamond capital title / Jost / PT Mono | Black and bone, amber, image-first                             | Cinematic stories, portfolios, showcases     | Next to particles or star dust: capitals there read as a template     |
| `aurora`     | Raleway 400 / Commissioner / Victor Mono          | Deep blue, one mint signal, sand eyebrows, calm                | Research, science, motion showcases          | Glows and background effects: together they are the "aurora" cliché   |
| `blueprint`  | Tektur 700 / Fira Sans / Martian Mono             | Drafting blue, cyan and yellow, a faint grid                   | Architecture, dashboards, technical specs    | Dark scheme as a landing default: cyan on navy nears "dark + neon"    |
| `ember`      | Oswald capital title / Rubik / JetBrains Mono     | Ember black, one orange signal, warm grey eyebrows             | Launches, incidents, announcements           | A product landing with particles: capitals there read as a template   |
| `synthwave`  | Unbounded 700 / Exo 2 / JetBrains Mono            | Violet night, magenta and cyan                                 | Games and music only                         | Any product or report page: it is the synthwave cliché by design      |
| `terminal`   | Martian Mono / JetBrains Mono / JetBrains Mono    | Graphite console: prompt, finite cursor, brackets; dark        | Developer tools, CLI products                | Acid green and phosphor glow: leave `scanlines` and `glow` off        |

Every theme draws a light and a dark scheme except `terminal`; a dark-looking theme such as `midnight` has
a matching light scheme with the same accents. `extends` names the theme; everything you leave out,
including that theme's signature details, is inherited. Change only what the page needs: a theme with three
fields is easier to judge than one with thirty:

```yaml
theme:
  extends: blueprint
  name: field-report
  accent: coral
  width: narrow
```

## Scheme and switchers

Leave `scheme: system` unless the page is meant for one setting. The scheme button ships by default
(`schemeToggle: false` removes it); the theme selector is off by default (`themeSwitcher: true` adds it) and
belongs on pages whose subject is the look itself.

## Decide in this order

1. **Accent.** One family for action and emphasis (`DR-ONE-ACCENT`); the second accent is a quiet neutral for
   eyebrows, not a second signal. The restrained `graphite`, `cobalt`, `rust`, `moss`, `ochre`, `ink` suit
   most pages; `indigo`, `teal`, `coral` only when the subject is loud by nature. Take it from the product's
   own colour when there is one. Never the default palette of a CSS framework: Tailwind indigo-500 and
   violet, slate neutrals and its stock chart colours are what an averaging generator produces — a renamed
   copy of them is the same palette. Paper or bone, ink and one warm accent is a safe start; the dark scheme
   is a warm graphite, not a night blue.
2. **Type.** `fonts.pair` takes the whole type trio of a built-in theme — `midnight`, `calm-paper`,
   `synthwave`, `noir`, `aurora`, `daylight`, `ember`, `blueprint`, `terminal`, `neutral`, `frost` — or
   `system`. Name a single
   role (`fonts.heading`, `fonts.body`, `fonts.mono`) to refine it; every embedded family carries Cyrillic.
   `typography.displayWeight`, `headingTracking` and `displayCase` (`none` or `uppercase`) set the display
   voice: capitals want positive tracking (`noir` uses 0.08em). Capitals set only the page title and
   display statements — chapter titles stay as written, because capitals on every chapter read as a
   template. Display weight: a light 300–400 suits a large Latin title; Cyrillic is never heavier than
   600–720, and the package caps it at 720 on Russian pages whatever you write. With an expressive serif
   display, set labels and meta lines in the mono face. `typography.displayScale` sets how large
   display titles are; a wide display face — spaced capitals, a wide sans, a monospace — usually looks
   better below 1 (`noir` 0.8, `synthwave` and `terminal` 0.78). Word fit needs no setting: the package
   knows the letter width of every embedded face and caps a title so its longest word fits the column, and
   never breaks or hyphenates a word in a heading. `typography.headingMeasure` (8–40, in `ch`) sets the
   longest line of the page title and of display and editorial section titles; left out, each keeps the
   package measure (the reading measure for a report title, 10–17ch for landing, first-screen and display
   titles), so set it only when the look wants a one-line title (a larger
   value) or a stacked one (a smaller value). `literata` and `playfair` carry an optical-size axis and adapt
   their drawing to the size by themselves: open at body size, finer and tighter as a display. `geist` is a
   neutral grotesque that pairs with `geist-mono`. `typography.captions: italic` sets figure captions and
   `source-line` text in the heading face in italics — the serif italic caption of an editorial page when
   the heading face is a serif; `plain` (the default) keeps them in the text face. The embedded faces have
   no italic drawing, so the browser slants the upright: take it for a serif heading face only.
3. **Density and width.** `spacing.density` `compact` for dashboards, `spacious` for stories; `width`
   `narrow` for essays, `wide` for data.
4. **Shape.** `radius` `sharp` for technical subjects, `round` for consumer products; `elevation` `flat`
   when the theme draws rules instead of shadows. `radii.control`, `radii.card` and `radii.media` pick a
   step of that scale per role (`none`, `small`, `medium`, `large`; defaults `small`, `medium`, `medium`):
   square controls with soft cards reads engineered, square media in a round theme keeps photographs from
   looking like stickers. Do not make every role the same step — equal corners everywhere is a cliché.
5. **Motion character.** `motion.easing` `standard`, `gentle`, or `decisive`; `motion.pace` `brisk`,
   `calm`, or `slow`. A calm product and a slow pace agree; a developer tool and a decisive, brisk pace
   agree.
6. **Shell.** `chrome.*` and `ornaments.*` for the signature: a numbered navigation, a side rule on section
   titles, a prompt before the title, `ornaments.console: on` for console brackets and dashed rules,
   `chrome.edges: mono` for monospace captions along the screen edges of a technical product. One
   signature detail is character; four are a costume. `ornaments.scanlines` and `ornaments.glow` exist, but
   a texture over the text and a phosphor glow are the "dark + neon" cliché — leave them off unless the page
   is a retro piece on purpose.
7. **Colours last.** Set `colors.light` and `colors.dark` roles only when the accent family and the
   inherited palette do not give the look. Write `palette` in words: which colours and why. The status roles
   `statusDone`, `statusReview` and `statusReturned` colour every status on the page at once — success and
   warning callouts, card states `good`, `watch`, `risk`, finding severities, diff lines, diagram nodes,
   invalid fields. Left out, each follows its series (`chart2`, `chart4`, `chart3`); set them when the
   series colours are chosen for charts and the statuses need their own. The build refuses a status below
   3:1 against the background and the surface, and each status must keep its one meaning
   (`DR-SIGNAL-COLOUR`).

## A theme from brand colours

When the product has its own colours, let the package place them instead of guessing a hex that passes
contrast:

```sh
npx --yes agentic-report@0.18.1 theme --colors "#0b5fff,#ff7a00" --extends neutral --output ./my-page/brand-theme.yaml
```

`--colors` takes one or two colours written `#rgb` or `#rrggbb`. The first becomes the accent family —
`accent`, `accentStrong` for links, `accentSoft` for accent sections, `focus` and `chart1`; the second, if
given, becomes `accent2` for eyebrows. `chart2`–`chart4` stay with the parent theme because they also mean
success, danger and warning. For each scheme the parent draws, the command moves a colour's OKLCH lightness,
keeping its hue and as much chroma as fits, until every contrast pair the build checks passes, and moves it
no further than that: a colour that already passes stays exactly as given. `--extends` names the built-in
theme to start from (the default theme when absent); `--output` names an absent `.yaml`, `.yml` or `.json`
file, `brand-theme.yaml` by default, and an existing file is refused. The result record lists every role
with the value written, the colour it came from, and its `lightnessShift` and `hueShift`. A colour that no
lightness can make pass is refused with `THEME_BRAND_CONTRAST`, naming the pair. The command cannot read a
logo: the package carries no image decoder, so take the colours from the brand guide or the logo file
yourself.

Then point the page at the file (`theme: brand-theme.yaml`), or extend it from a theme of your own and keep
deciding type, density and shell as above. Read the result record before you build: a large
`lightnessShift` means the page shows a darker or lighter colour than the brand, so say so to the person.

Do not use it when the brief asks for a restrained page and the brand colour is loud (a saturated yellow or
magenta): an accent family such as `ochre` or `coral` near the brand reads better than the brand colour
darkened into olive. Do not pass a second colour just because the brand guide lists one: the second accent
is a quiet eyebrow colour, and two loud colours break the one-accent rule (`DR-ONE-ACCENT`).

## Tokens: what a theme gives the page

A theme becomes CSS variables on the page root, grouped as colour, status, series, code, type, space, width,
radius, control, elevation, motion, backdrop and ornament. `agentic-report schema --scope theme` lists them
under `x-agentic-report-tokens`, each with the theme field it comes from. Everything that draws the page —
the package styles and declared extensions — reads only
these tokens and never names a colour or a typeface of its own: a new meaning becomes a theme role and passes
the contrast check, like the status roles did.

## Keep it honest

- Keep `headingTracking` at −0.03 or looser (`DR-TIGHT-TRACKING`); Cyrillic never goes tighter than −0.025
  whatever you write.
- Draw both schemes (`scheme: both`) unless the page is always seen in the dark. A theme extending
  `terminal` inherits its dark-only scheme; set `scheme: both` and both colour sets to change that.
- Never use a backdrop to decorate content (`DR-BLOBS`); `backdrop` `dots`, `grid`, or `tint` is a quiet
  paper texture, `none` is often best. `grain` lays a faint noise in the text colour over the whole page;
  take it only under large fills beside real material — a photograph, a scan, a printed object — never as
  the page's idea.
- Write `description`: one sentence saying what kind of page the theme is for. The next agent picks themes
  by it.
- No glow, no scanlines, no neon on black, no cream with terracotta for a product page: each is a look the
  reader has already seen on a thousand generated sites (`art-direction.md`, clichés).
- A display face made only for large sizes (Cormorant Garamond) sets the page and chapter titles; smaller
  headings and timeline event titles fall back to the text face, where its thin strokes would clog.
- The `glass` top bar blurs what scrolls under it only to keep the bar readable; `ledger` is solid.

## Measured references

Real product sites, measured in September 2026, as a sense of scale — not something to copy. Most set the
display light and large and keep colour for one accent or for statuses only; the dark ones use a near-black
graphite rather than a night blue. A dash marks a value that was not measured.

| Site      | Display                                                           | Page background      | Colour                                                |
| --------- | ----------------------------------------------------------------- | -------------------- | ----------------------------------------------------- |
| Linear    | Inter Variable 64 px, weight 510, tracking −1.4 px; Berkeley Mono | `rgb(8, 9, 10)`      | Colour only in statuses                               |
| Vercel    | Geist 64 px, tracking −3.84 px                                    | `rgb(250, 250, 250)` | Black and white, one symbol                           |
| Stripe    | Söhne 44 px, weight 300                                           | white                | A gradient ribbon (its own cliché now)                |
| Temporal  | Aeonik 68 px, weight 300                                          | `rgb(20, 20, 20)`    | A synthwave grid: the part not to copy                |
| Resend    | Domaine 96 px, weight 400                                         | black                | A serif on black instead of a grotesque               |
| Cursor    | Cursor Gothic 26 px                                               | `rgb(247, 247, 244)` | The interface over a painting                         |
| Raycast   | Inter 64 px, weight 600                                           | —                    | One red light through the page                        |
| Warp      | Matter Mono 56 px                                                 | —                    | One blue; drawing language, numbered sections         |
| Anthropic | a sans 61 px with a serif                                         | `rgb(250, 249, 245)` | Cream and terracotta: the look not to copy            |
| Framer    | GT Walsheim 54 px, tracking −2.16 px                              | —                    | Neon around the prompt: the part not to copy          |
| Clerk     | Geist 64 px, weight 700                                           | —                    | Dark bento cards: the part not to copy                |
| n8n       | Geomanist                                                         | `rgb(14, 9, 24)`     | A violet night: the part not to copy                  |
| Igloo Inc | a monospace readout over the scene                                | —                    | Two inks, `#b6bac5` and `#383e4e`, one ice material   |
| Hubtown   | a vertical contents beside the title                              | `rgb(2, 10, 24)`     | Night blue with sci-fi controls: the part not to copy |

Sources: [Linear](https://linear.app), [Vercel](https://vercel.com), [Stripe](https://stripe.com),
[Temporal](https://temporal.io), [Resend](https://resend.com), [Cursor](https://cursor.com),
[Raycast](https://www.raycast.com), [Warp](https://www.warp.dev), [Anthropic](https://www.anthropic.com),
[Framer](https://www.framer.com), [Clerk](https://clerk.com), [n8n](https://n8n.io),
[Igloo Inc](https://www.igloo.inc), [Hubtown](https://hubtown.co.in), measured live by the Moira landing
research on 2026-09-25.

## Example

```yaml
theme:
  extends: calm-paper
  name: field-notes
  description: Long-form field notes from a hardware lab, read on paper-like screens.
  accent: moss
  fonts:
    pair: blueprint
  width: narrow
  radius: sharp
  motion:
    easing: gentle
    pace: slow
  ornaments:
    headingPrefix: '§'
```

Put it in the frontmatter, or in `theme.yaml` beside the page (`theme: theme.yaml`) when several pages
share it. Build once and read the contrast diagnostics: a refused pair names both colours, the ratio, and
the field to change.
