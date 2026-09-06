import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('localized output', () => {
  it('builds deterministic single-file and directory artifacts with one shared resource', async () => {
    const workspace = await localizedWorkspace('localized-output');
    const first = path.join(workspace, 'artifact-a');
    const second = path.join(workspace, 'artifact-b');
    const single = await buildReport({
      input: workspace,
      output: path.join(workspace, 'artifact.html'),
    });
    const firstResult = await buildReport({ input: workspace, output: first, format: 'directory' });
    const secondResult = await buildReport({
      input: workspace,
      output: second,
      format: 'directory',
    });

    expect(single.embeddedAssets).toBe(4);
    expect(firstResult.externalAssets).toBe(3);
    expect({ ...secondResult, outputPath: '<output>' }).toEqual({
      ...firstResult,
      outputPath: '<output>',
    });
    expect(await snapshot(second)).toEqual(await snapshot(first));
    const html = await readFile(path.join(first, 'index.html'), 'utf8');
    expect(html).toContain('data-localized-page-variant="en"');
    expect(html).toContain('data-localized-page="ru"');
    expect(Object.keys(await snapshot(first)).filter((file) => file.endsWith('.svg'))).toHaveLength(
      1,
    );
  });

  it('treats every localized entry as source and refuses to overwrite it', async () => {
    const workspace = await localizedWorkspace('localized-output-collision');
    const russianEntry = path.join(workspace, 'report.ru.md');
    const before = await readFile(russianEntry);

    await expect(buildReport({ input: workspace, output: russianEntry })).rejects.toMatchObject({
      diagnostic: { code: 'OUTPUT_COLLIDES_WITH_SOURCE' },
    });
    await expect(readFile(russianEntry)).resolves.toEqual(before);
  });

  it('scopes same-named locale fonts without changing the single-language activation contract', async () => {
    const workspace = await createTestWorkspace('localized-font-output');
    workspaces.push(workspace);
    await writeFile(path.join(workspace, 'english.woff'), 'english font bytes');
    await writeFile(path.join(workspace, 'russian.woff'), 'russian font bytes');
    await writeFile(
      path.join(workspace, 'report.md'),
      '---\ntitle: English\nlanguage: en\nlocalizations:\n  ru: report.ru.md\n---\n# English\n\n::font{src="english.woff" family="Reader"}\n',
    );
    await writeFile(
      path.join(workspace, 'report.ru.md'),
      '---\ntitle: Русский\nlanguage: ru\n---\n# Русский\n\n::font{src="russian.woff" family="Reader"}\n',
    );

    const localizedOutput = path.join(workspace, 'localized.html');
    await buildReport({ input: workspace, output: localizedOutput });
    const localized = await readFile(localizedOutput, 'utf8');
    expect(localized).toContain('font-family:"Reader--agentic-en"');
    expect(localized).toContain(
      '[data-localized-page-variant="en"]{--agentic-font:"Reader--agentic-en"}',
    );
    expect(localized).toContain('font-family:"Reader--agentic-ru"');
    expect(localized).toContain(
      '[data-localized-page-variant="ru"]{--agentic-font:"Reader--agentic-ru"}',
    );
    expect(localized).not.toContain(':root{--agentic-font:"Reader"}');

    await writeFile(
      path.join(workspace, 'report.md'),
      '---\ntitle: English\nlanguage: en\n---\n# English\n\n::font{src="english.woff" family="Reader"}\n',
    );
    const singleOutput = path.join(workspace, 'single.html');
    await buildReport({ input: workspace, output: singleOutput });
    await expect(readFile(singleOutput, 'utf8')).resolves.toContain(
      ':root{--agentic-font:"Reader"}',
    );
  });
});

async function localizedWorkspace(prefix: string): Promise<string> {
  const workspace = await createTestWorkspace(prefix);
  workspaces.push(workspace);
  await writeFile(
    path.join(workspace, 'shared.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><title>Shared</title></svg>\n',
  );
  await writeFile(
    path.join(workspace, 'report.md'),
    '---\ntitle: English\nlanguage: en\nlocalizations:\n  ru: report.ru.md\n---\n# English\n\n![Shared](shared.svg)\n',
  );
  await writeFile(
    path.join(workspace, 'report.ru.md'),
    '---\ntitle: Русский\nlanguage: ru\n---\n# Русский\n\n![Общий](shared.svg)\n',
  );
  return workspace;
}

async function snapshot(root: string, relative = ''): Promise<Readonly<Record<string, string>>> {
  const values: Record<string, string> = {};
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(values, await snapshot(root, child));
    else values[child] = (await readFile(path.join(root, ...child.split('/')))).toString('base64');
  }
  return values;
}
