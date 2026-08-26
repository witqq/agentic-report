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
    await page.locator('[data-review-toggle]').click();
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    const control = await openThread(page, target);
    await page.locator('[data-review-message]').fill('Explain why this evidence is sufficient.');
    await page.getByRole('button', { name: 'Add message' }).click();
    await expect(page.locator('[data-review-thread-messages]')).toContainText('Explain why');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
      .locator('[data-review-message]')
      .fill('Explain why this evidence supports the conclusion.');
    await page.getByRole('button', { name: 'Save message' }).click();
    await expect(control).toContainText('● 1');
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-unresolved.png`),
    });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /Resolve thread for Shared evidence/u }).click();
    await openThread(page, target);
    await expect(page.getByRole('button', { name: 'Reopen thread', exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}-resolved.png`),
    });
    const review = await downloadedReview(page);
    const artifact = JSON.parse(review.toString('utf8'));
    expect(artifact).toMatchObject({
      contractVersion: 2,
      threads: [
        {
          segments: [
            {
              resolved: true,
              messages: [
                { author: 'user', message: 'Explain why this evidence supports the conclusion.' },
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
    await expect(page.locator('[data-review-summary]')).toContainText('1 threads · 0 unresolved');
  });

  test(`${format.name} rejects version 1 without losing current thread state`, async ({ page }) => {
    await page.goto(format.url);
    await page.locator('[data-review-toggle]').click();
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await openThread(page, target);
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
  const owner = page.locator(`[data-review-target="${target.id}"]`);
  await openThread(page, owner);
  await page.locator('[data-review-message]').fill('Append after sparse identity.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const before = await downloadedReview(page);
  const exported = JSON.parse(before.toString('utf8'));
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
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openThread(page, page.locator(`[data-review-target="${otherTarget.id}"]`));
  await page.locator('[data-review-message]').fill('Independent current discussion.');
  await page.getByRole('button', { name: 'Add message' }).click();
  const after = JSON.parse((await downloadedReview(page)).toString('utf8'));
  expect(after.threads.map((thread: { id: string }) => thread.id)).toEqual(
    expect.arrayContaining([`thread-${otherTarget.id}-1`, `thread-${otherTarget.id}-2`]),
  );
  expect(JSON.stringify(after)).toContain('Preserve me.');
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
    const target = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await openThread(page, target);
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Revisit changed evidence.',
    );
    await expect(page.locator('[data-review-thread-messages]')).toContainText(
      'Added supporting context.',
    );
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
    await expect(page.locator('[data-review-summary]')).toContainText('1 threads · 0 unresolved');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const changed = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Changed evidence statement.' })
      .first();
    await openThread(page, changed);
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
    await expect(page.locator('[data-review-summary]')).toContainText('1 threads · 1 unresolved');
  });
}

test('mobile review thread dialog opens and returns focus without overflow', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'));
  await page.goto(formats[0].url);
  const toggle = page.locator('[data-review-toggle]');
  await toggle.click();
  await toggle.click();
  await expect(page.locator('[data-review-dialog]')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(toggle).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

async function downloadedReview(page: Page): Promise<Buffer> {
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

async function openThread(page: Page, target: Locator) {
  const id = await target.getAttribute('data-review-target');
  if (id === null) throw new Error('Missing target identity.');
  const control = page.locator(`[data-review-target-control="${id}"]`);
  await control.click();
  return control;
}
