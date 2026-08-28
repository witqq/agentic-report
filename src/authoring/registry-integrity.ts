import type {
  AuthoringRegistryDefinition,
  ConstraintDefinition,
  DirectiveDefinition,
  FieldDefinition,
  RendererKey,
} from './registry.js';
import { OUTPUT_CONTRACT, PAGE_CONTRACT } from './registry.js';
import { isPackageRelativePosixPath } from './local-reference.js';
import { isRegistryIdentity } from './registry-identity.js';

export type RegistryIntegrityInput = AuthoringRegistryDefinition;

export function authoringRegistryIntegrityIssues(
  registry: RegistryIntegrityInput,
): readonly string[] {
  const issues: string[] = [];
  checkContract(registry, issues);
  checkSource(registry, issues);
  checkUnique(registry.manifestFields, 'manifest field', issues);
  checkFields(registry.manifestFields, 'manifest', issues);
  checkUnique(registry.directives, 'directive', issues);
  checkUnique(registry.capabilities, 'capability', issues);
  checkUnique(registry.commands, 'command', issues);
  checkUnique(registry.examples, 'example', issues);

  checkOutputFormats(registry, issues);
  checkPageContract(registry, issues);

  for (const directive of registry.directives) {
    if (directive.description.trim().length === 0)
      issues.push(`${directive.name}: empty description`);
    if (new Set(directive.forms).size !== directive.forms.length) {
      issues.push(`${directive.name}: duplicate accepted form`);
    }
    checkUnique(directive.attributes, `${directive.name} attribute`, issues);
    checkFields(directive.attributes, directive.name, issues);
    const renderProperties = directive.attributes.map((attribute) => attribute.renderProperty);
    if (new Set(renderProperties).size !== renderProperties.length) {
      issues.push(`${directive.name}: duplicate rendered attribute property`);
    }
    for (const attribute of directive.attributes) {
      if (!/^data[A-Z][A-Za-z0-9]*$/u.test(attribute.renderProperty)) {
        issues.push(`${directive.name}.${attribute.name}: unsafe rendered attribute property`);
      }
    }
    for (const target of [
      directive.placement.requiredParent,
      directive.placement.preferredParent,
    ]) {
      if (
        target !== undefined &&
        !registry.directives.some((candidate) => candidate.name === target)
      ) {
        issues.push(`${directive.name}: unknown parent ${target}`);
      }
    }
    if (new Set(directive.sanitizer.properties).size !== directive.sanitizer.properties.length) {
      issues.push(`${directive.name}: duplicate sanitizer property`);
    }
    if (directive.sanitizer.className !== `semantic-${directive.name}`) {
      issues.push(`${directive.name}: sanitizer class differs from directive identity`);
    }
    const expectedProperties = expectedSanitizerProperties(directive);
    if (!sameOrderedValues(directive.sanitizer.properties, expectedProperties)) {
      issues.push(`${directive.name}: sanitizer properties differ from rendered properties`);
    }
    if (new Set(directive.handoffs).size !== directive.handoffs.length) {
      issues.push(`${directive.name}: duplicate handoff`);
    }
    rendererDisposition(directive.behavior.renderer);
  }

  const starters = registry.examples.filter((example) => example.starter !== undefined);
  const defaultStarters = starters.filter((example) => example.starter?.default === true);
  if (starters.length === 0) issues.push('example: expected at least one initializable starter');
  if (defaultStarters.length !== 1) issues.push('example: expected exactly one default starter');
  const starterNames = new Set(registry.examples.map((example) => example.id));
  for (const starter of starters) {
    for (const alias of starter.starter?.aliases ?? []) {
      if (!isRegistryIdentity(alias)) issues.push(`${starter.id}: unsafe starter alias ${alias}`);
      if (starterNames.has(alias))
        issues.push(`${starter.id}: starter alias conflicts with ${alias}`);
      else starterNames.add(alias);
    }
    if (new Set(starter.starter?.aliases ?? []).size !== (starter.starter?.aliases ?? []).length) {
      issues.push(`${starter.id}: duplicate starter alias`);
    }
  }
  for (const capability of registry.capabilities) {
    if (!isRegistryIdentity(capability.id)) {
      issues.push(`${capability.id || 'capability'}: unsafe capability identity`);
    }
    if (capability.description.trim().length === 0) {
      issues.push(`${capability.id || 'capability'}: empty capability description`);
    }
  }
  for (const command of registry.commands) {
    if (!isRegistryIdentity(command.id)) {
      issues.push(`${command.id || 'command'}: unsafe command identity`);
    }
    if (command.description.trim().length === 0) {
      issues.push(`${command.id || 'command'}: empty command description`);
    }
  }
  for (const example of registry.examples) {
    for (const [field, value] of Object.entries({
      id: example.id,
      path: example.path,
      entry: example.entry,
      title: example.title,
      description: example.description,
    })) {
      if (value.trim().length === 0) issues.push(`${example.id || 'example'}: empty ${field}`);
    }
    if (!isRegistryIdentity(example.id)) {
      issues.push(`${example.id || 'example'}: unsafe example identity`);
    }
    if (!isPackageRelativePosixPath(example.path)) {
      issues.push(`${example.id}: non-relative example path`);
    }
    if (!isPackageRelativePosixPath(example.entry)) {
      issues.push(`${example.id}: non-relative example entry`);
    }
    if (new Set(example.classes).size !== example.classes.length) {
      issues.push(`${example.id}: duplicate showcase class`);
    }
    if (example.classes.some((value) => value.trim().length === 0)) {
      issues.push(`${example.id}: empty showcase class`);
    }
  }
  return issues;
}

