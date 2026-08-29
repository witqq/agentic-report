import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { PAGE_MOTION_POLICY } from '../../src/page-motion.js';
import { test, expect } from './fixtures.js';

const artifactUrl = pathToFileURL(path.resolve('test-results/e2e-artifact/report.html')).href;
const directoryArtifactUrl = pathToFileURL(
  path.resolve('test-results/e2e-generated/directory-artifact/index.html'),
).href;
const layoutArtifactUrl = (name: string): string =>
  pathToFileURL(path.resolve('test-results/e2e-generated', `${name}.html`)).href;

const interactiveArtifactUrl = layoutArtifactUrl('interactive-catalog');
const starterArtifactUrl = (id: string): string => layoutArtifactUrl(`starter-${id}`);
const landingSectionArtifacts = [
  { format: 'single-file', url: starterArtifactUrl('landing') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/starter-landing-directory/index.html'),
    ).href,
  },
] as const;
const visualizationArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('visualization-catalog') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/visualization-catalog-directory/index.html'),
    ).href,
  },
] as const;
const incidentReviewArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('incident-review') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/incident-review-directory/index.html'),
    ).href,
  },
] as const;
const vendorDecisionArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('vendor-decision') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/vendor-decision-directory/index.html'),
    ).href,
  },
] as const;
const launchReadinessArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('launch-readiness') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/launch-readiness-directory/index.html'),
    ).href,
  },
] as const;
const navigationArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('navigation') },
  {
    format: 'directory',
    url: pathToFileURL(path.resolve('test-results/e2e-generated/navigation-directory/index.html'))
      .href,
  },
] as const;
const defaultMotionArtifacts = [
  { format: 'single-file', url: artifactUrl },
  { format: 'directory', url: directoryArtifactUrl },
] as const;
const glossaryCodeArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('glossary-code') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/glossary-code-directory/index.html'),
    ).href,
  },
] as const;
const diagramTourArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('diagram-tour') },
  {
    format: 'directory',
    url: pathToFileURL(path.resolve('test-results/e2e-generated/diagram-tour-directory/index.html'))
      .href,
  },
] as const;
const russianChromeArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('russian-chrome') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/russian-chrome-directory/index.html'),
    ).href,
  },
] as const;
const russianPriorArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('russian-prior') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/russian-prior-directory/index.html'),
    ).href,
  },
] as const;
const fallbackChromeArtifacts = [
  { format: 'single-file', url: layoutArtifactUrl('fallback-chrome') },
  {
    format: 'directory',
    url: pathToFileURL(
      path.resolve('test-results/e2e-generated/fallback-chrome-directory/index.html'),
    ).href,
  },
] as const;

for (const artifact of fallbackChromeArtifacts) {
  test(`${artifact.format} keeps English fallback under a Russian browser locale`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'language', { configurable: true, value: 'ru-RU' });
      Object.defineProperty(navigator, 'languages', { configurable: true, value: ['ru-RU', 'ru'] });
    });
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'und');
    await expect(page.locator('html')).toHaveAttribute('data-package-locale', 'en');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Toggle color theme' })).toBeVisible();
    await expect(page.locator('[data-copy-code]').first()).toContainText('Copy');
    expect(await page.evaluate(() => navigator.language)).toBe('ru-RU');
    expect(await page.locator('body').innerText()).not.toContain('Перейти к содержимому');
  });
}

for (const artifact of russianChromeArtifacts) {
  test(`${artifact.format} derives all reader chrome from Russian source language`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      Reflect.set(globalThis, '__copyShouldFail', false);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            if (Reflect.get(globalThis, '__copyShouldFail') === true) {
              throw new Error('Controlled clipboard failure');
            }
          },
        },
      });
    });
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru-RU');
    await expect(page.locator('html')).toHaveAttribute('data-package-locale', 'ru');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Переключить цветовую тему' })).toBeVisible();

    const navigation = page.locator('[data-nav-toggle]');
    await expect(navigation).toHaveAccessibleName(/Скрыть содержание|Открыть содержание/);
    await navigation.click();
    await expect(navigation).toHaveAccessibleName(/Показать содержание|Закрыть содержание/);
    if ((await navigation.getAttribute('aria-label')) === 'Закрыть содержание') {
      await page.locator('[data-nav-close]').click();
      await expect(navigation).toHaveAccessibleName('Открыть содержание');
    }

    const filter = page.getByRole('searchbox', { name: 'Фильтр' });
    await expect(filter).toHaveAttribute('placeholder', 'Фильтровать элементы');
    await filter.fill('Копирование');
    await expect(page.locator('[data-filter-count]')).toHaveText('1 элемент');

    const copy = page.locator('[data-copy-code]').first();
    await expect(copy).toContainText('Копировать');
    await copy.click();
    await expect(copy).toContainText('Скопировано');
    await expect(copy).toContainText('Копировать');
    await page.evaluate(() => Reflect.set(globalThis, '__copyShouldFail', true));
    await copy.click();
    await expect(copy).toContainText('Копирование недоступно');

    const glossaryTrigger = page.locator('[data-glossary-trigger]').first();
    await glossaryTrigger.click();
    await expect(page.locator('[data-glossary-definition-link]').first()).toHaveText(
      'Открыть полное определение',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-glossary-panel]').first()).toBeHidden();
    await page.getByRole('button', { name: 'Открыть диалог' }).click();
    await expect(page.getByRole('dialog', { name: 'Проверка модального окна' })).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Показать подробности' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Увеличить' })).toBeVisible();
    await expect(page.locator('[aria-label="Легенда"]')).toBeVisible();
    await expect(page.locator('[data-chart-type="bar"] desc')).toContainText(
      'Результат, А: 1 234,5',
    );
    await expect(page.locator('[data-diagram-type="flow"] desc')).toContainText(
      'Узлы: first: Первый; second: Второй. Связи: first к second: переход.',
    );

    const review = page.locator('[data-review-toggle]');
    await review.click();
    await expect(
      page.getByRole('button', { name: 'Открыть обсуждение: Разделитель' }),
    ).toBeVisible();
    const dialog = page.locator('[data-review-dialog]');
    const target = page.locator('[data-review-target-control]').first();
    await target.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Пространство ревью');
    await expect(dialog).toContainText('0 обсуждений · открыто: 0');

    await page.locator('[data-review-add-message]').click();
    await expect(page.locator('[data-review-error]')).toHaveText(
      'Введите сообщение для выбранного блока.',
    );
    await page.locator('[data-review-message]').fill('Первоначальный комментарий.');
    await page.locator('[data-review-add-message]').click();
    await expect(dialog).toContainText('1 обсуждение · открыто: 1');
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Первоначальный комментарий.',
    );
    await expect(page.locator('[data-review-thread-messages]')).toContainText('Вы');
    await page.getByRole('button', { name: 'Изменить' }).click();
    await expect(page.locator('[data-review-add-message]')).toHaveText('Сохранить сообщение');
    await page.locator('[data-review-message]').fill('Исправленный комментарий.');
    await page.locator('[data-review-add-message]').click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Исправленный комментарий.',
    );
    const resolution = page.locator('[data-review-resolve-thread]');
    await expect(resolution).toHaveText('Закрыть обсуждение');
    await resolution.click();
    await expect(resolution).toHaveText('Возобновить обсуждение');
    await resolution.click();
    await expect(resolution).toHaveText('Закрыть обсуждение');
    await page.locator('[data-review-import]').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    });
    await expect(page.locator('[data-review-error]')).toHaveText('Не удалось импортировать ревью.');

    const packageEnglish = [
      'Skip to content',
      'Copy unavailable',
      'Review workspace',
      'No discussion threads yet',
      'Filter items',
    ];
    const chrome = await page.locator('body').innerText();
    for (const label of packageEnglish) expect(chrome).not.toContain(label);
    const capturePath = path.resolve(
      'test-results/captures/localization',
      `${artifact.format}-${testInfo.project.name}.png`,
    );
    await mkdir(path.dirname(capturePath), { recursive: true });
    await page.screenshot({ path: capturePath, fullPage: true });
  });
}

for (const artifact of russianPriorArtifacts) {
  test(`${artifact.format} localizes stale prior-review classifications`, async ({ page }) => {
    await page.goto(artifact.url);
    await page.locator('[data-review-toggle]').click();
    await page.locator('[data-review-target-control]').first().click();
    const prior = page.locator('[data-review-prior-section]');
    await expect(prior).toBeVisible();
    await expect(prior).toContainText('Предыдущее · изменено · открыто');
    await expect(prior).toContainText('Предыдущее · точно · закрыто');
    await expect(prior).toContainText('Вы: Изменено.');
    await expect(prior).toContainText('Агент: Без изменений.');
    expect(await prior.innerText()).not.toMatch(/\b(?:exact|changed|missing|ambiguous)\b/u);
  });
}

