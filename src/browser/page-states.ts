/**
 * Состояния страницы (W-STATES). Состояние — флаг корня `data-state-<имя>`; его ставят:
 *
 * - прокрутка: секция с `state` достигнута, пока её верх выше середины экрана (или прогресс, выставленный
 *   записью в `data-clock-progress` секции, не меньше половины), и снята, когда читатель ушёл выше неё;
 * - сцены: такт с `state` стал текущим (сцена по шагам) или пройден (сцена со скрабом держит состояния
 *   пройденных тактов);
 * - часы: перемотка `__clock.seek` пересчитывает состояния прокрутки сразу, без кадра;
 * - эффекты расширений: `ctx.state.set(имя, значение, document.documentElement)`.
 *
 * Блоки с `when` получают `data-state-on`, пока их состояние стоит; по нему пакетные стили зажигают
 * карточку, а досчёт числа стартует. Без движения, при `motion: none` и в печати потребители горят
 * сразу: конечное состояние нарисовано напрямую. Сами флаги корня ставятся во всех режимах — на них
 * может опираться эффект.
 */

import { pageClock } from './clock.js';

const clock = pageClock();
const root = document.documentElement;
/** Кто держит каждое состояние, которое ставит рантайм: секция, сцена. Состояние стоит, пока держит хоть кто-то. */
const holders = new Map<string, Set<string>>();

export function setPageState(name: string, on: boolean, holder: string): void {
  const current = holders.get(name) ?? new Set<string>();
  if (on) current.add(holder);
  else current.delete(holder);
  if (current.size === 0) holders.delete(name);
  else holders.set(name, current);
  const attribute = `data-state-${name}`;
  const lit = current.size > 0;
  if (lit !== root.hasAttribute(attribute)) root.toggleAttribute(attribute, lit);
}

export function pageStateSet(name: string): boolean {
  return root.hasAttribute(`data-state-${name}`);
}

/**
 * Поставить состояния страницы одной страницы: секции с `state` и потребители с `when`. `live` —
 * обычное движение: потребители гаснут до своего состояния; иначе они горят сразу.
 */
export function installPageStates(page: HTMLElement, live: boolean): () => void {
  const sections = [
    ...page.querySelectorAll<HTMLElement>('section[data-semantic="section"][data-state]'),
  ];
  const consumers = [...page.querySelectorAll<HTMLElement>('[data-when]')];
  if (sections.length === 0 && consumers.length === 0) return () => undefined;
  root.toggleAttribute('data-page-states', live);

  const syncConsumers = (): void => {
    for (const consumer of consumers)
      consumer.toggleAttribute('data-state-on', pageStateSet(consumer.dataset.when ?? ''));
  };
  const consumerObserver = new MutationObserver(syncConsumers);
  consumerObserver.observe(root, { attributes: true });

  const reached = (section: HTMLElement): boolean => {
    const written = section.getAttribute('data-clock-progress');
    if (written !== null && written.trim() !== '' && Number.isFinite(Number(written)))
      return Number(written) >= 0.5;
    return section.getBoundingClientRect().top <= window.innerHeight / 2;
  };
  const syncSections = (): void => {
    for (const [index, section] of sections.entries())
      setPageState(section.dataset.state ?? '', reached(section), `section-${index}`);
  };
  let frame = 0;
  const schedule = (): void => {
    if (frame === 0)
      frame = clock.frame(() => {
        frame = 0;
        syncSections();
      });
  };
  const unregister = clock.register({ at: syncSections });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  syncSections();
  syncConsumers();

  return () => {
    unregister();
    consumerObserver.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) clock.cancelFrame(frame);
    for (const [index, section] of sections.entries())
      setPageState(section.dataset.state ?? '', false, `section-${index}`);
    for (const consumer of consumers) consumer.removeAttribute('data-state-on');
    root.removeAttribute('data-page-states');
  };
}