function expectedSanitizerProperties(directive: DirectiveDefinition): readonly string[] {
  const properties = directive.attributes.map((attribute) => attribute.renderProperty);
  switch (directive.behavior.renderer) {
    case 'semantic-container':
      return [
        'dataSemantic',
        ...properties,
        ...(directive.behavior.runtime === 'package-owned-counter' ? ['dataDemoCounter'] : []),
      ];
    case 'download-asset':
      return [...properties, 'download'];
    case 'font-registration':
      return [...properties, 'hidden'];
    default: {
      const exhaustive: never = directive.behavior.renderer;
      return exhaustive;
    }
  }
}

function checkOutputFormats(registry: RegistryIntegrityInput, issues: string[]): void {
  const formatDomain = manifestEnumValues(registry, 'format');
  if (!sameOrderedValues(registry.output.formats, OUTPUT_CONTRACT.formats)) {
    issues.push('output format: registry domain differs from canonical output contract');
  }
  if (!sameOrderedValues(formatDomain, registry.output.formats)) {
    issues.push('output format: manifest domain differs from registry domain');
  }
  const outputField = registry.manifestFields.find((field) => field.name === 'output');
  const formatField = outputField?.fields?.find((field) => field.name === 'format');
  if (formatField?.default !== registry.output.default) {
    issues.push('output format: manifest default differs from registry output default');
  }
  if (registry.output.default !== OUTPUT_CONTRACT.default) {
    issues.push('output format: registry default differs from canonical output contract');
  }
  if (!registry.output.formats.includes(registry.output.default)) {
    issues.push('output format: registry default is outside the format domain');
  }
  const placementKeys = Object.keys(registry.output.runtimePlacement);
  if (!sameOrderedValues(placementKeys, registry.output.formats)) {
    issues.push('output format: runtime placement keys differ from format domain');
  }
  for (const format of registry.output.formats) {
    const placement = registry.output.runtimePlacement[format];
    if (placement !== OUTPUT_CONTRACT.runtimePlacement[format]) {
      issues.push(`output format: invalid runtime placement for ${format}`);
    }
  }
}

