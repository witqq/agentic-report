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
      // The complete build/CLI corpus takes longer on hosted runners; individual integration tests
      // retain their own explicit deadlines and Vitest's default remains 5 s for ordinary tests.
      timeout: 300_000,
    },
    {
      name: 'e2e',
      type: 'playwright',
      command: 'pnpm exec playwright test --config=playwright.config.ts',
      resultFile: 'e2e.json',
      // CPU-throttled effect checks need the browser worker to own the CPU while measuring frame
      // tasks. A second worker can push an otherwise passing task over the 50 ms budget. The suite
      // hosted Ubuntu browser corpus needs about 27 minutes; leave room for the last tests and JSON
      // reporter to finish. Individual test deadlines and the 50 ms frame budget stay unchanged.
      timeout: 1_900_000,
      workers: 1,
    },
  ],
};

export default config;
