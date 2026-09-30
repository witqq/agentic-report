export const PAGE_MOTION_POLICY = {
  /** Полоса «вся страница» — украшение и при уменьшенном движении не ставится; главы — навигация и остаются. */
  progress: { pageNormalMotionOnly: true },
  sectionReveal: {
    default: false,
    normalMotionOnly: true,
    durationMs: 420,
    /** Появление смещается не больше чем на 16 px навстречу источнику: дальше это уже въезд, а не приход. */
    translationPx: 16,
  },
  stagger: { stepMs: 90, maximumItems: 12 },
  /**
   * Параллакс сцены по прокрутке — декоративный слой, смещение ±12 px за проход; величина своя, не глубина
   * отклика на указатель, чтобы правка одной не меняла другую.
   */
  scene: { normalMotionOnly: true, parallaxPx: 24 },
  pointer: {
    normalMotionOnly: true,
    finePointerOnly: true,
    /** Глубина отклика на указатель — 12 px: норма 5–15 px, шире уже качка, а не глубина. */
    depthPx: 12,
    tiltDegrees: 4.5,
    magneticPx: 9,
  },
  choreography: { stepMs: 75, maximumItems: 12, normalMotionOnly: true },
  /**
   * Длительности по ролям — рядом с тремя кривыми движения (`src/browser/styles/core.css`): текст выходит из маски за
   * 700 мс с шагом строк 70 мс и въезжает со 108 % своей высоты; сцена — крупный предмет — идёт 1200 мс;
   * уход назад быстрее прихода. Рантайм пишет их переменными корня, CSS читает только их.
   */
  roles: {
    textMs: 700,
    textLineStepMs: 70,
    textRisePercent: 108,
    sceneMs: 1200,
    backMs: 240,
  },
  /**
   * Закреплённая сцена со скрабом: один такт — один экран, и тактов не больше четырёх; подпись шага
   * меняется, когда прокручена треть его отрезка; текст шага догоняет прокрутку за 0,6 с.
   */
  scrub: { maximumScreens: 4, minimumScreens: 2, captionSwitchAt: 1 / 3, smoothingMs: 600 },
  /** Закреплённая сцена по шагам тоже не длиннее четырёх экранов, сколько бы тактов в ней ни было. */
  pinnedScene: { maximumScreens: 4 },
  /** Непрерывное движение дольше пяти секунд получает кнопку паузы в потоке страницы (WCAG 2.2.2). */
  pause: { continuousAfterMs: 5000, storageKey: 'agentic-report:motion-paused' },
} as const;

/**
 * Уровень движения страницы — решение брифа, записанное в `motion` шапки. Бюджет выше — нижняя планка
 * безопасности при любом уровне; уровень ограничивает сверху то, что страница вообще делает:
 *
 * - `none` — страница стоит: всё движение нарисовано в конечном состоянии, как при уменьшенном движении;
 * - `restrained` — не больше одного появления главы и одного отклика на указатель; закреплённых сцен,
 *   прорисовки схемы, WebGL и поэтапного входа нет, эффекты расширений нарисованы в конечном состоянии;
 * - `expressive` — режиссированная страница: всё из словаря, у каждого приёма есть вид без движения.
 */
export const MOTION_LEVELS = ['none', 'restrained', 'expressive'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export const DEFAULT_MOTION_LEVEL: MotionLevel = 'expressive';

/** Приём движения, который проверка уровня узнаёт в источнике. */
export type MotionTechnique = 'entrance' | 'pointer' | 'count' | 'inline' | 'directed';

/** Самый низкий уровень, на котором приём разрешён, и сколько раз он может встретиться на этом уровне. */
export const MOTION_LEVEL_RULES: Readonly<
  Record<MotionTechnique, { readonly from: MotionLevel; readonly restrainedLimit?: number }>
> = {
  /** Появление главы: `transition` любого вида, кроме поэтапного входа. */
  entrance: { from: 'restrained', restrainedLimit: 1 },
  /** Отклик на указатель: `interaction`, магнит у действия. */
  pointer: { from: 'restrained', restrainedLimit: 1 },
  /** Досчёт числа и каскад метрик, рост графика от нуля (`count-up`). */
  count: { from: 'restrained' },
  /**
   * Малое движение на месте, один раз и без закрепления: замена слова `:swap`, набор строки `:typing`,
   * пометка `:mark`, лупа `spotlight`, мягкий шов петли `video{seam="fade"}`.
   */
  inline: { from: 'restrained' },
  /**
   * Режиссура: сцены `progress`, `steps`, `scrub`, `draw="scroll"`, `pulse`, пролёт `zoom`, проигрываемая
   * сцена `demo{play}`, WebGL, поэтапный вход первого экрана.
   */
  directed: { from: 'expressive' },
};

export function motionLevelAllows(level: MotionLevel, technique: MotionTechnique): boolean {
  return MOTION_LEVELS.indexOf(level) >= MOTION_LEVELS.indexOf(MOTION_LEVEL_RULES[technique].from);
}
