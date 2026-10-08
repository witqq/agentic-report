import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';
const code = 'const before = original;\nconst after = patch(before);\nreturn after;';
const body = `::::composition{id="annotated" title="Read the method, then trace its result" kind="diagram-code"}
:::object{id="result" title="Local value"}
The receiving value keeps its identity.
:::
:::object{id="code" role="code" notes="beside" lineStart="41" title="Illustrative operation"}
\`\`\`ts
${code}
\`\`\`
:::
::cue{at="b2" until="b2.end" action="annotate" target="code" lines="2" to="result" value="The operation creates the local value."}
::cue{at="b2" action="focus" target="code" lines="2" emphasis="brackets"}
::cue{at="b3" until="b3.end" action="annotate" target="code" lines="3" value="The caller receives the completed result."}
::cue{at="b3" action="connect" target="code" to="result" relation="data" value="return value"}
::cue{at="b3" action="trace" target="code" to="result" effect="beam" duration="1"}
::cue{at="b3+1" action="focus" target="result" emphasis="halo"}
::::`;
async function build(name: string) {
  const root = path.resolve('test-results/composition-annotations', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---\ntitle: Code explanation\nlayout: dashboard\ntheme: midnight\nscheme: dark\nmotion: expressive\ntopbar: false\n---\n${body}`,
  );
  await buildReport({ input, output });
  return pathToFileURL(output).href;
}
test('annotations follow the actual spoken boundary, retain code bytes and link the diagram', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(await build(info.project.name));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    window.__reportComposition?.bind(
      (a) => ({ b2: 7, 'b2.end': 14, b3: 15, 'b3.end': 22, 'b3+1': 16 })[a] ?? Number(a),
      'annotated',
    ),
  );
  const rail = page.locator('[data-composition-annotations]');
  const seek = (time: number) => page.evaluate((t) => window.__clock?.seek(t), time);
  expect(await page.evaluate(() => window.__reportComposition?.anchors())).toContain('b2.end');
  await seek(6);
  await expect(rail).toHaveText('');
  await seek(8);
  await expect(rail).toContainText('L42');
  await expect(rail).toContainText('creates the local value');
  const peer = rail.locator('a');
  expect(await peer.getAttribute('href')).toBe('#composition-annotated-result');
  await seek(14);
  await expect(rail).toHaveText('');
  await seek(17);
  await expect(rail).toContainText('L43');
  await expect(rail).toContainText('caller receives');
  expect(await page.locator('pre code').textContent()).toBe(code);
  await expect(page.locator('[data-composition-focus]')).toHaveCount(1);
  const selected = await page
    .locator('[data-composition-focus]')
    .getAttribute('data-composition-object');
  expect(selected).toBe('result');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedCode: string }).copiedCode = text;
        },
      },
    });
  });
  await page.locator('[data-copy-code]').click();
  expect(await page.evaluate(() => (window as unknown as { copiedCode: string }).copiedCode)).toBe(
    code,
  );
  await seek(23);
  await expect(rail).toHaveText('');
  await seek(8);
  await expect(rail).toContainText('creates the local value');
  expect(await page.locator('pre code').textContent()).toBe(code);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: path.resolve('test-results/composition-annotations', info.project.name, 'code-note.png'),
  });
});
test('static and print keep both explanations with the unchanged code', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await build(`${info.project.name}-still`));
  const rail = page.locator('[data-composition-annotations]');
  await expect(rail).toContainText('creates the local value');
  await expect(rail).toContainText('caller receives');
  expect(await page.locator('pre code').textContent()).toBe(code);
  await page.emulateMedia({ media: 'print' });
  await expect(rail).toContainText('L43');
});
