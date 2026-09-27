/**
 * Builders shared by the block definitions: attribute shapes and the common definition skeletons.
 * They produce plain registry data; a block module passes the result to `defineBlock`.
 */
import {
  REGISTRY_IDENTITY_CONSTRAINT,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type DirectiveForm,
} from '../authoring/directive-contract.js';

export const titleAttribute = {
  name: 'title',
  description: 'Visible title.',
  required: false,
  constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 200 },
  renderProperty: 'dataDirectiveTitle',
  invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
} as const satisfies DirectiveAttributeDefinition;

export function responseLeaf(
  name: 'bucket' | 'option' | 'item',
  description: string,
  attributes: readonly DirectiveAttributeDefinition[],
): DirectiveDefinition {
  return {
    name,
    description,
    forms: ['leaf'],
    attributes,
    children: 'none',
    placement: { requiredParent: 'question' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: `semantic-${name}`,
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

export function visualizationContainer(
  name:
    | 'chart'
    | 'series'
    | 'point'
    | 'diagram'
    | 'group'
    | 'node'
    | 'edge'
    | 'legend'
    | 'legend-item'
    | 'timeline'
    | 'event'
    | 'zoom',
  description: string,
  options: {
    readonly attributes: readonly DirectiveAttributeDefinition[];
    readonly children: DirectiveDefinition['children'];
    readonly requiredParent?: string | readonly [string, ...string[]];
    readonly tagName?: 'section' | 'span';
    readonly forms?: readonly [DirectiveForm, ...DirectiveForm[]];
  },
): DirectiveDefinition {
  return {
    name,
    description,
    forms: options.forms ?? ['container'],
    attributes: options.attributes,
    children: options.children,
    placement:
      options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: options.tagName ?? 'section',
      className: `semantic-${name}`,
      properties: [
        'dataSemantic',
        ...options.attributes.map((attribute) => attribute.renderProperty),
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

export function interactiveContainer(
  name:
    | 'copyable'
    | 'glossary'
    | 'disclosure'
    | 'tabs'
    | 'tab'
    | 'modal'
    | 'popover'
    | 'filter'
    | 'toggle'
    | 'compare',
  description: string,
  options: {
    readonly attributes: readonly DirectiveAttributeDefinition[];
    readonly children?: DirectiveDefinition['children'];
    readonly requiredParent?: string | readonly [string, ...string[]];
    readonly runtime: DirectiveDefinition['behavior']['runtime'];
  },
): DirectiveDefinition {
  return {
    name,
    description,
    forms: ['container'],
    attributes: options.attributes,
    children: options.children ?? 'markdown',
    placement:
      options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: options.runtime },
    sanitizer: {
      tagName: 'section',
      className: `semantic-${name}`,
      properties: [
        'dataSemantic',
        ...options.attributes.map((attribute) => attribute.renderProperty),
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

export function requiredTitleAttribute(): DirectiveAttributeDefinition {
  return { ...titleAttribute, required: true };
}

export function keyAttribute(description: string): DirectiveAttributeDefinition {
  return identityAttribute('key', description);
}

export function identityAttribute(
  name: 'key' | 'id' | 'group' | 'from' | 'to' | 'bucket',
  description: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: REGISTRY_IDENTITY_CONSTRAINT,
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function optionalIdentityAttribute(
  name: 'id' | 'group' | 'bucket',
  description: string,
): DirectiveAttributeDefinition {
  return { ...identityAttribute(name, description), required: false };
}

export function linkAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'href',
    description:
      'Safe same-page, relative, HTTP(S), email, phone (tel:), or text-message (sms:) link target; executable and local-file schemes are rejected.',
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 500,
      pattern:
        '^(?:#[A-Za-z][A-Za-z0-9_-]{0,127}|https?://[^\\s<>]+|mailto:[^\\s<>]+|tel:\\+?[0-9][0-9().-]{0,31}|sms:\\+?[0-9][0-9().,-]{0,63}(?:\\?body=[^\\s<>]*)?|(?!(?:[A-Za-z][A-Za-z0-9+.-]*:|//|/))[A-Za-z0-9.][^\\s<>\\\\]*)$',
    },
    renderProperty: 'dataHref',
    invalidDiagnostic: 'INVALID_DIRECTIVE_LINK',
  };
}

export function optionalLinkAttribute(): DirectiveAttributeDefinition {
  return { ...linkAttribute(), required: false };
}

export function sourceLinkAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'href',
    description: 'IPv4 loopback editor-helper URL with an absolute path and positive source line.',
    required: true,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 1000,
      pattern:
        '^http://127\\.0\\.0\\.1:(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])/open\\?path=(?:%2[Ff]|/)[^\\s<>&#]+&line=[1-9][0-9]{0,8}$',
    },
    renderProperty: 'dataHref',
    invalidDiagnostic: 'INVALID_SOURCE_LINK',
  };
}

export function descriptionAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'description',
    description: 'Meaningful plain-text description for the visual.',
    required: true,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
    renderProperty: 'dataDescription',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function numberAttribute(name: 'value', description: string): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: {
      kind: 'number',
      minimum: -999_999_999,
      maximum: 999_999_999,
      multipleOf: 0.0001,
      lexicalPattern: '^-?(?:0|[1-9]\\d{0,8})(?:\\.\\d{1,4})?$',
    },
    renderProperty: 'dataValue',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function responseNumberAttribute(
  name: 'min' | 'max' | 'step',
  description: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    constraint: {
      kind: 'number',
      minimum: -999_999_999,
      maximum: 999_999_999,
      multipleOf: 0.0001,
      lexicalPattern: '^-?(?:0|[1-9]\\d{0,8})(?:\\.\\d{1,4})?$',
    },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function textAttribute(
  name: string,
  description: string,
  required: boolean,
  defaultValue?: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 160 },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

/**
 * Inflected spellings the author declares for one glossary term, comma separated. The package does
 * not inflect words itself: a morphology library would put language data and someone else's
 * dictionary quality inside a product whose every other rule is declared in the source and checked
 * offline. Declared forms cannot produce a false match, because the author names exactly what counts
 * as a form.
 */
export function glossaryFormsAttribute(): DirectiveAttributeDefinition {
  return {
    name: 'forms',
    description:
      'Additional declared spellings of the canonical term, comma separated. An occurrence of any declared form counts as an occurrence of the term.',
    required: false,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 640 },
    renderProperty: attributeRenderProperty('forms'),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function responseTextAttribute(
  name: string,
  description: string,
  required: boolean,
  maxLength: number,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required,
    constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function attributeRenderProperty(name: string): string {
  return `data${name
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')}`;
}

export function enumAttribute(
  name: string,
  description: string,
  values: readonly [string, ...string[]],
  defaultValue: string,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    default: defaultValue,
    constraint: { kind: 'enum', values },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function requiredEnumAttribute(
  name: string,
  description: string,
  values: readonly [string, ...string[]],
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: true,
    constraint: { kind: 'enum', values },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function booleanAttribute(
  name: string,
  description: string,
  defaultValue: boolean,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    default: defaultValue,
    constraint: { kind: 'boolean' },
    renderProperty: attributeRenderProperty(name),
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function container<const Name extends 'cards' | 'card' | 'steps'>(
  name: Name,
  description: string,
  options: {
    readonly tagName?: 'article' | 'section';
    readonly requiredParent?: string | readonly [string, ...string[]];
    readonly preferredParent?: string;
    readonly handoffs?: readonly ['semantic-document', ...'semantic-document'[]];
  } = {},
): DirectiveDefinition & { readonly name: Name } {
  return {
    name,
    description,
    forms: ['container'],
    attributes: [titleAttribute],
    children: name === 'cards' ? 'markdown-and-card-directives' : 'markdown',
    placement: {
      ...(options.requiredParent === undefined ? {} : { requiredParent: options.requiredParent }),
      ...(options.preferredParent === undefined
        ? {}
        : { preferredParent: options.preferredParent }),
    },
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'none',
    },
    sanitizer: {
      tagName: options.tagName ?? 'section',
      className: `semantic-${name}`,
      properties: ['dataSemantic', 'dataDirectiveTitle'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: options.handoffs ?? ['semantic-document'],
  };
}

export function integerAttribute(
  name: 'start' | 'step',
  description: string,
  defaultValue: number,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required: false,
    default: defaultValue,
    constraint: {
      kind: 'integer',
      minimum: -999_999,
      maximum: 999_999,
      lexicalPattern: '^-?\\d{1,6}$',
    },
    renderProperty: name === 'start' ? 'dataStart' : 'dataStep',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

export function pathAttribute(
  name: 'src' | 'poster' | 'chapters',
  description: string,
  renderProperty:
    | 'dataLocalAsset'
    | 'dataFontSource'
    | 'dataVideoSource'
    | 'dataVideoPoster'
    | 'dataVideoChapters',
  required = true,
): DirectiveAttributeDefinition {
  return {
    name,
    description,
    required,
    constraint: {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      maxLength: 200,
      format: 'relative-local-path',
    },
    renderProperty,
    invalidDiagnostic: 'INVALID_DIRECTIVE_PATH',
  };
}
