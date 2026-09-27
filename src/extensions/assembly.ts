/**
 * Сборка страницы с расширениями после отрисовки её языковых вариантов: какие эффекты действительно
 * стоят на странице (у них есть носители) и потому упаковываются, какие хеши скриптов островов нужны
 * CSP, стили использованных составных блоков и отчёт `extensions` результата `build`. Код эффекта едет только на страницу, где у него есть
 * хотя бы один носитель; объявленный и не использованный эффект не упаковывается.
 */

import path from 'node:path';

import { bundleEffect } from './effect-bundle.js';
import type { EffectHostCount } from './targets.js';
import type { BundledEffect, ExtensionBuildReport, PageExtension } from './types.js';

export interface VariantExtensionUsage {
  readonly uses: Readonly<Record<string, number>>;
  readonly effectHosts: Readonly<Record<string, EffectHostCount>>;
  readonly islandScriptHashes: readonly string[];
  readonly islandBytes: Readonly<Record<string, number>>;
}

export interface ExtensionAssembly {
  /** Упакованные эффекты в порядке объявления; пусто, когда ни один не используется. */
  readonly effects: readonly BundledEffect[];
  readonly islandScriptHashes: readonly string[];
  readonly usesIslands: boolean;
  /** Стили составных блоков, использованных на странице, уже вложенные в селекторы своих блоков. */
  readonly blockStyles: string;
  readonly report: readonly ExtensionBuildReport[];
}

export async function assembleExtensions(
  extensions: readonly PageExtension[],
  variants: readonly (VariantExtensionUsage | undefined)[],
): Promise<ExtensionAssembly> {
  const used = variants.filter(
    (variant): variant is VariantExtensionUsage => variant !== undefined,
  );
  const uses = (name: string): number =>
    used.reduce((sum, variant) => sum + (variant.uses[name] ?? 0), 0);
  const hosts = (name: string): EffectHostCount =>
    used.reduce(
      (sum, variant) => ({
        authored: sum.authored + (variant.effectHosts[name]?.authored ?? 0),
        rendered: sum.rendered + (variant.effectHosts[name]?.rendered ?? 0),
      }),
      { authored: 0, rendered: 0 },
    );
  const effects: BundledEffect[] = [];
  const blockStyles: string[] = [];
  const report: ExtensionBuildReport[] = [];
  for (const extension of extensions) {
    const notes: string[] = [];
    if (extension.kind === 'effect') {
      const count = hosts(extension.name);
      if (count.authored > count.rendered)
        notes.push(
          `${count.authored - count.rendered} of ${count.authored} host(s) lost the effect attribute while the page was rendered, so the effect does not reach them.`,
        );
      if (count.rendered === 0) {
        notes.push('No element of this page carries the effect, so its code is not bundled.');
        report.push({ name: extension.name, kind: extension.kind, uses: 0, notes });
        continue;
      }
      const { inputs, ...bundled } = await bundleEffect(extension);
      effects.push(bundled);
      const outside = filesOutsideExtension(inputs, path.dirname(extension.manifestPath));
      if (outside.length > 0)
        notes.push(
          `The bundle includes ${outside.length} file(s) from outside the extension folder, shipped as the author's code: ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? `, and ${outside.length - 10} more` : ''}.`,
        );
      report.push({
        name: extension.name,
        kind: extension.kind,
        uses: count.rendered,
        bytes: bundled.bytes,
        notes,
      });
      continue;
    }
    const count = uses(extension.name);
    if (count === 0) notes.push('Declared but not used on this page.');
    // Стили блока едут только на страницу, где блок стоит; их байты — в весе страницы и в отчёте.
    const styles = extension.kind === 'block' && count > 0 ? extension.styles?.css : undefined;
    if (styles !== undefined) blockStyles.push(styles);
    const bytes =
      extension.kind === 'island'
        ? Math.max(0, ...used.map((variant) => variant.islandBytes[extension.name] ?? 0))
        : styles === undefined
          ? 0
          : Buffer.byteLength(styles);
    report.push({
      name: extension.name,
      kind: extension.kind,
      uses: count,
      ...(bytes > 0 ? { bytes } : {}),
      notes,
    });
  }
  const islandScriptHashes = [
    ...new Set(used.flatMap((variant) => variant.islandScriptHashes)),
  ].sort();
  return {
    effects,
    islandScriptHashes,
    usesIslands: islandScriptHashes.length > 0,
    blockStyles: blockStyles.join('\n'),
    report,
  };
}

/**
 * Входы упаковки эффекта вне папки расширения (обычно `node_modules`): упаковщик идёт по импортам за
 * пределы корня источника, и отчёт сборки называет эти файлы. Пути — от папки расширения; входы
 * пространств имён упаковщика (`agentic-report-effect:…`, `<stdin>`) не файлы и не считаются.
 */
function filesOutsideExtension(inputs: readonly string[], folder: string): string[] {
  return inputs
    .filter((input) => input !== '<stdin>' && !/^[a-z][a-z0-9-]+:/u.test(input))
    .map((input) => path.relative(folder, path.resolve(input)).split(path.sep).join('/'))
    .filter((relative) => relative.startsWith('../') || path.isAbsolute(relative))
    .sort();
}
