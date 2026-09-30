import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  MeasureReportResult,
  SnapshotMeasurement,
  SnapshotPageMeasures,
  SnapshotReportOptions,
  SnapshotReportResult,
  SnapshotMotion,
  SnapshotScheme,
  SnapshotShot,
  SnapshotStop,
} from '../contracts.js';
import type { Diagnostic } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../page-clock.js';
import { buildReport } from './compiler.js';
import { MEASURE_OPTIONS, measureInPage } from './snapshot-measure.js';

export const SNAPSHOT_DEFAULT_WIDTHS = [390, 768, 1440] as const;
/** Замеры дешевле кадров: по умолчанию и узкие телефоны, где чаще всего едет вбок, и планшет. */
export const MEASURE_DEFAULT_WIDTHS = [320, 360, 390, 768, 1024, 1440] as const;
export const SNAPSHOT_SCHEMES = ['light', 'dark'] as const satisfies readonly SnapshotScheme[];
export const SNAPSHOT_MOTIONS = ['normal', 'reduce'] as const satisfies readonly SnapshotMotion[];
const SNAPSHOT_HEIGHT = 900;
const MAXIMUM_FULL_PAGE_HEIGHT = 16_000;
const PAGE_FILE = 'page.html';
const CONTACT_SHEET_HTML = 'contact-sheet.html';
const CONTACT_SHEET_IMAGE = 'contact-sheet.png';
/**
 * Момент часов страницы, в котором снимается страница: к нему закончены появления, досчёт чисел и
 * переходы слайдов при любом темпе темы. Вторая перемотка на секунду позже доводит переходы, которые
 * начались в самой перемотке (например, сглаживание прогресса сцены).
 */
const SETTLED_SECONDS = 10;

/** Ровно то, чем команда пользуется из Playwright: пакет не зависит от него, а берёт у пользователя. */
interface SnapshotBrowser {
  newContext(options: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
    readonly colorScheme: SnapshotScheme;
    readonly reducedMotion: 'reduce' | 'no-preference';
  }): Promise<SnapshotContext>;
  close(): Promise<void>;
}
interface SnapshotContext {
  newPage(): Promise<SnapshotPage>;
  close(): Promise<void>;
}
export interface SnapshotPage {
  on(event: 'pageerror', listener: (error: Error) => void): unknown;
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): unknown;
  addInitScript(script: string): Promise<unknown>;
  goto(url: string, options: { readonly waitUntil: 'load' }): Promise<unknown>;
  evaluate<Result>(script: string): Promise<Result>;
  waitForTimeout(milliseconds: number): Promise<void>;
  screenshot(options: {
    readonly path: string;
    readonly fullPage: boolean;
    readonly clip?: { x: number; y: number; width: number; height: number };
  }): Promise<unknown>;
}
interface ChromiumLauncher {
  launch(options: { readonly headless: boolean }): Promise<SnapshotBrowser>;
}

/**
 * Снимки собранной страницы на заданных ширинах, в обеих схемах, с движением и без, и сводный лист.
 * Браузер пакет не везёт: команда берёт Playwright, установленный рядом (`npx -p agentic-report -p
 * playwright`), и его Chromium; без них — диагностика с командой установки.
 */
