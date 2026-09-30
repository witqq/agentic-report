import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgenticReportError } from '../../src/diagnostics.js';
import { buildReport } from '../../src/index.js';
import { createTestWorkspace, removeTestWorkspace } from '../helpers/workspace.js';

/** Ограды директив: лишняя закрывающая ограда — ошибка сборки со строкой, а не ряд двоеточий на странице. */
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(removeTestWorkspace));
});

async function build(markdown: string): Promise<AgenticReportError | undefined> {
  const root = await createTestWorkspace('fences');
  workspaces.push(root);
  await writeFile(
    path.join(root, 'report.md'),
    `---\ntitle: Fences\nlanguage: en\n---\n\n# Fences\n\n${markdown}`,
  );
  try {
    await buildReport({ input: root, output: path.join(root, 'page.html') });
  } catch (error) {
    return error as AgenticReportError;
  }
  return undefined;
}

describe('directive fences', () => {
  it('refuses a closing fence that closes nothing, with its line', async () => {
    // Ловит: раздел закрыт короткой оградой внутреннего блока, и его собственная ограда остаётся абзацем
    // «:::::» на странице (так было в examples/presentation).
    const refused = await build(
      '::::section{title="One"}\n:::callout\nText.\n:::\n::::\n\n:::::\n\nAfter.\n',
    );
    expect(refused?.diagnostic.code).toBe('UNBALANCED_DIRECTIVE_FENCE');
    expect(refused?.diagnostic.source?.line).toBe(14);
  });

  it('accepts balanced fences and colons inside prose or code', async () => {
    expect(
      await build(
        '::::section{title="One"}\n:::callout\nText.\n:::\n::::\n\nA ratio 3:::4 in prose.\n\n```text\n:::::\n```\n',
      ),
    ).toBeUndefined();
  });
});
