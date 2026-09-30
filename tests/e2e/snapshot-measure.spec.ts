import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { countDefects, measureReport } from '../../dist/node/core/snapshot.js';
import { MEASURE_OPTIONS, measureInPage } from '../../dist/node/core/snapshot-measure.js';
import { expect, test } from './fixtures.js';

/**
 * Замеры `snapshot --measure` находят то, ради чего написаны. Страница с посаженным дефектом каждого
 * класса даёт ненулевой замер этого класса, а чистая страница — ноль по каждому: так замер, который
 * ничего не видит, не проходит за «дефектов нет».
 */

const CLEAN = `<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
main { max-width: 40rem; margin: 0 auto; padding: 1rem; }
</style></head><body><main>
<h1>A clean page</h1>
<p>Readable text in a comfortable size, in a column that takes the phone's width.</p>
<p><a class="semantic-action" href="#next">Start</a></p>
<figure><svg viewBox="0 0 100 40" width="200"><text x="0" y="20" font-size="10">Label</text></svg></figure>
<table><tr><th>Step</th><th>Owner</th></tr><tr><td>Build the page</td><td>Agent</td></tr></table>
<p style="width: 150px">Wraps at spaces: <code>one two three four five six</code> and <code>a/b</code>.</p>
<p style="width: 90px"><code id="humps">resolve<wbr>Board<wbr>Connector<wbr>Geometry</code></p>
<div id="rail" style="display: flex; gap: 12px; overflow-x: auto"><div style="flex: 0 0 300px"><h3 class="semantic-title">First card</h3></div><div style="flex: 0 0 300px"><h3 class="semantic-title">Second card past the window</h3></div></div>
<div style="display: flex; gap: 24px; align-items: start"><p style="flex: 0 0 100%; margin-right: -60%">Short text.</p><div style="position: sticky; top: 0; width: 120px; height: 40px; background: #eeeeee"></div></div>
<article><article style="padding: 0 40px"><p>Note 1 inside an item of a form, narrower than the prose column on purpose.</p></article><article style="padding: 0 40px"><p>Note 2 inside an item of a form, narrower than the prose column on purpose.</p></article><article style="padding: 0 40px"><p>Note 3 inside an item of a form, narrower than the prose column on purpose.</p></article></article>
<div id="stack"><div style="position: sticky; top: 0; height: 700px; background: #f4f4f4"><p style="margin-top: 60px">The first card of a stack.</p></div><div style="position: sticky; top: 20px; height: 700px; background: #eeeeee"><p>The second card slides over it.</p></div><div style="height: 760px; background: #e8e8e8"></div></div>
<p style="font-size: 12px">A label at twelve pixels.</p>
<p id="next">More text that closes the page, long enough to count as prose.</p>
</main></body></html>`;

