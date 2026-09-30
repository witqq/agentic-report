import type { Element } from 'hast';

import { enhanceVisualization } from '../render/visualizations.js';
import {
  booleanAttribute,
  descriptionAttribute,
  enumAttribute,
  numberAttribute,
  requiredTitleAttribute,
  textAttribute,
  visualizationContainer,
} from './definitions.js';
import { type BlockEnhancementContext, defineBlock } from './define-block.js';
import { validateVisualization } from './visualization-checks.js';

/** The chart family: a chart, its series, and their points. */

function enhanceChart(node: Element, context: BlockEnhancementContext): void {
  enhanceVisualization(
    node,
    'chart',
    context.nextInstance(),
    context.allocateId,
    context.strings,
    undefined,
  );
}

const CHART_EXAMPLE =
  ':::::chart{title="Latency" description="Median latency per region." type="bar" y-label="ms"}\n::::series{label="p50"}\n::point{label="EU" value="42"}\n::point{label="US" value="37"}\n::::\n:::::\n';

export const chart = defineBlock({
  definition: visualizationContainer(
    'chart',
    'Responsive bar, line, or pie chart rendered at compile time.',
    {
      attributes: [
        requiredTitleAttribute(),
        descriptionAttribute(),
        enumAttribute('type', 'Chart form.', ['bar', 'line', 'pie'], 'bar'),
        textAttribute('x-label', 'Horizontal-axis label.', false),
        textAttribute('y-label', 'Vertical-axis label.', false),
        booleanAttribute(
          'count-up',
          'Grow the bars, lines and slices from zero to their values, and count the slice percentages up, when the chart comes into view; under reduced motion and in print the values stand at once.',
          false,
        ),
      ],
      children: 'series-directives',
    },
  ),
  validate: validateVisualization,
  enhance: enhanceChart,
  feature: 'chart',
  staticEquivalent:
    'The chart drawn in full as SVG at its final values with its description and data table; nothing animates.',
  examples: [CHART_EXAMPLE],
});

export const series = defineBlock({
  definition: visualizationContainer('series', 'One named chart series containing data points.', {
    attributes: [textAttribute('label', 'Legend label.', true)],
    children: 'point-directives',
    requiredParent: 'chart',
    tagName: 'section',
  }),
  feature: 'chart',
  staticEquivalent: 'One named series of the chart, in its legend and data table.',
  examples: [CHART_EXAMPLE],
});

export const point = defineBlock({
  definition: visualizationContainer('point', 'One labelled numeric value in a chart series.', {
    attributes: [
      textAttribute('label', 'Category label.', true),
      numberAttribute('value', 'Finite numeric value between -999999999 and 999999999.'),
    ],
    children: 'none',
    requiredParent: 'series',
    tagName: 'span',
    forms: ['leaf'],
  }),
  feature: 'chart',
  staticEquivalent: 'One value of a series, drawn and listed in the data table.',
  examples: [CHART_EXAMPLE],
});