function checkPageContract(registry: RegistryIntegrityInput, issues: string[]): void {
  const presetDomain = topLevelManifestEnumValues(registry, 'preset');
  const themeDomain = topLevelManifestEnumValues(registry, 'theme');
  const layoutDomain = topLevelManifestEnumValues(registry, 'layout');
  const presetNames = registry.page.presets.map((preset) => preset.name);
  const canonicalPresetNames = PAGE_CONTRACT.presets.map((preset) => preset.name);
  if (!sameOrderedValues(presetNames, canonicalPresetNames)) {
    issues.push('page preset: registry domain differs from canonical page contract');
  }
  if (!sameOrderedValues(presetDomain, presetNames)) {
    issues.push('page preset: manifest domain differs from registry domain');
  }
  if (!sameOrderedValues(registry.page.themes, PAGE_CONTRACT.themes)) {
    issues.push('page theme: registry domain differs from canonical page contract');
  }
  if (!sameOrderedValues(themeDomain, registry.page.themes)) {
    issues.push('page theme: manifest domain differs from registry domain');
  }
  if (!sameOrderedValues(registry.page.layouts, PAGE_CONTRACT.layouts)) {
    issues.push('page layout: registry domain differs from canonical page contract');
  }
  if (!sameOrderedValues(layoutDomain, registry.page.layouts)) {
    issues.push('page layout: manifest domain differs from registry domain');
  }
  if (
    registry.page.motion.scrollProgress.normalMotionOnly !==
      PAGE_CONTRACT.motion.scrollProgress.normalMotionOnly ||
    registry.page.motion.sectionReveal.default !== PAGE_CONTRACT.motion.sectionReveal.default ||
    registry.page.motion.sectionReveal.normalMotionOnly !==
      PAGE_CONTRACT.motion.sectionReveal.normalMotionOnly ||
    registry.page.motion.sectionReveal.durationMs !==
      PAGE_CONTRACT.motion.sectionReveal.durationMs ||
    registry.page.motion.sectionReveal.translationPx !==
      PAGE_CONTRACT.motion.sectionReveal.translationPx
  ) {
    issues.push('page motion: registry policy differs from canonical page contract');
  }
  const preset = registry.manifestFields.find((field) => field.name === 'preset');
  const theme = registry.manifestFields.find((field) => field.name === 'theme');
  const layout = registry.manifestFields.find((field) => field.name === 'layout');
  const scrollProgress = registry.manifestFields.find((field) => field.name === 'scrollProgress');
  if (preset?.default !== registry.page.defaultPreset) {
    issues.push('page preset: manifest default differs from registry default');
  }
  if (theme?.default !== registry.page.defaultTheme) {
    issues.push('page theme: manifest default differs from registry default');
  }
  if (layout?.default !== registry.page.defaultLayout) {
    issues.push('page layout: manifest default differs from registry default');
  }
  if (
    scrollProgress?.constraint?.kind !== 'boolean' ||
    scrollProgress.default !== registry.page.defaultScrollProgress
  ) {
    issues.push('page motion: scroll-progress field differs from registry default');
  }

  const tokens = registry.manifestFields.find((field) => field.name === 'tokens');
  if (tokens?.fields === undefined) {
    issues.push('page tokens: manifest token object is missing');
    return;
  }
  if (
    !sameOrderedValues(
      tokens.fields.map((field) => field.name),
      registry.page.tokens.map((field) => field.name),
    )
  ) {
    issues.push('page tokens: manifest fields differ from registry token catalog');
  }
  for (const token of registry.page.tokens) {
    const manifestToken = tokens.fields.find((field) => field.name === token.name);
    const values =
      manifestToken?.constraint?.kind === 'enum' ? manifestToken.constraint.values : [];
    if (!sameOrderedValues(values, token.constraint.values)) {
      issues.push(`page token ${token.name}: manifest domain differs from registry domain`);
    }
    if (manifestToken?.default !== token.default) {
      issues.push(`page token ${token.name}: manifest default differs from registry default`);
    }
  }
  for (const pagePreset of registry.page.presets) {
    const presetTokenNames = Object.keys(pagePreset.tokens);
    if (
      !sameOrderedValues(
        presetTokenNames,
        registry.page.tokens.map((token) => token.name),
      )
    ) {
      issues.push(
        `page preset ${pagePreset.name}: token fields differ from registry token catalog`,
      );
      continue;
    }
    for (const token of registry.page.tokens) {
      if (!(token.constraint.values as readonly string[]).includes(pagePreset.tokens[token.name])) {
        issues.push(`page preset ${pagePreset.name}: invalid ${token.name} token default`);
      }
    }
  }
}

function manifestEnumValues(
  registry: RegistryIntegrityInput,
  fieldName: 'format',
): readonly string[] {
  const output = registry.manifestFields.find((field) => field.name === 'output');
  const field = output?.fields?.find((candidate) => candidate.name === fieldName);
  return field?.constraint?.kind === 'enum' ? field.constraint.values : [];
}

