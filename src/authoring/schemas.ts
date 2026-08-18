import { z } from 'zod';

import {
  authoringRegistry,
  type AuthoringRegistryDefinition,
  type ConstraintDefinition,
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  type FieldDefinition,
  type ScalarFieldDefinition,
} from './registry.js';
import {
  isNormalizedPackageRelativePosixPath,
  normalizePackageRelativePosixReference,
} from './local-reference.js';
import { authoringRegistryIntegrityIssues } from './registry-integrity.js';

export type JsonSchema = Readonly<Record<string, unknown>>;

type ConstraintValue<Constraint extends ConstraintDefinition> = Constraint extends {
  readonly kind: 'integer' | 'number';
}
  ? number
  : Constraint extends {
        readonly kind: 'enum';
        readonly values: readonly (infer Value extends string)[];
      }
    ? Value
    : string;

type FieldValue<Field extends FieldDefinition, Normalized extends boolean> = Field extends {
  readonly fields: infer Fields extends readonly FieldDefinition[];
}
  ? ManifestFieldsValue<Fields, Normalized>
  : Field extends { readonly constraint: infer Constraint extends ConstraintDefinition }
    ? ConstraintValue<Constraint>
    : never;

type RequiredFieldNames<
  Fields extends readonly FieldDefinition[],
  Normalized extends boolean,
> = Fields[number] extends infer Field extends FieldDefinition
  ? Field extends unknown
    ? Field['required'] extends true
      ? Field['name']
      : Normalized extends true
        ? Field extends { readonly default: unknown }
          ? Field['name']
          : never
        : never
    : never
  : never;

type OptionalFieldNames<
  Fields extends readonly FieldDefinition[],
  Normalized extends boolean,
> = Exclude<Fields[number]['name'], RequiredFieldNames<Fields, Normalized>>;

type FieldForName<
  Fields extends readonly FieldDefinition[],
  Name extends Fields[number]['name'],
> = Extract<Fields[number], { readonly name: Name }>;

export type ManifestFieldsValue<
  Fields extends readonly FieldDefinition[],
  Normalized extends boolean,
> = {
  readonly [Name in RequiredFieldNames<Fields, Normalized>]: FieldValue<
    FieldForName<Fields, Name>,
    Normalized
  >;
} & {
  readonly [Name in OptionalFieldNames<Fields, Normalized>]?: FieldValue<
    FieldForName<Fields, Name>,
    Normalized
  >;
};

export type ManifestInputFromRegistry<Registry extends AuthoringRegistryDefinition> =
  ManifestFieldsValue<Registry['manifestFields'], false>;

export type ManifestFromRegistry<Registry extends AuthoringRegistryDefinition> =
  ManifestFieldsValue<Registry['manifestFields'], true>;

export type ReportManifestInput = ManifestInputFromRegistry<typeof authoringRegistry>;
export type ReportManifest = ManifestFromRegistry<typeof authoringRegistry>;

export const reportManifestInputSchema = bindRegistrySchema<ReportManifestInput>(
  zodManifestInputSchema(authoringRegistry),
);

export const reportManifestSchema: z.ZodType<ReportManifest> = reportManifestInputSchema.transform(
  (input) => normalizeManifest(input, authoringRegistry),
);

export const directiveInvocationSchema = z.union(
  authoringRegistry.directives.map(zodDirective) as unknown as readonly [
    z.ZodType,
    z.ZodType,
    ...z.ZodType[],
  ],
);

export type DirectiveAttributeInterpretation =
  | {
      readonly ok: true;
      readonly values: Readonly<Record<string, string | number>>;
    }
  | {
      readonly ok: false;
      readonly reason: 'unknown';
      readonly attributes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'required' | 'invalid';
      readonly attribute: DirectiveAttributeDefinition;
    };

export const completeSourceSchema = z.strictObject({
  manifest: reportManifestInputSchema,
  markdown: z.string().min(1),
  partials: z
    .record(z.string(), z.string())
    .refine((partials) => Object.keys(partials).every(isNormalizedPackageRelativePosixPath))
    .optional(),
  directives: z.array(directiveInvocationSchema).optional(),
  resources: z.array(zodNormalizedLocalReference(z.string().trim())).optional(),
});

