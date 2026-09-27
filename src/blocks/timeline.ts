import type { Element } from 'hast';

import { enhanceVisualization } from '../render/visualizations.js';
import {
  descriptionAttribute,
  enumAttribute,
  requiredTitleAttribute,
  textAttribute,
  visualizationContainer,
} from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { validateVisualization } from './visualization-checks.js';

/** The timeline family: a timeline and its events; its legend items belong to the diagram family. */

function enhanceTimeline(node: Element, context: BlockEnhancementContext): void {
  enhanceVisualization(
    node,
    'timeline',
    context.nextInstance(),
    context.allocateId,
    context.strings,
    undefined,
  );
}

const TIMELINE_EXAMPLE =
  '::::timeline{title="Rollout" description="Three phases of the rollout."}\n:::event{date="May" title="Beta" kind="accent"}\nTen teams.\n:::\n:::event{date="June" title="General availability"}\nEveryone.\n:::\n::legend-item{event="accent" label="Limited audience"}\n::::\n';

export const timeline = defineBlock({
  definition: visualizationContainer(
    'timeline',
    'Semantic chronological sequence with bounded events.',
    {
      attributes: [requiredTitleAttribute(), descriptionAttribute()],
      children: 'event-directives',
    },
  ),
  validate: validateVisualization,
  enhance: enhanceTimeline,
  styles: 'package',
  staticEquivalent: 'The events as an ordered list with their dates, all shown at once.',
  examples: [TIMELINE_EXAMPLE],
});

export const event = defineBlock({
  definition: visualizationContainer(
    'event',
    'One dated timeline event with optional Markdown detail.',
    {
      attributes: [
        textAttribute('date', 'Visible date or phase label.', true),
        requiredTitleAttribute(),
        enumAttribute(
          'kind',
          'Package-owned event emphasis.',
          ['neutral', 'accent', 'success', 'warning'],
          'neutral',
        ),
      ],
      children: 'markdown',
      requiredParent: 'timeline',
    },
  ),
  styles: 'package',
  staticEquivalent: 'One dated entry with its title and detail.',
  examples: [TIMELINE_EXAMPLE],
});
