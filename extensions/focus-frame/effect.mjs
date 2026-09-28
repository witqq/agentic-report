import { defineEffect } from 'agentic-report/effect';

/** A frame remains inside the image so the effect never covers nearby text. */
const INSET = 3;
const STROKE = 2;
const CORNER = 24;

const clamp = (value) => Math.max(0, Math.min(1, value));

function segments(rect, progress, variant) {
  const x = Math.round(rect.x + INSET);
  const y = Math.round(rect.y + INSET);
  const width = Math.round(rect.width - INSET * 2);
  const height = Math.round(rect.height - INSET * 2);
  if (width <= STROKE * 2 || height <= STROKE * 2) return [];
  if (variant === 'corners') {
    const arm = Math.round(Math.min(CORNER, width / 4, height / 4) * progress);
    if (arm === 0) return [];
    return [
      [x, y, arm, STROKE],
      [x, y, STROKE, arm],
      [x + width - arm, y, arm, STROKE],
      [x + width - STROKE, y, STROKE, arm],
      [x, y + height - STROKE, arm, STROKE],
      [x, y + height - arm, STROKE, arm],
      [x + width - arm, y + height - STROKE, arm, STROKE],
      [x + width - STROKE, y + height - arm, STROKE, arm],
    ];
  }
  let remaining = (width + height) * 2 * progress;
  const top = Math.min(width, remaining);
  remaining -= top;
  const right = Math.min(height, remaining);
  remaining -= right;
  const bottom = Math.min(width, remaining);
  remaining -= bottom;
  const left = Math.min(height, remaining);
  return [
    [x, y, top, STROKE],
    [x + width - STROKE, y, STROKE, right],
    [x + width - bottom, y + height - STROKE, bottom, STROKE],
    [x, y + height - left, STROKE, left],
  ].filter(([, , segmentWidth, segmentHeight]) => segmentWidth > 0 && segmentHeight > 0);
}

function paint2d(surface, rectangles, colour) {
  const paint = surface.context;
  const ratio = surface.ratio;
  paint.setTransform(1, 0, 0, 1, 0, 0);
  paint.clearRect(0, 0, surface.element.width, surface.element.height);
  paint.setTransform(ratio, 0, 0, ratio, 0, 0);
  paint.fillStyle = colour;
  for (const [x, y, width, height] of rectangles) paint.fillRect(x, y, width, height);
}

function paintWebgl(surface, rectangles, colour) {
  const gl = surface.context;
  const { width, height } = surface.element;
  const ratio = surface.ratio;
  gl.viewport(0, 0, width, height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(...colour);
  for (const [x, y, segmentWidth, segmentHeight] of rectangles) {
    const left = Math.round(x * ratio);
    const top = Math.round(y * ratio);
    const right = Math.round((x + segmentWidth) * ratio);
    const bottom = Math.round((y + segmentHeight) * ratio);
    gl.scissor(left, height - bottom, Math.max(1, right - left), Math.max(1, bottom - top));
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.disable(gl.SCISSOR_TEST);
}

export default defineEffect({
  continuous: false,
  mount(ctx) {
    const host = ctx.hosts[0];
    if (host === undefined) return { at() {} };
    const webgl = ctx.render === 'live' ? ctx.canvas({ host, kind: 'webgl' }) : null;
    if (ctx.render === 'live' && webgl === null) {
      ctx.fallback();
      return { at() {} };
    }
    const surface = webgl ?? ctx.canvas({ host, kind: '2d' });
    let colour2d = ctx.tokens.read('--color-accent');
    let colourWebgl = ctx.tokens.rgba('--color-accent');
    const stopWatching = ctx.tokens.onChange(() => {
      colour2d = ctx.tokens.read('--color-accent');
      colourWebgl = ctx.tokens.rgba('--color-accent');
    });
    const contextLost = (event) => {
      event.preventDefault();
      ctx.fallback();
    };
    if (webgl !== null) surface.element.addEventListener('webglcontextlost', contextLost);
    let images = [];
    let watchedImages = new Set();
    const imageLoaded = () => ctx.rebuild('image-load');
    const rebuild = () => {
      const currentImages = new Set();
      images = ctx.hosts.flatMap((section) => {
        const image = section.querySelector('img');
        if (image === null) return [];
        currentImages.add(image);
        return [
          {
            host: section,
            rect: ctx.measure.rect(image),
            variant: ctx.attribute(section, 'focus-frame'),
          },
        ];
      });
      for (const image of watchedImages)
        if (!currentImages.has(image)) image.removeEventListener('load', imageLoaded);
      for (const image of currentImages)
        if (!watchedImages.has(image)) image.addEventListener('load', imageLoaded);
      watchedImages = currentImages;
    };
    rebuild();
    return {
      at() {
        const rectangles = images.flatMap(({ host: section, rect, variant }) => {
          const box = surface.toCanvas(rect);
          const progress = ctx.render === 'still' ? 1 : clamp(ctx.progress(section));
          return segments(box, progress, variant);
        });
        if (webgl === null) paint2d(surface, rectangles, colour2d);
        else paintWebgl(surface, rectangles, colourWebgl);
      },
      rebuild,
      unmount() {
        stopWatching();
        for (const image of watchedImages) image.removeEventListener('load', imageLoaded);
        if (webgl !== null) surface.element.removeEventListener('webglcontextlost', contextLost);
      },
    };
  },
});
