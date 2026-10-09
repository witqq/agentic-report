import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { buildReport } from '../../dist/node/index.js';
import type { ReviewArtifact } from '../../src/review/contract.js';
import { expect, test } from './fixtures.js';

async function open(page: Page, name: string): Promise<void> {
  const root = path.resolve('test-results/composition-review', name);
  await mkdir(root, { recursive: true });
  const input = path.join(root, 'report.md');
  const output = path.join(root, 'page.html');
  await writeFile(
    input,
    `---
title: Review changing regions
language: en
review: true
motion: expressive
---
# Review changing regions

An ordinary paragraph before the scene.

::::composition{id="review-scene"}
:::object{id="source" title="Source region"}
Original source value.
:::
:::object{id="result" title="Receiving region"}
Inherited value.
:::
::cue{at="1" action="replace" target="result" value="Changed value"}
::cue{at="3" action="copy" target="source" to="result"}
::::

An ordinary paragraph after the scene.
`,
  );
  await buildReport({ input, output });
  await page.addInitScript(() => {
    window.__agenticReportClock = 'manual';
  });
  await page.goto(pathToFileURL(output).href);
  await expect(page.locator('[data-review-toggle]')).toBeEnabled();
}

async function exportReview(page: Page): Promise<Buffer> {
  if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
    await page.locator('[data-review-toggle]').click();
  const download = page.waitForEvent('download');
  await page.locator('[data-review-export]').click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// A syntactically valid current-frame quote is not a portable source anchor. This creates notes
// through real selection, then imports them on different frames of the same unchanged revision.
test('selected changed and copied values export stable region discussions across backward seeking', async ({
  page,
}, info) => {
  await open(page, `${info.project.name}-dynamic`);
  const result = page.locator('[data-composition-object="result"]');
  for (const [time, text, message] of [
    [2, 'Changed value', 'Check this changed value.'],
    [4, 'Original source value.', 'Check the copied value too.'],
  ] as const) {
    await page.evaluate((time) => window.__clock?.seek(time), time);
    const passage = result.locator('[data-composition-content] p');
    await expect(passage).toHaveText(text);
    await passage.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          document.addEventListener('selectionchange', () => resolve(), { once: true });
          const range = document.createRange();
          range.selectNodeContents(element);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }),
    );
    const action = page.locator('[data-review-selection-action]');
    await expect(action).toBeVisible();
    await expect(action).toHaveText('Open discussion for Receiving region');
    await action.click();
    await expect(page.locator('[data-review-editor-title]')).toHaveText(
      'Discussion for selected block',
    );
    await page.locator('[data-review-message]').fill(message);
    await page.locator('[data-review-add-message]').click();
    await page.locator('[data-review-popover-close]').click();
  }
  const bytes = await exportReview(page);
  const artifact = JSON.parse(bytes.toString('utf8')) as ReviewArtifact;
  expect(artifact.threads).toHaveLength(1);
  const segment = artifact.threads[0]?.segments[0];
  // The bounded scoped identity is SHA256 of the canonical ["review-scene", "result"] tuple.
  expect(segment?.target.stableKey).toBe(
    'directive:object:scoped-e16671fee49621af30b88f99305a6b37c2f5020448b4ae494b332cbe30a9cd2c',
  );
  expect(segment?.selection).toBeUndefined();
  expect(segment?.messages.map((message) => message.message)).toEqual([
    'Check this changed value.',
    'Check the copied value too.',
  ]);
  for (const time of [0, 2, 4, 0]) {
    await page.evaluate((time) => window.__clock?.seek(time), time);
    await page.locator('[data-review-import]').setInputFiles({
      name: 'region-discussion.json',
      mimeType: 'application/json',
      buffer: bytes,
    });
    await expect(page.locator('[data-review-error]')).toBeHidden();
    await page.locator('[data-review-thread-open]').click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText('copied value too');
    await expect(page.locator('[data-review-editor-title]')).toHaveText(
      'Discussion for selected block',
    );
    await page.locator('[data-review-popover-close]').click();
    if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
      await page.locator('[data-review-toggle]').click();
  }
});

// Crossing a changing region cannot be described by one static quote, while ordinary prose keeps
// the existing precise selection contract and must not silently degrade to a whole-block note.
test('cross-region selections make no false anchor while ordinary prose retains exact selection', async ({
  page,
}, info) => {
  await open(page, `${info.project.name}-crossing`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        document.addEventListener('selectionchange', () => resolve(), { once: true });
        window.__clock?.seek(2);
        const start = document.querySelector(
          '[data-composition-object="result"] [data-composition-content] p',
        )?.firstChild;
        const end = [...document.querySelectorAll('.report-content article > p')].at(
          -1,
        )?.firstChild;
        if (!start || !end) throw new Error('Cross-region endpoints are absent.');
        const range = document.createRange();
        range.setStart(start, 0);
        range.setEnd(end, end.textContent?.length ?? 0);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }),
  );
  await expect(page.locator('[data-review-selection-action]')).toBeHidden();
  const paragraph = page.locator('.report-content article > p').first();
  await paragraph.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        document.addEventListener('selectionchange', () => resolve(), { once: true });
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }),
  );
  await page.locator('[data-review-selection-action]').click();
  await page.locator('[data-review-message]').fill('Ordinary precise note.');
  await page.locator('[data-review-add-message]').click();
  await page.locator('[data-review-popover-close]').click();
  const artifact = JSON.parse((await exportReview(page)).toString('utf8')) as ReviewArtifact;
  const segment = artifact.threads[0]?.segments[0];
  expect(segment?.selection?.quote).toBe('An ordinary paragraph before the scene.');
  expect(segment?.selection?.start.target.kind).toBe('markdown:paragraph');
  expect(segment?.selection?.end.offset).toBeGreaterThan(segment?.selection?.start.offset ?? -1);
});
