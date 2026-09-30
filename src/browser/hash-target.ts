/** The element an address fragment names, or nothing for an empty or undecodable fragment. */
export function hashTarget(hash: string): HTMLElement | undefined {
  if (!hash.startsWith('#') || hash.length === 1) return undefined;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1))) ?? undefined;
  } catch {
    return undefined;
  }
}
