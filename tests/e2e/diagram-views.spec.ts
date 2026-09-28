import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Каждый вид каждой схемы — поток сверху вниз, слева направо, прямыми углами и последовательность —
 * раскладывается без наложений: узлы и подписи не пересекаются, ребро не проходит сквозь чужой узел,
 * страница не прокручивается вбок, а переключатель видов меняет раскладку.
 */
interface Box {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface ViewGeometry {
  readonly nodes: readonly Box[];
  readonly labels: readonly Box[];
  readonly crossings: readonly string[];
  readonly signature: string;
}

async function buildPage(project: string): Promise<string> {
  const root = path.resolve('test-results/e2e-diagram-views', project);
  await rm(root, { recursive: true, force: true });
  await cp(path.resolve('tests/fixtures/diagram-views'), path.join(root, 'source'), {
    recursive: true,
  });
  const output = path.join(root, 'page.html');
  await buildReport({ input: path.join(root, 'source'), output });
  return pathToFileURL(output).href;
}

/** Геометрия видимого вида: рамки узлов и подписей и рёбра, прошедшие сквозь чужой узел. */
function geometry(diagram: Locator): Promise<ViewGeometry> {
  return diagram.evaluate((root) => {
    const svg = [...root.querySelectorAll<SVGSVGElement>('svg.visualization-diagram')].find(
      (candidate) => candidate.closest('[hidden]') === null,
    );
    if (svg === undefined) throw new Error('No visible diagram view.');
    const box = (element: Element, id: string) => {
      const rect = element.getBoundingClientRect();
      return { id, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const nodes = [...svg.querySelectorAll<SVGGElement>('[data-node-id]')].map((node) =>
      box(node.querySelector('rect') ?? node, node.dataset.nodeId ?? ''),
    );
    const labels = [...svg.querySelectorAll('.visualization-edge-label-plate')].map(
      (plate, index) => box(plate, `label-${index + 1}`),
    );
    const matrix = svg.getScreenCTM();
    const crossings: string[] = [];
    if (matrix !== null && svg.closest('[data-layout-view]') !== null) {
      for (const edge of svg.querySelectorAll<SVGPathElement>('path[data-from][data-to]')) {
        const length = edge.getTotalLength();
        for (let at = 0; at <= length; at += 4) {
          const point = edge.getPointAtLength(at).matrixTransform(matrix);
          for (const node of nodes) {
            if (node.id === edge.dataset.from || node.id === edge.dataset.to) continue;
            const inset = 3;
            if (
              point.x > node.left + inset &&
              point.x < node.right - inset &&
              point.y > node.top + inset &&
              point.y < node.bottom - inset
            ) {
              crossings.push(`${edge.dataset.from}->${edge.dataset.to} through ${node.id}`);
            }
          }
        }
      }
    }
    const signature = nodes
      .map((node) => `${node.id}:${Math.round(node.left)},${Math.round(node.top)}`)
      .join(' ');
    return { nodes, labels, crossings: [...new Set(crossings)], signature };
  });
}

function overlaps(boxes: readonly Box[]): string[] {
  const found: string[] = [];
  for (const [index, first] of boxes.entries()) {
    for (const second of boxes.slice(index + 1)) {
      if (
        first.left < second.right - 1 &&
        second.left < first.right - 1 &&
        first.top < second.bottom - 1 &&
        second.top < first.bottom - 1
      ) {
        found.push(`${first.id} × ${second.id}`);
      }
    }
  }
  return found;
}

async function expectCleanView(page: Page, diagram: Locator, name: string): Promise<string> {
  const view = await geometry(diagram);
  expect(view.nodes.length, name).toBeGreaterThan(1);
  expect(overlaps([...view.nodes, ...view.labels]), name).toEqual([]);
  expect(view.crossings, name).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, name).toBeLessThanOrEqual(0);
  return view.signature;
}

for (const width of [1440, 400]) {
  test(`every diagram view lays out cleanly at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await buildPage(`${testInfo.project.name}-${width}`));
    await page.evaluate(() => document.fonts.ready);

    for (const id of ['auto', 'down', 'right', 'ortho']) {
      const diagram = page.locator(`#${id} .semantic-diagram`);
      await diagram.scrollIntoViewIfNeeded();
      const tabs = diagram.getByRole('tab');
      await expect(tabs).toHaveCount(3);
      // Все три вида видны и на узком экране: переключатель переносит кнопки, а не прячет их.
      for (const tab of await tabs.all()) await expect(tab).toBeInViewport({ ratio: 1 });
      const signatures = new Set<string>();
      for (const tab of await tabs.all()) {
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        signatures.add(await expectCleanView(page, diagram, `${id}/${await tab.textContent()}`));
      }
      expect(signatures.size, `${id}: switching views changes the layout`).toBe(3);
    }
    await expectCleanView(page, page.locator('#seq .semantic-diagram'), 'sequence');
  });
}

