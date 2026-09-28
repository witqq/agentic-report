import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { snapshotReport } from '../../dist/node/core/snapshot.js';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Раскладка и рантайм движения страницы: режим экранов и его проверки (один жест — один экран, ничего не
 * обрезано по сгибу, кадр на каждой остановке), состояния страницы, уровень движения, сцена со скрабом,
 * переходы вида, кнопка паузы, текущая строка без наведения, поэтапный вход, тезис с заливкой, строки
 * кода такта, полоса глав «ряд узлов» и помощник геометрии. Движение идёт по ручным часам страницы:
 * `__clock.seek(t)` ставит всё в момент `t`, и проверка не зависит от скорости машины.
 */

const PLANE = path.resolve('examples/motion-showcase/assets/richat.jpg');

async function buildPage(
  project: string,
  name: string,
  markdown: string,
  frontmatter: string,
  extra?: (root: string) => Promise<void>,
): Promise<{ readonly url: string; readonly source: string }> {
  const root = path.resolve('test-results/e2e-layout-runtime', project, name);
  await rm(root, { recursive: true, force: true });
  const source = path.join(root, 'source');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'plane.jpg'), await readFile(PLANE));
  await writeFile(
    path.join(source, 'report.md'),
    `---\ntitle: Runtime\nlanguage: en\n${frontmatter}---\n\n${markdown}`,
  );
  await extra?.(source);
  const output = path.join(root, 'page.html');
  await buildReport({ input: source, output });
  return { url: pathToFileURL(output).href, source };
}

async function manual(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
}

/** Перемотка, настоящая пауза для наблюдателей и вторая перемотка в тот же момент. */
async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
  await page.waitForTimeout(60);
  await page.evaluate((t) => window.__clock?.seek(t), seconds);
}

const rootStates = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    document.documentElement
      .getAttributeNames()
      .filter((name) => name.startsWith('data-state-'))
      .sort(),
  );

const SCREENS = [
  '# Screens',
  '',
  'One gesture moves one screen.',
  '',
  '::::::section{title="Arrive" id="arrive" state="arrived"}',
  'The reader arrives.',
  '',
  '::::cards{title="Stations"}',
  ':::card{title="Arrive" when="arrived"}\nHere.\n:::',
  '',
  ':::card{title="Walk" when="walked"}\nThere.\n:::',
  '::::',
  '::::::',
  '',
  '::::section{title="Walk" id="walk" state="walked"}',
  'Then walks.',
  '::::',
  '',
  '::::::section{title="Scene" id="scene" scene="scrub"}',
  '![A plane](plane.jpg)',
  '![The plane again](plane.jpg)',
  '',
  ':::beat{title="One" state="one"}\nThe first step.\n:::',
  '',
  ':::beat{title="Two" state="two"}\nThe second step.\n:::',
  '',
  ':::beat{title="Three" state="three"}\nThe third step.\n:::',
  '::::::',
  '',
  '::::section{title="End" id="end"}',
  'The last screen.',
  '::::',
  '',
].join('\n');

const current = (page: Page): Promise<number | undefined> =>
  page.evaluate(() => window.agenticScreens?.current());

