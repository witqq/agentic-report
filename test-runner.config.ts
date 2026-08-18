import type { Config } from 'testfold';

const config: Config = {
  artifactsDir: 'test-results/artifacts',
  testsDir: './tests',
  reporters: ['console', 'json', 'markdown-failures', 'timing-text'],
  hooks: {
    afterSuite: async (suite, result) => {
      if (result.passed + result.failed + result.skipped === 0) {
        return {
          ok: false,
          error: `Suite ${suite.name} produced zero test results; inspect its framework JSON and log.`,
        };
      }
      return { ok: true };
    },
  },
  suites: [
    {
      name: 'unit',
      type: 'custom',
      command:
        'pnpm exec vitest run tests/unit --reporter=default --reporter=json --outputFile.json=test-results/artifacts/unit.json',
      resultFile: 'unit.json',
      parser: './tests/parsers/vitest-parser.ts',
      timeout: 120_000,
    },
    {
      name: 'e2e',
      type: 'playwright',
      command: 'pnpm exec playwright test --config=playwright.config.ts',
      resultFile: 'e2e.json',
      timeout: 300_000,
      workers: 1,
    },
  ],
};

export default config;
