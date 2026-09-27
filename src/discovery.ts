import {
  authoringRegistry,
  type ConstraintDefinition,
  type DirectiveDefinition,
} from './authoring/registry.js';
import {
  getDirectiveSchema,
  getManifestSchema,
  getSourceSchema,
  getThemeSchema,
  type JsonSchema,
} from './authoring/schemas.js';
import { THEME_CONTRAST_PAIRS } from './authoring/theme-contrast.js';
import { THEME_ACCENTS, THEME_FIELDS, THEME_FONT_FAMILIES } from './authoring/themes.js';
import { describeAuthoredRules } from './render/authored-rules.js';
import type { AuthoredRuleDescription } from './render/authored-rule-contract.js';
// The rule sets register themselves when the phase module is loaded, and discovery must not depend
// on a run having happened first.
import './render/directives.js';

export type SchemaScope = 'manifest' | 'directives' | 'source' | 'theme';

export interface ExampleContract {
  readonly id: string;
  readonly path: string;
  readonly entry: string;
  readonly title: string;
  readonly description: string;
  readonly classes: readonly string[];
  readonly category: string;
  readonly subvariant?: string;
  readonly starter?: { readonly default: boolean };
}

export interface SourceContract {
  readonly contractVersion: number;
  readonly source: typeof authoringRegistry.source;
  readonly directives: Readonly<Record<string, DirectiveContract>>;
  readonly outputs: {
    readonly default: typeof authoringRegistry.output.default;
    readonly formats: typeof authoringRegistry.output.formats;
    readonly runtimePlacement: typeof authoringRegistry.output.runtimePlacement;
  };
  readonly page: PublicPageContract;
  readonly visualizations: typeof authoringRegistry.visualizations;
  /**
   * The authored checks of the directive phase and the dependencies between them, readable without
   * running a single one. A consumer can see what is judged about each subject and why a rule stays
   * silent when another refused; under a phase built on thrown failures that answer existed only as
   * the order of statements.
   */
  readonly authoredRules: readonly AuthoredRuleDescription[];
  readonly safety: readonly string[];
  readonly capabilities: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, string>>;
}

type PublicPageContract = typeof authoringRegistry.page & {
  /**
   * Договор темы: поля файла темы и темы во frontmatter, именованные акценты и гарнитуры. Агент
   * читает его, чтобы написать свою тему, не открывая исходников пакета.
   */
  readonly theme: {
    readonly fields: typeof THEME_FIELDS;
    readonly accents: typeof THEME_ACCENTS;
    readonly fontFamilies: typeof THEME_FONT_FAMILIES;
    readonly resolution: readonly ['default theme', 'extends chain', 'accent', 'explicit fields'];
    readonly contrast: typeof THEME_CONTRAST_PAIRS;
  };
};

interface DirectiveContract {
  readonly description: string;
  readonly forms: readonly string[];
  readonly attributes: Readonly<Record<string, AttributeContract>>;
  readonly incompatibleCombinations?: DirectiveDefinition['incompatibleCombinations'];
  readonly children: DirectiveDefinition['children'];
  readonly placement: DirectiveDefinition['placement'];
  readonly resource: DirectiveDefinition['behavior']['resource'];
  readonly runtime: DirectiveDefinition['behavior']['runtime'];
  readonly security: DirectiveDefinition['security'];
  readonly handoffs: DirectiveDefinition['handoffs'];
}

type AttributeContract = ConstraintDefinition & {
  readonly required: boolean;
  readonly default?: string | number | boolean;
  readonly description: string;
};

export const sourceContract: SourceContract = deepFreeze(structuredClone(createSourceContract()));
export type DirectiveName = (typeof authoringRegistry.directives)[number]['name'];

export function getSourceContract(): SourceContract {
  return structuredClone(createSourceContract());
}

export function getAuthoringSchema(scope: SchemaScope): JsonSchema {
  switch (scope) {
    case 'manifest':
      return getManifestSchema();
    case 'directives':
      return getDirectiveSchema();
    case 'source':
      return getSourceSchema();
    case 'theme':
      return getThemeSchema();
  }
}

export function listExamples(): readonly ExampleContract[] {
  return structuredClone(authoringRegistry.examples);
}

function createSourceContract(): SourceContract {
  return {
    contractVersion: authoringRegistry.contract.major,
    source: authoringRegistry.source,
    directives: Object.fromEntries(
      (authoringRegistry.directives as readonly DirectiveDefinition[]).map((directive) => [
        directive.name,
        {
          description: directive.description,
          forms: directive.forms,
          attributes: Object.fromEntries(
            directive.attributes.map((attribute) => [
              attribute.name,
              {
                ...attribute.constraint,
                required: attribute.required,
                ...(attribute.default === undefined ? {} : { default: attribute.default }),
                description: attribute.description,
              },
            ]),
          ),
          ...(directive.incompatibleCombinations === undefined
            ? {}
            : { incompatibleCombinations: directive.incompatibleCombinations }),
          children: directive.children,
          placement: directive.placement,
          resource: directive.behavior.resource,
          runtime: directive.behavior.runtime,
          security: directive.security,
          handoffs: directive.handoffs,
        },
      ]),
    ),
    outputs: authoringRegistry.output,
    page: {
      ...authoringRegistry.page,
      theme: {
        fields: THEME_FIELDS,
        accents: THEME_ACCENTS,
        fontFamilies: THEME_FONT_FAMILIES,
        resolution: ['default theme', 'extends chain', 'accent', 'explicit fields'],
        contrast: THEME_CONTRAST_PAIRS,
      },
    },
    visualizations: authoringRegistry.visualizations,
    authoredRules: describeAuthoredRules(),
    safety: [
      'canonical source-root confinement',
      'local resources only',
      'sanitized Markdown HTML',
      'no author code or template execution',
    ],
    capabilities: Object.fromEntries(
      authoringRegistry.capabilities.map((capability) => [capability.id, capability.description]),
    ),
    commands: Object.fromEntries(
      authoringRegistry.commands.map((command) => [command.id, command.description]),
    ),
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