function topLevelManifestEnumValues(
  registry: RegistryIntegrityInput,
  fieldName: 'preset' | 'theme' | 'layout',
): readonly string[] {
  const field = registry.manifestFields.find((candidate) => candidate.name === fieldName);
  return field?.constraint?.kind === 'enum' ? field.constraint.values : [];
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function rendererDisposition(renderer: RendererKey): 'trusted-private-handler' {
  switch (renderer) {
    case 'semantic-container':
    case 'download-asset':
    case 'font-registration':
      return 'trusted-private-handler';
    default: {
      const exhaustive: never = renderer;
      return exhaustive;
    }
  }
}

function checkContract(registry: RegistryIntegrityInput, issues: string[]): void {
  const { contract } = registry;
  if (!contract.supportedReaderMajors.includes(contract.major)) {
    issues.push('contract: current major is not supported');
  }
  if (!contract.supportedReaderMajors.includes(contract.legacySourceMajor)) {
    issues.push('contract: legacy source major is not supported');
  }
  if (new Set(contract.supportedReaderMajors).size !== contract.supportedReaderMajors.length) {
    issues.push('contract: duplicate supported reader major');
  }
  for (const [scope, id] of Object.entries(contract.schemaIds)) {
    if (id.trim().length === 0) issues.push(`contract: empty ${scope} schema ID`);
  }
  if (contract.schemaDialect.trim().length === 0) issues.push('contract: empty schema dialect');
  if (contract.evolution.silentReinterpretationAllowed) {
    issues.push('contract: silent reinterpretation enabled');
  }
}

function checkSource(registry: RegistryIntegrityInput, issues: string[]): void {
  const codeTerms = registry.source.codeFenceMetadata.terms;
  const sourceValues = [
    registry.source.entry,
    registry.source.partialSyntax,
    ...registry.source.metadata,
    ...registry.source.resources,
    ...Object.values(registry.source.directiveSyntax),
    codeTerms.syntax,
    codeTerms.description,
    codeTerms.separator,
  ];
  if (sourceValues.some((value) => value.trim().length === 0)) {
    issues.push('source: empty syntax or inventory value');
  }
  if (new Set(registry.source.metadata).size !== registry.source.metadata.length) {
    issues.push('source: duplicate metadata form');
  }
  if (new Set(registry.source.resources).size !== registry.source.resources.length) {
    issues.push('source: duplicate resource kind');
  }
  if (codeTerms.minItems < 1) issues.push('source.codeFenceMetadata.terms: minimum below one');
  if (codeTerms.maxItems < codeTerms.minItems) {
    issues.push('source.codeFenceMetadata.terms: maximum below minimum');
  }
  const expectedTermsSyntax = `terms="key${codeTerms.separator}other-key"`;
  if (codeTerms.syntax !== expectedTermsSyntax) {
    issues.push('source.codeFenceMetadata.terms: syntax differs from its grammar fields');
  }
  checkConstraint(codeTerms.itemConstraint, 'source.codeFenceMetadata.terms.items', issues);
}

function checkUnique(
  values: readonly { readonly name?: string; readonly id?: string }[],
  label: string,
  issues: string[],
): void {
  const identities = values.map((value) => value.name ?? value.id ?? '');
  if (identities.some((identity) => identity.length === 0)) issues.push(`${label}: empty identity`);
  const duplicates = identities.filter((identity, index) => identities.indexOf(identity) !== index);
  for (const duplicate of new Set(duplicates)) issues.push(`${label}: duplicate ${duplicate}`);
}

function checkFields(fields: readonly FieldDefinition[], owner: string, issues: string[]): void {
  for (const field of fields) {
    if (field.description.trim().length === 0)
      issues.push(`${owner}.${field.name}: empty description`);
    const hasConstraint = field.constraint !== undefined;
    const hasFields = field.fields !== undefined;
    if (hasConstraint === hasFields) {
      issues.push(`${owner}.${field.name}: expected exactly one of constraint or fields`);
    }
    if (field.fields !== undefined && field.fields.length === 0) {
      issues.push(`${owner}.${field.name}: empty nested fields`);
    }
    const constraintCheck =
      field.constraint === undefined
        ? undefined
        : checkConstraint(field.constraint, `${owner}.${field.name}`, issues);
    if (
      field.constraint !== undefined &&
      constraintCheck?.valid === true &&
      field.default !== undefined &&
      !defaultMatchesConstraint(field.default, field.constraint, constraintCheck.pattern)
    ) {
      issues.push(`${owner}.${field.name}: default violates ${field.constraint.kind} constraint`);
    }
    if (field.fields !== undefined) {
      checkUnique(field.fields, `${owner}.${field.name} field`, issues);
      checkFields(field.fields, `${owner}.${field.name}`, issues);
      checkNestedDefault(field, owner, issues);
    }
  }
}

function checkNestedDefault(field: FieldDefinition, owner: string, issues: string[]): void {
  if (field.fields === undefined || field.default === undefined) return;
  if (!isRecord(field.default)) {
    issues.push(`${owner}.${field.name}: nested default is not an object`);
    return;
  }
  const nestedDefault = field.default;
  const expectedNames = field.fields.map((nested) => nested.name);
  const actualNames = Object.keys(nestedDefault);
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name) => !expectedNames.includes(name))
  ) {
    issues.push(`${owner}.${field.name}: nested default keys differ from fields`);
  }
  for (const nested of field.fields) {
    if (nested.default !== undefined && !Object.is(nestedDefault[nested.name], nested.default)) {
      issues.push(`${owner}.${field.name}.${nested.name}: parent and field defaults differ`);
    }
  }
}

