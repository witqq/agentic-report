import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';
const source = `---
title: Directed example
layout: dashboard
motion: expressive
topbar: false
---

:::::section{title="An ordinary chapter"}
::::composition{id="edit" title="A value changes owner" kind="ownership"}
:::object{id="source" title="Layout" role="source"}
Glow + shadow
:::
:::object{id="result" title="Shape" role="result"}
Inherited
:::
::cue{at="1" action="reveal" target="source"}
::cue{at="2" action="connect" target="source" to="result" value="inherits"}
::cue{at="3" action="copy" target="source" to="result"}
::cue{at="5" action="replace" target="result" value="Glow + new shadow"}
::cue{at="6" action="camera" target="result"}
::::
:::::
`;
async function build(name: string) {
  const root = path.resolve('test-results/composition', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(input, source);
  await buildReport({ input, output });
  return pathToFileURL(output).href;
}
test('composition moves content, restores earlier frames and stays contained', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(await build(info.project.name));
  await page.evaluate(() => document.fonts.ready);
  const seek = async (t: number) => page.evaluate((t) => window.__clock?.seek(t), t);
  const result = page.locator('[data-composition-object="result"] [data-composition-content]');
  await seek(4);
  await expect(result).toContainText('Glow + shadow');
  await seek(5.8);
  await expect(result).toHaveText('Glow + new shadow');
  await seek(0);
  await expect(result).toContainText('Inherited');
  expect(
    await page
      .locator('[data-composition-object="source"]')
      .evaluate((n) => getComputedStyle(n).opacity),
  ).toBe('0');
  await seek(3.3);
  await expect(page.locator('.composition-travel')).toHaveCount(1);
  await seek(7);
  await page.screenshot({
    path: path.resolve('test-results/composition', info.project.name, 'final.png'),
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const boxes = await page.locator('[data-composition-object]').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  }
});
test('reduced motion and print expose final values without moving overlays', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await build(`${info.project.name}-still`));
  await expect(
    page.locator('[data-composition-object="result"] [data-composition-content]'),
  ).toHaveText('Glow + new shadow');
  await expect(page.locator('.composition-travel')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  expect(
    await page.locator('.composition-stage').evaluate((n) => getComputedStyle(n).transform),
  ).toBe('none');
});

test('all five layouts keep named objects readable and connectors outside their content', async ({
  page,
}, info) => {
  const kinds = ['diagram-code', 'pipeline', 'before-after', 'overview-detail', 'ownership'];
  const root = path.resolve('test-results/composition', `${info.project.name}-layouts`);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  const sources = kinds
    .map(
      (kind, i) => `::::composition{id="stage-${i}" title="${kind}" kind="${kind}"}
:::object{id="a" title="Source" role="source"}
A concrete value
:::
:::object{id="b" title="Result" role="result"}
The resulting value
:::
:::object{id="c" title="Detail" role="${kind === 'diagram-code' ? 'code' : 'detail'}"}
A stable explanation
:::
::cue{at="0" action="connect" target="a" to="b"}
::cue{at="0" action="connect" target="a" to="c"}
::::
`,
    )
    .join('\n');
  await writeFile(
    input,
    `---
title: Layout examples
motion: expressive
layout: dashboard
---
${sources}`,
  );
  await buildReport({ input, output });
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(pathToFileURL(output).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__clock?.seek(1));
  for (const kind of kinds) {
    const scene = page.locator(`[data-composition="${kind}"]`);
    await scene.scrollIntoViewIfNeeded();
    const boxes = await scene.locator('[data-composition-object]').evaluateAll((ns) =>
      ns.map((n) => ({
        width: n.getBoundingClientRect().width,
        left: n.getBoundingClientRect().left,
        right: n.getBoundingClientRect().right,
      })),
    );
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(100);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    }
    const overlaps = await scene.evaluate((s) => {
      const svg = s.querySelector<SVGSVGElement>('.composition-connections');
      if (svg === null) throw new Error('Connection overlay is absent.');
      const base = svg.getBoundingClientRect();
      const boxes = [...s.querySelectorAll('[data-composition-object]')].map((n) =>
        n.getBoundingClientRect(),
      );
      return [...svg.querySelectorAll('path')]
        .flatMap((path) =>
          Array.from({ length: 19 }, (_, i) =>
            path.getPointAtLength((path.getTotalLength() * (i + 1)) / 20),
          ),
        )
        .filter((p) =>
          boxes.some(
            (b) =>
              p.x + base.left > b.left + 1 &&
              p.x + base.left < b.right - 1 &&
              p.y + base.top > b.top + 1 &&
              p.y + base.top < b.bottom - 1,
          ),
        ).length;
    });
    expect(overlaps).toBe(0);
    await expect(scene.locator('.composition-connections polygon')).toHaveCount(2);
  }
});

