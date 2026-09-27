/**
 * Политика отрисовки WebGL-приёмов пакета — чистые функции без обращения к странице, чтобы их можно было
 * проверить без браузера.
 *
 * Плотность пикселей: на телефоне и при грубом указателе холст рисуется не плотнее 1,5 — разница с 2
 * не видна глазу, а кадр обходится почти вдвое дешевле. Кадр дольше ~22 мс снижает плотность ступенью,
 * а три медленных кадра подряд на самой низкой плотности возвращают картинку в неподвижный вид: читатель
 * должен видеть страницу, а не рывки эффекта.
 */
export const WEBGL_POLICY = {
  maximumRatio: 2,
  coarseMaximumRatio: 1.5,
  narrowWidth: 720,
  minimumRatio: 1,
  slowFrameMs: 22,
  ratioStep: 0.75,
  slowFramesBeforeStatic: 3,
} as const;

export function webglPixelRatio(
  devicePixelRatio: number,
  coarsePointer: boolean,
  viewportWidth: number,
): number {
  const ceiling =
    coarsePointer || viewportWidth <= WEBGL_POLICY.narrowWidth
      ? WEBGL_POLICY.coarseMaximumRatio
      : WEBGL_POLICY.maximumRatio;
  return Math.max(WEBGL_POLICY.minimumRatio, Math.min(ceiling, devicePixelRatio || 1));
}

export interface FrameBudget {
  readonly ratio: number;
  readonly slowFrames: number;
  readonly giveUp: boolean;
}

/** Следующее состояние бюджета после кадра длительностью `frameMs`. */
export function nextFrameBudget(budget: FrameBudget, frameMs: number): FrameBudget {
  if (frameMs <= WEBGL_POLICY.slowFrameMs) return { ...budget, slowFrames: 0 };
  if (budget.ratio > WEBGL_POLICY.minimumRatio)
    return {
      ratio: Math.max(WEBGL_POLICY.minimumRatio, budget.ratio * WEBGL_POLICY.ratioStep),
      slowFrames: 0,
      giveUp: false,
    };
  const slowFrames = budget.slowFrames + 1;
  return {
    ratio: budget.ratio,
    slowFrames,
    giveUp: slowFrames >= WEBGL_POLICY.slowFramesBeforeStatic,
  };
}

/**
 * Точность фрагментного шейдера: `highp`, если видеокарта его поддерживает. На части мобильных
 * видеокарт `mediump` — 16 бит, и хеш `fract(sin(n) * 43758.5453)` на нём даёт полосы.
 */
export function fragmentPrecision(highFloatPrecisionBits: number): 'highp' | 'mediump' {
  return highFloatPrecisionBits > 0 ? 'highp' : 'mediump';
}
