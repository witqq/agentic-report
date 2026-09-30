# Assets, licences, and provenance

Every picture, clip, font, icon and piece of effect code on a page comes from somewhere. Record where, so the
reader can trust it and the next agent can replace or re-shoot it. This is not legal advice: for a
commercial release, show the owner the «Media» table and any doubtful file.

## Three questions before any file goes on the page

1. **What licence does this file carry?** The file's own licence, not the site's: on Wikimedia Commons, in
   museum collections and on CodePen it differs from file to file.
2. **Is attribution required, and where?** For Creative Commons, credit the title, the author, the source and
   the licence, and note what you changed («cropped from the original»).
3. **Is this use allowed?** Non-commercial (NC), no derivatives (ND), share-alike (SA), trademarks, and
   recognisable people are outside most free licences.

If any answer is «I don't know», the file does not go on the page.

## What to use, in order of preference

1. **A screenshot of the real thing,** taken from a build: the product, the page, the terminal. Take it with
   the snapshot command or a browser, at 2× density, and crop it to what the text talks about.
2. **A clip filmed with agentic-screencast** for behaviour that a still cannot show. Keep its protocol path.
3. **A diagram or chart** drawn by the package from the real system or the real numbers.
4. **A photo with a licence** that allows the use: your own, the user's, or one under CC0, CC BY, or the
   Unsplash licence. Record the author and the link.
5. **A drawing or a render made for the page,** such as an SVG explaining a mechanism, a small rendered 3D
   object for an icon (Resend draws its section icons this way), or a stylised render of the page's
   metaphor. Stylisation looks more considered than photorealism. It is the page's own material: record it
   as `drawn`, with the tool and the scene file in `Source`.
6. **A generated picture,** only when nothing real exists, with the reason in the brief, at most one per page
   (`DR-REAL-MATERIAL`). Recognisable «AI art» sets such as DeepMind's «Visualising AI» read as stock.

Never take a picture from a website without its licence, and never use a logo you were not given.

## Where to find files, and what each source allows

| Source                           | Licence                           | Credit                           | Note                                                               |
| -------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Unsplash                         | Unsplash License                  | Appreciated, not required        | No model or property release; Unsplash+ images are paid            |
| Pexels                           | Pexels License                    | Appreciated, not required        | No selling unaltered copies                                        |
| Pixabay                          | Pixabay Content License           | Not required                     | No standalone redistribution, even cropped                         |
| Wikimedia Commons                | Per file                          | Usually required                 | CC BY-SA makes your page share-alike                               |
| The Met Open Access              | CC0 for works marked open access  | Not required                     | Check the object's own page                                        |
| Smithsonian Open Access          | CC0 for items marked CC0          | Not required                     | Includes 3D scans                                                  |
| SMK, National Gallery of Denmark | Public domain works and 3D models | Not required                     | Scan the World and similar collections: check each object          |
| Lucide                           | ISC                               | Licence text beside copied files |                                                                    |
| Heroicons, Tabler, Phosphor      | MIT                               | Licence text beside copied files |                                                                    |
| Material Symbols                 | Apache 2.0                        | Licence text beside copied files |                                                                    |
| Iconify                          | Per icon set                      | Per set                          | A CC BY or CC BY-SA set needs a credit; brand logos are trademarks |
| Google Fonts                     | OFL, Apache, UFL                  | Not required                     | Keep the licence beside the font file                              |
| Fontsource                       | The font's own, usually OFL       | Not required                     | Files for offline use; its API returns each font's licence         |
| Fontshare                        | ITF Free Font License             | Not required                     | Use allowed, redistribution forbidden: do not commit it            |

Emoji are not icons on a page ([`art-direction.md`](art-direction.md), clichés).

## Licences of code and effects

The package does not take your code, but the look of an effect often starts from someone else's demo.
Take ideas freely; take code only when it is your own or under MIT, Apache 2.0 or the Unlicense, and keep
its licence notice.

| Source                    | What its licence allows                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadertoy                 | CC BY-NC-SA 3.0 by default: no commercial use, share-alike. Take the idea and write the maths yourself                                                                |
| Codrops demos             | MIT «unless stated otherwise», with the notice; fonts, images and icons in a demo keep their own licences; a repository without a licence file is all rights reserved |
| Paper Shaders             | Check the licence of the exact version you take                                                                                                                       |
| Unicorn Studio            | The effect's code belongs to the service; do not copy it                                                                                                              |
| CodePen                   | Public pens are MIT with the author's copyright; private pens have no licence                                                                                         |
| pmndrs/postprocessing     | Zlib                                                                                                                                                                  |
| OGL                       | Unlicense                                                                                                                                                             |
| three.js and its examples | MIT for the code; models, textures and fonts in its examples may be under Creative Commons                                                                            |

Sites such as Linear, Apple, Zed or shader.se are references for technique only: their code is not
licensed for reuse.

## Provenance in `brief.md`

Every exemplar and every page you hand over carries a «Media» section in its `brief.md`, one row per file
under `assets/`:

```markdown
## Media

| File                   | Origin           | Source                                          | Licence  |
| ---------------------- | ---------------- | ----------------------------------------------- | -------- |
| `assets/editor.png`    | build-screenshot | `agentic-report build examples/document`, 2×    | project  |
| `assets/demo.h264.mp4` | screencast       | agentic-screencast run `ar-u8-742ad97e`         | project  |
| `assets/harbour.jpg`   | photo            | https://unsplash.com/photos/…, by A. Author     | Unsplash |
| `assets/pipeline.svg`  | drawn            | drawn for this page                             | project  |
| `assets/texture.png`   | generated        | reason: no real material shows an abstract idea | project  |
```

