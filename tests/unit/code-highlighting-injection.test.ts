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

// Отдельный файл нарочно: Vitest изолирует модули по файлам, поэтому здесь подсветчик процесса ещё
// не видел ни `typescript`, ни `javascript`. Иначе инъекции `es-tag-*`, загруженные чужим блоком,
// скрыли бы пропуск, и вывод блока зависел бы от соседей по документу.
describe('code highlighting under a prefix injection target', () => {
  it('gives jsx and angular-html the injections of their parent scopes when nothing else loads them', async () => {
    const workspace = await createTestWorkspace('code-highlighting-injection');
    workspaces.push(workspace);
    // Shiki применяет к `source.js.jsx` инъекции в `source.js`, а к `text.html.derivative.ng` —
    // инъекции в `text.html.derivative`. Эталон снят сборкой 0.16.0 с полным набором грамматик;
    // замыкание по точной области оставляет HTML в шаблоне `jsx` одной строкой и расходится с ним.
    const expected = JSON.parse(
      await readFile(path.join(fixture, 'expected-prefix-injection-blocks.json'), 'utf8'),
    ) as string[];

    const result = await buildReport({
      input: path.join(fixture, 'prefix-injection.md'),
      output: path.join(workspace, 'index.html'),
    });
    const html = await readFile(result.outputPath, 'utf8');

    expect(html.match(/<pre[\s\S]*?<\/pre>/gu)).toEqual(expected);
  });
});
