/**
 * Имена договора часов страницы, общие для рантайма в браузере и для команд пакета в Node. Сами часы —
 * `src/browser/clock.ts`; договор описан в `docs/ARCHITECTURE.md`, в разделе про часы страницы.
 */

/** Глобальное имя, которым запись включает ручные часы до запуска рантайма: значение `'manual'`. */
export const MANUAL_CLOCK_GLOBAL = '__agenticReportClock';

/** Скрипт для `addInitScript`: включает ручные часы на каждой следующей загрузке страницы. */
export const MANUAL_CLOCK_INIT_SCRIPT = `window.${MANUAL_CLOCK_GLOBAL} = 'manual';`;

/**
 * Атрибут, которым запись выставляет прогресс эффекта от прокрутки (0–1) вместо положения на экране:
 * `scene="progress"` читает его у секции, нити WebGL — у картинки. Применяется со следующим кадром или
 * перемоткой.
 */
export const PROGRESS_OVERRIDE_ATTRIBUTE = 'data-clock-progress';
