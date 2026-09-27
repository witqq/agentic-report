/**
 * Словарь страницы с расширениями: встроенные директивы и блоки плюс то, что добавляют её расширения.
 *
 * - Составной блок и поставщик становятся модулями `defineBlock`, собранными из манифеста: их
 *   атрибуты читает та же грамматика, что у встроенных (`interpretDirectiveAttributes`), а в словарь
 *   фазы директив они не попадают — их узлы разворачиваются раньше (`expand.ts`).
 * - Эффект добавляет свои атрибуты-цели объявленным встроенным директивам; значение переносится на
 *   элемент как `data-effect-<имя>-<атрибут>`, очистка пропускает именно эти свойства.
 * - Острова добавляют директиву `island`.
 *
 * Страница без расширений этого словаря не строит и собирается встроенным, байт в байт как раньше.
 */

import type { Options as SanitizeSchema } from 'rehype-sanitize';

import type {
  DirectiveAttributeDefinition,
  DirectiveDefinition,
} from '../authoring/directive-contract.js';
import { authoringRegistry } from '../authoring/registry.js';
import { BLOCK_STYLE_PROPERTY } from '../authoring/style-rules.js';
import { type Block, defineBlock } from '../blocks/define-block.js';
import { blockByName } from '../blocks/index.js';
import type { DirectiveVocabulary } from '../render/directives.js';
import { projectSemanticSanitizeSchema } from '../render/markdown.js';
import { type IslandCollector, islandBlock } from './island.js';
import { ISLAND_DIRECTIVE } from './load.js';
import type {
  BlockExtension,
  EffectExtension,
  EffectTarget,
  ExtensionAttribute,
  IslandExtension,
  PageExtension,
  ProviderExtension,
} from './types.js';

export interface Expansion {
  readonly extension: BlockExtension | ProviderExtension;
  readonly block: Block;
}

export interface EffectTargetBinding {
  readonly effect: EffectExtension;
  readonly target: EffectTarget;
  /** Свойство hast, которое становится атрибутом `data-effect-<имя>-<атрибут>`. */
  readonly property: string;
}

export interface PageVocabulary extends DirectiveVocabulary {
  readonly extensions: readonly PageExtension[];
  readonly expansions: ReadonlyMap<string, Expansion>;
  readonly effectTargets: readonly EffectTargetBinding[];
  readonly sanitizeSchema: SanitizeSchema;
}

export function createPageVocabulary(
  extensions: readonly PageExtension[],
  islandCollector: IslandCollector,
): PageVocabulary {
  const expansions = new Map<string, Expansion>();
  const effectTargets: EffectTargetBinding[] = [];
  const islands = new Map<string, IslandExtension>();
  for (const extension of extensions) {
    switch (extension.kind) {
      case 'block':
      case 'provider':
        expansions.set(extension.name, {
          extension,
          block: defineBlock({
            definition: expansionDefinition(extension),
            styles: 'package',
            staticEquivalent: extension.staticEquivalent,
          }),
        });
        break;
      case 'effect':
        for (const target of extension.targets)
          effectTargets.push({
            effect: extension,
            target,
            property: effectTargetProperty(extension.name, target.attribute),
          });
        break;
      case 'island':
        islands.set(extension.name, extension);
        break;
      default: {
        const exhaustive: never = extension;
        return exhaustive;
      }
    }
  }
  const directives = new Map<string, DirectiveDefinition>();
  for (const directive of authoringRegistry.directives) {
    const added = effectTargets.filter((binding) => binding.target.directive === directive.name);
    directives.set(directive.name, added.length === 0 ? directive : withTargets(directive, added));
  }
  const blocks = new Map<string, Block>(blockByName);
  if (islands.size > 0) {
    const island = islandBlock(islands, islandCollector);
    directives.set(ISLAND_DIRECTIVE, island.definition);
    blocks.set(ISLAND_DIRECTIVE, island);
  }
  const [first, ...rest] = [...directives.values()];
  if (first === undefined) throw new Error('The page vocabulary has no directives.');
  const schema = projectSemanticSanitizeSchema({
    ...authoringRegistry,
    directives: [first, ...rest],
  });
  // Метку элемента блока со стилями ставит только развёртка: у автора такого атрибута нет ни в одной
  // директиве, а сырой HTML страницы не пропускается.
  const styledBlocks = extensions.some(
    (extension) => extension.kind === 'block' && extension.styles !== undefined,
  );
  return {
    extensions,
    directives,
    blocks,
    expansions,
    effectTargets,
    sanitizeSchema: styledBlocks
      ? {
          ...schema,
          attributes: {
            ...schema.attributes,
            '*': [...(schema.attributes?.['*'] ?? []), BLOCK_STYLE_PROPERTY],
          },
        }
      : schema,
  };
}

