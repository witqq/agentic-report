import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

test('printing every native tab panel keeps labels and source order without changing screen selection', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const root = info.outputPath('tabs-print');
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'report.md');
  const output = path.join(root, 'page.html');
  await writeFile(
    source,
    `---
title: Print parallel views
motion: none
---

# Print parallel views

:::::section{title="Horizontal views" id="horizontal"}
::::tabs{title="Horizontal choices"}
:::tab{label="Alpha"}
Horizontal alpha payload.
:::
:::tab{label="Beta"}
Horizontal beta payload.
:::
:::tab{label="Gamma"}
Horizontal gamma payload.
:::
::::
:::::

:::::section{title="Vertical views" id="vertical"}
::::tabs{title="Vertical choices" orientation="vertical"}
:::tab{label="North"}
Vertical north payload.
:::
:::tab{label="Centre"}
Vertical centre payload.
:::
:::tab{label="South"}
Vertical south payload.
:::
::::
:::::
`,
  );
  await buildReport({ input: source, output });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pathToFileURL(output).href);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('tab', { name: 'Gamma', exact: true }).click();
  await page.getByRole('tab', { name: 'South', exact: true }).click();
  await page.evaluate(() => {
    const sentinel = document.createElement('div');
    sentinel.id = 'unrelated-hidden';
    sentinel.hidden = true;
    sentinel.textContent = 'Unrelated hidden content';
    document.querySelector('#horizontal [data-tab-panel]')?.append(sentinel);
  });
  const selected = async () => page.locator('[role="tab"][aria-selected="true"]').allTextContents();
  const panelState = async () =>
    page.locator('.semantic-tabs > [data-tab-panel]').evaluateAll((panels) =>
      panels.map((panel) => ({
        hidden: (panel as HTMLElement).hidden,
        visible:
          panel.getBoundingClientRect().width > 0 && panel.getBoundingClientRect().height > 0,
      })),
    );
  const screen = await panelState();
  expect(screen.map(({ visible }) => visible)).toEqual([false, false, true, false, false, true]);
  expect(await selected()).toEqual(['Gamma', 'South']);
  await expect(page.locator('[data-tab-print-label]:visible')).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  const printed = await panelState();
  // Catches: only the selected panel prints; a broad [hidden] override would also expose the sentinel.
  expect(printed.every(({ visible }) => visible)).toBe(true);
  expect(printed.map(({ hidden }) => hidden)).toEqual(screen.map(({ hidden }) => hidden));
  await expect(page.locator('#unrelated-hidden')).toBeHidden();
  const labels = page.locator('[data-tab-print-label]');
  expect(await labels.allTextContents()).toEqual([
    'Alpha',
    'Beta',
    'Gamma',
    'North',
    'Centre',
    'South',
  ]);
  await expect(page.locator('[data-tab-print-label]:visible')).toHaveCount(6);
  const positions = await labels.evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().top),
  );
  expect(
    positions.every((top, index) => index === 0 || top > (positions[index - 1] ?? -Infinity)),
  ).toBe(true);
  for (const payload of [
    'Horizontal alpha payload.',
    'Horizontal beta payload.',
    'Horizontal gamma payload.',
    'Vertical north payload.',
    'Vertical centre payload.',
    'Vertical south payload.',
  ])
    await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect(page.locator('.semantic-tabs > [role="tablist"]:visible')).toHaveCount(0);

  await page.emulateMedia({ media: 'screen' });
  expect(await panelState()).toEqual(screen);
  expect(await selected()).toEqual(['Gamma', 'South']);
  await expect(page.locator('[data-tab-print-label]:visible')).toHaveCount(0);
  await expect(page.locator('.semantic-tabs > [role="tablist"]:visible')).toHaveCount(2);
});
