import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { prepareReport } from '../../dist/node/core/prepare-report.js';
import { renderLiveShell } from '../../dist/node/live/shell.js';
import type { LiveSnapshot, LiveSubject } from '../../src/live/contract.js';

const root = path.resolve('test-results/live-browser');
let initial: LiveSnapshot;
let updated: LiveSnapshot;
let singleTheme: LiveSnapshot;
let shellPath: string;

test.beforeAll(async () => {
  await mkdir(root, { recursive: true });
  const source = path.join(root, 'source');
  await mkdir(source, { recursive: true });
  const entry = path.join(source, 'report.md');
  const markdown = [
    '---',
    'title: A document we can discuss',
    'language: en',
    'theme: calm-paper',
    'motion: none',
    '---',
    '# A document we can discuss',
    'The reader and the agent work on the same source.',
    ...Array.from(
      { length: 8 },
      (_, i) =>
        `:::section{title="Evidence ${i + 1}" id="evidence-${i + 1}"}\n\nThis paragraph explains the evidence for section ${i + 1}. The source remains Markdown, while the reader can ask for examples and see a revised edition.\n\n${'Detailed evidence gives the reader a stable place to continue reading. '.repeat(5)}\n\n:::`,
    ),
  ].join('\n\n');
  await writeFile(entry, markdown);
  const bundle = async (name: string): Promise<string> => {
    const compiled = await build({
      entryPoints: [path.resolve(`dist/node/live/${name}.js`)],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
    });
    const code = compiled.outputFiles[0]?.text;
    if (!code) throw new Error('Missing bundle');
    return code;
  };
  const bridge = await bundle('bridge');
  const stage = async (id: string, since?: string): Promise<LiveSnapshot> => {
    const prepared = await prepareReport({
      input: source,
      format: 'directory',
      manifestDefaults: { themeSwitcher: true },
      ...(since ? { since } : {}),
    });
    const directory = path.join(root, id);
    await mkdir(directory, { recursive: true });
    for (const resource of prepared.resourceFiles) {
      const dest = path.join(directory, resource.relativePath);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, resource.bytes);
    }
    await writeFile(path.join(directory, 'bridge.js'), bridge);
    const manifests = JSON.stringify(
      Object.fromEntries(prepared.variants.map((v) => [v.locale, v.reviewManifest])),
    )
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;');
    await writeFile(
      path.join(directory, 'index.html'),
      prepared.html.replace(
        '</body>',
        `<template data-live-manifests>${manifests}</template><script src="bridge.js" defer></script></body>`,
      ),
    );
    return {
      version: 1,
      document: {
        url: pathToFileURL(path.join(directory, 'index.html')).href,
        revision: prepared.reviewManifest.reportRevision,
        title: 'A document we can discuss',
      },
      agent: 'ready',
      connection: { mode: 'current', threadId: 'author-session' },
      questions: [],
    };
  };
  initial = await stage('first');
  await writeFile(
    entry,
    markdown.replace(
      'The reader and the agent work on the same source.',
      'The reader and the agent work on the same source. This added explanation appears immediately in the next edition.',
    ),
  );
  updated = await stage('second', path.join(root, 'first/index.html'));
  await writeFile(
    entry,
    markdown.replace(
      'theme: calm-paper',
      'theme: { extends: calm-paper, name: fixed-night, scheme: dark }\nthemeSwitcher: false',
    ),
  );
  singleTheme = await stage('fixed-night');
  shellPath = path.join(root, 'reader.html');
  await writeFile(shellPath, renderLiveShell(await bundle('browser')));
});

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const streams: Array<{ onmessage: ((event: MessageEvent<string>) => void) | null }> = [];
    class FixtureEvents {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        streams.push(this);
      }
      close(): void {}
    }
    Object.assign(window, {
      EventSource: FixtureEvents,
      __liveEmit: (snapshot: unknown) => {
        for (const stream of streams)
          stream.onmessage?.(
            new MessageEvent('message', { data: JSON.stringify({ type: 'snapshot', snapshot }) }),
          );
      },
      __liveDelta: (id: string, text: string) => {
        for (const stream of streams)
          stream.onmessage?.(
            new MessageEvent('message', { data: JSON.stringify({ type: 'delta', id, text }) }),
          );
      },
      fetch: async (url: string, options: RequestInit) => {
        if (url === '/questions') {
          const state = window as unknown as { __liveSubmissionCount?: number };
          state.__liveSubmissionCount = (state.__liveSubmissionCount ?? 0) + 1;
        }
        Object.assign(
          window,
          url === '/questions/cancel'
            ? { __liveCancelled: JSON.parse(String(options.body)) }
            : { __liveSubmitted: JSON.parse(String(options.body)) },
        );
        if ((window as unknown as { __liveHoldResponse?: boolean }).__liveHoldResponse)
          await new Promise<void>((resolve) => Object.assign(window, { __liveResolve: resolve }));
        return new Response('{}', { status: 202 });
      },
    });
  });
  await page.goto(pathToFileURL(shellPath).href);
  await emit(page, initial);
  await expect(page.locator('iframe:not([data-pending])')).toHaveCount(1);
  await expect(page.locator('[data-live-session]')).toHaveText('Current Codex conversation');
  await expect(page.locator('[data-live-session]')).toHaveAttribute('title', 'author-session');
}
async function emit(page: Page, snapshot: LiveSnapshot): Promise<void> {
  await page.evaluate(
    (value) => (window as unknown as { __liveEmit: (s: LiveSnapshot) => void }).__liveEmit(value),
    snapshot,
  );
}