export interface AuthoringSchemaProjection {
  readonly manifest: JsonSchema;
  readonly directives: JsonSchema;
  readonly source: JsonSchema;
}

export const SCHEMA_CONTRACT_KEYWORD = 'x-agentic-report-contract' as const;

export interface SchemaContractMetadata {
  readonly currentMajor: number;
  readonly supportedReaderMajors: readonly number[];
  readonly legacySourceMajor: number;
  readonly evolution: {
    readonly additiveWithinMajor: boolean;
    readonly breakingChangeRequiresNewMajor: boolean;
    readonly silentReinterpretationAllowed: boolean;
  };
}

const projectedSchemas = projectAuthoringSchemas(authoringRegistry);

export function parseReportManifest(input: unknown): ReportManifest {
  return reportManifestSchema.parse(input);
}

export function interpretDirectiveAttributes(
  directive: DirectiveDefinition,
  input: Readonly<Record<string, string | null>>,
): DirectiveAttributeInterpretation {
  const knownNames = new Set(directive.attributes.map((attribute) => attribute.name));
  const unknown = Object.keys(input).filter((name) => !knownNames.has(name));
  if (unknown.length > 0) return { ok: false, reason: 'unknown', attributes: unknown };

  const values: Record<string, string | number> = Object.create(null) as Record<
    string,
    string | number
  >;
  for (const attribute of directive.attributes) {
    const authored = input[attribute.name];
    if (authored === undefined || authored === null) {
      if (attribute.default !== undefined) values[attribute.name] = attribute.default;
      else if (attribute.required) return { ok: false, reason: 'required', attribute };
      continue;
    }
    const candidate = lexicalAttributeValue(authored, attribute.constraint);
    if (candidate === undefined) return { ok: false, reason: 'invalid', attribute };
    const parsed = zodConstraint(attribute.constraint).safeParse(candidate);
    if (!parsed.success) return { ok: false, reason: 'invalid', attribute };
    values[attribute.name] = parsed.data as string | number;
  }
  return { ok: true, values };
}

export function parseReportManifestFromRegistry<const Registry extends AuthoringRegistryDefinition>(
  input: unknown,
  registry: Registry,
): ManifestFromRegistry<Registry> {
  const issues = authoringRegistryIntegrityIssues(registry);
  if (issues.length > 0) {
    throw new Error(`Cannot interpret invalid authoring registry:\n${issues.join('\n')}`);
  }
  const parsed = bindRegistryValue<ManifestInputFromRegistry<Registry>>(
    zodManifestInputSchema(registry).parse(input),
  );
  return normalizeManifest(parsed, registry);
}

export function getManifestSchema(): JsonSchema {
  return structuredClone(projectedSchemas.manifest);
}

export function getDirectiveSchema(): JsonSchema {
  return structuredClone(projectedSchemas.directives);
}

export function getSourceSchema(): JsonSchema {
  return structuredClone(projectedSchemas.source);
}

export function projectAuthoringSchemas(
  registry: AuthoringRegistryDefinition,
): AuthoringSchemaProjection {
  const issues = authoringRegistryIntegrityIssues(registry);
  if (issues.length > 0) {
    throw new Error(`Cannot project invalid authoring registry:\n${issues.join('\n')}`);
  }
  const manifest = objectSchemaFromFields(
    registry,
    registry.manifestFields,
    registry.contract.schemaIds.manifest,
    'Agentic Report manifest',
  );
  const directives = createDirectiveJsonSchema(registry);
  return {
    manifest,
    directives,
    source: createSourceJsonSchema(registry, manifest, directives),
  };
}

function normalizeManifest<const Registry extends AuthoringRegistryDefinition>(
  input: ManifestInputFromRegistry<Registry>,
  registry: Registry,
): ManifestFromRegistry<Registry> {
  return bindRegistryValue<ManifestFromRegistry<Registry>>(
    normalizeFieldValues(registry.manifestFields, input),
  );
}

