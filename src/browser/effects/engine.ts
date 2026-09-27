/**
 * Движок эффектов страницы: один для встроенных эффектов пакета (`threads`) и эффектов расширений
 * уровня 2. Он находит хосты эффекта, выбирает режим отрисовки, отдаёт эффекту контекст (`EffectContext`
 * из `src/effect.ts`) и ведёт его время, пересборку, паузу и понижение режима.
 *
 * Время эффекта — только часы страницы (`src/browser/clock.ts`): движок подписан на их перемотку и сам
 * просит кадры через них, а контекст эффекта не даёт ни `requestAnimationFrame`, ни таймеров. Поэтому
 * `window.__clock.seek(t)` приводит каждый эффект к моменту `t`, и снимок записи детерминирован.
 *
 * Режим страницы (корень несёт `data-render`): `still` при уменьшенном движении, `static` без WebGL, иначе
 * `live`. Эффект, упавший в `live`, ставится заново в `static`, упавший в `static` — в `still`; три медленных
 * кадра подряд на самой низкой плотности (`webgl-policy.ts`) переводят эффект в `still`.
 */

import type {
  EffectCanvas,
  EffectCanvasKind,
  EffectCanvasOptions,
  EffectContext,
  EffectController,
  EffectFallbackReason,
  EffectObstacles,
  EffectRender,
} from '../../effect.js';
import {
  EFFECT_QUEUE_GLOBAL,
  type EffectRegistration,
} from '../../extensions/effect-registration.js';
import { THEME_TOKENS } from '../../authoring/theme-tokens.js';
import { pageClock, progressOverride } from '../clock.js';
import {
  nextFrameBudget,
  webglPixelRatio,
  WEBGL_POLICY,
  type FrameBudget,
} from '../webgl-policy.js';
import { createCanvas, effectLayer, type ManagedCanvas } from './canvas.js';
import { EFFECT_LAYER_CLASS, measureLines, measureRect, obstacles } from './geometry.js';
import { watchGeometry } from '../geometry-rebuild.js';
import { pageMotionLevel } from '../motion-level.js';
import {
  declareContinuous,
  motionPaused,
  onPauseChange,
  pauseMotion,
  resumeMotion,
} from './pause.js';

export const RENDER_OVERRIDE_GLOBAL = '__agenticReportRender';
export const ENGINE_GLOBAL = '__agenticReportEffectEngine';
/** Проверочный выключатель: страница без эффектов — база для замера `effect-check`. */
export const EFFECTS_OFF_GLOBAL = '__agenticReportEffectsOff';

/** Состояние эффекта для проверки (`effect-check`) и отладки. */
export interface EffectStatus {
  readonly name: string;
  readonly render: EffectRender | 'failed' | 'unmounted';
  readonly reason: EffectFallbackReason | undefined;
  readonly hosts: number;
  /** Имена состояний, которые эффект ставил за жизнь страницы. */
  readonly states: readonly string[];
  /** Токены темы, которые эффект читал. */
  readonly tokens: readonly string[];
  readonly rebuilds: number;
  readonly loopGuard: number;
  /** Самый долгий вызов кода эффекта (монтирование, кадр, пересборка, событие) с последнего сброса, мс. */
  readonly longestMs: number;
  readonly errors: readonly string[];
  readonly ownsScroll: boolean;
}

export interface EffectEngineApi {
  /** Эффект, чей код выполняется сейчас, — для инструментирования таймеров в `effect-check`. */
  readonly current: string | undefined;
  readonly render: EffectRender;
  status(): EffectStatus[];
  /** Пересобрать все эффекты, как при изменении геометрии. */
  rebuildAll(reason: string): void;
  /** Начать замер `longestMs` заново. */
  resetTimings(): void;
  /** Препятствия страницы, как их видит `ctx.obstacles()`. */
  obstacles(): EffectObstacles;
  pause(reason: string): void;
  resume(reason: string): void;
}

declare global {
  interface Window {
    [RENDER_OVERRIDE_GLOBAL]?: EffectRender;
    [EFFECTS_OFF_GLOBAL]?: boolean;
    [ENGINE_GLOBAL]?: EffectEngineApi;
    [EFFECT_QUEUE_GLOBAL]?: EffectRegistration[] | { push(entry: EffectRegistration): number };
  }
}

