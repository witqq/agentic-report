import {
  authoringRegistry,
  type ConstraintDefinition,
  type DirectiveDefinition,
} from './authoring/registry.js';
import {
  getDirectiveSchema,
  getManifestSchema,
  getSourceSchema,
  type JsonSchema,
} from './authoring/schemas.js';

export type SchemaScope = 'manifest' | 'directives' | 'source';

export interface ExampleContract {
  readonly id: string;
  readonly path: string;
  readonly entry: string;
  readonly title: string;
  readonly description: string;
  readonly classes: readonly string[];
  readonly starter?: {
    readonly default: boolean;
    readonly aliases?: readonly string[];
  };
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
  readonly safety: readonly string[];
  readonly capabilities: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, string>>;
}

type PublicPageToken = (typeof authoringRegistry.page.tokens)[number] & {
  readonly defaultVisibility: 'normalization-only';
};

type PublicPageContract = Omit<typeof authoringRegistry.page, 'tokens'> & {
  readonly tokens: readonly PublicPageToken[];
  readonly tokenResolution: {
    readonly defaultsFrom: 'selected-preset';
    readonly precedence: readonly ['selected-preset', 'explicit-tokens'];
  };
};

interface DirectiveContract {
  readonly description: string;
  readonly forms: readonly string[];
  readonly attributes: Readonly<Record<string, AttributeContract>>;
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
      tokens: authoringRegistry.page.tokens.map((token) => ({
        ...token,
        defaultVisibility: 'normalization-only',
      })),
      tokenResolution: {
        defaultsFrom: 'selected-preset',
        precedence: ['selected-preset', 'explicit-tokens'],
      },
    },
    visualizations: authoringRegistry.visualizations,
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