for (const artifact of defaultMotionArtifacts) {
  test(`${artifact.format} source link opens the loopback helper without replacing the file report`, async ({
    page,
  }, testInfo) => {
    const helperUrl =
      'http://127.0.0.1:7789/open?path=%2Fworkspace%2Fagentic-report%2Fsrc%2Frender%2Fdirectives.ts&line=42';
    await page.context().route('http://127.0.0.1:7789/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });
    await page.goto(artifact.url);
    const reportUrl = page.url();
    const link = page.getByRole('link', { name: 'src/render/directives.ts:42' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', helperUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await link.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
      'SFMono-Regular',
    );

    const capturePath = path.resolve(
      'test-results/captures/source-link',
      `${artifact.format}-${testInfo.project.name}.png`,
    );
    await mkdir(path.dirname(capturePath), { recursive: true });
    await page.screenshot({ path: capturePath });

    const popupPromise = page.waitForEvent('popup');
    if (artifact.format === 'single-file' && testInfo.project.name === 'desktop-chromium') {
      expect(await link.evaluate((element) => element.tabIndex)).toBe(0);
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(
        await link.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
      ).toBeGreaterThan(0);
      await page.keyboard.press('Enter');
    } else if (testInfo.project.name.startsWith('mobile')) await link.tap();
    else await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(helperUrl);
    await popup.close();
    expect(page.url()).toBe(reportUrl);
    await expect(page.getByRole('heading', { name: 'Architecture report' })).toBeVisible();
  });
}

for (const artifact of glossaryCodeArtifacts) {
  test(`${artifact.format} glossary keeps authored prose forms and first highlighted code references`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            Reflect.set(globalThis, '__copiedCode', value);
          },
        },
      });
    });
    await page.goto(artifact.url);
    if (artifact.format === 'directory') {
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = 'dark';
      });
    }

    const prose = page.getByRole('button', { name: 'concepts' });
    await expect(prose).toBeVisible();
    await prose.focus();
    const proseDialog = page.getByRole('dialog', { name: 'concept' });
    await expect(proseDialog).toBeVisible();
    await expect(proseDialog).toContainText('Canonical prose definition.');
    await page.keyboard.press('Escape');
    await expect(prose).toBeFocused();

    const marked = page.locator('pre').nth(0);
    const plain = page.locator('pre').nth(1);
    const decorator = marked.getByRole('button', { name: '@d.def' });
    const nodeType = marked.getByRole('button', { name: 'Node' });
    await expect(decorator).toHaveCount(1);
    await expect(nodeType).toHaveCount(1);
    await expect(marked.locator('[data-term-reference="own-field"]')).toHaveCount(1);
    await expect(marked.locator('[data-term-reference="node-type"]')).toHaveCount(1);
    const characterColors = async (code: Locator): Promise<readonly string[]> =>
      code.locator('code').evaluate((element) => {
        const colors: string[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current !== null) {
          const parent = current.parentElement;
          if (parent !== null && parent.closest('[data-glossary-panel]') === null) {
            for (const character of current.textContent ?? '') {
              colors.push(`${character}:${getComputedStyle(parent).color}`);
            }
          }
          current = walker.nextNode();
        }
        return colors;
      });
    const markedColors = await characterColors(marked);
    const plainColors = await characterColors(plain);
    expect(markedColors).toEqual(plainColors);

    if (testInfo.project.name.startsWith('mobile')) await decorator.tap();
    else await decorator.hover();
    const codeDialogId = await decorator.getAttribute('aria-controls');
    if (codeDialogId === null) throw new Error('Code glossary control is unlabelled.');
    const codeDialog = page.locator(`#${codeDialogId}`);
    await expect(page.getByRole('dialog', { name: '@d.def' })).toBeVisible();
    await expect(codeDialog).toBeVisible();
    await expect(codeDialog).toContainText('Field ownership decorator.');
    expect(
      await codeDialog.evaluate((panel) => ({
        inBody: panel.parentElement === document.body,
        portaled: panel.hasAttribute('data-glossary-portal'),
      })),
    ).toEqual({ inBody: true, portaled: true });
    const tooltipGeometry = await decorator.evaluate((trigger) => {
      const controlled = trigger.getAttribute('aria-controls');
      const panel = controlled === null ? null : document.getElementById(controlled);
      if (!(panel instanceof HTMLElement)) throw new Error('Code glossary panel is missing.');
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        attached:
          Math.abs(panelRect.top - triggerRect.bottom) <= 1 ||
          Math.abs(panelRect.bottom - triggerRect.top) <= 1,
        overlapsInline: panelRect.left <= triggerRect.right && panelRect.right >= triggerRect.left,
        contained:
          panelRect.top >= 0 &&
          panelRect.left >= 0 &&
          panelRect.right <= innerWidth &&
          panelRect.bottom <= innerHeight,
      };
    });
    expect(tooltipGeometry).toEqual({ attached: true, overlapsInline: true, contained: true });
    await decorator.focus();
    await page.evaluate(() => window.scrollBy(0, 80));
    await expect(codeDialog).toBeVisible();
    expect(
      await decorator.evaluate((trigger) => {
        const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
        if (!(panel instanceof HTMLElement)) return false;
        const triggerRect = trigger.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return (
          Math.abs(panelRect.top - triggerRect.bottom) <= 1 ||
          Math.abs(panelRect.bottom - triggerRect.top) <= 1
        );
      }),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(codeDialog).toBeHidden();
    await expect(decorator).toBeFocused();
    expect(
      await codeDialog.evaluate((panel) => panel.closest('.semantic-code-term') !== null),
    ).toBe(true);

    await marked.getByRole('button', { name: 'Copy' }).click();
    expect(await page.evaluate(() => Reflect.get(globalThis, '__copiedCode'))).toBe(
      '@d.def(Node) accessor child!: Node;\n@d.def(Node) accessor sibling!: Node;',
    );

    await decorator.click();
    const definitionLink = codeDialog.getByRole('link', { name: 'View full definition' });
    await expect(definitionLink).toHaveAttribute('href', '#glossary-own-field');
    await definitionLink.click();
    await expect(page).toHaveURL(/#glossary-own-field$/u);
    await expect(page.locator('#glossary-own-field')).toBeInViewport();
    await expect(page.locator('[data-navigation] a')).toHaveText([
      'Prose forms',
      'Highlighted code',
    ]);
    await expect(page.locator('[data-glossary-appendix]')).toContainText('Canonical node type.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const capturePath = path.resolve(
      'test-results/captures/code-glossary',
      `${artifact.format}-${testInfo.project.name}.png`,
    );
    await mkdir(path.dirname(capturePath), { recursive: true });
    await page.screenshot({ path: capturePath, fullPage: true });
  });
}

for (const artifact of diagramTourArtifacts) {
  test(`${artifact.format} grouped flow and sequence remain readable and contained from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    if (artifact.format === 'directory') {
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = 'dark';
      });
    }

    const flow = page.getByRole('img', { name: 'Code tour grouped flow' });
    const sequence = page.getByRole('img', { name: 'Compile request sequence' });
    await expect(flow).toBeVisible();
    await expect(sequence).toBeVisible();
    await expect(flow).toHaveAccessibleDescription(
      /Groups: source: Authentication and authorization services \(step-1, step-2, step-3, step-4, step-5, step-6\).*reader: Reader artifact.*step-18: Step 18 detail/u,
    );
    await expect(sequence).toHaveAccessibleDescription(
      /Participants: agent: Authoring agent.*Messages in order: 1\. agent to loader: load source; 2\. loader to compiler: validated graph; 3\. compiler to browser: write artifact; 4\. browser to agent: review result/u,
    );
    await expect(page.locator('[data-diagram-type="flow"] [data-group-id]')).toHaveCount(3);
    await expect(page.locator('[data-diagram-type="flow"] [data-node-id]')).toHaveCount(18);
    await expect(page.locator('[data-diagram-type="flow"] .visualization-group-edge')).toHaveCount(
      2,
    );
    await expect(
      page.locator('[data-diagram-type="flow"] .visualization-group-internal-edge'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-diagram-type="flow"] .visualization-group-outer-edge'),
    ).toHaveCount(3);
    expect(
      await page
        .locator('[data-diagram-type="flow"] .visualization-group-outer-edge')
        .evaluateAll((edges) => edges.map((edge) => edge.getAttribute('data-route-lane'))),
    ).toEqual(['694', '714', '734']);
    await expectDiagramEdgesAvoidNodes(flow);
    await expect(page.locator('[data-diagram-type="sequence"] [data-participant]')).toHaveCount(4);
    await expect(page.locator('[data-diagram-type="sequence"] [data-message-order]')).toHaveCount(
      4,
    );
    expect(
      await page
        .locator('[data-diagram-type="sequence"] [data-message-order]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-message-order')),
        ),
    ).toEqual(['1', '2', '3', '4']);

    const groupContainment = await page.locator('[data-diagram-type="flow"]').evaluate((root) => {
      const groups = [...root.querySelectorAll<SVGGElement>('[data-group-id]')];
      return groups.every((group) => {
        const id = group.getAttribute('data-group-id');
        const boundary = group.querySelector<SVGRectElement>('.visualization-group')?.getBBox();
        if (boundary === undefined) return false;
        const members = [...root.querySelectorAll<SVGGElement>(`[data-group="${id}"]`)];
        const labels = [...group.querySelectorAll<SVGTextElement>('.visualization-group-label')];
        return (
          members.length > 0 &&
          labels.length > 0 &&
          labels.every((label) => {
            const box = label.getBBox();
            return (
              box.x >= boundary.x &&
              box.y >= boundary.y &&
              box.x + box.width <= boundary.x + boundary.width &&
              box.y + box.height <= boundary.y + 54
            );
          }) &&
          members.every((member) => {
            const box = member.getBBox();
            return (
              box.x >= boundary.x &&
              box.y >= boundary.y &&
              box.x + box.width <= boundary.x + boundary.width &&
              box.y + box.height <= boundary.y + boundary.height
            );
          })
        );
      });
    });
    expect(groupContainment).toBe(true);

    const geometry = await page.locator('[data-visualization="diagram"]').evaluateAll((figures) =>
      figures.map((figure) => {
        const frame = figure.querySelector<HTMLElement>('.visualization-frame');
        const svg = figure.querySelector<SVGSVGElement>('svg');
        const label = figure.querySelector<SVGTextElement>('.visualization-node-label');
        if (frame === null || svg === null || label === null)
          throw new Error('Diagram geometry missing.');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        return {
          frameContained: frame.scrollWidth <= frame.clientWidth,
          effectiveLabelSize: Number.parseFloat(getComputedStyle(label).fontSize) * scale,
        };
      }),
    );
    if (testInfo.project.name.startsWith('desktop')) {
      expect(geometry.every((item) => item.frameContained)).toBe(true);
      expect(geometry.every((item) => item.effectiveLabelSize >= 11)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const groupFill = page.locator('.visualization-group').first();
    const before = await groupFill.evaluate((element) => getComputedStyle(element).fill);
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    const after = await groupFill.evaluate((element) => getComputedStyle(element).fill);
    expect(after).not.toBe(before);
    await page.getByRole('button', { name: 'Toggle color theme' }).click();

    const capturePath = path.resolve(
      'test-results/captures/diagram-tour',
      `${artifact.format}-${testInfo.project.name}.png`,
    );
    await mkdir(path.dirname(capturePath), { recursive: true });
    await page.screenshot({ path: capturePath, fullPage: true });
  });
}

const presetShowcases = [
  {
    name: 'landing',
    preset: 'studio',
    heading: 'From Markdown to a page worth sharing',
    artifacts: landingSectionArtifacts,
  },
  {
    name: 'launch-readiness',
    preset: 'studio',
    heading: 'Regional beta launch readiness',
    artifacts: launchReadinessArtifacts,
  },
  {
    name: 'vendor-decision',
    preset: 'editorial',
    heading: 'AI support vendor decision packet',
    artifacts: vendorDecisionArtifacts,
  },
  {
    name: 'incident-review',
    preset: 'signal',
    heading: 'OrbitDesk P1 incident review',
    artifacts: incidentReviewArtifacts,
  },
] as const;

const presetRepresentatives = [presetShowcases[0], presetShowcases[2], presetShowcases[3]] as const;

const presetFixtureExpectations = [
  {
    preset: 'studio',
    density: 'comfortable',
    font: 'sans',
    accent: 'indigo',
    width: 'standard',
    radius: 'soft',
    fontFamily: 'Inter',
    lineHeight: 26.4,
    contentWidth: '76rem',
    headingWeight: '780',
    surfaceRadius: '14.4px',
    sectionMargin: 60,
    lightBackground: 'rgb(244, 246, 251)',
    darkBackground: 'rgb(12, 17, 28)',
  },
  {
    preset: 'editorial',
    density: 'comfortable',
    font: 'serif',
    accent: 'indigo',
    width: 'wide',
    radius: 'sharp',
    fontFamily: 'Inter',
    lineHeight: 26.88,
    contentWidth: '94rem',
    headingWeight: '610',
    surfaceRadius: '0px',
    sectionMargin: 64,
    lightBackground: 'rgb(244, 240, 231)',
    darkBackground: 'rgb(23, 23, 19)',
  },
  {
    preset: 'signal',
    density: 'compact',
    font: 'sans',
    accent: 'teal',
    width: 'wide',
    radius: 'sharp',
    fontFamily: 'Inter',
    lineHeight: 24.8,
    contentWidth: '94rem',
    headingWeight: '800',
    surfaceRadius: '4px',
    sectionMargin: 34.32,
    lightBackground: 'rgb(244, 246, 251)',
    darkBackground: 'rgb(12, 17, 28)',
  },
] as const;

const expectedPresetCapturePaths = [
  'editorial/directory/dark/desktop.png',
  'editorial/directory/dark/mobile.png',
  'editorial/directory/light/desktop.png',
  'editorial/directory/light/mobile.png',
  'editorial/single-file/dark/desktop.png',
  'editorial/single-file/dark/mobile.png',
  'editorial/single-file/light/desktop.png',
  'editorial/single-file/light/mobile.png',
  'signal/directory/dark/desktop.png',
  'signal/directory/dark/mobile.png',
  'signal/directory/light/desktop.png',
  'signal/directory/light/mobile.png',
  'signal/single-file/dark/desktop.png',
  'signal/single-file/dark/mobile.png',
  'signal/single-file/light/desktop.png',
  'signal/single-file/light/mobile.png',
  'studio/directory/dark/desktop.png',
  'studio/directory/dark/mobile.png',
  'studio/directory/light/desktop.png',
  'studio/directory/light/mobile.png',
  'studio/single-file/dark/desktop.png',
  'studio/single-file/dark/mobile.png',
  'studio/single-file/light/desktop.png',
  'studio/single-file/light/mobile.png',
] as const;

const starters = [
  {
    id: 'basic',
    heading: 'Release decision report',
    layout: 'document',
    component: '.semantic-timeline',
    image: 'Evidence moving from source through verification to a release decision',
  },
  {
    id: 'research',
    heading: 'Assisted authoring research synthesis',
    layout: 'mixed',
    component: '.semantic-chart',
    image: 'Research inputs converging into a recommendation',
  },
  {
    id: 'architecture',
    heading: 'Portable page architecture',
    layout: 'document',
    component: '.semantic-diagram',
    image: 'The source, compiler, artifact, and browser boundary',
  },
  {
    id: 'tutorial',
    heading: 'Build your first portable page',
    layout: 'document',
    component: '.semantic-demo',
  },
  {
    id: 'dashboard',
    heading: 'Delivery control room',
    layout: 'dashboard',
    component: '.semantic-filter',
  },
  {
    id: 'landing',
    heading: 'From Markdown to a page worth sharing',
    layout: 'landing',
    component: '.semantic-timeline',
  },
] as const;

async function expectCurrentNavigation(page: Page, targetId: string): Promise<void> {
  const current = page.locator('[data-navigation] a[aria-current="location"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('href', `#${targetId}`);
}

interface MotionEvidence {
  readonly rafRequests: number;
  readonly documentScrollAdds: number;
  readonly documentScrollRemoves: number;
  readonly windowResizeAdds: number;
  readonly windowResizeRemoves: number;
  readonly observers: number;
  readonly observerDisconnects: number;
  readonly revealTargets: number;
  readonly revealUnobserves: number;
}

async function readMotionEvidence(page: Page): Promise<MotionEvidence> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          readonly __motionEvidence: MotionEvidence;
        }
      ).__motionEvidence,
  );
}

