import type { Element } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { decorativeIcon } from '../render/icons.js';
import { sourceLinkAttribute, textAttribute } from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { takeStringProperty } from './hast.js';

function sourceLinkDefinition(): DirectiveDefinition {
  const attributes = [
    textAttribute('label', 'Short visible source path and line.', true),
    sourceLinkAttribute(),
  ] as const;
  return {
    name: 'source-link',
    description:
      'Source location opened through an explicit IPv4 loopback editor helper without replacing the report page.',
    forms: ['text'],
    attributes,
    children: 'none',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'a',
      className: 'semantic-source-link',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

const definition = sourceLinkDefinition();
const SOURCE_LINK_LABEL_MAX_LENGTH = sourceLinkLabelMaximumLength(definition);

/**
 * A workstation link opens the author's editor. A page built for distribution keeps only a label
 * derived from the file name and line, because the path and the helper port mean nothing elsewhere.
 */
function enhanceSourceLink(node: Element, context: BlockEnhancementContext): void {
  const label = takeStringProperty(node, 'dataLabel');
  const href = takeStringProperty(node, 'dataHref');
  if (label === undefined || href === undefined) {
    throw new Error('Validated source-link is missing its label or href.');
  }
  if (context.share) {
    node.tagName = 'span';
    delete node.properties.href;
    delete node.properties.target;
    delete node.properties.rel;
    delete node.properties.dataSourceLink;
    node.properties.dataSourceLinkNeutralized = '';
    node.children = [{ type: 'text', value: shareSafeSourceLabel(href) }];
    context.noteNeutralizedSourceLink();
    return;
  }
  node.properties.href = href;
  node.properties.target = '_blank';
  node.properties.rel = ['noopener', 'noreferrer'];
  node.properties.dataSourceLink = '';
  node.children = [decorativeIcon('arrow-right'), { type: 'text', value: label }];
}

type ShareLabelSafety =
  { readonly safe: true; readonly fixedPoint: string } | { readonly safe: false };

function shareSafeSourceLabel(href: string): string {
  const helper = new URL(href);
  const helperPath = helper.searchParams.get('path');
  const line = helper.searchParams.get('line');
  if (helperPath === null || line === null) {
    throw new Error('Validated source-link helper is missing its path or line.');
  }
  const generic = `source:${line}`;
  if (/[\\/]$/u.test(helperPath)) return generic;
  const candidate = helperPath.split(/[\\/]/u).at(-1);
  if (candidate === undefined) return generic;
  const safety = classifyShareLabel(candidate);
  if (!safety.safe) return generic;
  const derived = `${safety.fixedPoint}:${line}`;
  return derived.length <= SOURCE_LINK_LABEL_MAX_LENGTH ? derived : generic;
}

function classifyShareLabel(value: string): ShareLabelSafety {
  let current = value;
  for (let inspection = 0; inspection <= value.length; inspection += 1) {
    if (!shareLabelRepresentationIsSafe(current)) return { safe: false };
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return { safe: false };
    }
    if (decoded === current) return { safe: true, fixedPoint: current };
    current = decoded;
  }
  return { safe: false };
}

function shareLabelRepresentationIsSafe(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.startsWith('~') &&
    !hasShareLabelControl(value) &&
    !/[\\/:]/u.test(value)
  );
}

function hasShareLabelControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

function sourceLinkLabelMaximumLength(sourceLink: DirectiveDefinition): number {
  const label = sourceLink.attributes.find((attribute) => attribute.name === 'label');
  if (label?.constraint.kind !== 'string' || label.constraint.maxLength === undefined) {
    throw new Error('Source-link label constraint is missing its maximum length.');
  }
  return label.constraint.maxLength;
}

export const sourceLink = defineBlock({
  definition,
  enhance: enhanceSourceLink,
  styles: 'package',
  staticEquivalent:
    'The file and line as a link to the editor helper; a shared page keeps only the file name and line as text.',
  examples: [
    'See :source-link{label="src/app.ts:42" href="http://127.0.0.1:7789/open?path=%2Fworkspace%2Fsrc%2Fapp.ts&line=42"}.\n',
  ],
});
