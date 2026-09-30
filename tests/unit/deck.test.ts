import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/**
 * Колода слайдов в документе на стороне сборки: разметка слайдов и шагов, несколько колод на странице,
 * отказы в неверной разметке, детерминизм и код колоды только на странице с колодой.
 */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

const DECKS = [
  ':::::deck{title="Quarter" id="quarter"}',
  '::::slide',
  '## Revenue grew',
  'One line.',
  '::::',
  '',
  '::::slide{transition="push"}',
  '## Reasons',
  '',
  ':::appear',
  'New customers.',
  ':::',
  '',
  ':::appear{effect="fade"}',
  'Fewer refunds.',
  ':::',
  '',
  ':::notes',
  'Say it slowly.',
  ':::',
  '::::',
  ':::::',
  '',
  '::::deck',
  ':::slide',
  'Second deck.',
  ':::',
  '::::',
].join('\n');

async function page(markdown: string): Promise<string> {
  const root = await createTestWorkspace('deck');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Deck\nlanguage: en\n---\n\n# Deck\n\n${markdown}\n`,
  );
  return root;
}

async function failure(markdown: string): Promise<AgenticReportError> {
  const root = await page(markdown);
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    return error as AgenticReportError;
  }
  throw new Error('Build unexpectedly succeeded.');
}

describe('deck build', () => {
  it('numbers the slides and steps of each deck on its own and keeps notes as an aside', async () => {
    const root = await page(DECKS);
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    // Ловит: вторая колода продолжает нумерацию первой, шаги не посчитаны, вид перехода потерян.
    expect(html).toMatch(/<section[^>]*class="semantic-deck"[^>]*id="quarter"/u);
    expect(html).toMatch(/<section[^>]*class="semantic-deck"[^>]*id="deck-2"/u);
    const slides = [...html.matchAll(/<section class="semantic-slide"[^>]*>/gu)].map(
      (match) => match[0],
    );
    expect(slides).toHaveLength(3);
    expect(slides[0]).toMatch(/data-slide="0"/u);
    expect(slides[1]).toMatch(/data-slide="1"/u);
    expect(slides[1]).toMatch(/data-slide-steps="2"/u);
    expect(slides[1]).toMatch(/data-slide-transition="push"/u);
    expect(slides[2]).toMatch(/data-slide="0"/u);
    expect(html).toContain('data-step="2"');
    expect(html).toContain('<aside class="semantic-notes"');
    expect(html).toContain('aria-label="Slide 2 of 2"');
  });

  it('carries the deck script and styles only on a page with a deck, the same bytes twice', async () => {
    const plain = await page('Only prose.');
    await buildReport({ input: plain, output: path.join(plain, 'page.html') });
    const without = await readFile(path.join(plain, 'page.html'), 'utf8');
    // Ловит: код колоды на каждой странице — сборка под страницу его не отсекла.
    expect(without).not.toContain('agentic-report script: deck');
    expect(without).not.toContain('agentic-report style: deck');

    const root = await page(DECKS);
    await buildReport({ input: root, output: path.join(root, 'one.html') });
    await buildReport({ input: root, output: path.join(root, 'two.html') });
    const one = await readFile(path.join(root, 'one.html'));
    expect(one.toString('utf8')).toContain('agentic-report script: deck');
    expect(one.toString('utf8')).toContain('agentic-report style: deck');
    expect(one.equals(await readFile(path.join(root, 'two.html')))).toBe(true);
  });

  it('keeps the steps of a deck inside a presentation slide to the deck', async () => {
    const root = await createTestWorkspace('deck');
    workspaces.push(root);
    await writeFile(
      path.join(root, 'report.md'),
      `---\ntitle: Talk\nlanguage: en\nlayout: slides\n---\n\n# Talk\n\n:::::::section{title="With a deck" id="talk-slide"}\n${DECKS}\n:::::::\n`,
    );
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    // Ловит: презентация считает шаги колоды своими, и докладчик дважды жмёт «вперёд» на слайде без шагов.
    const slide = /<section[^>]*id="talk-slide"[^>]*>/u.exec(html)?.[0];
    expect(slide).toMatch(/data-slide-steps="0"/u);
    expect(html).toMatch(/<section class="semantic-slide"[^>]*data-slide-steps="2"/u);
  });

  it('refuses a slide outside a deck, content between slides and an empty deck', async () => {
    // Ловит: слайд без колоды молча становится блоком текста, а текст между слайдами теряется.
    const outside = await failure(':::slide\nAlone.\n:::\n');
    expect(outside.diagnostic.code).toBe('INVALID_DIRECTIVE_PLACEMENT');
    expect(outside.diagnostic.message).toMatch(/slide must be nested directly inside deck/u);
    const between = await failure(
      '::::deck\n:::slide\nOne.\n:::\n\nStray text.\n\n:::slide\nTwo.\n:::\n::::\n',
    );
    expect(between.diagnostic.message).toMatch(/holds only slide directives/u);
    const empty = await failure('::::deck\n::::\n');
    expect(empty.diagnostic.message).toMatch(/from 1 to 60 slides/u);
  });
});
