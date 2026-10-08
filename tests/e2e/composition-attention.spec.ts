import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';
const body = `::::composition{id="attention" title="Follow the relation while its context remains readable" kind="pipeline"}
:::object{id="source" title="Input"}
A concrete input stays available.
:::
:::object{id="result" title="Output"}
The result belongs to its receiving owner.
:::
:::object{id="code" role="code" title="Illustrative operation"}
\`\`\`ts
const input = read();
const output = transform(input);
return output;
\`\`\`
:::
::cue{at="0" action="connect" target="source" to="result" value="transforms"}
::cue{at="1" action="focus" target="source" duration="1"}
::cue{at="2" action="focus" target="result" emphasis="halo" duration="1"}
::cue{at="3" action="trace" target="source" to="result" duration="1" effect="beam"}
::cue{at="4" action="focus" target="code" lines="2" emphasis="brackets" duration="1"}
::cue{at="5" action="trace" target="source" to="result" duration="1" effect="packet"}
::cue{at="6" action="focus" target="result" emphasis="underline" duration="1"}
::cue{at="7" action="focus" target="code" lines="2" emphasis="dim" duration="1"}
::cue{at="8" action="focus" target="source" emphasis="none" duration="1"}
::::`;
async function build(name: string) {
  const root = path.resolve('test-results/composition-attention', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---\ntitle: Attention\nlayout: dashboard\ntheme: midnight\nscheme: dark\nmotion: expressive\ntopbar: false\n---\n${body}`,
  );
  await buildReport({ input, output });
  return pathToFileURL(output).href;
}
test('attention adds emphasis without darkening context, moves along the relation and clears on seek', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(await build(info.project.name));
  await page.evaluate(() => document.fonts.ready);
  const seek = (time: number) => page.evaluate((t) => window.__clock?.seek(t), time);
  const opacity = () =>
    page
      .locator('[data-composition-object]')
      .evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity));
  await seek(2.5);
  expect(await opacity()).toEqual(['1', '1', '1']);
  const amount = await page
    .locator('[data-composition-object="result"]')
    .evaluate((n) => Number((n as HTMLElement).style.getPropertyValue('--composition-focus')));
  expect(amount).toBeCloseTo(0.5);
  await seek(3.5);
  await expect(page.locator('.composition-trace')).toHaveCount(1);
  await expect(page.locator('.composition-trace-dot')).toHaveCount(1);
  await seek(4.5);
  await expect(page.locator('.composition-trace')).toHaveCount(0);
  await expect(page.locator('[data-composition-object="code"]')).toHaveAttribute(
    'data-composition-emphasis',
    'brackets',
  );
  expect(
    await page.locator('pre .line').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity)),
  ).toEqual(['1', '1', '1']);
  await seek(5.5);
  await expect(page.locator('.composition-trace-dot')).toHaveCount(3);
  await seek(6.5);
  await expect(page.locator('[data-composition-object="result"]')).toHaveAttribute(
    'data-composition-emphasis',
    'underline',
  );
  await seek(7.8);
  expect(await opacity()).toEqual(['0.55', '0.55', '1']);
  await seek(9);
  expect(await opacity()).toEqual(['1', '1', '1']);
  await expect(page.locator('[data-composition-focus]')).toHaveCount(0);
  await seek(3.5);
  await expect(page.locator('.composition-trace-dot')).toHaveCount(1);
  expect(await opacity()).toEqual(['1', '1', '1']);
  await page.screenshot({
    path: path.resolve('test-results/composition-attention', info.project.name, 'beam.png'),
  });
});
test('reduced motion preserves readable context and omits travelling attention', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await build(`${info.project.name}-still`));
  await expect(page.locator('.composition-trace-dot')).toHaveCount(0);
  expect(
    await page
      .locator('[data-composition-object]')
      .evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity)),
  ).toEqual(['1', '1', '1']);
});
