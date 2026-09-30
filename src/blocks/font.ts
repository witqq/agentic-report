import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { pathAttribute } from './definitions.js';
import { defineBlock } from './define-block.js';

function fontDefinition(): DirectiveDefinition {
  return {
    name: 'font',
    description:
      'Register a confined local font for one text role; the first declaration of each role replaces the theme font of that role.',
    forms: ['leaf'],
    attributes: [
      pathAttribute('src', 'Relative local font path.', 'dataFontSource'),
      {
        name: 'family',
        description: 'CSS font family using letters, numbers, spaces, underscores, or hyphens.',
        required: true,
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: 1,
          maxLength: 80,
          pattern: '^[\\p{L}\\p{N} _-]{1,80}$',
        },
        renderProperty: 'dataFontFamily',
        invalidDiagnostic: 'INVALID_FONT_FAMILY',
      },
      {
        name: 'role',
        description:
          'Text role the font sets: body text and controls, headings and section titles, monospaced labels and metadata, or code blocks and inline code.',
        required: false,
        default: 'body',
        constraint: { kind: 'enum', values: ['body', 'heading', 'mono', 'code'] },
        renderProperty: 'dataFontRole',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
    ],
    children: 'none',
    placement: {},
    behavior: {
      renderer: 'font-registration',
      resource: 'font',
      runtime: 'none',
    },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-font',
      properties: ['dataFontSource', 'dataFontFamily', 'dataFontRole', 'hidden'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: true },
    handoffs: ['resource-graph'],
  };
}

/** The resource step turns the declaration into an embedded `@font-face`; the element stays hidden. */
export const font = defineBlock({
  definition: fontDefinition(),
  feature: 'core',
  staticEquivalent: 'Nothing visible: the page text is set in the registered font.',
  examples: ['::font{src="reader.woff" family="Reader" role="body"}\n\nBody text.\n'],
});