interface ConstraintCheckResult {
  readonly valid: boolean;
  readonly pattern?: RegExp;
}

function checkConstraint(
  constraint: ConstraintDefinition,
  owner: string,
  issues: string[],
): ConstraintCheckResult {
  switch (constraint.kind) {
    case 'string': {
      let valid = true;
      if (constraint.minLength < 0) {
        issues.push(`${owner}: negative minimum length`);
        valid = false;
      }
      if (constraint.maxLength !== undefined && constraint.maxLength < constraint.minLength) {
        issues.push(`${owner}: maximum length below minimum`);
        valid = false;
      }
      let pattern: RegExp | undefined;
      if (constraint.pattern !== undefined) {
        try {
          new RegExp(constraint.pattern, 'u');
          if (!constraint.pattern.startsWith('^') || !constraint.pattern.endsWith('$')) {
            issues.push(`${owner}: string pattern must be start/end anchored`);
            valid = false;
          } else {
            pattern = new RegExp(`^(?:${unanchor(constraint.pattern)})$`, 'u');
          }
        } catch {
          issues.push(`${owner}: invalid string pattern`);
          valid = false;
        }
      }
      return pattern === undefined ? { valid } : { valid, pattern };
    }
    case 'integer':
    case 'number': {
      let valid = true;
      if (
        constraint.minimum !== undefined &&
        constraint.maximum !== undefined &&
        constraint.maximum < constraint.minimum
      ) {
        issues.push(`${owner}: ${constraint.kind} maximum below minimum`);
        valid = false;
      }
      if (
        constraint.kind === 'number' &&
        constraint.multipleOf !== undefined &&
        (!Number.isFinite(constraint.multipleOf) || constraint.multipleOf <= 0)
      ) {
        issues.push(`${owner}: number multiple must be finite and positive`);
        valid = false;
      }
      if (constraint.lexicalPattern !== undefined) {
        try {
          new RegExp(constraint.lexicalPattern, 'u');
        } catch {
          issues.push(`${owner}: invalid ${constraint.kind} lexical pattern`);
          valid = false;
        }
      }
      return { valid };
    }
    case 'boolean':
      return { valid: true };
    case 'enum': {
      let valid = true;
      if (constraint.values.length === 0) {
        issues.push(`${owner}: empty enum`);
        valid = false;
      }
      if (new Set(constraint.values).size !== constraint.values.length) {
        issues.push(`${owner}: duplicate enum value`);
        valid = false;
      }
      return { valid };
    }
    default: {
      return assertNever(constraint);
    }
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected registry constraint: ${JSON.stringify(value)}`);
}

function defaultMatchesConstraint(
  value: unknown,
  constraint: ConstraintDefinition,
  compiledPattern?: RegExp,
): boolean {
  switch (constraint.kind) {
    case 'string':
      return (
        typeof value === 'string' &&
        value === value.trim() &&
        [...value].length >= constraint.minLength &&
        (constraint.maxLength === undefined || [...value].length <= constraint.maxLength) &&
        (compiledPattern === undefined || compiledPattern.test(value))
      );
    case 'integer':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        (constraint.minimum === undefined || value >= constraint.minimum) &&
        (constraint.maximum === undefined || value <= constraint.maximum)
      );
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (constraint.minimum === undefined || value >= constraint.minimum) &&
        (constraint.maximum === undefined || value <= constraint.maximum) &&
        (constraint.multipleOf === undefined ||
          zodCompatibleMultipleOf(value, constraint.multipleOf))
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return typeof value === 'string' && constraint.values.includes(value);
    default: {
      const exhaustive: never = constraint;
      return exhaustive;
    }
  }
}

function zodCompatibleMultipleOf(value: number, divisor: number): boolean {
  const valueDecimals = decimalPlaces(value);
  const divisorDecimals = decimalPlaces(divisor);
  const scale = 10 ** Math.max(valueDecimals, divisorDecimals);
  return Math.round(value * scale) % Math.round(divisor * scale) === 0;
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (!text.includes('e')) return text.split('.')[1]?.length ?? 0;
  const [coefficient = '', exponentText = '0'] = text.split('e');
  const coefficientDecimals = coefficient.split('.')[1]?.length ?? 0;
  return Math.max(0, coefficientDecimals - Number(exponentText));
}

function unanchor(pattern: string): string {
  return pattern.slice(1, -1);
}
