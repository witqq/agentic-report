import type { Element } from 'hast';

import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { interactiveContainer } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import { type DirectiveNode, isCodeNode, isDirectiveNode, isTraversableNode } from './mdast.js';

interface CopyableSubject {
  readonly node: DirectiveNode;
  readonly placement: (node: DirectiveNode) => AgenticReportError;
}

/** The glossary reference is the one directive that copyable prose may hold. */
const COPYABLE_REFERENCE = 'term';

/** The single rule of a copyable block, declared as data like every other rule of this phase. */
const copyableRules = declareAuthoredRules<CopyableSubject>({
  subject: 'copyable',
  rules: [
    {
      id: 'prose-and-terms-only',
      check: ({ node, placement }) => {
        // Foreign children of one copyable block are independent of each other: a code fence says
        // nothing about the directive beside it, so the block answers for all of them. Nothing below
        // a refused child is read, because it lives inside the node just refused.
        const pending = [...(node.children ?? [])];
        const found: AgenticReportError[] = [];
        while (pending.length > 0) {
          const child = pending.pop();
          if (isCodeNode(child) || (isDirectiveNode(child) && child.name !== COPYABLE_REFERENCE)) {
            found.push(placement(child as DirectiveNode));
            continue;
          }
          if (isTraversableNode(child)) pending.push(...(child.children ?? []));
        }
        return found;
      },
    },
  ],
});

function validateCopyable(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const found: AgenticReportError[] = [];
  const outcome = runAuthoredRules(
    copyableRules,
    {
      node,
      placement: (target) =>
        context.violation(
          target,
          'INVALID_DIRECTIVE_PLACEMENT',
          'copyable accepts prose Markdown and term references, not code blocks or other directives.',
          'Move the code or interactive/data directive outside copyable.',
        ),
    },
    found,
  );
  context.report(found);
  return outcome;
}

/** The runtime copies the rendered text of the content owner, so the prose gets one. */
function enhanceCopyable(node: Element): void {
  const authoredChildren = node.children;
  node.properties.dataCopyableProse = '';
  node.children = [
    {
      type: 'element',
      tagName: 'div',
      properties: { dataCopyableContent: '' },
      children: authoredChildren,
    },
  ];
}

export const copyable = defineBlock({
  definition: interactiveContainer(
    'copyable',
    'Ordinary Markdown prose with a localized copy control.',
    {
      attributes: [],
      children: 'markdown-and-term-directives',
      runtime: 'package-owned-copy',
    },
  ),
  validate: validateCopyable,
  enhance: enhanceCopyable,
  feature: 'copyable',
  staticEquivalent: 'The prose itself; the copy control needs the browser and is not printed.',
  examples: [':::copyable\nRun the migration before the deploy, then restart the workers.\n:::\n'],
});
