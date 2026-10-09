import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';
const body = `::::::composition{id="stable" title="An operation changes data, not responsibilities" layout="column"}
:::::scene-group{id="owners" title="Independent owners" layout="row"}
::::object{id="source" title="Original owner"}
Keeps the shared original.
:::slot{id="payload" title="Concrete value"}
Glow
:::
::::
::::object{id="local" title="Local owner"}
Stores an independent edited value.
:::slot{id="payload" title="Concrete value"}
Waiting
:::
::::
:::::
:::object{id="code" role="code" title="Actual operation"}
\`\`\`ts
const local = patch(original, delta);
\`\`\`
:::
::cue{at="1" action="copy" target="source" slot="payload" to="local" toSlot="payload" duration="1"}
::cue{at="3" action="replace" target="local" slot="payload" value="Glow with an independent shadow and a second line that must not move either owner."}
::cue{at="0" action="connect" target="source" to="local" value="copies value"}
::::::`;
async function build(name: string) {
  const root = path.resolve('test-results/composition-regions', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---\ntitle: Stable explanation\ntheme: midnight\nscheme: dark\nlayout: dashboard\nmotion: expressive\ntopbar: false\n---\n${body}`,
  );
  await buildReport({ input, output });
  return pathToFileURL(output).href;
}
test('stable owners keep their content and positions while slot values copy, change and seek', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(await build(info.project.name));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const seek = (time: number) => page.evaluate((t) => window.__clock?.seek(t), time);
  const slot = page.locator('[data-composition-slot="local:payload"] > [data-composition-content]');
  const geometry = () =>
    page.locator('[data-composition-object]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }),
    );
  await seek(0);
  const before = await geometry();
  await seek(1.5);
  await expect(page.locator('.composition-travel')).toHaveCount(1);
  await seek(2.1);
  await expect(slot).toHaveText('Glow');
  await seek(4);
  await expect(slot).toContainText('independent shadow');
  await expect(
    page.locator('[data-composition-object="local"] > [data-composition-content]'),
  ).toHaveText('Stores an independent edited value.');
  await expect(
    page.locator('[data-composition-object="source"] > [data-composition-content]'),
  ).toHaveText('Keeps the shared original.');
  const after = await geometry();
  for (let i = 0; i < before.length; i++)
    for (const key of ['left', 'top', 'width', 'height'] as const)
      expect(Math.abs((after[i]?.[key] ?? 0) - (before[i]?.[key] ?? 0))).toBeLessThan(1);
  await seek(0);
  await expect(slot).toHaveText('Waiting');
  await seek(4);
  await expect(slot).toContainText('independent shadow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: path.resolve('test-results/composition-regions', info.project.name, 'stable.png'),
  });
});
test('reduced motion retains final data in the same named group and stable owner', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await build(`${info.project.name}-still`));
  await expect(page.locator('[data-composition-slot="local:payload"]')).toContainText(
    'independent shadow',
  );
  await expect(page.locator('[data-semantic="scene-group"] [data-composition-object]')).toHaveCount(
    2,
  );
  await expect(page.locator('.composition-travel')).toHaveCount(0);
});
