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

Default preset `material`, default theme `system`, default layout `document`.

| Preset      | Tokens                                                                   | Intent                                                                                               |
| ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `monument`  | density=spacious, font=sans, accent=indigo, width=wide, radius=soft      | Large-scale product storytelling with sculptural type, generous space, and staged depth.             |
| `material`  | density=comfortable, font=serif, accent=indigo, width=wide, radius=sharp | Editorial reading with serif display type, tactile warm plates, and document navigation.             |
| `signal`    | density=compact, font=sans, accent=teal, width=wide, radius=sharp        | Dense operational evidence with compact spacing, broad tracks, and crisp controls.                   |
| `terminal`  | density=compact, font=mono, accent=teal, width=wide, radius=sharp        | Console-oriented storytelling with mono type, luminous signals, scan texture, and explicit prompts.  |
| `cinematic` | density=spacious, font=sans, accent=coral, width=wide, radius=round      | Image-first narrative with deep staging, broad media, restrained overlays, and scroll-driven scenes. |
| `studio`    | density=spacious, font=sans, accent=indigo, width=wide, radius=soft      | Compatibility identity mapped to the Monument visual system.                                         |
| `editorial` | density=comfortable, font=serif, accent=indigo, width=wide, radius=sharp | Compatibility identity mapped to the Material editorial visual system.                               |

| Token     | Values                               | Default       | Meaning                                                         |
| --------- | ------------------------------------ | ------------- | --------------------------------------------------------------- |
| `density` | `compact`, `comfortable`, `spacious` | `comfortable` | Controls the shared spacing rhythm and control padding.         |
| `font`    | `sans`, `serif`, `mono`              | `sans`        | Selects the package-owned typography stack.                     |
| `accent`  | `indigo`, `teal`, `coral`            | `indigo`      | Selects the accent and visible-focus color family.              |
| `width`   | `narrow`, `standard`, `wide`         | `standard`    | Controls the maximum shell and reading width.                   |
| `radius`  | `sharp`, `soft`, `round`             | `soft`        | Controls the shared corner treatment for surfaces and controls. |

Themes: `system`, `light`, `dark`. Layouts: `document`, `dashboard`, `landing`, `mixed`.

## Frontmatter and manifest fields

Every accepted field; anything else is refused as an unknown field.

| Field             | Type    | Default                                             | Meaning                                                                                                                             |
| ----------------- | ------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `contractVersion` | integer | `1`                                                 | Authored source-contract major; omitted legacy source is interpreted as version 1.                                                  |
| `title`           | string  | —                                                   | Document title.                                                                                                                     |
| `description`     | string  | —                                                   | Plain-text document description for metadata.                                                                                       |
| `language`        | string  | `"und"`                                             | Language tag using the supported 2-8 letter primary and optional 2-8 character alphanumeric subtags.                                |
| `localizations`   | object  | —                                                   | Confined alternate Markdown entries for package-supported reader locales; the primary entry is the fallback.                        |
| `preset`          | string  | `"material"`                                        | Coordinated package-owned visual defaults; explicit bounded token values override the preset.                                       |
| `theme`           | string  | `"system"`                                          | Initial document color theme.                                                                                                       |
| `layout`          | string  | `"document"`                                        | Responsive page composition selected from the package-owned layout catalog.                                                         |
| `scrollProgress`  | boolean | `false`                                             | Enables a decorative package-owned scroll indicator only in the normal-motion profile.                                              |
| `attribution`     | boolean | `true`                                              | Shows the package-owned “Made with Agentic Report” footer link; set false to omit it.                                               |
| `themeToggle`     | boolean | `true`                                              | Shows the package-owned light and dark control; set false for a page that must stay in the scheme it was built with.                |
| `presetSwitcher`  | boolean | `false`                                             | Shows a package-owned visual-style selector that swaps preset and its tokens live; the colour scheme stays where the reader put it. |
| `review`          | boolean | `false`                                             | Enables the package-owned review workspace; off by default so an ordinary page ships as a document rather than a review surface.    |
| `tokens`          | object  | —                                                   | Compact package-owned visual token overrides; arbitrary CSS is not accepted.                                                        |
| `output`          | object  | `{"format":"single-file","maxInlineBytes":5000000}` | Default output settings; command-line flags can override the format.                                                                |

