import type { Page } from '@playwright/test';

import { BUILT_IN_THEME_NAMES, resolveBuiltInTheme } from '../../src/authoring/themes.js';
import { themeRootAttributes, themeStylesheet } from '../../src/render/theme-css.js';

/**
 * Страница несёт правила только своей темы. Чтобы перебрать встроенные темы на одной странице,
 * тест добавляет их правила и переключает атрибуты корня так же, как это делает переключатель тем.
 */
export const BUILT_IN_THEME_ATTRIBUTES = BUILT_IN_THEME_NAMES.map((name) => ({
  name,
  attributes: themeRootAttributes(resolveBuiltInTheme(name)),
}));

export async function addBuiltInThemes(page: Page): Promise<void> {
  await page.addStyleTag({
    content: themeStylesheet(BUILT_IN_THEME_NAMES.map(resolveBuiltInTheme)),
  });
}
