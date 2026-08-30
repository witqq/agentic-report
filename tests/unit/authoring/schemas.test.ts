import { readFile } from 'node:fs/promises';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  completeSourceSchema,
  directiveInvocationSchema,
  getDirectiveSchema,
  getManifestSchema,
  getSourceSchema,
  interpretDirectiveAttributes,
  type ManifestFieldsValue,
  parseReportManifest,
  parseReportManifestFromRegistry,
  projectAuthoringSchemas,
  reportManifestInputSchema,
  SCHEMA_CONTRACT_KEYWORD,
} from '../../../src/authoring/schemas.js';
import { authoringRegistry } from '../../../src/authoring/registry.js';
import type {
  AuthoringRegistryDefinition,
  ConstraintDefinition,
  DirectiveAttributeDefinition,
  DirectiveDefinition,
  FieldDefinition,
} from '../../../src/authoring/registry.js';
import { isNormalizedPackageRelativePosixPath } from '../../../src/authoring/local-reference.js';

describe('authoring schema projections', () => {
  it('derives input and normalized TypeScript domains from literal registry fields', () => {
    const typeFixtureFields = [
      {
        name: 'mode',
        description: 'Synthetic enum evolution fixture.',
        required: false,
        default: 'a',
        constraint: { kind: 'enum', values: ['a', 'b', 'c'] },
      },
      {
        name: 'newField',
        description: 'Synthetic required field evolution fixture.',
        required: true,
        constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
      },
      {
        name: 'optionalText',
        description: 'Synthetic optional no-default field.',
        required: false,
        constraint: { kind: 'string', normalization: 'trim', minLength: 0 },
      },
      {
        name: 'nested',
        description: 'Synthetic nested default fixture.',
        required: false,
        default: { count: 1, label: 'ready' },
        fields: [
          {
            name: 'count',
            description: 'Synthetic nested count.',
            required: false,
            default: 1,
            constraint: { kind: 'integer', minimum: 1 },
          },
          {
            name: 'label',
            description: 'Synthetic required nested label.',
            required: true,
            constraint: { kind: 'string', normalization: 'trim', minLength: 1 },
          },
        ],
      },
    ] as const satisfies readonly FieldDefinition[];
    type FixtureInput = ManifestFieldsValue<typeof typeFixtureFields, false>;
    type FixtureNormalized = ManifestFieldsValue<typeof typeFixtureFields, true>;
    type ExpectedInput = {
      readonly mode?: 'a' | 'b' | 'c';
      readonly newField: string;
      readonly optionalText?: string;
      readonly nested?: { readonly count?: number; readonly label: string };
    };
    type ExpectedNormalized = {
      readonly mode: 'a' | 'b' | 'c';
      readonly newField: string;
      readonly optionalText?: string;
      readonly nested: { readonly count: number; readonly label: string };
    };
    type TypeEqual<Left, Right> =
      (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2
        ? (<Type>() => Type extends Right ? 1 : 2) extends <Type>() => Type extends Left ? 1 : 2
          ? true
          : false
        : false;
    type Assert<Type extends true> = Type;
    const exactInputKeys: Assert<TypeEqual<keyof FixtureInput, keyof ExpectedInput>> = true;
    const exactNormalizedKeys: Assert<
      TypeEqual<keyof FixtureNormalized, keyof ExpectedNormalized>
    > = true;
    const inputToExpected: ExpectedInput = {} as FixtureInput;
    const expectedToInput: FixtureInput = {} as ExpectedInput;
    const normalizedToExpected: ExpectedNormalized = {} as FixtureNormalized;
    const expectedToNormalized: FixtureNormalized = {} as ExpectedNormalized;
    void inputToExpected;
    void expectedToInput;
    void normalizedToExpected;
    void expectedToNormalized;
    void exactInputKeys;
    void exactNormalizedKeys;
    const acceptedType: FixtureInput = {
      newField: 'present',
      mode: 'c',
      optionalText: '',
      nested: { count: 2, label: 'nested' },
    };
    expect(acceptedType.mode).toBe('c');
    // @ts-expect-error The enum domain is mechanically restricted to registry values.
    const rejectedEnum: FixtureInput = { newField: 'present', mode: 'd' };
    // @ts-expect-error A registry-required field is required in the derived input type.
    const rejectedMissing: FixtureInput = { mode: 'a' };
    // @ts-expect-error Unknown keys are not part of the literal registry projection.
    const rejectedUnknown: FixtureInput = { newField: 'present', unknown: true };
    // @ts-expect-error Nested required fields remain required when the optional object is supplied.
    const rejectedNested: FixtureInput = { newField: 'present', nested: { count: 2 } };
    const rejectedScalar: FixtureInput = {
      newField: 'present',
      // @ts-expect-error Integer registry constraints derive number fields.
      nested: { count: '2', label: 'nested' },
    };
    void rejectedEnum;
    void rejectedMissing;
    void rejectedUnknown;
    void rejectedNested;
    void rejectedScalar;

    const syntheticRegistry = {
      ...authoringRegistry,
      manifestFields: [...authoringRegistry.manifestFields, ...typeFixtureFields],
    } as const satisfies AuthoringRegistryDefinition;
    expect(
      parseReportManifestFromRegistry(
        {
          newField: '  present  ',
          mode: 'c',
          optionalText: '  optional  ',
          nested: { label: '  supplied  ' },
        },
        syntheticRegistry,
      ),
    ).toMatchObject({
      newField: 'present',
      mode: 'c',
      optionalText: 'optional',
      nested: { count: 1, label: 'supplied' },
    });
    expect(() =>
      parseReportManifestFromRegistry({ newField: 'present', unknown: true }, syntheticRegistry),
    ).toThrow();
  });

  it('normalizes registry defaults and rejects unknown manifest fields', () => {
    const expectedDefaults = {
      contractVersion: 1,
      language: 'und',
      preset: 'studio',
      theme: 'system',
      layout: 'document',
      scrollProgress: false,
      tokens: {
        density: 'comfortable',
        font: 'sans',
        accent: 'indigo',
        width: 'standard',
        radius: 'soft',
      },
      output: { format: 'single-file', maxInlineBytes: 5_000_000 },
    };
    expect(parseReportManifest({})).toEqual(expectedDefaults);
    expect(parseReportManifest({})).toEqual(manifestDefaults(authoringRegistry.manifestFields));
    expect(parseReportManifest({ output: {} }).output).toEqual({
      format: 'single-file',
      maxInlineBytes: 5_000_000,
    });
    expect(parseReportManifest({ title: '  Report  ', language: '  en  ' })).toMatchObject({
      title: 'Report',
      language: 'en',
    });
    expect(reportManifestInputSchema.safeParse({ unknown: true }).success).toBe(false);
    expect(reportManifestInputSchema.safeParse({ output: { unknown: true } }).success).toBe(false);

    const presetDefaults = {
      studio: {
        density: 'comfortable',
        font: 'sans',
        accent: 'indigo',
        width: 'standard',
        radius: 'soft',
      },
      editorial: {
        density: 'comfortable',
        font: 'serif',
        accent: 'indigo',
        width: 'wide',
        radius: 'sharp',
      },
      signal: {
        density: 'compact',
        font: 'sans',
        accent: 'teal',
        width: 'wide',
        radius: 'sharp',
      },
    } as const;
    for (const [preset, tokens] of Object.entries(presetDefaults)) {
      expect(parseReportManifest({ preset }).tokens).toEqual(tokens);
    }
    expect(
      parseReportManifest({
        preset: 'signal',
        tokens: {
          density: 'spacious',
          font: 'mono',
          accent: 'coral',
          width: 'narrow',
          radius: 'round',
        },
      }).tokens,
    ).toEqual({
      density: 'spacious',
      font: 'mono',
      accent: 'coral',
      width: 'narrow',
      radius: 'round',
    });
    expect(parseReportManifest({ preset: 'editorial', tokens: { accent: 'teal' } }).tokens).toEqual(
      {
        ...presetDefaults.editorial,
        accent: 'teal',
      },
    );

    const manifestSchema = getManifestSchema() as {
      readonly properties: {
        readonly tokens: {
          readonly default?: unknown;
          readonly properties: Readonly<Record<string, { readonly default?: unknown }>>;
        };
      };
    };
    expect(manifestSchema.properties.tokens.default).toBeUndefined();
    expect(
      Object.values(manifestSchema.properties.tokens.properties).every(
        (property) => property.default === undefined,
      ),
    ).toBe(true);
    const applySchemaDefaults = createAjv({ useDefaults: true }).compile(getManifestSchema());
    for (const [authored, expected] of [
      [{ preset: 'editorial' }, presetDefaults.editorial],
      [{ preset: 'signal' }, presetDefaults.signal],
      [
        { preset: 'editorial', tokens: { accent: 'teal' } },
        { ...presetDefaults.editorial, accent: 'teal' },
      ],
    ] as const) {
      const defaulted = structuredClone(authored) as Record<string, unknown>;
      expect(applySchemaDefaults(defaulted)).toBe(true);
      expect(parseReportManifest(defaulted).tokens).toEqual(expected);
    }

    const changedRegistry = {
      ...authoringRegistry,
      manifestFields: authoringRegistry.manifestFields.map((field) =>
        field.name === 'language' ? { ...field, default: 'fr' } : field,
      ),
    } as unknown as typeof authoringRegistry;
    expect(parseReportManifestFromRegistry({}, changedRegistry).language).toBe('fr');
    const changedLanguageSchema = (
      projectAuthoringSchemas(changedRegistry).manifest.properties as Record<
        string,
        Record<string, unknown>
      >
    ).language;
    expect(changedLanguageSchema?.default).toBe('fr');
  });

  it('keeps runtime and draft-2020-12 manifest acceptance equal for every field boundary', () => {
    const ajv = createAjv();
    const validate = ajv.compile(getManifestSchema());
    const fixtures: readonly ValidationFixture[] = [
      accepted('empty manifest', {}),
      accepted('contract major', { contractVersion: 1 }),
      accepted('plain metadata', { title: 'Report', description: 'Description' }),
      accepted('trimmed metadata', { title: '  Report  ', description: '  Description  ' }),
      accepted('language tag', { language: 'zh-Hant-TW' }),
      accepted('trimmed language tag', { language: '  zh-Hant-TW  ' }),
      accepted('studio preset', { preset: 'studio' }),
      accepted('editorial preset', { preset: 'editorial' }),
      accepted('signal preset', { preset: 'signal' }),
      accepted('theme enum', { theme: 'dark' }),
      accepted('every layout enum', { layout: 'document' }),
      accepted('dashboard layout', { layout: 'dashboard' }),
      accepted('landing layout', { layout: 'landing' }),
      accepted('mixed layout', { layout: 'mixed' }),
      accepted('scroll progress enabled', { scrollProgress: true }),
      accepted('scroll progress disabled', { scrollProgress: false }),
      accepted('compact visual token overrides', {
        tokens: {
          density: 'compact',
          font: 'serif',
          accent: 'teal',
          width: 'wide',
          radius: 'round',
        },
      }),
      accepted('empty output', { output: {} }),
      accepted('directory output', {
        output: { format: 'directory', maxInlineBytes: 1 },
      }),
      rejected('zero contract major', { contractVersion: 0 }),
      rejected('fractional contract major', { contractVersion: 1.5 }),
      rejected('string contract major', { contractVersion: '1' }),
      rejected('empty title', { title: '' }),
      rejected('numeric title', { title: 1 }),
      rejected('empty description', { description: '' }),
      rejected('numeric description', { description: 1 }),
      rejected('invalid language pattern', { language: 'invalid_tag' }),
      rejected('numeric language', { language: 1 }),
      rejected('unknown preset', { preset: 'cinematic' }),
      rejected('numeric preset', { preset: 1 }),
      rejected('unknown theme', { theme: 'sepia' }),
      rejected('numeric theme', { theme: 1 }),
      rejected('unknown layout', { layout: 'poster' }),
      rejected('numeric layout', { layout: 1 }),
      rejected('string scroll progress', { scrollProgress: 'true' }),
      rejected('numeric scroll progress', { scrollProgress: 1 }),
      rejected('non-object tokens', { tokens: 'wide' }),
      rejected('unknown token field', { tokens: { color: 'red' } }),
      rejected('unknown density token', { tokens: { density: 'tiny' } }),
      rejected('unknown font token', { tokens: { font: 'comic' } }),
      rejected('unknown accent token', { tokens: { accent: 'unsafe-css' } }),
      rejected('unknown width token', { tokens: { width: '100vw' } }),
      rejected('unknown radius token', { tokens: { radius: '12px' } }),
      rejected('non-object output', { output: 'single-file' }),
      rejected('null output', { output: null }),
      rejected('unknown format', { output: { format: 'cloud' } }),
      rejected('numeric format', { output: { format: 1 } }),
      rejected('retired scripts field', { output: { scripts: 'inline' } }),
      rejected('zero inline threshold', { output: { maxInlineBytes: 0 } }),
      rejected('fractional inline threshold', { output: { maxInlineBytes: 1.5 } }),
      rejected('string inline threshold', { output: { maxInlineBytes: '1' } }),
      rejected('unknown manifest field', { extra: true }),
      rejected('unknown output field', { output: { extra: true } }),
    ];
    for (const fixture of fixtures) {
      assertAcceptance(
        fixture,
        (value) => reportManifestInputSchema.safeParse(value).success,
        validate,
      );
    }
  });

  it('emits deterministic strict schemas for all stable scopes', async () => {
    const first = projectAuthoringSchemas(authoringRegistry);
    const second = projectAuthoringSchemas(authoringRegistry);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const projection = first;
    const golden = JSON.parse(
      await readFile(
        new URL('../../fixtures/authoring/schema-projections.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    expect(projection).toEqual(golden);
    expect([first.manifest.$id, first.directives.$id, first.source.$id]).toEqual([
      authoringRegistry.contract.schemaIds.manifest,
      authoringRegistry.contract.schemaIds.directives,
      authoringRegistry.contract.schemaIds.source,
    ]);
    expect(
      [first.manifest, first.directives, first.source].every(
        (schema) => schema.$schema === authoringRegistry.contract.schemaDialect,
      ),
    ).toBe(true);
    const expectedContract = {
      currentMajor: authoringRegistry.contract.major,
      supportedReaderMajors: authoringRegistry.contract.supportedReaderMajors,
      legacySourceMajor: authoringRegistry.contract.legacySourceMajor,
      evolution: authoringRegistry.contract.evolution,
    };
    for (const schema of [first.manifest, first.directives, first.source]) {
      expect(schema[SCHEMA_CONTRACT_KEYWORD]).toEqual(expectedContract);
    }

    const ajv = createAjv();
    ajv.addSchema(getDirectiveSchema());
    expect(() => ajv.compile(getManifestSchema())).not.toThrow();
    expect(() => createAjv().compile(getSourceSchema())).not.toThrow();

    const mutable = getManifestSchema() as Record<string, unknown>;
    mutable.title = 'mutated consumer copy';
    expect(getManifestSchema().title).toBe('Agentic Report manifest');
  });

  it('detects a deliberate one-sided schema semantic divergence', () => {
    const mutated = getManifestSchema() as {
      properties: { theme: { enum: string[] } };
    };
    mutated.properties.theme.enum.push('sepia');
    const validate = createAjv().compile(mutated);
    expect(() =>
      assertParity(
        { theme: 'sepia' },
        (value) => reportManifestInputSchema.safeParse(value).success,
        validate,
      ),
    ).toThrow(/runtime and JSON Schema diverged/u);
  });

  it('fails projection before publication for an unsupported registry constraint', () => {
    const invalid = {
      ...authoringRegistry,
      manifestFields: authoringRegistry.manifestFields.map((field) =>
        field.name === 'title'
          ? { ...field, constraint: { kind: 'unsupported', value: true } }
          : field,
      ),
    };
    expect(() => projectAuthoringSchemas(invalid as unknown as typeof authoringRegistry)).toThrow(
      /Unexpected registry constraint|Cannot project invalid authoring registry/u,
    );
  });

  it('projects independent trimmed string minimum, maximum and pattern constraints', () => {
    const noPatternRegistry = withManifestStringConstraint('title', {
      kind: 'string',
      normalization: 'trim',
      minLength: 3,
      maxLength: 4,
    });
    const patternedRegistry = withManifestStringConstraint('language', {
      kind: 'string',
      normalization: 'trim',
      minLength: 3,
      maxLength: 4,
      pattern: '^[A-Za-z]+$',
    });
    for (const [label, registry, fixtures] of [
      [
        'no pattern',
        noPatternRegistry,
        [
          accepted('trimmed length 3', { title: '  abc  ' }),
          rejected('length 2', { title: 'ab' }),
          rejected('length 5', { title: 'abcde' }),
        ],
      ],
      [
        'patterned',
        patternedRegistry,
        [
          accepted('pattern and length', { language: '  Abc  ' }),
          rejected('patterned length 2', { language: 'Ab' }),
          rejected('patterned length 5', { language: 'Abcde' }),
          rejected('pattern mismatch', { language: 'A1c' }),
        ],
      ],
    ] as const) {
      const validate = createAjv().compile(projectAuthoringSchemas(registry).manifest);
      for (const fixture of fixtures) {
        assertAcceptance(
          { ...fixture, label: `${label}: ${fixture.label}` },
          (value) => safeParseManifestFromRegistry(value, registry),
          validate,
        );
      }
    }
  });

  it('uses Unicode code-point string lengths and handles every zero/bounded interval shape', () => {
    const cases = [
      {
        label: 'zero unbounded',
        constraint: stringConstraint(0),
        fixtures: [
          accepted('empty', { title: '' }),
          accepted('whitespace only', { title: '   ' }),
          accepted('one astral code point', { title: '😀' }),
        ],
      },
      {
        label: 'exact zero',
        constraint: stringConstraint(0, 0),
        fixtures: [
          accepted('empty', { title: '' }),
          accepted('whitespace only', { title: '   ' }),
          rejected('one BMP code point', { title: 'a' }),
        ],
      },
      {
        label: 'one unbounded',
        constraint: stringConstraint(1),
        fixtures: [
          rejected('empty', { title: '' }),
          accepted('one astral code point', { title: '😀' }),
          accepted('two astral code points', { title: '😀😀' }),
        ],
      },
      {
        label: 'two unbounded',
        constraint: stringConstraint(2),
        fixtures: [
          rejected('one astral code point', { title: '😀' }),
          accepted('two astral code points', { title: '😀😀' }),
          accepted('trimmed two BMP code points', { title: '  ab  ' }),
        ],
      },
      {
        label: 'one to two',
        constraint: stringConstraint(1, 2),
        fixtures: [
          accepted('one astral code point', { title: '😀' }),
          accepted('two astral code points', { title: '😀😀' }),
          rejected('three code points', { title: '😀ab' }),
        ],
      },
      {
        label: 'exact two',
        constraint: stringConstraint(2, 2),
        fixtures: [
          rejected('one code point', { title: 'a' }),
          accepted('two mixed code points', { title: '😀a' }),
          rejected('three code points', { title: 'abc' }),
        ],
      },
    ] as const;
    for (const testCase of cases) {
      const registry = withManifestStringConstraint('title', testCase.constraint);
      const schema = projectAuthoringSchemas(registry).manifest;
      const validate = createAjv().compile(schema);
      for (const fixture of testCase.fixtures) {
        assertAcceptance(
          { ...fixture, label: `${testCase.label}: ${fixture.label}` },
          (value) => safeParseManifestFromRegistry(value, registry),
          validate,
        );
      }
    }
  });

  it('rejects unanchored registry patterns before runtime or schema publication', () => {
    const registry = withManifestStringConstraint('title', {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      pattern: 'foo',
    });
    expect(() => projectAuthoringSchemas(registry)).toThrow(/pattern must be start\/end anchored/u);
    expect(() => parseReportManifestFromRegistry({ title: 'xfooy' }, registry)).toThrow(
      /pattern must be start\/end anchored/u,
    );
  });

  it('treats an anchored registry pattern as a full-value match even with alternatives', () => {
    const registry = withManifestStringConstraint('title', {
      kind: 'string',
      normalization: 'trim',
      minLength: 1,
      pattern: '^foo|bar$',
    });
    const validate = createAjv().compile(projectAuthoringSchemas(registry).manifest);
    for (const fixture of [
      accepted('first alternative', { title: 'foo' }),
      accepted('second alternative', { title: '  bar  ' }),
      rejected('prefix before second alternative', { title: 'xbar' }),
      rejected('suffix after first alternative', { title: 'foox' }),
    ]) {
      assertAcceptance(
        fixture,
        (value) => safeParseManifestFromRegistry(value, registry),
        validate,
      );
    }
  });

  it('validates every directive identity, form, required attribute and unknown-field boundary', () => {
    const ajv = createAjv();
    const validate = ajv.compile(getDirectiveSchema());
    for (const directive of authoringRegistry.directives) {
      const attributes = Object.fromEntries(
        directive.attributes
          .filter((attribute) => attribute.required)
          .map((attribute) => [attribute.name, validAttributeValue(attribute)]),
      );
      for (const form of directive.forms) {
        const valid = accepted(`${directive.name}/${form}`, {
          name: directive.name,
          form,
          attributes,
        });
        assertAcceptance(
          valid,
          (value) => directiveInvocationSchema.safeParse(value).success,
          validate,
        );

        for (const attribute of directive.attributes) {
          for (const [value, expected] of attributeCases(attribute)) {
            const fixture: ValidationFixture = {
              label: `${directive.name}/${form}.${attribute.name}=${String(value)}`,
              value: {
                name: directive.name,
                form,
                attributes: { ...attributes, [attribute.name]: value },
              },
              expected,
            };
            assertAcceptance(
              fixture,
              (candidate) => directiveInvocationSchema.safeParse(candidate).success,
              validate,
            );
          }
        }
      }

      assertAcceptance(
        rejected(`${directive.name} wrong form`, {
          name: directive.name,
          form: 'unknown',
          attributes,
        }),
        (value) => directiveInvocationSchema.safeParse(value).success,
        validate,
      );

      for (const required of directive.attributes.filter((attribute) => attribute.required)) {
        const missing = { ...attributes };
        delete missing[required.name];
        const fixture = { name: directive.name, form: directive.forms[0], attributes: missing };
        assertAcceptance(
          rejected(`${directive.name} missing ${required.name}`, fixture),
          (value) => directiveInvocationSchema.safeParse(value).success,
          validate,
        );
      }

      assertAcceptance(
        rejected(`${directive.name} unknown attribute`, {
          name: directive.name,
          form: directive.forms[0],
          attributes: { ...attributes, unknown: true },
        }),
        (value) => directiveInvocationSchema.safeParse(value).success,
        validate,
      );
    }
    for (const fixture of [
      rejected('unknown directive', { name: 'unknown', form: 'leaf', attributes: {} }),
      rejected('unknown directive field', {
        name: 'asset',
        form: 'leaf',
        attributes: { src: 'assets/a' },
        extra: true,
      }),
      rejected('missing required font fields', { name: 'font', form: 'leaf', attributes: {} }),
      rejected('missing directive name', {
        form: 'leaf',
        attributes: { src: 'assets/a' },
      }),
      rejected('missing directive form', {
        name: 'asset',
        attributes: { src: 'assets/a' },
      }),
      rejected('missing directive attributes', { name: 'asset', form: 'leaf' }),
      rejected('numeric directive name', {
        name: 1,
        form: 'leaf',
        attributes: { src: 'assets/a' },
      }),
      rejected('numeric directive form', {
        name: 'asset',
        form: 1,
        attributes: { src: 'assets/a' },
      }),
      rejected('null directive attributes', {
        name: 'asset',
        form: 'leaf',
        attributes: null,
      }),
      rejected('string directive attributes', {
        name: 'asset',
        form: 'leaf',
        attributes: 'src=assets/a',
      }),
      rejected('array directive attributes', {
        name: 'asset',
        form: 'leaf',
        attributes: [],
      }),
    ]) {
      assertAcceptance(
        fixture,
        (value) => directiveInvocationSchema.safeParse(value).success,
        validate,
      );
    }

    assertDirectiveDefaults(getDirectiveSchema(), authoringRegistry.directives);
  });

  it('keeps the public point schema equal to the authored four-decimal boundary', () => {
    const point = authoringRegistry.directives.find((directive) => directive.name === 'point');
    if (point === undefined) throw new Error('Point directive is missing');
    const validate = createAjv().compile(getDirectiveSchema());
    for (const fixture of [
      { label: 'four decimals', authored: '1.2345', normalized: 1.2345, expected: true },
      { label: 'five decimals', authored: '1.23456', normalized: 1.23456, expected: false },
    ]) {
      expect(
        interpretDirectiveAttributes(point, {
          label: 'Precise',
          value: fixture.authored,
        }).ok,
        `${fixture.label}/authored`,
      ).toBe(fixture.expected);
      const invocation = {
        name: 'point',
        form: 'leaf',
        attributes: { label: 'Precise', value: fixture.normalized },
      };
      expect(
        directiveInvocationSchema.safeParse(invocation).success,
        `${fixture.label}/runtime schema`,
      ).toBe(fixture.expected);
      expect(validate(invocation), `${fixture.label}/JSON Schema`).toBe(fixture.expected);
    }
  });

  it('keeps complete-source runtime and Ajv acceptance equal across strict boundaries', () => {
    const ajv = createAjv();
    const validate = ajv.compile(getSourceSchema());
    const fixtures: readonly ValidationFixture[] = [
      accepted('minimal source', { manifest: {}, markdown: '# Report' }),
      accepted('complete source', {
        manifest: { theme: 'light' },
        markdown: '# Report',
        partials: { 'sections/intro.md': 'Intro' },
        resources: ['assets/image.png'],
        directives: [{ name: 'demo', form: 'container', attributes: {} }],
      }),
      accepted('duplicate resource references are occurrences', {
        manifest: {},
        markdown: '# Report',
        resources: ['assets/image.png', 'assets/image.png'],
      }),
      accepted('trimmed resource path', {
        manifest: {},
        markdown: '# Report',
        resources: ['  assets/image.png  '],
      }),
      accepted('trimmed partial key', {
        manifest: {},
        markdown: '# Report',
        partials: { '  sections/intro.md  ': 'Intro' },
      }),
      rejected('missing manifest', { markdown: '# Report' }),
      rejected('missing markdown', { manifest: {} }),
      rejected('empty markdown', { manifest: {}, markdown: '' }),
      rejected('numeric markdown', { manifest: {}, markdown: 1 }),
      rejected('unknown source field', { manifest: {}, markdown: '# Report', unknown: true }),
      rejected('unknown manifest field', { manifest: { unknown: true }, markdown: '# Report' }),
      rejected('scalar manifest', { manifest: 'report', markdown: '# Report' }),
      rejected('null manifest', { manifest: null, markdown: '# Report' }),
      rejected('non-object partials', { manifest: {}, markdown: '# Report', partials: [] }),
      rejected('non-string partial', {
        manifest: {},
        markdown: '# Report',
        partials: { 'sections/intro.md': 1 },
      }),
      rejected('partial traversal', {
        manifest: {},
        markdown: '# Report',
        partials: { '../outside.md': 'bad' },
      }),
      rejected('wrapped partial traversal', {
        manifest: {},
        markdown: '# Report',
        partials: { '  ../outside.md  ': 'bad' },
      }),
      rejected('non-array resources', {
        manifest: {},
        markdown: '# Report',
        resources: 'assets/image.png',
      }),
      rejected('numeric resource', {
        manifest: {},
        markdown: '# Report',
        resources: [1],
      }),
      rejected('remote resource', {
        manifest: {},
        markdown: '# Report',
        resources: ['https://example.com/image.png'],
      }),
      rejected('wrapped resource traversal', {
        manifest: {},
        markdown: '# Report',
        resources: ['  ../outside.png  '],
      }),
      rejected('non-array directives', {
        manifest: {},
        markdown: '# Report',
        directives: {},
      }),
      rejected('primitive directive element', {
        manifest: {},
        markdown: '# Report',
        directives: ['asset'],
      }),
      rejected('null directive element', {
        manifest: {},
        markdown: '# Report',
        directives: [null],
      }),
      rejected('unknown directive', {
        manifest: {},
        markdown: '# Report',
        directives: [{ name: 'unknown', form: 'leaf', attributes: {} }],
      }),
    ];
    for (const fixture of fixtures) {
      assertAcceptance(fixture, (value) => completeSourceSchema.safeParse(value).success, validate);
    }
  });

  it('keeps normalized local-path security cases equal in directives and source collections', () => {
    const directiveValidate = createAjv().compile(getDirectiveSchema());
    const sourceValidate = createAjv().compile(getSourceSchema());
    const pathCases: readonly (readonly [string, boolean])[] = [
      ['assets/value.bin', true],
      ['  assets/value.bin  ', true],
      ['../outside', false],
      ['  ../outside  ', false],
      ['/absolute', false],
      ['C:/drive', false],
      ['\\\\server\\share', false],
      ['https://example.invalid/a', false],
      ['assets//empty', false],
      ['assets/./dot', false],
      ['assets/../parent', false],
      ['assets/control\u0000.bin', false],
      ['assets/my%20file.bin', true],
      ['assets/100%25.bin', true],
      ['assets%2Ffile.bin', false],
      ['assets%2ffile.bin', false],
      ['%2e%2e/outside', false],
      ['%2Fabsolute', false],
      ['%43%3A/drive', false],
      ['assets%5Coutside', false],
      ['assets/%00control', false],
      ['assets/100%.bin', false],
      ['assets/%E0%A4%A', false],
    ];
    for (const [path, expected] of pathCases) {
      assertAcceptance(
        {
          label: `asset path ${JSON.stringify(path)}`,
          value: {
            name: 'asset',
            form: 'leaf',
            attributes: { src: path },
          },
          expected,
        },
        (value) => directiveInvocationSchema.safeParse(value).success,
        directiveValidate,
      );
      assertAcceptance(
        {
          label: `source resource ${JSON.stringify(path)}`,
          value: {
            manifest: {},
            markdown: '# Report',
            resources: [path],
          },
          expected,
        },
        (value) => completeSourceSchema.safeParse(value).success,
        sourceValidate,
      );
      assertAcceptance(
        {
          label: `source partial ${JSON.stringify(path)}`,
          value: {
            manifest: {},
            markdown: '# Report',
            partials: { [path]: 'content' },
          },
          expected,
        },
        (value) => completeSourceSchema.safeParse(value).success,
        sourceValidate,
      );
    }
  });
});

function createAjv(options: { readonly useDefaults?: boolean } = {}): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    multipleOfPrecision: 10,
    ...options,
  });
  ajv.addKeyword({ keyword: SCHEMA_CONTRACT_KEYWORD, schemaType: 'object', valid: true });
  ajv.addFormat('relative-local-path', {
    type: 'string',
    validate: isNormalizedPackageRelativePosixPath,
  });
  return ajv;
}

interface ValidationFixture {
  readonly label: string;
  readonly value: unknown;
  readonly expected: boolean;
}

function accepted(label: string, value: unknown): ValidationFixture {
  return { label, value, expected: true };
}

function rejected(label: string, value: unknown): ValidationFixture {
  return { label, value, expected: false };
}

function assertAcceptance(
  fixture: ValidationFixture,
  runtimeAccepts: (value: unknown) => boolean,
  jsonSchemaAccepts: (value: unknown) => boolean | Promise<unknown>,
): void {
  expect(runtimeAccepts(fixture.value), `${fixture.label}: runtime`).toBe(fixture.expected);
  expect(jsonSchemaAccepts(fixture.value), `${fixture.label}: JSON Schema`).toBe(fixture.expected);
}

function assertParity(
  value: unknown,
  runtimeAccepts: (candidate: unknown) => boolean,
  jsonSchemaAccepts: (candidate: unknown) => boolean | Promise<unknown>,
): void {
  const runtime = runtimeAccepts(value);
  const jsonSchema = jsonSchemaAccepts(value);
  if (runtime !== jsonSchema) {
    throw new Error(`runtime and JSON Schema diverged for ${JSON.stringify(value)}`);
  }
}

function manifestDefaults(fields: readonly FieldDefinition[]): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.default === undefined ? [] : [[field.name, structuredClone(field.default)]],
    ),
  );
}

