/**
 * Вход браузерного файла `effects.js`: движок эффектов и встроенный эффект `threads`. Файл попадает на
 * страницу, только если на ней есть встроенный эффект (`data-webgl`) или эффект расширения; упакованные
 * эффекты расширений регистрируются через очередь `window.__agenticReportEffects` в любом порядке.
 */

import { startEffectEngine } from './engine.js';
import { THREADS_SELECTOR, threadsEffect } from './threads.js';

startEffectEngine([
  { name: 'threads', selector: THREADS_SELECTOR, ownsScroll: false, definition: threadsEffect },
]);
