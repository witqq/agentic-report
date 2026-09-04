import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const root = path.resolve('test-results/e2e-generated');
const captures = path.resolve('test-results/captures/review-threads');
const formats = [
  { name: 'single-file', url: pathToFileURL(path.join(root, 'review.html')).href },
  { name: 'directory', url: pathToFileURL(path.join(root, 'review-directory/index.html')).href },
] as const;

test('annotations stay available without review mode and the list never moves the report', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const before = await page.locator('.report-shell').boundingBox();
  expect(before).not.toBeNull();
  await expect(page.locator('[data-review-target-control]')).toHaveCount(0);
  await expect(page.locator('[data-review-exit]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-review-active');

  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await expect(page.locator('[data-review-popover]')).toBeVisible();
  await expect(page.locator('[data-review-dialog]')).not.toBeVisible();

  await page.locator('[data-review-popover-close]').click();
  await page.locator('[data-review-toggle]').click();
  await expect(page.locator('[data-review-dialog]')).toBeVisible();
  expect(await page.locator('.report-shell').boundingBox()).toEqual(before);
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: path.join(captures, 'list-overlay-desktop.png') });
});

for (const format of formats) {
  test(`${format.name} accumulates, edits, resolves, exports and imports one fragment thread`, async ({
    page,
  }, info) => {
    await mkdir(captures, { recursive: true });
    await page.goto(format.url);
    await expect(page.locator('[data-review-page-verdict]')).toHaveCount(0);
    await expect(page.locator('[data-review-target-verdict]')).toHaveCount(0);
    await expect(page.locator('[data-review-components]')).toHaveCount(0);
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-reading.png`),
    });
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.locator('[data-review-message]').fill('Explain why this evidence is sufficient.');
    await page.getByRole('button', { name: 'Add message' }).click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText('Explain why');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
      .locator('[data-review-message]')
      .fill('Explain why this evidence supports the conclusion.');
    await page.getByRole('button', { name: 'Save message' }).click();
    await page.locator('[data-review-message]').fill('Add the supporting context as a reply.');
    await page.getByRole('button', { name: 'Add message' }).click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Add the supporting context as a reply.',
    );
    await expect(page.locator('[data-review-highlight-marker]')).toHaveCount(1);
    await expect(page.locator('[data-review-highlight-marker]')).toHaveAttribute(
      'data-review-thread-state',
      'open',
    );
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-unresolved.png`),
    });
    await page.locator('[data-review-popover-close]').click();
    const marker = page.locator('[data-review-highlight-marker]');
    await marker.focus();
    await expect(marker).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'supports the conclusion',
    );
    await page.getByRole('button', { name: 'Resolve thread', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen thread', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen thread', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resolve thread', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resolve thread', exact: true }).click();
    await expect(page.locator('[data-review-highlight-marker]')).toHaveAttribute(
      'data-review-thread-state',
      'resolved',
    );
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-resolved.png`),
    });
    const review = await downloadedReview(page);
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-list-populated.png`),
    });
    const artifact = JSON.parse(review.toString('utf8'));
    expect(artifact).toMatchObject({
      contractVersion: 3,
      threads: [
        {
          segments: [
            {
              resolved: true,
              messages: [
                { author: 'user', message: 'Explain why this evidence supports the conclusion.' },
                { author: 'user', message: 'Add the supporting context as a reply.' },
              ],
            },
          ],
        },
      ],
    });
    await page.reload();
    await page.locator('[data-review-toggle]').click();
    await page
      .locator('[data-review-import]')
      .setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: review });
    await expect(page.locator('[data-review-summary]')).toContainText('1 thread · unresolved: 0');
  });

  test(`${format.name} creates and restores a note for an exact selected substring`, async ({
    page,
  }, info) => {
    await mkdir(captures, { recursive: true });
    await page.goto(format.url);
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
    const action = page.getByRole('button', { name: 'Create note' });
    await expect(action).toBeVisible();
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-selection-tooltip.png`),
    });
    await page.keyboard.up('Shift');
    await expect(action).toBeFocused();
    await action.click();
    await expect(page.locator('[data-review-editor-title]')).toHaveText('Note for selected text');
    await expect(page.locator('[data-review-target-label]')).toHaveText('evidence');
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-selection-editor.png`),
    });
    await page.locator('[data-review-message]').fill('Clarify this exact phrase.');
    await page.getByRole('button', { name: 'Add message' }).click();

    const review = await downloadedReview(page);
    const artifact = JSON.parse(review.toString('utf8'));
    const segment = artifact.threads[0].segments[0];
    expect(artifact.contractVersion).toBe(3);
    expect(segment.selection).toMatchObject({
      start: { target: { id: segment.target.id } },
      end: { target: { id: segment.target.id } },
      quote: 'evidence',
    });
    expect(segment.selection.end.offset - segment.selection.start.offset).toBe('evidence'.length);

    await page.reload();
    await page.locator('[data-review-toggle]').click();
    await page.locator('[data-review-import]').setInputFiles({
      name: 'selection-review.json',
      mimeType: 'application/json',
      buffer: review,
    });
    await expect(page.locator('[data-review-highlight-marker]')).toHaveCount(1);
    await expect(page.locator('[data-review-highlight-marker]')).toHaveAttribute(
      'data-review-thread-state',
      'open',
    );
    expect(
      await page.evaluate(
        () =>
          (CSS as typeof CSS & { highlights: Map<string, Set<AbstractRange>> }).highlights.get(
            'agentic-review-open',
          )?.size,
      ),
    ).toBe(1);
    if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
      await page.locator('[data-review-toggle]').click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('[data-review-thread-open]').click();
    const restoredBox = await target.boundingBox();
    expect(restoredBox).not.toBeNull();
    expect((restoredBox?.y ?? 0) + (restoredBox?.height ?? 0)).toBeGreaterThan(0);
    expect(restoredBox?.y).toBeLessThan(await page.evaluate(() => innerHeight));
    await expect(page.locator('[data-review-target-label]')).toHaveText('evidence');
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Clarify this exact phrase.',
    );
  });

  test(`${format.name} rejects version 1 without losing current thread state`, async ({ page }) => {
    await page.goto(format.url);
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.locator('[data-review-message]').fill('Keep this message.');
    await page.getByRole('button', { name: 'Add message' }).click();
    await page.locator('[data-review-import]').setInputFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          contractVersion: 1,
          report: { revision: `sha256:${'a'.repeat(64)}` },
          responses: [],
        }),
      ),
    });
    await expect(page.locator('[data-review-error]')).toContainText(
      'Version 1 reviews are unsupported',
    );
    await expect(page.locator('[data-review-thread-messages]')).toContainText('Keep this message.');
  });
}

