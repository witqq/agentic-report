import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';

import type {
  PageCardGroup,
  PageEmptyBlocks,
  PageMediaCounts,
  PageSectionStructure,
  PageStructure,
} from '../contracts.js';

/**
 * Строение готовой страницы: какие секции и с какими свойствами, что показано до первой секции,
 * сколько действий с магнитом. Только имена свойств и счётчики — ни заголовков, ни текста автора,
 * ни его идентификаторов, поэтому совет по ремеслу, построенный на этом строении, не судит слова.
 */
export interface PageStructureCollector {
  structure?: Omit<PageStructure, 'layout' | 'motion'>;
}

export const rehypePageStructure: Plugin<[PageStructureCollector], Root> =
  (collector) => (tree) => {
    const beforeFirstSection = emptyMedia();
    const sections: MutableSection[] = [];
    let magneticActions = 0;
    let movingElements = 0;
    let sectionSeen = false;
    const cardGroups: PageCardGroup[] = [];
    let emojiHeadings = 0;
    const emptyBlocks: { -readonly [Key in keyof PageEmptyBlocks]: number } = {
      sections: 0,
      tables: 0,
      cardGroups: 0,
    };

    const visitChildren = (
      children: readonly (ElementContent | Root['children'][number])[],
      current: MutableSection | undefined,
      depth: number,
    ): void => {
      for (const child of children) {
        // Подсветка кода вставляет на место блока свой фрагмент — узел `root` среди детей.
        const node: { readonly type: string } = child;
        if (node.type === 'root') visitChildren((node as Root).children, current, depth);
        if (child.type !== 'element') continue;
        visitElement(child, current, depth);
      }
    };

    const visitElement = (
      element: Element,
      current: MutableSection | undefined,
      depth: number,
    ): void => {
      if (isHeading(element) && EMOJI.test(textOf(element))) emojiHeadings += 1;
      if (isAuthoredSection(element)) {
        sectionSeen = true;
        if (isEmptySection(element)) emptyBlocks.sections += 1;
        const section = sectionOf(element, depth);
        sections.push(section);
        visitChildren(element.children, section, depth + 1);
        return;
      }
      if (element.properties.dataSemantic === 'cards') {
        const group = cardGroupOf(element);
        cardGroups.push(group);
        if (group.cards === 0) emptyBlocks.cardGroups += 1;
      }
      if (element.tagName === 'table' && bodyRows(element) === 0) emptyBlocks.tables += 1;

      const kind = mediaKind(element);
      if (kind !== undefined) {
        const target = current?.media ?? (sectionSeen ? undefined : beforeFirstSection);
        if (target !== undefined) target[kind] += 1;
      }
      if (isMagneticAction(element)) magneticActions += 1;
      if (isMovingElement(element)) movingElements += 1;
      visitChildren(element.children, current, depth);
    };

    visitChildren(tree.children, undefined, 0);
    collector.structure = {
      beforeFirstSection,
      sections,
      magneticActions,
      movingElements,
      cardGroups,
      emojiHeadings,
      emptyBlocks,
    };
  };

/**
 * Эмодзи-картинка: знак, который рисуется цветным значком по умолчанию, или любой пиктографический знак
 * с селектором варианта U+FE0F. Буквенные знаки вроде © и ✓ сюда не попадают.
 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;

function isHeading(element: Element): boolean {
  return /^h[1-6]$/u.test(element.tagName);
}

function textOf(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  return node.children.map(textOf).join('');
}

/** Секция автора, в которой нет ничего, кроме её заголовка: ни блока, ни текста. */
function isEmptySection(section: Element): boolean {
  return section.children.every((child) => {
    if (child.type === 'text') return child.value.trim().length === 0;
    if (child.type !== 'element') return true;
    return isHeading(child);
  });
}

/** Строки таблицы вне её шапки. */
function bodyRows(table: Element): number {
  let rows = 0;
  const walk = (element: Element, inHead: boolean): void => {
    for (const child of element.children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'tr' && !inHead) rows += 1;
      walk(child, inHead || child.tagName === 'thead');
    }
  };
  walk(table, false);
  return rows;
}

type MutableMedia = { -readonly [Key in keyof PageMediaCounts]: number };
type MutableSection = Omit<PageSectionStructure, 'media'> & { readonly media: MutableMedia };

function emptyMedia(): MutableMedia {
  return { images: 0, videos: 0, diagrams: 0, charts: 0, timelines: 0, code: 0 };
}

