import type { Element, ElementContent, Root } from 'hast';
import { visit } from 'unist-util-visit';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly depth: 2;
}

interface PrimarySection {
  readonly id: string;
  readonly title: string;
  readonly navigationLabel?: string;
}

export function resolveDocumentNavigation(tree: Root, contentsLabel: string): NavigationItem[] {
  const sections = collectPrimarySections(tree);
  visit(tree, 'element', (node: Element) => {
    if (node.properties.dataSemantic !== 'contents') return;
    enhanceInFlowContents(node, sections, contentsLabel);
  });
  return sections.map((section) => ({
    id: section.id,
    label: section.navigationLabel ?? section.title,
    depth: 2,
  }));
}

function collectPrimarySections(tree: Root): PrimarySection[] {
  const explicit: PrimarySection[] = [];
  visit(tree, 'element', (node: Element) => {
    if (node.properties.dataSemantic !== 'section') return;
    const id = stringProperty(node, 'id');
    const heading = node.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'h2',
    );
    if (id === undefined || heading === undefined) return;
    const navigationLabel = stringProperty(node, 'dataNav');
    explicit.push({
      id,
      title: visibleText(heading),
      ...(navigationLabel === undefined ? {} : { navigationLabel }),
    });
  });
  if (explicit.length > 0) return explicit;

  const legacy: PrimarySection[] = [];
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'h2' || node.properties.dataNavigationExclude !== undefined) return;
    const id = stringProperty(node, 'id');
    if (id !== undefined) legacy.push({ id, title: visibleText(node) });
  });
  return legacy;
}

function enhanceInFlowContents(
  node: Element,
  sections: readonly PrimarySection[],
  contentsLabel: string,
): void {
  node.tagName = 'nav';
  node.properties.ariaLabel = contentsLabel;
  node.properties.dataInFlowContents = '';
  node.children = [
    {
      type: 'element',
      tagName: 'p',
      properties: { className: ['semantic-contents-title'] },
      children: [{ type: 'text', value: contentsLabel }],
    },
    {
      type: 'element',
      tagName: 'ol',
      properties: {},
      children: sections.map((section) => ({
        type: 'element',
        tagName: 'li',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'a',
            properties: { href: `#${section.id}` },
            children: [{ type: 'text', value: section.title }],
          },
        ],
      })),
    },
  ];
}

function stringProperty(node: Element, name: string): string | undefined {
  const value = node.properties[name];
  return typeof value === 'string' ? value : undefined;
}

function visibleText(node: Element): string {
  const values: string[] = [];
  const pending: ElementContent[] = [...node.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (child?.type === 'text') values.push(child.value);
    else if (child?.type === 'element') pending.push(...[...child.children].reverse());
  }
  return values.join('').trim();
}
