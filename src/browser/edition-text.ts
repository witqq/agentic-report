/**
 * Текст элемента, каким его видит читатель новой редакции: без узлов слоя изменений
 * (`data-edition-removed` — удалённые слова, призраки, ярлыки). Помощник живёт в общем рантайме: им
 * пользуются рабочее место ревью и навигация, а сам слой изменений едет отдельным файлом.
 */
export function textWithoutEditionLayer(element: Element): string {
  if (element.querySelector('[data-edition-removed]') === null) return element.textContent ?? '';
  const copy = element.cloneNode(true) as Element;
  for (const layer of copy.querySelectorAll('[data-edition-removed]')) layer.remove();
  return copy.textContent ?? '';
}
