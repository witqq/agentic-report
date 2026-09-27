import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { BUILT_IN_THEME_NAMES } from '../../src/authoring/themes.js';
import { expect, test } from './fixtures.js';

/**
 * Легенда схемы читается в каждой встроенной теме и обеих схемах: текст не мельче 12 px и
 * контрастен фону по AA, образцы линий и акцентов узлов видны на фоне не хуже 3:1, а на узком экране
 * легенда переносится по элементам и целиком остаётся в рамке — по-английски и по-русски.
 */
async function buildPage(project: string, theme: string, language: 'en' | 'ru'): Promise<string> {
  const root = path.resolve('test-results/e2e-diagram-legend', project, `${theme}-${language}`);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await cp(path.resolve('tests/fixtures/diagram-views'), path.join(root, 'source'), {
    recursive: true,
  });
  const entry = path.join(root, 'source', 'report.md');
  const source = await readFile(entry, 'utf8');
  await writeFile(entry, source.replace('language: en', `language: ${language}\ntheme: ${theme}`));
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'source'), output });
  return pathToFileURL(output).href;
}

interface LegendObservation {
  readonly item: string;
  readonly fontSize: number;
  readonly textContrast: number;
  readonly sampleContrast: number;
  readonly clipped: boolean;
}

function observeLegends(): LegendObservation[] {
  const parse = (value: string): [number, number, number, number] => {
    const channels = value.match(/[\d.]+/gu)?.map(Number);
    if (channels === undefined || channels.length < 3) throw new Error(`Unparsed ${value}`);
    const scale = value.startsWith('color(srgb') ? 255 : 1;
    return [
      (channels[0] ?? 0) * scale,
      (channels[1] ?? 0) * scale,
      (channels[2] ?? 0) * scale,
      channels[3] ?? 1,
    ];
  };
  const over = (top: string, bottom: [number, number, number, number]) => {
    const [r, g, b, a] = parse(top);
    return [
      r * a + bottom[0] * (1 - a),
      g * a + bottom[1] * (1 - a),
      b * a + bottom[2] * (1 - a),
      1,
    ] as [number, number, number, number];
  };
  const luminance = (color: readonly number[]): number => {
    const channels = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
  };
  const ratio = (first: readonly number[], second: readonly number[]): number => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const background = (element: Element): [number, number, number, number] => {
    const layers: string[] = [];
    let current: Element | null = element;
    while (current !== null) {
      const value = getComputedStyle(current).backgroundColor;
      layers.push(value);
      if (parse(value)[3] > 0.98) break;
      current = current.parentElement;
    }
    let result = parse(layers.pop() ?? getComputedStyle(document.body).backgroundColor);
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };
  const observations: LegendObservation[] = [];
  for (const item of document.querySelectorAll<HTMLElement>('.visualization-legend li')) {
    if (item.closest('[hidden]') !== null) continue;
    const style = getComputedStyle(item);
    const ground = background(item);
    const text = over(style.color, ground);
    const mark = item.querySelector<SVGGraphicsElement>(
      '.visualization-edge, .visualization-node, .visualization-legend-swatch',
    );
    let sampleContrast = 0;
    if (mark !== null) {
      const markStyle = getComputedStyle(mark);
      const paint = mark.matches('.visualization-legend-swatch')
        ? markStyle.backgroundColor
        : markStyle.stroke;
      sampleContrast = ratio(over(paint, ground), ground);
    }
    const frame = item.closest('.semantic-diagram')?.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    observations.push({
      item: item.textContent?.trim() ?? '',
      fontSize: Number.parseFloat(style.fontSize),
      textContrast: ratio(text, ground),
      sampleContrast,
      clipped:
        frame === undefined ||
        box.left < frame.left - 0.5 ||
        box.right > frame.right + 0.5 ||
        box.right > document.documentElement.clientWidth + 0.5,
    });
  }
  return observations;
}

for (const theme of BUILT_IN_THEME_NAMES) {
  test(`${theme} diagram legends read in both schemes`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(await buildPage(testInfo.project.name, theme, 'en'));
    for (const scheme of ['light', 'dark'] as const) {
      await page.locator('html').evaluate((element, value) => {
        element.dataset.scheme = value;
      }, scheme);
      const legends = await page.evaluate(observeLegends);
      expect(legends.length, `${theme}/${scheme}`).toBeGreaterThan(8);
      for (const legend of legends) {
        const name = `${theme}/${scheme}: ${legend.item}`;
        expect(legend.fontSize, name).toBeGreaterThanOrEqual(12);
        expect(legend.textContrast, name).toBeGreaterThanOrEqual(4.5);
        expect(legend.sampleContrast, name).toBeGreaterThanOrEqual(3);
      }
    }
  });
}

for (const language of ['en', 'ru'] as const) {
  test(`${language} diagram legends wrap whole at 400px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width: 400, height: 1000 });
    await page.goto(await buildPage(testInfo.project.name, 'calm-paper', language));
    const legends = await page.evaluate(observeLegends);
    expect(legends.length).toBeGreaterThan(8);
    expect(legends.filter((legend) => legend.clipped).map((legend) => legend.item)).toEqual([]);
  });
}
