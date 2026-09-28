/**
 * `agentic-report effect-check` — проверка эффекта уровня 2 теми же мерками, что и встроенного `threads`.
 * Команда собирает объявленные примеры, открывает их в Chromium (Playwright пользователя, как у
 * `snapshot`) и проходит одиннадцать проверок; итог — «N of M checks passed», по строке на проверку.
 *
 * Страницы открываются по ручным часам (`src/page-clock.ts`), кроме замера производительности: снимок
 * после `seek(t)` не зависит от настоящего времени. Инструментирование ставится до скрипта страницы и
 * записывает, что делал код эффекта, пока движок помечал его текущим (`__agenticReportEffectEngine.current`):
 * свои `requestAnimationFrame`/`setTimeout`/`setInterval` и цвета, отданные 2D-холсту и WebGL.
 *
 * Каждая проверка ловит свой дефект; какой — сказано в её описании ниже и в docs/TESTING.md.
 */

import { mkdir, readFile, readdir, stat, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { THEME_TOKENS } from '../authoring/theme-tokens.js';
import type { Diagnostic } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { bundleEffectDetailed, effectHostSelector } from '../extensions/effect-bundle.js';
import { loadExtensions } from '../extensions/load.js';
import type { EffectExtension } from '../extensions/types.js';
import { MANUAL_CLOCK_INIT_SCRIPT } from '../page-clock.js';
import { buildReport } from './compiler.js';
import { launchChromium, loadChromium } from './snapshot.js';

export const EFFECT_CHECK_BUILT_INS = ['threads'] as const;
export type EffectCheckBuiltIn = (typeof EFFECT_CHECK_BUILT_INS)[number];

export interface EffectCheckOptions {
  /** Манифест расширения `kind: effect`; или `builtIn`. */
  readonly manifest?: string;
  readonly builtIn?: EffectCheckBuiltIn;
  /** Отсутствующий или пустой каталог для собранных примеров и кадров. */
  readonly output: string;
}

export interface EffectCheckItem {
  readonly id: EffectCheckId;
  readonly title: string;
  readonly passed: boolean;
  readonly details: readonly string[];
}

export interface EffectCheckResult {
  readonly effect: string;
  readonly builtIn: boolean;
  readonly passed: number;
  readonly total: number;
  readonly summary: string;
  readonly checks: readonly EffectCheckItem[];
  readonly outputDirectory: string;
  readonly frames: readonly string[];
  readonly warnings: readonly Diagnostic[];
}

export const EFFECT_CHECKS = [
  ['declaration', 'The declaration is complete'],
  ['still', 'Reduced motion shows the final state at once'],
  ['clock', 'Time comes only from the page clock: seek and rebuild repeat exactly'],
  [
    'performance',
    'No effect call, and no page task the effect adds, over 50 ms at 4× CPU slowdown, also after a resize',
  ],
  ['tokens', 'Colours come from theme tokens and follow a theme switch'],
  ['text', 'Decoration never covers text'],
  ['widths', 'No sideways scroll, overlaps or empty hosts at 390, 768, 1280 and 1920 px'],
  ['content', 'Deleting, reordering and duplicating sections does not break it'],
  ['states', 'The states it sets exist in every render mode'],
  ['print', 'Print has a text equivalent'],
  ['examples', 'Two unlike examples use it'],
] as const;
export type EffectCheckId = (typeof EFFECT_CHECKS)[number][0];

const WIDTHS = [390, 768, 1280, 1920] as const;
const HEIGHT = 900;
const LONG_TASK_MS = 50;
const DIAGNOSTIC_PASS_TIMEOUT_MS = 20_000;
const DIAGNOSTIC_CANCEL_TIMEOUT_MS = 2_000;

/** Two fresh effect-on/effect-off measurements must agree before timing is attributed to an effect. */
export interface PerformanceSample {
  readonly effectCallMs: number;
  readonly pageTaskMs: number;
  readonly baselineTaskMs: number;
}

export function confirmedPerformanceFailures(
  first: PerformanceSample,
  second: PerformanceSample,
): { readonly effectCall: boolean; readonly pageTask: boolean } {
  const callExceeded = (sample: PerformanceSample): boolean => sample.effectCallMs > LONG_TASK_MS;
  const pageExceeded = (sample: PerformanceSample): boolean =>
    sample.pageTaskMs > LONG_TASK_MS && sample.baselineTaskMs <= LONG_TASK_MS;
  return {
    effectCall: callExceeded(first) && callExceeded(second),
    pageTask: pageExceeded(first) && pageExceeded(second),
  };
}

/** An advisory browser pass cannot replace the verdict when it rejects or exceeds its own deadline. */
export async function boundedDiagnostic<Result>(
  pending: Promise<Result>,
  cancel: () => Promise<unknown> | undefined,
  timeoutMs: number,
): Promise<{ readonly available: true; readonly value: Result } | { readonly available: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('diagnostic deadline')), timeoutMs);
  });
  try {
    return { available: true, value: await Promise.race([pending, deadline]) };
  } catch {
    // Close its browser context to interrupt a pending Playwright call. Ignore diagnostic errors here;
    // the already-confirmed performance failure remains the result and no raw error enters artifacts.
    void pending.catch(() => undefined);
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelDeadline = new Promise<void>((resolve) => {
      cancelTimer = setTimeout(resolve, DIAGNOSTIC_CANCEL_TIMEOUT_MS);
    });
    await Promise.race([
      Promise.resolve()
        .then(cancel)
        .then(
          () => undefined,
          () => undefined,
        ),
      cancelDeadline,
    ]);
    if (cancelTimer !== undefined) clearTimeout(cancelTimer);
    return { available: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
/** Доля пикселей строк текста, которую декор может задеть сглаживанием края. */
const TEXT_COVER_TOLERANCE = 0.002;
/** Сходство примеров (доля общих троек слов), выше которого они считаются одним примером. */
const EXAMPLE_SIMILARITY_LIMIT = 0.5;

/** Предмет проверки: эффект расширения или встроенный. */
interface Subject {
  readonly name: string;
  readonly selector: string;
  readonly description: string;
  readonly staticEquivalent: string;
  readonly examples: readonly string[];
  readonly builtIn: boolean;
  readonly declaration: readonly string[];
}

// ---------------------------------------------------------------------------------------------------
// Playwright: ровно то, чем команда пользуется; пакет не зависит от него, а берёт у пользователя.

interface CheckBrowser {
  newContext(options: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
    readonly reducedMotion: 'reduce' | 'no-preference';
    readonly colorScheme: 'light' | 'dark';
  }): Promise<CheckContext>;
  close(): Promise<void>;
}
interface CheckContext {
  newPage(): Promise<CheckPage>;
  newCDPSession(
    page: CheckPage,
  ): Promise<{ send(method: string, params?: object): Promise<unknown> }>;
  close(): Promise<void>;
}
interface CheckPage {
  addInitScript(script: string): Promise<unknown>;
  goto(url: string, options: { readonly waitUntil: 'load' }): Promise<unknown>;
  evaluate<Result, Argument>(
    script: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
  waitForTimeout(milliseconds: number): Promise<void>;
  screenshot(options?: { readonly path?: string; readonly fullPage?: boolean }): Promise<Buffer>;
  setViewportSize(size: { readonly width: number; readonly height: number }): Promise<void>;
  emulateMedia(options: { readonly media?: 'print' | 'screen' | null }): Promise<void>;
  on(event: 'pageerror', listener: (error: Error) => void): void;
}

// ---------------------------------------------------------------------------------------------------
// Инструментирование страницы (до её скрипта).

/**
 * Записывает таймеры и цвета, которые код эффекта отдал, пока движок держал его текущим. Часы страницы
 * подменяют `requestAnimationFrame` после этого скрипта, поэтому обёртка ставится свойством с
 * сеттером: любая следующая подмена тоже оказывается внутри неё.
 */
const INSTRUMENTATION = `(() => {
  const record = { timers: [], colours: [] };
  window.__effectCheck = record;
  const current = () => window.__agenticReportEffectEngine?.current;
  for (const name of ['requestAnimationFrame', 'setTimeout', 'setInterval']) {
    let implementation = window[name];
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        return function (...args) {
          const effect = current();
          if (effect !== undefined) record.timers.push({ effect, api: name });
          return implementation.apply(window, args);
        };
      },
      set(value) { implementation = value; },
    });
  }
  const context2d = CanvasRenderingContext2D.prototype;
  for (const property of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const descriptor = Object.getOwnPropertyDescriptor(context2d, property);
    Object.defineProperty(context2d, property, {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) {
        const effect = current();
        if (effect !== undefined && typeof value === 'string')
          record.colours.push({ effect, source: property, value });
        descriptor.set.call(this, value);
      },
    });
  }
  const addColorStop = CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop = function (offset, colour) {
    const effect = current();
    if (effect !== undefined) record.colours.push({ effect, source: 'gradient', value: String(colour) });
    return addColorStop.call(this, offset, colour);
  };
  const gl = WebGLRenderingContext.prototype;
  const names = new WeakMap();
  const getUniformLocation = gl.getUniformLocation;
  gl.getUniformLocation = function (program, name) {
    const location = getUniformLocation.call(this, program, name);
    if (location !== null) names.set(location, name);
    return location;
  };
  const colourUniform = /colou?r|tint|edge|fill|stroke|ink/i;
  for (const method of ['uniform3f', 'uniform4f']) {
    const original = gl[method];
    gl[method] = function (location, ...values) {
      const effect = current();
      const name = location === null ? '' : names.get(location) ?? '';
      if (effect !== undefined && colourUniform.test(name))
        record.colours.push({ effect, source: 'uniform ' + name, value: 'gl:' + values.slice(0, 4).join(',') });
      return original.call(this, location, ...values);
    };
  }
  const clearColor = gl.clearColor;
  gl.clearColor = function (r, g, b, a) {
    const effect = current();
    if (effect !== undefined && a > 0)
      record.colours.push({ effect, source: 'clearColor', value: 'gl:' + [r, g, b, a].join(',') });
    return clearColor.call(this, r, g, b, a);
  };
})();`;

/** То, что проверка читает со страницы: часы и движок эффектов. */
interface CheckWindow {
  __clock?: { seek(seconds: number): void };
  __agenticReportEffectEngine?: {
    status(): Array<StatusSnapshot & { readonly name: string }>;
    rebuildAll(reason: string): void;
  };
}

interface Recorded {
  readonly timers: readonly { effect: string; api: string }[];
  readonly colours: readonly { effect: string; source: string; value: string }[];
}

interface StatusSnapshot {
  readonly render: string;
  readonly reason?: string;
  readonly hosts: number;
  readonly states: readonly string[];
  readonly errors: readonly string[];
  readonly loopGuard: number;
  readonly longestMs: number;
}

interface BrowserTask {
  readonly startMs: number;
  readonly durationMs: number;
}

interface BrowserFrame extends BrowserTask {
  readonly scriptMs: number;
  readonly forcedStyleMs: number;
  readonly renderTailMs: number;
  readonly layoutAndPaintTailMs: number;
}

/** Optional build trace emitted by the reference wall-thread; every field is a number. */
interface BuildTiming extends BrowserTask {
  readonly width: number;
  readonly measureMs: number;
  readonly fieldMs: number;
  readonly routeMs: number;
  readonly routeWaypointsMs: number;
  readonly routeSearchMs: number;
  readonly routePullMs: number;
  readonly routeLineMs: number;
  readonly routeOtherMs: number;
  readonly sampleMs: number;
  readonly braidMs: number;
  readonly stationsMs: number;
  readonly ballsMs: number;
  readonly nailsMs: number;
  readonly chunksMs: number;
}

/** Browser work belongs to the phase in which it started; setup work stays outside the verdict. */
export function partitionMeasuredEntries<Entry extends BrowserTask>(
  entries: readonly Entry[],
  windows: readonly { readonly startMs: number; readonly endMs: number }[],
): { readonly byPhase: readonly (readonly Entry[])[]; readonly unassigned: readonly Entry[] } {
  const byPhase: Entry[][] = windows.map(() => []);
  const unassigned: Entry[] = [];
  for (const entry of entries) {
    const index = windows.findIndex(
      (window) => entry.startMs >= window.startMs && entry.startMs < window.endMs,
    );
    if (index < 0) unassigned.push(entry);
    else byPhase[index]?.push(entry);
  }
  return { byPhase, unassigned };
}

interface PerformancePhase {
  readonly name: 'scroll-wide' | 'resize-narrow' | 'scroll-narrow' | 'resize-wide';
  readonly startMs: number;
  readonly endMs: number;
  readonly effectCallMs: number;
  readonly longTasks: readonly BrowserTask[];
  readonly longFrames: readonly BrowserFrame[];
  readonly builds: readonly BuildTiming[];
}

interface PerformancePass {
  readonly longTasks: number[];
  readonly unassignedLongTasks: readonly BrowserTask[];
  readonly unassignedLongFrames: readonly BrowserFrame[];
  readonly unassignedBuilds: readonly BuildTiming[];
  readonly status: StatusSnapshot | undefined;
  readonly errors: string[];
  readonly phases: readonly PerformancePhase[];
  readonly longAnimationFramesSupported: boolean;
}

// ---------------------------------------------------------------------------------------------------

export async function effectCheck(options: EffectCheckOptions): Promise<EffectCheckResult> {
  if ((options.manifest === undefined) === (options.builtIn === undefined))
    throw new AgenticReportError({
      level: 'error',
      code: 'EFFECT_CHECK_SUBJECT',
      message: 'effect-check needs either an extension manifest or --built-in, and not both.',
      remediation:
        'Run `agentic-report effect-check <extension.yaml> --out <dir>` or `agentic-report effect-check --built-in threads --out <dir>`.',
    });
  const outputDirectory = path.resolve(options.output);
  await requireEmptyDirectory(outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const warnings: Diagnostic[] = [];
  const subject =
    options.builtIn === undefined
      ? await extensionSubject(path.resolve(options.manifest ?? ''), warnings)
      : await builtInSubject(options.builtIn, outputDirectory);

  const chromium = await loadChromium();
  const pages: { source: string; page: string; hosts: number }[] = [];
  const buildProblems: string[] = [];
  for (const [index, example] of subject.examples.entries()) {
    const page = path.join(outputDirectory, `example-${index + 1}.html`);
    try {
      const built = await buildReport({ input: example, output: page, format: 'single-file' });
      warnings.push(...built.warnings);
      pages.push({ source: example, page, hosts: 0 });
    } catch (error) {
      buildProblems.push(
        `${path.basename(example)} did not build: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const browser = (await launchChromium(chromium)) as unknown as CheckBrowser;
  const checks: EffectCheckItem[] = [];
  const frames: string[] = [];
  try {
    const first = pages[0];
    const url = first === undefined ? undefined : pathToFileURL(first.page).href;
    const add = (id: EffectCheckId, problems: readonly string[], notes: readonly string[] = []) => {
      const title = EFFECT_CHECKS.find(([key]) => key === id)?.[1] ?? id;
      checks.push({
        id,
        title,
        passed: problems.length === 0,
        details: problems.length === 0 ? notes : problems,
      });
    };
    const noPage = [
      'No example page was built, so the page checks could not run.',
      ...buildProblems,
    ];

    add('declaration', [...subject.declaration, ...buildProblems]);
    if (url === undefined) {
      for (const [id] of EFFECT_CHECKS.slice(1, 10)) add(id, noPage);
    } else {
      const session = new Session(browser, subject.name, subject.selector);
      add('still', ...(await checkStill(session, url)));
      add('clock', ...(await checkClock(session, url)));
      add('performance', ...(await checkPerformance(session, url, outputDirectory)));
      add('tokens', ...(await checkTokens(session, url)));
      add('text', ...(await checkText(session, url)));
      const widths = await checkWidths(session, url, outputDirectory);
      frames.push(...widths.frames);
      add('widths', ...widths.result);
      add('content', ...(await checkContent(session, url)));
      add('states', ...(await checkStates(session, url)));
      add('print', ...(await checkPrint(session, url, subject)));
      for (const page of pages) page.hosts = await session.hostCount(pathToFileURL(page.page).href);
    }
    add('examples', ...(await checkExamples(subject, pages)));
  } finally {
    await browser.close();
  }
  const passed = checks.filter((check) => check.passed).length;
  return {
    effect: subject.name,
    builtIn: subject.builtIn,
    passed,
    total: checks.length,
    summary: `${passed} of ${checks.length} checks passed`,
    checks,
    outputDirectory,
    frames,
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------------
// Предмет проверки.

async function extensionSubject(manifest: string, warnings: Diagnostic[]): Promise<Subject> {
  const loaded = await loadExtensions([path.basename(manifest)], path.dirname(manifest), {
    location: { file: manifest },
  });
  warnings.push(...loaded.warnings);
  const extension = loaded.extensions[0];
  if (extension === undefined || extension.kind !== 'effect')
    throw new AgenticReportError({
      level: 'error',
      code: 'EFFECT_CHECK_NOT_EFFECT',
      message: `${manifest} declares a ${extension?.kind ?? 'missing'} extension, not an effect.`,
      remediation: 'Point effect-check at an extension manifest with kind: effect.',
      source: { file: manifest },
    });
  return {
    name: extension.name,
    selector: effectHostSelector(extension),
    description: extension.description,
    staticEquivalent: extension.staticEquivalent,
    examples: extension.examples,
    builtIn: false,
    declaration: await declarationProblems(extension),
  };
}

/** Полнота объявления: поля, два примера, лицензии кода из пакетов, укладка в бюджет. */
async function declarationProblems(extension: EffectExtension): Promise<string[]> {
  const problems: string[] = [];
  if (extension.description.trim() === '') problems.push('description is empty.');
  if (extension.staticEquivalent.trim() === '')
    problems.push('staticEquivalent is empty: say what print and no-script readers get.');
  if (extension.targets.length === 0) problems.push('targets is empty: the effect has no hosts.');
  if (extension.examples.length < 2)
    problems.push(
      `examples lists ${extension.examples.length} page(s); two unlike pages are needed.`,
    );
  for (const file of [extension.module, ...extension.examples, ...extension.licenses])
    if ((await stat(file).catch(() => undefined)) === undefined)
      problems.push(`${path.relative(path.dirname(extension.manifestPath), file)} does not exist.`);
  try {
    const bundled = await bundleEffectDetailed(extension);
    const packages = [
      ...new Set(
        bundled.inputs
          // Имя пакета — после последнего `node_modules/`: у pnpm путь идёт через `.pnpm/<пакет>@<версия>`.
          .map((input) => [...input.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/gu)].at(-1)?.[1])
          .filter((name): name is string => name !== undefined),
      ),
    ];
    if (packages.length > 0 && extension.licenses.length === 0)
      problems.push(
        `the bundle includes third-party code (${packages.join(', ')}) but licenses lists no licence file.`,
      );
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}

const THREADS_EXAMPLES = [
  {
    file: 'threads-document.md',
    images: ['richat.jpg'],
    source: [
      '---',
      'title: Threads in a document',
      'language: en',
      '---',
      '',
      '# Field notes',
      '',
      'A short report whose one picture unweaves as the reader moves past it.',
      '',
      // Картинка ниже первого экрана: работа, которую эффект откладывает до её появления (первая
      // загрузка текстуры), попадает в замер прокрутки, а не в загрузку страницы.
      '::::section{title="Before the picture" id="before"}',
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `Context ${index + 1}: the survey crossed the plateau twice, once at dawn and once at noon.\n`,
      ),
      '::::',
      '',
      '::::section{title="The ring structure" id="rings" media-effect="threads"}',
      '![Concentric rock rings in the desert, seen from orbit](richat.jpg)',
      '',
      'The rings are eroded layers of rock, forty kilometres across.',
      '::::',
      '',
      '::::section{title="What the survey found" id="survey"}',
      ...Array.from(
        { length: 14 },
        (_, index) =>
          `Observation ${index + 1}: the layer boundary stays sharp across the whole frame, and the reading holds.\n`,
      ),
      '::::',
    ],
  },
  {
    file: 'threads-landing.md',
    images: ['sand-sea.jpg', 'aurora-station.jpg'],
    source: [
      '---',
      'title: Threads on a landing',
      'language: en',
      'layout: landing',
      'theme: aurora',
      'scheme: dark',
      '---',
      '',
      '# Two places, one motion',
      '',
      '::::section{title="Dunes" id="dunes" media-effect="threads" recipe="statement"}',
      '![Smoke drifting across linear dunes, seen from orbit](sand-sea.jpg)',
      '::::',
      '',
      '::::section{title="Between" id="between"}',
      '- The first picture leaves the screen.',
      '- The second arrives on a dark page.',
      '- Both unweave only while they move.',
      '::::',
      '',
      '::::section{title="Station" id="station" media-effect="threads"}',
      '![An aurora over a research station at night](aurora-station.jpg)',
      '',
      'The page ends here.',
      '::::',
    ],
  },
] as const;

async function builtInSubject(name: EffectCheckBuiltIn, output: string): Promise<Subject> {
  // Из `dist/node/core` до корня пакета три шага, из `src/core` — два.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.basename(path.dirname(here)) === 'node' ? '../../..' : '../..';
  const assets = path.resolve(here, packageRoot, 'examples/motion-showcase/assets');
  const directory = path.join(output, `${name}-sources`);
  await mkdir(directory, { recursive: true });
  const examples: string[] = [];
  for (const example of THREADS_EXAMPLES) {
    for (const image of example.images)
      await copyFile(path.join(assets, image), path.join(directory, image));
    const file = path.join(directory, example.file);
    await writeFile(file, `${example.source.join('\n')}\n`);
    examples.push(file);
  }
  return {
    name,
    selector: 'img[data-webgl="threads"]',
    description: 'The first picture of a section unweaves into threads as it leaves the screen.',
    staticEquivalent: 'The picture itself, whole and still, with its alternative text.',
    examples,
    builtIn: true,
    declaration: [],
  };
}

// ---------------------------------------------------------------------------------------------------
// Страницы.

type Mode = 'live' | 'still' | 'static';

class Session {
  constructor(
    private readonly browser: CheckBrowser,
    readonly name: string,
    readonly selector: string,
  ) {}

  /** Открыть страницу в режиме; `manual: false` — настоящие часы (замер производительности). */
  async open(
    url: string,
    mode: Mode,
    options: {
      width?: number;
      manual?: boolean;
      effectsOff?: boolean;
      onContext?: (context: CheckContext) => void;
    } = {},
  ): Promise<{ page: CheckPage; context: CheckContext; errors: string[] }> {
    const context = await this.browser.newContext({
      viewport: { width: options.width ?? 1280, height: HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: mode === 'still' ? 'reduce' : 'no-preference',
      colorScheme: 'light',
    });
    options.onContext?.(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(INSTRUMENTATION);
    if (options.manual !== false) await page.addInitScript(MANUAL_CLOCK_INIT_SCRIPT);
    if (mode === 'static') await page.addInitScript(`window.__agenticReportRender = 'static';`);
    if (options.effectsOff === true)
      await page.addInitScript('window.__agenticReportEffectsOff = true;');
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true), undefined);
    // Настоящая пауза даёт картинкам декодироваться, а наблюдателям — отозваться; время часов стоит.
    await page.waitForTimeout(300);
    return { page, context, errors };
  }

  async status(page: CheckPage): Promise<StatusSnapshot | undefined> {
    return page.evaluate(
      (name) =>
        (window as unknown as CheckWindow).__agenticReportEffectEngine
          ?.status()
          .find((entry) => entry.name === name),
      this.name,
    );
  }

  async recorded(page: CheckPage): Promise<Recorded> {
    return page.evaluate(
      () => (window as unknown as { __effectCheck: Recorded }).__effectCheck,
      undefined,
    );
  }

  /** Прокрутить к середине первого хоста и перемотать часы. */
  async focusFirstHost(page: CheckPage, seconds: number): Promise<void> {
    await page.evaluate(
      ([selector, time]) => {
        const host = document.querySelector(selector);
        if (host !== null) {
          const box = host.getBoundingClientRect();
          window.scrollTo({
            top: window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
            behavior: 'instant',
          });
        }
        (window as unknown as CheckWindow).__clock?.seek(time);
      },
      [this.selector, seconds] as const,
    );
    await page.waitForTimeout(50);
    await page.evaluate((time) => (window as unknown as CheckWindow).__clock?.seek(time), seconds);
  }

  async seek(page: CheckPage, seconds: number): Promise<void> {
    await page.evaluate((time) => (window as unknown as CheckWindow).__clock?.seek(time), seconds);
  }

  async hostCount(url: string): Promise<number> {
    const { page, context } = await this.open(url, 'live');
    try {
      return await page.evaluate(
        (selector) => document.querySelectorAll(selector).length,
        this.selector,
      );
    } finally {
      await context.close();
    }
  }
}

function failures(status: StatusSnapshot | undefined, mode: string): string[] {
  if (status === undefined) return [`${mode}: the effect never registered on the page.`];
  const problems: string[] = [];
  if (status.render === 'failed')
    problems.push(`${mode}: the effect failed: ${status.errors.join('; ')}`);
  if (status.hosts === 0) problems.push(`${mode}: the effect found no hosts.`);
  if (status.loopGuard > 0)
    problems.push(`${mode}: rebuilds looped and were stopped by the guard.`);
  return problems;
}

function livePerformanceFailures(status: StatusSnapshot | undefined, mode: string): string[] {
  const problems = failures(status, mode);
  if (status !== undefined && status.render !== 'live' && status.render !== 'failed')
    problems.push(`${mode}: the effect rendered ${status.render} instead of live.`);
  if (status !== undefined && status.render !== 'failed' && status.errors.length > 0)
    problems.push(`${mode}: the effect reported errors: ${status.errors.join('; ')}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------
// Проверки. Каждая возвращает [проблемы, заметки].

type Outcome = [problems: string[], notes: string[]];

/**
 * Дефект: при уменьшенном движении эффект продолжает жить во времени (перемотанный таймлайн, свой
 * счётчик времени) или не ставится вовсе. Снимки в моменты 0 и 60 секунд обязаны совпасть.
 */
async function checkStill(session: Session, url: string): Promise<Outcome> {
  const { page, context, errors } = await session.open(url, 'still');
  try {
    await session.focusFirstHost(page, 0);
    const early = await page.screenshot();
    await session.seek(page, 60);
    const late = await page.screenshot();
    const status = await session.status(page);
    const problems = failures(status, 'still');
    if (status !== undefined && status.render !== 'still')
      problems.push(`still: the engine rendered in ${status.render}, not still.`);
    if (!early.equals(late))
      problems.push(
        'still: the picture at 0 s differs from the picture at 60 s — the final state is not drawn at once.',
      );
    problems.push(...errors.map((error) => `still: page error: ${error}`));
    return [
      problems,
      [`rendered ${status?.render ?? 'nothing'} with ${status?.hosts ?? 0} host(s)`],
    ];
  } finally {
    await context.close();
  }
}

/**
 * Дефекты: своё время эффекта (`requestAnimationFrame`, таймеры) вместо часов страницы; состояние,
 * зависящее от числа пересборок или перемоток. Две перемотки в тот же момент и две пересборки дают
 * одинаковый снимок.
 */
async function checkClock(session: Session, url: string): Promise<Outcome> {
  const { page, context, errors } = await session.open(url, 'live');
  try {
    await session.focusFirstHost(page, 2);
    const first = await page.screenshot();
    await session.seek(page, 2);
    const second = await page.screenshot();
    await page.evaluate(() => {
      (window as unknown as CheckWindow).__agenticReportEffectEngine?.rebuildAll('effect-check');
      (window as unknown as CheckWindow).__agenticReportEffectEngine?.rebuildAll('effect-check');
    }, undefined);
    await page.waitForTimeout(50);
    await session.seek(page, 2);
    const rebuilt = await page.screenshot();
    const recorded = await session.recorded(page);
    const status = await session.status(page);
    const problems = failures(status, 'live');
    const own = recorded.timers.filter((timer) => timer.effect === session.name);
    for (const api of new Set(own.map((timer) => timer.api)))
      problems.push(
        `the effect called ${api} itself; time must come from at(t) and ctx.clock, not its own timers.`,
      );
    if (!first.equals(second)) problems.push('seek(2) twice gave two different pictures.');
    if (!first.equals(rebuilt))
      problems.push('two rebuilds in a row changed the picture at the same moment.');
    problems.push(...errors.map((error) => `page error: ${error}`));
    return [problems, [`rendered ${status?.render ?? 'nothing'}`]];
  } finally {
    await context.close();
  }
}

/** Прокрутить страницу, сменить ширину и прокрутить снова при замедленном вчетверо процессоре. */
async function throttledPass(
  session: Session,
  url: string,
  effectsOff: boolean,
  profileBuilds = false,
  onContext?: (context: CheckContext) => void,
): Promise<PerformancePass> {
  const { page, context, errors } = await session.open(url, 'live', {
    manual: false,
    effectsOff,
    ...(onContext === undefined ? {} : { onContext }),
  });
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate((profile) => {
      const holder = window as unknown as {
        __performanceTasks: BrowserTask[];
        __performanceFrames: BrowserFrame[];
        __agenticReportBuildTimings?: BuildTiming[];
      };
      holder.__performanceTasks = [];
      holder.__performanceFrames = [];
      if (profile) holder.__agenticReportBuildTimings = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          holder.__performanceTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
      }).observe({ type: 'longtask' });
      if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const frame = entry as PerformanceEntry & {
              readonly renderStart?: number;
              readonly styleAndLayoutStart?: number;
              readonly scripts?: readonly {
                readonly duration?: number;
                readonly forcedStyleAndLayoutDuration?: number;
              }[];
            };
            holder.__performanceFrames.push({
              startMs: frame.startTime,
              durationMs: frame.duration,
              scriptMs: (frame.scripts ?? []).reduce(
                (sum, script) => sum + (script.duration ?? 0),
                0,
              ),
              forcedStyleMs: (frame.scripts ?? []).reduce(
                (sum, script) => sum + (script.forcedStyleAndLayoutDuration ?? 0),
                0,
              ),
              renderTailMs:
                frame.renderStart === undefined || frame.renderStart === 0
                  ? 0
                  : Math.max(0, frame.startTime + frame.duration - frame.renderStart),
              layoutAndPaintTailMs:
                frame.styleAndLayoutStart === undefined || frame.styleAndLayoutStart === 0
                  ? 0
                  : Math.max(0, frame.startTime + frame.duration - frame.styleAndLayoutStart),
            });
          }
        }).observe({ type: 'long-animation-frame' });
    }, profileBuilds);
    const phases: Array<Omit<PerformancePhase, 'longTasks' | 'longFrames' | 'builds'>> = [];
    const phase = async (
      name: PerformancePhase['name'],
      action: () => Promise<void>,
    ): Promise<void> => {
      await page.evaluate(
        () =>
          (
            window as unknown as {
              __agenticReportEffectEngine?: { resetTimings(): void };
            }
          ).__agenticReportEffectEngine?.resetTimings(),
        undefined,
      );
      const startMs = await page.evaluate(() => performance.now(), undefined);
      await action();
      const endMs = await page.evaluate(() => performance.now(), undefined);
      phases.push({
        name,
        startMs,
        endMs,
        effectCallMs: (await session.status(page))?.longestMs ?? 0,
      });
    };
    const scrollThrough = async (): Promise<void> => {
      await page.evaluate(async () => {
        const frame = (): Promise<void> =>
          new Promise((resolve) => requestAnimationFrame(() => resolve()));
        const step = Math.max(120, Math.floor(window.innerHeight / 4));
        for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
          window.scrollTo({ top, behavior: 'instant' });
          await frame();
          await frame();
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        await frame();
      }, undefined);
    };
    await phase('scroll-wide', scrollThrough);
    await phase('resize-narrow', async () => {
      await page.setViewportSize({ width: 768, height: HEIGHT });
      await page.waitForTimeout(200);
    });
    await phase('scroll-narrow', scrollThrough);
    await phase('resize-wide', async () => {
      await page.setViewportSize({ width: 1280, height: HEIGHT });
      await page.waitForTimeout(200);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const measurements = await page.evaluate(() => {
      const holder = window as unknown as {
        __performanceTasks: BrowserTask[];
        __performanceFrames: BrowserFrame[];
        __agenticReportBuildTimings?: unknown;
      };
      // The extension is authored code. Copy only finite numbers under fixed keys into public output.
      const finite = (value: unknown): number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
      const rawBuilds = holder.__agenticReportBuildTimings;
      const builds: BuildTiming[] = Array.isArray(rawBuilds)
        ? rawBuilds.slice(0, 128).flatMap((raw: unknown) => {
            if (raw === null || typeof raw !== 'object') return [];
            const record = raw as Record<string, unknown>;
            if (
              typeof record.startMs !== 'number' ||
              !Number.isFinite(record.startMs) ||
              typeof record.durationMs !== 'number' ||
              !Number.isFinite(record.durationMs)
            )
              return [];
            return [
              {
                startMs: finite(record.startMs),
                durationMs: finite(record.durationMs),
                width: finite(record.width),
                measureMs: finite(record.measureMs),
                fieldMs: finite(record.fieldMs),
                routeMs: finite(record.routeMs),
                routeWaypointsMs: finite(record.routeWaypointsMs),
                routeSearchMs: finite(record.routeSearchMs),
                routePullMs: finite(record.routePullMs),
                routeLineMs: finite(record.routeLineMs),
                routeOtherMs: finite(record.routeOtherMs),
                sampleMs: finite(record.sampleMs),
                braidMs: finite(record.braidMs),
                stationsMs: finite(record.stationsMs),
                ballsMs: finite(record.ballsMs),
                nailsMs: finite(record.nailsMs),
                chunksMs: finite(record.chunksMs),
              },
            ];
          })
        : [];
      return {
        tasks: holder.__performanceTasks,
        frames: holder.__performanceFrames,
        builds,
        longAnimationFramesSupported:
          PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'),
      };
    }, undefined);
    const status = await session.status(page);
    const tasks = partitionMeasuredEntries(measurements.tasks, phases);
    const frames = partitionMeasuredEntries(measurements.frames, phases);
    const builds = partitionMeasuredEntries(measurements.builds, phases);
    const measuredPhases: PerformancePhase[] = phases.map((item, index) => ({
      ...item,
      longTasks: tasks.byPhase[index] ?? [],
      longFrames: frames.byPhase[index] ?? [],
      builds: builds.byPhase[index] ?? [],
    }));
    return {
      longTasks: measuredPhases.flatMap((item) => item.longTasks.map((task) => task.durationMs)),
      unassignedLongTasks: tasks.unassigned,
      unassignedLongFrames: frames.unassigned,
      unassignedBuilds: builds.unassigned,
      status:
        status === undefined
          ? undefined
          : { ...status, longestMs: Math.max(0, ...phases.map((item) => item.effectCallMs)) },
      errors,
      phases: measuredPhases,
      longAnimationFramesSupported: measurements.longAnimationFramesSupported,
    };
  } finally {
    await context.close();
  }
}

/**
 * Дефект: эффект дорог для главного потока — прокрутка и изменение размера рвутся. Настоящие часы,
 * процессор замедлен в четыре раза; страница проходится прокруткой, меняет ширину и проходится снова —
 * с эффектами и без них (`__agenticReportEffectsOff`). Проверка падает, если один вызов кода эффекта (кадр,
 * пересборка, событие — их замеряет движок) длится дольше 50 мс, или если с эффектом есть задача дольше
 * 50 мс, а без эффектов нет ни одной: так ловится и работа, которую эффект оставляет браузеру (первая
 * загрузка текстуры в видеокарту на прокрутке). Если длинная задача есть и без эффектов, её не на кого
 * отнести — машина перегружена, — и она идёт в заметку, а не в провал.
 */
async function checkPerformance(session: Session, url: string, output: string): Promise<Outcome> {
  const passes: Array<{
    readonly role:
      'effect' | 'baseline' | 'effect-confirmation' | 'baseline-confirmation' | 'effect-diagnostic';
    readonly longestEffectCallMs: number;
    readonly longTaskDurationsMs: readonly number[];
    readonly unassignedLongTasks: readonly BrowserTask[];
    readonly unassignedLongFrames: readonly BrowserFrame[];
    readonly unassignedBuilds: readonly BuildTiming[];
    readonly longAnimationFramesSupported: boolean;
    readonly phases: readonly PerformancePhase[];
  }> = [];
  let diagnosticUnavailable = false;
  const persist = async (): Promise<void> => {
    // Save after each completed pass: CI can reach its aggregate deadline before the next test starts.
    await writeFile(
      path.join(output, 'performance-diagnostics.json'),
      `${JSON.stringify(
        { version: 1, passes, ...(diagnosticUnavailable ? { diagnosticUnavailable: true } : {}) },
        null,
        2,
      )}\n`,
    );
  };
  const append = async (
    role: (typeof passes)[number]['role'],
    result: PerformancePass,
  ): Promise<void> => {
    passes.push({
      role,
      longestEffectCallMs: result.status?.longestMs ?? 0,
      longTaskDurationsMs: result.longTasks,
      unassignedLongTasks: result.unassignedLongTasks,
      unassignedLongFrames: result.unassignedLongFrames,
      unassignedBuilds: result.unassignedBuilds,
      longAnimationFramesSupported: result.longAnimationFramesSupported,
      phases: result.phases,
    });
    await persist();
  };
  const pass = async (
    role: (typeof passes)[number]['role'],
    effectsOff: boolean,
  ): Promise<PerformancePass> => {
    const result = await throttledPass(session, url, effectsOff);
    await append(role, result);
    return result;
  };
  const withEffect = await pass('effect', false);
  const baseline = await pass('baseline', true);
  const longest = withEffect.status?.longestMs ?? 0;
  const pageLongest = Math.max(0, ...withEffect.longTasks);
  const baselineLongest = Math.max(0, ...baseline.longTasks);
  const callExceeded = longest > LONG_TASK_MS;
  const pageExceeded = pageLongest > LONG_TASK_MS && baselineLongest <= LONG_TASK_MS;
  // A shared CI runner can delay one browser task while its effect-free pass is quiet. A real slow
  // effect repeats in a fresh context; confirm only timing failures with a second independent pair.
  const confirmation =
    callExceeded || pageExceeded
      ? {
          withEffect: await pass('effect-confirmation', false),
          baseline: await pass('baseline-confirmation', true),
        }
      : undefined;
  const confirmedCall = confirmation?.withEffect.status?.longestMs ?? 0;
  const confirmedPage = Math.max(0, ...(confirmation?.withEffect.longTasks ?? []));
  const confirmedBaseline = Math.max(0, ...(confirmation?.baseline.longTasks ?? []));
  const confirmed = confirmedPerformanceFailures(
    { effectCallMs: longest, pageTaskMs: pageLongest, baselineTaskMs: baselineLongest },
    {
      effectCallMs: confirmedCall,
      pageTaskMs: confirmedPage,
      baselineTaskMs: confirmedBaseline,
    },
  );
  // Build-stage probes cost measurable CPU time. Keep every verdict pass untouched and profile a
  // separate effect-only context only after independent passes have already confirmed failure.
  if (confirmed.effectCall || confirmed.pageTask) {
    let diagnosticContext: CheckContext | undefined;
    const pending = throttledPass(session, url, false, true, (context) => {
      diagnosticContext = context;
    });
    const attempt = await boundedDiagnostic(
      pending,
      () => diagnosticContext?.close(),
      DIAGNOSTIC_PASS_TIMEOUT_MS,
    );
    if (attempt.available) await append('effect-diagnostic', attempt.value);
    else {
      diagnosticUnavailable = true;
      await persist();
    }
  }
  const problems: string[] = [];
  if (confirmed.effectCall)
    problems.push(
      `one call of the effect took ${Math.round(longest)} ms and ${Math.round(confirmedCall)} ms in independent passes while scrolling and resizing at 4× CPU slowdown; keep each frame and rebuild under ${LONG_TASK_MS} ms.`,
    );
  if (confirmed.pageTask)
    problems.push(
      `with the effect the page had ${Math.round(pageLongest)} ms and ${Math.round(confirmedPage)} ms tasks in independent passes at 4× CPU slowdown, while both effect-free passes stayed under ${LONG_TASK_MS} ms: work the effect leaves to the browser (texture uploads, shader compiles, layout) happens during scrolling; do it at mount.`,
    );
  problems.push(...livePerformanceFailures(withEffect.status, 'live'));
  if (confirmation !== undefined)
    problems.push(...livePerformanceFailures(confirmation.withEffect.status, 'live confirmation'));
  problems.push(
    ...[...withEffect.errors, ...(confirmation?.withEffect.errors ?? [])].map(
      (error) => `page error: ${error}`,
    ),
  );
  return [
    problems,
    [
      `longest effect call ${Math.round(longest)} ms`,
      `longest page task ${Math.round(pageLongest)} ms with the effect, ${Math.round(baselineLongest)} ms without`,
      ...(confirmation === undefined
        ? []
        : [
            `confirmation: effect call ${Math.round(confirmedCall)} ms; page task ${Math.round(confirmedPage)} ms with the effect, ${Math.round(confirmedBaseline)} ms without`,
          ]),
    ],
  ];
}

/** Цвета словаря токенов в текущей теме: `[r, g, b]` 0–255. */
function paletteScript(tokens: readonly string[]): Array<[number, number, number]> {
  const probe = document.createElement('span');
  probe.hidden = true;
  document.body.append(probe);
  const palette: Array<[number, number, number]> = [];
  for (const token of tokens) {
    probe.style.color = `var(${token})`;
    const [r = 0, g = 0, b = 0] = (getComputedStyle(probe).color.match(/[\d.]+/gu) ?? []).map(
      Number,
    );
    palette.push([r, g, b]);
  }
  probe.remove();
  return palette;
}

const COLOUR_TOKENS = THEME_TOKENS.filter((token) =>
  ['colour', 'status', 'series', 'code'].includes(token.group),
).map((token) => token.name);

/**
 * Дефекты: цвет, записанный в коде эффекта, а не взятый из темы; цвет, прочитанный один раз и не
 * следующий за сменой схемы. Каждый цвет, который код эффекта отдал 2D-холсту (`fillStyle`,
 * `strokeStyle`, `shadowColor`, градиент), WebGL (`clearColor`, uniform с «color/tint/edge/fill/stroke/ink»
 * в имени) или своим DOM-деталям, сверяется со словарём токенов текущей схемы — до и после её смены.
 */
async function checkTokens(session: Session, url: string): Promise<Outcome> {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const mode of ['live', 'static'] as const) {
    const { page, context, errors } = await session.open(url, mode);
    try {
      await session.focusFirstHost(page, 2);
      for (const scheme of ['light', 'dark'] as const) {
        if (scheme === 'dark') {
          await page.evaluate(() => {
            (window as unknown as { __effectCheck: { colours: unknown[] } }).__effectCheck.colours =
              [];
            document.documentElement.dataset.scheme = 'dark';
          }, undefined);
          await page.waitForTimeout(50);
          await session.seek(page, 2.5);
        }
        const palette = await page.evaluate(paletteScript, COLOUR_TOKENS);
        const recorded = await session.recorded(page);
        const colours = recorded.colours.filter((colour) => colour.effect === session.name);
        const dom = await page.evaluate(detailColoursScript, undefined);
        const resolved = await page.evaluate(
          (values) => {
            const canvas = document.createElement('canvas').getContext('2d');
            return values.map((value) => {
              if (value.startsWith('gl:')) {
                const [r = 0, g = 0, b = 0] = value.slice(3).split(',').map(Number);
                return [r * 255, g * 255, b * 255, 1];
              }
              if (canvas === null) return [0, 0, 0, 0];
              canvas.fillStyle = '#000000';
              canvas.fillStyle = value;
              const normal = String(canvas.fillStyle);
              if (normal.startsWith('#')) {
                const hex = normal.slice(1);
                return [0, 2, 4]
                  .map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
                  .concat(1);
              }
              const parts = (normal.match(/[\d.]+/gu) ?? []).map(Number);
              return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
            });
          },
          [...colours.map((colour) => colour.value), ...dom.map((entry) => entry.value)],
        );
        const sources = [
          ...colours.map((colour) => `${colour.source} ${colour.value}`),
          ...dom.map((entry) => `detail ${entry.property} ${entry.value}`),
        ];
        resolved.forEach(([r = 0, g = 0, b = 0, a = 1], index) => {
          if (a === 0) return;
          const matched = palette.some(
            ([pr, pg, pb]) =>
              Math.abs(pr - r) <= 2 && Math.abs(pg - g) <= 2 && Math.abs(pb - b) <= 2,
          );
          if (!matched)
            problems.push(
              `${mode}, ${scheme} scheme: ${sources[index]} is not a colour of the theme; read it with ctx.tokens.read or rgba and re-read it in ctx.tokens.onChange.`,
            );
        });
        notes.push(`${mode}, ${scheme}: ${resolved.length} colour(s) checked`);
      }
      problems.push(...failures(await session.status(page), mode));
      problems.push(...errors.map((error) => `${mode}: page error: ${error}`));
    } finally {
      await context.close();
    }
  }
  return [[...new Set(problems)], notes];
}

/** Цвета DOM-деталей эффекта (слой `.effect-details`), которые видны. */
function detailColoursScript(): Array<{ property: string; value: string }> {
  const entries: Array<{ property: string; value: string }> = [];
  for (const element of document.querySelectorAll('.effect-details *')) {
    const style = getComputedStyle(element);
    const hasText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    );
    if (hasText) entries.push({ property: 'color', value: style.color });
    entries.push({ property: 'background-color', value: style.backgroundColor });
    if (Number.parseFloat(style.borderTopWidth) > 0)
      entries.push({ property: 'border-color', value: style.borderTopColor });
    if (element instanceof SVGElement) {
      if (style.fill !== 'none') entries.push({ property: 'fill', value: style.fill });
      if (style.stroke !== 'none') entries.push({ property: 'stroke', value: style.stroke });
    }
  }
  return entries.filter((entry) => !entry.value.startsWith('url('));
}

/**
 * Прямоугольники строк текста на экране и то, сколько их пикселей закрыто декором эффекта: пиксели
 * холстов эффекта с непрозрачностью выше 10 % и видимые DOM-детали. Читается в той же задаче, что и
 * перемотка: буфер WebGL ещё цел.
 */
function textCoverScript(argument: { name: string; seconds: number }): {
  covered: number;
  total: number;
  samples: string[];
} {
  (window as unknown as CheckWindow).__clock?.seek(argument.seconds);
  const lines: DOMRect[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent === null || (node.textContent ?? '').trim() === '') continue;
    if (parent.closest('.effect-layer, script, style, template')) continue;
    const style = getComputedStyle(parent);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects())
      if (rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.top < window.innerHeight)
        lines.push(rect);
  }
  // Сгенерированный текст (`::before`/`::after`) — весь блок элемента, как у `ctx.obstacles()`.
  for (const element of document.body.querySelectorAll('*')) {
    if (element.closest('.effect-layer')) continue;
    const generated = (['::before', '::after'] as const).some((pseudo) => {
      const style = getComputedStyle(element, pseudo);
      return !['none', 'normal', '""', "''"].includes(style.content) && style.display !== 'none';
    });
    if (!generated) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.top < window.innerHeight)
      lines.push(rect);
  }
  let covered = 0;
  let total = 0;
  const samples: string[] = [];
  const canvases = [
    ...document.querySelectorAll<HTMLCanvasElement>(
      `.effect-layer canvas[data-effect="${argument.name}"]`,
    ),
  ];
  const width = document.documentElement.clientWidth;
  for (const canvas of canvases) {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const paint = copy.getContext('2d', { willReadFrequently: true });
    if (paint === null) continue;
    paint.drawImage(canvas, 0, 0);
    const ratio = canvas.width / Math.max(1, width);
    const pixels = paint.getImageData(0, 0, copy.width, copy.height).data;
    for (const line of lines) {
      const left = Math.max(0, Math.floor(line.left * ratio));
      const right = Math.min(copy.width, Math.ceil(line.right * ratio));
      const top = Math.max(0, Math.floor(line.top * ratio));
      const bottom = Math.min(copy.height, Math.ceil(line.bottom * ratio));
      let hits = 0;
      for (let y = top; y < bottom; y += 1)
        for (let x = left; x < right; x += 1) {
          total += 1;
          if ((pixels[(y * copy.width + x) * 4 + 3] ?? 0) > 25) hits += 1;
        }
      covered += hits;
      if (hits > 20 && samples.length < 3)
        samples.push(
          `line at ${Math.round(line.left)},${Math.round(line.top)} covered by ${hits} canvas pixels`,
        );
    }
  }
  for (const detail of document.querySelectorAll('.effect-details *')) {
    const box = detail.getBoundingClientRect();
    const style = getComputedStyle(detail);
    if (box.width === 0 || box.height === 0 || style.visibility !== 'visible') continue;
    for (const line of lines) {
      const overlapX = Math.min(box.right, line.right) - Math.max(box.left, line.left);
      const overlapY = Math.min(box.bottom, line.bottom) - Math.max(box.top, line.top);
      if (overlapX > 1 && overlapY > 1) {
        covered += overlapX * overlapY;
        if (samples.length < 3)
          samples.push(
            `a DOM detail at ${Math.round(box.left)},${Math.round(box.top)} lies on a text line`,
          );
      }
    }
  }
  return { covered, total, samples };
}

