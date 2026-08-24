import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import {
  MAX_REVIEW_FILE_BYTES,
  MAX_REVIEW_NAME_LENGTH,
  MAX_REVIEW_TEXT_LENGTH,
} from '../../src/review/contract.js';
import { expect, test } from './fixtures.js';

const generatedRoot = path.resolve('test-results/e2e-generated');
const captureRoot = path.resolve('test-results/captures/review-workspace');
const formats = [
  { name: 'single-file', url: pathToFileURL(path.join(generatedRoot, 'review.html')).href },
  {
    name: 'directory',
    url: pathToFileURL(path.join(generatedRoot, 'review-directory', 'index.html')).href,
  },
] as const;

for (const format of formats) {
  test(`${format.name} Review Workspace enforces shared Unicode code-point limits`, async ({
    page,
  }, testInfo) => {
    await page.goto(format.url);
    await activateTargets(page, testInfo.project.name);
    const paragraph = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await activate(targetControl(paragraph), testInfo.project.name);
    await page.locator('[data-review-page-verdict]').selectOption('revise');
    await page.locator('[data-review-target-verdict]').selectOption('revise');

    await expectCodePointLimit(
      page,
      page.locator('[data-reviewer-name]'),
      MAX_REVIEW_NAME_LENGTH,
      'Reviewer name',
    );
    for (const field of [
      page.locator('[data-review-page-rationale]'),
      page.locator('[data-review-target-rationale]'),
      page.locator('[data-review-feedback-message]'),
    ]) {
      await expectCodePointLimit(page, field, MAX_REVIEW_TEXT_LENGTH, 'Review text');
    }
    await page.getByRole('button', { name: 'Add feedback' }).click();
    const bytes = await downloadedReview(page);
    expect(bytes.toString('utf8')).not.toContain('\u0301');
    const artifact = JSON.parse(bytes.toString('utf8')) as {
      readonly reviewer?: { readonly name?: string };
      readonly pageVerdict?: { readonly rationale?: string };
      readonly responses?: readonly {
        readonly kind?: string;
        readonly message?: string;
        readonly rationale?: string;
      }[];
    };
    expect(Array.from(artifact.reviewer?.name ?? '')).toHaveLength(MAX_REVIEW_NAME_LENGTH);
    expect(Array.from(artifact.pageVerdict?.rationale ?? '')).toHaveLength(MAX_REVIEW_TEXT_LENGTH);
    const feedback = artifact.responses?.find((response) => response.kind === 'comment');
    const verdict = artifact.responses?.find((response) => response.kind === 'verdict');
    expect(Array.from(feedback?.message ?? '')).toHaveLength(MAX_REVIEW_TEXT_LENGTH);
    expect(Array.from(verdict?.rationale ?? '')).toHaveLength(MAX_REVIEW_TEXT_LENGTH);
  });

  test(`${format.name} Review Workspace enters and exits cleanly on desktop and mobile`, async ({
    page,
  }, testInfo) => {
    await page.goto(format.url);
    const toggle = page.locator('[data-review-toggle]');
    const dialog = page.locator('[data-review-dialog]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName('Review');
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-review-target-control]:visible')).toHaveCount(0);

    await activate(toggle, testInfo.project.name);
    await expect(dialog).toHaveAttribute('open', '');
    await expect(page.locator('[data-review-target-control]:visible')).not.toHaveCount(0);
    await expect(toggle).toHaveAccessibleName('Exit review');
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(
      testInfo.project.name.startsWith('mobile'),
    );
    if (testInfo.project.name.startsWith('mobile')) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open', '');
      await expect(toggle).toBeFocused();
      await activate(toggle, testInfo.project.name);
    }

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(toggle).toHaveAccessibleName('Open review');
    await expect(toggle).toBeFocused();
    const firstControl = page.locator('[data-review-target-control]:visible').first();
    await activate(firstControl, testInfo.project.name);
    await expect(dialog).toHaveAttribute('open', '');
    await expect(page.locator('[data-review-target-editor]')).toBeVisible();
    await expect(page.locator('[data-review-feedback-message]')).toBeFocused();
    await page.locator('[data-reviewer-name]').pressSequentially('Review owner');
    await expect(page.locator('[data-reviewer-name]')).toHaveValue('Review owner');
    await page.locator('[data-review-target-verdict]').selectOption('revise');
    await page.locator('[data-review-target-rationale]').pressSequentially('Needs an owner');
    await expect(page.locator('[data-review-target-rationale]')).toHaveValue('Needs an owner');
    await page.locator('[data-review-target-verdict]').selectOption('');

    await activate(page.locator('[data-review-exit]'), testInfo.project.name);
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-review-target-control]:visible')).toHaveCount(0);
    await expect(toggle).toHaveAccessibleName('Review');
    await expect(toggle).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test(`${format.name} Review Workspace exports deterministic isolated verdicts and imports them`, async ({
    page,
  }, testInfo) => {
    const remoteRequests: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
    });
    await page.addInitScript(() => {
      const evidence = { created: 0, revoked: 0 };
      Object.defineProperty(window, '__reviewObjectUrlEvidence', { value: evidence });
      URL.createObjectURL = new Proxy(URL.createObjectURL, {
        apply(target, thisArg, argumentsList: Parameters<typeof URL.createObjectURL>) {
          evidence.created += 1;
          return Reflect.apply(target, thisArg, argumentsList) as string;
        },
      });
      URL.revokeObjectURL = new Proxy(URL.revokeObjectURL, {
        apply(target, thisArg, argumentsList: Parameters<typeof URL.revokeObjectURL>) {
          evidence.revoked += 1;
          return Reflect.apply(target, thisArg, argumentsList) as undefined;
        },
      });
    });
    await page.goto(format.url);
    await activateTargets(page, testInfo.project.name);
    const sharedParagraphs = page.locator('p[data-review-target]').filter({
      hasText: 'Shared evidence statement.',
    });
    await expect(sharedParagraphs).toHaveCount(2);

    await activate(targetControl(sharedParagraphs.nth(0)), testInfo.project.name);
    await page.locator('[data-review-target-verdict]').selectOption('approve');
    await page.locator('[data-review-feedback-message]').fill('Evidence is clear.');
    await page.getByRole('button', { name: 'Add feedback' }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await activate(targetControl(sharedParagraphs.nth(1)), testInfo.project.name);
    await page.locator('[data-review-target-verdict]').selectOption('revise');
    await page.locator('[data-review-target-rationale]').fill('Clarify the owner.');
    await page.locator('[data-review-feedback-kind]').selectOption('blocker');
    await page.locator('[data-review-feedback-message]').fill('Owner is missing.');
    await page.getByRole('button', { name: 'Add feedback' }).click();
    await page.locator('[data-reviewer-name]').fill('Review owner');

    await page.locator('[data-review-page-verdict]').selectOption('approve');
    await page.getByRole('button', { name: 'Export review.json' }).click();
    await expect(page.locator('[data-review-error]')).toContainText(
      'Resolve blockers and revise or reject block verdicts',
    );
    await expect(page.locator('[data-review-error]')).toBeFocused();

    await page.locator('[data-review-page-verdict]').selectOption('revise');
    await page.locator('[data-review-page-rationale]').fill('Resolve the open owner blocker.');
    const firstBytes = await downloadedReview(page);
    const secondBytes = await downloadedReview(page);
    expect(secondBytes.equals(firstBytes)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                readonly __reviewObjectUrlEvidence: { created: number; revoked: number };
              }
            ).__reviewObjectUrlEvidence,
        ),
      )
      .toEqual({ created: 2, revoked: 2 });

    const exported = JSON.parse(firstBytes.toString('utf8')) as {
      readonly pageVerdict?: { readonly verdict?: string };
      readonly responses?: readonly {
        readonly kind?: string;
        readonly verdict?: string;
        readonly target?: { readonly id?: string };
      }[];
    };
    expect(exported.pageVerdict?.verdict).toBe('revise');
    const verdicts = exported.responses?.filter((response) => response.kind === 'verdict') ?? [];
    expect(verdicts.map((response) => response.verdict).sort()).toEqual(['approve', 'revise']);
    expect(new Set(verdicts.map((response) => response.target?.id)).size).toBe(2);

    await page.reload();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('[data-review-import]').setInputFiles({
      name: 'review.json',
      mimeType: 'application/json',
      buffer: firstBytes,
    });
    await expect(page.locator('[data-review-summary]')).toContainText(
      '2 feedback · 2 block verdicts · 2 blocking',
    );
    await expect(page.locator('[data-review-response-list]')).toContainText('Owner is missing.');
    const importedBytes = await downloadedReview(page);
    expect(importedBytes.equals(firstBytes)).toBe(true);

    const responseCount = await page.locator('[data-review-response-list] > li').count();
    const targetMismatch = parsedCraftedReview(firstBytes);
    const targetMismatchResponse = targetMismatch.responses[0];
    if (targetMismatchResponse === undefined) throw new Error('Missing target mismatch fixture');
    targetMismatchResponse.target.fingerprint = `sha256:${'f'.repeat(64)}`;
    await page.locator('[data-review-import]').setInputFiles({
      name: 'target-mismatch-review.json',
      mimeType: 'application/json',
      buffer: Buffer.from(`${JSON.stringify(targetMismatch)}\n`),
    });
    await expect(page.locator('[data-review-error]')).toContainText(
      'target that is not part of this report revision',
    );
    expect((await downloadedReview(page)).equals(firstBytes)).toBe(true);

    const duplicateVerdict = parsedCraftedReview(firstBytes);
    const existingVerdict = duplicateVerdict.responses.find(
      (response) => response.kind === 'verdict',
    );
    if (existingVerdict === undefined) throw new Error('Missing duplicate verdict fixture');
    duplicateVerdict.responses.push({ ...existingVerdict, id: 'verdict-duplicate-target' });
    await page.locator('[data-review-import]').setInputFiles({
      name: 'duplicate-verdict-review.json',
      mimeType: 'application/json',
      buffer: Buffer.from(`${JSON.stringify(duplicateVerdict)}\n`),
    });
    await expect(page.locator('[data-review-error]')).toContainText(
      'more than one verdict for a block',
    );
    expect((await downloadedReview(page)).equals(firstBytes)).toBe(true);

    await page.locator('[data-review-import]').setInputFiles({
      name: 'oversized-review.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(MAX_REVIEW_FILE_BYTES + 1, 0x20),
    });
    await expect(page.locator('[data-review-error]')).toContainText(
      `no larger than ${MAX_REVIEW_FILE_BYTES} bytes`,
    );
    expect((await downloadedReview(page)).equals(firstBytes)).toBe(true);

    const stale = { ...exported, report: { revision: `sha256:${'0'.repeat(64)}` } };
    await page.locator('[data-review-import]').setInputFiles({
      name: 'stale-review.json',
      mimeType: 'application/json',
      buffer: Buffer.from(`${JSON.stringify(stale)}\n`),
    });
    await expect(page.locator('[data-review-error]')).toContainText('different report revision');
    await expect(page.locator('[data-review-response-list] > li')).toHaveCount(responseCount);

    const inconsistent = { ...exported, pageVerdict: { verdict: 'approve' } };
    await page.locator('[data-review-import]').setInputFiles({
      name: 'inconsistent-review.json',
      mimeType: 'application/json',
      buffer: Buffer.from(`${JSON.stringify(inconsistent)}\n`),
    });
    await expect(page.locator('[data-review-error]')).toContainText(
      'Resolve blockers and revise or reject block verdicts',
    );
    await expect(page.locator('[data-review-response-list] > li')).toHaveCount(responseCount);

    const feedbackItem = page
      .locator('[data-review-response-list] > li')
      .filter({ hasText: 'Owner is missing.' });
    await feedbackItem.getByRole('button', { name: 'Edit' }).click();
    await page.locator('[data-review-feedback-message]').fill('Owner and due date are missing.');
    await page.getByRole('button', { name: 'Save feedback' }).click();
    const editedItem = page
      .locator('[data-review-response-list] > li')
      .filter({ hasText: 'Owner and due date are missing.' });
    await expect(editedItem).toHaveCount(1);
    await editedItem.getByRole('button', { name: 'Remove' }).click();
    await expect(editedItem).toHaveCount(0);

    const hostile = JSON.parse(firstBytes.toString('utf8')) as {
      responses: Array<{ kind?: string; message?: string }>;
    };
    const hostileFeedback = hostile.responses.find((response) => response.kind === 'blocker');
    if (hostileFeedback === undefined) throw new Error('Missing hostile feedback fixture');
    hostileFeedback.message = '<img src=x onerror="globalThis.__reviewInjected=true">';
    await page.locator('[data-review-import]').setInputFiles({
      name: 'hostile-review.json',
      mimeType: 'application/json',
      buffer: Buffer.from(`${JSON.stringify(hostile)}\n`),
    });
    await expect(page.locator('[data-review-response-list]')).toContainText('<img src=x onerror=');
    await expect(page.locator('[data-review-response-list] img')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.has(globalThis, '__reviewInjected'))).toBe(false);
    expect(remoteRequests).toEqual([]);

    await page.locator('[data-review-import]').setInputFiles({
      name: 'review.json',
      mimeType: 'application/json',
      buffer: firstBytes,
    });
    await page
      .locator('[data-review-response-list] > li')
      .filter({ hasText: 'Owner is missing.' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await activate(targetControl(sharedParagraphs.nth(1)), testInfo.project.name);
    await page.locator('[data-review-target-verdict]').selectOption('approve');
    await page.locator('[data-review-page-verdict]').selectOption('approve');
    const approvedBytes = await downloadedReview(page);
    const approved = JSON.parse(approvedBytes.toString('utf8')) as {
      readonly pageVerdict?: { readonly verdict?: string };
      readonly responses?: readonly { readonly kind?: string; readonly verdict?: string }[];
    };
    expect(approved.pageVerdict?.verdict).toBe('approve');
    expect(
      approved.responses?.some(
        (response) =>
          response.kind === 'blocker' ||
          (response.kind === 'verdict' && response.verdict !== 'approve'),
      ),
    ).toBe(false);
  });

  test(`${format.name} Review Workspace captures required visual states`, async ({
    page,
  }, testInfo) => {
    await mkdir(captureRoot, { recursive: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(format.url);
    const identity = `${format.name}-${testInfo.project.name}`;
    await page.screenshot({ path: path.join(captureRoot, `${identity}-closed-light.png`) });

    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await finishVisualState(page);
    await page.screenshot({ path: path.join(captureRoot, `${identity}-active-empty-dark.png`) });

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const paragraph = page
      .locator('p[data-review-target]')
      .filter({ hasText: 'Shared evidence statement.' })
      .first();
    await targetControl(paragraph).click();
    await page.locator('[data-review-target-verdict]').selectOption('revise');
    await page.locator('[data-review-target-rationale]').fill('Add an accountable owner.');
    await page.locator('[data-review-feedback-kind]').selectOption('blocker');
    await page.locator('[data-review-feedback-message]').fill('The owner is missing.');
    await page.getByRole('button', { name: 'Add feedback' }).click();
    await page.locator('[data-review-page-verdict]').selectOption('revise');
    await page.locator('[data-review-page-rationale]').fill('Resolve the blocker.');
    await finishVisualState(page);
    await page.screenshot({ path: path.join(captureRoot, `${identity}-populated-dark.png`) });

    await page.locator('[data-review-page-verdict]').selectOption('approve');
    await page.getByRole('button', { name: 'Export review.json' }).click();
    await expect(page.locator('[data-review-error]')).toBeVisible();
    await expect(page.locator('[data-review-error]')).toBeFocused();
    await finishVisualState(page);
    await page.screenshot({
      path: path.join(captureRoot, `${identity}-validation-error-dark.png`),
    });
  });
}

for (const layout of ['document', 'dashboard', 'landing', 'mixed'] as const) {
  test(`${layout} layout keeps Review Workspace reachable and contained`, async ({ page }) => {
    await page.goto(pathToFileURL(path.join(generatedRoot, `layout-${layout}.html`)).href);
    const toggle = page.locator('[data-review-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('[data-review-dialog]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-review-target-control]:visible')).not.toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

async function activateTargets(page: Page, projectName: string): Promise<void> {
  await activate(page.getByRole('button', { name: 'Review', exact: true }), projectName);
  await activate(page.getByRole('button', { name: 'Close', exact: true }), projectName);
}

async function activate(control: Locator, projectName: string): Promise<void> {
  if (projectName.startsWith('mobile')) await control.tap();
  else {
    await control.focus();
    await control.press('Enter');
  }
}

function targetControl(target: Locator): Locator {
  return target.locator('xpath=preceding-sibling::button[@data-review-target-control][1]');
}

async function downloadedReview(page: Page): Promise<Buffer> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review.json' }).click();
  const download = await downloadPromise;
  const temporaryPath = await download.path();
  if (temporaryPath === null) throw new Error('Review download did not create a local file');
  return await readFile(temporaryPath);
}

interface CraftedReviewResponse {
  id: string;
  kind: string;
  target: {
    fingerprint: string;
  };
  verdict?: string;
  rationale?: string;
}

interface CraftedReviewArtifact {
  responses: CraftedReviewResponse[];
}

function parsedCraftedReview(bytes: Buffer): CraftedReviewArtifact {
  return JSON.parse(bytes.toString('utf8')) as CraftedReviewArtifact;
}

async function expectCodePointLimit(
  page: Page,
  field: Locator,
  limit: number,
  label: string,
): Promise<void> {
  const maximum = '😀'.repeat(limit);
  await field.fill(maximum);
  await expect(field).toHaveValue(maximum);
  await field.fill(`${maximum}😀`);
  await expect(field).toHaveValue(maximum);
  await expect(page.locator('[data-review-error]')).toHaveText(
    `${label} is limited to ${limit} Unicode characters.`,
  );
  await field.fill(maximum);
  await expect(page.locator('[data-review-error]')).toBeHidden();
  const decomposedMaximum = 'e\u0301'.repeat(limit);
  const composedMaximum = 'é'.repeat(limit);
  await field.fill(decomposedMaximum);
  await expect(field).toHaveValue(composedMaximum);
}

async function finishVisualState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await Promise.all(document.getAnimations().map(async (animation) => animation.finished));
  });
}
