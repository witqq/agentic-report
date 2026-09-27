/**
 * Договор между упакованным эффектом и движком эффектов страницы: скрипт эффекта кладёт запись в
 * глобальную очередь, движок (`src/browser/effects/engine.ts`) разбирает её при старте и принимает все
 * следующие. Очередь нужна потому, что скрипт эффекта может выполниться раньше движка.
 */

import type { EffectDefinition } from '../effect.js';

/** Запись, которой упакованный эффект регистрируется на странице. */
export interface EffectRegistration {
  readonly name: string;
  /** Селектор хостов. */
  readonly selector: string;
  readonly ownsScroll: boolean;
  readonly definition: EffectDefinition;
}

/** Глобальная очередь регистраций. */
export const EFFECT_QUEUE_GLOBAL = '__agenticReportEffects';
