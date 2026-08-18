## Decision

:::decision{title="Use one declarative compilation path"}
Keep Markdown, metadata, confined partials, and local assets as the public source. Compile them into static
output using package-owned renderers and a bounded event-delegated runtime.
:::

| Force                | Consequence                                       |
| -------------------- | ------------------------------------------------- |
| Offline portability  | No remote runtime or author-time network fetch    |
| Agent ergonomics     | No JSX, CSS, or JavaScript required               |
| Security review      | Data-only directives with explicit constraints    |
| Deterministic output | Package versions and local source determine bytes |
