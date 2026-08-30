import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

const root = path.resolve('test-results/e2e-generated');
const formats = [
  {
    name: 'single-file',
    normal: path.join(root, 'share-default.html'),
    shared: path.join(root, 'share-safe.html'),
  },
  {
    name: 'directory',
    normal: path.join(root, 'share-default-directory/index.html'),
    shared: path.join(root, 'share-safe-directory/index.html'),
  },
] as const;

test('share-safe artifacts use non-link labels while default artifacts retain source links', async ({
  page,
}) => {
  for (const fixture of formats) {
    await page.goto(pathToFileURL(fixture.shared).href);
    const neutralized = page.locator('span.semantic-source-link[data-source-link-neutralized]');
    await expect(neutralized, fixture.name).toHaveCount(6);
    await expect(neutralized.nth(0)).toHaveText('first.ts:10');
    await expect(neutralized.nth(1)).toHaveText('unicode-combining.ts:11');
    await expect(neutralized.nth(2)).toHaveText('unicode-symbol.ts:12');
    await expect(neutralized.nth(3)).toHaveText('second.ts:20');
    await expect(neutralized.nth(4)).toHaveText('wrapped.ts:25');
    await expect(neutralized.nth(5)).toHaveText('source:30');
    await expect(page.locator('a.semantic-source-link')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'external link' })).toHaveAttribute(
      'href',
      'https://example.com/source',
    );
    const sharedHtml = await page.content();
    expect(sharedHtml).not.toContain('%2FUsers%2Ffixture%2Fworktree-a');
    expect(sharedHtml).not.toContain('%2Fworkspace%2Fsecond.ts');
    expect(sharedHtml).not.toContain('%252FUsers%252Falice%252Fhidden.ts');
    expect(sharedHtml).not.toContain('/Users/alice/private');
    expect(sharedHtml).not.toContain('127.0.0.1:7789/open');
    expect(sharedHtml).toContain('/Users/fixture/authored-note');

    await page.goto(pathToFileURL(fixture.normal).href);
    const workstationLinks = page.locator('a.semantic-source-link[data-source-link]');
    await expect(workstationLinks, fixture.name).toHaveCount(6);
    await expect(workstationLinks.nth(0)).toHaveAttribute(
      'href',
      /%2FUsers%2Ffixture%2Fworktree-a/u,
    );
    await expect(workstationLinks.nth(1)).toHaveText('src/é/file.ts:11');
    await expect(workstationLinks.nth(2)).toHaveText('icons/📁/file.ts:12');
    await expect(workstationLinks.nth(3)).toHaveAttribute('href', /%2Fworkspace%2Fsecond.ts/u);
    await expect(workstationLinks.nth(4)).toHaveText(
      'location (/Users/alice/private/wrapped.ts:25)',
    );
    await expect(workstationLinks.nth(5)).toHaveText('file:///Users/alice/private/hidden.ts:30');
  }
});
