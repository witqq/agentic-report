import type { Nodes } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);

/** Render chat Markdown as DOM. Raw HTML, images and unsafe link protocols never execute or fetch. */
export function renderMessage(container: HTMLElement, text: string): void {
  const render = (node: Nodes): Node => {
    if (node.type === 'text') return document.createTextNode(node.value);
    if (node.type === 'html') return document.createTextNode(node.value);
    if (node.type === 'break') return document.createElement('br');
    if (node.type === 'thematicBreak') return document.createElement('hr');
    if (node.type === 'image') return document.createTextNode(node.alt ?? 'Image');
    if (node.type === 'inlineCode' || node.type === 'code') {
      const code = document.createElement('code');
      code.textContent = node.value;
      if (node.type === 'inlineCode') return code;
      const pre = document.createElement('pre');
      pre.append(code);
      return pre;
    }
    if (node.type === 'link') {
      const link = document.createElement('a');
      try {
        const url = new URL(node.url, location.href);
        if (['https:', 'http:', 'mailto:'].includes(url.protocol)) {
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      } catch {
        /* An invalid destination remains readable text. */
      }
      link.append(...node.children.map(render));
      return link;
    }
    let tag: string;
    switch (node.type) {
      case 'paragraph':
        tag = 'p';
        break;
      case 'heading':
        tag = `h${Math.min(6, node.depth + 2)}`;
        break;
      case 'strong':
        tag = 'strong';
        break;
      case 'emphasis':
        tag = 'em';
        break;
      case 'delete':
        tag = 'del';
        break;
      case 'blockquote':
        tag = 'blockquote';
        break;
      case 'list':
        tag = node.ordered ? 'ol' : 'ul';
        break;
      case 'listItem':
        tag = 'li';
        break;
      case 'table':
        tag = 'table';
        break;
      case 'tableRow':
        tag = 'tr';
        break;
      case 'tableCell':
        tag = 'td';
        break;
      default:
        tag = 'span';
    }
    const element = document.createElement(tag);
    if (node.type === 'list' && node.ordered && node.start !== null && node.start !== undefined)
      element.setAttribute('start', String(node.start));
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = node.checked;
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', node.checked ? 'Completed' : 'Not completed');
      element.append(checkbox);
    }
    if ('children' in node) element.append(...node.children.map(render));
    if (node.type === 'table') {
      const scroll = document.createElement('div');
      scroll.className = 'live-table';
      scroll.append(element);
      return scroll;
    }
    return element;
  };
  container.replaceChildren(...parser.parse(text).children.map(render));
}
