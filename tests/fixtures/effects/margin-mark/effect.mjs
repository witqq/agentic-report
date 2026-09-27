// Образцовый эффект уровня 2 для тестов движка и effect-check: холст и DOM-деталь, три режима из одной
// геометрии, состояния во всех режимах. Флаги `createMark` сажают дефекты, которые effect-check обязан
// поймать (tests/unit/effect-check.test.ts); здесь все флаги выключены.
import { defineEffect } from 'agentic-report/effect';
import { createMark } from './mark.mjs';

export default defineEffect(createMark({}));