test('valid sparse message identities append without collision', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const manifest = await page
    .locator('template[data-review-manifest]')
    .evaluate((element) => JSON.parse((element as HTMLTemplateElement).content.textContent ?? ''));
  const target = manifest.targets.find(
    (candidate: { kind: string }) => candidate.kind === 'markdown:paragraph',
  );
  const otherTarget = manifest.targets.find(
    (candidate: { id: string; kind: string }) =>
      candidate.kind === 'markdown:paragraph' && candidate.id !== target.id,
  );
  if (target === undefined || otherTarget === undefined)
    throw new Error('Missing sparse-ID targets.');
  const occupied = `message-${target.id}-2`;
  await page.locator('[data-review-toggle]').click();
  await page.locator('[data-review-import]').setInputFiles({
    name: 'sparse.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        contractVersion: 2,
        report: { revision: manifest.reportRevision },
        threads: [
          {
            id: 'thread-sparse',
            segments: [
              {
                id: 'segment-sparse',
                reportRevision: manifest.reportRevision,
                target,
                resolved: false,
                messages: [{ id: occupied, author: 'agent', message: 'Existing sparse reply.' }],
              },
            ],
          },
          {
            id: `thread-${otherTarget.id}-1`,
            segments: [
              {
                id: `segment-${otherTarget.id}-1`,
                reportRevision: `sha256:${'c'.repeat(64)}`,
                target: { ...otherTarget, id: 'historical-other-target' },
                resolved: true,
                messages: [{ id: 'historical-message', author: 'agent', message: 'Preserve me.' }],
              },
            ],
          },
        ],
      }),
    ),
  });
  await page.locator('[data-review-thread-open="thread-sparse"]').click();
  await page.locator('[data-review-message]').fill('Append after sparse identity.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const before = await downloadedReview(page);
  const exported = JSON.parse(before.toString('utf8'));
  expect(exported.contractVersion).toBe(3);
  const sparseThread = exported.threads.find(
    (thread: { id: string }) => thread.id === 'thread-sparse',
  );
  expect(sparseThread.segments[0].messages.map((message: { id: string }) => message.id)).toEqual([
    occupied,
    `message-${target.id}-1`,
  ]);
  const foreign = structuredClone(exported);
  foreign.threads.find(
    (thread: { id: string }) => thread.id === 'thread-sparse',
  ).segments[0].target.id = 'foreign-target';
  await page.locator('[data-review-import]').setInputFiles({
    name: 'foreign-current.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(foreign)),
  });
  await expect(page.locator('[data-review-error]')).toContainText(
    'current target that is not part of this report revision',
  );
  expect(await downloadedReview(page)).toEqual(before);
  await page.locator('[data-review-close]').click();
  const otherOwner = page.locator(`[data-review-target="${otherTarget.id}"]`);
  await selectFirstTextRange(otherOwner, 4);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Independent current discussion.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const after = JSON.parse((await downloadedReview(page)).toString('utf8'));
  expect(after.threads.map((thread: { id: string }) => thread.id)).toEqual(
    expect.arrayContaining([`thread-${otherTarget.id}-1`, `thread-${otherTarget.id}-2`]),
  );
  expect(JSON.stringify(after)).toContain('Preserve me.');
});