test('selected text reaches the question and replies stream without losing the draft', async ({
  page,
}) => {
  // A chat that ignores selected text, or clears input on an agent event, fails here.
  await open(page);
  const document = page.frameLocator('iframe:not([data-pending])');
  await document
    .locator('#evidence-1 p')
    .first()
    .evaluate((el) => {
      const range = new Range();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await document.locator('[data-live-ask]').click();
  await expect(document.locator('[data-live-inline-form]')).toContainText('evidence for section 1');
  await document.locator('[data-live-inline-input]').fill('Add a concrete example.');
  await document.locator('[data-live-inline-input]').press('Enter');
  await expect(document.locator('[data-live-inline-form]')).toBeHidden();
  const submitted = await page.evaluate(
    () =>
      (window as unknown as { __liveSubmitted: { id: string; text: string; subject: LiveSubject } })
        .__liveSubmitted,
  );
  expect(submitted.text).toBe('Add a concrete example.');
  expect(submitted.subject.revision).toBe(initial.document.revision);
  expect(submitted.subject.quote).toContain('evidence for section 1');
  await emit(page, {
    ...initial,
    agent: 'working',
    questions: [
      {
        id: submitted.id,
        text: submitted.text,
        subject: submitted.subject,
        binding: 'exact',
        status: 'sending',
        answer: '',
      },
    ],
  });
  await page.locator('[data-live-input]').fill('A follow-up I am still writing');
  await page.evaluate(
    ({ id }) =>
      (window as unknown as { __liveDelta: (id: string, text: string) => void }).__liveDelta(
        id,
        'An example is arriving…',
      ),
    { id: submitted.id },
  );
  await expect(page.locator('[data-live-answer]')).toHaveText('An example is arriving…');
  await expect(page.locator('[data-live-input]')).toHaveValue('A follow-up I am still writing');
  await page.screenshot({ path: path.join(root, `discussion-${test.info().project.name}.png`) });
});

test('rapid streaming follows the bottom and preserves a reader scrolling into history', async ({
  page,
}) => {
  // Smooth automatic scrolling can mistake an intermediate position for reader intent.
  await open(page);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  await emit(page, {
    ...initial,
    agent: 'working',
    questions: [{ id: 'stream', text: 'Explain the evidence', status: 'sending', answer: '' }],
  });
  const history = page.locator('[data-live-history]');
  const followed = await history.evaluate((el) => {
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    const delta = (window as unknown as { __liveDelta: (id: string, text: string) => void })
      .__liveDelta;
    delta('stream', 'Streaming line\n'.repeat(150));
    delta('stream', 'Streaming line\n'.repeat(170));
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  });
  expect(followed).toBeLessThan(2);
  await expect(page.locator('[data-live-new-messages]')).toBeHidden();
  const position = await history.evaluate((el) => {
    el.scrollTo({ top: 100, behavior: 'instant' });
    const before = el.scrollTop;
    (window as unknown as { __liveDelta: (id: string, text: string) => void }).__liveDelta(
      'stream',
      'Another line\n'.repeat(50),
    );
    return { before, after: el.scrollTop };
  });
  expect(position.after).toBe(position.before);
  await expect(page.locator('[data-live-new-messages]')).toBeVisible();
});

test('Enter sends a question while Shift+Enter and composition preserve the draft', async ({
  page,
}) => {
  await open(page);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  const input = page.locator('[data-live-input]');
  await input.fill('First line');
  await input.press('Shift+Enter');
  await input.press('End');
  await input.press('s');
  await expect(input).toHaveValue('First line\ns');
  await input.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  expect(await page.evaluate(() => '__liveSubmitted' in window)).toBe(false);
  await input.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __liveSubmitted?: { text: string } }).__liveSubmitted?.text,
      ),
    )
    .toBe('First line\ns');
  await expect(input).toHaveValue('');
});

