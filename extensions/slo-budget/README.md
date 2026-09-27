# slo-budget — an error-budget calculator

An island (`kind: island`, level 3 of the [extension API](../../skills/agentic-report/references/extensions.md)):
a small application in its own sandboxed frame. The reader chooses an availability target and a window and
enters how many days of the window are gone and how many bad minutes they brought. The island shows the
budget of the window, how much of it is spent, the burn rate (1 means the budget lasts exactly to the end of
the window), when the budget runs out at this pace, and a burn-down chart against the even pace.

```markdown
---
title: Search outage, 12 September
extensions: [extensions/slo-budget/extension.yaml]
---

# Search outage, 12 September

:::island{name="slo-budget" hydrate="visible" title="Error budget of search"}

| Target | Window  | Budget   | Spent on day 12 |
| ------ | ------- | -------- | --------------- |
| 99.9 % | 30 days | 43.2 min | 18 min, 41.7 %  |

The budget is 30 × 1 440 × 0.001 = 43.2 minutes.
:::
```

## When to use it

- An incident review that must say what an outage cost in budget and what the rest of the window can afford.
- A guide or a decision about an availability target, where the reader tries their own numbers.
- A reliability report whose reader will want to ask «and if the next outage is twice as long?».

## When not to use it

- The page only needs the numbers of one case: write them in a table or with the `key-figure` block; the
  static body of the island already does that.
- A dashboard of live figures: the island computes from what the reader types and fetches nothing.

## Attributes

The island has no attributes of its own; the `island` directive takes `name="slo-budget"`, `hydrate`
(`load`, `idle`, `visible` — the default — or `none`), `height` (without it the frame follows the height the
island reports) and `title` (the caption above the frame and the frame's accessible name). The island starts
at 99.9 % over 30 days, 12 days gone and 18 bad minutes; it cannot read values from the page.

## How it uses the island bridge

- **Tokens.** The package bridge sets the page's theme tokens as custom properties on the island's root, and
  `style.css` takes every colour, face, radius and control size from them: `--color-surface`,
  `--color-text`, `--color-accent`, `--status-done`, `--status-review`, `--status-returned`,
  `--font-body`, `--font-heading`, `--font-mono`, `--radius-card`, `--radius-control`, `--control-md`. A theme
  switch on the page reaches the island through the `theme` message.
- **Language.** `init` brings the page language: English and Russian labels, and numbers formatted for the
  language (`99,9 %`, `43,2 мин`).
- **Height.** The bridge reports the island's height, and the frame follows it: one column on a phone, two
  from about 700 pixels.
- **Page clock.** When the page is played by its clock — a recording or a check that seeks it — `renderAt`
  draws the chart in over the first second of page time, as a function of `t` alone. An ordinary reader
  and a reader who prefers reduced motion see the chart complete.

The faces of the page are not inside the frame (the island has no network and the fonts are the page's), so
the island falls back to the system face of the same kind.

## Static equivalent

The Markdown body of the `island` directive is required and is what print, readers without scripts and the
moment before the island is ready show. Write the budget of the page's own case there, with the formula:
budget = window in minutes × (1 − target). The two examples show two such bodies: the cost of one outage, and
a table of budgets per target.

## Files

- `extension.yaml` — the manifest: the entry and its assets.
- `index.html`, `app.js`, `style.css` — the island. The build inlines the script and the stylesheet, hashes
  the script into the island's own security policy and the page's, and refuses any other reference.
- `example-incident.md` — an English incident review (fictional sample).
- `example-guide.md` — a Russian guide to choosing an availability target.

Build an example from the repository root:

```sh
pnpm build
node dist/node/cli.js build extensions/slo-budget/example-incident.md --output incident.html
```
