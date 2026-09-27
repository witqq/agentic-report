/**
 * Сервис холстов движка эффектов. На странице один закреплённый слой эффектов размером с окно над
 * содержимым: в нём холсты эффектов по порядку `layer` и над ними слой DOM-деталей. Холст привязан к
 * геометрии хоста: `anchor()` отдаёт место хоста на экране, и эффект рисует там каждый кадр, так что
 * рисунок может выходить за рамку хоста. Плотность пикселей берётся из `webgl-policy.ts` и понижается
 * движком на медленных кадрах. Печать слой не видит: вместо него — сами хосты.
 *
 * Каждый эффект получает свои холсты: общий WebGL-контекст разных авторов переносил бы состояние одного
 * эффекта в другой, поэтому «один холст на страницу» — это один слой и один холст на эффект и слой.
 */

import type {
  EffectCanvas,
  EffectCanvasKind,
  EffectCanvasOptions,
  EffectRect,
} from '../../effect.js';
import { EFFECT_LAYER_CLASS } from './geometry.js';

let layer: HTMLElement | undefined;
let details: HTMLElement | undefined;

/** Слой эффектов страницы; создаётся при первом холсте или детали. */
export function effectLayer(): { layer: HTMLElement; details: HTMLElement } {
  if (layer === undefined || details === undefined || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = EFFECT_LAYER_CLASS;
    layer.setAttribute('aria-hidden', 'true');
    details = document.createElement('div');
    details.className = 'effect-details';
    layer.append(details);
    document.body.append(layer);
  }
  return { layer, details };
}

export interface ManagedCanvas<Kind extends EffectCanvasKind> extends EffectCanvas<Kind> {
  /** Привести размер холста к окну при плотности `ratio`. */
  fit(ratio: number): void;
  remove(): void;
}

function viewportRect(element: Element): EffectRect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function createCanvas<Kind extends EffectCanvasKind>(
  effect: string,
  options: EffectCanvasOptions<Kind>,
  ratio: number,
): ManagedCanvas<Kind> | null {
  const { layer: host, details: detailLayer } = effectLayer();
  const element = document.createElement('canvas');
  element.className = options.kind === 'webgl' ? 'effect-canvas webgl-canvas' : 'effect-canvas';
  element.dataset.effect = effect;
  const order = options.layer ?? 0;
  element.dataset.layer = String(order);
  const context =
    options.kind === 'webgl'
      ? element.getContext('webgl', {
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
          failIfMajorPerformanceCaveat: true,
        })
      : element.getContext('2d');
  if (context === null) return null;
  // Холсты идут по возрастанию `layer`, детали — всегда последними, над всеми холстами.
  const after = [...host.querySelectorAll<HTMLCanvasElement>('canvas.effect-canvas')].find(
    (canvas) => Number(canvas.dataset.layer) > order,
  );
  host.insertBefore(element, after ?? detailLayer);
  let current = ratio;
  const handle: ManagedCanvas<Kind> = {
    element,
    kind: options.kind,
    context: context as ManagedCanvas<Kind>['context'],
    get ratio() {
      return current;
    },
    anchor: () => viewportRect(options.host),
    toCanvas: (rect) => ({
      x: rect.x - window.scrollX,
      y: rect.y - window.scrollY,
      width: rect.width,
      height: rect.height,
    }),
    details: detailLayer,
    fit(next) {
      current = next;
      const width = Math.max(1, Math.round(document.documentElement.clientWidth * next));
      const height = Math.max(1, Math.round(document.documentElement.clientHeight * next));
      // Setting either dimension resets the bitmap and context, even when that dimension keeps
      // its value. A width-only resize should not reset the unchanged height a second time.
      if (element.width !== width) element.width = width;
      if (element.height !== height) element.height = height;
    },
    remove() {
      if (options.kind === 'webgl')
        (context as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
      element.remove();
    },
  };
  handle.fit(ratio);
  return handle;
}
