import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

/**
 * Номер рисунка («Fig. 01») ставит компилятор, а не счётчик CSS: счётчик ограничен контейнером по ширине
 * (у контейнера стилевая изоляция), и рисунок, попавший, например, в текстовую колонку первого экрана,
 * начинал бы нумерацию заново. Рисунки нумеруются подряд в порядке документа после всех перестановок
 * разметки; номер пишется атрибутом подписи и показывается стилями.
 */
const FIGURE_CLASSES = ['semantic-chart', 'semantic-diagram', 'semantic-timeline'] as const;

export const rehypeFigureNumbers: Plugin<[], Root> = () => (tree) => {
  let number = 0;
  const walk = (node: Root | Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (FIGURE_CLASSES.some((name) => classes(child).includes(name))) {
        number += 1;
        const caption = findCaption(child);
        if (caption !== undefined)
          caption.properties.dataFigureNumber = String(number).padStart(2, '0');
      }
      walk(child);
    }
  };
  walk(tree);
};

function findCaption(node: Element): Element | undefined {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (classes(child).includes('visualization-caption')) return child;
    const nested = findCaption(child);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function classes(element: Element): readonly string[] {
  const value: unknown = element.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}
