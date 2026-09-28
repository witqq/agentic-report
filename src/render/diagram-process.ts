import type { Element } from 'hast';

import type { PackageLocale } from '../localization.js';
import { ARROW_LENGTH, element, round } from './diagram-svg.js';

/**
 * Процесс на схеме: статус шага, кратность связи «×N» и петля шага, который повторяется. Статус, в
 * отличие от выделения узла, имеет смысл пакета и слово пакета, поэтому пункт легенды для него
 * появляется сам; цвет берётся из ролей статусов темы, а значок читается и без цвета.
 */

export type NodeStatus = 'done' | 'review' | 'returned' | 'pending';

export const NODE_STATUSES: readonly NodeStatus[] = ['done', 'review', 'returned', 'pending'];

/** Слова схемы процесса и пролёта на языке страницы. */
export interface DiagramMessages {
  readonly statuses: Readonly<Record<NodeStatus, string>>;
  /** Подпись статичной пары фигур пролёта: снаружи и внутри узла. */
  readonly zoomOutside: string;
  readonly zoomInside: (node: string) => string;
  /** Раздел описания со вложенной схемой. */
  readonly zoomSection: (node: string) => string;
  /** Раздел описания с маршрутом импульсов. */
  readonly pulseRoute: string;
  /** Мини-схема процесса словами. */
  readonly process: {
    readonly steps: string;
    readonly returned: (from: string, to: string, count: number) => string;
    readonly repeated: (step: string, count: number) => string;
  };
}

function russianTimes(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'раз' : last >= 2 && last <= 4 ? 'раза' : 'раз';
  return `${count} ${word}`;
}

export const DIAGRAM_MESSAGES: Readonly<Record<PackageLocale, DiagramMessages>> = {
  en: {
    statuses: { done: 'done', review: 'in review', returned: 'returned', pending: 'not started' },
    zoomOutside: 'The whole diagram',
    zoomInside: (node) => `Inside “${node}”`,
    zoomSection: (node) => `Inside “${node}”`,
    pulseRoute: 'Route of the pulses',
    process: {
      steps: 'Steps',
      returned: (from, to, count) =>
        `returned from ${from} to ${to} ${count === 1 ? 'once' : `${count} times`}`,
      repeated: (step, count) => `${step} repeated ${count === 1 ? 'once' : `${count} times`}`,
    },
  },
  ru: {
    statuses: {
      done: 'готово',
      review: 'на проверке',
      returned: 'возвращено',
      pending: 'не начато',
    },
    zoomOutside: 'Схема целиком',
    zoomInside: (node) => `Внутри «${node}»`,
    zoomSection: (node) => `Внутри «${node}»`,
    pulseRoute: 'Маршрут импульсов',
    process: {
      steps: 'Шаги',
      returned: (from, to, count) => `возврат с шага ${from} на ${to}: ${russianTimes(count)}`,
      repeated: (step, count) => `${step} повторён ${russianTimes(count)}`,
    },
  },
};

export function nodeStatusOf(value: string | undefined): NodeStatus | undefined {
  return NODE_STATUSES.find((status) => status === value);
}

/** Кратность связи так, как она написана на схеме. */
export function countText(count: number): string {
  return `×${count}`;
}

/**
 * Значок статуса на верхней кромке коробки, у левого угла: кружок с галкой (готово), точкой (на
 * проверке), стрелкой назад (возвращено) или пустой (не начато). Значок стоит на рамке, поэтому не
 * спорит с подписью узла за место.
 */
export function statusBadge(status: NodeStatus, x: number, y: number): Element {
  const cx = x + 18;
  const cy = y;
  const glyph: Element[] =
    status === 'done'
      ? [
          element('path', {
            d: `M ${round(cx - 3.2)} ${round(cy + 0.2)} L ${round(cx - 0.8)} ${round(cy + 2.6)} L ${round(cx + 3.4)} ${round(cy - 2.4)}`,
            className: ['visualization-status-glyph'],
          }),
        ]
      : status === 'review'
        ? [element('circle', { cx, cy, r: 2.4, className: ['visualization-status-dot'] })]
        : status === 'returned'
          ? [
              element('path', {
                d: `M ${round(cx + 3)} ${round(cy + 1.8)} A 3.2 3.2 0 1 0 ${round(cx - 1.4)} ${round(cy + 3)}`,
                className: ['visualization-status-glyph'],
              }),
              element('polygon', {
                points: `${round(cx - 3.6)},${round(cy + 1)} ${round(cx - 0.4)},${round(cy + 4.6)} ${round(cx - 3.8)},${round(cy + 4.8)}`,
                className: ['visualization-status-dot'],
              }),
            ]
          : [];
  return element('g', { className: ['visualization-status', `visualization-status-${status}`] }, [
    element('circle', { cx, cy, r: 7, className: ['visualization-status-disc'] }),
    ...glyph,
  ]);
}

/** Сколько петля выступает за правую кромку узла. */
export const SELF_LOOP_REACH = { right: 30 } as const;

/**
 * Петля шага, который повторяется: выходит из верхней кромки у правого угла и входит в правую кромку
 * сверху, наконечник — на кромке. Угол коробки свободен: связи по потоку садятся на середины граней.
 */
export function selfLoop(
  box: { readonly x: number; readonly y: number; readonly width: number },
  index: number,
  attributes: Readonly<Record<string, string>>,
  className: readonly string[],
): {
  readonly path: Element;
  readonly tip: { x: number; y: number };
} {
  const right = box.x + box.width;
  const start = { x: right - 16, y: box.y };
  const tip = { x: right + 2, y: box.y + 16 };
  const shaftEnd = { x: tip.x + (ARROW_LENGTH - 2), y: tip.y };
  const path = element('path', {
    d: `M ${round(start.x)} ${round(start.y)} C ${round(start.x)} ${round(start.y - 28)} ${round(shaftEnd.x + 22)} ${round(shaftEnd.y)} ${round(shaftEnd.x)} ${round(shaftEnd.y)}`,
    fill: 'none',
    className: [...className],
    dataEdge: String(index + 1),
    ...attributes,
  });
  return { path, tip };
}
