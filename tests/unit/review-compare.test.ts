import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('review targets beside package-owned compositions', () => {
  it('keeps every review target of a page with a compare on the built page', async () => {
    // Абзац, в котором автор написал две картинки сравнения, пакет растворяет в сцене сравнения. Его
    // цель оставалась в манифесте без элемента на странице, и Review Workspace выключался целиком.
    const root = await mkdtemp(path.join(os.tmpdir(), 'review-compare-'));
    roots.push(root);
    await cp(path.resolve('tests/fixtures/compare-review'), root, { recursive: true });
    await writeFile(
      path.join(root, 'report.md'),
      [
        '---',
        'title: Compare with review',
        'review: true',
        '---',
        '',
        '# Compare with review',
        '',
        'A paragraph before the comparison.',
        '',
        ':::compare{before="Before" after="After"}',
        '![The page before the change](compare-before.svg)',
        '![The page after the change](compare-after.svg)',
        ':::',
        '',
        'A paragraph after the comparison.',
        '',
      ].join('\n'),
    );
    const output = path.join(root, 'page.html');
    await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    const manifest = /<template data-review-manifest[^>]*>([\s\S]*?)<\/template>/u.exec(html)?.[1];
    expect(manifest).toBeDefined();
    const ids = [
      ...(manifest ?? '').matchAll(/(?:"|&quot;)id(?:"|&quot;):(?:"|&quot;)(rt-[0-9a-f]+)/gu),
    ].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(2);
    const onPage = new Set(
      [...html.matchAll(/data-review-target="(rt-[0-9a-f]+)"/gu)].map((match) => match[1]),
    );
    expect(ids.filter((id) => !onPage.has(id))).toEqual([]);
  });
});
