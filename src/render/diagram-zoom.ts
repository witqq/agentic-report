import type { Element } from 'hast';

import { NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, element, round, text } from './diagram-svg.js';

/**
 * Пролёт внутрь узла схемы. Вложенный поток рисуется в координатах узла — вписанным в его коробку, —
 * и камера — `viewBox` одной закреплённой картинки — летит от всей схемы к этому узлу, пока вложенный
 * поток не займёт кадр. Это движение камеры, а не масштаб с перекрёстным затуханием: всё, что видно в
 * пути, — одна и та же геометрия. Подписи вложенного потока проявляются, когда становятся крупнее
 * читаемого, а подпись самого узла гаснет им навстречу. Без движения и в печати пролёт — две фигуры
 * рядом: схема целиком и то, что внутри узла.
 */

interface ZoomNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

interface ZoomView {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly ZoomNode[];
}

export interface ZoomSceneInput<View extends ZoomView> {
  readonly outer: View;
  readonly inner: View;
  readonly target: string;
  readonly title: string;
  readonly summary: string;
  readonly innerTitle: string;
  readonly outsideCaption: string;
  readonly allocateId: (base: string) => string;
  readonly instance: number;
  readonly body: (view: View) => readonly Element[];
}

/** Поле внутри коробки узла, куда вписан вложенный поток. */
const INSET = 5;
/** Запас кадра вокруг вложенного потока в конце пролёта. */
const FINAL_MARGIN = 1.08;
/**
 * Самый мелкий текст схемы — пояснение узла, 12.5 px; мельче 11 px на экране он не читается. Отсюда доля
 * естественной ширины, мельче которой неподвижная фигура не ужимается.
 */
const READABLE_SHARE = 0.9;

export interface ZoomGeometry {
  /** Масштаб вложенного потока внутри узла. */
  readonly scale: number;
  readonly translate: { readonly x: number; readonly y: number };
  /** Кадр в конце пролёта, в координатах всей схемы. */
  readonly final: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Где стоит вложенный поток и куда смотрит камера в конце: только из геометрии узла и двух видов. */
export function zoomGeometry(
  outer: { readonly width: number; readonly height: number },
  inner: { readonly width: number; readonly height: number },
  box: ZoomNode,
): ZoomGeometry {
  const boxWidth = box.width ?? NODE_DEFAULT_WIDTH;
  const boxHeight = box.height ?? NODE_DEFAULT_HEIGHT;
  const scale = Math.min(
    (boxWidth - 2 * INSET) / Math.max(1, inner.width),
    (boxHeight - 2 * INSET) / Math.max(1, inner.height),
  );
  const centre = { x: box.x + boxWidth / 2, y: box.y + boxHeight / 2 };
  const drawn = { width: inner.width * scale, height: inner.height * scale };
  const aspect = outer.width / Math.max(1, outer.height);
  const width =
    drawn.width / drawn.height > aspect
      ? drawn.width * FINAL_MARGIN
      : drawn.height * FINAL_MARGIN * aspect;
  const height = width / aspect;
  return {
    scale,
    translate: { x: centre.x - drawn.width / 2, y: centre.y - drawn.height / 2 },
    final: { x: centre.x - width / 2, y: centre.y - height / 2, width, height },
  };
}

function markTarget(body: readonly Element[], target: string): readonly Element[] {
  for (const part of body) {
    if (part.properties.dataNodeId === target) part.properties.dataZoomTarget = '';
  }
  return body;
}

export function renderZoomScene<View extends ZoomView>(input: ZoomSceneInput<View>): Element[] {
  const { outer, inner, target, allocateId, instance } = input;
  const box = outer.nodes.find((item) => item.id === target);
  if (box === undefined) throw new Error(`Zoom target ${target} is not a node of the diagram.`);
  const geometry = zoomGeometry(outer, inner, box);
  const titleId = allocateId(`visual-${instance}-zoom-title`);
  const descriptionId = allocateId(`visual-${instance}-zoom-description`);
  const frame = `0 0 ${round(outer.width)} ${round(outer.height)}`;
  const final = geometry.final;
  const camera = element(
    'svg',
    {
      viewBox: frame,
      width: round(outer.width),
      style: `--diagram-width: ${round(outer.width)}px`,
      role: 'img',
      ariaLabelledBy: [titleId],
      ariaDescribedBy: [descriptionId],
      className: ['visualization-svg', 'visualization-diagram', 'visualization-zoom-camera'],
      dataZoomFrom: frame,
      dataZoomTo: `${round(final.x)} ${round(final.y)} ${round(final.width)} ${round(final.height)}`,
      dataZoomScale: String(round(geometry.scale * 10_000) / 10_000),
    },
    [
      element('title', { id: titleId }, [text(input.title)]),
      element('desc', { id: descriptionId }, [text(input.summary)]),
      element('g', { className: ['visualization-zoom-outer'] }, [
        ...markTarget(input.body(outer), target),
      ]),
      element(
        'g',
        {
          className: ['visualization-zoom-inner'],
          transform: `translate(${round(geometry.translate.x)} ${round(geometry.translate.y)}) scale(${round(geometry.scale * 10_000) / 10_000})`,
        },
        [...input.body(inner)],
      ),
    ],
  );
  const still = (view: View, caption: string, marked: boolean): Element => {
    const stillTitle = allocateId(`visual-${instance}-zoom-still-title`);
    return element('div', { className: ['visualization-zoom-panel'] }, [
      element('p', { className: ['visualization-zoom-caption'] }, [text(caption)]),
      element('div', { className: ['visualization-frame'] }, [
        element(
          'svg',
          {
            viewBox: `0 0 ${round(view.width)} ${round(view.height)}`,
            // Естественная ширина, как у схемы: фигура ужимается не мельче читаемого, остаток прокручивается.
            width: round(view.width),
            style: `--diagram-width: ${round(view.width)}px`,
            role: 'img',
            ariaLabelledBy: [stillTitle],
            className: ['visualization-svg', 'visualization-diagram', 'visualization-zoom-still'],
          },
          [
            element('title', { id: stillTitle }, [text(caption)]),
            ...(marked ? markTarget(input.body(view), target) : input.body(view)),
          ],
        ),
      ]),
    ]);
  };
  return [
    element('div', { className: ['semantic-zoom', 'visualization-zoom'], dataZoomScene: '' }, [
      element('div', { className: ['visualization-zoom-stage'] }, [
        element('div', { className: ['visualization-frame'] }, [camera]),
      ]),
    ]),
    element(
      'div',
      {
        className: ['visualization-zoom-static'],
        // Две фигуры встают рядом, только если обе помещаются в свою колонку с читаемыми подписями.
        style: `--zoom-still-floor: ${Math.ceil(Math.max(outer.width, inner.width) * READABLE_SHARE)}px`,
      },
      [still(outer, input.outsideCaption, true), still(inner, input.innerTitle, false)],
    ),
  ];
}
