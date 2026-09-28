# Assets, licences, and provenance

Every picture, clip, font, icon and piece of effect code on a page comes from somewhere. Record where, so the
reader can trust it and the next agent can replace or re-shoot it. This is not legal advice: for a
commercial release, show the owner the «Media» table and any doubtful file.

## Three questions before any file goes on the page

1. **What licence does this file carry?** The file's own licence, not the site's: on Wikimedia Commons, in
   museum collections and on CodePen it differs from file to file.
2. **Is attribution required, and where?** For Creative Commons, credit the title, the author, the source and
   the licence, and note what you changed («cropped from the original»).
3. **Is this use allowed?** Check non-commercial (NC), no derivatives (ND), share-alike (SA), trademarks,
   privacy and recognisable people separately. CC BY-SA applies its share-alike condition to a shared
   adaptation of the licensed material; merely placing a credited image beside other page content does not
   automatically relicense the whole page.

If any answer is «I don't know», the file does not go on the page.

## What to use, in order of preference

1. **A screenshot of the real thing,** taken from a build: the product, the page, the terminal. Take it with
   the snapshot command or a browser, at 2× density, and crop it to what the text talks about.
2. **A clip filmed with agentic-screencast** for behaviour that a still cannot show. Keep its protocol path.
3. **A diagram or chart** drawn by the package from the real system or the real numbers.
4. **A photo with a licence** that allows the use: your own, the user's, or one under CC0, CC BY, or the
   Unsplash licence. Record the author, the exact file's source page and its licence in the page's media
   inventory.
5. **A drawing or a render made for the page,** such as an SVG explaining a mechanism, a small rendered 3D
   object for an icon (Resend draws its section icons this way), or a stylised render of the page's
   metaphor. Stylisation looks more considered than photorealism. It is the page's own material: record it
   as `drawn`, with the tool and the scene file in `Source`.
6. **A generated picture,** only when nothing real exists, with the reason in the brief, at most one per page
   (`DR-REAL-MATERIAL`). Recognisable «AI art» sets such as DeepMind's «Visualising AI» read as stock.

Never take a picture from a website without its licence, and never use a logo you were not given.

## Where to find files, and what each source allows

Use the named collection to find an asset, then inspect the exact item's licence and rights notice before
downloading. These are source-finding cues, not blanket permission. Keep the item page, author, licence name,
and any required notice in `brief.md`; put a licence copy beside redistributed icon or font files when its
terms require one. An item can carry separate rights for depicted people, property, brands or underlying
artwork. If a current licence or rights statement cannot be confirmed, choose another asset.

When the `agentic-screencast` repository is available, its `docs/visual-assets.md` is a further
locator for free visual-asset collections, clips and illustrations. Its film-specific API and media advice
does not grant permission for a page: confirm the current licence and rights of every chosen item here.

| Source                                  | What to look for and record                                                                                      | Use condition to check                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsplash                                | Search free photos; record photographer and exact photo page.                                                    | The Unsplash License allows free commercial use without required credit, but forbids selling images without significant modification or building a competing image service. Unsplash+ is a separate paid licence; check any depicted rights. |
| Pexels                                  | Search photos and clips; record creator and exact item page.                                                     | Its licence allows modification and does not require credit; it forbids selling unaltered copies, stock-platform redistribution, trademark use and implied endorsement.                                                                      |
| Pixabay                                 | Search photos, illustrations, clips and audio; record creator and exact item page.                               | Its Content License does not require credit. Do not sell or distribute an item on a standalone basis where it remains substantially the same; a crop alone may not make a new work. Check third-party rights.                                |
| Wikimedia Commons                       | Open the file description, not only a search result; record author, source, licence version and required credit. | Rights differ by file. Follow the file's attribution, licence-copy or link, and adaptation conditions. For CC BY-SA, a shared adaptation of the image carries ShareAlike; a simple page collection does not automatically inherit it.        |
| The Met Open Access                     | Filter for Open Access and check the object's page.                                                              | Images of public-domain works marked for Open Access are offered under CC0; other object media may differ.                                                                                                                                   |
| Smithsonian Open Access                 | Find the object's rights statement, including for 3D scans.                                                      | Use an item only when its own Open Access record marks it CC0.                                                                                                                                                                               |
| SMK, National Gallery of Denmark        | Inspect the rights statement for each artwork image or 3D object.                                                | Public-domain collection items may be reusable; do not infer permission for a particular scan from the collection name.                                                                                                                      |
| Lucide                                  | Pick a named SVG icon and retain its copyright and licence notices.                                              | The set is mainly ISC, but Feather-derived icons listed in Lucide's licence carry MIT; preserve the applicable notice.                                                                                                                       |
| Heroicons, Tabler Icons, Phosphor Icons | Download the icon from the project's official package or repository.                                             | Their code and icons are offered under MIT; retain the copyright and permission notice with redistributed copies. Verify the downloaded version.                                                                                             |
| Material Symbols                        | Download the current icon asset from Google's official set.                                                      | Apache 2.0 permits reuse; retain its licence and applicable notices when redistributing.                                                                                                                                                     |
| Iconify                                 | Use its collection metadata to identify the original icon set.                                                   | Iconify is an index, not a blanket licence: follow the particular set's terms and keep brand trademark rights separate.                                                                                                                      |
| Google Fonts, Fontsource                | Inspect the family or package's licence and script coverage before using local font files.                       | Fonts have individual licences, commonly OFL or Apache 2.0. Fontsource supplies package files for offline use, but its package licence does not replace the font's own. Keep required font notices with files.                               |
| Fontshare                               | Check whether the chosen family is an open-source OFL font or a proprietary ITF Free Font License font.          | Both may be free to use, but redistribution and modification rights differ; inspect that family's current licence before bundling or committing files.                                                                                       |