test('a diagram never shrinks its smallest text below 12px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({ width: 400, height: 1000 });
  await page.goto(await buildPage(`${testInfo.project.name}-text`));
  for (const id of ['auto', 'right', 'ortho', 'seq']) {
    const sizes = await page
      .locator(`#${id} svg.visualization-diagram`)
      .evaluateAll((svgs) =>
        svgs
          .filter((svg) => svg.closest('[hidden]') === null)
          .flatMap((svg) =>
            [...svg.querySelectorAll('text')].map(
              (text) => text.getBoundingClientRect().height / text.getBBox().height,
            ),
          ),
      );
    // Отношение отрисованной высоты к собственной — масштаб схемы; подпись 13 px × масштаб ≥ 12 px.
    expect(Math.min(...sizes) * 13, id).toBeGreaterThanOrEqual(11.9);
  }
});

test('a narrow diagram opens on its sources even when they sit in different layers', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  // Случай из слепой оценки: два источника, orders.csv в первом слое и orders.yaml во втором. Рамка
  // центрировалась на первом слое и открывалась прокрученной вправо до упора, пряча второй источник.
  const root = path.resolve('test-results/e2e-diagram-views', `${testInfo.project.name}-sources`);
  await rm(root, { recursive: true, force: true });
  const source = path.join(root, 'report.md');
  await mkdir(root, { recursive: true });
  await writeFile(
    source,
    [
      '---',
      'title: Two sources',
      '---',
      '',
      '# Two sources',
      '',
      ':::diagram{title="Streaming check" description="The schema and the file both feed the checker." layout="right"}',
      '::node{id="schema" label="orders.yaml" detail="the schema, loaded once"}',
      '::node{id="csv" label="orders.csv" detail="2 GB on disk"}',
      '::node{id="reader" label="Stream reader" detail="a piece of the file at a time"}',
      '::node{id="checker" label="Row checker" detail="each value against its column rule"}',
      '::node{id="output" label="Terminal" detail="row, column, value, rule"}',
      '::edge{from="csv" to="reader" label="bytes" kind="data"}',
      '::edge{from="reader" to="checker" label="one row" kind="data"}',
      '::edge{from="schema" to="checker" label="column rules" kind="data"}',
      '::edge{from="checker" to="output" label="row 14, column price: -3.50 is below 0"}',
      ':::',
      '',
    ].join('\n'),
  );
  const output = path.join(root, 'page.html');
  await buildReport({ input: root, output });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pathToFileURL(output).href);
  const frame = page.locator('[data-tab-panel]:not([hidden]) .visualization-frame').first();
  await expect.poll(() => frame.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  // Узел-источник, стоящий левее, виден целиком: рамка не открывается прокрученной мимо него.
  const leftmostSource = await frame.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const entered = new Set(
      [...node.querySelectorAll<SVGElement>('[data-to]')].map((edge) => edge.dataset.to),
    );
    const sources = [...node.querySelectorAll<SVGGElement>('[data-node-id]')]
      .filter((item) => !entered.has(item.dataset.nodeId))
      .map((item) => item.getBoundingClientRect())
      .sort((left, right) => left.left - right.left);
    const first = sources[0];
    return first === undefined
      ? undefined
      : { left: first.left - box.left, right: box.right - first.right };
  });
  expect(leftmostSource).toBeDefined();
  expect(leftmostSource?.left).toBeGreaterThanOrEqual(0);
  expect(leftmostSource?.right).toBeGreaterThanOrEqual(0);
});
