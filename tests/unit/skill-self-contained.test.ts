import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The skill's knowledge base is self-contained: a lesson is written into the text as its content — the
// rule, the number, the counterexample — never left behind a link. An agent that builds a page reads the
// skill and rarely opens a link; offline, in a sandbox and in SkillStore (which refuses external links)
// a link is not there at all, and a linked page changes or disappears without anyone noticing.
//
// The defect this test catches: an http(s) address anywhere under skills/agentic-report that is not in
// the allowlist below, and an allowlist entry whose address is gone (a stale exception).

const skillRoot = path.resolve('skills/agentic-report');

interface AllowedAddress {
  readonly file: string;
  readonly address: string;
  readonly reason: string;
}

/** The only external addresses the skill may carry, each with the reason it is not knowledge. */
const ALLOWED_ADDRESSES: readonly AllowedAddress[] = [
  {
    file: 'SKILL.md',
    address: 'https://agentic-report.witqq.dev/',
    reason: "The product's own site: the skill's homepage in its frontmatter.",
  },
  {
    file: 'references/process.md',
    address: 'https://github.com/witqq/agentic-report.git',
    reason: "The product's own repository: the command that clones a release for source review.",
  },
  {
    file: 'references/process.md',
    address: 'https://….example/',
    reason: 'A placeholder form on the reserved .example domain, not a place to go.',
  },
  {
    file: 'references/vocabulary-use.md',
    address: 'https://example.com/pricing',
    reason: 'A value of `address` in a code sample, on the reserved example.com domain.',
  },
  {
    file: 'references/assets.md',
    address: 'https://unsplash.com/photos/…',
    reason: 'The shape of a provenance row in the Media table: the page link a brief records.',
  },
  {
    file: 'references/prose-en.md',
    address: 'https://github.com/blader/humanizer',
    reason: 'Attribution of the MIT-licensed catalogue this file adapts.',
  },
  {
    file: 'references/prose-ru.md',
    address: 'https://github.com/smixs/humanizer-ru',
    reason: 'Attribution of the MIT-licensed catalogue this file adapts.',
  },
];

const ADDRESS = /https?:\/\/[^\s)>\]`"'<]+/gu;

interface FoundAddress {
  readonly file: string;
  readonly line: number;
  readonly address: string;
}

/** Every http(s) address in a text, with its line. */
function addressesIn(file: string, text: string): FoundAddress[] {
  const found: FoundAddress[] = [];
  text.split('\n').forEach((content, index) => {
    for (const match of content.matchAll(ADDRESS))
      found.push({ file, line: index + 1, address: match[0].replace(/[.,;:]+$/u, '') });
  });
  return found;
}

/** Addresses outside the allowlist, and allowlist entries no file carries any more. */
function selfContainedViolations(
  found: readonly FoundAddress[],
  allowed: readonly AllowedAddress[],
): { readonly unlisted: FoundAddress[]; readonly stale: AllowedAddress[] } {
  const key = (file: string, address: string) => `${file}\u0000${address}`;
  const allowedKeys = new Set(allowed.map((entry) => key(entry.file, entry.address)));
  const foundKeys = new Set(found.map((entry) => key(entry.file, entry.address)));
  return {
    unlisted: found.filter((entry) => !allowedKeys.has(key(entry.file, entry.address))),
    stale: allowed.filter((entry) => !foundKeys.has(key(entry.file, entry.address))),
  };
}

async function skillFiles(directory = skillRoot): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await skillFiles(full)));
    else files.push(full);
  }
  return files;
}

async function skillAddresses(): Promise<FoundAddress[]> {
  const found: FoundAddress[] = [];
  for (const file of await skillFiles())
    found.push(
      ...addressesIn(
        path.relative(skillRoot, file).split(path.sep).join('/'),
        await readFile(file, 'utf8'),
      ),
    );
  return found;
}

describe('the skill knowledge base is self-contained', () => {
  it('carries no external address outside the allowlist, and every allowlist entry is still used', async () => {
    const { unlisted, stale } = selfContainedViolations(await skillAddresses(), ALLOWED_ADDRESSES);
    expect(unlisted.map((entry) => `${entry.file}:${entry.line} ${entry.address}`)).toEqual([]);
    expect(stale.map((entry) => `${entry.file} ${entry.address}`)).toEqual([]);
  });

  it('gives every allowed address a reason', () => {
    for (const entry of ALLOWED_ADDRESSES) expect(entry.reason.length).toBeGreaterThan(10);
  });

  it('fails on a planted link and on a stale allowlist entry', async () => {
    const real = await skillAddresses();
    const planted = addressesIn(
      'references/art-direction.md',
      'The reference is [Linear](https://linear.app); copy its first screen.',
    );
    expect(planted).toEqual([
      { file: 'references/art-direction.md', line: 1, address: 'https://linear.app' },
    ]);
    const withPlant = selfContainedViolations([...real, ...planted], ALLOWED_ADDRESSES);
    expect(withPlant.unlisted.map((entry) => entry.address)).toEqual(['https://linear.app']);

    const staleEntry = {
      file: 'references/themes.md',
      address: 'https://stripe.com',
      reason: 'An entry left after its link was removed.',
    };
    const withStale = selfContainedViolations(real, [...ALLOWED_ADDRESSES, staleEntry]);
    expect(withStale.stale).toEqual([staleEntry]);
  });

  it('does not let an allowed address in one file excuse the same address in another', () => {
    const moved = addressesIn('references/themes.md', 'See https://github.com/blader/humanizer.');
    expect(selfContainedViolations(moved, ALLOWED_ADDRESSES).unlisted).toHaveLength(1);
  });
});
