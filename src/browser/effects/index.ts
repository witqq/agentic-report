/**
 * Вход браузерного файла `effects.js`: движок эффектов расширений. Файл попадает на страницу,
 * только если она объявляет эффект; упакованные эффекты регистрируются через очередь
 * `window.__agenticReportEffects` в любом порядке.
 */

import { startEffectEngine } from './engine.js';
startEffectEngine();
