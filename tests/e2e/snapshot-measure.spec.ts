import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { countDefects, measureReport } from '../../dist/node/core/snapshot.js';
import { measureInPage } from '../../dist/node/core/snapshot-measure.js';
import { expect, test } from './fixtures.js';

/**
 * Замеры `snapshot --measure` находят то, ради чего написаны. Страница с посаженным дефектом каждого
 * класса даёт ненулевой замер этого класса, а чистая страница — ноль по каждому: так замер, который
 * ничего не видит, не проходит за «дефектов нет».
 */

const MEASURE_OPTIONS = { minimumTextPx: 11, emptyBandShare: 0.5 };

const CLEAN = `<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
main { max-width: 40rem; margin: 0 auto; padding: 1rem; }
</style></head><body><main>
<h1>A clean page</h1>
<p>Readable text in a comfortable size.</p>
<p><a class="semantic-action" href="#next">Start</a></p>
<svg viewBox="0 0 100 40" width="200"><text x="0" y="20" font-size="10">Label</text></svg>
<p id="next">More text that closes the page.</p>
</main></body></html>`;

// Каждый дефект посажен отдельно и назван id, по которому его ищет проверка.
const DEFECTIVE = `<!doctype html><html lang="en"><head><style>
@font-face { font-family: Missing; src: url(missing-font.woff2); }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
#wide { width: 2000px; height: 10px; }
#tiny { font-size: 9px; }
#ghost { opacity: 0.18; }
#grey { color: #bbbbbb; }
#under { position: absolute; top: 300px; left: 0; width: 300px; margin: 0; }
#pause { position: fixed; top: 300px; left: 0; width: 120px; height: 40px; }
#gap { height: 1200px; }
#cut { width: 100px; overflow: hidden; white-space: nowrap; }
#missing { font-family: Missing; }
</style></head><body>
<div id="wide">wide</div>
<p id="tiny">Tiny print.</p>
<svg viewBox="0 0 1000 100" width="200"><text id="scaled" x="0" y="50" font-size="20">Scaled down</text></svg>
<p id="ghost">A step not reached yet.</p>
<p id="grey">Pale grey text.</p>
<p id="under">Text under the pause button.</p>
<button id="pause" type="button">Pause</button>
<div id="gap"></div>
<h1>The title below the fold</h1>
<h2 id="cut">A very long heading that its box cuts</h2>
<p id="missing">TODO: write this paragraph.</p>
</body></html>`;