function normalizeFieldValues(
  fields: readonly FieldDefinition[],
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const normalized: Record<string, unknown> = {};
  for (const field of fields) {
    const authored = input[field.name];
    if (field.fields === undefined) {
      if (authored !== undefined) normalized[field.name] = authored;
      else if (field.default !== undefined) normalized[field.name] = structuredClone(field.default);
      continue;
    }
    if (authored === undefined && field.default === undefined && !field.required) continue;
    const source = isRecord(authored) ? authored : isRecord(field.default) ? field.default : {};
    normalized[field.name] = normalizeFieldValues(field.fields, source);
  }
  return normalized;
}

function zodManifestInputSchema(registry: AuthoringRegistryDefinition): z.ZodType {
  return z.strictObject(
    Object.fromEntries(
      registry.manifestFields.map((field) => [field.name, zodField(field)]),
    ) as Record<string, z.ZodType>,
  );
}

function bindRegistrySchema<Value>(schema: z.ZodType): z.ZodType<Value> {
  return schema as z.ZodType<Value>;
}

function bindRegistryValue<Value>(value: unknown): Value {
  return value as Value;
}

function zodField(field: FieldDefinition): z.ZodType {
  const schema =
    field.fields === undefined
      ? zodConstraint(field.constraint)
      : z.strictObject(
          Object.fromEntries(field.fields.map((nested) => [nested.name, zodField(nested)])),
        );
  const described = schema.describe(field.description);
  const documented =
    field.default === undefined ? described : described.meta({ default: field.default });
  return field.required ? documented : documented.optional();
}

function zodConstraint(constraint: ConstraintDefinition): z.ZodType {
  switch (constraint.kind) {
    case 'string': {
      const compiledPattern =
        constraint.pattern === undefined
          ? undefined
          : new RegExp(`^(?:${unanchor(constraint.pattern)})$`, 'u');
      const schema = z
        .string()
        .trim()
        .superRefine((value, context) => {
          const length = [...value].length;
          if (length < constraint.minLength) {
            context.addIssue({
              code: 'custom',
              message: `String must contain at least ${constraint.minLength} Unicode code points.`,
            });
          }
          if (constraint.maxLength !== undefined && length > constraint.maxLength) {
            context.addIssue({
              code: 'custom',
              message: `String must contain at most ${constraint.maxLength} Unicode code points.`,
            });
          }
          if (compiledPattern !== undefined && !compiledPattern.test(value)) {
            context.addIssue({
              code: 'custom',
              message: 'String does not match the declared pattern.',
            });
          }
        });
      return constraint.format === 'relative-local-path'
        ? zodNormalizedLocalReference(schema)
        : schema;
    }
    case 'integer': {
      let schema = z.number().int();
      if (constraint.minimum !== undefined) schema = schema.min(constraint.minimum);
      if (constraint.maximum !== undefined) schema = schema.max(constraint.maximum);
      return schema;
    }
    case 'number': {
      let schema = z.number().finite();
      if (constraint.minimum !== undefined) schema = schema.min(constraint.minimum);
      if (constraint.maximum !== undefined) schema = schema.max(constraint.maximum);
      if (constraint.multipleOf !== undefined) schema = schema.multipleOf(constraint.multipleOf);
      return schema;
    }
    case 'enum':
      return z.enum(asNonEmptyTuple(constraint.values));
    default:
      return assertNever(constraint);
  }
}

function lexicalAttributeValue(
  authored: string,
  constraint: ConstraintDefinition,
): string | number | undefined {
  if (constraint.kind !== 'integer' && constraint.kind !== 'number') return authored;
  if (
    constraint.lexicalPattern !== undefined &&
    !new RegExp(constraint.lexicalPattern, 'u').test(authored)
  ) {
    return undefined;
  }
  const numeric = Number(authored);
  return Number.isFinite(numeric) && (constraint.kind === 'number' || Number.isSafeInteger(numeric))
    ? numeric
    : undefined;
}

function zodNormalizedLocalReference(schema: z.ZodType<string>): z.ZodType<string> {
  return schema.transform((value, context) => {
    const normalized = normalizePackageRelativePosixReference(value);
    if (!normalized.ok) {
      context.addIssue({
        code: 'custom',
        message:
          normalized.reason === 'invalid-uri'
            ? 'Local reference is not valid URI text.'
            : 'Local reference must be a confined relative POSIX path.',
      });
      return z.NEVER;
    }
    return normalized.value;
  });
}

