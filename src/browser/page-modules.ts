/**
 * Раскладка и рантайм движения страницы, поставленные на один языковой вариант страницы: режим экранов,
 * состояния страницы, сцена со скрабом, поэтапный вход первого экрана, заполнение тезиса, текущая
 * строка без наведения, кнопка паузы, переходы вида. Рантайм зовёт `installPageModules` при каждой
 * активации варианта и снимает поставленное при смене языка.
 */

import type { PackageStrings } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import { installCurrentRows } from './current-row.js';
import { feature } from './features.js';
import { announceGeometryChange } from './geometry-rebuild.js';
import { installOpeningEntrance } from './opening-entrance.js';
import { installPageStates } from './page-states.js';
import { installPauseControl } from './pause-control.js';
import { installReadingPosition } from './reading-position.js';
import { installThesisFill } from './thesis-fill.js';

const root = document.documentElement;

/** Длительности по ролям — переменные корня из политики движения; CSS читает только их. */
function writeRoleDurations(): void {
  const roles = PAGE_MOTION_POLICY.roles;
  root.style.setProperty('--duration-text', `${roles.textMs}ms`);
  root.style.setProperty('--duration-text-step', `${roles.textLineStepMs}ms`);
  root.style.setProperty('--duration-scene', `${roles.sceneMs}ms`);
  root.style.setProperty('--duration-back', `${roles.backMs}ms`);
  root.style.setProperty('--text-rise', `${roles.textRisePercent}%`);
}

let entranceListener = false;

/**
 * Конец появления главы — повод пересобрать зависимую геометрию: переход кончается у каждого ребёнка
 * секции отдельным событием, поэтому повод объявляется один на кадр.
 */
function listenForEntrances(): void {
  if (entranceListener) return;
  entranceListener = true;
  let queued = false;
  document.addEventListener(
    'transitionend',
    (event) => {
      if (
        queued ||
        event.propertyName !== 'transform' ||
        !(event.target instanceof Element) ||
        event.target.closest('[data-reveal-shown]') === null
      )
        return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        announceGeometryChange('entrance');
      });
    },
    true,
  );
}

export function installPageModules(
  page: HTMLElement,
  still: MediaQueryList,
  strings: PackageStrings,
): () => void {
  writeRoleDurations();
  listenForEntrances();
  const cleanups = [
    installPageStates(page, !still.matches),
    feature('screens')?.(page, still, strings),
    feature('scrubScenes')?.(page, still, strings),
    installOpeningEntrance(page, still),
    installThesisFill(page, still),
    installCurrentRows(page),
    installPauseControl(page, still, strings),
    feature('figureViewer')?.(page, strings),
    feature('diagramForms')?.(page),
    installReadingPosition(page, still),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup?.();
  };
}