test('Enter on contextual Close closes without sending and keeps the draft for reopening', async ({
  page,
}) => {
  await open(page);
  const frame = page.frameLocator('iframe:not([data-pending])');
  const select = async (): Promise<void> => {
    await frame
      .locator('#evidence-1 p')
      .first()
      .evaluate((el) => {
        const range = new Range();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    await frame.locator('[data-live-ask]').click();
  };
  await select();
  await frame.locator('[data-live-inline-input]').fill('Keep this unsent draft');
  await frame.getByRole('button', { name: 'Close question', exact: true }).press('Enter');
  await expect(frame.locator('[data-live-inline-form]')).toBeHidden();
  expect(await page.evaluate(() => '__liveSubmitted' in window)).toBe(false);
  await select();
  await expect(frame.locator('[data-live-inline-input]')).toHaveValue('Keep this unsent draft');
});

test('chat keeps message identity, formats safe agent text and exposes ordered cancellable waiting questions', async ({
  page,
}) => {
  await open(page);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  const questions: LiveSnapshot['questions'] = [
    {
      id: 'active',
      text: '<img src=x onerror=alert(1)>',
      status: 'sending',
      answer:
        '**Answer**\n\n- A point\n\n```js\nconst value = 1;\n```\n\n[Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>',
    },
    { id: 'waiting-one', text: 'First waiting question', status: 'queued', answer: '' },
    { id: 'waiting-two', text: 'Second waiting question', status: 'queued', answer: '' },
  ];
  await emit(page, { ...initial, agent: 'working', questions });
  const article = page.locator('[data-question-id="active"]');
  await expect(article.locator('[data-live-role="user"]')).toContainText('<img src=x');
  await expect(article.locator('strong')).toHaveText('Answer');
  await expect(article.locator('pre code')).toHaveText('const value = 1;');
  await expect(article.locator('img,script')).toHaveCount(0);
  await expect(article.locator('a')).not.toHaveAttribute('href', /javascript:/u);
  await expect(page.locator('[data-live-active]')).toHaveText('Agent is answering your question…');
  await expect(page.locator('[data-live-queue-list] li')).toHaveCount(2);
  await article.evaluate((el) => Object.assign(window, { __messageNode: el }));
  await page.locator('[data-queued-id="waiting-two"] button').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __liveCancelled?: { id: string } }).__liveCancelled?.id,
      ),
    )
    .toBe('waiting-two');
  await emit(page, {
    ...initial,
    agent: 'working',
    questions: questions.map((q) => (q.id === 'waiting-two' ? { ...q, status: 'cancelled' } : q)),
  });
  await expect(page.locator('[data-live-queue-list] li')).toHaveCount(1);
  await expect(
    page.locator('[data-question-id="waiting-two"] [data-live-role="system"]'),
  ).toHaveText('Cancelled before sending.');
  expect(
    await article.evaluate(
      (el) => (window as unknown as { __messageNode: Element }).__messageNode === el,
    ),
  ).toBe(true);
  await page.screenshot({ path: path.join(root, `queue-${test.info().project.name}.png`) });
});