test.describe('snapshot --measure', () => {
  test('finds each planted defect and nothing on a clean page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 390, height: 844 });

    await page.setContent(CLEAN);
    const clean = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    // Ловит замер, который находит дефект на странице без дефектов (ложная тревога).
    expect(clean.horizontalOverflow).toBe(0);
    expect(clean.smallText.count).toBe(0);
    expect(clean.lowContrast.count).toBe(0);
    expect(clean.coveredText.count).toBe(0);
    expect(clean.emptyBands).toEqual([]);
    expect(clean.clippedHeadings.count).toBe(0);
    expect(clean.placeholders).toBe(0);
    expect(clean.firstScreen).toMatchObject({ heading: true, action: true });
    expect(clean.firstScreen.mainSceneShare).toBeGreaterThan(0);
    // Ловит: итог `defects` шумит на чистой странице.
    expect(countDefects(clean, [], [])).toBe(0);
    // Ловит: заголовок или главное действие вне первого экрана не входят в итог (process.md велит
    // чинить каждый ненулевой `defects`); страница без действия дефекта не получает.
    const first = clean.firstScreen;
    expect(countDefects({ ...clean, firstScreen: { ...first, heading: false } }, [], [])).toBe(1);
    expect(countDefects({ ...clean, firstScreen: { ...first, action: false } }, [], [])).toBe(1);
    expect(
      countDefects(
        { ...clean, firstScreen: { ...first, action: false, actionOnPage: false } },
        [],
        [],
      ),
    ).toBe(0);

    await page.setContent(DEFECTIVE);
    await page.evaluate(() => document.fonts.load('16px Missing').catch(() => []));
    const found = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    // Ловит: страница едет вбок, а замер этого не видит или не называет виновника.
    expect(found.horizontalOverflow).toBeGreaterThan(0);
    expect(found.overflowing).toContain('div#wide');
    // Ловит: мелкий кегль HTML и текст SVG, уменьшенный масштабом рисунка, проходят незамеченными.
    expect(found.smallText.samples).toEqual(expect.arrayContaining(['p#tiny', 'text#scaled']));
    // Ловит: «призрак» при opacity 0.18 меряется по своему цвету и выглядит контрастным; бледный цвет тоже.
    const low = found.lowContrast.samples.map((sample) => sample.element);
    expect(low).toEqual(expect.arrayContaining(['p#ghost', 'p#grey']));
    expect(found.lowContrast.samples.find((sample) => sample.element === 'p#ghost')?.opacity).toBe(
      0.18,
    );
    // Ловит: фиксированная кнопка лежит на тексте.
    expect(found.coveredText.samples).toContain('p#under under button#pause');
    // Ловит: пустота выше половины окна между текстом.
    expect(found.emptyBands.length).toBeGreaterThan(0);
    // Ловит: заголовок, обрезанный своей рамкой.
    expect(found.clippedHeadings.samples).toContain('h2#cut');
    // Ловит: заглушка в тексте и шрифт, который не загрузился.
    expect(found.placeholders).toBe(1);
    expect(found.failedFonts).toContain('Missing');
    // Ловит: заголовок страницы ниже первого экрана.
    expect(found.firstScreen.heading).toBe(false);
    expect(found.firstScreen.action).toBe(false);
    // Ловит: находки есть, а итог, по которому агент решает, чинить ли, — ноль.
    expect(countDefects(found, [], [])).toBeGreaterThan(0);
  });

  test('measures a built page at each width and scheme without taking pictures', async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const root = path.resolve('test-results/e2e-snapshot-measure', testInfo.project.name);
    await rm(root, { recursive: true, force: true });
    const results = [];
    for (const [name, paragraph] of [
      ['clean', 'The page says what it is.'],
      ['placeholder', 'TODO: say what the page is.'],
    ] as const) {
      const source = path.join(root, name);
      await mkdir(source, { recursive: true });
      await writeFile(
        path.join(source, 'report.md'),
        `---\ntitle: Measured\nlanguage: en\n---\n\n# Measured\n\n${paragraph}\n\n::::actions\n::action[Start]{href="#more" kind="primary"}\n::::\n\n::::section{title="More" id="more"}\nThe rest of the page.\n::::\n`,
      );
      results.push(
        await measureReport({
          input: source,
          output: path.join(root, `${name}-out`),
          widths: [390, 1440],
          schemes: ['light', 'dark'],
          motions: ['normal'],
        }),
      );
    }
    const [clean, placeholder] = results;
    // Ловит: замер пропускает сочетание ширины и схемы или снимает кадры вместо чисел.
    expect(clean?.measurements.map((entry) => `${entry.width}-${entry.scheme}`)).toEqual([
      '390-light',
      '390-dark',
      '1440-light',
      '1440-dark',
    ]);
    // Ловит: оболочка пакета сама по себе даёт дефекты (замер шумит на каждой странице).
    for (const entry of clean?.measurements ?? []) {
      expect(entry, `${entry.width}-${entry.scheme}`).toMatchObject({
        defects: 0,
        horizontalOverflow: 0,
        firstScreen: { heading: true, action: true },
      });
      expect(entry.pageErrors).toEqual([]);
    }
    // Ловит: замер не доходит до собранной страницы (всегда ноль).
    for (const entry of placeholder?.measurements ?? []) expect(entry.placeholders).toBe(1);
  });
  test('counts a stop cut at the fold, a page error and an action below the first screen as defects', async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const root = path.resolve(
      'test-results/e2e-snapshot-measure',
      testInfo.project.name,
      'planted',
    );
    await rm(root, { recursive: true, force: true });
    const source = path.join(root, 'source');
    // Эффект расширения, который падает при постановке: ошибка страницы, которую замер обязан назвать.
    await cp(path.resolve('tests/fixtures/effects/margin-mark'), source, { recursive: true });
    await writeFile(
      path.join(source, 'effect.mjs'),
      "import { defineEffect } from 'agentic-report/effect';\nexport default defineEffect({ mount() { throw new Error('planted failure'); } });\n",
    );
    const long = Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of a long screen.`);
    await writeFile(
      path.join(source, 'report.md'),
      [
        '---',
        'title: Planted',
        'language: en',
        'layout: screens',
        'extensions: [extension.yaml]',
        '---',
        '',
        '# Planted',
        '',
        // Экран длиннее окна — остановка, обрезанная по сгибу.
        '::::section{title="Long" id="long" mark="ring"}',
        long.join('\n\n'),
        '::::',
        '',
        '::::section{title="Short" id="short"}',
        'One line.',
        '',
        // Главное действие есть, но не на первом экране.
        '::::actions',
        '::action[Start]{href="#long" kind="primary"}',
        '::::',
        '::::',
        '',
      ].join('\n'),
    );
    const result = await measureReport({
      input: source,
      output: path.join(root, 'out'),
      widths: [1440],
      schemes: ['light'],
      motions: ['normal'],
    });
    const entry = result.measurements[0];
    // Ловит: обрезанная остановка не попадает ни в `stops`, ни в предупреждения.
    expect(entry?.stops.filter((stop) => !stop.fits).map((stop) => stop.id)).toEqual(['long']);
    expect(result.warnings.map((warning) => warning.code)).toContain('SNAPSHOT_STOP_CUT');
    // Ловит: ошибка кода страницы не доходит до замера.
    expect(entry?.pageErrors.join('\n')).toMatch(/planted failure/u);
    // Ловит: действие ниже первого экрана не считается дефектом.
    expect(entry?.firstScreen).toMatchObject({ heading: true, action: false, actionOnPage: true });
    // Ловит: итог не складывает обрезанную остановку, ошибку и действие вне первого экрана.
    expect(entry?.defects).toBeGreaterThanOrEqual(1 + (entry?.pageErrors.length ?? 0) + 1);
  });
});