// A copy must own its diagram's accessibility and local links.
test('copied diagrams retain local SVG references in static and seeked frames', async ({
  page,
}, info) => {
  const root = path.resolve('test-results/composition', `${info.project.name}-svg`);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---
title: Copied diagram
motion: expressive
---
:::::composition{id="svg-copy" kind="before-after"}
::::object{id="source" title="Source" role="source"}
:::diagram{title="Input to result" description="Input passes through the process to a result." direction="right"}
::node{id="input" label="Input"}
::node{id="output" label="Result"}
::edge{from="input" to="output" label="process"}
:::
::::
::::object{id="result" title="Copy" role="result"}
Waiting
::::
::cue{at="1" action="copy" target="source" to="result"}
:::::
`,
  );
  await buildReport({ input, output });
  const inspect = () =>
    page.evaluate(() => {
      const bodies = [...document.querySelectorAll('[data-composition-content]')];
      const ids = bodies.flatMap((n) => [...n.querySelectorAll('[id]')].map((e) => e.id));
      const links = bodies.flatMap((body) =>
        [...body.querySelectorAll('*')].flatMap((n) =>
          [...n.attributes].flatMap((a) =>
            (a.name.startsWith('aria-') &&
            ['aria-labelledby', 'aria-describedby', 'aria-controls'].includes(a.name)
              ? a.value.split(/\s+/u)
              : [...a.value.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1])
            ).map((id) => ({
              id,
              found: [...body.querySelectorAll('[id]')].some((e) => e.id === id),
            })),
          ),
        ),
      );
      return {
        unique: ids.length === new Set(ids).size,
        links,
        diagrams: bodies.map((n) => n.querySelectorAll('svg').length),
      };
    });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(output).href);
  let state = await inspect();
  expect(state.unique).toBe(true);
  expect(state.links.length).toBeGreaterThan(0);
  expect(state.links.every((l) => l.found)).toBe(true);
  expect(state.diagrams.every((n) => n > 0)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.reload();
  await page.evaluate(() => window.__clock?.seek(2));
  state = await inspect();
  expect(state.unique).toBe(true);
  expect(state.links.every((l) => l.found)).toBe(true);
  expect(state.diagrams.every((n) => n > 0)).toBe(true);
  await page.evaluate(() => window.__clock?.seek(0));
  await expect(
    page.locator('[data-composition-object="result"] [data-composition-content]'),
  ).toHaveText('Waiting');
});

async function customBuild(name: string, body: string) {
  const root = path.resolve('test-results/composition', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---\ntitle: Regression scene\nlayout: dashboard\nmotion: expressive\ntopbar: false\n---\n${body}`,
  );
  await buildReport({ input, output });
  return pathToFileURL(output).href;
}

// Empty lines used to dim every line, and stale selection could survive seeking.
test('code focus preserves context by default and dims lines only when explicitly requested', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(
    await customBuild(
      `${info.project.name}-code-focus`,
      `::::composition{id="focus"}
:::object{id="code" role="code"}
\`\`\`ts
const before = 1;
const after = 2;
const result = before + after;
\`\`\`
:::
:::object{id="result" role="result"}
The result
:::
::cue{at="1" action="focus" target="code"}
::cue{at="2" action="focus" target="code" lines="2"}
::cue{at="3" action="focus" target="result"}
::cue{at="4" action="focus" target="code" lines="2" emphasis="dim"}
::cue{at="5" action="focus" target="result" emphasis="none"}
::::`,
    ),
  );
  const opacity = () =>
    page.locator('pre .line').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity));
  for (const [time, values] of [
    [0, ['1', '1', '1']],
    [1.8, ['1', '1', '1']],
    [2.8, ['1', '1', '1']],
    [3.8, ['1', '1', '1']],
    [4.8, ['0.35', '1', '0.35']],
    [5.8, ['1', '1', '1']],
    [1.8, ['1', '1', '1']],
    [2.8, ['1', '1', '1']],
  ] as const) {
    await page.evaluate((t) => window.__clock?.seek(t), time);
    expect(await opacity()).toEqual([...values]);
  }
});