for (const starter of starters) {
  test(`starter ${starter.id} is useful, responsive, and interactive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(starterArtifactUrl(starter.id));
    await expect(page.locator('html')).toHaveAttribute('data-layout', starter.layout);
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'studio');
    await expect(page.getByRole('heading', { name: starter.heading, level: 1 })).toBeVisible();
    await expect(page.locator(starter.component).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/lorem ipsum|todo|placeholder/iu);
    if ('image' in starter) await expectLoadedImage(page.getByRole('img', { name: starter.image }));

    switch (starter.id) {
      case 'basic': {
        const disclosure = page.locator('[data-disclosure]');
        await disclosure.getByText('Open the residual-risk register', { exact: true }).click();
        await expect(disclosure).toHaveAttribute('open', '');
        break;
      }
      case 'research': {
        const constraints = page.getByRole('tab', { name: 'Constraints' });
        await constraints.click();
        await expect(constraints).toHaveAttribute('aria-selected', 'true');
        break;
      }
      case 'architecture': {
        const opener = page.getByRole('button', { name: 'Open review checklist' });
        await opener.click();
        await expect(
          page.getByRole('dialog', { name: 'Architecture review checklist' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
        break;
      }
      case 'tutorial': {
        const output = page.locator('[data-demo-output]');
        await expect(output).toHaveText('0');
        await page.getByRole('button', { name: 'Increment' }).click();
        await expect(output).toHaveText('1');
        break;
      }
      case 'dashboard': {
        const search = page.getByRole('searchbox', { name: 'Filter' });
        await search.fill('Product');
        await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
        const toggle = page.getByRole('switch', { name: 'Show external release boundary' });
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        break;
      }
      case 'landing': {
        const trigger = page.getByRole('button', { name: 'Why does file:// matter?' });
        await trigger.click();
        await expect(page.getByRole('dialog', { name: 'Portability details' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        break;
      }
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const captureDirectory = path.resolve('test-results/starter-captures', testInfo.project.name);
    await mkdir(captureDirectory, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(captureDirectory, `${starter.id}.png`),
      fullPage: true,
    });
  });
}

for (const artifact of landingSectionArtifacts) {
  test(`${artifact.format} section and action contract is semantic and responsive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    const sections = page.locator('section.semantic-section');
    await expect(sections).toHaveCount(4);
    await expect(page.locator('#workflow')).toHaveAttribute('aria-labelledby', 'workflow-title');
    await expect(
      page.getByRole('heading', { name: 'Start with the work, not the framework', level: 2 }),
    ).toHaveAttribute('id', 'workflow-title');
    await expect(page.locator('#workflow')).toHaveAttribute('data-width', 'wide');
    await expect(page.locator('#workflow')).toHaveAttribute('data-tone', 'soft');
    await expect(page.locator('#proof')).toHaveAttribute('data-width', 'reading');
    await expect(page.locator('#proof')).toHaveAttribute('data-tone', 'accent');
    await expect(page.locator('#boundaries')).toHaveAttribute('data-align', 'center');
    await expect(page.locator('#boundaries')).toHaveAttribute('data-tone', 'contrast');

    const navigation = page.locator('[data-navigation]');
    await expect(navigation.locator('a')).toHaveCount(4);
    await expect(navigation.locator('a', { hasText: 'Workflow' })).toHaveAttribute(
      'href',
      '#workflow',
    );
    await expect(navigation.locator('a', { hasText: 'Proof' })).toHaveAttribute('href', '#proof');

    const primary = page.locator('.semantic-action[data-kind="primary"]').first();
    const secondary = page.locator('.semantic-action[data-kind="secondary"]').first();
    const quiet = page.locator('.semantic-action[data-kind="quiet"]').first();
    await expect(primary).toHaveAttribute('href', '#workflow');
    await expect(secondary).toHaveAttribute('href', '#proof');
    await expect(quiet).toHaveAttribute('href', '#boundaries');
    await primary.focus();
    await expect(primary).toBeFocused();
    expect(
      await primary.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const contrastActions = page.locator('#boundaries .semantic-action');
    await expect(contrastActions).toHaveCount(3);
    const themeVariants = [
      { theme: 'light', colorScheme: 'light' },
      { theme: 'dark', colorScheme: 'dark' },
      { theme: 'system', colorScheme: 'light' },
      { theme: 'system', colorScheme: 'dark' },
    ] as const;
    for (const variant of themeVariants) {
      await page.emulateMedia({ colorScheme: variant.colorScheme });
      for (const accent of ['indigo', 'teal', 'coral'] as const) {
        await page.locator('html').evaluate(
          (root, state) => {
            root.dataset.theme = state.theme;
            root.dataset.accent = state.accent;
          },
          { theme: variant.theme, accent },
        );
        for (const tone of ['plain', 'soft', 'accent', 'contrast'] as const) {
          await page.locator('#boundaries').evaluate((section, value) => {
            section.dataset.tone = value;
          }, tone);
          for (const kind of ['primary', 'secondary', 'quiet'] as const) {
            const action = page.locator(`#boundaries .semantic-action[data-kind="${kind}"]`);
            await action.focus();
            const contrast = await action.evaluate((element) => {
              const section = element.closest<HTMLElement>('.semantic-section');
              if (section === null) throw new Error('Action has no owning section.');
              const actionStyle = getComputedStyle(element);
              const sectionStyle = getComputedStyle(section);
              const parseRgb = (value: string): readonly [number, number, number] => {
                const channels = value
                  .match(/[\d.]+/gu)
                  ?.slice(0, 3)
                  .map(Number);
                if (channels?.length !== 3) throw new Error(`Unsupported computed color: ${value}`);
                return channels as unknown as readonly [number, number, number];
              };
              const luminance = (value: string): number => {
                const linearize = (channel: number): number => {
                  const normalized = channel / 255;
                  return normalized <= 0.04045
                    ? normalized / 12.92
                    : ((normalized + 0.055) / 1.055) ** 2.4;
                };
                const [red, green, blue] = parseRgb(value);
                return (
                  0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
                );
              };
              const ratio = (first: string, second: string): number => {
                const firstLuminance = luminance(first);
                const secondLuminance = luminance(second);
                const lighter = Math.max(firstLuminance, secondLuminance);
                const darker = Math.min(firstLuminance, secondLuminance);
                return (lighter + 0.05) / (darker + 0.05);
              };
              const transparent = (value: string): boolean => value.endsWith(', 0)');
              const sectionBackground = transparent(sectionStyle.backgroundColor)
                ? getComputedStyle(document.body).backgroundColor
                : sectionStyle.backgroundColor;
              const ownBackground = actionStyle.backgroundColor;
              const textBackground = transparent(ownBackground) ? sectionBackground : ownBackground;
              return {
                text: ratio(actionStyle.color, textBackground),
                focus: ratio(actionStyle.outlineColor, sectionBackground),
                outlineWidth: Number.parseFloat(actionStyle.outlineWidth),
              };
            });
            expect(
              contrast.text,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/text`,
            ).toBeGreaterThanOrEqual(4.5);
            expect(
              contrast.focus,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/focus`,
            ).toBeGreaterThanOrEqual(3);
            expect(
              contrast.outlineWidth,
              `${artifact.format}/${variant.theme}/${accent}/${tone}/${kind}/outline`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }

    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('html').evaluate((root) => {
      root.dataset.theme = 'light';
      root.dataset.accent = 'coral';
    });
    await page.locator('#boundaries').evaluate((section) => {
      section.dataset.tone = 'contrast';
    });
    await page.locator('#boundaries .semantic-action[data-kind="quiet"]').focus();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const captureDirectory = path.resolve('test-results/step-1-captures', testInfo.project.name);
    await mkdir(captureDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(captureDirectory, `${artifact.format}-landing.png`),
      fullPage: true,
    });
  });
}

test('generated artifact is navigable and interactive from file URL', async ({ page }) => {
  await page.goto(artifactUrl);

  await expect(page).toHaveTitle('Portable architecture report');
  await expect(page.getByRole('heading', { name: 'Architecture report' })).toBeVisible();
  const navigation = page.locator('[data-navigation]');
  await expect(navigation).toBeAttached();
  await expect(navigation.getByText('Decision branches', { exact: true })).toHaveAttribute(
    'href',
    '#decision-branches',
  );
  await expect(page.locator('pre code')).toContainText("const output = 'single-file';");
  const embeddedImage = page.getByRole('img', { name: 'Runtime placement' });
  await expect(embeddedImage).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/u);
  await expectLoadedImage(embeddedImage);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();

  const demoOutput = page.locator('[data-demo-output]');
  await expect(demoOutput).toHaveText('1');
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(demoOutput).toHaveText('3');

  const theme = page.locator('html');
  const before = await theme.getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(theme).not.toHaveAttribute('data-theme', before ?? '');
});

test('code copy control handles file URL clipboard behavior without runtime errors', async ({
  page,
}) => {
  await page.goto(artifactUrl);
  const copy = page.getByRole('button', { name: 'Copy' });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(copy).toHaveText(/Copied|Copy unavailable/);
});

test('directory artifact loads external assets directly from file URL', async ({ page }) => {
  await page.goto(directoryArtifactUrl);
  await expect(page.getByRole('heading', { name: 'Architecture report' })).toBeVisible();
  await expect(page.locator('pre code')).toContainText("const output = 'single-file';");
  const externalImage = page.getByRole('img', { name: 'Runtime placement' });
  await expect(externalImage).toHaveAttribute(
    'src',
    /^assets\/runtime-placement\.[a-f0-9]{12}\.svg$/u,
  );
  await expectLoadedImage(externalImage);

  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.locator('[data-demo-output]')).toHaveText('3');
});

for (const fixture of [
  { file: 'tutorial.html', heading: 'Code tutorial', selector: '[data-demo-counter]' },
  { file: 'work-report.html', heading: 'Weekly work report', selector: '.semantic-callout' },
  { file: 'landing.html', heading: 'Portable reports for agents', selector: '.semantic-cards' },
] as const) {
  test(`representative ${fixture.file} artifact is semantic and portable`, async ({ page }) => {
    const url = pathToFileURL(path.resolve('test-results/e2e-generated', fixture.file)).href;
    await page.goto(url);
    await expect(page.getByRole('heading', { name: fixture.heading, level: 1 })).toBeVisible();
    await expect(page.locator(fixture.selector)).toBeVisible();
    await expect(page.locator('.report-shell')).toHaveAttribute('data-has-navigation', 'false');
    expect(
      await page.locator('.report-shell').evaluate((shell) => {
        const content = shell.querySelector<HTMLElement>('.report-content');
        return content === null
          ? 0
          : content.getBoundingClientRect().width / shell.getBoundingClientRect().width;
      }),
    ).toBeGreaterThan(0.75);
    if (fixture.file === 'landing.html') {
      await expect(page.getByRole('button', { name: 'Contents' })).toHaveCount(0);
      await expect(page.locator('[data-navigation]')).toHaveCount(0);
    }
  });
}

test('desktop navigation has one total current state and a non-modal session collapse in both formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const artifact of navigationArtifacts) {
    await page.goto(artifact.url);
    const navigation = page.locator('[data-navigation]');
    await expect(navigation.locator('a')).toHaveCount(3);
    await expect(navigation).not.toContainText('Alpha detail');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(navigation.locator('[aria-live]')).toHaveCount(0);
    await expectCurrentNavigation(page, 'alpha');

    expect(
      await page.evaluate(() => {
        let geometryReads = 0;
        for (const heading of document.querySelectorAll<HTMLElement>(
          '[data-navigation] a[href^="#"]',
        )) {
          const target = document.querySelector<HTMLElement>(heading.getAttribute('href') ?? '');
          const ownedHeading = target?.querySelector<HTMLElement>(':scope > h2') ?? target;
          if (ownedHeading === null) continue;
          const getBoundingClientRect = ownedHeading.getBoundingClientRect.bind(ownedHeading);
          ownedHeading.getBoundingClientRect = () => {
            geometryReads += 1;
            return getBoundingClientRect();
          };
        }
        for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('scroll'));
        return geometryReads;
      }),
    ).toBe(0);

    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toHaveAccessibleName('Hide contents');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-nav-outside][inert]')).toHaveCount(0);
    const expandedColumns = await page
      .locator('.report-shell')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Show contents');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(navigation).toBeHidden();
    await expect(toggle).toBeFocused();
    const collapsedColumns = await page
      .locator('.report-shell')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(expandedColumns).not.toBe(collapsedColumns);
    expect(collapsedColumns.trim().split(/\s+/u)).toHaveLength(1);
    await toggle.press('Enter');
    await expect(toggle).toHaveAccessibleName('Hide contents');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation).toBeVisible();
    expect(
      await page
        .locator('.report-shell')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns),
    ).toBe(expandedColumns);
    await toggle.press('Enter');
    await expect(toggle).toHaveAccessibleName('Show contents');
    await expect(navigation).toBeHidden();
    await page.keyboard.press('Tab');
    await expect(page.locator('.topbar-title')).toBeFocused();
    await page.reload();
    await expect(toggle).toHaveAccessibleName('Hide contents');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation).toBeVisible();

    for (const [hash, owner] of [
      ['#alpha', 'alpha'],
      ['#alpha-detail', 'alpha'],
      ['#beta-detail', 'beta'],
      ['#modal-1', 'beta'],
      ['#navigation-runtime-fixture', 'alpha'],
      ['#appendix-outside-navigation', 'gamma'],
    ] as const) {
      await page.evaluate((value) => {
        location.hash = value;
      }, hash);
      await expectCurrentNavigation(page, owner);
    }

    await page.evaluate(() => {
      history.replaceState(null, '', '#missing-target');
      scrollTo({ top: 0, behavior: 'instant' });
      dispatchEvent(new Event('resize'));
    });
    await expectCurrentNavigation(page, 'alpha');
    await page.evaluate(() => dispatchEvent(new Event('resize')));
    await expectCurrentNavigation(page, 'alpha');

    await page.evaluate(() => {
      const heading = document.getElementById('beta-title');
      if (heading === null) throw new Error('Missing Beta heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      location.hash = '#another-missing-target';
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname);
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      const heading = document.getElementById('alpha-title');
      if (heading === null) throw new Error('Missing Alpha heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
    });
    await expectCurrentNavigation(page, 'alpha');

    await page.evaluate(() => {
      const heading = document.getElementById('beta-title');
      if (heading === null) throw new Error('Missing Beta heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
      dispatchEvent(new Event('resize'));
    });
    await expectCurrentNavigation(page, 'beta');

    await page.evaluate(() => {
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      dispatchEvent(new Event('scroll'));
    });
    await expectCurrentNavigation(page, 'gamma');

    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
      const tops: Readonly<Record<string, number>> = {
        'alpha-title': 70,
        'beta-title': 70,
        'gamma-title': 500,
      };
      for (const [id, top] of Object.entries(tops)) {
        const heading = document.getElementById(id);
        if (heading === null) throw new Error(`Missing ${id}.`);
        Object.defineProperty(heading, 'getBoundingClientRect', {
          configurable: true,
          value: () => new DOMRect(0, top, 400, 40),
        });
      }
      dispatchEvent(new Event('resize'));
    });
    await expectCurrentNavigation(page, 'beta');
  }
});

