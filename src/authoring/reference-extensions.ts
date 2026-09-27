/**
 * Эталонные расширения, которые пакет везёт в каталоге `extensions/`: по одному на каждый уровень API
 * расширения (составной блок, поставщик, эффект, остров), каждое с README и двумя непохожими примерами.
 * Команда `examples` перечисляет их рядом с примерами страниц, чтобы агент нашёл образец, прежде чем писать
 * своё расширение.
 *
 * Список не хранится отдельно, а читается из установленных манифестов: всякий `.yaml`/`.yml` в папке
 * расширения, у которого есть `kind` и `name`, — эталон. Так список не расходится с тем, что лежит в пакете.
 * Манифест здесь не проверяется: его строго проверяет загрузчик страницы (`src/extensions/load.ts`), когда
 * пример собирается, и тест обнаружения собирает каждый пример.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';

export const REFERENCE_EXTENSION_KINDS = ['block', 'provider', 'effect', 'island'] as const;
export type ReferenceExtensionKind = (typeof REFERENCE_EXTENSION_KINDS)[number];

export interface ReferenceExtension {
  readonly name: string;
  readonly kind: ReferenceExtensionKind;
  readonly description: string;
  /** Absolute path of the manifest. */
  readonly manifest: string;
  /** Absolute path of the README of the extension's folder. */
  readonly readme: string;
  /** Absolute paths of the example pages the manifest lists. */
  readonly examples: readonly string[];
}

const MANIFEST_SUFFIXES = new Set(['.yaml', '.yml']);

function isKind(value: unknown): value is ReferenceExtensionKind {
  return (REFERENCE_EXTENSION_KINDS as readonly unknown[]).includes(value);
}

/**
 * The reference extensions under `root`, ordered by level (block, provider, effect, island) and then by
 * name. A missing root gives an empty list: a source checkout without the folder has nothing to offer.
 */
export async function listReferenceExtensions(
  root: string,
): Promise<readonly ReferenceExtension[]> {
  let folders: string[];
  try {
    folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const found: ReferenceExtension[] = [];
  for (const folder of folders) {
    const directory = path.join(root, folder);
    const files = (await readdir(directory)).filter((file) =>
      MANIFEST_SUFFIXES.has(path.extname(file)),
    );
    for (const file of files) {
      const manifest = parse(await readFile(path.join(directory, file), 'utf8')) as unknown;
      if (manifest === null || typeof manifest !== 'object') continue;
      const { kind, name, description, examples } = manifest as Record<string, unknown>;
      if (!isKind(kind) || typeof name !== 'string' || typeof description !== 'string') continue;
      found.push({
        name,
        kind,
        description,
        manifest: path.join(directory, file),
        readme: path.join(directory, 'README.md'),
        examples: Array.isArray(examples)
          ? examples
              .filter((example): example is string => typeof example === 'string')
              .map((example) => path.join(directory, example))
          : [],
      });
    }
  }
  return found.sort(
    (left, right) =>
      REFERENCE_EXTENSION_KINDS.indexOf(left.kind) -
        REFERENCE_EXTENSION_KINDS.indexOf(right.kind) || left.name.localeCompare(right.name, 'en'),
  );
}