export async function snapshotReport(
  options: SnapshotReportOptions,
): Promise<SnapshotReportResult> {
  const widths = options.widths ?? SNAPSHOT_DEFAULT_WIDTHS;
  const schemes = options.schemes ?? SNAPSHOT_SCHEMES;
  const motions = options.motions ?? SNAPSHOT_MOTIONS;
  const outputDirectory = path.resolve(options.output);
  await requireEmptyDestination(outputDirectory);
  const chromium = await loadChromium();

  await mkdir(outputDirectory, { recursive: true });
  const pagePath = path.join(outputDirectory, PAGE_FILE);
  const build = await buildReport({
    input: options.input,
    output: pagePath,
    ...(options.since === undefined ? {} : { since: options.since }),
  });
  const pageUrl = pathToFileURL(pagePath).href;

  const browser = await launchChromium(chromium);
  const shots: SnapshotShot[] = [];
  const cutStops: Array<SnapshotStop & { width: number; scheme: string; motion: string }> = [];
  try {
    for (const width of widths) {
      for (const scheme of schemes) {
        for (const motion of motions) {
          const name = `${width}-${scheme}-${motion}`;
          const context = await browser.newContext({
            viewport: { width, height: SNAPSHOT_HEIGHT },
            deviceScaleFactor: 1,
            colorScheme: scheme,
            reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
          });
          try {
            const page = await context.newPage();
            // Страница идёт по ручным часам: снимок показывает один и тот же момент при каждом запуске.
            await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
            await page.goto(pageUrl, { waitUntil: 'load' });
            await page.evaluate(showScheme(scheme));
            await settle(page, motion);
            const firstScreen = path.join(outputDirectory, `${name}-first.png`);
            await page.screenshot({ path: firstScreen, fullPage: false });
            const fullPage = path.join(outputDirectory, `${name}-full.png`);
            const height = await page.evaluate<number>(
              'Math.ceil(document.documentElement.scrollHeight)',
            );
            await page.screenshot({
              path: fullPage,
              fullPage: true,
              ...(height > MAXIMUM_FULL_PAGE_HEIGHT
                ? { clip: { x: 0, y: 0, width, height: MAXIMUM_FULL_PAGE_HEIGHT } }
                : {}),
            });
            const stops = await photographStops(page, outputDirectory, name);
            shots.push({
              width,
              scheme,
              motion,
              firstScreen,
              fullPage,
              pageHeight: height,
              ...(stops.length === 0 ? {} : { stops }),
            });
            for (const stop of stops)
              if (!stop.fits) cutStops.push({ width, scheme, motion, ...stop });
          } finally {
            await context.close();
          }
        }
      }
    }

    const sheetHtml = path.join(outputDirectory, CONTACT_SHEET_HTML);
    await writeFile(sheetHtml, contactSheet(shots, outputDirectory));
    const sheetImage = path.join(outputDirectory, CONTACT_SHEET_IMAGE);
    const sheetContext = await browser.newContext({
      viewport: { width: 1600, height: SNAPSHOT_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    try {
      const sheet = await sheetContext.newPage();
      await sheet.goto(pathToFileURL(sheetHtml).href, { waitUntil: 'load' });
      await sheet.screenshot({ path: sheetImage, fullPage: true });
    } finally {
      await sheetContext.close();
    }

    return {
      outputDirectory,
      page: build.outputPath,
      shots,
      contactSheet: { html: sheetHtml, image: sheetImage },
      warnings: [...build.warnings, ...cutStops.map(cutStopWarning)],
    };
  } finally {
    await browser.close();
  }
}

async function requireEmptyDestination(directory: string): Promise<void> {
  const existing = await stat(directory).catch(() => undefined);
  if (existing === undefined) return;
  if (existing.isDirectory() && (await readdir(directory)).length === 0) return;
  throw new AgenticReportError({
    level: 'error',
    code: 'SNAPSHOT_DESTINATION_EXISTS',
    message: `Snapshot destination already has content: ${directory}`,
    remediation: 'Pass --out with an absent or empty directory; snapshots never overwrite files.',
    details: { output: directory },
  });
}

const PLAYWRIGHT_SPECIFIERS = ['playwright', 'playwright-core', '@playwright/test'] as const;

// Имена пакетов записаны буквально: команда грузит только Playwright, поставленный пользователем, и
// никогда — модуль, имя которого пришло бы из источника страницы.
const PLAYWRIGHT_LOADERS = [
  () => import('playwright' as string),
  () => import('playwright-core' as string),
  () => import('@playwright/test' as string),
] as const;

export async function loadChromium(): Promise<ChromiumLauncher> {
  for (const load of PLAYWRIGHT_LOADERS) {
    const loaded: unknown = await load().catch(() => undefined);
    const chromium = (loaded as { readonly chromium?: ChromiumLauncher } | undefined)?.chromium;
    if (chromium !== undefined && typeof chromium.launch === 'function') return chromium;
  }
  throw new AgenticReportError({
    level: 'error',
    code: 'SNAPSHOT_BROWSER_MISSING',
    message: 'Snapshots need Playwright next to agentic-report, and none was found.',
    remediation:
      'Run the command as `npx --yes -p agentic-report -p playwright agentic-report snapshot …`, or install playwright in the project, then install its browser once with `npx --yes playwright install chromium`.',
    details: { tried: PLAYWRIGHT_SPECIFIERS },
  });
}

export async function launchChromium(chromium: ChromiumLauncher): Promise<SnapshotBrowser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    throw new AgenticReportError({
      level: 'error',
      code: 'SNAPSHOT_BROWSER_MISSING',
      message: `Playwright is installed, but its Chromium could not start: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      remediation:
        'Install the browser that matches the installed Playwright once: `npx --yes playwright install chromium`.',
    });
  }
}

/**
 * Страница при обычном движении показывает главы по мере прокрутки: прежде чем снимать, её
 * проходят до конца и возвращают наверх, чтобы появления запустились, а шрифты догрузились. Затем
 * часы страницы перематываются в момент, когда всё движение закончено: снимок не зависит от того,
 * сколько настоящего времени заняли прокрутка и загрузка.
 */
/**
 * The page in the requested scheme whatever scheme its source names: `scheme: light` or `dark` is only
 * where the page starts, and the reader switches it with the scheme toggle, so both are photographed and
 * measured. A theme that has only a dark scheme stays dark.
 */
function showScheme(scheme: SnapshotScheme): string {
  return `document.documentElement.dataset.scheme = ${JSON.stringify(scheme)}`;
}

export async function settle(page: SnapshotPage, motion: SnapshotMotion): Promise<void> {
  await page.evaluate('document.fonts.ready.then(() => true)');
  if (motion === 'normal') {
    await page.evaluate(`(async () => {
      const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
      // Прокрутка мгновенная: плавная прокрутка страницы не успевала бы за шагом, и нижние главы не
      // доходили бы до экрана и оставались непоказанными.
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      return true;
    })()`);
  }
  // Настоящая пауза даёт наблюдателям страницы отозваться на прокрутку; время часов при этом стоит.
  await page.waitForTimeout(100);
  await page.evaluate(`window.__clock?.seek(${SETTLED_SECONDS})`);
  await page.waitForTimeout(100);
  await seekSettled(page, SETTLED_SECONDS + 1);
}

/** Сколько миллисекунд часов осталось до конца самой долгой конечной анимации документа. */
const PENDING_ANIMATION_MS = `(() => {
  let longest = 0;
  for (const animation of document.getAnimations()) {
    if (animation.timeline !== document.timeline || animation.playState === 'finished') continue;
    const timing = animation.effect?.getComputedTiming();
    const end = Number(timing?.endTime);
    const at = Number(timing?.localTime);
    if (Number.isFinite(end) && Number.isFinite(at)) longest = Math.max(longest, end - at);
  }
  return longest;
})()`;

/**
 * Перемотать часы к `seconds` и дальше, пока не кончатся переходы, начатые самой перемоткой. Перемотка
 * ставит состояние момента (подпись такта, кадр сцены), и стили начинают переход к нему в тот же момент
 * часов: без второй перемотки кадр снимал начало перехода — прежнюю подпись поверх новой, хотя браузер
 * через долю секунды показывает новую. Вторая перемотка выполняет и кадры, запрошенные в первой.
 * Возвращает момент, в котором страница встала.
 */
async function seekSettled(page: SnapshotPage, seconds: number): Promise<number> {
  let moment = seconds;
  await page.evaluate(`window.__clock?.seek(${moment})`);
  // Переход, законченный одним шагом, может начать следующий (подпись уходит, потом входит новая).
  // Приостановленная конечная анимация тоже считается незаконченной в каждом круге: перемотка её не
  // двигает, и часы могут уйти вперёд до четырёх её остатков. Для кадра это безвредно — лишнее время лишь
  // дальше от переходов, — а исключать приостановленные нельзя: часть их ведут сами часы страницы.
  for (let round = 0; round < 4; round += 1) {
    const pending = await page.evaluate<number>(PENDING_ANIMATION_MS);
    if (pending <= 0) break;
    moment += Math.ceil(pending) / 1000;
    await page.evaluate(`window.__clock?.seek(${moment})`);
  }
  return moment;
}

interface StopPlan {
  readonly kind: SnapshotStop['kind'];
  readonly id: string;
  readonly index: number;
  readonly steps: number;
}

/** Остановки страницы: экраны `layout: screens` и такты закреплённых сцен со скрабом. */
async function planStops(page: SnapshotPage): Promise<StopPlan[]> {
  return page.evaluate<StopPlan[]>(`(() => {
    const stops = [];
    const screens = window.agenticScreens?.check() ?? [];
    for (const screen of screens) stops.push({ kind: 'screen', id: screen.id, index: screen.screen, steps: 0 });
    for (const section of document.querySelectorAll('section[data-scene="scrub"][data-scene-live][id]')) {
      const steps = section.querySelectorAll('.semantic-beat[data-beat]').length;
      for (let index = 1; index <= steps; index += 1)
        stops.push({ kind: 'scene-step', id: section.id, index, steps });
    }
    return stops;
  })()`);
}

/**
 * Поставить страницу на остановку и сказать, помещается ли она в окно целиком: экран встаёт к верхнему
 * краю, такт — выставленным записью прогрессом середины своего отрезка.
 */
async function standAtStop(page: SnapshotPage, stop: StopPlan): Promise<boolean> {
  return page.evaluate<boolean>(`(() => {
    const target = document.getElementById(${JSON.stringify(stop.id)});
    if (target === null) return false;
    if (${JSON.stringify(stop.kind)} === 'screen') {
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      const measure = window.agenticScreens?.check()[${stop.index - 1}];
      return measure?.fits ?? false;
    }
    target.setAttribute('data-clock-progress', String((${stop.index} - 0.5) / ${stop.steps}));
    const track = target.querySelector('.scene-track');
    const pin = track?.querySelector('.scene-pin');
    (track ?? target).scrollIntoView({ block: 'start', behavior: 'instant' });
    if (pin === null || pin === undefined) return false;
    const box = pin.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight + 1;
  })()`);
}

async function releaseStops(page: SnapshotPage): Promise<void> {
  await page.evaluate(
    `document.querySelectorAll('section[data-scene="scrub"][data-clock-progress]').forEach((section) => section.removeAttribute('data-clock-progress'))`,
  );
}

/**
 * Кадр на каждой остановке (W-CHECKS): страница встаёт на остановку, часы перематываются, и остановка
 * снимается окном. Для каждой остановки записано, помещается ли она в окно целиком: обрезанная по сгибу
 * остановка — предупреждение снимка.
 */
export async function photographStops(
  page: SnapshotPage,
  directory: string,
  name: string,
): Promise<SnapshotStop[]> {
  const stops: SnapshotStop[] = [];
  let moment = SETTLED_SECONDS + 2;
  for (const stop of await planStops(page)) {
    const fits = await standAtStop(page, stop);
    await page.waitForTimeout(80);
    moment = (await seekSettled(page, moment)) + 1;
    const frame = path.join(
      directory,
      stop.kind === 'screen'
        ? `${name}-screen-${stop.index}.png`
        : `${name}-scene-${stop.id}-${stop.index}.png`,
    );
    await page.screenshot({ path: frame, fullPage: false });
    stops.push({ kind: stop.kind, id: stop.id, index: stop.index, frame, fits });
  }
  await releaseStops(page);
  return stops;
}

/**
 * Замеры вместо кадров (`snapshot --measure`): страница собирается, открывается на каждой ширине, в каждой
 * схеме и с каждым движением по тем же ручным часам, что и снимки, доводится до конечного состояния всех
 * анимаций и меряется в самой странице (`snapshot-measure.ts`): прокрутка вбок, мелкий кегль, контраст с
 * учётом прозрачности, текст под фиксированными элементами, пустые полосы, обрезанные заголовки, первый
 * экран, остановки, ошибки страницы, заглушки, незагруженные шрифты, широкие и пустые таблицы, колонка
 * чтения, разрывы кода внутри слова, подписи схем и блоки чужой схемы. Кадров и листа нет.
 */
export async function measureReport(options: SnapshotReportOptions): Promise<MeasureReportResult> {
  const widths = options.widths ?? MEASURE_DEFAULT_WIDTHS;
  const schemes = options.schemes ?? SNAPSHOT_SCHEMES;
  const motions = options.motions ?? SNAPSHOT_MOTIONS;
  const outputDirectory = path.resolve(options.output);
  await requireEmptyDestination(outputDirectory);
  const chromium = await loadChromium();
  await mkdir(outputDirectory, { recursive: true });
  const pagePath = path.join(outputDirectory, PAGE_FILE);
  const build = await buildReport({
    input: options.input,
    output: pagePath,
    ...(options.since === undefined ? {} : { since: options.since }),
  });
  const pageUrl = pathToFileURL(pagePath).href;
  const script = `(${measureInPage.toString()})(${JSON.stringify(MEASURE_OPTIONS)})`;

  const browser = await launchChromium(chromium);
  const measurements: SnapshotMeasurement[] = [];
  const cutStops: Array<SnapshotStop & { width: number; scheme: string; motion: string }> = [];
  try {
    for (const width of widths) {
      for (const scheme of schemes) {
        for (const motion of motions) {
          const context = await browser.newContext({
            viewport: { width, height: SNAPSHOT_HEIGHT },
            deviceScaleFactor: 1,
            colorScheme: scheme,
            reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
          });
          try {
            const page = await context.newPage();
            const pageErrors: string[] = [];
            page.on('pageerror', (error) => pageErrors.push(firstLine(error.message)));
            page.on('console', (message) => {
              if (message.type() === 'error') pageErrors.push(firstLine(message.text()));
            });
            await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
            await page.goto(pageUrl, { waitUntil: 'load' });
            await page.evaluate(showScheme(scheme));
            await settle(page, motion);
            const measures = await page.evaluate<SnapshotPageMeasures>(script);
            const stops: Array<Omit<SnapshotStop, 'frame'>> = [];
            for (const stop of await planStops(page))
              stops.push({
                kind: stop.kind,
                id: stop.id,
                index: stop.index,
                fits: await standAtStop(page, stop),
              });
            await releaseStops(page);
            for (const stop of stops)
              if (!stop.fits) cutStops.push({ width, scheme, motion, frame: '', ...stop });
            measurements.push({
              width,
              scheme,
              motion,
              ...measures,
              stops,
              pageErrors,
              defects: countDefects(measures, stops, pageErrors),
            });
          } finally {
            await context.close();
          }
        }
      }
    }
    return {
      outputDirectory,
      page: build.outputPath,
      measurements,
      warnings: [...build.warnings, ...cutStops.map(cutStopWarning)],
    };
  } finally {
    await browser.close();
  }
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

/** Число дефектов одного замера; каждое слагаемое — то, что `process.md` велит исправить. */
export function countDefects(
  measures: SnapshotPageMeasures,
  stops: readonly Omit<SnapshotStop, 'frame'>[],
  pageErrors: readonly string[],
): number {
  return (
    (measures.horizontalOverflow > 0 ? 1 : 0) +
    measures.smallText.count +
    measures.lowContrast.count +
    measures.coveredText.count +
    measures.emptyBands.length +
    measures.clippedHeadings.count +
    measures.placeholders +
    measures.failedFonts.length +
    // Первый экран обязан сказать, что это за страница, и дать главное действие, если оно у страницы есть.
    (measures.firstScreen.heading ? 0 : 1) +
    (measures.firstScreen.actionOnPage && !measures.firstScreen.action ? 1 : 0) +
    pageErrors.length +
    stops.filter((stop) => !stop.fits).length +
    measures.tables.wide.count +
    measures.tables.sparse.count +
    measures.tables.deadSurface.count +
    measures.tables.flushText.count +
    (measures.readingColumn.narrow ? 1 : 0) +
    measures.codeBreaks.count +
    // Мелкие подписи уже сосчитаны в `smallText`: сюда — только обрезанные, но не мелкие.
    (measures.diagramLabels.count - measures.diagramLabels.small) +
    measures.offSchemeBlocks.count +
    measures.sectionColumns.count
  );
}

function cutStopWarning(
  stop: SnapshotStop & { readonly width: number; readonly scheme: string; readonly motion: string },
): Diagnostic {
  const what =
    stop.kind === 'screen'
      ? `Screen ${stop.index} (${stop.id})`
      : `Step ${stop.index} of scene ${stop.id}`;
  return {
    level: 'warning',
    code: 'SNAPSHOT_STOP_CUT',
    message: `${what} does not fit the ${stop.width} px window: part of it is cut at the fold.`,
    remediation:
      'Shorten what the screen holds, split it into two sections, or move detail into a disclosure; the frame shows what the reader sees at this stop.',
    details: {
      width: stop.width,
      scheme: stop.scheme,
      motion: stop.motion,
      ...(stop.frame === '' ? {} : { frame: stop.frame }),
    },
  };
}

function contactSheet(shots: readonly SnapshotShot[], root: string): string {
  const widths = [...new Set(shots.map((shot) => shot.width))];
  const figures = widths
    .map((width) => {
      const row = shots
        .filter((shot) => shot.width === width)
        .map((shot) => figure(shot, root))
        .join('\n');
      return `<h2>${width} px</h2>\n<div class="row">\n${row}\n</div>`;
    })
    .join('\n');
  return sheetDocument(figures);
}

function figure(shot: SnapshotShot, root: string): string {
  const first = encodeURI(path.relative(root, shot.firstScreen).split(path.sep).join('/'));
  const full = encodeURI(path.relative(root, shot.fullPage).split(path.sep).join('/'));
  const label = `${shot.width} px · ${shot.scheme} · motion ${shot.motion}`;
  return `<figure><a href="${full}"><img src="${first}" alt="${label}" width="${Math.min(shot.width, 360)}"></a><figcaption>${label}</figcaption></figure>`;
}

function sheetDocument(figures: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Snapshots</title>
<style>
body{margin:24px;font:14px/1.4 system-ui,sans-serif;background:#f4f4f2;color:#1d1d1f}
.row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
h2{font-size:15px;margin:24px 0 10px}
figure{margin:0;background:#fff;padding:8px;border:1px solid #d6d6d2}
img{display:block;height:auto;max-width:360px}
figcaption{margin-top:6px}
</style></head>
<body><main>
${figures}
</main></body></html>
`;
}
