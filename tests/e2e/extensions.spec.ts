import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';

/**
 * Страница с составным блоком, поставщиком и островом в обоих форматах через `file://`. Остров
 * намеренно пробует сеть и страницу-хозяина: обе попытки обязаны провалиться, и браузер сообщает об
 * отказе сети ошибкой политики — поэтому здесь не общий набор с запретом любых ошибок консоли, а
 * явная проверка: ошибки страницы запрещены, ошибки консоли — только отказы подключения по CSP.
 */
const FIXTURE = path.resolve('tests/fixtures/extensions/page');

async function buildFixture(format: 'single-file' | 'directory'): Promise<string> {
  // Каждый тест и проект собирает свою копию: параллельные воркеры не делят каталог.
  const info = test.info();
  const root = path.resolve(
    'test-results/e2e-extensions',
    `${info.project.name}-${format}-${info.titlePath.at(-1)?.replace(/[^a-z0-9]+/giu, '-') ?? 'page'}`,
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await cp(FIXTURE, path.join(root, 'source'), { recursive: true });
  const output = path.join(root, format === 'directory' ? 'site' : 'page.html');
  await buildReport({ input: path.join(root, 'source'), output, format });
  return pathToFileURL(format === 'directory' ? path.join(output, 'index.html') : output).href;
}

for (const format of ['single-file', 'directory'] as const) {
  test.describe(`extensions in ${format} output`, () => {
    // Catches an island that never starts (page CSP without its hashes, broken srcdoc, no
    // controller), a lost init message, a height that is never applied, and an island that can
    // reach the network or the page.
    test('renders the block and the provider, and the island talks to the page', async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await page.goto(await buildFixture(format));

      await expect(page.locator('#metrics .semantic-callout')).toHaveCount(2);
      await expect(page.locator('#metrics .semantic-callout').first()).toContainText('12 400');
      await expect(page.locator('#pricing table td').first()).toHaveText('team');

      const figure = page.locator('figure.semantic-island');
      await expect(figure).toHaveAttribute('data-island-state', 'live');
      await expect(figure.locator('.semantic-island-static')).toBeHidden();
      const frame = page.frameLocator('iframe.semantic-island-frame');
      const body = frame.locator('body');
      await expect(body).toHaveAttribute('data-init', /"scheme":"(light|dark)"/u);
      const init = JSON.parse((await body.getAttribute('data-init')) ?? '{}') as {
        language?: string;
        accent?: string;
      };
      expect(init.language).toBe('en');
      expect(init.accent).not.toBe('');
      await expect(body).toHaveAttribute('data-parent', 'isolated');
      await expect(body).toHaveAttribute('data-network', 'blocked');

      const height = await page
        .locator('iframe.semantic-island-frame')
        .evaluate((element) => (element as HTMLIFrameElement).style.blockSize);
      expect(height).toMatch(/^\d+px$/u);

      await frame.locator('#add').click();
      await expect(frame.locator('#value')).toHaveText('1');

      expect(pageErrors).toEqual([]);
      expect(
        consoleErrors.filter(
          (text) =>
            !/Content Security Policy|violates the document's Content Security Policy/u.test(text),
        ),
      ).toEqual([]);
    });

    // Catches an island left off the page clock: a recording that seeks the page must seek the
    // island too.
    test('passes the page clock to the island', async ({ page }) => {
      await page.addInitScript(() => {
        (window as { __agenticReportClock?: string }).__agenticReportClock = 'manual';
      });
      await page.goto(await buildFixture(format));
      await expect(page.locator('figure.semantic-island')).toHaveAttribute(
        'data-island-state',
        'live',
      );
      await page.evaluate(() =>
        (window as { __clock?: { seek(t: number): void } }).__clock?.seek(2.5),
      );
      await expect(
        page.frameLocator('iframe.semantic-island-frame').locator('body'),
      ).toHaveAttribute('data-render-at', '2.5');
    });

    // Catches a page whose static equivalent depends on scripts: without them the reader must see
    // the island body, and no frame must appear.
    test('shows the static body without scripts and in print', async ({ browser }) => {
      const url = await buildFixture(format);
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(url);
      await expect(page.locator('.semantic-island-static')).toBeVisible();
      await expect(page.locator('.semantic-island-static')).toContainText('The counter starts at');
      await expect(page.locator('iframe')).toHaveCount(0);
      await context.close();

      const printing = await browser.newPage();
      await printing.goto(url);
      await expect(printing.locator('figure.semantic-island')).toHaveAttribute(
        'data-island-state',
        'live',
      );
      await printing.emulateMedia({ media: 'print' });
      await expect(printing.locator('.semantic-island-static')).toBeVisible();
      await expect(printing.locator('iframe.semantic-island-frame')).toBeHidden();
      await printing.close();
    });
  });
}