const RENDERS: readonly EffectRender[] = ['live', 'still', 'static'];
const STATE_NAME = /^[a-z][a-z0-9-]{0,40}$/u;
/** Пересборок одного эффекта за секунду часов, после которых движок считает их циклом. */
const REBUILD_LIMIT = 6;
const COLOUR_GROUPS = new Set(['colour', 'status', 'series', 'code']);
const TOKEN_GROUPS = new Map(THEME_TOKENS.map((token) => [token.name, token.group] as const));

const clock = pageClock();
const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');

interface Mounted {
  readonly registration: EffectRegistration;
  hosts: HTMLElement[];
  render: EffectRender;
  reason: EffectFallbackReason | undefined;
  controller: EffectController | undefined;
  readonly canvases: Set<ManagedCanvas<EffectCanvasKind>>;
  readonly cleanups: Set<() => void>;
  budget: FrameBudget;
  visible: boolean;
  alive: boolean;
}

interface EffectRecord {
  readonly registration: EffectRegistration;
  mounted: Mounted | undefined;
  failed: boolean;
  readonly states: Set<string>;
  readonly tokens: Set<string>;
  readonly errors: string[];
  rebuilds: number;
  loopGuard: number;
  longestMs: number;
  windowStart: number;
  windowCount: number;
}

const records = new Map<string, EffectRecord>();
let current: string | undefined;
let frameRequest = 0;
let pendingRebuild = new Map<EffectRecord, string>();
let rebuildQueued = false;
let pageRender = choosePageRender();

function choosePageRender(): { render: EffectRender; reason: EffectFallbackReason | undefined } {
  const forced = window[RENDER_OVERRIDE_GLOBAL];
  if (forced !== undefined && RENDERS.includes(forced))
    return { render: forced, reason: forced === 'live' ? undefined : 'forced' };
  if (reducedMotion.matches) return { render: 'still', reason: 'reduced-motion' };
  // Уровень движения страницы: `none` стоит целиком, `restrained` не пускает живые эффекты.
  if (pageMotionLevel() !== 'expressive') return { render: 'still', reason: 'motion-level' };
  if (!webglAvailable()) return { render: 'static', reason: 'no-webgl' };
  return { render: 'live', reason: undefined };
}

/** Проба WebGL с тем же отказом слабой видеокарты, что у холстов эффектов. */
function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (gl === null) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function pixelRatio(): number {
  return webglPixelRatio(window.devicePixelRatio, coarsePointer.matches, window.innerWidth);
}

/** Выполнить код эффекта, пометив его как текущий; ошибка — понижение режима. */
function run<Result>(record: EffectRecord, action: () => Result): Result | undefined {
  const previous = current;
  current = record.registration.name;
  const started = clock.now();
  try {
    return action();
  } catch (error) {
    fail(record, error);
    return undefined;
  } finally {
    current = previous;
    record.longestMs = Math.max(record.longestMs, clock.now() - started);
  }
}

function fail(record: EffectRecord, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  record.errors.push(message);
  console.error(`[agentic-report] effect "${record.registration.name}" failed: ${message}`);
  const mounted = record.mounted;
  if (mounted === undefined || !mounted.alive) return;
  const next: EffectRender | undefined =
    mounted.render === 'live' ? 'static' : mounted.render === 'static' ? 'still' : undefined;
  // Понижение ставится после выхода из текущего вызова: он ещё держит контекст эффекта.
  queueMicrotask(() => {
    if (record.mounted !== mounted) return;
    unmount(record);
    if (next === undefined) record.failed = true;
    else mount(record, next, 'error');
  });
}

function pageProgress(): number {
  const override = progressOverride(root);
  if (override !== undefined) return override;
  const range = root.scrollHeight - window.innerHeight;
  return range <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / range));
}

function hostProgress(host: Element): number {
  const override = progressOverride(host);
  if (override !== undefined) return override;
  const rect = host.getBoundingClientRect();
  const span = window.innerHeight + rect.height;
  return Math.min(1, Math.max(0, (window.innerHeight - rect.top) / Math.max(1, span)));
}

