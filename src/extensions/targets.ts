/**
 * Счёт носителей эффектов: сколько директив автор пометил атрибутом-целью эффекта и сколько элементов
 * с `data-effect-<имя>-<атрибут>` осталось в готовой разметке. Разница — носители, которых отрисовка
 * не донесла; отчёт сборки называет их, а эффект без единого носителя на страницу не едет.
 */

import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { isDirectiveNode } from '../blocks/mdast.js';
import type { EffectTargetBinding } from './vocabulary.js';

export interface EffectHostCount {
  authored: number;
  rendered: number;
}

export interface EffectHostOptions {
  readonly bindings: readonly EffectTargetBinding[];
  readonly counts: Map<string, EffectHostCount>;
}

function countFor(counts: Map<string, EffectHostCount>, effect: string): EffectHostCount {
  const existing = counts.get(effect);
  if (existing !== undefined) return existing;
  const created = { authored: 0, rendered: 0 };
  counts.set(effect, created);
  return created;
}

/** Считает директивы, которые приняли атрибут-цель; идёт после фазы директив. */
export const remarkCountEffectHosts: Plugin<[EffectHostOptions], MdastRoot> =
  (options) => (tree) => {
    if (options.bindings.length === 0) return;
    visit(tree, (node) => {
      if (!isDirectiveNode(node)) return;
      const properties = node.data?.hProperties;
      if (properties === undefined) return;
      const effects = new Set(
        options.bindings
          .filter((binding) => binding.property in properties)
          .map((binding) => binding.effect.name),
      );
      for (const effect of effects) countFor(options.counts, effect).authored += 1;
    });
  };

/** Считает элементы готовой разметки, которые несут атрибут эффекта. */
export const rehypeCountEffectHosts: Plugin<[EffectHostOptions], HastRoot> =
  (options) => (tree) => {
    if (options.bindings.length === 0) return;
    visit(tree, 'element', (node: Element) => {
      const effects = new Set(
        options.bindings
          .filter((binding) => node.properties[binding.property] !== undefined)
          .map((binding) => binding.effect.name),
      );
      for (const effect of effects) countFor(options.counts, effect).rendered += 1;
    });
  };
