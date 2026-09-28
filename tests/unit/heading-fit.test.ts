import type { Element, Root } from 'hast';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { rehypeHeadingFit } from '../../src/render/heading-fit.js';

function heading(tagName: string, text: string, className?: string, style?: string): Element {
  return {
    type: 'element',
    tagName,
    properties: {
      ...(className === undefined ? {} : { className: [className] }),
      ...(style === undefined ? {} : { style }),
    },
    children: [{ type: 'text', value: text }],
  };
}

function run(...children: Element[]): Element[] {
  const tree: Root = { type: 'root', children };
  unified().use(rehypeHeadingFit).runSync(tree);
  return children;
}

describe('heading fit', () => {
  it('writes the longest word of a heading so its size can fit a phone line', () => {
    const [title, section, card] = run(
      heading('h1', 'Architecture decision record'),
      heading('div', 'Recommendation: switch on 3 November', 'semantic-section-title'),
      heading('p', 'Roll-back', 'semantic-title'),
    );
    expect(title?.properties.style).toBe('--heading-word:12');
    expect(section?.properties.style).toBe('--heading-word:15');
    // Дефис — место переноса: части до и после него считаются отдельно, и обе короче пяти букв.
    expect(card?.properties.style).toBeUndefined();
  });

  it('leaves short headings and ordinary text alone and keeps an existing style', () => {
    const [short, paragraph, styled] = run(
      heading('h2', 'Go and ship it'),
      heading('p', 'Implementation and verification'),
      heading('h2', 'Implementation', undefined, 'color:red'),
    );
    expect(short?.properties.style).toBeUndefined();
    expect(paragraph?.properties.style).toBeUndefined();
    expect(styled?.properties.style).toBe('color:red;--heading-word:14');
  });
});
