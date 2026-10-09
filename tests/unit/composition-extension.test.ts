import { cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const code = '/* future composition effect */';
vi.mock('../../src/extensions/effect-bundle.js', () => ({
  bundleEffect: async () => ({
    name: 'glow',
    code: '/* future composition effect */',
    bytes: Buffer.byteLength('/* future composition effect */'),
    inputs: [],
  }),
}));

// A host kept only in a future original must still select its author-declared effect and CSP hash.
it('ships a declared effect for a future composition fragment after its final value replaces the host', async () => {
  const root = await createTestWorkspace('composition-future-effect');
  try {
    await cp(path.resolve('tests/fixtures/extensions/effect'), root, { recursive: true });
    const manifest = path.join(root, 'extensions/glow/extension.yaml');
    const declaration = await readFile(manifest, 'utf8');
    await writeFile(manifest, declaration.replace('directive: section', 'directive: callout'));
    await writeFile(
      path.join(root, 'report.md'),
      `---
title: Future effect
language: en
motion: expressive
extensions: [extensions/glow/extension.yaml]
---
:::::composition{id="future-effect"}
::::object{id="owner"}
:::callout{title="Decorated content" glow="soft"}
An authored effect host.
:::
::::
::cue{at="1" action="replace" target="owner" value="Final text"}
:::::
`,
    );
    const output = path.join(root, 'page.html');
    const result = await buildReport({ input: root, output });
    const html = await readFile(output, 'utf8');
    expect(result.extensions).toContainEqual({
      name: 'glow',
      kind: 'effect',
      uses: 1,
      bytes: Buffer.byteLength(code),
      notes: [],
    });
    expect(html).toContain(code);
    expect(html).toContain(`sha256-${createHash('sha256').update(code).digest('base64')}`);
    const visible = html.replace(/<template\b[\s\S]*?<\/template>/gu, '');
    expect(visible).not.toContain('data-effect-glow-glow="soft"');
  } finally {
    await removeTestWorkspace(root);
  }
});