function classNames(element: Element): readonly string[] {
  const value: unknown = element.properties.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(' ') : [];
}

// Титульный слайд презентации собирает пакет из вступления страницы; это не секция автора, и то,
// что в нём показано, остаётся «до первой секции».
function isAuthoredSection(element: Element): boolean {
  return (
    element.tagName === 'section' &&
    element.properties.dataSemantic === 'section' &&
    element.properties.dataSlideCover === undefined
  );
}

function property(element: Element, name: string): string {
  const value = element.properties[name];
  return typeof value === 'string' ? value : 'none';
}

function sectionOf(element: Element, depth: number): MutableSection {
  const recipe = element.properties.dataRecipe;
  return {
    depth,
    recipe: typeof recipe === 'string' ? recipe : null,
    place: property(element, 'dataPlace'),
    surface: property(element, 'dataSurface'),
    transition: property(element, 'dataTransition'),
    scene: property(element, 'dataScene'),
    interaction: property(element, 'dataInteraction'),
    choreography: property(element, 'dataChoreography'),
    media: emptyMedia(),
  };
}

function mediaKind(element: Element): keyof PageMediaCounts | undefined {
  if (element.tagName === 'img') return 'images';
  if (element.tagName === 'video') return 'videos';
  if (element.tagName === 'pre') return 'code';
  const semantic = element.properties.dataSemantic;
  if (semantic === 'diagram') return 'diagrams';
  if (semantic === 'chart') return 'charts';
  if (semantic === 'timeline') return 'timelines';
  return undefined;
}

function isMagneticAction(element: Element): boolean {
  return (
    classNames(element).includes('semantic-action') && element.properties.dataEffect === 'magnetic'
  );
}

/**
 * Элемент, который движется сам, вне ролей секции: досчёт числа, рост графика, прорисовка, импульс или
 * пролёт схемы, проигрываемая сцена, замена и набор слова, пометка, лупа, мягкий шов петли. Тот же
 * список, что уровень движения (`src/blocks/motion-level.ts`) сверяет с шапкой.
 */
function isMovingElement(element: Element): boolean {
  const semantic = element.properties.dataSemantic;
  if (semantic === 'count' || semantic === 'swap' || semantic === 'typing') return true;
  if (semantic === 'mark' || semantic === 'spotlight') return true;
  if (semantic === 'chart') return element.properties.dataCountUp !== undefined;
  if (semantic === 'diagram')
    return (
      element.properties.dataDraw === 'scroll' ||
      element.properties.dataPulse !== undefined ||
      element.properties.dataZoom !== undefined
    );
  if (semantic === 'demo')
    return element.properties.dataPlay === 'time' || element.properties.dataPlay === 'scroll';
  return element.tagName === 'video' && element.properties.dataVideoSeam === 'fade';
}

/**
 * Группа карточек по форме, без слов: сколько карточек, сколько разных форм, сколько «пустых» — только
 * заголовок и не больше одного абзаца, без статуса, медиа, списка и таблицы, — и сколько карточек-ссылок. Форма карточки — статус,
 * число медиа, число блоков после заголовка и есть ли список или таблица.
 */
function cardGroupOf(group: Element): PageCardGroup {
  const cards = group.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.properties.dataSemantic === 'card',
  );
  const shapes = new Set<string>();
  let plain = 0;
  let linked = 0;
  for (const card of cards) {
    if (card.properties.dataLinkedCard !== undefined) linked += 1;
    const status =
      typeof card.properties.dataStatus === 'string' && card.properties.dataStatus !== 'none';
    const blocks = card.children.filter(
      (child): child is Element =>
        child.type === 'element' &&
        !classNames(child).some(
          (name) =>
            name === 'semantic-title' ||
            name === 'semantic-status' ||
            name === 'semantic-card-link-signifier',
        ),
    );
    let media = 0;
    let listOrTable = false;
    const walk = (element: Element): void => {
      if (mediaKind(element) !== undefined) media += 1;
      if (
        element.tagName === 'ul' ||
        element.tagName === 'ol' ||
        element.tagName === 'table' ||
        element.tagName === 'dl'
      )
        listOrTable = true;
      for (const child of element.children) if (child.type === 'element') walk(child);
    };
    for (const block of blocks) walk(block);
    shapes.add(`${status ? 1 : 0}:${media}:${blocks.length}:${listOrTable ? 1 : 0}`);
    if (!status && media === 0 && !listOrTable && blocks.length <= 1) plain += 1;
  }
  return { cards: cards.length, shapes: shapes.size, plain, linked };
}
