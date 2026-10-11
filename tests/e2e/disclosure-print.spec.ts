import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

test('native print expands closed disclosure content and restores the reader state', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const root = info.outputPath('disclosure-print');
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'report.md'),
    output = path.join(root, 'page.html');
  await writeFile(
    source,
    `---
title: Printing evidence
motion: none
---

# Printing evidence

:::::disclosure{title="Closed evidence"}
Closed evidence payload.

:::disclosure{title="Nested evidence"}
Nested evidence payload.
:::
:::::

:::disclosure{title="Reader choice"}
Reader choice payload.
:::
`,
  );
  await buildReport({ input: source, output });
  await page.goto(pathToFileURL(output).href);
  await page.getByText('Reader choice', { exact: true }).click();
  await page.evaluate(() => {
    const hidden = document.createElement('p');
    hidden.id = 'hidden-sentinel';
    hidden.hidden = true;
    hidden.textContent = 'Unrelated hidden payload';
    document.querySelector('details[data-disclosure]')?.append(hidden);
    const other = document.createElement('details');
    other.id = 'unowned-details';
    other.innerHTML = '<summary>Unowned details</summary><p>Unowned payload</p>';
    document.body.append(other);
  });
  const states = () =>
    page
      .locator('details[data-disclosure]')
      .evaluateAll((items) => items.map((item) => (item as HTMLDetailsElement).open));
  expect(await states()).toEqual([false, false, true]);
  const visible = (text: string) =>
    page.getByText(text, { exact: true }).evaluate((element) => element.checkVisibility());
  expect(await visible('Closed evidence payload.')).toBe(false);
  expect(await visible('Nested evidence payload.')).toBe(false);

  await page.emulateMedia({ media: 'print' });
  await expect.poll(states).toEqual([true, true, true]);
  // A closed details body can retain positive boxes. Actual content visibility catches that counterexample.
  for (const payload of [
    'Closed evidence payload.',
    'Nested evidence payload.',
    'Reader choice payload.',
  ])
    expect(await visible(payload)).toBe(true);
  await expect(page.locator('#hidden-sentinel')).toBeHidden();
  expect(
    await page
      .locator('#unowned-details')
      .evaluate((element) => (element as HTMLDetailsElement).open),
  ).toBe(false);
  await page.emulateMedia({ media: 'screen' });
  await expect.poll(states).toEqual([false, false, true]);
  expect(await visible('Closed evidence payload.')).toBe(false);
  expect(await visible('Nested evidence payload.')).toBe(false);
  expect(await visible('Reader choice payload.')).toBe(true);

  // Native print events precede/follow the media transition; repeated callbacks must not overwrite the saved state.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect.poll(states).toEqual([true, true, true]);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect.poll(states).toEqual([false, false, true]);
});