test.describe('screens mode', () => {
  test('one wheel gesture moves exactly one screen, keys and anchors move too', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1440, height: 900 });
    const { url } = await buildPage(
      testInfo.project.name,
      'screens',
      SCREENS,
      'layout: screens\nprogress: nodes\n',
    );
    await page.goto(url);
    await expect(page.locator('.screen-switcher a')).toHaveCount(5);
    expect(await current(page)).toBe(1);
    await page.mouse.move(700, 450);
    // Ловит: короткий жест тачпада оставляет страницу на месте (прилипание возвращает её назад).
    await page.mouse.wheel(0, 120);
    await expect.poll(() => current(page)).toBe(2);
    // Жест кончается, когда прокрутка дошла до экрана (`scrollend` пишет его в адрес), а не через
    // сколько-то миллисекунд: на загруженной машине плавная прокрутка идёт дольше.
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#arrive');
    await page.waitForTimeout(250);
    // Ловит: длинный жест с инерцией проносит через несколько экранов.
    for (let event = 0; event < 12; event += 1) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(20);
    }
    await expect.poll(() => current(page)).toBe(3);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#walk');
    expect(
      await page.evaluate(() => document.getElementById('walk')?.getBoundingClientRect().top),
    ).toBeCloseTo(
      await page.evaluate(
        () => document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0,
      ),
      -1,
    );
    // Ловит: клавиши листают на полэкрана, как у обычного документа.
    await page.keyboard.press('PageUp');
    await expect.poll(() => current(page)).toBe(2);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#arrive');
    await page.keyboard.press('End');
    await expect.poll(() => current(page)).toBe(5);
    // Ловит: переключатель экранов не ведёт к своему экрану.
    await page.locator('.screen-switcher a[href="#walk"]').click();
    await expect.poll(() => current(page)).toBe(3);
    await expect(page.locator('.screen-switcher a[href="#walk"]')).toHaveAttribute(
      'aria-current',
      'step',
    );
    // Ловит: якорь на странице ведёт к месту цели, а не к её экрану целиком.
    await page.evaluate(() => {
      window.location.hash = '#arrive';
    });
    await expect.poll(() => current(page)).toBe(2);
    // Якорь в адресе открывает свой экран сразу при загрузке.
    await page.goto('about:blank');
    await page.goto(`${url}#end`);
    await expect.poll(() => current(page)).toBe(5);
  });

  test('nothing is cut at the fold on a wide and a narrow screen', async ({ page }, testInfo) => {
    const { url } = await buildPage(
      testInfo.project.name,
      'screens-fit',
      SCREENS,
      'layout: screens\n',
    );
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(url);
      const screens = await page.evaluate(() => window.agenticScreens?.check() ?? []);
      expect(screens).toHaveLength(5);
      // Ловит: экран выше окна — его низ не виден ни на одной остановке.
      expect(
        screens.filter((screen) => !screen.fits),
        `${width}×${height}`,
      ).toEqual([]);
    }
  });

  test('the check names a screen that is cut at the fold', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1440, height: 700 });
    const long = Array.from(
      { length: 40 },
      (_, index) => `Line ${index + 1} of a long screen.`,
    ).join('\n\n');
    const { url } = await buildPage(
      testInfo.project.name,
      'screens-cut',
      `# Cut\n\n::::section{title="Long" id="long"}\n${long}\n::::\n\n::::section{title="Short" id="short"}\nOne line.\n::::\n`,
      'layout: screens\n',
    );
    await page.goto(url);
    const cut = await page.evaluate(() =>
      (window.agenticScreens?.check() ?? [])
        .filter((screen) => !screen.fits)
        .map((screen) => screen.id),
    );
    // Ловит: проверка всегда говорит «помещается», и обрезанный экран проходит незамеченным.
    expect(cut).toEqual(['long']);
  });

  test('scrolls as a document under reduced motion and prints as a document', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    const { url } = await buildPage(
      testInfo.project.name,
      'screens-still',
      SCREENS,
      'layout: screens\n',
    );
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-screens-still', '');
    // Ловит: при уменьшенном движении страница прилипает и перескакивает целыми экранами.
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType),
    ).toBe('none');
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(120);
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
    // Ловит: в печати экран остаётся высотой с окно, и лист полон пустоты.
    expect(
      await page.locator('#walk').evaluate((section) => getComputedStyle(section).minBlockSize),
    ).toBe('0px');
    await expect(page.locator('.screen-switcher')).toBeHidden();
  });

  test('snapshot takes a frame per stop and warns about a stop cut at the fold', async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    test.skip(testInfo.project.name !== 'desktop-chromium');
    test.setTimeout(120_000);
    const { source } = await buildPage(
      testInfo.project.name,
      'screens-snapshot',
      SCREENS,
      'layout: screens\n',
    );
    const out = path.resolve(
      'test-results/e2e-layout-runtime',
      testInfo.project.name,
      'snapshot-out',
    );
    await rm(out, { recursive: true, force: true });
    const result = await snapshotReport({
      input: source,
      output: out,
      widths: [1440],
      schemes: ['light'],
      motions: ['normal'],
    });
    const stops = result.shots[0]?.stops ?? [];
    // Ловит: снимок видит только первое окно и всю страницу, а не остановки читателя.
    expect(stops.map((stop) => `${stop.kind}:${stop.id}:${stop.index}`)).toEqual([
      'screen:screen-1:1',
      'screen:arrive:2',
      'screen:walk:3',
      'screen:scene:4',
      'screen:end:5',
      'scene-step:scene:1',
      'scene-step:scene:2',
      'scene-step:scene:3',
    ]);
    expect(stops.every((stop) => stop.fits)).toBe(true);
    for (const stop of stops) await access(stop.frame);
    expect(result.warnings.filter((warning) => warning.code === 'SNAPSHOT_STOP_CUT')).toEqual([]);

    // Ловит: предупреждение не приходит и на экране, который действительно обрезан по сгибу.
    const long = Array.from(
      { length: 40 },
      (_, index) => `Line ${index + 1} of a long screen.`,
    ).join('\n\n');
    const cut = await buildPage(
      testInfo.project.name,
      'screens-snapshot-cut',
      `# Cut\n\n::::section{title="Long" id="long"}\n${long}\n::::\n\n::::section{title="Short" id="short"}\nOne line.\n::::\n`,
      'layout: screens\n',
    );
    const cutOut = path.resolve(
      'test-results/e2e-layout-runtime',
      testInfo.project.name,
      'snapshot-cut-out',
    );
    await rm(cutOut, { recursive: true, force: true });
    const cutResult = await snapshotReport({
      input: cut.source,
      output: cutOut,
      widths: [1440],
      schemes: ['light'],
      motions: ['normal'],
    });
    const warned = cutResult.warnings.filter((warning) => warning.code === 'SNAPSHOT_STOP_CUT');
    expect(warned.map((warning) => warning.message)).toEqual([
      expect.stringMatching(/^Screen \d+ \(long\) does not fit the 1440 px window/u),
    ]);
  });
});