function withManifestStringConstraint(
  fieldName: string,
  constraint: Extract<ConstraintDefinition, { readonly kind: 'string' }>,
): AuthoringRegistryDefinition {
  return {
    ...authoringRegistry,
    manifestFields: authoringRegistry.manifestFields.map((field) =>
      field.name === fieldName ? { ...field, constraint } : field,
    ),
  } as unknown as AuthoringRegistryDefinition;
}

function stringConstraint(
  minLength: number,
  maxLength?: number,
): Extract<ConstraintDefinition, { readonly kind: 'string' }> {
  return {
    kind: 'string',
    normalization: 'trim',
    minLength,
    ...(maxLength === undefined ? {} : { maxLength }),
  };
}

function safeParseManifestFromRegistry(
  value: unknown,
  registry: AuthoringRegistryDefinition,
): boolean {
  try {
    parseReportManifestFromRegistry(value, registry);
    return true;
  } catch {
    return false;
  }
}

function validAttributeValue(attribute: DirectiveAttributeDefinition): string | number | boolean {
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    return 'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42';
  }
  const kind = attribute.constraint.kind;
  if (kind === 'integer' || kind === 'number') return 1;
  if (kind === 'boolean') return true;
  if (kind === 'enum') return attribute.constraint.values[0] ?? '';
  return 'value';
}

