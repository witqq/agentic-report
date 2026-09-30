import type {
  AuthoringRegistryDefinition,
  ConstraintDefinition,
  DirectiveDefinition,
  FieldDefinition,
  RendererKey,
} from './registry.js';
import { OUTPUT_CONTRACT, PAGE_CONTRACT } from './registry.js';
import { BUILT_IN_THEME_NAMES } from './themes.js';
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
  checkDiagramContract(registry, issues);

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
    for (const [combinationIndex, combination] of (
      directive.incompatibleCombinations ?? []
    ).entries()) {
      const entries = Object.entries(combination.attributes);
      if (entries.length < 2) {
        issues.push(
          `${directive.name}: incompatible combination ${combinationIndex} needs two attributes`,
        );
      }
      if (combination.message.trim().length === 0 || combination.remediation.trim().length === 0) {
        issues.push(
          `${directive.name}: incompatible combination ${combinationIndex} needs guidance`,
        );
      }
      for (const [attributeName, values] of entries) {
        const attribute = directive.attributes.find(
          (candidate) => candidate.name === attributeName,
        );
        if (attribute?.constraint.kind !== 'enum') {
          issues.push(
            `${directive.name}: incompatible combination references non-enum ${attributeName}`,
          );
          continue;
        }
        for (const value of values) {
          if (!attribute.constraint.values.includes(value)) {
            issues.push(
              `${directive.name}: incompatible combination uses unknown ${attributeName} value ${value}`,
            );
          }
        }
      }
    }
    for (const target of [
      ...[directive.placement.requiredParent ?? []].flat(),
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
  // Стартер есть у каждой категории и носит её имя: `init --starter landing` создаёт лендинг.
  for (const category of registry.page.categories) {
    const starter = starters.find((example) => example.id === category.id);
    if (starter === undefined) issues.push(`${category.id}: category has no starter`);
    else if (starter.category !== category.id)
      issues.push(`${category.id}: starter belongs to category ${starter.category}`);
    const dimensions = category.dimensions.map((dimension) => dimension.id);
    if (new Set(dimensions).size !== dimensions.length)
      issues.push(`${category.id}: duplicate brief dimension`);
  }
  for (const starter of starters) {
    if (!registry.page.categories.some((category) => category.id === starter.id))
      issues.push(`${starter.id}: starter is not named after a category`);
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
    const category = registry.page.categories.find(
      (candidate) => candidate.id === example.category,
    );
    if (category === undefined) issues.push(`${example.id}: unknown category ${example.category}`);
    else if (
      example.subvariant !== undefined &&
      !(category.subvariants as readonly string[]).includes(example.subvariant)
    )
      issues.push(`${example.id}: unknown ${example.category} subvariant ${example.subvariant}`);
  }
  return issues;
}

function checkDiagramContract(registry: RegistryIntegrityInput, issues: string[]): void {
  const contract = registry.visualizations.diagram;
  if (!contract.types.includes(contract.defaultType)) {
    issues.push('diagram contract: default type is outside the type domain');
  }
  if (
    contract.flow.nodes.minimum < 1 ||
    contract.flow.nodes.maximum < contract.flow.nodes.minimum ||
    contract.flow.edges.maximum < 0
  ) {
    issues.push('diagram contract: invalid flow bounds');
  }
  if (contract.flow.groups.maximum < 1 || contract.flow.groups.minimumMembers < 1) {
    issues.push('diagram contract: invalid group bounds');
  }
  if (
    !contract.flow.selfEdges ||
    contract.flow.groups.requireEveryNode ||
    !sameOrderedValues(contract.flow.layouts, ['auto', 'down', 'right', 'orthogonal']) ||
    !sameOrderedValues(contract.flow.directions, ['auto', 'right', 'down'])
  ) {
    issues.push('diagram contract: unsupported flow policy');
  }
  if (
    !contract.edgeKinds.includes(contract.defaultEdgeKind) ||
    new Set(contract.edgeKinds).size !== contract.edgeKinds.length ||
    contract.edgeKindLegend.minimumKinds < 2
  ) {
    issues.push('diagram contract: invalid edge kind domain');
  }
  if (
    contract.sequence.participants.minimum < 2 ||
    contract.sequence.participants.maximum < contract.sequence.participants.minimum ||
    contract.sequence.messages.minimum < 1 ||
    contract.sequence.messages.maximum < contract.sequence.messages.minimum
  ) {
    issues.push('diagram contract: invalid sequence bounds');
  }
  if (
    contract.sequence.groups ||
    contract.sequence.participantGroups ||
    contract.sequence.direction !== 'forbidden' ||
    !contract.sequence.messages.labelRequired ||
    !contract.sequence.selfMessages
  ) {
    issues.push('diagram contract: unsupported sequence policy');
  }
  const diagram = registry.directives.find((directive) => directive.name === 'diagram');
  const type = diagram?.attributes.find((attribute) => attribute.name === 'type');
  if (
    type?.constraint.kind !== 'enum' ||
    !sameOrderedValues(type.constraint.values, contract.types) ||
    type.default !== contract.defaultType
  ) {
    issues.push('diagram contract: directive type domain differs from visualization contract');
  }
  const edge = registry.directives.find((directive) => directive.name === 'edge');
  const kind = edge?.attributes.find((attribute) => attribute.name === 'kind');
  if (
    kind?.constraint.kind !== 'enum' ||
    !sameOrderedValues(kind.constraint.values, contract.edgeKinds) ||
    kind.default !== contract.defaultEdgeKind
  ) {
    issues.push('diagram contract: edge kind domain differs from visualization contract');
  }
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
    case 'embedded-video':
      return properties;
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
  const schemeDomain = topLevelManifestEnumValues(registry, 'scheme');
  const layoutDomain = topLevelManifestEnumValues(registry, 'layout');
  const themeNames = registry.page.themes.map((theme) => theme.name);
  if (!sameOrderedValues(themeNames, BUILT_IN_THEME_NAMES)) {
    issues.push('page theme: registry catalog differs from the built-in theme data');
  }
  if (!themeNames.includes(registry.page.defaultTheme)) {
    issues.push('page theme: default theme is not a built-in theme');
  }
  if (!sameOrderedValues(registry.page.schemes, PAGE_CONTRACT.schemes)) {
    issues.push('page scheme: registry domain differs from canonical page contract');
  }
  if (!sameOrderedValues(schemeDomain, registry.page.schemes)) {
    issues.push('page scheme: manifest domain differs from registry domain');
  }
  if (!sameOrderedValues(registry.page.layouts, PAGE_CONTRACT.layouts)) {
    issues.push('page layout: registry domain differs from canonical page contract');
  }
  if (!sameOrderedValues(layoutDomain, registry.page.layouts)) {
    issues.push('page layout: manifest domain differs from registry domain');
  }
  if (
    registry.page.motion.progress.pageNormalMotionOnly !==
      PAGE_CONTRACT.motion.progress.pageNormalMotionOnly ||
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
  const theme = registry.manifestFields.find((field) => field.name === 'theme');
  const scheme = registry.manifestFields.find((field) => field.name === 'scheme');
  const layout = registry.manifestFields.find((field) => field.name === 'layout');
  const progress = registry.manifestFields.find((field) => field.name === 'progress');
  const opening = registry.manifestFields.find((field) => field.name === 'opening');
  const motion = registry.manifestFields.find((field) => field.name === 'motion');
  if (
    motion?.constraint?.kind !== 'enum' ||
    motion.default !== registry.page.defaultMotion ||
    !sameOrderedValues(motion.constraint.values, registry.page.motionLevels)
  ) {
    issues.push('page motion: manifest field differs from registry default');
  }
  const attribution = registry.manifestFields.find((field) => field.name === 'attribution');
  const review = registry.manifestFields.find((field) => field.name === 'review');
  const schemeToggle = registry.manifestFields.find((field) => field.name === 'schemeToggle');
  const themeSwitcher = registry.manifestFields.find((field) => field.name === 'themeSwitcher');
  const topbar = registry.manifestFields.find((field) => field.name === 'topbar');
  if (
    theme?.constraint?.kind !== 'theme-reference' ||
    theme.default !== registry.page.defaultTheme
  ) {
    issues.push('page theme: manifest field differs from registry default');
  }
  if (scheme?.default !== registry.page.defaultScheme) {
    issues.push('page scheme: manifest default differs from registry default');
  }
  if (layout?.default !== registry.page.defaultLayout) {
    issues.push('page layout: manifest default differs from registry default');
  }
  if (
    progress?.constraint?.kind !== 'enum' ||
    progress.default !== registry.page.defaultProgress ||
    !sameOrderedValues(progress.constraint.values, registry.page.progress)
  ) {
    issues.push('page progress: manifest field differs from registry default');
  }
  if (
    opening?.constraint?.kind !== 'enum' ||
    opening.default !== registry.page.defaultOpening ||
    !sameOrderedValues(opening.constraint.values, registry.page.openings)
  ) {
    issues.push('page opening: manifest field differs from registry default');
  }
  if (
    attribution?.constraint?.kind !== 'boolean' ||
    attribution.default !== registry.page.defaultAttribution
  ) {
    issues.push('page attribution: field differs from registry default');
  }
  if (review?.constraint?.kind !== 'boolean' || review.default !== registry.page.defaultReview) {
    issues.push('page review: field differs from registry default');
  }
  if (
    schemeToggle?.constraint?.kind !== 'boolean' ||
    schemeToggle.default !== registry.page.defaultSchemeToggle
  ) {
    issues.push('page scheme control: field differs from registry default');
  }
  if (
    themeSwitcher?.constraint?.kind !== 'boolean' ||
    themeSwitcher.default !== registry.page.defaultThemeSwitcher
  ) {
    issues.push('page theme switcher: field differs from registry default');
  }
  if (topbar?.constraint?.kind !== 'boolean' || topbar.default !== registry.page.defaultTopbar) {
    issues.push('page top bar: field differs from registry default');
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
  fieldName: 'scheme' | 'layout',
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
    case 'embedded-video':
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
    case 'theme-reference':
      return { valid: true };
    case 'local-path-list': {
      const valid =
        Number.isInteger(constraint.minItems) &&
        Number.isInteger(constraint.maxItems) &&
        constraint.minItems >= 0 &&
        constraint.maxItems >= constraint.minItems;
      if (!valid) issues.push(`${owner}: invalid list bounds`);
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
    case 'theme-reference':
      return typeof value === 'string' && value.trim() === value && value.length > 0;
    case 'local-path-list':
      return (
        Array.isArray(value) &&
        value.length >= constraint.minItems &&
        value.length <= constraint.maxItems &&
        value.every((item) => typeof item === 'string' && item.length > 0)
      );
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
