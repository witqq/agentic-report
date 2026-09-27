/**
 * Примитивы системы интерфейса для элементов, которые рантайм создаёт в браузере. Те же классы и
 * атрибуты ставит на разметку `src/render/ui-primitives.ts`; форму даёт слой `primitives` стилей.
 */
export type UiButtonVariant = 'primary' | 'secondary' | 'quiet';
export type UiSize = 'sm' | 'md';

export function asUiButton<T extends HTMLElement>(
  element: T,
  variant: UiButtonVariant,
  size: UiSize,
  iconOnly = false,
): T {
  element.classList.add('ui-button');
  element.dataset.uiVariant = variant;
  element.dataset.uiSize = size;
  if (iconOnly) element.dataset.uiIconOnly = '';
  return element;
}

export function asUi<T extends HTMLElement>(element: T, primitive: string, size?: UiSize): T {
  element.classList.add(primitive);
  if (size !== undefined) element.dataset.uiSize = size;
  return element;
}
