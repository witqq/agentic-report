import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from './fixtures.js';

const generated = path.resolve('test-results/e2e-generated');
const cases = [
  {
    name: 'single-file',
    defaultUrl: pathToFileURL(path.resolve('test-results/e2e-artifact/report.html')).href,
    optOutUrl: pathToFileURL(path.join(generated, 'attribution-opt-out.html')).href,
  },
  {
    name: 'directory',
    defaultUrl: pathToFileURL(path.join(generated, 'directory-artifact/index.html')).href,
    optOutUrl: pathToFileURL(path.join(generated, 'attribution-opt-out-directory/index.html')).href,
  },
] as const;

for (const fixture of cases) {
  test(`${fixture.name} defaults attribution on and preserves authored content when opted out`, async ({
    page,
  }) => {
    await page.goto(fixture.defaultUrl);
    const attribution = page.locator('[data-report-attribution]');
    await expect(attribution).toBeVisible();
    await expect(
      attribution.getByRole('link', { name: 'Made with Agentic Report' }),
    ).toHaveAttribute('href', 'https://agentic-report.witqq.dev/');
    expect(await attribution.evaluate((element) => element.nextElementSibling?.tagName)).toBe(
      'DIALOG',
    );

    await page.goto(fixture.optOutUrl);
    await expect(page.locator('[data-report-attribution]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Made with Agentic Report' })).toHaveAttribute(
      'href',
      'https://example.com/authored',
    );
  });
}
