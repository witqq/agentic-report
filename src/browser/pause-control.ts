/**
 * Кнопка паузы движения в потоке страницы. Непрерывное движение дольше пяти секунд — живой эффект,
 * который рисует каждый кадр сам (`declareContinuous` в движке эффектов), — получает кнопку сразу после
 * блока, где оно идёт: в потоке, а не поверх текста (WCAG 2.2.2). Кнопка переключает общий контроллер
 * паузы (`effects/pause.ts`, причина `reader`), несёт `aria-pressed`, при уменьшенном движении
 * начинает нажатой, а выбор читателя запоминается между страницами.
 */

import type { PackageStrings } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import { continuousHosts, onContinuousChange, pauseMotion, resumeMotion } from './effects/pause.js';
import { asUiButton } from './ui.js';

const READER = 'reader';

function remembered(): boolean | undefined {
  try {
    const value = window.localStorage.getItem(PAGE_MOTION_POLICY.pause.storageKey);
    return value === null ? undefined : value === 'true';
  } catch {
    return undefined;
  }
}

function remember(paused: boolean): void {
  try {
    window.localStorage.setItem(PAGE_MOTION_POLICY.pause.storageKey, String(paused));
  } catch {
    // Хранилище закрыто (частный режим, file:// с запретом): выбор держится до конца страницы.
  }
}

export function installPauseControl(
  page: HTMLElement,
  reducedMotion: MediaQueryList,
  strings: PackageStrings,
): () => void {
  let paused = remembered() ?? reducedMotion.matches;
  let holder: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;

  const apply = (): void => {
    if (paused && button !== undefined) pauseMotion(READER);
    else resumeMotion(READER);
    button?.setAttribute('aria-pressed', String(paused));
  };
  const place = (): void => {
    const first = continuousHosts().find((host) => page.contains(host));
    if (first === undefined) {
      holder?.remove();
      holder = undefined;
      button = undefined;
      apply();
      return;
    }
    // В потоке, никогда не поверх текста: движение идёт на главе — кнопка встаёт её последним блоком;
    // движение идёт на блоке внутри главы — сразу после этого блока.
    const chapter = first.matches('article > section') ? (first as HTMLElement) : undefined;
    const block =
      chapter === undefined
        ? (first.closest<HTMLElement>('article > section > *, article > *') ??
          (first instanceof HTMLElement ? first : undefined))
        : undefined;
    if (chapter === undefined && block === undefined) return;
    if (holder === undefined) {
      holder = document.createElement('div');
      holder.className = 'motion-pause';
      holder.dataset.motionPause = '';
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'motion-pause-button';
      asUiButton(button, 'secondary', 'sm');
      const glyph = document.createElement('span');
      glyph.className = 'motion-pause-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = strings.pauseMotion;
      button.append(glyph, label);
      button.addEventListener('click', () => {
        paused = !paused;
        remember(paused);
        apply();
      });
      holder.append(button);
    }
    if (chapter !== undefined) {
      if (holder.parentElement !== chapter || holder.nextElementSibling !== null)
        chapter.append(holder);
    } else if (block !== undefined && holder.previousElementSibling !== block) block.after(holder);
    apply();
  };
  const off = onContinuousChange(place);
  place();
  return () => {
    off();
    holder?.remove();
    resumeMotion(READER);
  };
}
