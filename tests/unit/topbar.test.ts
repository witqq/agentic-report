import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/** `topbar: false`: a page built to be filmed as a scene, without the package top bar. */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function page(frontmatter: string): Promise<string> {
  const root = await createTestWorkspace('topbar');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Scene\nlanguage: en\n${frontmatter}---\n\n# Scene\n\n## One\n\nText.\n\n## Two\n\nText.\n`,
  );
  return root;
}

describe('topbar: false', () => {
  it('builds the page without the bar and marks the root for the scene layout', async () => {
    // Defect caught: the manifest key accepted but not reaching the document.
    const root = await page('topbar: false\n');
    await buildReport({ input: root, output: path.join(root, 'page.html') });
    const html = await readFile(path.join(root, 'page.html'), 'utf8');
    expect(html).not.toContain('<header class="topbar"');
    expect(html).toContain('data-topbar="none"');
    // The contents stay: the sidebar is the page's own navigation, not a part of the bar.
    expect(html).toContain('data-navigation');
  });

  it.each([
    ['review: true\n', 'review'],
    ['themeSwitcher: true\n', 'themeSwitcher'],
  ])('refuses %s, whose control lives only in the bar', async (frontmatter, control) => {
    // Defect caught: a control switched on and silently unreachable on a page without the bar.
    const root = await page(`topbar: false\n${frontmatter}`);
    await expect(
      buildReport({ input: root, output: path.join(root, 'page.html') }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: 'INVALID_MANIFEST',
        message: expect.stringContaining(control),
        details: { controls: [control] },
      },
    });
  });
});
