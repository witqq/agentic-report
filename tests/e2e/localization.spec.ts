import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Download, Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const root = path.resolve('test-results/e2e-generated');
const artifactUrl = (name: string): string => pathToFileURL(path.join(root, name)).href;
const landingFormats = [
  artifactUrl('public-landing.html'),
  artifactUrl('public-landing-directory/index.html'),
] as const;
const interactiveFormats = [
  artifactUrl('interactive-catalog.html'),
  artifactUrl('copyable-prose-directory/index.html'),
] as const;
const visualizationFormats = [
  artifactUrl('visualization-catalog.html'),
  artifactUrl('visualization-catalog-directory/index.html'),
] as const;

test('system locale selects Russian and the visible switcher changes the complete page', async ({
  page,
}, info) => {
  await useSystemLanguages(page, ['ru-RU', 'en-US']);
  await mkdir(path.resolve('test-results/captures/localization'), { recursive: true });

  for (const [index, url] of landingFormats.entries()) {
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle(
      'agentic-report — декларативные интерактивные страницы для передачи результатов агента',
    );
    await expect(
      page.getByRole('heading', {
        name: 'Дайте агенту страницу, которую не стыдно передать.',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.locator('[data-navigation] a').first()).toHaveText('Доказательство');
    await expect(page.getByRole('combobox', { name: 'Язык' })).toHaveValue('ru');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'Превратите декларативный Markdown в готовую интерактивную страницу, которую агент передаст человеку.',
    );

    if (index === 0) {
      await page.screenshot({
        path: path.resolve(
          'test-results/captures/localization',
          `landing-ru-${info.project.name}.png`,
        ),
        fullPage: true,
      });
    }

    await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(
      'agentic-report — declarative interactive pages for agent handoffs',
    );
    await expect(
      page.getByRole('heading', { name: 'Give your agent a page worth handing over.', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('[data-navigation] a').first()).toHaveText('Proof');
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeFocused();

    if (index === 0) {
      await page.screenshot({
        path: path.resolve(
          'test-results/captures/localization',
          `landing-en-${info.project.name}.png`,
        ),
        fullPage: true,
      });
    }
  }
});

test('locale matching respects browser preference order and falls back to the primary page', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await useSystemLanguages(page, ['fr-FR', 'ru-RU', 'en-US']);
  await page.goto(landingFormats[0]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  await page.evaluate(() => sessionStorage.setItem('localization-test', 'reload'));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR'],
    });
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
});

test('single-language pages do not render a language switcher', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await useSystemLanguages(page, ['ru-RU']);
  await page.goto(artifactUrl('russian-chrome.html'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru-RU');
  await expect(page.locator('[data-language-select]')).toHaveCount(0);

  await page.goto(artifactUrl('fallback-chrome.html'));
  await expect(page.locator('[data-language-select]')).toHaveCount(0);
});

test('review threads and response drafts stay isolated and survive language switches', async ({
  page,
}, info) => {
  await useSystemLanguages(page, ['en-US']);
  await page.goto(artifactUrl('review-workspace.html'));

  await createReviewNote(page, '68%', 'English review note.');
  await closeReviewPopover(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.locator('[data-review-highlight-marker]')).toHaveCount(0);
  await createReviewNote(page, '68%', 'Русская заметка ревью.');
  await closeReviewPopover(page);

  await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
  await page.locator('[data-review-highlight-marker]').click();
  await expect(page.locator('[data-review-thread-messages]')).toContainText('English review note.');
  await closeReviewPopover(page);

  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await page.locator('[data-review-highlight-marker]').click();
  await expect(page.locator('[data-review-thread-messages]')).toContainText(
    'Русская заметка ревью.',
  );
  await closeReviewPopover(page);
  await page.locator('[data-review-toggle]').click();
  const reviewDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать review.json' }).click();
  const review = JSON.parse((await readDownload(await reviewDownload)).toString('utf8')) as {
    contractVersion: number;
    report: { locale?: string };
    threads: unknown[];
  };
  expect(review).toMatchObject({ contractVersion: 4, report: { locale: 'ru' } });
  expect(review.threads).toHaveLength(1);

  await page.goto(artifactUrl('response-workspace.html'));
  const englishSummary = page.locator(
    '[data-response-question="summary"] [data-response-global-text]',
  );
  await englishSummary.fill('English draft.');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  const russianSummary = page.locator(
    '[data-response-question="summary"] [data-response-global-text]',
  );
  await expect(russianSummary).toHaveValue('');
  await russianSummary.fill('Русский черновик.');
  await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
  await expect(englishSummary).toHaveValue('English draft.');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(russianSummary).toHaveValue('Русский черновик.');

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    info.project.name,
  ).toBe(true);
});

test('interactive component state remains locale-local across switches in both formats', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await useSystemLanguages(page, ['en-US']);

  for (const url of interactiveFormats) {
    await page.goto(url);
    const englishDirectory = page.getByRole('tab', { name: 'Directory' });
    await englishDirectory.click();
    await page.getByRole('searchbox', { name: 'Filter' }).fill('modal');

    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
    await expect(
      page.getByRole('heading', { name: 'Каталог интерактивных компонентов', level: 1 }),
    ).toBeVisible();
    const russianDirectory = page.getByRole('tab', { name: 'Каталог', exact: true }).first();
    await russianDirectory.click();
    const russianEvidence = page.getByRole('switch', {
      name: 'Показать доказательства проверки',
    });
    await russianEvidence.click();

    await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
    await expect(englishDirectory).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Filter' })).toHaveValue('modal');

    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
    await expect(russianDirectory).toHaveAttribute('aria-selected', 'true');
    await expect(russianEvidence).toHaveAttribute('aria-checked', 'true');
  }
});

