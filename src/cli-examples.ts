import { resolveInstalledExampleEntry } from './authoring/example-path.js';
import type { ReferenceExtension } from './authoring/reference-extensions.js';
import type { ExampleContract } from './discovery.js';

/**
 * The `examples` output: the example pages with their installed entries, and the reference extensions
 * shipped beside them — one per level of the extension API, each with its manifest, README and examples.
 */
export function formatInstalledExamples(
  examplesRoot: string,
  contractVersion: number,
  examples: readonly ExampleContract[],
  json: boolean,
  extensions: readonly ReferenceExtension[] = [],
): string {
  const installed = examples.map((example) => ({
    ...example,
    entry: resolveInstalledExampleEntry(examplesRoot, example),
  }));
  if (json) return `${JSON.stringify({ contractVersion, examples: installed, extensions })}\n`;
  const lines = installed.map((example) => `${example.id}: ${example.entry}`);
  for (const extension of extensions)
    lines.push(`extension ${extension.name} (${extension.kind}): ${extension.readme}`);
  return `${lines.join('\n')}\n`;
}