// Каждый дефект посажен отдельно и назван id, по которому его ищет проверка.
const DEFECTIVE = `<!doctype html><html lang="en"><head><style>
@font-face { font-family: Missing; src: url(missing-font.woff2); }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
#wide { width: 2000px; height: 10px; }
#tiny { font-size: 9px; }
#eleven { font-size: 11px; }
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
<p id="eleven">A label at eleven pixels on a phone.</p>
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

/**
 * Дефекты новых замеров посажены на тёмной странице (светлый блок на тёмной — случай владельца), каждый
 * отдельно и назван id. Рядом — то же без дефекта: объявленная прокручиваемой широкая таблица, главное
 * действие и полоса `data-tone="contrast"`; они в находки попадать не должны.
 */
const PLANTED = (
  lightImage: string,
  lightPhoto: string,
): string => `<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #eeeeee; background: #101010; }
main { padding: 0 40px; }
td { padding: 4px; white-space: normal; }
.nowrap td { white-space: nowrap; }
</style></head><body><main>
<h1>Planted page</h1>
<p>A paragraph of prose in a column with a double gutter on a phone screen.</p>
<p>Another paragraph of prose in the same narrow column, to make it the reading column.</p>
<div style="overflow-x: auto"><table id="wide" class="nowrap"><tr><td>${'wide cell text '.repeat(12)}</td><td>more</td></tr></table></div>
<div style="overflow-x: auto"><table id="declared" class="nowrap" data-table-layout="scroll"><tr><td>${'wide cell text '.repeat(12)}</td><td>more</td></tr></table></div>
<table id="sparse" style="width: 100%"><tr><td style="width: 20%">${'word '.repeat(40)}</td><td>a</td><td>b</td></tr></table>
<table id="cards" style="display: block; width: 100%"><tbody style="display: block"><tr style="display: block"><td style="display: block">Name</td><td style="display: block">a</td></tr></tbody></table>
<div style="background: #303030"><table id="dead"><tr><td>Short</td><td>table</td></tr></table></div>
<table id="flush" style="background: #303030"><tr><td style="padding: 0">Flush text</td><td style="padding: 0">edge</td></tr></table>
<table id="inset" style="display: block; width: fit-content; padding-inline: 20px; background: #303030"><tr><td>Inset text</td><td>edge</td></tr></table>
<p style="width: 120px"><code id="broken" style="word-break: break-all">averyveryverylongidentifierwithoutbreaks</code></p>
<figure><svg viewBox="0 0 1000 100" width="200"><text id="tiny-label" x="0" y="50" font-size="20">Small</text></svg></figure>
<figure><div style="overflow-x: auto; width: 200px"><svg width="600" height="60"><text id="cut-label" x="500" y="30" font-size="14">Cut</text></svg></div></figure>
<figure><button type="button" data-figure-open>Open</button><div style="overflow-x: auto; width: 200px"><svg width="600" height="60"><text id="far-label" x="500" y="30" font-size="14">Far</text></svg></div></figure>
<img id="light-shot" alt="" width="240" height="120" src="${lightImage}">
<img id="light-photo" alt="" width="240" height="120" src="${lightPhoto}">
<div id="light-panel" style="background: #f4f4f4; width: 240px; height: 120px"></div>
<a class="semantic-action" href="#end" style="display: block; background: #ffffff; width: 200px; height: 100px">Start</a>
<section data-tone="contrast" style="background: #fafafa; height: 120px"><div style="background: #ffffff; height: 100px"></div></section>
<section id="ruled" style="border-top: 1px solid #888888; height: 700px"></section>
<p id="end">The text after the ruled empty section closes the page.</p>
</main></body></html>`;

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
    // Ловит: рамка абзаца заходит под липкий блок справа, а строки нет — замер по рамке видит перекрытие;
    // карточка стопки уходит под следующую по замыслу стопки.
    expect(clean.coveredText.count).toBe(0);
    expect(clean.emptyBands).toEqual([]);
    // Ловит: карточка ленты за краем окна считается обрезанной, хотя до неё доходит прокрутка ленты.
    expect(clean.clippedHeadings.count).toBe(0);
    expect(clean.placeholders).toBe(0);
    expect(clean.firstScreen).toMatchObject({ heading: true, action: true });
    expect(clean.firstScreen.mainSceneShare).toBeGreaterThan(0);
    // Ловит: новые замеры находят дефект на странице без дефектов — узкая таблица, код с переносом по
    // пробелу, крупная подпись в рисунке, светлая страница без блоков чужой схемы.
    expect(clean.tables).toMatchObject({
      count: 1,
      wide: { count: 0 },
      sparse: { count: 0 },
      deadSurface: { count: 0 },
      flushText: { count: 0 },
    });
    // Ловит: заметки пунктов формы (статья в статье) шире всего представлены и выдают себя за колонку.
    expect(clean.readingColumn.narrow).toBe(false);
    // Ловит: колонка чтения не находится вовсе (ширина 0 не бывает «узкой» и маскировала бы дефект).
    expect(clean.readingColumn.share).toBeGreaterThanOrEqual(0.88);
    // Ловит: перенос у `<wbr>`, который поставил компилятор (горб длинного слова), считается разрывом.
    expect(
      await page.locator('#humps').evaluate((code) => code.getClientRects().length),
    ).toBeGreaterThan(1);
    expect(clean.codeBreaks.count).toBe(0);
    expect(clean.diagramLabels.count).toBe(0);
    expect(clean.offSchemeBlocks.count).toBe(0);
    expect(clean.sectionColumns.count).toBe(0);
    // Ловит: итог `defects` шумит на чистой странице.
    expect(countDefects(clean, [], [])).toBe(0);
    // Ловит: новый класс находок не входит в итог, по которому агент решает, чинить ли.
    const one = { count: 1, samples: ['x'] };
    for (const planted of [
      { tables: { ...clean.tables, wide: one } },
      { tables: { ...clean.tables, sparse: one } },
      { tables: { ...clean.tables, deadSurface: one } },
      { tables: { ...clean.tables, flushText: one } },
      { readingColumn: { ...clean.readingColumn, narrow: true } },
      { codeBreaks: one },
      { diagramLabels: { count: 1, small: 0, clipped: 1, scrolled: 0, samples: ['x'] } },
      { offSchemeBlocks: { count: 1, samples: [] } },
      {
        sectionColumns: {
          count: 1,
          misaligned: 0,
          overrun: 1,
          emptyTrack: 0,
          codeWidth: 0,
          hollow: 0,
          headWide: 0,
          tocGap: 0,
          samples: [],
        },
      },
    ])
      expect(countDefects({ ...clean, ...planted }, [], []), JSON.stringify(planted)).toBe(1);
    // Ловит: мелкая подпись схемы считается дважды — в `smallText` и в `diagramLabels`.
    expect(
      countDefects(
        {
          ...clean,
          diagramLabels: { count: 1, small: 1, clipped: 0, scrolled: 0, samples: ['x'] },
        },
        [],
        [],
      ),
    ).toBe(0);
    // Ловит: подпись, до которой читатель доходит прокруткой или полноэкранным просмотром, — дефект.
    expect(
      countDefects(
        { ...clean, diagramLabels: { count: 0, small: 0, clipped: 0, scrolled: 3, samples: [] } },
        [],
        [],
      ),
    ).toBe(0);
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
    // Ловит: метка в 11 px на телефоне проходит по общему порогу, а нужен порог телефона (12 px).
    expect(found.smallText.samples).toContain('p#eleven');
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

  test('finds wide and sparse tables, a narrow column, broken code, cut labels and off-scheme blocks', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 390, height: 844 });
    // Светлая картинка — PNG из холста: data URL того же источника, пиксели читаются.
    const lightImage = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 120;
      const context = canvas.getContext('2d');
      if (context !== null) {
        context.fillStyle = '#f0f0f0';
        context.fillRect(0, 0, 240, 120);
      }
      return canvas.toDataURL('image/png');
    });
    // Светлая фотография: те же светлые тона, но с фактурой — соседние пиксели различаются, как у снимка
    // пустыни или неба. Это содержание, а не бумага чужой схемы.
    const lightPhoto = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 120;
      const context = canvas.getContext('2d');
      if (context === null) return '';
      const image = context.createImageData(240, 120);
      let seed = 7;
      for (let index = 0; index < image.data.length; index += 4) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const value = 215 + (seed % 40);
        image.data.set([value, value - 5, value - 12, 255], index);
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    });
    await page.setContent(PLANTED(lightImage, lightPhoto));
    await page.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))),
    );
    const found = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    // Ловит: таблица в три экрана шириной проходит, потому что её прокручивает своя рамка; и объявленная
    // `data-table-layout="scroll"` таблица всё равно считается дефектом.
    expect(found.tables.wide.samples).toEqual(['table#wide.nowrap']);
    const declared = found.tables.samples.find(
      (table) => table.element === 'table#declared.nowrap',
    );
    expect(declared).toMatchObject({ scrollLayout: true, scrolls: true });
    expect(declared?.viewportShare).toBeGreaterThan(1.25);
    // Ловит: колонка слов рядом с пустыми клетками не видна как пустота таблицы.
    expect(found.tables.sparse.samples).toContain('table#sparse');
    // Ловит: таблица, показанная карточками, считается пустой — строка во всю ширину с коротким значением
    // читается как пустые клетки (без пропуска карточек её пустота выше порога).
    expect(found.tables.sparse.samples).not.toContain('table#cards');
    expect(
      found.tables.samples.find((table) => table.element === 'table#cards')?.emptyShare,
    ).toBeGreaterThan(0.7);
    // Ловит: заливка во всю дорожку под короткой таблицей и текст вплотную к краю заливки; таблица с
    // собственной заливкой по своей ширине и отступом у края не находка.
    expect(found.tables.deadSurface.samples).toEqual(['table#dead']);
    expect(found.tables.flushText.samples).toEqual(['table#flush']);
    expect(
      found.tables.samples.find((table) => table.element === 'table#sparse')?.emptyShare,
    ).toBeGreaterThan(0.7);
    // Ловит: двойное поле на телефоне (колонка 310 из 390) не считается узкой колонкой.
    expect(found.readingColumn).toMatchObject({ width: 310, narrow: true });
    // Ловит: перенос строчного кода посреди слова.
    expect(found.codeBreaks.samples).toEqual(['code#broken']);
    // Ловит: подпись схемы в 4 px на экране и подпись за правым краем прокручиваемой рамки рисунка без
    // просмотра; та же подпись у рисунка с кнопкой полноэкранного просмотра достижима — не дефект.
    expect(found.diagramLabels).toMatchObject({ count: 2, small: 1, clipped: 1, scrolled: 1 });
    // Ловит: светлый снимок (по пикселям) и светлая панель на тёмной странице; главное действие и полоса
    // `tone="contrast"` с её содержимым в находки не попадают, и светлая фотография с фактурой — тоже:
    // замер по одной средней яркости принял бы её за светлую плиту.
    expect(found.offSchemeBlocks.samples.map((block) => block.element)).toEqual([
      'img#light-shot',
      'div#light-panel',
    ]);
    expect(found.offSchemeBlocks.samples[0]?.share).toBe(1);
    // Ловит: посаженная фотография не проверяет ничего — без условия плоскости она находка.
    const withoutFlatness = await page.evaluate(measureInPage, {
      ...MEASURE_OPTIONS,
      flatTolerance: 255,
    });
    expect(withoutFlatness.offSchemeBlocks.samples.map((block) => block.element)).toContain(
      'img#light-photo',
    );
    // Ловит: верхняя линия пустого раздела закрывает собой пустоту под ним, и полоса не называет
    // элемент, на котором кончается.
    expect(found.emptyBands).toEqual([expect.objectContaining({ next: 'p#end' })]);
    // Ловит: находки есть, а итог их не складывает: 1 широкая + 1 пустая таблица + 1 мёртвая заливка +
    // 1 таблица с текстом у края + колонка + код + обрезанная подпись + 2 блока (мелкая подпись — в
    // `smallText`, достижимая прокруткой — не в итоге).
    const base = countDefects(
      {
        ...found,
        tables: {
          ...found.tables,
          wide: { count: 0, samples: [] },
          sparse: { count: 0, samples: [] },
          deadSurface: { count: 0, samples: [] },
          flushText: { count: 0, samples: [] },
        },
        readingColumn: { ...found.readingColumn, narrow: false },
        codeBreaks: { count: 0, samples: [] },
        diagramLabels: { count: 0, small: 0, clipped: 0, scrolled: 0, samples: [] },
        offSchemeBlocks: { count: 0, samples: [] },
      },
      [],
      [],
    );
    expect(countDefects(found, [], []) - base).toBe(9);
  });

  test('finds section blocks off the prose column and a column that leaves the track empty', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1440, height: 900 });
    const prose = 'A paragraph of prose long enough to be the column of its section. '.repeat(4);
    // Раскладка одной оси: проза колонкой по центру дорожки, широкие блоки выступают поровну в обе стороны.
    // Собранный раздел — заголовок и проза в колонку, код во всю дорожку, рамка, облегающая рисунок, остров,
    // занявший свою рамку, центрованный рисунок, раскрытие в колонку — не находка. Рядом раздел с посаженными
    // дефектами: заголовок, вступление и свёрнутое раскрытие, чьи строки и линии уходят за колонку; блок со
    // своим отступом слева; в открытом раскрытии два соседних блока кода разной ширины (второй — ни колонка,
    // ни дорожка); рамка во всю дорожку вокруг рисунка в левой части и рамка острова, чей остров сообщил вдвое
    // меньшую ширину; широкий блок у левого края колонки, выступающий только вправо (ступенька правого края
    // прежней раскладки); и раздел из одной прозы, узкой колонкой на широкой дорожке. Раздел, где под
    // короткой прозой дорожку занимает широкий блок, и раздел другой композиции с тем же разбросом замер
    // не судит.
    await page.setContent(`<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