/**
 * Свойство hast для `data-effect-<имя>-<атрибут>`: так же, как hast читает атрибут `data-*` (дефис
 * перед строчной буквой становится прописной буквой, остальное остаётся как есть).
 */
export function effectTargetProperty(effect: string, attribute: string): string {
  return `data${`-effect-${effect}-${attribute}`.replace(/-([a-z])/gu, (_match, letter: string) =>
    letter.toUpperCase(),
  )}`;
}

function withTargets(
  directive: DirectiveDefinition,
  bindings: readonly EffectTargetBinding[],
): DirectiveDefinition {
  const [firstProperty, ...properties] = directive.sanitizer.properties;
  return {
    ...directive,
    attributes: [
      ...directive.attributes,
      ...bindings.map((binding): DirectiveAttributeDefinition => ({
        name: binding.target.attribute,
        description: `Effect ${binding.effect.name}: ${binding.effect.description}`,
        required: false,
        constraint: { kind: 'enum', values: binding.target.values },
        renderProperty: binding.property,
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      })),
    ],
    sanitizer: {
      ...directive.sanitizer,
      properties: [firstProperty, ...properties, ...bindings.map((binding) => binding.property)],
    },
  };
}

/** Грамматика составного блока или поставщика, собранная из его манифеста. */
function expansionDefinition(extension: BlockExtension | ProviderExtension): DirectiveDefinition {
  const [firstForm, ...forms] = extension.forms;
  if (firstForm === undefined) throw new Error(`Extension ${extension.name} declares no form.`);
  return {
    name: extension.name,
    description: extension.description,
    forms: [firstForm, ...forms],
    attributes: Object.entries(extension.attributes).map(([name, attribute]) =>
      directiveAttribute(name, attribute),
    ),
    children: 'markdown',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: `extension-${extension.name}`,
      properties: ['dataSemantic'],
    },
    security: {
      authorCode: extension.kind === 'provider',
      rawHtml: false,
      localResourceOnly: false,
    },
    handoffs: ['semantic-document'],
  };
}

function directiveAttribute(
  name: string,
  attribute: ExtensionAttribute,
): DirectiveAttributeDefinition {
  const shared = {
    name,
    description: attribute.description ?? `Attribute ${name}.`,
    required: attribute.required === true,
    ...(attribute.default === undefined ? {} : { default: attribute.default }),
    renderProperty: `data${`-${name}`.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    )}`,
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE' as const,
  };
  switch (attribute.type) {
    case 'string':
      return {
        ...shared,
        constraint: {
          kind: 'string',
          normalization: 'trim',
          minLength: attribute.required === true ? 1 : 0,
          ...(attribute.maxLength === undefined ? {} : { maxLength: attribute.maxLength }),
        },
      };
    case 'number':
      return {
        ...shared,
        constraint: {
          kind: 'number',
          ...(attribute.minimum === undefined ? {} : { minimum: attribute.minimum }),
          ...(attribute.maximum === undefined ? {} : { maximum: attribute.maximum }),
        },
      };
    case 'boolean':
      return { ...shared, constraint: { kind: 'boolean' } };
    case 'enum':
      return { ...shared, constraint: { kind: 'enum', values: attribute.values } };
    default: {
      const exhaustive: never = attribute;
      return exhaustive;
    }
  }
}
