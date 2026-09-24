import { PUBLIC_PAGE_CONTRACT } from '../authoring/registry.js';

/** Метаданные страницы, опубликованной по известному адресу; без адреса их нет вовсе. */
export interface PublicPageMetadata {
  readonly url: string;
  readonly image?: string;
  readonly locale?: string;
  readonly alternateLocales: readonly string[];
}

/**
 * OpenGraph ждёт `ll_TT`. Тег с двухбуквенным регионом переводится механически (`pt-BR` → `pt_BR`,
 * `zh-Hant-TW` → `zh_TW`); тег без региона получает локаль только из таблицы каталога; `und`,
 * числовой регион (`es-419`) и прочие теги без региона — никакой: территорию не угадываем.
 */
export function openGraphLocale(language: string): string | undefined {
  const [primary, ...subtags] = language.split('-');
  if (primary === undefined || primary.toLowerCase() === 'und') return undefined;
  const region = subtags.find((subtag) => /^[A-Za-z]{2}$/u.test(subtag));
  if (region !== undefined) return `${primary.toLowerCase()}_${region.toUpperCase()}`;
  if (subtags.length > 0) return undefined;
  const table: Readonly<Record<string, string>> = PUBLIC_PAGE_CONTRACT.openGraphLocales;
  return table[primary.toLowerCase()];
}
