/**
 * Поэтапный вход первого экрана (`transition="staged"` у секции `place="opening"`). Первый экран входит
 * по порядку чтения: заголовок страницы построчно (строки выходят из маски), затем надзаголовок,
 * подзаголовок, действия и сцена — каждый следующий начинается, пока предыдущий ещё оседает.
 * Длительности — роли движения (`--duration-text`, `--duration-text-step`, `--duration-scene`). Когда
 * вход закончен, геометрия, которая зависит от первого экрана (эффекты, сцены, экраны), пересобирается
 * через общий помощник (`announceGeometryChange('entrance')`). Без движения первый экран просто есть.
 */

import { PAGE_MOTION_POLICY } from '../page-motion.js';
import { pageClock } from './clock.js';
import { announceGeometryChange } from './geometry-rebuild.js';

type EntrancePart = 'title' | 'eyebrow' | 'subtitle' | 'actions' | 'scene';

/** Порядок входа частей первого экрана. */
export const ENTRANCE_ORDER: readonly EntrancePart[] = [
  'title',
  'eyebrow',
  'subtitle',
  'actions',
  'scene',
];

/** Моменты начала частей, мс: следующая часть начинается, когда предыдущая прошла 60 % своего пути. */
export function entranceSchedule(
  titleLines: number,
  present: ReadonlySet<EntrancePart>,
  pace = 1,
): { readonly starts: ReadonlyMap<EntrancePart, number>; readonly end: number } {
  const roles = PAGE_MOTION_POLICY.roles;
  const lines = Math.max(1, Math.round(titleLines));
  const duration = (part: EntrancePart): number =>
    (part === 'title'
      ? roles.textMs + (lines - 1) * roles.textLineStepMs
      : part === 'scene'
        ? roles.sceneMs
        : roles.textMs) * pace;
  const starts = new Map<EntrancePart, number>();
  let at = 0;
  let end = 0;
  for (const part of ENTRANCE_ORDER) {
    if (!present.has(part)) continue;
    starts.set(part, Math.round(at));
    end = Math.max(end, at + duration(part));
    at += duration(part) * 0.6;
  }
  return { starts, end: Math.round(end) };
}

export function installOpeningEntrance(page: HTMLElement, still: MediaQueryList): () => void {
  const opening = page.querySelector<HTMLElement>('[data-page-opening]');
  const scene = opening?.querySelector<HTMLElement>(
    ':scope > section[data-place="opening"][data-transition="staged"]',
  );
  const copy = opening?.querySelector<HTMLElement>(':scope > .page-opening-copy');
  if (opening === null || opening === undefined || scene === null || scene === undefined) {
    return () => undefined;
  }
  if (still.matches || copy === null || copy === undefined) return () => undefined;
  const clock = pageClock();
  const title = copy.querySelector<HTMLElement>(':scope > h1');
  const parts = new Map<HTMLElement, EntrancePart>();
  let seenTitle = false;
  for (const child of copy.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === title) {
      parts.set(child, 'title');
      seenTitle = true;
    } else if (child.matches('.semantic-actions, [data-semantic="actions"]'))
      parts.set(child, 'actions');
    else if (!seenTitle || child.matches('.semantic-eyebrow, [data-role="eyebrow"]'))
      parts.set(child, 'eyebrow');
    else parts.set(child, 'subtitle');
  }
  parts.set(scene, 'scene');

  const lineHeight = title === null ? 0 : Number.parseFloat(getComputedStyle(title).lineHeight);
  const lines =
    title === null
      ? 1
      : Math.max(
          1,
          Math.round(title.getBoundingClientRect().height / (lineHeight > 0 ? lineHeight : 1)),
        );
  const pace =
    Number(getComputedStyle(document.documentElement).getPropertyValue('--motion-pace')) || 1;
  const schedule = entranceSchedule(lines, new Set(parts.values()), pace);
  for (const [element, part] of parts) {
    element.dataset.entrancePart = part;
    element.style.setProperty('--entrance-delay', `${schedule.starts.get(part) ?? 0}ms`);
  }
  if (title !== null) title.style.setProperty('--title-line-count', String(lines));
  opening.dataset.entrance = 'pending';
  // Скрытое состояние должно быть нарисовано до запуска, иначе переход начался бы с конечного вида.
  opening.getBoundingClientRect();
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    opening.dataset.entrance = 'done';
    announceGeometryChange('entrance');
  };
  // Вход начинается с загрузкой страницы — в момент ноль часов, поэтому запись видит его целиком.
  opening.dataset.entrance = 'run';
  const timer = clock.later(finish, schedule.end + 20);
  return () => {
    clock.cancelLater(timer);
    delete opening.dataset.entrance;
    for (const [element] of parts) {
      delete element.dataset.entrancePart;
      element.style.removeProperty('--entrance-delay');
    }
    title?.style.removeProperty('--title-line-count');
  };
}
