import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

/**
 * Картинка, повторённая на странице и в её второй языковой версии, встроена в файл один раз; рантайм
 * подставляет её во все появления. Проверяется то, что видит читатель: каждая картинка загружена и в
 * исходном языке, и после переключения.
 */
test('repeated images appear everywhere in both languages although the file carries each once', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(
    pathToFileURL(path.resolve('test-results/e2e-generated/motion-showcase.html')).href,
  );
  const images = () =>
    page.evaluate(async () => {
      const all = [...document.querySelectorAll<HTMLImageElement>('main img')];
      await Promise.all(all.map((image) => image.decode().catch(() => undefined)));
      return {
        count: all.length,
        unresolved: document.querySelectorAll('img[data-shared-src]').length,
        broken: all.filter((image) => image.naturalWidth === 0).length,
        lang: document.documentElement.lang,
      };
    });
  const first = await images();
  expect(first.count).toBeGreaterThan(4);
  expect(first).toMatchObject({ unresolved: 0, broken: 0 });

  await page.locator('[data-language-select]').first().selectOption('ru');
  const second = await images();
  expect(second).toMatchObject({ unresolved: 0, broken: 0, lang: 'ru' });
  expect(second.count).toBe(first.count);
});
