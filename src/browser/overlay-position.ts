export interface ViewportBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface SurfacePositionOptions {
  readonly anchor: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>;
  readonly surface: { readonly width: number; readonly height: number };
  readonly viewport: ViewportBounds;
  readonly gutter: number;
  readonly gap: number;
  readonly preference: 'block' | 'inline';
}

export interface SurfacePosition {
  readonly left: number;
  readonly top: number;
}

export function visualViewportBounds(): ViewportBounds {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  return {
    left,
    top,
    right: left + (viewport?.width ?? window.innerWidth),
    bottom: top + (viewport?.height ?? window.innerHeight),
  };
}

export function placeSurface(options: SurfacePositionOptions): SurfacePosition {
  const { anchor, surface, viewport, gutter, gap, preference } = options;
  const minimumLeft = viewport.left + gutter;
  const maximumLeft = Math.max(minimumLeft, viewport.right - surface.width - gutter);
  const minimumTop = viewport.top + gutter;
  const maximumTop = Math.max(minimumTop, viewport.bottom - surface.height - gutter);

  if (preference === 'inline') {
    const rightFits = anchor.right + gap + surface.width <= viewport.right - gutter;
    const leftFits = anchor.left - gap - surface.width >= minimumLeft;
    const left = rightFits
      ? anchor.right + gap
      : leftFits
        ? anchor.left - gap - surface.width
        : clamp(anchor.left + anchor.width / 2 - surface.width / 2, minimumLeft, maximumLeft);
    const below = anchor.bottom + gap;
    const top =
      rightFits || leftFits
        ? clamp(anchor.top - gap, minimumTop, maximumTop)
        : below + surface.height <= viewport.bottom - gutter
          ? below
          : clamp(anchor.top - surface.height - gap, minimumTop, maximumTop);
    return { left, top };
  }

  const left = clamp(anchor.left + anchor.width / 2 - surface.width / 2, minimumLeft, maximumLeft);
  const below = anchor.bottom + gap;
  const above = anchor.top - surface.height - gap;
  const top =
    below + surface.height <= viewport.bottom - gutter
      ? below
      : above >= minimumTop
        ? above
        : clamp(below, minimumTop, maximumTop);
  return { left, top };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