## Directives

44 directives are accepted.

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

### `asset`

Download link to a confined local file.

Forms: text, leaf. Children: label-or-generated-label.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `src`     | text (min 1, max 200) | yes      | —       |

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

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |
| `href`    | text (min 1, max 500) | no       | —       |

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

### `contents`

Generated in-flow links to final primary sections using their exact visible headings.

Forms: leaf. Children: none.

### `copyable`

Ordinary Markdown prose with a localized copy control.

Forms: container. Children: markdown-and-term-directives.

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

### `demo`

Package-owned counter interaction; author code is never executed.

Forms: container. Children: markdown.

| Attribute | Values                         | Required | Default |
| --------- | ------------------------------ | -------- | ------- |
| `title`   | text (min 1, max 200)          | no       | —       |
| `start`   | integer from -999999 to 999999 | no       | `0`     |
| `step`    | integer from -999999 to 999999 | no       | `1`     |

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

### `disclosure`

Native disclosure with a visible summary.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | yes      | —       |
| `open`    | `false`, `true`       | no       | `false` |

### `edge`

One directed connection between diagram nodes; in a sequence, from equal to to is a step inside one participant drawn as a loop.

Forms: leaf. Children: none. Required parent: `diagram`.

| Attribute | Values                                | Required | Default |
| --------- | ------------------------------------- | -------- | ------- |
| `from`    | text (min 1, max 64)                  | yes      | —       |
| `to`      | text (min 1, max 64)                  | yes      | —       |
| `label`   | text (min 1, max 160)                 | no       | —       |
| `kind`    | `call`, `data`, `event`, `dependency` | no       | `call`  |
| `route`   | `auto`, `direct`, `around`            | no       | `auto`  |

### `event`

One dated timeline event with optional Markdown detail.

Forms: container. Children: markdown. Required parent: `timeline`.

| Attribute | Values                                    | Required | Default   |
| --------- | ----------------------------------------- | -------- | --------- |
| `date`    | text (min 1, max 160)                     | yes      | —         |
| `title`   | text (min 1, max 200)                     | yes      | —         |
| `kind`    | `neutral`, `accent`, `success`, `warning` | no       | `neutral` |

### `filter`

Client-side text filter for authored list items.

Forms: container. Children: markdown.

| Attribute     | Values                | Required | Default        |
| ------------- | --------------------- | -------- | -------------- |
| `title`       | text (min 1, max 200) | no       | —              |
| `placeholder` | text (min 1, max 160) | no       | `Filter items` |

### `font`

Register a confined local font; the first declaration becomes the document font.

Forms: leaf. Children: none.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `src`     | text (min 1, max 200) | yes      | —       |
| `family`  | text (min 1, max 80)  | yes      | —       |

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

Forms: leaf. Children: none. Required parent: `diagram`.

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

One legend entry: names a connection kind or a node emphasis in the author's words, or hides a connection kind.

Forms: leaf. Children: none. Required parent: `diagram`.

| Attribute | Values                                    | Required | Default |
| --------- | ----------------------------------------- | -------- | ------- |
| `edge`    | `call`, `data`, `event`, `dependency`     | no       | —       |
| `node`    | `neutral`, `accent`, `success`, `warning` | no       | —       |
| `label`   | text (min 1, max 160)                     | no       | —       |
| `hidden`  | true or false                             | no       | `false` |

### `modal`

Modal dialog opened by a package-owned control.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default       |
| --------- | --------------------- | -------- | ------------- |
| `title`   | text (min 1, max 200) | yes      | —             |
| `trigger` | text (min 1, max 160) | no       | `Open dialog` |