/** Дефект: декор ложится на текст. Проверяется в трёх режимах, у первого хоста и наверху страницы. */
async function checkText(session: Session, url: string): Promise<Outcome> {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const mode of ['live', 'still', 'static'] as const) {
    const { page, context } = await session.open(url, mode);
    try {
      for (const where of ['host', 'top'] as const) {
        if (where === 'host') await session.focusFirstHost(page, 2);
        else await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }), undefined);
        await page.waitForTimeout(30);
        const cover = await page.evaluate(textCoverScript, { name: session.name, seconds: 2 });
        const share = cover.total === 0 ? 0 : cover.covered / cover.total;
        if (cover.covered > 40 && share > TEXT_COVER_TOLERANCE)
          problems.push(
            `${mode}, ${where === 'host' ? 'at the first host' : 'at the top'}: decoration covers ${(share * 100).toFixed(2)}% of text line pixels — ${cover.samples.join('; ')}. Place it in ctx.obstacles().free.`,
          );
        notes.push(`${mode} ${where}: ${(share * 100).toFixed(3)}% of text covered`);
      }
    } finally {
      await context.close();
    }
  }
  return [problems, notes];
}

/**
 * Дефекты: декор выталкивает страницу вбок, детали наезжают друг на друга, хост схлопывается в пустую
 * полосу, эффект падает на узком экране. По кадру на каждую ширину — в каталог проверки.
 */