test.describe('page states', () => {
  test('a section reached lights its stations, scrolling back dims them, a count starts on its state', async ({
    page,
  }, testInfo) => {
    await manual(page);
    const { url } = await buildPage(
      testInfo.project.name,
      'states',
      [
        '# States',
        '',
        '::::section{title="Intro" id="intro"}',
        Array.from({ length: 30 }, () => 'Filler text before the stations.').join('\n\n'),
        '::::',
        '',
        '::::::section{title="Stations" id="stations" state="stations"}',
        '::::cards{title="Line"}',
        ':::card{title="Arrive" when="stations"}\nHere.\n:::',
        '::::',
        '',
        'Read :count[1,284]{when="stations"} files.',
        '::::::',
        '',
      ].join('\n'),
      '',
    );
    await page.goto(url);
    await seek(page, 3);
    const card = page.locator('.semantic-card[data-when="stations"]');
    expect(await rootStates(page)).toEqual([]);
    await expect(card).not.toHaveAttribute('data-state-on', '');
    // Ловит: станция горит до того, как читатель дошёл до своей главы.
    expect(
      Number(await card.evaluate((element) => getComputedStyle(element).opacity)),
    ).toBeLessThan(0.6);
    await page.locator('#stations').evaluate((section) =>
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - 200,
        behavior: 'instant',
      }),
    );
    await seek(page, 3.1);
    expect(await rootStates(page)).toEqual(['data-state-stations']);
    await expect(card).toHaveAttribute('data-state-on', '');
    // Ловит: число с `when` досчитывает при появлении, а не по своему состоянию.
    await seek(page, 3.45);
    expect(await page.locator('.semantic-count').textContent()).not.toBe('1,284');
    await seek(page, 6);
    expect(await page.locator('.semantic-count').textContent()).toBe('1,284');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await seek(page, 6.1);
    // Ловит: состояние, раз поставленное прокруткой, не снимается при возврате назад.
    expect(await rootStates(page)).toEqual([]);
    await expect(card).not.toHaveAttribute('data-state-on', '');
  });

  test('a recording sets a state through the section progress, and reduced motion lights every station', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await manual(page);
    const markdown =
      '# States\n\n::::section{title="Intro"}\nText.\n::::\n\n::::::section{title="Far" id="far" state="far"}\n::::cards{title="Line"}\n:::card{title="Far" when="far"}\nThere.\n:::\n::::\n::::::\n';
    const { url } = await buildPage(testInfo.project.name, 'states-clock', markdown, '');
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto(url);
    await page
      .locator('#far')
      .evaluate((section) => section.setAttribute('data-clock-progress', '0.8'));
    await seek(page, 1);
    // Ловит: состояние от прокрутки нельзя выставить записью — кадр ролика зависит от прокрутки.
    expect(await rootStates(page)).toEqual(['data-state-far']);
    await page
      .locator('#far')
      .evaluate((section) => section.setAttribute('data-clock-progress', '0'));
    await seek(page, 4);
    await seek(page, 8);
    const dimmed = page.locator('.semantic-card[data-when="far"]');
    expect(
      Number(await dimmed.evaluate((element) => getComputedStyle(element).opacity)),
    ).toBeLessThan(0.5);
    await page.emulateMedia({ media: 'print' });
    // Ловит: в печати станция, до которой читатель не дошёл, так и остаётся приглушённой.
    expect(Number(await dimmed.evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
    await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
    await page.goto(url);
    const card = page.locator('.semantic-card[data-when="far"]');
    // Ловит: без движения станция остаётся приглушённой, а конечное состояние не нарисовано.
    expect(Number(await card.evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
  });
});

const SCRUB = [
  '# Scrub',
  '',
  '::::section{title="Before"}\nText before the scene.\n::::',
  '',
  '::::::section{title="Scene" id="scene" scene="scrub"}',
  '![First](plane.jpg)',
  '![Second](plane.jpg)',
  '![Third](plane.jpg)',
  '',
  ':::beat{title="One" state="one"}\nThe first step.\n:::',
  '',
  ':::beat{title="Two" state="two"}\nThe second step.\n:::',
  '',
  ':::beat{title="Three" state="three"}\nThe third step.\n:::',
  '::::::',
  '',
  '::::section{title="After"}\nText after the scene.\n::::',
  '',
].join('\n');

test.describe('scrub scene', () => {
  test('switches the caption at a third of a segment, holds every segment at the end and restores on the way back', async ({
    page,
  }, testInfo) => {
    await manual(page);
    const { url } = await buildPage(testInfo.project.name, 'scrub', SCRUB, '');
    await page.goto(url);
    const scene = page.locator('#scene');
    await expect(scene).toHaveAttribute('data-scene-live', '');
    await scene
      .locator('.scene-track')
      .evaluate((track) => track.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const at = async (progress: number) => {
      await scene.evaluate(
        (section, value) => section.setAttribute('data-clock-progress', String(value)),
        progress,
      );
      await seek(page, 1 + progress);
      return scene.evaluate((section) => ({
        caption: section.querySelector<HTMLElement>('.semantic-beat[data-current]')?.dataset.beat,
        frame: section.querySelector<HTMLElement>('img[data-scene-active]')?.dataset.sceneFrame,
        segments: [...section.querySelectorAll<HTMLElement>('.scene-segments li')].map((bar) =>
          Number(bar.style.getPropertyValue('--segment-fill')),
        ),
        position: section.querySelector('.scene-position')?.textContent,
        opacity: [...section.querySelectorAll<HTMLElement>('.semantic-beat')].map(
          (beat) => beat.isConnected,
        ),
      }));
    };
    // Треть второго отрезка ещё не пройдена: подпись первая.
    const early = await at(1.3 / 3);
    expect(early.caption).toBe('0');
    const second = await at(1.4 / 3);
    // Ловит: подпись меняется на самой границе отрезка, а не на его трети.
    expect(second.caption).toBe('1');
    expect(second.frame).toBe('1');
    expect(second.position).toBe('Step 2 of 3');
    expect(await rootStates(page)).toEqual(['data-state-one', 'data-state-two']);
    const end = await at(1);
    // Ловит: последний такт гасит прежние отрезки и состояния.
    expect(end.segments).toEqual([1, 1, 1]);
    expect(await rootStates(page)).toEqual([
      'data-state-one',
      'data-state-three',
      'data-state-two',
    ]);
    const back = await at(1.4 / 3);
    // Ловит: такты удаляются, а не прячутся прозрачностью, и прокрутка назад не восстанавливает картину.
    expect(back).toEqual(second);
    expect(await rootStates(page)).toEqual(['data-state-one', 'data-state-two']);
    // Высота подписи постоянна: все подписи в одной ячейке.
    const heights = await scene
      .locator('.semantic-beat')
      .evaluateAll((beats) => beats.map((beat) => (beat as HTMLElement).offsetTop));
    expect(new Set(heights).size).toBe(1);
    await page.emulateMedia({ media: 'print' });
    // Ловит: в печати живой сцены видна одна подпись, а остальные такты пропадают с листа.
    const printed = await scene
      .locator('.semantic-beat')
      .evaluateAll((beats) => beats.map((beat) => getComputedStyle(beat).opacity));
    expect(printed).toEqual(['1', '1', '1']);
    await page.emulateMedia({ media: 'screen' });
    if (testInfo.project.name === 'mobile-chromium') {
      // Ловит: на телефоне сцена и подпись стоят рядом и не помещаются в ширину.
      const [stage, caption] = await Promise.all([
        scene.locator('.scene-stage').boundingBox(),
        scene.locator('.scene-beats').boundingBox(),
      ]);
      expect((stage?.y ?? 0) + (stage?.height ?? 0)).toBeLessThanOrEqual((caption?.y ?? 0) + 1);
    }
  });

  test('without motion the scene reads in order with every state set', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { url } = await buildPage(testInfo.project.name, 'scrub-still', SCRUB, '');
    await page.goto(url);
    const scene = page.locator('#scene');
    await expect(scene).not.toHaveAttribute('data-scene-live', '');
    // Ловит: без движения показана одна подпись из трёх, а конечное состояние сцены не нарисовано.
    for (const beat of await scene.locator('.semantic-beat').all())
      await expect(beat).toBeVisible();
    expect(await rootStates(page)).toEqual([
      'data-state-one',
      'data-state-three',
      'data-state-two',
    ]);
  });
});

test.describe('motion level', () => {
  const GLOW = async (root: string): Promise<void> => {
    await mkdir(path.join(root, 'extensions/glow'), { recursive: true });
    for (const file of ['effect.mjs', 'extension.yaml', 'example-one.md', 'example-two.md'])
      await writeFile(
        path.join(root, 'extensions/glow', file),
        await readFile(path.resolve('tests/fixtures/extensions/effect/extensions/glow', file)),
      );
  };
  const GLOW_PAGE =
    '# Glow\n\n::::section{title="Lit" id="lit" glow="soft"}\nA section the effect decorates.\n::::\n\n::::section{title="Plain" id="plain"}\nAfter.\n::::\n';

  test('none and restrained draw extension effects still; none stills the whole page', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    for (const level of ['none', 'restrained'] as const) {
      const { url } = await buildPage(
        testInfo.project.name,
        `level-${level}`,
        GLOW_PAGE,
        `motion: ${level}\nextensions:\n  - extensions/glow/extension.yaml\n`,
        GLOW,
      );
      await page.goto(url);
      const glow = () =>
        page.evaluate(() =>
          window.__agenticReportEffectEngine?.status().find((effect) => effect.name === 'glow'),
        );
      await expect.poll(async () => (await glow())?.render).toBe('still');
      // Ловит: уровень из шапки не доходит до движка, и эффект расширения рисуется живым.
      expect((await glow())?.reason).toBe('motion-level');
    }
    const { url } = await buildPage(
      testInfo.project.name,
      'level-none-screens',
      SCREENS.replace(/::::::section\{title="Scene"[\s\S]*?::::::\n\n/u, ''),
      'motion: none\nlayout: screens\n',
    );
    await page.goto(url);
    // Ловит: `motion: none` не останавливает прилипание экранов, хотя читатель не просил движения.
    await expect(page.locator('html')).toHaveAttribute('data-screens-still', '');
  });
});

test.describe('pause control', () => {
  const CONTINUOUS = async (root: string): Promise<void> => {
    const dir = path.join(root, 'extensions/drift');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'effect.mjs'),
      "import { defineEffect } from 'agentic-report/effect';\nexport default defineEffect({\n  endless: true,\n  mount(context) {\n    return { at(t) { for (const host of context.hosts) host.dataset.driftAt = String(Math.round(t * 10)); } };\n  },\n});\n",
    );
    await writeFile(
      path.join(dir, 'extension.yaml'),
      'kind: effect\nname: drift\ndescription: A slow drift behind a section.\nstaticEquivalent: The section as it is.\nmodule: effect.mjs\ntargets:\n  - directive: section\n    attribute: drift\n    values: [slow]\nexamples: [one.md, two.md]\n',
    );
    for (const name of ['one.md', 'two.md'])
      await writeFile(
        path.join(dir, name),
        '---\ntitle: Drift\nlanguage: en\nextensions:\n  - extension.yaml\n---\n\n# Drift\n\n::::section{title="D" drift="slow"}\nText.\n::::\n',
      );
  };
  const DRIFT_PAGE =
    '# Drift\n\n::::section{title="Drifting" id="drifting" drift="slow"}\nA paragraph the drift runs behind.\n\nA second paragraph.\n::::\n\n::::section{title="After"}\nText after.\n::::\n';

  test('continuous motion gets a pressed-state button in the flow, remembered across loads', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.addInitScript(() => {
      window.__agenticReportRender = 'live';
    });
    const { url } = await buildPage(
      testInfo.project.name,
      'pause',
      DRIFT_PAGE,
      'extensions:\n  - extensions/drift/extension.yaml\n',
      CONTINUOUS,
    );
    await page.goto(url);
    const button = page.locator('.motion-pause-button');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Ловит: кнопка стоит поверх текста, а не в потоке страницы после блока с движением.
    const overlaps = await page.evaluate(() => {
      const box = document.querySelector('.motion-pause-button')?.getBoundingClientRect();
      if (box === undefined) return ['no button'];
      return [...document.querySelectorAll('p, h1, h2')]
        .map((text) => text.getBoundingClientRect())
        .filter(
          (text) =>
            text.left < box.right &&
            text.right > box.left &&
            text.top < box.bottom &&
            text.bottom > box.top,
        )
        .map((text) => `${text.top}`);
    });
    expect(overlaps).toEqual([]);
    expect(
      await page.locator('[data-motion-pause]').evaluate((holder) => holder.parentElement?.id),
    ).toBe('drifting');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', '');
    // Ловит: выбор читателя забывается при следующей загрузке.
    await page.reload();
    await expect(page.locator('.motion-pause-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', '');
  });

  test('starts paused under reduced motion', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.__agenticReportRender = 'live';
    });
    const { url } = await buildPage(
      testInfo.project.name,
      'pause-reduced',
      DRIFT_PAGE,
      'extensions:\n  - extensions/drift/extension.yaml\n',
      CONTINUOUS,
    );
    await page.goto(url);
    // Ловит: при уменьшенном движении непрерывное движение сразу идёт, и его приходится останавливать.
    await expect(page.locator('.motion-pause-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', '');
  });
});