### `node`

One labelled node in a flow diagram.

Forms: leaf. Children: none. Required parent: `diagram`.

| Attribute | Values                                    | Required | Default   |
| --------- | ----------------------------------------- | -------- | --------- |
| `id`      | text (min 1, max 64)                      | yes      | —         |
| `label`   | text (min 1, max 160)                     | yes      | —         |
| `detail`  | text (min 1, max 160)                     | no       | —         |
| `group`   | text (min 1, max 64)                      | no       | —         |
| `kind`    | `neutral`, `accent`, `success`, `warning` | no       | `neutral` |
| `row`     | integer from 1 to 20                      | no       | —         |

### `option`

One selectable answer option.

Forms: leaf. Children: none. Required parent: `question`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `id`      | text (min 1, max 64)  | yes      | —       |
| `label`   | text (min 1, max 200) | yes      | —       |

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

| Attribute         | Values                                                    | Required | Default     |
| ----------------- | --------------------------------------------------------- | -------- | ----------- |
| `title`           | text (min 1, max 200)                                     | yes      | —           |
| `id`              | text (min 1, max 64)                                      | no       | —           |
| `nav`             | text (min 1, max 160)                                     | no       | —           |
| `recipe`          | `none`, `hero`, `evidence`, `story`, `rail`, `metrics`    | no       | `none`      |
| `width`           | `reading`, `standard`, `wide`                             | no       | `standard`  |
| `align`           | `start`, `center`                                         | no       | `start`     |
| `tone`            | `plain`, `soft`, `accent`, `contrast`                     | no       | `plain`     |
| `composition`     | `flow`, `stage`, `split`, `mosaic`, `story`, `stack`      | no       | `flow`      |
| `viewport`        | `adaptive`, `full`, `bounded`                             | no       | `adaptive`  |
| `section-density` | `compact`, `editorial`, `immersive`                       | no       | `editorial` |
| `type`            | `body`, `display`, `editorial`                            | no       | `body`      |
| `media`           | `natural`, `mask`, `layers`, `gallery`, `bleed`           | no       | `natural`   |
| `media-fit`       | `natural`, `contain`, `cover`                             | no       | `natural`   |
| `media-aspect`    | `natural`, `landscape`, `cinematic`, `portrait`, `square` | no       | `natural`   |
| `focal`           | `center`, `top`, `right`, `bottom`, `left`                | no       | `center`    |
| `surface`         | `plain`, `mesh`, `glow`, `grain`, `grid`                  | no       | `plain`     |
| `transition`      | `none`, `reveal`, `stagger`                               | no       | `none`      |
| `scene`           | `none`, `progress`, `sticky`                              | no       | `none`      |
| `interaction`     | `none`, `depth`, `tilt`                                   | no       | `none`      |
| `choreography`    | `none`, `cascade`                                         | no       | `none`      |
| `reveal`          | true or false                                             | no       | `false`     |

### `series`

One named chart series containing data points.

Forms: container. Children: point-directives. Required parent: `chart`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `label`   | text (min 1, max 160) | yes      | —       |

### `source-link`

Source location opened through an explicit IPv4 loopback editor helper without replacing the report page.

Forms: text. Children: none.

| Attribute | Values                 | Required | Default |
| --------- | ---------------------- | -------- | ------- |
| `label`   | text (min 1, max 160)  | yes      | —       |
| `href`    | text (min 1, max 1000) | yes      | —       |

### `steps`

Process or tutorial sequence containing Markdown, normally an ordered list.

Forms: container. Children: markdown.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |

### `tab`

One labelled panel inside tabs.

Forms: container. Children: markdown. Required parent: `tabs`.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `label`   | text (min 1, max 160) | yes      | —       |

### `tabs`

Keyboard-operable group of tab panels.

Forms: container. Children: markdown-and-tab-directives.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `title`   | text (min 1, max 200) | no       | —       |

