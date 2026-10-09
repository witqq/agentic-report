/*! agentic-report script: code */
/**
 * Code blocks: the copy control on every block, and the line-by-line printing of a log in a section with
 * `transition="log"`.
 */

import './copy.js';
import { pageClock } from '../clock.js';
import { contentElements, type Cleanup, feature, provideFeature } from '../features.js';
import { pace, timed, whenVisible } from '../technique-timing.js';

const clock = pageClock();

provideFeature('code', (page, strings) => {
  const copy = feature('copy');
  if (copy === undefined) return;
  for (const block of contentElements<HTMLElement>(page, 'pre'))
    if (block.querySelector(':scope > [data-copy-code]') === null)
      block.append(copy.button('code', strings));
});

// ——— transition="log" ———

/** Лог печатается не дольше 2,4 секунды целиком: длинный — быстрее построчно. */
export const LOG_LINE_MS = 140;
export const LOG_LIMIT_MS = 2400;

export function installLog(pre: HTMLElement): Cleanup {
  const code = pre.querySelector<HTMLElement>('code');
  if (code === null) return () => undefined;
  const lines = (code.textContent ?? '').replace(/\n+$/u, '').split('\n').length;
  if (lines < 2) return () => undefined;
  pre.setAttribute('data-log-live', '');
  let start: number | undefined;
  const lineMs = (): number => Math.min(LOG_LINE_MS, LOG_LIMIT_MS / lines) * pace();
  const run = timed((now) => {
    const shown =
      start === undefined
        ? 0
        : Math.min(lines, 1 + Math.floor(Math.max(0, now - start) / lineMs()));
    pre.style.setProperty('--log-shown', String(shown));
    pre.toggleAttribute('data-log-done', shown >= lines);
    return shown < lines;
  });
  pre.style.setProperty('--log-shown', '0');
  const unwatch = whenVisible(
    pre,
    () => {
      start = clock.now();
      run.start();
    },
    0.4,
  );
  return () => {
    unwatch();
    run.stop();
    pre.removeAttribute('data-log-live');
    pre.removeAttribute('data-log-done');
    pre.style.removeProperty('--log-shown');
  };
}

provideFeature('log', installLog);