/**
 * The reference extensions shipped in `extensions/`, built from their own example pages in both formats:
 * the product theatre (a block and a provider) and the error-budget island.
 */
async function buildReference(
  extension: string,
  example: string,
  format: 'single-file' | 'directory',
): Promise<string> {
  const info = test.info();
  const root = path.resolve(
    'test-results/e2e-reference-extensions',
    `${info.project.name}-${format}-${extension}-${info.titlePath.at(-1)?.replace(/[^a-z0-9]+/giu, '-') ?? 'page'}`,
  );
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await cp(path.resolve('extensions', extension), path.join(root, 'source'), { recursive: true });
  const output = path.join(root, format === 'directory' ? 'site' : 'page.html');
  await buildReport({ input: path.join(root, 'source', example), output, format });
  return pathToFileURL(format === 'directory' ? path.join(output, 'index.html') : output).href;
}

for (const format of ['single-file', 'directory'] as const) {
  test.describe(`reference extensions in ${format} output`, () => {
    // Catches a provider whose output never reaches the page (a lost expansion inside the frame block),
    // beats that do not light the panels their event touches, and a run table that loses rows.
    test('the product theatre plays the run from its scenario', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(await buildReference('product-theatre', 'example-cli.md', format));

      const scene = page.locator('section#run');
      await expect(scene.locator('.semantic-beat')).toHaveCount(5);
      await expect(scene.locator('.semantic-beat').nth(2)).toContainText('2.9 s · build');
      await expect(page.locator('.semantic-disclosure table tbody tr')).toHaveCount(5);

      if ((page.viewportSize()?.width ?? 0) >= 912) {
        await expect(scene).toHaveAttribute('data-scene-live', '');
        const beat = scene.locator('.semantic-beat').nth(2);
        await beat.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const target = document.querySelectorAll('#run .semantic-beat')[2];
          if (target === undefined) return;
          const box = target.getBoundingClientRect();
          window.scrollBy(0, box.top + box.height / 2 - window.innerHeight / 2);
        });
        await expect(beat).toHaveAttribute('data-current', '');
        await expect(scene.locator('[data-node-id="page"][data-lit]').first()).toBeVisible();
        await expect(scene.locator('[data-node-id="terminal"][data-lit]')).toHaveCount(0);
      }
      expect(pageErrors).toEqual([]);
    });

    // Catches an island that never computes (a script refused by its policy), one that ignores the page
    // language or theme, one whose chart does not follow the page clock, and a static body lost in print.
    test('the error-budget island computes, follows the theme and the clock', async ({ page }) => {
      await page.addInitScript(() => {
        (window as { __agenticReportClock?: string }).__agenticReportClock = 'manual';
      });
      const url = await buildReference('slo-budget', 'example-guide.md', format);
      await page.goto(url);
      const figure = page.locator('figure.semantic-island');
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toHaveAttribute('data-island-state', 'live');
      const frame = page.frameLocator('iframe.semantic-island-frame');
      await expect(frame.locator('#budget')).toHaveText('43,2 мин');
      await expect(frame.locator('#verdict')).toContainText('29-й день из 30');

      await frame.locator('#bad').fill('50');
      await expect(frame.locator('#verdict')).toHaveAttribute('data-state', 'over');

      const surface = () =>
        frame.locator('html').evaluate((root) => root.style.getPropertyValue('--color-surface'));
      const before = await surface();
      expect(before).not.toBe('');
      await page.evaluate(() => {
        document.documentElement.dataset.scheme =
          document.documentElement.dataset.scheme === 'dark' ? 'light' : 'dark';
      });
      await expect.poll(surface).not.toBe(before);

      const offsets = () =>
        frame
          .locator('#chart')
          .evaluate((chart) =>
            ['#spent-line', '#projection'].map(
              (selector) => (chart.querySelector(selector) as SVGElement).style.strokeDashoffset,
            ),
          );
      await page.evaluate(() =>
        (window as { __clock?: { seek(t: number): void } }).__clock?.seek(0.25),
      );
      await expect.poll(offsets).toEqual(['0.5', '1']);
      await page.evaluate(() =>
        (window as { __clock?: { seek(t: number): void } }).__clock?.seek(3),
      );
      await expect.poll(offsets).toEqual(['0', '0']);

      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.semantic-island-static')).toBeVisible();
      await expect(page.locator('.semantic-island-static')).toContainText('43,2 мин');
    });
  });
}