### `term`

Inline or standalone reference that opens a registered glossary explanation. Prose must carry one for the first occurrence of a registered term in each section; later occurrences of that term in the same section stay ordinary prose.

Forms: leaf, text. Children: label-or-generated-label.

| Attribute | Values               | Required | Default |
| --------- | -------------------- | -------- | ------- |
| `key`     | text (min 1, max 64) | yes      | —       |

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

### `video`

Embedded local video (webm, mp4, m4v, or ogv) with controls, muted and looping; plays when visible unless the reader prefers reduced motion.

Forms: leaf. Children: none.

| Attribute | Values                | Required | Default |
| --------- | --------------------- | -------- | ------- |
| `src`     | text (min 1, max 200) | yes      | —       |
| `poster`  | text (min 1, max 200) | no       | —       |
| `caption` | text (min 1, max 300) | no       | —       |

## Visualization limits

```json
{
  "diagram": {
    "defaultType": "flow",
    "types": ["flow", "sequence"],
    "edgeKinds": ["call", "data", "event", "dependency"],
    "defaultEdgeKind": "call",
    "nodeKinds": ["neutral", "accent", "success", "warning"],
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
      "selfEdges": false,
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
  "describe": "Return the complete source contract.",
  "schema": "Return manifest, directive, or complete source JSON Schema.",
  "examples": "List packaged buildable examples."
}
```

## Rules checked for you

- {"subject":"copyable","rules":[{"id":"prose-and-terms-only","dependsOn":[]}]}
- {"subject":"section/lead","rules":[{"id":"single-paragraph","dependsOn":[]},{"id":"first-authored-block","dependsOn":[]}]}
- {"subject":"response/question","rules":[{"id":"unique-id","dependsOn":[]},{"id":"unique-child-ids","dependsOn":[]},{"id":"items-match-kind","dependsOn":[]},{"id":"buckets-match-kind","dependsOn":[]},{"id":"item-bucket-references","dependsOn":["buckets-match-kind"]},{"id":"options-match-kind","dependsOn":[]},{"id":"numeric-domain","dependsOn":[]}]}
- {"subject":"decision|checklist","rules":[{"id":"children-not-mixed","dependsOn":[]},{"id":"child-limit","dependsOn":[]},{"id":"stable-decision-id","dependsOn":[]},{"id":"child-present","dependsOn":[]},{"id":"unique-child-ids","dependsOn":["children-not-mixed","child-present"]}]}
- {"subject":"directive-node","rules":[{"id":"registered-name","dependsOn":[]},{"id":"no-prototype-like-attributes","dependsOn":[]},{"id":"declared-form","dependsOn":["registered-name"]},{"id":"declared-placement","dependsOn":["registered-name"]},{"id":"declared-children","dependsOn":["registered-name"]},{"id":"interpreted-attributes","dependsOn":["registered-name","no-prototype-like-attributes"]},{"id":"action-label","dependsOn":["registered-name"]},{"id":"compatible-attribute-combination","dependsOn":["interpreted-attributes"]},{"id":"section-identity","dependsOn":["interpreted-attributes"]},{"id":"appendix-glossary-placement","dependsOn":["interpreted-attributes"]},{"id":"unique-glossary-identity","dependsOn":["interpreted-attributes"]},{"id":"declared-glossary-forms","dependsOn":["interpreted-attributes","unique-glossary-identity"]}]}
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
- {"subject":"code-fence/terms","rules":[{"id":"known-keys","dependsOn":[]},{"id":"locatable-terms","dependsOn":["known-keys"]},{"id":"no-overlap","dependsOn":["known-keys","locatable-terms"]}]}
- {"subject":"prose-container/glossary","rules":[{"id":"first-occurrence-marked","dependsOn":[]}]}

## Safety boundary

- canonical source-root confinement
- local resources only
- sanitized Markdown HTML
- no author code or template execution
