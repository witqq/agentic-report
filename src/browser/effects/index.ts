/*! agentic-report script: effects */
/**
 * Движок эффектов расширений — возможность страницы `effects`: модуль входит в скрипт страницы, только
 * если она объявляет эффект, и стартует после рантайма; упакованные эффекты регистрируются через очередь
 * `window.__agenticReportEffects` в любом порядке.
 */

import { startEffectEngine } from './engine.js';
startEffectEngine();