async function checkWidths(
  session: Session,
  url: string,
  output: string,
): Promise<{ result: Outcome; frames: string[] }> {
  const problems: string[] = [];
  const frames: string[] = [];
  for (const width of WIDTHS) {
    const { page, context, errors } = await session.open(url, 'live', { width });
    try {
      await session.focusFirstHost(page, 2);
      const layout = await page.evaluate((selector) => {
        const overflow =
          document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const details = [...document.querySelectorAll('.effect-details > *')]
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0);
        let overlaps = 0;
        for (let a = 0; a < details.length; a += 1)
          for (let b = a + 1; b < details.length; b += 1) {
            const first = details[a];
            const second = details[b];
            if (first === undefined || second === undefined) continue;
            const x = Math.min(first.right, second.right) - Math.max(first.left, second.left);
            const y = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
            const smaller = Math.min(first.width * first.height, second.width * second.height);
            if (x > 0 && y > 0 && x * y > smaller * 0.25) overlaps += 1;
          }
        const empty = [...document.querySelectorAll(selector)].filter(
          (host) => host.getBoundingClientRect().height < 1,
        ).length;
        return { overflow, overlaps, empty };
      }, session.selector);
      if (layout.overflow > 1)
        problems.push(`${width} px: the page scrolls sideways by ${layout.overflow} px.`);
      if (layout.overlaps > 0)
        problems.push(`${width} px: ${layout.overlaps} pair(s) of effect details overlap.`);
      if (layout.empty > 0)
        problems.push(`${width} px: ${layout.empty} host(s) collapsed to an empty band.`);
      problems.push(...failures(await session.status(page), `${width} px`));
      problems.push(...errors.map((error) => `${width} px: page error: ${error}`));
      const frame = path.join(output, `frame-${width}.png`);
      await page.screenshot({ path: frame });
      frames.push(frame);
    } finally {
      await context.close();
    }
  }
  return { result: [problems, frames.map((frame) => path.basename(frame))], frames };
}

