/**
 * `:mark` и `spotlight`: конечное состояние по умолчанию, ожидание — только при живом движении, пока
 * элемент не показался.
 */

import type { Cleanup } from './features.js';
import { whenVisible } from './technique-timing.js';

export function installPending(
  element: HTMLElement,
  attribute: string,
  threshold: number,
): Cleanup {
  element.setAttribute(attribute, '');
  const unwatch = whenVisible(element, () => element.removeAttribute(attribute), threshold);
  return () => {
    unwatch();
    element.removeAttribute(attribute);
  };
}