test('panel width and visual settings are usable and survive document replacement', async ({
  page,
}) => {
  await open(page);
  const compact = test.info().project.name.startsWith('mobile');
  if (compact) await page.locator('[data-live-toggle]').click();
  await page.locator('[data-live-settings-toggle]').click();
  await page.locator('[data-live-scheme]').selectOption('dark');
  await page.locator('[data-live-highlights]').uncheck();
  if (!compact) {
    await page.locator('[data-live-resizer]').focus();
    const before = Number(await page.locator('[data-live-resizer]').getAttribute('aria-valuenow'));
    await page.locator('[data-live-resizer]').press('ArrowLeft');
    expect(
      Number(await page.locator('[data-live-resizer]').getAttribute('aria-valuenow')),
    ).toBeGreaterThan(before);
  } else await expect(page.locator('[data-live-resizer]')).toBeHidden();
  const themes = page.locator('[data-live-theme] option');
  expect(await themes.count()).toBeGreaterThan(1);
  await page.locator('[data-live-theme]').selectOption('neutral');
  const first = page.frameLocator('iframe:not([data-pending])');
  await expect(first.locator('html')).toHaveAttribute('data-theme', 'neutral');
  await emit(page, updated);
  await expect(page.locator('iframe:not([data-pending])')).toHaveAttribute(
    'src',
    updated.document.url,
  );
  const next = page.frameLocator('iframe:not([data-pending])');
  await expect(next.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect(next.locator('html')).toHaveAttribute('data-theme', 'neutral');
  await expect(next.locator('[data-localized-page-variant]')).toHaveAttribute(
    'data-edition-layer',
    'off',
  );
  await expect(page.locator('[data-live-highlights]')).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(root, `settings-${test.info().project.name}.png`) });
  await page.locator('[data-live-reset]').click();
  await expect(next.locator('html')).toHaveAttribute('data-theme', 'calm-paper');
  await expect(page.locator('[data-live-highlights]')).toBeChecked();
});

test('a document with one dark theme exposes its actual appearance without unusable choices', async ({
  page,
}) => {
  await open(page);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  await emit(page, singleTheme);
  await expect(page.locator('iframe:not([data-pending])')).toHaveAttribute(
    'src',
    singleTheme.document.url,
  );
  await page.locator('[data-live-settings-toggle]').click();
  await expect(page.locator('[data-live-theme]')).toBeDisabled();
  await expect(page.locator('[data-live-scheme]')).toBeDisabled();
  await expect(page.locator('[data-live-scheme]')).toHaveValue('dark');
});

test('contextual draft survives a new edition and refuses its old selection until selected again', async ({
  page,
}) => {
  await open(page);
  const select = async (): Promise<void> => {
    const frame = page.frameLocator('iframe:not([data-pending])');
    await frame
      .locator('#evidence-1 p')
      .first()
      .evaluate((el) => {
        const range = new Range();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    await frame.locator('[data-live-ask]').click();
  };
  await select();
  await page
    .frameLocator('iframe:not([data-pending])')
    .locator('[data-live-inline-input]')
    .fill('Keep this passage question');
  await emit(page, updated);
  await expect(page.locator('iframe:not([data-pending])')).toHaveAttribute(
    'src',
    updated.document.url,
  );
  const next = page.frameLocator('iframe:not([data-pending])');
  await expect(next.locator('[data-live-inline-input]')).toHaveValue('Keep this passage question');
  await expect(next.locator('[data-live-inline-input]')).toBeFocused();
  await expect(next.locator('[data-live-inline-send]')).toBeDisabled();
  await expect(next.locator('[data-live-inline-note]')).toContainText('Document changed');
  await next.locator('[data-live-inline-input]').press('Escape');
  await expect(next.locator('[data-live-inline-form]')).toBeHidden();
  await select();
  await next.locator('[data-live-inline-input]').press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __liveSubmitted?: { subject: LiveSubject } }).__liveSubmitted
            ?.subject.revision,
      ),
    )
    .toBe(updated.document.revision);
});

