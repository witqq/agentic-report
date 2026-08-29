import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

const root = path.resolve('test-results/e2e-generated');
const captures = path.resolve('test-results/captures/copyable-prose');
const cases = [
  {
    name: 'english-single-file',
    url: pathToFileURL(path.join(root, 'interactive-catalog.html')).href,
    locale: 'en',
    expected:
      'Deploy after two checks are complete.\n\nRead the rollback runbook and confirm the decision packet before the handoff.',
  },
  {
    name: 'english-directory',
    url: pathToFileURL(path.join(root, 'copyable-prose-directory/index.html')).href,
    locale: 'en',
    expected:
      'Deploy after two checks are complete.\n\nRead the rollback runbook and confirm the decision packet before the handoff.',
  },
  {
    name: 'russian-single-file',
    url: pathToFileURL(path.join(root, 'russian-chrome.html')).href,
    locale: 'ru',
    expected:
      'Сначала проверьте владельца.\n\nОткройте план отката и сверьтесь с локусом перед отправкой.',
  },
  {
    name: 'russian-directory',
    url: pathToFileURL(path.join(root, 'russian-chrome-directory/index.html')).href,
    locale: 'ru',
    expected:
      'Сначала проверьте владельца.\n\nОткройте план отката и сверьтесь с локусом перед отправкой.',
  },
] as const;

for (const fixture of cases) {
  test(`${fixture.name} copies rendered prose with localized keyboard states`, async ({
    page,
  }, info) => {
    await mkdir(captures, { recursive: true });
    await page.addInitScript(() => {
      Reflect.set(globalThis, '__copiedProse', '');
      Reflect.set(globalThis, '__copyProseFails', false);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if (Reflect.get(globalThis, '__copyProseFails') === true)
              throw new Error('controlled prose clipboard failure');
            Reflect.set(globalThis, '__copiedProse', value);
          },
        },
      });
    });
    await page.goto(fixture.url);
    const copyable = page.locator('[data-copyable-prose]').first();
    const content = copyable.locator('[data-copyable-content]');
    const button = copyable.locator('[data-copy-prose]');
    await expect(copyable).toBeVisible();
    await expect(copyable.locator('p')).toHaveCount(2);
    await expect(copyable.locator('pre, code')).toHaveCount(0);
    await expect(content).not.toContainText(/Copy|Копировать/u);
    const reviewControls = copyable.locator(
      '[data-review-target-control], [data-review-target-resolve]',
    );
    await reviewControls.evaluateAll((controls) => {
      for (const control of controls) (control as HTMLElement).hidden = false;
    });
    const style = await content.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { fontFamily: computed.fontFamily, whiteSpace: computed.whiteSpace };
    });
    expect(style.fontFamily.toLowerCase()).not.toContain('mono');
    expect(style.whiteSpace).toBe('normal');

    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button).toContainText(fixture.locale === 'ru' ? 'Скопировано' : 'Copied');
    expect(await page.evaluate(() => Reflect.get(globalThis, '__copiedProse'))).toBe(
      fixture.expected,
    );
    await reviewControls.evaluateAll((controls) => {
      for (const control of controls) (control as HTMLElement).hidden = true;
    });

    const authoredText = await content.innerText();
    await expect(button).toContainText(fixture.locale === 'ru' ? 'Копировать' : 'Copy');
    await page.evaluate(() => Reflect.set(globalThis, '__copyProseFails', true));
    await button.focus();
    await page.keyboard.press('Space');
    await expect(button).toContainText(
      fixture.locale === 'ru' ? 'Копирование недоступно' : 'Copy unavailable',
    );
    expect(await content.innerText()).toBe(authoredText);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    if (fixture.name.includes('directory')) {
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = element.dataset.theme === 'dark' ? 'light' : 'dark';
      });
    }
    await copyable.screenshot({
      path: path.join(captures, `${fixture.name}-${info.project.name}.png`),
    });
  });
}