/**
 * Дефект: эффект держит ссылки на хосты, которых больше нет, или не видит новых — падает или рисует
 * мимо после правки содержимого. Секция с хостом дублируется, последняя секция переносится в начало,
 * секция с хостом удаляется; после каждой правки число хостов у движка равно числу на странице.
 */
async function checkContent(session: Session, url: string): Promise<Outcome> {
  const { page, context, errors } = await session.open(url, 'live');
  const problems: string[] = [];
  try {
    for (const change of ['duplicate', 'reorder', 'delete'] as const) {
      await page.evaluate(
        ([operation, selector]) => {
          const host = document.querySelector(selector);
          const section = host?.closest('section, [data-semantic="section"]') ?? null;
          const sections = [...document.querySelectorAll('[data-semantic="section"]')];
          if (operation === 'duplicate' && section !== null) section.after(section.cloneNode(true));
          if (operation === 'reorder') {
            const last = sections[sections.length - 1];
            const first = sections[0];
            if (last !== undefined && first !== undefined && last !== first) first.before(last);
          }
          if (operation === 'delete' && section !== null) section.remove();
        },
        [change, session.selector] as const,
      );
      await page.waitForTimeout(50);
      await session.seek(page, 3);
      const expected = await page.evaluate(
        (selector) => document.querySelectorAll(selector).length,
        session.selector,
      );
      const status = await session.status(page);
      if (status === undefined || status.render === 'failed')
        problems.push(
          `after ${change}: the effect failed: ${status?.errors.join('; ') ?? 'unregistered'}`,
        );
      else if (status.hosts !== expected)
        problems.push(
          `after ${change}: the engine holds ${status.hosts} host(s), the page has ${expected}.`,
        );
    }
    problems.push(...errors.map((error) => `page error: ${error}`));
    return [problems, []];
  } finally {
    await context.close();
  }
}