function zodDirective(directive: DirectiveDefinition): z.ZodType {
  const attributes = Object.fromEntries(
    directive.attributes.map((attribute) => [attribute.name, zodAttribute(attribute)]),
  );
  return z.strictObject({
    name: z.literal(directive.name),
    form: z.enum(asNonEmptyTuple(directive.forms)),
    attributes: z.strictObject(attributes),
  });
}

function zodAttribute(attribute: DirectiveDefinition['attributes'][number]): z.ZodType {
  const schema = zodConstraint(attribute.constraint).describe(attribute.description);
  return attribute.required ? schema : schema.optional();
}

function objectSchemaFromFields(
  registry: AuthoringRegistryDefinition,
  fields: readonly FieldDefinition[],
  id?: string,
  title?: string,
): JsonSchema {
  const required = fields.filter((field) => field.required).map((field) => field.name);
  return {
    $schema: registry.contract.schemaDialect,
    ...(id === undefined ? {} : { $id: id }),
    ...(title === undefined ? {} : { title }),
    ...(id === undefined ? {} : { [SCHEMA_CONTRACT_KEYWORD]: contractMetadata(registry) }),
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(fields.map((field) => [field.name, jsonField(registry, field)])),
    ...(required.length === 0 ? {} : { required }),
  };
}

function jsonField(registry: AuthoringRegistryDefinition, field: FieldDefinition): JsonSchema {
  const schema =
    field.fields === undefined
      ? jsonConstraint(field)
      : objectSchemaFromFields(registry, field.fields);
  return {
    ...withoutSchemaDialect(schema),
    description: field.description,
    ...(field.default === undefined ? {} : { default: field.default }),
  };
}

function jsonConstraint(field: ScalarFieldDefinition): JsonSchema {
  const { constraint } = field;
  switch (constraint.kind) {
    case 'string':
      return {
        type: 'string',
        pattern: trimmedStringPattern(constraint),
        ...(constraint.format === undefined ? {} : { format: constraint.format }),
      };
    case 'integer':
      return {
        type: 'integer',
        ...(constraint.minimum === undefined ? {} : { minimum: constraint.minimum }),
        ...(constraint.maximum === undefined ? {} : { maximum: constraint.maximum }),
      };
    case 'number':
      return {
        type: 'number',
        ...(constraint.minimum === undefined ? {} : { minimum: constraint.minimum }),
        ...(constraint.maximum === undefined ? {} : { maximum: constraint.maximum }),
        ...(constraint.multipleOf === undefined ? {} : { multipleOf: constraint.multipleOf }),
      };
    case 'enum':
      return { type: 'string', enum: [...constraint.values] };
    default:
      return assertNever(constraint);
  }
}

function trimmedStringPattern(
  constraint: Extract<ConstraintDefinition, { readonly kind: 'string' }>,
): string {
  const alternatives: string[] = [];
  const compiledPattern =
    constraint.pattern === undefined
      ? undefined
      : new RegExp(`^(?:${unanchor(constraint.pattern)})$`, 'u');
  if (constraint.minLength === 0 && (compiledPattern === undefined || compiledPattern.test(''))) {
    alternatives.push('');
  }
  if (constraint.maxLength === undefined || constraint.maxLength >= 1) {
    const body = trimmedNonEmptyBodyPattern(
      Math.max(1, constraint.minLength),
      constraint.maxLength,
    );
    const patternAssertion =
      constraint.pattern === undefined
        ? ''
        : `(?=(?:${unanchor(constraint.pattern)})(?<!\\s)\\s*$)`;
    alternatives.push(`${patternAssertion}${body}`);
  }
  if (alternatives.length === 0) return '^(?!)$';
  return `^\\s*(?:${alternatives.join('|')})\\s*$`;
}