test('mobile contents drawer uses native modal focus and closes safely in both formats', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  for (const artifact of navigationArtifacts) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(artifact.url);
    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toHaveAccessibleName('Open contents');
    const dialog = page.locator('[data-nav-dialog]');
    await expect(dialog).toBeHidden();
    await toggle.click();
    await expect(dialog).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await expect(page.locator('[data-nav-outside][inert]')).toHaveCount(2);
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator('[data-nav-outside][inert]')).toHaveCount(0);

    await toggle.click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await dialog.evaluate((element) =>
      element.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.locator('[data-navigation] a[href="#beta"]').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#beta-title')).toBeFocused();
    await expectCurrentNavigation(page, 'beta');

    await toggle.click();
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAccessibleName('Hide contents');
    await expect(page.locator('[data-nav-desktop-host] [data-navigation]')).toBeVisible();
  }
});

test('navigation fallback keeps hash ownership deterministic without IntersectionObserver', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'IntersectionObserver');
  });
  for (const artifact of navigationArtifacts) {
    const pageErrors: string[] = [];
    const recordPageError = (error: Error): void => {
      pageErrors.push(error.message);
    };
    page.on('pageerror', recordPageError);
    const initialHashes = [
      ['#beta', 'beta'],
      ['#beta-detail', 'beta'],
      ['#modal-1', 'beta'],
      ['#navigation-runtime-fixture', 'alpha'],
      ['#appendix-outside-navigation', 'gamma'],
      ['#missing-target', 'alpha'],
      ['#%E0%A4%A', 'alpha'],
      ['', 'alpha'],
    ] as const;
    for (const [hash, expectedOwner] of initialHashes) {
      await page.goto(`${artifact.url}${hash}`);
      await expectCurrentNavigation(page, expectedOwner);
      await expect(page.locator('[data-reveal-pending]')).toHaveCount(0);
    }
    expect(pageErrors).toEqual([]);
    page.off('pageerror', recordPageError);

    await page.goto(`${artifact.url}#beta-detail`);
    expect(await page.evaluate(() => 'onscrollend' in window)).toBe(true);
    await expectCurrentNavigation(page, 'beta');
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => dispatchEvent(new Event('resize')));
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      history.replaceState(null, '', '#beta-detail');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      history.replaceState(null, '', '#navigation-runtime-fixture');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'alpha');
    await page.evaluate(() => {
      history.replaceState(null, '', '#appendix-outside-navigation');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'gamma');
    await page.evaluate(() => {
      const appendix = document.getElementById('appendix-outside-navigation');
      if (appendix === null) throw new Error('Missing appendix heading.');
      scrollTo({
        top: scrollY + appendix.getBoundingClientRect().top - 70,
        behavior: 'instant',
      });
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new Event('scrollend'));
    });
    await expectCurrentNavigation(page, 'gamma');
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname);
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'gamma');
    await page.evaluate(() => {
      history.replaceState(null, '', '#beta-detail');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new Event('scrollend'));
    });
    await expectCurrentNavigation(page, 'alpha');

    await page.evaluate(() => {
      const heading = document.getElementById('beta-title');
      if (heading === null) throw new Error('Missing Beta heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new Event('scrollend'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      history.replaceState(null, '', '#missing-at-beta');
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname);
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await expectCurrentNavigation(page, 'beta');

    await page.evaluate(() => {
      const tops: Readonly<Record<string, number>> = {
        'alpha-title': 70,
        'beta-title': 70,
        'gamma-title': 500,
      };
      for (const [id, top] of Object.entries(tops)) {
        const heading = document.getElementById(id);
        if (heading === null) throw new Error(`Missing ${id}.`);
        Object.defineProperty(heading, 'getBoundingClientRect', {
          configurable: true,
          value: () => new DOMRect(0, top, 400, 40),
        });
      }
      dispatchEvent(new Event('resize'));
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      for (const id of ['alpha-title', 'beta-title', 'gamma-title']) {
        const heading = document.getElementById(id);
        if (heading === null) throw new Error(`Missing ${id}.`);
        Reflect.deleteProperty(heading, 'getBoundingClientRect');
      }
    });

    const geometryReads = await page.evaluate(() => {
      let reads = 0;
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        '[data-navigation] a[href^="#"]',
      )) {
        const target = document.querySelector<HTMLElement>(link.hash);
        const heading = target?.querySelector<HTMLElement>(':scope > h2') ?? target;
        if (heading === null || heading === undefined) continue;
        const getBoundingClientRect = heading.getBoundingClientRect.bind(heading);
        heading.getBoundingClientRect = () => {
          reads += 1;
          return getBoundingClientRect();
        };
      }
      for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('scroll'));
      const duringScroll = reads;
      dispatchEvent(new Event('scrollend'));
      return { duringScroll, afterScrollEnd: reads };
    });
    expect(geometryReads).toEqual({ duringScroll: 0, afterScrollEnd: 3 });

    await page.locator('[data-navigation] a[href="#gamma"]').click();
    await expectCurrentNavigation(page, 'gamma');
    await settleVisualState(page);
    await expectCurrentNavigation(page, 'gamma');
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname);
      dispatchEvent(new HashChangeEvent('hashchange'));
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      dispatchEvent(new Event('scroll'));
    });
    await expectCurrentNavigation(page, 'gamma');
  }
});

