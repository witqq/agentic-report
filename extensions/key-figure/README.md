# key-figure — a figure with its date and source

A composite block (`kind: block`, level 1a of the [extension API](../../skills/agentic-report/references/extensions.md)):
the simplest reference extension. It is one Markdown template of existing directives and a few lines of
styles from theme tokens, and has no code.

`::key-figure` writes one `card` whose title is what the figure measures, whose first line is the figure,
and whose second line is the date of the slice and the place it was read. Its styles (`block.css`) set the
figure in large type from the fluid type scale, in the theme's heading face, weight and colour, and the
date and source under it in small muted text. The date and the source are
required attributes, so a figure without them fails the build at the author's directive instead of reaching
the reader (the design rules `DR-NUMBERS-UNITS` and `DR-DATA-SLICE`).

```markdown
---
title: Support quarter
extensions: [extensions/key-figure/extension.yaml]
---

# Support quarter

::::cards
:::key-figure{label="First reply, median" value="3 h 40 min" date="Q3 2026" source="Helpdesk report «Reply times»" status="good"}
Down from 5 h 10 min in Q2 after the night rota started.
:::

::key-figure{label="Satisfaction score" value="4.6 of 5" date="Q3 2026" source="Post-ticket survey export"}
::::
```

## When to use it

- A dashboard, a report or a benchmark where the reader must be able to check where each figure comes from.
- Several figures of the same kind side by side: put them in one `cards` block, usually in a section with
  `recipe="metrics"`.

## When not to use it

- One figure that deserves the whole screen: use a section with `recipe="statement"`.
- A figure in running text: write it in the sentence, with `:count[…]` if it is new and dated.
- A figure whose date or source you do not know: find them first; an unknown figure is written as unknown.

## Attributes

| Attribute | Type                              | Required | Meaning                                                 |
| --------- | --------------------------------- | -------- | ------------------------------------------------------- |
| `label`   | text, up to 80 characters         | yes      | what the figure measures, in the reader's words         |
| `value`   | text, up to 40 characters         | yes      | the figure with its unit, as the source writes it       |
| `date`    | text, up to 60 characters         | yes      | the date or the period of the slice                     |
| `source`  | text, up to 160 characters        | yes      | where the figure was read, so that the reader can check |
| `status`  | `none`, `good`, `watch` or `risk` | no       | the state the figure puts the reader in; `none` default |

The container form takes a Markdown body: one or two sentences that say what the figure means. The leaf
form (`::key-figure{…}`) has no body. The block must stand inside `cards`, because the card it writes does.

## Static equivalent

The block writes a `card`, so it has no motion: print, reduced motion and readers without scripts see the
same card with the figure in large type, the date, the source and the explanation.

## Files

- `extension.yaml` — the manifest: the attributes above, the template and the styles.
- `template.md` — the template: `:::card{title="{{label}}" status="{{status}}"}` with the value, the
  date and the source, and `{{content}}` for the body.
- `block.css` — the styles: nested inside the card the block writes (`&`), only theme tokens and the type
  scale, checked at build time like the package stylesheet.
- `example-quarterly.md` — an English support dashboard (fictional sample).
- `example-benchmark.md` — a Russian benchmark note with real measurements of this package.

Build an example from the repository root:

```sh
pnpm build
node dist/node/cli.js build extensions/key-figure/example-quarterly.md --output quarterly.html
```

To use the block on your own page, copy this folder into an `extensions/` folder beside the page and
declare its manifest in the frontmatter, as the page above does.
