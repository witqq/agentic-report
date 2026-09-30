import { waitForQuietPage } from '../../dist/node/core/effect-check.js';
import { expect, test } from './fixtures.js';

// Catches effect-check starting its measurement while the page still works after load: under load that
// work runs longer than the old fixed 300 ms pause, and its tasks were counted against the effect.
test('effect-check waits for the page to fall quiet, not a fixed pause', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setContent(`<!doctype html><html><body><ol id="log"></ol><script>
    let step = 0;
    const work = () => {
      document.getElementById('log').append(document.createElement('li'));
      step += 1;
      if (step < 8) setTimeout(work, 90);
      else window.__done = true;
    };
    setTimeout(work, 90);
  </script></body></html>`);
  const result = await waitForQuietPage(page);
  expect(result.quiet).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __done?: boolean }).__done)).toBe(true);
});

test('effect-check stops waiting for a page that never falls quiet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setContent(`<!doctype html><html><body><p id="n">0</p><script>
    setInterval(() => { document.getElementById('n').textContent = String(Date.now()); }, 30);
  </script></body></html>`);
  const result = await waitForQuietPage(page, { quietMs: 250, pollMs: 50, limitMs: 800 });
  expect(result.quiet).toBe(false);
  expect(result.waitedMs).toBeLessThan(1500);
});
