import { container } from './definitions.js';
import { defineBlock } from './define-block.js';

export const steps = defineBlock({
  definition: container(
    'steps',
    'Process or tutorial sequence containing Markdown, normally an ordered list.',
    {
      handoffs: ['semantic-document'],
    },
  ),
  styles: 'package',
  staticEquivalent: 'A titled numbered procedure.',
  examples: [':::steps{title="Release"}\n1. Tag the commit.\n2. Publish the package.\n:::\n'],
});