/**
 * Дефект: состояние страницы (`data-state-*`) появляется только в живом режиме — читатель без движения
 * или без WebGL не видит станций и подсветок. Страница проходится до конца в каждом режиме, и наборы
 * поставленных состояний сравниваются.
 */
async function checkStates(session: Session, url: string): Promise<Outcome> {
  const sets = new Map<Mode, readonly string[]>();
  const problems: string[] = [];
  for (const mode of ['live', 'still', 'static'] as const) {
    const { page, context } = await session.open(url, mode);
    try {
      await page.evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.5));
        for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
          window.scrollTo({ top, behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }, undefined);
      await session.seek(page, 3);
      const status = await session.status(page);
      problems.push(...failures(status, mode));
      sets.set(mode, status?.states ?? []);
    } finally {
      await context.close();
    }
  }
  const live = sets.get('live') ?? [];
  for (const mode of ['still', 'static'] as const) {
    const other = sets.get(mode) ?? [];
    const missing = live.filter((state) => !other.includes(state));
    const extra = other.filter((state) => !live.includes(state));
    if (missing.length > 0)
      problems.push(`${mode} never sets ${missing.map((s) => `data-state-${s}`).join(', ')}.`);
    if (extra.length > 0)
      problems.push(
        `${mode} sets ${extra.map((s) => `data-state-${s}`).join(', ')} that live never sets.`,
      );
  }
  return [
    problems,
    [live.length === 0 ? 'the effect sets no states' : `states: ${live.join(', ')}`],
  ];
}

