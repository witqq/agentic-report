/** The word for a block kind in the change list; an unknown directive is named by its directive. */
export function editionKind(kinds: Readonly<Record<string, string>>, fallback: string) {
  return (kind: string): string =>
    kinds[kind] ?? (kind.startsWith('directive:') ? kind.slice('directive:'.length) : fallback);
}
