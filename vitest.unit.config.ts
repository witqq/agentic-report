import { defineConfig } from 'vitest/config';

import { canonicalUnitIncludes, testCollectionExcludes } from './test-collection.config.ts';

export default defineConfig({
  test: {
    include: canonicalUnitIncludes,
    exclude: testCollectionExcludes,
    // Build-heavy tests spawn CLI processes. Keep enough CPU for each worker on hosted runners.
    maxWorkers: 2,
  },
});
