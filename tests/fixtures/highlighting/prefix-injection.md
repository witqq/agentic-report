---
contractVersion: 1
title: Prefix injection probe
language: en
---

# Prefix injection probe

Only fences whose scopes sit under an injection target: nothing else in this document loads those
injections for them.

```jsx
const card = html`<p class="note">${title}</p>`;
```

```angular-html
<p :title="label" *ngIf="shown">{{ label }}</p>
```
