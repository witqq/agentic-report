/*! agentic-report script: count */
/** Count-up numbers (`:count`): the number counts from zero to its written value when it shows. */

import { pageClock } from '../clock.js';
import { provideFeature } from '../features.js';

const clock = pageClock();
const root = document.documentElement;

/**
 * Число досчитывает от нуля до записанного значения, когда показывается. Записанное значение
 * остаётся источником: разделители групп и число знаков после запятой берутся из него, а в конце
 * возвращается ровно записанный текст.
 */
function installCount(element: HTMLElement): () => void {
  const final = element.dataset.countFinal ?? element.textContent ?? '';
  element.dataset.countFinal = final;
  const match = /\d[\d\s,.\u00a0\u202f]*\d|\d/u.exec(final);
  if (match === null) return () => undefined;
  const written = match[0];
  const separators = written.replace(/\d/gu, '');
  const lastSeparator = separators.at(-1);
  const tail =
    lastSeparator === undefined ? '' : written.slice(written.lastIndexOf(lastSeparator) + 1);
  const decimalMark =
    lastSeparator !== undefined &&
    (separators.length === 1 ? tail.length !== 3 : !separators.slice(0, -1).includes(lastSeparator))
      ? lastSeparator
      : undefined;
  const group = [...separators].find((mark) => mark !== decimalMark);
  const decimals = decimalMark === undefined ? 0 : tail.length;
  const value = Number(
    written
      .split(decimalMark ?? '\u0000')
      .map((part) => part.replace(/\D/gu, ''))
      .join('.'),
  );
  const format = (current: number): string => {
    const [whole = '0', fraction] = current.toFixed(decimals).split('.');
    const grouped = group === undefined ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/gu, group);
    return fraction === undefined ? grouped : `${grouped}${decimalMark}${fraction}`;
  };
  let frame = 0;
  let unregister = (): void => undefined;
  const run = (): void => {
    const pace = Number(getComputedStyle(root).getPropertyValue('--motion-pace')) || 1;
    const duration = 900 * pace;
    const start = clock.now();
    // Досчёт — функция времени часов: перемотка назад показывает то же число, что и первый проход.
    const render = (now: number): boolean => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - progress) ** 3;
      element.textContent = progress >= 1 ? final : final.replace(written, format(value * eased));
      return progress < 1;
    };
    const step = (now: number): void => {
      if (render(now)) frame = clock.frame(step);
    };
    unregister = clock.register({ at: (seconds) => render(seconds * 1000) });
    frame = clock.frame(step);
  };
  // Число с `when` считает, когда встаёт его состояние страницы, а не когда показывается.
  const stateObserver = new MutationObserver(() => {
    if (!element.hasAttribute('data-state-on')) return;
    stateObserver.disconnect();
    run();
  });
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    },
    { threshold: 0.6 },
  );
  if (element.dataset.when === undefined) observer.observe(element);
  else if (element.hasAttribute('data-state-on')) run();
  else stateObserver.observe(element, { attributes: true, attributeFilter: ['data-state-on'] });
  return () => {
    observer.disconnect();
    stateObserver.disconnect();
    unregister();
    if (frame !== 0) clock.cancelFrame(frame);
    element.textContent = final;
  };
}

provideFeature('count', installCount);
