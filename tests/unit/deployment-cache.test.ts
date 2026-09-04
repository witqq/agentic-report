import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('deployment cache policy', () => {
  it('revalidates mutable routes and reserves immutable caching for content hashes', async () => {
    const config = await readFile('config/nginx.conf', 'utf8');

    expect(config).toContain('location ~* "\\.[0-9a-f]{12}\\.[^/]+$"');
    expect(config).toContain(
      'add_header Cache-Control "public, max-age=31536000, immutable" always;',
    );
    expect(
      config.match(/add_header Cache-Control "no-cache, must-revalidate" always;/gu),
    ).toHaveLength(2);
    expect(config).not.toContain('add_header Cache-Control "no-cache";');
  });
});