function attributeCases(
  attribute: DirectiveAttributeDefinition,
): readonly (readonly [unknown, boolean])[] {
  if (attribute.invalidDiagnostic === 'INVALID_SOURCE_LINK') {
    const valid = 'http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=42';
    return [
      [valid, true],
      [`  ${valid}  `, true],
      ['http://127.0.0.1:65535/open?path=%2Fworkspace%2Ffile.ts&line=42', true],
      ['http://127.0.0.1:7789/open?path=relative.ts&line=42', false],
      ['http://localhost:7789/open?path=%2Fworkspace%2Ffile.ts&line=42', false],
      ['http://127.0.0.1:65536/open?path=%2Fworkspace%2Ffile.ts&line=42', false],
      ['http://127.0.0.1:7789/open?path=%2Fworkspace%2Ffile.ts&line=0', false],
      ['', false],
      [1, false],
      [null, false],
      ['x'.repeat(1001), false],
    ];
  }
  const constraint = attribute.constraint;
  switch (constraint.kind) {
    case 'string': {
      const valid = constraint.format === 'relative-local-path' ? 'assets/value.bin' : 'value';
      const cases: Array<readonly [unknown, boolean]> = [
        [valid, true],
        [`  ${valid}  `, true],
        ['', false],
        [1, false],
        [null, false],
      ];
      if (constraint.maxLength !== undefined) {
        cases.push(['x'.repeat(constraint.maxLength), true]);
        cases.push(['x'.repeat(constraint.maxLength + 1), false]);
      }
      if (constraint.pattern !== undefined) cases.push(['!', false]);
      if (constraint.format === 'relative-local-path') cases.push(['../outside', false]);
      return cases;
    }
    case 'integer':
      return [
        [constraint.minimum ?? 0, true],
        [constraint.maximum ?? 1, true],
        [1.5, false],
        ['1', false],
        [null, false],
        ...(constraint.minimum === undefined ? [] : ([[constraint.minimum - 1, false]] as const)),
        ...(constraint.maximum === undefined ? [] : ([[constraint.maximum + 1, false]] as const)),
      ];
    case 'number':
      return [
        [constraint.minimum ?? 0, true],
        [constraint.maximum ?? 1, true],
        [1.5, true],
        ...(constraint.multipleOf === undefined
          ? []
          : ([
              [constraint.multipleOf, true],
              [constraint.multipleOf * 12_345, true],
              [constraint.multipleOf * 12_345 + constraint.multipleOf / 10, false],
            ] as const)),
        [Number.NaN, false],
        [Number.POSITIVE_INFINITY, false],
        ['1.5', false],
        [null, false],
        ...(constraint.minimum === undefined ? [] : ([[constraint.minimum - 1, false]] as const)),
        ...(constraint.maximum === undefined ? [] : ([[constraint.maximum + 1, false]] as const)),
      ];
    case 'boolean':
      return [
        [true, true],
        [false, true],
        ['true', false],
        [1, false],
        [null, false],
      ];
    case 'enum':
      return [
        [constraint.values[0], true],
        ['__invalid__', false],
        [1, false],
        [null, false],
      ];
    default: {
      const exhaustive: never = constraint;
      return exhaustive;
    }
  }
}

function assertDirectiveDefaults(
  schema: Readonly<Record<string, unknown>>,
  directives: readonly DirectiveDefinition[],
): void {
  const definitions = schema.$defs as Readonly<Record<string, unknown>>;
  for (const directive of directives) {
    const definition = definitions[directive.name] as {
      readonly properties: {
        readonly attributes: {
          readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
        };
      };
    };
    for (const attribute of directive.attributes) {
      expect(definition.properties.attributes.properties[attribute.name]?.default).toBe(
        attribute.default,
      );
    }
  }
}
