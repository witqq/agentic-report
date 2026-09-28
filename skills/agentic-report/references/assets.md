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

| Source                                                                                                                                                       | Licence                           | Credit                           | Note                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| [Unsplash](https://unsplash.com/license)                                                                                                                     | Unsplash License                  | Appreciated, not required        | No model or property release; Unsplash+ images are paid            |
| [Pexels](https://www.pexels.com/license/)                                                                                                                    | Pexels License                    | Appreciated, not required        | No selling unaltered copies                                        |
| [Pixabay](https://pixabay.com/service/license-summary/)                                                                                                      | Pixabay Content License           | Not required                     | No standalone redistribution, even cropped                         |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)                                                            | Per file                          | Usually required                 | CC BY-SA makes your page share-alike                               |
| [The Met Open Access](https://www.metmuseum.org/hubs/open-access)                                                                                            | CC0 for works marked open access  | Not required                     | Check the object's own page                                        |
| [Smithsonian Open Access](https://www.si.edu/openaccess)                                                                                                     | CC0 for items marked CC0          | Not required                     | Includes 3D scans                                                  |
| [SMK, National Gallery of Denmark](https://www.smk.dk/en/article/3d-models/)                                                                                 | Public domain works and 3D models | Not required                     | Scan the World and similar collections: check each object          |
| [Lucide](https://lucide.dev/license)                                                                                                                         | ISC                               | Licence text beside copied files |                                                                    |
| [Heroicons](https://github.com/tailwindlabs/heroicons), [Tabler](https://github.com/tabler/tabler-icons), [Phosphor](https://github.com/phosphor-icons/core) | MIT                               | Licence text beside copied files |                                                                    |
| [Material Symbols](https://github.com/google/material-design-icons)                                                                                          | Apache 2.0                        | Licence text beside copied files |                                                                    |
| [Iconify](https://api.iconify.design/collections)                                                                                                            | Per icon set                      | Per set                          | A CC BY or CC BY-SA set needs a credit; brand logos are trademarks |
| [Google Fonts](https://developers.google.com/fonts/faq)                                                                                                      | OFL, Apache, UFL                  | Not required                     | Keep the licence beside the font file                              |
| [Fontsource](https://fontsource.org/docs/getting-started/introduction)                                                                                       | The font's own, usually OFL       | Not required                     | Files for offline use; its API returns each font's licence         |
| [Fontshare](https://www.fontshare.com/licenses/itf-ffl)                                                                                                      | ITF Free Font License             | Not required                     | Use allowed, redistribution forbidden: do not commit it            |

Emoji are not icons on a page ([`art-direction.md`](art-direction.md), clichés).

## Licences of code and effects

The package does not take your code, but the look of an effect often starts from someone else's demo.
Take ideas freely; take code only when it is your own or under MIT, Apache 2.0 or the Unlicense, and keep
its licence notice.

| Source                                                            | What its licence allows                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shadertoy](https://www.shadertoy.com/terms)                      | CC BY-NC-SA 3.0 by default: no commercial use, share-alike. Take the idea and write the maths yourself                                                                |
| [Codrops demos](https://tympanus.net/codrops/licensing/)          | MIT «unless stated otherwise», with the notice; fonts, images and icons in a demo keep their own licences; a repository without a licence file is all rights reserved |
| [Paper Shaders](https://github.com/paper-design/shaders)          | Check the licence of the exact version you take                                                                                                                       |
| [Unicorn Studio](https://www.unicorn.studio/docs/faqs/)           | The effect's code belongs to the service; do not copy it                                                                                                              |
| [CodePen](https://blog.codepen.io/documentation/licensing/)       | Public pens are MIT with the author's copyright; private pens have no licence                                                                                         |
| [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) | Zlib                                                                                                                                                                  |
| [OGL](https://github.com/oframe/ogl)                              | Unlicense                                                                                                                                                             |
| three.js and its examples                                         | MIT for the code; models, textures and fonts in its examples may be under Creative Commons                                                                            |

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
- A background clip: 720–1080p, 5–10 seconds, 2–5 MB at most, silent, with a poster.
- A transparent clip: HEVC with alpha first for Safari, then VP9 with alpha in WebM for Chrome and Firefox;
  a «stacked alpha» AV1 file is far smaller but needs a small player component.
- Single-file output embeds every byte and counts it against `output.maxInlineBytes`, the size budget of one
  file; above it the build fails, so a page with several clips builds as a directory (`DR-PAGE-WEIGHT`).

## Fonts

The package embeds its own font families with their licences, every one with Cyrillic. A font of your own
goes in with `::font{src="…" family="…" role="…"}` only when you have its licence file; put the licence
beside the font. Three traps:

- **Web licences by traffic.** type.today, Contrast Foundry and Pangram Pangram sell web licences by page
  views; a page that grows past the limit needs a new licence.
- **Adobe Fonts cannot be self-hosted.** The subscription serves fonts from Adobe's servers; a file taken
  from it cannot be embedded in a page.
- **Paid font files never go into a public repository,** only the web formats the licence allows, and only
  where the page is published.

A face without Cyrillic (Instrument Serif, Bricolage Grotesque) cannot set a Russian page at all.

Sources: [agentic-screencast, free visual assets](https://github.com/witqq/agentic-screencast) (its
`docs/visual-assets.md`); [Creative Commons, recommended attribution](https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution);
[Jake Archibald, video with transparency](https://jakearchibald.com/2024/video-with-transparency/);
[stacked-alpha-video](https://www.npmjs.com/package/stacked-alpha-video);
[John Beales, performant video hero backgrounds](https://johnbeales.com/2025/performant-video-hero-backgrounds/);
[type.today, why the price](https://type.today/en/journal/whytheprice);
[Contrast Foundry licensing](https://contrastfoundry.com/licensing);
[Pangram Pangram EULA](https://pangrampangram.com/pages/eula).