// A full-width code row distinguishes readable code from a tall narrow cell.
test('pipeline and before-after give code a complete row below the objects', async ({
  page,
}, info) => {
  const body = ['pipeline', 'before-after', 'ownership']
    .map(
      (kind, i) => `::::composition{id="long-${i}" kind="${kind}"}
:::object{id="source" role="source"}
Source
:::
:::object{id="a" role="result"}
First result
:::
:::object{id="b" role="result"}
Second result
:::
:::object{id="code" role="code"}
\`\`\`ts
const resolvedValue = resolveInheritedResource(localObject, layoutResources, requestedProperty);
\`\`\`
:::
::::`,
    )
    .join('\n');
  await page.goto(await customBuild(`${info.project.name}-long-code`, body));
  await page.evaluate(() => document.fonts.ready);
  for (const scene of await page.locator('[data-composition]').all()) {
    const widths = await scene.evaluate((s) => {
      const code = s.querySelector<HTMLElement>('[data-role="code"]');
      const stage = s.querySelector<HTMLElement>('.composition-stage');
      const others = [...s.querySelectorAll('[data-composition-object]:not([data-role="code"])')];
      if (code === null || stage === null) throw new Error('Code or stage is absent.');
      const c = code.getBoundingClientRect();
      return {
        code: c.width,
        track: stage.clientWidth - 40,
        below: others.every((n) => n.getBoundingClientRect().bottom <= c.top),
        overflow: code.scrollWidth > code.clientWidth,
      };
    });
    expect(widths.code).toBeGreaterThan(widths.track * 0.95);
    expect(widths.below).toBe(true);
    expect(widths.overflow).toBe(false);
  }
  await page.locator('[data-composition="before-after"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.resolve('test-results/composition', `${info.project.name}-long-code`, 'layout.png'),
  });
});

// Filming transforms used to multiply connector and travel geometry twice.
test('connections and travelling objects align in fitted stages with camera focus', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(
    await customBuild(
      `${info.project.name}-fitted`,
      ['copy', 'transfer']
        .map(
          (action, i) => `::::composition{id="fit-${i}" kind="ownership"}
:::object{id="source" role="source"}
A portable resource
:::
:::object{id="result" role="result"}
Waiting
:::
::cue{at="0" action="connect" target="source" to="result"}
::cue{at="2" action="${action}" target="source" to="result" duration="1"}
::cue{at="2" action="camera" target="result" duration="1"}
::::`,
        )
        .join('\n'),
    ),
  );
  await page.evaluate(() => {
    for (const s of document.querySelectorAll<HTMLElement>('[data-composition]')) {
      s.style.transform = 'scale(0.57, 0.63)';
      s.style.transformOrigin = 'top left';
    }
    window.__clock?.seek(2.5);
  });
  for (const scene of await page.locator('[data-composition]').all()) {
    const geometry = await scene.evaluate((s) => {
      const stage = s.querySelector<HTMLElement>('.composition-stage');
      const source = s.querySelector<HTMLElement>('[data-composition-object="source"]');
      const result = s.querySelector<HTMLElement>('[data-composition-object="result"]');
      const path = s.querySelector<SVGPathElement>('.composition-connections path');
      const traveller = s.querySelector<HTMLElement>('.composition-travel');
      if (
        stage === null ||
        source === null ||
        result === null ||
        path === null ||
        traveller === null
      )
        throw new Error('The fitted scene is incomplete.');
      const a = source.getBoundingClientRect(),
        b = result.getBoundingClientRect();
      const matrix = path.getScreenCTM();
      if (matrix === null) throw new Error('The connector has no screen matrix.');
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      const horizontal = b.left >= a.right || a.left >= b.right;
      const travel = traveller.getBoundingClientRect();
      const trajectory = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const stageBox = stage.getBoundingClientRect();
      const sx = stageBox.width / stage.offsetWidth,
        sy = stageBox.height / stage.offsetHeight;
      const ax = (a.left + a.width / 2 - stageBox.left) / sx;
      const ay = (a.top + a.height / 2 - stageBox.top) / sy;
      const bx = (b.left + b.width / 2 - stageBox.left) / sx;
      const by = (b.top + b.height / 2 - stageBox.top) / sy;
      const route = path.getAttribute('d');
      if (route === null) throw new Error('The connector has no route.');
      trajectory.setAttribute('d', `${route.replace(/^M/, `M${ax},${ay} L`)} L${bx},${by}`);
      const midpoint = trajectory
        .getPointAtLength(trajectory.getTotalLength() / 2)
        .matrixTransform(matrix);
      return {
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        ax: horizontal ? a.right : a.left + a.width / 2,
        ay: horizontal ? a.top + a.height / 2 : a.bottom,
        bx: horizontal ? b.left : b.left + b.width / 2,
        by: horizontal ? b.top + b.height / 2 : b.top,
        travelX: travel.left,
        travelY: travel.top,
        travelW: travel.width,
        expectedX: midpoint.x - travel.width / 2,
        expectedY: midpoint.y - travel.height / 2,
        expectedW: Math.min(280 * sx, a.width, b.width),
      };
    });
    for (const [actual, expected] of [
      [geometry.startX, geometry.ax],
      [geometry.startY, geometry.ay],
      [geometry.endX, geometry.bx],
      [geometry.endY, geometry.by],
      [geometry.travelX, geometry.expectedX],
      [geometry.travelY, geometry.expectedY],
      [geometry.travelW, geometry.expectedW],
    ] as const) {
      expect(Math.abs(actual - expected)).toBeLessThan(1.5);
    }
  }
});