test('visualization titles, accessible data, and number formatting switch coherently', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await useSystemLanguages(page, ['en-US']);

  for (const url of visualizationFormats) {
    await page.goto(url);
    await expect(page.getByRole('img', { name: /Weekly active agents/u })).toBeVisible();
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');

    const adoption = page.getByRole('img', { name: /Еженедельно активные агенты/u });
    await expect(adoption).toBeVisible();
    await expect(adoption).toHaveAccessibleDescription(/С поддержкой, Н1: 42/u);
    await expect(
      page.getByRole('img', { name: /Успешные первые сборки/u }),
    ).toHaveAccessibleDescription(/Н1: 61,5/u);
    await expect(
      page.getByRole('img', { name: /Поток офлайн-компиляции/u }),
    ).toHaveAccessibleDescription(/Группы: authoring: Граф авторинга/u);

    await page.getByRole('combobox', { name: 'Язык' }).selectOption('en');
    await expect(page.getByRole('img', { name: /Weekly active agents/u })).toBeVisible();
  }
});

async function useSystemLanguages(page: Page, languages: readonly string[]): Promise<void> {
  await page.addInitScript((preferred) => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => preferred,
    });
  }, languages);
}

async function createReviewNote(page: Page, needle: string, message: string): Promise<void> {
  const target = page.locator('p[data-review-target]').filter({ hasText: needle }).first();
  await selectText(target, needle);
  await page.getByRole('button', { name: /Создать заметку|Create note/u }).click();
  await page.locator('[data-review-message]').fill(message);
  await page.getByRole('button', { name: /Добавить сообщение|Add message/u }).click();
}

async function selectText(target: Locator, needle: string): Promise<void> {
  await target.evaluate((owner, value) => {
    const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(value) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + value.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error(`Missing selectable text: ${value}`);
  }, needle);
}

async function closeReviewPopover(page: Page): Promise<void> {
  if (await page.locator('[data-review-popover]').isVisible()) {
    await page.locator('[data-review-popover-close]').click();
  }
}

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
