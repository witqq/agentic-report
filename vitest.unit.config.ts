import { defineConfig } from 'vitest/config';

import { canonicalUnitIncludes, testCollectionExcludes } from './test-collection.config.ts';

export default defineConfig({
  test: {
    include: canonicalUnitIncludes,
    exclude: testCollectionExcludes,
    maxWorkers: 4,
  },
});