test('selection note spans adjacent review targets without collapsing to the first block', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const repeated = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' });
  const first = repeated.nth(0);
  const second = repeated.nth(1);
  await selectRange(page, first, 'evidence', 0, second, 'statement', 'statement'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Connect these two passages.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const artifact = JSON.parse((await downloadedReview(page)).toString('utf8'));
  const segment = artifact.threads[0].segments[0];
  expect(segment.selection.start.target.id).not.toBe(segment.selection.end.target.id);
  expect(segment.target.id).toBe(segment.selection.start.target.id);
  expect(segment.selection.quote).toContain('evidence statement.');
  expect(segment.selection.quote).toContain('Shared evidence statement');
});

test('one selection anchor crosses inline markup and restores the exact visible quote', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, target, 'Shared ', 0, target, ' statement.', ' statement.'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('This note crosses emphasis.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const artifact = JSON.parse((await downloadedReview(page)).toString('utf8'));
  expect(artifact.threads[0].segments[0].selection.quote).toBe('Shared evidence statement.');
});

test('selecting a saved exact range offers its thread instead of creating a duplicate', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Existing exact discussion.');
  await page.getByRole('button', { name: 'Add message' }).click();
  await page.locator('[data-review-popover-close]').click();

  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  const action = page.locator('[data-review-selection-action][data-review-action-kind="thread"]');
  await expect(action).toHaveText('View thread');
  await action.click();
  await expect(page.locator('[data-review-thread-messages]')).toContainText(
    'Existing exact discussion.',
  );
});

test('a cancelled action press cannot open an earlier selection from a keyboard click', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  const action = page.locator('[data-review-selection-action]');
  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  await action.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse' });
  await action.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await selectRange(page, target, 'statement', 0, target, 'statement', 'statement'.length);
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-review-target-label]')).toHaveText('statement');
});

