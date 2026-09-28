import type { Root as MdastRoot } from 'mdast';
import { visit } from 'unist-util-visit';

import type { AgenticReportError } from '../diagnostics.js';
import {
  MOTION_LEVEL_RULES,
  MOTION_LEVELS,
  type MotionLevel,
  type MotionTechnique,
  motionLevelAllows,
} from '../page-motion.js';
import type { BlockAttributeValues, BlockValidationContext } from './define-block.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/**
 * Уровень движения из шапки (`motion`) ограничивает сверху то, что страница делает. Проверка читает
 * источник один раз на документ: каждый приём движения, записанный атрибутом или директивой, сверяется
 * с уровнем, и приём выше уровня — ошибка в месте, где он записан. Уровень `restrained` вдобавок держит
 * одно появление главы и один отклик на указатель. Значения рецептов считаются как записанные.
 */

export const MOTION_LEVEL_CODE = 'MOTION_LEVEL_EXCEEDED';

interface Use {
  readonly node: DirectiveNode;
  readonly technique: MotionTechnique;
  /** Как приём записан в источнике: `transition="reveal"`, `:count`. */
  readonly written: string;
}

/** Приёмы движения, которые записаны на одном узле источника. */
export function motionUses(
  node: DirectiveNode,
  values: BlockAttributeValues | undefined,
): readonly Use[] {
  if (values === undefined) return [];
  const uses: Use[] = [];
  const add = (technique: MotionTechnique, written: string): void => {
    uses.push({ node, technique, written });
  };
  if (node.name === 'section') {
    // Значение, которое принёс рецепт, называется вместе с рецептом: автор его не писал.
    const recipe =
      typeof values.recipe === 'string' && values.recipe !== 'none' ? values.recipe : undefined;
    const from = (name: string, written: string): string =>
      recipe !== undefined && node.attributes?.[name] === undefined
        ? `${written} (brought by recipe="${recipe}")`
        : written;
    const addOwn = (technique: MotionTechnique, name: string, value: string): void =>
      add(technique, from(name, `${name}="${value}"`));
    const transition = values.transition;
    if (typeof transition === 'string' && transition !== 'none')
      addOwn(transition === 'staged' ? 'directed' : 'entrance', 'transition', transition);
    if (values.reveal === true) add('entrance', 'reveal="true"');
    const scene = values.scene;
    if (scene === 'progress' || scene === 'steps' || scene === 'scrub')
      addOwn('directed', 'scene', scene);
    const interaction = values.interaction;
    if (typeof interaction === 'string' && interaction !== 'none')
      addOwn('pointer', 'interaction', interaction);
    if (values.choreography === 'cascade') addOwn('count', 'choreography', 'cascade');
    const effect = values['media-effect'];
    if (typeof effect === 'string' && effect !== 'none') addOwn('directed', 'media-effect', effect);
  }
  if (node.name === 'action' && values.effect === 'magnetic') add('pointer', 'effect="magnetic"');
  if (node.name === 'diagram' && values.draw === 'scroll') add('directed', 'draw="scroll"');
  if (node.name === 'diagram' && typeof values.pulse === 'string') add('directed', 'pulse');
  if (node.name === 'zoom') add('directed', ':::zoom');
  if (node.name === 'chart' && values['count-up'] === true) add('count', 'count-up="true"');
  if (node.name === 'demo' && (values.play === 'time' || values.play === 'scroll'))
    add('directed', `demo{play="${values.play}"}`);
  if (node.name === 'swap' || node.name === 'typing' || node.name === 'mark')
    add('inline', `:${node.name}`);
  if (node.name === 'spotlight') add('inline', ':::spotlight');
  if (node.name === 'video' && values.seam === 'fade') add('inline', 'video{seam="fade"}');
  if (node.name === 'count') add('count', ':count');
  return uses;
}

const checked = new WeakSet<MdastRoot>();

/** Сверить все приёмы движения документа с уровнем страницы; вызывается один раз на документ. */
export function checkMotionLevel(
  context: BlockValidationContext,
  found: AgenticReportError[],
): void {
  if (checked.has(context.document)) return;
  checked.add(context.document);
  const level = parseLevel(context.page.motion);
  if (level === undefined || level === 'expressive') return;
  const uses: Use[] = [];
  visit(context.document, (node) => {
    if (isDirectiveNode(node)) uses.push(...motionUses(node, context.attributes(node)));
  });
  const seen = new Map<MotionTechnique, number>();
  for (const use of uses) {
    const count = (seen.get(use.technique) ?? 0) + 1;
    seen.set(use.technique, count);
    if (!motionLevelAllows(level, use.technique)) {
      found.push(
        context.violation(
          use.node,
          MOTION_LEVEL_CODE,
          `The page declares motion: ${level}, and ${use.written} ${level === 'none' ? 'moves' : 'is directed motion, which only motion: expressive allows'}.`,
          `Remove ${use.written} (for a recipe default write the attribute with "none"), or raise motion in the frontmatter to ${MOTION_LEVEL_RULES[use.technique].from === 'expressive' ? 'expressive' : 'restrained or expressive'} if the brief asks for it.`,
        ),
      );
      continue;
    }
    const limit = MOTION_LEVEL_RULES[use.technique].restrainedLimit;
    if (level === 'restrained' && limit !== undefined && count > limit) {
      const what = use.technique === 'entrance' ? 'chapter entrance' : 'pointer effect';
      found.push(
        context.violation(
          use.node,
          MOTION_LEVEL_CODE,
          `The page declares motion: restrained, which allows one ${what}, and ${use.written} is another.`,
          `Keep the ${what} on the chapter that changes the story and write the others with "none", or raise motion to expressive if the brief asks for it.`,
        ),
      );
    }
  }
}

function parseLevel(value: string | undefined): MotionLevel | undefined {
  return MOTION_LEVELS.find((level) => level === value);
}
