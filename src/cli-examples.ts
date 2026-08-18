import { resolveInstalledExampleEntry } from './authoring/example-path.js';
import type { ExampleContract } from './discovery.js';

export function formatInstalledExamples(
  examplesRoot: string,
  contractVersion: number,
  examples: readonly ExampleContract[],
  json: boolean,
): string {
  const installed = examples.map((example) => ({
    ...example,
    entry: resolveInstalledExampleEntry(examplesRoot, example),
  }));
  return json
    ? `${JSON.stringify({ contractVersion, examples: installed })}\n`
    : `${installed.map((example) => `${example.id}: ${example.entry}`).join('\n')}\n`;
}