test('navigation coalesces geometry without IntersectionObserver or scrollend', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'IntersectionObserver');
    Reflect.deleteProperty(window, 'onscrollend');
    Reflect.deleteProperty(Window.prototype, 'onscrollend');
  });
  for (const artifact of navigationArtifacts) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${artifact.url}#beta-detail`);
    expect(
      await page.evaluate(() => !('IntersectionObserver' in window) && !('onscrollend' in window)),
    ).toBe(true);
    await expect(page.locator('[data-reveal-pending]')).toHaveCount(0);
    await expectCurrentNavigation(page, 'beta');
    await settleVisualState(page);
    await expectCurrentNavigation(page, 'beta');

    const immediateOwner = await page.evaluate(() => {
      const evidence = { headingReads: 0 };
      (
        window as unknown as { __combinedFallbackEvidence: typeof evidence }
      ).__combinedFallbackEvidence = evidence;
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        '[data-navigation] a[href^="#"]',
      )) {
        const target = document.querySelector<HTMLElement>(link.hash);
        const heading = target?.querySelector<HTMLElement>(':scope > h2') ?? target;
        if (heading === null || heading === undefined) continue;
        const getBoundingClientRect = heading.getBoundingClientRect.bind(heading);
        heading.getBoundingClientRect = () => {
          evidence.headingReads += 1;
          return getBoundingClientRect();
        };
      }
      scrollTo({ top: 0, behavior: 'instant' });
      for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('scroll'));
      return document
        .querySelector<HTMLAnchorElement>('[data-navigation] a[aria-current="location"]')
        ?.getAttribute('href');
    });
    expect(immediateOwner).toBe('#beta');
    await expectCurrentNavigation(page, 'alpha');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                readonly __combinedFallbackEvidence: { readonly headingReads: number };
              }
            ).__combinedFallbackEvidence.headingReads,
        ),
      )
      .toBe(3);

    const readsBeforeBetaBurst = await page.evaluate(() => {
      const heading = document.getElementById('beta-title');
      if (heading === null) throw new Error('Missing Beta heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
      const reads = (
        window as unknown as {
          readonly __combinedFallbackEvidence: { readonly headingReads: number };
        }
      ).__combinedFallbackEvidence.headingReads;
      for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('scroll'));
      return reads;
    });
    await expectCurrentNavigation(page, 'beta');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                readonly __combinedFallbackEvidence: { readonly headingReads: number };
              }
            ).__combinedFallbackEvidence.headingReads,
        ),
      )
      .toBe(readsBeforeBetaBurst + 3);
  }
});

test('navigation returns from hash ownership to geometry when scrollend is unavailable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'onscrollend');
    Reflect.deleteProperty(Window.prototype, 'onscrollend');
  });
  for (const artifact of navigationArtifacts) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(artifact.url);
    expect(await page.evaluate(() => 'onscrollend' in window)).toBe(false);
    await page.evaluate(() => {
      location.hash = '#beta';
    });
    await expectCurrentNavigation(page, 'beta');
    await settleVisualState(page);
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectCurrentNavigation(page, 'alpha');
    await page.evaluate(() => {
      const heading = document.getElementById('beta-title');
      if (heading === null) throw new Error('Missing Beta heading.');
      scrollTo({ top: scrollY + heading.getBoundingClientRect().top - 70, behavior: 'instant' });
    });
    await expectCurrentNavigation(page, 'beta');
    await page.evaluate(() => {
      const evidence = { headingReads: 0 };
      (
        window as unknown as { __fallbackScrollEvidence: typeof evidence }
      ).__fallbackScrollEvidence = evidence;
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        '[data-navigation] a[href^="#"]',
      )) {
        const target = document.querySelector<HTMLElement>(link.hash);
        const heading = target?.querySelector<HTMLElement>(':scope > h2') ?? target;
        if (heading === null || heading === undefined) continue;
        const getBoundingClientRect = heading.getBoundingClientRect.bind(heading);
        heading.getBoundingClientRect = () => {
          evidence.headingReads += 1;
          return getBoundingClientRect();
        };
      }
      for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('scroll'));
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                readonly __fallbackScrollEvidence: { readonly headingReads: number };
              }
            ).__fallbackScrollEvidence.headingReads,
        ),
      )
      .toBe(3);
  }
});

test('navigation visual evidence covers every required state, theme, motion profile, and format', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-3-captures');
  await rm(captureRoot, { recursive: true, force: true });
  let captures = 0;

  for (const artifact of navigationArtifacts) {
    for (const theme of ['light', 'dark'] as const) {
      for (const motion of ['normal', 'reduced'] as const) {
        await page.goto('about:blank');
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${artifact.url}#beta`);
        await page.locator('html').evaluate((element, value) => {
          element.dataset.theme = value;
        }, theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectCurrentNavigation(page, 'beta');
        await settleVisualState(page);
        await expectCurrentNavigation(page, 'beta');
        const anchorClearance = await page.evaluate(() => {
          const topbar = document.querySelector('.topbar');
          const heading = document.getElementById('beta-title');
          if (!(topbar instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
            throw new Error('Expected the sticky topbar and Beta heading');
          }
          return heading.getBoundingClientRect().top - topbar.getBoundingClientRect().bottom;
        });
        expect(anchorClearance).toBeGreaterThanOrEqual(0);
        const captureDirectory = path.join(captureRoot, artifact.format, theme, motion);
        await mkdir(captureDirectory, { recursive: true });
        await page.screenshot({ path: path.join(captureDirectory, 'expanded-current-1440.png') });
        captures += 1;

        await page.setViewportSize({ width: 1280, height: 800 });
        const toggle = page.locator('[data-nav-toggle]');
        await expect(toggle).toHaveAccessibleName('Hide contents');
        await toggle.click();
        await expect(page.locator('[data-navigation]')).toBeHidden();
        await settleVisualState(page);
        await page.screenshot({ path: path.join(captureDirectory, 'collapsed-1280.png') });
        captures += 1;

        await page.setViewportSize({ width: 390, height: 844 });
        const dialog = page.locator('[data-nav-dialog]');
        await expect(dialog).toBeHidden();
        await settleVisualState(page);
        await page.screenshot({ path: path.join(captureDirectory, 'drawer-closed-390.png') });
        captures += 1;
        await toggle.click();
        await expect(dialog).toBeVisible();
        await settleVisualState(page);
        await page.screenshot({ path: path.join(captureDirectory, 'drawer-open-390.png') });
        captures += 1;
      }
    }
  }

  expect(captures).toBe(32);
});

test('reduced motion omits progress and reveal machinery while normal motion stays bounded', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    const evidence = {
      rafRequests: 0,
      documentScrollAdds: 0,
      documentScrollRemoves: 0,
      windowResizeAdds: 0,
      windowResizeRemoves: 0,
      observers: 0,
      observerDisconnects: 0,
      revealTargets: 0,
      revealUnobserves: 0,
    };
    Object.defineProperty(window, '__motionEvidence', { value: evidence, configurable: true });
    window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
      apply(target, thisArg, argumentsList: Parameters<typeof window.requestAnimationFrame>) {
        evidence.rafRequests += 1;
        return Reflect.apply(target, thisArg, argumentsList) as number;
      },
    });
    document.addEventListener = new Proxy(document.addEventListener, {
      apply(target, thisArg, argumentsList: Parameters<typeof document.addEventListener>) {
        if (argumentsList[0] === 'scroll') evidence.documentScrollAdds += 1;
        Reflect.apply(target, thisArg, argumentsList);
        return undefined;
      },
    });
    document.removeEventListener = new Proxy(document.removeEventListener, {
      apply(target, thisArg, argumentsList: Parameters<typeof document.removeEventListener>) {
        if (argumentsList[0] === 'scroll') evidence.documentScrollRemoves += 1;
        Reflect.apply(target, thisArg, argumentsList);
        return undefined;
      },
    });
    window.addEventListener = new Proxy(window.addEventListener, {
      apply(target, thisArg, argumentsList: Parameters<typeof window.addEventListener>) {
        if (argumentsList[0] === 'resize') evidence.windowResizeAdds += 1;
        Reflect.apply(target, thisArg, argumentsList);
        return undefined;
      },
    });
    window.removeEventListener = new Proxy(window.removeEventListener, {
      apply(target, thisArg, argumentsList: Parameters<typeof window.removeEventListener>) {
        if (argumentsList[0] === 'resize') evidence.windowResizeRemoves += 1;
        Reflect.apply(target, thisArg, argumentsList);
        return undefined;
      },
    });
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = new Proxy(NativeObserver, {
      construct(target, argumentsList) {
        evidence.observers += 1;
        const observer = Reflect.construct(target, argumentsList) as IntersectionObserver;
        observer.observe = new Proxy(observer.observe, {
          apply(observe, observerThis, observeArguments: [Element]) {
            if (observeArguments[0].matches('[data-reveal="true"]')) {
              evidence.revealTargets += 1;
            }
            Reflect.apply(observe, observerThis, observeArguments);
            return undefined;
          },
        });
        observer.unobserve = new Proxy(observer.unobserve, {
          apply(unobserve, observerThis, unobserveArguments: [Element]) {
            if (unobserveArguments[0].matches('[data-reveal="true"]')) {
              evidence.revealUnobserves += 1;
            }
            Reflect.apply(unobserve, observerThis, unobserveArguments);
            return undefined;
          },
        });
        observer.disconnect = new Proxy(observer.disconnect, {
          apply(disconnect, observerThis, disconnectArguments: []) {
            evidence.observerDisconnects += 1;
            Reflect.apply(disconnect, observerThis, disconnectArguments);
            return undefined;
          },
        });
        return observer;
      },
    });
  });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const artifact of defaultMotionArtifacts) {
    await page.goto(artifact.url);
    await expect(page.locator('[data-scroll-progress-indicator]')).toHaveCount(0);
    const disabledEvidence = await readMotionEvidence(page);
    expect(disabledEvidence.rafRequests).toBe(0);
    expect(disabledEvidence.documentScrollAdds).toBe(0);
    expect(disabledEvidence.windowResizeAdds).toBe(1);
  }

  for (const artifact of navigationArtifacts) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(artifact.url);
    await expect(page.locator('[data-scroll-progress-indicator]')).toHaveCount(0);
    await expect(page.locator('[data-reveal-pending], [data-reveal-motion]')).toHaveCount(0);
    const reducedEvidence = await readMotionEvidence(page);
    expect(reducedEvidence).toEqual({
      rafRequests: 0,
      documentScrollAdds: 0,
      documentScrollRemoves: 0,
      windowResizeAdds: 1,
      windowResizeRemoves: 0,
      observers: 1,
      observerDisconnects: 0,
      revealTargets: 0,
      revealUnobserves: 0,
    });
    expect(
      await page.locator('#beta').evaluate((element) => ({
        opacity: getComputedStyle(element).opacity,
        transform: getComputedStyle(element).transform,
      })),
    ).toEqual({ opacity: '1', transform: 'none' });

    await page.goto('about:blank');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(artifact.url);
    const progress = page.locator('[data-scroll-progress-indicator]');
    await expect(progress).toBeAttached();
    expect(
      await page.locator('html').evaluate((element) => ({
        duration: element.style.getPropertyValue('--motion-reveal-duration'),
        translation: element.style.getPropertyValue('--motion-reveal-translation'),
      })),
    ).toEqual({
      duration: `${PAGE_MOTION_POLICY.sectionReveal.durationMs}ms`,
      translation: `${PAGE_MOTION_POLICY.sectionReveal.translationPx}px`,
    });
    const beta = page.locator('#beta');
    await expect(beta).toHaveAttribute('data-reveal-pending', '');
    const initialMotion = await beta.evaluate((element) => ({
      opacity: getComputedStyle(element).opacity,
      transform: getComputedStyle(element).transform,
      translationY: new DOMMatrix(getComputedStyle(element).transform).m42,
      duration: getComputedStyle(element).transitionDuration,
      properties: getComputedStyle(element).transitionProperty,
    }));
    expect(initialMotion.opacity).toBe('0');
    expect(initialMotion.translationY).toBe(PAGE_MOTION_POLICY.sectionReveal.translationPx);
    expect(Math.abs(initialMotion.translationY)).toBeLessThanOrEqual(12);
    expect(initialMotion.duration).toContain(
      `${PAGE_MOTION_POLICY.sectionReveal.durationMs / 1000}s`,
    );
    const durationMs = Number.parseFloat(initialMotion.duration) * 1000;
    expect(durationMs).toBeGreaterThanOrEqual(180);
    expect(durationMs).toBeLessThanOrEqual(240);
    expect(initialMotion.properties).toBe('opacity, transform');
    await beta.scrollIntoViewIfNeeded();
    await expect(beta).not.toHaveAttribute('data-reveal-pending', '');
    await expect(beta).toHaveAttribute('data-reveal-shown', '');
    await page.evaluate(() =>
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await expect
      .poll(() => progress.evaluate((element) => (element as HTMLElement).style.transform))
      .toBe('scaleX(1)');
    expect(await progress.getAttribute('style')).toBe('transform: scaleX(1);');

    const afterReveal = await readMotionEvidence(page);
    expect(afterReveal.documentScrollAdds).toBe(1);
    expect(afterReveal.observers).toBe(2);
    expect(afterReveal.revealTargets).toBe(2);
    expect(afterReveal.revealUnobserves).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(beta).toHaveAttribute('data-reveal-shown', '');
    await expect(beta).not.toHaveAttribute('data-reveal-pending', '');
    await beta.scrollIntoViewIfNeeded();
    const afterReentry = await readMotionEvidence(page);
    expect(afterReentry.revealTargets).toBe(afterReveal.revealTargets);
    expect(afterReentry.revealUnobserves).toBe(afterReveal.revealUnobserves);

    await page.setViewportSize({ width: 1200, height: 700 });
    await page.evaluate(() => scrollTo({ top: 1000, behavior: 'instant' }));
    const progressRatio = async (): Promise<number> =>
      Number.parseFloat(
        (await progress.evaluate((element) => (element as HTMLElement).style.transform)).slice(
          'scaleX('.length,
          -1,
        ),
      );
    await expect.poll(progressRatio).toBeGreaterThan(0);
    const ratioBeforeResize = await progressRatio();
    const scrollBeforeResize = await page.evaluate(() => scrollY);
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(progressRatio).toBeGreaterThan(ratioBeforeResize);
    expect(await page.evaluate(() => scrollY)).toBe(scrollBeforeResize);

    const beforeBurst = (await readMotionEvidence(page)).rafRequests;
    await page.evaluate(() => {
      for (let index = 0; index < 5; index += 1) dispatchEvent(new Event('resize'));
    });
    await expect
      .poll(async () => (await readMotionEvidence(page)).rafRequests)
      .toBe(beforeBurst + 1);

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const beforeScrollBurst = (await readMotionEvidence(page)).rafRequests;
    await page.evaluate(() => {
      for (let index = 0; index < 5; index += 1) document.dispatchEvent(new Event('scroll'));
    });
    await expect
      .poll(async () => (await readMotionEvidence(page)).rafRequests)
      .toBe(beforeScrollBurst + 1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(progress).toHaveCount(0);
    await expect(page.locator('[data-reveal-pending], [data-reveal-motion]')).toHaveCount(0);
    const afterPreferenceReduction = await readMotionEvidence(page);
    expect(afterPreferenceReduction.documentScrollRemoves).toBe(1);
    expect(afterPreferenceReduction.windowResizeRemoves).toBe(1);
    expect(afterPreferenceReduction.observerDisconnects).toBeGreaterThanOrEqual(1);
    const reducedRafCount = afterPreferenceReduction.rafRequests;
    await page.evaluate(() => {
      for (let index = 0; index < 3; index += 1) document.dispatchEvent(new Event('scroll'));
    });
    expect((await readMotionEvidence(page)).rafRequests).toBe(reducedRafCount);
    expect(
      await beta.evaluate((element) => ({
        opacity: getComputedStyle(element).opacity,
        transform: getComputedStyle(element).transform,
      })),
    ).toEqual({ opacity: '1', transform: 'none' });

    const revealedBeforeRestore = afterPreferenceReduction.revealTargets;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('[data-scroll-progress-indicator]')).toBeAttached();
    await expect(page.locator('[data-reveal-pending]')).toHaveCount(0);
    const restoredEvidence = await readMotionEvidence(page);
    expect(restoredEvidence.documentScrollAdds).toBe(2);
    expect(restoredEvidence.windowResizeAdds).toBe(3);
    expect(restoredEvidence.revealTargets).toBe(revealedBeforeRestore);
  }
});

