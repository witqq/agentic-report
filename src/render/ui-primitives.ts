import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';

/**
 * Система интерфейса: каждый интерактивный и подписывающий элемент страницы — примитив `ui-*`, у которого
 * одна форма на всю страницу (слой `primitives` таблиц стилей пакета, `src/browser/styles/core.css` и стили возможностей). Компоненты разметки
 * отдают семантику; эта таблица в одном месте говорит, каким примитивом рисуется каждая их часть.
 * Рантайм, который создаёт элементы в браузере, ставит те же классы сам.
 */
export type UiPrimitive =
  | 'ui-button'
  | 'ui-field'
  | 'ui-label'
  | 'ui-meta'
  | 'ui-chip'
  | 'ui-tabs'
  | 'ui-tab'
  | 'ui-row'
  | 'ui-switch'
  | 'ui-range'
  | 'ui-title'
  | 'ui-item-title'
  | 'ui-panel';

interface UiRule {
  readonly primitive: UiPrimitive;
  readonly matches: (element: Element, ancestors: readonly Element[]) => boolean;
  readonly attributes?: (element: Element) => Readonly<Record<string, string>>;
}

function classes(element: Element): readonly string[] {
  const value: unknown = element.properties.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(' ') : [];
}

const has = (element: Element, name: string): boolean => classes(element).includes(name);
const within = (ancestors: readonly Element[], name: string): boolean =>
  ancestors.some((ancestor) => has(ancestor, name));

/** Вариант действия по его виду: главное, второе или тихое. */
function actionVariant(element: Element): Readonly<Record<string, string>> {
  const kind = element.properties.dataKind;
  const variant = kind === 'primary' || kind === 'quiet' ? kind : 'secondary';
  return { dataUiVariant: variant, dataUiSize: 'md' };
}

/**
 * Порядок важен: первое совпавшее правило назначает примитив. Исключения — кнопка-термин глоссария
 * (она часть текста) и маркер заметки ревью (отметка поверх текста) — примитивами не становятся.
 */
export const UI_PRIMITIVE_RULES: readonly UiRule[] = [
  {
    primitive: 'ui-button',
    matches: (element) => element.tagName === 'a' && has(element, 'semantic-action'),
    attributes: actionVariant,
  },
  {
    primitive: 'ui-tab',
    matches: (element) => element.tagName === 'button' && element.properties.role === 'tab',
  },
  {
    primitive: 'ui-switch',
    matches: (element) => element.tagName === 'button' && element.properties.role === 'switch',
  },
  {
    primitive: 'ui-button',
    matches: (element) => element.tagName === 'button' && has(element, 'video-toggle'),
    attributes: () => ({ dataUiVariant: 'secondary', dataUiSize: 'sm' }),
  },
  {
    primitive: 'ui-row',
    matches: (element) => element.tagName === 'button' && has(element, 'video-chapter'),
    attributes: () => ({ dataUiSize: 'md' }),
  },
  {
    // Кнопка внутри карточки-демо — действие карточки: малого размера, как остальные действия карточек.
    primitive: 'ui-button',
    matches: (element, ancestors) =>
      element.tagName === 'button' && within(ancestors, 'semantic-demo'),
    attributes: () => ({ dataUiVariant: 'secondary', dataUiSize: 'sm' }),
  },
  {
    primitive: 'ui-button',
    matches: (element) =>
      element.tagName === 'button' && element.properties.dataGlossaryTrigger === undefined,
    attributes: () => ({ dataUiVariant: 'secondary', dataUiSize: 'md' }),
  },
  {
    primitive: 'ui-button',
    matches: (element) => element.tagName === 'a' && has(element, 'semantic-asset'),
    attributes: () => ({ dataUiVariant: 'secondary', dataUiSize: 'sm' }),
  },
  {
    primitive: 'ui-tabs',
    matches: (element) => has(element, 'semantic-tab-list'),
  },
  {
    primitive: 'ui-row',
    matches: (element) => element.tagName === 'summary',
    attributes: (element) => ({
      dataUiSize: has(element, 'semantic-disclosure-summary') ? 'md' : 'sm',
    }),
  },
  {
    primitive: 'ui-field',
    matches: (element) =>
      (element.tagName === 'input' &&
        element.properties.type !== 'range' &&
        element.properties.type !== 'radio' &&
        element.properties.type !== 'checkbox') ||
      element.tagName === 'select' ||
      element.tagName === 'textarea',
  },
  {
    primitive: 'ui-range',
    matches: (element) => element.tagName === 'input' && element.properties.type === 'range',
  },
  {
    primitive: 'ui-label',
    matches: (element, ancestors) =>
      (element.tagName === 'label' && within(ancestors, 'semantic-filter-controls')) ||
      element.tagName === 'th' ||
      has(element, 'semantic-status') ||
      has(element, 'semantic-severity') ||
      has(element, 'semantic-contents-title') ||
      has(element, 'visualization-timeline-date'),
  },
  {
    primitive: 'ui-meta',
    matches: (element) =>
      (element.tagName === 'output' && element.properties.dataFilterCount !== undefined) ||
      has(element, 'semantic-finding-location'),
  },
  {
    primitive: 'ui-chip',
    matches: (element) => has(element, 'compare-label'),
  },
  {
    primitive: 'ui-item-title',
    matches: (element, ancestors) =>
      has(element, 'semantic-title') && within(ancestors, 'semantic-finding-head'),
  },
  {
    primitive: 'ui-title',
    matches: (element) => has(element, 'semantic-title') || has(element, 'visualization-title'),
  },
  {
    primitive: 'ui-panel',
    matches: (element) =>
      element.properties.dataPopoverPanel !== undefined ||
      element.properties.dataModalDialog !== undefined,
  },
];

/** Помечает элементы разметки их примитивами; повторный проход ничего не меняет. */
export const rehypeUiPrimitives: Plugin<[], Root> = () => (tree) => {
  const walk = (node: Root | Element, ancestors: readonly Element[]): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      assignPrimitive(child, ancestors);
      walk(child, [...ancestors, child]);
    }
  };
  walk(tree, []);
};

function assignPrimitive(element: Element, ancestors: readonly Element[]): void {
  const rule = UI_PRIMITIVE_RULES.find((candidate) => candidate.matches(element, ancestors));
  if (rule === undefined) return;
  const current = classes(element);
  if (!current.includes(rule.primitive))
    element.properties.className = [...current, rule.primitive];
  for (const [name, value] of Object.entries(rule.attributes?.(element) ?? {})) {
    element.properties[name] ??= value;
  }
}
