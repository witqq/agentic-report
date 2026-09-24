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

  it('revalidates the search-engine index files while hashed page assets stay immutable', async () => {
    const config = await readFile('config/nginx.conf', 'utf8');
    const immutable = /location ~\* "([^"]+)"/u.exec(config)?.[1];
    if (immutable === undefined) throw new Error('Missing immutable asset location.');
    const matchesImmutable = (route: string): boolean => new RegExp(immutable, 'iu').test(route);

    // Индекс для поисковиков меняется с каждым выпуском, поэтому обязан перепроверяться.
    expect(matchesImmutable('/sitemap.xml')).toBe(false);
    expect(matchesImmutable('/robots.txt')).toBe(false);
    expect(matchesImmutable('/assets/monument.30aab33625ae.jpg')).toBe(true);
    expect(matchesImmutable('/examples/basic/assets/runtime.1f92003f088e.js')).toBe(true);
    expect(config).toMatch(
      /location \/ \{\n\s+add_header Cache-Control "no-cache, must-revalidate" always;\n\s+try_files \$uri \$uri\/ \$uri\/index\.html =404;/u,
    );
  });
});