test('reduced-motion preference disables smooth scrolling and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(artifactUrl);

  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior),
  ).toBe('auto');
  const transitionDuration = await page
    .getByRole('button', { name: 'Toggle color theme' })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
});

test('mobile navigation opens without a hardcoded server URL', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  await page.goto(artifactUrl);
  const toggle = page.locator('[data-nav-toggle]');
  await expect(toggle).toHaveAccessibleName('Open contents');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-navigation]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
});

test('declarative interactions preserve scoped state, focus, and responsive file behavior', async ({
  page,
}, testInfo) => {
  await page.goto(interactiveArtifactUrl);
  await page.locator('html').evaluate((element) => {
    element.dataset.preset = 'editorial';
  });
  const activate = async (locator: Locator): Promise<void> => {
    if (testInfo.project.name.startsWith('mobile')) await locator.tap();
    else await locator.click();
  };
  const expectCompactControl = async (locator: Locator, name: string): Promise<void> => {
    const metrics = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
      };
    });
    expect(metrics.height, name).toBeGreaterThanOrEqual(32);
    expect(metrics.height, name).toBeLessThanOrEqual(40);
    expect(metrics.paddingLeft, name).toBeLessThanOrEqual(12);
    expect(metrics.paddingRight, name).toBeLessThanOrEqual(12);
  };

  const terms = page
    .locator('article > p [data-term-reference="decision-packet"]')
    .getByRole('button', { name: 'Decision packet' });
  await expect(terms).toHaveCount(2);
  const term = terms.first();
  await expect(term.locator('xpath=ancestor::p')).toContainText(
    'keeps a reusable definition close to the exact language',
  );
  await expect(page.locator('#glossary-decision-packet')).toContainText(
    'A compact bundle of evidence',
  );
  const termReference = term.locator('..');
  const termExplanation = termReference.getByRole('dialog', { name: 'Decision packet' });
  if (!testInfo.project.name.startsWith('mobile')) {
    await term.hover();
    await expect(termExplanation).toBeVisible();
    await page.getByRole('heading', { name: 'Interactive component catalog' }).hover();
    await expect(termExplanation).toBeHidden();
  }
  await term.focus();
  await expect(termExplanation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(termExplanation).toBeHidden();
  await expect(term).toBeFocused();
  await activate(term);
  await expect(termExplanation).toBeVisible();
  const fullDefinitionLink = termReference.getByRole('link', { name: 'View full definition' });
  await expect(fullDefinitionLink).toHaveAttribute('href', '#glossary-decision-packet');
  await activate(fullDefinitionLink);
  await expect(page).toHaveURL(/#glossary-decision-packet$/u);
  await expect(page.locator('#glossary-decision-packet')).toBeInViewport();
  await page.getByRole('heading', { name: 'Progressive detail' }).click();
  await expect(termExplanation).toBeHidden();
  const secondTerm = terms.nth(1);
  const secondExplanation = secondTerm.locator('..').getByRole('dialog', {
    name: 'Decision packet',
  });
  await expect(secondExplanation).toBeHidden();
  await activate(secondTerm);
  await expect(secondExplanation).toBeVisible();
  await expect(termExplanation).toBeHidden();
  await expect(term).toHaveAttribute('aria-expanded', 'false');
  await expect(secondTerm).toHaveAttribute('aria-expanded', 'true');
  expect(await term.getAttribute('aria-controls')).not.toBe(
    await secondTerm.getAttribute('aria-controls'),
  );
  await page.keyboard.press('Escape');
  await expect(secondExplanation).toBeHidden();
  await expect(secondTerm).toBeFocused();

  const disclosure = page.locator('[data-disclosure]');
  await expect(disclosure).toHaveAttribute('open', '');
  await activate(disclosure.getByText('Why the source stays declarative', { exact: true }));
  await expect(disclosure).not.toHaveAttribute('open', '');

  const tabGroups = page.locator('[data-tabs]');
  await expect(tabGroups).toHaveCount(2);
  const deliveryTabs = tabGroups.nth(0);
  const independentTabs = tabGroups.nth(1);
  await expectCompactControl(deliveryTabs.getByRole('tab', { name: 'Directory' }), 'tab');
  await activate(deliveryTabs.getByRole('tab', { name: 'Directory' }));
  await expect(deliveryTabs.getByRole('tab', { name: 'Directory' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    deliveryTabs.getByRole('tabpanel').filter({ hasText: 'content-addressed' }),
  ).toBeVisible();
  await expect(independentTabs.getByRole('tab', { name: 'Requirements' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await deliveryTabs.getByRole('tab', { name: 'Directory' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(deliveryTabs.getByRole('tab', { name: 'Single file' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toBeFocused();
  await expect(deliveryTabs.getByRole('tab', { name: 'Review' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const modalOpener = page.getByRole('button', { name: 'Open release checklist' });
  await expectCompactControl(modalOpener, 'modal opener');
  await activate(modalOpener);
  const dialog = page.getByRole('dialog', { name: 'Release checklist' });
  await expect(dialog).toBeVisible();
  await expectCompactControl(
    dialog.getByRole('button', { name: 'Close', exact: true }),
    'modal close',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(modalOpener).toBeFocused();
  await activate(modalOpener);
  await activate(dialog.getByRole('button', { name: 'Close', exact: true }));
  await expect(modalOpener).toBeFocused();

  const popoverTrigger = page.getByRole('button', { name: 'Show portability note' });
  await activate(popoverTrigger);
  const popover = page.getByRole('dialog', { name: 'Portability note' });
  await expect(popover).toBeVisible();
  await expect(popoverTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(popoverTrigger).toBeFocused();

  const filter = page.getByRole('searchbox', { name: 'Filter' });
  const filterRoot = page.locator('[data-filter]');
  const directFilterItems = filterRoot.locator(':scope > ul > li');
  const nestedFilterItem = filterRoot.getByText('Nested keyboard route', { exact: true });
  await filter.fill('NESTED KEYBOARD ROUTE');
  await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
  await expect(directFilterItems).toHaveCount(5);
  await expect(directFilterItems.filter({ hasText: 'Focus-restoring modal' })).toBeVisible();
  await expect(nestedFilterItem).toBeVisible();
  await expect(nestedFilterItem).not.toHaveAttribute('hidden', '');
  await expect(directFilterItems.filter({ hasText: 'Native disclosure' })).toBeHidden();

  const hiddenToggle = page.getByRole('switch', { name: 'Show verification evidence' });
  const visibleToggle = page.getByRole('switch', { name: 'Show authoring note' });
  await expect(hiddenToggle).toHaveAttribute('aria-checked', 'false');
  await expect(visibleToggle).toHaveAttribute('aria-checked', 'true');
  await activate(hiddenToggle);
  await expect(hiddenToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('The generated artifact was opened', { exact: false })).toBeVisible();
  await expect(visibleToggle).toHaveAttribute('aria-checked', 'true');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

for (const artifact of visualizationArtifacts) {
  test(`${artifact.format} declarative visualizations are labelled, themed, and responsive from file URL`, async ({
    page,
  }) => {
    await page.goto(artifact.url);
    await expect(
      page.getByRole('heading', { name: 'Product signal atlas', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('[data-visualization="chart"]')).toHaveCount(3);
    await expect(page.locator('[data-chart-type="bar"]')).toBeVisible();
    await expect(page.locator('[data-chart-type="line"]')).toBeVisible();
    await expect(page.locator('[data-chart-type="pie"]')).toBeVisible();
    const adoptionChart = page.getByRole('img', { name: /Weekly active agents/u });
    await expect(adoptionChart).toBeVisible();
    await expect(adoptionChart).toHaveAccessibleDescription(/Assisted, W1: 42/u);
    await expect(page.getByRole('img', { name: /Successful first builds/u })).toBeVisible();
    await expect(page.getByRole('img', { name: /Generated page mix/u })).toBeVisible();
    const flowDiagram = page.getByRole('img', { name: /Offline compilation flow/u });
    await expect(flowDiagram).toBeVisible();
    await expect(flowDiagram).toHaveAccessibleDescription(
      /Groups: authoring: Authoring graph.*source: Declarative source.*source to validate: parse/u,
    );
    await expect(page.locator('[data-diagram-type="flow"] [data-group-id]')).toHaveCount(3);
    await expect(page.locator('[data-diagram-type="flow"] [data-node-id]')).toHaveCount(15);
    await expect(page.locator('[data-node-id="source"]')).toBeAttached();
    await expect(page.locator('[data-from="source"][data-to="validate"]')).toBeAttached();
    await expectDiagramEdgesAvoidNodes(flowDiagram);
    const sequenceDiagram = page.getByRole('img', { name: /Compile request sequence/u });
    await expect(sequenceDiagram).toBeVisible();
    await expect(sequenceDiagram).toHaveAccessibleDescription(
      /Messages in order: 1\. agent to loader: load source.*4\. browser to agent: review result/u,
    );
    await expect(page.locator('.visualization-timeline-event')).toHaveCount(4);
    await expect(page.getByText('Compile offline', { exact: true })).toBeVisible();

    const firstBar = page.locator('.visualization-bar').first();
    const before = await firstBar.evaluate((element) => getComputedStyle(element).fill);
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    const after = await firstBar.evaluate((element) => getComputedStyle(element).fill);
    expect(after).not.toBe(before);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.visualization-frame')
        .first()
        .evaluate((element) => element.scrollWidth >= element.clientWidth),
    ).toBe(true);
  });
}

for (const artifact of incidentReviewArtifacts) {
  test(`${artifact.format} incident review is decision-ready and interactive from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'mixed');
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'signal');
    await expect(
      page.getByRole('heading', { name: 'OrbitDesk P1 incident review', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample topology showing traffic entering checkout, billing, and the payment provider',
      }),
    );
    await expect(page.getByRole('img', { name: /Failed checkout attempts/u })).toBeVisible();
    await expect(page.getByRole('img', { name: /Causal chain/u })).toBeVisible();
    await expect(page.locator('.visualization-timeline-event')).toHaveCount(5);

    const filter = page.getByRole('searchbox', { name: 'Filter' });
    await filter.fill('Reliability');
    await expect(page.locator('[data-filter-count]')).toHaveText('1 item');
    await expect(page.getByText('Amplification alert', { exact: true })).toBeVisible();
    await expect(page.getByText('Pool reservation', { exact: false })).toBeHidden();

    const tab = page.getByRole('tab', { name: 'Ruled out' });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Ledger and order-store writes', { exact: false })).toBeVisible();

    await tab.focus();
    await expect(tab).toBeFocused();
    expect(
      await tab.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0);

    const disclosure = page.locator('[data-disclosure]');
    await disclosure.getByText('Open the customer communication draft', { exact: true }).click();
    await expect(disclosure).toHaveAttribute('open', '');

    if (testInfo.project.name.startsWith('mobile')) {
      const navigationToggle = page.locator('[data-nav-toggle]');
      await expect(navigationToggle).toHaveAccessibleName('Open contents');
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toBeVisible();
      const navigationClose = page.getByRole('button', { name: 'Close', exact: true });
      await expect(navigationClose).toBeFocused();
      expect(
        await navigationClose.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).outlineWidth),
        ),
      ).toBeGreaterThan(0);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const artifact of vendorDecisionArtifacts) {
  test(`${artifact.format} vendor decision keeps hard gates ahead of scoring from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'document');
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'editorial');
    await expect(
      page.getByRole('heading', { name: 'AI support vendor decision packet', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample evidence map connecting requirements, vendor evidence, gates, scoring, and a conditional decision',
      }),
    );
    await expect(
      page.getByRole('img', { name: /Weighted score after evidence review/u }),
    ).toBeVisible();
    await expect(page.getByText('Fail · global support telemetry', { exact: true })).toBeVisible();
    await expect(page.getByText('Meridian Reply · 89/100', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Approve Cedar Assist for a reversible pilot', { exact: true }),
    ).toBeVisible();

    const term = page.getByRole('button', { name: /hard gate/iu }).first();
    await term.focus();
    await page.keyboard.press('Enter');
    const glossaryDialog = page.getByRole('dialog', { name: 'Hard gate' });
    await expect(glossaryDialog).toBeVisible();
    await expect(glossaryDialog).toContainText('disqualifies a candidate');
    await page.keyboard.press('Escape');
    await expect(glossaryDialog).toBeHidden();
    await expect(term).toBeFocused();
    expect(
      await term.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0);

    const residualRisk = page.getByRole('tab', { name: 'Residual risks' });
    await residualRisk.click();
    await expect(residualRisk).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tabpanel').filter({ hasText: 'Cedar must prove deletion propagation' }),
    ).toBeVisible();

    const rankingTrigger = page.getByRole('button', { name: 'Why not the top score?' });
    await rankingTrigger.click();
    const rankingDialog = page.getByRole('dialog', { name: 'Ranking exception' });
    await expect(rankingDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rankingDialog).toBeHidden();
    await expect(rankingTrigger).toBeFocused();

    const checklistTrigger = page.getByRole('button', { name: 'Open the evidence checklist' });
    await checklistTrigger.focus();
    await page.keyboard.press('Enter');
    const checklist = page.getByRole('dialog', { name: 'Reviewer evidence checklist' });
    await expect(checklist).toBeVisible();
    await expect(rankingDialog).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(checklist).toBeHidden();
    await expect(checklistTrigger).toBeFocused();

    if (testInfo.project.name.startsWith('mobile')) {
      const comparison = page.getByRole('table').filter({ hasText: 'Weighted criterion' });
      expect(
        await comparison.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
      const navigationToggle = page.locator('[data-nav-toggle]');
      await expect(navigationToggle).toHaveAccessibleName('Open contents');
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const artifact of launchReadinessArtifacts) {
  test(`${artifact.format} launch readiness keeps evidence and hold conditions actionable from file URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(artifact.url);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'landing');
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'studio');
    await expect(
      page.getByRole('heading', { name: 'Regional beta launch readiness', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Fictional showcase', { exact: false })).toBeVisible();
    await expectLoadedImage(
      page.getByRole('img', {
        name: 'Sample beta learning loop connecting a bounded audience, collaborative value, evidence, and a governed rollout',
      }),
    );
    await expect(
      page.getByRole('img', { name: /Activated workspace rate by cohort/u }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /Design-partner funnel/u })).toBeVisible();
    await expect(page.getByText('64% · target ≥ 60%', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Go: bounded European Economic Area beta', { exact: true }),
    ).toBeVisible();

    const residualRisk = page.getByRole('tab', { name: 'Residual risk' });
    await residualRisk.click();
    await expect(residualRisk).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tabpanel').filter({ hasText: 'Single-participant rooms' }),
    ).toBeVisible();

    const regionTrigger = page.getByRole('button', { name: 'Why not launch globally?' });
    await regionTrigger.focus();
    await page.keyboard.press('Enter');
    const regionDialog = page.getByRole('dialog', { name: 'Regional boundary' });
    await expect(regionDialog).toBeVisible();
    await expect(regionDialog).toContainText('invalidate the current capacity');
    await page.keyboard.press('Escape');
    await expect(regionDialog).toBeHidden();
    await expect(regionTrigger).toBeFocused();

    const holdToggle = page.getByRole('switch', { name: 'Show the automatic hold condition' });
    await expect(holdToggle).toHaveAttribute('aria-checked', 'false');
    await holdToggle.focus();
    await page.keyboard.press('Enter');
    await expect(holdToggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Pause new invitations', { exact: false })).toBeVisible();
    expect(
      await holdToggle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const limits = page
      .locator('[data-disclosure]')
      .filter({ hasText: 'Read the experiment limits' });
    await limits.getByText('Read the experiment limits', { exact: true }).click();
    await expect(limits).toHaveAttribute('open', '');

    if (testInfo.project.name.startsWith('mobile')) {
      const register = page.getByRole('table').filter({ hasText: 'Mandatory condition' });
      expect(await register.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      );
      const navigationToggle = page.locator('[data-nav-toggle]');
      await expect(navigationToggle).toHaveAccessibleName('Open contents');
      await navigationToggle.focus();
      await page.keyboard.press('Enter');
      await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-navigation]')).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const showcase of presetShowcases) {
  test(`${showcase.name} preset remains contained with reachable controls at every required width`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    for (const artifact of showcase.artifacts) {
      for (const viewport of [
        { name: 'desktop', width: 1280, height: 900 },
        { name: 'intermediate', width: 768, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
        { name: 'dense', width: 320, height: 800 },
      ] as const) {
        await page.setViewportSize(viewport);
        await page.goto(artifact.url);
        const root = page.locator('html');
        await expect(root).toHaveAttribute('data-preset', showcase.preset);
        await expect(page.getByRole('heading', { name: showcase.heading, level: 1 })).toBeVisible();
        const containment = await page.evaluate(() => {
          const visibleControls = [
            ...document.querySelectorAll<HTMLElement>('button, a[href], input, summary'),
          ].filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
          });
          const reachableThroughLocalScroller = (element: HTMLElement): boolean => {
            let ancestor = element.parentElement;
            while (ancestor !== null && ancestor !== document.body) {
              const style = getComputedStyle(ancestor);
              if (
                (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
                ancestor.scrollWidth > ancestor.clientWidth
              ) {
                const rect = ancestor.getBoundingClientRect();
                return rect.left >= -0.5 && rect.right <= innerWidth + 0.5;
              }
              ancestor = ancestor.parentElement;
            }
            return false;
          };
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            unreachable: visibleControls
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return (
                  (rect.left < -0.5 || rect.right > innerWidth + 0.5) &&
                  !reachableThroughLocalScroller(element)
                );
              })
              .map((element) => element.textContent?.trim() || element.getAttribute('aria-label')),
          };
        });
        expect(containment.overflow, `${artifact.format} at ${viewport.name}`).toBeLessThanOrEqual(
          0,
        );
        expect(containment.unreachable, `${artifact.format} at ${viewport.name}`).toEqual([]);
      }
    }
  });
}

test('same-layout preset families retain their coordinated styles in both formats and every color mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const expected of presetFixtureExpectations) {
    for (const artifact of [
      { format: 'single-file', url: layoutArtifactUrl(`preset-${expected.preset}`) },
      {
        format: 'directory',
        url: pathToFileURL(
          path.resolve(
            'test-results/e2e-generated',
            `preset-${expected.preset}-directory/index.html`,
          ),
        ).href,
      },
    ] as const) {
      for (const mode of ['light', 'dark', 'system'] as const) {
        await page.emulateMedia({ colorScheme: mode === 'light' ? 'light' : 'dark' });
        await page.goto(artifact.url);
        await page.locator('html').evaluate((element, value) => {
          element.dataset.theme = value;
        }, mode);
        const state = await page.evaluate(() => {
          const root = document.documentElement;
          const rootStyle = getComputedStyle(root);
          const bodyStyle = getComputedStyle(document.body);
          const heading = document.querySelector<HTMLElement>('h1');
          const surface = document.querySelector<HTMLElement>('.semantic-card');
          const section = document.querySelector<HTMLElement>('.semantic-section');
          return {
            preset: root.dataset.preset,
            density: root.dataset.density,
            font: root.dataset.font,
            accent: root.dataset.accent,
            width: root.dataset.width,
            radius: root.dataset.radius,
            fontFamily: bodyStyle.fontFamily,
            lineHeight: Number.parseFloat(bodyStyle.lineHeight),
            contentWidth: rootStyle.getPropertyValue('--content-width').trim(),
            headingWeight: heading === null ? undefined : getComputedStyle(heading).fontWeight,
            surfaceRadius: surface === null ? undefined : getComputedStyle(surface).borderRadius,
            sectionMargin:
              section === null ? undefined : Number.parseFloat(getComputedStyle(section).marginTop),
            background: bodyStyle.backgroundColor,
          };
        });
        expect(state, `${expected.preset}/${artifact.format}/${mode}`).toMatchObject({
          preset: expected.preset,
          density: expected.density,
          font: expected.font,
          accent: expected.accent,
          width: expected.width,
          radius: expected.radius,
          contentWidth: expected.contentWidth,
          headingWeight: expected.headingWeight,
          surfaceRadius: expected.surfaceRadius,
          background: mode === 'light' ? expected.lightBackground : expected.darkBackground,
        });
        expect(state.fontFamily).toContain(expected.fontFamily);
        expect(state.lineHeight).toBeCloseTo(expected.lineHeight, 2);
        expect(state.sectionMargin).toBeCloseTo(expected.sectionMargin, 2);
      }
    }
  }
  expect(remoteRequests).toEqual([]);
});

test('captures light and dark preset evidence in both formats and viewport families', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-2-captures/preset-matrix');
  await rm(captureRoot, { recursive: true, force: true });
  for (const showcase of presetRepresentatives) {
    for (const artifact of showcase.artifacts) {
      for (const theme of ['light', 'dark'] as const) {
        for (const viewport of [
          { name: 'desktop', width: 1280, height: 900 },
          { name: 'mobile', width: 390, height: 844 },
        ] as const) {
          await page.setViewportSize(viewport);
          await page.goto(artifact.url);
          await expect(page.locator('html')).toHaveAttribute('data-preset', showcase.preset);
          await page.locator('html').evaluate((element, value) => {
            element.dataset.theme = value;
          }, theme);
          await page.evaluate(() => window.scrollTo(0, 0));
          const directory = path.join(captureRoot, showcase.preset, artifact.format, theme);
          await mkdir(directory, { recursive: true });
          await page.screenshot({
            path: path.join(directory, `${viewport.name}.png`),
            fullPage: true,
          });
        }
      }
    }
  }
  expect(await relativeFiles(captureRoot)).toEqual(expectedPresetCapturePaths);
});

test('captures exactly six 320 by 800 dense preset states', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const captureRoot = path.resolve('test-results/step-2-captures/dense-320');
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const showcase of presetRepresentatives) {
    for (const theme of ['light', 'dark'] as const) {
      await page.goto(showcase.artifacts[0].url);
      await page.locator('html').evaluate((element, value) => {
        element.dataset.theme = value;
      }, theme);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(captureRoot, `${showcase.preset}-${theme}.png`),
      });
    }
  }
  expect((await readdir(captureRoot)).sort()).toEqual([
    'editorial-dark.png',
    'editorial-light.png',
    'signal-dark.png',
    'signal-light.png',
    'studio-dark.png',
    'studio-light.png',
  ]);
});

for (const example of [
  {
    name: 'layout-document',
    layout: 'document',
    theme: 'system',
    density: 'comfortable',
    font: 'serif',
    accent: 'indigo',
    width: 'narrow',
    contentWidth: '60rem',
    spaceFactor: '1',
    fontFamily: 'Charter',
    focusColor: 'rgb(56, 86, 216)',
    surfaceRadius: '14.4px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'soft',
    heading: 'Architecture decision record',
    component: '.semantic-decision',
    image: 'A layered page model',
    table: true,
  },
  {
    name: 'layout-dashboard',
    layout: 'dashboard',
    theme: 'dark',
    density: 'compact',
    font: 'sans',
    accent: 'teal',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '.78',
    fontFamily: 'Inter',
    focusColor: 'rgb(117, 234, 219)',
    surfaceRadius: '4px',
    backgroundColor: 'rgb(12, 17, 28)',
    radius: 'sharp',
    heading: 'Delivery health dashboard',
    component: '.semantic-card',
    table: true,
  },
  {
    name: 'layout-landing',
    layout: 'landing',
    theme: 'light',
    density: 'spacious',
    font: 'sans',
    accent: 'coral',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '1.28',
    fontFamily: 'Inter',
    focusColor: 'rgb(194, 65, 93)',
    surfaceRadius: '21.6px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'round',
    heading: 'Pages agents can finish',
    component: '.semantic-card',
  },
  {
    name: 'layout-mixed',
    layout: 'mixed',
    theme: 'system',
    density: 'comfortable',
    font: 'sans',
    accent: 'teal',
    width: 'wide',
    contentWidth: '94rem',
    spaceFactor: '1',
    fontFamily: 'Inter',
    focusColor: 'rgb(8, 127, 117)',
    surfaceRadius: '14.4px',
    backgroundColor: 'rgb(244, 246, 251)',
    radius: 'soft',
    heading: 'Research synthesis',
    component: '.semantic-card',
    image: 'Four page layouts sharing one foundation',
    table: true,
  },
] as const) {
  test(`${example.layout} page applies registry-owned layout and tokens without viewport overflow`, async ({
    page,
  }, testInfo) => {
    await page.goto(layoutArtifactUrl(example.name));
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-layout', example.layout);
    await expect(root).toHaveAttribute('data-preset', 'studio');
    await expect(root).toHaveAttribute('data-theme', example.theme);
    await expect(root).toHaveAttribute('data-density', example.density);
    await expect(root).toHaveAttribute('data-font', example.font);
    await expect(root).toHaveAttribute('data-accent', example.accent);
    await expect(root).toHaveAttribute('data-width', example.width);
    await expect(root).toHaveAttribute('data-radius', example.radius);
    await expect(page.getByRole('heading', { name: example.heading, level: 1 })).toBeVisible();
    await expect(page.locator(example.component).first()).toBeVisible();

    const themeToggle = page.getByRole('button', { name: 'Toggle color theme' });
    await themeToggle.focus();
    const visualState = await page.evaluate((componentSelector) => {
      const rootStyle = getComputedStyle(document.documentElement);
      const shell = document.querySelector<HTMLElement>('.report-shell');
      const surface = document.querySelector<HTMLElement>(componentSelector);
      const focused = document.querySelector<HTMLElement>('[data-theme-toggle]');
      return {
        token: rootStyle.getPropertyValue('--content-width').trim(),
        shell: shell?.getBoundingClientRect().width,
        rootFontSize: Number.parseFloat(rootStyle.fontSize),
        viewport: window.innerWidth,
        spaceFactor: rootStyle.getPropertyValue('--space-factor').trim(),
        fontFamily: getComputedStyle(document.body).fontFamily,
        focusColor: focused === null ? undefined : getComputedStyle(focused).outlineColor,
        surfaceRadius: surface === null ? undefined : getComputedStyle(surface).borderRadius,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      };
    }, example.component);
    expect(visualState.token).toBe(example.contentWidth);
    expect(visualState.shell).toBeCloseTo(
      Math.min(
        visualState.viewport,
        Number.parseFloat(example.contentWidth) * visualState.rootFontSize,
      ),
      4,
    );
    expect(visualState.spaceFactor).toBe(example.spaceFactor);
    expect(visualState.fontFamily).toContain(example.fontFamily);
    expect(visualState.focusColor).toBe(example.focusColor);
    expect(visualState.surfaceRadius).toBe(example.surfaceRadius);
    expect(visualState.backgroundColor).toBe(example.backgroundColor);

    if ('image' in example) {
      await expectLoadedImage(page.getByRole('img', { name: example.image }));
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await themeToggle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);

    const navigation = page.locator('[data-navigation]');
    await expect(navigation).toBeAttached();
    if (testInfo.project.name.startsWith('mobile')) {
      if ('table' in example) {
        const table = page.locator('table').first();
        expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
          true,
        );
        expect(
          await table
            .locator('th')
            .first()
            .evaluate((element) => getComputedStyle(element).overflowWrap),
        ).toBe('normal');
      }
      const toggle = page.locator('[data-nav-toggle]');
      await expect(toggle).toHaveAccessibleName('Open contents');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(navigation).toBeVisible();
    } else {
      await expect(navigation).toBeVisible();
    }
  });
}

test('system theme follows dark preference and becomes an explicit theme after activation', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(layoutArtifactUrl('layout-document'));
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'system');
  const before = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const darkCode = await codeThemeState(page.locator('pre.shiki'));
  expect(darkCode).toEqual({
    background: 'rgb(36, 41, 46)',
    tokens: ['rgb(133, 232, 157)', 'rgb(225, 228, 232)', 'rgb(158, 203, 255)'],
  });
  expect(new Set(darkCode.tokens).size).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  const after = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
  const lightCode = await codeThemeState(page.locator('pre.shiki'));
  expect(lightCode).toEqual({
    background: 'rgb(255, 255, 255)',
    tokens: ['rgb(34, 134, 58)', 'rgb(36, 41, 46)', 'rgb(3, 47, 98)'],
  });
  expect(new Set(lightCode.tokens).size).toBeGreaterThan(1);
  expect(lightCode.tokens).not.toEqual(darkCode.tokens);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  expect(await codeThemeState(page.locator('pre.shiki'))).toEqual(darkCode);
});

async function expectDiagramEdgesAvoidNodes(diagram: Locator): Promise<void> {
  const intersections = await diagram.evaluate((svg) => {
    const nodes = [...svg.querySelectorAll<SVGGElement>('[data-node-id]')].map((node) => ({
      id: node.getAttribute('data-node-id') ?? '',
      bounds: node.getBBox(),
    }));
    return [...svg.querySelectorAll<SVGGeometryElement>('.visualization-edge')].flatMap((edge) => {
      const from = edge.getAttribute('data-from');
      const to = edge.getAttribute('data-to');
      const length = edge.getTotalLength();
      for (let offset = 2; offset < length - 2; offset += 2) {
        const point = edge.getPointAtLength(offset);
        const collision = nodes.find(({ id, bounds }) => {
          if (id === from || id === to) return false;
          return (
            point.x > bounds.x + 1 &&
            point.x < bounds.x + bounds.width - 1 &&
            point.y > bounds.y + 1 &&
            point.y < bounds.y + bounds.height - 1
          );
        });
        if (collision !== undefined) {
          return [
            `${from ?? '?'}->${to ?? '?'} intersects ${collision.id} at ${Math.round(point.x)},${Math.round(point.y)}`,
          ];
        }
      }
      return [];
    });
  });
  expect(intersections).toEqual([]);
}

async function codeThemeState(
  block: Locator,
): Promise<{ readonly background: string; readonly tokens: readonly string[] }> {
  return block.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    tokens: [...element.querySelectorAll<HTMLElement>('code span[style]')]
      .slice(0, 3)
      .map((token) => getComputedStyle(token).color),
  }));
}

async function settleVisualState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let previous = window.scrollY;
      let stableFrames = 0;
      let sampledFrames = 0;
      const sample = (): void => {
        const current = window.scrollY;
        stableFrames = Math.abs(current - previous) < 0.5 ? stableFrames + 1 : 0;
        previous = current;
        sampledFrames += 1;
        if (stableFrames >= 3 || sampledFrames >= 240) resolve();
        else window.requestAnimationFrame(sample);
      };
      window.requestAnimationFrame(sample);
    });
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  });
}

async function expectLoadedImage(image: Locator): Promise<void> {
  await expect
    .poll(async () =>
      image.evaluate((element) => {
        const rendered = element as HTMLImageElement;
        return rendered.complete && rendered.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

async function relativeFiles(root: string, directory = root): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? relativeFiles(root, absolutePath)
        : [path.relative(root, absolutePath)];
    }),
  );
  return files.flat().sort();
}
