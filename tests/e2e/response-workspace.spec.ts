import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const root = path.resolve('test-results/e2e-generated');
const captures = path.resolve('test-results/captures/response-workspace');
const formats = [
  { name: 'single-file', url: pathToFileURL(path.join(root, 'response-workspace.html')).href },
  {
    name: 'directory',
    url: pathToFileURL(path.join(root, 'response-workspace-directory/index.html')).href,
  },
] as const;

for (const format of formats) {
  test(`${format.name} completes every response kind and preserves state across export failures`, async ({
    page,
  }, info) => {
    await mkdir(captures, { recursive: true });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if (
              (globalThis as typeof globalThis & { responseClipboardFails?: boolean })
                .responseClipboardFails
            )
              throw new Error('controlled clipboard failure');
            (globalThis as typeof globalThis & { responseClipboard?: string }).responseClipboard =
              value;
          },
        },
      });
      (
        globalThis as typeof globalThis & { responseDownloadClicks?: number }
      ).responseDownloadClicks = 0;
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('a[download^="response-"]'))
          return;
        const state = globalThis as typeof globalThis & { responseDownloadClicks?: number };
        state.responseDownloadClicks = (state.responseDownloadClicks ?? 0) + 1;
      });
    });
    await page.goto(format.url);
    const workspace = page.locator('[data-response-workspace]');
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('fieldset[data-response-question]')).toHaveCount(7);
    await expect(workspace.locator('[data-response-answer-state]')).toHaveCount(7);

    const initialResponse = await downloadResponse(page, workspace);
    const initialArtifact = JSON.parse(initialResponse.toString('utf8')) as {
      readonly answers: readonly {
        readonly id: string;
        readonly answered: boolean;
        readonly value: unknown;
      }[];
    };
    expect(
      initialArtifact.answers.filter((answer) => answer.answered).map((answer) => answer.id),
    ).toEqual([]);
    expect(initialArtifact.answers.find((answer) => answer.id === 'scope')?.value).toEqual([
      { itemId: 'login', bucketId: 'do' },
      { itemId: 'copy', bucketId: null },
      { itemId: 'telemetry', bucketId: 'skip' },
    ]);
    expect(initialArtifact.answers.find((answer) => answer.id === 'priority')?.value).toEqual([
      'first',
      'second',
      'third',
    ]);

    const scope = question(page, 'scope');
    const copySelect = scope.locator('[data-response-item="copy"] [data-response-bucket-select]');
    await copySelect.focus();
    await expect(copySelect).toBeFocused();
    await copySelect.selectOption('later');
    await expect(scope.locator('article[data-response-item="copy"]')).toBeAttached();
    const loginSelect = scope.locator('[data-response-item="login"] [data-response-bucket-select]');
    if (info.project.name === 'desktop-chromium') {
      await scope
        .locator('article[data-response-item="login"]')
        .dragTo(scope.locator('[data-response-bucket-column="skip"]'));
    } else {
      await loginSelect.focus();
      await expect(loginSelect).toBeFocused();
      await loginSelect.selectOption('skip');
    }
    await expect(loginSelect).toHaveValue('skip');
    await scope
      .locator('[data-response-item="login"] [data-response-comment]')
      .fill('Keep the rollback owner visible.');

    const triage = question(page, 'triage');
    await triage.locator('[data-response-item="finding-a"] input[value="accept"]').check();
    await triage.locator('[data-response-item="finding-b"] input[value="discuss"]').focus();
    await page.keyboard.press('Space');

    const risks = question(page, 'risks');
    await risks.locator('[data-response-item="auth"] input[value="security"]').check();
    await risks.locator('[data-response-item="auth"] input[value="reliability"]').check();
    await risks.locator('[data-response-item="export"] input[value="usability"]').check();

    const decision = question(page, 'decision');
    const conditional = decision.locator('input[value="conditional"]');
    await conditional.focus();
    await page.keyboard.press('Space');
    const original = scope.locator('[data-response-item="login"] [data-response-original]');
    await expect(original).toHaveAttribute('target', '_blank');
    await original.evaluate((link) =>
      link.addEventListener('click', (event) => event.preventDefault(), { once: true }),
    );
    await original.click();
    await expect(conditional).toBeChecked();

    const priority = question(page, 'priority');
    const moveThirdUp = priority
      .locator('[data-response-order-item="third"]')
      .getByRole('button', { name: 'Move up' });
    await moveThirdUp.focus();
    await page.keyboard.press('Enter');
    expect(
      await priority
        .locator('[data-response-order-item]')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-response-order-item'))),
    ).toEqual(['first', 'third', 'second']);

    const scores = question(page, 'scores');
    await scores.locator('[data-response-item="confidence"] [data-response-number]').fill('5');
    await scores.locator('[data-response-item="reversibility"] [data-response-number]').fill('4');
    await question(page, 'summary')
      .locator('[data-response-global-text]')
      .fill('Conditional go after the login regression is fixed.');

    await workspace.getByRole('button', { name: 'Copy response' }).click();
    const copied = await page.evaluate(
      () =>
        (globalThis as typeof globalThis & { responseClipboard?: string }).responseClipboard ?? '',
    );
    const first = await downloadResponse(page, workspace);
    const second = await downloadResponse(page, workspace);
    expect(first.equals(second)).toBe(true);
    expect(first.toString('utf8')).toBe(copied);
    const artifact = JSON.parse(first.toString('utf8')) as {
      readonly contractVersion: number;
      readonly answers: readonly {
        readonly id: string;
        readonly kind: string;
        readonly answered: boolean;
        readonly value: unknown;
      }[];
      readonly comments: readonly {
        readonly questionId: string;
        readonly itemId: string;
        readonly text: string;
      }[];
    };
    expect(artifact.contractVersion).toBe(1);
    expect(artifact.answers).toEqual([
      {
        id: 'scope',
        kind: 'bucket',
        answered: true,
        value: [
          { itemId: 'login', bucketId: 'skip' },
          { itemId: 'copy', bucketId: 'later' },
          { itemId: 'telemetry', bucketId: 'skip' },
        ],
      },
      {
        id: 'triage',
        kind: 'item-single',
        answered: true,
        value: [
          { itemId: 'finding-a', optionId: 'accept' },
          { itemId: 'finding-b', optionId: 'discuss' },
        ],
      },
      {
        id: 'risks',
        kind: 'item-multi',
        answered: true,
        value: [
          { itemId: 'auth', optionIds: ['security', 'reliability'] },
          { itemId: 'export', optionIds: ['usability'] },
        ],
      },
      { id: 'decision', kind: 'single', answered: true, value: 'conditional' },
      {
        id: 'priority',
        kind: 'order',
        answered: true,
        value: ['first', 'third', 'second'],
      },
      {
        id: 'scores',
        kind: 'number',
        answered: true,
        value: [
          { itemId: 'confidence', value: 5 },
          { itemId: 'reversibility', value: 4 },
        ],
      },
      {
        id: 'summary',
        kind: 'text',
        answered: true,
        value: 'Conditional go after the login regression is fixed.',
      },
    ]);
    expect(artifact.comments).toEqual([
      {
        questionId: 'scope',
        itemId: 'login',
        text: 'Keep the rollback owner visible.',
      },
    ]);

    const validClipboard = copied;
    const downloadClicks = () =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { responseDownloadClicks?: number })
            .responseDownloadClicks ?? 0,
      );
    const clicksBeforeInvalidNumber = await downloadClicks();
    const confidence = scores.locator('[data-response-item="confidence"] [data-response-number]');
    await confidence.fill('6');
    await workspace.getByRole('button', { name: 'Copy response' }).click();
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'Correct invalid response values',
    );
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { responseClipboard?: string }).responseClipboard ??
          '',
      ),
    ).toBe(validClipboard);
    if (format.name === 'single-file' && info.project.name === 'desktop-chromium') {
      await page.screenshot({
        path: path.join(captures, 'single-file-desktop-invalid-number-chromium.png'),
        fullPage: true,
      });
    }
    await workspace.getByRole('button', { name: 'Download response.json' }).click();
    expect(await downloadClicks()).toBe(clicksBeforeInvalidNumber);

    await confidence.fill('3.5');
    await workspace.getByRole('button', { name: 'Download response.json' }).click();
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'Correct invalid response values',
    );
    expect(await downloadClicks()).toBe(clicksBeforeInvalidNumber);

    await confidence.fill('5');
    await workspace.getByRole('button', { name: 'Copy response' }).click();
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { responseClipboard?: string }).responseClipboard ??
          '',
      ),
    ).toBe(validClipboard);
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    await page.evaluate(() => {
      (
        globalThis as typeof globalThis & { responseClipboardFails?: boolean }
      ).responseClipboardFails = true;
    });
    await workspace.getByRole('button', { name: 'Copy response' }).click();
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'Clipboard unavailable',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    for (const invalidScore of [6, 3.5]) {
      const invalidNumber = JSON.parse(first.toString('utf8')) as {
        answers: { id: string; value: unknown }[];
      };
      const scoreAnswer = invalidNumber.answers.find((answer) => answer.id === 'scores');
      const scoreValues = Array.isArray(scoreAnswer?.value)
        ? (scoreAnswer.value as { itemId: string; value: number | null }[])
        : [];
      const confidenceValue = scoreValues.find((entry) => entry.itemId === 'confidence');
      expect(confidenceValue).toBeDefined();
      if (confidenceValue) confidenceValue.value = invalidScore;
      await workspace.locator('[data-response-import]').setInputFiles({
        name: `invalid-number-${String(invalidScore)}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(invalidNumber)),
      });
      await expect(workspace.locator('[data-response-status]')).toContainText(
        'Response import failed',
      );
      expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);
    }

    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'oversized-response.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(2_000_001, 'x'),
    });
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'Response files must be no larger than 2000000 bytes.',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    const unsupported = JSON.parse(first.toString('utf8')) as { contractVersion: number };
    unsupported.contractVersion = 99;
    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'unsupported-response.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(unsupported)),
    });
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'unsupported contract version',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'malformed-response.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-json'),
    });
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'Response import failed',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    const foreign = JSON.parse(first.toString('utf8')) as {
      form: { revision: string };
    };
    foreign.form.revision = `sha256:${'f'.repeat(64)}`;
    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'foreign-response.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(foreign)),
    });
    await expect(workspace.locator('[data-response-status]')).toContainText(
      'different or outdated form',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);

    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'unanswered-response.json',
      mimeType: 'application/json',
      buffer: initialResponse,
    });
    await expect(decision.locator('[data-response-global-single]:checked')).toHaveCount(0);
    const unansweredAfterImport = JSON.parse(
      (await downloadResponse(page, workspace)).toString('utf8'),
    ) as {
      answers: readonly { id: string; answered: boolean; value: unknown }[];
    };
    expect(unansweredAfterImport.answers.find((answer) => answer.id === 'decision')).toMatchObject({
      answered: false,
      value: null,
    });

    await question(page, 'summary').locator('[data-response-global-text]').fill('Changed locally.');
    await workspace.locator('[data-response-import]').setInputFiles({
      name: 'response.json',
      mimeType: 'application/json',
      buffer: first,
    });
    await expect(question(page, 'summary').locator('[data-response-global-text]')).toHaveValue(
      'Conditional go after the login regression is fixed.',
    );
    expect((await downloadResponse(page, workspace)).equals(first)).toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute('data-response-open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (format.name === 'directory') {
      await page.locator('html').evaluate((element) => {
        element.dataset.theme = 'dark';
      });
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: path.join(captures, `${format.name}-${info.project.name}.png`),
      fullPage: true,
    });
    await page.reload();
    await expect(workspace).toBeVisible();
    expect((await downloadResponse(page, workspace)).equals(initialResponse)).toBe(true);
  });
}

const isolationFormats = [
  { name: 'single-file', url: pathToFileURL(path.join(root, 'response-isolation.html')).href },
  {
    name: 'directory',
    url: pathToFileURL(path.join(root, 'response-isolation-directory/index.html')).href,
  },
] as const;

for (const format of isolationFormats) {
  test(`${format.name} isolates reused question and item identities between response forms`, async ({
    page,
  }) => {
    await page.goto(format.url);
    const workspaces = page.locator('[data-response-workspace]');
    await expect(workspaces).toHaveCount(2);
    const first = workspaces.nth(0);
    const second = workspaces.nth(1);

    const firstBucketItem = first.locator(
      '[data-response-question="shared-bucket"] [data-response-item="shared"]',
    );
    const firstBucketSelect = firstBucketItem.locator('[data-response-bucket-select]');
    const secondBucketSelect = second.locator(
      '[data-response-question="shared-bucket"] [data-response-item="shared"] [data-response-bucket-select]',
    );
    await dispatchDrag(
      page,
      firstBucketItem,
      second.locator(
        '[data-response-question="shared-bucket"] [data-response-bucket-column="skip"]',
      ),
    );
    await expect(firstBucketSelect).toHaveValue('do');
    await expect(secondBucketSelect).toHaveValue('do');
    await dispatchDrag(
      page,
      firstBucketItem,
      first.locator(
        '[data-response-question="shared-bucket"] [data-response-bucket-column="skip"]',
      ),
    );
    await expect(firstBucketSelect).toHaveValue('skip');
    await expect(secondBucketSelect).toHaveValue('do');

    const phaseValue = '100000000.0022';
    const firstLargeScore = first.locator(
      '[data-response-question="large-score"] [data-response-number]',
    );
    await firstLargeScore.fill(phaseValue);

    await first.locator('[data-response-question="shared-global"] input[value="yes"]').check();
    await second.locator('[data-response-question="shared-global"] input[value="no"]').check();
    await first
      .locator(
        '[data-response-question="shared-item"] [data-response-item="shared"] input[value="yes"]',
      )
      .check();
    await second
      .locator(
        '[data-response-question="shared-item"] [data-response-item="shared"] input[value="no"]',
      )
      .check();

    await expect(
      first.locator('[data-response-question="shared-global"] input[value="yes"]'),
    ).toBeChecked();
    await expect(
      second.locator('[data-response-question="shared-global"] input[value="no"]'),
    ).toBeChecked();
    await expect(
      first.locator('[data-response-question="shared-item"] input[value="yes"]'),
    ).toBeChecked();
    await expect(
      second.locator('[data-response-question="shared-item"] input[value="no"]'),
    ).toBeChecked();

    const firstBytes = await downloadResponse(page, first);
    const firstArtifact = JSON.parse(firstBytes.toString('utf8')) as {
      answers: readonly { id: string; value: unknown }[];
    };
    const secondArtifact = JSON.parse((await downloadResponse(page, second)).toString('utf8')) as {
      answers: readonly { id: string; value: unknown }[];
    };
    expect(firstArtifact.answers.find((answer) => answer.id === 'shared-global')?.value).toBe(
      'yes',
    );
    expect(secondArtifact.answers.find((answer) => answer.id === 'shared-global')?.value).toBe(
      'no',
    );
    expect(firstArtifact.answers.find((answer) => answer.id === 'shared-item')?.value).toEqual([
      { itemId: 'shared', optionId: 'yes' },
    ]);
    expect(secondArtifact.answers.find((answer) => answer.id === 'shared-item')?.value).toEqual([
      { itemId: 'shared', optionId: 'no' },
    ]);
    expect(firstArtifact.answers.find((answer) => answer.id === 'shared-bucket')?.value).toEqual([
      { itemId: 'shared', bucketId: 'skip' },
    ]);
    expect(secondArtifact.answers.find((answer) => answer.id === 'shared-bucket')?.value).toEqual([
      { itemId: 'shared', bucketId: 'do' },
    ]);
    expect(firstArtifact.answers.find((answer) => answer.id === 'large-score')?.value).toEqual([
      { itemId: 'shared', value: 100000000.0022 },
    ]);
    expect(secondArtifact.answers.find((answer) => answer.id === 'large-score')?.value).toEqual([
      { itemId: 'shared', value: null },
    ]);

    await firstLargeScore.fill('0');
    await first.locator('[data-response-import]').setInputFiles({
      name: 'large-decimal-response.json',
      mimeType: 'application/json',
      buffer: firstBytes,
    });
    await expect(firstLargeScore).toHaveValue(phaseValue);
    expect((await downloadResponse(page, first)).equals(firstBytes)).toBe(true);
  });
}

function question(page: Page, id: string) {
  return page.locator(`fieldset[data-response-question="${id}"]`);
}

async function downloadResponse(page: Page, owner: Page | Locator = page): Promise<Buffer> {
  const downloadPromise = page.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download response.json' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function dispatchDrag(page: Page, source: Locator, target: Locator): Promise<void> {
  const [sourceElement, targetElement] = await Promise.all([
    source.elementHandle(),
    target.elementHandle(),
  ]);
  if (!sourceElement || !targetElement) throw new Error('Drag endpoints must exist.');
  await page.evaluate(
    ({ sourceElement, targetElement }) => {
      const dataTransfer = new DataTransfer();
      sourceElement.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
      );
      targetElement.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
      );
      targetElement.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
      );
      sourceElement.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }),
      );
    },
    { sourceElement, targetElement },
  );
}
