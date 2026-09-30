/**
 * Выбор вкладки без перехода вида: общий для обработчика вкладок рантайма, подбора вида схемы и места
 * чтения, которое открывает скрытую панель вокруг цели якоря.
 */

export function tabControls(control: HTMLButtonElement): HTMLButtonElement[] {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  const tabList = tabs?.querySelector<HTMLElement>(':scope > [role="tablist"]');
  return tabList === undefined || tabList === null
    ? []
    : [...tabList.querySelectorAll<HTMLButtonElement>('[data-tab]')];
}

export function activateTab(control: HTMLButtonElement, moveFocus: boolean): void {
  const tabs = control.closest<HTMLElement>('[data-tabs]');
  if (tabs === null) return;
  const controls = tabControls(control);
  const panels = [...tabs.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.matches('[data-tab-panel]'),
  );
  for (const candidate of controls) {
    const selected = candidate === control;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = panels.find((item) => item.id === candidate.getAttribute('aria-controls'));
    if (panel !== undefined) panel.hidden = !selected;
  }
  if (moveFocus) control.focus();
}

/**
 * Показать скрытую панель вкладок, в которой стоит `element` (или которой он является), выбрав её вкладку
 * сразу, без перехода вида: цель якоря меряется в том же кадре. `true`, если вкладка сменилась.
 */
export function showTabPanel(element: Element): boolean {
  if (!(element instanceof HTMLElement) || !element.matches('[data-tab-panel][hidden]'))
    return false;
  const tabs = element.parentElement?.closest<HTMLElement>('[data-tabs]');
  const control = tabs
    ?.querySelector<HTMLElement>(':scope > [role="tablist"]')
    ?.querySelector<HTMLButtonElement>(`[data-tab][aria-controls="${CSS.escape(element.id)}"]`);
  if (control === null || control === undefined) return false;
  activateTab(control, false);
  return true;
}
