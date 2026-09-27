import type { Config } from 'testfold';

import { auditCanonicalUnitResults } from './test-collection.config.ts';

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
      if (suite.name === 'unit') {
        const files = result.testResults?.map((test) => test.file);
        if (files === undefined || files.length === 0) {
          return {
            ok: false,
            error: 'Unit suite did not report the canonical files it collected.',
          };
        }
        const inventoryIssue = await auditCanonicalUnitResults(files);
        if (inventoryIssue !== undefined) {
          return {
            ok: false,
            error: inventoryIssue,
          };
        }
      }
      return { ok: true };
    },
  },
  suites: [
    {
      name: 'unit',
      type: 'custom',
      command:
        'pnpm exec vitest run --config=vitest.unit.config.ts --reporter=default --reporter=json --outputFile.json=test-results/artifacts/unit.json',
      resultFile: 'unit.json',
      parser: './tests/parsers/vitest-parser.ts',
      timeout: 120_000,
    },
    {
      name: 'e2e',
      type: 'playwright',
      command: 'pnpm exec playwright test --config=playwright.config.ts',
      resultFile: 'e2e.json',
      // CPU-throttled effect checks need the browser worker to own the CPU while measuring frame
      // tasks. A second worker can push an otherwise passing task over the 50 ms budget. The suite
      // deadline allows the expanded browser corpus to run sequentially; individual test limits stay.
      timeout: 1_500_000,
      workers: 1,
    },
  ],
};

export default config;
