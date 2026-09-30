import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { CORE_STYLES, PAGE_FEATURES, type PageFeatureDefinition } from '../../src/page-features.js';

/** Every stylesheet source of the package: the core and each feature's, in page order. */
export function packageStylesheetFiles(): readonly string[] {
  const features: readonly PageFeatureDefinition[] = PAGE_FEATURES;
  return [...CORE_STYLES, ...features.flatMap((feature) => feature.styles ?? [])].map(
    (file) => `src/${file}`,
  );
}

/**
 * The whole package stylesheet as one text: what a page carrying every feature receives before
 * prefixing and minification. Checks of the stylesheet's rules read it instead of one file.
 */
export async function readPackageStylesheet(): Promise<string> {
  const texts = await Promise.all(
    packageStylesheetFiles().map((file) => readFile(path.resolve(file), 'utf8')),
  );
  return texts.join('\n');
}
