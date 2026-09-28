/**
 * Переходы вида (View Transitions) для вкладок: смена вкладки, смена вида схемы (её виды — те же
 * вкладки) и переход «список → схема». То, что есть в обоих видах, переезжает на новое место (FLIP
 * средствами браузера): узел схемы — по `data-node-id`, строка списка и узел схемы — по одинаковому
 * тексту. Остальное сменяется затуханием. Браузер без View Transitions, уменьшенное движение и
 * `motion: none` меняют вид мгновенно; длительность и кривая — роли движения (`--duration-*`, `--ease-scene`).
 */

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    readonly ready: Promise<void>;
    readonly finished: Promise<void>;
  };
};

function keyed(panel: Element | null | undefined): Map<string, Element> {
  const found = new Map<string, Element>();
  if (panel === null || panel === undefined) return found;
  const text = (element: Element): string =>
    (element.querySelector('text')?.textContent ?? element.textContent ?? '')
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/gu, ' ');
  // Узел схемы узнаётся и по `id` (другой вид той же схемы), и по подписи (строка списка в другой вкладке).
  for (const node of panel.querySelectorAll('[data-node-id]')) {
    const id = node.getAttribute('data-node-id');
    if (id !== null && id !== '' && !found.has(`node:${id}`)) found.set(`node:${id}`, node);
    const label = text(node);
    if (label !== '' && !found.has(`text:${label}`)) found.set(`text:${label}`, node);
  }
  // Строки видимых списков; схема словами в закрытом раскрытии не видна и не переезжает.
  for (const row of panel.querySelectorAll('li')) {
    if (row.closest('details:not([open])') !== null) continue;
    const label = text(row);
    if (label !== '' && !found.has(`text:${label}`)) found.set(`text:${label}`, row);
  }
  return found;
}

function name(element: Element, value: string | undefined): void {
  const style = (element as HTMLElement | SVGElement).style;
  if (value === undefined) style.removeProperty('view-transition-name');
  else style.setProperty('view-transition-name', value);
}

/**
 * Сменить вкладку переходом вида: `change` показывает новую панель. `from` и `to` — старая и новая
 * панели; общие предметы получают одинаковые имена перехода до и после смены.
 */
export function switchWithTransition(
  from: Element | null | undefined,
  to: Element | null | undefined,
  still: MediaQueryList,
  change: () => void,
): void {
  const transitionDocument = document as TransitionDocument;
  if (
    still.matches ||
    typeof transitionDocument.startViewTransition !== 'function' ||
    from === to
  ) {
    change();
    return;
  }
  const before = keyed(from);
  const after = keyed(to);
  // Один предмет — одно имя: узел, узнанный и по `id`, и по тексту, получает имя один раз.
  const usedBefore = new Set<Element>();
  const usedAfter = new Set<Element>();
  const shared = [...before.keys()]
    .filter((key) => {
      const old = before.get(key);
      const next = after.get(key);
      if (old === undefined || next === undefined || usedBefore.has(old) || usedAfter.has(next))
        return false;
      usedBefore.add(old);
      usedAfter.add(next);
      return true;
    })
    .slice(0, 64);
  const names = new Map(shared.map((key, index) => [key, `agentic-shared-${index}`]));
  for (const [key, value] of names) name(before.get(key) as Element, value);
  document.documentElement.setAttribute('data-view-transition', '');
  const transition = transitionDocument.startViewTransition.call(document, () => {
    for (const key of names.keys()) name(before.get(key) as Element, undefined);
    change();
    for (const [key, value] of names) name(after.get(key) as Element, value);
  });
  // Браузер пропускает переход, когда следующая смена вкладки начинается до конца предыдущей или
  // страница скрыта: `ready` тогда отклоняется «Transition was skipped», а смена уже показана без
  // анимации. Это штатный исход, а не ошибка страницы.
  transition.ready.catch(() => undefined);
  const settle = (): void => {
    for (const key of names.keys()) name(after.get(key) as Element, undefined);
    document.documentElement.removeAttribute('data-view-transition');
  };
  transition.finished.then(settle, settle);
}
