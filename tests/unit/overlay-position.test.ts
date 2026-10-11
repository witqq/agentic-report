import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  observeSurfaceResize,
  placeSurface,
  type SurfacePosition,
} from '../../src/browser/overlay-position.js';

afterEach(() => vi.unstubAllGlobals());

class SurfaceResizeObserver implements ResizeObserver {
  static current: SurfaceResizeObserver;
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    SurfaceResizeObserver.current = this;
  }

  resize(): void {
    this.callback([], this);
  }
}

describe('overlay placement after surface size changes', () => {
  it('observes border-box changes and releases the observer with the surface', () => {
    // Catches a content-box-only subscription or a closed overlay retaining its resize observer.
    vi.stubGlobal('ResizeObserver', SurfaceResizeObserver);
    const surface = {} as Element;
    const schedule = vi.fn();
    const stop = observeSurfaceResize(surface, schedule);
    const observer = SurfaceResizeObserver.current;
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(surface, { box: 'border-box' });
    observer.resize();
    expect(schedule).toHaveBeenCalledTimes(1);
    stop();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('recalculates a growing surface without a window resize or scroll event', () => {
    // Catches the observed defect: after a font wraps another line, the old top leaves the panel outside
    // the viewport. A surface resize must feed the existing positioning calculation itself.
    vi.stubGlobal('ResizeObserver', SurfaceResizeObserver);
    const viewport = { left: 0, top: 0, right: 390, bottom: 1100 };
    let height = 356.515625;
    let position: SurfacePosition = { left: 0, top: 0 };
    const reposition = (): void => {
      position = placeSurface({
        anchor: { left: 18, top: 1092, right: 372, bottom: 1112, width: 354 },
        surface: { width: 374, height },
        viewport,
        gutter: 8,
        gap: 10,
        preference: 'inline',
      });
    };
    const stop = observeSurfaceResize({} as Element, reposition);
    reposition();
    const staleTop = position.top;
    height = 375.359375;
    expect(staleTop + height).toBeGreaterThan(viewport.bottom);
    SurfaceResizeObserver.current.resize();
    expect(position.top).toBeLessThan(staleTop);
    expect(position.top + height).toBeLessThanOrEqual(viewport.bottom - 8);
    expect(position.left).toBe(8);
    stop();
  });

  it('keeps a resized surface inside an offset visual viewport in either placement mode', () => {
    // Catches placement against the layout viewport when a keyboard or zoom moves the visible viewport.
    const viewport = { left: 20, top: 90, right: 410, bottom: 650 };
    for (const preference of ['block', 'inline'] as const) {
      const position = placeSurface({
        anchor: { left: 50, top: 600, right: 360, bottom: 640, width: 310 },
        surface: { width: 358, height: 430.25 },
        viewport,
        gutter: 16,
        gap: 8,
        preference,
      });
      expect(position.left).toBeGreaterThanOrEqual(36);
      expect(position.left + 358).toBeLessThanOrEqual(394);
      expect(position.top).toBeGreaterThanOrEqual(106);
      expect(position.top + 430.25).toBeLessThanOrEqual(634);
    }
  });
});
