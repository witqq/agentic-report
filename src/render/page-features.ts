/**
 * The structural half of a page's feature selection: the last pass over the finished page tree records
 * each feature whose `hosts` (`src/page-features.ts`) the tree holds — code blocks, tables, videos, dark
 * image variants, popovers and tab lists the enhancement created, scenes and gallery rails. The rendered
 * blocks give the other half (`rehypeEnhanceDirectives`).
 */

import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { isFeatureHost, PAGE_FEATURES } from '../page-features.js';

const HOSTED = PAGE_FEATURES.flatMap((definition) =>
  'hosts' in definition ? definition.hosts.map((host) => ({ id: definition.id, host })) : [],
);

export const rehypePageFeatures: Plugin<[{ readonly features: Set<string> }], Root> =
  (options) => (tree) => {
    visit(tree, 'element', (node: Element) => {
      for (const { id, host } of HOSTED)
        if (!options.features.has(id) && isFeatureHost(host, node.tagName, node.properties))
          options.features.add(id);
    });
  };
