import { REGISTRY_IDENTITY_CONSTRAINT } from '../authoring/directive-contract.js';
import { requiredTitleAttribute, visualizationContainer } from './definitions.js';
import { defineBlock } from './define-block.js';

/**
 * Пролёт внутрь узла схемы: вложенная схема одного узла потока. Её разбирает и рисует сама схема —
 * блок только описывает грамматику: какой узел раскрывается и какие узлы, группы и связи лежат внутри.
 */

const ZOOM_EXAMPLE =
  '::::::diagram{title="Service" description="A request reaches the API, and the API is a small flow of its own."}\n::node{id="client" label="Client"}\n::node{id="api" label="API"}\n::edge{from="client" to="api"}\n:::::zoom{node="api" title="Inside the API"}\n::node{id="router" label="Router"}\n::node{id="handler" label="Handler"}\n::edge{from="router" to="handler"}\n:::::\n::::::\n';

export const zoom = defineBlock({
  definition: visualizationContainer(
    'zoom',
    'The inside of one node of a flow diagram, written as its own small flow: while the diagram is pinned on screen the camera flies into that node and the nested flow grows readable in its place.',
    {
      attributes: [
        {
          name: 'node',
          description: 'Identity of the node of the enclosing diagram that this flow opens.',
          required: true,
          constraint: REGISTRY_IDENTITY_CONSTRAINT,
          renderProperty: 'dataNode',
          invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
        },
        { ...requiredTitleAttribute(), description: 'Title of the nested flow.' },
      ],
      children: 'zoom-part-directives',
      requiredParent: 'diagram',
    },
  ),
  feature: 'diagram',
  staticEquivalent:
    'The whole diagram and the inside of the node drawn as two figures side by side, with the nested flow written out in words.',
  examples: [ZOOM_EXAMPLE],
});
