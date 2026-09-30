import type { Element } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

/**
 * Numbers one slide and its steps: the slide's place in its deck (`data-slide`, from 0), each `appear`
 * block inside it in document order (`data-step`, from 1) and their count (`data-slide-steps`). The
 * presentation page and a deck inside a document share it, so their runtime reads one markup. A deck
 * inside the slide keeps its steps to itself.
 */
export function numberSlide(slide: Element, index: number): void {
  slide.properties.dataSlide = String(index);
  let step = 0;
  visit(slide, 'element', (node: Element) => {
    // A deck inside the slide numbers its own steps; its appear blocks are not this slide's.
    if (node !== slide && node.properties.dataSemantic === 'deck') return SKIP;
    if (node.properties.dataSemantic !== 'appear') return undefined;
    step += 1;
    node.properties.dataStep = String(step);
    return undefined;
  });
  slide.properties.dataSlideSteps = String(step);
}
