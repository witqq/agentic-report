import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface InstalledPackageMetadata {
  readonly version: string;
  readonly nodeEngine: string;
}

export function readInstalledPackageMetadata(): InstalledPackageMetadata {
  const metadata: unknown = JSON.parse(readPackageMetadataBytes());
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('version' in metadata) ||
    typeof metadata.version !== 'string' ||
    !('engines' in metadata) ||
    typeof metadata.engines !== 'object' ||
    metadata.engines === null ||
    !('node' in metadata.engines) ||
    typeof metadata.engines.node !== 'string'
  ) {
    throw new Error('Installed package metadata does not declare its version and Node.js engine.');
  }
  return { version: metadata.version, nodeEngine: metadata.engines.node };
}

function readPackageMetadataBytes(): string {
  for (const relativePath of ['../package.json', '../../package.json']) {
    try {
      return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Installed package metadata is missing beside the package entry points.');
}
