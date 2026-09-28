import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { test, expect } from './fixtures.js';

const execFileAsync = promisify(execFile);
const candidateEvidencePath = path.resolve('test-results/package/candidate-evidence.json');
const artifactNames = [
  'first-use single-file',
  'first-use directory',
  'prior-review single-file',
  'prior-review directory',
] as const;

test.use({ locale: 'en-US' });

interface BrowserInput {
  readonly format: 'single-file' | 'directory';
  readonly path: string;
  readonly expectReviewThreads?: boolean;
}

interface CandidateEvidence {
  readonly browserInputs: readonly BrowserInput[];
  readonly tarball: { readonly path: string; readonly sha256: string };
  readonly installed: { readonly binary: string; readonly packagePath: string };
}

for (const [index, name] of artifactNames.entries()) {
  test(`installed npm candidate opens ${name} through file://`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium');
    const artifact = (await readCandidateEvidence()).browserInputs[index];
    if (artifact === undefined)
      throw new Error(`Installed candidate has no ${name} browser input.`);

    await page.setViewportSize(
      artifact.format === 'single-file'
        ? { width: 1440, height: 1000 }
        : { width: 390, height: 844 },
    );
    await page.goto(pathToFileURL(artifact.path).href);
    expect((await page.title()).trim()).not.toBe('');
    expect((await page.locator('h1').first().textContent())?.trim()).not.toBe('');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);

    const schemeToggle = page.locator('[data-scheme-toggle]');
    await expect(schemeToggle).toHaveCount(1);
    const schemeBefore = await page.locator('html').getAttribute('data-scheme');
    expect(schemeBefore).not.toBeNull();
    await schemeToggle.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-scheme', schemeBefore ?? '');

    const reviewToggle = page.locator('[data-review-toggle]');
    await expect(reviewToggle).toHaveCount(1);
    const shellBefore = await page.locator('.report-shell').boundingBox();
    await reviewToggle.click();
    const reviewDialog = page.locator('[data-review-dialog]');
    await expect(reviewDialog).toHaveAttribute('open', '');
    expect(await reviewDialog.evaluate((element) => element.matches(':modal'))).toBe(
      artifact.format === 'directory',
    );
    expect(await page.locator('.report-shell').boundingBox()).toEqual(shellBefore);
    expect(await page.locator('[data-review-target]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-review-target-control]')).toHaveCount(0);
    if (artifact.expectReviewThreads === true) {
      expect(
        await page.locator('[data-review-current-list] [data-review-thread-open]').count(),
      ).toBeGreaterThan(0);
    }
    await page.locator('[data-review-close]').click();

    const selectionAction = await page
      .locator('[data-review-target]')
      .filter({ hasText: /\S/u })
      .first()
      .evaluate((owner) => {
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        for (let candidate = walker.nextNode(); candidate !== null; candidate = walker.nextNode()) {
          if (!(candidate instanceof Text) || candidate.data.trim().length === 0) continue;
          const start = candidate.data.search(/\S/u);
          const range = document.createRange();
          range.setStart(candidate, start);
          range.setEnd(candidate, Math.min(start + 4, candidate.data.length));
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
          return true;
        }
        return false;
      });
    expect(selectionAction).toBe(true);
    await page.locator('[data-review-selection-action]').click();
    await expect(page.locator('[data-review-popover]')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
}

test('installed npm starter builds a bilingual page with a working locale control', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  const evidence = await readCandidateEvidence();
  const journeyRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-installed-locale-'));
  const source = path.join(journeyRoot, 'page');
  const output = path.join(journeyRoot, 'built.html');
  try {
    await execFileAsync(evidence.installed.binary, ['init', source, '--starter', 'document'], {
      cwd: journeyRoot,
    });
    const entry = await readFile(path.join(source, 'report.md'), 'utf8');
    expect(entry).toMatch(/^localizations:\n\s+ru: report\.ru\.md\s*$/mu);
    expect((await readFile(path.join(source, 'report.ru.md'), 'utf8')).length).toBeGreaterThan(0);
    await execFileAsync(evidence.installed.binary, ['build', source, '--output', output], {
      cwd: journeyRoot,
    });

    await page.goto(pathToFileURL(output).href);
    const languageSelect = page.locator('[data-language-select]');
    await expect(languageSelect).toHaveCount(1);
    await languageSelect.selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const englishHeading = await page.locator('h1:visible').textContent();
    await languageSelect.selectOption('ru');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    expect(await page.locator('h1:visible').textContent()).not.toBe(englishHeading);
    await page.locator('[data-language-select]').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1:visible')).toHaveText(englishHeading ?? '');
  } finally {
    await rm(journeyRoot, { recursive: true, force: true });
  }
});