/** Детерминированный генератор mulberry32 от зерна-числа или строки. */
export function seededRandom(seed: number | string): () => number {
  let state =
    typeof seed === 'number'
      ? seed >>> 0
      : [...seed].reduce(
          (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
          2166136261,
        ) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

let probe: HTMLElement | undefined;
function colourProbe(): HTMLElement {
  if (probe === undefined || !probe.isConnected) {
    probe = document.createElement('span');
    probe.hidden = true;
    effectLayer().layer.append(probe);
  }
  return probe;
}

function channels(colour: string): [number, number, number, number] {
  const [r = 0, g = 0, b = 0, a = 1] = (colour.match(/[\d.]+/gu) ?? []).map(Number);
  return [r, g, b, colour.startsWith('rgba') || colour.includes('/') ? a : 1];
}

function requireToken(record: EffectRecord, token: string): string {
  const group = TOKEN_GROUPS.get(token as `--${string}`);
  if (group === undefined)
    throw new Error(
      `Token ${token} is not in the public theme vocabulary; see \`agentic-report schema --scope theme\`.`,
    );
  record.tokens.add(token);
  return group;
}

function readToken(record: EffectRecord, token: string): string {
  const group = requireToken(record, token);
  if (!COLOUR_GROUPS.has(group)) return getComputedStyle(root).getPropertyValue(token).trim();
  const element = colourProbe();
  element.style.color = `var(${token})`;
  const [r, g, b, a] = channels(getComputedStyle(element).color);
  return a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`;
}

const tokenListeners = new Set<() => void>();
const notifyTokens = (): void => {
  for (const listener of [...tokenListeners]) listener();
  schedule();
};
new MutationObserver((mutations) => {
  if (
    mutations.some(
      (mutation) =>
        mutation.attributeName !== null &&
        (mutation.attributeName.startsWith('data-theme') ||
          mutation.attributeName === 'data-scheme'),
    )
  )
    notifyTokens();
}).observe(root, { attributes: true });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', notifyTokens);

/**
 * Высота малого окна (`100svh`): постоянный скрытый пробник в слое эффектов, прочитанный один раз на
 * пересборку. Пробник не вставляется заново на каждое чтение: вставка загрязняла бы вёрстку, и чтение
 * `ctx.layout.svh` посреди замеров стоило бы второго прохода раскладки в той же задаче.
 */
let svhProbe: HTMLElement | undefined;
let svhValue: number | undefined;
function svh(): number {
  if (svhValue !== undefined) return svhValue;
  if (svhProbe === undefined || !svhProbe.isConnected) {
    svhProbe = document.createElement('div');
    svhProbe.style.cssText = 'position:absolute;visibility:hidden;height:100svh;width:0';
    effectLayer().layer.append(svhProbe);
  }
  svhValue = svhProbe.getBoundingClientRect().height;
  return svhValue;
}

function createContext(record: EffectRecord, mounted: Mounted): EffectContext {
  const name = record.registration.name;
  function guard<Value>(action: () => Value): Value {
    if (!mounted.alive) throw new Error(`Effect "${name}" used its context after unmount.`);
    return action();
  }
  function canvas(options: EffectCanvasOptions<'2d'>): EffectCanvas<'2d'>;
  function canvas(options: EffectCanvasOptions<'webgl'>): EffectCanvas<'webgl'> | null;
  function canvas(
    options: EffectCanvasOptions<EffectCanvasKind>,
  ): EffectCanvas<EffectCanvasKind> | null {
    return guard(() => {
      if (options.kind === 'webgl' && mounted.render !== 'live') return null;
      const created = createCanvas(name, options, Math.min(pixelRatio(), mounted.budget.ratio));
      if (created === null) {
        if (options.kind === '2d') throw new Error('A 2D canvas context is unavailable.');
        return null;
      }
      mounted.canvases.add(created);
      return created;
    });
  }
  return {
    name,
    hosts: mounted.hosts,
    render: mounted.render,
    reason: mounted.reason,
    attribute: (host, attribute) =>
      host.getAttribute(`data-effect-${name}-${attribute}`) ?? undefined,
    tokens: {
      read: (token) => guard(() => readToken(record, token)),
      rgba: (token) =>
        guard(() => {
          const [r, g, b, a] = channels(readToken(record, token));
          return [r / 255, g / 255, b / 255, a] as const;
        }),
      onChange: (callback) =>
        guard(() => {
          const listener = (): void => {
            if (mounted.alive) run(record, callback);
          };
          tokenListeners.add(listener);
          const off = (): void => {
            tokenListeners.delete(listener);
          };
          mounted.cleanups.add(off);
          return off;
        }),
    },
    clock: { now: () => clock.now() / 1000 },
    random: seededRandom,
    measure: { lines: measureLines, rect: measureRect },
    obstacles,
    get layout() {
      return {
        mode: root.dataset.layout ?? 'document',
        narrow: window.innerWidth <= WEBGL_POLICY.narrowWidth,
        svh: svh(),
        width: window.innerWidth,
      };
    },
    pick: (pair) => (window.innerWidth <= WEBGL_POLICY.narrowWidth ? pair.narrow : pair.wide),
    progress: hostProgress,
    canvas,
    events: {
      on: (type, host, callback) =>
        guard(() => {
          let reached = false;
          const observer = new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              if (entry === undefined) return;
              if (entry.isIntersecting && !reached) {
                reached = true;
                if (type === 'reach' && mounted.alive) run(record, callback);
              } else if (!entry.isIntersecting && reached) {
                reached = false;
                if (type === 'leave' && mounted.alive) run(record, callback);
              }
            },
            { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
          );
          observer.observe(host);
          const off = (): void => observer.disconnect();
          mounted.cleanups.add(off);
          return off;
        }),
    },
    state: {
      set: (stateName, value, host) =>
        guard(() => {
          if (!STATE_NAME.test(stateName))
            throw new Error(`State name "${stateName}" must match ${STATE_NAME.source}.`);
          record.states.add(stateName);
          const attribute = `data-state-${stateName}`;
          for (const target of host === undefined ? mounted.hosts : [host]) {
            if (value === false || value === null) target.removeAttribute(attribute);
            else target.setAttribute(attribute, value === true ? '' : String(value));
          }
        }),
      watch: (stateName, callback) =>
        guard(() => {
          if (!STATE_NAME.test(stateName))
            throw new Error(`State name "${stateName}" must match ${STATE_NAME.source}.`);
          const attribute = `data-state-${stateName}`;
          let last = root.getAttribute(attribute) ?? undefined;
          const notify = (): void => {
            if (mounted.alive) run(record, () => callback(last));
          };
          const observer = new MutationObserver(() => {
            const next = root.getAttribute(attribute) ?? undefined;
            if (next === last) return;
            last = next;
            notify();
          });
          observer.observe(root, { attributes: true, attributeFilter: [attribute] });
          notify();
          const off = (): void => observer.disconnect();
          mounted.cleanups.add(off);
          return off;
        }),
    },
    rebuild: (reason) => requestRebuild(record, reason),
  };
}

function mount(
  record: EffectRecord,
  render: EffectRender,
  reason: EffectFallbackReason | undefined,
  drawing: 'now' | 'next-frame' = 'now',
): void {
  if (window[EFFECTS_OFF_GLOBAL] === true) return;
  const hosts = findHosts(record.registration);
  const mounted: Mounted = {
    registration: record.registration,
    hosts,
    render,
    reason,
    controller: undefined,
    canvases: new Set(),
    cleanups: new Set(),
    budget: { ratio: pixelRatio(), slowFrames: 0, giveUp: false },
    visible: false,
    alive: true,
  };
  record.mounted = mounted;
  if (hosts.length === 0) return;
  const visibleHosts = new Set<Element>();
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleHosts.add(entry.target);
      else visibleHosts.delete(entry.target);
    }
    mounted.visible = mounted.hosts.some((host) => visibleHosts.has(host));
    schedule();
  });
  for (const host of hosts) visibility.observe(host);
  mounted.cleanups.add(() => visibility.disconnect());
  const context = createContext(record, mounted);
  mounted.controller = run(record, () => record.registration.definition.mount(context));
  // Живой эффект, объявивший движение дольше пяти секунд, получает кнопку паузы; короткому — не нужна.
  if (
    mounted.controller !== undefined &&
    render === 'live' &&
    record.registration.definition.endless === true
  ) {
    for (const host of hosts) declareContinuous(host, true);
    mounted.cleanups.add(() => {
      for (const host of hosts) declareContinuous(host, false);
    });
  }
  if (mounted.controller === undefined) return;
  if (drawing === 'now') draw(record, currentTime(mounted));
  else schedule();
}

function unmount(record: EffectRecord): void {
  const mounted = record.mounted;
  if (mounted === undefined) return;
  const controller = mounted.controller;
  if (controller?.unmount !== undefined) run(record, () => controller.unmount?.());
  mounted.alive = false;
  for (const cleanup of mounted.cleanups) cleanup();
  for (const canvas of mounted.canvases) canvas.remove();
  record.mounted = undefined;
}

function findHosts(registration: EffectRegistration): HTMLElement[] {
  if (registration.selector.trim() === '') return [];
  return [...document.querySelectorAll<HTMLElement>(registration.selector)].filter(
    (host) => !host.closest(`.${EFFECT_LAYER_CLASS}`),
  );
}

function currentTime(mounted: Mounted): number {
  return mounted.render === 'live' ? clock.now() / 1000 : Number.POSITIVE_INFINITY;
}

/** Нарисовать эффект в момент `seconds` (для `live`), замерив кадр для политики плотности. */
function draw(record: EffectRecord, seconds: number): void {
  const mounted = record.mounted;
  const controller = mounted?.controller;
  if (mounted === undefined || controller === undefined || !mounted.alive) return;
  const ratio = Math.min(pixelRatio(), mounted.budget.ratio);
  for (const canvas of mounted.canvases) canvas.fit(ratio);
  const started = clock.now();
  run(record, () =>
    controller.at(mounted.render === 'live' ? seconds : Number.POSITIVE_INFINITY, pageProgress()),
  );
  if (mounted.render !== 'live' || record.mounted !== mounted) return;
  mounted.budget = nextFrameBudget(mounted.budget, clock.now() - started);
  if (mounted.budget.giveUp)
    queueMicrotask(() => {
      if (record.mounted !== mounted) return;
      unmount(record);
      mount(record, 'still', 'slow');
    });
}

function onFrame(): void {
  frameRequest = 0;
  const seconds = clock.now() / 1000;
  let again = false;
  for (const record of records.values()) {
    draw(record, seconds);
    const mounted = record.mounted;
    if (
      mounted?.render === 'live' &&
      mounted.visible &&
      mounted.registration.definition.continuous !== false
    )
      again = true;
  }
  if (again && !motionPaused()) schedule();
}

function schedule(): void {
  if (frameRequest === 0) frameRequest = clock.frame(onFrame);
}

function requestRebuild(record: EffectRecord, reason: string): void {
  if (!pendingRebuild.has(record)) pendingRebuild.set(record, reason);
  if (rebuildQueued) return;
  rebuildQueued = true;
  // Geometry watchers already run in an animation frame. In real time, another frame keeps their
  // layout work and the effect's rebuild out of one long browser task. Recorded clocks rebuild
  // immediately so a seek still produces the complete frame synchronously.
  if (clock.mode === 'real') clock.frame(flushRebuilds);
  else queueMicrotask(flushRebuilds);
}

/**
 * В реальном времени запрос пересборки выполняется в следующем кадре после повода (изменение ширины,
 * шрифты, конец входа); рисунок после неё назначается на очередной кадр. Уже запланированный кадр
 * непрерывного эффекта может выполниться до пересборки. Под часами записи (`manual`, `external`)
 * пересборка и рисунок выполняются сразу: снимок после перемотки показывает готовую картину.
 */
const DRAW_AFTER_REBUILD: 'now' | 'next-frame' = clock.mode === 'real' ? 'next-frame' : 'now';

function flushRebuilds(): void {
  rebuildQueued = false;
  const batch = pendingRebuild;
  pendingRebuild = new Map();
  svhValue = undefined;
  const now = clock.now();
  for (const [record, reason] of batch) {
    const mounted = record.mounted;
    if (mounted === undefined || mounted.controller === undefined) continue;
    // Защита от цикла: пересборка, вызывающая пересборку, останавливается на пределе за секунду часов.
    if (now - record.windowStart > 1000) {
      record.windowStart = now;
      record.windowCount = 0;
    }
    record.windowCount += 1;
    if (record.windowCount > REBUILD_LIMIT) {
      if (record.windowCount === REBUILD_LIMIT + 1) {
        record.loopGuard += 1;
        console.warn(
          `[agentic-report] effect "${record.registration.name}" rebuilt more than ${REBUILD_LIMIT} times in a second (${reason}); further rebuilds wait.`,
        );
      }
      continue;
    }
    record.rebuilds += 1;
    const controller = mounted.controller;
    if (controller.rebuild !== undefined) {
      run(record, () => controller.rebuild?.());
      if (DRAW_AFTER_REBUILD === 'now') draw(record, currentTime(mounted));
      else schedule();
    } else {
      unmount(record);
      mount(record, mounted.render, mounted.reason, DRAW_AFTER_REBUILD);
    }
  }
}

function rebuildAll(reason: string): void {
  for (const record of records.values()) requestRebuild(record, reason);
}

function sameHosts(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((host, index) => host === b[index]);
}

/** Хосты сменились (правка содержимого, смена языка): эффект ставится заново. */
function rescan(): void {
  svhValue = undefined;
  for (const record of records.values()) {
    if (record.failed) continue;
    const hosts = findHosts(record.registration);
    const mounted = record.mounted;
    if (mounted !== undefined && sameHosts(mounted.hosts, hosts)) continue;
    const render = mounted?.render ?? pageRender.render;
    const reason = mounted?.reason ?? pageRender.reason;
    unmount(record);
    mount(record, render, reason);
  }
}

let scrollOwner: string | undefined;

function register(registration: EffectRegistration): void {
  if (records.has(registration.name)) return;
  const record: EffectRecord = {
    registration,
    mounted: undefined,
    failed: false,
    states: new Set(),
    tokens: new Set(),
    errors: [],
    rebuilds: 0,
    loopGuard: 0,
    longestMs: 0,
    windowStart: clock.now(),
    windowCount: 0,
  };
  records.set(registration.name, record);
  if (typeof registration.definition?.mount !== 'function') {
    record.failed = true;
    record.errors.push('The module does not export defineEffect({ mount }) by default.');
    return;
  }
  if (registration.ownsScroll) {
    if (scrollOwner !== undefined) {
      record.failed = true;
      record.errors.push(
        `Effect "${scrollOwner}" already owns scrolling; at most one effect on a page may.`,
      );
      return;
    }
    scrollOwner = registration.name;
  }
  mount(record, pageRender.render, pageRender.reason);
}

function remountAll(): void {
  svhValue = undefined;
  pageRender = choosePageRender();
  root.dataset.render = pageRender.render;
  for (const record of records.values()) {
    if (record.failed) continue;
    unmount(record);
    mount(record, pageRender.render, pageRender.reason);
  }
}

/** Запустить движок: принять уже поставленные в очередь эффекты и все следующие. */
export function startEffectEngine(builtIns: readonly EffectRegistration[]): void {
  if (window[ENGINE_GLOBAL] !== undefined) return;
  root.dataset.render = pageRender.render;
  const queued = window[EFFECT_QUEUE_GLOBAL];
  const pending = Array.isArray(queued) ? queued : [];
  window[EFFECT_QUEUE_GLOBAL] = {
    push(entry: EffectRegistration) {
      register(entry);
      return records.size;
    },
  };
  window[ENGINE_GLOBAL] = {
    get current() {
      return current;
    },
    get render() {
      return pageRender.render;
    },
    status: () =>
      [...records.values()].map((record) => ({
        name: record.registration.name,
        render: record.failed ? 'failed' : (record.mounted?.render ?? 'unmounted'),
        reason: record.mounted?.reason,
        hosts: record.mounted?.hosts.length ?? 0,
        states: [...record.states].sort(),
        tokens: [...record.tokens].sort(),
        rebuilds: record.rebuilds,
        loopGuard: record.loopGuard,
        longestMs: record.longestMs,
        errors: [...record.errors],
        ownsScroll: record.registration.ownsScroll,
      })),
    rebuildAll,
    resetTimings: () => {
      for (const record of records.values()) record.longestMs = 0;
    },
    obstacles,
    pause: pauseMotion,
    resume: resumeMotion,
  };

  clock.register({
    at: (seconds) => {
      if (frameRequest !== 0) {
        clock.cancelFrame(frameRequest);
        frameRequest = 0;
      }
      for (const record of records.values()) {
        record.windowStart = clock.now();
        record.windowCount = 0;
        draw(record, seconds);
      }
    },
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // Поводы пересборки — общий помощник геометрии: смена ширины (не одной высоты), шрифты, конец входа
  // первого экрана и глав, возвращение на вкладку; поводы одного кадра сливаются.
  watchGeometry((reason) => rebuildAll(reason), { name: 'effects' });
  onPauseChange((paused) => {
    if (!paused) schedule();
  });
  reducedMotion.addEventListener('change', remountAll);
  let rescanQueued = false;
  new MutationObserver((mutations) => {
    if (
      mutations.every(
        (mutation) =>
          mutation.target instanceof Element && mutation.target.closest(`.${EFFECT_LAYER_CLASS}`),
      ) ||
      rescanQueued
    )
      return;
    rescanQueued = true;
    queueMicrotask(() => {
      rescanQueued = false;
      rescan();
    });
  }).observe(document.body, { childList: true, subtree: true });

  for (const registration of [...builtIns, ...pending]) register(registration);
}
