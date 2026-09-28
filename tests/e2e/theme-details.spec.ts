import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Мелочи тем, которые видит читатель: консольная скобка у метки состояния, мелкие заголовки дисплейной
 * гарнитуры текстовой гарнитурой и легенда ленты времени с точкой цвета события.
 */
async function page(name: string, theme: string, body: string): Promise<string> {
  const root = path.resolve('test-results/e2e-theme-details', name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Details\nlanguage: en\ntheme: ${theme}\n---\n\n# Details\n\n${body}\n`,
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  return pathToFileURL(output).href;
}

test('theme details the reader sees', async ({ page: browserPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await browserPage.goto(
    await page(
      'terminal',
      'terminal',
      '::::cards\n:::card{title="Build time" status="good"}\nFaster.\n:::\n::::',
    ),
  );
  const status = await browserPage.evaluate(() => {
    const label = document.querySelector('.semantic-card .semantic-status');
    if (label === null) throw new Error('Missing status label');
    return {
      before: getComputedStyle(label, '::before').content,
      after: getComputedStyle(label, '::after').content,
    };
  });
  expect(status.before).toMatch(/^"\[ "/u);
  expect(status.after).toMatch(/^" \]"/u);

  await browserPage.goto(
    await page(
      'noir',
      'noir',
      [
        '### A small heading',
        '',
        '::::timeline{title="Plan" description="The plan."}',
        ':::event{date="May" title="Ship" kind="success"}',
        ':::',
        '::legend-item{event="success" label="Shipped"}',
        '::::',
      ].join('\n'),
    ),
  );
  const noir = await browserPage.evaluate(() => {
    const h3 = document.querySelector('.report-content h3');
    const eventTitle = document.querySelector('.visualization-timeline-title');
    const spoken = document.querySelector('.visualization-timeline-event .visually-hidden');
    const dot = document.querySelector('.visualization-timeline-legend-dot');
    const legend = document.querySelector('.visualization-timeline-legend');
    if (h3 === null || eventTitle === null || dot === null || legend === null)
      throw new Error('Missing noir details');
    return {
      h3: getComputedStyle(h3).fontFamily,
      eventTitle: getComputedStyle(eventTitle).fontFamily,
      eventText: eventTitle.textContent,
      spoken: spoken?.textContent,
      dot: getComputedStyle(dot).backgroundColor,
      legend: legend.textContent,
    };
  });
  expect(noir.h3).toContain('Jost');
  expect(noir.eventTitle).toContain('Jost');
  expect(noir.eventText).toBe('Ship');
  expect(noir.spoken).toBe('Shipped');
  expect(noir.legend).toBe('Shipped');
  expect(noir.dot).not.toBe('rgba(0, 0, 0, 0)');
});

/**
 * Цвет на странице — это цвет токена темы, во всех встроенных темах: фон страницы, метка статуса карточки
 * и выноска об успехе. Ловит правило стилей, которое рисует своей краской мимо роли, и роль, которая не
 * доходит до элемента.
 */
test('elements take their colours from the theme tokens in every built-in theme', async ({
  page: browserPage,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const { BUILT_IN_THEME_NAMES, resolveBuiltInTheme } =
    await import('../../dist/node/authoring/themes.js');
  for (const name of BUILT_IN_THEME_NAMES) {
    await browserPage.goto(
      await page(
        `tokens-${name}`,
        name,
        [
          '::::cards',
          ':::card{title="Build" status="good"}',
          'Faster.',
          ':::',
          '::::',
          '',
          ':::callout{title="Shipped" kind="success"}',
          'Done.',
          ':::',
        ].join('\n'),
      ),
    );
    const scheme = await browserPage.evaluate(() =>
      document.documentElement.dataset.scheme === 'dark' ||
      (document.documentElement.dataset.scheme === 'system' &&
        matchMedia('(prefers-color-scheme: dark)').matches) ||
      document.documentElement.dataset.themeSchemes === 'dark'
        ? 'dark'
        : 'light',
    );
    const colours = resolveBuiltInTheme(name).colors[scheme];
    const seen = await browserPage.evaluate(() => {
      const status = document.querySelector('.semantic-card[data-status] > .semantic-status');
      const callout = document.querySelector(".semantic-callout[data-kind='success']");
      if (status === null || callout === null) throw new Error('Missing status or callout');
      return {
        background: getComputedStyle(document.body).backgroundColor,
        // В консоли точку заменяет скобка в цвете статуса.
        status:
          getComputedStyle(status, '::before').backgroundColor === 'rgba(0, 0, 0, 0)'
            ? getComputedStyle(status, '::before').color
            : getComputedStyle(status, '::before').backgroundColor,
        callout: getComputedStyle(callout).borderLeftColor,
      };
    });
    const expected = await browserPage.evaluate(
      (values) =>
        values.map((value) => {
          const element = document.createElement('span');
          element.style.color = value;
          document.body.append(element);
          const colour = getComputedStyle(element).color;
          element.remove();
          return colour;
        }),
      [colours.background, colours.statusDone],
    );
    expect(seen.background, `${name} background`).toBe(expected[0]);
    expect(seen.status, `${name} status`).toBe(expected[1]);
    expect(seen.callout, `${name} callout`).toBe(expected[1]);
  }
});

/**
 * Мера заголовка из темы и оптический размер в браузере. Ловит три дефекта: `--heading-measure: initial`
 * без меры темы не отдаёт запасную меру (заголовок статьи теряет меру чтения), мера темы не доходит до
 * заголовка страницы, и ось `opsz` встроенной гарнитуры не работает (ширина строки не зависит от
 * `font-optical-sizing`).
 */
test('the theme sets the heading measure and optical sizing reaches the page', async ({
  page: browserPage,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  // Предел заголовка в px из вычисленного `max-width` вида `min(100%, <px>)` и две опорные длины,
  // измеренные в его шрифте: 30ch и мера чтения темы.
  const measure = async (
    theme: string,
  ): Promise<{ limit: number; thirtyCh: number; reading: number }> => {
    await browserPage.goto(await page(`measure-${theme.replace(/\W+/gu, '-')}`, theme, 'Text.'));
    return browserPage.evaluate(() => {
      const heading = document.querySelector('.report-content article > h1');
      if (heading === null) throw new Error('Missing page title');
      const length = (width: string): number => {
        const probe = document.createElement('span');
        probe.style.cssText = `position:absolute;display:block;width:${width}`;
        heading.append(probe);
        const value = probe.getBoundingClientRect().width;
        probe.remove();
        return value;
      };
      const limits = [...getComputedStyle(heading).maxWidth.matchAll(/([\d.]+)px/gu)];
      return {
        limit: Number(limits.at(-1)?.[1] ?? Number.NaN),
        thirtyCh: length('30ch'),
        reading: length('var(--reading-measure)'),
      };
    });
  };
  const plain = await measure('neutral');
  expect(plain.limit).toBeCloseTo(plain.reading, 0);
  const wide = await measure('{ extends: neutral, typography: { headingMeasure: 30 } }');
  expect(wide.limit).toBeCloseTo(wide.thirtyCh, 0);

  await browserPage.goto(await page('optical', 'calm-paper', 'Text.'));
  const widths = await browserPage.evaluate(async () => {
    const heading = document.querySelector<HTMLElement>('.report-content h1');
    if (heading === null) throw new Error('Missing page title');
    await document.fonts.ready;
    const width = (sizing: string): number => {
      heading.style.fontOpticalSizing = sizing;
      const range = document.createRange();
      range.selectNodeContents(heading);
      return range.getBoundingClientRect().width;
    };
    return {
      inherited: getComputedStyle(heading).fontOpticalSizing,
      auto: width('auto'),
      none: width('none'),
    };
  });
  expect(widths.inherited).toBe('auto');
  expect(Math.abs(widths.auto - widths.none)).toBeGreaterThan(1);
});
