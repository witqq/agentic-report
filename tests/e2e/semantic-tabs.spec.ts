import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const generatedRoot = path.resolve('test-results/e2e-generated');
const artifactUrl = (name: string): string => pathToFileURL(path.join(generatedRoot, name)).href;

const tabConsumers = [
  { name: 'architecture', artifact: 'starter-architecture.html', groups: 1 },
  { name: 'incident review', artifact: 'incident-review.html', groups: 1 },
  { name: 'interactive catalog', artifact: 'interactive-catalog.html', groups: 2 },
  { name: 'launch readiness', artifact: 'launch-readiness.html', groups: 1 },
  { name: 'research', artifact: 'starter-research.html', groups: 1 },
  { name: 'tutorial', artifact: 'starter-tutorial.html', groups: 1 },
  { name: 'vendor decision', artifact: 'vendor-decision.html', groups: 1 },
  { name: 'research authoring fixture', artifact: 'research-corpus.html', groups: 1 },
] as const;

interface TabGeometry {
  readonly flexShrink: string;
  readonly label: string;
  readonly overflowWrap: string;
  readonly textLines: number;
  readonly whiteSpace: string;
}

const tabGeometry = async (tab: Locator): Promise<TabGeometry> =>
  tab.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const style = getComputedStyle(element);
    return {
      flexShrink: style.flexShrink,
      label: element.textContent ?? '',
      overflowWrap: style.overflowWrap,
      textLines: range.getClientRects().length,
      whiteSpace: style.whiteSpace,
    };
  });

const expectOperableTabs = async (page: Page, tabList: Locator): Promise<void> => {
  const tabs = tabList.getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(1);

  for (let index = 0; index < count; index += 1) {
    expect(await tabGeometry(tabs.nth(index))).toMatchObject({
      flexShrink: '0',
      overflowWrap: 'normal',
      textLines: 1,
      whiteSpace: 'nowrap',
    });
  }

  const last = tabs.nth(count - 1);
  await last.click();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#${await last.getAttribute('aria-controls')}`)).toBeVisible();

  const first = tabs.first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
};

test('semantic tab labels stay readable and overflow within their list from file URLs', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });

  for (const consumer of tabConsumers) {
    await page.goto(artifactUrl(consumer.artifact));
    const tabLists = page.getByRole('tablist');
    await expect(tabLists, consumer.name).toHaveCount(consumer.groups);

    for (let index = 0; index < consumer.groups; index += 1) {
      const tabList = tabLists.nth(index);
      await expectOperableTabs(page, tabList);
      expect(
        await tabList.evaluate((element) => getComputedStyle(element).overflowX),
        `${consumer.name} tab list owns horizontal overflow`,
      ).toBe('auto');
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${consumer.name} document remains contained`,
    ).toBe(true);

    if (mobile && consumer.name === 'incident review') {
      expect(
        await tabLists.first().evaluate((element) => element.scrollWidth > element.clientWidth),
        'the dense incident tab row uses its local scroller',
      ).toBe(true);
    }
  }
});