function trimmedNonEmptyBodyPattern(minimum: number, maximum?: number): string {
  if (maximum === 1) return '\\S';
  if (minimum <= 1) {
    const middleMaximum = maximum === undefined ? '' : String(maximum - 2);
    return `(?:\\S|\\S[\\s\\S]{0,${middleMaximum}}\\S)`;
  }
  const middleMinimum = minimum - 2;
  const middleMaximum = maximum === undefined ? '' : String(maximum - 2);
  return `\\S[\\s\\S]{${middleMinimum},${middleMaximum}}\\S`;
}

function unanchor(pattern: string): string {
  return pattern.replace(/^\^/u, '').replace(/\$$/u, '');
}

function createDirectiveJsonSchema(registry: AuthoringRegistryDefinition): JsonSchema {
  const definitions = Object.fromEntries(
    registry.directives.map((directive) => [directive.name, directiveSchema(directive)]),
  );
  return {
    $schema: registry.contract.schemaDialect,
    $id: registry.contract.schemaIds.directives,
    title: 'Agentic Report directive invocation',
    [SCHEMA_CONTRACT_KEYWORD]: contractMetadata(registry),
    oneOf: registry.directives.map((directive) => ({
      $ref: `#/$defs/${directive.name}`,
    })),
    $defs: definitions,
  };
}

function directiveSchema(directive: DirectiveDefinition): JsonSchema {
  const attributes = Object.fromEntries(
    directive.attributes.map((attribute) => [
      attribute.name,
      {
        ...jsonConstraint(attribute),
        description: attribute.description,
        ...(attribute.default === undefined ? {} : { default: attribute.default }),
      },
    ]),
  );
  const requiredAttributes = directive.attributes
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.name);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { const: directive.name },
      form: { type: 'string', enum: [...directive.forms] },
      attributes: {
        type: 'object',
        additionalProperties: false,
        properties: attributes,
        ...(requiredAttributes.length === 0 ? {} : { required: requiredAttributes }),
      },
    },
    required: ['name', 'form', 'attributes'],
  };
}

function createSourceJsonSchema(
  registry: AuthoringRegistryDefinition,
  manifestSchema: JsonSchema,
  directiveSchemaValue: JsonSchema,
): JsonSchema {
  const directiveBody = withoutSchemaDialect(directiveSchemaValue);
  const directiveDefinitions = directiveBody.$defs as Readonly<Record<string, unknown>>;
  const { $defs: _directiveDefinitions, ...directiveRoot } = directiveBody;
  return {
    $schema: registry.contract.schemaDialect,
    $id: registry.contract.schemaIds.source,
    title: 'Complete Agentic Report declarative source',
    [SCHEMA_CONTRACT_KEYWORD]: contractMetadata(registry),
    type: 'object',
    additionalProperties: false,
    properties: {
      manifest: withoutSchemaDialect(manifestSchema),
      markdown: { type: 'string', minLength: 1 },
      partials: {
        type: 'object',
        additionalProperties: { type: 'string' },
        propertyNames: { type: 'string', format: 'relative-local-path' },
      },
      directives: {
        type: 'array',
        items: { $ref: '#/$defs/directive' },
      },
      resources: {
        type: 'array',
        items: { type: 'string', format: 'relative-local-path' },
      },
    },
    required: ['manifest', 'markdown'],
    $defs: { directive: directiveRoot, ...directiveDefinitions },
  };
}

function contractMetadata(registry: AuthoringRegistryDefinition): SchemaContractMetadata {
  return {
    currentMajor: registry.contract.major,
    supportedReaderMajors: [...registry.contract.supportedReaderMajors],
    legacySourceMajor: registry.contract.legacySourceMajor,
    evolution: { ...registry.contract.evolution },
  };
}

function withoutSchemaDialect(schema: JsonSchema): JsonSchema {
  const {
    $schema: _schema,
    $id: _id,
    title: _title,
    [SCHEMA_CONTRACT_KEYWORD]: _contract,
    ...rest
  } = schema;
  return rest;
}

function asNonEmptyTuple(values: readonly string[]): readonly [string, ...string[]] {
  if (values.length === 0) throw new Error('Registry enum must not be empty');
  return values as [string, ...string[]];
}

function assertNever(value: never): never {
  throw new Error(`Unsupported authoring registry value: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
