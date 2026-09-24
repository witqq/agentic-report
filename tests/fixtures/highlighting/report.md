---
contractVersion: 1
title: Highlighting probe
language: en
---

# Highlighting probe

:::glossary{key="own-field" term="child"}
A field the node owns.
:::

```typescript terms="own-field"
const child: Node = parent.child;
```

```js
export const answer = 42;
```

```bash
echo "$HOME" | wc -c
```

````markdown
---
name: agentic-report
version: 1
---

# Nested

```ts
const nested: number = 1;
```
````

```typescript
const style = css`
  color: red;
`;
const view = html`<p class="note">${style}</p>`;
const query = sql`select * from reports where id = ${1}`;
```

```jinja-html
<ul>{% for item in items %}<li>{{ item }}</li>{% endfor %}</ul>
```

```nosuchlang
this stays plain text
```

```
no language at all
```