test('overlapping highlights choose the most specific thread from the text itself', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();

  for (const [endNeedle, endAdvance, message] of [
    ['evidence', 'evidence'.length, 'Specific phrase.'],
    [' statement.', ' statement.'.length, 'Larger overlapping phrase.'],
  ] as const) {
    await selectRange(page, target, 'evidence', 0, target, endNeedle, endAdvance);
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.locator('[data-review-message]').fill(message);
    await page.getByRole('button', { name: 'Add message' }).click();
    await page.locator('[data-review-popover-close]').click();
  }

  await expect(page.locator('[data-review-highlight-marker]')).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        (CSS as typeof CSS & { highlights: Map<string, Set<AbstractRange>> }).highlights.get(
          'agentic-review-open',
        )?.size,
    ),
  ).toBe(2);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const point = await textPoint(target, 'evidence');
  await page.mouse.move(point.x, point.y);
  const action = page.locator('[data-review-selection-action][data-review-action-kind="thread"]');
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.locator('[data-review-target-label]')).toHaveText('evidence');
  await expect(page.locator('[data-review-thread-messages]')).toContainText('Specific phrase.');
});

test('invalid selected-text anchor cannot replace current review state', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Keep the valid anchor.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const valid = await downloadedReview(page);
  const invalid = JSON.parse(valid.toString('utf8'));
  invalid.threads[0].segments[0].selection.end.offset += 1000;
  await page.locator('[data-review-import]').setInputFiles({
    name: 'invalid-selection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator('[data-review-error]')).toContainText(
    'selected-text anchor that does not match',
  );
  expect(await downloadedReview(page)).toEqual(valid);

  const reversed = JSON.parse(valid.toString('utf8'));
  const anchor = reversed.threads[0].segments[0].selection;
  [anchor.start, anchor.end] = [anchor.end, anchor.start];
  await page.locator('[data-review-import]').setInputFiles({
    name: 'reversed-selection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(reversed)),
  });
  await expect(page.locator('[data-review-error]')).toContainText('Review import failed');
  expect(await downloadedReview(page)).toEqual(valid);
});

test('one export keeps a whole-block thread and multiple selections from that block', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  await page.locator('[data-review-toggle]').click();
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  const manifest = await page
    .locator('template[data-review-manifest]')
    .evaluate((element) => JSON.parse((element as HTMLTemplateElement).content.textContent ?? ''));
  const targetId = await target.getAttribute('data-review-target');
  const targetRef = manifest.targets.find((item: { id: string }) => item.id === targetId);
  await page.locator('[data-review-import]').setInputFiles({
    name: 'legacy-whole-block.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        contractVersion: 2,
        report: { revision: manifest.reportRevision },
        threads: [
          {
            id: `thread-${targetId}-legacy`,
            segments: [
              {
                id: `segment-${targetId}-legacy`,
                reportRevision: manifest.reportRevision,
                target: targetRef,
                resolved: false,
                messages: [
                  { id: 'message-legacy', author: 'user', message: 'Whole-block context.' },
                ],
              },
            ],
          },
        ],
      }),
    ),
  });
  await expect(page.locator('[data-review-current-list]')).toContainText('Open discussion');
  await page.locator('[data-review-close]').click();

  for (const selected of [
    { needle: 'evidence', start: 0, end: 'evidence'.length, label: 'evidence' },
    { needle: ' statement', start: 0, end: ' statement'.length, label: ' statement' },
  ]) {
    await selectRange(
      page,
      target,
      selected.needle,
      selected.start,
      target,
      selected.needle,
      selected.end,
    );
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.locator('[data-review-message]').fill(`Note for ${selected.label.trim()}.`);
    await page.getByRole('button', { name: 'Add message' }).click();
    await page.locator('[data-review-popover-close]').click();
  }

  const artifact = JSON.parse((await downloadedReview(page)).toString('utf8'));
  expect(artifact.threads).toHaveLength(3);
  expect(
    artifact.threads
      .map(
        (thread: { segments: Array<{ selection?: { quote: string } }> }) =>
          thread.segments[0]?.selection?.quote ?? 'whole-block',
      )
      .sort(),
  ).toEqual([' statement', 'evidence', 'whole-block']);
});

