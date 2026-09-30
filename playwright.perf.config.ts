import { defineConfig, devices } from '@playwright/test';

/**
 * Timed checks: tests that compare browser tasks or frame intervals with a budget (`tests/perf`). They run
 * alone, one worker and one desktop project, through `pnpm test:perf`: a parallel run shares the CPU and
 * makes a budget measure the other tests instead of the page. The browser suite (`pnpm test:e2e`) and
 * `pnpm verify` do not include them.
 */
export default defineConfig({
  testDir: './tests/perf',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/artifacts/perf.json' }]],
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/perf',
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
});