test.describe('view transitions', () => {
  const TABS = [
    '# Views',
    '',
    '::::::section{title="Switch" id="switch"}',
    ':::::tabs{title="Views"}',
    '::::tab{label="List"}',
    '- API',
    '- Store',
    '::::',
    '',
    '::::tab{label="Diagram"}',
    ':::diagram{title="Flow" description="API to store."}',
    '::node{id="api" label="API"}',
    '::node{id="store" label="Store"}',
    '::edge{from="api" to="store"}',
    ':::',
    '::::',
    ':::::',
    '::::::',
    '',
  ].join('\n');

  test('a tab switch runs a view transition that carries list rows into diagram nodes, and changes at once without support', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    const { url } = await buildPage(testInfo.project.name, 'tabs', TABS, '');
    await page.goto(url);
    await page.evaluate(() => {
      const spy = window as unknown as { names: string[]; calls: number };
      spy.names = [];
      spy.calls = 0;
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((update: () => void) => {
        spy.calls += 1;
        return start(() => {
          update();
          spy.names = [
            ...document.querySelectorAll<HTMLElement | SVGElement>(
              '[style*="view-transition-name"]',
            ),
          ].map((element) =>
            (element.getAttribute('data-node-id') ?? element.textContent ?? '').trim(),
          );
        });
      }) as typeof document.startViewTransition;
    });
    await page.getByRole('tab', { name: 'Diagram' }).first().click();
    // Ловит: вкладка сменяется без перехода, а общие предметы не узнаются в новом виде.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
      .toBe(1);
    // Имена снимаются в обновлении перехода, которое браузер зовёт после снимка старого вида.
    await expect
      .poll(async () =>
        (await page.evaluate(() => (window as unknown as { names: string[] }).names)).sort(),
      )
      .toEqual(['api', 'store']);
    await expect(page.locator('[data-tab-panel]').nth(1)).toBeVisible();

    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, 'startViewTransition');
    });
    await page.goto(url);
    await page.getByRole('tab', { name: 'Diagram' }).first().click();
    // Ловит: без View Transitions смена вкладки ломается или ждёт перехода, которого нет.
    await expect(page.locator('[data-tab-panel]').nth(1)).toBeVisible();
    await expect(page.locator('[data-tab-panel]').nth(0)).toBeHidden();
  });

  test('reduced motion changes the tab at once', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { url } = await buildPage(testInfo.project.name, 'tabs-still', TABS, '');
    await page.goto(url);
    await page.evaluate(() => {
      const spy = window as unknown as { calls: number };
      spy.calls = 0;
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((update: () => void) => {
        spy.calls += 1;
        return start(update);
      }) as typeof document.startViewTransition;
    });
    await page.getByRole('tab', { name: 'Diagram' }).first().click();
    await expect(page.locator('[data-tab-panel]').nth(1)).toBeVisible();
    // Ловит: переход вида идёт и тогда, когда читатель просил не двигать страницу.
    expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(0);
  });
});