test('connector labels stay inside the stage and clear of cards and other labels', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(
    await customBuild(
      `${info.project.name}-labels`,
      `::::composition{id="labels" title="The place where state changes" kind="pipeline"}
:::object{id="a" title="Input" role="source"}
A concrete input with enough content to make the card tall.
:::
:::object{id="b" title="Transform" role="detail"}
A transformation with enough content to make the card tall.
:::
:::object{id="c" title="Output" role="result"}
A concrete output with enough content to make the card tall.
:::
:::object{id="code" role="code"}
\`\`\`ts
const output = transform(input);
\`\`\`
:::
::cue{at="0" action="connect" target="a" to="b" value="yield* update"}
::cue{at="0" action="connect" target="b" to="c" value="value wrappers"}
::::`,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__clock?.seek(1));
  const state = await page.locator('[data-composition-stage]').evaluate((stage) => {
    const bounds = stage.getBoundingClientRect();
    const texts = [...stage.querySelectorAll('.composition-connections text')];
    const labels = texts.map((n) => n.getBoundingClientRect());
    const cards = [...stage.querySelectorAll('[data-composition-object]')].map((n) =>
      n.getBoundingClientRect(),
    );
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      content: texts.map(
        (n) =>
          [...n.querySelectorAll('tspan')].map((n) => n.textContent).join(' ') || n.textContent,
      ),
      contained: labels.every(
        (r) =>
          r.left >= bounds.left &&
          r.right <= bounds.right &&
          r.top >= bounds.top &&
          r.bottom <= bounds.bottom,
      ),
      clear: labels.every((r, i) => [...cards, ...labels.slice(0, i)].every((b) => !overlap(r, b))),
    };
  });
  expect(state.content).toEqual(['yield* update', 'value wrappers']);
  expect(state.contained).toBe(true);
  expect(state.clear).toBe(true);
  await page.screenshot({
    path: path.resolve('test-results/composition', `${info.project.name}-labels`, 'labels.png'),
  });
});

for (const format of ['single-file', 'directory'] as const) {
  test(`composition originals keep PNG and SVG assets after copying and seeking (${format})`, async ({
    page,
  }, info) => {
    const root = path.resolve('test-results/composition', `${info.project.name}-images-${format}`);
    await rm(root, { recursive: true, force: true });
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await page.screenshot({
      path: path.join(root, 'assets/pixel.png'),
      clip: { x: 0, y: 0, width: 8, height: 8 },
    });
    await writeFile(
      path.join(root, 'assets/diagram.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>',
    );
    const input = path.join(root, 'report.md');
    const output = path.join(root, format === 'directory' ? 'bundle' : 'page.html');
    await writeFile(
      input,
      `---
title: Portable images
layout: dashboard
motion: expressive
---
::::composition{id="images" kind="ownership"}
:::object{id="source" role="source"}
![PNG](assets/pixel.png)

![SVG](assets/diagram.svg)
:::
:::object{id="result" role="result"}
Waiting
:::
::cue{at="1" action="copy" target="source" to="result"}
::::`,
    );
    await buildReport({ input, output, format });
    await rm(path.join(root, 'assets'), { recursive: true });
    await page.addInitScript(() => {
      window.__agenticReportClock = 'manual';
    });
    await page.goto(
      pathToFileURL(format === 'directory' ? path.join(output, 'index.html') : output).href,
    );
    const originals = await page.evaluate(() => {
      const shared = JSON.parse(
        document.getElementById('agentic-shared-images')?.textContent ?? '{}',
      ) as Record<string, string>;
      return [
        ...document.querySelectorAll<HTMLTemplateElement>('template[data-composition-original]'),
      ].flatMap((n) =>
        [...n.content.querySelectorAll('img')].map(
          (img) => img.getAttribute('src') ?? shared[img.dataset.sharedSrc ?? ''],
        ),
      );
    });
    expect(originals).toHaveLength(2);
    expect(
      originals.every((src) =>
        format === 'single-file'
          ? src?.startsWith('data:image/')
          : /^assets\/.*\.[a-f0-9]{12}\.(png|svg)$/u.test(src ?? ''),
      ),
    ).toBe(true);
    for (const time of [0, 2, 0, 2]) {
      await page.evaluate((t) => window.__clock?.seek(t), time);
      const images = page.locator('[data-composition-content] img');
      await expect(images).toHaveCount(time === 0 ? 2 : 4);
      await expect
        .poll(() =>
          images.evaluateAll((nodes) =>
            nodes.every(
              (n) => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0,
            ),
          ),
        )
        .toBe(true);
    }
  });
}
