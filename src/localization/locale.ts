import type { PackageLocale } from '../localization.js';

/** The package locale of a language tag: Russian for `ru` and its subtags, English otherwise. */
export function resolvePackageLocale(language: string | undefined): PackageLocale {
  return supportedPackageLocale(language) ?? 'en';
}

export function supportedPackageLocale(language: string | undefined): PackageLocale | undefined {
  const primary = language?.trim().toLowerCase().split(/[-_]/u, 1)[0];
  return primary === 'en' || primary === 'ru' ? primary : undefined;
}