test.describe('first screen and chapters', () => {
  const OPENING = [
    '# The page moves with the reader',
    '',
    'A subtitle that says what the page is for.',
    '',
    ':::actions',
    '::action[Start]{href="#thesis"}',
    ':::',
    '',
    '::::section{title="Demo" id="demo" place="opening" transition="staged" frame="panel"}',
    '![A plane](plane.jpg)',
    '::::',
    '',
    '::::section{title="Thesis" id="thesis" recipe="thesis"}',
    ':::lead',
    'A claim filled with colour as the reader goes through it, line by line, from the top to the bottom.',
    ':::',
    '::::',
    '',
    '::::section{title="Clip" id="clip" transition="clip"}',
    'This chapter opens from its lower edge.',
    '::::',
    '',
    '::::section{title="Last" id="last"}',
    Array.from({ length: 12 }, () => 'Closing text.').join('\n\n'),
    '::::',
    '',
  ].join('\n');

  test('the first screen enters title, subtitle, actions, scene in turn and rebuilds geometry after', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await manual(page);
    await page.addInitScript(() => {
      document.addEventListener('agentic-report:geometry', (event) => {
        const holder = window as unknown as { reasons?: string[] };
        holder.reasons = [
          ...(holder.reasons ?? []),
          (event as CustomEvent<{ reason: string }>).detail.reason,
        ];
      });
    });
    const { url } = await buildPage(testInfo.project.name, 'opening', OPENING, 'layout: landing\n');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    const opacity = (part: string) =>
      page
        .locator(`[data-entrance-part="${part}"]`)
        .evaluate((element) => Number(getComputedStyle(element).opacity));
    await seek(page, 0.3);
    const early = {
      subtitle: await opacity('subtitle'),
      actions: await opacity('actions'),
      scene: await opacity('scene'),
    };
    // Ловит: части первого экрана входят разом, а не по порядку чтения.
    expect(early.subtitle).toBeLessThan(0.05);
    expect(early.actions).toBe(0);
    expect(early.scene).toBe(0);
    await seek(page, 0.9);
    expect(await opacity('subtitle')).toBeGreaterThan(early.subtitle);
    expect(await opacity('scene')).toBe(0);
    await seek(page, 5);
    await expect(page.locator('[data-page-opening]')).toHaveAttribute('data-entrance', 'done');
    expect(await opacity('scene')).toBe(1);
    // Ловит: зависимая геометрия не пересобирается после входа.
    expect(
      await page.evaluate(() => (window as unknown as { reasons?: string[] }).reasons ?? []),
    ).toContain('entrance');
  });

  test('the thesis fills as the reader goes and a clip chapter opens from its lower edge', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await manual(page);
    const { url } = await buildPage(testInfo.project.name, 'thesis', OPENING, 'layout: landing\n');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    const lead = page.locator('#thesis > .semantic-lead');
    const fill = () =>
      lead.evaluate((element) => Number(element.style.getPropertyValue('--thesis-fill')));
    await lead.evaluate((element) =>
      window.scrollTo({
        top: element.getBoundingClientRect().top + window.scrollY - 850,
        behavior: 'instant',
      }),
    );
    await seek(page, 1);
    const low = await fill();
    await lead.evaluate((element) =>
      window.scrollTo({
        top: element.getBoundingClientRect().top + window.scrollY - 350,
        behavior: 'instant',
      }),
    );
    await seek(page, 1.1);
    const high = await fill();
    // Ловит: тезис залит сразу или не отвечает прокрутке.
    expect(low).toBeLessThan(0.1);
    expect(high).toBeGreaterThan(low);
    const clip = page.locator('#clip > p');
    await page.locator('#clip').scrollIntoViewIfNeeded();
    await seek(page, 1.2);
    await seek(page, 4);
    // Ловит: глава с маской остаётся закрытой или открывается сдвигом, а не маской.
    expect(await clip.evaluate((element) => getComputedStyle(element).clipPath)).not.toMatch(
      /100%/u,
    );
    expect(await clip.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  });

  test('the progress view “nodes” marks the passed chapters and the current one', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await manual(page);
    const { url } = await buildPage(
      testInfo.project.name,
      'nodes',
      OPENING,
      'layout: landing\nprogress: nodes\n',
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await page.locator('#clip').evaluate((section) =>
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - 60,
        behavior: 'instant',
      }),
    );
    await seek(page, 1);
    const bar = page.locator('[data-chapter-progress][data-variant="nodes"]');
    await expect(bar).toBeAttached();
    const nodes = await bar
      .locator('.chapter-progress-segment')
      .evaluateAll((segments) =>
        segments.map((segment) =>
          segment.hasAttribute('data-current')
            ? 'current'
            : segment.hasAttribute('data-passed')
              ? 'passed'
              : 'ahead',
        ),
      );
    // Ловит: ряд узлов не отличает пройденные главы от текущей и будущих.
    expect(nodes).toEqual(['passed', 'current', 'ahead']);
  });
});

