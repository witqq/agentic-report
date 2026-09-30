import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page, TestInfo } from '@playwright/test';

import { buildReport } from '../../dist/node/index.js';
import { expect, test } from './fixtures.js';

/**
 * Where a reader lands: after a jump from the contents, after an anchor into a closed disclosure, and
 * after a reload. Chapters are `:::section{id}` blocks (the section is the anchor, its heading is what
 * the reader looks for), each with a tall disclosure, so the height above a target depends on which
 * disclosures are open.
 */
const root = path.resolve('test-results/e2e-reading-position');
const layouts = ['document', 'landing'] as const;
const url = (layout: string): string => pathToFileURL(path.join(root, `${layout}.html`)).href;

function source(layout: string): string {
  const para = (count: number, label: string): string =>
    Array.from(
      { length: count },
      (_, index) =>
        `${label} paragraph ${index + 1}. ${'A sentence that fills the line of the chapter. '.repeat(6)}`,
    ).join('\n\n');
  // The second tab of chapter 5 is hidden until chosen; its heading is the target of an anchor.
  const tabs =
    `::::tabs{title="Views of chapter 5"}\n:::tab{label="Summary"}\n${para(2, 'Summary')}\n:::\n` +
    `:::tab{label="Notes"}\n### Tab note\n\n${para(4, 'Tab note')}\n:::\n::::\n\n`;
  const chapters = [1, 2, 3, 4, 5]
    .map(
      (index) =>
        `:::::section{title="Chapter ${index}" id="chapter-${index}"}\n\n${para(6, `Chapter ${index}`)}\n\n` +
        `:::disclosure{title="Details of chapter ${index}"}\n${index === 3 ? '### Inner note\n\n' : ''}` +
        `${para(30, `Detail ${index}`)}\n:::\n\n${index === 5 ? tabs : ''}${para(3, `Closing ${index}`)}\n\n:::::\n`,
    )
    .join('\n');
  return `---\ntitle: Reading position\nlanguage: en\nlayout: ${layout}\n---\n\n# Reading position\n\nIntroduction with [a link to the inner note](#inner-note) and [a link to the tab note](#tab-note).\n\n${chapters}`;
}

test.beforeAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const layout of layouts) {
    const input = path.join(root, `${layout}-source`);
    await mkdir(input, { recursive: true });
    await writeFile(path.join(input, 'report.md'), source(layout));
    await buildReport({ input, output: path.join(root, `${layout}.html`) });
  }
});

/** Resolves once the page has not scrolled for 400 ms: the smooth scroll and every correction are over. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(done, 400);
        function done(): void {
          removeEventListener('scroll', again);
          resolve();
        }
        function again(): void {
          clearTimeout(timer);
          timer = setTimeout(done, 400);
        }
        addEventListener('scroll', again, { passive: true });
      }),
  );
}

/** Distance of a chapter heading from the clearance under the top bar, in CSS pixels. */
async function headingOffset(page: Page, chapter: number): Promise<number> {
  return page.evaluate((id) => {
    const heading = document.querySelector(`#${id} > h2`);
    const clearance = Number.parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    return (heading?.getBoundingClientRect().top ?? Number.NaN) - clearance;
  }, `chapter-${chapter}`);
}

async function openContents(page: Page, testInfo: TestInfo, layout: string): Promise<void> {
  if (testInfo.project.name === 'desktop-chromium' && layout === 'document') return;
  await page.locator('[data-nav-toggle]').click();
  await expect(page.locator('[data-nav-dialog]')).toBeVisible();
}

