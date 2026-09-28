import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const skillRoot = path.resolve('skills/agentic-report');
const allowed = [
  {
    file: 'SKILL.md',
    url: 'https://agentic-report.witqq.dev/',
    reason: 'The installed skill metadata names the product homepage as its action target.',
  },
  {
    file: 'references/process.md',
    url: 'https://product.example/signup',
    reason:
      'A syntactically valid reserved-domain placeholder shows how to mark an unresolved signup URL.',
  },
  {
    file: 'references/process.md',
    url: 'https://github.com/witqq/agentic-report.git',
    reason: 'This is the repository address used by the executable source-review clone command.',
  },
] as const;

interface Address {
  readonly file: string;
  readonly url: string;
}

function addressKey(address: Address): string {
  return `${address.file}\u0000${address.url}`;
}

function externalAddresses(file: string, markdown: string): readonly Address[] {
  return [...markdown.matchAll(/https?:\/\/[^\s<>"'`]+/gu)].map((match) => ({
    file,
    url: (match[0] ?? '').replace(/[),.;\]]+$/u, ''),
  }));
}

async function handwrittenMarkdown(directory = skillRoot): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return handwrittenMarkdown(absolute);
      if (!entry.isFile() || !entry.name.endsWith('.md')) return [];
      const relative = path.relative(skillRoot, absolute).split(path.sep).join('/');
      return relative === 'references/catalog.md' ? [] : [relative];
    }),
  );
  return nested.flat();
}

function unexpected(found: readonly Address[]): readonly Address[] {
  const accepted = new Set(allowed.map(addressKey));
  return found.filter((address) => !accepted.has(addressKey(address)));
}

function staleExceptions(found: readonly Address[]): readonly Address[] {
  const observed = new Set(found.map(addressKey));
  return allowed.filter((address) => !observed.has(addressKey(address)));
}

describe('self-contained agent skill knowledge', () => {
  it('permits only justified, currently present external action addresses', async () => {
    const files = await handwrittenMarkdown();
    expect(files).toContain('SKILL.md');
    expect(files).toContain('references/node-api.md');
    expect(files).toContain('references/effect-api.md');
    expect(files).not.toContain('references/catalog.md');
    const found = (
      await Promise.all(
        files.map(async (file) =>
          externalAddresses(file, await readFile(path.join(skillRoot, file), 'utf8')),
        ),
      )
    ).flat();
    for (const exception of allowed) expect(exception.reason.trim()).not.toBe('');
    expect(unexpected(found)).toEqual([]);
    expect(staleExceptions(found)).toEqual([]);
  });

  it('rejects an inserted URL and an exception whose address disappeared', () => {
    const existing = allowed.map(({ file, url }) => ({ file, url }));
    const planted = externalAddresses(
      'references/playbook.md',
      'A missing lesson: https://unapproved.example/lesson',
    );
    expect(unexpected([...existing, ...planted])).toEqual(planted);
    expect(staleExceptions(existing.slice(1))).toEqual([allowed[0]]);
  });
});
