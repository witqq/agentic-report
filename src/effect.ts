/**
 * Публичный вход автора эффекта — `agentic-report/effect`. Эффект уровня 2 (`kind: effect` в манифесте
 * расширения) — ES-модуль, чей экспорт по умолчанию — `defineEffect({ mount })`. Пакет упаковывает модуль
 * в один скрипт (`src/extensions/effect-bundle.ts`), а движок эффектов страницы
 * (`src/browser/effects/engine.ts`) находит его хосты, выбирает режим отрисовки и зовёт контроллер.
 *
 * Здесь только типы договора и тождественная `defineEffect`: при упаковке импорт `agentic-report/effect`
 * заменяется той же функцией, так что эффект не тянет в страницу ничего из Node-части пакета. Договор
 * описан в docs/ARCHITECTURE.md, раздел «Extensions», подраздел «Level 2 — effects and the effect engine».
 */

/**
 * Режим отрисовки. Движок выбирает его один раз на страницу (корень несёт `data-render`) и может понизить
 * для отдельного эффекта:
 *
 * - `live` — движение: `at(t, progress)` получает время часов страницы в секундах;
 * - `still` — читатель попросил меньше движения: `t` всегда `Infinity`, эффект рисует итоговое состояние
 *   сразу, без перемотки таймлайна;
 * - `static` — WebGL недоступен (или эффект упал в `live`): `t` тоже `Infinity`, рисовать 2D-холстом или
 *   SVG из той же геометрии, что и `live`.
 */
export type EffectRender = 'live' | 'still' | 'static';

/** Почему эффект рисует не в `live`. */
export type EffectFallbackReason =
  'reduced-motion' | 'motion-level' | 'no-webgl' | 'slow' | 'error' | 'forced';

/** Прямоугольник в CSS-пикселях. У `measure` и `obstacles` — координаты страницы, у холста — экрана. */
export interface EffectRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Закреплённый элемент страницы (`position: fixed` или `sticky`): шапка, колонка оглавления, панель. Он
 * движется с окном, поэтому его прямоугольник дан в координатах окна на момент вызова; нынешнее место
 * при отрисовке — `element.getBoundingClientRect()`.
 */
export interface EffectPinned {
  readonly element: HTMLElement;
  readonly rect: EffectRect;
}

/**
 * Препятствия для декора. Слои `text`, `chrome` и `free` — в координатах страницы и не зависят от
 * прокрутки: текст и элементы управления внутри закреплённых элементов в них не входят, закреплённые
 * элементы — отдельный слой `pinned`.
 */
export interface EffectObstacles {
  /** Жёсткий слой: строки текста. Декор не ложится на них. */
  readonly text: readonly EffectRect[];
  /** Мягкий слой: шапка, навигация, элементы управления вне закреплённых элементов. */
  readonly chrome: readonly EffectRect[];
  /**
   * Свободные области: прямоугольники не меньше 24 px, где нет строк текста (с полем 8 px) — поля сбоку
   * колонки и просветы между абзацами. Области могут перекрываться.
   */
  readonly free: readonly EffectRect[];
  /** Закреплённые элементы, внешние (вложенный в закреплённый не повторяется), в координатах окна. */
  readonly pinned: readonly EffectPinned[];
}

/** Контекст вёрстки на момент вызова. */
export interface EffectLayout {
  /** Режим вёрстки страницы из манифеста: `document`, `dashboard`, `landing`, `mixed`, `slides`. */
  readonly mode: string;
  /** Узкий экран (не шире 720 CSS px): параметры эффекта берутся из пары `narrow`. */
  readonly narrow: boolean;
  /** Высота малого окна (`100svh`) в CSS px, снятая один раз на пересборку. */
  readonly svh: number;
  /** Ширина окна в CSS px. */
  readonly width: number;
}

export type EffectCanvasKind = '2d' | 'webgl';

export interface EffectCanvasOptions<Kind extends EffectCanvasKind> {
  /** Хост, к геометрии которого привязан рисунок; холст пересобирается с его изменением. */
  readonly host: HTMLElement;
  readonly kind: Kind;
  /** Порядок среди холстов страницы: больший рисуется выше. По умолчанию 0. */
  readonly layer?: number;
}

/**
 * Холст эффекта: закреплённый, размером с окно, над содержимым страницы; DOM-детали эффекта кладутся в
 * `details` — слой над всеми холстами. Плотность пикселей и её понижение на медленных кадрах ведёт движок
 * (`src/browser/webgl-policy.ts`); размер холста приводится к окну перед каждым `at`.
 */
export interface EffectCanvas<Kind extends EffectCanvasKind> {
  readonly element: HTMLCanvasElement;
  readonly kind: Kind;
  readonly context: Kind extends 'webgl' ? WebGLRenderingContext : CanvasRenderingContext2D;
  /** Пикселей холста на CSS-пиксель. */
  readonly ratio: number;
  /** Прямоугольник хоста в CSS px окна — там, где хост сейчас на экране. */
  anchor(): EffectRect;
  /** Перевести прямоугольник из координат страницы в координаты холста (CSS px окна). */
  toCanvas(rect: EffectRect): EffectRect;
  /** Слой DOM-деталей над холстами; закреплён, как холст, и не принимает указатель. */
  readonly details: HTMLElement;
}

