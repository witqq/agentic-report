import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import type { DirectiveNode } from './mdast.js';
import { whenAttribute } from './page-state.js';

function countDefinition(): DirectiveDefinition & { readonly name: 'count' } {
  return {
    name: 'count',
    description:
      'A number in running text that counts up from zero to its written value when it comes into view; the written value is what the page holds and shows without motion.',
    forms: ['text'],
    attributes: [
      whenAttribute(
        'Page state that starts the count instead of the number coming into view, such as the chapter that the figure belongs to being reached.',
      ),
    ],
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-count' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-count',
      properties: ['dataSemantic', 'dataWhen'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

/** Счётчик считает до записанного числа, поэтому в подписи обязана быть цифра. */
function validateCount(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const label = (node.children ?? [])
    .map((child) => String((child as { value?: unknown }).value ?? ''))
    .join('');
  if (/\d/u.test(label)) return 'accepted';
  context.report(
    context.violation(
      node,
      'INVALID_DIRECTIVE_ATTRIBUTE',
      'count shows a number counting up to its written value, and this label has no digits.',
      'Write the final value as the label, such as :count[1,284] or :count[74%].',
    ),
  );
  // A label without digits leaves any count nested in it just as readable, so nothing is skipped.
  return 'accepted';
}

export const count = defineBlock({
  definition: countDefinition(),
  validate: validateCount,
  feature: 'count',
  staticEquivalent: 'The written number itself, shown at once without counting up.',
  examples: ['Throughput reached :count[1,284] requests per second.\n'],
});