/**
 * Дефект: в печати вместо смысла пустое место — слой эффекта печатается, хост спрятан или хост без
 * текста. Объявление должно назвать статический эквивалент.
 */
async function checkPrint(session: Session, url: string, subject: Subject): Promise<Outcome> {
  const problems: string[] = [];
  if (subject.staticEquivalent.trim() === '') problems.push('staticEquivalent is empty.');
  const { page, context } = await session.open(url, 'live');
  try {
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate((selector) => {
      const layer = document.querySelector('.effect-layer');
      const layerVisible = layer !== null && getComputedStyle(layer).display !== 'none';
      const hosts = [...document.querySelectorAll<HTMLElement>(selector)].map((host) => {
        const style = getComputedStyle(host);
        const text =
          host instanceof HTMLImageElement ? host.alt.trim() : (host.innerText ?? '').trim();
        return {
          visible: style.display !== 'none' && style.visibility === 'visible',
          text: text.length > 0,
        };
      });
      return { layerVisible, hosts };
    }, session.selector);
    if (printed.layerVisible)
      problems.push('the effect layer is printed; print must show the hosts instead.');
    printed.hosts.forEach((host, index) => {
      if (!host.visible) problems.push(`host ${index + 1} is hidden in print.`);
      if (!host.text) problems.push(`host ${index + 1} has no text or alternative text for print.`);
    });
    return [problems, [`${printed.hosts.length} host(s) printed`]];
  } finally {
    await context.close();
  }
}

function trigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/^---[\s\S]*?---/u, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const grams = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1)
    grams.add(words.slice(index, index + 3).join(' '));
  return grams;
}

/**
 * Дефект: приём подогнан под одну страницу — два «примера» почти одинаковы или один не использует
 * эффект. Сходство — доля общих троек слов.
 */
async function checkExamples(
  subject: Subject,
  pages: readonly { source: string; hosts: number }[],
): Promise<Outcome> {
  const problems: string[] = [];
  if (subject.examples.length < 2)
    problems.push(`${subject.examples.length} example(s); two are needed.`);
  if (pages.length < subject.examples.length) problems.push('not every example built.');
  for (const page of pages)
    if (page.hosts === 0) problems.push(`${path.basename(page.source)} does not use the effect.`);
  const texts = await Promise.all(
    subject.examples.map((example) => readFile(example, 'utf8').catch(() => '')),
  );
  let similarity = 0;
  if (texts.length >= 2) {
    const [a, b] = [trigrams(texts[0] ?? ''), trigrams(texts[1] ?? '')];
    const shared = [...a].filter((gram) => b.has(gram)).length;
    similarity = shared / Math.max(1, Math.min(a.size, b.size));
    if (similarity > EXAMPLE_SIMILARITY_LIMIT)
      problems.push(
        `the examples share ${Math.round(similarity * 100)}% of their word triples; make them deliberately unlike.`,
      );
  }
  return [problems, [`similarity ${Math.round(similarity * 100)}%`]];
}

async function requireEmptyDirectory(directory: string): Promise<void> {
  const existing = await stat(directory).catch(() => undefined);
  if (existing === undefined) return;
  if (existing.isDirectory() && (await readdir(directory)).length === 0) return;
  throw new AgenticReportError({
    level: 'error',
    code: 'EFFECT_CHECK_DESTINATION_EXISTS',
    message: `effect-check destination already has content: ${directory}`,
    remediation:
      'Pass --out with an absent or empty directory; effect-check never overwrites files.',
    details: { output: directory },
  });
}
