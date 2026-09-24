import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReport } from '../../src/core/compiler.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

const workspaces: string[] = [];
const fixture = path.resolve('tests/fixtures/highlighting');

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

describe('code highlighting', () => {
  it('renders every fence exactly as the full grammar set did while loading only what the fences need', async () => {
    const workspace = await createTestWorkspace('code-highlighting');
    workspaces.push(workspace);
    // Эталон снят опубликованной сборкой 0.16.0, которая грузила все встроенные грамматики Shiki.
    // Подсветка по требованию обязана дать те же байты: `typescript` с `terms`, `js` (псевдоним),
    // `bash`; `markdown` с frontmatter и вложенным блоком — ему нужны лениво встроенные языки;
    // `typescript` с теговыми шаблонами — ему нужны инъекции `es-tag-*`; `jinja-html`, имя
    // грамматики, которому нужна `source.jinja` из её `include`; блок неизвестного языка и блок без
    // языка — простым кодом. Загрузка одной названной грамматики расходится с эталоном на
    // markdown, шаблонах и jinja; ленивый режим Shiki падает на `nosuchlang`.
    const expected = JSON.parse(
      await readFile(path.join(fixture, 'expected-code-blocks.json'), 'utf8'),
    ) as string[];

    const result = await buildReport({
      input: path.join(fixture, 'report.md'),
      output: path.join(workspace, 'index.html'),
    });
    const html = await readFile(result.outputPath, 'utf8');

    expect(html.match(/<pre[\s\S]*?<\/pre>/gu)).toEqual(expected);
  });
});