test('installed npm tarball produces the complete snapshot matrix and PNG contact sheet', async ({
  // The page fixture captures browser errors from ordinary artifacts; the installed CLI launches its
  // own browser for this public command.
  page: _page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium');
  test.setTimeout(300_000);
  const evidence = await readCandidateEvidence();
  const tarballBytes = await readFile(evidence.tarball.path);
  expect(createHash('sha256').update(tarballBytes).digest('hex')).toBe(evidence.tarball.sha256);

  const sourcePackage = asRecord(JSON.parse(await readFile(path.resolve('package.json'), 'utf8')));
  const dependencies = asRecord(sourcePackage.devDependencies);
  const playwrightVersion = requireString(dependencies['@playwright/test']);
  const installedSkill = await readFile(
    path.join(evidence.installed.packagePath, 'skills/agentic-report/SKILL.md'),
    'utf8',
  );
  const pinnedPlaywright = [...installedSkill.matchAll(/\bplaywright@(\S+)/gu)].map(
    (match) => match[1],
  );
  expect(pinnedPlaywright.length).toBeGreaterThan(0);
  expect(pinnedPlaywright.every((version) => version === playwrightVersion)).toBe(true);
  const journeyRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-installed-e2e-'));
  const journeyPage = path.join(journeyRoot, 'page');
  const snapshotOutput = path.join(journeyRoot, 'snapshots');
  const playwrightLink = path.join(
    path.dirname(evidence.installed.packagePath),
    '@playwright',
    'test',
  );
  const environment: NodeJS.ProcessEnv = {
    PATH: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(
      path.delimiter,
    ),
    CI: 'true',
    NO_COLOR: '1',
    ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH === undefined
      ? {}
      : { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }),
  };

  try {
    // The verified tarball's CLI resolves the already pinned test dependency beside its installed
    // package. This models a consumer with Playwright installed without a second npm install.
    await mkdir(path.dirname(playwrightLink), { recursive: true });
    await symlink(
      await realpath(path.resolve('node_modules/@playwright/test')),
      playwrightLink,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await execFileAsync(evidence.installed.binary, ['init', journeyPage, '--starter', 'landing'], {
      cwd: journeyRoot,
      env: environment,
    });
    const outcome = await execFileAsync(
      evidence.installed.binary,
      ['snapshot', journeyPage, '--out', snapshotOutput, '--widths', '390,1440'],
      {
        cwd: journeyRoot,
        env: environment,
        timeout: 280_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const records = outcome.stdout
      .trim()
      .split('\n')
      .map((line) => asRecord(JSON.parse(line) as unknown));
    const results = records.filter((record) => record.type === 'result');
    expect(results).toHaveLength(1);
    const shots = results[0]?.shots;
    if (!Array.isArray(shots)) throw new Error('Installed snapshot did not report shots.');
    expect(shots).toHaveLength(8);

    const combinations: string[] = [];
    for (const value of shots) {
      const shot = asRecord(value);
      combinations.push(`${String(shot.width)}-${String(shot.scheme)}-${String(shot.motion)}`);
      for (const key of ['firstScreen', 'fullPage'] as const) {
        expect(await isPng(requireString(shot[key]))).toBe(true);
      }
    }
    expect(combinations.sort()).toEqual(
      [390, 1440]
        .flatMap((width) =>
          ['light', 'dark'].flatMap((scheme) =>
            ['normal', 'reduce'].map((motion) => `${width}-${scheme}-${motion}`),
          ),
        )
        .sort(),
    );
    const contactSheet = asRecord(results[0]?.contactSheet);
    const image = requireString(contactSheet.image);
    expect(await isPng(image)).toBe(true);
    await info.attach('installed-snapshot-contact-sheet', {
      body: await readFile(image),
      contentType: 'image/png',
    });
  } finally {
    await rm(playwrightLink, { force: true });
    await rm(journeyRoot, { recursive: true, force: true });
  }
});

async function readCandidateEvidence(): Promise<CandidateEvidence> {
  const source = asRecord(JSON.parse(await readFile(candidateEvidencePath, 'utf8')) as unknown);
  const browserInputs = source.browserInputs;
  if (!Array.isArray(browserInputs) || browserInputs.length !== 4) {
    throw new Error('Installed candidate must declare four browser inputs from pnpm pack:check.');
  }
  const inputs: BrowserInput[] = browserInputs.map((value) => {
    const input = asRecord(value);
    if (input.format !== 'single-file' && input.format !== 'directory') {
      throw new Error('Installed candidate browser input has an unknown format.');
    }
    const artifactPath = requireString(input.path);
    if (!path.isAbsolute(artifactPath)) {
      throw new Error('Installed candidate browser input path must be absolute.');
    }
    return {
      format: input.format,
      path: artifactPath,
      ...(input.expectReviewThreads === true ? { expectReviewThreads: true } : {}),
    };
  });
  const expectedFormats = ['single-file', 'directory', 'single-file', 'directory'];
  for (const [index, input] of inputs.entries()) {
    if (
      input.format !== expectedFormats[index] ||
      (input.expectReviewThreads === true) !== index >= 2
    ) {
      throw new Error(`Installed candidate browser input ${index + 1} has the wrong role.`);
    }
  }
  if (new Set(inputs.map((input) => input.path)).size !== inputs.length) {
    throw new Error('Installed candidate browser inputs contain duplicate artifacts.');
  }
  const tarball = asRecord(source.tarball);
  const installed = asRecord(source.installed);
  return {
    browserInputs: inputs,
    tarball: { path: requireString(tarball.path), sha256: requireString(tarball.sha256) },
    installed: {
      binary: requireString(installed.binary),
      packagePath: requireString(installed.packagePath),
    },
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Installed candidate evidence contains a non-object record.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Installed candidate evidence contains a missing string.');
  }
  return value;
}

async function isPng(file: string): Promise<boolean> {
  return (await readFile(file))
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}