export interface EffectContext {
  /** Имя эффекта из манифеста. */
  readonly name: string;
  /** Элементы с атрибутами эффекта, в порядке документа. */
  readonly hosts: readonly HTMLElement[];
  readonly render: EffectRender;
  /** Причина, если `render` не `live`. */
  readonly reason: EffectFallbackReason | undefined;
  /** Значение атрибута цели на хосте (`data-effect-<name>-<attribute>`), если оно есть. */
  attribute(host: Element, attribute: string): string | undefined;
  readonly tokens: {
    /**
     * Решённое значение токена темы из публичного словаря (`schema --scope theme`). Цветовые токены
     * отдаются как `rgb(r g b / a)`, годный для 2D-холста и CSS. Имя вне словаря — ошибка.
     */
    read(token: `--${string}`): string;
    /** Цвет токена долями 0–1 `[r, g, b, a]` — для шейдера. */
    rgba(token: `--${string}`): readonly [number, number, number, number];
    /** Подписка на смену темы или схемы; возвращает отписку. */
    onChange(callback: () => void): () => void;
  };
  readonly clock: {
    /** Время часов страницы в секундах. */
    now(): number;
  };
  /** Детерминированный генератор чисел 0–1 от зерна. */
  random(seed: number | string): () => number;
  readonly measure: {
    /**
     * Прямоугольники строк текста элемента в координатах страницы; анимации появления не учитываются,
     * текст закреплённых потомков (`fixed`, `sticky`) не входит.
     */
    lines(element: Element): readonly EffectRect[];
    /** Прямоугольник элемента в координатах страницы; анимации появления не учитываются. */
    rect(element: Element): EffectRect;
  };
  obstacles(): EffectObstacles;
  /** Текущий контекст вёрстки. */
  readonly layout: EffectLayout;
  /** Параметр из пары «широкий/узкий» для текущего экрана. */
  pick<Value>(pair: { readonly wide: Value; readonly narrow: Value }): Value;
  /** Прогресс прохождения хоста через окно 0–1 (или выставленный записью `data-clock-progress`). */
  progress(host: Element): number;
  /**
   * Холст над содержимым. `webgl` в режиме, отличном от `live`, и при отказе видеокарты даёт `null`:
   * эффект рисует тогда 2D из той же геометрии.
   */
  canvas(options: EffectCanvasOptions<'2d'>): EffectCanvas<'2d'>;
  canvas(options: EffectCanvasOptions<'webgl'>): EffectCanvas<'webgl'> | null;
  readonly events: {
    /**
     * `reach` — хост дошёл до середины окна, `leave` — ушёл с неё. События приходят во всех режимах;
     * возвращает отписку.
     */
    on(type: 'reach' | 'leave', host: Element, callback: () => void): () => void;
  };
  readonly state: {
    /**
     * Состояние эффекта как атрибут `data-state-<name>` на хосте (без `host` — на всех хостах) во всех
     * режимах. `false` и `null` снимают атрибут.
     */
    set(name: string, value: string | number | boolean | null, host?: Element): void;
    /**
     * Подписка на состояние страницы `data-state-<name>` корня — то, что ставят секции и такты с `state`,
     * перемотка часов и другие эффекты (состояние страницы эффект ставит через `set` с корнем документа
     * в `host`). Вызывается сразу и при каждой смене со значением или `undefined`; возвращает отписку.
     */
    watch(name: string, callback: (value: string | undefined) => void): () => void;
  };
  /** Попросить пересборку геометрии; вызовы до следующей пересборки сливаются в один. */
  rebuild(reason: string): void;
}

export interface EffectController {
  /** Нарисовать состояние момента `t` секунд при прогрессе прокрутки страницы 0–1. Чистая функция. */
  at(t: number, progress: number): void;
  /** Геометрия изменилась. Без него движок снимает эффект и ставит заново. */
  rebuild?(): void;
  unmount?(): void;
}

export interface EffectDefinition {
  mount(context: EffectContext): EffectController;
  /** Эффект ведёт прокрутку страницы; такой на странице не больше одного. */
  readonly ownsScroll?: boolean;
  /**
   * Рисовать каждый кадр, пока хост на экране (по умолчанию `true`). `false` — только при прокрутке,
   * пересборке, смене темы и перемотке часов: для эффектов, чьё состояние задаёт прокрутка.
   */
  readonly continuous?: boolean;
  /**
   * Движение идёт дольше пяти секунд без участия читателя (петля, фон). Такому эффекту страница ставит
   * кнопку паузы в потоке (WCAG 2.2.2); короткому появлению кнопка не нужна и не сдвигает вёрстку.
   */
  readonly endless?: boolean;
}

/** Объявить эффект. Возвращает определение как есть: проверку и запуск ведёт движок страницы. */
export function defineEffect(definition: EffectDefinition): EffectDefinition {
  return definition;
}
