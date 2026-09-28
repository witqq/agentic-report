/**
 * Контроллер паузы страницы — общий для рантайма и движка эффектов: движение стоит, пока есть хотя бы
 * одна причина паузы. Причины — вкладка скрыта (`hidden`), кнопка паузы в потоке страницы (`reader`) и
 * просьба снаружи (`__agenticReportEffects` API движка). Корень несёт `data-motion-paused`, пока пауза
 * действует. Перемотка часов (`__clock.seek`) рисует и на паузе: запись и проверка ведут время сами.
 *
 * Рантайм и эффекты собраны отдельными файлами, поэтому состояние живёт на окне под общим символом, как
 * часы страницы: кто подключил модуль первым, тот его и создал. Здесь же учёт непрерывного движения —
 * хостов, которые движутся сами дольше пяти секунд: им положена кнопка паузы (WCAG 2.2.2).
 */

interface PauseState {
  readonly reasons: Set<string>;
  readonly listeners: Set<(paused: boolean) => void>;
  readonly continuous: Set<Element>;
  readonly continuousListeners: Set<() => void>;
}

const PAUSE_STATE = Symbol.for('agentic-report.pause');

function state(): PauseState {
  const holder = window as unknown as Record<symbol, PauseState | undefined>;
  const existing = holder[PAUSE_STATE];
  if (existing !== undefined) return existing;
  const created: PauseState = {
    reasons: new Set(),
    listeners: new Set(),
    continuous: new Set(),
    continuousListeners: new Set(),
  };
  holder[PAUSE_STATE] = created;
  const syncVisibility = (): void => {
    if (document.visibilityState === 'hidden') pauseMotion('hidden');
    else resumeMotion('hidden');
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  return created;
}

function apply(): void {
  const current = state();
  const paused = current.reasons.size > 0;
  document.documentElement.toggleAttribute('data-motion-paused', paused);
  for (const listener of [...current.listeners]) listener(paused);
}

export function pauseMotion(reason: string): void {
  const current = state();
  if (current.reasons.has(reason)) return;
  current.reasons.add(reason);
  apply();
}

export function resumeMotion(reason: string): void {
  if (!state().reasons.delete(reason)) return;
  apply();
}

export function motionPaused(): boolean {
  return state().reasons.size > 0;
}

export function onPauseChange(listener: (paused: boolean) => void): () => void {
  const current = state();
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
  };
}

/** Объявить (или снять) хост, который движется сам, пока его не остановят. */
export function declareContinuous(host: Element, continuous: boolean): void {
  const current = state();
  const changed = continuous ? !current.continuous.has(host) : current.continuous.has(host);
  if (!changed) return;
  if (continuous) current.continuous.add(host);
  else current.continuous.delete(host);
  host.toggleAttribute('data-continuous-motion', continuous);
  for (const listener of [...current.continuousListeners]) listener();
}

/** Хосты непрерывного движения в порядке документа. */
export function continuousHosts(): Element[] {
  return [...state().continuous]
    .filter((host) => host.isConnected)
    .sort((left, right) =>
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
}

export function onContinuousChange(listener: () => void): () => void {
  const current = state();
  current.continuousListeners.add(listener);
  return () => {
    current.continuousListeners.delete(listener);
  };
}

state();
