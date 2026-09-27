import type { Root as MdastRoot } from 'mdast';
import { visit } from 'unist-util-visit';

import type { BlockAttributeValues } from '../blocks/define-block.js';
import { isDirectiveNode } from '../blocks/mdast.js';

/**
 * Section identity is document-wide: every top-level section owns one id that navigation, links,
 * review targets and the id allocator agree on. An authored id is kept as written; a missing one is
 * generated from the title and transported with this prefix, so the enhancement knows it may still
 * move it aside when another element of the page already owns that id.
 */
export const GENERATED_SECTION_ID_PREFIX = 'generated:';

/** The directive name that carries section identity. */
export const SECTION_DIRECTIVE = 'section';

/** Claims the identity of an accepted section, generating a collision-free one when none is authored. */
export function claimSectionIdentity(
  values: BlockAttributeValues,
  used: Set<string>,
  claimedAuthored: Set<string>,
): BlockAttributeValues {
  const authoredId = values.id;
  if (typeof authoredId === 'string') {
    claimedAuthored.add(authoredId);
    return values;
  }
  const base = sectionSlug(String(values.title));
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = suffixedIdentity(base, suffix);
    suffix += 1;
  }
  used.add(id);
  return { ...values, id: `${GENERATED_SECTION_ID_PREFIX}${id}` };
}

export function collectAuthoredSectionIds(tree: MdastRoot): Set<string> {
  const ids = new Set<string>();
  visit(tree, (node) => {
    if (!isDirectiveNode(node) || node.name !== SECTION_DIRECTIVE) return;
    const id = node.attributes?.id;
    if (typeof id === 'string') ids.add(id.trim());
  });
  return ids;
}

/** The final id of a section element from the id its directive transported. */
export function resolveSectionId(
  transportedId: string,
  allocateId: (base: string) => string,
): string {
  const generated = transportedId.startsWith(GENERATED_SECTION_ID_PREFIX);
  const desiredId = generated
    ? transportedId.slice(GENERATED_SECTION_ID_PREFIX.length)
    : transportedId;
  return generated ? allocateId(desiredId) : desiredId;
}

export function suffixedIdentity(base: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  return `${base.slice(0, 64 - suffixText.length).replace(/-+$/gu, '')}${suffixText}`;
}

function sectionSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('und')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 56)
    .replace(/-+$/gu, '');
  if (slug.length === 0) return 'section';
  return /^[a-z]/u.test(slug) ? slug : `section-${slug}`;
}