main { padding: 0 40px; }
.semantic-section { display: flow-root; margin: 2rem 0; }
.semantic-section > * { margin-inline: auto; }
details { border-block: 1px solid #888888; }
</style></head><body><main>
<section class="semantic-section" id="composed" data-composition="flow" style="width: 1080px">
<h2 style="max-width: 720px">A short title</h2>
<p style="max-width: 720px">${prose}</p>
<pre style="box-sizing: border-box; width: 100%; overflow-x: auto; background: #f4f4f4">const wide = '${'a code block takes the wide step only for a line that needs it '.repeat(3)}';</pre>
<figure style="width: fit-content; border: 1px solid #888888"><canvas width="900" height="60"></canvas></figure>
<figure data-island-ink="1076"><iframe title="island" style="display: block; width: 100%; height: 60px; border: 0"></iframe></figure>
<p style="max-width: 720px">${prose}</p>
<figure style="width: 400px; height: 100px; background: #eeeeee"></figure>
<details style="max-width: 720px"><summary>Collapsed detail</summary><p>Hidden.</p></details>
</section>
<section class="semantic-section" id="loose" data-composition="flow" style="width: 1300px">
<h2 id="long-title" style="margin-left: 365px; margin-right: 0">A section title that runs much further than the prose column below it does</h2>
<p style="max-width: 570px">${prose}</p>
<p class="semantic-lead" id="wide-lead" style="max-width: 900px; margin-left: 365px; margin-right: 0; font-size: 20px">${prose}</p>
<details id="full-detail"><summary>Collapsed detail across the whole track</summary><pre>const hidden = 'code';</pre></details>
<p style="max-width: 570px">${prose}</p>
<div id="shifted" style="margin-left: 40px; margin-right: 0; height: 40px; background: #eeeeee"></div>
<details open style="max-width: 570px"><summary>Open detail</summary><pre style="box-sizing: border-box; width: 570px; margin: 0">short = 1</pre><pre id="third-width" style="box-sizing: border-box; width: 800px; margin: 0 -115px; overflow-x: auto">${'x'.repeat(200)}</pre></details>
<figure id="hollow-frame" style="border: 1px solid #888888"><canvas width="300" height="60"></canvas></figure>
<figure id="hollow-island" data-island-ink="500"><iframe title="island" style="display: block; width: 100%; height: 60px; border: 0"></iframe></figure>
<div id="left-wide" style="width: 900px; margin-left: 365px; margin-right: 0; height: 40px; background: #eeeeee"></div>
</section>
<section class="semantic-section" id="prose-only" data-composition="flow" style="width: 1300px">
<h2 style="max-width: 570px">Short title</h2>
<p style="max-width: 570px">${prose}</p>
<p style="max-width: 570px">${prose}</p>
</section>
<section class="semantic-section" id="lead-first" data-composition="flow" style="width: 1300px">
<p class="semantic-lead" style="max-width: 640px; font-size: 20px">${prose}</p>
<ul style="max-width: 720px"><li>${prose}</li></ul>
<details style="max-width: 720px"><summary>Collapsed detail in the column</summary><p>Hidden.</p></details>
</section>
<section class="semantic-section" id="intro-wide" data-composition="flow" style="width: 1300px">
<p style="max-width: 570px">${prose}</p>
<div style="height: 120px; background: #eeeeee"></div>
</section>
<section class="semantic-section" id="split" data-composition="split" style="width: 1300px">
<h2>A section title that runs much further than the prose column below it does</h2>
<p style="max-width: 570px">${prose}</p>
<details><summary>Collapsed detail across the whole track</summary><p>Hidden.</p></details>
</section>
</main></body></html>`);
    const found = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    const samples = found.sectionColumns.samples.map((entry) => `${entry.element} ${entry.kind}`);
    // Ловит: раскрытие во всю дорожку и заголовок шире колонки прозы рядом (строки и линии соседних
    // блоков одного раздела разной длины), блок не на оси колонки — ни у её левого края, ни по центру, —
    // широкий блок у левого края, выступающий только вправо, и раздел, где ни колонка, ни один
    // блок не занимают больше 60% дорожки, блок кода третьей ширины внутри открытого раскрытия и пустота
    // внутри рамки (своя краска и ширина, сообщённая островом); собранный раздел, центрованный рисунок,
    // широкий блок под короткой прозой и раздел другой композиции не находки. Вступление крупнее прозы и
    // уже её колонки: колонкой раздела оно не становится, иначе список и раскрытие под ним вышли бы за
    // колонку, а вступление шире колонки — находка.
    // Образцов не больше восьми: каждый — одна из девяти посаженных находок, а счёт по видам ниже сверяет
    // все девять.
    const planted = [
      'h2#long-title overrun',
      'details#full-detail overrun',
      'p#wide-lead.semantic-lead overrun',
      'div#shifted misaligned',
      'section#prose-only.semantic-section empty-track',
      'pre#third-width code-width',
      'figure#hollow-frame hollow',
      'figure#hollow-island hollow',
      'div#left-wide misaligned',
    ];
    expect(samples).toHaveLength(8);
    for (const sample of samples) expect(planted).toContain(sample);
    expect(found.sectionColumns).toMatchObject({
      count: 9,
      misaligned: 2,
      overrun: 3,
      emptyTrack: 1,
      codeWidth: 1,
      hollow: 2,
    });
    // Ловит: на телефоне блоки выходят к краям экрана по правилу поля телефона — это не разброс оси.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    expect(phone.sectionColumns.count).toBe(0);
  });

  test('finds a column floating away from the contents and a page head wider than the column', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 2000, height: 900 });
    const prose = 'A paragraph of prose long enough to be the column of its section. '.repeat(4);
    // The owner's page on a 2000 px screen: the contents end at 320 px, the column is centred in the rest
    // of the window from 618 px, and the title runs past the column's right edge. The composed page puts
    // the column at the shell gap and keeps the title on the text column, on the column's axis.
    const layout = (
      columnLeft: number,
      titleWidth: number,
    ): string => `<!doctype html><html lang="en"><head><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
.sidebar { position: absolute; left: 48px; top: 0; width: 272px; }
main { position: absolute; left: ${columnLeft}px; width: 1085px; }
article > *, .semantic-section > * { margin-inline: auto; }
</style></head><body><nav class="sidebar"><a href="#one">One</a></nav><main><article>
<h1 id="title" style="width: ${titleWidth}px">A page title</h1>
<p style="max-width: 720px">${prose}</p>
<section class="semantic-section" id="one" data-composition="flow"><h2 style="max-width: 720px">One</h2><p style="max-width: 720px">${prose}</p><p style="max-width: 720px">${prose}</p></section>
</article></main></body></html>`;
    await page.setContent(layout(618, 1254));
    const floating = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    // Catches: the column floats 298 px away from the contents, and the title box runs 169 px past the
    // column the sections share.
    expect(floating.sectionColumns).toMatchObject({ headWide: 1, tocGap: 1 });
    expect(
      floating.sectionColumns.samples.map((entry) => `${entry.element} ${entry.kind}`),
    ).toEqual(expect.arrayContaining(['h1#title head-wide', 'article toc-gap']));
    await page.setContent(layout(368, 720));
    const composed = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    expect(composed.sectionColumns).toMatchObject({ count: 0, headWide: 0, tocGap: 0 });
  });

  test('measures entrance animations in their final state, not as empty bands', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const root = path.resolve('test-results/e2e-snapshot-measure', testInfo.project.name, 'reveal');
    await rm(root, { recursive: true, force: true });
    const source = path.join(root, 'source');
    await mkdir(source, { recursive: true });
    const sections = Array.from(
      { length: 5 },
      (_, index) =>
        `::::section{title="Part ${index + 1}" id="part-${index + 1}" recipe="story"}\n${'A paragraph that enters as the reader reaches it. '.repeat(6)}\n\n${'A second paragraph with more of the same. '.repeat(6)}\n::::\n`,
    );
    await writeFile(
      path.join(source, 'report.md'),
      `---\ntitle: Reveal\nlanguage: en\n---\n\n# Reveal\n\n${sections.join('\n')}`,
    );
    const result = await measureReport({
      input: source,
      output: path.join(root, 'out'),
      widths: [1440],
      schemes: ['dark'],
      motions: ['normal'],
    });
    // Ловит: содержимое, которое ещё не появилось, меряется как пустая полоса (ложная тревога).
    expect(result.measurements[0]?.emptyBands).toEqual([]);
    // Контрпример: та же страница, открытая без прокрутки и перемотки часов, пустые полосы даёт — значит,
    // проверка выше различает конечное состояние и непоказанное.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pathToFileURL(result.page).href);
    const unrevealed = await page.evaluate(measureInPage, MEASURE_OPTIONS);
    expect(unrevealed.emptyBands.length).toBeGreaterThan(0);
  });

  test('measures a zoom flight as scroll length and its hidden inside as unread, not as defects', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const root = path.resolve('test-results/e2e-snapshot-measure', testInfo.project.name, 'zoom');
    await rm(root, { recursive: true, force: true });
    const source = path.join(root, 'source');
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, 'report.md'),
      [
        '---\ntitle: Zoom\nlanguage: en\n---\n\n# Zoom\n',
        '::::::section{title="Service" id="service"}',
        '::::diagram{title="Service" description="A request reaches the API, which is a small flow."}',
        '::node{id="client" label="Client"}\n::node{id="api" label="API"}\n::node{id="store" label="Store"}',
        '::edge{from="client" to="api"}\n::edge{from="api" to="store"}',
        ':::zoom{node="api" title="Inside the API"}',
        '::node{id="router" label="Router"}\n::node{id="handler" label="Handler"}',
        '::edge{from="router" to="handler"}\n:::\n::::\n::::::\n',
        '::::section{title="After" id="after"}\nThe page goes on after the diagram.\n::::\n',
      ].join('\n'),
    );
    const result = await measureReport({
      input: source,
      output: path.join(root, 'out'),
      widths: [1440],
      schemes: ['light'],
      motions: ['normal'],
    });
    // Ловит: пролёт камеры меряется пустой полосой, а невидимая до пролёта изнанка узла — мелким текстом.
    expect(result.measurements[0]).toMatchObject({
      emptyBands: [],
      smallText: { count: 0 },
      diagramLabels: { small: 0 },
    });
    // Контрпример: изнанка в документе действительно мельче порога и прозрачна — проверка выше
    // пропускает её потому, что читатель её не видит, а не потому, что её нет.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pathToFileURL(result.page).href);
    const inside = await page.evaluate(() =>
      [...document.querySelectorAll('.visualization-zoom-inner text')].map((label) => {
        let opacity = 1;
        for (let node: Element | null = label; node !== null; node = node.parentElement)
          opacity *= Number(getComputedStyle(node).opacity);
        return { height: label.getBoundingClientRect().height, opacity };
      }),
    );
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((label) => label.height < 11 && label.opacity <= 0.01)).toBe(true);
  });

  test('keeps chart axis labels readable in a column beside the contents and on the narrowest phone', async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const root = path.resolve('test-results/e2e-snapshot-measure', testInfo.project.name, 'chart');
    await rm(root, { recursive: true, force: true });
    const source = path.join(root, 'source');
    await mkdir(source, { recursive: true });
    const points = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
      .map((label, index) => `::point{label="${label}" value="${(index + 1) * 1000}"}`)
      .join('\n');
    const chapter = (id: string) =>
      `::::::section{title="Chapter ${id}" id="${id}"}\nA paragraph of prose.\n::::::\n`;
    await writeFile(
      path.join(source, 'report.md'),
      `---\ntitle: Chart\nlanguage: en\n---\n\n# Chart\n\n${chapter('one')}\n::::::section{title="Reports" id="reports"}\n:::::chart{title="Reports" description="Reports per month." type="bar" x-label="Month" y-label="Reports"}\n::::series{label="Reports"}\n${points}\n::::\n:::::\n::::::\n\n${chapter('two')}`,
    );
    const result = await measureReport({
      input: source,
      output: path.join(root, 'out'),
      widths: [320, 1024],
      schemes: ['light'],
      motions: ['reduce'],
    });
    // Ловит: график выбирает вариант по окну, и в колонке рядом с оглавлением широкий рисунок мельчит
    // подписи осей; на телефоне в 320 px узкий рисунок шире своей дорожки и мельчит их же.
    for (const entry of result.measurements)
      expect(entry.smallText.count, `${entry.width}px`).toBe(0);
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
        ':::::section{title="Short" id="short"}',
        'One line.',
        '',
        // Главное действие есть, но не на первом экране.
        '::::actions',
        '::action[Start]{href="#long" kind="primary"}',
        '::::',
        ':::::',
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