Emoji are not icons on a page ([`art-direction.md`](art-direction.md), clichés).

## Licences of code and effects

The package does not take your code, but the look of an effect often starts from someone else's demo.
Take ideas freely; take code only when it is your own or under MIT, Apache 2.0 or the Unlicense, and keep
its licence notice.

| Source                    | What to do                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadertoy                 | Study a visual technique only. Do not copy a shader without an explicit licence for that exact shader and the intended use; an unverified site default is not permission.                                       |
| Codrops demos             | Downloadable demo code is MIT unless that demo says otherwise. Retain its notice, and check embedded fonts, images and icons separately. A repository without a licence is not automatically MIT.               |
| Paper Shaders             | The current official repository states Apache 2.0; keep its `LICENSE` and `NOTICE` when redistributing code, and verify the exact version.                                                                      |
| Unicorn Studio            | Its SDK and effect engine remain proprietary. A commercial plan may allow displaying output, but it does not permit redistributing its code as an extension. Study the technique and implement your own effect. |
| CodePen                   | Public Pens are MIT by the site's rule; preserve the original author's copyright and licence. Private Pens carry no implicit licence. Check embedded media and imported code separately.                        |
| pmndrs/postprocessing     | The library uses Zlib, outside this package's allowed copied-effect-code licences. Use it as a technique reference rather than copying effect code into an extension.                                           |
| OGL                       | The project's package declares Unlicense; verify the version used and preserve any third-party notices from its examples.                                                                                       |
| three.js and its examples | Core code is MIT; examine each example asset because models, textures and fonts can have separate licences.                                                                                                     |

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
| `assets/harbour.jpg`   | photo            | exact Unsplash photo page, by A. Author         | Unsplash |
| `assets/pipeline.svg`  | drawn            | drawn for this page                             | project  |
| `assets/texture.png`   | generated        | reason: no real material shows an abstract idea | project  |
```

`Origin` is one of `build-screenshot`, `screencast`, `diagram`, `photo`, `drawn`, `placeholder`, `generated`. A
`placeholder` stands in for real material that exists but is not in hand yet; the page labels it as a
placeholder and the brief lists the real file as an unresolved fact. A `generated` row says its reason in
`Source`. The photo row illustrates the format: before handoff, replace its descriptive source with the
actual photo-page address and the real photographer's name.

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

- **Web licences by traffic.** type.today, Contrast Foundry and Pangram Pangram offer web licences whose
  limits can depend on website traffic. Check the purchased agreement's domains, views, term and upgrade
  rule; a page beyond its purchased scope needs the appropriate licence.
- **Adobe Fonts cannot be self-hosted.** The subscription serves fonts from Adobe's servers; a file taken
  from it cannot be embedded in a page.
- **Paid font files never go into a public repository,** only the web formats the licence allows, and only
  where the page is published.

A face without Cyrillic cannot set a Russian page at all. Check the font file's actual glyph coverage,
including the letters used by the page, instead of inferring coverage from a family name.
