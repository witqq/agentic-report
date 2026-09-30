import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { BUILT_IN_THEME_NAMES, resolveBuiltInTheme } from '../../src/authoring/themes.js';
import { themeRootAttributes, themeStylesheet } from '../../src/render/theme-css.js';

/**
 * Страница несёт правила только своей темы и приёмы оболочки только тех тем, что ей нужны (консоль,
 * ledger). Чтобы перебрать встроенные темы на одной странице, тест добавляет их правила и таблицы этих
 * приёмов и переключает атрибуты корня так же, как это делает переключатель тем.
 */
export const BUILT_IN_THEME_ATTRIBUTES = BUILT_IN_THEME_NAMES.map((name) => ({
  name,
  attributes: themeRootAttributes(resolveBuiltInTheme(name)),
}));

export async function addBuiltInThemes(page: Page): Promise<void> {
  await page.addStyleTag({
    content: themeStylesheet(BUILT_IN_THEME_NAMES.map(resolveBuiltInTheme)),
  });
  for (const feature of ['theme-console', 'theme-ledger'])
    await page.addStyleTag({
      content: await readFile(
        path.resolve(`dist/browser/modules/browser/styles/${feature}.css`),
        'utf8',
      ),
    });
}