test('late contextual admission keeps a newer draft and the composer fits the viewport', async ({
  page,
}) => {
  await open(page);
  const frame = page.frameLocator('iframe:not([data-pending])');
  await frame
    .locator('#evidence-1 p')
    .first()
    .evaluate((el) => {
      const range = new Range();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await frame.locator('[data-live-ask]').click();
  await frame.locator('[data-live-inline-input]').fill('First draft');
  await page.evaluate(() => Object.assign(window, { __liveHoldResponse: true }));
  await frame.locator('[data-live-inline-input]').press('Enter');
  await expect(frame.locator('[data-live-inline-send]')).toBeDisabled();
  await frame.locator('[data-live-inline-input]').fill('A newer draft');
  await expect.poll(() => page.evaluate(() => '__liveResolve' in window)).toBe(true);
  await page.evaluate(() => (window as unknown as { __liveResolve: () => void }).__liveResolve());
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-close]').click();
  await expect(frame.locator('[data-live-inline-input]')).toHaveValue('A newer draft');
  expect(
    await frame.locator('[data-live-inline-form]').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    }),
  ).toBe(true);
  await page.screenshot({ path: path.join(root, `context-${test.info().project.name}.png`) });
});

test('a pending contextual send rejoins its admission after frame replacement without resubmitting', async ({
  page,
}) => {
  await open(page);
  const first = page.frameLocator('iframe:not([data-pending])');
  await first
    .locator('#evidence-1 p')
    .first()
    .evaluate((el) => {
      const range = new Range();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await first.locator('[data-live-ask]').click();
  await first.locator('[data-live-inline-input]').fill('Pending admission');
  await page.evaluate(() => Object.assign(window, { __liveHoldResponse: true }));
  await first.locator('[data-live-inline-input]').press('Enter');
  await expect.poll(() => page.evaluate(() => '__liveResolve' in window)).toBe(true);
  const submitted = await page.evaluate(
    () => (window as unknown as { __liveSubmitted: { id: string } }).__liveSubmitted.id,
  );
  await emit(page, updated);
  await expect(page.locator('iframe:not([data-pending])')).toHaveAttribute(
    'src',
    updated.document.url,
  );
  const next = page.frameLocator('iframe:not([data-pending])');
  await expect(next.locator('[data-live-inline-send]')).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __liveResolve: () => void }).__liveResolve());
  await expect(next.locator('[data-live-inline-form]')).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as unknown as { __liveSubmitted: { id: string } }).__liveSubmitted.id,
    ),
  ).toBe(submitted);
  expect(
    await page.evaluate(
      () => (window as unknown as { __liveSubmissionCount: number }).__liveSubmissionCount,
    ),
  ).toBe(1);
});

test('an updated edition keeps reading position, dark scheme and composer focus', async ({
  page,
}) => {
  await open(page);
  const frame = page.frameLocator('iframe:not([data-pending])');
  await frame
    .locator('#evidence-4 p')
    .first()
    .evaluate((el) => {
      document.documentElement.dataset.scheme = 'dark';
      window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' });
    });
  const before = await frame
    .locator('#evidence-4 p')
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  await page.locator('[data-live-input]').fill('Keep this unfinished question');
  await emit(page, updated);
  await expect(page.locator('iframe:not([data-pending])')).toHaveAttribute(
    'src',
    updated.document.url,
  );
  const next = page.frameLocator('iframe:not([data-pending])');
  await expect
    .poll(() =>
      next
        .locator('#evidence-4 p')
        .first()
        .evaluate((el, position) => Math.abs(el.getBoundingClientRect().top - position), before),
    )
    .toBeLessThan(4);
  await expect(next.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect(page.locator('[data-live-input]')).toHaveValue('Keep this unfinished question');
  await expect(page.locator('[data-live-input]')).toBeFocused();
  expect(await next.locator('[data-edition-change]').count()).toBeGreaterThan(0);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-close]').click();
  await page.screenshot({ path: path.join(root, `updated-${test.info().project.name}.png`) });
  await next.locator('[data-edition-change]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, `changes-${test.info().project.name}.png`) });
});

test('compact discussion stays inside the viewport and reduced motion has no update animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  if (test.info().project.name.startsWith('mobile'))
    await page.locator('[data-live-toggle]').click();
  await expect(page.locator('[data-live-input]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator('[data-live-document]').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('[data-live-status]')
      .evaluate((el) => getComputedStyle(el, '::before').animationName),
  ).toBe('none');
});
