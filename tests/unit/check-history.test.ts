import { describe, expect, it } from 'vitest';

import { scanText, scanTrackedFiles } from '../../scripts/check-history.ts';

describe('personal path and credential guard', () => {
  it('finds a maintainer home directory and a pasted token', () => {
    // Assembled from parts so that this tracked file does not itself contain what the guard refuses.
    const home = (name: string): string => ['', 'Users', name, ''].join('/');
    const planted = [
      `then update \`${home('maintainer')}projects/release-notes.md\`.`,
      `cache in ${['', 'home', 'deploy', ''].join('/')}.npm/_cacache`,
      `token: ${'npm'}_abcdefghijklmnopqrstuvwxyz0123456789`,
      `-----BEGIN OPENSSH ${'PRIVATE'} KEY-----`,
    ].join('\n');
    const findings = scanText('planted.md', planted);
    expect(findings.map((finding) => [finding.line, finding.kind])).toEqual([
      [1, 'personal-path'],
      [2, 'personal-path'],
      [3, 'credential'],
      [4, 'credential'],
    ]);
  });

  it('allows the fixture homes that tests use to prove redaction', () => {
    expect(
      scanText(
        'fixture.ts',
        'label="/Users/alice/private/second.ts:20" and /Users/packed-consumer/x/',
      ),
    ).toEqual([]);
  });

  it('finds nothing in the tracked files of the repository', () => {
    expect(scanTrackedFiles()).toEqual([]);
  });
});