test('a touch tap on a saved highlight exposes and opens its thread', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'));
  await page.goto(formats[0].url);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, target, 'evidence', 0, target, 'evidence', 'evidence'.length);
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.locator('[data-review-message]').fill('Touch-accessible thread.');
  await page.getByRole('button', { name: 'Add message' }).click();
  await page.locator('[data-review-popover-close]').click();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const point = await textPoint(target, 'evidence');
  await page.touchscreen.tap(point.x, point.y);
  const action = page.locator('[data-review-selection-action][data-review-action-kind="thread"]');
  await expect(action).toBeVisible();
  await action.tap();
  await expect(page.locator('[data-review-thread-messages]')).toContainText(
    'Touch-accessible thread.',
  );
});

test('Russian report localizes the selection note action', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(pathToFileURL(path.join(root, 'russian-chrome.html')).href);
  const target = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'локализует собственные элементы' });
  await selectRange(page, target, 'локализует', 0, target, 'локализует', 'локализует'.length);
  await expect(page.getByRole('button', { name: 'Создать заметку' })).toBeVisible();
});

test('invalid native selections never expose the action or create a thread', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  await page.goto(formats[0].url);
  const action = page.getByRole('button', { name: 'Create note' });

  const paragraph = page
    .locator('p[data-review-target]')
    .filter({ hasText: 'Shared evidence statement.' })
    .first();
  await selectRange(page, paragraph, 'evidence', 0, paragraph, 'evidence', 'evidence'.length);
  await expect(action).toBeVisible();
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(action).toBeHidden();

  await selectElementRange(page.locator('.topbar-title-full'), 'Review', 0, 6);
  await expect(action).toBeHidden();

  await selectRange(page, paragraph, 'Shared ', 6, paragraph, 'Shared ', 7);
  await expect(action).toBeHidden();

  await page.locator('[data-review-toggle]').click();
  await selectElementRange(
    page.getByRole('button', { name: 'Export review.json' }),
    'Export',
    0,
    6,
  );
  await expect(action).toBeHidden();
  const artifact = JSON.parse((await downloadedReview(page)).toString('utf8'));
  expect(artifact.threads).toEqual([]);
});

for (const prior of [
  { name: 'single-file', exact: 'review-prior.html', stale: 'review-stale.html' },
  {
    name: 'directory',
    exact: 'review-prior-directory/index.html',
    stale: 'review-stale-directory/index.html',
  },
] as const) {
  test(`${prior.name} exact prior review restores user and agent replies`, async ({ page }) => {
    await page.goto(pathToFileURL(path.join(root, prior.exact)).href);
    await page.locator('[data-review-toggle]').click();
    await page.locator('[data-review-thread-open]').first().click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Revisit changed evidence.',
    );
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Added supporting context.',
    );
    await page.locator('[data-review-popover-close]').click();
    await expect(page.locator('[data-review-toggle]')).toBeFocused();
  });

  test(`${prior.name} stale prior review keeps classified discussion outside current state`, async ({
    page,
  }) => {
    await page.goto(pathToFileURL(path.join(root, prior.stale)).href);
    await page.locator('[data-review-toggle]').click();
    if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
      await page.locator('[data-review-toggle]').click();
    await expect(page.locator('[data-review-prior-section]')).toContainText(
      'Prior · changed · unresolved',
    );
    await expect(page.locator('[data-review-summary]')).toContainText('1 thread · unresolved: 0');
    await page.locator('[data-review-prior-open]').click();
    await page.locator('[data-review-popover-close]').click();
    await expect(page.locator('[data-review-toggle]')).toBeFocused();
    await page.locator('[data-review-toggle]').click();
    await page.locator('[data-review-prior-open]').click();
    const changed = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Changed evidence statement.' })
      .first();
    await page.locator('[data-review-message]').fill('Please revise the changed evidence again.');
    await page.getByRole('button', { name: 'Add message' }).click();
    const continued = await downloadedReview(page);
    const artifact = JSON.parse(continued.toString('utf8'));
    expect(artifact.threads[0].segments).toHaveLength(2);
    const changedId = await changed.getAttribute('data-review-target');
    expect(artifact.threads[0].segments.map((segment: { id: string }) => segment.id)).toEqual([
      `segment-${changedId}-1`,
      `segment-${changedId}-2`,
    ]);
    expect(artifact.threads[0].segments[0]).toMatchObject({
      resolved: false,
      messages: [
        { author: 'user', message: 'Revisit changed evidence.' },
        { author: 'agent', message: 'Added supporting context.' },
      ],
    });
    expect(artifact.threads[0].segments[1]).toMatchObject({
      resolved: false,
      messages: [{ author: 'user', message: 'Please revise the changed evidence again.' }],
    });
    await page.reload();
    await page.locator('[data-review-toggle]').click();
    if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
      await page.locator('[data-review-toggle]').click();
    await page.locator('[data-review-import]').setInputFiles({
      name: 'continued-review.json',
      mimeType: 'application/json',
      buffer: continued,
    });
    await expect(page.locator('[data-review-summary]')).toContainText('1 thread · unresolved: 1');
  });
}