test.describe('steps scene on a narrow screen and code lines', () => {
  const CODE = [
    '# Code',
    '',
    '::::::section{title="Walkthrough" id="walkthrough" scene="steps"}',
    '```ts',
    'const a = 1;',
    'const b = 2;',
    'const c = a + b;',
    '```',
    '',
    ':::beat{title="Declare" lines="1-2"}\nTwo constants.\n:::',
    '',
    ':::beat{title="Add" lines="3"}\nTheir sum.\n:::',
    '::::::',
    '',
    '::::section{title="After"}',
    Array.from({ length: 12 }, () => 'Closing text.').join('\n\n'),
    '::::',
    '',
  ].join('\n');

  test('each beat lights its code lines, and a phone keeps the media above the current step', async ({
    page,
  }, testInfo) => {
    const { url } = await buildPage(testInfo.project.name, 'code', CODE, '');
    await page.goto(url);
    const code = page.locator('#walkthrough');
    await code
      .locator('.semantic-beat')
      .nth(1)
      .evaluate((beat) => beat.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(code.locator('.semantic-beat').nth(1)).toHaveAttribute('data-current', '');
    // Ловит: такт не зажигает свои строки кода — состояния «строка кода» нет.
    await expect
      .poll(() =>
        code
          .locator('pre code .line')
          .evaluateAll((lines) => lines.map((line) => line.hasAttribute('data-lit'))),
      )
      .toEqual([false, false, true]);
    if (testInfo.project.name === 'mobile-chromium') {
      await expect(code).toHaveAttribute('data-scene-narrow', '');
      const stage = await code.locator('.scene-stage').boundingBox();
      const beat = await code.locator('.semantic-beat').nth(1).boundingBox();
      // Ловит: на узком экране медиа стоит один раз перед всеми шагами и ушло из вида к текущему шагу.
      expect(stage?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((stage?.y ?? 0) + (stage?.height ?? 0)).toBeLessThanOrEqual((beat?.y ?? 0) + 1);
    }
  });

  test('a phone marks the row in the middle of the screen as current, a hover screen does not', async ({
    page,
  }, testInfo) => {
    await manual(page);
    const steps = [
      '# Rows',
      '',
      '::::section{title="Intro"}',
      Array.from({ length: 10 }, () => 'Filler.').join('\n\n'),
      '::::',
      '',
      ':::steps{title="Procedure"}',
      '1. First',
      '2. Second',
      '3. Third',
      ':::',
      '',
      '::::section{title="After"}',
      Array.from({ length: 20 }, () => 'Filler.').join('\n\n'),
      '::::',
      '',
    ].join('\n');
    const { url } = await buildPage(testInfo.project.name, 'rows', steps, '');
    await page.goto(url);
    await page
      .locator('.semantic-steps li')
      .nth(1)
      .evaluate((row) => row.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(100);
    await seek(page, 1);
    const marked = await page.locator('.semantic-steps li[data-current]').allTextContents();
    if (testInfo.project.name === 'mobile-chromium') {
      // Ловит: на устройстве без наведения строка у середины экрана не отмечена.
      expect(marked.map((text) => text.trim())).toEqual(['Second']);
    } else {
      // Ловит: отметка дублирует наведение там, где курсор есть.
      expect(marked).toEqual([]);
    }
  });
});

test('the geometry helper skips a height-only resize and rebuilds on a width change', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const markdown =
    '# Glow\n\n::::section{title="Lit" id="lit" glow="soft"}\nA section the effect decorates.\n::::\n';
  const { url } = await buildPage(
    testInfo.project.name,
    'geometry',
    markdown,
    'extensions:\n  - extensions/glow/extension.yaml\n',
    async (root) => {
      await mkdir(path.join(root, 'extensions/glow'), { recursive: true });
      for (const file of ['effect.mjs', 'extension.yaml', 'example-one.md', 'example-two.md'])
        await writeFile(
          path.join(root, 'extensions/glow', file),
          await readFile(path.resolve('tests/fixtures/extensions/effect/extensions/glow', file)),
        );
    },
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  const rebuilds = () =>
    page.evaluate(
      () =>
        window.__agenticReportEffectEngine?.status().find((effect) => effect.name === 'glow')
          ?.rebuilds ?? -1,
    );
  await page.waitForTimeout(300);
  const before = await rebuilds();
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(300);
  // Ловит: изменение одной высоты (панель адреса телефона) пересобирает геометрию текста.
  expect(await rebuilds()).toBe(before);
  await page.setViewportSize({ width: 1100, height: 640 });
  await expect.poll(rebuilds).toBeGreaterThan(before);
});
