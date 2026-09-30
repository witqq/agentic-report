import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

/**
 * A scroll-drawn diagram far below the window costs nothing while the reader is elsewhere: no SVG
 * geometry calls and no drawing flag until it approaches, then drawing resumes. The check counts calls,
 * not milliseconds, so it holds on any machine; timed budgets live in `tests/perf`.
 */
test('scrolling far from a diagram skips its SVG work and entering it resumes drawing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    pathToFileURL(path.resolve('test-results/e2e-generated/motion-showcase.html')).href,
  );
  const offscreen = await page.evaluate(async () => {
    const figure = document.querySelector<HTMLElement>('figure[data-draw="scroll"]');
    if (figure === null) throw new Error('The motion showcase has no scroll-drawn diagram.');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = figure.getBoundingClientRect();
    if (box.top <= innerHeight * 2)
      throw new Error('The diagram must start far below the viewport.');

    const calls = { drawing: 0, length: 0, point: 0, geometryMs: 0 };
    Reflect.set(globalThis, '__diagramCalls', calls);
    const toggle = figure.toggleAttribute.bind(figure);
    figure.toggleAttribute = (name, force) => {
      if (name === 'data-draw-driven') calls.drawing += 1;
      return toggle(name, force);
    };
    const length = SVGGeometryElement.prototype.getTotalLength;
    SVGGeometryElement.prototype.getTotalLength = function () {
      calls.length += 1;
      const started = performance.now();
      try {
        return length.call(this);
      } finally {
        calls.geometryMs += performance.now() - started;
      }
    };
    const point = SVGGeometryElement.prototype.getPointAtLength;
    SVGGeometryElement.prototype.getPointAtLength = function (distance) {
      calls.point += 1;
      const started = performance.now();
      try {
        return point.call(this, distance);
      } finally {
        calls.geometryMs += performance.now() - started;
      }
    };
    scrollTo({ top: 120, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...calls, scrollY };
  });
  await testInfo.attach('offscreen-diagram-work', {
    body: JSON.stringify(offscreen, null, 2),
    contentType: 'application/json',
  });
  expect(offscreen.drawing).toBe(0);
  expect(offscreen.length).toBe(0);
  expect(offscreen.point).toBe(0);

  const onscreen = await page.evaluate(async () => {
    const figure = document.querySelector<HTMLElement>('figure[data-draw="scroll"]');
    if (figure === null) throw new Error('The diagram disappeared.');
    const calls = Reflect.get(globalThis, '__diagramCalls') as {
      drawing: number;
      length: number;
      point: number;
      geometryMs: number;
    };
    calls.drawing = 0;
    calls.length = 0;
    calls.point = 0;
    calls.geometryMs = 0;
    scrollTo({
      top: figure.getBoundingClientRect().top + scrollY - innerHeight / 2,
      behavior: 'instant',
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...calls };
  });
  expect(onscreen.drawing).toBeGreaterThan(0);
  expect(onscreen.length).toBeGreaterThan(0);
  expect(onscreen.point).toBeGreaterThan(0);
});