test('mobile review thread dialog opens and returns focus without overflow', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'));
  await page.goto(formats[0].url);
  const toggle = page.locator('[data-review-toggle]');
  await toggle.click();
  await expect(page.locator('[data-review-dialog]')).toHaveAttribute('open', '');
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: path.join(captures, `list-overlay-${info.project.name}.png`) });
  await page.locator('[data-review-close]').click();
  await expect(toggle).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

async function downloadedReview(page: Page): Promise<Buffer> {
  if (await page.locator('[data-review-popover]').isVisible())
    await page.locator('[data-review-popover-close]').click();
  if ((await page.locator('[data-review-dialog]').getAttribute('open')) === null)
    await page.locator('[data-review-toggle]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review.json' }).click();
  return Buffer.from(
    await (await downloadPromise).createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }),
  );
}

async function selectRange(
  page: Page,
  start: Locator,
  startNeedle: string,
  startAdvance: number,
  end: Locator,
  endNeedle: string,
  endAdvance: number,
): Promise<void> {
  const startId = await start.getAttribute('data-review-target');
  const endId = await end.getAttribute('data-review-target');
  if (!startId || !endId) throw new Error('Missing selection target identity.');
  await page.evaluate(
    ({ startId, startNeedle, startAdvance, endId, endNeedle, endAdvance }) => {
      const boundary = (id: string, needle: string, advance: number) => {
        const owner = document.querySelector(`[data-review-target="${CSS.escape(id)}"]`);
        if (!owner) throw new Error('Missing selection owner.');
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const index = node.textContent?.indexOf(needle) ?? -1;
          if (index >= 0) return { node, offset: index + advance };
        }
        throw new Error(`Missing selection text: ${needle}`);
      };
      const from = boundary(startId, startNeedle, startAdvance);
      const to = boundary(endId, endNeedle, endAdvance);
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },
    { startId, startNeedle, startAdvance, endId, endNeedle, endAdvance },
  );
}

async function selectElementRange(
  element: Locator,
  needle: string,
  startAdvance: number,
  endAdvance: number,
): Promise<void> {
  await element.evaluate(
    (owner, { needle, startAdvance, endAdvance }) => {
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const index = node.textContent?.indexOf(needle) ?? -1;
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index + startAdvance);
        range.setEnd(node, index + endAdvance);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return;
      }
      throw new Error(`Missing selection text: ${needle}`);
    },
    { needle, startAdvance, endAdvance },
  );
}

async function textPoint(element: Locator, needle: string): Promise<{ x: number; y: number }> {
  return element.evaluate((owner, value) => {
    const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(value) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + value.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error(`Missing text point: ${value}`);
  }, needle);
}

async function selectFirstTextRange(element: Locator, length: number): Promise<void> {
  await element.evaluate((owner, maximum) => {
    const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (!(node instanceof Text) || node.data.trim().length === 0) continue;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(maximum, node.data.length));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('Missing selectable text.');
  }, length);
}
