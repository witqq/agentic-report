import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

/**
 * Заголовок на телефоне не рвёт слово посередине: его кегль ограничен шириной колонки, делённой на
 * самое длинное слово. Стили не знают текста, поэтому длину слова в буквах сюда записывает компилятор —
 * переменной `--heading-word` на самом заголовке.
 *
 * Порог выведен из самого худшего случая, а не подобран: самая широкая встроенная гарнитура прописными
 * (Unbounded, около 1 em на букву) при самом крупном кегле телефона (около 2,9 rem) в самой узкой колонке
 * (304 px без полей — около 13 rem) вмещает лишь четыре буквы. Отметку поэтому получает каждое слово
 * от пяти букв; более короткое влезает в любую колонку при любой гарнитуре.
 */
const LONG_WORD = 5;
const WORD_BOUNDARY = /[\s\-‐–—]+/u;

export const rehypeHeadingFit: Plugin<[], Root> = () => (tree) => {
  const walk = (node: Root | Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (inHeadingFace(child, node)) mark(child);
      else walk(child);
    }
  };
  walk(tree);
};

/**
 * Защита привязана к гарнитуре, а не к тегу: сюда входит всё, что стили набирают гарнитурой заголовков
 * (`--font-heading`) — заголовки страницы, глав и блоков, заголовок события ленты времени и цитата
 * дисплейной главы. Новый элемент в этой гарнитуре добавляется сюда же; e2e ищет разрывы во всём тексте,
 * набранном ею.
 */
const HEADING_FACE_CLASSES = [
  'semantic-section-title',
  'semantic-title',
  'visualization-timeline-title',
] as const;

function inHeadingFace(element: Element, parent: Root | Element): boolean {
  if (['h1', 'h2', 'h3'].includes(element.tagName)) return true;
  if (HEADING_FACE_CLASSES.some((name) => classes(element).includes(name))) return true;
  return (
    element.tagName === 'blockquote' &&
    parent.type === 'element' &&
    classes(parent).includes('semantic-section') &&
    parent.properties.dataType === 'display'
  );
}

function classes(element: Element): readonly string[] {
  const value: unknown = element.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function mark(heading: Element): void {
  const longest = Math.max(
    0,
    ...text(heading)
      .split(WORD_BOUNDARY)
      .map((word) => [...word].length),
  );
  if (longest < LONG_WORD) return;
  const style = typeof heading.properties.style === 'string' ? heading.properties.style : '';
  heading.properties.style = `${style}${style === '' || style.endsWith(';') ? '' : ';'}--heading-word:${longest}`;
}

function text(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  return node.children.map(text).join('');
}
