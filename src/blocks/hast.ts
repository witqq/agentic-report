import type { Element } from 'hast';

import { decorativeIcon } from '../render/icons.js';

/** HAST helpers shared by the block enhancers and the directive core. */

export function stringProperty(node: Element, name: string): string | undefined {
  const value = node.properties[name];
  return typeof value === 'string' ? value : undefined;
}

/** Reads a transport property and removes it, so it never reaches the published page. */
export function takeStringProperty(node: Element, name: string): string | undefined {
  const value = stringProperty(node, name);
  delete node.properties[name];
  return value;
}

/** Visible text with whitespace collapsed, as a reader or an assistive label sees it. */
export function hastText(node: Element): string {
  const values: string[] = [];
  const pending = [...node.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (child?.type === 'text') values.push(child.value);
    else if (child?.type === 'element') pending.push(...[...child.children].reverse());
  }
  return values.join(' ').replace(/\s+/gu, ' ').trim();
}

/** Text exactly as written, without collapsing whitespace: code and diff lines need it. */
export function hastRawText(node: Element): string {
  const values: string[] = [];
  const pending = [...node.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (child?.type === 'text') values.push(child.value);
    else if (child?.type === 'element') pending.push(...[...child.children].reverse());
  }
  return values.join('');
}

export function hasClassName(node: Element, className: string): boolean {
  const value = node.properties.className ?? node.properties.class;
  return Array.isArray(value)
    ? value.some((candidate) => candidate === className)
    : typeof value === 'string' && value.split(/\s+/u).includes(className);
}

export function hastContainsTag(node: Element, tagName: string): boolean {
  return node.children.some(
    (child) =>
      child.type === 'element' && (child.tagName === tagName || hastContainsTag(child, tagName)),
  );
}

export function semanticTitle(value: string, id?: string): Element {
  return {
    type: 'element',
    tagName: 'h3',
    properties: { className: ['semantic-title'], ...(id === undefined ? {} : { id }) },
    children: [{ type: 'text', value }],
  };
}

/** The authored title of a block as its heading; the default enhancement of every block. */
export function prependDirectiveTitle(node: Element): void {
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  if (title === undefined) return;
  node.children.unshift(semanticTitle(title));
}

export function actionButton(
  label: string,
  properties: Element['properties'],
  icon?: Parameters<typeof decorativeIcon>[0],
): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: {
      type: 'button',
      ...(icon === undefined ? {} : { ariaLabel: label, title: label, dataPackageOperation: '' }),
      ...properties,
    },
    children: [
      ...(icon === undefined ? [] : [decorativeIcon(icon)]),
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['package-control-label'] },
        children: [{ type: 'text', value: label }],
      },
    ],
  };
}