`Origin` is one of `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder`, `generated`. A
`placeholder` stands in for real material that exists but is not in hand yet; the page labels it as a
placeholder and the brief lists the real file as an unresolved fact. A `generated` row says its reason in
`Source`.

## Privacy in media

A screenshot or a clip carries everything that was on the screen. Before it goes on the page, crop or cover
task titles, customer names, prompts and any private text; keep identifiers, step names, times, counts and
error messages (`DR-PRIVACY`). Put annotations beside the frame, outside the recorded data, not as pills over
it. Shoot production screens only with the owner's permission and without changing anything.

## Sizes

- Photos and screenshots: WebP or AVIF, 1600 pixels on the long side for full-width media, 1024 for a
  column. PNG only for pixel-exact interface screenshots. Never show a raster image above 100 % of its size.
- A screenshot must stay readable on a phone: at 390 pixels wide its text must be at least 11 pixels
  on screen. If it would be smaller, crop to the part that matters, or draw the thing as a `diagram` from its
  data instead.
- Clips: see [`compose.md`](compose.md#show-a-recording) and [`vocabulary-use.md`](vocabulary-use.md). Offer AV1 and VP9
  before H.264 with `sources`; keep a loop under 20 seconds; always give a `poster`. Encode a recording at
  30 fps, H.264 High with CRF 23–28 and `faststart`, 1600–2000 pixels wide, with AV1 as a second source.
- A background clip: 720–1080p, 5–10 seconds, 2–5 MB at most, silent, with a poster. A 720p VP9 file at
  about 512 kbit/s, encoded in two passes without audio, is enough behind content; a 1 px blur on the clip
  hides the grain of the low bit rate. Keep an H.264 MP4 as the second source.
- A transparent clip: HEVC with alpha first for Safari, then VP9 with alpha in WebM for Chrome and Firefox;
  a «stacked alpha» AV1 file is far smaller but needs a small player component. Measured on one interface
  clip: VP9 with alpha 1.1 MB, HEVC with alpha 3.4 MB, stacked AV1 460 kB. Stacked alpha is one video of
  double height — the colour on top, the transparency below as grey brightness — that a WebGL shader
  recombines; hardware AV1 decoding is still missing on many Apple devices, so keep the HEVC source for
  them. Animated AVIF with transparency renders wrongly in Safari.
- Single-file output embeds every byte and counts it against `output.maxInlineBytes`, the size budget of one
  file; above it the build fails, so a page with several clips builds as a directory (`DR-PAGE-WEIGHT`).

## Pictures in both schemes

A page opens in the reader's scheme and has a scheme toggle, so every picture is seen on a light page and on
a dark one. A screenshot taken in the light scheme is a white slab on a dark page, and a drawing on its own
light background is the same; the theme's `mediaBacking` is transparent, so nothing hides that. Ship a dark
variant of every picture whose own background or ink belongs to one scheme:

```markdown
![The incident page on its first screen](assets/incident.png){dark="assets/incident-dark.png"}

::video{src="assets/demo.mp4" poster="assets/demo.png" dark-poster="assets/demo-dark.png" caption="The run."}
```

- **When:** screenshots of a page or an app that has a dark scheme, diagrams and drawings exported as files
  with a light or dark canvas, and a video poster that is a frame of such a screen. A photo, a clip of the
  real world, or a recording that is itself dark or light by nature (a terminal, a film) needs none: it is
  content, not page chrome.
- **How to get it:** photograph the page in both schemes — `snapshot` switches the page to each scheme it
  shoots — or export the drawing twice. A drawing made for the page is simpler still: draw it with the
  package (`diagram`, `chart`), which follows the theme and the scheme by itself.
- **What the reader gets:** the dark file while the picture sits on a dark surface — a dark page, the system
  scheme under `scheme: system`, or a light page's `tone="contrast"` band — switching live with the toggle;
  print and a page without scripts show the light file. Both files are embedded or copied and count toward
  the size budget, so keep the pair the same size and format.

## Fonts

The package embeds its own font families with their licences, every one with Cyrillic. A font of your own
goes in with `::font{src="…" family="…" role="…"}` (`body`, `heading`, `mono` for meta lines and chapter numbers, `code` for
code) only when you have its licence file; put the licence
beside the font. Three traps:

- **Web licences by traffic.** type.today, Contrast Foundry and Pangram Pangram sell web licences by page
  views or monthly visitors; a page that grows past the limit needs a new licence. At type.today the basic
  web licence covers a site of up to about 15,000 visitors a month, and a site with millions of visitors
  pays up to several thousand dollars per style.
- **Adobe Fonts cannot be self-hosted.** The subscription serves fonts from Adobe's servers; a file taken
  from it cannot be embedded in a page.
- **Paid font files never go into a public repository,** only the web formats the licence allows, and only
  where the page is published.

A face without Cyrillic (Instrument Serif, Bricolage Grotesque) cannot set a Russian page at all.

Sources: agentic-screencast's list of free visual assets (`docs/visual-assets.md` in that project); Creative
Commons, «Recommended practices for attribution» (title, author, source, licence — TASL — and the change
made); Jake Archibald, «Video with alpha transparency on the web» (the format support and sizes above);
the `stacked-alpha-video` player; John Beales, «Performant video hero backgrounds» (a 720p VP9 file at
512 kbit/s); type.today, «Why the price» (licences by monthly visitors); the web licences of Contrast
Foundry and Pangram Pangram.