for (const layout of layouts) {
  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`${layout}, ${motion} motion: a contents jump lands the chapter heading under the top bar even when disclosures above change height during it`, async ({
      page,
    }, testInfo) => {
      // Defects caught: (1) the landing point was taken once, before the jump, so disclosures opened
      // above the target while the smooth scroll ran left the heading a screen or more below the bar;
      // (2) a chapter section is the anchor and its `scroll-margin-top` did not match its padding,
      // so even a still page put the heading 16 px under the line the contents highlight measures
      // from, and after the smooth scroll the previous chapter stayed highlighted.
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto(url(layout));
      // The reader opened the first chapter's disclosure before jumping.
      await page.locator('#chapter-1 details > summary').click();
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await openContents(page, testInfo, layout);
      // Disclosures above the target open while the jump is under way (a reader's click, a late block).
      await page.evaluate(() => {
        addEventListener(
          'scroll',
          () => {
            for (const id of ['chapter-2', 'chapter-3'])
              document
                .querySelector<HTMLDetailsElement>(`#${id} details`)
                ?.setAttribute('open', '');
          },
          { once: true },
        );
      });
      await page.locator('[data-navigation] a[href="#chapter-4"]').click();
      await settled(page);
      expect(Math.abs(await headingOffset(page, 4))).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveAttribute(
        'href',
        '#chapter-4',
      );
      // Back up the page past the now open disclosures: the same landing point.
      await openContents(page, testInfo, layout);
      await page.locator('[data-navigation] a[href="#chapter-2"]').click();
      await settled(page);
      expect(Math.abs(await headingOffset(page, 2))).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-navigation] a[aria-current="location"]')).toHaveAttribute(
        'href',
        '#chapter-2',
      );
    });
  }

  test(`${layout}: a contents jump is one smooth motion even when heights above the target change during it`, async ({
    page,
  }, testInfo) => {
    // Defect caught: the jump re-aimed by calling the browser's smooth `scrollTo` again whenever the
    // height above the target changed; each call restarts the browser's curve from zero speed, so the
    // page stopped and set off again (a velocity drop from ~96 to 1 px per frame on the owner's page).
    // Read from a per-frame record: no stop halfway, no turn back, no speed jump between frames.
    await page.goto(url(layout));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await openContents(page, testInfo, layout);
    // A third of the way down, the disclosures between the reader and the target open (a late block).
    await page.evaluate(() => {
      const distance = document.getElementById('chapter-4')?.getBoundingClientRect().top ?? 0;
      const grow = (): void => {
        if (window.scrollY < distance / 3) return;
        removeEventListener('scroll', grow);
        for (const id of ['chapter-2', 'chapter-3'])
          document.querySelector<HTMLDetailsElement>(`#${id} details`)?.setAttribute('open', '');
      };
      addEventListener('scroll', grow, { passive: true });
    });
    await page.locator('[data-navigation] a[href="#chapter-4"]').click();
    // Started after the click, the recorder runs after the page's own frame step in every frame and so
    // reads the position painted in that frame.
    const frames = await page.evaluate(
      () =>
        new Promise<Array<[number, number]>>((resolve) => {
          const record: Array<[number, number]> = [];
          const loop = (time: number): void => {
            record.push([time, window.scrollY]);
            if (record.length < 240) requestAnimationFrame(loop);
            else resolve(record);
          };
          requestAnimationFrame(loop);
        }),
    );
    const positions = frames.map(([, y]) => y);
    const end = positions.at(-1) ?? 0;
    const start = positions[0] ?? 0;
    expect(end - start).toBeGreaterThan(1000);
    // Speed in pixels per 60 Hz frame from the frame timestamps, over the middle of the path.
    const speeds: number[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const [time, y] = frames[index] ?? [0, 0];
      const [previousTime, previousY] = frames[index - 1] ?? [0, 0];
      const progress = (previousY - start) / (end - start);
      if (progress < 0.1 || progress > 0.9) continue;
      speeds.push(((y - previousY) / Math.max(1, time - previousTime)) * (1000 / 60));
    }
    const top = Math.max(...speeds);
    expect(
      Math.min(...speeds),
      `stop halfway in ${speeds.map(Math.round).join(' ')}`,
    ).toBeGreaterThan(0.5);
    let jump = 0;
    for (let index = 1; index < speeds.length; index += 1)
      jump = Math.max(jump, Math.abs((speeds[index] ?? 0) - (speeds[index - 1] ?? 0)));
    expect(jump / top, `speed jump in ${speeds.map(Math.round).join(' ')}`).toBeLessThan(0.35);
    await settled(page);
    expect(Math.abs(await headingOffset(page, 4))).toBeLessThanOrEqual(1);
  });

  test(`${layout}: an anchor into a closed disclosure opens it and shows the target under the top bar`, async ({
    page,
  }) => {
    // Defect caught: a link or an address whose target sits inside a closed disclosure scrolled to
    // an element with no box (or relied on one engine's auto-expansion) and left the reader at the
    // closed summary, or landed before the disclosure had grown.
    await page.goto(url(layout));
    await expect(page.locator('#chapter-3 details')).not.toHaveAttribute('open', '');
    await page.locator('article a[href="#inner-note"]').click();
    await settled(page);
    await expect(page.locator('#chapter-3 details')).toHaveAttribute('open', '');
    await expect(page.locator('#inner-note')).toBeInViewport();
    const offset = await page.evaluate(() => {
      const target = document.getElementById('inner-note');
      const clearance = Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      );
      return (target?.getBoundingClientRect().top ?? Number.NaN) - clearance;
    });
    expect(Math.abs(offset)).toBeLessThanOrEqual(1);
    // The same target from the address of a fresh page.
    await page.goto('about:blank');
    await page.goto(`${url(layout)}#inner-note`);
    await settled(page);
    await expect(page.locator('#chapter-3 details')).toHaveAttribute('open', '');
    await expect(page.locator('#inner-note')).toBeInViewport();
  });

  test(`${layout}: an anchor into an inactive tab panel chooses its tab and shows the target under the top bar`, async ({
    page,
  }) => {
    // Defect caught: the target of a link or an address inside a hidden tab panel has no box, so the
    // jump stopped without moving and the reader stayed where they were, with the target's tab unchosen.
    const offset = async (): Promise<number> =>
      page.evaluate(() => {
        const target = document.getElementById('tab-note');
        const clearance = Number.parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingTop,
        );
        return (target?.getBoundingClientRect().top ?? Number.NaN) - clearance;
      });
    const notesTab = page.getByRole('tab', { name: 'Notes' });
    await page.goto(url(layout));
    await expect(page.locator('#tab-note')).toBeHidden();
    await page.locator('article a[href="#tab-note"]').click();
    await settled(page);
    await expect(notesTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(page.locator('#tab-note')).toBeInViewport();
    expect(Math.abs(await offset())).toBeLessThanOrEqual(1);
    // The same target from the address of a fresh page.
    await page.goto('about:blank');
    await page.goto(`${url(layout)}#tab-note`);
    await settled(page);
    await expect(notesTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-note')).toBeInViewport();
    expect(Math.abs(await offset())).toBeLessThanOrEqual(1);
  });

  test(`${layout}: an address with a chapter anchor lands on it on opening and on reload, and a reload after reading on keeps the reader in place`, async ({
    page,
  }) => {
    // Defects caught: the first-load alignment waited for the first `scrollend`, so with smooth motion
    // the page stayed where the early fragment scroll put it and the reader's first wheel turn yanked
    // them back to the anchor; a reload with the anchor in the address threw away where the reader
    // had read on to.
    await page.goto('about:blank');
    await page.goto(`${url(layout)}#chapter-4`);
    await settled(page);
    expect(Math.abs(await headingOffset(page, 4))).toBeLessThanOrEqual(1);
    await page.reload();
    await settled(page);
    expect(Math.abs(await headingOffset(page, 4))).toBeLessThanOrEqual(1);
    // Read on: the next chapter's heading is now near the top.
    await page.mouse.wheel(0, 900);
    await settled(page);
    const before = await headingOffset(page, 4);
    expect(before).toBeLessThan(-600);
    await page.reload();
    await settled(page);
    expect(Math.abs((await headingOffset(page, 4)) - before)).toBeLessThanOrEqual(2);
  });

  test(`${layout}: an anchor set in the address of an open page, or reached by going back, lands like a link`, async ({
    page,
  }) => {
    // Defect caught: an anchor changed without a link (the address bar, `location.hash`, going back
    // in history, where the browser scrolls to the anchor again) was left to the browser, which put
    // the chapter heading 16 px below the line the contents highlight measures from.
    await page.goto(url(layout));
    await page.evaluate(() => {
      window.location.hash = 'chapter-2';
    });
    await settled(page);
    expect(Math.abs(await headingOffset(page, 2))).toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, 700);
    await settled(page);
    expect(await headingOffset(page, 2)).toBeLessThan(-400);
    await page.evaluate(() => {
      window.location.hash = 'chapter-4';
    });
    await settled(page);
    expect(Math.abs(await headingOffset(page, 4))).toBeLessThanOrEqual(1);
    await page.goBack();
    await settled(page);
    expect(page.url()).toContain('#chapter-2');
    expect(Math.abs(await headingOffset(page, 2))).toBeLessThanOrEqual(1);
  });

  test(`${layout}: without the runtime, the browser's own anchor jump puts the chapter heading on the line`, async ({
    browser,
  }, testInfo) => {
    // Defect caught: the section's `scroll-margin-top` did not undo its top padding and chapter rule, so
    // with scripts off (and in find-in-page or any jump the runtime does not handle) the browser put the
    // chapter heading 16–17 px below the line under the top bar.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: testInfo.project.use.viewport ?? { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    for (const chapter of [2, 4]) {
      await page.goto('about:blank');
      await page.goto(`${url(layout)}#chapter-${chapter}`);
      // The page scrolls smoothly (`scroll-behavior: smooth`); wait until the heading stops moving.
      let last = Number.NaN;
      await expect
        .poll(async () => {
          const now = await headingOffset(page, chapter);
          const still = Math.abs(now - last) < 0.5;
          last = now;
          return still;
        })
        .toBe(true);
      expect(Math.abs(last), `chapter ${chapter}`).toBeLessThanOrEqual(1);
    }
    await context.close();
  });

  test(`${layout}: a reload keeps the disclosures the reader opened and what they were reading in place`, async ({
    page,
  }) => {
    // Defect caught: after a reload every disclosure closed again while the browser restored the old
    // scroll offset, so the reader landed thousands of pixels away from the paragraph they were on.
    await page.goto('about:blank');
    await page.goto(url(layout));
    await page.locator('#chapter-1 details > summary').click();
    await page.locator('#chapter-2 details > summary').click();
    const reading = page.locator('#chapter-3 p').first();
    await reading.evaluate((element) => {
      const clearance = Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      );
      scrollBy({ top: element.getBoundingClientRect().top - clearance - 40, behavior: 'instant' });
    });
    await settled(page);
    const before = await reading.evaluate((element) => element.getBoundingClientRect().top);
    await page.reload();
    await settled(page);
    await expect(page.locator('#chapter-1 details')).toHaveAttribute('open', '');
    await expect(page.locator('#chapter-2 details')).toHaveAttribute('open', '');
    await expect(page.locator('#chapter-3 details')).not.toHaveAttribute('open', '');
    const after = await reading.evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    // A fresh opening of the page starts from the authored state, not from the last session.
    await page.goto('about:blank');
    await page.goto(url(layout));
    await expect(page.locator('#chapter-1 details')).not.toHaveAttribute('open', '');
  });
}
