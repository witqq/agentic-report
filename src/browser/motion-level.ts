/**
 * Уровень движения страницы в браузере. Шапка пишет его на корень (`data-motion-level`), и рантайм
 * слушается его: уровень `none` значит для всего движения страницы то же, что просьба читателя об
 * уменьшенном движении, — всё нарисовано в конечном состоянии. Уровень `restrained` сборка уже сверила
 * с источником; в браузере он только рисует эффекты расширений в конечном состоянии.
 */

import { DEFAULT_MOTION_LEVEL, MOTION_LEVELS, type MotionLevel } from '../page-motion.js';

export function pageMotionLevel(): MotionLevel {
  const written = document.documentElement.dataset.motionLevel;
  return MOTION_LEVELS.find((level) => level === written) ?? DEFAULT_MOTION_LEVEL;
}

/**
 * Запрос «страница стоит»: совпадает, когда читатель просит уменьшенного движения или страница
 * объявила `motion: none`. Остальное — подписка на смену, `media` — берётся у настоящего запроса,
 * поэтому контроллеры рантайма принимают его вместо `matchMedia('(prefers-reduced-motion: reduce)')`.
 */
export function stillMotionQuery(media: MediaQueryList): MediaQueryList {
  return new Proxy(media, {
    get(target, property) {
      if (property === 'matches') return target.matches || pageMotionLevel() === 'none';
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
