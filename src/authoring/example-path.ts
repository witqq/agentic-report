import path from 'node:path';

export interface ExampleEntryPath {
  readonly path: string;
  readonly entry: string;
}

export function resolveInstalledExampleEntry(
  examplesRoot: string,
  example: ExampleEntryPath,
): string {
  return path.join(examplesRoot, ...example.path.split('/'), ...example.entry.split('/'));
}
